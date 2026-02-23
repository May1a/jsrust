#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { parseModule } from "./src/parser.js";
import { TypeContext } from "./src/type_context.js";
import { inferModule } from "./src/inference.js";
import { checkBorrowLite } from "./src/borrow.js";
import { lowerModule } from "./src/lowering.js";
import { resolveModuleTree } from "./src/module_resolver.js";
import { expandDerives } from "./src/derive_expand.js";
import { lowerHirToSsa } from "./src/hir_to_ssa.js";
import { printModule as printIRModule } from "./src/ir_printer.js";
import { makeIRModule, addIRFunction, resetIRIds } from "./src/ir.js";
import { HItemKind } from "./src/hir.js";
import { validateFunction as validateIRFunction } from "./src/ir_validate.js";
import { serializeModule } from "./src/ir_serialize.js";
import { runBackendCodegenWasm, runBackendWasm } from "./src/backend_runner.js";

const STDLIB_VEC_CORE_PATH = path.resolve(process.cwd(), "stdlib/vec_core.rs");
const STDLIB_BUILTIN_SOURCE = `pub enum Option<T> {
    None,
    Some(T),
}
`;

/**
 * @typedef {object} CompileOptions
 * @property {boolean} [emitAst=false]
 * @property {boolean} [emitHir=false]
 * @property {boolean} [emitIR=true]
 * @property {boolean} [validate=true]
 * @property {string} [outputFile]
 * @property {string} [sourcePath]
 */

/**
 * @typedef {{ message: string, span?: { line: number, column: number, length?: number }, kind?: string }} CompileDiagnostic
 */

/**
 * @typedef {object} CompileResult
 * @property {boolean} ok
 * @property {CompileDiagnostic[]} errors
 * @property {string} [ir]
 * @property {object} [ast]
 * @property {object} [hir]
 * @property {import('./src/ir.js').IRModule} [module]
 */

/**
 * @typedef {CompileResult & { bytes?: Uint8Array }} BinaryCompileResult
 */

/**
 * @typedef {object} RunOptions
 * @property {string} entry
 * @property {boolean} trace
 * @property {string | null} traceOutPath
 * @property {string | null} outBin
 * @property {boolean} validate
 * @property {boolean} codegenWasm
 */

/**
 * Compile a Rust source string to SSA IR module
 * @param {string} source
 * @param {{ emitAst?: boolean, emitHir?: boolean, validate?: boolean, sourcePath?: string }} [options={}]
 * @returns {CompileResult}
 */
function compileToIRModule(source, options = {}) {
    const {
        emitAst = false,
        emitHir = false,
        validate = true,
        sourcePath,
    } = options;

    /** @type {CompileDiagnostic[]} */
    const errors = [];

    resetIRIds();

    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        for (const err of parseResult.errors) {
            errors.push({
                message: err.message,
                span: err.span,
                kind: "parse",
            });
        }
        return { ok: false, errors };
    }

    const ast = parseResult.value;
    if (!ast) {
        errors.push({
            message: "Internal parser error: missing module AST",
            kind: "internal",
        });
        return { ok: false, errors };
    }
    const stdlibInjectResult = injectStdlibItems(ast);
    if (!stdlibInjectResult.ok) {
        for (const err of stdlibInjectResult.errors) {
            errors.push(err);
        }
        return { ok: false, errors };
    }
    const resolveResult = resolveModuleTree(ast, { sourcePath });
    if (!resolveResult.ok || !resolveResult.module) {
        for (const err of resolveResult.errors || []) {
            errors.push({
                message: err.message,
                span: err.span,
                kind: "resolve",
            });
        }
        return { ok: false, errors };
    }
    const resolvedAst = resolveResult.module;
    const deriveResult = expandDerives(resolvedAst);
    if (!deriveResult.ok || !deriveResult.module) {
        for (const err of deriveResult.errors || []) {
            errors.push({
                message: err.message,
                span: err.span,
                kind: "derive",
            });
        }
        return { ok: false, errors };
    }
    const expandedAst = deriveResult.module;

    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, expandedAst);
    if (!inferResult.ok) {
        for (const err of inferResult.errors || []) {
            errors.push({
                message: err.message,
                span: err.span,
                kind: "type",
            });
        }
        return { ok: false, errors };
    }

    const borrowResult = checkBorrowLite(expandedAst, typeCtx);
    if (!borrowResult.ok) {
        for (const err of borrowResult.errors || []) {
            errors.push({
                message: err.message,
                span: err.span,
                kind: "borrow",
            });
        }
        return { ok: false, errors };
    }

    const hirResult = lowerModule(expandedAst, typeCtx);
    if (!hirResult.module) {
        for (const err of hirResult.errors) {
            errors.push({
                message: err.message,
                span: err.span,
                kind: "lower",
            });
        }
        return { ok: false, errors };
    }

    const hirModule = hirResult.module;
    const irModule = makeIRModule(hirModule.name || "main");

    for (const item of hirModule.items || []) {
        if (item.kind === HItemKind.Fn) {
            if (!item.body) {
                continue;
            }
            try {
                const irFn = lowerHirToSsa(
                    /** @type {import('./src/hir.js').HFnDecl} */(item),
                    { irModule },
                );

                if (validate) {
                    const validationResult = validateIRFunction(irFn);
                    if (!validationResult.ok) {
                        for (const err of validationResult.errors || []) {
                            errors.push({
                                message: `in function \`${item.name}\`: ${err.message}`,
                                span: /** @type {any} */ (err).span,
                                kind: "validation",
                            });
                        }
                    }
                }

                addIRFunction(irModule, irFn);
            } catch (e) {
                errors.push({
                    message: `lowering function \`${item.name}\`: ${e instanceof Error ? e.message : String(e)}`,
                    kind: "lower",
                });
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    /** @type {CompileResult} */
    const result = { ok: true, errors: [], module: irModule };

    if (emitAst) {
        result.ast = expandedAst;
    }

    if (emitHir) {
        result.hir = hirModule;
    }

    return result;
}

/**
 * Parse and prepend compiler-managed stdlib items.
 * @param {import("./src/ast.js").Node} ast
 * @returns {{ ok: true } | { ok: false, errors: CompileDiagnostic[] }}
 */
function injectStdlibItems(ast) {
    /** @type {CompileDiagnostic[]} */
    const errors = [];
    let stdlibSource = "";
    try {
        stdlibSource = fs.readFileSync(STDLIB_VEC_CORE_PATH, "utf-8");
    } catch (e) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to read stdlib source: ${STDLIB_VEC_CORE_PATH}: ${e instanceof Error ? e.message : String(e)}`,
                    kind: "internal",
                },
            ],
        };
    }

    const stdlibParse = parseModule(
        `${STDLIB_BUILTIN_SOURCE}\n${stdlibSource}`,
    );
    if (!stdlibParse.ok || !stdlibParse.value) {
        for (const err of stdlibParse.errors) {
            errors.push({
                message: `In stdlib vec_core.rs: ${err.message}`,
                span: err.span,
                kind: "parse",
            });
        }
        return { ok: false, errors };
    }
    // FIXME: typesafety
    ast.items = [...(stdlibParse.value.items || []), ...(ast.items || [])];
    return { ok: true };
}

/**
 * Compile a Rust source string to SSA IR
 * @param {string} source
 * @param {CompileOptions} [options={}]
 * @returns {CompileResult}
 */
function compile(source, options = {}) {
    const { emitIR = true } = options;
    const result = compileToIRModule(source, options);
    if (!result.ok) {
        return result;
    }

    if (emitIR && result.module) {
        result.ir = printIRModule(result.module);
    }

    return result;
}

/**
 * Compile a Rust source string to binary IR.
 * @param {string} source
 * @param {{ emitAst?: boolean, emitHir?: boolean, validate?: boolean }} [options={}]
 * @returns {BinaryCompileResult}
 */
function compileToBinary(source, options = {}) {
    const result = compileToIRModule(source, options);
    if (!result.ok) {
        return result;
    }
    if (!result.module) {
        return {
            ok: false,
            errors: [
                /** @type {import('./main.js').CompileDiagnostic} */ ({
                    message: "Failed to build IR module",
                    kind: "internal",
                }),
            ],
        };
    }

    try {
        const bytes = serializeModule(result.module);
        return {
            ...result,
            bytes,
        };
    } catch (e) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to serialize IR module: ${e instanceof Error ? e.message : String(e)}`,
                    kind: "internal",
                },
            ],
        };
    }
}

/**
 * Compile a file to SSA IR module
 * @param {string} filePath
 * @param {{ emitAst?: boolean, emitHir?: boolean, validate?: boolean }} [options={}]
 * @returns {CompileResult}
 */
function compileFileToIRModule(filePath, options = {}) {
    /** @type {string} */
    let source;
    try {
        source = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to read file: ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
                    kind: "internal",
                },
            ],
        };
    }
    return compileToIRModule(source, {
        ...options,
        sourcePath: path.resolve(filePath),
    });
}

/**
 * Compile a file to binary IR.
 * @param {string} filePath
 * @param {{ emitAst?: boolean, emitHir?: boolean, validate?: boolean }} [options={}]
 * @returns {BinaryCompileResult}
 */
function compileFileToBinary(filePath, options = {}) {
    /** @type {string} */
    let source;
    try {
        source = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        return {
            ok: false,
            errors: [
                {
                    message: `Failed to read file: ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
                    kind: "internal", // FIXME: typesafety
                },
            ],
        };
    }
    return compileToBinary(source, {
        ...options,
    });
}

/**
 * Compile a file
 * @param {string} filePath
 * @param {CompileOptions} [options={}]
 * @returns {CompileResult}
 */
function compileFile(filePath, options = {}) {
    const result = compileFileToIRModule(filePath, options);
    if (!result.ok) {
        return result;
    }

    if (options.emitIR !== false && result.module) {
        result.ir = printIRModule(result.module);
    }

    return result;
}

/**
 * @param {string} message
 */
function printOneLineError(message) {
    console.error(`error: ${message}`);
}

/**
 * @param {string} label
 * @param {string} message
 */
function printBackendStatusLine(label, message) {
    console.error(`error[${label}]: ${message}`);
}

/**
 * Map internal error kind to a short human-readable label.
 * @param {string} [kind]
 * @returns {string}
 */
function errorKindLabel(kind) {
    // FIXME: typesafety
    switch (kind) {
        case "parse":
            return "E0001";
        case "resolve":
            return "E0433";
        case "type":
            return "E0308";
        case "borrow":
            return "E0502";
        case "lower":
            return "E0000";
        case "validation":
            return "E0000";
        default:
            return "E0000";
    }
}

/**
 * Print a list of compiler diagnostics in rustc-style multi-line format.
 *
 * Example output:
 *   error[E0308]: Qualified paths not yet supported for: math
 *    --> examples/15_modules.rs:8:18
 *     |
 *   8 |     let result = math::add(1, 2);
 *     |                  ^^^^
 *
 * @param {CompileDiagnostic[]} errors
 * @param {string} filePath  - path shown in the `-->` line (relative or absolute)
 * @param {string} [source]  - full source text (used to extract the faulting line)
 */
function printRustcStyleErrors(errors, filePath, source) {
    const sourceLines = source ? source.split("\n") : [];

    for (const diag of errors) {
        const code = errorKindLabel(diag.kind);
        // Header
        console.error(`error[${code}]: ${diag.message}`);

        if (diag.span) {
            const { line, column } = diag.span;
            // --> file:line:col
            console.error(` --> ${filePath}:${line}:${column}`);

            // Source line (1-indexed)
            const srcLine = sourceLines[line - 1];
            if (srcLine !== undefined) {
                const lineNumStr = String(line);
                const pad = " ".repeat(lineNumStr.length);

                console.error(`${pad} |`);
                console.error(`${lineNumStr} | ${srcLine}`);

                // Caret
                // column is 1-indexed; offset by the leading spaces in the source
                const caretOffset = column - 1;
                // length: prefer explicit length, fall back to end-of-token heuristic
                const caretLen = diag.span.length ?? 1;
                const caret = "^".repeat(Math.max(1, caretLen));
                console.error(`${pad} | ${" ".repeat(caretOffset)}${caret}`);
            }
        }

        console.error("");
    }
}

/**
 * @param {number} [exitCode=0]
 */
function printCompileHelp(exitCode = 0) {
    console.log("JSRust Compiler - Rust to SSA IR");
    console.log("");
    console.log("Usage: node main.js [options] <file.rs>");
    console.log("       node main.js run <file.rs> [options]");
    console.log("");
    console.log("Compile options:");
    console.log("  --emit-ast    Print the AST");
    console.log("  --emit-hir    Print the HIR");
    console.log("  --no-ir       Don't print the IR");
    console.log("  --no-validate Skip IR validation");
    console.log("  -o <file>     Write output to file");
    console.log("  -h, --help    Show this help");
    console.log("");
    console.log("Run options:");
    console.log(
        "  run <file.rs> Compile to binary IR and execute with backend runtime",
    );
    console.log("  --entry <fn>         Entry function (default: main)");
    console.log("  --trace              Enable backend trace output");
    console.log("  --trace-out <path>   Write backend trace to file");
    console.log("  --out-bin <path>     Write binary IR artifact to path");
    console.log(
        "  --codegen-wasm       Compile binary IR to wasm and run generated wasm",
    );
    console.log("  --no-validate        Skip IR validation");
    process.exit(exitCode);
}

/**
 * @param {number} [exitCode=0]
 */
function printRunHelp(exitCode = 0) {
    console.log("JSRust Run - Compile to binary IR and execute via backend");
    console.log("");
    console.log("Usage: node main.js run <file.rs> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --entry <fn>         Entry function (default: main)");
    console.log("  --trace              Enable backend trace output");
    console.log("  --trace-out <path>   Write backend trace to file");
    console.log("  --out-bin <path>     Write binary IR artifact to path");
    console.log(
        "  --codegen-wasm       Compile binary IR to wasm and run generated wasm",
    );
    console.log("  --no-validate        Skip IR validation");
    console.log("  -h, --help           Show this help");
    process.exit(exitCode);
}

/**
 * @param {string} outputPath
 * @param {Uint8Array} bytes
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function writeFileAtomic(outputPath, bytes) {
    const resolved = path.resolve(outputPath);
    const tempPath = `${resolved}.tmp`;

    try {
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(tempPath, bytes);
        fs.renameSync(tempPath, resolved);
        return { ok: true };
    } catch (e) {
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        } catch { }
        return {
            ok: false,
            message: `failed to write file: ${resolved}: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runCompileCli(args) {
    if (args.length === 0) {
        printCompileHelp(1);
    }

    /** @type {CompileOptions} */
    const options = {
        emitAst: false,
        emitHir: false,
        emitIR: true,
        validate: true,
    };

    /** @type {string | undefined} */
    let inputFile;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--emit-ast") {
            options.emitAst = true;
        } else if (arg === "--emit-hir") {
            options.emitHir = true;
        } else if (arg === "--no-ir") {
            options.emitIR = false;
        } else if (arg === "--no-validate") {
            options.validate = false;
        } else if (arg === "-o") {
            i++;
            if (i < args.length) {
                options.outputFile = args[i];
            } else {
                printOneLineError("missing value for -o");
                return 1;
            }
        } else if (arg === "-h" || arg === "--help") {
            printCompileHelp(0);
        } else if (!arg.startsWith("-")) {
            inputFile = arg;
        }
    }

    if (!inputFile) {
        printOneLineError("no input file specified");
        return 1;
    }

    const source = (() => {
        try {
            return fs.readFileSync(inputFile, "utf-8");
        } catch {
            return "";
        }
    })();
    const result = compileFile(inputFile, options);

    if (!result.ok) {
        printRustcStyleErrors(result.errors, inputFile, source);
        console.error(
            `aborting due to ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`,
        );
        return 1;
    }

    let output = "";

    if (options.emitAst && result.ast) {
        output += "=== AST ===\n";
        output += JSON.stringify(result.ast, null, 2) + "\n\n";
    }

    if (options.emitHir && result.hir) {
        output += "=== HIR ===\n";
        output += JSON.stringify(result.hir, null, 2) + "\n\n";
    }

    if (options.emitIR && result.ir) {
        output += "=== SSA IR ===\n";
        output += result.ir;
    }

    if (options.outputFile) {
        try {
            fs.writeFileSync(options.outputFile, output);
            console.log(`Output written to ${options.outputFile}`);
        } catch (e) {
            printOneLineError(
                `failed to write output file: ${e instanceof Error ? e.message : String(e)}`,
            );
            return 1;
        }
    } else {
        console.log(output);
    }

    return 0;
}

/**
 * @param {number} [exitCode=0]
 */
function printTestHelp(exitCode = 0) {
    console.log("JSRust Test - Run test functions");
    console.log("");
    console.log("Usage: node main.js test <file.rs> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --no-validate        Skip IR validation");
    console.log(
        "  --codegen-wasm       Compile binary IR to wasm and run generated wasm",
    );
    console.log("  -h, --help           Show this help");
    console.log("");
    console.log("Description:");
    console.log(
        "  Discovers and runs all functions marked with #[test] attribute.",
    );
    console.log(
        '  Tests may declare expected stdout using #[expect_output("...")].',
    );
    console.log(
        "  Reports test results and exits with code 0 if all tests pass,",
    );
    console.log("  or 1 if any test fails.");
    process.exit(exitCode);
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeNewlines(text) {
    return text.replace(/\r\n/g, "\n");
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function firstDiffLine(a, b) {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const max = Math.max(aLines.length, bLines.length);
    for (let i = 0; i < max; i++) {
        if (aLines[i] !== bLines[i]) {
            return i + 1;
        }
    }
    return -1;
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runTestCli(args) {
    if (args.length === 0) {
        printTestHelp(1);
    }

    let validate = true;
    let codegenWasm = false;
    /** @type {string | undefined} */
    let inputFile;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--no-validate") {
            validate = false;
        } else if (arg === "--codegen-wasm") {
            codegenWasm = true;
        } else if (arg === "-h" || arg === "--help") {
            printTestHelp(0);
        } else if (arg.startsWith("-")) {
            printOneLineError(`unknown option for test: ${arg}`);
            return 1;
        } else if (!inputFile) {
            inputFile = arg;
        } else {
            printOneLineError(`unexpected positional argument: ${arg}`);
            return 1;
        }
    }

    if (!inputFile) {
        printOneLineError("no input file specified for test");
        return 1;
    }

    const source = (() => {
        try {
            return fs.readFileSync(inputFile, "utf-8");
        } catch {
            return "";
        }
    })();

    // Compile to get the HIR with test functions
    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        for (const err of parseResult.errors) {
            console.error(`error: ${err.message} at line ${err.span.line}`);
        }
        return 1;
    }

    const ast = parseResult.value;
    if (!ast) {
        console.error("error: internal parser error: missing module AST");
        return 1;
    }
    const stdlibInjectResult = injectStdlibItems(ast);
    if (!stdlibInjectResult.ok) {
        for (const err of stdlibInjectResult.errors) {
            console.error(`error: ${err.message}`);
        }
        return 1;
    }
    const resolveResult = resolveModuleTree(ast, { sourcePath: inputFile });
    if (!resolveResult.ok || !resolveResult.module) {
        for (const err of resolveResult.errors || []) {
            console.error(`error: ${err.message}`);
        }
        return 1;
    }

    const resolvedAst = resolveResult.module;
    const deriveResult = expandDerives(resolvedAst);
    if (!deriveResult.ok || !deriveResult.module) {
        for (const err of deriveResult.errors || []) {
            console.error(`error: ${err.message}`);
        }
        return 1;
    }

    const expandedAst = deriveResult.module;

    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, expandedAst);
    if (!inferResult.ok) {
        for (const err of inferResult.errors || []) {
            console.error(`error: ${err.message}`);
        }
        return 1;
    }

    const borrowResult = checkBorrowLite(expandedAst, typeCtx);
    if (!borrowResult.ok) {
        for (const err of borrowResult.errors || []) {
            console.error(`error: ${err.message}`);
        }
        return 1;
    }

    const hirResult = lowerModule(expandedAst, typeCtx);
    if (!hirResult.module) {
        for (const err of hirResult.errors) {
            console.error(`error: ${err.message}`);
        }
        return 1;
    }

    const hirModule = hirResult.module;

    // Find all test functions
    /** @type {{ name: string, expectedOutput: string | null }[]} */
    const testFns = [];
    for (const item of hirModule.items || []) {
        if (item.kind === HItemKind.Fn && item.isTest) {
            testFns.push({
                name: item.name,
                expectedOutput: item.expectedOutput ?? null,
            });
        }
    }

    if (testFns.length === 0) {
        console.log("No test functions found.");
        return 0;
    }

    // Compile to binary IR
    const irModule = makeIRModule(hirModule.name || "main");
    for (const item of hirModule.items || []) {
        if (item.kind === HItemKind.Fn) {
            if (!item.body) {
                continue;
            }
            try {
                const irFn = lowerHirToSsa(
                    /** @type {import('./src/hir.js').HFnDecl} */(item),
                    { irModule },
                );
                if (validate) {
                    const validationResult = validateIRFunction(irFn);
                    if (!validationResult.ok) {
                        for (const err of validationResult.errors || []) {
                            console.error(
                                `error: in function \`${item.name}\`: ${err.message}`,
                            );
                        }
                    }
                }
                addIRFunction(irModule, irFn);
            } catch (e) {
                console.error(
                    `error: lowering function \`${item.name}\`: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        }
    }

    let bytes;
    try {
        bytes = serializeModule(irModule);
    } catch (e) {
        printOneLineError(
            `failed to serialize IR module: ${e instanceof Error ? e.message : String(e)}`,
        );
        return 1;
    }

    // Run each test
    let passed = 0;
    let failed = 0;

    for (const testFn of testFns) {
        const runResult = codegenWasm
            ? runBackendCodegenWasm(bytes, { entry: testFn.name, trace: false })
            : runBackendWasm(bytes, { entry: testFn.name, trace: false });

        if (!runResult.ok) {
            console.log(`test ${testFn.name} ... FAILED`);
            if (runResult.message) {
                console.log(`  execution error: ${runResult.message}`);
            }
            failed++;
            continue;
        }

        if (testFn.expectedOutput !== null) {
            const actual = normalizeNewlines(runResult.stdout);
            const expected = normalizeNewlines(testFn.expectedOutput);
            if (actual !== expected) {
                const line = firstDiffLine(actual, expected);
                const actualLine =
                    line > 0 ? (actual.split("\n")[line - 1] ?? "") : "";
                const expectedLine =
                    line > 0 ? (expected.split("\n")[line - 1] ?? "") : "";
                console.log(`test ${testFn.name} ... FAILED`);
                console.log(`  stdout mismatch at line ${line}`);
                console.log(`  expected: ${JSON.stringify(expectedLine)}`);
                console.log(`  actual:   ${JSON.stringify(actualLine)}`);
                failed++;
                continue;
            }
        }

        console.log(`test ${testFn.name} ... ok`);
        passed++;
    }

    console.log("");
    console.log(
        `test result: ${failed === 0 ? "ok" : "FAILED"}. ${passed} passed; ${failed} failed; 0 ignored`,
    );

    return failed > 0 ? 1 : 0;
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runBackendCli(args) {
    if (args.length === 0) {
        printRunHelp(1);
    }

    /** @type {RunOptions} */
    const options = {
        entry: "main",
        trace: false,
        traceOutPath: null,
        outBin: null,
        validate: true,
        codegenWasm: false,
    };

    let inputFile = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--entry") {
            i++;
            if (i >= args.length) {
                printOneLineError("missing value for --entry");
                return 1;
            }
            options.entry = args[i];
        } else if (arg === "--trace") {
            options.trace = true;
        } else if (arg === "--trace-out") {
            i++;
            if (i >= args.length) {
                printOneLineError("missing value for --trace-out");
                return 1;
            }
            options.traceOutPath = args[i];
        } else if (arg === "--out-bin") {
            i++;
            if (i >= args.length) {
                printOneLineError("missing value for --out-bin");
                return 1;
            }
            options.outBin = args[i];
        } else if (arg === "--no-validate") {
            options.validate = false;
        } else if (arg === "--codegen-wasm") {
            options.codegenWasm = true;
        } else if (arg === "-h" || arg === "--help") {
            printRunHelp(0);
        } else if (arg.startsWith("-")) {
            printOneLineError(`unknown option for run: ${arg}`);
            return 1;
        } else if (!inputFile) {
            inputFile = arg;
        } else {
            printOneLineError(`unexpected positional argument: ${arg}`);
            return 1;
        }
    }

    if (!inputFile) {
        printOneLineError("no input file specified for run");
        return 1;
    }

    if (options.traceOutPath && !options.trace) {
        printOneLineError("--trace-out requires --trace");
        return 1;
    }
    if (options.codegenWasm && options.trace) {
        printOneLineError("--trace is not supported with --codegen-wasm");
        return 1;
    }

    const source = (() => {
        try {
            return fs.readFileSync(inputFile, "utf-8");
        } catch {
            return "";
        }
    })();
    const binaryResult = compileFileToBinary(inputFile, {
        validate: options.validate,
    });
    if (!binaryResult.ok) {
        printRustcStyleErrors(binaryResult.errors, inputFile, source);
        console.error(
            `aborting due to ${binaryResult.errors.length} error${binaryResult.errors.length === 1 ? "" : "s"}`,
        );
        return 1;
    }
    if (!binaryResult.bytes) {
        printOneLineError("binary IR serialization produced no bytes");
        return 1;
    }

    if (options.outBin) {
        const outWrite = writeFileAtomic(options.outBin, binaryResult.bytes);
        if (!outWrite.ok) {
            printOneLineError(outWrite.message);
            return 1;
        }
    }

    const runResult = options.codegenWasm
        ? runBackendCodegenWasm(binaryResult.bytes, {
            entry: options.entry,
            trace: options.trace,
        })
        : runBackendWasm(binaryResult.bytes, {
            entry: options.entry,
            trace: options.trace,
        });

    if (!runResult.ok) {
        printBackendStatusLine(runResult.label, runResult.message);
        return runResult.exitCode ?? 1;
    }

    if (runResult.stdoutBytes.length > 0) {
        process.stdout.write(Buffer.from(runResult.stdoutBytes));
    }
    if (runResult.hasExitValue) {
        process.stdout.write(`ok exit=${runResult.exitValue}\n`);
    } else {
        process.stdout.write("ok\n");
    }

    if (options.traceOutPath) {
        const traceWrite = writeFileAtomic(
            options.traceOutPath,
            runResult.traceBytes,
        );
        if (!traceWrite.ok) {
            printOneLineError(traceWrite.message);
            return 1;
        }
    }

    return 0;
}

function main() {
    const args = process.argv.slice(2);
    let exitCode;
    if (args[0] === "run") {
        exitCode = runBackendCli(args.slice(1));
    } else if (args[0] === "test") {
        exitCode = runTestCli(args.slice(1));
    } else {
        exitCode = runCompileCli(args);
    }
    process.exit(exitCode);
}

export {
    compile,
    compileFile,
    compileToIRModule,
    compileFileToIRModule,
    compileToBinary,
    compileFileToBinary,
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
