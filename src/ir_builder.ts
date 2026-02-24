import {
    freshValueId,
    makeIRBlock,
    addIRBlock,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
    addSuccessor,
    IRType,
    BlockId,
    ValueId,
    IRFunction,
    IRBlock,
    IRInst,
    FcmpOp,
    IcmpOp,
    LocalId,
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
import { FloatWidth, IntWidth } from "./types";

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
    currentModule: any | null;
    currentFunction: IRFunction | null;
    currentBlock: IRBlock | null;
    sealedBlocks: Set<BlockId>;
    varDefs: Map<string, Map<BlockId, ValueId>>;
    incompletePhis: Map<string, Map<BlockId, ValueId[]>>;
    varTypes: Map<string, IRType>;
    nextBlockId: number;

    constructor() {
        this.currentModule = null;
        this.currentFunction = null;
        this.currentBlock = null;
        this.sealedBlocks = new Set();
        this.varDefs = new Map(); // varName -> Map<blockId, ValueId>
        this.incompletePhis = new Map(); // blockId -> Map<varName, ValueId>
        this.varTypes = new Map(); // varName -> IRType
        this.nextBlockId = 0;
    }
    createFunction(name: string, params: IRType[], returnType: IRType) {
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

    createBlock(
        name: string | null = null,
        paramTypes: IRType[] = [],
    ): BlockId {
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

    switchToBlock(blockId: BlockId) {
        if (!this.currentFunction) {
            throw new Error("No current function");
        }
        const block = this.currentFunction.blocks.find((b) => b.id === blockId);
        if (!block) {
            throw new Error(`Block ${blockId} not found in function`);
        }
        this.currentBlock = block;
    }

    sealBlock(blockId: BlockId) {
        this.sealedBlocks.add(blockId);
    }

    isBlockSealed(blockId: BlockId): boolean {
        return this.sealedBlocks.has(blockId);
    }

    getPredecessors(blockId: BlockId): BlockId[] {
        if (!this.currentFunction) return [];
        const block = this.currentFunction.blocks.find((b) => b.id === blockId);
        return block?.predecessors ?? [];
    }

    // ============================================================================
    // Variable Operations (SSA Construction)
    // ============================================================================

    declareVar(name: string, type: IRType) {
        this.varTypes.set(name, type);
        this.varDefs.set(name, new Map());
        this.incompletePhis.set(name, new Map());
    }
    defineVar(name: string, value: ValueId, blockId: BlockId | null = null) {
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

    useVar(name: string, blockId: BlockId | null = null): ValueId {
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
            return defs.get(blockId) as ValueId;
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
        return phiValueId;
    }

    writeVar(name: string, blockId: BlockId, value: ValueId) {
        this.defineVar(name, value, blockId);
    }

    readVar(name: string, blockId: BlockId | null = null): ValueId {
        return this.useVar(name, blockId);
    }

    // ============================================================================
    // Constant Instructions
    // ============================================================================

    iconst(value: number, width: IntWidth): IRInst {
        const inst = makeIconst(value, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }
    fconst(value: number, width: FloatWidth): IRInst {
        const inst = makeFconst(value, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    bconst(value: boolean): IRInst {
        const inst = makeBconst(value);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    null(ty: IRType): IRInst {
        const inst = makeNull(ty);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Arithmetic Instructions
    // ============================================================================

    iadd(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIadd(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    isub(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIsub(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    imul(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeImul(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    idiv(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIdiv(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    imod(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeImod(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fadd(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        const inst = makeFadd(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fsub(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        const inst = makeFsub(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fmul(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        const inst = makeFmul(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fdiv(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        const inst = makeFdiv(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    ineg(a: ValueId, width: IntWidth): IRInst {
        const inst = makeIneg(a, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fneg(a: ValueId, width: FloatWidth): IRInst {
        const inst = makeFneg(a, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Bitwise Instructions
    // ============================================================================

    iand(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIand(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    ior(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIor(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    ixor(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIxor(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    ishl(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIshl(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    ishr(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        const inst = makeIshr(a, b, width);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Comparison Instructions
    // ============================================================================

    icmp(op: IcmpOp, a: ValueId, b: ValueId): IRInst {
        const inst = makeIcmp(op, a, b);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fcmp(op: FcmpOp, a: ValueId, b: ValueId): IRInst {
        const inst = makeFcmp(op, a, b);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Memory Instructions
    // ============================================================================

    alloca(ty: IRType, localId: LocalId | null = null): IRInst {
        const inst = makeAlloca(ty, localId);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    load(ptr: ValueId, ty: IRType): IRInst {
        const inst = makeLoad(ptr, ty);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    store(ptr: ValueId, value: ValueId, ty: IRType): IRInst {
        const inst = makeStore(ptr, value, ty);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    memcpy(dest: ValueId, src: ValueId, size: ValueId): IRInst {
        const inst = makeMemcpy(dest, src, size);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Address Instructions
    // ============================================================================

    gep(ptr: ValueId, indices: ValueId[], resultTy: IRType): IRInst {
        const inst = makeGep(ptr, indices, resultTy);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    ptradd(ptr: ValueId, offset: ValueId): IRInst {
        const inst = makePtradd(ptr, offset);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Conversion Instructions
    // ============================================================================

    trunc(val: ValueId, fromType: IRType, toType: IRType): IRInst {
        const inst = makeTrunc(val, fromType, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    sext(val: ValueId, fromType: IRType, toType: IRType): IRInst {
        const inst = makeSext(val, fromType, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    zext(val: ValueId, fromType: IRType, toType: IRType): IRInst {
        const inst = makeZext(val, fromType, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fptoui(val: ValueId, toType: IRType): IRInst {
        const inst = makeFptoui(val, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    fptosi(val: ValueId, toType: IRType): IRInst {
        const inst = makeFptosi(val, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    uitofp(val: ValueId, toType: IRType): IRInst {
        const inst = makeUitofp(val, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    sitofp(val: ValueId, toType: IRType): IRInst {
        const inst = makeSitofp(val, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    bitcast(val: ValueId, toType: IRType): IRInst {
        const inst = makeBitcast(val, toType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Call Instruction
    // ============================================================================

    call(
        fn: ValueId,
        args: ValueId[],
        returnType: IRType | null = null,
    ): IRInst {
        const inst = makeCall(fn, args, returnType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    callDyn(
        fn: ValueId,
        args: ValueId[],
        returnType: IRType | null = null,
    ): IRInst {
        const inst = makeCallDyn(fn, args, returnType);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Struct/Enum Instructions
    // ============================================================================

    structCreate(fields: ValueId[], ty: IRType): IRInst {
        const inst = makeStructCreate(fields, ty);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    structGet(struct: ValueId, fieldIndex: number, fieldTy: IRType): IRInst {
        const inst = makeStructGet(struct, fieldIndex, fieldTy);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    enumCreate(variant: number, data: ValueId | null, ty: IRType): IRInst {
        const inst = makeEnumCreate(variant, data, ty);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    enumGetTag(enum_: ValueId): IRInst {
        const inst = makeEnumGetTag(enum_);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    enumGetData(
        enum_: ValueId,
        variant: number,
        index: number,
        dataTy: IRType,
    ): IRInst {
        const inst = makeEnumGetData(enum_, variant, index, dataTy);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    sconst(literalId: number): IRInst {
        const inst = makeSconst(literalId);
        addIRInstruction(this.currentBlock!, inst);
        return inst;
    }

    // ============================================================================
    // Terminators
    // ============================================================================

    ret(value: ValueId | null = null) {
        const term = makeRet(value ?? null);
        setIRTerminator(this.currentBlock!, term);
    }

    br(target: BlockId, args: ValueId[] = []) {
        const term = makeBr(target, args);
        setIRTerminator(this.currentBlock!, term);
        addSuccessor(this.currentBlock!, target);
    }

    brIf(
        cond: ValueId,
        thenBlock: BlockId,
        thenArgs: ValueId[] | undefined,
        elseBlock: BlockId,
        elseArgs: ValueId[] | undefined = [],
    ) {
        const term = makeBrIf(cond, thenBlock, thenArgs, elseBlock, elseArgs);
        setIRTerminator(this.currentBlock!, term);
        addSuccessor(this.currentBlock!, thenBlock);
        addSuccessor(this.currentBlock!, elseBlock);
    }

    switch(
        value: ValueId,
        cases: Array<{
            value: any;
            target: BlockId;
            args: ValueId[];
        }>,
        defaultBlock: BlockId,
        defaultArgs: ValueId[] = [],
    ) {
        const term = makeSwitch(value, cases, defaultBlock, defaultArgs);
        setIRTerminator(this.currentBlock!, term);
        for (const c of cases) {
            addSuccessor(this.currentBlock!, c.target);
        }
        addSuccessor(this.currentBlock!, defaultBlock);
    }

    unreachable() {
        const term = makeUnreachable();
        setIRTerminator(this.currentBlock!, term);
    }

    // ============================================================================
    // Instruction Adding
    // ============================================================================

    add(inst: IRInst): ValueId | null {
        addIRInstruction(this.currentBlock!, inst);
        return inst.id;
    }

    // ============================================================================
    // Finalization
    // ============================================================================

    build(): IRFunction {
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
