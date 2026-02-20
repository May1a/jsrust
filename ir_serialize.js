/** @typedef {import('./ir.js').IRModule} IRModule */
/** @typedef {import('./ir.js').IRFunction} IRFunction */
/** @typedef {import('./ir.js').IRBlock} IRBlock */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').IRInstKindValue} IRInstKindValue */
/** @typedef {import('./ir.js').IRTermKindValue} IRTermKindValue */

import { IRTypeKind, IRInstKind, IRTermKind } from "./ir.js";

// Magic bytes: "JSRS" (0x4A 0x53 0x52 0x53)
const MAGIC = 0x52534a53; // "JSRS" in little-endian

// Current version
const VERSION = 2;

// Flags
const FLAGS = 0;

// Section IDs
const SectionId = {
    StringTable: 0,
    Types: 1,
    StringLiterals: 2,
    Globals: 3,
    Functions: 4,
};

// Special value for "no value" in terminators
const NO_VALUE = 0xffffffff;

/**
 * String table for deduplicating strings during serialization
 */
class StringTable {
    constructor() {
        /** @type {Map<string, number>} */
        this.stringToId = new Map();
        /** @type {string[]} */
        this.strings = [];
    }

    /**
     * Add a string to the table and return its ID
     * @param {string} str
     * @returns {number}
     */
    addString(str) {
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
     * @returns {string[]}
     */
    getStrings() {
        return this.strings;
    }
}

/**
 * IR Serializer - writes IR to binary format
 */
class IRSerializer {
    constructor() {
        /** @type {DataView} */
        this.view = new DataView(new ArrayBuffer(0));
        /** @type {number} */
        this.pos = 0;
        /** @type {StringTable} */
        this.strings = new StringTable();
    }

    /**
     * Serialize a module to binary format
     * @param {IRModule} module
     * @returns {Uint8Array}
     */
    serializeModule(module) {
        // First pass: collect all strings
        this.collectStrings(module);

        // Calculate sizes for each section
        const stringTableSize = this.calculateStringTableSize();
        const typesSize = this.calculateTypesSize(module);
        const stringLiteralsSize = this.calculateStringLiteralsSize(module);
        const globalsSize = this.calculateGlobalsSize(module);
        const functionsSize = this.calculateFunctionsSize(module);

        // Calculate offsets (header is 32 bytes: magic + version + flags + 5 section offsets)
        const headerSize = 32;
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
     * @param {IRModule} module
     */
    collectStrings(module) {
        // Module name
        if (module.name) {
            this.strings.addString(module.name);
        }

        // Struct names and field names
        for (const [name, struct] of module.structs) {
            this.strings.addString(name);
            for (const field of struct.fields) {
                if (field.name) {
                    this.strings.addString(field.name);
                }
            }
        }

        // Enum names and variant names
        for (const [name, enum_] of module.enums) {
            this.strings.addString(name);
            for (const variant of enum_.variants) {
                if (variant.name) {
                    this.strings.addString(variant.name);
                }
            }
        }

        // Global names
        for (const global of module.globals) {
            this.strings.addString(global.name);
            this.collectTypeStrings(global.ty);
        }

        // Function names, parameter names, local names
        for (const fn of module.functions) {
            this.strings.addString(fn.name);
            for (const param of fn.params) {
                if (param.name) {
                    this.strings.addString(param.name);
                }
                this.collectTypeStrings(param.ty);
            }
            this.collectTypeStrings(fn.returnType);
            for (const local of fn.locals) {
                if (local.name) {
                    this.strings.addString(local.name);
                }
                this.collectTypeStrings(local.ty);
            }
            for (const block of fn.blocks) {
                for (const param of block.params) {
                    this.collectTypeStrings(param.ty);
                }
                for (const inst of block.instructions) {
                    this.collectTypeStrings(inst.ty);
                    if (inst.valueType) {
                        this.collectTypeStrings(inst.valueType);
                    }
                    if (inst.fromTy) {
                        this.collectTypeStrings(inst.fromTy);
                    }
                }
            }
        }
    }

    /**
     * Collect string names referenced by a type recursively
     * @param {IRType | null | undefined} type
     */
    collectTypeStrings(type) {
        if (!type) {
            return;
        }

        switch (type.kind) {
            case IRTypeKind.Struct:
            case IRTypeKind.Enum:
                if (type.name) {
                    this.strings.addString(type.name);
                }
                break;
            case IRTypeKind.Array:
                this.collectTypeStrings(type.element);
                break;
            case IRTypeKind.Fn:
                for (const param of type.params || []) {
                    this.collectTypeStrings(param);
                }
                this.collectTypeStrings(type.returnType);
                break;
        }
    }

    // ========================================================================
    // Size Calculations
    // ========================================================================

    /**
     * Calculate the size of the string table section
     * @returns {number}
     */
    calculateStringTableSize() {
        const strings = this.strings.getStrings();
        let size = 4; // count
        for (const str of strings) {
            size += 4; // length
            size += this.utf8ByteLength(str);
        }
        return size;
    }

    /**
     * Calculate the size of the types section
     * @param {IRModule} module
     * @returns {number}
     */
    calculateTypesSize(module) {
        let size = 4; // struct count
        for (const [name, struct] of module.structs) {
            size += 4; // name string id
            size += 4; // field count
            for (const field of struct.fields) {
                size += this.calculateTypeSize(
                    field.ty !== undefined ? field.ty : field,
                );
            }
        }
        size += 4; // enum count
        for (const [name, enum_] of module.enums) {
            size += 4; // name string id
            size += 4; // variant count
            for (const variant of enum_.variants) {
                size += 4; // field count
                for (const field of variant.fields || []) {
                    size += this.calculateTypeSize(field);
                }
            }
        }
        return size;
    }

    /**
     * Calculate the size of the string literal section.
     * @param {IRModule} module
     * @returns {number}
     */
    calculateStringLiteralsSize(module) {
        const literals = module.stringLiterals || [];
        let size = 4; // count
        for (const literal of literals) {
            size += 4; // byte length
            size += this.utf8ByteLength(literal);
        }
        return size;
    }

    /**
     * Calculate the encoded size of a type
     * @param {IRType} type
     * @returns {number}
     */
    calculateTypeSize(type) {
        switch (type.kind) {
            case IRTypeKind.Int:
            case IRTypeKind.Float:
                return 2; // tag + width
            case IRTypeKind.Bool:
            case IRTypeKind.Ptr:
            case IRTypeKind.Unit:
                return 1; // tag only
            case IRTypeKind.Struct:
            case IRTypeKind.Enum:
                return 5; // tag + name string id
            case IRTypeKind.Array:
                return 5 + this.calculateTypeSize(/** @type {IRType} */(type.element)); // tag + length + element
            case IRTypeKind.Fn: {
                let size = 5; // tag + param count
                for (const param of (type.params ?? [])) {
                    size += this.calculateTypeSize(param);
                }
                size += this.calculateTypeSize(/** @type {IRType} */(type.returnType));
                return size;
            }
            default:
                return 1;
        }
    }

    /**
     * Calculate the size of the globals section
     * @param {IRModule} module
     * @returns {number}
     */
    calculateGlobalsSize(module) {
        let size = 4; // count
        for (const global of module.globals) {
            size += 4; // name string id
            size += this.calculateTypeSize(global.ty);
            if (global.init !== undefined) {
                size += 1; // has_init = 1
                size += this.calculateConstantSize(global.init);
            } else {
                size += 1; // has_init = 0
            }
        }
        return size;
    }

    /**
     * Calculate the encoded size of a constant value
     * @param {any} value
     * @returns {number}
     */
    calculateConstantSize(value) {
        if (typeof value === "bigint") {
            return 8;
        } else if (typeof value === "number") {
            return 8; // Use 64-bit for all numbers
        } else if (typeof value === "boolean") {
            return 1;
        }
        return 0;
    }

    /**
     * Calculate the size of the functions section
     * @param {IRModule} module
     * @returns {number}
     */
    calculateFunctionsSize(module) {
        let size = 4; // count
        for (const fn of module.functions) {
            size += 4; // name string id
            size += 4; // param count
            for (const param of fn.params) {
                size += this.calculateTypeSize(param.ty);
                size += 4; // id
            }
            size += this.calculateTypeSize(fn.returnType);
            size += 4; // local count
            for (const local of fn.locals) {
                size += this.calculateTypeSize(local.ty);
                size += 4; // id
            }
            size += 4; // block count
            for (const block of fn.blocks) {
                size += this.calculateBlockSize(block);
            }
        }
        return size;
    }

    /**
     * Calculate the encoded size of a block
     * @param {IRBlock} block
     * @returns {number}
     */
    calculateBlockSize(block) {
        let size = 4; // block id
        size += 4; // param count
        for (const param of block.params) {
            size += this.calculateTypeSize(param.ty);
            size += 4; // id
        }
        size += 4; // instruction count
        for (const inst of block.instructions) {
            size += this.calculateInstructionSize(inst);
        }
        size += this.calculateTerminatorSize(block.terminator);
        return size;
    }

    /**
     * Calculate the encoded size of an instruction
     * @param {any} inst
     * @returns {number}
     */
    calculateInstructionSize(inst) {
        let size = 1; // opcode
        if (inst.id !== null) {
            size += 4; // dest value id
        }
        size += this.calculateTypeSize(inst.ty);

        switch (inst.kind) {
            case IRInstKind.Iconst:
                size += 8; // value (i64)
                break;
            case IRInstKind.Fconst:
                size += 8; // value (f64)
                break;
            case IRInstKind.Bconst:
                size += 1; // value (bool)
                break;
            case IRInstKind.Null:
                // No additional data
                break;
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
            case IRInstKind.Ishr:
            case IRInstKind.Icmp:
            case IRInstKind.Fcmp:
                size += 4 + 4; // a, b
                if (
                    inst.kind === IRInstKind.Icmp ||
                    inst.kind === IRInstKind.Fcmp
                ) {
                    size += 1; // op
                }
                break;
            case IRInstKind.Ineg:
            case IRInstKind.Fneg:
                size += 4; // a
                break;
            case IRInstKind.Alloca:
                size += 4; // local id
                break;
            case IRInstKind.Load:
                size += 4; // ptr
                break;
            case IRInstKind.Store:
                size += 4 + 4; // ptr, value
                size += this.calculateTypeSize(inst.valueType);
                break;
            case IRInstKind.Memcpy:
                size += 4 + 4 + 4; // dest, src, size
                break;
            case IRInstKind.Gep:
                size += 4; // ptr
                size += 4; // index count
                size += 4 * inst.indices.length; // indices
                break;
            case IRInstKind.Ptradd:
                size += 4 + 4; // ptr, offset
                break;
            case IRInstKind.Trunc:
            case IRInstKind.Sext:
            case IRInstKind.Zext:
            case IRInstKind.Fptoui:
            case IRInstKind.Fptosi:
            case IRInstKind.Uitofp:
            case IRInstKind.Sitofp:
            case IRInstKind.Bitcast:
                size += 4; // val
                if (inst.fromTy) {
                    size += this.calculateTypeSize(inst.fromTy);
                }
                break;
            case IRInstKind.Call:
            case IRInstKind.CallDyn:
                size += 4; // fn
                size += 4; // arg count
                size += 4 * inst.args.length; // args
                break;
            case IRInstKind.StructCreate:
                size += 4; // field count
                size += 4 * inst.fields.length; // fields
                break;
            case IRInstKind.StructGet:
                size += 4 + 4; // struct, field index
                break;
            case IRInstKind.EnumCreate:
                size += 4; // variant
                if (inst.data !== null && inst.data !== undefined) {
                    size += 1; // has_data = 1
                    size += 4; // data
                } else {
                    size += 1; // has_data = 0
                }
                break;
            case IRInstKind.EnumGetTag:
                size += 4; // enum
                break;
            case IRInstKind.EnumGetData:
                size += 4 + 4 + 4; // enum, variant, index
                break;
            case IRInstKind.Sconst:
                size += 4; // literal id
                break;
        }
        return size;
    }

    /**
     * Calculate the encoded size of a terminator
     * @param {any} term
     * @returns {number}
     */
    calculateTerminatorSize(term) {
        if (!term) return 1; // just tag (unreachable)

        let size = 1; // tag
        switch (term.kind) {
            case IRTermKind.Ret:
                if (term.value !== null && term.value !== undefined) {
                    size += 1; // has_value = 1
                    size += 4; // value
                } else {
                    size += 1; // has_value = 0
                }
                break;
            case IRTermKind.Br:
                size += 4; // target
                size += 4; // arg count
                size += 4 * term.args.length; // args
                break;
            case IRTermKind.BrIf:
                size += 4; // cond
                size += 4; // then block
                size += 4; // then arg count
                size += 4 * term.thenArgs.length; // then args
                size += 4; // else block
                size += 4; // else arg count
                size += 4 * term.elseArgs.length; // else args
                break;
            case IRTermKind.Switch:
                size += 4; // value
                size += 4; // case count
                for (const c of term.cases) {
                    size += 8; // case value (i64)
                    size += 4; // target
                    size += 4; // arg count
                    size += 4 * c.args.length; // args
                }
                size += 4; // default block
                size += 4; // default arg count
                size += 4 * term.defaultArgs.length; // default args
                break;
            case IRTermKind.Unreachable:
                // No additional data
                break;
        }
        return size;
    }

    // ========================================================================
    // Primitive Writers
    // ========================================================================

    /**
     * Write an unsigned 8-bit integer
     * @param {number} value
     */
    writeU8(value) {
        this.view.setUint8(this.pos, value);
        this.pos += 1;
    }

    /**
     * Write an unsigned 16-bit integer (little endian)
     * @param {number} value
     */
    writeU16(value) {
        this.view.setUint16(this.pos, value, true);
        this.pos += 2;
    }

    /**
     * Write an unsigned 32-bit integer (little endian)
     * @param {number} value
     */
    writeU32(value) {
        this.view.setUint32(this.pos, value, true);
        this.pos += 4;
    }

    /**
     * Write an unsigned 64-bit integer (little endian)
     * @param {bigint} value
     */
    writeU64(value) {
        this.view.setBigUint64(this.pos, value, true);
        this.pos += 8;
    }

    /**
     * Write a signed 32-bit integer (little endian)
     * @param {number} value
     */
    writeI32(value) {
        this.view.setInt32(this.pos, value, true);
        this.pos += 4;
    }

    /**
     * Write a signed 64-bit integer (little endian)
     * @param {bigint} value
     */
    writeI64(value) {
        this.view.setBigInt64(this.pos, value, true);
        this.pos += 8;
    }

    /**
     * Write a 32-bit float (little endian)
     * @param {number} value
     */
    writeF32(value) {
        this.view.setFloat32(this.pos, value, true);
        this.pos += 4;
    }

    /**
     * Write a 64-bit float (little endian)
     * @param {number} value
     */
    writeF64(value) {
        this.view.setFloat64(this.pos, value, true);
        this.pos += 8;
    }

    /**
     * Write raw bytes
     * @param {Uint8Array} data
     */
    writeBytes(data) {
        const view = new Uint8Array(this.view.buffer);
        view.set(data, this.pos);
        this.pos += data.length;
    }

    // ========================================================================
    // Section Writers
    // ========================================================================

    /**
     * Write the string table section
     */
    writeStringTableSection() {
        const strings = this.strings.getStrings();
        this.writeU32(strings.length);
        for (const str of strings) {
            const bytes = this.encodeUtf8(str);
            this.writeU32(bytes.length);
            this.writeBytes(bytes);
        }
    }

    /**
     * Write the types section
     * @param {IRModule} module
     */
    writeTypesSection(module) {
        // Write structs
        this.writeU32(module.structs.size);
        for (const [name, struct] of module.structs) {
            this.writeU32(this.strings.addString(name));
            this.writeU32(struct.fields.length);
            for (const field of struct.fields) {
                this.writeType(field.ty !== undefined ? field.ty : field);
            }
        }

        // Write enums
        this.writeU32(module.enums.size);
        for (const [name, enum_] of module.enums) {
            this.writeU32(this.strings.addString(name));
            this.writeU32(enum_.variants.length);
            for (const variant of enum_.variants) {
                const fields = variant.fields || [];
                this.writeU32(fields.length);
                for (const field of fields) {
                    this.writeType(field);
                }
            }
        }
    }

    /**
     * Write the string literal section.
     * @param {IRModule} module
     */
    writeStringLiteralsSection(module) {
        const literals = module.stringLiterals || [];
        this.writeU32(literals.length);
        for (const literal of literals) {
            const bytes = this.encodeUtf8(literal);
            this.writeU32(bytes.length);
            this.writeBytes(bytes);
        }
    }

    /**
     * Write the globals section
     * @param {IRModule} module
     */
    writeGlobalsSection(module) {
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

    /**
     * Write the functions section
     * @param {IRModule} module
     */
    writeFunctionsSection(module) {
        this.writeU32(module.functions.length);
        for (const fn of module.functions) {
            this.writeFunction(fn);
        }
    }

    // ========================================================================
    // Type Encoding
    // ========================================================================

    /**
     * Write a type
     * @param {IRType} type
     */
    writeType(type) {
        this.writeU8(type.kind);
        switch (type.kind) {
            case IRTypeKind.Int:
                this.writeU8(/** @type {number} */(type.width));
                break;
            case IRTypeKind.Float:
                this.writeU8(/** @type {number} */(type.width));
                break;
            case IRTypeKind.Bool:
            case IRTypeKind.Ptr:
            case IRTypeKind.Unit:
                // No additional data
                break;
            case IRTypeKind.Struct:
                this.writeU32(this.strings.addString(/** @type {string} */(type.name)));
                break;
            case IRTypeKind.Enum:
                this.writeU32(this.strings.addString(/** @type {string} */(type.name)));
                break;
            case IRTypeKind.Array:
                this.writeU32(/** @type {number} */(type.length));
                this.writeType(/** @type {IRType} */(type.element));
                break;
            case IRTypeKind.Fn:
                this.writeU32((type.params ?? []).length);
                for (const param of (type.params ?? [])) {
                    this.writeType(param);
                }
                this.writeType(/** @type {IRType} */(type.returnType));
                break;
        }
    }

    // ========================================================================
    // Constant Encoding
    // ========================================================================

    /**
     * Write a constant value
     * @param {any} value
     * @param {IRType} ty
     */
    writeConstant(value, ty) {
        switch (ty.kind) {
            case IRTypeKind.Int:
                if (typeof value === "bigint") {
                    this.writeI64(value);
                } else {
                    this.writeI64(BigInt(value));
                }
                break;
            case IRTypeKind.Float:
                this.writeF64(value);
                break;
            case IRTypeKind.Bool:
                this.writeU8(value ? 1 : 0);
                break;
        }
    }

    // ========================================================================
    // Function Encoding
    // ========================================================================

    /**
     * Write a function
     * @param {IRFunction} fn
     */
    writeFunction(fn) {
        this.writeU32(this.strings.addString(fn.name));

        // Parameters
        this.writeU32(fn.params.length);
        for (const param of fn.params) {
            this.writeType(param.ty);
            this.writeU32(param.id);
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
            this.writeBlock(block);
        }
    }

    // ========================================================================
    // Block Encoding
    // ========================================================================

    /**
     * Write a block
     * @param {IRBlock} block
     */
    writeBlock(block) {
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

    /**
     * Write an instruction
     * @param {any} inst
     */
    writeInstruction(inst) {
        this.writeU8(inst.kind);

        // Destination value (if present)
        if (inst.id !== null) {
            this.writeU32(inst.id);
        }

        // Type
        this.writeType(inst.ty);

        switch (inst.kind) {
            case IRInstKind.Iconst:
                if (typeof inst.value === "bigint") {
                    this.writeI64(inst.value);
                } else {
                    this.writeI64(BigInt(inst.value));
                }
                break;

            case IRInstKind.Fconst:
                this.writeF64(inst.value);
                break;

            case IRInstKind.Bconst:
                this.writeU8(inst.value ? 1 : 0);
                break;

            case IRInstKind.Null:
                // No additional data
                break;

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
            case IRInstKind.Ishr:
                this.writeU32(inst.a);
                this.writeU32(inst.b);
                break;

            case IRInstKind.Icmp:
                this.writeU32(inst.a);
                this.writeU32(inst.b);
                this.writeU8(inst.op);
                break;

            case IRInstKind.Fcmp:
                this.writeU32(inst.a);
                this.writeU32(inst.b);
                this.writeU8(inst.op);
                break;

            case IRInstKind.Ineg:
            case IRInstKind.Fneg:
                this.writeU32(inst.a);
                break;

            case IRInstKind.Alloca:
                this.writeU32(inst.localId);
                break;

            case IRInstKind.Load:
                this.writeU32(inst.ptr);
                break;

            case IRInstKind.Store:
                this.writeU32(inst.ptr);
                this.writeU32(inst.value);
                this.writeType(inst.valueType);
                break;

            case IRInstKind.Memcpy:
                this.writeU32(inst.dest);
                this.writeU32(inst.src);
                this.writeU32(inst.size);
                break;

            case IRInstKind.Gep:
                this.writeU32(inst.ptr);
                this.writeU32(inst.indices.length);
                for (const idx of inst.indices) {
                    this.writeU32(idx);
                }
                break;

            case IRInstKind.Ptradd:
                this.writeU32(inst.ptr);
                this.writeU32(inst.offset);
                break;

            case IRInstKind.Trunc:
            case IRInstKind.Sext:
            case IRInstKind.Zext:
                this.writeU32(inst.val);
                this.writeType(inst.fromTy);
                break;

            case IRInstKind.Fptoui:
            case IRInstKind.Fptosi:
            case IRInstKind.Uitofp:
            case IRInstKind.Sitofp:
            case IRInstKind.Bitcast:
                this.writeU32(inst.val);
                break;

            case IRInstKind.Call:
            case IRInstKind.CallDyn:
                this.writeU32(inst.fn);
                this.writeU32(inst.args.length);
                for (const arg of inst.args) {
                    this.writeU32(arg);
                }
                break;

            case IRInstKind.StructCreate:
                this.writeU32(inst.fields.length);
                for (const field of inst.fields) {
                    this.writeU32(field);
                }
                break;

            case IRInstKind.StructGet:
                this.writeU32(inst.struct);
                this.writeU32(inst.fieldIndex);
                break;

            case IRInstKind.EnumCreate:
                this.writeU32(inst.variant);
                if (inst.data !== null && inst.data !== undefined) {
                    this.writeU8(1);
                    this.writeU32(inst.data);
                } else {
                    this.writeU8(0);
                }
                break;

            case IRInstKind.EnumGetTag:
                this.writeU32(inst.enum);
                break;

            case IRInstKind.EnumGetData:
                this.writeU32(inst.enum);
                this.writeU32(inst.variant);
                this.writeU32(inst.index);
                break;

            case IRInstKind.Sconst:
                this.writeU32(inst.literalId);
                break;
        }
    }

    // ========================================================================
    // Terminator Encoding
    // ========================================================================

    /**
     * Write a terminator
     * @param {any} term
     */
    writeTerminator(term) {
        if (!term) {
            this.writeU8(IRTermKind.Unreachable);
            return;
        }

        this.writeU8(term.kind);

        switch (term.kind) {
            case IRTermKind.Ret:
                if (term.value !== null && term.value !== undefined) {
                    this.writeU8(1);
                    this.writeU32(term.value);
                } else {
                    this.writeU8(0);
                }
                break;

            case IRTermKind.Br:
                this.writeU32(term.target);
                this.writeU32(term.args.length);
                for (const arg of term.args) {
                    this.writeU32(arg);
                }
                break;

            case IRTermKind.BrIf:
                this.writeU32(term.cond);
                this.writeU32(term.thenBlock);
                this.writeU32(term.thenArgs.length);
                for (const arg of term.thenArgs) {
                    this.writeU32(arg);
                }
                this.writeU32(term.elseBlock);
                this.writeU32(term.elseArgs.length);
                for (const arg of term.elseArgs) {
                    this.writeU32(arg);
                }
                break;

            case IRTermKind.Switch:
                this.writeU32(term.value);
                this.writeU32(term.cases.length);
                for (const c of term.cases) {
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
                this.writeU32(term.defaultBlock);
                this.writeU32(term.defaultArgs.length);
                for (const arg of term.defaultArgs) {
                    this.writeU32(arg);
                }
                break;

            case IRTermKind.Unreachable:
                // No additional data
                break;
        }
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Encode a string to UTF-8 bytes
     * @param {string} str
     * @returns {Uint8Array}
     */
    encodeUtf8(str) {
        return new TextEncoder().encode(str);
    }

    /**
     * Calculate the UTF-8 byte length of a string
     * @param {string} str
     * @returns {number}
     */
    utf8ByteLength(str) {
        return new TextEncoder().encode(str).length;
    }
}

/**
 * Serialize an IR module to binary format
 * @param {IRModule} module
 * @returns {Uint8Array}
 */
function serializeModule(module) {
    const serializer = new IRSerializer();
    return serializer.serializeModule(module);
}

export {
    IRSerializer,
    StringTable,
    serializeModule,
    MAGIC,
    VERSION,
    FLAGS,
    SectionId,
    NO_VALUE,
};
