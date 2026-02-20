#!/usr/bin/env node
// @ts-nocheck

import * as fs from "fs";
import * as path from "path";
import { parseModule } from "./parser.js";
import { TypeContext } from "./type_context.js";
import { inferModule } from "./inference.js";
import { lowerModule } from "./lowering.js";
import { resolveModuleTree } from "./module_resolver.js";
import { lowerHirToSsa } from "./hir_to_ssa.js";
import { printModule as printIRModule } from "./ir_printer.js";
import { makeIRModule, addIRFunction, resetIRIds } from "./ir.js";
import { HItemKind } from "./hir.js";
import { validateFunction as validateIRFunction } from "./ir_validate.js";
import { serializeModule } from "./ir_serialize.js";
import { runBackendWasm } from "./backend_runner.js";

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
 * @property {import('./ir.js').IRModule} [module]
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

    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, resolvedAst);
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

    const hirResult = lowerModule(resolvedAst, typeCtx);
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
            try {
                const irFn = lowerHirToSsa(item, { irModule });

                if (validate) {
                    const validationResult = validateIRFunction(irFn);
                    if (!validationResult.ok) {
                        for (const err of validationResult.errors || []) {
                            errors.push({
                                message: `in function \`${item.name}\`: ${err.message}`,
                                span: err.span,
                                kind: "validation",
                            });
                        }
                    }
                }

                addIRFunction(irModule, irFn);
            } catch (e) {
                errors.push({
                    message: `lowering function \`${item.name}\`: ${e.message}`,
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
        result.ast = resolvedAst;
    }

    if (emitHir) {
        result.hir = hirModule;
    }

    return result;
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
            errors: ["Failed to build IR module"],
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
            errors: [`Failed to serialize IR module: ${e.message}`],
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
    let source;
    try {
        source = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        return {
            ok: false,
            errors: [`Failed to read file: ${filePath}: ${e.message}`],
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
    let source;
    try {
        source = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        return {
            ok: false,
            errors: [`Failed to read file: ${filePath}: ${e.message}`],
        };
    }
    return compileToBinary(source, {
        ...options,
        sourcePath: path.resolve(filePath),
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
    switch (kind) {
        case "parse": return "E0001";
        case "resolve": return "E0433";
        case "type": return "E0308";
        case "lower": return "E0000";
        case "validation": return "E0000";
        default: return "E0000";
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
    console.log("  run <file.rs> Compile to binary IR and execute with wasm backend");
    console.log("  --entry <fn>         Entry function (default: main)");
    console.log("  --trace              Enable backend trace output");
    console.log("  --trace-out <path>   Write backend trace to file");
    console.log("  --out-bin <path>     Write binary IR artifact to path");
    console.log("  --no-validate        Skip IR validation");
    process.exit(exitCode);
}

/**
 * @param {number} [exitCode=0]
 */
function printRunHelp(exitCode = 0) {
    console.log("JSRust Run - Compile to binary IR and execute wasm backend");
    console.log("");
    console.log("Usage: node main.js run <file.rs> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --entry <fn>         Entry function (default: main)");
    console.log("  --trace              Enable backend trace output");
    console.log("  --trace-out <path>   Write backend trace to file");
    console.log("  --out-bin <path>     Write binary IR artifact to path");
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
        } catch {
        }
        return {
            ok: false,
            message: `failed to write file: ${resolved}: ${e.message}`,
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

    let inputFile = null;

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
        try { return fs.readFileSync(inputFile, "utf-8"); } catch { return ""; }
    })();
    const result = compileFile(inputFile, options);

    if (!result.ok) {
        printRustcStyleErrors(result.errors, inputFile, source);
        console.error(`aborting due to ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`);
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
            printOneLineError(`failed to write output file: ${e.message}`);
            return 1;
        }
    } else {
        console.log(output);
    }

    return 0;
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

    const source = (() => {
        try { return fs.readFileSync(inputFile, "utf-8"); } catch { return ""; }
    })();
    const binaryResult = compileFileToBinary(inputFile, {
        validate: options.validate,
    });
    if (!binaryResult.ok) {
        printRustcStyleErrors(binaryResult.errors, inputFile, source);
        console.error(`aborting due to ${binaryResult.errors.length} error${binaryResult.errors.length === 1 ? "" : "s"}`);
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

    const runResult = runBackendWasm(binaryResult.bytes, {
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
        const traceWrite = writeFileAtomic(options.traceOutPath, runResult.traceBytes);
        if (!traceWrite.ok) {
            printOneLineError(traceWrite.message);
            return 1;
        }
    }

    return 0;
}

function main() {
    const args = process.argv.slice(2);
    const exitCode =
        args[0] === "run"
            ? runBackendCli(args.slice(1))
            : runCompileCli(args);
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
