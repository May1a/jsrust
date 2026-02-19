import * as fs from "fs";
import * as path from "path";
import { compile } from "../main.js";
import { test, assertEqual, assertTrue } from "./lib.js";

/**
 * Compile every Rust example in the examples directory.
 */
export function runExamplesTests() {
    const examplesDir = path.resolve(process.cwd(), "examples");
    const entries = fs.readdirSync(examplesDir, { withFileTypes: true });

    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".rs"))
        .map((entry) => entry.name)
        .sort();

    test("Examples: directory contains .rs files", () => {
        assertTrue(files.length > 0, "No .rs example files found in examples/");
    });

    for (const file of files) {
        test(`Examples: compile ${file}`, () => {
            const filePath = path.join(examplesDir, file);
            const source = fs.readFileSync(filePath, "utf-8");
            const result = compile(source, { validate: false });

            assertEqual(
                result.ok,
                true,
                `Example ${file} failed to compile. Errors: ${result.errors.join(", ")}`,
            );
            assertTrue(result.ir, `Example ${file} should produce IR output`);
        });
    }
}
