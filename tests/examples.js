import * as fs from "fs";
import * as path from "path";
import { compile } from "../main";
import { test, assertEqual, assertTrue } from "./lib";

function normalizeNewlines(text) {
    return text.replace(/\r\n/g, "\n");
}

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
 * @param {string} examplesDir
 * @param {string[]} rsFiles
 * @param {boolean} updateExamples
 * @returns {Map<string, string>}
 */
function loadExpectedIrMap(examplesDir, rsFiles, updateExamples) {
    const expectedDir = path.join(examplesDir, "expected");
    const entries = fs.existsSync(expectedDir)
        ? fs.readdirSync(expectedDir, { withFileTypes: true })
        : [];

    const expectedFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ir"))
        .map((entry) => entry.name)
        .sort();

    const expectedMap = new Map();
    for (const irFile of expectedFiles) {
        const rsFile = irFile.replace(/\.ir$/, ".rs");
        const expectedPath = path.join(expectedDir, irFile);
        expectedMap.set(
            rsFile,
            normalizeNewlines(fs.readFileSync(expectedPath, "utf-8")),
        );
    }

    if (!updateExamples) {
        test("Examples: every .rs has expected .ir file", () => {
            const missing = rsFiles.filter((file) => !expectedMap.has(file));
            assertEqual(
                missing.length,
                0,
                `Missing expected IR files for: ${missing.join(", ")}`,
            );
        });

        test("Examples: no orphan expected .ir files", () => {
            const rsSet = new Set(rsFiles);
            const orphans = [...expectedMap.keys()].filter(
                (file) => !rsSet.has(file),
            );
            assertEqual(
                orphans.length,
                0,
                `Orphan expected IR files: ${orphans.join(", ")}`,
            );
        });
    }

    return expectedMap;
}

/**
 * Compile every Rust example in the examples directory.
 * Validation is enabled, and produced IR must match canonical expected files.
 * @param {{ updateExamples?: boolean }} [options={}]
 */
export function runExamplesTests(options = {}) {
    const updateExamples = options.updateExamples === true;
    const examplesDir = path.resolve(process.cwd(), "examples");
    const expectedDir = path.join(examplesDir, "expected");
    const entries = fs.readdirSync(examplesDir, { withFileTypes: true });

    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".rs"))
        .map((entry) => entry.name)
        .sort();

    test("Examples: directory contains .rs files", () => {
        assertTrue(files.length > 0, "No .rs example files found in examples/");
    });

    const expectedMap = loadExpectedIrMap(examplesDir, files, updateExamples);
    let updatedCount = 0;
    if (updateExamples) {
        fs.mkdirSync(expectedDir, { recursive: true });
    }

    for (const file of files) {
        test(`Examples: compile+validate ${file}`, () => {
            const filePath = path.join(examplesDir, file);
            const source = fs.readFileSync(filePath, "utf-8");
            const result = compile(source, {
                validate: true,
                sourcePath: filePath,
            });

            assertEqual(
                result.ok,
                true,
                `Example ${file} failed to compile/validate. Errors: ${result.errors.map((e) => e.message).join(", ")}`,
            );
            assertTrue(result.ir, `Example ${file} should produce IR output`);

            const actual = normalizeNewlines(result.ir || "");
            if (updateExamples) {
                const expectedPath = path.join(
                    expectedDir,
                    file.replace(/\.rs$/, ".ir"),
                );
                const previous = fs.existsSync(expectedPath)
                    ? normalizeNewlines(fs.readFileSync(expectedPath, "utf-8"))
                    : null;
                if (previous !== actual) {
                    fs.writeFileSync(expectedPath, actual);
                    expectedMap.set(file, actual);
                    updatedCount += 1;
                }
                return;
            }

            const expected = expectedMap.get(file);
            assertTrue(
                expected !== undefined,
                `Missing expected IR for ${file}`,
            );
            if (actual !== expected) {
                const line = firstDiffLine(actual, expected);
                const actualLines = actual.split("\n");
                const expectedLines = expected.split("\n");
                const actualLine =
                    line > 0 ? (actualLines[line - 1] ?? "") : "";
                const expectedLine =
                    line > 0 ? (expectedLines[line - 1] ?? "") : "";
                assertEqual(
                    actual,
                    expected,
                    `Example ${file} IR mismatch at line ${line}. Expected: ${JSON.stringify(expectedLine)} Actual: ${JSON.stringify(actualLine)}`,
                );
            }
        });
    }

    if (updateExamples) {
        test("Examples: snapshot update summary", () => {
            console.log(`Examples: updated ${updatedCount} snapshot file(s).`);
            assertTrue(true);
        });
    }
}
