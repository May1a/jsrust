import { Result } from "better-result";
import { match, P } from "ts-pattern";
import {
    AllocaInst,
    ArrayType,
    BconstInst,
    BitcastInst,
    BoolType,
    BrIfTerm,
    BrTerm,
    CallDynInst,
    CallInst,
    EnumCreateInst,
    EnumGetDataInst,
    EnumGetTagInst,
    EnumType,
    FaddInst,
    FcmpInst,
    FcmpOp,
    FconstInst,
    FdivInst,
    FloatType,
    FloatWidth,
    FmulInst,
    FnegInst,
    FptosiInst,
    FptouiInst,
    FsubInst,
    FnType,
    GepInst,
    IaddInst,
    IandInst,
    IcmpInst,
    IcmpOp,
    IconstInst,
    IdivInst,
    ImodInst,
    ImulInst,
    InegInst,
    IntType,
    IntWidth,
    IorInst,
    IshlInst,
    IshrInst,
    IsubInst,
    IxorInst,
    LoadInst,
    MemcpyInst,
    NullInst,
    OpaquePtrType,
    PtrType,
    PtraddInst,
    RetTerm,
    SconstInst,
    SextInst,
    SitofpInst,
    StoreInst,
    StructCreateInst,
    StructGetInst,
    StructType,
    SwitchTerm,
    TruncInst,
    UitofpInst,
    UnitType,
    UnreachableTerm,
    ZextInst,
    getIREnumTypeKey,
    type BlockId,
    type IRBlock,
    type IRFunction,
    type IRInst,
    type IRModule,
    type IRTerm,
    type IRType,
    type ValueId,
} from "../ir/ir";
import { hashName } from "../passes/module_metadata";
import { BUILTIN_SYMBOLS } from "../utils/builtin_symbols";
import {
    LLVM_DOUBLE,
    LLVM_FLOAT,
    LLVM_I1,
    LLVM_I8,
    LLVM_I32,
    LLVM_I64,
    LLVM_PTR,
    LLVM_VOID,
    llvmArray,
    llvmInteger,
    llvmNamed,
    llvmStruct,
    type LlvmBlock,
    type LlvmDeclaration,
    type LlvmFunction,
    type LlvmGlobal,
    type LlvmModule,
    type LlvmNamedType,
    type LlvmType,
} from "./model";
import { llvmGlobalName, llvmLocalName, llvmTypeName } from "./print";

export const DEFAULT_LLVM_VERSION = "22.1.5";

type LoweredValue = {
    ref: string;
    type: LlvmType;
    irType: IRType;
};

type EmitFailure = {
    message: string;
};

type Incoming = {
    value: ValueId;
    pred: BlockId;
};

const FORMAT_TAG = {
    String: 0,
    Int: 1,
    Float: 2,
    Bool: 3,
    Char: 4,
} as const;

const C_STRING_NUL = String.raw`\00`;
const ASCII_PRINTABLE_MIN = 32;
const ASCII_PRINTABLE_MAX = 126;
const HEX_RADIX = 16;
const HASH_FACTOR = 31;
const I8_BITS = 8;
const I16_BITS = 16;
const I32_BITS = 32;
const I64_BITS = 64;
const I128_BITS = 128;
const FIRST_ARG_INDEX = 1;
const TAG_VALUE_PAIR_WIDTH = 2;

function escapeCString(value: string): string {
    let escaped = "";
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        if (char === "\\") {
            escaped += String.raw`\5C`;
        } else if (char === "\"") {
            escaped += String.raw`\22`;
        } else if (char === "\n") {
            escaped += String.raw`\0A`;
        } else if (char === "\t") {
            escaped += String.raw`\09`;
        } else if (
            code < ASCII_PRINTABLE_MIN ||
            code > ASCII_PRINTABLE_MAX
        ) {
            escaped += `\\${code
                .toString(HEX_RADIX)
                .padStart(2, "0")
                .toUpperCase()}`;
        } else {
            escaped += char;
        }
    }
    return escaped;
}

function sanitizeTypeName(value: string): string {
    const sanitized = value.replace(/[^A-Za-z0-9_.]/g, "_");
    if (/^[A-Za-z_]/.test(sanitized)) {
        return sanitized;
    }
    return `t_${sanitized}`;
}

function displayStructName(name: string): string {
    const parts = name.split("__");
    return parts[parts.length - 1] ?? name;
}

function stableTypeHash(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
        hash = (Math.imul(hash, HASH_FACTOR) + value.charCodeAt(index)) | 0;
    }
    if (hash < 0) {
        hash = -hash;
    }
    return String(hash);
}

function intBits(width: IntWidth): number {
    const widths: Record<IntWidth, number> = {
        [IntWidth.I8]: I8_BITS,
        [IntWidth.I16]: I16_BITS,
        [IntWidth.I32]: I32_BITS,
        [IntWidth.I64]: I64_BITS,
        [IntWidth.I128]: I128_BITS,
        [IntWidth.Isize]: I64_BITS,
        [IntWidth.U8]: I8_BITS,
        [IntWidth.U16]: I16_BITS,
        [IntWidth.U32]: I32_BITS,
        [IntWidth.U64]: I64_BITS,
        [IntWidth.U128]: I128_BITS,
        [IntWidth.Usize]: I64_BITS,
    };
    return widths[width];
}

function isVoidType(type: LlvmType): boolean {
    return type.kind === "void";
}

function local(id: ValueId): string {
    return llvmLocalName(`v${String(id)}`);
}

function blockName(block: IRBlock): string {
    return `b${String(block.id)}`;
}

function blockRef(blockId: BlockId): string {
    return `%b${String(blockId)}`;
}

function fail(message: string): Result<never, EmitFailure> {
    return Result.err({ message });
}

class LlvmEmitter {
    private readonly module: IRModule;
    private readonly namedTypes = new Map<string, LlvmNamedType>();
    private readonly globals = new Map<string, LlvmGlobal>();
    private readonly declarations = new Map<string, LlvmDeclaration>();
    private readonly values = new Map<ValueId, LoweredValue>();
    private readonly functionNames = new Map<number, string>();
    private readonly functionsById = new Map<number, IRFunction>();
    private readonly blockIncoming = new Map<string, Incoming[]>();
    private readonly emittedFunctions: LlvmFunction[] = [];
    private currentFunctionReturnType: LlvmType = LLVM_VOID;
    private currentIrFunctionReturnType: IRType = new UnitType();
    private tempIndex = 0;
    private stringGlobalIndex = 0;

    constructor(module: IRModule) {
        this.module = module;
        for (const fn of module.functions) {
            this.functionNames.set(fn.id, fn.name);
            this.functionsById.set(fn.id, fn);
        }
        for (const name of Object.values(BUILTIN_SYMBOLS)) {
            this.functionNames.set(hashName(name), name);
        }
    }

    emit(): Result<LlvmModule, EmitFailure> {
        this.seedRuntimeGlobals();
        this.seedModuleTypes();
        for (const fn of this.module.functions) {
            const fnResult = this.emitFunction(fn);
            if (fnResult.isErr()) {
                return fnResult;
            }
            this.emittedFunctions.push(fnResult.value);
        }

        return Result.ok({
            sourceName: this.module.name,
            targetVersion: DEFAULT_LLVM_VERSION,
            namedTypes: [...this.namedTypes.values()],
            globals: [...this.globals.values()],
            declarations: [...this.declarations.values()],
            functions: this.emittedFunctions,
        });
    }

    private seedRuntimeGlobals(): void {
        this.declarations.set("printf", {
            name: "printf",
            returnType: LLVM_I32,
            params: [LLVM_PTR],
            varargs: true,
        });
        this.addCString("__jsrust_bool_true", "true");
        this.addCString("__jsrust_bool_false", "false");
    }

    private seedModuleTypes(): void {
        for (const structType of this.module.structs.values()) {
            this.llvmType(structType);
        }
        for (const enumType of this.module.enums.values()) {
            this.llvmType(enumType);
        }
    }

    private addNamedType(name: string, type: LlvmType): void {
        if (this.namedTypes.has(name)) {
            return;
        }
        this.namedTypes.set(name, { name, type });
    }

    private addCString(name: string, value: string): { name: string; type: LlvmType } {
        const encoded = `${escapeCString(value)}${C_STRING_NUL}`;
        const length = Buffer.byteLength(`${value}\0`, "utf8");
        const type = llvmArray(length, LLVM_I8);
        if (!this.globals.has(name)) {
            this.globals.set(name, {
                name,
                type,
                initializer: `c"${encoded}"`,
                linkage: "private",
                unnamedAddr: true,
            });
        }
        return { name, type };
    }

    private stringPointer(name: string, type: LlvmType): string {
        return `getelementptr inbounds (${llvmTypeName(type)}, ptr ${llvmGlobalName(
            name,
        )}, i64 0, i64 0)`;
    }

    private llvmType(type: IRType): LlvmType {
        if (type instanceof IntType) {
            return llvmInteger(intBits(type.width));
        }
        if (type instanceof FloatType) {
            return match(type.width)
                .with(FloatWidth.F32, () => LLVM_FLOAT)
                .otherwise(() => LLVM_DOUBLE);
        }
        if (type instanceof BoolType) {
            return LLVM_I1;
        }
        if (type instanceof OpaquePtrType) {
            return LLVM_PTR;
        }
        if (type instanceof PtrType) {
            return LLVM_PTR;
        }
        if (type instanceof UnitType) {
            return LLVM_VOID;
        }
        if (type instanceof StructType) {
            if (
                type.name === "Self" &&
                this.currentIrFunctionReturnType instanceof StructType &&
                this.currentIrFunctionReturnType.name !== "Self"
            ) {
                return this.llvmType(this.currentIrFunctionReturnType);
            }
            const name = sanitizeTypeName(
                `struct.${displayStructName(type.name)}`,
            );
            this.addNamedType(name, llvmStruct(type.fields.map((field) => this.llvmType(field))));
            return llvmNamed(name);
        }
        if (type instanceof EnumType) {
            return this.llvmEnumType(type);
        }
        if (type instanceof ArrayType) {
            return llvmArray(type.length, this.llvmType(type.element));
        }
        if (type instanceof FnType) {
            return LLVM_PTR;
        }
        return LLVM_PTR;
    }

    private llvmEnumType(type: EnumType): LlvmType {
        const enumKey = getIREnumTypeKey(type);
        const enumName = sanitizeTypeName(
            `enum.${type.name}.${stableTypeHash(enumKey)}`,
        );
        const payloadTypes = type.variants.map((fields, index) => {
            const payloadName = sanitizeTypeName(`${enumName}.v${String(index)}`);
            this.addNamedType(
                payloadName,
                llvmStruct(fields.map((field) => this.llvmType(field))),
            );
            return llvmNamed(payloadName);
        });
        this.addNamedType(enumName, llvmStruct([LLVM_I64, ...payloadTypes]));
        return llvmNamed(enumName);
    }

    private value(valueId: ValueId): Result<LoweredValue, EmitFailure> {
        const found = this.values.get(valueId);
        if (found !== undefined) {
            return Result.ok(found);
        }
        return fail(`LLVM emission missing value v${String(valueId)}`);
    }

    private defineValue(valueId: ValueId, value: LoweredValue): void {
        this.values.set(valueId, value);
    }

    private fresh(prefix: string): string {
        const value = `${prefix}.${String(this.tempIndex)}`;
        this.tempIndex++;
        return llvmLocalName(value);
    }

    private collectBlockIncoming(fn: IRFunction): void {
        this.blockIncoming.clear();
        for (const block of fn.blocks) {
            const term = block.terminator;
            if (term instanceof BrTerm) {
                this.addIncoming(term.target, block.id, term.args);
            }
            if (term instanceof BrIfTerm) {
                this.addIncoming(term.thenBranch, block.id, term.thenArgs);
                this.addIncoming(term.elseBranch, block.id, term.elseArgs);
            }
            if (term instanceof SwitchTerm) {
                this.addIncoming(term.defaultBranch, block.id, term.defaultArgs);
                for (const switchCase of term.cases) {
                    this.addIncoming(switchCase.target, block.id, switchCase.args);
                }
            }
        }
    }

    private addIncoming(target: BlockId, pred: BlockId, args: ValueId[]): void {
        for (let index = 0; index < args.length; index++) {
            const key = `${String(target)}:${String(index)}`;
            const list = this.blockIncoming.get(key) ?? [];
            list.push({ value: args[index], pred });
            this.blockIncoming.set(key, list);
        }
    }

    private emitFunction(fn: IRFunction): Result<LlvmFunction, EmitFailure> {
        this.values.clear();
        this.collectBlockIncoming(fn);
        this.currentIrFunctionReturnType = fn.returnType;
        this.currentFunctionReturnType = this.llvmFunctionReturnType(
            fn.returnType,
        );

        const params = fn.params.map((param) => {
            const type = this.llvmType(param.ty);
            this.defineValue(param.id, {
                ref: local(param.id),
                type,
                irType: param.ty,
            });
            return { name: `v${String(param.id)}`, type };
        });

        const blocks: LlvmBlock[] = [];
        for (const block of fn.blocks) {
            const blockResult = this.emitBlock(block);
            if (blockResult.isErr()) {
                return blockResult;
            }
            blocks.push(blockResult.value);
        }

        return Result.ok({
            name: fn.name,
            returnType: this.currentFunctionReturnType,
            params,
            blocks,
        });
    }

    private llvmFunctionReturnType(type: IRType): LlvmType {
        if (type instanceof UnitType) {
            return LLVM_I32;
        }
        return this.llvmType(type);
    }

    private emitBlock(block: IRBlock): Result<LlvmBlock, EmitFailure> {
        const lines: string[] = [];
        for (let index = 0; index < block.params.length; index++) {
            const param = block.params[index];
            const type = this.llvmType(param.ty);
            const incoming = this.blockIncoming.get(`${String(block.id)}:${String(index)}`) ?? [];
            if (incoming.length === 0) {
                return fail(`block ${block.name} parameter has no incoming values`);
            }
            const incomingParts: string[] = [];
            for (const item of incoming) {
                const incomingValue = this.value(item.value);
                if (incomingValue.isErr()) {
                    return incomingValue;
                }
                incomingParts.push(`[ ${incomingValue.value.ref}, ${blockRef(item.pred)} ]`);
            }
            lines.push(
                `${local(param.id)} = phi ${llvmTypeName(type)} ${incomingParts.join(", ")}`,
            );
            this.defineValue(param.id, {
                ref: local(param.id),
                type,
                irType: param.ty,
            });
        }

        for (const inst of block.instructions) {
            const instResult = this.emitInstruction(inst, lines);
            if (instResult.isErr()) {
                return instResult;
            }
        }

        if (block.terminator === undefined) {
            return fail(`block ${block.name} has no terminator`);
        }
        const terminator = this.emitTerminator(block.terminator);
        if (terminator.isErr()) {
            return terminator;
        }

        return Result.ok({
            name: blockName(block),
            lines,
            terminator: terminator.value,
        });
    }

    private emitInstruction(
        inst: IRInst,
        lines: string[],
    ): Result<void, EmitFailure> {
        const constantResult = this.emitConstantInstruction(inst);
        if (constantResult !== undefined) {
            return constantResult;
        }
        const arithmeticResult = this.emitArithmeticInstruction(inst, lines);
        if (arithmeticResult !== undefined) {
            return arithmeticResult;
        }
        const memoryResult = this.emitMemoryInstruction(inst, lines);
        if (memoryResult !== undefined) {
            return memoryResult;
        }
        const conversionResult = this.emitConversionInstruction(inst, lines);
        if (conversionResult !== undefined) {
            return conversionResult;
        }
        const aggregateResult = this.emitAggregateInstruction(inst, lines);
        if (aggregateResult !== undefined) {
            return aggregateResult;
        }
        return fail(`unsupported SSA instruction ${inst.constructor.name}`);
    }

    private emitConstantInstruction(
        inst: IRInst,
    ): Result<void, EmitFailure> | undefined {
        if (inst instanceof IconstInst || inst instanceof FconstInst) {
            const type = this.llvmType(inst.irType);
            this.defineValue(inst.id, {
                ref: String(inst.value),
                type,
                irType: inst.irType,
            });
            return Result.ok();
        }
        if (inst instanceof BconstInst) {
            this.defineValue(inst.id, {
                ref: match(inst.value)
                    .with(true, () => "true")
                    .otherwise(() => "false"),
                type: LLVM_I1,
                irType: inst.irType,
            });
            return Result.ok();
        }
        if (inst instanceof NullInst) {
            this.defineValue(inst.id, {
                ref: "null",
                type: LLVM_PTR,
                irType: inst.irType,
            });
            return Result.ok();
        }
        if (inst instanceof SconstInst) {
            const literal = this.module.stringLiterals[inst.stringId] ?? "";
            const global = this.addCString(
                `.str.${String(inst.stringId)}`,
                literal,
            );
            this.defineValue(inst.id, {
                ref: this.stringPointer(global.name, global.type),
                type: LLVM_PTR,
                irType: inst.irType,
            });
            return Result.ok();
        }
        return undefined;
    }

    private emitArithmeticInstruction(
        inst: IRInst,
        lines: string[],
    ): Result<void, EmitFailure> | undefined {
        if (inst instanceof IaddInst) return this.emitBinary(inst, "add", inst.left, inst.right, lines);
        if (inst instanceof IsubInst) return this.emitBinary(inst, "sub", inst.left, inst.right, lines);
        if (inst instanceof ImulInst) return this.emitBinary(inst, "mul", inst.left, inst.right, lines);
        if (inst instanceof IdivInst) return this.emitBinary(inst, "sdiv", inst.left, inst.right, lines);
        if (inst instanceof ImodInst) return this.emitBinary(inst, "srem", inst.left, inst.right, lines);
        if (inst instanceof FaddInst) return this.emitBinary(inst, "fadd", inst.left, inst.right, lines);
        if (inst instanceof FsubInst) return this.emitBinary(inst, "fsub", inst.left, inst.right, lines);
        if (inst instanceof FmulInst) return this.emitBinary(inst, "fmul", inst.left, inst.right, lines);
        if (inst instanceof FdivInst) return this.emitBinary(inst, "fdiv", inst.left, inst.right, lines);
        if (inst instanceof InegInst) return this.emitNeg(inst, "sub", "0", inst.operand, lines);
        if (inst instanceof FnegInst) return this.emitNeg(inst, "fsub", "-0.000000e+00", inst.operand, lines);
        if (inst instanceof IandInst) return this.emitBinary(inst, "and", inst.left, inst.right, lines);
        if (inst instanceof IorInst) return this.emitBinary(inst, "or", inst.left, inst.right, lines);
        if (inst instanceof IxorInst) return this.emitBinary(inst, "xor", inst.left, inst.right, lines);
        if (inst instanceof IshlInst) return this.emitBinary(inst, "shl", inst.left, inst.right, lines);
        if (inst instanceof IshrInst) return this.emitBinary(inst, "ashr", inst.left, inst.right, lines);
        if (inst instanceof IcmpInst) return this.emitIcmp(inst, lines);
        if (inst instanceof FcmpInst) return this.emitFcmp(inst, lines);
        return undefined;
    }

    private emitMemoryInstruction(
        inst: IRInst,
        lines: string[],
    ): Result<void, EmitFailure> | undefined {
        if (inst instanceof AllocaInst) return this.emitAlloca(inst, lines);
        if (inst instanceof LoadInst) return this.emitLoad(inst, lines);
        if (inst instanceof StoreInst) return this.emitStore(inst, lines);
        if (inst instanceof MemcpyInst) return Result.ok();
        if (inst instanceof GepInst) return this.emitGep(inst, lines);
        if (inst instanceof PtraddInst) return this.emitPtradd(inst, lines);
        return undefined;
    }

    private emitConversionInstruction(
        inst: IRInst,
        lines: string[],
    ): Result<void, EmitFailure> | undefined {
        if (inst instanceof TruncInst) return this.emitCast(inst, "trunc", inst.operand, inst.toType, lines);
        if (inst instanceof SextInst) return this.emitCast(inst, "sext", inst.operand, inst.toType, lines);
        if (inst instanceof ZextInst) return this.emitCast(inst, "zext", inst.operand, inst.toType, lines);
        if (inst instanceof FptouiInst) return this.emitCast(inst, "fptoui", inst.operand, inst.toType, lines);
        if (inst instanceof FptosiInst) return this.emitCast(inst, "fptosi", inst.operand, inst.toType, lines);
        if (inst instanceof UitofpInst) return this.emitCast(inst, "uitofp", inst.operand, inst.toType, lines);
        if (inst instanceof SitofpInst) return this.emitCast(inst, "sitofp", inst.operand, inst.toType, lines);
        if (inst instanceof BitcastInst) return this.emitCast(inst, "bitcast", inst.operand, inst.toType, lines);
        return undefined;
    }

    private emitAggregateInstruction(
        inst: IRInst,
        lines: string[],
    ): Result<void, EmitFailure> | undefined {
        if (inst instanceof CallInst) return this.emitCall(inst, lines);
        if (inst instanceof CallDynInst) return this.emitCallDyn(inst, lines);
        if (inst instanceof StructCreateInst) return this.emitStructCreate(inst, lines);
        if (inst instanceof StructGetInst) return this.emitStructGet(inst, lines);
        if (inst instanceof EnumCreateInst) return this.emitEnumCreate(inst, lines);
        if (inst instanceof EnumGetTagInst) return this.emitEnumGetTag(inst, lines);
        if (inst instanceof EnumGetDataInst) return this.emitEnumGetData(inst, lines);
        return undefined;
    }

    private emitBinary(
        inst: IRInst,
        opcode: string,
        leftId: ValueId,
        rightId: ValueId,
        lines: string[],
    ): Result<void, EmitFailure> {
        const left = this.value(leftId);
        const right = this.value(rightId);
        if (left.isErr()) return left;
        if (right.isErr()) return right;
        const type = this.llvmType(inst.irType);
        lines.push(
            `${local(inst.id)} = ${opcode} ${llvmTypeName(type)} ${left.value.ref}, ${right.value.ref}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitNeg(
        inst: IRInst,
        opcode: string,
        zero: string,
        operandId: ValueId,
        lines: string[],
    ): Result<void, EmitFailure> {
        const operand = this.value(operandId);
        if (operand.isErr()) return operand;
        const type = this.llvmType(inst.irType);
        lines.push(`${local(inst.id)} = ${opcode} ${llvmTypeName(type)} ${zero}, ${operand.value.ref}`);
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitIcmp(inst: IcmpInst, lines: string[]): Result<void, EmitFailure> {
        const left = this.value(inst.left);
        const right = this.value(inst.right);
        if (left.isErr()) return left;
        if (right.isErr()) return right;
        const names: Record<IcmpOp, string> = {
            [IcmpOp.Eq]: "eq",
            [IcmpOp.Ne]: "ne",
            [IcmpOp.Slt]: "slt",
            [IcmpOp.Sle]: "sle",
            [IcmpOp.Sgt]: "sgt",
            [IcmpOp.Sge]: "sge",
            [IcmpOp.Ult]: "ult",
            [IcmpOp.Ule]: "ule",
            [IcmpOp.Ugt]: "ugt",
            [IcmpOp.Uge]: "uge",
        };
        const op = names[inst.op];
        lines.push(
            `${local(inst.id)} = icmp ${op} ${llvmTypeName(left.value.type)} ${left.value.ref}, ${right.value.ref}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type: LLVM_I1, irType: inst.irType });
        return Result.ok();
    }

    private emitFcmp(inst: FcmpInst, lines: string[]): Result<void, EmitFailure> {
        const left = this.value(inst.left);
        const right = this.value(inst.right);
        if (left.isErr()) return left;
        if (right.isErr()) return right;
        const names: Record<FcmpOp, string> = {
            [FcmpOp.Oeq]: "oeq",
            [FcmpOp.One]: "one",
            [FcmpOp.Olt]: "olt",
            [FcmpOp.Ole]: "ole",
            [FcmpOp.Ogt]: "ogt",
            [FcmpOp.Oge]: "oge",
        };
        const op = names[inst.op];
        lines.push(
            `${local(inst.id)} = fcmp ${op} ${llvmTypeName(left.value.type)} ${left.value.ref}, ${right.value.ref}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type: LLVM_I1, irType: inst.irType });
        return Result.ok();
    }

    private emitAlloca(inst: AllocaInst, lines: string[]): Result<void, EmitFailure> {
        const allocType = this.llvmType(inst.allocType);
        lines.push(`${local(inst.id)} = alloca ${llvmTypeName(allocType)}`);
        this.defineValue(inst.id, { ref: local(inst.id), type: LLVM_PTR, irType: inst.irType });
        return Result.ok();
    }

    private emitLoad(inst: LoadInst, lines: string[]): Result<void, EmitFailure> {
        const ptr = this.value(inst.ptr);
        if (ptr.isErr()) return ptr;
        const type = this.llvmType(inst.loadType);
        lines.push(`${local(inst.id)} = load ${llvmTypeName(type)}, ptr ${ptr.value.ref}`);
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitStore(inst: StoreInst, lines: string[]): Result<void, EmitFailure> {
        const value = this.value(inst.value);
        const ptr = this.value(inst.ptr);
        if (value.isErr()) return value;
        if (ptr.isErr()) return ptr;
        lines.push(
            `store ${llvmTypeName(value.value.type)} ${value.value.ref}, ptr ${ptr.value.ref}`,
        );
        this.defineValue(inst.id, { ref: "void", type: LLVM_VOID, irType: inst.irType });
        return Result.ok();
    }

    private emitGep(inst: GepInst, lines: string[]): Result<void, EmitFailure> {
        const ptr = this.value(inst.ptr);
        if (ptr.isErr()) return ptr;
        const sourceType = this.gepSourceType(ptr.value.irType, inst.resultType);
        const indices: string[] = [];
        if (this.shouldPrefixGepIndex(ptr.value.irType)) {
            indices.push("i64 0");
        }
        for (const indexId of inst.indices) {
            const index = this.value(indexId);
            if (index.isErr()) return index;
            indices.push(`${llvmTypeName(index.value.type)} ${index.value.ref}`);
        }
        lines.push(
            `${local(inst.id)} = getelementptr inbounds ${llvmTypeName(sourceType)}, ptr ${ptr.value.ref}, ${indices.join(", ")}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type: LLVM_PTR, irType: inst.irType });
        return Result.ok();
    }

    private gepSourceType(ptrType: IRType, resultType: IRType): LlvmType {
        if (ptrType instanceof PtrType) {
            return this.llvmType(ptrType.inner);
        }
        return this.llvmType(resultType);
    }

    private shouldPrefixGepIndex(type: IRType): boolean {
        if (!(type instanceof PtrType)) {
            return false;
        }
        return type.inner instanceof ArrayType || type.inner instanceof StructType;
    }

    private emitPtradd(inst: PtraddInst, lines: string[]): Result<void, EmitFailure> {
        const ptr = this.value(inst.ptr);
        const offset = this.value(inst.offset);
        if (ptr.isErr()) return ptr;
        if (offset.isErr()) return offset;
        lines.push(
            `${local(inst.id)} = getelementptr inbounds i8, ptr ${ptr.value.ref}, ${llvmTypeName(offset.value.type)} ${offset.value.ref}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type: LLVM_PTR, irType: inst.irType });
        return Result.ok();
    }

    private emitCast(
        inst: IRInst,
        opcode: string,
        operandId: ValueId,
        toType: IRType,
        lines: string[],
    ): Result<void, EmitFailure> {
        const operand = this.value(operandId);
        if (operand.isErr()) return operand;
        const type = this.llvmType(toType);
        lines.push(
            `${local(inst.id)} = ${opcode} ${llvmTypeName(operand.value.type)} ${operand.value.ref} to ${llvmTypeName(type)}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitCall(inst: CallInst, lines: string[]): Result<void, EmitFailure> {
        const calleeName = this.functionNames.get(inst.callee);
        if (calleeName === undefined) {
            return fail(`unknown callee id ${String(inst.callee)}`);
        }
        if (this.isPrintBuiltin(calleeName)) {
            return this.emitPrintCall(calleeName, inst, lines);
        }
        const args = this.emitCallArgs(inst.args);
        if (args.isErr()) return args;
        const callee = this.functionsById.get(inst.callee);
        let callReturnType = this.llvmType(inst.irType);
        if (callee !== undefined) {
            callReturnType = this.llvmFunctionReturnType(callee.returnType);
        }
        if (isVoidType(callReturnType)) {
            lines.push(`call void ${llvmGlobalName(calleeName)}(${args.value.join(", ")})`);
            this.defineValue(inst.id, { ref: "void", type: LLVM_VOID, irType: inst.irType });
            return Result.ok();
        }
        if (inst.irType instanceof UnitType) {
            const unused = this.fresh(`call${String(inst.id)}`);
            lines.push(
                `${unused} = call ${llvmTypeName(callReturnType)} ${llvmGlobalName(calleeName)}(${args.value.join(", ")})`,
            );
            this.defineValue(inst.id, { ref: "void", type: LLVM_VOID, irType: inst.irType });
            return Result.ok();
        }
        lines.push(
            `${local(inst.id)} = call ${llvmTypeName(callReturnType)} ${llvmGlobalName(calleeName)}(${args.value.join(", ")})`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type: callReturnType, irType: inst.irType });
        return Result.ok();
    }

    private emitCallDyn(inst: CallDynInst, lines: string[]): Result<void, EmitFailure> {
        const callee = this.value(inst.callee);
        if (callee.isErr()) return callee;
        const args = this.emitCallArgs(inst.args);
        if (args.isErr()) return args;
        const returnType = this.llvmType(inst.irType);
        lines.push(
            `${local(inst.id)} = call ${llvmTypeName(returnType)} ${callee.value.ref}(${args.value.join(", ")})`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type: returnType, irType: inst.irType });
        return Result.ok();
    }

    private emitCallArgs(args: ValueId[]): Result<string[], EmitFailure> {
        const rendered: string[] = [];
        for (const argId of args) {
            const arg = this.value(argId);
            if (arg.isErr()) return arg;
            rendered.push(`${llvmTypeName(arg.value.type)} ${arg.value.ref}`);
        }
        return Result.ok(rendered);
    }

    private isPrintBuiltin(name: string): boolean {
        return (
            name === BUILTIN_SYMBOLS.PRINT_FMT ||
            name === BUILTIN_SYMBOLS.PRINTLN_FMT ||
            name === BUILTIN_SYMBOLS.PRINT_BYTES ||
            name === BUILTIN_SYMBOLS.PRINTLN_BYTES
        );
    }

    private emitPrintCall(
        calleeName: string,
        inst: CallInst,
        lines: string[],
    ): Result<void, EmitFailure> {
        const appendNewline =
            calleeName === BUILTIN_SYMBOLS.PRINTLN_FMT ||
            calleeName === BUILTIN_SYMBOLS.PRINTLN_BYTES;
        const formatResult = this.printfFormat(inst.args, appendNewline, lines);
        if (formatResult.isErr()) return formatResult;
        lines.push(`call i32 (ptr, ...) ${llvmGlobalName("printf")}(${formatResult.value.join(", ")})`);
        this.defineValue(inst.id, { ref: "void", type: LLVM_VOID, irType: inst.irType });
        return Result.ok();
    }

    private printfFormat(
        args: ValueId[],
        appendNewline: boolean,
        lines: string[],
    ): Result<string[], EmitFailure> {
        if (args.length === 0) {
            const global = this.addCString(`.fmt.${String(this.tempIndex)}`, "");
            return Result.ok([`ptr ${this.stringPointer(global.name, global.type)}`]);
        }
        const templateValue = this.templateLiteral(args[0]);
        if (templateValue.isErr()) return templateValue;
        let template = templateValue.value;
        if (appendNewline) {
            template = `${template}\n`;
        }
        const convertedResult = this.convertPrintfTemplate(template, args, lines);
        if (convertedResult.isErr()) return convertedResult;
        const formatGlobal = this.addCString(
            `.fmt.${String(this.stringGlobalIndex)}`,
            convertedResult.value.converted,
        );
        this.stringGlobalIndex++;
        const formatArg = `ptr ${this.stringPointer(formatGlobal.name, formatGlobal.type)}`;
        return Result.ok([formatArg, ...convertedResult.value.renderedArgs]);
    }

    private convertPrintfTemplate(
        template: string,
        args: ValueId[],
        lines: string[],
    ): Result<{ converted: string; renderedArgs: string[] }, EmitFailure> {
        const renderedArgs: string[] = [];
        let converted = "";
        let argIndex = FIRST_ARG_INDEX;
        for (let index = 0; index < template.length; index++) {
            const chunk = this.convertPrintfTemplateChar(
                template,
                index,
                args,
                argIndex,
                lines,
            );
            if (chunk.isErr()) return chunk;
            converted += chunk.value.text;
            argIndex = chunk.value.nextArgIndex;
            index = chunk.value.nextTemplateIndex;
            if (chunk.value.argument !== undefined) {
                renderedArgs.push(chunk.value.argument);
            }
        }
        return Result.ok({ converted, renderedArgs });
    }

    private convertPrintfTemplateChar(
        template: string,
        templateIndex: number,
        args: ValueId[],
        argIndex: number,
        lines: string[],
    ): Result<
        {
            text: string;
            argument: string | undefined;
            nextArgIndex: number;
            nextTemplateIndex: number;
        },
        EmitFailure
    > {
        const current = template[templateIndex];
        const next = template[templateIndex + 1];
        if (current === "{" && next === "}") {
            return this.convertPrintfPlaceholder(
                args,
                argIndex,
                templateIndex,
                lines,
            );
        }
        if (current === "{" && next === "{") {
            return Result.ok({
                text: "{",
                argument: undefined,
                nextArgIndex: argIndex,
                nextTemplateIndex: templateIndex + 1,
            });
        }
        if (current === "}" && next === "}") {
            return Result.ok({
                text: "}",
                argument: undefined,
                nextArgIndex: argIndex,
                nextTemplateIndex: templateIndex + 1,
            });
        }
        return Result.ok({
            text: current,
            argument: undefined,
            nextArgIndex: argIndex,
            nextTemplateIndex: templateIndex,
        });
    }

    private convertPrintfPlaceholder(
        args: ValueId[],
        argIndex: number,
        templateIndex: number,
        lines: string[],
    ): Result<
        {
            text: string;
            argument: string;
            nextArgIndex: number;
            nextTemplateIndex: number;
        },
        EmitFailure
    > {
        const tagValue = this.constantInteger(args[argIndex]);
        if (tagValue.isErr()) return tagValue;
        const value = this.value(args[argIndex + 1]);
        if (value.isErr()) return value;
        const prepared = this.preparePrintfValue(
            tagValue.value,
            value.value,
            lines,
        );
        if (prepared.isErr()) return prepared;
        return Result.ok({
            text: prepared.value.specifier,
            argument: prepared.value.argument,
            nextArgIndex: argIndex + TAG_VALUE_PAIR_WIDTH,
            nextTemplateIndex: templateIndex + 1,
        });
    }

    private templateLiteral(valueId: ValueId): Result<string, EmitFailure> {
        const value = this.values.get(valueId);
        if (value === undefined) {
            return fail(`missing format template v${String(valueId)}`);
        }
        const inst = this.findInstruction(valueId);
        if (inst instanceof SconstInst) {
            return Result.ok(this.module.stringLiterals[inst.stringId] ?? "");
        }
        return fail("print format template must be a string literal");
    }

    private findInstruction(valueId: ValueId): IRInst | undefined {
        for (const fn of this.module.functions) {
            for (const block of fn.blocks) {
                for (const inst of block.instructions) {
                    if (inst.id === valueId) {
                        return inst;
                    }
                }
            }
        }
        return undefined;
    }

    private constantInteger(valueId: ValueId): Result<number, EmitFailure> {
        const inst = this.findInstruction(valueId);
        if (inst instanceof IconstInst) {
            return Result.ok(inst.value);
        }
        return fail(`expected constant integer v${String(valueId)}`);
    }

    private preparePrintfValue(
        tag: number,
        value: LoweredValue,
        lines: string[],
    ): Result<{ specifier: string; argument: string }, EmitFailure> {
        return match(tag)
            .with(FORMAT_TAG.String, () =>
                Result.ok({
                    specifier: "%s",
                    argument: `ptr ${value.ref}`,
                }),
            )
            .with(FORMAT_TAG.Int, () => {
                const widened = this.ensureI64(value, lines);
                return Result.ok({
                    specifier: "%lld",
                    argument: `i64 ${widened}`,
                });
            })
            .with(FORMAT_TAG.Float, () => {
                const widened = this.ensureDouble(value, lines);
                return Result.ok({
                    specifier: "%g",
                    argument: `double ${widened}`,
                });
            })
            .with(FORMAT_TAG.Bool, () => {
                const tmp = this.fresh("boolstr");
                const trueGlobal = this.globals.get("__jsrust_bool_true");
                const falseGlobal = this.globals.get("__jsrust_bool_false");
                if (trueGlobal === undefined || falseGlobal === undefined) {
                    return fail("missing bool print globals");
                }
                lines.push(
                    `${tmp} = select i1 ${value.ref}, ptr ${this.stringPointer(
                        "__jsrust_bool_true",
                        trueGlobal.type,
                    )}, ptr ${this.stringPointer("__jsrust_bool_false", falseGlobal.type)}`,
                );
                return Result.ok({
                    specifier: "%s",
                    argument: `ptr ${tmp}`,
                });
            })
            .with(FORMAT_TAG.Char, () =>
                Result.ok({
                    specifier: "%c",
                    argument: `${llvmTypeName(value.type)} ${value.ref}`,
                }),
            )
            .otherwise(() => fail(`unsupported print format tag ${String(tag)}`));
    }

    private ensureI64(value: LoweredValue, lines: string[]): string {
        if (value.type.kind === "integer" && value.type.bits === I64_BITS) {
            return value.ref;
        }
        const tmp = this.fresh("i64");
        lines.push(`${tmp} = sext ${llvmTypeName(value.type)} ${value.ref} to i64`);
        return tmp;
    }

    private ensureDouble(value: LoweredValue, lines: string[]): string {
        if (value.type.kind === "double") {
            return value.ref;
        }
        const tmp = this.fresh("double");
        lines.push(`${tmp} = fpext ${llvmTypeName(value.type)} ${value.ref} to double`);
        return tmp;
    }

    private emitStructCreate(
        inst: StructCreateInst,
        lines: string[],
    ): Result<void, EmitFailure> {
        const type = this.llvmType(inst.structType);
        let current = "undef";
        for (let index = 0; index < inst.fields.length; index++) {
            const field = this.value(inst.fields[index]);
            if (field.isErr()) return field;
            const target = match(index === inst.fields.length - 1)
                .with(true, () => local(inst.id))
                .otherwise(() => this.fresh(`struct${String(inst.id)}`));
            lines.push(
                `${target} = insertvalue ${llvmTypeName(type)} ${current}, ${llvmTypeName(field.value.type)} ${field.value.ref}, ${String(index)}`,
            );
            current = target;
        }
        if (inst.fields.length === 0) {
            this.defineValue(inst.id, { ref: "undef", type, irType: inst.irType });
            return Result.ok();
        }
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitStructGet(inst: StructGetInst, lines: string[]): Result<void, EmitFailure> {
        const source = this.value(inst.struct);
        if (source.isErr()) return source;
        const type = this.llvmType(inst.fieldType);
        lines.push(
            `${local(inst.id)} = extractvalue ${llvmTypeName(source.value.type)} ${source.value.ref}, ${String(inst.index)}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitEnumCreate(inst: EnumCreateInst, lines: string[]): Result<void, EmitFailure> {
        const type = this.llvmType(inst.enumType);
        const tagTmp = match(inst.data === undefined)
            .with(true, () => local(inst.id))
            .otherwise(() => this.fresh(`enumtag${String(inst.id)}`));
        lines.push(
            `${tagTmp} = insertvalue ${llvmTypeName(type)} undef, i64 ${String(inst.tag)}, 0`,
        );
        if (inst.data === undefined) {
            this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
            return Result.ok();
        }
        const data = this.value(inst.data);
        if (data.isErr()) return data;
        const payloadType = this.enumPayloadType(inst.enumType, inst.tag);
        const payloadTmp = this.fresh(`enumpayload${String(inst.id)}`);
        lines.push(
            `${payloadTmp} = insertvalue ${llvmTypeName(payloadType)} undef, ${llvmTypeName(data.value.type)} ${data.value.ref}, 0`,
        );
        lines.push(
            `${local(inst.id)} = insertvalue ${llvmTypeName(type)} ${tagTmp}, ${llvmTypeName(payloadType)} ${payloadTmp}, ${String(inst.tag + 1)}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private enumPayloadType(enumType: EnumType, variant: number): LlvmType {
        const hashedEnumName = sanitizeTypeName(
            `enum.${enumType.name}.${stableTypeHash(getIREnumTypeKey(enumType))}`,
        );
        return llvmNamed(sanitizeTypeName(`${hashedEnumName}.v${String(variant)}`));
    }

    private emitEnumGetTag(inst: EnumGetTagInst, lines: string[]): Result<void, EmitFailure> {
        const source = this.value(inst.enum_);
        if (source.isErr()) return source;
        lines.push(`${local(inst.id)} = extractvalue ${llvmTypeName(source.value.type)} ${source.value.ref}, 0`);
        this.defineValue(inst.id, { ref: local(inst.id), type: LLVM_I64, irType: inst.irType });
        return Result.ok();
    }

    private emitEnumGetData(inst: EnumGetDataInst, lines: string[]): Result<void, EmitFailure> {
        const source = this.value(inst.enum_);
        if (source.isErr()) return source;
        const payloadType = this.enumPayloadType(inst.enumType, inst.variant);
        const payloadTmp = this.fresh(`payload${String(inst.id)}`);
        lines.push(
            `${payloadTmp} = extractvalue ${llvmTypeName(source.value.type)} ${source.value.ref}, ${String(inst.variant + 1)}`,
        );
        const type = this.llvmType(inst.dataType);
        lines.push(
            `${local(inst.id)} = extractvalue ${llvmTypeName(payloadType)} ${payloadTmp}, ${String(inst.index)}`,
        );
        this.defineValue(inst.id, { ref: local(inst.id), type, irType: inst.irType });
        return Result.ok();
    }

    private emitTerminator(term: IRTerm): Result<string, EmitFailure> {
        return match<IRTerm, Result<string, EmitFailure>>(term)
            .with(P.instanceOf(RetTerm), (value) => this.emitRet(value))
            .with(P.instanceOf(BrTerm), (value) =>
                Result.ok(`br label ${blockRef(value.target)}`),
            )
            .with(P.instanceOf(BrIfTerm), (value) => this.emitBrIf(value))
            .with(P.instanceOf(SwitchTerm), (value) => this.emitSwitch(value))
            .with(P.instanceOf(UnreachableTerm), () => Result.ok("unreachable"))
            .exhaustive();
    }

    private emitRet(term: RetTerm): Result<string, EmitFailure> {
        if (this.currentIrFunctionReturnType instanceof UnitType) {
            return Result.ok(
                `ret ${llvmTypeName(this.currentFunctionReturnType)} 0`,
            );
        }
        if (term.value === undefined) {
            if (this.currentFunctionReturnType.kind === "integer") {
                return Result.ok(
                    `ret ${llvmTypeName(this.currentFunctionReturnType)} 0`,
                );
            }
            return Result.ok("ret void");
        }
        const value = this.value(term.value);
        if (value.isErr()) return value;
        if (isVoidType(value.value.type)) {
            if (this.currentFunctionReturnType.kind === "integer") {
                return Result.ok(
                    `ret ${llvmTypeName(this.currentFunctionReturnType)} 0`,
                );
            }
            return Result.ok("ret void");
        }
        return Result.ok(`ret ${llvmTypeName(value.value.type)} ${value.value.ref}`);
    }

    private emitBrIf(term: BrIfTerm): Result<string, EmitFailure> {
        const condition = this.value(term.condition);
        if (condition.isErr()) return condition;
        return Result.ok(
            `br i1 ${condition.value.ref}, label ${blockRef(term.thenBranch)}, label ${blockRef(term.elseBranch)}`,
        );
    }

    private emitSwitch(term: SwitchTerm): Result<string, EmitFailure> {
        const value = this.value(term.value);
        if (value.isErr()) return value;
        const cases = term.cases
            .map(
                (switchCase) =>
                    `${llvmTypeName(value.value.type)} ${String(switchCase.value)}, label ${blockRef(switchCase.target)}`,
            )
            .join(" ");
        return Result.ok(
            `switch ${llvmTypeName(value.value.type)} ${value.value.ref}, label ${blockRef(term.defaultBranch)} [ ${cases} ]`,
        );
    }
}

export function emitLlvmModule(module: IRModule): Result<LlvmModule, EmitFailure> {
    return new LlvmEmitter(module).emit();
}
