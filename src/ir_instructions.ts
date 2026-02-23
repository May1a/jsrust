import { IRInstKind, freshValueId, makeIRPtrType } from "./ir";
import type {
    ValueId,
    LocalId,
    IRType,
    IRInst,
    IcmpOpValue,
    FcmpOpValue,
    IRInstKindValue,
    IntWidthValue,
    FloatWidthValue,
} from "./ir";

export function makeIRInst(kind: IRInstKindValue, id: ValueId | null, ty: IRType): IRInst {
    return { kind, id, ty } as IRInst;
}

export function makeIconst(value: number, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iconst,
        id,
        ty: { kind: 0, width },
        value,
    } as IRInst;
}

export function makeFconst(value: number, width: FloatWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fconst,
        id,
        ty: { kind: 1, width },
        value,
    } as IRInst;
}

export function makeBconst(value: boolean): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Bconst,
        id,
        ty: { kind: 2 },
        value,
    } as IRInst;
}

export function makeNull(ty: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Null,
        id,
        ty: { kind: 3, inner: ty },
    } as IRInst;
}

export function makeIadd(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iadd,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIsub(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Isub,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeImul(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Imul,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIdiv(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Idiv,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeImod(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Imod,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeFadd(a: ValueId, b: ValueId, width: FloatWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fadd,
        id,
        ty: { kind: 1, width },
        a,
        b,
    } as IRInst;
}

export function makeFsub(a: ValueId, b: ValueId, width: FloatWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fsub,
        id,
        ty: { kind: 1, width },
        a,
        b,
    } as IRInst;
}

export function makeFmul(a: ValueId, b: ValueId, width: FloatWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fmul,
        id,
        ty: { kind: 1, width },
        a,
        b,
    } as IRInst;
}

export function makeFdiv(a: ValueId, b: ValueId, width: FloatWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fdiv,
        id,
        ty: { kind: 1, width },
        a,
        b,
    } as IRInst;
}

export function makeIneg(a: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ineg,
        id,
        ty: { kind: 0, width },
        a,
    } as IRInst;
}

export function makeFneg(a: ValueId, width: FloatWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fneg,
        id,
        ty: { kind: 1, width },
        a,
    } as IRInst;
}

export function makeIand(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iand,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIor(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ior,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIxor(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ixor,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIshl(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ishl,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIshr(a: ValueId, b: ValueId, width: IntWidthValue): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ishr,
        id,
        ty: { kind: 0, width },
        a,
        b,
    } as IRInst;
}

export function makeIcmp(op: IcmpOpValue, a: ValueId, b: ValueId): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Icmp,
        id,
        ty: { kind: 2 },
        op,
        a,
        b,
    } as IRInst;
}

export function makeFcmp(op: FcmpOpValue, a: ValueId, b: ValueId): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fcmp,
        id,
        ty: { kind: 2 },
        op,
        a,
        b,
    } as IRInst;
}

export function makeAlloca(ty: IRType, localId: LocalId | null): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Alloca,
        id,
        ty: { kind: 3, inner: ty },
        localId,
    } as IRInst;
}

export function makeLoad(ptr: ValueId, ty: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Load,
        id,
        ty,
        ptr,
    } as IRInst;
}

export function makeStore(ptr: ValueId, value: ValueId, ty: IRType): IRInst {
    return {
        kind: IRInstKind.Store,
        id: null,
        ty: { kind: 4 },
        ptr,
        value,
        valueType: ty,
    } as IRInst;
}

export function makeMemcpy(dest: ValueId, src: ValueId, size: ValueId): IRInst {
    return {
        kind: IRInstKind.Memcpy,
        id: null,
        ty: { kind: 4 },
        dest,
        src,
        size,
    } as IRInst;
}

export function makeGep(ptr: ValueId, indices: ValueId[], resultTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Gep,
        id,
        ty: makeIRPtrType(resultTy),
        ptr,
        indices,
    } as IRInst;
}

export function makePtradd(ptr: ValueId, offset: ValueId): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ptradd,
        id,
        ty: { kind: 3 },
        ptr,
        offset,
    } as IRInst;
}

export function makeTrunc(val: ValueId, fromTy: IRType, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Trunc,
        id,
        ty: toTy,
        val,
        fromTy,
    } as IRInst;
}

export function makeSext(val: ValueId, fromTy: IRType, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sext,
        id,
        ty: toTy,
        val,
        fromTy,
    } as IRInst;
}

export function makeZext(val: ValueId, fromTy: IRType, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Zext,
        id,
        ty: toTy,
        val,
        fromTy,
    } as IRInst;
}

export function makeFptoui(val: ValueId, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fptoui,
        id,
        ty: toTy,
        val,
    } as IRInst;
}

export function makeFptosi(val: ValueId, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fptosi,
        id,
        ty: toTy,
        val,
    } as IRInst;
}

export function makeUitofp(val: ValueId, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Uitofp,
        id,
        ty: toTy,
        val,
    } as IRInst;
}

export function makeSitofp(val: ValueId, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sitofp,
        id,
        ty: toTy,
        val,
    } as IRInst;
}

export function makeBitcast(val: ValueId, toTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Bitcast,
        id,
        ty: toTy,
        val,
    } as IRInst;
}

export function makeCall(fn: ValueId, args: ValueId[], returnType: IRType | null): IRInst {
    const id = returnType ? freshValueId() : null;
    return {
        kind: IRInstKind.Call,
        id,
        ty: returnType ?? { kind: 4 },
        fn,
        args,
    } as IRInst;
}

export function makeCallDyn(fn: ValueId, args: ValueId[], returnType: IRType | null): IRInst {
    const id = returnType ? freshValueId() : null;
    return {
        kind: IRInstKind.CallDyn,
        id,
        ty: returnType ?? { kind: 4 },
        fn,
        args,
    } as IRInst;
}

export function makeStructCreate(fields: ValueId[], ty: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.StructCreate,
        id,
        ty,
        fields,
    } as IRInst;
}

export function makeStructGet(struct: ValueId, fieldIndex: number, fieldTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.StructGet,
        id,
        ty: fieldTy,
        struct,
        fieldIndex,
    } as IRInst;
}

export function makeEnumCreate(variant: number, data: ValueId | null, ty: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumCreate,
        id,
        ty,
        variant,
        data,
    } as IRInst;
}

export function makeEnumGetTag(enum_: ValueId): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumGetTag,
        id,
        ty: { kind: 0, width: 6 },
        enum: enum_,
    } as IRInst;
}

export function makeEnumGetData(enum_: ValueId, variant: number, index: number, dataTy: IRType): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumGetData,
        id,
        ty: dataTy,
        enum: enum_,
        variant,
        index,
    } as IRInst;
}

export function makeSconst(literalId: number): IRInst {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sconst,
        id,
        ty: { kind: 3, inner: null },
        literalId,
    } as IRInst;
}

export function isIRInst(node: any): boolean {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= IRInstKind.Iconst &&
        node.kind <= IRInstKind.CallDyn
    );
}
