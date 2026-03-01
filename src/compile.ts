import * as fs from "node:fs";
import * as path from "node:path";
import { parseModule } from "./parser";
import { FnItem, type ModuleNode, type Span } from "./ast";
import { TypeContext } from "./type_context";
import { inferModule } from "./inference";
import { checkBorrowLite } from "./borrow";
import { resolveModuleTree } from "./module_resolver";
import { expandDerives } from "./derive_expand";
import { lowerAstModuleToSsa } from "./ast_to_ssa";
import { printModule as printIRModule } from "./ir_printer";
import { type IRModule, resetIRIds } from "./ir";
import { validateFunction as validateIRFunction } from "./ir_validate";
import { serializeModule } from "./ir_serialize";
import type { Result } from "./diagnostics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STDLIB_VEC_CORE_PATH = path.resolve(process.cwd(), "stdlib/vec_core.rs");
const STDLIB_BUILTIN_SOURCE = `pub enum Option<T> {
    None,
    Some(T),
}
`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CompileDiagnostic = {
    message: string;
    span?: { line: number; column: number; length?: number };
    kind?: string;
};

export type CompileOptions = {
    emitAst?: boolean;
    emitIR?: boolean;
    validate?: boolean;
    outputFile?: string;
    sourcePath?: string;
};

export type CompileResult = {
    ok: boolean;
    errors: CompileDiagnostic[];
    ir?: string;
    ast?: object;
    module?: IRModule;
};

export type BinaryCompileResult = CompileResult & { bytes?: Uint8Array };

export type TestFn = {
    name: string;
    expectedOutput: string | undefined;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function spanToDiagSpan(span?: Span): CompileDiagnostic["span"] {
    if (!span) return undefined;
    return { line: span.line, column: span.column, length: span.end - span.start };
}

function injectStdlibItems(ast: ModuleNode): Result<void, CompileDiagnostic[]> {
    let stdlibSource: string;
    try {
        stdlibSource = fs.readFileSync(STDLIB_VEC_CORE_PATH, "utf8");
    } catch (error) {
        return {
            ok: false,
            error: [
                {
                    message: `Failed to read stdlib: ${STDLIB_VEC_CORE_PATH}: ${error instanceof Error ? error.message : String(error)}`,
                    kind: "internal",
                },
            ],
        };
    }

    const stdlibParse = parseModule(`${STDLIB_BUILTIN_SOURCE}\n${stdlibSource}`);
    if (!stdlibParse.ok) {
        return {
            ok: false,
            error: stdlibParse.errors.map((err) => ({
                message: `In stdlib vec_core.rs: ${err.message}`,
                span: { line: err.line, column: err.column },
                kind: "parse" as const,
            })),
        };
    }

    ast.items = [...stdlibParse.value.items, ...ast.items];
    return { ok: true, value: undefined };
}

type PreparedAst = { ok: true; module: ModuleNode } | { ok: false; errors: CompileDiagnostic[] };

function prepareAst(source: string, options: { sourcePath?: string } = {}): PreparedAst {
    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        return {
            ok: false,
            errors: parseResult.errors.map((err) => ({
                message: err.message,
                span: { line: err.line, column: err.column },
                kind: "parse" as const,
            })),
        };
    }

    const stdlibResult = injectStdlibItems(parseResult.value);
    if (!stdlibResult.ok) {
        return { ok: false, errors: stdlibResult.error };
    }

    const resolveResult = resolveModuleTree(parseResult.value, { sourcePath: options.sourcePath });
    if (!resolveResult.ok || !resolveResult.module) {
        return {
            ok: false,
            errors: resolveResult.errors.map((err) => ({
                message: err.message,
                span: spanToDiagSpan(err.span),
                kind: "resolve" as const,
            })),
        };
    }

    const deriveResult = expandDerives(resolveResult.module);
    if (!deriveResult.ok || !deriveResult.module) {
        return {
            ok: false,
            errors: deriveResult.errors.map((err) => ({
                message: err.message,
                span: spanToDiagSpan(err.span),
                kind: "derive" as const,
            })),
        };
    }

    return { ok: true, module: deriveResult.module };
}

// ---------------------------------------------------------------------------
// Public API — compilation pipeline
// ---------------------------------------------------------------------------

export function compileToIRModule(
    source: string,
    options: { emitAst?: boolean; validate?: boolean; sourcePath?: string } = {},
): CompileResult {
    const { emitAst = false, validate = true, sourcePath } = options;

    resetIRIds();

    const prepResult = prepareAst(source, { sourcePath });
    if (!prepResult.ok) {
        return { ok: false, errors: prepResult.errors };
    }
    const expandedAst = prepResult.module;

    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, expandedAst);
    if (!inferResult.ok) {
        return {
            ok: false,
            errors: inferResult.error.map((err) => ({
                message: err.message,
                span: spanToDiagSpan(err.span),
                kind: "type" as const,
            })),
        };
    }

    const borrowResult = checkBorrowLite(expandedAst, typeCtx);
    if (!borrowResult.ok) {
        return {
            ok: false,
            errors: (borrowResult.errors ?? []).map((err) => ({
                message: err.message,
                span: spanToDiagSpan(err.span),
                kind: "borrow" as const,
            })),
        };
    }

    let irModule: IRModule;
    try {
        irModule = lowerAstModuleToSsa(expandedAst);
    } catch (error) {
        return {
            ok: false,
            errors: [
                {
                    message: `Lowering to SSA failed: ${error instanceof Error ? error.message : String(error)}`,
                    kind: "lower",
                },
            ],
        };
    }

    if (validate) {
        const validationErrors: CompileDiagnostic[] = [];
        for (const fn of irModule.functions) {
            const validationResult = validateIRFunction(fn);
            if (!validationResult.ok) {
                for (const err of validationResult.errors ?? []) {
                    validationErrors.push({
                        message: `in function \`${fn.name}\`: ${err.message}`,
                        kind: "validation",
                    });
                }
            }
        }
        if (validationErrors.length > 0) {
            return { ok: false, errors: validationErrors };
        }
    }

    const result: CompileResult = { ok: true, errors: [], module: irModule };
    if (emitAst) {
        result.ast = expandedAst;
    }
    return result;
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
    const { emitIR = true } = options;
    const result = compileToIRModule(source, options);
    if (!result.ok || !result.module) return result;
    if (emitIR) result.ir = printIRModule(result.module);
    return result;
}

export function compileToBinary(
    source: string,
    options: { emitAst?: boolean; validate?: boolean; sourcePath?: string } = {},
): BinaryCompileResult {
    const result = compileToIRModule(source, options);
    if (!result.ok || !result.module) return result;
    try {
        return { ...result, bytes: serializeModule(result.module) };
    } catch (error) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to serialize IR module: ${error instanceof Error ? error.message : String(error)}`,
                    kind: "internal",
                },
            ],
        };
    }
}

export function compileFileToIRModule(
    filePath: string,
    options: { emitAst?: boolean; validate?: boolean } = {},
): CompileResult {
    let source: string;
    try {
        source = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to read file: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                    kind: "internal",
                },
            ],
        };
    }
    return compileToIRModule(source, { ...options, sourcePath: path.resolve(filePath) });
}

export function compileFileToBinary(
    filePath: string,
    options: { emitAst?: boolean; validate?: boolean } = {},
): BinaryCompileResult {
    let source: string;
    try {
        source = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to read file: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                    kind: "internal",
                },
            ],
        };
    }
    return compileToBinary(source, { ...options, sourcePath: path.resolve(filePath) });
}

export function compileFile(filePath: string, options: CompileOptions = {}): CompileResult {
    const result = compileFileToIRModule(filePath, options);
    if (!result.ok || !result.module) return result;
    if (options.emitIR !== false) result.ir = printIRModule(result.module);
    return result;
}

export function discoverTestFunctions(
    filePath: string,
): { ok: true; tests: TestFn[] } | { ok: false; errors: CompileDiagnostic[] } {
    let source: string;
    try {
        source = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to read file: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                    kind: "internal",
                },
            ],
        };
    }

    const prepResult = prepareAst(source, { sourcePath: filePath });
    if (!prepResult.ok) {
        return { ok: false, errors: prepResult.errors };
    }

    const tests: TestFn[] = [];
    for (const item of prepResult.module.items) {
        if (item instanceof FnItem && item.isTest) {
            tests.push({ name: item.name, expectedOutput: item.expectedOutput });
        }
    }
    return { ok: true, tests };
}
