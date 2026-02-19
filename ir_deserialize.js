/** @typedef {import('./ir.js').IRModule} IRModule */
/** @typedef {import('./ir.js').IRFunction} IRFunction */
/** @typedef {import('./ir.js').IRBlock} IRBlock */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {{ ok: true, value: T } | { ok: false, error: DeserializeError }} Result<T> */

import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,
    makeIRModule,
    makeIRFunction,
    makeIRBlock,
    makeIRLocal,
    addIRFunction,
    addIRBlock,
    addIRLocal,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
} from './ir.js';

import { MAGIC, VERSION } from './ir_serialize.js';

/**
 * Deserialize error types
 */
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

/**
 * @typedef {number} DeserializeErrorKindValue
 */

/**
 * @typedef {{ kind: DeserializeErrorKindValue, message: string, pos?: number }} DeserializeError
 */

/**
 * Create an error result
 * @param {DeserializeErrorKindValue} kind
 * @param {string} message
 * @param {number} [pos]
 * @returns {{ ok: false, error: DeserializeError }}
 */
function error(kind, message, pos) {
    return { ok: false, error: { kind, message, pos } };
}

/**
 * Create a success result
 * @template T
 * @param {T} value
 * @returns {{ ok: true, value: T }}
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * IR Deserializer - reads IR from binary format
 */
class IRDeserializer {
    /**
     * @param {ArrayBuffer} buffer
     */
    constructor(buffer) {
        /** @type {DataView} */
        this.view = new DataView(buffer);
        /** @type {number} */
        this.pos = 0;
        /** @type {string[]} */
        this.strings = [];
        /** @type {number} */
        this.end = buffer.byteLength;
    }

    /**
     * Deserialize a module from binary format
     * @returns {Result<IRModule>}
     */
    deserializeModule() {
        // Read and validate header
        if (this.end < 28) {
            return error(DeserializeErrorKind.TruncatedData, 'Buffer too small for header');
        }

        const magic = this.readU32();
        if (magic !== MAGIC) {
            return error(DeserializeErrorKind.InvalidMagic, `Invalid magic bytes: expected 0x${MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
        }

        const version = this.readU32();
        if (version !== VERSION) {
            return error(DeserializeErrorKind.InvalidVersion, `Unsupported version: ${version}`);
        }

        const flags = this.readU32();
        const stringTableOffset = this.readU32();
        const typesOffset = this.readU32();
        const globalsOffset = this.readU32();
        const functionsOffset = this.readU32();

        // Read string table
        this.pos = stringTableOffset;
        const stringTableResult = this.readStringTable();
        if (!stringTableResult.ok) {
            return stringTableResult;
        }
        this.strings = stringTableResult.value;

        // Read types section
        this.pos = typesOffset;
        const typesResult = this.readTypesSection();
        if (!typesResult.ok) {
            return typesResult;
        }
        const { structs, enums } = typesResult.value;

        // Create module
        const module = makeIRModule('module');
        module.structs = structs;
        module.enums = enums;

        // Read globals section
        this.pos = globalsOffset;
        const globalsResult = this.readGlobalsSection(module);
        if (!globalsResult.ok) {
            return globalsResult;
        }

        // Read functions section
        this.pos = functionsOffset;
        const functionsResult = this.readFunctionsSection(module);
        if (!functionsResult.ok) {
            return functionsResult;
        }

        return ok(module);
    }

    // ========================================================================
    // Primitive Readers
    // ========================================================================

    /**
     * Read an unsigned 8-bit integer
     * @returns {number}
     */
    readU8() {
        const value = this.view.getUint8(this.pos);
        this.pos += 1;
        return value;
    }

    /**
     * Read an unsigned 16-bit integer (little endian)
     * @returns {number}
     */
    readU16() {
        const value = this.view.getUint16(this.pos, true);
        this.pos += 2;
        return value;
    }

    /**
     * Read an unsigned 32-bit integer (little endian)
     * @returns {number}
     */
    readU32() {
        const value = this.view.getUint32(this.pos, true);
        this.pos += 4;
        return value;
    }

    /**
     * Read an unsigned 64-bit integer (little endian)
     * @returns {bigint}
     */
    readU64() {
        const value = this.view.getBigUint64(this.pos, true);
        this.pos += 8;
        return value;
    }

    /**
     * Read a signed 32-bit integer (little endian)
     * @returns {number}
     */
    readI32() {
        const value = this.view.getInt32(this.pos, true);
        this.pos += 4;
        return value;
    }

    /**
     * Read a signed 64-bit integer (little endian)
     * @returns {bigint}
     */
    readI64() {
        const value = this.view.getBigInt64(this.pos, true);
        this.pos += 8;
        return value;
    }

    /**
     * Read a 32-bit float (little endian)
     * @returns {number}
     */
    readF32() {
        const value = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return value;
    }

    /**
     * Read a 64-bit float (little endian)
     * @returns {number}
     */
    readF64() {
        const value = this.view.getFloat64(this.pos, true);
        this.pos += 8;
        return value;
    }

    /**
     * Read raw bytes
     * @param {number} count
     * @returns {Uint8Array}
     */
    readBytes(count) {
        const bytes = new Uint8Array(this.view.buffer, this.pos, count);
        this.pos += count;
        return bytes;
    }

    // ========================================================================
    // String Table Reading
    // ========================================================================

    /**
     * Read the string table
     * @returns {Result<string[]>}
     */
    readStringTable() {
        const count = this.readU32();
        const strings = [];

        for (let i = 0; i < count; i++) {
            const length = this.readU32();
            const bytes = this.readBytes(length);
            const str = this.decodeUtf8(bytes);
            strings.push(str);
        }

        return ok(strings);
    }

    /**
     * Get a string from the string table by ID
     * @param {number} id
     * @returns {Result<string>}
     */
    getString(id) {
        if (id < 0 || id >= this.strings.length) {
            return error(DeserializeErrorKind.OutOfBoundsReference, `Invalid string ID: ${id}`);
        }
        return ok(this.strings[id]);
    }

    // ========================================================================
    // Types Section Reading
    // ========================================================================

    /**
     * Read the types section
     * @returns {Result<{ structs: Map<string, any>, enums: Map<string, any> }>}
     */
    readTypesSection() {
        const structs = new Map();
        const enums = new Map();

        // Read structs
        const structCount = this.readU32();
        for (let i = 0; i < structCount; i++) {
            const nameResult = this.getString(this.readU32());
            if (!nameResult.ok) return nameResult;
            const name = nameResult.value;

            const fieldCount = this.readU32();
            const fields = [];
            for (let j = 0; j < fieldCount; j++) {
                const typeResult = this.readType();
                if (!typeResult.ok) return typeResult;
                fields.push({ ty: typeResult.value });
            }

            structs.set(name, { name, fields });
        }

        // Read enums
        const enumCount = this.readU32();
        for (let i = 0; i < enumCount; i++) {
            const nameResult = this.getString(this.readU32());
            if (!nameResult.ok) return nameResult;
            const name = nameResult.value;

            const variantCount = this.readU32();
            const variants = [];
            for (let j = 0; j < variantCount; j++) {
                const fieldCount = this.readU32();
                const fields = [];
                for (let k = 0; k < fieldCount; k++) {
                    const typeResult = this.readType();
                    if (!typeResult.ok) return typeResult;
                    fields.push(typeResult.value);
                }
                variants.push({ name: `variant_${j}`, fields });
            }

            enums.set(name, { name, variants });
        }

        return ok({ structs, enums });
    }

    /**
     * Read a type
     * @returns {Result<IRType>}
     */
    readType() {
        const tag = this.readU8();

        switch (tag) {
            case IRTypeKind.Int:
                return ok(makeIRIntType(this.readU8()));

            case IRTypeKind.Float:
                return ok(makeIRFloatType(this.readU8()));

            case IRTypeKind.Bool:
                return ok(makeIRBoolType());

            case IRTypeKind.Ptr:
                return ok(makeIRPtrType(null));

            case IRTypeKind.Unit:
                return ok(makeIRUnitType());

            case IRTypeKind.Struct: {
                const nameResult = this.getString(this.readU32());
                if (!nameResult.ok) return nameResult;
                // Return a reference type - the actual struct is in the module
                return ok(makeIRStructType(nameResult.value, []));
            }

            case IRTypeKind.Enum: {
                const nameResult = this.getString(this.readU32());
                if (!nameResult.ok) return nameResult;
                // Return a reference type - the actual enum is in the module
                return ok(makeIREnumType(nameResult.value, []));
            }

            case IRTypeKind.Array: {
                const length = this.readU32();
                const elementResult = this.readType();
                if (!elementResult.ok) return elementResult;
                return ok(makeIRArrayType(elementResult.value, length));
            }

            case IRTypeKind.Fn: {
                const paramCount = this.readU32();
                const params = [];
                for (let i = 0; i < paramCount; i++) {
                    const paramResult = this.readType();
                    if (!paramResult.ok) return paramResult;
                    params.push(paramResult.value);
                }
                const returnResult = this.readType();
                if (!returnResult.ok) return returnResult;
                return ok(makeIRFnType(params, returnResult.value));
            }

            default:
                return error(DeserializeErrorKind.InvalidTypeTag, `Invalid type tag: ${tag}`);
        }
    }

    // ========================================================================
    // Globals Section Reading
    // ========================================================================

    /**
     * Read the globals section
     * @param {IRModule} module
     * @returns {Result<void>}
     */
    readGlobalsSection(module) {
        const count = this.readU32();

        for (let i = 0; i < count; i++) {
            const nameResult = this.getString(this.readU32());
            if (!nameResult.ok) return nameResult;

            const typeResult = this.readType();
            if (!typeResult.ok) return typeResult;

            const hasInit = this.readU8();
            let init = undefined;
            if (hasInit) {
                const constResult = this.readConstant(typeResult.value);
                if (!constResult.ok) return constResult;
                init = constResult.value;
            }

            module.globals.push({
                name: nameResult.value,
                ty: typeResult.value,
                init,
            });
        }

        return ok(undefined);
    }

    /**
     * Read a constant value
     * @param {IRType} ty
     * @returns {Result<any>}
     */
    readConstant(ty) {
        switch (ty.kind) {
            case IRTypeKind.Int:
                return ok(this.readI64());

            case IRTypeKind.Float:
                return ok(this.readF64());

            case IRTypeKind.Bool:
                return ok(this.readU8() !== 0);

            default:
                return error(DeserializeErrorKind.InvalidTypeTag, `Invalid constant type: ${ty.kind}`);
        }
    }

    // ========================================================================
    // Functions Section Reading
    // ========================================================================

    /**
     * Read the functions section
     * @param {IRModule} module
     * @returns {Result<void>}
     */
    readFunctionsSection(module) {
        const count = this.readU32();

        for (let i = 0; i < count; i++) {
            const fnResult = this.readFunction(module);
            if (!fnResult.ok) return fnResult;
            addIRFunction(module, fnResult.value);
        }

        return ok(undefined);
    }

    /**
     * Read a function
     * @param {IRModule} module
     * @returns {Result<IRFunction>}
     */
    readFunction(module) {
        const nameResult = this.getString(this.readU32());
        if (!nameResult.ok) return nameResult;

        // Read parameters
        const paramCount = this.readU32();
        const params = [];
        for (let i = 0; i < paramCount; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) return typeResult;
            const id = this.readU32();
            params.push({ id, name: null, ty: typeResult.value });
        }

        // Read return type
        const returnResult = this.readType();
        if (!returnResult.ok) return returnResult;

        // Create function
        const fn = makeIRFunction(0, nameResult.value, params, returnResult.value);

        // Read locals
        const localCount = this.readU32();
        for (let i = 0; i < localCount; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) return typeResult;
            const id = this.readU32();
            addIRLocal(fn, makeIRLocal(id, typeResult.value, null));
        }

        // Read blocks
        const blockCount = this.readU32();
        for (let i = 0; i < blockCount; i++) {
            const blockResult = this.readBlock(fn);
            if (!blockResult.ok) return blockResult;
            addIRBlock(fn, blockResult.value);
        }

        return ok(fn);
    }

    // ========================================================================
    // Block Reading
    // ========================================================================

    /**
     * Read a block
     * @param {IRFunction} fn
     * @returns {Result<IRBlock>}
     */
    readBlock(fn) {
        const id = this.readU32();
        const block = makeIRBlock(id);

        // Read block parameters
        const paramCount = this.readU32();
        for (let i = 0; i < paramCount; i++) {
            const typeResult = this.readType();
            if (!typeResult.ok) return typeResult;
            const paramId = this.readU32();
            addIRBlockParam(block, paramId, typeResult.value);
        }

        // Read instructions
        const instCount = this.readU32();
        for (let i = 0; i < instCount; i++) {
            const instResult = this.readInstruction();
            if (!instResult.ok) return instResult;
            addIRInstruction(block, instResult.value);
        }

        // Read terminator
        const termResult = this.readTerminator();
        if (!termResult.ok) return termResult;
        setIRTerminator(block, termResult.value);

        return ok(block);
    }

    // ========================================================================
    // Instruction Reading
    // ========================================================================

    /**
     * Read an instruction
     * @returns {Result<any>}
     */
    readInstruction() {
        const opcode = this.readU8();

        // Check if this instruction produces a value
        const hasResult = this.instHasResult(opcode);
        let id = null;
        if (hasResult) {
            id = this.readU32();
        }

        // Read type
        const typeResult = this.readType();
        if (!typeResult.ok) return typeResult;
        const ty = typeResult.value;

        let inst;

        switch (opcode) {
            case IRInstKind.Iconst: {
                const value = this.readI64();
                inst = { kind: opcode, id, ty, value };
                break;
            }

            case IRInstKind.Fconst: {
                const value = this.readF64();
                inst = { kind: opcode, id, ty, value };
                break;
            }

            case IRInstKind.Bconst: {
                const value = this.readU8() !== 0;
                inst = { kind: opcode, id, ty, value };
                break;
            }

            case IRInstKind.Null: {
                inst = { kind: opcode, id, ty };
                break;
            }

            case IRInstKind.Iadd:
            case IRInstKind.Isub:
            case IRInstKind.Imul:
            case IRInstKind.Idiv:
            case IRInstKind.Imod:
            case IRInstKind.Fadd:
            case IRInstKind.Fsub:
            case IRInstKind.Fmul:
            case IRInstKind.Fdiv:
            case IRInstKind.Iand:
            case IRInstKind.Ior:
            case IRInstKind.Ixor:
            case IRInstKind.Ishl:
            case IRInstKind.Ishr: {
                const a = this.readU32();
                const b = this.readU32();
                inst = { kind: opcode, id, ty, a, b };
                break;
            }

            case IRInstKind.Icmp: {
                const a = this.readU32();
                const b = this.readU32();
                const op = this.readU8();
                inst = { kind: opcode, id, ty, op, a, b };
                break;
            }

            case IRInstKind.Fcmp: {
                const a = this.readU32();
                const b = this.readU32();
                const op = this.readU8();
                inst = { kind: opcode, id, ty, op, a, b };
                break;
            }

            case IRInstKind.Ineg:
            case IRInstKind.Fneg: {
                const a = this.readU32();
                inst = { kind: opcode, id, ty, a };
                break;
            }

            case IRInstKind.Alloca: {
                const localId = this.readU32();
                inst = { kind: opcode, id, ty, localId };
                break;
            }

            case IRInstKind.Load: {
                const ptr = this.readU32();
                inst = { kind: opcode, id, ty, ptr };
                break;
            }

            case IRInstKind.Store: {
                const ptr = this.readU32();
                const value = this.readU32();
                const valueTypeResult = this.readType();
                if (!valueTypeResult.ok) return valueTypeResult;
                inst = { kind: opcode, id, ty, ptr, value, valueType: valueTypeResult.value };
                break;
            }

            case IRInstKind.Memcpy: {
                const dest = this.readU32();
                const src = this.readU32();
                const size = this.readU32();
                inst = { kind: opcode, id, ty, dest, src, size };
                break;
            }

            case IRInstKind.Gep: {
                const ptr = this.readU32();
                const indexCount = this.readU32();
                const indices = [];
                for (let i = 0; i < indexCount; i++) {
                    indices.push(this.readU32());
                }
                inst = { kind: opcode, id, ty, ptr, indices };
                break;
            }

            case IRInstKind.Ptradd: {
                const ptr = this.readU32();
                const offset = this.readU32();
                inst = { kind: opcode, id, ty, ptr, offset };
                break;
            }

            case IRInstKind.Trunc:
            case IRInstKind.Sext:
            case IRInstKind.Zext: {
                const val = this.readU32();
                const fromTyResult = this.readType();
                if (!fromTyResult.ok) return fromTyResult;
                inst = { kind: opcode, id, ty, val, fromTy: fromTyResult.value };
                break;
            }

            case IRInstKind.Fptoui:
            case IRInstKind.Fptosi:
            case IRInstKind.Uitofp:
            case IRInstKind.Sitofp:
            case IRInstKind.Bitcast: {
                const val = this.readU32();
                inst = { kind: opcode, id, ty, val };
                break;
            }

            case IRInstKind.Call: {
                const fn = this.readU32();
                const argCount = this.readU32();
                const args = [];
                for (let i = 0; i < argCount; i++) {
                    args.push(this.readU32());
                }
                inst = { kind: opcode, id, ty, fn, args };
                break;
            }

            case IRInstKind.StructCreate: {
                const fieldCount = this.readU32();
                const fields = [];
                for (let i = 0; i < fieldCount; i++) {
                    fields.push(this.readU32());
                }
                inst = { kind: opcode, id, ty, fields };
                break;
            }

            case IRInstKind.StructGet: {
                const struct = this.readU32();
                const fieldIndex = this.readU32();
                inst = { kind: opcode, id, ty, struct, fieldIndex };
                break;
            }

            case IRInstKind.EnumCreate: {
                const variant = this.readU32();
                const hasData = this.readU8();
                let data = null;
                if (hasData) {
                    data = this.readU32();
                }
                inst = { kind: opcode, id, ty, variant, data };
                break;
            }

            case IRInstKind.EnumGetTag: {
                const enum_ = this.readU32();
                inst = { kind: opcode, id, ty, enum: enum_ };
                break;
            }

            case IRInstKind.EnumGetData: {
                const enum_ = this.readU32();
                const variant = this.readU32();
                const index = this.readU32();
                inst = { kind: opcode, id, ty, enum: enum_, variant, index };
                break;
            }

            default:
                return error(DeserializeErrorKind.InvalidOpcode, `Invalid instruction opcode: ${opcode}`);
        }

        return ok(inst);
    }

    /**
     * Check if an instruction produces a result value
     * @param {number} opcode
     * @returns {boolean}
     */
    instHasResult(opcode) {
        switch (opcode) {
            case IRInstKind.Store:
            case IRInstKind.Memcpy:
                return false;
            default:
                return true;
        }
    }

    // ========================================================================
    // Terminator Reading
    // ========================================================================

    /**
     * Read a terminator
     * @returns {Result<any>}
     */
    readTerminator() {
        const tag = this.readU8();

        switch (tag) {
            case IRTermKind.Ret: {
                const hasValue = this.readU8();
                let value = null;
                if (hasValue) {
                    value = this.readU32();
                }
                return ok({ kind: tag, value });
            }

            case IRTermKind.Br: {
                const target = this.readU32();
                const argCount = this.readU32();
                const args = [];
                for (let i = 0; i < argCount; i++) {
                    args.push(this.readU32());
                }
                return ok({ kind: tag, target, args });
            }

            case IRTermKind.BrIf: {
                const cond = this.readU32();
                const thenBlock = this.readU32();
                const thenArgCount = this.readU32();
                const thenArgs = [];
                for (let i = 0; i < thenArgCount; i++) {
                    thenArgs.push(this.readU32());
                }
                const elseBlock = this.readU32();
                const elseArgCount = this.readU32();
                const elseArgs = [];
                for (let i = 0; i < elseArgCount; i++) {
                    elseArgs.push(this.readU32());
                }
                return ok({ kind: tag, cond, thenBlock, thenArgs, elseBlock, elseArgs });
            }

            case IRTermKind.Switch: {
                const value = this.readU32();
                const caseCount = this.readU32();
                const cases = [];
                for (let i = 0; i < caseCount; i++) {
                    const caseValue = this.readI64();
                    const target = this.readU32();
                    const argCount = this.readU32();
                    const args = [];
                    for (let j = 0; j < argCount; j++) {
                        args.push(this.readU32());
                    }
                    cases.push({ value: caseValue, target, args });
                }
                const defaultBlock = this.readU32();
                const defaultArgCount = this.readU32();
                const defaultArgs = [];
                for (let i = 0; i < defaultArgCount; i++) {
                    defaultArgs.push(this.readU32());
                }
                return ok({ kind: tag, value, cases, defaultBlock, defaultArgs });
            }

            case IRTermKind.Unreachable:
                return ok({ kind: tag });

            default:
                return error(DeserializeErrorKind.InvalidTerminatorTag, `Invalid terminator tag: ${tag}`);
        }
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Decode UTF-8 bytes to a string
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    decodeUtf8(bytes) {
        return new TextDecoder().decode(bytes);
    }
}

/**
 * Deserialize a module from binary format
 * @param {Uint8Array} data
 * @returns {Result<IRModule>}
 */
function deserializeModule(data) {
    const deserializer = new IRDeserializer(data.buffer);
    return deserializer.deserializeModule();
}

export {
    IRDeserializer,
    deserializeModule,
    DeserializeErrorKind,
    error,
    ok,
};