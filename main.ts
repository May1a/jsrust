#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";
import {
    compile,
    compileFile,
    compileToIRModule,
    compileFileToIRModule,
    compileToBinary,
    compileFileToBinary,
    discoverTestFunctions,
    type CompileDiagnostic,
    type CompileOptions,
    type CompileResult,
    type TestFn,
} from "./src/compile";
import { runBackendCodegenWasm, runBackendWasm } from "./src/backend_runner";
import {
    Level,
    makeDiagnostic,
    withCode,
    makeSourceSpan,
    makeSourceLocation,
    createSourceContext,
    renderDiagnostic,
    type Diagnostic,
    type SourceSpan,
} from "./src/diagnostics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunOptions = {
    entry: string;
    trace: boolean;
    traceOutPath: string | undefined;
    outBin: string | undefined;
    validate: boolean;
    codegenWasm: boolean;
};

// ---------------------------------------------------------------------------
// Diagnostic display
// ---------------------------------------------------------------------------

const ERROR_KIND_CODES: Record<string, string> = {
    parse: "E0001",
    resolve: "E0433",
    type: "E0308",
    borrow: "E0502",
    lower: "E0000",
    validation: "E0000",
};

function errorKindCode(kind?: string): string {
    return (kind && ERROR_KIND_CODES[kind]) ?? "E0000";
}

function compileDiagnosticToDisplay(cd: CompileDiagnostic, file: string): Diagnostic {
    if (cd.span) {
        const span: SourceSpan = makeSourceSpan(
            makeSourceLocation(cd.span.line, cd.span.column, file),
            makeSourceLocation(cd.span.line, cd.span.column + (cd.span.length ?? 1), file),
        );
        return withCode(makeDiagnostic(Level.Error, cd.message, span), errorKindCode(cd.kind));
    }
    return { level: Level.Error, message: cd.message, code: errorKindCode(cd.kind) };
}

function printDiagnostics(errors: CompileDiagnostic[], filePath: string, source: string): void {
    const ctx = createSourceContext(source, filePath);
    const color = process.stderr.isTTY;
    for (const err of errors) {
        console.error(renderDiagnostic(compileDiagnosticToDisplay(err, filePath), ctx, { color }));
    }
    if (errors.length > 0) {
        const s = errors.length === 1 ? "" : "s";
        console.error(`\naborting due to ${errors.length} error${s}`);
    }
}

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

function readSourceFile(filePath: string): string {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return "";
    }
}

function writeFileAtomic(
    outputPath: string,
    bytes: Uint8Array,
): { ok: true } | { ok: false; message: string } {
    const resolved = path.resolve(outputPath);
    const tempPath = `${resolved}.tmp`;
    try {
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(tempPath, bytes);
        fs.renameSync(tempPath, resolved);
        return { ok: true };
    } catch (error) {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {
            // Cleanup of temp file failed; ignore and fall through to return the original error.
        }
        return {
            ok: false,
            message: `failed to write file: ${resolved}: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

// ---------------------------------------------------------------------------
// Test output helpers
// ---------------------------------------------------------------------------

function normalizeNewlines(text: string): string {
    return text.replace(/\r\n/g, "\n");
}

const NO_DIFF = -1;

function firstDiffLine(a: string, b: string): number {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const max = Math.max(aLines.length, bLines.length);
    for (let i = 0; i < max; i++) {
        if (aLines[i] !== bLines[i]) return i + 1;
    }
    return NO_DIFF;
}

// ---------------------------------------------------------------------------
// CLI — compile
// ---------------------------------------------------------------------------

function printCompileHelp(exitCode = 0): never {
    console.log("JSRust Compiler - Rust to SSA IR");
    console.log("");
    console.log("Usage: bun main.ts [options] <file.rs>");
    console.log("       bun main.ts run <file.rs> [options]");
    console.log("");
    console.log("Compile options:");
    console.log("  --emit-ast    Print the AST");
    console.log("  --no-ir       Don't print the IR");
    console.log("  --no-validate Skip IR validation");
    console.log("  -o <file>     Write output to file");
    console.log("  -h, --help    Show this help");
    console.log("");
    console.log("Run options:");
    console.log("  run <file.rs>        Compile to binary IR and execute with backend runtime");
    console.log("  --entry <fn>         Entry function (default: main)");
    console.log("  --trace              Enable backend trace output");
    console.log("  --trace-out <path>   Write backend trace to file");
    console.log("  --out-bin <path>     Write binary IR artifact to path");
    console.log("  --codegen-wasm       Compile binary IR to wasm and run generated wasm");
    console.log("  --no-validate        Skip IR validation");
    process.exit(exitCode);
}

function parseCompileArgs(
    args: string[],
): { options: CompileOptions; inputFile?: string } | { error: string } {
    const options: CompileOptions = { emitAst: false, emitIR: true, validate: true };
    let inputFile: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--emit-ast") {
            options.emitAst = true;
        } else if (arg === "--no-ir") {
            options.emitIR = false;
        } else if (arg === "--no-validate") {
            options.validate = false;
        } else if (arg === "-o") {
            i++;
            if (i >= args.length) return { error: "missing value for -o" };
            options.outputFile = args[i];
        } else if (arg === "-h" || arg === "--help") {
            printCompileHelp(0);
        } else if (!arg.startsWith("-")) {
            inputFile = arg;
        }
    }

    return { options, inputFile };
}

function buildCompileOutput(result: CompileResult, options: CompileOptions): string {
    let output = "";
    if (options.emitAst && result.ast) {
        output += `=== AST ===\n${JSON.stringify(result.ast, undefined, 2)}\n\n`;
    }
    if (options.emitIR && result.ir) {
        output += `=== SSA IR ===\n${String(result.ir)}`;
    }
    return output;
}

function writeCompileOutput(output: string, outputFile: string | undefined): number {
    if (outputFile) {
        try {
            fs.writeFileSync(outputFile, output);
            console.log(`Output written to ${outputFile}`);
        } catch (error) {
            console.error(
                `error: failed to write output file: ${error instanceof Error ? error.message : String(error)}`,
            );
            return 1;
        }
    } else {
        console.log(output);
    }
    return 0;
}

function runCompileCli(args: string[]): number {
    if (args.length === 0) printCompileHelp(1);

    const parsed = parseCompileArgs(args);
    if ("error" in parsed) {
        console.error(`error: ${parsed.error}`);
        return 1;
    }
    const { options, inputFile } = parsed;

    if (!inputFile) {
        console.error("error: no input file specified");
        return 1;
    }

    const source = readSourceFile(inputFile);
    const result = compileFile(inputFile, options);

    if (!result.ok) {
        printDiagnostics(result.errors, inputFile, source);
        return 1;
    }

    return writeCompileOutput(buildCompileOutput(result, options), options.outputFile);
}

// ---------------------------------------------------------------------------
// CLI — test
// ---------------------------------------------------------------------------

function printTestHelp(exitCode = 0): never {
    console.log("JSRust Test - Run test functions");
    console.log("");
    console.log("Usage: bun main.ts test <file.rs> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --no-validate        Skip IR validation");
    console.log("  --codegen-wasm       Compile binary IR to wasm and run generated wasm");
    console.log("  -h, --help           Show this help");
    console.log("");
    console.log("Description:");
    console.log("  Discovers and runs all functions marked with #[test] attribute.");
    console.log('  Tests may declare expected stdout using #[expect_output("...")].');
    console.log("  Reports test results and exits with code 0 if all tests pass,");
    console.log("  or 1 if any test fails.");
    process.exit(exitCode);
}

type TestRunResult = { passed: true } | { passed: false; reason: string };

function runSingleTest(
    testFn: { name: string; expectedOutput: string | undefined },
    bytes: Uint8Array,
    codegenWasm: boolean,
): TestRunResult {
    const runResult = codegenWasm
        ? runBackendCodegenWasm(bytes, { entry: testFn.name, trace: false })
        : runBackendWasm(bytes, { entry: testFn.name, trace: false });

    if (!runResult.ok) {
        return { passed: false, reason: runResult.message };
    }

    if (testFn.expectedOutput !== undefined) {
        const actual = normalizeNewlines(runResult.stdout);
        const expected = normalizeNewlines(testFn.expectedOutput);
        if (actual !== expected) {
            const line = firstDiffLine(actual, expected);
            const actualLine = line > 0 ? (actual.split("\n")[line - 1] ?? "") : "";
            const expectedLine = line > 0 ? (expected.split("\n")[line - 1] ?? "") : "";
            return {
                passed: false,
                reason: `stdout mismatch at line ${line}\n  expected: ${JSON.stringify(expectedLine)}\n  actual:   ${JSON.stringify(actualLine)}`,
            };
        }
    }

    return { passed: true };
}

function parseTestArgs(args: string[]): { validate: boolean; codegenWasm: boolean; inputFile?: string } | { error: string } {
    let validate = true;
    let codegenWasm = false;
    let inputFile: string | undefined;

    for (const arg of args) {
        if (arg === "--no-validate") {
            validate = false;
        } else if (arg === "--codegen-wasm") {
            codegenWasm = true;
        } else if (arg === "-h" || arg === "--help") {
            printTestHelp(0);
        } else if (arg.startsWith("-")) {
            return { error: `unknown option for test: ${arg}` };
        } else if (!inputFile) {
            inputFile = arg;
        } else {
            return { error: `unexpected positional argument: ${arg}` };
        }
    }

    return { validate, codegenWasm, inputFile };
}

function reportTestSuite(
    tests: TestFn[],
    bytes: Uint8Array,
    codegenWasm: boolean,
): number {
    let passed = 0;
    let failed = 0;

    for (const testFn of tests) {
        const result = runSingleTest(testFn, bytes, codegenWasm);
        if (result.passed) {
            console.log(`test ${testFn.name} ... ok`);
            passed++;
        } else {
            console.log(`test ${testFn.name} ... FAILED`);
            for (const line of result.reason.split("\n")) {
                console.log(`  ${line}`);
            }
            failed++;
        }
    }

    console.log("");
    console.log(
        `test result: ${failed === 0 ? "ok" : "FAILED"}. ${passed} passed; ${failed} failed; 0 ignored`,
    );
    return failed > 0 ? 1 : 0;
}

function runTestCli(args: string[]): number {
    if (args.length === 0) printTestHelp(1);

    const parsed = parseTestArgs(args);
    if ("error" in parsed) {
        console.error(`error: ${parsed.error}`);
        return 1;
    }
    const { validate, codegenWasm, inputFile } = parsed;

    if (!inputFile) {
        console.error("error: no input file specified for test");
        return 1;
    }

    const discoverResult = discoverTestFunctions(inputFile);
    if (!discoverResult.ok) {
        printDiagnostics(discoverResult.errors, inputFile, readSourceFile(inputFile));
        return 1;
    }

    if (discoverResult.tests.length === 0) {
        console.log("No test functions found.");
        return 0;
    }

    const binaryResult = compileFileToBinary(inputFile, { validate });
    if (!binaryResult.ok || !binaryResult.bytes) {
        printDiagnostics(binaryResult.errors, inputFile, readSourceFile(inputFile));
        return 1;
    }

    return reportTestSuite(discoverResult.tests, binaryResult.bytes, codegenWasm);
}

// ---------------------------------------------------------------------------
// CLI — run (backend)
// ---------------------------------------------------------------------------

function printRunHelp(exitCode = 0): never {
    console.log("JSRust Run - Compile to binary IR and execute via backend");
    console.log("");
    console.log("Usage: bun main.ts run <file.rs> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --entry <fn>         Entry function (default: main)");
    console.log("  --trace              Enable backend trace output");
    console.log("  --trace-out <path>   Write backend trace to file");
    console.log("  --out-bin <path>     Write binary IR artifact to path");
    console.log("  --codegen-wasm       Compile binary IR to wasm and run generated wasm");
    console.log("  --no-validate        Skip IR validation");
    console.log("  -h, --help           Show this help");
    process.exit(exitCode);
}

function parseRunArgs(
    args: string[],
): { options: RunOptions; inputFile?: string } | { error: string } {
    const options: RunOptions = {
        entry: "main",
        trace: false,
        traceOutPath: undefined,
        outBin: undefined,
        validate: true,
        codegenWasm: false,
    };
    let inputFile: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--entry") {
            i++;
            if (i >= args.length) return { error: "missing value for --entry" };
            options.entry = args[i];
        } else if (arg === "--trace") {
            options.trace = true;
        } else if (arg === "--trace-out") {
            i++;
            if (i >= args.length) return { error: "missing value for --trace-out" };
            options.traceOutPath = args[i];
        } else if (arg === "--out-bin") {
            i++;
            if (i >= args.length) return { error: "missing value for --out-bin" };
            options.outBin = args[i];
        } else if (arg === "--no-validate") {
            options.validate = false;
        } else if (arg === "--codegen-wasm") {
            options.codegenWasm = true;
        } else if (arg === "-h" || arg === "--help") {
            printRunHelp(0);
        } else if (arg.startsWith("-")) {
            return { error: `unknown option for run: ${arg}` };
        } else if (!inputFile) {
            inputFile = arg;
        } else {
            return { error: `unexpected positional argument: ${arg}` };
        }
    }

    return { options, inputFile };
}

function executeAndReport(bytes: Uint8Array, options: RunOptions): number {
    const runResult = options.codegenWasm
        ? runBackendCodegenWasm(bytes, { entry: options.entry, trace: options.trace })
        : runBackendWasm(bytes, { entry: options.entry, trace: options.trace });

    if (!runResult.ok) {
        console.error(`error[${runResult.label}]: ${runResult.message}`);
        return runResult.exitCode ?? 1;
    }

    if (runResult.stdoutBytes.length > 0) {
        process.stdout.write(Buffer.from(runResult.stdoutBytes));
    }
    process.stdout.write(runResult.hasExitValue ? `ok exit=${runResult.exitValue}\n` : "ok\n");

    if (options.traceOutPath) {
        const writeResult = writeFileAtomic(options.traceOutPath, runResult.traceBytes);
        if (!writeResult.ok) {
            console.error(`error: ${writeResult.message}`);
            return 1;
        }
    }

    return 0;
}

function runBackendCli(args: string[]): number {
    if (args.length === 0) printRunHelp(1);

    const parsed = parseRunArgs(args);
    if ("error" in parsed) {
        console.error(`error: ${parsed.error}`);
        return 1;
    }
    const { options, inputFile } = parsed;

    if (!inputFile) {
        console.error("error: no input file specified for run");
        return 1;
    }
    if (options.traceOutPath && !options.trace) {
        console.error("error: --trace-out requires --trace");
        return 1;
    }
    if (options.codegenWasm && options.trace) {
        console.error("error: --trace is not supported with --codegen-wasm");
        return 1;
    }

    const source = readSourceFile(inputFile);
    const binaryResult = compileFileToBinary(inputFile, { validate: options.validate });
    if (!binaryResult.ok) {
        printDiagnostics(binaryResult.errors, inputFile, source);
        return 1;
    }
    if (!binaryResult.bytes) {
        console.error("error: binary IR serialization produced no bytes");
        return 1;
    }

    if (options.outBin) {
        const writeResult = writeFileAtomic(options.outBin, binaryResult.bytes);
        if (!writeResult.ok) {
            console.error(`error: ${writeResult.message}`);
            return 1;
        }
    }

    return executeAndReport(binaryResult.bytes, options);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
    const args = process.argv.slice(2);
    let exitCode: number;
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
