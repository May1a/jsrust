/** @typedef {number} ValueId */
/** @typedef {number} BlockId */
/** @typedef {import('./ir').IRType} IRType */
/** @typedef {import('./ir').IRFunction} IRFunction */
/** @typedef {import('./ir').IRBlock} IRBlock */

import {
    freshValueId,
    makeIRBlock,
    addIRBlock,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
    addSuccessor,
} from "./ir";
import {
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
} from "./ir_instructions";
import {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeUnreachable,
} from "./ir_terminators";

/**
 * IRBuilder - constructs SSA IR functions incrementally
 *
 * Usage:
 *   const builder = new IRBuilder();
 *   builder.createFunction('my_fn', [param types], returnType);
 *   builder.createBlock('entry');
 *   builder.switchToBlock('entry');
 *   const x = builder.iconst(42, IntWidth.I32);
 *   builder.ret(x);
 *   const fn = builder.build();
 */
export class IRBuilder {
    constructor() {
        /** @type {any | null} */
        this.currentModule = null;
        /** @type {IRFunction | null} */
        this.currentFunction = null;
        /** @type {IRBlock | null} */
        this.currentBlock = null;
        /** @type {Set<BlockId>} */
        this.sealedBlocks = new Set();
        /** @type {Map<string, Map<BlockId, ValueId>>} */
        this.varDefs = new Map(); // varName -> Map<blockId, ValueId>
        /** @type {Map<string, Map<BlockId, ValueId[]>>} */
        this.incompletePhis = new Map(); // blockId -> Map<varName, ValueId>
        /** @type {Map<string, IRType>} */
        this.varTypes = new Map(); // varName -> IRType
        /** @type {number} */
        this.nextBlockId = 0;
    }

    // ============================================================================
    // Function & Block Management
    // ============================================================================

    /**
     * @param {string} name
     * @param {IRType[]} params
     * @param {IRType} returnType
     */
    createFunction(name, params, returnType) {
        this.currentFunction = {
            id: freshValueId(),
            name,
            params: params.map((ty, i) => ({
                id: freshValueId(),
                name: `arg${i}`,
                ty,
            })),
            returnType,
            blocks: [],
            locals: [],
            entry: null,
        };
        this.currentModule = null; // Will be set later if added to module
    }

    /**
     * @param {string | null} [name]
     * @param {IRType[]} [paramTypes=[]]
     * @returns {BlockId}
     */
    createBlock(name = null, paramTypes = []) {
        const blockId = this.nextBlockId++;
        const block = makeIRBlock(blockId);
        if (name) {
            block.name = name;
        }
        for (const ty of paramTypes) {
            addIRBlockParam(block, freshValueId(), ty);
        }
        if (this.currentFunction) {
            addIRBlock(this.currentFunction, block);
            if (this.currentFunction.entry === null) {
                this.currentFunction.entry = block;
            }
        }
        return blockId;
    }

    /**
     * @param {BlockId} blockId
     */
    switchToBlock(blockId) {
        if (!this.currentFunction) {
            throw new Error("No current function");
        }
        const block = this.currentFunction.blocks.find((b) => b.id === blockId);
        if (!block) {
            throw new Error(`Block ${blockId} not found in function`);
        }
        this.currentBlock = block;
    }

    /**
     * @param {BlockId} blockId
     */
    sealBlock(blockId) {
        this.sealedBlocks.add(blockId);
    }

    /**
     * @param {BlockId} blockId
     * @returns {boolean}
     */
    isBlockSealed(blockId) {
        return this.sealedBlocks.has(blockId);
    }

    /**
     * @param {BlockId} blockId
     * @returns {BlockId[]}
     */
    getPredecessors(blockId) {
        if (!this.currentFunction) return [];
        const block = this.currentFunction.blocks.find((b) => b.id === blockId);
        return block ? block.predecessors : [];
    }

    // ============================================================================
    // Variable Operations (SSA Construction)
    // ============================================================================

    /**
     * @param {string} name
     * @param {IRType} type
     */
    declareVar(name, type) {
        this.varTypes.set(name, type);
        this.varDefs.set(name, new Map());
        this.incompletePhis.set(name, new Map());
    }

    /**
     * @param {string} name
     * @param {ValueId} value
     * @param {BlockId | null} [blockId]
     */
    defineVar(name, value, blockId = null) {
        if (blockId === null) {
            if (!this.currentBlock) throw new Error("No current block");
            blockId = this.currentBlock.id;
        }
        const defs = this.varDefs.get(name);
        if (!defs) {
            throw new Error(`Variable ${name} not declared`);
        }
        defs.set(blockId, value);

        // If there are incomplete phis waiting at this block, update them
        const phis = this.incompletePhis.get(name);
        if (phis) {
            const phiVal = phis.get(blockId);
            if (phiVal !== undefined) {
                // In a full implementation, we'd add the operand to the phi node
                // For now, we'll mark the phi as having one more incoming value
                // This is simplified; real phi construction is more complex
            }
        }
    }

    /**
     * @param {string} name
     * @param {BlockId | null} [blockId]
     * @returns {ValueId}
     */
    useVar(name, blockId = null) {
        if (blockId === null) {
            if (!this.currentBlock) throw new Error("No current block");
            blockId = this.currentBlock.id;
        }
        const defs = this.varDefs.get(name);
        if (!defs) {
            throw new Error(`Variable ${name} not declared`);
        }

        // Find the defining block that dominates this block
        // Simplified: look for definition in current block first, then predecessors
        if (defs.has(blockId)) {
            return /** @type {import('./ir').ValueId} */ (defs.get(blockId));
        }

        // Need to create phi node (simplified)
        // In real SSA construction, we'd insert phi at dominance frontiers
        // For now, we'll create a placeholder
        const phiValueId = freshValueId();
        // Record that this phi needs an operand from this block
        let phis = this.incompletePhis.get(name);
        if (!phis) {
            phis = new Map();
            this.incompletePhis.set(name, phis);
        }
        const existing = phis.get(blockId);
        if (existing === undefined) {
            phis.set(blockId, [phiValueId]);
        } else {
            existing.push(phiValueId);
        }
        return /** @type {import('./ir').ValueId} */ (phiValueId);
    }

    /**
     * @param {string} name
     * @param {import('./ir').BlockId} blockId
     * @param {import('./ir').ValueId} value
     */
    writeVar(name, blockId, value) {
        this.defineVar(name, value, blockId);
    }

    /**
     * @param {string} name
     * @param {import('./ir').BlockId | null} [blockId]
     * @returns {import('./ir').ValueId}
     */
    readVar(name, blockId = null) {
        return this.useVar(name, blockId);
    }

    // ============================================================================
    // Constant Instructions
    // ============================================================================

    /**
     * @param {number} value
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    iconst(value, width) {
        const inst = makeIconst(value, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {number} value
     * @param {import('./ir').FloatWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    fconst(value, width) {
        const inst = makeFconst(value, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {boolean} value
     * @returns {import('./ir').IRInst}
     */
    bconst(value) {
        const inst = makeBconst(value);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').IRType} ty
     * @returns {import('./ir').IRInst}
     */
    null(ty) {
        const inst = makeNull(ty);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Arithmetic Instructions
    // ============================================================================

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    iadd(a, b, width) {
        const inst = makeIadd(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    isub(a, b, width) {
        const inst = makeIsub(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    imul(a, b, width) {
        const inst = makeImul(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    idiv(a, b, width) {
        const inst = makeIdiv(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    imod(a, b, width) {
        const inst = makeImod(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').FloatWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    fadd(a, b, width) {
        const inst = makeFadd(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').FloatWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    fsub(a, b, width) {
        const inst = makeFsub(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').FloatWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    fmul(a, b, width) {
        const inst = makeFmul(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').FloatWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    fdiv(a, b, width) {
        const inst = makeFdiv(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    ineg(a, width) {
        const inst = makeIneg(a, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').FloatWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    fneg(a, width) {
        const inst = makeFneg(a, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Bitwise Instructions
    // ============================================================================

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    iand(a, b, width) {
        const inst = makeIand(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    ior(a, b, width) {
        const inst = makeIor(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    ixor(a, b, width) {
        const inst = makeIxor(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    ishl(a, b, width) {
        const inst = makeIshl(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @param {import('./ir').IntWidthValue} width
     * @returns {import('./ir').IRInst}
     */
    ishr(a, b, width) {
        const inst = makeIshr(a, b, width);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Comparison Instructions
    // ============================================================================

    /**
     * @param {import('./ir').IcmpOpValue} op
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @returns {import('./ir').IRInst}
     */
    icmp(op, a, b) {
        const inst = makeIcmp(op, a, b);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').FcmpOpValue} op
     * @param {import('./ir').ValueId} a
     * @param {import('./ir').ValueId} b
     * @returns {import('./ir').IRInst}
     */
    fcmp(op, a, b) {
        const inst = makeFcmp(op, a, b);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Memory Instructions
    // ============================================================================

    /**
     * @param {import('./ir').IRType} ty
     * @param {import('./ir').LocalId | null} [localId]
     * @returns {import('./ir').IRInst}
     */
    alloca(ty, localId = null) {
        const inst = makeAlloca(ty, localId);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} ptr
     * @param {import('./ir').IRType} ty
     * @returns {import('./ir').IRInst}
     */
    load(ptr, ty) {
        const inst = makeLoad(ptr, ty);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} ptr
     * @param {import('./ir').ValueId} value
     * @param {import('./ir').IRType} ty
     * @returns {import('./ir').IRInst}
     */
    store(ptr, value, ty) {
        const inst = makeStore(ptr, value, ty);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} dest
     * @param {import('./ir').ValueId} src
     * @param {import('./ir').ValueId} size
     * @returns {import('./ir').IRInst}
     */
    memcpy(dest, src, size) {
        const inst = makeMemcpy(dest, src, size);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Address Instructions
    // ============================================================================

    /**
     * @param {import('./ir').ValueId} ptr
     * @param {import('./ir').ValueId[]} indices
     * @param {import('./ir').IRType} resultTy
     * @returns {import('./ir').IRInst}
     */
    gep(ptr, indices, resultTy) {
        const inst = makeGep(ptr, indices, resultTy);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} ptr
     * @param {import('./ir').ValueId} offset
     * @returns {import('./ir').IRInst}
     */
    ptradd(ptr, offset) {
        const inst = makePtradd(ptr, offset);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Conversion Instructions
    // ============================================================================

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} fromType
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    trunc(val, fromType, toType) {
        const inst = makeTrunc(val, fromType, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} fromType
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    sext(val, fromType, toType) {
        const inst = makeSext(val, fromType, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} fromType
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    zext(val, fromType, toType) {
        const inst = makeZext(val, fromType, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    fptoui(val, toType) {
        const inst = makeFptoui(val, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    fptosi(val, toType) {
        const inst = makeFptosi(val, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    uitofp(val, toType) {
        const inst = makeUitofp(val, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    sitofp(val, toType) {
        const inst = makeSitofp(val, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} val
     * @param {import('./ir').IRType} toType
     * @returns {import('./ir').IRInst}
     */
    bitcast(val, toType) {
        const inst = makeBitcast(val, toType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Call Instruction
    // ============================================================================

    /**
     * @param {import('./ir').ValueId} fn
     * @param {import('./ir').ValueId[]} args
     * @param {import('./ir').IRType | null} [returnType]
     * @returns {import('./ir').IRInst}
     */
    call(fn, args, returnType = null) {
        const inst = makeCall(fn, args, returnType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} fn
     * @param {import('./ir').ValueId[]} args
     * @param {import('./ir').IRType | null} [returnType]
     * @returns {import('./ir').IRInst}
     */
    callDyn(fn, args, returnType = null) {
        const inst = makeCallDyn(fn, args, returnType);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Struct/Enum Instructions
    // ============================================================================

    /**
     * @param {import('./ir').ValueId[]} fields
     * @param {import('./ir').IRType} ty
     * @returns {import('./ir').IRInst}
     */
    structCreate(fields, ty) {
        const inst = makeStructCreate(fields, ty);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} struct
     * @param {number} fieldIndex
     * @param {import('./ir').IRType} fieldTy
     * @returns {import('./ir').IRInst}
     */
    structGet(struct, fieldIndex, fieldTy) {
        const inst = makeStructGet(struct, fieldIndex, fieldTy);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {number} variant
     * @param {import('./ir').ValueId | null} data
     * @param {import('./ir').IRType} ty
     * @returns {import('./ir').IRInst}
     */
    enumCreate(variant, data, ty) {
        const inst = makeEnumCreate(variant, data, ty);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} enum_
     * @returns {import('./ir').IRInst}
     */
    enumGetTag(enum_) {
        const inst = makeEnumGetTag(enum_);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {import('./ir').ValueId} enum_
     * @param {number} variant
     * @param {number} index
     * @param {import('./ir').IRType} dataTy
     * @returns {import('./ir').IRInst}
     */
    enumGetData(enum_, variant, index, dataTy) {
        const inst = makeEnumGetData(enum_, variant, index, dataTy);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    /**
     * @param {number} literalId
     * @returns {import('./ir').IRInst}
     */
    sconst(literalId) {
        const inst = makeSconst(literalId);
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst;
    }

    // ============================================================================
    // Terminators
    // ============================================================================

    /**
     * @param {import('./ir').ValueId | null} [value]
     */
    ret(value = null) {
        const term = makeRet(value ?? null);
        setIRTerminator(/** @type {import('./ir').IRBlock} */(this.currentBlock), term);
    }

    /**
     * @param {import('./ir').BlockId} target
     * @param {import('./ir').ValueId[]} [args]
     */
    br(target, args = []) {
        const term = makeBr(target, args);
        setIRTerminator(/** @type {import('./ir').IRBlock} */(this.currentBlock), term);
        addSuccessor(/** @type {import('./ir').IRBlock} */(this.currentBlock), target);
    }

    /**
     * @param {import('./ir').ValueId} cond
     * @param {import('./ir').BlockId} thenBlock
     * @param {import('./ir').ValueId[] | undefined} thenArgs
     * @param {import('./ir').BlockId} elseBlock
     * @param {import('./ir').ValueId[] | undefined} [elseArgs]
     */
    brIf(cond, thenBlock, thenArgs, elseBlock, elseArgs = []) {
        const term = makeBrIf(cond, thenBlock, thenArgs, elseBlock, elseArgs);
        setIRTerminator(/** @type {import('./ir').IRBlock} */(this.currentBlock), term);
        addSuccessor(/** @type {import('./ir').IRBlock} */(this.currentBlock), thenBlock);
        addSuccessor(/** @type {import('./ir').IRBlock} */(this.currentBlock), elseBlock);
    }

    /**
     * @param {import('./ir').ValueId} value
     * @param {Array<{ value: any, target: import('./ir').BlockId, args: import('./ir').ValueId[] }>} cases
     * @param {import('./ir').BlockId} defaultBlock
     * @param {import('./ir').ValueId[]} [defaultArgs]
     */
    switch(value, cases, defaultBlock, defaultArgs = []) {
        const term = makeSwitch(value, cases, defaultBlock, defaultArgs);
        setIRTerminator(/** @type {import('./ir').IRBlock} */(this.currentBlock), term);
        for (const c of cases) {
            addSuccessor(/** @type {import('./ir').IRBlock} */(this.currentBlock), c.target);
        }
        addSuccessor(/** @type {import('./ir').IRBlock} */(this.currentBlock), defaultBlock);
    }

    unreachable() {
        const term = makeUnreachable();
        setIRTerminator(/** @type {import('./ir').IRBlock} */(this.currentBlock), term);
    }

    // ============================================================================
    // Instruction Adding
    // ============================================================================

    /**
     * @param {import('./ir').IRInst} inst
     * @returns {import('./ir').ValueId | null}
     */
    add(inst) {
        addIRInstruction(/** @type {import('./ir').IRBlock} */(this.currentBlock), inst);
        return inst.id;
    }

    // ============================================================================
    // Finalization
    // ============================================================================

    /**
     * @returns {import('./ir').IRFunction}
     */
    build() {
        if (!this.currentFunction) {
            throw new Error("No current function");
        }
        // Verify all blocks terminated
        for (const block of this.currentFunction.blocks) {
            if (!block.terminator) {
                throw new Error(`Block ${block.id} has no terminator`);
            }
        }

        // Verify all blocks sealed
        for (const block of this.currentFunction.blocks) {
            if (!this.sealedBlocks.has(block.id)) {
                if (process?.env?.TEST_VERBOSE === "1") {
                    console.warn(`Block ${block.id} not sealed`);
                }
            }
        }

        return this.currentFunction;
    }
}
