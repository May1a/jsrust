import { Result } from "better-result";
import {
    type BlockExpr,
    type BreakExpr,
    type ContinueExpr,
    type Expression,
    IdentPattern,
    IdentifierExpr,
    LiteralKind,
    LiteralPattern,
    type MatchArmNode,
    type MatchExpr,
    type ReturnExpr,
    StructPattern,
    type IfExpr,
    type LoopExpr,
    type WhileExpr,
    type TypeNode,
} from "../../parse/ast";
import { match } from "ts-pattern";
import type { IRBuilder } from "../../ir/ir_builder";
import {
    EnumType,
    type BlockId,
    type IRModule,
    type IRType,
    type ValueId,
    type IRTypeKind,
    makeIREnumType,
    makeIRUnitType,
} from "../../ir/ir";
import {
    LoweringErrorKind,
    type LocalBinding,
    type LoopFrame,
    type LoweredValue,
    type LoweringError,
    type FormatTag,
    loweringError,
} from "./types";

const STRING_FIRST_CHAR_INDEX = 0;
const DEFAULT_CHAR_CODE = 0;

export interface LoweringCfgCtx {
    loopStack: LoopFrame[];
    locals: Map<string, LocalBinding>;
    enumVariantTags: Map<string, number>;
    enumVariantOwners: Map<string, string>;
    structFieldNames: Map<string, string[]>;
    irModule: IRModule;
    currentReturnType: IRType;
    lowerExpression: (expr: Expression) => Result<LoweredValue, LoweringError>;
    lowerExpressionWithExpected: (
        expr: Expression,
        expectedTy: IRType,
    ) => Result<LoweredValue, LoweringError>;
    lowerBlock: (
        block: BlockExpr,
    ) => Result<LoweredValue | undefined, LoweringError>;
    loweredUnit: () => LoweredValue;
    loweredValue: (id: ValueId, ty: IRType) => LoweredValue;
    unitValue: () => ValueId;
    bindLocalValue: (
        name: string,
        value: ValueId,
        ty: IRType,
        options?: { formatTag?: FormatTag; typeNode?: TypeNode },
    ) => void;
    cloneLocals: () => Map<string, LocalBinding>;
    restoreLocals: (snapshot: Map<string, LocalBinding>) => void;
    lookupValueType: (valueId: ValueId) => IRType | undefined;
    registerEnumTypeMetadata: (ty: IRType) => void;
}

export type LowerControlFlow = (
    expr: Expression,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
) => Result<LoweredValue, LoweringError>;

// ---------------------------------------------------------------------------
// Builder-utility free functions (no context needed)
// ---------------------------------------------------------------------------

export function isBlockTerminated(builder: IRBuilder): boolean {
    const block = builder.currentBlock;
    if (!block) {
        return true;
    }
    return block.terminator !== undefined;
}

export function currentBlockValue(
    value: ValueId | undefined,
    builder: IRBuilder,
): ValueId | undefined {
    if (value === undefined || isBlockTerminated(builder)) {
        return undefined;
    }
    return value;
}

export function currentBlockId(builder: IRBuilder): BlockId | undefined {
    return builder.currentBlock?.id;
}

export function lookupValueType(
    valueId: ValueId,
    builder: IRBuilder,
): IRType | undefined {
    const fn = builder.currentFunction;
    if (!fn) {
        return undefined;
    }
    for (const param of fn.params) {
        if (param.id === valueId) {
            return param.ty;
        }
    }
    for (const block of fn.blocks) {
        for (const param of block.params) {
            if (param.id === valueId) {
                return param.ty;
            }
        }
        for (const inst of block.instructions) {
            if (inst.id === valueId) {
                return inst.irType;
            }
        }
    }
    return undefined;
}

export function sealAllBlocks(builder: IRBuilder): void {
    const { currentFunction } = builder;
    if (!currentFunction) {
        return;
    }
    for (const block of currentFunction.blocks) {
        builder.sealBlock(block.id);
    }
}

export function createMergeBlock(
    name: string,
    resultType: IRType | undefined,
    builder: IRBuilder,
): BlockId {
    if (!resultType) {
        return builder.createBlock(name);
    }
    return builder.createBlock(name, [resultType]);
}

export function mergeBlockArgs(
    value: ValueId | undefined,
    resultType: IRType | undefined,
): ValueId[] {
    if (value === undefined || !resultType) {
        return [];
    }
    return [value];
}

export function mergeBlockResultValue(
    mergeId: BlockId,
    builder: IRBuilder,
): ValueId | undefined {
    const currentFn = builder.currentFunction;
    if (!currentFn) {
        return undefined;
    }

    const mergeBlock = currentFn.blocks.find(
        (block) => block.id === mergeId,
    );
    if (!mergeBlock) {
        return undefined;
    }

    const [param] = mergeBlock.params;
    return param.id;
}

export function resolveMergeResultType(
    values: (ValueId | undefined)[],
    lookup: (valueId: ValueId) => IRType | undefined,
): IRType | undefined {
    const firstValue = values.find(
        (value): value is ValueId => value !== undefined,
    );

    if (firstValue === undefined) {
        return undefined;
    }

    return lookup(firstValue);
}

export function connectMergePredecessors(
    exitBlockIds: (BlockId | undefined)[],
    values: (ValueId | undefined)[],
    mergeId: BlockId,
    resultType: IRType | undefined,
    builder: IRBuilder,
): void {
    for (let index = 0; index < exitBlockIds.length; index++) {
        const exitBlockId = exitBlockIds[index];
        if (exitBlockId === undefined) {
            continue;
        }
        builder.switchToBlock(exitBlockId);
        if (!isBlockTerminated(builder)) {
            const value = values[index];
            builder.br(
                mergeId,
                mergeBlockArgs(value, resultType),
            );
        }
    }
}

export function currentTypeKind(ctx: LoweringCfgCtx): IRTypeKind {
    return ctx.currentReturnType.kind;
}

// ---------------------------------------------------------------------------
// Expression-dispatch CFG free functions
// ---------------------------------------------------------------------------

export function lowerReturnExpr(
    expr: ReturnExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    if (expr.value === undefined) {
        builder.ret();
        return Result.ok(ctx.loweredUnit());
    }

    const valueResult = ctx.lowerExpressionWithExpected(
        expr.value,
        ctx.currentReturnType,
    );
    if (!valueResult.isOk()) {
        return valueResult;
    }

    builder.ret(valueResult.value.id);
    return Result.ok(valueResult.value);
}

export function lowerBreakExpr(
    expr: BreakExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    const frame = ctx.loopStack.at(-1);
    if (!frame) {
        return loweringError(
            LoweringErrorKind.BreakOutsideLoop,
            "break used outside of a loop",
            expr.span,
        );
    }
    builder.br(frame.breakBlock);
    return Result.ok(ctx.loweredUnit());
}

export function lowerContinueExpr(
    expr: ContinueExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    const frame = ctx.loopStack.at(-1);
    if (!frame) {
        return loweringError(
            LoweringErrorKind.ContinueOutsideLoop,
            "continue used outside of a loop",
            expr.span,
        );
    }
    builder.br(frame.continueBlock);
    return Result.ok(ctx.loweredUnit());
}

// ---------------------------------------------------------------------------
// if lowering
// ---------------------------------------------------------------------------

export function lowerIf(
    expr: IfExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    const condResult = ctx.lowerExpression(expr.condition);
    if (!condResult.isOk()) return condResult;

    const thenId = builder.createBlock("if_then");
    const elseId = builder.createBlock("if_else");

    builder.brIf(condResult.value.id, thenId, [], elseId, []);

    builder.switchToBlock(thenId);
    const thenResult = ctx.lowerBlock(expr.thenBranch);
    if (!thenResult.isOk()) {
        return thenResult;
    }
    const thenValue = currentBlockValue(thenResult.value?.id, builder);
    const thenExitId = currentBlockId(builder);

    builder.switchToBlock(elseId);
    let elseValue: ValueId | undefined;
    let elseExitId: BlockId | undefined = elseId;
    if (expr.elseBranch) {
        const elseResult = ctx.lowerExpression(expr.elseBranch);
        if (!elseResult.isOk()) return elseResult;
        elseValue = currentBlockValue(elseResult.value.id, builder);
        elseExitId = currentBlockId(builder);
    }

    return terminateIfBranches(
        thenExitId,
        thenValue,
        elseExitId,
        elseValue,
        builder,
        ctx,
    );
}

export function terminateIfBranches(
    thenId: BlockId | undefined,
    thenValue: ValueId | undefined,
    elseId: BlockId | undefined,
    elseValue: ValueId | undefined,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    let hasValuelessReachableBranch = false;
    const reachableValues: ValueId[] = [];

    if (thenId !== undefined) {
        builder.switchToBlock(thenId);
        if (!isBlockTerminated(builder)) {
            if (thenValue === undefined) {
                hasValuelessReachableBranch = true;
            } else {
                reachableValues.push(thenValue);
            }
        }
    }

    if (elseId !== undefined) {
        builder.switchToBlock(elseId);
        if (!isBlockTerminated(builder)) {
            if (elseValue === undefined) {
                hasValuelessReachableBranch = true;
            } else {
                reachableValues.push(elseValue);
            }
        }
    }

    let resultType: IRType | undefined;
    if (!hasValuelessReachableBranch && reachableValues.length > 0) {
        resultType = lookupValueType(reachableValues[0], builder);
    }

    const mergeId = createMergeBlock("if_merge", resultType, builder);

    if (thenId !== undefined) {
        builder.switchToBlock(thenId);
        if (!isBlockTerminated(builder)) {
            builder.br(
                mergeId,
                mergeBlockArgs(thenValue, resultType),
            );
        }
    }

    if (elseId !== undefined) {
        builder.switchToBlock(elseId);
        if (!isBlockTerminated(builder)) {
            builder.br(
                mergeId,
                mergeBlockArgs(elseValue, resultType),
            );
        }
    }

    builder.switchToBlock(mergeId);

    return Result.ok(
        ctx.loweredValue(
            mergeBlockResultValue(mergeId, builder) ?? ctx.unitValue(),
            resultType ?? makeIRUnitType(),
        ),
    );
}

// ---------------------------------------------------------------------------
// loop / while lowering
// ---------------------------------------------------------------------------

export function lowerLoop(
    expr: LoopExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    const header = builder.createBlock("loop_header");
    const body = builder.createBlock("loop_body");
    const exit = builder.createBlock("loop_exit");

    builder.br(header);

    builder.switchToBlock(header);
    builder.br(body);

    builder.switchToBlock(body);
    ctx.loopStack.push({ breakBlock: exit, continueBlock: header });
    const bodyResult = ctx.lowerBlock(expr.body);
    if (!bodyResult.isOk()) {
        return bodyResult;
    }
    ctx.loopStack.pop();
    if (!isBlockTerminated(builder)) {
        builder.br(header);
    }

    builder.switchToBlock(exit);
    return Result.ok(ctx.loweredUnit());
}

export function lowerWhile(
    expr: WhileExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    const header = builder.createBlock("while_header");
    const body = builder.createBlock("while_body");
    const exit = builder.createBlock("while_exit");

    builder.br(header);

    builder.switchToBlock(header);
    const condResult = ctx.lowerExpression(expr.condition);
    if (!condResult.isOk()) {
        return condResult;
    }
    builder.brIf(condResult.value.id, body, [], exit, []);

    builder.switchToBlock(body);
    ctx.loopStack.push({ breakBlock: exit, continueBlock: header });
    const bodyResult = ctx.lowerBlock(expr.body);
    if (!bodyResult.isOk()) {
        return bodyResult;
    }
    ctx.loopStack.pop();
    if (!isBlockTerminated(builder)) {
        builder.br(header);
    }

    builder.switchToBlock(exit);
    return Result.ok(ctx.loweredUnit());
}

// ---------------------------------------------------------------------------
// match lowering
// ---------------------------------------------------------------------------

export function lowerMatchExpr(
    expr: MatchExpr,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<LoweredValue, LoweringError> {
    const scrutinee = ctx.lowerExpression(expr.matchOn);
    if (!scrutinee.isOk()) {
        return scrutinee;
    }

    const armBlocks: BlockId[] = expr.arms.map((_, index) =>
        builder.createBlock(`match_arm_${index}`),
    );
    const { cases, defaultArmIndex, usesEnumPatterns } =
        buildMatchCases(expr.arms, armBlocks, ctx);

    const switchValue = match(usesEnumPatterns)
        .with(true, () => builder.enumGetTag(scrutinee.value.id).id)
        .otherwise(() => scrutinee.value.id);

    let defaultBlock: BlockId | undefined;
    let trapBlock: BlockId | undefined;
    if (defaultArmIndex === undefined) {
        trapBlock = builder.createBlock("match_trap");
        defaultBlock = trapBlock;
    } else {
        defaultBlock = armBlocks[defaultArmIndex];
    }

    builder.switch(switchValue, cases, defaultBlock, []);

    const matchResult = lowerMatchArms(
        expr.arms,
        armBlocks,
        builder,
        ctx,
        scrutinee.value.id,
    );
    if (!matchResult.isOk()) {
        return matchResult;
    }

    if (trapBlock !== undefined) {
        const resumeBlock = currentBlockId(builder);
        builder.switchToBlock(trapBlock);
        builder.unreachable();
        if (resumeBlock !== undefined) {
            builder.switchToBlock(resumeBlock);
        }
    }

    return matchResult;
}

export function buildMatchCases(
    arms: MatchArmNode[],
    armBlocks: BlockId[],
    ctx: LoweringCfgCtx,
): {
    cases: { value: number; target: BlockId; args: ValueId[] }[];
    defaultArmIndex: number | undefined;
    usesEnumPatterns: boolean;
} {
    const cases: { value: number; target: BlockId; args: ValueId[] }[] = [];
    let defaultArmIndex: number | undefined;
    let usesEnumPatterns = false;

    for (let index = 0; index < arms.length; index++) {
        const arm = arms[index];
        if (arm.pattern instanceof LiteralPattern) {
            cases.push({
                value: resolveLiteralPatternValue(arm.pattern),
                target: armBlocks[index],
                args: [],
            });
        } else if (arm.pattern instanceof IdentPattern) {
            const tag = ctx.enumVariantTags.get(arm.pattern.name);
            if (tag === undefined) {
                defaultArmIndex = index;
            } else {
                cases.push({
                    value: tag,
                    target: armBlocks[index],
                    args: [],
                });
                usesEnumPatterns = true;
            }
        } else if (arm.pattern instanceof StructPattern) {
            const tag = resolveStructPatternTag(arm.pattern, ctx);
            if (tag === undefined) {
                defaultArmIndex = index;
            } else {
                cases.push({
                    value: tag,
                    target: armBlocks[index],
                    args: [],
                });
                usesEnumPatterns = true;
            }
        } else {
            defaultArmIndex = index;
        }
    }

    return { cases, defaultArmIndex, usesEnumPatterns };
}

export function resolveLiteralPatternValue(pattern: LiteralPattern): number {
    const raw = pattern.value;
    if (typeof raw === "number") {
        return raw;
    }
    if (
        pattern.literalKind === LiteralKind.Char &&
        typeof raw === "string"
    ) {
        return (
            raw.codePointAt(STRING_FIRST_CHAR_INDEX) ?? DEFAULT_CHAR_CODE
        );
    }
    return Number(raw);
}

export function resolveStructPatternTag(
    pat: StructPattern,
    ctx: LoweringCfgCtx,
): number | undefined {
    if (!(pat.path instanceof IdentifierExpr)) {
        return undefined;
    }
    return ctx.enumVariantTags.get(pat.path.name);
}

export function lowerMatchArms(
    arms: MatchArmNode[],
    armBlocks: BlockId[],
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
    scrutinee?: ValueId,
): Result<LoweredValue, LoweringError> {
    const armResult = lowerMatchArmBodies(
        arms,
        armBlocks,
        builder,
        ctx,
        scrutinee,
    );
    if (!armResult.isOk()) {
        return armResult;
    }
    const { armExitBlocks, armValues } = armResult.value;
    const resultType = resolveMergeResultType(armValues, (valueId) =>
        lookupValueType(valueId, builder),
    );

    const mergeId = createMergeBlock("match_merge", resultType, builder);

    connectMergePredecessors(
        armExitBlocks,
        armValues,
        mergeId,
        resultType,
        builder,
    );

    builder.switchToBlock(mergeId);
    return Result.ok(
        ctx.loweredValue(
            mergeBlockResultValue(mergeId, builder) ?? ctx.unitValue(),
            resultType ?? makeIRUnitType(),
        ),
    );
}

export function lowerMatchArmBodies(
    arms: MatchArmNode[],
    armBlocks: BlockId[],
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
    scrutinee?: ValueId,
): Result<
    {
        armExitBlocks: (BlockId | undefined)[];
        armValues: (ValueId | undefined)[];
    },
    LoweringError
> {
    const armExitBlocks: (BlockId | undefined)[] = [];
    const armValues: (ValueId | undefined)[] = [];
    const outerLocals = ctx.cloneLocals();

    for (let index = 0; index < arms.length; index++) {
        const arm = arms[index];
        ctx.restoreLocals(outerLocals);
        builder.switchToBlock(armBlocks[index]);
        if (scrutinee !== undefined) {
            const bindResult = bindMatchArmPattern(
                arm,
                scrutinee,
                builder,
                ctx,
            );
            if (!bindResult.isOk()) {
                ctx.restoreLocals(outerLocals);
                return bindResult;
            }
        }
        const body = ctx.lowerExpression(arm.body);
        if (!body.isOk()) {
            ctx.restoreLocals(outerLocals);
            return body;
        }
        armValues.push(currentBlockValue(body.value.id, builder));
        armExitBlocks.push(currentBlockId(builder));
        ctx.restoreLocals(outerLocals);
    }

    ctx.restoreLocals(outerLocals);
    return Result.ok({ armExitBlocks, armValues });
}

export function bindMatchArmPattern(
    arm: MatchArmNode,
    scrutinee: ValueId,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<void, LoweringError> {
    if (arm.pattern instanceof StructPattern) {
        return bindStructPatternPayload(
            arm.pattern,
            scrutinee,
            builder,
            ctx,
        );
    }

    if (!(arm.pattern instanceof IdentPattern)) {
        return Result.ok(undefined);
    }

    if (ctx.enumVariantTags.get(arm.pattern.name) !== undefined) {
        return Result.ok(undefined);
    }

    const scrutineeTy =
        lookupValueType(scrutinee, builder) ?? makeIRUnitType();
    ctx.bindLocalValue(arm.pattern.name, scrutinee, scrutineeTy, {
        typeNode: arm.pattern.type,
    });
    return Result.ok(undefined);
}

export function bindStructPatternPayload(
    pat: StructPattern,
    scrutinee: ValueId,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
): Result<void, LoweringError> {
    if (!(pat.path instanceof IdentifierExpr)) return Result.ok(undefined);
    const variantName = pat.path.name;
    const tag = ctx.enumVariantTags.get(variantName);
    if (tag === undefined) return Result.ok(undefined);

    const scrutineeTy = lookupValueType(scrutinee, builder);

    for (const field of pat.fields) {
        if (!(field.pattern instanceof IdentPattern)) continue;
        const fieldIndex = Number(field.name);
        if (Number.isNaN(fieldIndex)) continue;

        let dataTy: IRType = makeIRUnitType();
        if (scrutineeTy instanceof EnumType) {
            dataTy =
                scrutineeTy.variants[tag]?.[fieldIndex] ?? makeIRUnitType();
        }

        let enumTy = makeIREnumType("__anon_enum", []);
        if (scrutineeTy instanceof EnumType) {
            enumTy = scrutineeTy;
        }
        const dataVal = builder.enumGetData(
            scrutinee,
            tag,
            fieldIndex,
            enumTy,
            dataTy,
        );
        ctx.bindLocalValue(field.pattern.name, dataVal.id, dataTy, {
            typeNode: field.pattern.type,
        });
    }
    return Result.ok(undefined);
}
