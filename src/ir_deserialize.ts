import { type Result, err, ok } from "./diagnostics";

import {
    AllocaInst,
    BconstInst,
    BitcastInst,
    BrIfTerm,
    BrTerm,
    CallDynInst,
    CallInst,
    EnumCreateInst,
    EnumGetDataInst,
    EnumGetTagInst,
    FaddInst,
    FcmpInst,
    FcmpOp,
    FconstInst,
    FdivInst,
    FmulInst,
    FnegInst,
    FptosiInst,
    FptouiInst,
    FsubInst,
    GepInst,
    IaddInst,
    IandInst,
    IRTermKind,
    IRInstKind,
    IRTypeKind,
    IcmpInst,
    IcmpOp,
    IconstInst,
    IdivInst,
    ImodInst,
    ImulInst,
    InegInst,
    IorInst,
    IshlInst,
    IshrInst,
    IsubInst,
    IxorInst,
    LoadInst,
    MemcpyInst,
    NullInst,
    PtraddInst,
    RetTerm,
    SconstInst,
    SextInst,
    SitofpInst,
    StoreInst,
    StructCreateInst,
    StructGetInst,
    SwitchTerm,
    TruncInst,
    UitofpInst,
    UnreachableTerm,
    ZextInst,
    addIRBlock,
    addIRBlockParam,
    addIREnum,
    addIRFunction,
    addIRGlobal,
    addIRInstruction,
    addIRLocal,
    addIRStruct,
    isIREnumType,
    isIRFloatType,
    isIRFnType,
    isIRIntType,
    isIRPtrType,
    isIRStructType,
    makeIRArrayType,
    makeIRBlock,
    makeIRBoolType,
    makeIREnumType,
    makeIRFloatType,
    makeIRFnType,
    makeIRFunction,
    makeIRIntType,
    makeIRLocal,
    makeIRModule,
    makeIRParam,
    makeIRPtrType,
    makeIRStructType,
    makeIRUnitType,
    setIRTerminator,
    type EnumType,
    type FloatType,
    type IRBlock,
    type IRFunction,
    type IRInst,
    type IRModule,
    type IRTerm,
    type IRType,
    type IntType,
    type StructType,
} from "./ir";

import { MAGIC, VERSION } from "./ir_serialize";

const HEADER_SIZE = 32;
const HEX_RADIX = 16;

const IR_TYPE_KIND_VALUES = new Set<number>([
    IRTypeKind.Int,
    IRTypeKind.Float,
    IRTypeKind.Bool,
    IRTypeKind.Ptr,
    IRTypeKind.Unit,
    IRTypeKind.Struct,
    IRTypeKind.Enum,
    IRTypeKind.Array,
    IRTypeKind.Fn,
]);
const IR_INST_KIND_VALUES = new Set<number>([
    IRInstKind.Iconst,
    IRInstKind.Fconst,
    IRInstKind.Bconst,
    IRInstKind.Null,
    IRInstKind.Sconst,
    IRInstKind.Iadd,
    IRInstKind.Isub,
    IRInstKind.Imul,
    IRInstKind.Idiv,
    IRInstKind.Imod,
    IRInstKind.Fadd,
    IRInstKind.Fsub,
    IRInstKind.Fmul,
    IRInstKind.Fdiv,
    IRInstKind.Ineg,
    IRInstKind.Fneg,
    IRInstKind.Iand,
    IRInstKind.Ior,
    IRInstKind.Ixor,
    IRInstKind.Ishl,
    IRInstKind.Ishr,
    IRInstKind.Icmp,
    IRInstKind.Fcmp,
    IRInstKind.Alloca,
    IRInstKind.Load,
    IRInstKind.Store,
    IRInstKind.Memcpy,
    IRInstKind.Gep,
    IRInstKind.Ptradd,
    IRInstKind.Trunc,
    IRInstKind.Sext,
    IRInstKind.Zext,
    IRInstKind.Fptoui,
    IRInstKind.Fptosi,
    IRInstKind.Uitofp,
    IRInstKind.Sitofp,
    IRInstKind.Bitcast,
    IRInstKind.Call,
    IRInstKind.CallDyn,
    IRInstKind.StructCreate,
    IRInstKind.StructGet,
    IRInstKind.EnumCreate,
    IRInstKind.EnumGetTag,
    IRInstKind.EnumGetData,
]);
const IR_TERM_KIND_VALUES = new Set<number>([
    IRTermKind.Ret,
    IRTermKind.Br,
    IRTermKind.BrIf,
    IRTermKind.Switch,
    IRTermKind.Unreachable,
]);
const ICMP_OP_VALUES = new Set<number>([
    IcmpOp.Eq,
    IcmpOp.Ne,
    IcmpOp.Slt,
    IcmpOp.Sle,
    IcmpOp.Sgt,
    IcmpOp.Sge,
    IcmpOp.Ult,
    IcmpOp.Ule,
    IcmpOp.Ugt,
    IcmpOp.Uge,
]);
const FCMP_OP_VALUES = new Set<number>([
    FcmpOp.Oeq,
    FcmpOp.One,
    FcmpOp.Olt,
    FcmpOp.Ole,
    FcmpOp.Ogt,
    FcmpOp.Oge,
]);

const DeserializeErrorKind = {
    InvalidMagic: 0,
    InvalidVersion: 1,
    TruncatedData: 2,
    InvalidOpcode: 3,
    InvalidTypeTag: 4,
    OutOfBoundsReference: 5,
    InvalidStringTable: 6,
    InvalidTerminatorTag: 7,
};

type DeserializeErrorKindValue = number;

interface DeserializeError {
    kind: DeserializeErrorKindValue;
    message: string;
    pos?: number;
}

function isIRTypeKind(value: number): value is IRTypeKind {
    return IR_TYPE_KIND_VALUES.has(value);
}

function isIRInstKind(value: number): value is IRInstKind {
    return IR_INST_KIND_VALUES.has(value);
}

function isIRTermKind(value: number): value is IRTermKind {
    return IR_TERM_KIND_VALUES.has(value);
}

function isIcmpOp(value: number): value is IcmpOp {
    return ICMP_OP_VALUES.has(value);
}

function isFcmpOp(value: number): value is FcmpOp {
    return FCMP_OP_VALUES.has(value);
}

type InstructionReader = (
    deserializer: IRDeserializer,
    id: number,
    ty: IRType,
) => Result<IRInst, DeserializeError>;

type TerminatorReader = (
    deserializer: IRDeserializer,
) => Result<IRTerm, DeserializeError>;

const INSTRUCTION_READERS: Partial<Record<IRInstKind, InstructionReader>> = {
    [IRInstKind.Iconst]: (deserializer, id, ty) =>
        deserializer.readIconstInstruction(id, ty),
    [IRInstKind.Fconst]: (deserializer, id, ty) =>
        deserializer.readFconstInstruction(id, ty),
    [IRInstKind.Bconst]: (deserializer, id) =>
        ok(new BconstInst(id, deserializer.readU8() !== 0)),
    [IRInstKind.Null]: (deserializer, id, ty) =>
        deserializer.readNullInstruction(id, ty),
    [IRInstKind.Sconst]: (deserializer, id) =>
        ok(new SconstInst(id, deserializer.readU32())),
    [IRInstKind.Iadd]: (deserializer, id, ty) =>
        deserializer.readIntBinaryInstruction(IRInstKind.Iadd, id, ty),
    [IRInstKind.Isub]: (deserializer, id, ty) =>
        deserializer.readIntBinaryInstruction(IRInstKind.Isub, id, ty),
    [IRInstKind.Imul]: (deserializer, id, ty) =>
        deserializer.readIntBinaryInstruction(IRInstKind.Imul, id, ty),
    [IRInstKind.Idiv]: (deserializer, id, ty) =>
        deserializer.readIntBinaryInstruction(IRInstKind.Idiv, id, ty),
    [IRInstKind.Imod]: (deserializer, id, ty) =>
        deserializer.readIntBinaryInstruction(IRInstKind.Imod, id, ty),
    [IRInstKind.Fadd]: (deserializer, id, ty) =>
        deserializer.readFloatBinaryInstruction(IRInstKind.Fadd, id, ty),
    [IRInstKind.Fsub]: (deserializer, id, ty) =>
        deserializer.readFloatBinaryInstruction(IRInstKind.Fsub, id, ty),
    [IRInstKind.Fmul]: (deserializer, id, ty) =>
        deserializer.readFloatBinaryInstruction(IRInstKind.Fmul, id, ty),
    [IRInstKind.Fdiv]: (deserializer, id, ty) =>
        deserializer.readFloatBinaryInstruction(IRInstKind.Fdiv, id, ty),
    [IRInstKind.Iand]: (deserializer, id, ty) =>
        deserializer.readBitwiseInstruction(IRInstKind.Iand, id, ty),
    [IRInstKind.Ior]: (deserializer, id, ty) =>
        deserializer.readBitwiseInstruction(IRInstKind.Ior, id, ty),
    [IRInstKind.Ixor]: (deserializer, id, ty) =>
        deserializer.readBitwiseInstruction(IRInstKind.Ixor, id, ty),
    [IRInstKind.Ishl]: (deserializer, id, ty) =>
        deserializer.readBitwiseInstruction(IRInstKind.Ishl, id, ty),
    [IRInstKind.Ishr]: (deserializer, id, ty) =>
        deserializer.readBitwiseInstruction(IRInstKind.Ishr, id, ty),
    [IRInstKind.Icmp]: (deserializer, id) =>
        deserializer.readCompareInstruction(IRInstKind.Icmp, id),
    [IRInstKind.Fcmp]: (deserializer, id) =>
        deserializer.readCompareInstruction(IRInstKind.Fcmp, id),
    [IRInstKind.Ineg]: (deserializer, id, ty) =>
        deserializer.readNegInstruction(IRInstKind.Ineg, id, ty),
    [IRInstKind.Fneg]: (deserializer, id, ty) =>
        deserializer.readNegInstruction(IRInstKind.Fneg, id, ty),
    [IRInstKind.Alloca]: (deserializer, id) =>
        deserializer.readAllocaInstruction(id),
    [IRInstKind.Load]: (deserializer, id) => deserializer.readLoadInstruction(id),
    [IRInstKind.Store]: (deserializer, id) =>
        deserializer.readStoreInstruction(id),
    [IRInstKind.Memcpy]: (deserializer, id) =>
        ok(
            new MemcpyInst(
                id,
                deserializer.readU32(),
                deserializer.readU32(),
                deserializer.readU32(),
            ),
        ),
    [IRInstKind.Gep]: (deserializer, id) => deserializer.readGepInstruction(id),
    [IRInstKind.Ptradd]: (deserializer, id) =>
        ok(new PtraddInst(id, deserializer.readU32(), deserializer.readU32())),
    [IRInstKind.Trunc]: (deserializer, id, ty) =>
        deserializer.readIntCastInstruction(IRInstKind.Trunc, id, ty),
    [IRInstKind.Sext]: (deserializer, id, ty) =>
        deserializer.readIntCastInstruction(IRInstKind.Sext, id, ty),
    [IRInstKind.Zext]: (deserializer, id, ty) =>
        deserializer.readIntCastInstruction(IRInstKind.Zext, id, ty),
    [IRInstKind.Fptoui]: (deserializer, id) =>
        deserializer.parseGeneralCastInstruction(IRInstKind.Fptoui, id),
    [IRInstKind.Fptosi]: (deserializer, id) =>
        deserializer.parseGeneralCastInstruction(IRInstKind.Fptosi, id),
    [IRInstKind.Uitofp]: (deserializer, id) =>
        deserializer.parseGeneralCastInstruction(IRInstKind.Uitofp, id),
    [IRInstKind.Sitofp]: (deserializer, id) =>
        deserializer.parseGeneralCastInstruction(IRInstKind.Sitofp, id),
    [IRInstKind.Bitcast]: (deserializer, id) =>
        deserializer.parseGeneralCastInstruction(IRInstKind.Bitcast, id),
    [IRInstKind.Call]: (deserializer, id, ty) =>
        deserializer.readCallInstruction(IRInstKind.Call, id, ty),
    [IRInstKind.CallDyn]: (deserializer, id, ty) =>
        deserializer.readCallInstruction(IRInstKind.CallDyn, id, ty),
    [IRInstKind.StructCreate]: (deserializer, id) =>
        deserializer.readStructCreateInstruction(id),
    [IRInstKind.StructGet]: (deserializer, id, ty) =>
        deserializer.readStructGetInstruction(id, ty),
    [IRInstKind.EnumCreate]: (deserializer, id) =>
        deserializer.readEnumCreateInstruction(id),
    [IRInstKind.EnumGetTag]: (deserializer, id) =>
        deserializer.readEnumGetTagInstruction(id),
    [IRInstKind.EnumGetData]: (deserializer, id) =>
        deserializer.readEnumGetDataInstruction(id),
};

const TERMINATOR_READERS: Partial<Record<IRTermKind, TerminatorReader>> = {
    [IRTermKind.Ret]: (deserializer) => deserializer.readRetTerm(),
    [IRTermKind.Br]: (deserializer) => deserializer.readBrTerm(),
    [IRTermKind.BrIf]: (deserializer) => deserializer.readBrIfTerm(),
    [IRTermKind.Switch]: (deserializer) => deserializer.readSwitchTerm(),
};

class IRDeserializer {
    view: DataView;
    pos: number;
    strings: string[];
    end: number;

    constructor(
        buffer: ArrayBuffer,
        byteOffset = 0,
        byteLength: number = buffer.byteLength - byteOffset,
    ) {
        this.view = new DataView(buffer, byteOffset, byteLength);
        this.pos = 0;
        this.strings = [];
        this.end = byteLength;
    }

    deserializeModule(): Result<IRModule, DeserializeError> {
        const headerResult = this.readHeaderOffsets();
        if (!headerResult.ok) {
            return headerResult;
        }

        this.pos = headerResult.value.stringTableOffset;
        const stringTableResult = this.readStringTable();
        if (!stringTableResult.ok) {
            return stringTableResult;
        }
        this.strings = stringTableResult.value;

        this.pos = headerResult.value.typesOffset;
        const typesResult = this.readTypesSection();
        if (!typesResult.ok) {
            return typesResult;
        }

        const module = makeIRModule("module");
        this.addTypesToModule(module, typesResult.value);

        this.pos = headerResult.value.literalsOffset;
        const literalsResult = this.readStringLiteralsSection();
        if (!literalsResult.ok) {
            return literalsResult;
        }
        this.addStringLiteralsToModule(module, literalsResult.value);

        this.pos = headerResult.value.globalsOffset;
        const globalsResult = this.readGlobalsSection(module);
        if (!globalsResult.ok) {
            return globalsResult;
        }

        this.pos = headerResult.value.functionsOffset;
        const functionsResult = this.readFunctionsSection(module);
        if (!functionsResult.ok) {
            return functionsResult;
        }

        return ok(module);
    }

    readU8(): number {
        const value = this.view.getUint8(this.pos);
        this.pos += 1;
        return value;
    }

    readU32(): number {
        const value = this.view.getUint32(this.pos, true);
        this.pos += 4;
        return value;
    }

    readI64(): bigint {
        const value = this.view.getBigInt64(this.pos, true);
        this.pos += 8;
        return value;
    }

    readF64(): number {
        const value = this.view.getFloat64(this.pos, true);
        this.pos += 8;
        return value;
    }

    readBytes(count: number): Uint8Array {
        const bytes = new Uint8Array(
            this.view.buffer,
            this.view.byteOffset + this.pos,
            count,
        );
        this.pos += count;
        return bytes;
    }

    readStringTable(): Result<string[], DeserializeError> {
        const count = this.readU32();
        const strings: string[] = [];

        for (let i = 0; i < count; i++) {
            const length = this.readU32();
            const bytes = this.readBytes(length);
            strings.push(this.decodeUtf8(bytes));
        }

        return ok(strings);
    }

    getString(id: number): Result<string, DeserializeError> {
        if (id < 0 || id >= this.strings.length) {
            return err({
                kind: DeserializeErrorKind.OutOfBoundsReference,
                message: `Invalid string ID: ${id}`,
                pos: this.pos,
            });
        }

        return ok(this.strings[id]);
    }

    readStringLiteralsSection(): Result<string[], DeserializeError> {
        const count = this.readU32();
        const literals: string[] = [];

        for (let i = 0; i < count; i++) {
            const length = this.readU32();
            literals.push(this.decodeUtf8(this.readBytes(length)));
        }

        return ok(literals);
    }

    readTypesSection(): Result<
        {
            structs: Map<string, StructType>;
            enums: Map<string, EnumType>;
        },
        DeserializeError
    > {
        const structs = new Map<string, StructType>();
        const enums = new Map<string, EnumType>();

        const structCount = this.readU32();
        for (let i = 0; i < structCount; i++) {
            const structResult = this.readStructTypeDefinition();
            if (!structResult.ok) {
                return structResult;
            }
            structs.set(structResult.value.name, structResult.value.struct);
        }

        const enumCount = this.readU32();
        for (let i = 0; i < enumCount; i++) {
            const enumResult = this.readEnumTypeDefinition();
            if (!enumResult.ok) {
                return enumResult;
            }
            enums.set(enumResult.value.name, enumResult.value.enumType);
        }

        return ok({ structs, enums });
    }

    readType(): Result<IRType, DeserializeError> {
        const tagValue = this.readU8();
        if (!isIRTypeKind(tagValue)) {
            return err({
                kind: DeserializeErrorKind.InvalidTypeTag,
                message: `Invalid type tag: ${tagValue}`,
                pos: this.pos,
            });
        }

        if (tagValue === IRTypeKind.Int) {
            return ok(makeIRIntType(this.readU8()));
        }
        if (tagValue === IRTypeKind.Float) {
            return ok(makeIRFloatType(this.readU8()));
        }
        if (tagValue === IRTypeKind.Bool) {
            return ok(makeIRBoolType());
        }
        if (tagValue === IRTypeKind.Ptr) {
            return ok(makeIRPtrType(makeIRUnitType()));
        }
        if (tagValue === IRTypeKind.Unit) {
            return ok(makeIRUnitType());
        }
        if (tagValue === IRTypeKind.Struct) {
            return this.readNamedStructType();
        }
        if (tagValue === IRTypeKind.Enum) {
            return this.readNamedEnumType();
        }
        if (tagValue === IRTypeKind.Array) {
            return this.readArrayType();
        }
        return this.readFunctionType();
    }

    readGlobalsSection(module: IRModule): Result<void, DeserializeError> {
        const count = this.readU32();

        for (let i = 0; i < count; i++) {
            const nameResult = this.getString(this.readU32());
            if (!nameResult.ok) {
                return nameResult;
            }

            const typeResult = this.readType();
            if (!typeResult.ok) {
                return typeResult;
            }

            const hasInit = this.readU8() !== 0;
            let init: boolean | number | bigint | undefined;
            if (hasInit) {
                const constResult = this.readConstant(typeResult.value);
                if (!constResult.ok) {
                    return constResult;
                }
                init = constResult.value;
            }

            addIRGlobal(module, {
                name: nameResult.value,
                ty: typeResult.value,
                init,
            });
        }

        return ok(undefined);
    }

    readConstant(
        ty: IRType,
    ): Result<boolean | number | bigint, DeserializeError> {
        switch (ty.kind) {
            case IRTypeKind.Int: {
                return ok(this.readI64());
            }
            case IRTypeKind.Float: {
                return ok(this.readF64());
            }
            case IRTypeKind.Bool: {
                return ok(this.readU8() !== 0);
            }
            default: {
                return err({
                    kind: DeserializeErrorKind.InvalidTypeTag,
                    message: `Invalid constant type: ${ty.kind}`,
                    pos: this.pos,
                });
            }
        }
    }

    readFunctionsSection(module: IRModule): Result<void, DeserializeError> {
        const count = this.readU32();

        for (let i = 0; i < count; i++) {
            const fnResult = this.readFunction();
            if (!fnResult.ok) {
                return fnResult;
            }
            addIRFunction(module, fnResult.value);
        }

        return ok(undefined);
    }

    readFunction(): Result<IRFunction, DeserializeError> {
        const nameResult = this.getString(this.readU32());
        if (!nameResult.ok) {
            return nameResult;
        }

        const paramCount = this.readU32();
        const params = [];
        for (let i = 0; i < paramCount; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) {
                return typeResult;
            }
            params.push(makeIRParam(this.readU32(), "", typeResult.value));
        }

        const returnResult = this.readType();
        if (!returnResult.ok) {
            return returnResult;
        }

        const fn = makeIRFunction(0, nameResult.value, params, returnResult.value);

        const localCount = this.readU32();
        for (let i = 0; i < localCount; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) {
                return typeResult;
            }
            addIRLocal(fn, makeIRLocal(this.readU32(), typeResult.value, ""));
        }

        const blockCount = this.readU32();
        for (let i = 0; i < blockCount; i++) {
            const blockResult = this.readBlock();
            if (!blockResult.ok) {
                return blockResult;
            }
            addIRBlock(fn, blockResult.value);
        }

        return ok(fn);
    }

    readBlock(): Result<IRBlock, DeserializeError> {
        const block = makeIRBlock(this.readU32());

        const paramCount = this.readU32();
        for (let i = 0; i < paramCount; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) {
                return typeResult;
            }
            addIRBlockParam(block, this.readU32(), typeResult.value);
        }

        const instCount = this.readU32();
        for (let i = 0; i < instCount; i++) {
            const instResult = this.readInstruction();
            if (!instResult.ok) {
                return instResult;
            }
            addIRInstruction(block, instResult.value);
        }

        const termResult = this.readTerminator();
        if (!termResult.ok) {
            return termResult;
        }
        setIRTerminator(block, termResult.value);

        return ok(block);
    }

    readInstruction(): Result<IRInst, DeserializeError> {
        const opcodeValue = this.readU8();
        if (!isIRInstKind(opcodeValue)) {
            return err({
                kind: DeserializeErrorKind.InvalidOpcode,
                message: `Invalid instruction opcode: ${opcodeValue}`,
                pos: this.pos,
            });
        }

        const id = this.readU32();
        const typeResult = this.readType();
        if (!typeResult.ok) {
            return typeResult;
        }
        const reader = INSTRUCTION_READERS[opcodeValue];
        if (!reader) {
            return err({
                kind: DeserializeErrorKind.InvalidOpcode,
                message: "Invalid instruction opcode",
                pos: this.pos,
            });
        }
        return reader(this, id, typeResult.value);
    }

    readTerminator(): Result<IRTerm, DeserializeError> {
        const tagValue = this.readU8();
        if (!isIRTermKind(tagValue)) {
            return err({
                kind: DeserializeErrorKind.InvalidTerminatorTag,
                message: `Invalid terminator tag: ${tagValue}`,
                pos: this.pos,
            });
        }

        const reader = TERMINATOR_READERS[tagValue];
        if (reader) {
            return reader(this);
        }
        return ok(new UnreachableTerm());
    }

    decodeUtf8(bytes: Uint8Array): string {
        return new TextDecoder().decode(bytes);
    }

    readHeaderOffsets(): Result<
        {
            stringTableOffset: number;
            typesOffset: number;
            literalsOffset: number;
            globalsOffset: number;
            functionsOffset: number;
        },
        DeserializeError
    > {
        if (this.end < HEADER_SIZE) {
            return err({
                kind: DeserializeErrorKind.TruncatedData,
                message: "Buffer too small for header",
                pos: this.pos,
            });
        }

        const magic = this.readU32();
        if (magic !== MAGIC) {
            return err({
                kind: DeserializeErrorKind.InvalidMagic,
                message: `Invalid magic bytes: expected 0x${MAGIC.toString(HEX_RADIX)}, got 0x${magic.toString(HEX_RADIX)}`,
                pos: this.pos,
            });
        }

        const version = this.readU32();
        if (version !== VERSION) {
            return err({
                kind: DeserializeErrorKind.InvalidVersion,
                message: `Unsupported version: ${version}`,
                pos: this.pos,
            });
        }

        this.readU32();
        return ok({
            stringTableOffset: this.readU32(),
            typesOffset: this.readU32(),
            literalsOffset: this.readU32(),
            globalsOffset: this.readU32(),
            functionsOffset: this.readU32(),
        });
    }

    addTypesToModule(
        module: IRModule,
        types: { structs: Map<string, StructType>; enums: Map<string, EnumType> },
    ): void {
        for (const [name, struct] of types.structs) {
            addIRStruct(module, name, struct);
        }
        for (const [name, enum_] of types.enums) {
            addIREnum(module, name, enum_);
        }
    }

    addStringLiteralsToModule(module: IRModule, literals: string[]): void {
        for (const [index, value] of literals.entries()) {
            module.stringLiterals.push(value);
            module.stringLiteralIds.set(value, index);
        }
    }

    readStructTypeDefinition(): Result<
        { name: string; struct: StructType },
        DeserializeError
    > {
        const nameResult = this.getString(this.readU32());
        if (!nameResult.ok) {
            return nameResult;
        }
        const fieldsResult = this.readTypeList();
        if (!fieldsResult.ok) {
            return fieldsResult;
        }
        return ok({
            name: nameResult.value,
            struct: makeIRStructType(nameResult.value, fieldsResult.value),
        });
    }

    readEnumTypeDefinition(): Result<
        { name: string; enumType: EnumType },
        DeserializeError
    > {
        const nameResult = this.getString(this.readU32());
        if (!nameResult.ok) {
            return nameResult;
        }
        const variantCount = this.readU32();
        const variants: IRType[][] = [];
        for (let i = 0; i < variantCount; i++) {
            const fieldsResult = this.readTypeList();
            if (!fieldsResult.ok) {
                return fieldsResult;
            }
            variants.push(fieldsResult.value);
        }
        return ok({
            name: nameResult.value,
            enumType: makeIREnumType(nameResult.value, variants),
        });
    }

    readNamedStructType(): Result<IRType, DeserializeError> {
        const nameResult = this.getString(this.readU32());
        if (!nameResult.ok) {
            return nameResult;
        }
        return ok(makeIRStructType(nameResult.value, []));
    }

    readNamedEnumType(): Result<IRType, DeserializeError> {
        const nameResult = this.getString(this.readU32());
        if (!nameResult.ok) {
            return nameResult;
        }
        return ok(makeIREnumType(nameResult.value, []));
    }

    readArrayType(): Result<IRType, DeserializeError> {
        const length = this.readU32();
        const elementResult = this.readType();
        if (!elementResult.ok) {
            return elementResult;
        }
        return ok(makeIRArrayType(elementResult.value, length));
    }

    readFunctionType(): Result<IRType, DeserializeError> {
        const paramCount = this.readU32();
        const params: IRType[] = [];
        for (let i = 0; i < paramCount; i++) {
            const paramResult = this.readType();
            if (!paramResult.ok) {
                return paramResult;
            }
            params.push(paramResult.value);
        }
        const returnResult = this.readType();
        if (!returnResult.ok) {
            return returnResult;
        }
        return ok(makeIRFnType(params, returnResult.value));
    }

    readTypeList(): Result<IRType[], DeserializeError> {
        const count = this.readU32();
        const types: IRType[] = [];
        for (let i = 0; i < count; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) {
                return typeResult;
            }
            types.push(typeResult.value);
        }
        return ok(types);
    }

    readIconstInstruction(
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        if (!isIRIntType(ty)) {
            return this.invalidInstructionType(IRInstKind.Iconst, ty);
        }
        return ok(new IconstInst(id, ty, Number(this.readI64())));
    }

    readFconstInstruction(
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        if (!isIRFloatType(ty)) {
            return this.invalidInstructionType(IRInstKind.Fconst, ty);
        }
        return ok(new FconstInst(id, ty, this.readF64()));
    }

    readNullInstruction(id: number, ty: IRType): Result<IRInst, DeserializeError> {
        if (!isIRPtrType(ty)) {
            return this.invalidInstructionType(IRInstKind.Null, ty);
        }
        return ok(new NullInst(id, ty));
    }

    readIntBinaryInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        if (!isIRIntType(ty)) {
            return this.invalidInstructionType(opcode, ty);
        }
        return ok(
            this.makeIntBinaryInstruction(
                opcode,
                id,
                ty,
                this.readU32(),
                this.readU32(),
            ),
        );
    }

    readFloatBinaryInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        if (!isIRFloatType(ty)) {
            return this.invalidInstructionType(opcode, ty);
        }
        return ok(
            this.makeFloatBinaryInstruction(
                opcode,
                id,
                ty,
                this.readU32(),
                this.readU32(),
            ),
        );
    }

    readBitwiseInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        if (!isIRIntType(ty)) {
            return this.invalidInstructionType(opcode, ty);
        }
        return ok(
            this.makeBitwiseInstruction(
                opcode,
                id,
                ty,
                this.readU32(),
                this.readU32(),
            ),
        );
    }

    readCompareInstruction(
        opcode: IRInstKind,
        id: number,
    ): Result<IRInst, DeserializeError> {
        const left = this.readU32();
        const right = this.readU32();
        const op = this.readU8();

        if (opcode === IRInstKind.Icmp) {
            if (!isIcmpOp(op)) {
                return this.invalidOp(opcode, op);
            }
            return ok(new IcmpInst(id, op, left, right));
        }
        if (!isFcmpOp(op)) {
            return this.invalidOp(opcode, op);
        }
        return ok(new FcmpInst(id, op, left, right));
    }

    readNegInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        const operand = this.readU32();
        if (opcode === IRInstKind.Ineg) {
            if (!isIRIntType(ty)) {
                return this.invalidInstructionType(opcode, ty);
            }
            return ok(new InegInst(id, ty, operand));
        }
        if (!isIRFloatType(ty)) {
            return this.invalidInstructionType(opcode, ty);
        }
        return ok(new FnegInst(id, ty, operand));
    }

    readAllocaInstruction(id: number): Result<IRInst, DeserializeError> {
        const allocTypeResult = this.readType();
        if (!allocTypeResult.ok) {
            return allocTypeResult;
        }
        const hasAlignment = this.readU8() !== 0;
        const alignment = hasAlignment ? this.readU32() : undefined;
        return ok(new AllocaInst(id, allocTypeResult.value, alignment));
    }

    readLoadInstruction(id: number): Result<IRInst, DeserializeError> {
        const ptr = this.readU32();
        const loadTypeResult = this.readType();
        if (!loadTypeResult.ok) {
            return loadTypeResult;
        }
        const hasAlignment = this.readU8() !== 0;
        const alignment = hasAlignment ? this.readU32() : undefined;
        return ok(new LoadInst(id, ptr, loadTypeResult.value, alignment));
    }

    readStoreInstruction(id: number): Result<IRInst, DeserializeError> {
        const value = this.readU32();
        const ptr = this.readU32();
        const hasAlignment = this.readU8() !== 0;
        const alignment = hasAlignment ? this.readU32() : undefined;
        return ok(new StoreInst(id, value, ptr, alignment));
    }

    readGepInstruction(id: number): Result<IRInst, DeserializeError> {
        const ptr = this.readU32();
        const indexCount = this.readU32();
        const indices: number[] = [];
        for (let i = 0; i < indexCount; i++) {
            indices.push(this.readU32());
        }
        const resultTypeResult = this.readType();
        if (!resultTypeResult.ok) {
            return resultTypeResult;
        }
        return ok(new GepInst(id, ptr, indices, resultTypeResult.value));
    }

    readIntCastInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        const operand = this.readU32();
        const fromTypeResult = this.readType();
        if (!fromTypeResult.ok) {
            return fromTypeResult;
        }
        const toTypeResult = this.readType();
        if (!toTypeResult.ok) {
            return toTypeResult;
        }
        if (!isIRIntType(fromTypeResult.value) || !isIRIntType(toTypeResult.value)) {
            return this.invalidInstructionType(opcode, ty);
        }
        return ok(
            this.makeIntCastInstruction(
                opcode,
                id,
                operand,
                fromTypeResult.value,
                toTypeResult.value,
            ),
        );
    }

    parseGeneralCastInstruction(
        opcode: IRInstKind,
        id: number,
    ): Result<IRInst, DeserializeError> {
        const operand = this.readU32();
        const fromTypeResult = this.readType();
        if (!fromTypeResult.ok) {
            return fromTypeResult;
        }
        const toTypeResult = this.readType();
        if (!toTypeResult.ok) {
            return toTypeResult;
        }
        return this.makeGeneralCastInstruction(
            opcode,
            id,
            operand,
            fromTypeResult.value,
            toTypeResult.value,
        );
    }

    readCallInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        const callee = this.readU32();
        const argCount = this.readU32();
        const args: number[] = [];
        for (let i = 0; i < argCount; i++) {
            args.push(this.readU32());
        }
        const calleeTypeResult = this.readType();
        if (!calleeTypeResult.ok) {
            return calleeTypeResult;
        }
        if (!isIRFnType(calleeTypeResult.value)) {
            return this.invalidInstructionType(opcode, calleeTypeResult.value);
        }
        if (opcode === IRInstKind.Call) {
            return ok(new CallInst(id, callee, args, calleeTypeResult.value, ty));
        }
        return ok(new CallDynInst(id, callee, args, calleeTypeResult.value, ty));
    }

    readStructCreateInstruction(id: number): Result<IRInst, DeserializeError> {
        const fieldCount = this.readU32();
        const fields: number[] = [];
        for (let i = 0; i < fieldCount; i++) {
            fields.push(this.readU32());
        }
        const structTypeResult = this.readType();
        if (!structTypeResult.ok) {
            return structTypeResult;
        }
        if (!isIRStructType(structTypeResult.value)) {
            return this.invalidInstructionType(
                IRInstKind.StructCreate,
                structTypeResult.value,
            );
        }
        return ok(new StructCreateInst(id, fields, structTypeResult.value));
    }

    readStructGetInstruction(
        id: number,
        ty: IRType,
    ): Result<IRInst, DeserializeError> {
        const struct = this.readU32();
        const index = this.readU32();
        const structTypeResult = this.readType();
        if (!structTypeResult.ok) {
            return structTypeResult;
        }
        if (!isIRStructType(structTypeResult.value)) {
            return this.invalidInstructionType(
                IRInstKind.StructGet,
                structTypeResult.value,
            );
        }
        return ok(new StructGetInst(id, struct, index, structTypeResult.value, ty));
    }

    readEnumCreateInstruction(id: number): Result<IRInst, DeserializeError> {
        const tag = this.readU32();
        const hasData = this.readU8() !== 0;
        const data = hasData ? this.readU32() : this.readMissingEnumData();
        const enumTypeResult = this.readType();
        if (!enumTypeResult.ok) {
            return enumTypeResult;
        }
        if (!isIREnumType(enumTypeResult.value)) {
            return this.invalidInstructionType(
                IRInstKind.EnumCreate,
                enumTypeResult.value,
            );
        }
        return ok(new EnumCreateInst(id, tag, data, enumTypeResult.value));
    }

    readEnumGetTagInstruction(id: number): Result<IRInst, DeserializeError> {
        const enumValue = this.readU32();
        const enumTypeResult = this.readType();
        if (!enumTypeResult.ok) {
            return enumTypeResult;
        }
        if (!isIREnumType(enumTypeResult.value)) {
            return this.invalidInstructionType(
                IRInstKind.EnumGetTag,
                enumTypeResult.value,
            );
        }
        return ok(new EnumGetTagInst(id, enumValue, enumTypeResult.value));
    }

    readEnumGetDataInstruction(id: number): Result<IRInst, DeserializeError> {
        const enumValue = this.readU32();
        const enumTypeResult = this.readType();
        if (!enumTypeResult.ok) {
            return enumTypeResult;
        }
        if (!isIREnumType(enumTypeResult.value)) {
            return this.invalidInstructionType(
                IRInstKind.EnumGetData,
                enumTypeResult.value,
            );
        }
        const dataTypeResult = this.readType();
        if (!dataTypeResult.ok) {
            return dataTypeResult;
        }
        return ok(
            new EnumGetDataInst(
                id,
                enumValue,
                enumTypeResult.value,
                dataTypeResult.value,
            ),
        );
    }

    readRetTerm(): Result<IRTerm, DeserializeError> {
        const hasValue = this.readU8() !== 0;
        const value = hasValue ? this.readU32() : undefined;
        return ok(new RetTerm(value));
    }

    readBrTerm(): Result<IRTerm, DeserializeError> {
        const target = this.readU32();
        const argCount = this.readU32();
        const args: number[] = [];
        for (let i = 0; i < argCount; i++) {
            args.push(this.readU32());
        }
        return ok(new BrTerm(target, args));
    }

    readBrIfTerm(): Result<IRTerm, DeserializeError> {
        const condition = this.readU32();
        const thenBlock = this.readU32();
        const thenArgs = this.readValueList();
        const elseBlock = this.readU32();
        const elseArgs = this.readValueList();
        return ok(
            new BrIfTerm(condition, thenBlock, elseBlock, thenArgs, elseArgs),
        );
    }

    readSwitchTerm(): Result<IRTerm, DeserializeError> {
        const value = this.readU32();
        const caseCount = this.readU32();
        const cases: { value: number; target: number; args: number[] }[] = [];
        for (let i = 0; i < caseCount; i++) {
            const caseValue = Number(this.readI64());
            const target = this.readU32();
            const args = this.readValueList();
            cases.push({ value: caseValue, target, args });
        }
        const defaultBlock = this.readU32();
        const defaultArgs = this.readValueList();
        return ok(new SwitchTerm(value, defaultBlock, defaultArgs, cases));
    }

    readValueList(): number[] {
        const count = this.readU32();
        const values: number[] = [];
        for (let i = 0; i < count; i++) {
            values.push(this.readU32());
        }
        return values;
    }

    isIntBinaryOpcode(opcode: IRInstKind): boolean {
        return (
            opcode === IRInstKind.Iadd ||
            opcode === IRInstKind.Isub ||
            opcode === IRInstKind.Imul ||
            opcode === IRInstKind.Idiv ||
            opcode === IRInstKind.Imod
        );
    }

    isFloatBinaryOpcode(opcode: IRInstKind): boolean {
        return (
            opcode === IRInstKind.Fadd ||
            opcode === IRInstKind.Fsub ||
            opcode === IRInstKind.Fmul ||
            opcode === IRInstKind.Fdiv
        );
    }

    isBitwiseOpcode(opcode: IRInstKind): boolean {
        return (
            opcode === IRInstKind.Iand ||
            opcode === IRInstKind.Ior ||
            opcode === IRInstKind.Ixor ||
            opcode === IRInstKind.Ishl ||
            opcode === IRInstKind.Ishr
        );
    }

    isIntCastOpcode(opcode: IRInstKind): boolean {
        return (
            opcode === IRInstKind.Trunc ||
            opcode === IRInstKind.Sext ||
            opcode === IRInstKind.Zext
        );
    }

    isGeneralCastOpcode(opcode: IRInstKind): boolean {
        return (
            opcode === IRInstKind.Fptoui ||
            opcode === IRInstKind.Fptosi ||
            opcode === IRInstKind.Uitofp ||
            opcode === IRInstKind.Sitofp ||
            opcode === IRInstKind.Bitcast
        );
    }

    invalidInstructionType(
        opcode: IRInstKind,
        ty: IRType,
    ): Result<never, DeserializeError> {
        return err({
            kind: DeserializeErrorKind.InvalidTypeTag,
            message: `Invalid type ${ty.kind} for instruction ${opcode}`,
            pos: this.pos,
        });
    }

    invalidOp(opcode: IRInstKind, op: number): Result<never, DeserializeError> {
        return err({
            kind: DeserializeErrorKind.InvalidOpcode,
            message: `Invalid op ${op} for instruction ${opcode}`,
            pos: this.pos,
        });
    }

    makeIntBinaryInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IntType,
        left: number,
        right: number,
    ): IRInst {
        switch (opcode) {
            case IRInstKind.Iadd: {
                return new IaddInst(id, ty, left, right);
            }
            case IRInstKind.Isub: {
                return new IsubInst(id, ty, left, right);
            }
            case IRInstKind.Imul: {
                return new ImulInst(id, ty, left, right);
            }
            case IRInstKind.Idiv: {
                return new IdivInst(id, ty, left, right);
            }
            case IRInstKind.Imod: {
                return new ImodInst(id, ty, left, right);
            }
            case IRInstKind.Iand: {
                return new IandInst(id, ty, left, right);
            }
            case IRInstKind.Ior: {
                return new IorInst(id, ty, left, right);
            }
            case IRInstKind.Ixor: {
                return new IxorInst(id, ty, left, right);
            }
            case IRInstKind.Ishl: {
                return new IshlInst(id, ty, left, right);
            }
            case IRInstKind.Ishr: {
                return new IshrInst(id, ty, left, right);
            }
            default: {
                throw new Error(`Unsupported integer opcode: ${opcode}`);
            }
        }
    }

    makeFloatBinaryInstruction(
        opcode: IRInstKind,
        id: number,
        ty: FloatType,
        left: number,
        right: number,
    ): IRInst {
        switch (opcode) {
            case IRInstKind.Fadd: {
                return new FaddInst(id, ty, left, right);
            }
            case IRInstKind.Fsub: {
                return new FsubInst(id, ty, left, right);
            }
            case IRInstKind.Fmul: {
                return new FmulInst(id, ty, left, right);
            }
            case IRInstKind.Fdiv: {
                return new FdivInst(id, ty, left, right);
            }
            default: {
                throw new Error(`Unsupported float opcode: ${opcode}`);
            }
        }
    }

    makeBitwiseInstruction(
        opcode: IRInstKind,
        id: number,
        ty: IntType,
        left: number,
        right: number,
    ): IRInst {
        return this.makeIntBinaryInstruction(opcode, id, ty, left, right);
    }

    makeIntCastInstruction(
        opcode: IRInstKind,
        id: number,
        operand: number,
        fromType: IntType,
        toType: IntType,
    ): IRInst {
        switch (opcode) {
            case IRInstKind.Trunc: {
                return new TruncInst(id, operand, fromType, toType);
            }
            case IRInstKind.Sext: {
                return new SextInst(id, operand, fromType, toType);
            }
            case IRInstKind.Zext: {
                return new ZextInst(id, operand, fromType, toType);
            }
            default: {
                throw new Error(`Unsupported integer cast opcode: ${opcode}`);
            }
        }
    }

    makeGeneralCastInstruction(
        opcode: IRInstKind,
        id: number,
        operand: number,
        fromType: IRType,
        toType: IRType,
    ): Result<IRInst, DeserializeError> {
        switch (opcode) {
            case IRInstKind.Fptoui: {
                if (!isIRFloatType(fromType) || !isIRIntType(toType)) {
                    return this.invalidInstructionType(opcode, toType);
                }
                return ok(new FptouiInst(id, operand, fromType, toType));
            }
            case IRInstKind.Fptosi: {
                if (!isIRFloatType(fromType) || !isIRIntType(toType)) {
                    return this.invalidInstructionType(opcode, toType);
                }
                return ok(new FptosiInst(id, operand, fromType, toType));
            }
            case IRInstKind.Uitofp: {
                if (!isIRIntType(fromType) || !isIRFloatType(toType)) {
                    return this.invalidInstructionType(opcode, toType);
                }
                return ok(new UitofpInst(id, operand, fromType, toType));
            }
            case IRInstKind.Sitofp: {
                if (!isIRIntType(fromType) || !isIRFloatType(toType)) {
                    return this.invalidInstructionType(opcode, toType);
                }
                return ok(new SitofpInst(id, operand, fromType, toType));
            }
            case IRInstKind.Bitcast: {
                return ok(new BitcastInst(id, operand, fromType, toType));
            }
            default: {
                return this.invalidInstructionType(opcode, toType);
            }
        }
    }

    readMissingEnumData(): number | null {
        const missingMatch = /value/.exec("");
        if (missingMatch) {
            return 0;
        }
        return missingMatch;
    }
}

function deserializeModule(
    data: Uint8Array,
): Result<IRModule, DeserializeError> {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return new IRDeserializer(buffer).deserializeModule();
}

export { DeserializeErrorKind, IRDeserializer, deserializeModule };
