import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { compileToIR } from "./helpers";
import {
    compileFileToBinary,
    discoverTestFunctions,
    formatCompileError,
} from "../src/compile";
import {
    runBackendWasm,
    canRunBackendIntegrationTests,
} from "../src/backend_runner";

const examplesDir = resolve(import.meta.dir, "../examples");
const expectedDir = resolve(examplesDir, "expected");

function getExpectedIR(file: string): string {
    const expectedFile = file.replace(".rs", ".ir");
    const expectedPath = resolve(expectedDir, expectedFile);

    if (!existsSync(expectedPath)) {
        return "";
    }

    return readFileSync(expectedPath, "utf8");
}

function shouldSkipExample(file: string): boolean {
    return getExpectedIR(file).trim().length === 0;
}

describe("examples", () => {
    const files = readdirSync(examplesDir)
        .filter((f) => f.endsWith(".rs"))
        .toSorted();
    for (const file of files) {
        const expectedContent = getExpectedIR(file);
        if (shouldSkipExample(file)) {
            test.skip(file, () => {
                /* skip test */
            });
            continue;
        }

        test(file, () => {
            const source = readFileSync(resolve(examplesDir, file), "utf8");
            const irResult = compileToIR(source);
            expect(irResult.isOk()).toBe(true);
            if (irResult.isErr()) {
                expect(formatCompileError(irResult.error)).toBe("");
                return;
            }

            expect(irResult.value).toBe(expectedContent);
        });
    }
});

describe("examples runtime", () => {
    const backendCheck = canRunBackendIntegrationTests();
    if (backendCheck.isErr()) {
        test.skip("backend integration unavailable", () => {
            expect(backendCheck.error.message.length).toBeGreaterThan(0);
        });
        return;
    }

    const files = readdirSync(examplesDir)
        .filter((f) => f.endsWith(".rs"))
        .toSorted();

    for (const file of files) {
        const filePath = resolve(examplesDir, file);
        const discoverResult = discoverTestFunctions(filePath);
        if (discoverResult.isErr() || discoverResult.value.length === 0) continue;
        const skipExample = shouldSkipExample(file);

        describe(file, () => {
            let bytes: Uint8Array | undefined;
            let compileError: string | undefined;

            if (!skipExample) {
                const binaryResult = compileFileToBinary(filePath);
                if (binaryResult.isOk()) {
                    ({ bytes } = binaryResult.value);
                } else {
                    compileError = formatCompileError(binaryResult.error);
                }
            }

            for (const testFn of discoverResult.value) {
                if (skipExample) {
                    test.skip(testFn.name, () => {
                        /* skip test */
                    });
                    continue;
                }

                test(testFn.name, () => {
                    expect(compileError).toBeUndefined();
                    expect(bytes).toBeDefined();
                    if (compileError !== undefined || bytes === undefined) return;

                    const runResult = runBackendWasm(bytes, {
                        entry: testFn.name,
                    });
                    expect(runResult.isOk()).toBe(true);
                    if (runResult.isErr()) {
                        expect(runResult.error.message).toBe("");
                    }
                });
            }
        });
    }
});
