/**
 * Regenerates all examples/expected/*.ir snapshots from the current compiler output.
 *
 * Usage:
 *   bun run scripts/update-expected.ts
 *
 * Pass one or more filenames to update only specific examples:
 *   bun run scripts/update-expected.ts 05_if_else.rs 06_loops.rs
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseModule } from "../src/parser";
import { TypeContext } from "../src/type_context";
import { inferModule } from "../src/inference";
import { checkBorrowLite } from "../src/borrow";
import { resolveModuleTree } from "../src/module_resolver";
import { expandDerives } from "../src/derive_expand";
import { lowerAstModuleToSsa } from "../src/ast_to_ssa";
import { printModule } from "../src/ir_printer";
import { resetIRIds } from "../src/ir";

const root = resolve(import.meta.dir, "..");
const examplesDir = resolve(root, "examples");
const expectedDir = resolve(examplesDir, "expected");

function compileToIR(source: string): string {
    resetIRIds();

    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        const msgs = parseResult.errors.map((e) => e.message).join("; ");
        throw new Error(`Parse error: ${msgs}`);
    }

    const resolveResult = resolveModuleTree(parseResult.value);
    if (!resolveResult.ok || !resolveResult.module) {
        const msgs = resolveResult.errors
            .map((e) => e.message)
            .join("; ");
        throw new Error(`Resolve error: ${msgs}`);
    }

    const deriveResult = expandDerives(resolveResult.module);
    if (!deriveResult.ok || !deriveResult.module) {
        const msgs = deriveResult.errors
            .map((e) => e.message)
            .join("; ");
        throw new Error(`Derive expand error: ${msgs}`);
    }

    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, deriveResult.module);
    if (!inferResult.ok) {
        const msgs = inferResult.error
            .filter(Boolean)
            .map((e) => e.message)
            .join("; ");
        throw new Error(`Type inference error: ${msgs}`);
    }

    checkBorrowLite(deriveResult.module, typeCtx);

    const irModule = lowerAstModuleToSsa(deriveResult.module);
    return `${printModule(irModule)}\n`;
}

const args = process.argv.slice(2);
const files =
    args.length > 0
        ? args.map((a) => (a.endsWith(".rs") ? a : `${a}.rs`))
        : readdirSync(examplesDir)
              .filter((f) => f.endsWith(".rs"))
              .toSorted();

let updated = 0;
let failed = 0;

for (const file of files) {
    const sourcePath = resolve(examplesDir, file);
    const outPath = resolve(expectedDir, file.replace(".rs", ".ir"));

    let source: string;
    try {
        source = readFileSync(sourcePath, "utf8");
    } catch {
        console.error(`✗ ${file}: source file not found`);
        failed++;
        continue;
    }

    try {
        const ir = compileToIR(source);
        writeFileSync(outPath, ir);
        console.log(`✓ ${file}`);
        updated++;
    } catch (error) {
        console.error(
            `✗ ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
        failed++;
    }
}

console.log(`\n${updated} updated, ${failed} failed`);
if (failed > 0) throw new Error("Some examples failed to compile");
