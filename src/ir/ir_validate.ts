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
    IRTypeKind,
    getIRTypeKey,
    type IRType,
    type IRFunction,
    type IRBlock,
    type IRInst,
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
    checkStructBounds(ctx);

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

        for (const block of this.fn.blocks) {
            if (!visited.has(block.id)) dfs(block.id);
        }

        post.reverse();
        return post;
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

export function populateAndCheckDefUse(ctx: ValidationContext): void {
    const rpo = ctx.computeRPO();
    for (const bid of rpo) {
        const block = ctx.getBlock(bid);
        if (!block) continue;

        for (const param of block.params) {
            ctx.define(param.id, param.ty);
        }

        for (let i = 0; i < block.instructions.length; i++) {
            const inst = block.instructions[i];
            for (const oid of getInstOperands(inst)) {
                if (!ctx.isDefined(oid)) {
                    ctx.addError(
                        `Value ${String(oid)} used before definition`,
                        block.name,
                        i,
                    );
                }
            }
            ctx.define(inst.id, inst.irType);
        }
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
        .with(P.instanceOf(LoadInst), (l) =>
            checkOpPtr(ctx, l.ptr, blockName, instIdx),
        )
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
        if (valTy && valTy.kind !== ptrTy.inner.kind) {
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
            if (valTy && !valTy.typeEq(ctx.fn.returnType)) {
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
