/** @typedef {number} ValueId */
/** @typedef {number} BlockId */
/** @typedef {number} FunctionId */
/** @typedef {number} LocalId */
/** @typedef {number} IRTypeKindValue */
/** @typedef {number} IRInstKindValue */
/** @typedef {number} IRTermKindValue */
/** @typedef {number} IntWidthValue */
/** @typedef {number} FloatWidthValue */
/** @typedef {number} IcmpOpValue */
/** @typedef {number} FcmpOpValue */

/**
 * @typedef {{
 *   kind: IRTypeKindValue,
 *   width?: number,
 *   inner?: IRType | null,
 *   name?: string,
 *   fields?: IRType[],
 *   variants?: IRType[][],
 *   element?: IRType,
 *   length?: number,
 *   params?: IRType[],
 *   returnType?: IRType,
 * }} IRType
 */

/**
 * @typedef {{
 *   kind: IRInstKindValue,
 *   id: ValueId | null,
 *   ty: IRType,
 *   [key: string]: any,
 * }} IRInst
 */

/**
 * @typedef {{
 *   kind: IRTermKindValue,
 *   [key: string]: any,
 * }} IRTerm
 */

/**
 * @typedef {{
 *   id: BlockId,
 *   name?: string,
 *   params: Array<{ id: ValueId, ty: IRType }>,
 *   instructions: IRInst[],
 *   terminator: IRTerm | null,
 *   predecessors: BlockId[],
 *   successors: BlockId[],
 * }} IRBlock
 */

/**
 * @typedef {{
 *   id: FunctionId,
 *   name: string,
 *   params: Array<{ id: ValueId, name: string | null, ty: IRType }>,
 *   returnType: IRType,
 *   blocks: IRBlock[],
 *   locals: IRLocal[],
 *   entry: IRBlock | null,
 * }} IRFunction
 */

/**
 * @typedef {{
 *   id: LocalId,
 *   ty: IRType,
 *   name: string | null,
 * }} IRLocal
 */

/**
 * @typedef {{
 *   name: string,
 *   functions: IRFunction[],
 *   globals: Array<{ name: string, ty: IRType, init?: any }>,
 *   structs: Map<string, any>,
 *   enums: Map<string, any>,
 *   stringLiterals: string[],
 *   stringLiteralIds: Map<string, number>,
 * }} IRModule
 */

import { IntWidth, FloatWidth } from "./types";

const IRTypeKind = {
    Int: 0,
    Float: 1,
    Bool: 2,
    Ptr: 3,
    Unit: 4,
    Struct: 5,
    Enum: 6,
    Array: 7,
    Fn: 8,
};

const IRInstKind = {
    Iconst: 0,
    Fconst: 1,
    Bconst: 2,
    Null: 3,
    Iadd: 4,
    Isub: 5,
    Imul: 6,
    Idiv: 7,
    Imod: 8,
    Fadd: 9,
    Fsub: 10,
    Fmul: 11,
    Fdiv: 12,
    Ineg: 13,
    Fneg: 14,
    Iand: 15,
    Ior: 16,
    Ixor: 17,
    Ishl: 18,
    Ishr: 19,
    Icmp: 20,
    Fcmp: 21,
    Alloca: 22,
    Load: 23,
    Store: 24,
    Memcpy: 25,
    Gep: 26,
    Ptradd: 27,
    Trunc: 28,
    Sext: 29,
    Zext: 30,
    Fptoui: 31,
    Fptosi: 32,
    Uitofp: 33,
    Sitofp: 34,
    Bitcast: 35,
    Call: 36,
    StructCreate: 37,
    StructGet: 38,
    EnumCreate: 39,
    EnumGetTag: 40,
    EnumGetData: 41,
    Sconst: 42,
    CallDyn: 43,
};

const IRTermKind = {
    Ret: 0,
    Br: 1,
    BrIf: 2,
    Switch: 3,
    Unreachable: 4,
};

const IcmpOp = {
    Eq: 0,
    Ne: 1,
    Slt: 2,
    Sle: 3,
    Sgt: 4,
    Sge: 5,
    Ult: 6,
    Ule: 7,
    Ugt: 8,
    Uge: 9,
};

const FcmpOp = {
    Oeq: 0,
    One: 1,
    Olt: 2,
    Ole: 3,
    Ogt: 4,
    Oge: 5,
};

let nextValueId = 0;
let nextBlockId = 0;
let nextFunctionId = 0;
let nextLocalId = 0;

function resetIRIds() {
    nextValueId = 0;
    nextBlockId = 0;
    nextFunctionId = 0;
    nextLocalId = 0;
}

/** @returns {ValueId} */
function freshValueId() {
    return nextValueId++;
}

/** @returns {BlockId} */
function freshBlockId() {
    return nextBlockId++;
}

/** @returns {FunctionId} */
function freshFunctionId() {
    return nextFunctionId++;
}

/** @returns {LocalId} */
function freshLocalId() {
    return nextLocalId++;
}

/**
 * @param {IntWidthValue} width
 * @returns {IRType}
 */
function makeIRIntType(width) {
    return { kind: IRTypeKind.Int, width };
}

/**
 * @param {FloatWidthValue} width
 * @returns {IRType}
 */
function makeIRFloatType(width) {
    return { kind: IRTypeKind.Float, width };
}

/** @returns {IRType} */
function makeIRBoolType() {
    return { kind: IRTypeKind.Bool };
}

/**
 * @param {IRType | null} inner
 * @returns {IRType}
 */
function makeIRPtrType(inner) {
    return { kind: IRTypeKind.Ptr, inner };
}

/** @returns {IRType} */
function makeIRUnitType() {
    return { kind: IRTypeKind.Unit };
}

/**
 * @param {string} name
 * @param {IRType[]} fields
 * @returns {IRType}
 */
function makeIRStructType(name, fields) {
    return { kind: IRTypeKind.Struct, name, fields };
}

/**
 * @param {string} name
 * @param {IRType[][]} variants
 * @returns {IRType}
 */
function makeIREnumType(name, variants) {
    return { kind: IRTypeKind.Enum, name, variants };
}

/**
 * @param {IRType} element
 * @param {number} length
 * @returns {IRType}
 */
function makeIRArrayType(element, length) {
    return { kind: IRTypeKind.Array, element, length };
}

/**
 * @param {IRType[]} params
 * @param {IRType} returnType
 * @returns {IRType}
 */
function makeIRFnType(params, returnType) {
    return { kind: IRTypeKind.Fn, params, returnType };
}

/**
 * @param {IRType} a
 * @param {IRType} b
 * @returns {boolean}
 */
function irTypeEquals(a, b) {
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
        case IRTypeKind.Int:
            return a.width === b.width;
        case IRTypeKind.Float:
            return a.width === b.width;
        case IRTypeKind.Bool:
        case IRTypeKind.Ptr:
        case IRTypeKind.Unit:
            return true;
        case IRTypeKind.Struct: {
            if (a.name !== b.name) return false;
            if ((a.fields?.length ?? 0) !== (b.fields?.length ?? 0)) return false;
            for (let i = 0; i < (a.fields?.length ?? 0); i++) {
                if (!irTypeEquals(/** @type {IRType} */(a.fields?.[i]), /** @type {IRType} */(b.fields?.[i]))) return false;
            }
            return true;
        }
        case IRTypeKind.Enum: {
            if (a.name !== b.name) return false;
            if ((a.variants?.length ?? 0) !== (b.variants?.length ?? 0)) return false;
            for (let i = 0; i < (a.variants?.length ?? 0); i++) {
                const av = /** @type {IRType[]} */ (a.variants?.[i] ?? []);
                const bv = /** @type {IRType[]} */ (b.variants?.[i] ?? []);
                if (av.length !== bv.length) return false;
                for (let j = 0; j < av.length; j++) {
                    if (!irTypeEquals(av[j], bv[j]))
                        return false;
                }
            }
            return true;
        }
        case IRTypeKind.Array:
            return a.length === b.length && irTypeEquals(/** @type {IRType} */(a.element), /** @type {IRType} */(b.element));
        case IRTypeKind.Fn: {
            if ((a.params?.length ?? 0) !== (b.params?.length ?? 0)) return false;
            for (let i = 0; i < (a.params?.length ?? 0); i++) {
                if (!irTypeEquals(/** @type {IRType} */(a.params?.[i]), /** @type {IRType} */(b.params?.[i]))) return false;
            }
            return irTypeEquals(/** @type {IRType} */(a.returnType), /** @type {IRType} */(b.returnType));
        }
        default:
            return false;
    }
}

/**
 * @param {IRType} type
 * @returns {string}
 */
function irTypeToString(type) {
    switch (type.kind) {
        case IRTypeKind.Int:
            return intWidthToString(/** @type {IntWidthValue} */(type.width));
        case IRTypeKind.Float:
            return floatWidthToString(/** @type {FloatWidthValue} */(type.width));
        case IRTypeKind.Bool:
            return "bool";
        case IRTypeKind.Ptr:
            return type.inner ? `*${irTypeToString(type.inner)}` : "ptr";
        case IRTypeKind.Unit:
            return "()";
        case IRTypeKind.Struct:
            return type.name ?? "<struct>";
        case IRTypeKind.Enum:
            return type.name ?? "<enum>";
        case IRTypeKind.Array:
            return `[${irTypeToString(/** @type {IRType} */(type.element))}; ${type.length}]`;
        case IRTypeKind.Fn: {
            const params = (type.params ?? []).map(irTypeToString).join(", ");
            return `fn(${params}) -> ${irTypeToString(/** @type {IRType} */(type.returnType))}`;
        }
        default:
            return "<unknown>";
    }
}

/**
 * @param {IntWidthValue} width
 * @returns {string}
 */
function intWidthToString(width) {
    switch (width) {
        case IntWidth.I8:
            return "i8";
        case IntWidth.I16:
            return "i16";
        case IntWidth.I32:
            return "i32";
        case IntWidth.I64:
            return "i64";
        case IntWidth.I128:
            return "i128";
        case IntWidth.Isize:
            return "isize";
        case IntWidth.U8:
            return "u8";
        case IntWidth.U16:
            return "u16";
        case IntWidth.U32:
            return "u32";
        case IntWidth.U64:
            return "u64";
        case IntWidth.U128:
            return "u128";
        case IntWidth.Usize:
            return "usize";
        default:
            return "<unknown int>";
    }
}

/**
 * @param {FloatWidthValue} width
 * @returns {string}
 */
function floatWidthToString(width) {
    switch (width) {
        case FloatWidth.F32:
            return "f32";
        case FloatWidth.F64:
            return "f64";
        default:
            return "<unknown float>";
    }
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRIntType(type) {
    return type.kind === IRTypeKind.Int;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRFloatType(type) {
    return type.kind === IRTypeKind.Float;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRBoolType(type) {
    return type.kind === IRTypeKind.Bool;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRPtrType(type) {
    return type.kind === IRTypeKind.Ptr;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRUnitType(type) {
    return type.kind === IRTypeKind.Unit;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRStructType(type) {
    return type.kind === IRTypeKind.Struct;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIREnumType(type) {
    return type.kind === IRTypeKind.Enum;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRArrayType(type) {
    return type.kind === IRTypeKind.Array;
}

/**
 * @param {IRType} type
 * @returns {boolean}
 */
function isIRFnType(type) {
    return type.kind === IRTypeKind.Fn;
}

/**
 * @param {string} name
 * @param {IRType} ty
 * @param {any} [init]
 * @returns {{ name: string, ty: IRType, init?: any }}
 */
function makeIRGlobal(name, ty, init) {
    return { name, ty, init };
}

/**
 * @param {string} name
 * @returns {IRModule}
 */
function makeIRModule(name) {
    return {
        name,
        functions: [],
        globals: [],
        structs: new Map(),
        enums: new Map(),
        stringLiterals: [],
        stringLiteralIds: new Map(),
    };
}

/**
 * Intern a string literal in the module literal pool and return its stable ID.
 * @param {IRModule} module
 * @param {string} value
 * @returns {number}
 */
function internIRStringLiteral(module, value) {
    const existing = module.stringLiteralIds.get(value);
    if (existing !== undefined) {
        return existing;
    }
    const id = module.stringLiterals.length;
    module.stringLiterals.push(value);
    module.stringLiteralIds.set(value, id);
    return id;
}

/**
 * @param {IRModule} module
 * @param {IRFunction} fn
 */
function addIRFunction(module, fn) {
    module.functions.push(fn);
}

/**
 * @param {IRModule} module
 * @param {{ name: string, ty: IRType, init?: any }} global
 */
function addIRGlobal(module, global) {
    module.globals.push(global);
}

/**
 * @param {IRModule} module
 * @param {string} name
 * @param {any} struct
 */
function addIRStruct(module, name, struct) {
    module.structs.set(name, struct);
}

/**
 * @param {IRModule} module
 * @param {string} name
 * @param {any} enum_
 */
function addIREnum(module, name, enum_) {
    module.enums.set(name, enum_);
}

/**
 * @param {FunctionId} id
 * @param {string} name
 * @param {Array<{ id: ValueId, name: string | null, ty: IRType }>} params
 * @param {IRType} returnType
 * @returns {IRFunction}
 */
function makeIRFunction(id, name, params, returnType) {
    return {
        id,
        name,
        params,
        returnType,
        blocks: [],
        locals: [],
        entry: null,
    };
}

/**
 * @param {ValueId} id
 * @param {string | null} name
 * @param {IRType} ty
 * @returns {{ id: ValueId, name: string | null, ty: IRType }}
 */
function makeIRParam(id, name, ty) {
    return { id, name, ty };
}

/**
 * @param {IRFunction} fn
 * @param {IRBlock} block
 */
function addIRBlock(fn, block) {
    fn.blocks.push(block);
    if (fn.entry === null) {
        fn.entry = block;
    }
}

/**
 * @param {IRFunction} fn
 * @param {IRLocal} local
 */
function addIRLocal(fn, local) {
    fn.locals.push(local);
}

/**
 * @param {BlockId} id
 * @returns {IRBlock}
 */
function makeIRBlock(id) {
    return {
        id,
        params: [],
        instructions: [],
        terminator: null,
        predecessors: [],
        successors: [],
    };
}

/**
 * @param {IRBlock} block
 * @param {ValueId} id
 * @param {IRType} ty
 */
function addIRBlockParam(block, id, ty) {
    block.params.push({ id, ty });
}

/**
 * @param {IRBlock} block
 * @param {IRInst} inst
 */
function addIRInstruction(block, inst) {
    block.instructions.push(inst);
}

/**
 * @param {IRBlock} block
 * @param {IRTerm} term
 */
function setIRTerminator(block, term) {
    block.terminator = term;
}

/**
 * @param {IRBlock} block
 * @param {BlockId} pred
 */
function addPredecessor(block, pred) {
    if (!block.predecessors.includes(pred)) {
        block.predecessors.push(pred);
    }
}

/**
 * @param {IRBlock} block
 * @param {BlockId} succ
 */
function addSuccessor(block, succ) {
    if (!block.successors.includes(succ)) {
        block.successors.push(succ);
    }
}

/**
 * @param {LocalId} id
 * @param {IRType} ty
 * @param {string | null} [name]
 * @returns {IRLocal}
 */
function makeIRLocal(id, ty, name) {
    return { id, ty, name: name ?? null };
}

export {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    IcmpOp,
    FcmpOp,
    resetIRIds,
    freshValueId,
    freshBlockId,
    freshFunctionId,
    freshLocalId,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,
    irTypeEquals,
    irTypeToString,
    intWidthToString,
    floatWidthToString,
    isIRIntType,
    isIRFloatType,
    isIRBoolType,
    isIRPtrType,
    isIRUnitType,
    isIRStructType,
    isIREnumType,
    isIRArrayType,
    isIRFnType,
    makeIRGlobal,
    makeIRModule,
    addIRFunction,
    addIRGlobal,
    addIRStruct,
    addIREnum,
    internIRStringLiteral,
    makeIRFunction,
    makeIRParam,
    addIRBlock,
    addIRLocal,
    makeIRBlock,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
    addPredecessor,
    addSuccessor,
    makeIRLocal,
};
