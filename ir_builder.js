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
} from './ir.js';
import {
    IRInstKind,
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
} from './ir_instructions.js';
import {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeSwitchCase,
    makeUnreachable,
} from './ir_terminators.js';

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
        this.currentModule = null;
        this.currentFunction = null;
        this.currentBlock = null;
        this.sealedBlocks = new Set();
        this.varDefs = new Map(); // varName -> Map<blockId, ValueId>
        this.incompletePhis = new Map(); // blockId -> Map<varName, ValueId>
        this.varTypes = new Map(); // varName -> IRType
        this.nextValueId = 0;
        this.nextBlockId = 0;
    }

    // ============================================================================
    // Function & Block Management
    // ============================================================================

    createFunction(name, params, returnType) {
        this.currentFunction = {
            id: this.nextValueId++, // placeholder
            name,
            params: params.map((ty, i) => ({ id: this.nextValueId++, name: `arg${i}`, ty })),
            returnType,
            blocks: [],
            locals: [],
            entry: null,
        };
        this.currentModule = null; // Will be set later if added to module
    }

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

    switchToBlock(blockId) {
        const block = this.currentFunction.blocks.find(b => b.id === blockId);
        if (!block) {
            throw new Error(`Block ${blockId} not found in function`);
        }
        this.currentBlock = block;
    }

    sealBlock(blockId) {
        this.sealedBlocks.add(blockId);
    }

    isBlockSealed(blockId) {
        return this.sealedBlocks.has(blockId);
    }

    getPredecessors(blockId) {
        const block = this.currentFunction.blocks.find(b => b.id === blockId);
        return block ? block.predecessors : [];
    }

    // ============================================================================
    // Variable Operations (SSA Construction)
    // ============================================================================

    declareVar(name, type) {
        this.varTypes.set(name, type);
        this.varDefs.set(name, new Map());
        this.incompletePhis.set(name, new Map());
    }

    defineVar(name, value, blockId = null) {
        if (blockId === null) {
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

    useVar(name, blockId = null) {
        if (blockId === null) {
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
        return makeIconst(value, width);
    }

    fconst(value, width) {
        return makeFconst(value, width);
    }

    bconst(value) {
        return makeBconst(value);
    }

    null(ty) {
        return makeNull(ty);
    }

    // ============================================================================
    // Arithmetic Instructions
    // ============================================================================

    iadd(a, b, width) {
        return makeIadd(a, b, width);
    }

    isub(a, b, width) {
        return makeIsub(a, b, width);
    }

    imul(a, b, width) {
        return makeImul(a, b, width);
    }

    idiv(a, b, width) {
        return makeIdiv(a, b, width);
    }

    imod(a, b, width) {
        return makeImod(a, b, width);
    }

    fadd(a, b, width) {
        return makeFadd(a, b, width);
    }

    fsub(a, b, width) {
        return makeFsub(a, b, width);
    }

    fmul(a, b, width) {
        return makeFmul(a, b, width);
    }

    fdiv(a, b, width) {
        return makeFdiv(a, b, width);
    }

    ineg(a, width) {
        return makeIneg(a, width);
    }

    fneg(a, width) {
        return makeFneg(a, width);
    }

    // ============================================================================
    // Bitwise Instructions
    // ============================================================================

    iand(a, b, width) {
        return makeIand(a, b, width);
    }

    ior(a, b, width) {
        return makeIor(a, b, width);
    }

    ixor(a, b, width) {
        return makeIxor(a, b, width);
    }

    ishl(a, b, width) {
        return makeIshl(a, b, width);
    }

    ishr(a, b, width) {
        return makeIshr(a, b, width);
    }

    // ============================================================================
    // Comparison Instructions
    // ============================================================================

    icmp(op, a, b) {
        return makeIcmp(op, a, b);
    }

    fcmp(op, a, b) {
        return makeFcmp(op, a, b);
    }

    // ============================================================================
    // Memory Instructions
    // ============================================================================

    alloca(ty, localId = null) {
        return makeAlloca(ty, localId);
    }

    load(ptr, ty) {
        return makeLoad(ptr, ty);
    }

    store(ptr, value, ty) {
        return makeStore(ptr, value, ty);
    }

    memcpy(dest, src, size) {
        return makeMemcpy(dest, src, size);
    }

    // ============================================================================
    // Address Instructions
    // ============================================================================

    gep(ptr, indices, resultTy) {
        return makeGep(ptr, indices, resultTy);
    }

    ptradd(ptr, offset) {
        return makePtradd(ptr, offset);
    }

    // ============================================================================
    // Conversion Instructions
    // ============================================================================

    trunc(val, fromType, toType) {
        return makeTrunc(val, fromType, toType);
    }

    sext(val, fromType, toType) {
        return makeSext(val, fromType, toType);
    }

    zext(val, fromType, toType) {
        return makeZext(val, fromType, toType);
    }

    fptoui(val, toType) {
        return makeFptoui(val, toType);
    }

    fptosi(val, toType) {
        return makeFptosi(val, toType);
    }

    uitofp(val, toType) {
        return makeUitofp(val, toType);
    }

    sitofp(val, toType) {
        return makeSitofp(val, toType);
    }

    bitcast(val, toType) {
        return makeBitcast(val, toType);
    }

    // ============================================================================
    // Call Instruction
    // ============================================================================

    call(fn, args, returnType = null) {
        return makeCall(fn, args, returnType);
    }

    // ============================================================================
    // Struct/Enum Instructions
    // ============================================================================

    structCreate(fields, ty) {
        return makeStructCreate(fields, ty);
    }

    structGet(struct, fieldIndex, fieldTy) {
        return makeStructGet(struct, fieldIndex, fieldTy);
    }

    enumCreate(variant, data, ty) {
        return makeEnumCreate(variant, data, ty);
    }

    enumGetTag(enum_) {
        return makeEnumGetTag(enum_);
    }

    enumGetData(enum_, variant, index, dataTy) {
        return makeEnumGetData(enum_, variant, index, dataTy);
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
                console.warn(`Block ${block.id} not sealed`);
            }
        }

        return this.currentFunction;
    }
}
