/** @typedef {import('./ir.js').ValueId} ValueId */
/** @typedef {import('./ir.js').BlockId} BlockId */
/** @typedef {import('./ir.js').LocalId} LocalId */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').IcmpOpValue} IcmpOpValue */
/** @typedef {import('./ir.js').FcmpOpValue} FcmpOpValue */

import {
    IRInstKind,
    freshValueId,
} from './ir.js';

function makeIRInst(kind, id, ty) {
    return { kind, id, ty };
}

function makeIconst(value, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iconst,
        id,
        ty: { kind: 0, width },
        value,
    };
}

function makeFconst(value, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fconst,
        id,
        ty: { kind: 1, width },
        value,
    };
}

function makeBconst(value) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Bconst,
        id,
        ty: { kind: 2 },
        value,
    };
}

function makeNull(ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Null,
        id,
        ty: { kind: 3, inner: ty },
    };
}

function makeIadd(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iadd,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIsub(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Isub,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeImul(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Imul,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIdiv(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Idiv,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeImod(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Imod,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeFadd(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fadd,
        id,
        ty: { kind: 1, width },
        a,
        b,
    };
}

function makeFsub(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fsub,
        id,
        ty: { kind: 1, width },
        a,
        b,
    };
}

function makeFmul(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fmul,
        id,
        ty: { kind: 1, width },
        a,
        b,
    };
}

function makeFdiv(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fdiv,
        id,
        ty: { kind: 1, width },
        a,
        b,
    };
}

function makeIneg(a, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ineg,
        id,
        ty: { kind: 0, width },
        a,
    };
}

function makeFneg(a, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fneg,
        id,
        ty: { kind: 1, width },
        a,
    };
}

function makeIand(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iand,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIor(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ior,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIxor(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ixor,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIshl(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ishl,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIshr(a, b, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ishr,
        id,
        ty: { kind: 0, width },
        a,
        b,
    };
}

function makeIcmp(op, a, b) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Icmp,
        id,
        ty: { kind: 2 },
        op,
        a,
        b,
    };
}

function makeFcmp(op, a, b) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fcmp,
        id,
        ty: { kind: 2 },
        op,
        a,
        b,
    };
}

function makeAlloca(ty, localId) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Alloca,
        id,
        ty: { kind: 3, inner: ty },
        localId,
    };
}

function makeLoad(ptr, ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Load,
        id,
        ty,
        ptr,
    };
}

function makeStore(ptr, value, ty) {
    return {
        kind: IRInstKind.Store,
        id: null,
        ty: { kind: 4 },
        ptr,
        value,
        valueType: ty,
    };
}

function makeMemcpy(dest, src, size) {
    return {
        kind: IRInstKind.Memcpy,
        id: null,
        ty: { kind: 4 },
        dest,
        src,
        size,
    };
}

function makeGep(ptr, indices, resultTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Gep,
        id,
        ty: resultTy,
        ptr,
        indices,
    };
}

function makePtradd(ptr, offset) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ptradd,
        id,
        ty: { kind: 3 },
        ptr,
        offset,
    };
}

function makeTrunc(val, fromTy, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Trunc,
        id,
        ty: toTy,
        val,
        fromTy,
    };
}

function makeSext(val, fromTy, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sext,
        id,
        ty: toTy,
        val,
        fromTy,
    };
}

function makeZext(val, fromTy, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Zext,
        id,
        ty: toTy,
        val,
        fromTy,
    };
}

function makeFptoui(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fptoui,
        id,
        ty: toTy,
        val,
    };
}

function makeFptosi(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fptosi,
        id,
        ty: toTy,
        val,
    };
}

function makeUitofp(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Uitofp,
        id,
        ty: toTy,
        val,
    };
}

function makeSitofp(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sitofp,
        id,
        ty: toTy,
        val,
    };
}

function makeBitcast(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Bitcast,
        id,
        ty: toTy,
        val,
    };
}

function makeCall(fn, args, returnType) {
    const id = returnType ? freshValueId() : null;
    return {
        kind: IRInstKind.Call,
        id,
        ty: returnType ?? { kind: 4 },
        fn,
        args,
    };
}

function makeStructCreate(fields, ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.StructCreate,
        id,
        ty,
        fields,
    };
}

function makeStructGet(struct, fieldIndex, fieldTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.StructGet,
        id,
        ty: fieldTy,
        struct,
        fieldIndex,
    };
}

function makeEnumCreate(variant, data, ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumCreate,
        id,
        ty,
        variant,
        data,
    };
}

function makeEnumGetTag(enum_) {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumGetTag,
        id,
        ty: { kind: 0, width: 6 },
        enum: enum_,
    };
}

function makeEnumGetData(enum_, variant, index, dataTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumGetData,
        id,
        ty: dataTy,
        enum: enum_,
        variant,
        index,
    };
}

function isIRInst(node) {
    return node && typeof node.kind === 'number' && node.kind >= IRInstKind.Iconst && node.kind <= IRInstKind.EnumGetData;
}

export {
    makeIRInst,
    makeIconst,
    makeFconst,
    makeBconst,
    makeNull,
    makeIadd,
    makeIsub,
    makeImul,
    makeIdiv,
    makeImod,
    makeFadd,
    makeFsub,
    makeFmul,
    makeFdiv,
    makeIneg,
    makeFneg,
    makeIand,
    makeIor,
    makeIxor,
    makeIshl,
    makeIshr,
    makeIcmp,
    makeFcmp,
    makeAlloca,
    makeLoad,
    makeStore,
    makeMemcpy,
    makeGep,
    makePtradd,
    makeTrunc,
    makeSext,
    makeZext,
    makeFptoui,
    makeFptosi,
    makeUitofp,
    makeSitofp,
    makeBitcast,
    makeCall,
    makeStructCreate,
    makeStructGet,
    makeEnumCreate,
    makeEnumGetTag,
    makeEnumGetData,
    isIRInst,
};
