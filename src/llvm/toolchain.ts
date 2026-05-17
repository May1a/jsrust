import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Result, TaggedError } from "better-result";
import { match } from "ts-pattern";

const taggedError = TaggedError;

const LlvmToolchainErrorBase = taggedError("LlvmToolchainError")<{
    tool: string;
    message: string;
    status?: number;
    stdout?: string;
    stderr?: string;
    cause?: unknown;
}>();

export class LlvmToolchainError extends LlvmToolchainErrorBase {}

export type LlvmRunResult = {
    stdout: string;
    stderr: string;
    status: number;
};

export type LlvmBuildArtifact = {
    llPath: string;
    bitcodePath: string;
    bitcode: Uint8Array;
};

function toolError(
    tool: string,
    message: string,
    details: Partial<Omit<LlvmToolchainError, "tool" | "message">> = {},
): LlvmToolchainError {
    return new LlvmToolchainError({
        tool,
        message,
        ...details,
    });
}

function commandExists(tool: string): boolean {
    const result = spawnSync(tool, ["--version"], { encoding: "utf8" });
    if (result.error !== undefined) {
        return false;
    }
    return (result.status ?? 1) === 0;
}

export function probeLlvmTools(
    tools: string[] = ["llvm-as", "opt", "lli"],
): Result<void, LlvmToolchainError> {
    for (const tool of tools) {
        if (!commandExists(tool)) {
            return Result.err(
                toolError(
                    tool,
                    `required LLVM tool \`${tool}\` was not found on PATH`,
                ),
            );
        }
    }
    return Result.ok();
}

function writeFile(
    filePath: string,
    content: string | Uint8Array,
): Result<void, LlvmToolchainError> {
    return Result.try({
        try: () => {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        },
        catch: (cause) =>
            toolError("fs", `failed to write ${filePath}`, { cause }),
    });
}

function readBytes(filePath: string): Result<Uint8Array, LlvmToolchainError> {
    return Result.try({
        try: () => fs.readFileSync(filePath),
        catch: (cause) =>
            toolError("fs", `failed to read ${filePath}`, { cause }),
    });
}

function runTool(
    tool: string,
    args: string[],
): Result<LlvmRunResult, LlvmToolchainError> {
    const result = spawnSync(tool, args, { encoding: "utf8" });
    if (result.error !== undefined) {
        return Result.err(
            toolError(tool, result.error.message, { cause: result.error }),
        );
    }
    const status = result.status ?? 1;
    if (status !== 0) {
        return Result.err(
            toolError(tool, `\`${tool}\` exited with status ${String(status)}`, {
                status,
                stdout: result.stdout,
                stderr: result.stderr,
            }),
        );
    }
    return Result.ok({
        stdout: result.stdout,
        stderr: result.stderr,
        status,
    });
}

export function assembleLlvm(
    ll: string,
    outputPrefix: string,
    options: { verify?: boolean } = {},
): Result<LlvmBuildArtifact, LlvmToolchainError> {
    const { verify = true } = options;
    const probe = probeLlvmTools(match(verify).with(true, () => ["llvm-as", "opt"]).otherwise(() => ["llvm-as"]));
    if (probe.isErr()) {
        return Result.err(probe.error);
    }

    const llPath = `${outputPrefix}.ll`;
    const bitcodePath = `${outputPrefix}.bc`;
    return writeFile(llPath, ll)
        .andThen(() => runTool("llvm-as", [llPath, "-o", bitcodePath]))
        .andThen(() =>
            match(verify)
                .with(true, () =>
                    runTool("opt", [
                        "-passes=verify",
                        "-disable-output",
                        bitcodePath,
                    ]),
                )
                .otherwise(() => Result.ok({ stdout: "", stderr: "", status: 0 })),
        )
        .andThen(() => readBytes(bitcodePath))
        .map((bitcode) => ({
            llPath,
            bitcodePath,
            bitcode,
        }));
}

export function runLlvmBitcode(
    bitcodePath: string,
    entry: string,
): Result<LlvmRunResult, LlvmToolchainError> {
    return probeLlvmTools(["lli"]).andThen(() =>
        runTool("lli", [`--entry-function=${entry}`, bitcodePath]),
    );
}

export function writeTempLlvmArtifact(
    ll: string,
    options: { verify?: boolean } = {},
): Result<LlvmBuildArtifact, LlvmToolchainError> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsrust-llvm-"));
    return assembleLlvm(ll, path.join(dir, "module"), options);
}
