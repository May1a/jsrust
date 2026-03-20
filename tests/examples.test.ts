import { describe, test, expect, beforeAll } from "bun:test";
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
} from "../src/backend/backend_runner";

const examplesDir = resolve(import.meta.dir, "../examples");
const expectedDir = resolve(examplesDir, "expected");
const exampleFiles = readdirSync(examplesDir)
    .filter((f) => f.endsWith(".rs"))
    .toSorted();

function getExpectedIR(file: string): string {
    const expectedPath = resolve(expectedDir, file.replace(".rs", ".ir"));
    if (!existsSync(expectedPath)) return "";
    return readFileSync(expectedPath, "utf8");
}

describe("examples", () => {
    for (const file of exampleFiles) {
        const expectedContent = getExpectedIR(file);
        if (!expectedContent) {
            test.skip(file, () => { /* no expected IR */ });
            continue;
        }

        test(file, () => {
            const source = readFileSync(resolve(examplesDir, file), "utf8");
            const irResult = compileToIR(source);
            if (irResult.isErr()) {
                expect(formatCompileError(irResult.error)).toBe("");
                return;
            }
            expect(irResult.value).toBe(expectedContent);
        });
    }
});

const backendCheck = canRunBackendIntegrationTests();

describe.skipIf(backendCheck.isErr())("examples runtime", () => {
    for (const file of exampleFiles) {
        const filePath = resolve(examplesDir, file);
        const discoverResult = discoverTestFunctions(filePath);
        if (discoverResult.isErr() || discoverResult.value.length === 0) continue;

        const expectedContent = getExpectedIR(file);

        describe(file, () => {
            let bytes: Uint8Array | undefined;
            let compileError: string | undefined;

            beforeAll(() => {
                if (!expectedContent) return;
                const binaryResult = compileFileToBinary(filePath);
                if (binaryResult.isOk()) {
                    ({ bytes } = binaryResult.value);
                } else {
                    compileError = formatCompileError(binaryResult.error);
                }
            });

            for (const testFn of discoverResult.value) {
                if (!expectedContent) {
                    test.skip(testFn.name, () => { /* no expected IR */ });
                    continue;
                }

                test(testFn.name, () => {
                    if (compileError !== undefined) {
                        expect(compileError).toBe("");
                        return;
                    }
                    expect(bytes).toBeDefined();
                    if (bytes === undefined) return;

                    const runResult = runBackendWasm(bytes, { entry: testFn.name });
                    if (runResult.isErr()) {
                        expect(runResult.error.message).toBe("");
                    }
                });
            }
        });
    }
});
