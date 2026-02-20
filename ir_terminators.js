/** @typedef {import('./ir.js').ValueId} ValueId */
/** @typedef {import('./ir.js').BlockId} BlockId */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').IRTerm} IRTerm */
/** @typedef {import('./ir.js').IRTermKindValue} IRTermKindValue */

import { IRTermKind } from "./ir.js";

/**
 * @param {ValueId | null} value
 * @returns {IRTerm}
 */
function makeRet(value) {
    return {
        kind: IRTermKind.Ret,
        value,
    };
}

/**
 * @param {BlockId} target
 * @param {ValueId[] | undefined} args
 * @returns {IRTerm}
 */
function makeBr(target, args) {
    return {
        kind: IRTermKind.Br,
        target,
        args: args ?? [],
    };
}

/**
 * @param {ValueId} cond
 * @param {BlockId} thenBlock
 * @param {ValueId[] | undefined} thenArgs
 * @param {BlockId} elseBlock
 * @param {ValueId[] | undefined} elseArgs
 * @returns {IRTerm}
 */
function makeBrIf(cond, thenBlock, thenArgs, elseBlock, elseArgs) {
    return {
        kind: IRTermKind.BrIf,
        cond,
        thenBlock,
        thenArgs: thenArgs ?? [],
        elseBlock,
        elseArgs: elseArgs ?? [],
    };
}

/**
 * @param {ValueId} value
 * @param {Array<{ value: any, target: BlockId, args: ValueId[] }>} cases
 * @param {BlockId} defaultBlock
 * @param {ValueId[]} [defaultArgs]
 * @returns {IRTerm}
 */
function makeSwitch(value, cases, defaultBlock, defaultArgs) {
    return {
        kind: IRTermKind.Switch,
        value,
        cases,
        defaultBlock,
        defaultArgs: defaultArgs ?? [],
    };
}

/**
 * @param {any} value
 * @param {BlockId} target
 * @param {ValueId[]} [args]
 * @returns {{ value: any, target: BlockId, args: ValueId[] }}
 */
function makeSwitchCase(value, target, args) {
    return {
        value,
        target,
        args: args ?? [],
    };
}

/** @returns {IRTerm} */
function makeUnreachable() {
    return {
        kind: IRTermKind.Unreachable,
    };
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isIRTerminator(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= IRTermKind.Ret &&
        node.kind <= IRTermKind.Unreachable
    );
}

export {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeSwitchCase,
    makeUnreachable,
    isIRTerminator,
};
