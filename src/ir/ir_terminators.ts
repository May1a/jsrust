import {
    type BlockId,
    type IRTerm,
    IRTermKind,
    type ValueId,
    RetTerm,
    BrTerm,
    BrIfTerm,
    SwitchTerm,
    UnreachableTerm,
} from "./ir";

export function makeRet(value?: ValueId): IRTerm {
    return new RetTerm(value);
}

export function makeBr(target: BlockId, args?: ValueId[]): IRTerm {
    return new BrTerm(target, args ?? []);
}

export function makeBrIf(
    cond: ValueId,
    thenBlock: BlockId,
    thenArgs: ValueId[] | undefined,
    elseBlock: BlockId,
    elseArgs: ValueId[] | undefined,
): IRTerm {
    return new BrIfTerm(
        cond,
        thenBlock,
        elseBlock,
        thenArgs ?? [],
        elseArgs ?? [],
    );
}

export interface SwitchCase {
    value: number;
    target: BlockId;
    args: ValueId[];
}

export function makeSwitch(
    value: ValueId,
    cases: SwitchCase[],
    defaultBlock: BlockId,
    defaultArgs?: ValueId[],
): IRTerm {
    return new SwitchTerm(value, defaultBlock, defaultArgs ?? [], cases);
}

export function makeSwitchCase(
    value: number,
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
    return new UnreachableTerm();
}

export function isIRTerminator(node: unknown): node is IRTerm {
    const termKinds = new Set<number>([
        IRTermKind.Ret,
        IRTermKind.Br,
        IRTermKind.BrIf,
        IRTermKind.Switch,
        IRTermKind.Unreachable,
    ]);
    return (
        typeof node === "object" &&
        node !== null &&
        "kind" in node &&
        typeof node.kind === "number" &&
        termKinds.has(node.kind)
    );
}
