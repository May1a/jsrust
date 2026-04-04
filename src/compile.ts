import * as fs from "node:fs";
import * as path from "node:path";
import { Result } from "better-result";
import { match } from "ts-pattern";
import {
    CastExpr,
    IfLetExpr,
    RecoveryExpr,
    RecoveryItem,
    Span,
    StaticItem,
    TestFnItem,
    TryExpr,
    TypeAliasItem,
    UnsafeBlockExpr,
    UnsafeItem,
    type ModuleNode,
    type Node,
    walkAst,
} from "./parse/ast";
import { type IRModule, resetIRIds } from "./ir/ir";
import { printModule as printIRModule } from "./ir/ir_printer";
import { serializeModule } from "./ir/ir_serialize";
import { validateFunction as validateIRFunction } from "./ir/ir_validate";
import { parseModule } from "./parse/parser";
import { evaluateModuleConsts } from "./passes/const_eval";
import { lowerAstModuleToSsa } from "./passes/ast_to_ssa";
import { checkBorrowLite } from "./passes/borrow";
import { expandDerives } from "./passes/derive_expand";
import { inferModule } from "./passes/inference";
import { resolveModuleTree } from "./passes/module_resolver";
import { InternalBugError } from "./utils/internal_bug";
import { TypeContext } from "./utils/type_context";

export type CompilePhase =
    | "parse"
    | "resolve"
    | "derive"
    | "type"
    | "borrow"
    | "lower"
    | "validate"
    | "serialize"
    | "io"
    | "backend";

export type CompileDiagnostic = {
    message: string;
    span: Span;
    phase: CompilePhase;
};

export type SourceInput =
    | { kind: "file"; path: string }
    | { kind: "text"; text: string; sourcePath?: string };

export type SourceFile = {
    source: string;
    sourcePath?: string;
};

export type PreparedModule = {
    sourceFile: SourceFile;
    module: ModuleNode;
};

export type TypedModule = {
    prepared: PreparedModule;
    typeContext: TypeContext;
};

export type LoweredModule = {
    typed: TypedModule;
    module: IRModule;
};

export type PrintedIrArtifact = {
    lowered: LoweredModule;
    module: IRModule;
    ir: string;
};

export type BinaryArtifact = {
    lowered: LoweredModule;
    module: IRModule;
    bytes: Uint8Array;
};

export type CompileOptions = {
    emitAst?: boolean;
    emitIR?: boolean;
    validate?: boolean;
    outputFile?: string;
    sourcePath?: string;
};

export type UserDiagnosticFailure = {
    tag: "diagnostic";
    phase: CompilePhase;
    diagnostics: CompileDiagnostic[];
    message: string;
};

export type UnsupportedFeatureDiagnostic = {
    feature: string;
    span: Span;
    message: string;
};

export type UnsupportedFeatureFailure = {
    tag: "unsupported";
    phase: "parse" | "type" | "lower" | "backend";
    diagnostics: UnsupportedFeatureDiagnostic[];
    message: string;
};

export type InternalCompilerFailure = {
    tag: "internal";
    phase: CompilePhase;
    message: string;
    cause?: unknown;
};

export type IoFailure = {
    tag: "io";
    phase: "io";
    path?: string;
    message: string;
    cause: unknown;
};

export type BackendFailure = {
    tag: "backend";
    phase: "backend";
    kind:
        | "load"
        | "build"
        | "runtime-trap"
        | "backend-exit"
        | "capability-mismatch";
    message: string;
    cause?: unknown;
};

export type PhaseFailure =
    | UserDiagnosticFailure
    | UnsupportedFeatureFailure
    | InternalCompilerFailure
    | IoFailure
    | BackendFailure;

export type CompileFailure = PhaseFailure;
export type CompileError = CompileFailure;

export type PreparedModuleResult = Result<PreparedModule, CompileFailure>;
export type TypedModuleResult = Result<TypedModule, CompileFailure>;
export type LoweredModuleResult = Result<LoweredModule, CompileFailure>;
export type PrintedIrResult = Result<PrintedIrArtifact, CompileFailure>;
export type BinaryCompileResult = Result<BinaryArtifact, CompileFailure>;

export type TestFn = {
    name: string;
    expectedOutput: string | undefined;
};

function diagnosticSpan(span?: Span): Span {
    return span ?? new Span(0, 0, 0, 0);
}

function causeMessage(cause: unknown): string {
    return match(cause)
        .when(
            (value): value is Error => value instanceof Error,
            (error) => error.message,
        )
        .otherwise((value) => String(value));
}

function diagnosticFailure(
    phase: CompilePhase,
    diagnostics: CompileDiagnostic[],
): UserDiagnosticFailure {
    return {
        tag: "diagnostic",
        phase,
        diagnostics,
        message: diagnostics.map((diagnostic) => diagnostic.message).join("; "),
    };
}

function unsupportedFailure(
    phase: UnsupportedFeatureFailure["phase"],
    diagnostics: UnsupportedFeatureDiagnostic[],
): UnsupportedFeatureFailure {
    return {
        tag: "unsupported",
        phase,
        diagnostics,
        message: diagnostics.map((diagnostic) => diagnostic.message).join("; "),
    };
}

function internalFailure(
    phase: CompilePhase,
    message: string,
    cause?: unknown,
): InternalCompilerFailure {
    return {
        tag: "internal",
        phase,
        message,
        cause,
    };
}

function ioFailure(pathValue: string, cause: unknown): IoFailure {
    return {
        tag: "io",
        phase: "io",
        path: pathValue,
        message: `Failed to read file: ${pathValue}: ${causeMessage(cause)}`,
        cause,
    };
}

function normalizeInternalFailure(
    phase: CompilePhase,
    message: string,
    cause: unknown,
): InternalCompilerFailure {
    if (InternalBugError.is(cause)) {
        return internalFailure(
            phase,
            `${message}: ${cause.message}`,
            cause.cause ?? cause,
        );
    }
    return internalFailure(phase, `${message}: ${causeMessage(cause)}`, cause);
}

export function readSource(
    input: SourceInput,
): Result<SourceFile, IoFailure> {
    return match(input)
        .with({ kind: "file" }, ({ path: filePath }) =>
            Result.try({
                try: () => ({
                    source: fs.readFileSync(filePath, "utf8"),
                    sourcePath: path.resolve(filePath),
                }),
                catch: (cause) => ioFailure(path.resolve(filePath), cause),
            }),
        )
        .with({ kind: "text" }, ({ text, sourcePath }) =>
            Result.ok({
                source: text,
                sourcePath,
            }),
        )
        .exhaustive();
}

function unsupportedFeatureOfNode(
    node: Node,
): UnsupportedFeatureDiagnostic | undefined {
    if (node instanceof TryExpr) {
        return {
            feature: "try-expression",
            span: node.span,
            message: "`?` expressions are parsed but not implemented yet",
        };
    }
    if (node instanceof CastExpr) {
        return {
            feature: "cast-expression",
            span: node.span,
            message: "`as` casts are parsed but not implemented yet",
        };
    }
    if (node instanceof IfLetExpr) {
        return {
            feature: "if-let-expression",
            span: node.span,
            message: "`if let` is parsed but not implemented yet",
        };
    }
    if (node instanceof UnsafeBlockExpr) {
        return {
            feature: "unsafe-block",
            span: node.span,
            message: "`unsafe` blocks are parsed but not implemented yet",
        };
    }
    if (node instanceof UnsafeItem) {
        return {
            feature: "unsafe-item",
            span: node.span,
            message: "`unsafe` items are parsed but not implemented yet",
        };
    }
    if (node instanceof TypeAliasItem) {
        return {
            feature: "type-alias-item",
            span: node.span,
            message: "type aliases are parsed but not implemented yet",
        };
    }
    if (node instanceof StaticItem) {
        return {
            feature: "static-item",
            span: node.span,
            message: "`static` items are parsed but not implemented yet",
        };
    }
    if (node instanceof RecoveryExpr) {
        return {
            feature: "recovery-expression",
            span: node.span,
            message: node.message,
        };
    }
    if (node instanceof RecoveryItem) {
        return {
            feature: "recovery-item",
            span: node.span,
            message: node.message,
        };
    }
    return undefined;
}

function collectUnsupportedFeatures(moduleNode: ModuleNode): UnsupportedFeatureDiagnostic[] {
    const diagnostics: UnsupportedFeatureDiagnostic[] = [];
    walkAst(moduleNode, (node) => {
        const unsupported = unsupportedFeatureOfNode(node);
        if (unsupported === undefined) {
            return;
        }
        diagnostics.push(unsupported);
    });
    return diagnostics;
}

export function prepareModule(sourceFile: SourceFile): PreparedModuleResult {
    const parseResult = parseModule(sourceFile.source);
    if (parseResult.isErr()) {
        return Result.err(
            diagnosticFailure(
                "parse",
                parseResult.error.map((error) => ({
                    message: error.message,
                    span: new Span(error.line, error.column, 0, 0),
                    phase: "parse",
                })),
            ),
        );
    }

    const resolveResult = resolveModuleTree(parseResult.value, {
        sourcePath: sourceFile.sourcePath,
    });
    if (resolveResult.isErr()) {
        return Result.err(
            diagnosticFailure(
                "resolve",
                resolveResult.error.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    phase: "resolve",
                })),
            ),
        );
    }

    const deriveResult = expandDerives(resolveResult.value);
    if (deriveResult.isErr()) {
        return Result.err(
            diagnosticFailure(
                "derive",
                deriveResult.error.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    phase: "derive",
                })),
            ),
        );
    }

    return Result.ok({
        sourceFile,
        module: deriveResult.value,
    });
}

export function typecheckModule(prepared: PreparedModule): TypedModuleResult {
    const unsupportedDiagnostics = collectUnsupportedFeatures(prepared.module);
    if (unsupportedDiagnostics.length > 0) {
        return Result.err(unsupportedFailure("type", unsupportedDiagnostics));
    }

    const typeContext = new TypeContext();
    const inferResult = inferModule(typeContext, prepared.module);
    if (inferResult.isErr()) {
        return Result.err(
            diagnosticFailure(
                "type",
                inferResult.error.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    phase: "type",
                })),
            ),
        );
    }

    const borrowResult = checkBorrowLite(prepared.module, typeContext);
    if (borrowResult.isErr()) {
        return Result.err(
            diagnosticFailure(
                "borrow",
                borrowResult.error.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    phase: "borrow",
                })),
            ),
        );
    }

    return Result.ok({
        prepared,
        typeContext,
    });
}

export function lowerModule(
    typed: TypedModule,
    options: { validate?: boolean } = {},
): LoweredModuleResult {
    const { validate = true } = options;
    resetIRIds();

    const constResult = evaluateModuleConsts(typed.prepared.module);
    if (constResult.isErr()) {
        return Result.err(
            diagnosticFailure(
                "type",
                constResult.error.map((error) => ({
                    message: error.message,
                    span: diagnosticSpan(error.span),
                    phase: "type",
                })),
            ),
        );
    }

    const loweringResult = Result.try({
        try: () =>
            lowerAstModuleToSsa(typed.prepared.module, {
                moduleConstValues: constResult.value,
            }),
        catch: (cause) =>
            normalizeInternalFailure(
                "lower",
                "Lowering to SSA failed",
                cause,
            ),
    });
    if (loweringResult.isErr()) {
        return Result.err(loweringResult.error);
    }
    if (loweringResult.value.isErr()) {
        return Result.err(
            internalFailure(
                "lower",
                `Lowering to SSA failed: ${loweringResult.value.error.message}`,
                loweringResult.value.error,
            ),
        );
    }

    const lowered: LoweredModule = {
        typed,
        module: loweringResult.value.value,
    };
    if (!validate) {
        return Result.ok(lowered);
    }

    const validationDiagnostics: CompileDiagnostic[] = [];
    for (const fn of lowered.module.functions) {
        const validationResult = validateIRFunction(fn);
        if (validationResult.isOk()) {
            continue;
        }
        for (const error of validationResult.error) {
            validationDiagnostics.push({
                message: `in function \`${fn.name}\`: ${error.message}`,
                span: new Span(0, 0, 0, 0),
                phase: "validate",
            });
        }
    }

    if (validationDiagnostics.length > 0) {
        return Result.err(diagnosticFailure("validate", validationDiagnostics));
    }

    return Result.ok(lowered);
}

export function printLoweredModule(
    lowered: LoweredModule,
): PrintedIrArtifact {
    return {
        lowered,
        module: lowered.module,
        ir: printIRModule(lowered.module),
    };
}

export function serializeLoweredModule(
    lowered: LoweredModule,
): BinaryCompileResult {
    const serializationResult = Result.try({
        try: () => serializeModule(lowered.module),
        catch: (cause) =>
            normalizeInternalFailure(
                "serialize",
                "Failed to serialize IR module",
                cause,
            ),
    });
    if (serializationResult.isErr()) {
        return Result.err(serializationResult.error);
    }

    return Result.ok({
        lowered,
        module: lowered.module,
        bytes: serializationResult.value,
    });
}

function sourceInputFromText(
    source: string,
    options: CompileOptions,
): SourceInput {
    return {
        kind: "text",
        text: source,
        sourcePath: options.sourcePath,
    };
}

function compileInputToLoweredModule(
    input: SourceInput,
    options: CompileOptions = {},
): LoweredModuleResult {
    return readSource(input)
        .andThen((sourceFile) => prepareModule(sourceFile))
        .andThen((prepared) => typecheckModule(prepared))
        .andThen((typed) => lowerModule(typed, { validate: options.validate }));
}

export function compileToIRModule(
    source: string,
    options: CompileOptions = {},
): LoweredModuleResult {
    return compileInputToLoweredModule(sourceInputFromText(source, options), options);
}

export function compile(
    source: string,
    options: CompileOptions = {},
): PrintedIrResult {
    return compileToIRModule(source, options).map((lowered) =>
        printLoweredModule(lowered),
    );
}

export function compileToBinary(
    source: string,
    options: CompileOptions = {},
): BinaryCompileResult {
    return compileToIRModule(source, options).andThen((lowered) =>
        serializeLoweredModule(lowered),
    );
}

export function compileFileToIRModule(
    filePath: string,
    options: Omit<CompileOptions, "sourcePath"> = {},
): LoweredModuleResult {
    return compileInputToLoweredModule(
        { kind: "file", path: filePath },
        options,
    );
}

export function compileFile(
    filePath: string,
    options: Omit<CompileOptions, "sourcePath"> = {},
): PrintedIrResult {
    return compileFileToIRModule(filePath, options).map((lowered) =>
        printLoweredModule(lowered),
    );
}

export function compileFileToBinary(
    filePath: string,
    options: Omit<CompileOptions, "sourcePath"> = {},
): BinaryCompileResult {
    return compileFileToIRModule(filePath, options).andThen((lowered) =>
        serializeLoweredModule(lowered),
    );
}

export function discoverTestFunctions(
    filePath: string,
): Result<TestFn[], CompileFailure> {
    return readSource({ kind: "file", path: filePath }).andThen((sourceFile) =>
        prepareModule(sourceFile).map((prepared) => {
            const tests: TestFn[] = [];
            for (const item of prepared.module.items) {
                if (item instanceof TestFnItem) {
                    tests.push({
                        name: item.name,
                        expectedOutput: item.expectedOutput,
                    });
                }
            }
            return tests;
        }),
    );
}

export function compileErrorDiagnostics(
    error: CompileFailure,
): CompileDiagnostic[] | undefined {
    let diagnostics: CompileDiagnostic[] | undefined;
    if (error.tag === "diagnostic") {
        const { diagnostics: errorDiagnostics } = error;
        diagnostics = errorDiagnostics;
    }
    if (error.tag === "unsupported") {
        const { diagnostics: unsupportedDiagnostics } = error;
        diagnostics = unsupportedDiagnostics.map((diagnostic) => ({
            message: diagnostic.message,
            span: diagnostic.span,
            phase: error.phase,
        }));
    }
    return diagnostics;
}

export function formatCompileError(error: CompileFailure): string {
    return match(error)
        .with({ tag: "diagnostic" }, (failure) => failure.message)
        .with({ tag: "unsupported" }, (failure) => failure.message)
        .with({ tag: "internal" }, (failure) => failure.message)
        .with({ tag: "io" }, (failure) => failure.message)
        .with({ tag: "backend" }, (failure) => failure.message)
        .exhaustive();
}
