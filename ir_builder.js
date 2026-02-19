// @ts-nocheck
/** @typedef {number} ValueId */
/** @typedef {number} BlockId */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').IRFunction} IRFunction */
/** @typedef {import('./ir.js').IRBlock} IRBlock */

import {
    freshValueId,
    freshBlockId,
    makeIRBlock,
    addIRBlock,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
    addPredecessor,
    addSuccessor,
    makeIRLocal,
} from "./ir.js";
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
    makeStructCreate,
    makeStructGet,
    makeEnumCreate,
    makeEnumGetTag,
    makeEnumGetData,
} from "./ir_instructions.js";
import {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeSwitchCase,
    makeUnreachable,
} from "./ir_terminators.js";

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
        this.nextValueId = 0;
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
            id: this.nextValueId++, // placeholder
            name,
            params: params.map((ty, i) => ({
                id: this.nextValueId++,
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
     * @returns {BlockId}
     */
    createBlock(name = null) {
        const blockId = this.nextBlockId++;
        const block = makeIRBlock(blockId);
        if (name) {
            block.name = name;
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
            return defs.get(blockId);
        }

        // Need to create phi node (simplified)
        // In real SSA construction, we'd insert phi at dominance frontiers
        // For now, we'll create a placeholder
        const phiValueId = this.nextValueId++;
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
        return phiValueId;
    }

    writeVar(name, blockId, value) {
        this.defineVar(name, value, blockId);
    }

    readVar(name, blockId = null) {
        return this.useVar(name, blockId);
    }

    // ============================================================================
    // Constant Instructions
    // ============================================================================

    iconst(value, width) {
        const inst = makeIconst(value, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fconst(value, width) {
        const inst = makeFconst(value, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    bconst(value) {
        const inst = makeBconst(value);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    null(ty) {
        const inst = makeNull(ty);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Arithmetic Instructions
    // ============================================================================

    iadd(a, b, width) {
        const inst = makeIadd(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    isub(a, b, width) {
        const inst = makeIsub(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    imul(a, b, width) {
        const inst = makeImul(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    idiv(a, b, width) {
        const inst = makeIdiv(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    imod(a, b, width) {
        const inst = makeImod(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fadd(a, b, width) {
        const inst = makeFadd(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fsub(a, b, width) {
        const inst = makeFsub(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fmul(a, b, width) {
        const inst = makeFmul(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fdiv(a, b, width) {
        const inst = makeFdiv(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    ineg(a, width) {
        const inst = makeIneg(a, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fneg(a, width) {
        const inst = makeFneg(a, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Bitwise Instructions
    // ============================================================================

    iand(a, b, width) {
        const inst = makeIand(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    ior(a, b, width) {
        const inst = makeIor(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    ixor(a, b, width) {
        const inst = makeIxor(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    ishl(a, b, width) {
        const inst = makeIshl(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    ishr(a, b, width) {
        const inst = makeIshr(a, b, width);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Comparison Instructions
    // ============================================================================

    icmp(op, a, b) {
        const inst = makeIcmp(op, a, b);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fcmp(op, a, b) {
        const inst = makeFcmp(op, a, b);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Memory Instructions
    // ============================================================================

    alloca(ty, localId = null) {
        const inst = makeAlloca(ty, localId);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    load(ptr, ty) {
        const inst = makeLoad(ptr, ty);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    store(ptr, value, ty) {
        const inst = makeStore(ptr, value, ty);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    memcpy(dest, src, size) {
        const inst = makeMemcpy(dest, src, size);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Address Instructions
    // ============================================================================

    gep(ptr, indices, resultTy) {
        const inst = makeGep(ptr, indices, resultTy);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    ptradd(ptr, offset) {
        const inst = makePtradd(ptr, offset);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Conversion Instructions
    // ============================================================================

    trunc(val, fromType, toType) {
        const inst = makeTrunc(val, fromType, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    sext(val, fromType, toType) {
        const inst = makeSext(val, fromType, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    zext(val, fromType, toType) {
        const inst = makeZext(val, fromType, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fptoui(val, toType) {
        const inst = makeFptoui(val, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    fptosi(val, toType) {
        const inst = makeFptosi(val, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    uitofp(val, toType) {
        const inst = makeUitofp(val, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    sitofp(val, toType) {
        const inst = makeSitofp(val, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    bitcast(val, toType) {
        const inst = makeBitcast(val, toType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Call Instruction
    // ============================================================================

    call(fn, args, returnType = null) {
        const inst = makeCall(fn, args, returnType);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Struct/Enum Instructions
    // ============================================================================

    structCreate(fields, ty) {
        const inst = makeStructCreate(fields, ty);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    structGet(struct, fieldIndex, fieldTy) {
        const inst = makeStructGet(struct, fieldIndex, fieldTy);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    enumCreate(variant, data, ty) {
        const inst = makeEnumCreate(variant, data, ty);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    enumGetTag(enum_) {
        const inst = makeEnumGetTag(enum_);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    enumGetData(enum_, variant, index, dataTy) {
        const inst = makeEnumGetData(enum_, variant, index, dataTy);
        addIRInstruction(this.currentBlock, inst);
        return inst;
    }

    // ============================================================================
    // Terminators
    // ============================================================================

    ret(value = null) {
        const term = makeRet(value);
        setIRTerminator(this.currentBlock, term);
    }

    br(target, args = []) {
        const term = makeBr(target, args);
        setIRTerminator(this.currentBlock, term);
        addSuccessor(this.currentBlock, target);
    }

    brIf(cond, thenBlock, thenArgs = [], elseBlock, elseArgs = []) {
        const term = makeBrIf(cond, thenBlock, thenArgs, elseBlock, elseArgs);
        setIRTerminator(this.currentBlock, term);
        addSuccessor(this.currentBlock, thenBlock);
        addSuccessor(this.currentBlock, elseBlock);
    }

    switch(value, cases, defaultBlock, defaultArgs = []) {
        const term = makeSwitch(value, cases, defaultBlock, defaultArgs);
        setIRTerminator(this.currentBlock, term);
        for (const c of cases) {
            addSuccessor(this.currentBlock, c.target);
        }
        addSuccessor(this.currentBlock, defaultBlock);
    }

    unreachable() {
        const term = makeUnreachable();
        setIRTerminator(this.currentBlock, term);
    }

    // ============================================================================
    // Instruction Adding
    // ============================================================================

    add(inst) {
        addIRInstruction(this.currentBlock, inst);
        return inst.id;
    }

    // ============================================================================
    // Finalization
    // ============================================================================

    build() {
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
