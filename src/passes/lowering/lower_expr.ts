import {
    type AssignExpr,
    BinaryExpr,
    BinaryOp,
    type BlockExpr,
    type BreakExpr,
    type CallExpr,
    type CastExpr,
    ConstItem,
    type ClosureExpr,
    type ContinueExpr,
    DerefExpr,
    ExprStmt,
    type Expression,
    FieldExpr,
    type FnItem,
    type ForExpr,
    FnTypeNode,
    type GenericFnItem,
    IdentPattern,
    IdentifierExpr,
    type IfLetExpr,
    type LiteralPattern,
    InferredTypeNode,
    IndexExpr,
    type IfExpr,
    ItemStmt,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    type LoopExpr,
    type MacroExpr,
    type MatchArmNode,
    type MatchExpr,
    NamedTypeNode,
    type RecoveryExpr,
    type RecoveryItem,
    type PathExpr,
    PtrTypeNode,
    type RangeExpr,
    type RefExpr,
    RefTypeNode,
    type ReturnExpr,
    Span,
    type StaticItem,
    type Statement,
    type StructExpr,
    type StructPattern,
    type TryExpr,
    type TypeNode,
    type TypeAliasItem,
    type TupleTypeNode,
    type ArrayTypeNode,
    type UnsafeBlockExpr,
    type UnsafeItem,
    UnaryExpr,
    UnaryOp,
    type WhileExpr,
    type AstVisitor,
    Mutability,
} from "../../parse/ast";
import {
    type MonomorphizationRegistry,
    inferTypeArgs,
    mangledName,
    type SubstitutionMap,
} from "../monomorphize";
import { hashName as hashNameInternal } from "../module_metadata";
import { Result } from "better-result";
import { BUILTIN_SYMBOLS } from "../../utils/builtin_symbols";
import { match, P } from "ts-pattern";

// Type alias for expression visitor to reduce complexity
type ExpressionVisitor<T> = Pick<
    AstVisitor<T, AstToSsaCtx>,
    | "visitLiteralExpr"
    | "visitIdentifierExpr"
    | "visitPathExpr"
    | "visitBinaryExpr"
    | "visitUnaryExpr"
    | "visitAssignExpr"
    | "visitCallExpr"
    | "visitFieldExpr"
    | "visitIndexExpr"
    | "visitIfExpr"
    | "visitBlockExpr"
    | "visitReturnExpr"
    | "visitBreakExpr"
    | "visitContinueExpr"
    | "visitLoopExpr"
    | "visitWhileExpr"
    | "visitForExpr"
    | "visitStructExpr"
    | "visitRangeExpr"
    | "visitRefExpr"
    | "visitDerefExpr"
    | "visitMacroExpr"
    | "visitClosureExpr"
    | "visitMatchExpr"
    | "visitOptionTypeNode"
    | "visitResultTypeNode"
>;
import {
    EnumType,
    FcmpOp,
    FloatWidth,
    IcmpOp,
    IntWidth,
    internIRStringLiteral,
    IRTypeKind,
    makeIREnumType,
    makeIRIntType,
    makeIRModule,
    makeIRStructType,
    makeIRUnitType,
    isIRUnitType,
    ArrayType,
    makeIRArrayType,
    type BlockId,
    FloatType,
    getIREnumTypeKey,
    type IRFunction,
    type IRInst,
    type IRModule,
    type IRType,
    IntType,
    PtrType,
    StructType,
    type ValueId,
} from "../../ir/ir";
import { IRBuilder } from "../../ir/ir_builder";
import { FormatTag, LoweringErrorKind, loweringError, type LocalBinding, type LoopFrame, type LoweredValue, type LoweringConstBinding, type LoweringError, type FormatTemplate } from "./types";
import {
    builtinToIrType,
    irTypeName,
    namedBuiltin,
    translateArrayTypeNode,
    translateTupleTypeNode,
    translateTypeNode,
    tupleStructName,
} from "./type_translation";
import {
    bindMatchArmPattern,
    bindStructPatternPayload,
    buildMatchCases,
    connectMergePredecessors,
    createMergeBlock,
    currentBlockId,
    currentBlockValue,
    currentTypeKind,
    isBlockTerminated,
    lookupValueType,
    lowerBreakExpr,
    lowerContinueExpr,
    lowerIf,
    lowerLoop,
    lowerMatchArmBodies,
    lowerMatchArms,
    lowerMatchExpr,
    lowerReturnExpr,
    lowerWhile,
    mergeBlockArgs,
    mergeBlockResultValue,
    resolveLiteralPatternValue,
    resolveMergeResultType,
    resolveStructPatternTag,
    sealAllBlocks,
    terminateIfBranches,
    type LoweringCfgCtx,
} from "./lower_control_flow";
import {
    lowerClosureExpr,
    lowerClosureFunction,
    type LoweringClosureCtx,
} from "./lower_closure";

const DEFAULT_INT_VALUE = 0;
const DEFAULT_FLOAT_VALUE = 0;
const DEFAULT_UNIT_VALUE = 0;
const STRING_FIRST_CHAR_INDEX = 0;
const DEFAULT_CHAR_CODE = 0;
const EMPTY_FORMAT = "";

const LAST_FRAME_INDEX = -1;

function zeroSpan(): Span {
    return new Span(0, 0, 0, 0);
}

function intSuffixToWidth(suffix: string | undefined): IntWidth {
    switch (suffix) {
        case "i8": {
            return IntWidth.I8;
        }
        case "i16": {
            return IntWidth.I16;
        }
        case "i32": {
            return IntWidth.I32;
        }
        case "i64": {
            return IntWidth.I64;
        }
        case "i128": {
            return IntWidth.I128;
        }
        case "isize": {
            return IntWidth.Isize;
        }
        case "u8": {
            return IntWidth.U8;
        }
        case "u16": {
            return IntWidth.U16;
        }
        case "u32": {
            return IntWidth.U32;
        }
        case "u64": {
            return IntWidth.U64;
        }
        case "u128": {
            return IntWidth.U128;
        }
        case "usize": {
            return IntWidth.Usize;
        }
        default: {
            return IntWidth.I32;
        }
    }
}

function floatSuffixToWidth(suffix: string | undefined): FloatWidth {
    if (suffix === "f32") {
        return FloatWidth.F32;
    }
    return FloatWidth.F64;
}

export interface LoweringExprCtx {
    locals: Map<string, LocalBinding>;
    constScopes: Map<string, LoweringConstBinding>[];
    constResolutionStack: LoweringConstBinding[];
    functionIds: Map<string, number>;
    functionReturnTypes: Map<string, IRType>;
    structFieldNames: Map<string, string[]>;
    enumVariantTags: Map<string, number>;
    enumVariantOwners: Map<string, string>;
    namedConsts: Map<string, LoweringConstBinding>;
    irModule: IRModule;
    currentReturnType: IRType;
    expectedValueTypes: IRType[];
    lowerExpression: (expr: Expression) => Result<LoweredValue, LoweringError>;
    lowerExpressionWithExpected: (
        expr: Expression,
        expectedTy: IRType,
    ) => Result<LoweredValue, LoweringError>;
    lowerBlock: (
        block: BlockExpr,
    ) => Result<LoweredValue | undefined, LoweringError>;
    lowerStatement: (stmt: Statement) => Result<void, LoweringError>;
}

export type LowerExpression = (
    expr: Expression,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
) => Result<LoweredValue, LoweringError>;

export type LowerBlock = (
    block: BlockExpr,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
) => Result<LoweredValue | undefined, LoweringError>;

export type LowerStatement = (
    stmt: Statement,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
) => Result<void, LoweringError>;

export class AstToSsaCtx implements LoweringExprCtx {
    readonly builder: IRBuilder;
    readonly irModule: IRModule;
    readonly locals: Map<string, LocalBinding>;
    readonly functionIds: Map<string, number>;
    readonly functionReturnTypes: Map<string, IRType>;
    readonly structFieldNames: Map<string, string[]>;
    readonly enumVariantTags: Map<string, number>;
    readonly enumVariantOwners: Map<string, string>;
    readonly namedConsts: Map<string, LoweringConstBinding>;
    private readonly initialConsts: Map<string, LoweringConstBinding>;
    private readonly monoRegistry?: MonomorphizationRegistry;
    constScopes: Map<string, LoweringConstBinding>[];
    constResolutionStack: LoweringConstBinding[];
    private loopStack: LoopFrame[];
    currentReturnType: IRType;
    readonly expectedValueTypes: IRType[];

    private static loweredInst(inst: IRInst): Result<LoweredValue, LoweringError> {
        return Result.ok({ id: inst.id, ty: inst.irType });
    }

    private loweredUnit(): LoweredValue {
        return { id: this.unitValue(), ty: makeIRUnitType() };
    }

    private loweredValue(id: ValueId, ty: IRType): LoweredValue {
        return { id, ty };
    }

    constructor(
        options: {
            irModule?: IRModule;
            functionReturnTypes?: Map<string, IRType>;
            structFieldNames?: Map<string, string[]>;
            enumVariantTags?: Map<string, number>;
            enumVariantOwners?: Map<string, string>;
            namedConsts?: Map<string, LoweringConstBinding>;
            initialConsts?: Map<string, LoweringConstBinding>;
            monoRegistry?: MonomorphizationRegistry;
        } = {},
    ) {
        this.builder = new IRBuilder();
        this.irModule = options.irModule ?? makeIRModule("main");
        this.locals = new Map();
        this.functionIds = new Map();
        this.functionReturnTypes =
            options.functionReturnTypes ?? new Map<string, IRType>();
        this.structFieldNames =
            options.structFieldNames ?? new Map<string, string[]>();
        this.enumVariantTags =
            options.enumVariantTags ?? new Map<string, number>();
        this.enumVariantOwners =
            options.enumVariantOwners ?? new Map<string, string>();
        this.namedConsts =
            options.namedConsts ?? new Map<string, LoweringConstBinding>();
        this.initialConsts =
            options.initialConsts ?? new Map<string, LoweringConstBinding>();
        this.monoRegistry = options.monoRegistry;
        this.constScopes = [];
        this.constResolutionStack = [];
        this.loopStack = [];
        this.currentReturnType = makeIRUnitType();
        this.expectedValueTypes = [];
    }

    seedFunctionIds(ids: Map<string, number>): void {
        for (const [name, id] of ids.entries()) {
            this.functionIds.set(name, id);
        }
    }

    lowerFunction(fnDecl: FnItem): Result<IRFunction, LoweringError> {
        this.locals.clear();
        this.constScopes = [new Map(this.initialConsts)];
        this.constResolutionStack = [];
        this.loopStack = [];

        const paramEntries = this.getLowerableParams(fnDecl);
        if (!paramEntries.isOk()) {
            return paramEntries;
        }
        const paramTypes = paramEntries.value.map(({ ty }) =>
            AstToSsaCtx.translateTypeNode(ty),
        );
        this.currentReturnType = AstToSsaCtx.translateTypeNode(
            fnDecl.returnType,
        );
        this.registerEnumTypeMetadata(this.currentReturnType);

        const startResult = this.startFunction(
            fnDecl.name,
            paramTypes,
            fnDecl.span,
        );
        if (startResult.isErr()) {
            return startResult;
        }
        this.bindFunctionParams(paramEntries.value);

        if (!fnDecl.body) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Function has no body",
                fnDecl.span,
            );
        }
        const bodyResult = this.lowerBlock(fnDecl.body);
        if (!bodyResult.isOk()) {
            return bodyResult;
        }

        if (!this.isCurrentBlockTerminated()) {
            if (bodyResult.value !== undefined) {
                this.builder.ret(bodyResult.value.id);
            } else if (this.currentTypeKind() === IRTypeKind.Unit) {
                this.builder.ret();
            } else {
                const defaultValue = this.defaultValueForType(
                    this.currentReturnType,
                );
                this.builder.ret(defaultValue);
            }
        }

        this.sealAllBlocks();
        return Result.ok(this.builder.build());
    }

    private getLowerableParams(
        fnDecl: FnItem,
    ): Result<{ name?: string; ty: TypeNode }[], LoweringError> {
        const params: { name?: string; ty: TypeNode }[] = [];
        for (const param of fnDecl.params) {
            params.push({ name: param.name, ty: param.ty });
        }
        return Result.ok(params);
    }

    private startFunction(
        name: string,
        paramTypes: IRType[],
        span: Span,
    ): Result<void, LoweringError> {
        const fnIdResult = this.requireFunctionId(name, span);
        if (fnIdResult.isErr()) {
            return fnIdResult;
        }
        this.builder.createFunction(
            name,
            paramTypes,
            this.currentReturnType,
            fnIdResult.value,
        );
        const entryId = this.builder.createBlock("entry");
        this.builder.switchToBlock(entryId);
        return Result.ok();
    }

    private bindFunctionParams(
        params: { name?: string; ty: TypeNode }[],
    ): void {
        const { currentFunction } = this.builder;
        if (!currentFunction) {
            return;
        }
        for (let i = 0; i < params.length; i++) {
            const paramEntry = params[i];
            const irType = AstToSsaCtx.translateTypeNode(paramEntry.ty);
            const param = currentFunction.params[i];
            this.bindLocalValue(paramEntry.name ?? "_", param.id, irType, {
                formatTag: AstToSsaCtx.formatTagFromTypeNode(paramEntry.ty),
                typeNode: paramEntry.ty,
            });
        }
    }

    lowerBlock(
        block: BlockExpr,
    ): Result<LoweredValue | undefined, LoweringError> {
        this.constScopes.push(new Map<string, LoweringConstBinding>());
        try {
            for (const stmt of block.stmts) {
                const stmtResult = this.lowerStatement(stmt);
                if (!stmtResult.isOk()) {
                    return stmtResult;
                }
                if (this.isCurrentBlockTerminated()) {
                    return Result.ok(undefined);
                }
            }

            if (!block.expr) {
                return Result.ok(undefined);
            }

            const exprResult = this.lowerExpression(block.expr);
            if (!exprResult.isOk()) {
                return exprResult;
            }
            return Result.ok(exprResult.value);
        } finally {
            this.constScopes.pop();
        }
    }

    private currentBlockValue(value: ValueId | undefined): ValueId | undefined {
        return currentBlockValue(value, this.builder);
    }

    private currentBlockId(): BlockId | undefined {
        return currentBlockId(this.builder);
    }

    private cloneLocals(): Map<string, LocalBinding> {
        return new Map(this.locals);
    }

    private cloneConstScopes(): Map<string, LoweringConstBinding>[] {
        return this.constScopes.map((scope) => new Map(scope));
    }

    private restoreLocals(snapshot: Map<string, LocalBinding>): void {
        this.locals.clear();
        for (const [name, binding] of snapshot) {
            this.locals.set(name, binding);
        }
    }

    private currentConstScope():
        | Map<string, LoweringConstBinding>
        | undefined {
        return this.constScopes[this.constScopes.length - 1];
    }

    private bindConst(name: string, binding: LoweringConstBinding): void {
        const scope = this.currentConstScope();
        if (!scope) {
            return;
        }
        scope.set(name, binding);
    }

    private lookupConst(name: string): LoweringConstBinding | undefined {
        for (let i = this.constScopes.length - 1; i >= 0; i--) {
            const binding = this.constScopes[i].get(name);
            if (binding) {
                return binding;
            }
        }
        let selfTypeName: string | undefined;
        for (let i = this.constResolutionStack.length - 1; i >= 0; i--) {
            const binding = this.constResolutionStack[i];
            const { selfTypeName: bindingSelfTypeName } = binding;
            if (!bindingSelfTypeName) {
                continue;
            }
            selfTypeName = bindingSelfTypeName;
            break;
        }
        if (name.startsWith("Self::") && selfTypeName) {
            const rebound = this.namedConsts.get(
                `${selfTypeName}${name.slice("Self".length)}`,
            );
            if (rebound) {
                return rebound;
            }
        }
        return this.namedConsts.get(name);
    }

    private bindLocalValue(
        name: string,
        value: ValueId,
        ty: IRType,
        options: {
            formatTag?: FormatTag;
            typeNode?: TypeNode;
        } = {},
    ): void {
        this.registerEnumTypeMetadata(ty);
        const allocaId = this.builder.alloca(ty).id;
        this.builder.store(allocaId, value, ty);
        this.locals.set(name, {
            ptr: allocaId,
            ty,
            formatTag: options.formatTag,
            typeNode: options.typeNode,
        });
    }

    private registerEnumTypeMetadata(ty: IRType): void {
        if (!(ty instanceof EnumType)) {
            return;
        }
        this.irModule.enums.set(getIREnumTypeKey(ty), ty);
    }

    private mergeBlockArgs(
        value: ValueId | undefined,
        resultType: IRType | undefined,
    ): ValueId[] {
        return mergeBlockArgs(value, resultType);
    }

    private createMergeBlock(
        name: string,
        resultType: IRType | undefined,
    ): BlockId {
        return createMergeBlock(name, resultType, this.builder);
    }

    lowerStatement(stmt: Statement): Result<void, LoweringError> {
        if (stmt instanceof LetStmt) {
            return this.lowerLetStatement(stmt);
        }
        if (stmt instanceof ExprStmt) {
            const exprResult = this.lowerExpression(stmt.expr);
            if (exprResult.isErr()) {
                return exprResult;
            }
            return Result.ok();
        }
        if (stmt instanceof ItemStmt && stmt.item instanceof ConstItem) {
            return this.lowerConstItem(stmt.item);
        }

        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            `Unsupported statement: ${stmt.constructor.name}`,
            stmt.span,
        );
    }

    private lowerConstItem(item: ConstItem): Result<void, LoweringError> {
        if (!item.value) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "const item is missing an initializer",
                item.span,
            );
        }
        const binding: LoweringConstBinding = {
            key: item.name,
            typeNode: item.typeNode,
            value: item.value,
            span: item.span,
        };
        this.bindConst(item.name, binding);
        return Result.ok();
    }

    private lowerLetStatement(stmt: LetStmt): Result<void, LoweringError> {
        // Translate and register the annotated type before lowering the init
        // expression so that enum constructors like `None` resolve to the
        // correct concrete enum type (e.g. Option<i32>) rather than the
        // seeded placeholder Option<()>.
        let ty = AstToSsaCtx.translateTypeNode(stmt.type);
        this.registerEnumTypeMetadata(ty);

        const initResult = this.lowerExpressionWithExpected(stmt.init, ty);
        if (!initResult.isOk()) {
            return initResult;
        }

        if (stmt.pattern instanceof IdentPattern) {
            if (this.isImplicitUnitTypeNode(stmt.type)) {
                const inferred = initResult.value.ty;
                ty = inferred;
            }
            this.bindLocalValue(stmt.pattern.name, initResult.value.id, ty, {
                formatTag: this.inferExpressionFormatTag(stmt.init),
            });
        }
        return Result.ok();
    }

    lowerExpression(expr: Expression): Result<LoweredValue, LoweringError> {
        // Use visitor pattern to dispatch to appropriate handler
        const visitor = this.getExpressionVisitor();
        return expr.accept(visitor, this);
    }

    lowerExpressionWithExpected(
        expr: Expression,
        expectedTy: IRType,
    ): Result<LoweredValue, LoweringError> {
        this.expectedValueTypes.push(expectedTy);
        const lowered = this.lowerExpression(expr);
        this.expectedValueTypes.pop();
        return lowered;
    }

    private getExpressionVisitor(): AstVisitor<
        Result<LoweredValue, LoweringError>,
        AstToSsaCtx
    > {
        const unsupported = (name: string): Result<LoweredValue, LoweringError> =>
            loweringError(
                LoweringErrorKind.UnsupportedNode,
                `Unexpected AST node in expression visitor: ${name}`,
                zeroSpan(),
            );
        const expressionVisitors: ExpressionVisitor<
            Result<LoweredValue, LoweringError>
        > = {
            visitLiteralExpr: (expr: LiteralExpr) => this.lowerLiteral(expr),
            visitIdentifierExpr: (expr: IdentifierExpr) =>
                this.lowerIdentifier(expr),
            visitPathExpr: (expr: PathExpr) => this.visitPathExpr(expr),
            visitBinaryExpr: (expr: BinaryExpr) => this.lowerBinary(expr),
            visitUnaryExpr: (expr: UnaryExpr) => this.lowerUnary(expr),
            visitAssignExpr: (expr: AssignExpr) => this.lowerAssign(expr),
            visitCallExpr: (expr: CallExpr) => this.lowerCall(expr),
            visitFieldExpr: (expr: FieldExpr) => this.lowerFieldAccess(expr),
            visitIndexExpr: (expr: IndexExpr) => this.lowerIndexExpr(expr),
            visitIfExpr: (expr: IfExpr) => this.lowerIf(expr),
            visitBlockExpr: (expr: BlockExpr) => {
                const blockResult = this.lowerBlock(expr);
                if (!blockResult.isOk()) {
                    return blockResult;
                }
                if (blockResult.value === undefined) {
                    return Result.ok(this.loweredUnit());
                }
                return Result.ok(blockResult.value);
            },
            visitReturnExpr: (expr: ReturnExpr) => this.lowerReturn(expr),
            visitBreakExpr: (expr: BreakExpr) => this.lowerBreak(expr),
            visitContinueExpr: (expr: ContinueExpr) => this.lowerContinue(expr),
            visitLoopExpr: (expr: LoopExpr) => this.lowerLoop(expr),
            visitWhileExpr: (expr: WhileExpr) => this.lowerWhile(expr),
            visitForExpr: (expr: ForExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "for-loop lowering is not implemented",
                    expr.span,
                ),
            visitStructExpr: (expr: StructExpr) =>
                this.lowerStructLiteral(expr),
            visitRangeExpr: (expr: RangeExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "range expression lowering is not implemented",
                    expr.span,
                ),
            visitRefExpr: (expr: RefExpr) =>
                this.lowerUnary(
                    new UnaryExpr(expr.span, UnaryOp.Ref, expr.target),
                ),
            visitDerefExpr: (expr: DerefExpr) =>
                this.lowerUnary(
                    new UnaryExpr(expr.span, UnaryOp.Deref, expr.target),
                ),
            visitMacroExpr: (expr: MacroExpr) => this.lowerMacro(expr),
            visitClosureExpr: (expr: ClosureExpr) => this.lowerClosure(expr),
            visitMatchExpr: (expr: MatchExpr) => this.lowerMatchExpr(expr),
            visitOptionTypeNode: () => unsupported("OptionTypeNode"),
            visitResultTypeNode: () => unsupported("ResultTypeNode"),
        };
        return {
            visitLiteralExpr: expressionVisitors.visitLiteralExpr,
            visitIdentifierExpr: expressionVisitors.visitIdentifierExpr,
            visitPathExpr: expressionVisitors.visitPathExpr,
            visitBinaryExpr: expressionVisitors.visitBinaryExpr,
            visitUnaryExpr: expressionVisitors.visitUnaryExpr,
            visitAssignExpr: expressionVisitors.visitAssignExpr,
            visitCallExpr: expressionVisitors.visitCallExpr,
            visitFieldExpr: expressionVisitors.visitFieldExpr,
            visitIndexExpr: expressionVisitors.visitIndexExpr,
            visitIfExpr: expressionVisitors.visitIfExpr,
            visitBlockExpr: expressionVisitors.visitBlockExpr,
            visitReturnExpr: expressionVisitors.visitReturnExpr,
            visitBreakExpr: expressionVisitors.visitBreakExpr,
            visitContinueExpr: expressionVisitors.visitContinueExpr,
            visitLoopExpr: expressionVisitors.visitLoopExpr,
            visitWhileExpr: expressionVisitors.visitWhileExpr,
            visitForExpr: expressionVisitors.visitForExpr,
            visitStructExpr: expressionVisitors.visitStructExpr,
            visitRangeExpr: expressionVisitors.visitRangeExpr,
            visitRefExpr: expressionVisitors.visitRefExpr,
            visitDerefExpr: expressionVisitors.visitDerefExpr,
            visitMacroExpr: expressionVisitors.visitMacroExpr,
            visitClosureExpr: expressionVisitors.visitClosureExpr,
            visitMatchExpr: expressionVisitors.visitMatchExpr,
            visitOptionTypeNode: expressionVisitors.visitOptionTypeNode,
            visitResultTypeNode: expressionVisitors.visitResultTypeNode,
            visitTryExpr: (expr: TryExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`?` expressions are not implemented",
                    expr.span,
                ),
            visitCastExpr: (expr: CastExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`as` casts are not implemented",
                    expr.span,
                ),
            visitIfLetExpr: (expr: IfLetExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`if let` is not implemented",
                    expr.span,
                ),
            visitUnsafeBlockExpr: (expr: UnsafeBlockExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`unsafe` blocks are not implemented",
                    expr.span,
                ),
            visitRecoveryExpr: (expr: RecoveryExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    expr.message,
                    expr.span,
                ),
            visitLetStmt: () => unsupported("LetStmt"),
            visitExprStmt: () => unsupported("ExprStmt"),
            visitItemStmt: () => unsupported("ItemStmt"),
            visitFnItem: () => unsupported("FnItem"),
            visitStructItem: () => unsupported("StructItem"),
            visitEnumItem: () => unsupported("EnumItem"),
            visitModItem: () => unsupported("ModItem"),
            visitUseItem: () => unsupported("UseItem"),
            visitImplItem: () => unsupported("ImplItem"),
            visitTraitImplItem: () => unsupported("TraitImplItem"),
            visitTraitItem: () => unsupported("TraitItem"),
            visitUnsafeItem: (item: UnsafeItem) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`unsafe` items are not implemented",
                    item.span,
                ),
            visitTypeAliasItem: (item: TypeAliasItem) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "type aliases are not implemented",
                    item.span,
                ),
            visitStaticItem: (item: StaticItem) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`static` items are not implemented",
                    item.span,
                ),
            visitConstItem: (item: ConstItem) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "const items are handled before the visitor; this path should not be reached",
                    item.span,
                ),
            visitRecoveryItem: (item: RecoveryItem) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    item.message,
                    item.span,
                ),
            visitIdentPat: () => unsupported("IdentPattern"),
            visitWildcardPat: () => unsupported("WildcardPattern"),
            visitLiteralPat: () => unsupported("LiteralPattern"),
            visitRangePat: () => unsupported("RangePattern"),
            visitStructPat: () => unsupported("StructPattern"),
            visitTuplePat: () => unsupported("TuplePattern"),
            visitNamedTypeNode: () => unsupported("NamedTypeNode"),
            visitInferredTypeNode: () => unsupported("InferredTypeNode"),
            visitTupleTypeNode: () => unsupported("TupleTypeNode"),
            visitArrayTypeNode: () => unsupported("ArrayTypeNode"),
            visitRefTypeNode: () => unsupported("RefTypeNode"),
            visitPtrTypeNode: () => unsupported("PtrTypeNode"),
            visitFnTypeNode: () => unsupported("FnTypeNode"),
            visitGenericArgsNode: () => unsupported("GenericArgsNode"),
            visitModuleNode: () => unsupported("ModuleNode"),
            visitMatchArmNode: () => unsupported("MatchArmNode"),
            visitTraitMethod: () => unsupported("TraitMethod"),
            visitGenericFnItem: () => unsupported("GenericFnItem"),
            visitGenericStructItem: () => unsupported("GenericStructItem"),
        };
    }

    private lowerLiteral(expr: LiteralExpr): Result<LoweredValue, LoweringError> {
        switch (expr.literalKind) {
            case LiteralKind.Int: {
                let value: number;
                if (typeof expr.value === "number") {
                    ({ value } = expr);
                } else {
                    value = Number(expr.value);
                }
                const width = intSuffixToWidth(expr.suffix);
                const constInst = this.builder.iconst(value, width);
                return AstToSsaCtx.loweredInst(constInst);
            }
            case LiteralKind.Float: {
                let value: number;
                if (typeof expr.value === "number") {
                    ({ value } = expr);
                } else {
                    value = Number(expr.value);
                }
                const width = floatSuffixToWidth(expr.suffix);
                const constInst = this.builder.fconst(value, width);
                return AstToSsaCtx.loweredInst(constInst);
            }
            case LiteralKind.Bool: {
                const constInst = this.builder.bconst(Boolean(expr.value));
                return AstToSsaCtx.loweredInst(constInst);
            }
            case LiteralKind.String: {
                const literalId = internIRStringLiteral(
                    this.irModule,
                    String(expr.value),
                );
                const constInst = this.builder.sconst(literalId);
                return AstToSsaCtx.loweredInst(constInst);
            }
            case LiteralKind.Char: {
                let cp = Number(expr.value);
                if (typeof expr.value === "string") {
                    cp =
                        expr.value.codePointAt(STRING_FIRST_CHAR_INDEX) ??
                        DEFAULT_CHAR_CODE;
                }
                const constInst = this.builder.iconst(cp, IntWidth.U32);
                return AstToSsaCtx.loweredInst(constInst);
            }
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported literal kind",
                    expr.span,
                );
            }
        }
    }

    private lowerIdentifier(
        expr: IdentifierExpr,
    ): Result<LoweredValue, LoweringError> {
        const binding = this.locals.get(expr.name);
        if (binding) {
            const loadInst = this.builder.load(binding.ptr, binding.ty);
            return AstToSsaCtx.loweredInst(loadInst);
        }

        const constBinding = this.lookupConst(expr.name);
        if (constBinding) {
            return this.lowerConstBinding(constBinding);
        }

        const variantTag = this.enumVariantTags.get(expr.name);
        if (variantTag !== undefined) {
            const enumType = this.resolveEnumTypeForVariant(expr.name);
            this.registerEnumTypeMetadata(enumType);
            const inst = this.builder.enumCreate(
                variantTag,
                undefined,
                enumType,
            );
            return AstToSsaCtx.loweredInst(inst);
        }

        const fnId = this.requireFunctionId(expr.name, expr.span);
        if (fnId.isErr()) {
            return fnId;
        }
        const constInst = this.builder.iconst(fnId.value, IntWidth.I64);
        return AstToSsaCtx.loweredInst(constInst);
    }

    private lowerConstBinding(
        binding: LoweringConstBinding,
    ): Result<LoweredValue, LoweringError> {
        if (this.constResolutionStack.includes(binding)) {
            const cycle = [...this.constResolutionStack.map((entry) => entry.key), binding.key];
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `recursive const definition detected: ${cycle.join(" -> ")}`,
                binding.span,
            );
        }
        this.constResolutionStack.push(binding);
        try {
            return this.lowerExpression(binding.value);
        } finally {
            this.constResolutionStack.pop();
        }
    }

    visitPathExpr(expr: PathExpr): Result<LoweredValue, LoweringError> {
        return this.lowerIdentifier(expr);
    }

    private resolveEnumTypeForVariant(variantPath: string): EnumType {
        const colonColon = "::";
        const sepIndex = variantPath.indexOf(colonColon);
        if (sepIndex !== -1) {
            const enumName = variantPath.slice(0, sepIndex);
            const found = this.findEnumTypeByName(enumName);
            if (found) {
                return found;
            }
        }

        const ownerName = this.enumVariantOwners.get(variantPath);
        if (ownerName) {
            const found = this.findEnumTypeByName(ownerName);
            if (found) {
                return found;
            }
        }

        const OPTION_VARIANTS = new Set(["Option::None", "Option::Some"]);
        if (OPTION_VARIANTS.has(variantPath)) {
            return (
                this.findEnumTypeByName("Option") ??
                makeIREnumType("Option", [[], [makeIRUnitType()]])
            );
        }
        const RESULT_VARIANTS = new Set(["Result::Ok", "Result::Err"]);
        if (RESULT_VARIANTS.has(variantPath)) {
            return (
                this.findEnumTypeByName("Result") ??
                makeIREnumType("Result", [
                    [makeIRUnitType()],
                    [makeIRUnitType()],
                ])
            );
        }
        return makeIREnumType("__anon_enum", []);
    }

    private findEnumTypeByName(name: string): EnumType | undefined {
        let matched: EnumType | undefined;
        for (const enumTy of this.irModule.enums.values()) {
            if (enumTy.name === name) {
                matched = enumTy;
            }
        }
        return matched;
    }

    private lowerAssignTargetIdent(
        target: IdentifierExpr,
    ): Result<{ ptr: ValueId; ty: IRType }, LoweringError> {
        const binding = this.locals.get(target.name);
        if (!binding) {
            return loweringError(
                LoweringErrorKind.UnknownVariable,
                `Unknown variable '${target.name}'`,
                target.span,
            );
        }
        return Result.ok({ ptr: binding.ptr, ty: binding.ty });
    }

    private lowerAssignTargetDeref(
        target: DerefExpr,
    ): Result<{ ptr: ValueId; ty: IRType }, LoweringError> {
        const ptrResult = this.lowerExpression(target.target);
        if (!ptrResult.isOk()) return ptrResult;
        const ptrTy = ptrResult.value.ty;
        if (!(ptrTy instanceof PtrType)) {
            return loweringError(
                LoweringErrorKind.InvalidAssignmentTarget,
                "Deref assignment requires a pointer",
                target.span,
            );
        }
        return Result.ok({ ptr: ptrResult.value.id, ty: ptrTy.inner });
    }

    private lowerAssignTargetField(
        target: FieldExpr,
    ): Result<{ ptr: ValueId; ty: IRType }, LoweringError> {
        const baseResult = this.lowerAssignTarget(target.receiver);
        if (!baseResult.isOk()) return baseResult;
        const { ptr: basePtr, ty: baseTy } = baseResult.value;

        const structTy = match(baseTy)
            .when(
                (t): t is StructType => t instanceof StructType,
                (t) => this.irModule.structs.get(t.name) ?? t,
            )
            .otherwise((t) => t);

        if (!(structTy instanceof StructType)) {
            return loweringError(
                LoweringErrorKind.InvalidAssignmentTarget,
                "Field assignment requires a struct target",
                target.span,
            );
        }

        const fieldNames = this.structFieldNames.get(structTy.name);
        if (!fieldNames) {
            return loweringError(
                LoweringErrorKind.InvalidAssignmentTarget,
                `No field metadata for struct \`${structTy.name}\``,
                target.span,
            );
        }

        const index = fieldNames.indexOf(target.field);
        if (index === -1 || index >= structTy.fields.length) {
            return loweringError(
                LoweringErrorKind.InvalidAssignmentTarget,
                `Unknown field \`${target.field}\` on \`${structTy.name}\``,
                target.span,
            );
        }

        const fieldTy = structTy.fields[index];
        const idxConst = this.builder.iconst(index, IntWidth.I32);
        const fieldPtr = this.builder.gep(basePtr, [idxConst.id], fieldTy);
        return Result.ok({ ptr: fieldPtr.id, ty: fieldTy });
    }

    private lowerAssignTargetIndex(
        target: IndexExpr,
    ): Result<{ ptr: ValueId; ty: IRType }, LoweringError> {
        const receiverResult = this.lowerExpression(target.receiver);
        if (!receiverResult.isOk()) return receiverResult;

        const receiverTy = receiverResult.value.ty;
        const arrayTy = match(receiverTy)
            .when(
                (t): t is PtrType => t instanceof PtrType,
                (t) => t.inner,
            )
            .otherwise((t) => t);

        if (!(arrayTy instanceof ArrayType)) {
            return loweringError(
                LoweringErrorKind.InvalidAssignmentTarget,
                "Index assignment requires an array receiver",
                target.span,
            );
        }

        const elemTy = arrayTy.element;
        const indexResult = this.lowerExpression(target.index);
        if (!indexResult.isOk()) return indexResult;

        const elemPtr = this.builder.gep(
            receiverResult.value.id,
            [indexResult.value.id],
            elemTy,
        );
        return Result.ok({ ptr: elemPtr.id, ty: elemTy });
    }

    private lowerAssignTarget(
        target: Expression,
    ): Result<{ ptr: ValueId; ty: IRType }, LoweringError> {
        if (target instanceof IdentifierExpr) {
            return this.lowerAssignTargetIdent(target);
        }
        if (target instanceof DerefExpr) {
            return this.lowerAssignTargetDeref(target);
        }
        if (target instanceof FieldExpr) {
            return this.lowerAssignTargetField(target);
        }
        if (target instanceof IndexExpr) {
            return this.lowerAssignTargetIndex(target);
        }
        return loweringError(
            LoweringErrorKind.InvalidAssignmentTarget,
            `Unsupported assignment target: ${target.constructor.name}`,
            target.span,
        );
    }

    private lowerAssign(expr: AssignExpr): Result<LoweredValue, LoweringError> {
        const targetResult = this.lowerAssignTarget(expr.target);
        if (!targetResult.isOk()) return targetResult;
        const { ptr, ty } = targetResult.value;

        const valueResult = this.lowerExpressionWithExpected(expr.value, ty);
        if (!valueResult.isOk()) return valueResult;

        this.builder.store(ptr, valueResult.value.id, ty);
        return Result.ok(valueResult.value);
    }

    private lowerBinary(expr: BinaryExpr): Result<LoweredValue, LoweringError> {
        const leftResult = this.lowerExpression(expr.left);
        if (!leftResult.isOk()) {
            return leftResult;
        }
        const rightResult = this.lowerExpression(expr.right);
        if (!rightResult.isOk()) {
            return rightResult;
        }

        const left = this.autoDerefForBinaryOp(leftResult.value.id);
        const right = this.autoDerefForBinaryOp(rightResult.value.id);
        const isFloat =
            this.isFloatish(expr.left) || this.isFloatish(expr.right);

        // Dispatch to specific binary operation handlers
        return this.handleBinaryOperation(
            expr.op,
            left,
            right,
            isFloat,
            expr.span,
        );
    }

    /**
     * When a binary operation is applied to a reference value (ptr<T> where T is
     * a primitive arithmetic type), automatically dereference it. This mirrors
     * Rust's auto-deref coercion for `&T` operands in arithmetic/comparison.
     */
    private autoDerefForBinaryOp(value: ValueId): ValueId {
        const ty = this.lookupValueType(value);
        if (
            ty instanceof PtrType &&
            (ty.inner instanceof IntType || ty.inner instanceof FloatType)
        ) {
            return this.builder.load(value, ty.inner).id;
        }
        return value;
    }

    private handleBinaryOperation(
        op: BinaryOp,
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
        span: Span,
    ): Result<LoweredValue, LoweringError> {
        // Dispatch to operation category handlers
        if (AstToSsaCtx.isArithmeticOperation(op)) {
            return this.handleArithmeticOperation(op, left, right, isFloat);
        }
        if (AstToSsaCtx.isComparisonOperation(op)) {
            return this.handleComparisonOperation(op, left, right, isFloat);
        }
        if (AstToSsaCtx.isBitwiseOperation(op)) {
            return this.handleBitwiseOperation(op, left, right);
        }

        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            "Unsupported binary operation",
            span,
        );
    }

    private static isArithmeticOperation(op: BinaryOp): boolean {
        return (
            op === BinaryOp.Add ||
            op === BinaryOp.Sub ||
            op === BinaryOp.Mul ||
            op === BinaryOp.Div ||
            op === BinaryOp.Rem
        );
    }

    private static isComparisonOperation(op: BinaryOp): boolean {
        return (
            op === BinaryOp.Eq ||
            op === BinaryOp.Ne ||
            op === BinaryOp.Lt ||
            op === BinaryOp.Le ||
            op === BinaryOp.Gt ||
            op === BinaryOp.Ge
        );
    }

    private static isBitwiseOperation(op: BinaryOp): boolean {
        return (
            op === BinaryOp.And ||
            op === BinaryOp.BitAnd ||
            op === BinaryOp.Or ||
            op === BinaryOp.BitOr ||
            op === BinaryOp.BitXor ||
            op === BinaryOp.Shl ||
            op === BinaryOp.Shr
        );
    }

    private resolveIntWidth(value: ValueId): IntWidth {
        const ty = this.lookupValueType(value);
        return match(ty)
            .with(P.instanceOf(IntType), (t) => t.width)
            .otherwise(() => IntWidth.I32);
    }

    private resolveFloatWidth(value: ValueId): FloatWidth {
        const ty = this.lookupValueType(value);
        return match(ty)
            .with(P.instanceOf(FloatType), (t) => t.width)
            .otherwise(() => FloatWidth.F64);
    }

    private handleArithmeticOperation(
        op: BinaryOp,
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        const intWidth = this.resolveIntWidth(left);
        const floatWidth = this.resolveFloatWidth(left);
        switch (op) {
            case BinaryOp.Add: {
                return this.handleAddOperation(left, right, isFloat, intWidth, floatWidth);
            }
            case BinaryOp.Sub: {
                return this.handleSubOperation(left, right, isFloat, intWidth, floatWidth);
            }
            case BinaryOp.Mul: {
                return this.handleMulOperation(left, right, isFloat, intWidth, floatWidth);
            }
            case BinaryOp.Div: {
                return this.handleDivOperation(left, right, isFloat, intWidth, floatWidth);
            }
            case BinaryOp.Rem: {
                return this.handleRemOperation(left, right, intWidth);
            }
            case BinaryOp.Eq:
            case BinaryOp.Ne:
            case BinaryOp.Lt:
            case BinaryOp.Le:
            case BinaryOp.Gt:
            case BinaryOp.Ge:
            case BinaryOp.And:
            case BinaryOp.Or:
            case BinaryOp.BitXor:
            case BinaryOp.BitAnd:
            case BinaryOp.BitOr:
            case BinaryOp.Shl:
            case BinaryOp.Shr: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unreachable: wrong operation category for arithmetic handler",
                    zeroSpan(),
                );
            }
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported arithmetic operation",
                    zeroSpan(),
                );
            }
        }
    }

    private handleComparisonOperation(
        op: BinaryOp,
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        switch (op) {
            case BinaryOp.Eq: {
                return this.handleEqOperation(left, right, isFloat);
            }
            case BinaryOp.Ne: {
                return this.handleNeOperation(left, right, isFloat);
            }
            case BinaryOp.Lt: {
                return this.handleLtOperation(left, right, isFloat);
            }
            case BinaryOp.Le: {
                return this.handleLeOperation(left, right, isFloat);
            }
            case BinaryOp.Gt: {
                return this.handleGtOperation(left, right, isFloat);
            }
            case BinaryOp.Ge: {
                return this.handleGeOperation(left, right, isFloat);
            }
            case BinaryOp.Add:
            case BinaryOp.Sub:
            case BinaryOp.Mul:
            case BinaryOp.Div:
            case BinaryOp.Rem:
            case BinaryOp.And:
            case BinaryOp.Or:
            case BinaryOp.BitXor:
            case BinaryOp.BitAnd:
            case BinaryOp.BitOr:
            case BinaryOp.Shl:
            case BinaryOp.Shr: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unreachable: wrong operation category for comparison handler",
                    zeroSpan(),
                );
            }
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported comparison operation",
                    zeroSpan(),
                );
            }
        }
    }

    private handleBitwiseOperation(
        op: BinaryOp,
        left: ValueId,
        right: ValueId,
    ): Result<LoweredValue, LoweringError> {
        switch (op) {
            case BinaryOp.And:
            case BinaryOp.BitAnd: {
                return this.handleAndOperation(left, right);
            }
            case BinaryOp.Or:
            case BinaryOp.BitOr: {
                return this.handleOrOperation(left, right);
            }
            case BinaryOp.BitXor: {
                return this.handleXorOperation(left, right);
            }
            case BinaryOp.Shl: {
                return this.handleShlOperation(left, right);
            }
            case BinaryOp.Shr: {
                return this.handleShrOperation(left, right);
            }
            case BinaryOp.Add:
            case BinaryOp.Sub:
            case BinaryOp.Mul:
            case BinaryOp.Div:
            case BinaryOp.Rem:
            case BinaryOp.Eq:
            case BinaryOp.Ne:
            case BinaryOp.Lt:
            case BinaryOp.Le:
            case BinaryOp.Gt:
            case BinaryOp.Ge: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unreachable: wrong operation category for bitwise handler",
                    zeroSpan(),
                );
            }
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported bitwise operation",
                    zeroSpan(),
                );
            }
        }
    }

    // Arithmetic operation handlers
    private handleAddOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
        intWidth: IntWidth,
        floatWidth: FloatWidth,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const addInst = this.builder.fadd(left, right, floatWidth);
            return AstToSsaCtx.loweredInst(addInst);
        }
        const addInst = this.builder.iadd(left, right, intWidth);
        return AstToSsaCtx.loweredInst(addInst);
    }

    private handleSubOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
        intWidth: IntWidth,
        floatWidth: FloatWidth,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const subInst = this.builder.fsub(left, right, floatWidth);
            return AstToSsaCtx.loweredInst(subInst);
        }
        const subInst = this.builder.isub(left, right, intWidth);
        return AstToSsaCtx.loweredInst(subInst);
    }

    private handleMulOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
        intWidth: IntWidth,
        floatWidth: FloatWidth,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const mulInst = this.builder.fmul(left, right, floatWidth);
            return AstToSsaCtx.loweredInst(mulInst);
        }
        const mulInst = this.builder.imul(left, right, intWidth);
        return AstToSsaCtx.loweredInst(mulInst);
    }

    private handleDivOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
        intWidth: IntWidth,
        floatWidth: FloatWidth,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const divInst = this.builder.fdiv(left, right, floatWidth);
            return AstToSsaCtx.loweredInst(divInst);
        }
        const divInst = this.builder.idiv(left, right, intWidth);
        return AstToSsaCtx.loweredInst(divInst);
    }

    private handleRemOperation(
        left: ValueId,
        right: ValueId,
        intWidth: IntWidth,
    ): Result<LoweredValue, LoweringError> {
        const remInst = this.builder.imod(left, right, intWidth);
        return AstToSsaCtx.loweredInst(remInst);
    }

    // Comparison operation handlers
    private handleEqOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Oeq, left, right);
            return AstToSsaCtx.loweredInst(cmpInst);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Eq, left, right);
        return AstToSsaCtx.loweredInst(cmpInst);
    }

    private handleNeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.One, left, right);
            return AstToSsaCtx.loweredInst(cmpInst);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Ne, left, right);
        return AstToSsaCtx.loweredInst(cmpInst);
    }

    private handleLtOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Olt, left, right);
            return AstToSsaCtx.loweredInst(cmpInst);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Slt, left, right);
        return AstToSsaCtx.loweredInst(cmpInst);
    }

    private handleLeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Ole, left, right);
            return AstToSsaCtx.loweredInst(cmpInst);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sle, left, right);
        return AstToSsaCtx.loweredInst(cmpInst);
    }

    private handleGtOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Ogt, left, right);
            return AstToSsaCtx.loweredInst(cmpInst);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sgt, left, right);
        return AstToSsaCtx.loweredInst(cmpInst);
    }

    private handleGeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<LoweredValue, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Oge, left, right);
            return AstToSsaCtx.loweredInst(cmpInst);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sge, left, right);
        return AstToSsaCtx.loweredInst(cmpInst);
    }

    // Bitwise operation handlers
    private handleAndOperation(
        left: ValueId,
        right: ValueId,
    ): Result<LoweredValue, LoweringError> {
        const andInst = this.builder.iand(left, right, IntWidth.I8);
        return AstToSsaCtx.loweredInst(andInst);
    }

    private handleOrOperation(
        left: ValueId,
        right: ValueId,
    ): Result<LoweredValue, LoweringError> {
        const orInst = this.builder.ior(left, right, IntWidth.I8);
        return AstToSsaCtx.loweredInst(orInst);
    }

    private handleXorOperation(
        left: ValueId,
        right: ValueId,
    ): Result<LoweredValue, LoweringError> {
        const xorInst = this.builder.ixor(left, right, IntWidth.I32);
        return AstToSsaCtx.loweredInst(xorInst);
    }

    private handleShlOperation(
        left: ValueId,
        right: ValueId,
    ): Result<LoweredValue, LoweringError> {
        const shlInst = this.builder.ishl(left, right, IntWidth.I32);
        return AstToSsaCtx.loweredInst(shlInst);
    }

    private handleShrOperation(
        left: ValueId,
        right: ValueId,
    ): Result<LoweredValue, LoweringError> {
        const shrInst = this.builder.ishr(left, right, IntWidth.I32);
        return AstToSsaCtx.loweredInst(shrInst);
    }

    private lowerUnary(expr: UnaryExpr): Result<LoweredValue, LoweringError> {
        const operandResult = this.lowerExpression(expr.operand);
        if (!operandResult.isOk()) return operandResult;
        const operand = operandResult.value.id;

        switch (expr.op) {
            case UnaryOp.Neg: {
                if (this.isFloatish(expr.operand)) {
                    const negInst = this.builder.fneg(operand, FloatWidth.F64);
                    return AstToSsaCtx.loweredInst(negInst);
                }
                const negInst = this.builder.ineg(operand, IntWidth.I32);
                return AstToSsaCtx.loweredInst(negInst);
            }
            case UnaryOp.Not: {
                const oneInst = this.builder.bconst(true);
                const xorInst = this.builder.ixor(
                    operand,
                    oneInst.id,
                    IntWidth.I8,
                );
                return AstToSsaCtx.loweredInst(xorInst);
            }
            case UnaryOp.Ref: {
                if (expr.operand instanceof IdentifierExpr) {
                    const binding = this.locals.get(expr.operand.name);
                    if (!binding) {
                        return loweringError(
                            LoweringErrorKind.UnknownVariable,
                            `Unknown variable '${expr.operand.name}'`,
                            expr.operand.span,
                        );
                    }
                    return Result.ok(
                        this.loweredValue(binding.ptr, new PtrType(binding.ty)),
                    );
                }

                const ptrTy = makeIRIntType(IntWidth.I64);
                const allocaInst = this.builder.alloca(ptrTy);
                const ptrId = allocaInst.id;
                this.builder.store(ptrId, operand, ptrTy);
                return AstToSsaCtx.loweredInst(allocaInst);
            }
            case UnaryOp.Deref: {
                const operandTy = operandResult.value.ty;
                const loadTy = match(operandTy)
                    .when(
                        (t): t is PtrType => t instanceof PtrType,
                        (t) => t.inner,
                    )
                    .otherwise(() => makeIRIntType(IntWidth.I64));
                const loadInst = this.builder.load(operand, loadTy);
                return AstToSsaCtx.loweredInst(loadInst);
            }
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported unary operation",
                    expr.span,
                );
            }
        }
    }

    private lowerCall(expr: CallExpr): Result<LoweredValue, LoweringError> {
        // Detect enum constructors before lowering args so we can propagate the
        // expected payload type into nested constructor calls (e.g. Some(Ok(1))).
        if (expr.callee instanceof IdentifierExpr) {
            const calleeName = expr.callee.name;
            if (calleeName === "Some" || calleeName === "Option::Some") {
                return this.lowerEnumConstructorCall(expr, "Some");
            }
            if (calleeName === "Ok" || calleeName === "Result::Ok") {
                return this.lowerEnumConstructorCall(expr, "Ok");
            }
            if (calleeName === "Err" || calleeName === "Result::Err") {
                return this.lowerEnumConstructorCall(expr, "Err");
            }
        }

        const args: ValueId[] = [];
        for (const arg of expr.args) {
            const argResult = this.lowerExpression(arg);
            if (!argResult.isOk()) {
                return argResult;
            }
            args.push(argResult.value.id);
        }

        if (expr.callee instanceof FieldExpr) {
            return this.lowerMethodCall(expr.callee, args);
        }

        const retTy: IRType = makeIRIntType(IntWidth.I64);
        if (expr.callee instanceof IdentifierExpr) {
            // Check if this is a call to a generic function
            const resolvedName = this.resolveGenericCallName(expr);
            if (resolvedName) {
                return this.lowerResolvedCall(
                    resolvedName,
                    args,
                    retTy,
                    expr.span,
                );
            }
            return this.lowerIdentifierCall(expr.callee, args, retTy);
        }

        const calleeResult = this.lowerExpression(expr.callee);
        if (!calleeResult.isOk()) {
            return calleeResult;
        }
        const callDynInst = this.builder.callDyn(
            calleeResult.value.id,
            args,
            retTy,
        );
        return AstToSsaCtx.loweredInst(callDynInst);
    }

    private resolveExpectedOptionPayloadType(): IRType | undefined {
        const contextual = this.peekExpectedValueType();
        if (contextual instanceof EnumType && contextual.name === "Option") {
            return contextual.variants[1]?.[0];
        }
        const returnTy = this.currentReturnType;
        if (!(returnTy instanceof EnumType)) return undefined;
        if (returnTy.name !== "Option") return undefined;
        return returnTy.variants[1]?.[0];
    }

    private lowerEnumConstructorCall(
        expr: CallExpr,
        constructorName: "Some" | "Ok" | "Err",
    ): Result<LoweredValue, LoweringError> {
        let expectedArgTy: IRType | undefined;
        if (constructorName === "Some") {
            expectedArgTy = this.resolveExpectedOptionPayloadType();
        } else {
            const resultTy = this.resolveExpectedResultType();
            if (resultTy) {
                expectedArgTy = match(constructorName)
                    .with("Ok", () => resultTy.variants[0]?.[0])
                    .with("Err", () => resultTy.variants[1]?.[0])
                    .exhaustive();
            }
        }

        const args: ValueId[] = [];
        for (const arg of expr.args) {
            const argResult = match(expectedArgTy)
                .with(P.nonNullable, (expectedType) =>
                    this.lowerExpressionWithExpected(arg, expectedType),
                )
                .otherwise(() => this.lowerExpression(arg));
            if (!argResult.isOk()) {
                return argResult;
            }
            args.push(argResult.value.id);
        }

        if (constructorName === "Some") {
            return this.lowerSomeConstructor(expr.span, args);
        }
        if (constructorName === "Ok") {
            return this.lowerOkConstructor(expr.span, args);
        }
        return this.lowerErrConstructor(expr.span, args);
    }

    private lowerSomeConstructor(
        span: Span,
        args: ValueId[],
    ): Result<LoweredValue, LoweringError> {
        if (args.length !== 1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Some() requires exactly one argument",
                span,
            );
        }
        const resolvedDataTy = this.lookupValueType(args[0]);
        if (!resolvedDataTy) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Cannot infer type of Some() argument",
                span,
            );
        }
        const optEnumType = makeIREnumType("Option", [[], [resolvedDataTy]]);
        this.registerEnumTypeMetadata(optEnumType);
        const inst = this.builder.enumCreate(
            1 /* SOME_TAG */,
            args[0],
            optEnumType,
        );
        return AstToSsaCtx.loweredInst(inst);
    }

    private resolveResultOkType(): IRType | undefined {
        if (!(this.currentReturnType instanceof EnumType)) return undefined;
        if (this.currentReturnType.name !== "Result") return undefined;
        return this.currentReturnType.variants[0]?.[0];
    }

    private resolveResultErrType(): IRType | undefined {
        if (!(this.currentReturnType instanceof EnumType)) return undefined;
        if (this.currentReturnType.name !== "Result") return undefined;
        return this.currentReturnType.variants[1]?.[0];
    }

    private peekExpectedValueType(): IRType | undefined {
        return this.expectedValueTypes.at(LAST_FRAME_INDEX);
    }

    private resolveExpectedResultType(): EnumType | undefined {
        const contextualType = this.peekExpectedValueType();
        if (
            contextualType instanceof EnumType &&
            contextualType.name === "Result"
        ) {
            this.registerEnumTypeMetadata(contextualType);
            return contextualType;
        }
        const returnType = this.currentReturnType;
        if (returnType instanceof EnumType && returnType.name === "Result") {
            this.registerEnumTypeMetadata(returnType);
            return returnType;
        }
        return undefined;
    }

    private lowerOkConstructor(
        span: Span,
        args: ValueId[],
    ): Result<LoweredValue, LoweringError> {
        if (args.length !== 1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Ok() requires exactly one argument",
                span,
            );
        }
        const contextualResultTy = this.resolveExpectedResultType();
        if (contextualResultTy) {
            return AstToSsaCtx.loweredInst(
                this.builder.enumCreate(0 /* OK_TAG */, args[0], contextualResultTy),
            );
        }
        const resolvedOkTy = this.lookupValueType(args[0]);
        if (!resolvedOkTy) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Cannot infer type of Ok() argument",
                span,
            );
        }
        const resolvedErrTy = this.resolveResultErrType();
        if (!resolvedErrTy) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Cannot infer error type for Ok() — no Result return type found",
                span,
            );
        }
        const ty = makeIREnumType("Result", [[resolvedOkTy], [resolvedErrTy]]);
        this.registerEnumTypeMetadata(ty);
        return AstToSsaCtx.loweredInst(
            this.builder.enumCreate(0 /* OK_TAG */, args[0], ty),
        );
    }

    private lowerErrConstructor(
        span: Span,
        args: ValueId[],
    ): Result<LoweredValue, LoweringError> {
        if (args.length !== 1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Err() requires exactly one argument",
                span,
            );
        }
        const contextualResultTy = this.resolveExpectedResultType();
        if (contextualResultTy) {
            return AstToSsaCtx.loweredInst(
                this.builder.enumCreate(1 /* ERR_TAG */, args[0], contextualResultTy),
            );
        }
        const resolvedErrTy = this.lookupValueType(args[0]);
        if (!resolvedErrTy) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Cannot infer type of Err() argument",
                span,
            );
        }
        const resolvedOkTy = this.resolveResultOkType();
        if (!resolvedOkTy) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Cannot infer ok type for Err() — no Result return type found",
                span,
            );
        }
        const errTy = resolvedErrTy;
        const okTy = resolvedOkTy;
        const ty = makeIREnumType("Result", [[okTy], [errTy]]);
        this.registerEnumTypeMetadata(ty);
        return AstToSsaCtx.loweredInst(
            this.builder.enumCreate(1 /* ERR_TAG */, args[0], ty),
        );
    }

    private resolveGenericCallName(expr: CallExpr): string | undefined {
        if (!this.monoRegistry) return undefined;
        if (!(expr.callee instanceof IdentifierExpr)) return undefined;

        const generic = this.monoRegistry.lookupGenericFn(expr.callee.name);
        if (!generic) return undefined;

        const subs = inferCallSiteTypeArgs(generic, expr);
        if (!subs) return undefined;

        return mangledName(generic.name, subs);
    }

    private lowerResolvedCall(
        name: string,
        args: ValueId[],
        defaultReturnType: IRType,
        span: Span,
    ): Result<LoweredValue, LoweringError> {
        const returnType = this.resolveNamedCallReturnType(
            name,
            defaultReturnType,
        );
        const fnId = this.requireFunctionId(name, span);
        if (fnId.isErr()) {
            return fnId;
        }
        const callInst = this.builder.call(
            fnId.value,
            args,
            returnType,
        );
        return AstToSsaCtx.loweredInst(callInst);
    }

    private lowerMethodCall(
        callee: FieldExpr,
        args: ValueId[],
    ): Result<LoweredValue, LoweringError> {
        const receiver = this.lowerExpression(callee.receiver);
        if (!receiver.isOk()) {
            return receiver;
        }
        const methodBuiltin = this.tryLowerBuiltinMethod(
            callee,
            receiver.value.id,
            args,
        );
        if (methodBuiltin) {
            return methodBuiltin;
        }

        const receiverArg = this.resolveReceiverArg(callee, receiver.value.id);
        const receiverType = receiver.value.ty;
        const qualifiedName = this.resolveQualifiedMethodName(
            callee.field,
            receiverType,
        );
        let defaultReturnType: IRType = makeIRIntType(IntWidth.I64);
        if (receiverType instanceof StructType) {
            defaultReturnType = receiverType;
        }
        const returnType = this.resolveNamedCallReturnType(
            qualifiedName,
            defaultReturnType,
        );
        const fnId = this.requireFunctionId(qualifiedName, callee.span);
        if (fnId.isErr()) {
            return fnId;
        }
        const callInst = this.builder.call(
            fnId.value,
            [receiverArg, ...args],
            returnType,
        );
        return AstToSsaCtx.loweredInst(callInst);
    }

    private lowerEnumIsTag(
        enumValue: ValueId,
        tag: number,
    ): Result<LoweredValue, LoweringError> {
        const tagId = this.builder.enumGetTag(enumValue).id;
        const tagConst = this.builder.iconst(tag, IntWidth.Usize).id;
        return AstToSsaCtx.loweredInst(this.builder.icmp(IcmpOp.Eq, tagId, tagConst));
    }

    private lowerEnumUnwrap(
        enumValue: ValueId,
        enumTy: EnumType,
        successTag: number,
    ): Result<LoweredValue, LoweringError> {
        const tagId = this.builder.enumGetTag(enumValue).id;
        const tagConst = this.builder.iconst(successTag, IntWidth.Usize).id;
        const isSuccess = this.builder.icmp(IcmpOp.Eq, tagId, tagConst).id;
        const okBlock = this.builder.createBlock("unwrap_ok");
        const panicBlock = this.builder.createBlock("unwrap_panic");
        this.builder.brIf(isSuccess, okBlock, [], panicBlock, []);
        this.builder.switchToBlock(panicBlock);
        this.builder.unreachable();
        this.builder.switchToBlock(okBlock);
        const variantPayloads = enumTy.variants[successTag] ?? [];
        if (variantPayloads.length === 0) {
            return Result.ok(this.loweredUnit());
        }
        const [payloadTy] = variantPayloads;
        if (isIRUnitType(payloadTy)) {
            return Result.ok(this.loweredUnit());
        }
        return AstToSsaCtx.loweredInst(
            this.builder.enumGetData(enumValue, successTag, 0, enumTy, payloadTy),
        );
    }

    private tryLowerBuiltinIsMethod(
        field: string,
        receiverType: IRType | undefined,
        receiverValue: ValueId,
        args: ValueId[],
        span: Span,
    ): Result<LoweredValue, LoweringError> | undefined {
        if (!(receiverType instanceof EnumType)) return undefined;
        if (field === "is_some" && receiverType.name === "Option") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`is_some` does not take any arguments",
                    span,
                );
            }
            return this.lowerEnumIsTag(receiverValue, 1 /* SOME_TAG */);
        }
        if (field === "is_none" && receiverType.name === "Option") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`is_none` does not take any arguments",
                    span,
                );
            }
            return this.lowerEnumIsTag(receiverValue, 0 /* NONE_TAG */);
        }
        if (field === "is_ok" && receiverType.name === "Result") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`is_ok` does not take any arguments",
                    span,
                );
            }
            return this.lowerEnumIsTag(receiverValue, 0 /* OK_TAG */);
        }
        if (field === "is_err" && receiverType.name === "Result") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`is_err` does not take any arguments",
                    span,
                );
            }
            return this.lowerEnumIsTag(receiverValue, 1 /* ERR_TAG */);
        }
        return undefined;
    }

    private tryLowerBuiltinUnwrapMethod(
        field: string,
        receiverType: IRType | undefined,
        receiverValue: ValueId,
        args: ValueId[],
        span: Span,
    ): Result<LoweredValue, LoweringError> | undefined {
        if (!(receiverType instanceof EnumType)) return undefined;
        if (field === "unwrap" || field === "expect") {
            const expectedArgCount = match(field)
                .with("unwrap", () => 0)
                .with("expect", () => 1)
                .exhaustive();
            if (args.length !== expectedArgCount) {
                const message = match(field)
                    .with(
                        "unwrap",
                        () => "`unwrap` does not take any arguments",
                    )
                    .with(
                        "expect",
                        () => "`expect` requires exactly one argument",
                    )
                    .exhaustive();
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    message,
                    span,
                );
            }
            if (receiverType.name === "Option") {
                return this.lowerEnumUnwrap(
                    receiverValue,
                    receiverType,
                    1 /* SOME_TAG */,
                );
            }
            if (receiverType.name === "Result") {
                return this.lowerEnumUnwrap(
                    receiverValue,
                    receiverType,
                    0 /* OK_TAG */,
                );
            }
        }
        if (field === "unwrap_err" && receiverType.name === "Result") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`unwrap_err` does not take any arguments",
                    span,
                );
            }
            return this.lowerEnumUnwrap(
                receiverValue,
                receiverType,
                1 /* ERR_TAG */,
            );
        }
        return undefined;
    }

    private tryLowerBuiltinMethod(
        callee: FieldExpr,
        receiverValue: ValueId,
        args: ValueId[],
    ): Result<LoweredValue, LoweringError> | undefined {
        const receiverType = this.lookupValueType(receiverValue);

        if (callee.field === "clone") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`clone` does not take any arguments",
                    callee.span,
                );
            }
            return Result.ok(
                this.loweredValue(receiverValue, receiverType ?? makeIRUnitType()),
            );
        }

        return (
            this.tryLowerBuiltinIsMethod(
                callee.field,
                receiverType,
                receiverValue,
                args,
                callee.span,
            ) ??
            this.tryLowerBuiltinUnwrapMethod(
                callee.field,
                receiverType,
                receiverValue,
                args,
                callee.span,
            )
        );
    }

    private resolveReceiverArg(
        callee: FieldExpr,
        receiverValue: ValueId,
    ): ValueId {
        if (!(callee.receiver instanceof IdentifierExpr)) {
            return receiverValue;
        }
        const binding = this.locals.get(callee.receiver.name);
        return binding?.ptr ?? receiverValue;
    }

    private resolveQualifiedMethodName(
        methodName: string,
        receiverType: IRType | undefined,
    ): string {
        if (!(receiverType instanceof StructType)) {
            return methodName;
        }
        const maybeQualified = `${receiverType.name}::${methodName}`;
        if (this.functionIds.has(maybeQualified)) {
            return maybeQualified;
        }
        return methodName;
    }

    private lowerIdentifierCall(
        callee: IdentifierExpr,
        args: ValueId[],
        defaultReturnType: IRType,
    ): Result<LoweredValue, LoweringError> {
        const localBinding = this.locals.get(callee.name);
        if (localBinding) {
            const fnIdInst = this.builder.load(
                localBinding.ptr,
                localBinding.ty,
            );
            let returnType = defaultReturnType;
            if (localBinding.typeNode instanceof FnTypeNode) {
                returnType = AstToSsaCtx.translateTypeNode(
                    localBinding.typeNode.returnType,
                );
            }
            const callInst = this.builder.callDyn(
                fnIdInst.id,
                args,
                returnType,
            );
            return AstToSsaCtx.loweredInst(callInst);
        }
        const returnType = this.resolveNamedCallReturnType(
            callee.name,
            defaultReturnType,
        );
        const fnId = this.requireFunctionId(callee.name, callee.span);
        if (fnId.isErr()) {
            return fnId;
        }
        const callInst = this.builder.call(
            fnId.value,
            args,
            returnType,
        );
        return AstToSsaCtx.loweredInst(callInst);
    }

    private resolveNamedCallReturnType(name: string, fallback: IRType): IRType {
        // Derive the unqualified function name (e.g. "Point::create" → "create").
        const parts = name.split("::");
        const unqualifiedName = parts[parts.length - 1];

        const seededReturnType =
            this.functionReturnTypes.get(name) ??
            this.functionReturnTypes.get(unqualifiedName);
        if (seededReturnType) {
            return seededReturnType;
        }

        // Look up the return type of the already-lowered function.
        const fn = this.irModule.functions.find(
            (f) => f.name === unqualifiedName,
        );
        if (fn) {
            return fn.returnType;
        }

        return fallback;
    }

    private lowerMacro(expr: MacroExpr): Result<LoweredValue, LoweringError> {
        switch (expr.name) {
            case "print": {
                return this.lowerPrintMacro(expr, false);
            }
            case "println": {
                return this.lowerPrintMacro(expr, true);
            }
            case "assert": {
                return this.lowerAssert(expr);
            }
            case "assert_eq": {
                return this.lowerAssertEq(expr);
            }
            case "vec": {
                return this.lowerArrayLiteral(expr);
            }
            case "tuple": {
                return this.lowerTupleLiteral(expr);
            }
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    `macro lowering not implemented for \`${expr.name}!\``,
                    expr.span,
                );
            }
        }
    }

    private lowerTupleLiteral(expr: MacroExpr): Result<LoweredValue, LoweringError> {
        if (expr.args.length === 0) {
            return Result.ok(this.loweredUnit());
        }

        const elementValues: ValueId[] = [];
        for (const elem of expr.args) {
            const result = this.lowerExpression(elem);
            if (!result.isOk()) return result;
            elementValues.push(result.value.id);
        }

        const elementTypes = elementValues.map(
            (v) => this.lookupValueType(v) ?? makeIRUnitType(),
        );

        const tupleName = AstToSsaCtx.tupleStructName(elementTypes);
        const tupleType = makeIRStructType(tupleName, elementTypes);

        this.irModule.structs.set(tupleName, tupleType);
        this.structFieldNames.set(
            tupleName,
            elementTypes.map((_, i) => String(i)),
        );

        const structCreate = this.builder.structCreate(elementValues, tupleType);
        return AstToSsaCtx.loweredInst(structCreate);
    }

    private lowerArrayLiteral(expr: MacroExpr): Result<LoweredValue, LoweringError> {
        const elementValues: ValueId[] = [];
        for (const elemExpr of expr.args) {
            const result = this.lowerExpression(elemExpr);
            if (!result.isOk()) return result;
            elementValues.push(result.value.id);
        }

        let elemTy = makeIRUnitType();
        if (elementValues.length > 0) {
            elemTy =
                this.lookupValueType(elementValues[0]) ?? makeIRUnitType();
        }

        const arrayType = makeIRArrayType(elemTy, expr.args.length);
        const arrPtr = this.builder.alloca(arrayType);

        for (let i = 0; i < elementValues.length; i++) {
            const idxInst = this.builder.iconst(i, IntWidth.I32);
            const elemPtr = this.builder.gep(arrPtr.id, [idxInst.id], elemTy);
            this.builder.store(elemPtr.id, elementValues[i], elemTy);
        }

        return AstToSsaCtx.loweredInst(arrPtr);
    }

    private lowerIndexExpr(expr: IndexExpr): Result<LoweredValue, LoweringError> {
        const receiverResult = this.lowerExpression(expr.receiver);
        if (!receiverResult.isOk()) return receiverResult;

        const receiverType = receiverResult.value.ty;
        if (
            !(receiverType instanceof PtrType) ||
            !(receiverType.inner instanceof ArrayType)
        ) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Index expression requires an array receiver",
                expr.span,
            );
        }

        const elemTy = receiverType.inner.element;

        const indexResult = this.lowerExpression(expr.index);
        if (!indexResult.isOk()) return indexResult;

        const elemPtr = this.builder.gep(
            receiverResult.value.id,
            [indexResult.value.id],
            elemTy,
        );
        const loaded = this.builder.load(elemPtr.id, elemTy);
        return AstToSsaCtx.loweredInst(loaded);
    }

    private lowerAssert(expr: MacroExpr): Result<LoweredValue, LoweringError> {
        if (expr.args.length === 0) {
            return Result.ok(this.loweredUnit());
        }
        const condResult = this.lowerExpression(expr.args[0]);
        if (!condResult.isOk()) return condResult;

        const failBlock = this.builder.createBlock("assert_fail");
        const continueBlock = this.builder.createBlock("assert_ok");
        this.builder.brIf(condResult.value.id, continueBlock, [], failBlock, []);

        this.builder.switchToBlock(failBlock);
        this.builder.unreachable();

        this.builder.switchToBlock(continueBlock);
        return Result.ok(this.loweredUnit());
    }

    private lowerAssertEq(expr: MacroExpr): Result<LoweredValue, LoweringError> {
        if (expr.args.length < 2) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "assert_eq! requires two arguments",
                expr.span,
            );
        }
        const leftResult = this.lowerExpression(expr.args[0]);
        if (!leftResult.isOk()) return leftResult;
        const rightResult = this.lowerExpression(expr.args[1]);
        if (!rightResult.isOk()) return rightResult;

        const leftType = leftResult.value.ty;
        const rightType = rightResult.value.ty;

        let cmpId: ValueId;
        if (leftType instanceof FloatType || rightType instanceof FloatType) {
            cmpId = this.builder.fcmp(
                FcmpOp.Oeq,
                leftResult.value.id,
                rightResult.value.id,
            ).id;
        } else if (
            leftType instanceof IntType ||
            leftType.kind === IRTypeKind.Bool ||
            rightType instanceof IntType ||
            rightType.kind === IRTypeKind.Bool
        ) {
            cmpId = this.builder.icmp(
                IcmpOp.Eq,
                leftResult.value.id,
                rightResult.value.id,
            ).id;
        } else if (leftType instanceof EnumType) {
            return this.lowerAssertEqEnum(
                leftResult.value.id,
                rightResult.value.id,
                leftType,
            );
        } else if (rightType instanceof EnumType) {
            return this.lowerAssertEqEnum(
                leftResult.value.id,
                rightResult.value.id,
                rightType,
            );
        } else {
            // Cannot statically compare values of this type; treat as no-op
            return Result.ok(this.loweredUnit());
        }

        const failBlock = this.builder.createBlock("assert_fail");
        const continueBlock = this.builder.createBlock("assert_ok");
        this.builder.brIf(cmpId, continueBlock, [], failBlock, []);

        this.builder.switchToBlock(failBlock);
        this.builder.unreachable();

        this.builder.switchToBlock(continueBlock);
        return Result.ok(this.loweredUnit());
    }

    private lowerEnumVariantFieldCmp(
        left: ValueId,
        right: ValueId,
        variantIdx: number,
        enumTy: EnumType,
        failBlock: BlockId,
        doneBlock: BlockId,
    ): void {
        const fields = enumTy.variants[variantIdx];
        for (let fieldIdx = 0; fieldIdx < fields.length; fieldIdx++) {
            const fieldTy = fields[fieldIdx];
            const valL = this.builder.enumGetData(
                left,
                variantIdx,
                fieldIdx,
                enumTy,
                fieldTy,
            ).id;
            const valR = this.builder.enumGetData(
                right,
                variantIdx,
                fieldIdx,
                enumTy,
                fieldTy,
            ).id;
            const cmpId = match(fieldTy instanceof FloatType)
                .with(true, () => this.builder.fcmp(FcmpOp.Oeq, valL, valR).id)
                .otherwise(() => this.builder.icmp(IcmpOp.Eq, valL, valR).id);
            if (fieldIdx < fields.length - 1) {
                const nextFieldBlock = this.builder.createBlock(
                    `enum_eq_v${variantIdx}_f${fieldIdx + 1}`,
                );
                this.builder.brIf(cmpId, nextFieldBlock, [], failBlock, []);
                this.builder.switchToBlock(nextFieldBlock);
            } else {
                this.builder.brIf(cmpId, doneBlock, [], failBlock, []);
            }
        }
    }

    private lowerAssertEqEnum(
        left: ValueId,
        right: ValueId,
        enumTy: EnumType,
    ): Result<LoweredValue, LoweringError> {
        const tagL = this.builder.enumGetTag(left).id;
        const tagR = this.builder.enumGetTag(right).id;
        const tagsEq = this.builder.icmp(IcmpOp.Eq, tagL, tagR).id;

        const tagsMatchBlock = this.builder.createBlock("enum_eq_tags_match");
        const failBlock = this.builder.createBlock("assert_fail");
        const doneBlock = this.builder.createBlock("assert_ok");

        this.builder.brIf(tagsEq, tagsMatchBlock, [], failBlock, []);

        // tags_match_block: for each variant with payload(s), check if the
        // matched tag corresponds to that variant and compare fields; variants
        // with no payload are implicitly equal when tags match.
        this.builder.switchToBlock(tagsMatchBlock);

        const payloadVariants = enumTy.variants
            .map((fields, index) => ({ index, fields }))
            .filter(({ fields }) => fields.length > 0);

        if (payloadVariants.length === 0) {
            // All variants are unit variants — matching tags means equal.
            this.builder.br(doneBlock, []);
        } else {
            for (let pi = 0; pi < payloadVariants.length; pi++) {
                const { index: variantIdx } = payloadVariants[pi];
                const isLast = pi === payloadVariants.length - 1;

                const variantTagConst = this.builder.iconst(
                    variantIdx,
                    IntWidth.Usize,
                ).id;
                const isVariant = this.builder.icmp(
                    IcmpOp.Eq,
                    tagL,
                    variantTagConst,
                ).id;

                const cmpBlock = this.builder.createBlock(
                    `enum_eq_cmp_v${variantIdx}`,
                );
                // If this is the last payload variant and the tag doesn't
                // match it, all remaining variants must be unit variants so
                // we can jump directly to done.
                const elseBlock = match(isLast)
                    .with(true, () => doneBlock)
                    .otherwise(() =>
                        this.builder.createBlock(
                            `enum_eq_check_v${variantIdx + 1}`,
                        ),
                    );
                this.builder.brIf(isVariant, cmpBlock, [], elseBlock, []);

                this.builder.switchToBlock(cmpBlock);
                this.lowerEnumVariantFieldCmp(
                    left,
                    right,
                    variantIdx,
                    enumTy,
                    failBlock,
                    doneBlock,
                );

                if (!isLast) {
                    this.builder.switchToBlock(elseBlock);
                }
            }
        }

        this.builder.switchToBlock(failBlock);
        this.builder.unreachable();

        this.builder.switchToBlock(doneBlock);
        return Result.ok(this.loweredUnit());
    }

    private lowerPrintMacro(
        expr: MacroExpr,
        appendNewline: boolean,
    ): Result<LoweredValue, LoweringError> {
        const preparedArgs = this.preparePrintArguments(expr);
        if (!preparedArgs.isOk()) {
            return preparedArgs;
        }
        let builtinName: string = BUILTIN_SYMBOLS.PRINT_FMT;
        if (appendNewline) {
            builtinName = BUILTIN_SYMBOLS.PRINTLN_FMT;
        }
        const fnId = this.requireFunctionId(builtinName, expr.span);
        if (fnId.isErr()) {
            return fnId;
        }
        const callInst = this.builder.call(
            fnId.value,
            preparedArgs.value,
            makeIRUnitType(),
        );
        return AstToSsaCtx.loweredInst(callInst);
    }

    private preparePrintArguments(
        expr: MacroExpr,
    ): Result<ValueId[], LoweringError> {
        const templateResult = this.parseFormatTemplate(expr);
        if (!templateResult.isOk()) {
            return templateResult;
        }
        const template = templateResult.value;
        const formatLiteralId = internIRStringLiteral(
            this.irModule,
            template.literal,
        );
        const args: ValueId[] = [this.builder.sconst(formatLiteralId).id];
        for (const valueExpr of expr.args.slice(1)) {
            const lowered = this.lowerExpression(valueExpr);
            if (!lowered.isOk()) {
                return lowered;
            }
            const formatTag = this.resolveExpressionFormatTag(
                valueExpr,
                lowered.value.id,
            );
            if (formatTag === undefined) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    `unsupported value in \`${expr.name}!\` formatting`,
                    valueExpr.span,
                );
            }
            args.push(this.builder.iconst(formatTag, IntWidth.I64).id);
            args.push(lowered.value.id);
        }
        return Result.ok(args);
    }

    private parseFormatTemplate(
        expr: MacroExpr,
    ): Result<FormatTemplate, LoweringError> {
        if (expr.args.length === 0) {
            return Result.ok({
                literal: EMPTY_FORMAT,
                placeholderCount: 0,
            });
        }
        const [formatExpr, ...valueArgs] = expr.args;
        if (
            !(formatExpr instanceof LiteralExpr) ||
            formatExpr.literalKind !== LiteralKind.String
        ) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `\`${expr.name}!\` requires a string literal format argument`,
                formatExpr.span,
            );
        }
        const literal = String(formatExpr.value);
        const parsed = AstToSsaCtx.countFormatPlaceholders(literal);
        if (!parsed.isOk()) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                parsed.error,
                formatExpr.span,
            );
        }
        if (parsed.value !== valueArgs.length) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `\`${expr.name}!\` expected ${parsed.value} format argument(s) but got ${valueArgs.length}`,
                expr.span,
            );
        }
        return Result.ok({
            literal,
            placeholderCount: parsed.value,
        });
    }

    private resolveExpressionFormatTag(
        expr: Expression,
        valueId: ValueId,
    ): FormatTag | undefined {
        const fromExpr = this.inferExpressionFormatTag(expr);
        if (fromExpr !== undefined) {
            return fromExpr;
        }
        return this.inferFormatTagFromValueType(valueId);
    }

    private inferExpressionFormatTag(expr: Expression): FormatTag | undefined {
        if (expr instanceof LiteralExpr) {
            return AstToSsaCtx.formatTagForLiteral(expr.literalKind);
        }
        if (expr instanceof IdentifierExpr) {
            const local = this.locals.get(expr.name);
            return local?.formatTag;
        }
        return undefined;
    }

    private inferFormatTagFromValueType(
        valueId: ValueId,
    ): FormatTag | undefined {
        const valueType = this.lookupValueType(valueId);
        if (!valueType) {
            return undefined;
        }
        if (valueType.kind === IRTypeKind.Bool) {
            return FormatTag.Bool;
        }
        if (valueType instanceof FloatType) {
            return FormatTag.Float;
        }
        if (valueType instanceof IntType) {
            return FormatTag.Int;
        }
        if (valueType instanceof PtrType) {
            return FormatTag.String;
        }
        return undefined;
    }

    private lowerStructLiteral(
        expr: StructExpr,
    ): Result<LoweredValue, LoweringError> {
        if (!(expr.path instanceof IdentifierExpr)) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Unsupported struct constructor path",
                expr.span,
            );
        }

        const structName = expr.path.name;
        const fieldOrder = this.structFieldNames.get(structName) ?? [
            ...expr.fields.keys(),
        ];
        if (fieldOrder.length === 0) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `Struct literal \`${structName}\` has no fields`,
                expr.span,
            );
        }

        const fieldValues: ValueId[] = [];
        const fieldTypes: IRType[] = [];
        for (const fieldName of fieldOrder) {
            const fieldExpr = expr.fields.get(fieldName);
            if (!fieldExpr) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    `Missing field \`${fieldName}\` in struct literal \`${structName}\``,
                    expr.span,
                );
            }
            const lowered = this.lowerExpression(fieldExpr);
            if (!lowered.isOk()) {
                return lowered;
            }
            const fieldType = lowered.value.ty;
            fieldValues.push(lowered.value.id);
            fieldTypes.push(fieldType);
        }

        const existingType = this.irModule.structs.get(structName);
        const structType =
            existingType ?? makeIRStructType(structName, fieldTypes);
        if (!existingType) {
            this.irModule.structs.set(structName, structType);
            this.structFieldNames.set(structName, [...fieldOrder]);
        }

        const structCreate = this.builder.structCreate(fieldValues, structType);
        return AstToSsaCtx.loweredInst(structCreate);
    }

    private lowerFieldAccess(expr: FieldExpr): Result<LoweredValue, LoweringError> {
        const base = this.lowerExpression(expr.receiver);
        if (!base.isOk()) {
            return base;
        }

        let baseValue = base.value.id;
        let baseType = base.value.ty;
        if (baseType instanceof PtrType) {
            const { inner } = baseType;
            if (inner instanceof StructType) {
                const deref = this.builder.load(baseValue, inner);
                baseValue = deref.id;
                baseType =
                    this.irModule.structs.get(inner.name) ?? inner;
            }
        }
        // Resolve the full struct type from the module registry when the type
        // has empty field lists (e.g. from translated TypeNodes).
        if (baseType instanceof StructType) {
            baseType = this.irModule.structs.get(baseType.name) ?? baseType;
        }
        if (!(baseType instanceof StructType)) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Field access requires a struct value",
                expr.span,
            );
        }

        const structType = baseType;
        const fieldNames = this.structFieldNames.get(structType.name);
        if (!fieldNames) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `No field metadata found for struct \`${structType.name}\``,
                expr.span,
            );
        }
        const index = fieldNames.indexOf(expr.field);
        if (index === -1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `Unknown field \`${expr.field}\` on struct \`${structType.name}\``,
                expr.span,
            );
        }
        if (index >= structType.fields.length) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                `Missing field type metadata for \`${expr.field}\` on struct \`${structType.name}\``,
                expr.span,
            );
        }
        const fieldType = structType.fields[index];
        const fieldGet = this.builder.structGet(baseValue, index, structType, fieldType);
        return AstToSsaCtx.loweredInst(fieldGet);
    }

    private lowerClosure(expr: ClosureExpr): Result<LoweredValue, LoweringError> {
        return lowerClosureExpr(expr, this.builder, this.closureCtx());
    }

    private closureCtx(): LoweringClosureCtx {
        return {
            locals: this.locals,
            functionIds: this.functionIds,
            functionReturnTypes: this.functionReturnTypes,
            irModule: this.irModule,
            registerSyntheticFunctionId: (name) =>
                this.registerSyntheticFunctionId(name),
            lowerClosureFunction: (name, expr) => {
                const closureCtx = new AstToSsaCtx({
                    irModule: this.irModule,
                    functionReturnTypes: this.functionReturnTypes,
                    structFieldNames: this.structFieldNames,
                    enumVariantTags: this.enumVariantTags,
                    enumVariantOwners: this.enumVariantOwners,
                    namedConsts: this.namedConsts,
                    monoRegistry: this.monoRegistry,
                });
                closureCtx.seedFunctionIds(this.functionIds);
                return lowerClosureFunction(name, expr, closureCtx.builder, {
                    translateTypeNode: (typeNode) =>
                        AstToSsaCtx.translateTypeNode(typeNode),
                    setCurrentReturnType: (ty) => {
                        closureCtx.currentReturnType = ty;
                    },
                    startFunction: (functionName, paramTypes, span) =>
                        closureCtx.startFunction(functionName, paramTypes, span),
                    bindLocalValue: (localName, value, ty, options) =>
                        closureCtx.bindLocalValue(localName, value, ty, options),
                    lowerExpression: (expression) =>
                        closureCtx.lowerExpression(expression),
                    isCurrentBlockTerminated: () =>
                        closureCtx.isCurrentBlockTerminated(),
                    currentTypeKind: () => closureCtx.currentTypeKind(),
                    sealAllBlocks: () => closureCtx.sealAllBlocks(),
                });
            },
        };
    }

    private lowerMatchExpr(expr: MatchExpr): Result<LoweredValue, LoweringError> {
        return lowerMatchExpr(expr, this.builder, this.controlFlowCtx());
    }

    private buildMatchCases(
        arms: MatchArmNode[],
        armBlocks: BlockId[],
    ): {
        cases: { value: number; target: BlockId; args: ValueId[] }[];
        defaultArmIndex: number | undefined;
        usesEnumPatterns: boolean;
    } {
        return buildMatchCases(arms, armBlocks, this.controlFlowCtx());
    }

    private resolveLiteralPatternValue(pattern: LiteralPattern): number {
        return resolveLiteralPatternValue(pattern);
    }

    private resolveStructPatternTag(pat: StructPattern): number | undefined {
        return resolveStructPatternTag(pat, this.controlFlowCtx());
    }

    private lowerMatchArms(
        arms: MatchArmNode[],
        armBlocks: BlockId[],
        scrutinee?: ValueId,
    ): Result<LoweredValue, LoweringError> {
        return lowerMatchArms(
            arms,
            armBlocks,
            this.builder,
            this.controlFlowCtx(),
            scrutinee,
        );
    }

    private lowerIf(expr: IfExpr): Result<LoweredValue, LoweringError> {
        return lowerIf(expr, this.builder, this.controlFlowCtx());
    }

    private terminateIfBranches(
        thenId: BlockId | undefined,
        thenValue: ValueId | undefined,
        elseId: BlockId | undefined,
        elseValue: ValueId | undefined,
    ): Result<LoweredValue, LoweringError> {
        return terminateIfBranches(
            thenId,
            thenValue,
            elseId,
            elseValue,
            this.builder,
            this.controlFlowCtx(),
        );
    }

    private lowerReturn(expr: ReturnExpr): Result<LoweredValue, LoweringError> {
        return lowerReturnExpr(expr, this.builder, this.controlFlowCtx());
    }

    private lowerBreak(expr: BreakExpr): Result<LoweredValue, LoweringError> {
        return lowerBreakExpr(expr, this.builder, this.controlFlowCtx());
    }

    private lowerContinue(expr: ContinueExpr): Result<LoweredValue, LoweringError> {
        return lowerContinueExpr(expr, this.builder, this.controlFlowCtx());
    }

    private controlFlowCtx(): LoweringCfgCtx {
        return {
            loopStack: this.loopStack,
            currentReturnType: this.currentReturnType,
            locals: this.locals,
            enumVariantTags: this.enumVariantTags,
            enumVariantOwners: this.enumVariantOwners,
            structFieldNames: this.structFieldNames,
            irModule: this.irModule,
            lowerExpression: (expr) => this.lowerExpression(expr),
            lowerExpressionWithExpected: (expr, expectedTy) =>
                this.lowerExpressionWithExpected(expr, expectedTy),
            lowerBlock: (block) => this.lowerBlock(block),
            loweredUnit: () => this.loweredUnit(),
            loweredValue: (id, ty) => this.loweredValue(id, ty),
            unitValue: () => this.unitValue(),
            bindLocalValue: (name, value, ty, options) =>
                this.bindLocalValue(name, value, ty, options),
            cloneLocals: () => this.cloneLocals(),
            restoreLocals: (snapshot) => this.restoreLocals(snapshot),
            lookupValueType: (valueId) => this.lookupValueType(valueId),
            registerEnumTypeMetadata: (ty) =>
                this.registerEnumTypeMetadata(ty),
        };
    }

    private lowerLoop(expr: LoopExpr): Result<LoweredValue, LoweringError> {
        return lowerLoop(expr, this.builder, this.controlFlowCtx());
    }

    private lowerWhile(expr: WhileExpr): Result<LoweredValue, LoweringError> {
        return lowerWhile(expr, this.builder, this.controlFlowCtx());
    }

    private static translateArrayTypeNode(typeNode: ArrayTypeNode): IRType {
        return translateArrayTypeNode(typeNode);
    }

    private static translateTupleTypeNode(typeNode: TupleTypeNode): IRType {
        return translateTupleTypeNode(typeNode);
    }

    static translateTypeNode(typeNode: TypeNode): IRType {
        return translateTypeNode(typeNode);
    }

    private static irTypeName(ty: IRType): string {
        return irTypeName(ty);
    }

    private static tupleStructName(elementTypes: IRType[]): string {
        return tupleStructName(elementTypes);
    }

    static namedBuiltin(name: string): ReturnType<typeof namedBuiltin> {
        return namedBuiltin(name);
    }

    static builtinToIrType(
        ty: Parameters<typeof builtinToIrType>[0],
    ): IRType {
        return builtinToIrType(ty);
    }

    private static formatTagFromTypeNode(
        typeNode: TypeNode,
    ): FormatTag | undefined {
        if (
            typeNode instanceof RefTypeNode ||
            typeNode instanceof PtrTypeNode
        ) {
            return AstToSsaCtx.formatTagFromTypeNode(typeNode.inner);
        }
        if (!(typeNode instanceof NamedTypeNode)) {
            return undefined;
        }
        const typeName = typeNode.name.toLowerCase();
        if (AstToSsaCtx.isIntegerFormatType(typeName)) {
            return FormatTag.Int;
        }
        switch (typeName) {
            case "str": {
                return FormatTag.String;
            }
            case "char": {
                return FormatTag.Char;
            }
            case "bool": {
                return FormatTag.Bool;
            }
            case "f32":
            case "f64": {
                return FormatTag.Float;
            }
            default: {
                return undefined;
            }
        }
    }

    private static isIntegerFormatType(typeName: string): boolean {
        switch (typeName) {
            case "i8":
            case "i16":
            case "i32":
            case "i64":
            case "i128":
            case "isize":
            case "u8":
            case "u16":
            case "u32":
            case "u64":
            case "u128":
            case "usize": {
                return true;
            }
            default: {
                return false;
            }
        }
    }

    private static formatTagForLiteral(
        literalKind: LiteralKind,
    ): FormatTag | undefined {
        switch (literalKind) {
            case LiteralKind.String: {
                return FormatTag.String;
            }
            case LiteralKind.Char: {
                return FormatTag.Char;
            }
            case LiteralKind.Bool: {
                return FormatTag.Bool;
            }
            case LiteralKind.Float: {
                return FormatTag.Float;
            }
            case LiteralKind.Int: {
                return FormatTag.Int;
            }
            default: {
                return undefined;
            }
        }
    }

    private static countFormatPlaceholders(
        literal: string,
    ): Result<number, string> {
        let count = 0;
        for (let index = 0; index < literal.length; index++) {
            const byte = literal[index];
            if (byte === "{") {
                const nextByte = literal[index + 1];
                if (nextByte === "{") {
                    index += 1;
                    continue;
                }
                if (nextByte === "}") {
                    count += 1;
                    index += 1;
                    continue;
                }
                return Result.err("unsupported format token after `{`");
            }
            if (byte === "}") {
                const nextByte = literal[index + 1];
                if (nextByte === "}") {
                    index += 1;
                    continue;
                }
                return Result.err("unmatched `}` in format string");
            }
        }
        return Result.ok(count);
    }

    private defaultValueForType(ty: IRType): ValueId {
        if (ty.kind === IRTypeKind.Bool) {
            const constInst = this.builder.bconst(false);
            return constInst.id;
        }
        if (ty instanceof IntType) {
            const constInst = this.builder.iconst(DEFAULT_INT_VALUE, ty.width);
            return constInst.id;
        }
        if (ty instanceof FloatType) {
            const constInst = this.builder.fconst(
                DEFAULT_FLOAT_VALUE,
                ty.width,
            );
            return constInst.id;
        }
        if (ty.kind === IRTypeKind.Ptr) {
            const nullInst = this.builder.null(ty);
            return nullInst.id;
        }
        return this.unitValue();
    }

    private unitValue(): ValueId {
        const constInst = this.builder.iconst(DEFAULT_UNIT_VALUE, IntWidth.I8);
        return constInst.id;
    }

    private registerSyntheticFunctionId(name: string): number {
        const value = hashNameInternal(name);
        this.functionIds.set(name, value);
        return value;
    }

    private requireFunctionId(
        name: string,
        span: Span,
    ): Result<number, LoweringError> {
        const existing = this.functionIds.get(name);
        if (existing !== undefined) {
            return Result.ok(existing);
        }
        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            `Unknown function \`${name}\``,
            span,
        );
    }

    private isCurrentBlockTerminated(): boolean {
        return isBlockTerminated(this.builder);
    }

    private lowerMatchArmBodies(
        arms: MatchArmNode[],
        armBlocks: BlockId[],
        scrutinee?: ValueId,
    ): Result<
        {
            armExitBlocks: (BlockId | undefined)[];
            armValues: (ValueId | undefined)[];
        },
        LoweringError
    > {
        return lowerMatchArmBodies(
            arms,
            armBlocks,
            this.builder,
            this.controlFlowCtx(),
            scrutinee,
        );
    }

    private bindMatchArmPattern(
        arm: MatchArmNode,
        scrutinee: ValueId,
    ): Result<void, LoweringError> {
        return bindMatchArmPattern(
            arm,
            scrutinee,
            this.builder,
            this.controlFlowCtx(),
        );
    }

    private bindStructPatternPayload(
        pat: StructPattern,
        scrutinee: ValueId,
    ): Result<void, LoweringError> {
        return bindStructPatternPayload(
            pat,
            scrutinee,
            this.builder,
            this.controlFlowCtx(),
        );
    }

    private resolveMergeResultType(
        values: (ValueId | undefined)[],
    ): IRType | undefined {
        return resolveMergeResultType(values, (valueId) =>
            this.lookupValueType(valueId),
        );
    }

    private connectMergePredecessors(
        exitBlockIds: (BlockId | undefined)[],
        values: (ValueId | undefined)[],
        mergeId: BlockId,
        resultType: IRType | undefined,
    ): void {
        connectMergePredecessors(
            exitBlockIds,
            values,
            mergeId,
            resultType,
            this.builder,
        );
    }

    private mergeBlockResultValue(mergeId: BlockId): ValueId | undefined {
        return mergeBlockResultValue(mergeId, this.builder);
    }

    private isImplicitUnitTypeNode(typeNode: TypeNode): boolean {
        return (
            typeNode instanceof InferredTypeNode ||
            (typeNode instanceof NamedTypeNode &&
                typeNode.name.toLowerCase() === "unit")
        );
    }

    private lookupValueType(valueId: ValueId): IRType | undefined {
        return lookupValueType(valueId, this.builder);
    }

    private sealAllBlocks(): void {
        sealAllBlocks(this.builder);
    }

    private isFloatish(expr: Expression): boolean {
        if (expr instanceof LiteralExpr) {
            return expr.literalKind === LiteralKind.Float;
        }
        if (expr instanceof UnaryExpr) {
            return this.isFloatish(expr.operand);
        }
        if (expr instanceof BinaryExpr) {
            return this.isFloatish(expr.left) || this.isFloatish(expr.right);
        }
        return false;
    }

    private currentTypeKind(): IRTypeKind {
        return currentTypeKind(this.controlFlowCtx());
    }

}

function ensureMatchingBuilder(
    builder: IRBuilder,
    ctx: LoweringExprCtx,
    span: Span,
): Result<void, LoweringError> {
    if (ctx instanceof AstToSsaCtx && ctx.builder !== builder) {
        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            "lowering context was called with a different IRBuilder",
            span,
        );
    }
    return Result.ok(undefined);
}

export function lowerExpression(
    expr: Expression,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
): Result<LoweredValue, LoweringError> {
    const builderResult = ensureMatchingBuilder(builder, ctx, expr.span);
    if (builderResult.isErr()) {
        return builderResult;
    }
    return ctx.lowerExpression(expr);
}

export function lowerExpressionWithExpected(
    expr: Expression,
    expectedTy: IRType,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
): Result<LoweredValue, LoweringError> {
    const builderResult = ensureMatchingBuilder(builder, ctx, expr.span);
    if (builderResult.isErr()) {
        return builderResult;
    }
    return ctx.lowerExpressionWithExpected(expr, expectedTy);
}

export function lowerBlock(
    block: BlockExpr,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
): Result<LoweredValue | undefined, LoweringError> {
    const builderResult = ensureMatchingBuilder(builder, ctx, block.span);
    if (builderResult.isErr()) {
        return builderResult;
    }
    return ctx.lowerBlock(block);
}

export function lowerStatement(
    stmt: Statement,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
): Result<void, LoweringError> {
    const builderResult = ensureMatchingBuilder(builder, ctx, stmt.span);
    if (builderResult.isErr()) {
        return builderResult;
    }
    return ctx.lowerStatement(stmt);
}

export function inferCallSiteTypeArgs(
    generic: GenericFnItem,
    call: CallExpr,
): SubstitutionMap | undefined {
    if (call.genericArgs !== undefined && call.genericArgs.length > 0) {
        return inferTypeArgs(generic, [], call.genericArgs);
    }

    const argTypes: (TypeNode | undefined)[] = call.args.map((arg) =>
        inferLiteralType(arg),
    );
    return inferTypeArgs(generic, argTypes);
}

export function inferLiteralType(expr: Expression): TypeNode | undefined {
    if (expr instanceof LiteralExpr) {
        switch (expr.literalKind) {
            case LiteralKind.Int: {
                return new NamedTypeNode(expr.span, "i32");
            }
            case LiteralKind.Float: {
                return new NamedTypeNode(expr.span, "f64");
            }
            case LiteralKind.Bool: {
                return new NamedTypeNode(expr.span, "bool");
            }
            case LiteralKind.String: {
                return new RefTypeNode(
                    expr.span,
                    Mutability.Immutable,
                    new NamedTypeNode(expr.span, "str"),
                );
            }
            case LiteralKind.Char: {
                return new NamedTypeNode(expr.span, "char");
            }
            default: {
                return undefined;
            }
        }
    }
    if (expr instanceof BinaryExpr) {
        return inferLiteralType(expr.left) ?? inferLiteralType(expr.right);
    }
    if (expr instanceof UnaryExpr) {
        return inferLiteralType(expr.operand);
    }
    return undefined;
}
