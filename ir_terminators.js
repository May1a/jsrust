/** @typedef {import('./ir.js').ValueId} ValueId */
/** @typedef {import('./ir.js').BlockId} BlockId */
/** @typedef {import('./ir.js').IRType} IRType */

import { IRTermKind } from './ir.js';

function makeRet(value) {
    return {
        kind: IRTermKind.Ret,
        value,
    };
}

function makeBr(target, args) {
    return {
        kind: IRTermKind.Br,
        target,
        args: args ?? [],
    };
}

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

function makeSwitch(value, cases, defaultBlock, defaultArgs) {
    return {
        kind: IRTermKind.Switch,
        value,
        cases,
        defaultBlock,
        defaultArgs: defaultArgs ?? [],
    };
}

function makeSwitchCase(value, target, args) {
    return {
        value,
        target,
        args: args ?? [],
    };
}

function makeUnreachable() {
    return {
        kind: IRTermKind.Unreachable,
    };
}

function isIRTerminator(node) {
    return node && typeof node.kind === 'number' && node.kind >= IRTermKind.Ret && node.kind <= IRTermKind.Unreachable;
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
