import { parseModule } from "../src/parser";
import { TypeContext } from "../src/type_context";
import { inferModule } from "../src/inference";
import { checkBorrowLite } from "../src/borrow";
import { resolveModuleTree } from "../src/module_resolver";
import { expandDerives } from "../src/derive_expand";
import { lowerAstModuleToSsa } from "../src/ast_to_ssa";
import { printModule } from "../src/ir_printer";
import { resetIRIds } from "../src/ir";
import { validateFunction } from "../src/ir_validate";

function joinMessages(errors: readonly { message: string }[]): string {
    return errors.map((error) => error.message).join("; ");
}

function requireResolvedModule(source: string) {
    const parseResult = parseModule(source);
    if (!parseResult.ok) {
        throw new Error(`Parse error: ${joinMessages(parseResult.errors)}`);
    }

    const resolveResult = resolveModuleTree(parseResult.value);
    if (!resolveResult.ok || !resolveResult.module) {
        throw new Error(`Resolve error: ${joinMessages(resolveResult.errors)}`);
    }

    const deriveResult = expandDerives(resolveResult.module);
    if (!deriveResult.ok || !deriveResult.module) {
        throw new Error(`Derive expand error: ${joinMessages(deriveResult.errors)}`);
    }

    return deriveResult.module;
}

function validateTypes(expandedAst: ReturnType<typeof requireResolvedModule>) {
    const typeCtx = new TypeContext();
    const inferResult = inferModule(typeCtx, expandedAst);
    if (!inferResult.ok) {
        throw new Error(`Type inference error: ${joinMessages(inferResult.error.filter(Boolean))}`);
    }

    const borrowResult = checkBorrowLite(expandedAst, typeCtx);
    if (!borrowResult.ok) {
        throw new Error(
            `Borrow check error: ${joinMessages(borrowResult.errors ?? [])}`,
        );
    }

    return typeCtx;
}

function collectValidationErrors(module: ReturnType<typeof lowerAstModuleToSsa>) {
    const validationErrors: string[] = [];
    for (const fn of module.functions) {
        const result = validateFunction(fn);
        if (result.ok) {
            continue;
        }

        for (const error of result.errors ?? []) {
            validationErrors.push(`in function \`${fn.name}\`: ${error.message}`);
        }
    }

    return validationErrors;
}

export function compileToIR(source: string): string {
    resetIRIds();
    const expandedAst = requireResolvedModule(source);
    validateTypes(expandedAst);
    const irModule = lowerAstModuleToSsa(expandedAst);
    const validationErrors = collectValidationErrors(irModule);
    if (validationErrors.length > 0) {
        throw new Error(`IR validation error: ${validationErrors.join("; ")}`);
    }

    return `${printModule(irModule)}\n`;
}
