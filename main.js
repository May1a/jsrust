#!/usr/bin/env node
// @ts-nocheck

import { parseModule } from "./parser.js";
import { TypeContext } from "./type_context.js";
import { inferModule } from "./inference.js";
import { lowerModule } from "./lowering.js";
import { lowerHirToSsa } from "./hir_to_ssa.js";
import { printModule as printIRModule } from "./ir_printer.js";
import { makeIRModule, addIRFunction, resetIRIds } from "./ir.js";
import { HItemKind } from "./hir.js";
import { validateFunction as validateIRFunction } from "./ir_validate.js";
import * as fs from "fs";
import * as path from "path";

/**
 * @typedef {object} CompileOptions
 * @property {boolean} [emitAst=false]
 * @property {boolean} [emitHir=false]
 * @property {boolean} [emitIR=true]
 * @property {boolean} [validate=true]
 * @property {string} [outputFile]
 */

/**
 * @typedef {object} CompileResult
 * @property {boolean} ok
 * @property {string[]} errors
 * @property {string} [ir]
 * @property {object} [ast]
 * @property {object} [hir]
 */

/**
 * Compile a Rust source string to SSA IR
 * @param {string} source
 * @param {CompileOptions} [options={}]
 * @returns {CompileResult}
 */
function compile(source, options = {}) {
    const {
        emitAst = false,
        emitHir = false,
        emitIR = true,
        validate = true,
    } = options;

    const errors = [];

    // Reset IR IDs for consistent output
    resetIRIds();

    // Step 1: Parse
    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        for (const err of parseResult.errors) {
            errors.push(
                `Parse error at line ${err.span.line}, column ${err.span.column}: ${err.message}`,
            );
        }
        return { ok: false, errors };
    }

    const ast = parseResult.value;

    // Step 2: Type inference
    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, ast);
    if (!inferResult.ok) {
        for (const err of inferResult.errors || []) {
            const location = err.span
                ? ` at line ${err.span.line}, column ${err.span.column}`
                : "";
            errors.push(`Type error${location}: ${err.message}`);
        }
        return { ok: false, errors };
    }

    // Step 3: Lower to HIR
    const hirResult = lowerModule(ast, typeCtx);
    if (!hirResult.module) {
        for (const err of hirResult.errors) {
            const location = err.span
                ? ` at line ${err.span.line}, column ${err.span.column}`
                : "";
            errors.push(`Lowering error${location}: ${err.message}`);
        }
        return { ok: false, errors };
    }

    const hirModule = hirResult.module;

    // Step 4: Lower to SSA IR
    const irModule = makeIRModule(hirModule.name || "main");

    for (const item of hirModule.items || []) {
        if (item.kind === HItemKind.Fn) {
            try {
                const irFn = lowerHirToSsa(item);

                // Validate if requested
                if (validate) {
                    const validationResult = validateIRFunction(irFn);
                    if (!validationResult.ok) {
                        for (const err of validationResult.errors || []) {
                            errors.push(
                                `Validation error in function ${item.name}: ${err.message}`,
                            );
                        }
                    }
                }

                addIRFunction(irModule, irFn);
            } catch (e) {
                errors.push(
                    `Error lowering function ${item.name}: ${e.message}`,
                );
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // Build result
    /** @type {CompileResult} */
    const result = { ok: true, errors: [] };

    if (emitAst) {
        result.ast = ast;
    }

    if (emitHir) {
        result.hir = hirModule;
    }

    if (emitIR) {
        result.ir = printIRModule(irModule);
    }

    return result;
}

/**
 * Compile a file
 * @param {string} filePath
 * @param {CompileOptions} [options={}]
 * @returns {CompileResult}
 */
function compileFile(filePath, options = {}) {
    let source;
    try {
        source = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        return {
            ok: false,
            errors: [`Failed to read file: ${filePath}: ${e.message}`],
        };
    }
    return compile(source, options);
}

// CLI entry point
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log("JSRust Compiler - Rust to SSA IR");
        console.log("");
        console.log("Usage: node main.js [options] <file.rs>");
        console.log("");
        console.log("Options:");
        console.log("  --emit-ast    Print the AST");
        console.log("  --emit-hir    Print the HIR");
        console.log("  --no-ir       Don't print the IR");
        console.log("  --no-validate Skip IR validation");
        console.log("  -o <file>     Write output to file");
        console.log("  -h, --help    Show this help");
        process.exit(1);
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
            }
        } else if (arg === "-h" || arg === "--help") {
            console.log("JSRust Compiler - Rust to SSA IR");
            console.log("");
            console.log("Usage: node main.js [options] <file.rs>");
            console.log("");
            console.log("Options:");
            console.log("  --emit-ast    Print the AST");
            console.log("  --emit-hir    Print the HIR");
            console.log("  --no-ir       Don't print the IR");
            console.log("  --no-validate Skip IR validation");
            console.log("  -o <file>     Write output to file");
            console.log("  -h, --help    Show this help");
            process.exit(0);
        } else if (!arg.startsWith("-")) {
            inputFile = arg;
        }
    }

    if (!inputFile) {
        console.error("Error: No input file specified");
        process.exit(1);
    }

    const result = compileFile(inputFile, options);

    if (!result.ok) {
        console.error("Compilation failed:");
        for (const err of result.errors) {
            console.error(`  error: ${err}`);
        }
        process.exit(1);
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
            console.error(`Failed to write output file: ${e.message}`);
            process.exit(1);
        }
    } else {
        console.log(output);
    }
}

export { compile, compileFile };

// Run CLI if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
