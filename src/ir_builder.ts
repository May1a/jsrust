import {
    type BlockId,
    type FcmpOp,
    type IRBlock,
    type IRFunction,
    type IRInst,
    type IRType,
    type IcmpOp,
    type FloatWidth,
    type IntWidth,
    type LocalId,
    type ValueId,
    addIRBlock,
    addIRBlockParam,
    addIRInstruction,
    addSuccessor,
    freshValueId,
    makeIRBlock,
    setIRTerminator,
} from "./ir";
import {
    makeAlloca,
    makeBconst,
    makeBitcast,
    makeCall,
    makeCallDyn,
    makeEnumCreate,
    makeEnumGetData,
    makeEnumGetTag,
    makeFadd,
    makeFcmp,
    makeFconst,
    makeFdiv,
    makeFmul,
    makeFneg,
    makeFptosi,
    makeFptoui,
    makeFsub,
    makeGep,
    makeIadd,
    makeIand,
    makeIcmp,
    makeIconst,
    makeIdiv,
    makeImod,
    makeImul,
    makeIneg,
    makeIor,
    makeIshl,
    makeIshr,
    makeIsub,
    makeIxor,
    makeLoad,
    makeMemcpy,
    makeNull,
    makePtradd,
    makeSconst,
    makeSext,
    makeSitofp,
    makeStore,
    makeStructCreate,
    makeStructGet,
    makeTrunc,
    makeUitofp,
    makeZext,
} from "./ir_instructions";
import {
    makeBr,
    makeBrIf,
    makeRet,
    type SwitchCase,
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
    currentModule?: unknown;
    currentFunction?: IRFunction;
    currentBlock?: IRBlock;
    sealedBlocks: Set<BlockId>;
    varDefs: Map<string, Map<BlockId, ValueId>>;
    incompletePhis: Map<string, Map<BlockId, ValueId[]>>;
    varTypes: Map<string, IRType>;
    nextBlockId: number;

    constructor() {
        this.sealedBlocks = new Set();
        this.varDefs = new Map(); // VarName -> Map<blockId, ValueId>
        this.incompletePhis = new Map(); // BlockId -> Map<varName, ValueId>
        this.varTypes = new Map(); // VarName -> IRType
        this.nextBlockId = 0;
    }
    createFunction(name: string, params: IRType[], returnType: IRType): void {
        this.currentFunction = {
            blocks: [],
            id: freshValueId(),
            locals: [],
            name,
            params: params.map((ty, i) => ({
                id: freshValueId(),
                name: `arg${i}`,
                ty,
            })),
            returnType,
        };
    }

    createBlock(name?: string, paramTypes: IRType[] = []): BlockId {
        const blockId = this.nextBlockId++;
        const block = makeIRBlock(blockId, name);
        for (const ty of paramTypes) {
            addIRBlockParam(block, freshValueId(), ty);
        }
        if (this.currentFunction) {
            addIRBlock(this.currentFunction, block);
            this.currentFunction.entry ??= block;
        }
        return blockId;
    }

    switchToBlock(blockId: BlockId): void {
        if (!this.currentFunction) {
            throw new Error("No current function");
        }
        const block = this.currentFunction.blocks.find((b) => b.id === blockId);
        if (!block) {
            throw new Error(`Block ${blockId} not found in function`);
        }
        this.currentBlock = block;
    }

    sealBlock(blockId: BlockId): void {
        this.sealedBlocks.add(blockId);
    }

    isBlockSealed(blockId: BlockId): boolean {
        return this.sealedBlocks.has(blockId);
    }

    getPredecessors(blockId: BlockId): BlockId[] {
        if (this.currentFunction === undefined) {
            return [];
        }
        const block = this.currentFunction.blocks.find(
            (candidate) => candidate.id === blockId,
        );
        return block === undefined ? [] : block.predecessors;
    }

    // ============================================================================
    // Variable Operations (SSA Construction)
    // ============================================================================

    declareVar(name: string, type: IRType): void {
        this.varTypes.set(name, type);
        this.varDefs.set(name, new Map());
        this.incompletePhis.set(name, new Map());
    }
    defineVar(name: string, value: ValueId, blockId?: BlockId): void {
        const resolvedBlockId = blockId ?? this.requireCurrentBlock().id;
        const defs = this.varDefs.get(name);
        if (!defs) {
            throw new Error(`Variable ${name} not declared`);
        }
        defs.set(resolvedBlockId, value);
        // If there are incomplete phis waiting at this block, update them
        const phis = this.incompletePhis.get(name);
        if (phis) {
            const phiVal = phis.get(resolvedBlockId);
            if (phiVal !== undefined) {
                // In a full implementation, we'd add the operand to the phi node
                // For now, we'll mark the phi as having one more incoming value
                // This is simplified; real phi construction is more complex
            }
        }
    }

    useVar(name: string, blockId?: BlockId): ValueId {
        const resolvedBlockId = blockId ?? this.requireCurrentBlock().id;
        const defs = this.varDefs.get(name);
        if (!defs) {
            throw new Error(`Variable ${name} not declared`);
        }
        // Find the defining block that dominates this block
        // Simplified: look for definition in current block first, then predecessors
        const existingDef = defs.get(resolvedBlockId);
        if (existingDef !== undefined) {
            return existingDef;
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
        const existing = phis.get(resolvedBlockId);
        if (existing === undefined) {
            phis.set(resolvedBlockId, [phiValueId]);
        } else {
            existing.push(phiValueId);
        }
        return phiValueId;
    }

    writeVar(name: string, blockId: BlockId, value: ValueId): void {
        this.defineVar(name, value, blockId);
    }

    readVar(name: string, blockId?: BlockId): ValueId {
        return this.useVar(name, blockId);
    }

    private requireCurrentBlock(): IRBlock {
        if (!this.currentBlock) {
            throw new Error("No current block");
        }
        return this.currentBlock;
    }

    private appendInstruction(inst: IRInst): IRInst {
        addIRInstruction(this.requireCurrentBlock(), inst);
        return inst;
    }

    private setTerminator(term: ReturnType<typeof makeRet>): void {
        setIRTerminator(this.requireCurrentBlock(), term);
    }

    private addCurrentSuccessor(target: BlockId): void {
        addSuccessor(this.requireCurrentBlock(), target);
    }

    // ============================================================================
    // Constant Instructions
    // ============================================================================

    iconst(value: number, width: IntWidth): IRInst {
        return this.appendInstruction(makeIconst(value, width));
    }
    fconst(value: number, width: FloatWidth): IRInst {
        return this.appendInstruction(makeFconst(value, width));
    }

    bconst(value: boolean): IRInst {
        return this.appendInstruction(makeBconst(value));
    }

    null(ty: IRType): IRInst {
        return this.appendInstruction(makeNull(ty));
    }

    // ============================================================================
    // Arithmetic Instructions
    // ============================================================================

    iadd(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIadd(a, b, width));
    }

    isub(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIsub(a, b, width));
    }

    imul(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeImul(a, b, width));
    }

    idiv(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIdiv(a, b, width));
    }

    imod(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeImod(a, b, width));
    }

    fadd(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        return this.appendInstruction(makeFadd(a, b, width));
    }

    fsub(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        return this.appendInstruction(makeFsub(a, b, width));
    }

    fmul(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        return this.appendInstruction(makeFmul(a, b, width));
    }

    fdiv(a: ValueId, b: ValueId, width: FloatWidth): IRInst {
        return this.appendInstruction(makeFdiv(a, b, width));
    }

    ineg(a: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIneg(a, width));
    }

    fneg(a: ValueId, width: FloatWidth): IRInst {
        return this.appendInstruction(makeFneg(a, width));
    }

    // ============================================================================
    // Bitwise Instructions
    // ============================================================================

    iand(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIand(a, b, width));
    }

    ior(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIor(a, b, width));
    }

    ixor(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIxor(a, b, width));
    }

    ishl(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIshl(a, b, width));
    }

    ishr(a: ValueId, b: ValueId, width: IntWidth): IRInst {
        return this.appendInstruction(makeIshr(a, b, width));
    }

    // ============================================================================
    // Comparison Instructions
    // ============================================================================

    icmp(op: IcmpOp, a: ValueId, b: ValueId): IRInst {
        return this.appendInstruction(makeIcmp(op, a, b));
    }

    fcmp(op: FcmpOp, a: ValueId, b: ValueId): IRInst {
        return this.appendInstruction(makeFcmp(op, a, b));
    }

    // ============================================================================
    // Memory Instructions
    // ============================================================================

    alloca(ty: IRType, localId?: LocalId): IRInst {
        return this.appendInstruction(makeAlloca(ty, localId));
    }

    load(ptr: ValueId, ty: IRType): IRInst {
        return this.appendInstruction(makeLoad(ptr, ty));
    }

    store(ptr: ValueId, value: ValueId, ty: IRType): IRInst {
        return this.appendInstruction(makeStore(ptr, value, ty));
    }

    memcpy(dest: ValueId, src: ValueId, size: ValueId): IRInst {
        return this.appendInstruction(makeMemcpy(dest, src, size));
    }

    // ============================================================================
    // Address Instructions
    // ============================================================================

    gep(ptr: ValueId, indices: ValueId[], resultTy: IRType): IRInst {
        return this.appendInstruction(makeGep(ptr, indices, resultTy));
    }

    ptradd(ptr: ValueId, offset: ValueId): IRInst {
        return this.appendInstruction(makePtradd(ptr, offset));
    }

    // ============================================================================
    // Conversion Instructions
    // ============================================================================

    trunc(val: ValueId, _fromType: IRType, toType: IRType): IRInst {
        return this.appendInstruction(makeTrunc(val, toType));
    }

    sext(val: ValueId, _fromType: IRType, toType: IRType): IRInst {
        return this.appendInstruction(makeSext(val, toType));
    }

    zext(val: ValueId, _fromType: IRType, toType: IRType): IRInst {
        return this.appendInstruction(makeZext(val, toType));
    }

    fptoui(val: ValueId, toType: IRType): IRInst {
        return this.appendInstruction(makeFptoui(val, toType));
    }

    fptosi(val: ValueId, toType: IRType): IRInst {
        return this.appendInstruction(makeFptosi(val, toType));
    }

    uitofp(val: ValueId, toType: IRType): IRInst {
        return this.appendInstruction(makeUitofp(val, toType));
    }

    sitofp(val: ValueId, toType: IRType): IRInst {
        return this.appendInstruction(makeSitofp(val, toType));
    }

    bitcast(val: ValueId, toType: IRType): IRInst {
        return this.appendInstruction(makeBitcast(val, toType));
    }

    // ============================================================================
    // Call Instruction
    // ============================================================================

    call(
        fn: ValueId,
        args: ValueId[],
        returnType?: IRType,
    ): IRInst {
        return this.appendInstruction(makeCall(fn, args, returnType));
    }

    callDyn(
        fn: ValueId,
        args: ValueId[],
        returnType?: IRType,
    ): IRInst {
        return this.appendInstruction(makeCallDyn(fn, args, returnType));
    }

    // ============================================================================
    // Struct/Enum Instructions
    // ============================================================================

    structCreate(fields: ValueId[], ty: IRType): IRInst {
        return this.appendInstruction(makeStructCreate(fields, ty));
    }

    structGet(struct: ValueId, fieldIndex: number, fieldTy: IRType): IRInst {
        return this.appendInstruction(makeStructGet(struct, fieldIndex, fieldTy));
    }

    enumCreate(variant: number, data: ValueId | null, ty: IRType): IRInst {
        return this.appendInstruction(makeEnumCreate(variant, data, ty));
    }

    enumGetTag(enum_: ValueId): IRInst {
        return this.appendInstruction(makeEnumGetTag(enum_));
    }

    enumGetData(
        enum_: ValueId,
        variant: number,
        index: number,
        dataTy: IRType,
    ): IRInst {
        return this.appendInstruction(
            makeEnumGetData(enum_, variant, index, dataTy),
        );
    }

    sconst(literalId: number): IRInst {
        return this.appendInstruction(makeSconst(literalId));
    }

    // ============================================================================
    // Terminators
    // ============================================================================

    ret(value?: ValueId): void {
        this.setTerminator(makeRet(value));
    }

    br(target: BlockId, args: ValueId[] = []): void {
        const term = makeBr(target, args);
        this.setTerminator(term);
        this.addCurrentSuccessor(target);
    }

    brIf(
        cond: ValueId,
        thenBlock: BlockId,
        thenArgs: ValueId[] | undefined,
        elseBlock: BlockId,
        elseArgs: ValueId[] | undefined = [],
    ): void {
        const term = makeBrIf(cond, thenBlock, thenArgs, elseBlock, elseArgs);
        this.setTerminator(term);
        this.addCurrentSuccessor(thenBlock);
        this.addCurrentSuccessor(elseBlock);
    }

    switch(
        value: ValueId,
        cases: SwitchCase[],
        defaultBlock: BlockId,
        defaultArgs: ValueId[] = [],
    ): void {
        const term = makeSwitch(value, cases, defaultBlock, defaultArgs);
        this.setTerminator(term);
        for (const switchCase of cases) {
            this.addCurrentSuccessor(switchCase.target);
        }
        this.addCurrentSuccessor(defaultBlock);
    }

    unreachable(): void {
        this.setTerminator(makeUnreachable());
    }

    // ============================================================================
    // Instruction Adding
    // ============================================================================

    add(inst: IRInst): ValueId | null {
        addIRInstruction(this.requireCurrentBlock(), inst);
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
                if (process.env.TEST_VERBOSE === "1") {
                    console.warn(`Block ${block.id} not sealed`);
                }
            }
        }

        return this.currentFunction;
    }
}
