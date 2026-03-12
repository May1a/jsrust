import {
    BrIfTerm,
    BrTerm,
    SwitchTerm,
    type IRFunction,
    type IRTerm,
} from "./ir";

export interface IRValidationError {
    message: string;
}

export interface IRValidationResult {
    ok: boolean;
    errors?: IRValidationError[];
}

function blockIdsOf(fn: IRFunction): Set<number> {
    const ids = new Set<number>();
    for (const block of fn.blocks) {
        ids.add(block.id);
    }
    return ids;
}

function validateTerminator(
    fn: IRFunction,
    term: IRTerm,
    ids: Set<number>,
): IRValidationError[] {
    const errors: IRValidationError[] = [];

    if (term instanceof BrTerm) {
        if (!ids.has(term.target)) {
            errors.push({
                message: `Branch target block ${term.target} does not exist in function ${fn.name}`,
            });
        }
        return errors;
    }

    if (term instanceof BrIfTerm) {
        if (!ids.has(term.thenBranch)) {
            errors.push({
                message: `Conditional then block ${term.thenBranch} does not exist in function ${fn.name}`,
            });
        }
        if (!ids.has(term.elseBranch)) {
            errors.push({
                message: `Conditional else block ${term.elseBranch} does not exist in function ${fn.name}`,
            });
        }
        return errors;
    }

    if (term instanceof SwitchTerm) {
        if (!ids.has(term.defaultBranch)) {
            errors.push({
                message: `Switch default block ${term.defaultBranch} does not exist in function ${fn.name}`,
            });
        }
        for (const entry of term.cases) {
            if (!ids.has(entry.target)) {
                errors.push({
                    message: `Switch case target ${entry.target} does not exist in function ${fn.name}`,
                });
            }
        }
    }

    return errors;
}

export function validateFunction(fn: IRFunction): IRValidationResult {
    const errors: IRValidationError[] = [];

    if (!fn.entry) {
        errors.push({ message: `Function ${fn.name} has no entry block` });
    }

    const ids = blockIdsOf(fn);
    for (const block of fn.blocks) {
        if (!block.terminator) {
            continue;
        }
        errors.push(...validateTerminator(fn, block.terminator, ids));
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true };
}
