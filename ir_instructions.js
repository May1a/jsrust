/** @typedef {import('./ir.js').ValueId} ValueId */
/** @typedef {import('./ir.js').LocalId} LocalId */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').IRInst} IRInst */
/** @typedef {import('./ir.js').IcmpOpValue} IcmpOpValue */
/** @typedef {import('./ir.js').FcmpOpValue} FcmpOpValue */
/** @typedef {import('./ir.js').IRInstKindValue} IRInstKindValue */
/** @typedef {import('./ir.js').IntWidthValue} IntWidthValue */
/** @typedef {import('./ir.js').FloatWidthValue} FloatWidthValue */

import { IRInstKind, freshValueId } from "./ir.js";

/**
 * @param {IRInstKindValue} kind
 * @param {ValueId | null} id
 * @param {IRType} ty
 * @returns {IRInst}
 */
function makeIRInst(kind, id, ty) {
    return { kind, id, ty };
}

/**
 * @param {number} value
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
function makeIconst(value, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Iconst,
        id,
        ty: { kind: 0, width },
        value,
    };
}

/**
 * @param {number} value
 * @param {FloatWidthValue} width
 * @returns {IRInst}
 */
function makeFconst(value, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fconst,
        id,
        ty: { kind: 1, width },
        value,
    };
}

/**
 * @param {boolean} value
 * @returns {IRInst}
 */
function makeBconst(value) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Bconst,
        id,
        ty: { kind: 2 },
        value,
    };
}

/**
 * @param {IRType} ty
 * @returns {IRInst}
 */
function makeNull(ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Null,
        id,
        ty: { kind: 3, inner: ty },
    };
}

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {FloatWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {FloatWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {FloatWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {FloatWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
function makeIneg(a, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Ineg,
        id,
        ty: { kind: 0, width },
        a,
    };
}

/**
 * @param {ValueId} a
 * @param {FloatWidthValue} width
 * @returns {IRInst}
 */
function makeFneg(a, width) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fneg,
        id,
        ty: { kind: 1, width },
        a,
    };
}

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} a
 * @param {ValueId} b
 * @param {IntWidthValue} width
 * @returns {IRInst}
 */
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

/**
 * @param {IcmpOpValue} op
 * @param {ValueId} a
 * @param {ValueId} b
 * @returns {IRInst}
 */
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

/**
 * @param {FcmpOpValue} op
 * @param {ValueId} a
 * @param {ValueId} b
 * @returns {IRInst}
 */
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

/**
 * @param {IRType} ty
 * @param {LocalId | null} localId
 * @returns {IRInst}
 */
function makeAlloca(ty, localId) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Alloca,
        id,
        ty: { kind: 3, inner: ty },
        localId,
    };
}

/**
 * @param {ValueId} ptr
 * @param {IRType} ty
 * @returns {IRInst}
 */
function makeLoad(ptr, ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Load,
        id,
        ty,
        ptr,
    };
}

/**
 * @param {ValueId} ptr
 * @param {ValueId} value
 * @param {IRType} ty
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} dest
 * @param {ValueId} src
 * @param {ValueId} size
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} ptr
 * @param {ValueId[]} indices
 * @param {IRType} resultTy
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} ptr
 * @param {ValueId} offset
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} val
 * @param {IRType} fromTy
 * @param {IRType} toTy
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} val
 * @param {IRType} fromTy
 * @param {IRType} toTy
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} val
 * @param {IRType} fromTy
 * @param {IRType} toTy
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} val
 * @param {IRType} toTy
 * @returns {IRInst}
 */
function makeFptoui(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fptoui,
        id,
        ty: toTy,
        val,
    };
}

/**
 * @param {ValueId} val
 * @param {IRType} toTy
 * @returns {IRInst}
 */
function makeFptosi(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Fptosi,
        id,
        ty: toTy,
        val,
    };
}

/**
 * @param {ValueId} val
 * @param {IRType} toTy
 * @returns {IRInst}
 */
function makeUitofp(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Uitofp,
        id,
        ty: toTy,
        val,
    };
}

/**
 * @param {ValueId} val
 * @param {IRType} toTy
 * @returns {IRInst}
 */
function makeSitofp(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sitofp,
        id,
        ty: toTy,
        val,
    };
}

/**
 * @param {ValueId} val
 * @param {IRType} toTy
 * @returns {IRInst}
 */
function makeBitcast(val, toTy) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Bitcast,
        id,
        ty: toTy,
        val,
    };
}

/**
 * @param {ValueId} fn
 * @param {ValueId[]} args
 * @param {IRType | null} returnType
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} fn
 * @param {ValueId[]} args
 * @param {IRType | null} returnType
 * @returns {IRInst}
 */
function makeCallDyn(fn, args, returnType) {
    const id = returnType ? freshValueId() : null;
    return {
        kind: IRInstKind.CallDyn,
        id,
        ty: returnType ?? { kind: 4 },
        fn,
        args,
    };
}

/**
 * @param {ValueId[]} fields
 * @param {IRType} ty
 * @returns {IRInst}
 */
function makeStructCreate(fields, ty) {
    const id = freshValueId();
    return {
        kind: IRInstKind.StructCreate,
        id,
        ty,
        fields,
    };
}

/**
 * @param {ValueId} struct
 * @param {number} fieldIndex
 * @param {IRType} fieldTy
 * @returns {IRInst}
 */
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

/**
 * @param {number} variant
 * @param {ValueId | null} data
 * @param {IRType} ty
 * @returns {IRInst}
 */
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

/**
 * @param {ValueId} enum_
 * @returns {IRInst}
 */
function makeEnumGetTag(enum_) {
    const id = freshValueId();
    return {
        kind: IRInstKind.EnumGetTag,
        id,
        ty: { kind: 0, width: 6 },
        enum: enum_,
    };
}

/**
 * @param {ValueId} enum_
 * @param {number} variant
 * @param {number} index
 * @param {IRType} dataTy
 * @returns {IRInst}
 */
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

/**
 * @param {number} literalId
 * @returns {IRInst}
 */
function makeSconst(literalId) {
    const id = freshValueId();
    return {
        kind: IRInstKind.Sconst,
        id,
        ty: { kind: 3, inner: null },
        literalId,
    };
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isIRInst(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= IRInstKind.Iconst &&
        node.kind <= IRInstKind.Sconst
    );
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
    makeCallDyn,
    makeStructCreate,
    makeStructGet,
    makeEnumCreate,
    makeEnumGetTag,
    makeEnumGetData,
    makeSconst,
    isIRInst,
};
