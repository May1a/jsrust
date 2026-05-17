import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
    compileFileToLlvm,
    discoverTestFunctions,
    formatCompileError,
} from "../src/compile";
import {
    probeLlvmTools,
    runLlvmBitcode,
    writeTempLlvmArtifact,
} from "../src/llvm";

const examplesDir = resolve(import.meta.dir, "../examples");
const exampleFiles = readdirSync(examplesDir)
    .filter((file) => file.endsWith(".rs"))
    .toSorted();
const unsupportedExamples = new Set(["27_vec.rs", "28_comprehensive.rs"]);

describe("examples LLVM IR emission", () => {
    for (const file of exampleFiles) {
        if (unsupportedExamples.has(file)) {
            test.skip(file, () => { /* Vec support is not part of the LLVM pivot. */ });
            continue;
        }

        test(file, () => {
            const result = compileFileToLlvm(resolve(examplesDir, file), {
                validate: true,
            });
            if (result.isErr()) {
                expect(formatCompileError(result.error)).toBe("");
                return;
            }
            expect(result.value.ll).toContain("; JSRust LLVM target = 22.1.5");
            expect(result.value.ll).toContain("define");
        });
    }
});

const llvmProbe = probeLlvmTools();

describe.skipIf(llvmProbe.isErr())("examples execution tests", () => {
    for (const file of exampleFiles) {
        if (unsupportedExamples.has(file)) {
            continue;
        }
        const filePath = resolve(examplesDir, file);
        const discoverResult = discoverTestFunctions(filePath);
        if (discoverResult.isErr() || discoverResult.value.length === 0) {
            continue;
        }

        describe(file, () => {
            for (const testFn of discoverResult.value) {
                test(testFn.name, () => {
                    const compileResult = compileFileToLlvm(filePath, {
                        validate: true,
                    });
                    if (compileResult.isErr()) {
                        expect(formatCompileError(compileResult.error)).toBe("");
                        return;
                    }

                    const artifact = writeTempLlvmArtifact(
                        compileResult.value.ll,
                        { verify: true },
                    );
                    if (artifact.isErr()) {
                        expect(artifact.error.message).toBe("");
                        return;
                    }

                    const runResult = runLlvmBitcode(
                        artifact.value.bitcodePath,
                        testFn.name,
                    );
                    if (runResult.isErr()) {
                        expect(runResult.error.message).toBe("");
                        return;
                    }

                    if (testFn.expectedOutput !== undefined) {
                        expect(runResult.value.stdout).toBe(
                            testFn.expectedOutput,
                        );
                    }
                });
            }
        });
    }
});

describe("expect_output attributes", () => {
    test("discovers expected stdout on test functions", () => {
        const filePath = resolve(examplesDir, "10_hello_world.rs");
        const source = readFileSync(filePath, "utf8");
        expect(source).toContain("#[test]");

        const result = discoverTestFunctions(filePath);
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value[0]?.name).toBe("test_example");
        expect(result.value[0]?.expectedOutput).toBe("Hello, World!\n");
    });
});
