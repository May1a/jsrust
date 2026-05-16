import { Result } from "better-result";
import { match, P } from "ts-pattern";
import {
    BrIfTerm,
    BrTerm,
    RetTerm,
    SwitchTerm,
    IaddInst,
    IandInst,
    IcmpInst,
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
    FaddInst,
    FcmpInst,
    FconstInst,
    FdivInst,
    FmulInst,
    FnegInst,
    FsubInst,
    BconstInst,
    SconstInst,
    AllocaInst,
    LoadInst,
    StoreInst,
    MemcpyInst,
    GepInst,
    PtraddInst,
    TruncInst,
    SextInst,
    ZextInst,
    FptouiInst,
    FptosiInst,
    UitofpInst,
    SitofpInst,
    BitcastInst,
    CallInst,
    CallDynInst,
    StructCreateInst,
    StructGetInst,
    EnumCreateInst,
    EnumGetTagInst,
    EnumGetDataInst,
    IntType,
    FloatType,
    BoolType,
    PtrType,
    UnitType,
    StructType,
    EnumType,
    IRTypeKind,
    getIRTypeKey,
    type IRType,
    type IRFunction,
    type IRBlock,
    type IRInst,
    type IRTerm,
    type ValueId,
    type BlockId,
} from "./ir";

// ============================================================================
// IRValidationError
// ============================================================================

export interface IRValidationError {
    message: string;
    functionName: string;
    blockName?: string;
    instructionIndex?: number;
}

// ============================================================================
// Main entry point
// ============================================================================

export function validateFunction(
    fn: IRFunction,
): Result<void, IRValidationError[]> {
    const ctx = new ValidationContext(fn);

    checkEntryBlock(ctx);
    checkTerminatorPresence(ctx);
    checkBranchTargets(ctx);
    populateAndCheckDefUse(ctx);
    checkInstructionOperandTypes(ctx);
    checkBlockParams(ctx);
    checkEnumBounds(ctx);
    checkEnumTypes(ctx);
    checkStructBounds(ctx);
    checkStructTypes(ctx);

    if (ctx.errors.length > 0) {
        return Result.err(ctx.errors);
    }
    return Result.ok();
}

// ============================================================================
// ValidationContext
// ============================================================================

export class ValidationContext {
    readonly fn: IRFunction;
    readonly errors: IRValidationError[] = [];
    private readonly _definedTypes = new Map<ValueId, IRType>();
    private readonly _blockMap = new Map<BlockId, IRBlock>();

    constructor(fn: IRFunction) {
        this.fn = fn;
        for (const block of fn.blocks) {
            this._blockMap.set(block.id, block);
        }
        for (const param of fn.params) {
            this._define(param.id, param.ty);
        }
    }

    addError(
        message: string,
        blockName?: string,
        instructionIndex?: number,
    ): void {
        this.errors.push({
            message,
            functionName: this.fn.name,
            blockName,
            instructionIndex,
        });
    }

    define(id: ValueId, ty: IRType): void {
        this._define(id, ty);
    }

    isDefined(id: ValueId): boolean {
        return this._definedTypes.has(id);
    }

    getType(id: ValueId): IRType | undefined {
        return this._definedTypes.get(id);
    }

    getBlock(id: BlockId): IRBlock | undefined {
        return this._blockMap.get(id);
    }

    successors(block: IRBlock): BlockId[] {
        const term = block.terminator;
        if (!term) return [];
        if (term instanceof BrTerm) return [term.target];
        if (term instanceof BrIfTerm) return [term.thenBranch, term.elseBranch];
        if (term instanceof SwitchTerm) {
            return [term.defaultBranch, ...term.cases.map((c) => c.target)];
        }
        return [];
    }

    computeRPO(): BlockId[] {
        const visited = new Set<BlockId>();
        const post: BlockId[] = [];

        const dfs = (id: BlockId) => {
            if (visited.has(id)) return;
            visited.add(id);
            const block = this.getBlock(id);
            if (block) {
                for (const succ of this.successors(block)) {
                    dfs(succ);
                }
            }
            post.push(id);
        };

        const { entry } = this.fn;
        if (entry) dfs(entry.id);

        post.reverse();
        const rpo = [...post];

        for (const block of this.fn.blocks) {
            if (!visited.has(block.id)) {
                rpo.push(block.id);
            }
        }

        return rpo;
    }

    private _define(id: ValueId, ty: IRType): void {
        this._definedTypes.set(id, ty);
    }
}

// ============================================================================
// Helper: Extract all ValueId operands from an instruction
// ============================================================================

function getInstOperands(inst: IRInst): ValueId[] {
    return match<IRInst, ValueId[]>(inst)
        .with(P.instanceOf(IaddInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IsubInst), (i) => [i.left, i.right])
        .with(P.instanceOf(ImulInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IdivInst), (i) => [i.left, i.right])
        .with(P.instanceOf(ImodInst), (i) => [i.left, i.right])
        .with(P.instanceOf(FaddInst), (i) => [i.left, i.right])
        .with(P.instanceOf(FsubInst), (i) => [i.left, i.right])
        .with(P.instanceOf(FmulInst), (i) => [i.left, i.right])
        .with(P.instanceOf(FdivInst), (i) => [i.left, i.right])
        .with(P.instanceOf(InegInst), (i) => [i.operand])
        .with(P.instanceOf(FnegInst), (i) => [i.operand])
        .with(P.instanceOf(IandInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IorInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IxorInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IshlInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IshrInst), (i) => [i.left, i.right])
        .with(P.instanceOf(IcmpInst), (i) => [i.left, i.right])
        .with(P.instanceOf(FcmpInst), (i) => [i.left, i.right])
        .with(P.instanceOf(LoadInst), (i) => [i.ptr])
        .with(P.instanceOf(StoreInst), (i) => [i.value, i.ptr])
        .with(P.instanceOf(MemcpyInst), (i) => [i.dest, i.src, i.size])
        .with(P.instanceOf(GepInst), (i) => [i.ptr, ...i.indices])
        .with(P.instanceOf(PtraddInst), (i) => [i.ptr, i.offset])
        .with(P.instanceOf(TruncInst), (i) => [i.operand])
        .with(P.instanceOf(SextInst), (i) => [i.operand])
        .with(P.instanceOf(ZextInst), (i) => [i.operand])
        .with(P.instanceOf(FptouiInst), (i) => [i.operand])
        .with(P.instanceOf(FptosiInst), (i) => [i.operand])
        .with(P.instanceOf(UitofpInst), (i) => [i.operand])
        .with(P.instanceOf(SitofpInst), (i) => [i.operand])
        .with(P.instanceOf(BitcastInst), (i) => [i.operand])
        .with(P.instanceOf(CallInst), (i) => i.args)
        .with(P.instanceOf(CallDynInst), (i) => [i.callee, ...i.args])
        .with(P.instanceOf(StructCreateInst), (i) => i.fields)
        .with(P.instanceOf(StructGetInst), (i) => [i.struct])
        .with(P.instanceOf(EnumCreateInst), (i) => {
            const ops: ValueId[] = [];
            if (i.data !== undefined) ops.push(i.data);
            return ops;
        })
        .with(P.instanceOf(EnumGetTagInst), (i) => [i.enum_])
        .with(P.instanceOf(EnumGetDataInst), (i) => [i.enum_])
        .otherwise(() => []);
}

// ============================================================================
// Entry Block Check
// ============================================================================

function checkEntryBlock(ctx: ValidationContext): void {
    if (!ctx.fn.entry) {
        ctx.addError(`Function "${ctx.fn.name}" has no entry block`);
    }
}

// ============================================================================
// 03.1: Terminator Presence
// ============================================================================

function checkTerminatorPresence(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        if (!block.terminator) {
            ctx.addError(
                `Block "${block.name}" has no terminator`,
                block.name,
            );
        }
    }
}

// ============================================================================
// Branch Target Validity
// ============================================================================

function checkBranchTargets(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        const term = block.terminator;
        if (!term) continue;

        if (term instanceof BrTerm) {
            if (!ctx.getBlock(term.target)) {
                ctx.addError(
                    `Branch target block ${String(term.target)} does not exist`,
                    block.name,
                );
            }
        } else if (term instanceof BrIfTerm) {
            if (!ctx.getBlock(term.thenBranch)) {
                ctx.addError(
                    `Conditional then block ${String(term.thenBranch)} does not exist`,
                    block.name,
                );
            }
            if (!ctx.getBlock(term.elseBranch)) {
                ctx.addError(
                    `Conditional else block ${String(term.elseBranch)} does not exist`,
                    block.name,
                );
            }
        } else if (term instanceof SwitchTerm) {
            if (!ctx.getBlock(term.defaultBranch)) {
                ctx.addError(
                    `Switch default block ${String(term.defaultBranch)} does not exist`,
                    block.name,
                );
            }
            for (const sc of term.cases) {
                if (!ctx.getBlock(sc.target)) {
                    ctx.addError(
                        `Switch case target ${String(sc.target)} does not exist`,
                        block.name,
                    );
                }
            }
        }
    }
}

// ============================================================================
// 03.3: Def-Use Consistency (also populates type info)
// ============================================================================

function getTermOperands(term: IRTerm | undefined): ValueId[] {
    if (!term) return [];
    if (term instanceof RetTerm) {
        if (term.value === undefined) return [];
        return [term.value];
    }
    if (term instanceof BrTerm) return [...term.args];
    if (term instanceof BrIfTerm) {
        return [term.condition, ...term.thenArgs, ...term.elseArgs];
    }
    if (term instanceof SwitchTerm) {
        return [
            term.value,
            ...term.defaultArgs,
            ...term.cases.flatMap((c) => c.args),
        ];
    }
    return [];
}

function intersectDoms(
    idom: Map<BlockId, BlockId>,
    rpoIndex: Map<BlockId, number>,
    b1: BlockId,
    b2: BlockId,
): BlockId {
    let f1 = b1;
    let f2 = b2;
    while (f1 !== f2) {
        while ((rpoIndex.get(f1) ?? 0) > (rpoIndex.get(f2) ?? 0)) {
            const next = idom.get(f1);
            if (next === undefined || next === f1) break;
            f1 = next;
        }
        while ((rpoIndex.get(f2) ?? 0) > (rpoIndex.get(f1) ?? 0)) {
            const next = idom.get(f2);
            if (next === undefined || next === f2) break;
            f2 = next;
        }
    }
    return f1;
}

function buildPredMap(
    ctx: ValidationContext,
    rpo: BlockId[],
): Map<BlockId, BlockId[]> {
    const preds = new Map<BlockId, BlockId[]>();
    for (const bid of rpo) {
        preds.set(bid, []);
    }
    for (const bid of rpo) {
        const block = ctx.getBlock(bid);
        if (!block) continue;
        for (const succ of ctx.successors(block)) {
            const succPreds = preds.get(succ);
            if (succPreds) succPreds.push(bid);
        }
    }
    return preds;
}

function computeIdom(
    ctx: ValidationContext,
    rpo: BlockId[],
    rpoIndex: Map<BlockId, number>,
): Map<BlockId, BlockId> {
    if (rpo.length === 0) return new Map();

    const [entry] = rpo;
    const idom = new Map<BlockId, BlockId>();
    idom.set(entry, entry);

    const preds = buildPredMap(ctx, rpo);

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 1; i < rpo.length; i++) {
            const bid = rpo[i];
            const blockPreds = preds.get(bid) ?? [];

            let newIdom: BlockId | undefined;
            for (const p of blockPreds) {
                if (idom.has(p)) {
                    newIdom = p;
                    break;
                }
            }
            if (newIdom === undefined) continue;

            for (const p of blockPreds) {
                if (p === newIdom || !idom.has(p)) continue;
                newIdom = intersectDoms(idom, rpoIndex, p, newIdom);
            }

            if (idom.get(bid) !== newIdom) {
                idom.set(bid, newIdom);
                changed = true;
            }
        }
    }

    return idom;
}

function processBlockDefUse(
    ctx: ValidationContext,
    block: IRBlock,
    parentDefs: Set<ValueId>,
): Set<ValueId> {
    const blockDefs = new Set<ValueId>(parentDefs);

    for (const param of block.params) {
        ctx.define(param.id, param.ty);
        blockDefs.add(param.id);
    }

    for (let i = 0; i < block.instructions.length; i++) {
        const inst = block.instructions[i];
        for (const oid of getInstOperands(inst)) {
            if (!blockDefs.has(oid)) {
                ctx.addError(
                    `Value ${String(oid)} used before definition`,
                    block.name,
                    i,
                );
            }
        }
        ctx.define(inst.id, inst.irType);
        blockDefs.add(inst.id);
    }

    for (const oid of getTermOperands(block.terminator)) {
        if (!blockDefs.has(oid)) {
            ctx.addError(
                `Value ${String(oid)} used before definition`,
                block.name,
            );
        }
    }

    return blockDefs;
}

export function populateAndCheckDefUse(ctx: ValidationContext): void {
    const rpo = ctx.computeRPO();
    const rpoIndex = new Map<BlockId, number>();
    for (let i = 0; i < rpo.length; i++) {
        rpoIndex.set(rpo[i], i);
    }

    const idom = computeIdom(ctx, rpo, rpoIndex);
    const domExitDefs = new Map<BlockId, Set<ValueId>>();

    const fnParamDefs = new Set<ValueId>();
    for (const param of ctx.fn.params) {
        fnParamDefs.add(param.id);
    }

    for (const bid of rpo) {
        const block = ctx.getBlock(bid);
        if (!block) continue;

        const parentId = idom.get(bid);
        let parentDefs: Set<ValueId>;
        if (parentId !== undefined && parentId !== bid) {
            parentDefs = domExitDefs.get(parentId) ?? new Set<ValueId>();
        } else {
            parentDefs = fnParamDefs;
        }

        domExitDefs.set(bid, processBlockDefUse(ctx, block, parentDefs));
    }
}

// ============================================================================
// 03.4: Instruction Operand Type Consistency
// ============================================================================

function checkInstructionOperandTypes(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        for (let i = 0; i < block.instructions.length; i++) {
            checkInstType(ctx, block.instructions[i], block.name, i);
        }
    }
}

function checkInstType(
    ctx: ValidationContext,
    inst: IRInst,
    blockName: string,
    instIdx: number,
): void {
    match(inst)
        .with(
            P.instanceOf(IaddInst),
            P.instanceOf(IsubInst),
            P.instanceOf(ImulInst),
            P.instanceOf(IdivInst),
            P.instanceOf(ImodInst),
            (i) => {
                checkOpInt(ctx, i.left, blockName, instIdx);
                checkOpInt(ctx, i.right, blockName, instIdx);
                checkBinopTypeEq(ctx, i, blockName, instIdx);
            },
        )
        .with(
            P.instanceOf(IandInst),
            P.instanceOf(IorInst),
            P.instanceOf(IxorInst),
            P.instanceOf(IshlInst),
            P.instanceOf(IshrInst),
            (i) => {
                checkOpInt(ctx, i.left, blockName, instIdx);
                checkOpInt(ctx, i.right, blockName, instIdx);
                checkBinopTypeEq(ctx, i, blockName, instIdx);
            },
        )
        .with(
            P.instanceOf(FaddInst),
            P.instanceOf(FsubInst),
            P.instanceOf(FmulInst),
            P.instanceOf(FdivInst),
            P.instanceOf(FcmpInst),
            (f) => {
                checkOpFloat(ctx, f.left, blockName, instIdx);
                checkOpFloat(ctx, f.right, blockName, instIdx);
                checkBinopTypeEq(ctx, f, blockName, instIdx);
            },
        )
        .with(P.instanceOf(InegInst), (i) =>
            checkOpInt(ctx, i.operand, blockName, instIdx),
        )
        .with(P.instanceOf(FnegInst), (f) =>
            checkOpFloat(ctx, f.operand, blockName, instIdx),
        )
        .with(P.instanceOf(IcmpInst), (i) => {
            const l = ctx.getType(i.left);
            const r = ctx.getType(i.right);
            if (l && r && !l.typeEq(r)) {
                ctx.addError(
                    `Icmp operands must have same type, got ${getIRTypeKey(l)} and ${getIRTypeKey(r)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(IconstInst), (i) => {
            if (!(i.irType instanceof IntType)) {
                ctx.addError(
                    `Iconst result must be IntType, got ${getIRTypeKey(i.irType)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(FconstInst), (f) => {
            if (!(f.irType instanceof FloatType)) {
                ctx.addError(
                    `Fconst result must be FloatType, got ${getIRTypeKey(f.irType)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(BconstInst), (b) => {
            if (!(b.irType instanceof BoolType)) {
                ctx.addError(
                    `Bconst result must be BoolType, got ${getIRTypeKey(b.irType)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(SconstInst), (s) => {
            if (!(s.irType instanceof PtrType)) {
                ctx.addError(
                    `Sconst result must be PtrType, got ${getIRTypeKey(s.irType)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(AllocaInst), (a) => {
            if (!(a.irType instanceof PtrType)) {
                ctx.addError(
                    `Alloca result must be PtrType, got ${getIRTypeKey(a.irType)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(LoadInst), (l) => {
            checkOpPtr(ctx, l.ptr, blockName, instIdx);
            const ptrTy = ctx.getType(l.ptr);
            if (ptrTy instanceof PtrType && !l.irType.typeEq(ptrTy.inner)) {
                ctx.addError(
                    `Load result type ${getIRTypeKey(l.irType)} does not match pointer inner type ${getIRTypeKey(ptrTy.inner)}`,
                    blockName,
                    instIdx,
                );
            }
        })
        .with(P.instanceOf(StoreInst), (s) =>
            checkStoreInst(ctx, s, blockName, instIdx),
        )
        .with(P.instanceOf(MemcpyInst), (m) =>
            checkMemcpyInst(ctx, m, blockName, instIdx),
        )
        .with(P.instanceOf(GepInst), (g) =>
            checkGepInst(ctx, g, blockName, instIdx),
        )
        .with(P.instanceOf(PtraddInst), (p) =>
            checkPtraddInst(ctx, p, blockName, instIdx),
        )
        .with(
            P.instanceOf(TruncInst),
            P.instanceOf(SextInst),
            P.instanceOf(ZextInst),
            (c) => checkOpInt(ctx, c.operand, blockName, instIdx),
        )
        .with(
            P.instanceOf(FptouiInst),
            P.instanceOf(FptosiInst),
            (c) => checkOpFloat(ctx, c.operand, blockName, instIdx),
        )
        .with(
            P.instanceOf(UitofpInst),
            P.instanceOf(SitofpInst),
            (c) => checkOpInt(ctx, c.operand, blockName, instIdx),
        )
        .otherwise(() => void 0);
}

function checkOpInt(
    ctx: ValidationContext,
    id: ValueId,
    blockName: string,
    instIdx: number,
): void {
    const ty = ctx.getType(id);
    if (ty && !(ty instanceof IntType)) {
        ctx.addError(
            `Operand must be IntType, got ${getIRTypeKey(ty)}`,
            blockName,
            instIdx,
        );
    }
}

function checkOpFloat(
    ctx: ValidationContext,
    id: ValueId,
    blockName: string,
    instIdx: number,
): void {
    const ty = ctx.getType(id);
    if (ty && !(ty instanceof FloatType)) {
        ctx.addError(
            `Operand must be FloatType, got ${getIRTypeKey(ty)}`,
            blockName,
            instIdx,
        );
    }
}

function checkOpPtr(
    ctx: ValidationContext,
    id: ValueId,
    blockName: string,
    instIdx: number,
): void {
    const ty = ctx.getType(id);
    if (ty && !(ty instanceof PtrType)) {
        ctx.addError(
            `Pointer operand must be PtrType, got ${getIRTypeKey(ty)}`,
            blockName,
            instIdx,
        );
    }
}

function checkBinopTypeEq(
    ctx: ValidationContext,
    inst: { left: ValueId; right: ValueId; irType: IRType },
    blockName: string,
    instIdx: number,
): void {
    const lTy = ctx.getType(inst.left);
    const rTy = ctx.getType(inst.right);
    if (lTy && rTy && !lTy.typeEq(rTy)) {
        ctx.addError(
            `Binary operand types must match, got ${getIRTypeKey(lTy)} and ${getIRTypeKey(rTy)}`,
            blockName,
            instIdx,
        );
    }
    if (lTy && !inst.irType.typeEq(lTy)) {
        ctx.addError(
            `Binary result type ${getIRTypeKey(inst.irType)} does not match operand type ${getIRTypeKey(lTy)}`,
            blockName,
            instIdx,
        );
    }
}

function checkStoreInst(
    ctx: ValidationContext,
    inst: StoreInst,
    blockName: string,
    instIdx: number,
): void {
    const ptrTy = ctx.getType(inst.ptr);
    if (ptrTy && !(ptrTy instanceof PtrType)) {
        ctx.addError(
            `Store pointer must be PtrType, got ${getIRTypeKey(ptrTy)}`,
            blockName,
            instIdx,
        );
        return;
    }
    if (ptrTy instanceof PtrType) {
        const valTy = ctx.getType(inst.value);
        if (valTy && !valTy.typeEq(ptrTy.inner)) {
            ctx.addError(
                `Store value type ${getIRTypeKey(valTy)} does not match pointer inner type ${getIRTypeKey(ptrTy.inner)}`,
                blockName,
                instIdx,
            );
        }
    }
}

function checkMemcpyInst(
    ctx: ValidationContext,
    inst: MemcpyInst,
    blockName: string,
    instIdx: number,
): void {
    checkOpPtr(ctx, inst.dest, blockName, instIdx);
    checkOpPtr(ctx, inst.src, blockName, instIdx);
    const szTy = ctx.getType(inst.size);
    if (szTy && !(szTy instanceof IntType)) {
        ctx.addError(
            `Memcpy size must be IntType, got ${getIRTypeKey(szTy)}`,
            blockName,
            instIdx,
        );
    }
}

function checkGepInst(
    ctx: ValidationContext,
    inst: GepInst,
    blockName: string,
    instIdx: number,
): void {
    checkOpPtr(ctx, inst.ptr, blockName, instIdx);
    for (let ji = 0; ji < inst.indices.length; ji++) {
        const iTy = ctx.getType(inst.indices[ji]);
        if (iTy && !(iTy instanceof IntType)) {
            ctx.addError(
                `GEP index ${String(ji)} must be IntType, got ${getIRTypeKey(iTy)}`,
                blockName,
                instIdx,
            );
        }
    }
}

function checkPtraddInst(
    ctx: ValidationContext,
    inst: PtraddInst,
    blockName: string,
    instIdx: number,
): void {
    checkOpPtr(ctx, inst.ptr, blockName, instIdx);
    const offTy = ctx.getType(inst.offset);
    if (offTy && !(offTy instanceof IntType)) {
        ctx.addError(
            `PtrAdd offset must be IntType, got ${getIRTypeKey(offTy)}`,
            blockName,
            instIdx,
        );
    }
}

// ============================================================================
// 03.2: Block Parameter Consistency
// ============================================================================

function checkBlockParams(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        const term = block.terminator;
        if (!term) continue;

        if (term instanceof BrTerm) {
            checkBranchArgs(ctx, term.target, term.args, block.name);
        } else if (term instanceof BrIfTerm) {
            checkBranchArgs(ctx, term.thenBranch, term.thenArgs, block.name);
            checkBranchArgs(ctx, term.elseBranch, term.elseArgs, block.name);
        } else if (term instanceof SwitchTerm) {
            checkBranchArgs(
                ctx,
                term.defaultBranch,
                term.defaultArgs,
                block.name,
            );
            for (const sc of term.cases) {
                checkBranchArgs(ctx, sc.target, sc.args, block.name);
            }
        }
    }
}

function checkBranchArgs(
    ctx: ValidationContext,
    targetId: BlockId,
    args: ValueId[],
    sourceBlock: string,
): void {
    const target = ctx.getBlock(targetId);
    if (!target) return;

    if (args.length !== target.params.length) {
        ctx.addError(
            `Branch to block "${target.name}" has ${String(args.length)} arguments, expected ${String(target.params.length)}`,
            sourceBlock,
        );
        return;
    }

    for (let i = 0; i < args.length; i++) {
        const argTy = ctx.getType(args[i]);
        const paramTy = target.params[i].ty;
        if (argTy && !argTy.typeEq(paramTy)) {
            ctx.addError(
                `Branch to "${target.name}" arg ${String(i)}: expected ${getIRTypeKey(paramTy)}, got ${getIRTypeKey(argTy)}`,
                sourceBlock,
            );
        }
    }
}

// ============================================================================
// 03.5: Return Type Matching
// ============================================================================

export function checkReturnTypes(ctx: ValidationContext): void {
    const returnsUnit = ctx.fn.returnType.kind === IRTypeKind.Unit;

    for (const block of ctx.fn.blocks) {
        const term = block.terminator;
        if (!(term instanceof RetTerm)) continue;

        if (term.value === undefined) {
            if (!returnsUnit) {
                ctx.addError(
                    `Return in "${block.name}" is missing value; function returns ${getIRTypeKey(ctx.fn.returnType)}`,
                    block.name,
                );
            }
        } else {
            const valTy = ctx.getType(term.value);
            if (
                valTy &&
                !areTypesValidationCompatible(valTy, ctx.fn.returnType)
            ) {
                ctx.addError(
                    `Return type mismatch in "${block.name}": expected ${getIRTypeKey(ctx.fn.returnType)}, got ${getIRTypeKey(valTy)}`,
                    block.name,
                );
            }
        }
    }
}

// ============================================================================
// 03.6: Call Argument Count
// ============================================================================

export function checkCallArgs(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        for (let i = 0; i < block.instructions.length; i++) {
            const inst = block.instructions[i];

            if (inst instanceof CallInst) {
                if (isStaticCallMetadataPlaceholder(inst)) {
                    continue;
                }
                if (inst.args.length !== inst.calleeType.params.length) {
                    ctx.addError(
                        `Call has ${String(inst.args.length)} args, expected ${String(inst.calleeType.params.length)}`,
                        block.name,
                        i,
                    );
                }
            } else if (inst instanceof CallDynInst) {
                if (inst.args.length !== inst.calleeType.params.length) {
                    ctx.addError(
                        `CallDyn has ${String(inst.args.length)} args, expected ${String(inst.calleeType.params.length)}`,
                        block.name,
                        i,
                    );
                }
            }
        }
    }
}

function isStaticCallMetadataPlaceholder(inst: CallInst): boolean {
    return inst.args.length > 0 && inst.calleeType.params.length === 0;
}

// ============================================================================
// 03.7: Enum Operations Bounds Check
// ============================================================================

function checkEnumBounds(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        for (let i = 0; i < block.instructions.length; i++) {
            const inst = block.instructions[i];

            if (inst instanceof EnumCreateInst) {
                const limit = inst.enumType.variants.length;
                if (inst.tag < 0 || inst.tag >= limit) {
                    ctx.addError(
                        `EnumCreate tag ${String(inst.tag)} out of bounds (${String(limit)} variants)`,
                        block.name,
                        i,
                    );
                }
            } else if (inst instanceof EnumGetDataInst) {
                const limit = inst.enumType.variants.length;
                if (inst.variant < 0 || inst.variant >= limit) {
                    ctx.addError(
                        `EnumGetData variant ${String(inst.variant)} out of bounds (${String(limit)} variants)`,
                        block.name,
                        i,
                    );
                }
            }
        }
    }
}

function checkEnumTypes(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        for (let i = 0; i < block.instructions.length; i++) {
            const inst = block.instructions[i];

            if (inst instanceof EnumCreateInst) {
                if (inst.data !== undefined) {
                    const dataTy = ctx.getType(inst.data);
                    if (inst.tag < 0 || inst.tag >= inst.enumType.variants.length) {
                        continue;
                    }
                    const variantPayloads = inst.enumType.variants[inst.tag];
                    if (variantPayloads.length > 0 && dataTy) {
                        const [expectedTy] = variantPayloads;
                        if (!areTypesValidationCompatible(dataTy, expectedTy)) {
                            ctx.addError(
                                `EnumCreate data type mismatch for variant ${String(inst.tag)}: expected ${getIRTypeKey(expectedTy)}, got ${getIRTypeKey(dataTy)}`,
                                block.name,
                                i,
                            );
                        }
                    }
                }
            } else if (inst instanceof EnumGetTagInst) {
                const operandTy = ctx.getType(inst.enum_);
                if (
                    operandTy &&
                    !areTypesValidationCompatible(operandTy, inst.enumType)
                ) {
                    ctx.addError(
                        `EnumGetTag operand type ${getIRTypeKey(operandTy)} does not match enum type ${getIRTypeKey(inst.enumType)}`,
                        block.name,
                        i,
                    );
                }
            } else if (inst instanceof EnumGetDataInst) {
                const operandTy = ctx.getType(inst.enum_);
                if (
                    operandTy &&
                    !areTypesValidationCompatible(operandTy, inst.enumType)
                ) {
                    ctx.addError(
                        `EnumGetData operand type ${getIRTypeKey(operandTy)} does not match enum type ${getIRTypeKey(inst.enumType)}`,
                        block.name,
                        i,
                    );
                }
                if (
                    inst.variant < 0 ||
                    inst.variant >= inst.enumType.variants.length
                ) {
                    continue;
                }
                const variantPayloads = inst.enumType.variants[inst.variant];
                if (inst.index < variantPayloads.length) {
                    const expectedTy = variantPayloads[inst.index];
                    if (!areTypesValidationCompatible(inst.dataType, expectedTy)) {
                        ctx.addError(
                            `EnumGetData dataType ${getIRTypeKey(inst.dataType)} does not match variant ${String(inst.variant)} payload type ${getIRTypeKey(expectedTy)}`,
                            block.name,
                            i,
                        );
                    }
                }
            }
        }
    }
}

// ============================================================================
// 03.8: Struct Operations Check
// ============================================================================

function checkStructBounds(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        for (let i = 0; i < block.instructions.length; i++) {
            const inst = block.instructions[i];

            if (inst instanceof StructCreateInst) {
                const expected = inst.structType.fields.length;
                if (inst.fields.length !== expected) {
                    ctx.addError(
                        `StructCreate has ${String(inst.fields.length)} fields, expected ${String(expected)}`,
                        block.name,
                        i,
                    );
                }
            } else if (inst instanceof StructGetInst) {
                const limit = inst.structType.fields.length;
                if (inst.index < 0 || inst.index >= limit) {
                    ctx.addError(
                        `StructGet index ${String(inst.index)} out of bounds (${String(limit)} fields)`,
                        block.name,
                        i,
                    );
                }
            }
        }
    }
}

function checkStructTypes(ctx: ValidationContext): void {
    for (const block of ctx.fn.blocks) {
        for (let i = 0; i < block.instructions.length; i++) {
            const inst = block.instructions[i];

            if (inst instanceof StructCreateInst) {
                const fieldCount = Math.min(
                    inst.fields.length,
                    inst.structType.fields.length,
                );
                for (let fi = 0; fi < fieldCount; fi++) {
                    const valTy = ctx.getType(inst.fields[fi]);
                    const expectedTy = inst.structType.fields[fi];
                    if (
                        valTy &&
                        !areTypesValidationCompatible(valTy, expectedTy)
                    ) {
                        ctx.addError(
                            `StructCreate field ${String(fi)} type mismatch: expected ${getIRTypeKey(expectedTy)}, got ${getIRTypeKey(valTy)}`,
                            block.name,
                            i,
                        );
                    }
                }
            } else if (inst instanceof StructGetInst) {
                const operandTy = ctx.getType(inst.struct);
                if (
                    operandTy &&
                    !areTypesValidationCompatible(operandTy, inst.structType)
                ) {
                    ctx.addError(
                        `StructGet operand type ${getIRTypeKey(operandTy)} does not match struct type ${getIRTypeKey(inst.structType)}`,
                        block.name,
                        i,
                    );
                }
            }
        }
    }
}

function areTypesValidationCompatible(left: IRType, right: IRType): boolean {
    if (left.typeEq(right)) {
        return true;
    }
    if (left instanceof StructType && right instanceof StructType) {
        return areStructTypesValidationCompatible(left, right);
    }
    if (left instanceof EnumType && right instanceof StructType) {
        return isSkeletalNamedType(right, left.name);
    }
    if (left instanceof StructType && right instanceof EnumType) {
        return isSkeletalNamedType(left, right.name);
    }
    if (left instanceof IntType && right instanceof StructType) {
        return isPrimitiveIntAnnotation(right);
    }
    if (left instanceof StructType && right instanceof IntType) {
        return isPrimitiveIntAnnotation(left);
    }
    if (left instanceof EnumType && right instanceof EnumType) {
        return areEnumTypesValidationCompatible(left, right);
    }
    if (left instanceof PtrType && right instanceof PtrType) {
        if (left.inner instanceof UnitType || right.inner instanceof UnitType) {
            return true;
        }
        return areTypesValidationCompatible(left.inner, right.inner);
    }
    return false;
}

function isSkeletalNamedType(type: StructType, expectedName: string): boolean {
    return type.name === expectedName && type.fields.length === 0;
}

function isPrimitiveIntAnnotation(type: StructType): boolean {
    return (
        type.fields.length === 0 &&
        [
            "i8",
            "i16",
            "i32",
            "i64",
            "isize",
            "u8",
            "u16",
            "u32",
            "u64",
            "usize",
        ].includes(type.name)
    );
}

function areStructTypesValidationCompatible(
    left: StructType,
    right: StructType,
): boolean {
    if (left.name === right.name) {
        return haveMatchingKnownFields(left.fields, right.fields);
    }
    if (left.name === "Self" || right.name === "Self") {
        return haveMatchingKnownFields(left.fields, right.fields);
    }
    return false;
}

function areEnumTypesValidationCompatible(
    left: EnumType,
    right: EnumType,
): boolean {
    if (left.name === "__anon_enum" || right.name === "__anon_enum") {
        return true;
    }
    if (left.name !== right.name) {
        return false;
    }
    return haveMatchingKnownVariants(left.variants, right.variants);
}

function haveMatchingKnownFields(
    leftFields: IRType[],
    rightFields: IRType[],
): boolean {
    if (leftFields.length === 0 || rightFields.length === 0) {
        return true;
    }
    if (leftFields.length !== rightFields.length) {
        return false;
    }
    for (let i = 0; i < leftFields.length; i++) {
        if (!areTypesValidationCompatible(leftFields[i], rightFields[i])) {
            return false;
        }
    }
    return true;
}

function haveMatchingKnownVariants(
    leftVariants: IRType[][],
    rightVariants: IRType[][],
): boolean {
    if (leftVariants.length === 0 || rightVariants.length === 0) {
        return true;
    }
    if (leftVariants.length !== rightVariants.length) {
        return false;
    }
    for (let i = 0; i < leftVariants.length; i++) {
        if (!haveMatchingKnownFields(leftVariants[i], rightVariants[i])) {
            return false;
        }
    }
    return true;
}
