import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { compileToIR } from "./helpers";
import { discoverTestFunctions, compileFileToBinary } from "../src/compile";
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
            const ir = compileToIR(source);
            expect(ir).toBe(expectedContent);
        });
    }
});

describe("examples runtime", () => {
    const backendCheck = canRunBackendIntegrationTests();
    if (!backendCheck.ok) throw new Error("Backend Failed!");

    const files = readdirSync(examplesDir)
        .filter((f) => f.endsWith(".rs"))
        .toSorted();

    for (const file of files) {
        const filePath = resolve(examplesDir, file);
        const discoverResult = discoverTestFunctions(filePath);
        if (!discoverResult.ok || discoverResult.tests.length === 0) continue;
        const skipExample = shouldSkipExample(file);

        describe(file, () => {
            let bytes: Uint8Array | undefined;
            let compileError: string | undefined;

            if (!skipExample) {
                const binaryResult = compileFileToBinary(filePath);
                if (binaryResult.ok && binaryResult.bytes) {
                    ({ bytes } = binaryResult);
                } else {
                    compileError = binaryResult.errors
                        .map((e) => e.message)
                        .join("; ");
                }
            }

            for (const testFn of discoverResult.tests) {
                if (skipExample) {
                    test.skip(testFn.name, () => {
                        /* skip test */
                    });
                    continue;
                }

                test(testFn.name, () => {
                    if (compileError !== undefined) {
                        throw new Error(`Compilation failed: ${compileError}`);
                    }
                    if (bytes === undefined) {
                        throw new Error("No binary bytes produced");
                    }
                    const runResult = runBackendWasm(bytes, {
                        entry: testFn.name,
                    });
                    if (!runResult.ok) {
                        throw new Error(`Test failed: ${runResult.message}`);
                    }
                });
            }
        });
    }
});
