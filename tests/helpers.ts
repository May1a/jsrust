import * as path from "path";
import * as fs from "fs";
import { parseModule } from "../src/parser";
import type { ModuleNode } from "../src/ast";
import { TypeContext } from "../src/type_context";
import { inferModule } from "../src/inference";
import { checkBorrowLite } from "../src/borrow";
import { resolveModuleTree } from "../src/module_resolver";
import { expandDerives } from "../src/derive_expand";
import { lowerAstModuleToSsa } from "../src/ast_to_ssa";
import { printModule } from "../src/ir_printer";
import { resetIRIds } from "../src/ir";
import { validateFunction } from "../src/ir_validate";

const STDLIB_PATH = path.resolve(import.meta.dir, "../stdlib/vec_core.rs");

const STDLIB_BUILTIN_SOURCE = `pub enum Option<T> {
    None,
    Some(T),
}
`;

function injectStdlibItems(ast: ModuleNode): void {
    const stdlibSource = fs.readFileSync(STDLIB_PATH, "utf-8");
    const stdlibParse = parseModule(`${STDLIB_BUILTIN_SOURCE}\n${stdlibSource}`);
    if (!stdlibParse.ok) {
        const msgs = stdlibParse.errors.map((e) => e.message).join("; ");
        throw new Error(`Failed to parse stdlib: ${msgs}`);
    }
    ast.items = [...(stdlibParse.value.items ?? []), ...(ast.items ?? [])];
}

export function compileToIR(source: string): string {
    resetIRIds();

    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        const msgs = parseResult.errors.map((e) => e.message).join("; ");
        throw new Error(`Parse error: ${msgs}`);
    }

    const ast = parseResult.value;

    injectStdlibItems(ast);

    const resolveResult = resolveModuleTree(ast);
    if (!resolveResult.ok || !resolveResult.module) {
        const msgs = (resolveResult.errors ?? []).map((e) => e.message).join("; ");
        throw new Error(`Resolve error: ${msgs}`);
    }
    const resolvedAst = resolveResult.module;

    const deriveResult = expandDerives(resolvedAst);
    if (!deriveResult.ok || !deriveResult.module) {
        const msgs = (deriveResult.errors ?? []).map((e) => e.message).join("; ");
        throw new Error(`Derive expand error: ${msgs}`);
    }
    const expandedAst = deriveResult.module;

    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, expandedAst);
    if (!inferResult.ok) {
        const msgs = (inferResult.error ?? [])
            .filter(Boolean)
            .map((e) => e.message)
            .join("; ");
        throw new Error(`Type inference error: ${msgs}`);
    }

    const borrowResult = checkBorrowLite(expandedAst, typeCtx);
    if (!borrowResult.ok) {
        const msgs = (borrowResult.errors ?? []).map((e) => e.message).join("; ");
        throw new Error(`Borrow check error: ${msgs}`);
    }

    let irModule;
    try {
        irModule = lowerAstModuleToSsa(expandedAst);
    } catch (e) {
        throw new Error(
            `SSA lowering error: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    const validationErrors: string[] = [];
    for (const fn of irModule.functions) {
        const result = validateFunction(fn);
        if (!result.ok) {
            for (const err of result.errors ?? []) {
                validationErrors.push(`in function \`${fn.name}\`: ${err.message}`);
            }
        }
    }
    if (validationErrors.length > 0) {
        throw new Error(`IR validation error: ${validationErrors.join("; ")}`);
    }

    return printModule(irModule) + "\n";
}
