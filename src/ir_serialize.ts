import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    type IntType,
    type FloatType,
    type PtrType,
    type StructType,
    type EnumType,
    type ArrayType,
    type FnType,
    type IconstInst,
    type FconstInst,
    type BconstInst,
    type SconstInst,
    type IaddInst,
    type IsubInst,
    type ImulInst,
    type IdivInst,
    type ImodInst,
    type FaddInst,
    type FsubInst,
    type FmulInst,
    type FdivInst,
    type InegInst,
    type FnegInst,
    type IandInst,
    type IorInst,
    type IxorInst,
    type IshlInst,
    type IshrInst,
    type IcmpInst,
    type FcmpInst,
    type AllocaInst,
    type LoadInst,
    type StoreInst,
    type MemcpyInst,
    type GepInst,
    type PtraddInst,
    type TruncInst,
    type SextInst,
    type ZextInst,
    type FptouiInst,
    type FptosiInst,
    type UitofpInst,
    type SitofpInst,
    type BitcastInst,
    type CallInst,
    type CallDynInst,
    type StructCreateInst,
    type StructGetInst,
    type EnumCreateInst,
    type EnumGetTagInst,
    type EnumGetDataInst,
    type RetTerm,
    type BrTerm,
    type BrIfTerm,
    type SwitchTerm,
    type IRType,
    type IRModule,
    type IRFunction,
    type IRBlock,
    type IRInst,
    type IRTerm,
    type IRTypeVisitor,
    type IRInstVisitor,
    type IRTermVisitor,
    type ValueId,
} from "./ir";
import { toBinaryInstKind } from "./ir_binary_opcode";

// Magic bytes: "JSRS" (0x4A 0x53 0x52 0x53)
export const MAGIC = 0x52_53_4a_53; // "JSRS" in little-endian

// Current version
export const VERSION = 2;

// Flags
export const FLAGS = 0;

// Section IDs
export const SectionId = {
    StringTable: 0,
    Types: 1,
    StringLiterals: 2,
    Globals: 3,
    Functions: 4,
} as const;

// Special value for "no value" in terminators
export const NO_VALUE = 0xff_ff_ff_ff;

const BYTE_WIDTH = 1;
const HEADER_FIELD_COUNT = 3;
const SECTION_OFFSET_COUNT = 5;
const U32_BYTE_WIDTH = 4;
const U64_BYTE_WIDTH = 8;
const HEADER_BYTE_WIDTH =
    (SECTION_OFFSET_COUNT + HEADER_FIELD_COUNT) * U32_BYTE_WIDTH;
const TAG_AND_U32_WIDTH = BYTE_WIDTH + U32_BYTE_WIDTH;
const TWO_U32_WIDTH = U32_BYTE_WIDTH * 2;
const THREE_U32_WIDTH = TWO_U32_WIDTH + U32_BYTE_WIDTH;
const TWO_U32_AND_TAG_WIDTH = TWO_U32_WIDTH + BYTE_WIDTH;

/**
 * String table for deduplicating strings during serialization
 */
export class StringTable {
    private readonly stringToId: Map<string, number>;
    private readonly strings: string[];

    constructor() {
        this.stringToId = new Map();
        this.strings = [];
    }

    /**
     * Add a string to the table and return its ID
     */
    addString(str: string): number {
        const existing = this.stringToId.get(str);
        if (existing !== undefined) {
            return existing;
        }
        const id = this.strings.length;
        this.strings.push(str);
        this.stringToId.set(str, id);
        return id;
    }

    /**
     * Get all strings in order
     */
    getStrings(): string[] {
        return this.strings;
    }
}

/**
 * IR Serializer - writes IR to binary format
 */
export class IRSerializer {
    private view: DataView;
    private pos: number;
    private readonly strings: StringTable;
    private readonly currentValueTypes: Map<ValueId, IRType>;

    constructor() {
        this.view = new DataView(new ArrayBuffer(0));
        this.pos = 0;
        this.strings = new StringTable();
        this.currentValueTypes = new Map();
    }

    /**
     * Serialize a module to binary format
     */
    serializeModule(module: IRModule): Uint8Array {
        // First pass: collect all strings
        this.collectStrings(module);

        // Calculate sizes for each section
        const stringTableSize = this.calculateStringTableSize();
        const typesSize = this.calculateTypesSize(module);
        const stringLiteralsSize = this.calculateStringLiteralsSize(module);
        const globalsSize = this.calculateGlobalsSize(module);
        const functionsSize = this.calculateFunctionsSize(module);

        // Calculate offsets (header is 32 bytes: magic + version + flags + 5 section offsets)
        const headerSize = HEADER_BYTE_WIDTH;
        const stringTableOffset = headerSize;
        const typesOffset = stringTableOffset + stringTableSize;
        const literalsOffset = typesOffset + typesSize;
        const globalsOffset = literalsOffset + stringLiteralsSize;
        const functionsOffset = globalsOffset + globalsSize;
        const totalSize = functionsOffset + functionsSize;

        // Allocate buffer
        const buffer = new ArrayBuffer(totalSize);
        this.view = new DataView(buffer);
        this.pos = 0;

        // Write header
        this.writeU32(MAGIC);
        this.writeU32(VERSION);
        this.writeU32(FLAGS);
        this.writeU32(stringTableOffset);
        this.writeU32(typesOffset);
        this.writeU32(literalsOffset);
        this.writeU32(globalsOffset);
        this.writeU32(functionsOffset);

        // Write sections
        this.writeStringTableSection();
        this.writeTypesSection(module);
        this.writeStringLiteralsSection(module);
        this.writeGlobalsSection(module);
        this.writeFunctionsSection(module);

        return new Uint8Array(buffer);
    }

    // ========================================================================
    // String Collection (First Pass)
    // ========================================================================

    /**
     * Collect all strings from a module
     */
    private collectStrings(module: IRModule): void {
        // Module name
        this.strings.addString(module.name);

        // Struct names
        for (const name of module.structs.keys()) {
            this.strings.addString(name);
        }

        // Enum names
        for (const name of module.enums.keys()) {
            this.strings.addString(name);
        }

        // Global names and types
        for (const global of module.globals) {
            this.strings.addString(global.name);
            this.collectTypeStrings(global.ty);
        }

        // Function names, parameter names, local names
        for (const fn of module.functions) {
            this.strings.addString(fn.name);
            for (const param of fn.params) {
                this.strings.addString(param.name);
                this.collectTypeStrings(param.ty);
            }
            this.collectTypeStrings(fn.returnType);
            for (const local of fn.locals) {
                this.strings.addString(local.name);
                this.collectTypeStrings(local.ty);
            }
            for (const block of fn.blocks) {
                for (const param of block.params) {
                    this.collectTypeStrings(param.ty);
                }
                for (const inst of block.instructions) {
                    this.collectInstStrings(inst);
                }
            }
        }
    }

    /**
     * Collect string names referenced by a type recursively
     */
    private collectTypeStrings(ty: IRType): void {
        const visitor: IRTypeVisitor<void, void> = {
            visitIntType(): void {
                return;
            },
            visitFloatType(): void {
                return;
            },
            visitBoolType(): void {
                return;
            },
            visitPtrType: (ptrTy: PtrType): void => {
                this.collectTypeStrings(ptrTy.inner);
            },
            visitUnitType(): void {
                return;
            },
            visitStructType: (structTy: StructType): void => {
                this.strings.addString(structTy.name);
            },
            visitEnumType: (enumTy: EnumType): void => {
                this.strings.addString(enumTy.name);
            },
            visitArrayType: (arrayTy: ArrayType): void => {
                this.collectTypeStrings(arrayTy.element);
            },
            visitFnType: (fnTy: FnType): void => {
                for (const param of fnTy.params) {
                    this.collectTypeStrings(param);
                }
                this.collectTypeStrings(fnTy.returnType);
            },
        };
        ty.accept(visitor, undefined);
    }

    /**
     * Collect strings from an instruction
     */
    private collectInstStrings(inst: IRInst): void {
        this.collectTypeStrings(inst.irType);
        const visitor: IRInstVisitor<void, void> = {
            visitIconstInst(): void {
                return;
            },
            visitFconstInst(): void {
                return;
            },
            visitBconstInst(): void {
                return;
            },
            visitNullInst(): void {
                return;
            },
            visitSconstInst(): void {
                return;
            },
            visitIaddInst(): void {
                return;
            },
            visitIsubInst(): void {
                return;
            },
            visitImulInst(): void {
                return;
            },
            visitIdivInst(): void {
                return;
            },
            visitImodInst(): void {
                return;
            },
            visitFaddInst(): void {
                return;
            },
            visitFsubInst(): void {
                return;
            },
            visitFmulInst(): void {
                return;
            },
            visitFdivInst(): void {
                return;
            },
            visitInegInst(): void {
                return;
            },
            visitFnegInst(): void {
                return;
            },
            visitIandInst(): void {
                return;
            },
            visitIorInst(): void {
                return;
            },
            visitIxorInst(): void {
                return;
            },
            visitIshlInst(): void {
                return;
            },
            visitIshrInst(): void {
                return;
            },
            visitIcmpInst(): void {
                return;
            },
            visitFcmpInst(): void {
                return;
            },
            visitAllocaInst: (alloca: AllocaInst): void => {
                this.collectTypeStrings(alloca.allocType);
            },
            visitLoadInst: (load: LoadInst): void => {
                this.collectTypeStrings(load.loadType);
            },
            visitStoreInst(): void {
                return;
            },
            visitMemcpyInst(): void {
                return;
            },
            visitGepInst: (gep: GepInst): void => {
                this.collectTypeStrings(gep.resultType);
            },
            visitPtraddInst(): void {
                return;
            },
            visitTruncInst: (trunc: TruncInst): void => {
                this.collectTypeStrings(trunc.fromType);
                this.collectTypeStrings(trunc.toType);
            },
            visitSextInst: (sext: SextInst): void => {
                this.collectTypeStrings(sext.fromType);
                this.collectTypeStrings(sext.toType);
            },
            visitZextInst: (zext: ZextInst): void => {
                this.collectTypeStrings(zext.fromType);
                this.collectTypeStrings(zext.toType);
            },
            visitFptouiInst: (fptoui: FptouiInst): void => {
                this.collectTypeStrings(fptoui.fromType);
                this.collectTypeStrings(fptoui.toType);
            },
            visitFptosiInst: (fptosi: FptosiInst): void => {
                this.collectTypeStrings(fptosi.fromType);
                this.collectTypeStrings(fptosi.toType);
            },
            visitUitofpInst: (uitofp: UitofpInst): void => {
                this.collectTypeStrings(uitofp.fromType);
                this.collectTypeStrings(uitofp.toType);
            },
            visitSitofpInst: (sitofp: SitofpInst): void => {
                this.collectTypeStrings(sitofp.fromType);
                this.collectTypeStrings(sitofp.toType);
            },
            visitBitcastInst: (bitcast: BitcastInst): void => {
                this.collectTypeStrings(bitcast.fromType);
                this.collectTypeStrings(bitcast.toType);
            },
            visitCallInst: (call: CallInst): void => {
                this.collectTypeStrings(call.calleeType);
            },
            visitCallDynInst: (callDyn: CallDynInst): void => {
                this.collectTypeStrings(callDyn.calleeType);
            },
            visitStructCreateInst: (sc: StructCreateInst): void => {
                this.collectTypeStrings(sc.structType);
            },
            visitStructGetInst: (sg: StructGetInst): void => {
                this.collectTypeStrings(sg.structType);
                this.collectTypeStrings(sg.fieldType);
            },
            visitEnumCreateInst: (ec: EnumCreateInst): void => {
                this.collectTypeStrings(ec.enumType);
            },
            visitEnumGetTagInst: (egt: EnumGetTagInst): void => {
                this.collectTypeStrings(egt.enumType);
            },
            visitEnumGetDataInst: (egd: EnumGetDataInst): void => {
                this.collectTypeStrings(egd.enumType);
                this.collectTypeStrings(egd.dataType);
            },
        };
        inst.accept(visitor, undefined);
    }

    // ========================================================================
    // Size Calculations
    // ========================================================================

    /**
     * Calculate the size of the string table section
     */
    private calculateStringTableSize(): number {
        const strings = this.strings.getStrings();
        let size = U32_BYTE_WIDTH; // Count
        for (const str of strings) {
            size += U32_BYTE_WIDTH; // Length
            size += this.utf8ByteLength(str);
        }
        return size;
    }

    /**
     * Calculate the size of the types section
     */
    private calculateTypesSize(module: IRModule): number {
        let size = U32_BYTE_WIDTH; // Struct count
        for (const struct of module.structs.values()) {
            size += U32_BYTE_WIDTH; // Name string id
            size += U32_BYTE_WIDTH; // Field count
            for (const field of struct.fields) {
                size += this.calculateTypeSize(field);
            }
        }
        size += U32_BYTE_WIDTH; // Enum count
        for (const enum_ of module.enums.values()) {
            size += U32_BYTE_WIDTH; // Name string id
            size += U32_BYTE_WIDTH; // Variant count
            for (const variant of enum_.variants) {
                size += U32_BYTE_WIDTH; // Field count
                for (const field of variant) {
                    size += this.calculateTypeSize(field);
                }
            }
        }
        return size;
    }

    /**
     * Calculate the size of the string literal section.
     */
    private calculateStringLiteralsSize(module: IRModule): number {
        let size = U32_BYTE_WIDTH; // Count
        for (const literal of module.stringLiterals) {
            size += U32_BYTE_WIDTH; // Byte length
            size += this.utf8ByteLength(literal);
        }
        return size;
    }

    /**
     * Calculate the encoded size of a type
     */
    private calculateTypeSize(ty: IRType): number {
        const visitor: IRTypeVisitor<number, void> = {
            visitIntType: (): number => 2, // Tag + width
            visitFloatType: (): number => 2, // Tag + width
            visitBoolType: (): number => 1, // Tag only
            visitPtrType: (): number => 1, // Tag only
            visitUnitType: (): number => 1, // Tag only
            visitStructType: (): number => TAG_AND_U32_WIDTH, // Tag + name string id
            visitEnumType: (): number => TAG_AND_U32_WIDTH, // Tag + name string id
            visitArrayType: (arrayTy: ArrayType): number =>
                TAG_AND_U32_WIDTH + this.calculateTypeSize(arrayTy.element),
            visitFnType: (fnTy: FnType): number => {
                let s = TAG_AND_U32_WIDTH; // Tag + param count
                for (const param of fnTy.params) {
                    s += this.calculateTypeSize(param);
                }
                s += this.calculateTypeSize(fnTy.returnType);
                return s;
            },
        };
        return ty.accept(visitor, undefined);
    }

    /**
     * Calculate the size of the globals section
     */
    private calculateGlobalsSize(module: IRModule): number {
        let size = U32_BYTE_WIDTH; // Count
        for (const global of module.globals) {
            size += U32_BYTE_WIDTH; // Name string id
            size += this.calculateTypeSize(global.ty);
            if (global.init !== undefined) {
                size += BYTE_WIDTH; // Has_init = 1
                size += this.calculateConstantSize(global.init);
            } else {
                size += BYTE_WIDTH; // Has_init = 0
            }
        }
        return size;
    }

    /**
     * Calculate the encoded size of a constant value
     */
    private calculateConstantSize(value: unknown): number {
        if (typeof value === "bigint") {
            return U64_BYTE_WIDTH;
        }
        if (typeof value === "number") {
            return U64_BYTE_WIDTH; // Use 64-bit for all numbers
        }
        if (typeof value === "boolean") {
            return BYTE_WIDTH;
        }
        return 0;
    }

    /**
     * Calculate the size of the functions section
     */
    private calculateFunctionsSize(module: IRModule): number {
        let size = U32_BYTE_WIDTH; // Count
        for (const fn of module.functions) {
            this.currentValueTypes.clear();
            size += U32_BYTE_WIDTH; // Name string id
            size += U32_BYTE_WIDTH; // Param count
            for (const param of fn.params) {
                size += this.calculateTypeSize(param.ty);
                size += U32_BYTE_WIDTH; // Id
                this.currentValueTypes.set(param.id, param.ty);
            }
            size += this.calculateTypeSize(fn.returnType);
            size += U32_BYTE_WIDTH; // Local count
            for (const local of fn.locals) {
                size += this.calculateTypeSize(local.ty);
                size += U32_BYTE_WIDTH; // Id
            }
            size += U32_BYTE_WIDTH; // Block count
            for (const block of fn.blocks) {
                for (const param of block.params) {
                    this.currentValueTypes.set(param.id, param.ty);
                }
                for (const inst of block.instructions) {
                    this.currentValueTypes.set(inst.id, inst.irType);
                }
                size += this.calculateBlockSize(block);
            }
        }
        return size;
    }

    /**
     * Calculate the encoded size of a block
     */
    private calculateBlockSize(block: IRBlock): number {
        let size = U32_BYTE_WIDTH; // Block id
        size += U32_BYTE_WIDTH; // Param count
        for (const param of block.params) {
            size += this.calculateTypeSize(param.ty);
            size += U32_BYTE_WIDTH; // Id
        }
        size += U32_BYTE_WIDTH; // Instruction count
        for (const inst of block.instructions) {
            size += this.calculateInstructionSize(inst);
        }
        size += this.calculateTerminatorSize(block.terminator);
        return size;
    }

    /**
     * Calculate the encoded size of an instruction
     */
    private calculateInstructionSize(inst: IRInst): number {
        let size = BYTE_WIDTH; // Opcode
        if (this.instructionHasResult(inst.kind)) {
            size += U32_BYTE_WIDTH; // Dest value id
        }
        size += this.calculateTypeSize(inst.irType);

        const visitor: IRInstVisitor<number, void> = {
            visitIconstInst: (): number => U64_BYTE_WIDTH, // Value (i64)
            visitFconstInst: (): number => U64_BYTE_WIDTH, // Value (f64)
            visitBconstInst: (): number => BYTE_WIDTH, // Value (bool)
            visitNullInst: (): number => 0, // No additional data
            visitSconstInst: (): number => U32_BYTE_WIDTH, // StringId
            visitIaddInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIsubInst: (): number => TWO_U32_WIDTH, // Left, right
            visitImulInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIdivInst: (): number => TWO_U32_WIDTH, // Left, right
            visitImodInst: (): number => TWO_U32_WIDTH, // Left, right
            visitFaddInst: (): number => TWO_U32_WIDTH, // Left, right
            visitFsubInst: (): number => TWO_U32_WIDTH, // Left, right
            visitFmulInst: (): number => TWO_U32_WIDTH, // Left, right
            visitFdivInst: (): number => TWO_U32_WIDTH, // Left, right
            visitInegInst: (): number => U32_BYTE_WIDTH, // Operand
            visitFnegInst: (): number => U32_BYTE_WIDTH, // Operand
            visitIandInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIorInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIxorInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIshlInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIshrInst: (): number => TWO_U32_WIDTH, // Left, right
            visitIcmpInst: (): number => TWO_U32_AND_TAG_WIDTH, // Left, right, op
            visitFcmpInst: (): number => TWO_U32_AND_TAG_WIDTH, // Left, right, op
            visitAllocaInst: (): number => U32_BYTE_WIDTH, // Local id
            visitLoadInst: (): number => U32_BYTE_WIDTH, // Ptr
            visitStoreInst: (store: StoreInst): number =>
                TWO_U32_WIDTH + this.calculateTypeSize(this.requireValueType(store.value)),
            visitMemcpyInst: (): number => THREE_U32_WIDTH, // Dest, src, size
            visitGepInst: (gep: GepInst): number => {
                let s = U32_BYTE_WIDTH; // Ptr
                s += U32_BYTE_WIDTH; // Index count
                s += U32_BYTE_WIDTH * gep.indices.length; // Indices
                return s;
            },
            visitPtraddInst: (): number => TWO_U32_WIDTH, // Ptr, offset
            visitTruncInst: (trunc: TruncInst): number =>
                U32_BYTE_WIDTH + this.calculateTypeSize(trunc.fromType),
            visitSextInst: (sext: SextInst): number =>
                U32_BYTE_WIDTH + this.calculateTypeSize(sext.fromType),
            visitZextInst: (zext: ZextInst): number =>
                U32_BYTE_WIDTH + this.calculateTypeSize(zext.fromType),
            visitFptouiInst: (): number => U32_BYTE_WIDTH,
            visitFptosiInst: (): number => U32_BYTE_WIDTH,
            visitUitofpInst: (): number => U32_BYTE_WIDTH,
            visitSitofpInst: (): number => U32_BYTE_WIDTH,
            visitBitcastInst: (): number => U32_BYTE_WIDTH,
            visitCallInst: (call: CallInst): number => {
                let s = U32_BYTE_WIDTH; // Callee
                s += U32_BYTE_WIDTH; // Arg count
                s += U32_BYTE_WIDTH * call.args.length; // Args
                return s;
            },
            visitCallDynInst: (callDyn: CallDynInst): number => {
                let s = U32_BYTE_WIDTH; // Callee (value id)
                s += U32_BYTE_WIDTH; // Arg count
                s += U32_BYTE_WIDTH * callDyn.args.length; // Args
                return s;
            },
            visitStructCreateInst: (sc: StructCreateInst): number => {
                let s = U32_BYTE_WIDTH; // Field count
                s += U32_BYTE_WIDTH * sc.fields.length; // Fields
                return s;
            },
            visitStructGetInst: (): number => TWO_U32_WIDTH,
            visitEnumCreateInst: (ec: EnumCreateInst): number => {
                let s = U32_BYTE_WIDTH; // Tag
                s += BYTE_WIDTH; // Has_data
                if (typeof ec.data === "number") {
                    s += U32_BYTE_WIDTH; // Data
                }
                return s;
            },
            visitEnumGetTagInst: (): number => U32_BYTE_WIDTH,
            visitEnumGetDataInst: (): number => THREE_U32_WIDTH,
        };
        size += inst.accept(visitor, undefined);
        return size;
    }

    /**
     * Calculate the encoded size of a terminator
     */
    private calculateTerminatorSize(term: IRTerm | undefined): number {
        if (!term) return BYTE_WIDTH; // Just tag (unreachable)

        const visitor: IRTermVisitor<number, void> = {
            visitRetTerm: (ret: RetTerm): number => {
                let size = BYTE_WIDTH; // Has_value flag
                if (typeof ret.value === "number") {
                    size += U32_BYTE_WIDTH; // Value
                }
                return size;
            },
            visitBrTerm: (br: BrTerm): number => {
                let size = U32_BYTE_WIDTH; // Target
                size += U32_BYTE_WIDTH; // Arg count
                size += U32_BYTE_WIDTH * br.args.length; // Args
                return size;
            },
            visitBrIfTerm: (brIf: BrIfTerm): number => {
                let size = U32_BYTE_WIDTH; // Condition
                size += U32_BYTE_WIDTH; // ThenBranch
                size += U32_BYTE_WIDTH; // ThenArgs count
                size += U32_BYTE_WIDTH * brIf.thenArgs.length; // Then args
                size += U32_BYTE_WIDTH; // ElseBranch
                size += U32_BYTE_WIDTH; // ElseArgs count
                size += U32_BYTE_WIDTH * brIf.elseArgs.length; // Else args
                return size;
            },
            visitSwitchTerm: (sw: SwitchTerm): number => {
                let size = U32_BYTE_WIDTH; // Value
                size += U32_BYTE_WIDTH; // Case count
                for (const c of sw.cases) {
                    size += U64_BYTE_WIDTH; // Case value (i64)
                    size += U32_BYTE_WIDTH; // Target
                    size += U32_BYTE_WIDTH; // Arg count
                    size += U32_BYTE_WIDTH * c.args.length; // Args
                }
                size += U32_BYTE_WIDTH; // DefaultBranch
                size += U32_BYTE_WIDTH; // DefaultArgs count
                size += U32_BYTE_WIDTH * sw.defaultArgs.length; // Default args
                return size;
            },
            visitUnreachableTerm: (): number => 0, // No additional data
        };

        return BYTE_WIDTH + term.accept(visitor, undefined); // Tag + additional data
    }

    // ========================================================================
    // Primitive Writers
    // ========================================================================

    private writeU8(value: number): void {
        this.view.setUint8(this.pos, value);
        this.pos += 1;
    }

    private writeU16(value: number): void {
        this.view.setUint16(this.pos, value, true);
        this.pos += 2;
    }

    private writeU32(value: number): void {
        this.view.setUint32(this.pos, value, true);
        this.pos += 4;
    }

    private writeU64(value: bigint): void {
        this.view.setBigUint64(this.pos, value, true);
        this.pos += 8;
    }

    private writeI32(value: number): void {
        this.view.setInt32(this.pos, value, true);
        this.pos += 4;
    }

    private writeI64(value: bigint): void {
        this.view.setBigInt64(this.pos, value, true);
        this.pos += 8;
    }

    private writeF32(value: number): void {
        this.view.setFloat32(this.pos, value, true);
        this.pos += 4;
    }

    private writeF64(value: number): void {
        this.view.setFloat64(this.pos, value, true);
        this.pos += 8;
    }

    private writeBytes(data: Uint8Array): void {
        const view = new Uint8Array(this.view.buffer);
        view.set(data, this.pos);
        this.pos += data.length;
    }

    // ========================================================================
    // Section Writers
    // ========================================================================

    private writeStringTableSection(): void {
        const strings = this.strings.getStrings();
        this.writeU32(strings.length);
        for (const str of strings) {
            const bytes = this.encodeUtf8(str);
            this.writeU32(bytes.length);
            this.writeBytes(bytes);
        }
    }

    private writeTypesSection(module: IRModule): void {
        // Write structs
        this.writeU32(module.structs.size);
        for (const [name, struct] of module.structs) {
            this.writeU32(this.strings.addString(name));
            this.writeU32(struct.fields.length);
            for (const field of struct.fields) {
                this.writeType(field);
            }
        }

        // Write enums
        this.writeU32(module.enums.size);
        for (const [name, enum_] of module.enums) {
            this.writeU32(this.strings.addString(name));
            this.writeU32(enum_.variants.length);
            for (const variant of enum_.variants) {
                this.writeU32(variant.length);
                for (const field of variant) {
                    this.writeType(field);
                }
            }
        }
    }

    private writeStringLiteralsSection(module: IRModule): void {
        this.writeU32(module.stringLiterals.length);
        for (const literal of module.stringLiterals) {
            const bytes = this.encodeUtf8(literal);
            this.writeU32(bytes.length);
            this.writeBytes(bytes);
        }
    }

    private writeGlobalsSection(module: IRModule): void {
        this.writeU32(module.globals.length);
        for (const global of module.globals) {
            this.writeU32(this.strings.addString(global.name));
            this.writeType(global.ty);
            if (global.init !== undefined) {
                this.writeU8(1);
                this.writeConstant(global.init, global.ty);
            } else {
                this.writeU8(0);
            }
        }
    }

    private writeFunctionsSection(module: IRModule): void {
        this.writeU32(module.functions.length);
        for (const fn of module.functions) {
            this.writeFunction(fn);
        }
    }

    // ========================================================================
    // Type Encoding
    // ========================================================================

    private writeType(ty: IRType): void {
        this.writeU8(ty.kind);
        const visitor: IRTypeVisitor<void, void> = {
            visitIntType: (intTy: IntType): void => {
                this.writeU8(intTy.width);
            },
            visitFloatType: (floatTy: FloatType): void => {
                this.writeU8(floatTy.width);
            },
            visitBoolType(): void {
                // No additional data
            },
            visitPtrType(): void {
                // No additional data
            },
            visitUnitType(): void {
                // No additional data
            },
            visitStructType: (structTy: StructType): void => {
                this.writeU32(this.strings.addString(structTy.name));
            },
            visitEnumType: (enumTy: EnumType): void => {
                this.writeU32(this.strings.addString(enumTy.name));
            },
            visitArrayType: (arrayTy: ArrayType): void => {
                this.writeU32(arrayTy.length);
                this.writeType(arrayTy.element);
            },
            visitFnType: (fnTy: FnType): void => {
                this.writeU32(fnTy.params.length);
                for (const param of fnTy.params) {
                    this.writeType(param);
                }
                this.writeType(fnTy.returnType);
            },
        };
        ty.accept(visitor, undefined);
    }

    // ========================================================================
    // Constant Encoding
    // ========================================================================

    private writeConstant(value: unknown, ty: IRType): void {
        // Handle constants based on type kind directly
        if (ty.kind === IRTypeKind.Int) {
            if (typeof value === "bigint") {
                this.writeI64(value);
            } else if (typeof value === "number") {
                this.writeI64(BigInt(value));
            }
        } else if (ty.kind === IRTypeKind.Float) {
            if (typeof value === "number") {
                this.writeF64(value);
            }
        } else if (ty.kind === IRTypeKind.Bool) {
            if (typeof value === "boolean") {
                this.writeU8(value ? 1 : 0);
            }
        }
    }

    // ========================================================================
    // Function Encoding
    // ========================================================================

    private writeFunction(fn: IRFunction): void {
        this.currentValueTypes.clear();
        this.writeU32(this.strings.addString(fn.name));

        // Parameters
        this.writeU32(fn.params.length);
        for (const param of fn.params) {
            this.writeType(param.ty);
            this.writeU32(param.id);
            this.currentValueTypes.set(param.id, param.ty);
        }

        // Return type
        this.writeType(fn.returnType);

        // Locals
        this.writeU32(fn.locals.length);
        for (const local of fn.locals) {
            this.writeType(local.ty);
            this.writeU32(local.id);
        }

        // Blocks
        this.writeU32(fn.blocks.length);
        for (const block of fn.blocks) {
            for (const param of block.params) {
                this.currentValueTypes.set(param.id, param.ty);
            }
            for (const inst of block.instructions) {
                this.currentValueTypes.set(inst.id, inst.irType);
            }
            this.writeBlock(block);
        }
    }

    // ========================================================================
    // Block Encoding
    // ========================================================================

    private writeBlock(block: IRBlock): void {
        this.writeU32(block.id);

        // Block parameters
        this.writeU32(block.params.length);
        for (const param of block.params) {
            this.writeType(param.ty);
            this.writeU32(param.id);
        }

        // Instructions
        this.writeU32(block.instructions.length);
        for (const inst of block.instructions) {
            this.writeInstruction(inst);
        }

        // Terminator
        this.writeTerminator(block.terminator);
    }

    // ========================================================================
    // Instruction Encoding
    // ========================================================================

    private writeInstruction(inst: IRInst): void {
        this.writeU8(toBinaryInstKind(inst.kind));
        if (this.instructionHasResult(inst.kind)) {
            this.writeU32(inst.id);
        }
        this.writeType(inst.irType);

        const visitor: IRInstVisitor<void, void> = {
            visitIconstInst: (i: IconstInst): void => {
                if (typeof i.value === "bigint") {
                    this.writeI64(i.value);
                } else {
                    this.writeI64(BigInt(i.value));
                }
            },
            visitFconstInst: (i: FconstInst): void => {
                this.writeF64(i.value);
            },
            visitBconstInst: (i: BconstInst): void => {
                this.writeU8(i.value ? 1 : 0);
            },
            visitNullInst(): void {
                // No additional data
            },
            visitSconstInst: (i: SconstInst): void => {
                this.writeU32(i.stringId);
            },
            visitIaddInst: (i: IaddInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIsubInst: (i: IsubInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitImulInst: (i: ImulInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIdivInst: (i: IdivInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitImodInst: (i: ImodInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitFaddInst: (i: FaddInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitFsubInst: (i: FsubInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitFmulInst: (i: FmulInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitFdivInst: (i: FdivInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitInegInst: (i: InegInst): void => {
                this.writeU32(i.operand);
            },
            visitFnegInst: (i: FnegInst): void => {
                this.writeU32(i.operand);
            },
            visitIandInst: (i: IandInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIorInst: (i: IorInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIxorInst: (i: IxorInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIshlInst: (i: IshlInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIshrInst: (i: IshrInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
            },
            visitIcmpInst: (i: IcmpInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
                this.writeU8(i.op);
            },
            visitFcmpInst: (i: FcmpInst): void => {
                this.writeU32(i.left);
                this.writeU32(i.right);
                this.writeU8(i.op);
            },
            visitAllocaInst: (i: AllocaInst): void => {
                this.writeU32(i.id);
            },
            visitLoadInst: (i: LoadInst): void => {
                this.writeU32(i.ptr);
            },
            visitStoreInst: (i: StoreInst): void => {
                this.writeU32(i.ptr);
                this.writeU32(i.value);
                this.writeType(this.requireValueType(i.value));
            },
            visitMemcpyInst: (i: MemcpyInst): void => {
                this.writeU32(i.dest);
                this.writeU32(i.src);
                this.writeU32(i.size);
            },
            visitGepInst: (i: GepInst): void => {
                this.writeU32(i.ptr);
                this.writeU32(i.indices.length);
                for (const idx of i.indices) {
                    this.writeU32(idx);
                }
            },
            visitPtraddInst: (i: PtraddInst): void => {
                this.writeU32(i.ptr);
                this.writeU32(i.offset);
            },
            visitTruncInst: (i: TruncInst): void => {
                this.writeU32(i.operand);
                this.writeType(i.fromType);
            },
            visitSextInst: (i: SextInst): void => {
                this.writeU32(i.operand);
                this.writeType(i.fromType);
            },
            visitZextInst: (i: ZextInst): void => {
                this.writeU32(i.operand);
                this.writeType(i.fromType);
            },
            visitFptouiInst: (i: FptouiInst): void => {
                this.writeU32(i.operand);
            },
            visitFptosiInst: (i: FptosiInst): void => {
                this.writeU32(i.operand);
            },
            visitUitofpInst: (i: UitofpInst): void => {
                this.writeU32(i.operand);
            },
            visitSitofpInst: (i: SitofpInst): void => {
                this.writeU32(i.operand);
            },
            visitBitcastInst: (i: BitcastInst): void => {
                this.writeU32(i.operand);
            },
            visitCallInst: (i: CallInst): void => {
                this.writeU32(i.callee);
                this.writeU32(i.args.length);
                for (const arg of i.args) {
                    this.writeU32(arg);
                }
            },
            visitCallDynInst: (i: CallDynInst): void => {
                this.writeU32(i.callee);
                this.writeU32(i.args.length);
                for (const arg of i.args) {
                    this.writeU32(arg);
                }
            },
            visitStructCreateInst: (i: StructCreateInst): void => {
                this.writeU32(i.fields.length);
                for (const field of i.fields) {
                    this.writeU32(field);
                }
            },
            visitStructGetInst: (i: StructGetInst): void => {
                this.writeU32(i.struct);
                this.writeU32(i.index);
            },
            visitEnumCreateInst: (i: EnumCreateInst): void => {
                this.writeU32(i.tag);
                if (typeof i.data === "number") {
                    this.writeU8(1);
                    this.writeU32(i.data);
                } else {
                    this.writeU8(0);
                }
            },
            visitEnumGetTagInst: (i: EnumGetTagInst): void => {
                this.writeU32(i.enum_);
            },
            visitEnumGetDataInst: (i: EnumGetDataInst): void => {
                this.writeU32(i.enum_);
                this.writeU32(0);
                this.writeU32(0);
            },
        };
        inst.accept(visitor, undefined);
    }

    private instructionHasResult(kind: IRInstKind): boolean {
        return kind !== IRInstKind.Store && kind !== IRInstKind.Memcpy;
    }

    private requireValueType(valueId: ValueId): IRType {
        const valueType = this.currentValueTypes.get(valueId);
        if (typeof valueType !== "undefined") {
            return valueType;
        }
        throw new Error(`Missing value type for operand v${String(valueId)}`);
    }

    // ========================================================================
    // Terminator Encoding
    // ========================================================================

    private writeTerminator(term: IRTerm | undefined): void {
        if (!term) {
            this.writeU8(IRTermKind.Unreachable);
            return;
        }

        this.writeU8(term.kind);

        const visitor: IRTermVisitor<void, void> = {
            visitRetTerm: (t: RetTerm): void => {
                if (typeof t.value === "number") {
                    this.writeU8(1);
                    this.writeU32(t.value);
                } else {
                    this.writeU8(0);
                }
            },
            visitBrTerm: (t: BrTerm): void => {
                this.writeU32(t.target);
                this.writeU32(t.args.length);
                for (const arg of t.args) {
                    this.writeU32(arg);
                }
            },
            visitBrIfTerm: (t: BrIfTerm): void => {
                this.writeU32(t.condition);
                this.writeU32(t.thenBranch);
                this.writeU32(t.thenArgs.length);
                for (const arg of t.thenArgs) {
                    this.writeU32(arg);
                }
                this.writeU32(t.elseBranch);
                this.writeU32(t.elseArgs.length);
                for (const arg of t.elseArgs) {
                    this.writeU32(arg);
                }
            },
            visitSwitchTerm: (t: SwitchTerm): void => {
                this.writeU32(t.value);
                this.writeU32(t.cases.length);
                for (const c of t.cases) {
                    if (typeof c.value === "bigint") {
                        this.writeI64(c.value);
                    } else {
                        this.writeI64(BigInt(c.value));
                    }
                    this.writeU32(c.target);
                    this.writeU32(c.args.length);
                    for (const arg of c.args) {
                        this.writeU32(arg);
                    }
                }
                this.writeU32(t.defaultBranch);
                this.writeU32(t.defaultArgs.length);
                for (const arg of t.defaultArgs) {
                    this.writeU32(arg);
                }
            },
            visitUnreachableTerm(): void {
                // No additional data
            },
        };
        term.accept(visitor, undefined);
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    private encodeUtf8(str: string): Uint8Array {
        return new TextEncoder().encode(str);
    }

    private utf8ByteLength(str: string): number {
        return new TextEncoder().encode(str).length;
    }
}

/**
 * Serialize an IR module to binary format
 */
export function serializeModule(module: IRModule): Uint8Array {
    const serializer = new IRSerializer();
    return serializer.serializeModule(module);
}
