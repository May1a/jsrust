/**
 * Regenerates all examples/expected/*.ir snapshots from the current compiler output.
 *
 * Usage:
 *   bun run scripts/update-expected.ts
 *
 * Pass one or more filenames to update only specific examples:
 *   bun run scripts/update-expected.ts 05_if_else.rs 06_loops.rs
 */

import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Result } from "better-result";
import { compileFile, formatCompileError } from "../src/compile";

const root = resolve(import.meta.dir, "..");
const examplesDir = resolve(root, "examples");
const expectedDir = resolve(examplesDir, "expected");

function toExampleFileNames(args: string[]): string[] {
    if (args.length === 0) {
        return readdirSync(examplesDir)
            .filter((fileName) => fileName.endsWith(".rs"))
            .toSorted();
    }

    return args.map((fileName) =>
        fileName.endsWith(".rs") ? fileName : `${fileName}.rs`,
    );
}

function writeExpectedFile(outputPath: string, ir: string) {
    return Result.try({
        try: () => {
            writeFileSync(outputPath, ir);
        },
        catch: (cause) =>
            new Error(
                `failed to write ${outputPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
            ),
    });
}

const args = process.argv.slice(2);
const files = toExampleFileNames(args);

let updated = 0;
let failed = 0;

for (const file of files) {
    const sourcePath = resolve(examplesDir, file);
    const outPath = resolve(expectedDir, file.replace(".rs", ".ir"));
    const compileResult = compileFile(sourcePath);

    if (compileResult.isErr()) {
        console.error(`x ${file}: ${formatCompileError(compileResult.error)}`);
        failed += 1;
        continue;
    }

    const { ir } = compileResult.value;
    if (ir === undefined) {
        console.error(`x ${file}: compiler produced no IR`);
        failed += 1;
        continue;
    }

    const writeResult = writeExpectedFile(outPath, `${ir}\n`);
    if (writeResult.isErr()) {
        console.error(`x ${file}: ${writeResult.error.message}`);
        failed += 1;
        continue;
    }

    console.log(`ok ${file}`);
    updated += 1;
}

console.log(`\n${updated} updated, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
