#!/usr/bin/env bun
import * as path from "node:path";
import { Result, TaggedError } from "better-result";
import { match } from "ts-pattern";
import {
    compileFileToLlvm,
    discoverTestFunctions,
    formatCompileError,
    type CompileFailure,
    type TestFn,
} from "./src/compile";
import {
    runLlvmBitcode,
    writeTempLlvmArtifact,
    type LlvmRunResult,
} from "./src/llvm";

type BuildOptions = {
    inputFile: string;
    outputPrefix: string;
    validate: boolean;
};

type RunOptions = {
    inputFile: string;
    entry: string;
    validate: boolean;
};

const taggedError = TaggedError;

const CliArgErrorBase = taggedError("CliArgError")<{
    message: string;
}>();

class CliArgError extends CliArgErrorBase {}

function printMainHelp(exitCode = 0): never {
    console.log("JSRust Compiler - Rust to LLVM IR");
    console.log("");
    console.log("Usage:");
    console.log("  bun main.ts build <file.rs> [-o <prefix>] [--no-validate]");
    console.log("  bun main.ts run <file.rs> [--entry <fn>] [--no-validate]");
    console.log("  bun main.ts test <file.rs> [--no-validate]");
    console.log("");
    console.log("Build writes <prefix>.ll and <prefix>.bc.");
    process.exit(exitCode);
}

function defaultOutputPrefix(inputFile: string): string {
    const parsed = path.parse(inputFile);
    return path.join("out", parsed.name);
}

function parseBuildArgs(args: string[]): Result<BuildOptions, CliArgError> {
    let inputFile: string | undefined;
    let outputPrefix: string | undefined;
    let validate = true;

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "-h" || arg === "--help") {
            printMainHelp(0);
        } else if (arg === "--no-validate") {
            validate = false;
        } else if (arg === "-o") {
            index++;
            if (index >= args.length) {
                return Result.err(
                    new CliArgError({ message: "missing value for -o" }),
                );
            }
            outputPrefix = args[index];
        } else if (arg.startsWith("-")) {
            return Result.err(
                new CliArgError({ message: `unknown build option: ${arg}` }),
            );
        } else if (inputFile === undefined) {
            inputFile = arg;
        } else {
            return Result.err(
                new CliArgError({
                    message: `unexpected positional argument: ${arg}`,
                }),
            );
        }
    }

    if (inputFile === undefined) {
        return Result.err(new CliArgError({ message: "missing input file" }));
    }

    return Result.ok({
        inputFile,
        outputPrefix: outputPrefix ?? defaultOutputPrefix(inputFile),
        validate,
    });
}

function parseRunArgs(args: string[]): Result<RunOptions, CliArgError> {
    let inputFile: string | undefined;
    let entry = "main";
    let validate = true;

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "-h" || arg === "--help") {
            printMainHelp(0);
        } else if (arg === "--no-validate") {
            validate = false;
        } else if (arg === "--entry") {
            index++;
            if (index >= args.length) {
                return Result.err(
                    new CliArgError({ message: "missing value for --entry" }),
                );
            }
            entry = args[index];
        } else if (arg.startsWith("-")) {
            return Result.err(
                new CliArgError({ message: `unknown run option: ${arg}` }),
            );
        } else if (inputFile === undefined) {
            inputFile = arg;
        } else {
            return Result.err(
                new CliArgError({
                    message: `unexpected positional argument: ${arg}`,
                }),
            );
        }
    }

    if (inputFile === undefined) {
        return Result.err(new CliArgError({ message: "missing input file" }));
    }

    return Result.ok({ inputFile, entry, validate });
}

function printCompileFailure(error: CompileFailure): void {
    console.error(`error: ${formatCompileError(error)}`);
}

function runBuildCli(args: string[]): number {
    const parsed = parseBuildArgs(args);
    if (parsed.isErr()) {
        console.error(`error: ${parsed.error.message}`);
        return 1;
    }

    const options = parsed.value;
    const result = compileFileToLlvm(options.inputFile, {
        emitBitcode: true,
        outputPrefix: options.outputPrefix,
        validate: options.validate,
    });
    if (result.isErr()) {
        printCompileFailure(result.error);
        return 1;
    }

    console.log(`Wrote ${options.outputPrefix}.ll`);
    console.log(`Wrote ${options.outputPrefix}.bc`);
    return 0;
}

function compileAndRun(options: RunOptions): Result<LlvmRunResult, CompileFailure> {
    const compileResult = compileFileToLlvm(options.inputFile, {
        validate: options.validate,
    });
    if (compileResult.isErr()) {
        return Result.err(compileResult.error);
    }

    const artifactResult = writeTempLlvmArtifact(compileResult.value.ll, {
        verify: options.validate,
    });
    if (artifactResult.isErr()) {
        return Result.err({
            tag: "backend",
            phase: "backend",
            kind: "toolchain",
            message: artifactResult.error.message,
            cause: artifactResult.error,
        });
    }

    const runResult = runLlvmBitcode(
        artifactResult.value.bitcodePath,
        options.entry,
    );
    if (runResult.isErr()) {
        return Result.err({
            tag: "backend",
            phase: "backend",
            kind: "toolchain",
            message: runResult.error.message,
            cause: runResult.error,
        });
    }

    return Result.ok(runResult.value);
}

function runRunCli(args: string[]): number {
    const parsed = parseRunArgs(args);
    if (parsed.isErr()) {
        console.error(`error: ${parsed.error.message}`);
        return 1;
    }

    const result = compileAndRun(parsed.value);
    if (result.isErr()) {
        printCompileFailure(result.error);
        return 1;
    }

    process.stdout.write(result.value.stdout);
    process.stderr.write(result.value.stderr);
    return result.value.status;
}

function normalizeNewlines(text: string): string {
    return text.replace(/\r\n/g, "\n");
}

function firstDiffLine(actual: string, expected: string): number {
    const actualLines = actual.split("\n");
    const expectedLines = expected.split("\n");
    const max = Math.max(actualLines.length, expectedLines.length);
    for (let index = 0; index < max; index++) {
        if (actualLines[index] !== expectedLines[index]) {
            return index + 1;
        }
    }
    return -1;
}

function lineAt(text: string, line: number): string {
    if (line < 1) {
        return "";
    }
    return text.split("\n")[line - 1] ?? "";
}

function testResultReason(testFn: TestFn, runResult: LlvmRunResult): string | undefined {
    if (runResult.status !== 0) {
        return `lli exited with status ${String(runResult.status)}`;
    }
    if (testFn.expectedOutput === undefined) {
        return undefined;
    }

    const actual = normalizeNewlines(runResult.stdout);
    const expected = normalizeNewlines(testFn.expectedOutput);
    if (actual === expected) {
        return undefined;
    }

    const line = firstDiffLine(actual, expected);
    return `stdout mismatch at line ${String(line)}\n  expected: ${JSON.stringify(
        lineAt(expected, line),
    )}\n  actual:   ${JSON.stringify(lineAt(actual, line))}`;
}

function reportTest(testFn: TestFn, result: Result<LlvmRunResult, CompileFailure>): boolean {
    if (result.isErr()) {
        console.log(`test ${testFn.name} ... FAILED`);
        console.log(`  ${formatCompileError(result.error)}`);
        return false;
    }

    const reason = testResultReason(testFn, result.value);
    if (reason !== undefined) {
        console.log(`test ${testFn.name} ... FAILED`);
        for (const line of reason.split("\n")) {
            console.log(`  ${line}`);
        }
        return false;
    }

    console.log(`test ${testFn.name} ... ok`);
    return true;
}

function runTestCli(args: string[]): number {
    const parsed = parseRunArgs(args);
    if (parsed.isErr()) {
        console.error(`error: ${parsed.error.message}`);
        return 1;
    }
    const options = parsed.value;

    const discovered = discoverTestFunctions(options.inputFile);
    if (discovered.isErr()) {
        printCompileFailure(discovered.error);
        return 1;
    }
    if (discovered.value.length === 0) {
        console.log("No test functions found.");
        return 0;
    }

    let passed = 0;
    let failed = 0;
    for (const testFn of discovered.value) {
        const result = compileAndRun({
            inputFile: options.inputFile,
            entry: testFn.name,
            validate: options.validate,
        });
        if (reportTest(testFn, result)) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log("");
    const status = match(failed)
        .with(0, () => "ok")
        .otherwise(() => "FAILED");
    console.log(
        `test result: ${status}. ${String(passed)} passed; ${String(failed)} failed; 0 ignored`,
    );
    return match(failed)
        .with(0, () => 0)
        .otherwise(() => 1);
}

function main(): void {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printMainHelp(1);
    }

    const exitCode = match(args[0])
        .with("build", () => runBuildCli(args.slice(1)))
        .with("run", () => runRunCli(args.slice(1)))
        .with("test", () => runTestCli(args.slice(1)))
        .with("-h", "--help", () => printMainHelp(0))
        .otherwise(() => runBuildCli(args));
    process.exit(exitCode);
}

export {
    compileFileToLlvm,
    compileFileToSsaModule,
    compileToLlvm,
    compileToSsaModule,
} from "./src/compile";

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
