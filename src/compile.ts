import * as fs from "node:fs";
import * as path from "node:path";
import { Result, TaggedError } from "better-result";
import { match } from "ts-pattern";
import { Span, TestFnItem, type ModuleNode } from "./ast";
import { lowerAstModuleToSsa } from "./ast_to_ssa";
import { checkBorrowLite } from "./borrow";
import { expandDerives } from "./derive_expand";
import { type IRModule, resetIRIds } from "./ir";
import { printModule as printIRModule } from "./ir_printer";
import { serializeModule } from "./ir_serialize";
import { validateFunction as validateIRFunction } from "./ir_validate";
import { inferModule } from "./inference";
import { resolveModuleTree } from "./module_resolver";
import { parseModule } from "./parser";
import { TypeContext } from "./type_context";

export type CompileDiagnostic = {
    message: string;
    span: Span;
    kind?: string;
};

export type CompileOptions = {
    emitAst?: boolean;
    emitIR?: boolean;
    validate?: boolean;
    outputFile?: string;
    sourcePath?: string;
};

const taggedError = TaggedError;

const CompileDiagnosticsErrorBase = taggedError("CompileDiagnosticsError")<{
    diagnostics: CompileDiagnostic[];
    message: string;
}>();

export class CompileDiagnosticsError extends CompileDiagnosticsErrorBase {}

const CompileInternalErrorBase = taggedError("CompileInternalError")<{
    phase: "lower" | "serialize";
    message: string;
    cause: unknown;
}>();

export class CompileInternalError extends CompileInternalErrorBase {}

const CompileFileReadErrorBase = taggedError("CompileFileReadError")<{
    filePath: string;
    message: string;
    cause: unknown;
}>();

export class CompileFileReadError extends CompileFileReadErrorBase {}

export type CompileError =
    | CompileDiagnosticsError
    | CompileInternalError
    | CompileFileReadError;

export type CompileArtifact = {
    module: IRModule;
    ast?: object;
    ir?: string;
};

export type BinaryCompileArtifact = CompileArtifact & { bytes: Uint8Array };

export type CompileResult = Result<CompileArtifact, CompileError>;
export type BinaryCompileResult = Result<BinaryCompileArtifact, CompileError>;

export type TestFn = {
    name: string;
    expectedOutput: string | undefined;
};

function diagnosticSpan(span?: Span): Span {
    return span ?? new Span(0, 0, 0, 0);
}

function diagnosticsError(
    diagnostics: CompileDiagnostic[],
): CompileDiagnosticsError {
    return new CompileDiagnosticsError({
        diagnostics,
        message: diagnostics.map((diagnostic) => diagnostic.message).join("; "),
    });
}

function causeMessage(cause: unknown): string {
    return match(cause)
        .when(
            (value): value is Error => value instanceof Error,
            (error) => error.message,
        )
        .otherwise((value) => String(value));
}

function readSourceFile(
    filePath: string,
): Result<string, CompileFileReadError> {
    return Result.try({
        try: () => fs.readFileSync(filePath, "utf8"),
        catch: (cause) =>
            new CompileFileReadError({
                filePath,
                message: `Failed to read file: ${filePath}: ${causeMessage(cause)}`,
                cause,
            }),
    });
}

function prepareAst(
    source: string,
    options: { sourcePath?: string } = {},
): Result<ModuleNode, CompileDiagnosticsError> {
    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        return Result.err(
            diagnosticsError(
                parseResult.errors.map((error) => ({
                    message: error.message,
                    span: new Span(error.line, error.column, 0, 0),
                    kind: "parse" as const,
                })),
            ),
        );
    }

    const resolveResult = resolveModuleTree(parseResult.value, {
        sourcePath: options.sourcePath,
    });
    if (!resolveResult.ok || !resolveResult.module) {
        return Result.err(
            diagnosticsError(
                resolveResult.errors.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    kind: "resolve" as const,
                })),
            ),
        );
    }

    const deriveResult = expandDerives(resolveResult.module);
    if (!deriveResult.ok || !deriveResult.module) {
        return Result.err(
            diagnosticsError(
                deriveResult.errors.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    kind: "derive" as const,
                })),
            ),
        );
    }

    return Result.ok(deriveResult.module);
}

function inferAndLowerModule(
    expandedAst: ModuleNode,
    validate: boolean,
): Result<IRModule, CompileDiagnosticsError | CompileInternalError> {
    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, expandedAst);
    if (!inferResult.isOk()) {
        return Result.err(
            diagnosticsError(
                inferResult.error.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    kind: "type" as const,
                })),
            ),
        );
    }

    const borrowResult = checkBorrowLite(expandedAst, typeCtx);
    if (!borrowResult.ok) {
        return Result.err(
            diagnosticsError(
                (borrowResult.errors ?? []).map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    kind: "borrow" as const,
                })),
            ),
        );
    }

    const loweringResult = Result.try({
        try: () => lowerAstModuleToSsa(expandedAst),
        catch: (cause) =>
            new CompileInternalError({
                phase: "lower",
                message: `Lowering to SSA failed: ${causeMessage(cause)}`,
                cause,
            }),
    });
    if (loweringResult.isErr()) {
        return loweringResult;
    }

    const irModule = loweringResult.value;
    if (!validate) {
        return Result.ok(irModule);
    }

    const validationErrors: CompileDiagnostic[] = [];
    for (const fn of irModule.functions) {
        const validationResult = validateIRFunction(fn);
        if (validationResult.ok) {
            continue;
        }

        for (const error of validationResult.errors ?? []) {
            validationErrors.push({
                message: `in function \`${fn.name}\`: ${error.message}`,
                span: new Span(0, 0, 0, 0),
                kind: "validation",
            });
        }
    }

    if (validationErrors.length > 0) {
        return Result.err(diagnosticsError(validationErrors));
    }

    return Result.ok(irModule);
}

export function compileToIRModule(
    source: string,
    options: {
        emitAst?: boolean;
        validate?: boolean;
        sourcePath?: string;
    } = {},
): CompileResult {
    const { emitAst = false, sourcePath, validate = true } = options;

    resetIRIds();

    const prepResult = prepareAst(source, { sourcePath });
    if (prepResult.isErr()) {
        return prepResult;
    }

    const expandedAst = prepResult.value;
    const irModuleResult = inferAndLowerModule(expandedAst, validate);
    if (irModuleResult.isErr()) {
        return irModuleResult;
    }

    const irModule = irModuleResult.value;
    const artifact: CompileArtifact = { module: irModule };
    if (emitAst) {
        artifact.ast = expandedAst;
    }

    return Result.ok(artifact);
}

export function compile(
    source: string,
    options: CompileOptions = {},
): CompileResult {
    const emitIR = options.emitIR ?? true;
    const result = compileToIRModule(source, options);
    if (result.isErr()) {
        return result;
    }

    const artifact = result.value;
    if (!emitIR) {
        return Result.ok(artifact);
    }

    return Result.ok({
        module: artifact.module,
        ast: artifact.ast,
        ir: printIRModule(artifact.module),
    });
}

export function compileToBinary(
    source: string,
    options: {
        emitAst?: boolean;
        validate?: boolean;
        sourcePath?: string;
    } = {},
): BinaryCompileResult {
    const result = compileToIRModule(source, options);
    if (result.isErr()) {
        return result;
    }

    const serializationResult = Result.try({
        try: () => serializeModule(result.value.module),
        catch: (cause) =>
            new CompileInternalError({
                phase: "serialize",
                message: `Failed to serialize IR module: ${causeMessage(cause)}`,
                cause,
            }),
    });
    if (serializationResult.isErr()) {
        return serializationResult;
    }

    return Result.ok({
        ...result.value,
        bytes: serializationResult.value,
    });
}

export function compileFileToIRModule(
    filePath: string,
    options: { emitAst?: boolean; validate?: boolean } = {},
): CompileResult {
    return readSourceFile(filePath).andThen((source) =>
        compileToIRModule(source, {
            ...options,
            sourcePath: path.resolve(filePath),
        }),
    );
}

export function compileFileToBinary(
    filePath: string,
    options: { emitAst?: boolean; validate?: boolean } = {},
): BinaryCompileResult {
    return readSourceFile(filePath).andThen((source) =>
        compileToBinary(source, {
            ...options,
            sourcePath: path.resolve(filePath),
        }),
    );
}

export function compileFile(
    filePath: string,
    options: CompileOptions = {},
): CompileResult {
    const emitIR = options.emitIR ?? true;
    const result = compileFileToIRModule(filePath, options);
    if (result.isErr()) {
        return result;
    }

    const artifact = result.value;
    if (!emitIR) {
        return Result.ok(artifact);
    }

    return Result.ok({
        module: artifact.module,
        ast: artifact.ast,
        ir: printIRModule(artifact.module),
    });
}

export function discoverTestFunctions(
    filePath: string,
): Result<TestFn[], CompileError> {
    return readSourceFile(filePath).andThen((source) => {
        const prepResult = prepareAst(source, { sourcePath: filePath });
        if (prepResult.isErr()) {
            return Result.err(prepResult.error);
        }

        const tests: TestFn[] = [];
        for (const item of prepResult.value.items) {
            if (item instanceof TestFnItem) {
                tests.push({
                    name: item.name,
                    expectedOutput: item.expectedOutput,
                });
            }
        }

        return Result.ok(tests);
    });
}

export function compileErrorDiagnostics(
    error: CompileError,
): CompileDiagnostic[] | undefined {
    if (CompileDiagnosticsError.is(error)) {
        return error.diagnostics;
    }

    return undefined;
}

export function formatCompileError(error: CompileError): string {
    return match(error)
        .when(
            (compileError): compileError is CompileDiagnosticsError =>
                CompileDiagnosticsError.is(compileError),
            (compileError) =>
                compileError.diagnostics
                    .map((diagnostic) => diagnostic.message)
                    .join("; "),
        )
        .otherwise((compileError) => compileError.message);
}
