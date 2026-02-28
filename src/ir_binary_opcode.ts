import { IRInstKind } from "./ir";

const BINARY_INST_KIND_BY_IR_KIND = Object.freeze({
    [IRInstKind.Iconst]: 0,
    [IRInstKind.Fconst]: 1,
    [IRInstKind.Bconst]: 2,
    [IRInstKind.Null]: 3,
    [IRInstKind.Iadd]: 4,
    [IRInstKind.Isub]: 5,
    [IRInstKind.Imul]: 6,
    [IRInstKind.Idiv]: 7,
    [IRInstKind.Imod]: 8,
    [IRInstKind.Fadd]: 9,
    [IRInstKind.Fsub]: 10,
    [IRInstKind.Fmul]: 11,
    [IRInstKind.Fdiv]: 12,
    [IRInstKind.Ineg]: 13,
    [IRInstKind.Fneg]: 14,
    [IRInstKind.Iand]: 15,
    [IRInstKind.Ior]: 16,
    [IRInstKind.Ixor]: 17,
    [IRInstKind.Ishl]: 18,
    [IRInstKind.Ishr]: 19,
    [IRInstKind.Icmp]: 20,
    [IRInstKind.Fcmp]: 21,
    [IRInstKind.Alloca]: 22,
    [IRInstKind.Load]: 23,
    [IRInstKind.Store]: 24,
    [IRInstKind.Memcpy]: 25,
    [IRInstKind.Gep]: 26,
    [IRInstKind.Ptradd]: 27,
    [IRInstKind.Trunc]: 28,
    [IRInstKind.Sext]: 29,
    [IRInstKind.Zext]: 30,
    [IRInstKind.Fptoui]: 31,
    [IRInstKind.Fptosi]: 32,
    [IRInstKind.Uitofp]: 33,
    [IRInstKind.Sitofp]: 34,
    [IRInstKind.Bitcast]: 35,
    [IRInstKind.Call]: 36,
    [IRInstKind.StructCreate]: 37,
    [IRInstKind.StructGet]: 38,
    [IRInstKind.EnumCreate]: 39,
    [IRInstKind.EnumGetTag]: 40,
    [IRInstKind.EnumGetData]: 41,
    [IRInstKind.Sconst]: 42,
    [IRInstKind.CallDyn]: 43,
} satisfies Record<IRInstKind, number>);

const IR_KIND_BY_BINARY_INST_KIND = new Map<number, IRInstKind>(
    Object.entries(BINARY_INST_KIND_BY_IR_KIND).map(([kind, opcode]) => [
        opcode,
        Number(kind) as IRInstKind,
    ]),
);

function toBinaryInstKind(kind: IRInstKind): number {
    return BINARY_INST_KIND_BY_IR_KIND[kind];
}

function fromBinaryInstKind(opcode: number): IRInstKind | undefined {
    return IR_KIND_BY_BINARY_INST_KIND.get(opcode);
}

export { fromBinaryInstKind, toBinaryInstKind };
