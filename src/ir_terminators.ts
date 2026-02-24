import { IRTermKind } from "./ir";
import type { ValueId, BlockId, IRTerm } from "./ir";

export function makeRet(value: ValueId | null): IRTerm {
    return {
        kind: IRTermKind.Ret,
        value,
    };
}

export function makeBr(target: BlockId, args?: ValueId[]): IRTerm {
    return {
        kind: IRTermKind.Br,
        target,
        args: args ?? [],
    };
}

export function makeBrIf(
    cond: ValueId,
    thenBlock: BlockId,
    thenArgs: ValueId[] | undefined,
    elseBlock: BlockId,
    elseArgs: ValueId[] | undefined,
): IRTerm {
    return {
        kind: IRTermKind.BrIf,
        cond,
        thenBlock,
        thenArgs: thenArgs ?? [],
        elseBlock,
        elseArgs: elseArgs ?? [],
    };
}

export type SwitchCase = {
    value: any;
    target: BlockId;
    args: ValueId[];
};

export function makeSwitch(
    value: ValueId,
    cases: SwitchCase[],
    defaultBlock: BlockId,
    defaultArgs?: ValueId[],
): IRTerm {
    return {
        kind: IRTermKind.Switch,
        value,
        cases,
        defaultBlock,
        defaultArgs: defaultArgs ?? [],
    };
}

export function makeSwitchCase(
    value: any,
    target: BlockId,
    args?: ValueId[],
): SwitchCase {
    return {
        value,
        target,
        args: args ?? [],
    };
}

export function makeUnreachable(): IRTerm {
    return {
        kind: IRTermKind.Unreachable,
    };
}

export function isIRTerminator(node: any): node is IRTerm {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= IRTermKind.Ret &&
        node.kind <= IRTermKind.Unreachable
    );
}
