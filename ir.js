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
/** @typedef {any} IRType */
/** @typedef {any} IRInst */
/** @typedef {any} IRTerm */
/** @typedef {any} IRBlock */
/** @typedef {any} IRFunction */
/** @typedef {any} IRModule */

import { IntWidth, FloatWidth } from "./types.js";

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

function freshValueId() {
    return nextValueId++;
}

function freshBlockId() {
    return nextBlockId++;
}

function freshFunctionId() {
    return nextFunctionId++;
}

function freshLocalId() {
    return nextLocalId++;
}

function makeIRIntType(width) {
    return { kind: IRTypeKind.Int, width };
}

function makeIRFloatType(width) {
    return { kind: IRTypeKind.Float, width };
}

function makeIRBoolType() {
    return { kind: IRTypeKind.Bool };
}

function makeIRPtrType(inner) {
    return { kind: IRTypeKind.Ptr, inner };
}

function makeIRUnitType() {
    return { kind: IRTypeKind.Unit };
}

function makeIRStructType(name, fields) {
    return { kind: IRTypeKind.Struct, name, fields };
}

function makeIREnumType(name, variants) {
    return { kind: IRTypeKind.Enum, name, variants };
}

function makeIRArrayType(element, length) {
    return { kind: IRTypeKind.Array, element, length };
}

function makeIRFnType(params, returnType) {
    return { kind: IRTypeKind.Fn, params, returnType };
}

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
            if (a.fields.length !== b.fields.length) return false;
            for (let i = 0; i < a.fields.length; i++) {
                if (!irTypeEquals(a.fields[i], b.fields[i])) return false;
            }
            return true;
        }
        case IRTypeKind.Enum: {
            if (a.name !== b.name) return false;
            if (a.variants.length !== b.variants.length) return false;
            for (let i = 0; i < a.variants.length; i++) {
                if (a.variants[i].length !== b.variants[i].length) return false;
                for (let j = 0; j < a.variants[i].length; j++) {
                    if (!irTypeEquals(a.variants[i][j], b.variants[i][j]))
                        return false;
                }
            }
            return true;
        }
        case IRTypeKind.Array:
            return a.length === b.length && irTypeEquals(a.element, b.element);
        case IRTypeKind.Fn: {
            if (a.params.length !== b.params.length) return false;
            for (let i = 0; i < a.params.length; i++) {
                if (!irTypeEquals(a.params[i], b.params[i])) return false;
            }
            return irTypeEquals(a.returnType, b.returnType);
        }
        default:
            return false;
    }
}

function irTypeToString(type) {
    switch (type.kind) {
        case IRTypeKind.Int:
            return intWidthToString(type.width);
        case IRTypeKind.Float:
            return floatWidthToString(type.width);
        case IRTypeKind.Bool:
            return "bool";
        case IRTypeKind.Ptr:
            return type.inner ? `*${irTypeToString(type.inner)}` : "ptr";
        case IRTypeKind.Unit:
            return "()";
        case IRTypeKind.Struct:
            return type.name;
        case IRTypeKind.Enum:
            return type.name;
        case IRTypeKind.Array:
            return `[${irTypeToString(type.element)}; ${type.length}]`;
        case IRTypeKind.Fn: {
            const params = type.params.map(irTypeToString).join(", ");
            return `fn(${params}) -> ${irTypeToString(type.returnType)}`;
        }
        default:
            return "<unknown>";
    }
}

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

function isIRIntType(type) {
    return type.kind === IRTypeKind.Int;
}

function isIRFloatType(type) {
    return type.kind === IRTypeKind.Float;
}

function isIRBoolType(type) {
    return type.kind === IRTypeKind.Bool;
}

function isIRPtrType(type) {
    return type.kind === IRTypeKind.Ptr;
}

function isIRUnitType(type) {
    return type.kind === IRTypeKind.Unit;
}

function isIRStructType(type) {
    return type.kind === IRTypeKind.Struct;
}

function isIREnumType(type) {
    return type.kind === IRTypeKind.Enum;
}

function isIRArrayType(type) {
    return type.kind === IRTypeKind.Array;
}

function isIRFnType(type) {
    return type.kind === IRTypeKind.Fn;
}

function makeIRGlobal(name, ty, init) {
    return { name, ty, init };
}

function makeIRModule(name) {
    return {
        name,
        functions: [],
        globals: [],
        structs: new Map(),
        enums: new Map(),
    };
}

function addIRFunction(module, fn) {
    module.functions.push(fn);
}

function addIRGlobal(module, global) {
    module.globals.push(global);
}

function addIRStruct(module, name, struct) {
    module.structs.set(name, struct);
}

function addIREnum(module, name, enum_) {
    module.enums.set(name, enum_);
}

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

function makeIRParam(id, name, ty) {
    return { id, name, ty };
}

function addIRBlock(fn, block) {
    fn.blocks.push(block);
    if (fn.entry === null) {
        fn.entry = block;
    }
}

function addIRLocal(fn, local) {
    fn.locals.push(local);
}

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

function addIRBlockParam(block, id, ty) {
    block.params.push({ id, ty });
}

function addIRInstruction(block, inst) {
    block.instructions.push(inst);
}

function setIRTerminator(block, term) {
    block.terminator = term;
}

function addPredecessor(block, pred) {
    if (!block.predecessors.includes(pred)) {
        block.predecessors.push(pred);
    }
}

function addSuccessor(block, succ) {
    if (!block.successors.includes(succ)) {
        block.successors.push(succ);
    }
}

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
