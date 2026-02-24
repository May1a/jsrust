export type ValueId = number;
export type BlockId = number;
export type FunctionId = number;
export type LocalId = number;
type IRTypeKindValue = number;
type IRInstKindValue = number;
type IRTermKindValue = number;

export type IRType = {
    kind: IRTypeKindValue;
    width?: number;
    inner?: IRType | null;
    name?: string;
    fields?: IRType[];
    variants?: IRType[][];
    element?: IRType;
    length?: number;
    params?: IRType[];
    returnType?: IRType;
};

export type IRInst = {
    kind: IRInstKindValue;
    id: ValueId | null;
    ty: IRType;
    [key: string]: any;
};

export type IRTerm = {
    kind: IRTermKindValue;
    [key: string]: any;
};

export type IRBlock = {
    id: BlockId;
    name?: string;
    params: Array<{ id: ValueId; ty: IRType }>;
    instructions: IRInst[];
    terminator: IRTerm | null;
    predecessors: BlockId[];
    successors: BlockId[];
};

export type IRFunction = {
    id: FunctionId;
    name: string;
    params: Array<{ id: ValueId; name: string | null; ty: IRType }>;
    returnType: IRType;
    blocks: IRBlock[];
    locals: IRLocal[];
    entry: IRBlock | null;
};

export type IRLocal = {
    id: LocalId;
    ty: IRType;
    name: string | null;
};

export type IRModule = {
    name: string;
    functions: IRFunction[];
    globals: Array<{ name: string; ty: IRType; init?: any }>;
    structs: Map<string, any>;
    enums: Map<string, any>;
    stringLiterals: string[];
    stringLiteralIds: Map<string, number>;
};

import {
    IntWidth,
    intWidthToString,
    floatWidthToString,
    FloatWidth,
} from "./types";

export enum IRTypeKind {
    Int,
    Float,
    Bool,
    Ptr,
    Unit,
    Struct,
    Enum,
    Array,
    Fn,
}

export enum IRInstKind {
    Iconst,
    Fconst,
    Bconst,
    Null,
    Iadd,
    Isub,
    Imul,
    Idiv,
    Imod,
    Fadd,
    Fsub,
    Fmul,
    Fdiv,
    Ineg,
    Fneg,
    Iand,
    Ior,
    Ixor,
    Ishl,
    Ishr,
    Icmp,
    Fcmp,
    Alloca,
    Load,
    Store,
    Memcpy,
    Gep,
    Ptradd,
    Trunc,
    Sext,
    Zext,
    Fptoui,
    Fptosi,
    Uitofp,
    Sitofp,
    Bitcast,
    Call,
    StructCreate,
    StructGet,
    EnumCreate,
    EnumGetTag,
    EnumGetData,
    Sconst,
    CallDyn,
}

export enum IRTermKind {
    Ret,
    Br,
    BrIf,
    Switch,
    Unreachable,
}

export enum IcmpOp {
    Eq,
    Ne,
    Slt,
    Sle,
    Sgt,
    Sge,
    Ult,
    Ule,
    Ugt,
    Uge,
}

export enum FcmpOp {
    Oeq,
    One,
    Olt,
    Ole,
    Ogt,
    Oge,
}

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

function freshValueId(): ValueId {
    return nextValueId++;
}

function freshBlockId(): BlockId {
    return nextBlockId++;
}

function freshFunctionId(): FunctionId {
    return nextFunctionId++;
}

function freshLocalId(): LocalId {
    return nextLocalId++;
}

function makeIRIntType(width: IntWidth): IRType {
    return { kind: IRTypeKind.Int, width };
}

function makeIRFloatType(width: FloatWidth): IRType {
    return { kind: IRTypeKind.Float, width };
}

function makeIRBoolType(): IRType {
    return { kind: IRTypeKind.Bool };
}

function makeIRPtrType(inner: IRType | null): IRType {
    return { kind: IRTypeKind.Ptr, inner };
}

function makeIRUnitType(): IRType {
    return { kind: IRTypeKind.Unit };
}

function makeIRStructType(name: string, fields: IRType[]): IRType {
    return { kind: IRTypeKind.Struct, name, fields };
}

function makeIREnumType(name: string, variants: IRType[][]): IRType {
    return { kind: IRTypeKind.Enum, name, variants };
}

function makeIRArrayType(element: IRType, length: number): IRType {
    return { kind: IRTypeKind.Array, element, length };
}

function makeIRFnType(params: IRType[], returnType: IRType): IRType {
    return { kind: IRTypeKind.Fn, params, returnType };
}

function irTypeEquals(a: IRType, b: IRType): boolean {
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
            if ((a.fields?.length ?? 0) !== (b.fields?.length ?? 0))
                return false;
            for (let i = 0; i < (a.fields?.length ?? 0); i++) {
                if (!a.fields?.[i] || !b.fields?.[i]) return false;
                if (!irTypeEquals(a.fields[i], b.fields[i])) return false;
            }
            return true;
        }
        case IRTypeKind.Enum: {
            if (a.name !== b.name) return false;
            if ((a.variants?.length ?? 0) !== (b.variants?.length ?? 0))
                return false;
            for (let i = 0; i < (a.variants?.length ?? 0); i++) {
                const av = a.variants?.[i] ?? [];
                const bv = b.variants?.[i] ?? [];
                if (av.length !== bv.length) return false;
                for (let j = 0; j < av.length; j++) {
                    if (!irTypeEquals(av[j], bv[j])) return false;
                }
            }
            return true;
        }
        case IRTypeKind.Array:
            if (!a.element || !b.element) return false;
            return a.length === b.length && irTypeEquals(a.element, b.element);
        case IRTypeKind.Fn: {
            if ((a.params?.length ?? 0) !== (b.params?.length ?? 0))
                return false;
            for (let i = 0; i < (a.params?.length ?? 0); i++) {
                if (!a.params || !b.params || !a.params?.[i] || !b.params?.[i])
                    return false;
                if (!irTypeEquals(a.params[i], b.params[i])) return false;
            }
            if (!a.returnType || !b.returnType) return false;
            return irTypeEquals(a.returnType, b.returnType);
        }
        default:
            return false;
    }
}

function irTypeToString(type: IRType): string {
    switch (type.kind) {
        case IRTypeKind.Int:
            return intWidthToString(type.width as IntWidth);
        case IRTypeKind.Float:
            return floatWidthToString(type.width as FloatWidth);
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
            return `[${irTypeToString(type.element!)}; ${type.length}]`;
        case IRTypeKind.Fn: {
            const params = (type.params ?? []).map(irTypeToString).join(", ");
            return `fn(${params}) -> ${irTypeToString(type.returnType!)}`;
        }
        default:
            return "<unknown>";
    }
}

function isIRIntType(type: IRType): boolean {
    return type.kind === IRTypeKind.Int;
}

function isIRFloatType(type: IRType): boolean {
    return type.kind === IRTypeKind.Float;
}

function isIRBoolType(type: IRType): boolean {
    return type.kind === IRTypeKind.Bool;
}

function isIRPtrType(type: IRType): boolean {
    return type.kind === IRTypeKind.Ptr;
}

function isIRUnitType(type: IRType): boolean {
    return type.kind === IRTypeKind.Unit;
}

function isIRStructType(type: IRType): boolean {
    return type.kind === IRTypeKind.Struct;
}

function isIREnumType(type: IRType): boolean {
    return type.kind === IRTypeKind.Enum;
}

function isIRArrayType(type: IRType): boolean {
    return type.kind === IRTypeKind.Array;
}

function isIRFnType(type: IRType): boolean {
    return type.kind === IRTypeKind.Fn;
}

function makeIRGlobal(
    name: string,
    ty: IRType,
    init: any,
): { name: string; ty: IRType; init?: any } {
    return { name, ty, init };
}

function makeIRModule(name: string): IRModule {
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

function internIRStringLiteral(module: IRModule, value: string): number {
    const existing = module.stringLiteralIds.get(value);
    if (existing !== undefined) {
        return existing;
    }
    const id = module.stringLiterals.length;
    module.stringLiterals.push(value);
    module.stringLiteralIds.set(value, id);
    return id;
}

function addIRFunction(module: IRModule, fn: IRFunction) {
    module.functions.push(fn);
}

function addIRGlobal(
    module: IRModule,
    global: { name: string; ty: IRType; init?: any },
) {
    module.globals.push(global);
}

function addIRStruct(module: IRModule, name: string, struct: any) {
    module.structs.set(name, struct);
}

function addIREnum(module: IRModule, name: string, enum_: any) {
    module.enums.set(name, enum_);
}

function makeIRFunction(
    id: FunctionId,
    name: string,
    params: Array<{ id: ValueId; name: string | null; ty: IRType }>,
    returnType: IRType,
): IRFunction {
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

function makeIRParam(
    id: ValueId,
    name: string | null,
    ty: IRType,
): { id: ValueId; name: string | null; ty: IRType } {
    return { id, name, ty };
}

function addIRBlock(fn: IRFunction, block: IRBlock) {
    fn.blocks.push(block);
    if (fn.entry === null) {
        fn.entry = block;
    }
}

function addIRLocal(fn: IRFunction, local: IRLocal) {
    fn.locals.push(local);
}

function makeIRBlock(id: BlockId): IRBlock {
    return {
        id,
        params: [],
        instructions: [],
        terminator: null,
        predecessors: [],
        successors: [],
    };
}

function addIRBlockParam(block: IRBlock, id: ValueId, ty: IRType) {
    block.params.push({ id, ty });
}

function addIRInstruction(block: IRBlock, inst: IRInst) {
    block.instructions.push(inst);
}

function setIRTerminator(block: IRBlock, term: IRTerm) {
    block.terminator = term;
}

function addPredecessor(block: IRBlock, pred: BlockId) {
    if (!block.predecessors.includes(pred)) {
        block.predecessors.push(pred);
    }
}

function addSuccessor(block: IRBlock, succ: BlockId) {
    if (!block.successors.includes(succ)) {
        block.successors.push(succ);
    }
}

function makeIRLocal(id: LocalId, ty: IRType, name: string | null): IRLocal {
    return { id, ty, name: name ?? null };
}

export {
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
