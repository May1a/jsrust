import {
    type AssignExpr,
    BinaryExpr,
    BinaryOp,
    BlockExpr,
    type BreakExpr,
    BuiltinType,
    CallExpr,
    type CastExpr,
    ConstItem,
    type ClosureExpr,
    type ContinueExpr,
    type DerefExpr,
    EnumItem,
    ExprStmt,
    type Expression,
    FieldExpr,
    FnItem,
    type ForExpr,
    FnTypeNode,
    GenericFnItem,
    GenericArgsNode,
    GenericStructItem,
    ImplItem,
    IdentPattern,
    IdentifierExpr,
    type IfLetExpr,
    LiteralPattern,
    InferredTypeNode,
    type IndexExpr,
    type IfExpr,
    ItemStmt,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    type LoopExpr,
    type MacroExpr,
    type MatchArmNode,
    type MatchExpr,
    ModItem,
    type ModuleNode,
    NamedTypeNode,
    OptionTypeNode,
    type RecoveryExpr,
    type RecoveryItem,
    ResultTypeNode,
    type ParamNode,
    type PathExpr,
    PtrTypeNode,
    type RangeExpr,
    type RefExpr,
    RefTypeNode,
    type ReturnExpr,
    Span,
    type StaticItem,
    type Statement,
    StructItem,
    type StructExpr,
    StructPattern,
    TraitImplItem,
    type TryExpr,
    type TypeNode,
    type TypeAliasItem,
    TupleTypeNode,
    ArrayTypeNode,
    type UnsafeBlockExpr,
    type UnsafeItem,
    UseItem,
    UnaryExpr,
    UnaryOp,
    type WhileExpr,
    type AstVisitor,
    Mutability,
    walkAst,
    ReceiverKind,
} from "../parse/ast";
import {
    MonomorphizationRegistry,
    inferTypeArgs,
    mangledName,
    type SubstitutionMap,
} from "./monomorphize";
import { Result } from "better-result";
import { BUILTIN_SYMBOLS } from "../utils/builtin_symbols";
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
    addIREnum,
    addIRFunction,
    EnumType,
    FcmpOp,
    FloatWidth,
    IcmpOp,
    IntWidth,
    internIRStringLiteral,
    IRTypeKind,
    makeIRBoolType,
    makeIREnumType,
    makeIRFloatType,
    makeIRIntType,
    makeIRModule,
    makeIRPtrType,
    makeIRStructType,
    makeIRUnitType,
    isIRUnitType,
    ArrayType,
    makeIRArrayType,
    type BlockId,
    FloatType,
    getIREnumTypeKey,
    type IRBlock,
    type IRFunction,
    type IRModule,
    type IRType,
    IntType,
    PtrType,
    StructType,
    type ValueId,
    type BoolType,
} from "../ir/ir";
import { IRBuilder } from "../ir/ir_builder";

export enum LoweringErrorKind {
    UnsupportedNode,
    UnknownVariable,
    InvalidAssignmentTarget,
    BreakOutsideLoop,
    ContinueOutsideLoop,
}

export interface LoweringError {
    kind: LoweringErrorKind;
    message: string;
    span: Span;
}

interface LocalBinding {
    ptr: ValueId;
    ty: IRType;
    formatTag?: FormatTag;
    typeNode?: TypeNode;
}

interface LoopFrame {
    breakBlock: BlockId;
    continueBlock: BlockId;
}

interface LoweringConstBinding {
    key: string;
    typeNode: TypeNode;
    value: Expression;
    span: Span;
    selfTypeName?: string;
}

interface BuilderSnapshot {
    fn: IRFunction | undefined;
    block: IRBlock | undefined;
    sealed: Set<BlockId>;
    varDefs: Map<string, Map<BlockId, ValueId>>;
    incompletePhis: Map<string, Map<BlockId, ValueId[]>>;
    varTypes: Map<string, IRType>;
    nextBlockId: number;
    locals: Map<string, LocalBinding>;
    constScopes: Map<string, LoweringConstBinding>[];
    constResolutionStack: LoweringConstBinding[];
    loopStack: LoopFrame[];
    returnType: IRType;
    expectedValueTypes: IRType[];
}

function loweringError<T>(
    kind: LoweringErrorKind,
    message: string,
    span: Span,
): Result<T, LoweringError> {
    return Result.err({ kind, message, span });
}

// Default values for type initialization
const DEFAULT_INT_VALUE = 0;
const DEFAULT_FLOAT_VALUE = 0;
const DEFAULT_UNIT_VALUE = 0;
const STRING_FIRST_CHAR_INDEX = 0;
const DEFAULT_CHAR_CODE = 0;
const HASH_FACTOR = 31;
const HASH_MODULUS = 1_000_000;
const EMPTY_FORMAT = "";

function qualifyModuleName(modulePrefix: string, name: string): string {
    if (modulePrefix === "") {
        return name;
    }
    return `${modulePrefix}::${name}`;
}

// Loop frame access
const LAST_FRAME_INDEX = -1;

enum FormatTag {
    String = 0,
    Int = 1,
    Float = 2,
    Bool = 3,
    Char = 4,
}

interface FormatTemplate {
    literal: string;
    placeholderCount: number;
}

function hashName(name: string): number {
    // Keep in sync with backend/src/bytes.c: ByteSpan_hashFunctionId
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (Math.imul(hash, HASH_FACTOR) + name.charCodeAt(i)) | 0;
        hash |= 0;
    }
    if (hash < 0) {
        hash = -hash;
    }
    return hash % HASH_MODULUS;
}

function zeroSpan(): Span {
    return new Span(0, 0, 0, 0);
}

export class AstToSsaCtx {
    readonly builder: IRBuilder;
    readonly irModule: IRModule;
    private readonly locals: Map<string, LocalBinding>;
    private readonly functionIds: Map<string, number>;
    private readonly functionReturnTypes: Map<string, IRType>;
    private readonly structFieldNames: Map<string, string[]>;
    private readonly enumVariantTags: Map<string, number>;
    private readonly enumVariantOwners: Map<string, string>;
    private readonly namedConsts: Map<string, LoweringConstBinding>;
    private readonly initialConsts: Map<string, LoweringConstBinding>;
    private readonly monoRegistry?: MonomorphizationRegistry;
    private constScopes: Map<string, LoweringConstBinding>[];
    private constResolutionStack: LoweringConstBinding[];
    private loopStack: LoopFrame[];
    private currentReturnType: IRType;
    private expectedValueTypes: IRType[];

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
                this.builder.ret(bodyResult.value);
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

    private lowerBlock(
        block: BlockExpr,
    ): Result<ValueId | undefined, LoweringError> {
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
        if (value === undefined || this.isCurrentBlockTerminated()) {
            return undefined;
        }
        return value;
    }

    private currentBlockId(): BlockId | undefined {
        return this.builder.currentBlock?.id;
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
        if (value === undefined || !resultType) {
            return [];
        }
        return [value];
    }

    private createMergeBlock(
        name: string,
        resultType: IRType | undefined,
    ): BlockId {
        if (!resultType) {
            return this.builder.createBlock(name);
        }
        return this.builder.createBlock(name, [resultType]);
    }

    private lowerStatement(stmt: Statement): Result<void, LoweringError> {
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
        const ty = AstToSsaCtx.translateTypeNode(item.typeNode);
        this.registerEnumTypeMetadata(ty);
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
                const inferred = this.resolveValueType(initResult.value);
                if (inferred) {
                    ty = inferred;
                }
            }
            this.bindLocalValue(stmt.pattern.name, initResult.value, ty, {
                formatTag: this.inferExpressionFormatTag(stmt.init),
            });
        }
        return Result.ok();
    }

    private lowerExpression(expr: Expression): Result<ValueId, LoweringError> {
        // Use visitor pattern to dispatch to appropriate handler
        const visitor = this.getExpressionVisitor();
        return expr.accept(visitor, this);
    }

    private lowerExpressionWithExpected(
        expr: Expression,
        expectedTy: IRType,
    ): Result<ValueId, LoweringError> {
        this.expectedValueTypes.push(expectedTy);
        const lowered = this.lowerExpression(expr);
        this.expectedValueTypes.pop();
        return lowered;
    }

    private getExpressionVisitor(): AstVisitor<
        Result<ValueId, LoweringError>,
        AstToSsaCtx
    > {
        const unsupported = (name: string): Result<ValueId, LoweringError> =>
            loweringError(
                LoweringErrorKind.UnsupportedNode,
                `Unexpected AST node in expression visitor: ${name}`,
                zeroSpan(),
            );
        const expressionVisitors: ExpressionVisitor<
            Result<ValueId, LoweringError>
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
                    return Result.ok(this.unitValue());
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
            visitConstItem: () => unsupported("ConstItem"),
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

    private lowerLiteral(expr: LiteralExpr): Result<ValueId, LoweringError> {
        switch (expr.literalKind) {
            case LiteralKind.Int: {
                let value: number;
                if (typeof expr.value === "number") {
                    ({ value } = expr);
                } else {
                    value = Number(expr.value);
                }
                const constInst = this.builder.iconst(value, IntWidth.I32);
                return AstToSsaCtx.handleInstructionId(constInst.id);
            }
            case LiteralKind.Float: {
                let value: number;
                if (typeof expr.value === "number") {
                    ({ value } = expr);
                } else {
                    value = Number(expr.value);
                }
                const constInst = this.builder.fconst(value, FloatWidth.F64);
                return AstToSsaCtx.handleInstructionId(constInst.id);
            }
            case LiteralKind.Bool: {
                const constInst = this.builder.bconst(Boolean(expr.value));
                return AstToSsaCtx.handleInstructionId(constInst.id);
            }
            case LiteralKind.String: {
                const literalId = internIRStringLiteral(
                    this.irModule,
                    String(expr.value),
                );
                const constInst = this.builder.sconst(literalId);
                return AstToSsaCtx.handleInstructionId(constInst.id);
            }
            case LiteralKind.Char: {
                let cp = Number(expr.value);
                if (typeof expr.value === "string") {
                    cp =
                        expr.value.codePointAt(STRING_FIRST_CHAR_INDEX) ??
                        DEFAULT_CHAR_CODE;
                }
                const constInst = this.builder.iconst(cp, IntWidth.U32);
                return AstToSsaCtx.handleInstructionId(constInst.id);
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
    ): Result<ValueId, LoweringError> {
        const binding = this.locals.get(expr.name);
        if (binding) {
            const loadInst = this.builder.load(binding.ptr, binding.ty);
            return AstToSsaCtx.handleInstructionId(loadInst.id);
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
            return AstToSsaCtx.handleInstructionId(inst.id);
        }

        const fnId = this.requireFunctionId(expr.name, expr.span);
        if (fnId.isErr()) {
            return fnId;
        }
        const constInst = this.builder.iconst(fnId.value, IntWidth.I64);
        return AstToSsaCtx.handleInstructionId(constInst.id);
    }

    private lowerConstBinding(
        binding: LoweringConstBinding,
    ): Result<ValueId, LoweringError> {
        if (this.constResolutionStack.some((entry) => entry.key === binding.key)) {
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

    visitPathExpr(expr: PathExpr): Result<ValueId, LoweringError> {
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

    private lowerAssign(expr: AssignExpr): Result<ValueId, LoweringError> {
        if (!(expr.target instanceof IdentifierExpr)) {
            return loweringError(
                LoweringErrorKind.InvalidAssignmentTarget,
                "Only identifier assignment targets are supported",
                expr.target.span,
            );
        }

        const binding = this.locals.get(expr.target.name);
        if (!binding) {
            return loweringError(
                LoweringErrorKind.UnknownVariable,
                `Unknown variable '${expr.target.name}'`,
                expr.target.span,
            );
        }

        const valueResult = this.lowerExpressionWithExpected(
            expr.value,
            binding.ty,
        );
        if (!valueResult.isOk()) {
            return valueResult;
        }
        this.builder.store(binding.ptr, valueResult.value, binding.ty);
        return Result.ok(valueResult.value);
    }

    private lowerBinary(expr: BinaryExpr): Result<ValueId, LoweringError> {
        const leftResult = this.lowerExpression(expr.left);
        if (!leftResult.isOk()) {
            return leftResult;
        }
        const rightResult = this.lowerExpression(expr.right);
        if (!rightResult.isOk()) {
            return rightResult;
        }

        const left = this.autoDerefForBinaryOp(leftResult.value);
        const right = this.autoDerefForBinaryOp(rightResult.value);
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
        const ty = this.resolveValueType(value);
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
    ): Result<ValueId, LoweringError> {
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

    private handleArithmeticOperation(
        op: BinaryOp,
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        switch (op) {
            case BinaryOp.Add: {
                return this.handleAddOperation(left, right, isFloat);
            }
            case BinaryOp.Sub: {
                return this.handleSubOperation(left, right, isFloat);
            }
            case BinaryOp.Mul: {
                return this.handleMulOperation(left, right, isFloat);
            }
            case BinaryOp.Div: {
                return this.handleDivOperation(left, right, isFloat);
            }
            case BinaryOp.Rem: {
                return this.handleRemOperation(left, right);
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
    ): Result<ValueId, LoweringError> {
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
    ): Result<ValueId, LoweringError> {
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
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const addInst = this.builder.fadd(left, right, FloatWidth.F64);
            return Result.ok(addInst.id);
        }
        const addInst = this.builder.iadd(left, right, IntWidth.I32);
        return Result.ok(addInst.id);
    }

    private handleSubOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const subInst = this.builder.fsub(left, right, FloatWidth.F64);
            return Result.ok(subInst.id);
        }
        const subInst = this.builder.isub(left, right, IntWidth.I32);
        return Result.ok(subInst.id);
    }

    private handleMulOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const mulInst = this.builder.fmul(left, right, FloatWidth.F64);
            return Result.ok(mulInst.id);
        }
        const mulInst = this.builder.imul(left, right, IntWidth.I32);
        return Result.ok(mulInst.id);
    }

    private handleDivOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const divInst = this.builder.fdiv(left, right, FloatWidth.F64);
            return Result.ok(divInst.id);
        }
        const divInst = this.builder.idiv(left, right, IntWidth.I32);
        return Result.ok(divInst.id);
    }

    private handleRemOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const remInst = this.builder.imod(left, right, IntWidth.I32);
        return Result.ok(remInst.id);
    }

    // Comparison operation handlers
    private handleEqOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Oeq, left, right);
            return Result.ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Eq, left, right);
        return Result.ok(cmpInst.id);
    }

    private handleNeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.One, left, right);
            return Result.ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Ne, left, right);
        return Result.ok(cmpInst.id);
    }

    private handleLtOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Olt, left, right);
            return Result.ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Slt, left, right);
        return Result.ok(cmpInst.id);
    }

    private handleLeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Ole, left, right);
            return Result.ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sle, left, right);
        return Result.ok(cmpInst.id);
    }

    private handleGtOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Ogt, left, right);
            return Result.ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sgt, left, right);
        return Result.ok(cmpInst.id);
    }

    private handleGeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Oge, left, right);
            return Result.ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sge, left, right);
        return Result.ok(cmpInst.id);
    }

    // Bitwise operation handlers
    private handleAndOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const andInst = this.builder.iand(left, right, IntWidth.I8);
        return Result.ok(andInst.id);
    }

    private handleOrOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const orInst = this.builder.ior(left, right, IntWidth.I8);
        return Result.ok(orInst.id);
    }

    private handleXorOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const xorInst = this.builder.ixor(left, right, IntWidth.I32);
        return Result.ok(xorInst.id);
    }

    private handleShlOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const shlInst = this.builder.ishl(left, right, IntWidth.I32);
        return Result.ok(shlInst.id);
    }

    private handleShrOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const shrInst = this.builder.ishr(left, right, IntWidth.I32);
        return Result.ok(shrInst.id);
    }

    private lowerUnary(expr: UnaryExpr): Result<ValueId, LoweringError> {
        const operandResult = this.lowerExpression(expr.operand);
        if (!operandResult.isOk()) return operandResult;
        const operand = operandResult.value;

        switch (expr.op) {
            case UnaryOp.Neg: {
                if (this.isFloatish(expr.operand)) {
                    const negInst = this.builder.fneg(operand, FloatWidth.F64);
                    return Result.ok(negInst.id);
                }
                const negInst = this.builder.ineg(operand, IntWidth.I32);
                return Result.ok(negInst.id);
            }
            case UnaryOp.Not: {
                const oneInst = this.builder.bconst(true);
                const xorInst = this.builder.ixor(
                    operand,
                    oneInst.id,
                    IntWidth.I8,
                );
                return Result.ok(xorInst.id);
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
                    return Result.ok(binding.ptr);
                }

                const ptrTy = makeIRIntType(IntWidth.I64);
                const allocaInst = this.builder.alloca(ptrTy);
                const ptrId = allocaInst.id;
                this.builder.store(ptrId, operand, ptrTy);
                return Result.ok(ptrId);
            }
            case UnaryOp.Deref: {
                const loadInst = this.builder.load(
                    operand,
                    makeIRIntType(IntWidth.I64),
                );
                return Result.ok(loadInst.id);
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

    private lowerCall(expr: CallExpr): Result<ValueId, LoweringError> {
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
            args.push(argResult.value);
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
            calleeResult.value,
            args,
            retTy,
        );
        return Result.ok(callDynInst.id);
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
    ): Result<ValueId, LoweringError> {
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
            args.push(argResult.value);
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
    ): Result<ValueId, LoweringError> {
        if (args.length !== 1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Some() requires exactly one argument",
                span,
            );
        }
        const resolvedDataTy = this.resolveValueType(args[0]);
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
        return AstToSsaCtx.handleInstructionId(inst.id);
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
    ): Result<ValueId, LoweringError> {
        if (args.length !== 1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Ok() requires exactly one argument",
                span,
            );
        }
        const contextualResultTy = this.resolveExpectedResultType();
        if (contextualResultTy) {
            return AstToSsaCtx.handleInstructionId(
                this.builder.enumCreate(
                    0 /* OK_TAG */,
                    args[0],
                    contextualResultTy,
                ).id,
            );
        }
        const resolvedOkTy = this.resolveValueType(args[0]);
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
        return AstToSsaCtx.handleInstructionId(
            this.builder.enumCreate(0 /* OK_TAG */, args[0], ty).id,
        );
    }

    private lowerErrConstructor(
        span: Span,
        args: ValueId[],
    ): Result<ValueId, LoweringError> {
        if (args.length !== 1) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Err() requires exactly one argument",
                span,
            );
        }
        const contextualResultTy = this.resolveExpectedResultType();
        if (contextualResultTy) {
            return AstToSsaCtx.handleInstructionId(
                this.builder.enumCreate(
                    1 /* ERR_TAG */,
                    args[0],
                    contextualResultTy,
                ).id,
            );
        }
        const resolvedErrTy = this.resolveValueType(args[0]);
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
        return AstToSsaCtx.handleInstructionId(
            this.builder.enumCreate(1 /* ERR_TAG */, args[0], ty).id,
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
    ): Result<ValueId, LoweringError> {
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
        return Result.ok(callInst.id);
    }

    private lowerMethodCall(
        callee: FieldExpr,
        args: ValueId[],
    ): Result<ValueId, LoweringError> {
        const receiver = this.lowerExpression(callee.receiver);
        if (!receiver.isOk()) {
            return receiver;
        }
        const methodBuiltin = this.tryLowerBuiltinMethod(
            callee,
            receiver.value,
            args,
        );
        if (methodBuiltin) {
            return methodBuiltin;
        }

        const receiverArg = this.resolveReceiverArg(callee, receiver.value);
        const receiverType = this.resolveValueType(receiver.value);
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
        return Result.ok(callInst.id);
    }

    private lowerEnumIsTag(
        enumValue: ValueId,
        tag: number,
    ): Result<ValueId, LoweringError> {
        const tagId = this.builder.enumGetTag(enumValue).id;
        const tagConst = this.builder.iconst(tag, IntWidth.Usize).id;
        return Result.ok(this.builder.icmp(IcmpOp.Eq, tagId, tagConst).id);
    }

    private lowerEnumUnwrap(
        enumValue: ValueId,
        enumTy: EnumType,
        successTag: number,
    ): Result<ValueId, LoweringError> {
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
            return Result.ok(this.unitValue());
        }
        const [payloadTy] = variantPayloads;
        if (isIRUnitType(payloadTy)) {
            return Result.ok(this.unitValue());
        }
        return AstToSsaCtx.handleInstructionId(
            this.builder.enumGetData(
                enumValue,
                successTag,
                0,
                enumTy,
                payloadTy,
            ).id,
        );
    }

    private tryLowerBuiltinIsMethod(
        field: string,
        receiverType: IRType | undefined,
        receiverValue: ValueId,
        args: ValueId[],
        span: Span,
    ): Result<ValueId, LoweringError> | undefined {
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
    ): Result<ValueId, LoweringError> | undefined {
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
    ): Result<ValueId, LoweringError> | undefined {
        if (callee.field === "clone") {
            if (args.length > 0) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "`clone` does not take any arguments",
                    callee.span,
                );
            }
            return Result.ok(receiverValue);
        }

        const receiverType = this.resolveValueType(receiverValue);

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
    ): Result<ValueId, LoweringError> {
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
            return Result.ok(callInst.id);
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
        return Result.ok(callInst.id);
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

    private lowerMacro(expr: MacroExpr): Result<ValueId, LoweringError> {
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
            default: {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    `macro lowering not implemented for \`${expr.name}!\``,
                    expr.span,
                );
            }
        }
    }

    private lowerArrayLiteral(expr: MacroExpr): Result<ValueId, LoweringError> {
        const elementValues: ValueId[] = [];
        for (const elemExpr of expr.args) {
            const result = this.lowerExpression(elemExpr);
            if (!result.isOk()) return result;
            elementValues.push(result.value);
        }

        let elemTy = makeIRUnitType();
        if (elementValues.length > 0) {
            elemTy =
                this.resolveValueType(elementValues[0]) ?? makeIRUnitType();
        }

        const arrayType = makeIRArrayType(elemTy, expr.args.length);
        const arrPtr = this.builder.alloca(arrayType);

        for (let i = 0; i < elementValues.length; i++) {
            const idxInst = this.builder.iconst(i, IntWidth.I32);
            const elemPtr = this.builder.gep(arrPtr.id, [idxInst.id], elemTy);
            this.builder.store(elemPtr.id, elementValues[i], elemTy);
        }

        return Result.ok(arrPtr.id);
    }

    private lowerIndexExpr(expr: IndexExpr): Result<ValueId, LoweringError> {
        const receiverResult = this.lowerExpression(expr.receiver);
        if (!receiverResult.isOk()) return receiverResult;

        const receiverType = this.resolveValueType(receiverResult.value);
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
            receiverResult.value,
            [indexResult.value],
            elemTy,
        );
        const loaded = this.builder.load(elemPtr.id, elemTy);
        return AstToSsaCtx.handleInstructionId(loaded.id);
    }

    private lowerAssert(expr: MacroExpr): Result<ValueId, LoweringError> {
        if (expr.args.length === 0) {
            return Result.ok(this.unitValue());
        }
        const condResult = this.lowerExpression(expr.args[0]);
        if (!condResult.isOk()) return condResult;

        const failBlock = this.builder.createBlock("assert_fail");
        const continueBlock = this.builder.createBlock("assert_ok");
        this.builder.brIf(condResult.value, continueBlock, [], failBlock, []);

        this.builder.switchToBlock(failBlock);
        this.builder.unreachable();

        this.builder.switchToBlock(continueBlock);
        return Result.ok(this.unitValue());
    }

    private lowerAssertEq(expr: MacroExpr): Result<ValueId, LoweringError> {
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

        const leftType = this.resolveValueType(leftResult.value);
        const rightType = this.resolveValueType(rightResult.value);

        let cmpId: ValueId;
        if (leftType instanceof FloatType || rightType instanceof FloatType) {
            cmpId = this.builder.fcmp(
                FcmpOp.Oeq,
                leftResult.value,
                rightResult.value,
            ).id;
        } else if (
            leftType instanceof IntType ||
            (leftType && leftType.kind === IRTypeKind.Bool) ||
            rightType instanceof IntType ||
            (rightType && rightType.kind === IRTypeKind.Bool)
        ) {
            cmpId = this.builder.icmp(
                IcmpOp.Eq,
                leftResult.value,
                rightResult.value,
            ).id;
        } else if (leftType instanceof EnumType) {
            return this.lowerAssertEqEnum(
                leftResult.value,
                rightResult.value,
                leftType,
            );
        } else if (rightType instanceof EnumType) {
            return this.lowerAssertEqEnum(
                leftResult.value,
                rightResult.value,
                rightType,
            );
        } else {
            // Cannot statically compare values of this type; treat as no-op
            return Result.ok(this.unitValue());
        }

        const failBlock = this.builder.createBlock("assert_fail");
        const continueBlock = this.builder.createBlock("assert_ok");
        this.builder.brIf(cmpId, continueBlock, [], failBlock, []);

        this.builder.switchToBlock(failBlock);
        this.builder.unreachable();

        this.builder.switchToBlock(continueBlock);
        return Result.ok(this.unitValue());
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
    ): Result<ValueId, LoweringError> {
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
        return Result.ok(this.unitValue());
    }

    private lowerPrintMacro(
        expr: MacroExpr,
        appendNewline: boolean,
    ): Result<ValueId, LoweringError> {
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
        return AstToSsaCtx.handleInstructionId(callInst.id);
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
                lowered.value,
            );
            if (formatTag === undefined) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    `unsupported value in \`${expr.name}!\` formatting`,
                    valueExpr.span,
                );
            }
            args.push(this.builder.iconst(formatTag, IntWidth.I64).id);
            args.push(lowered.value);
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
        const valueType = this.resolveValueType(valueId);
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
    ): Result<ValueId, LoweringError> {
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
            const fieldType = this.resolveValueType(lowered.value);
            if (fieldType === undefined) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    `Cannot resolve field type for \`${fieldName}\` in struct literal \`${structName}\``,
                    fieldExpr.span,
                );
            }
            fieldValues.push(lowered.value);
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
        return AstToSsaCtx.handleInstructionId(structCreate.id);
    }

    private lowerFieldAccess(expr: FieldExpr): Result<ValueId, LoweringError> {
        const base = this.lowerExpression(expr.receiver);
        if (!base.isOk()) {
            return base;
        }

        let baseValue = base.value;
        let baseType = this.resolveValueType(baseValue);
        if (baseType instanceof PtrType) {
            const { inner } = baseType;
            if (inner instanceof StructType) {
                // Resolve the full struct type from the module registry, since
                // Types translated from TypeNodes may have empty field lists.
                const resolvedInner =
                    this.irModule.structs.get(inner.name) ?? inner;
                const deref = this.builder.load(baseValue, resolvedInner);
                baseValue = deref.id;
                baseType = resolvedInner;
            }
        }
        // Resolve the full struct type from the module registry when the type
        // Has empty field lists (e.g. from translated TypeNodes).
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
        const fieldGet = this.builder.structGet(baseValue, index, fieldType);
        return AstToSsaCtx.handleInstructionId(fieldGet.id);
    }

    private closureCounter = 0;

    private collectFreeVars(expr: ClosureExpr): Set<string> {
        const params = new Set(expr.params.map((p) => p.name));
        const bound = new Set<string>(params);
        const free = new Set<string>();

        walkAst(expr.body, (node) => {
            if (
                node instanceof LetStmt &&
                node.pattern instanceof IdentPattern
            ) {
                bound.add(node.pattern.name);
            }
            if (node instanceof IdentifierExpr && !bound.has(node.name)) {
                free.add(node.name);
            }
        });

        return free;
    }

    private static inferLiteralIRType(
        lit: LiteralExpr,
    ): IntType | FloatType | BoolType {
        if (lit.literalKind === LiteralKind.Float) {
            return makeIRFloatType(FloatWidth.F64);
        }
        if (lit.literalKind === LiteralKind.Bool) {
            return makeIRBoolType();
        }
        return makeIRIntType(IntWidth.I32);
    }

    private inferParamTypeFromBody(
        paramName: string,
        body: Expression,
    ): IRType | undefined {
        let result: IRType | undefined;
        walkAst(body, (node) => {
            if (result) return;
            if (!(node instanceof BinaryExpr)) return;
            const { left, right } = node;
            const leftIsParam =
                left instanceof IdentifierExpr && left.name === paramName;
            const rightIsParam =
                right instanceof IdentifierExpr && right.name === paramName;
            if (leftIsParam && right instanceof LiteralExpr) {
                result = AstToSsaCtx.inferLiteralIRType(right);
            } else if (rightIsParam && left instanceof LiteralExpr) {
                result = AstToSsaCtx.inferLiteralIRType(left);
            }
        });
        return result;
    }

    private resolveClosureParamType(
        param: { name: string; ty: TypeNode },
        body: Expression,
    ): IRType {
        const explicit = AstToSsaCtx.translateTypeNode(param.ty);
        if (explicit.kind !== IRTypeKind.Unit) {
            return explicit;
        }
        return (
            this.inferParamTypeFromBody(param.name, body) ??
            makeIRIntType(IntWidth.I32)
        );
    }

    private inferExprType(
        expr: Expression,
        paramTypeMap: Map<string, IRType>,
    ): IRType {
        if (expr instanceof LiteralExpr) {
            return AstToSsaCtx.inferLiteralIRType(expr);
        }
        if (expr instanceof IdentifierExpr) {
            return paramTypeMap.get(expr.name) ?? makeIRUnitType();
        }
        if (expr instanceof BinaryExpr) {
            const leftTy = this.inferExprType(expr.left, paramTypeMap);
            const rightTy = this.inferExprType(expr.right, paramTypeMap);
            if (leftTy.kind !== IRTypeKind.Unit) return leftTy;
            if (rightTy.kind !== IRTypeKind.Unit) return rightTy;
        }
        if (expr instanceof BlockExpr && expr.expr !== undefined) {
            return this.inferExprType(expr.expr, paramTypeMap);
        }
        return makeIRUnitType();
    }

    private resolveClosureReturnType(
        expr: ClosureExpr,
        paramTypes: IRType[],
    ): IRType {
        const explicit = AstToSsaCtx.translateTypeNode(expr.returnType);
        if (explicit.kind !== IRTypeKind.Unit) {
            return explicit;
        }
        const paramTypeMap = new Map<string, IRType>();
        for (let i = 0; i < expr.params.length; i++) {
            paramTypeMap.set(expr.params[i].name, paramTypes[i]);
        }
        return this.inferExprType(expr.body, paramTypeMap);
    }

    private lowerClosureFunction(
        name: string,
        expr: ClosureExpr,
    ): Result<IRFunction, LoweringError> {
        const paramEntries = expr.params.map((p) => ({
            name: p.name,
            ty: p.ty,
        }));
        const paramTypes = paramEntries.map((p) =>
            this.resolveClosureParamType(p, expr.body),
        );
        this.currentReturnType = this.resolveClosureReturnType(
            expr,
            paramTypes,
        );
        const startResult = this.startFunction(name, paramTypes, expr.span);
        if (startResult.isErr()) {
            return startResult;
        }

        const { currentFunction } = this.builder;
        if (currentFunction) {
            for (let i = 0; i < paramEntries.length; i++) {
                const paramEntry = paramEntries[i];
                const irType = paramTypes[i];
                this.bindLocalValue(
                    paramEntry.name,
                    currentFunction.params[i].id,
                    irType,
                    {
                        typeNode: paramEntry.ty,
                    },
                );
            }
        }

        const bodyResult = this.lowerExpression(expr.body);
        if (!bodyResult.isOk()) {
            return bodyResult;
        }

        if (!this.isCurrentBlockTerminated()) {
            if (this.currentTypeKind() === IRTypeKind.Unit) {
                this.builder.ret();
            } else {
                this.builder.ret(bodyResult.value);
            }
        }

        this.sealAllBlocks();
        return Result.ok(this.builder.build());
    }

    private saveBuilderSnapshot(): BuilderSnapshot {
        return {
            fn: this.builder.currentFunction,
            block: this.builder.currentBlock,
            sealed: this.builder.sealedBlocks,
            varDefs: this.builder.varDefs,
            incompletePhis: this.builder.incompletePhis,
            varTypes: this.builder.varTypes,
            nextBlockId: this.builder.nextBlockId,
            locals: new Map(this.locals),
            constScopes: this.cloneConstScopes(),
            constResolutionStack: [...this.constResolutionStack],
            loopStack: this.loopStack,
            returnType: this.currentReturnType,
            expectedValueTypes: [...this.expectedValueTypes],
        };
    }

    private restoreBuilderSnapshot(snap: BuilderSnapshot): void {
        this.builder.currentFunction = snap.fn;
        this.builder.currentBlock = snap.block;
        this.builder.sealedBlocks = snap.sealed;
        this.builder.varDefs = snap.varDefs;
        this.builder.incompletePhis = snap.incompletePhis;
        this.builder.varTypes = snap.varTypes;
        this.builder.nextBlockId = snap.nextBlockId;
        this.locals.clear();
        for (const [k, v] of snap.locals) {
            this.locals.set(k, v);
        }
        this.constScopes = snap.constScopes.map((scope) => new Map(scope));
        this.constResolutionStack = [...snap.constResolutionStack];
        this.loopStack = snap.loopStack;
        this.currentReturnType = snap.returnType;
        this.expectedValueTypes = [...snap.expectedValueTypes];
    }

    private withIsolatedBuilderScope<T>(
        fn: () => Result<T, LoweringError>,
    ): Result<T, LoweringError> {
        const snap = this.saveBuilderSnapshot();
        this.builder.currentFunction = undefined;
        this.builder.currentBlock = undefined;
        this.builder.sealedBlocks = new Set();
        this.builder.varDefs = new Map();
        this.builder.incompletePhis = new Map();
        this.builder.varTypes = new Map();
        this.builder.nextBlockId = 0;
        this.locals.clear();
        this.loopStack = [];
        try {
            return fn();
        } finally {
            this.restoreBuilderSnapshot(snap);
        }
    }

    private lowerNonCapturingClosure(
        expr: ClosureExpr,
    ): Result<ValueId, LoweringError> {
        const name = `__closure_${this.closureCounter++}`;
        this.registerSyntheticFunctionId(name);
        const closureResult = this.withIsolatedBuilderScope(() =>
            this.lowerClosureFunction(name, expr),
        );
        if (!closureResult.isOk()) {
            return closureResult;
        }
        addIRFunction(this.irModule, closureResult.value);
        const fnId = this.requireFunctionId(name, expr.span);
        if (fnId.isErr()) {
            return fnId;
        }
        const idInst = this.builder.iconst(fnId.value, IntWidth.I64);
        return AstToSsaCtx.handleInstructionId(idInst.id);
    }

    private lowerClosure(expr: ClosureExpr): Result<ValueId, LoweringError> {
        const freeVars = this.collectFreeVars(expr);
        const hasCaptures = [...freeVars].some((v) => this.locals.has(v));
        if (!hasCaptures) {
            return this.lowerNonCapturingClosure(expr);
        }
        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            "capturing closures are not implemented",
            expr.span,
        );
    }

    private lowerMatchExpr(expr: MatchExpr): Result<ValueId, LoweringError> {
        const scrutinee = this.lowerExpression(expr.matchOn);
        if (!scrutinee.isOk()) {
            return scrutinee;
        }

        const armBlocks: BlockId[] = expr.arms.map((_, index) =>
            this.builder.createBlock(`match_arm_${index}`),
        );
        const { cases, defaultArmIndex, usesEnumPatterns } =
            this.buildMatchCases(expr.arms, armBlocks);

        const switchValue = match(usesEnumPatterns)
            .with(true, () => this.builder.enumGetTag(scrutinee.value).id)
            .otherwise(() => scrutinee.value);

        let defaultBlock: BlockId | undefined;
        let trapBlock: BlockId | undefined;
        if (defaultArmIndex === undefined) {
            trapBlock = this.builder.createBlock("match_trap");
            defaultBlock = trapBlock;
        } else {
            defaultBlock = armBlocks[defaultArmIndex];
        }

        this.builder.switch(switchValue, cases, defaultBlock, []);

        const matchResult = this.lowerMatchArms(
            expr.arms,
            armBlocks,
            scrutinee.value,
        );
        if (!matchResult.isOk()) {
            return matchResult;
        }

        if (trapBlock !== undefined) {
            const resumeBlock = this.currentBlockId();
            this.builder.switchToBlock(trapBlock);
            this.builder.unreachable();
            if (resumeBlock !== undefined) {
                this.builder.switchToBlock(resumeBlock);
            }
        }

        return matchResult;
    }

    private buildMatchCases(
        arms: MatchArmNode[],
        armBlocks: BlockId[],
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
                    value: this.resolveLiteralPatternValue(arm.pattern),
                    target: armBlocks[index],
                    args: [],
                });
            } else if (arm.pattern instanceof IdentPattern) {
                const tag = this.enumVariantTags.get(arm.pattern.name);
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
                const tag = this.resolveStructPatternTag(arm.pattern);
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

    private resolveLiteralPatternValue(pattern: LiteralPattern): number {
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

    private resolveStructPatternTag(pat: StructPattern): number | undefined {
        if (!(pat.path instanceof IdentifierExpr)) {
            return undefined;
        }
        return this.enumVariantTags.get(pat.path.name);
    }

    private lowerMatchArms(
        arms: MatchArmNode[],
        armBlocks: BlockId[],
        scrutinee?: ValueId,
    ): Result<ValueId, LoweringError> {
        const armResult = this.lowerMatchArmBodies(arms, armBlocks, scrutinee);
        if (!armResult.isOk()) {
            return armResult;
        }
        const { armExitBlocks, armValues } = armResult.value;
        const resultType = this.resolveMergeResultType(armValues);

        const mergeId = this.createMergeBlock("match_merge", resultType);

        this.connectMergePredecessors(
            armExitBlocks,
            armValues,
            mergeId,
            resultType,
        );

        this.builder.switchToBlock(mergeId);
        return Result.ok(
            this.mergeBlockResultValue(mergeId) ?? this.unitValue(),
        );
    }

    private lowerIf(expr: IfExpr): Result<ValueId, LoweringError> {
        const condResult = this.lowerExpression(expr.condition);
        if (!condResult.isOk()) return condResult;

        const thenId = this.builder.createBlock("if_then");
        const elseId = this.builder.createBlock("if_else");

        this.builder.brIf(condResult.value, thenId, [], elseId, []);

        this.builder.switchToBlock(thenId);
        const thenResult = this.lowerBlock(expr.thenBranch);
        if (!thenResult.isOk()) {
            return thenResult;
        }
        const thenValue = this.currentBlockValue(thenResult.value);
        const thenExitId = this.currentBlockId();

        this.builder.switchToBlock(elseId);
        let elseValue: ValueId | undefined;
        let elseExitId: BlockId | undefined = elseId;
        if (expr.elseBranch) {
            const elseResult = this.lowerExpression(expr.elseBranch);
            if (!elseResult.isOk()) return elseResult;
            elseValue = this.currentBlockValue(elseResult.value);
            elseExitId = this.currentBlockId();
        }

        return this.terminateIfBranches(
            thenExitId,
            thenValue,
            elseExitId,
            elseValue,
        );
    }

    private terminateIfBranches(
        thenId: BlockId | undefined,
        thenValue: ValueId | undefined,
        elseId: BlockId | undefined,
        elseValue: ValueId | undefined,
    ): Result<ValueId, LoweringError> {
        // A merge only carries a value when every reachable predecessor supplies one.
        let hasValuelessReachableBranch = false;
        const reachableValues: ValueId[] = [];

        if (thenId !== undefined) {
            this.builder.switchToBlock(thenId);
            if (!this.isCurrentBlockTerminated()) {
                if (thenValue === undefined) {
                    hasValuelessReachableBranch = true;
                } else {
                    reachableValues.push(thenValue);
                }
            }
        }

        if (elseId !== undefined) {
            this.builder.switchToBlock(elseId);
            if (!this.isCurrentBlockTerminated()) {
                if (elseValue === undefined) {
                    hasValuelessReachableBranch = true;
                } else {
                    reachableValues.push(elseValue);
                }
            }
        }

        let resultType: IRType | undefined;
        if (!hasValuelessReachableBranch && reachableValues.length > 0) {
            resultType = this.resolveValueType(reachableValues[0]);
        }

        const mergeId = this.createMergeBlock("if_merge", resultType);

        if (thenId !== undefined) {
            this.builder.switchToBlock(thenId);
            if (!this.isCurrentBlockTerminated()) {
                this.builder.br(
                    mergeId,
                    this.mergeBlockArgs(thenValue, resultType),
                );
            }
        }

        if (elseId !== undefined) {
            this.builder.switchToBlock(elseId);
            if (!this.isCurrentBlockTerminated()) {
                this.builder.br(
                    mergeId,
                    this.mergeBlockArgs(elseValue, resultType),
                );
            }
        }

        this.builder.switchToBlock(mergeId);

        return Result.ok(
            this.mergeBlockResultValue(mergeId) ?? this.unitValue(),
        );
    }

    private lowerReturn(expr: ReturnExpr): Result<ValueId, LoweringError> {
        if (expr.value === undefined) {
            this.builder.ret();
            return Result.ok(this.unitValue());
        }

        const valueResult = this.lowerExpressionWithExpected(
            expr.value,
            this.currentReturnType,
        );
        if (!valueResult.isOk()) {
            return valueResult;
        }

        this.builder.ret(valueResult.value);
        return Result.ok(valueResult.value);
    }

    private lowerBreak(expr: BreakExpr): Result<ValueId, LoweringError> {
        const frame = this.loopStack.at(LAST_FRAME_INDEX);
        if (!frame) {
            return loweringError(
                LoweringErrorKind.BreakOutsideLoop,
                "break used outside of a loop",
                expr.span,
            );
        }
        this.builder.br(frame.breakBlock);
        return Result.ok(this.unitValue());
    }

    private lowerContinue(expr: ContinueExpr): Result<ValueId, LoweringError> {
        const frame = this.loopStack.at(LAST_FRAME_INDEX);
        if (!frame) {
            return loweringError(
                LoweringErrorKind.ContinueOutsideLoop,
                "continue used outside of a loop",
                expr.span,
            );
        }
        this.builder.br(frame.continueBlock);
        return Result.ok(this.unitValue());
    }

    private lowerLoop(expr: LoopExpr): Result<ValueId, LoweringError> {
        const header = this.builder.createBlock("loop_header");
        const body = this.builder.createBlock("loop_body");
        const exit = this.builder.createBlock("loop_exit");

        this.builder.br(header);

        this.builder.switchToBlock(header);
        this.builder.br(body);

        this.builder.switchToBlock(body);
        this.loopStack.push({ breakBlock: exit, continueBlock: header });
        const bodyResult = this.lowerBlock(expr.body);
        if (!bodyResult.isOk()) {
            return bodyResult;
        }
        this.loopStack.pop();
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(header);
        }

        this.builder.switchToBlock(exit);
        return Result.ok(this.unitValue());
    }

    private lowerWhile(expr: WhileExpr): Result<ValueId, LoweringError> {
        const header = this.builder.createBlock("while_header");
        const body = this.builder.createBlock("while_body");
        const exit = this.builder.createBlock("while_exit");

        this.builder.br(header);

        this.builder.switchToBlock(header);
        const condResult = this.lowerExpression(expr.condition);
        if (!condResult.isOk()) {
            return condResult;
        }
        this.builder.brIf(condResult.value, body, [], exit, []);

        this.builder.switchToBlock(body);
        this.loopStack.push({ breakBlock: exit, continueBlock: header });
        const bodyResult = this.lowerBlock(expr.body);
        if (!bodyResult.isOk()) {
            return bodyResult;
        }
        this.loopStack.pop();
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(header);
        }

        this.builder.switchToBlock(exit);
        return Result.ok(this.unitValue());
    }

    static translateTypeNode(typeNode: TypeNode): IRType {
        if (typeNode instanceof OptionTypeNode) {
            const innerIrType = AstToSsaCtx.translateTypeNode(typeNode.inner);
            return makeIREnumType("Option", [[], [innerIrType]]);
        }
        if (typeNode instanceof ResultTypeNode) {
            const okType = AstToSsaCtx.translateTypeNode(typeNode.okType);
            const errType = AstToSsaCtx.translateTypeNode(typeNode.errType);
            return makeIREnumType("Result", [[okType], [errType]]);
        }
        if (typeNode instanceof NamedTypeNode) {
            const builtin = AstToSsaCtx.namedBuiltin(typeNode.name);
            if (builtin) {
                return AstToSsaCtx.builtinToIrType(builtin);
            }
            return makeIRStructType(typeNode.name, []);
        }
        if (typeNode instanceof RefTypeNode) {
            return makeIRPtrType(AstToSsaCtx.translateTypeNode(typeNode.inner));
        }
        if (typeNode instanceof PtrTypeNode) {
            return makeIRPtrType(AstToSsaCtx.translateTypeNode(typeNode.inner));
        }
        if (typeNode instanceof FnTypeNode) {
            // Function pointers are represented as 64-bit function IDs.
            return makeIRIntType(IntWidth.I64);
        }
        if (typeNode instanceof ArrayTypeNode) {
            const elemTy = AstToSsaCtx.translateTypeNode(typeNode.element);
            if (
                !(typeNode.length instanceof LiteralExpr) ||
                typeNode.length.literalKind !== LiteralKind.Int
            ) {
                return makeIRUnitType();
            }
            const len = Number(typeNode.length.value);
            return makeIRArrayType(elemTy, len);
        }
        return makeIRUnitType();
    }

    static namedBuiltin(name: string): BuiltinType | undefined {
        const n = name.toLowerCase();
        switch (n) {
            case "i8": {
                return BuiltinType.I8;
            }
            case "i16": {
                return BuiltinType.I16;
            }
            case "i32": {
                return BuiltinType.I32;
            }
            case "i64": {
                return BuiltinType.I64;
            }
            case "i128": {
                return BuiltinType.I128;
            }
            case "isize": {
                return BuiltinType.Isize;
            }
            case "u8": {
                return BuiltinType.U8;
            }
            case "u16": {
                return BuiltinType.U16;
            }
            case "u32": {
                return BuiltinType.U32;
            }
            case "u64": {
                return BuiltinType.U64;
            }
            case "u128": {
                return BuiltinType.U128;
            }
            case "usize": {
                return BuiltinType.Usize;
            }
            case "f32": {
                return BuiltinType.F32;
            }
            case "f64": {
                return BuiltinType.F64;
            }
            case "bool": {
                return BuiltinType.Bool;
            }
            case "char": {
                return BuiltinType.Char;
            }
            case "str": {
                return BuiltinType.Str;
            }
            case "unit": {
                return BuiltinType.Unit;
            }
            case "never": {
                return BuiltinType.Never;
            }
            default: {
                return undefined;
            }
        }
    }

    static builtinToIrType(ty: BuiltinType): IRType {
        switch (ty) {
            case BuiltinType.I8: {
                return makeIRIntType(IntWidth.I8);
            }
            case BuiltinType.I16: {
                return makeIRIntType(IntWidth.I16);
            }
            case BuiltinType.I32: {
                return makeIRIntType(IntWidth.I32);
            }
            case BuiltinType.I64: {
                return makeIRIntType(IntWidth.I64);
            }
            case BuiltinType.I128: {
                return makeIRIntType(IntWidth.I128);
            }
            case BuiltinType.Isize: {
                return makeIRIntType(IntWidth.Isize);
            }
            case BuiltinType.U8: {
                return makeIRIntType(IntWidth.U8);
            }
            case BuiltinType.U16: {
                return makeIRIntType(IntWidth.U16);
            }
            case BuiltinType.U32: {
                return makeIRIntType(IntWidth.U32);
            }
            case BuiltinType.U64: {
                return makeIRIntType(IntWidth.U64);
            }
            case BuiltinType.U128: {
                return makeIRIntType(IntWidth.U128);
            }
            case BuiltinType.Usize: {
                return makeIRIntType(IntWidth.Usize);
            }
            case BuiltinType.F32: {
                return makeIRFloatType(FloatWidth.F32);
            }
            case BuiltinType.F64: {
                return makeIRFloatType(FloatWidth.F64);
            }
            case BuiltinType.Bool: {
                return makeIRBoolType();
            }
            case BuiltinType.Char: {
                return makeIRIntType(IntWidth.U32);
            }
            case BuiltinType.Str: {
                return makeIRPtrType(makeIRIntType(IntWidth.U8));
            }
            case BuiltinType.Unit:
            case BuiltinType.Never: {
                return makeIRUnitType();
            }
            default: {
                const unreachable: never = ty;
                return unreachable;
            }
        }
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
        const value = hashName(name);
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
        const block = this.builder.currentBlock;
        if (!block) {
            return true;
        }
        return block.terminator !== undefined;
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
        const armExitBlocks: (BlockId | undefined)[] = [];
        const armValues: (ValueId | undefined)[] = [];
        const outerLocals = this.cloneLocals();

        for (let index = 0; index < arms.length; index++) {
            const arm = arms[index];
            this.restoreLocals(outerLocals);
            this.builder.switchToBlock(armBlocks[index]);
            if (scrutinee !== undefined) {
                const bindResult = this.bindMatchArmPattern(arm, scrutinee);
                if (!bindResult.isOk()) {
                    this.restoreLocals(outerLocals);
                    return bindResult;
                }
            }
            const body = this.lowerExpression(arm.body);
            if (!body.isOk()) {
                this.restoreLocals(outerLocals);
                return body;
            }
            armValues.push(this.currentBlockValue(body.value));
            armExitBlocks.push(this.currentBlockId());
            this.restoreLocals(outerLocals);
        }

        this.restoreLocals(outerLocals);
        return Result.ok({ armExitBlocks, armValues });
    }

    private bindMatchArmPattern(
        arm: MatchArmNode,
        scrutinee: ValueId,
    ): Result<void, LoweringError> {
        if (arm.pattern instanceof StructPattern) {
            return this.bindStructPatternPayload(arm.pattern, scrutinee);
        }

        if (!(arm.pattern instanceof IdentPattern)) {
            return Result.ok();
        }

        if (this.enumVariantTags.get(arm.pattern.name) !== undefined) {
            return Result.ok();
        }

        const scrutineeTy =
            this.resolveValueType(scrutinee) ?? makeIRUnitType();
        this.bindLocalValue(arm.pattern.name, scrutinee, scrutineeTy, {
            typeNode: arm.pattern.type,
        });
        return Result.ok();
    }

    private bindStructPatternPayload(
        pat: StructPattern,
        scrutinee: ValueId,
    ): Result<void, LoweringError> {
        if (!(pat.path instanceof IdentifierExpr)) return Result.ok();
        const variantName = pat.path.name;
        const tag = this.enumVariantTags.get(variantName);
        if (tag === undefined) return Result.ok();

        const scrutineeTy = this.resolveValueType(scrutinee);

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
            const dataVal = this.builder.enumGetData(
                scrutinee,
                tag,
                fieldIndex,
                enumTy,
                dataTy,
            );
            this.bindLocalValue(field.pattern.name, dataVal.id, dataTy, {
                typeNode: field.pattern.type,
            });
        }
        return Result.ok();
    }
    private resolveMergeResultType(
        values: (ValueId | undefined)[],
    ): IRType | undefined {
        const firstValue = values.find(
            (value): value is ValueId => value !== undefined,
        );

        if (firstValue === undefined) {
            return undefined;
        }

        return this.resolveValueType(firstValue);
    }

    private connectMergePredecessors(
        exitBlockIds: (BlockId | undefined)[],
        values: (ValueId | undefined)[],
        mergeId: BlockId,
        resultType: IRType | undefined,
    ): void {
        for (let index = 0; index < exitBlockIds.length; index++) {
            const exitBlockId = exitBlockIds[index];
            if (exitBlockId === undefined) {
                continue;
            }
            this.builder.switchToBlock(exitBlockId);
            if (!this.isCurrentBlockTerminated()) {
                const value = values[index];
                this.builder.br(
                    mergeId,
                    this.mergeBlockArgs(value, resultType),
                );
            }
        }
    }

    private mergeBlockResultValue(mergeId: BlockId): ValueId | undefined {
        const currentFn = this.builder.currentFunction;
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

    private isImplicitUnitTypeNode(typeNode: TypeNode): boolean {
        return (
            typeNode instanceof InferredTypeNode ||
            (typeNode instanceof NamedTypeNode &&
                typeNode.name.toLowerCase() === "unit")
        );
    }

    private resolveValueType(valueId: ValueId): IRType | undefined {
        const fn = this.builder.currentFunction;
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

    private sealAllBlocks(): void {
        const { currentFunction } = this.builder;
        if (!currentFunction) {
            return;
        }
        for (const block of currentFunction.blocks) {
            this.builder.sealBlock(block.id);
        }
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
        return this.currentReturnType.kind;
    }

    private static handleInstructionId(
        id: ValueId | null,
    ): Result<ValueId, LoweringError> {
        if (id === null) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Instruction returned null ID",
                zeroSpan(),
            );
        }
        return Result.ok(id);
    }
}

export function lowerAstToSsa(
    fnDecl: FnItem,
    options: { irModule?: IRModule } = {},
): Result<IRFunction, LoweringError> {
    const ctx = new AstToSsaCtx(options);
    return ctx.lowerFunction(fnDecl);
}

function seedStructMetadataForItems(
    items: ModuleNode["items"],
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    modulePrefix: string,
): void {
    const qualify = (name: string): string =>
        qualifyModuleName(modulePrefix, name);

    const registerStruct = (
        name: string,
        fields: string[],
        fieldTypes: IRType[],
    ): void => {
        structFieldNames.set(name, fields);
        if (!irModule.structs.has(name)) {
            irModule.structs.set(name, makeIRStructType(name, fieldTypes));
        }
    };

    for (const item of items) {
        if (item instanceof StructItem || item instanceof GenericStructItem) {
            const names = item.fields.map((f) => f.name);
            const fieldTypes = item.fields.map((f) =>
                AstToSsaCtx.translateTypeNode(f.typeNode),
            );
            const qualName = qualify(item.name);
            registerStruct(qualName, names, fieldTypes);
            if (modulePrefix) {
                registerStruct(item.name, names, fieldTypes);
            }
            continue;
        }
        if (item instanceof ModItem) {
            seedStructMetadataForItems(
                item.items,
                irModule,
                structFieldNames,
                qualify(item.name),
            );
        }
    }
}

function seedStructMetadata(
    moduleNode: ModuleNode,
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
): void {
    seedStructMetadataForItems(
        moduleNode.items,
        irModule,
        structFieldNames,
        "",
    );
}

function seedBuiltinOptionMetadata(
    irModule: IRModule,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
): void {
    const NONE_TAG = 0;
    const SOME_TAG = 1;
    enumVariantTags.set("None", NONE_TAG);
    enumVariantTags.set("Option::None", NONE_TAG);
    enumVariantTags.set("Some", SOME_TAG);
    enumVariantTags.set("Option::Some", SOME_TAG);
    enumVariantOwners.set("None", "Option");
    enumVariantOwners.set("Option::None", "Option");
    enumVariantOwners.set("Some", "Option");
    enumVariantOwners.set("Option::Some", "Option");
}

function seedBuiltinResultMetadata(
    _irModule: IRModule,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
): void {
    const OK_TAG = 0;
    const ERR_TAG = 1;
    enumVariantTags.set("Ok", OK_TAG);
    enumVariantTags.set("Result::Ok", OK_TAG);
    enumVariantTags.set("Err", ERR_TAG);
    enumVariantTags.set("Result::Err", ERR_TAG);
    enumVariantOwners.set("Ok", "Result");
    enumVariantOwners.set("Result::Ok", "Result");
    enumVariantOwners.set("Err", "Result");
    enumVariantOwners.set("Result::Err", "Result");
}

function seedEnumMetadata(
    moduleNode: ModuleNode,
    irModule: IRModule,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
): void {
    for (const item of moduleNode.items) {
        if (!(item instanceof EnumItem)) {
            continue;
        }
        const variantTypes: IRType[][] = item.variants.map(() => []);
        const enumType = makeIREnumType(item.name, variantTypes);
        const enumKey = getIREnumTypeKey(enumType);
        if (!irModule.enums.has(enumKey)) {
            addIREnum(irModule, enumKey, enumType);
        }
        for (let index = 0; index < item.variants.length; index++) {
            const variant = item.variants[index];
            // Register both the short name (for pattern matching) and the
            // Fully-qualified name (for expression lowering)
            enumVariantTags.set(variant.name, index);
            enumVariantTags.set(`${item.name}::${variant.name}`, index);
            enumVariantOwners.set(variant.name, item.name);
            enumVariantOwners.set(`${item.name}::${variant.name}`, item.name);
        }
    }
}

function collectFunctionIds(moduleNode: ModuleNode): Map<string, number> {
    const fnIdMap = new Map<string, number>();
    for (const item of moduleNode.items) {
        collectItemFunctionIds(item, fnIdMap);
    }
    for (const builtinName of Object.values(BUILTIN_SYMBOLS)) {
        fnIdMap.set(builtinName, hashName(builtinName));
    }
    return fnIdMap;
}

function collectFunctionReturnTypes(
    moduleNode: ModuleNode,
): Map<string, IRType> {
    const returnTypes = new Map<string, IRType>();
    for (const item of moduleNode.items) {
        collectItemReturnTypes(item, returnTypes);
    }
    return returnTypes;
}

function collectItemFunctionIds(
    item: ModuleNode["items"][number],
    fnIdMap: Map<string, number>,
    modulePrefix = "",
): void {
    const qualify = (name: string): string =>
        qualifyModuleName(modulePrefix, name);

    if (item instanceof GenericFnItem) {
        // Generic functions are templates — skip lowering, but register the id
        if (item.body) {
            fnIdMap.set(item.name, hashName(item.name));
            if (modulePrefix) {
                fnIdMap.set(qualify(item.name), hashName(item.name));
            }
        }
        return;
    }
    if (item instanceof FnItem && item.body) {
        fnIdMap.set(item.name, hashName(item.name));
        if (modulePrefix) {
            fnIdMap.set(qualify(item.name), hashName(item.name));
        }
        return;
    }
    if (item instanceof ImplItem) {
        collectImplFunctionIds(item, fnIdMap, modulePrefix);
        return;
    }
    if (item instanceof TraitImplItem) {
        const targetName = item.target.name;
        for (const method of item.fnImpls) {
            fnIdMap.set(method.name, hashName(method.name));
            if (targetName) {
                fnIdMap.set(
                    `${targetName}::${method.name}`,
                    hashName(method.name),
                );
            }
        }
        return;
    }
    if (item instanceof ModItem) {
        for (const modItem of item.items) {
            collectItemFunctionIds(modItem, fnIdMap, qualify(item.name));
        }
        return;
    }
    if (item instanceof UseItem) {
        seedUseItemFunctionId(item, fnIdMap);
    }
}

function seedUseItemFunctionId(
    item: UseItem,
    fnIdMap: Map<string, number>,
): void {
    const targetName = item.path[item.path.length - 1];
    const targetId = fnIdMap.get(targetName) ?? hashName(targetName);
    fnIdMap.set(targetName, targetId);
    if (item.alias) {
        fnIdMap.set(item.alias, targetId);
    }
}

function collectItemReturnTypes(
    item: ModuleNode["items"][number],
    returnTypes: Map<string, IRType>,
    modulePrefix = "",
): void {
    const qualify = (name: string): string =>
        qualifyModuleName(modulePrefix, name);

    if (item instanceof GenericFnItem || item instanceof GenericStructItem) {
        return;
    }
    if (item instanceof FnItem && item.body) {
        const returnType = AstToSsaCtx.translateTypeNode(item.returnType);
        returnTypes.set(item.name, returnType);
        if (modulePrefix) {
            returnTypes.set(qualify(item.name), returnType);
        }
        return;
    }
    if (item instanceof ImplItem) {
        collectImplReturnTypes(item, returnTypes, modulePrefix);
        return;
    }
    if (item instanceof TraitImplItem) {
        const targetName = item.target.name;
        for (const method of item.fnImpls) {
            if (!method.body) {
                continue;
            }
            const returnType = AstToSsaCtx.translateTypeNode(
                resolveSelfInTypeNode(method.returnType, targetName),
            );
            returnTypes.set(method.name, returnType);
            returnTypes.set(`${targetName}::${method.name}`, returnType);
        }
        return;
    }
    if (item instanceof ModItem) {
        for (const modItem of item.items) {
            collectItemReturnTypes(modItem, returnTypes, qualify(item.name));
        }
        return;
    }
    if (item instanceof UseItem) {
        seedUseItemReturnType(item, returnTypes);
    }
}

function seedUseItemReturnType(
    item: UseItem,
    returnTypes: Map<string, IRType>,
): void {
    const targetName = item.path[item.path.length - 1];
    const qualifiedName = item.path.join("::");
    const targetReturnType =
        returnTypes.get(qualifiedName) ?? returnTypes.get(targetName);
    if (targetReturnType && item.alias) {
        returnTypes.set(item.alias, targetReturnType);
    }
}

function collectImplFunctionIds(
    item: ImplItem,
    fnIdMap: Map<string, number>,
    modulePrefix = "",
): void {
    const implTarget = item.target.name;
    const qualify = (name: string): string =>
        qualifyModuleName(modulePrefix, name);
    const qImplTarget = qualify(implTarget);
    for (const method of item.methods) {
        fnIdMap.set(method.name, hashName(method.name));
        fnIdMap.set(`${implTarget}::${method.name}`, hashName(method.name));
        if (qImplTarget !== implTarget) {
            fnIdMap.set(
                `${qImplTarget}::${method.name}`,
                hashName(method.name),
            );
        }
    }
}

function resolveSelfInTypeNode(ty: TypeNode, selfName: string): TypeNode {
    if (ty instanceof NamedTypeNode) {
        let args: GenericArgsNode | undefined;
        if (ty.args) {
            args = new GenericArgsNode(
                ty.args.span,
                ty.args.args.map((arg) => resolveSelfInTypeNode(arg, selfName)),
            );
        }
        if (ty.name === "Self") {
            return new NamedTypeNode(ty.span, selfName, args);
        }
        if (args) {
            return new NamedTypeNode(ty.span, ty.name, args);
        }
        return ty;
    }
    if (ty instanceof TupleTypeNode) {
        return new TupleTypeNode(
            ty.span,
            ty.elements.map((element) =>
                resolveSelfInTypeNode(element, selfName),
            ),
        );
    }
    if (ty instanceof ArrayTypeNode) {
        return new ArrayTypeNode(
            ty.span,
            resolveSelfInTypeNode(ty.element, selfName),
            ty.length,
        );
    }
    if (ty instanceof RefTypeNode) {
        return new RefTypeNode(
            ty.span,
            ty.mutability,
            resolveSelfInTypeNode(ty.inner, selfName),
        );
    }
    if (ty instanceof PtrTypeNode) {
        return new PtrTypeNode(
            ty.span,
            ty.mutability,
            resolveSelfInTypeNode(ty.inner, selfName),
        );
    }
    if (ty instanceof FnTypeNode) {
        return new FnTypeNode(
            ty.span,
            ty.params.map((param) => resolveSelfInTypeNode(param, selfName)),
            resolveSelfInTypeNode(ty.returnType, selfName),
        );
    }
    return ty;
}

function collectImplReturnTypes(
    item: ImplItem,
    returnTypes: Map<string, IRType>,
    modulePrefix = "",
): void {
    const implTarget = item.target.name;
    const qualify = (name: string): string =>
        qualifyModuleName(modulePrefix, name);
    const qImplTarget = qualify(implTarget);
    for (const method of item.methods) {
        if (!method.body) {
            continue;
        }
        const returnType = AstToSsaCtx.translateTypeNode(
            resolveSelfInTypeNode(method.returnType, implTarget),
        );
        returnTypes.set(method.name, returnType);
        returnTypes.set(`${implTarget}::${method.name}`, returnType);
        if (qImplTarget !== implTarget) {
            returnTypes.set(`${qImplTarget}::${method.name}`, returnType);
        }
    }
}

function collectDirectConstBinding(
    item: ConstItem,
    constBindings: Map<string, LoweringConstBinding>,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    if (!item.value) {
        return;
    }
    const key = qualify(item.name);
    const binding: LoweringConstBinding = {
        key,
        typeNode: item.typeNode,
        value: item.value,
        span: item.span,
    };
    constBindings.set(key, binding);
    if (modulePrefix) {
        constBindings.set(item.name, binding);
    }
}

function registerAssociatedConstBindings(
    constItems: ConstItem[],
    targetName: string,
    qualifiedTarget: string,
    constBindings: Map<string, LoweringConstBinding>,
): void {
    for (const constItem of constItems) {
        if (!constItem.value) {
            continue;
        }
        const key = `${qualifiedTarget}::${constItem.name}`;
        const binding: LoweringConstBinding = {
            key,
            typeNode: constItem.typeNode,
            value: constItem.value,
            span: constItem.span,
            selfTypeName: targetName,
        };
        constBindings.set(key, binding);
        if (qualifiedTarget !== targetName) {
            constBindings.set(`${targetName}::${constItem.name}`, binding);
        }
    }
}

function collectImplConstBindings(
    item: ImplItem,
    constBindings: Map<string, LoweringConstBinding>,
    qualify: (name: string) => string,
): void {
    const targetName = item.target.name;
    registerAssociatedConstBindings(
        item.constItems,
        targetName,
        qualify(targetName),
        constBindings,
    );
}

function collectTraitImplConstBindings(
    item: TraitImplItem,
    constBindings: Map<string, LoweringConstBinding>,
    qualify: (name: string) => string,
): void {
    const targetName = item.target.name;
    const qualifiedTarget = qualify(targetName);
    const overrides = new Map(
        item.constItems.map((constItem) => [constItem.name, constItem]),
    );
    registerAssociatedConstBindings(
        item.constItems,
        targetName,
        qualifiedTarget,
        constBindings,
    );

    const defaultConstItems: ConstItem[] = [];
    for (const traitConst of item.trait.constItems) {
        if (overrides.has(traitConst.name) || !traitConst.value) {
            continue;
        }
        defaultConstItems.push(traitConst);
    }
    registerAssociatedConstBindings(
        defaultConstItems,
        targetName,
        qualifiedTarget,
        constBindings,
    );
}

function useLookupPaths(item: UseItem): string[] {
    const fullPath = item.path.join("::");
    const fallbackPaths = [fullPath];
    if (item.path[0] === "self" && item.path.length > 1) {
        fallbackPaths.push(item.path.slice(1).join("::"));
    }
    return fallbackPaths;
}

function collectUseConstBinding(
    item: UseItem,
    constBindings: Map<string, LoweringConstBinding>,
): void {
    const localName = item.alias ?? item.path[item.path.length - 1];
    let binding: LoweringConstBinding | undefined;
    for (const path of useLookupPaths(item)) {
        binding = constBindings.get(path);
        if (binding) {
            break;
        }
    }
    if (binding) {
        constBindings.set(localName, binding);
    }
}

function collectNamedConstBindings(
    item: ModuleNode["items"][number],
    constBindings: Map<string, LoweringConstBinding>,
    modulePrefix = "",
): void {
    const qualify = (name: string): string =>
        qualifyModuleName(modulePrefix, name);

    if (item instanceof ConstItem) {
        collectDirectConstBinding(item, constBindings, qualify, modulePrefix);
        return;
    }
    if (item instanceof ImplItem) {
        collectImplConstBindings(item, constBindings, qualify);
        return;
    }
    if (item instanceof TraitImplItem) {
        collectTraitImplConstBindings(item, constBindings, qualify);
        return;
    }
    if (item instanceof ModItem) {
        for (const modItem of item.items) {
            collectNamedConstBindings(
                modItem,
                constBindings,
                qualify(item.name),
            );
        }
        return;
    }
    if (item instanceof UseItem) {
        collectUseConstBinding(item, constBindings);
    }
}

function lowerOwnedFunction(
    fnItem: FnItem,
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    initialConsts?: Map<string, LoweringConstBinding>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    const ctx = new AstToSsaCtx({
        irModule,
        functionReturnTypes,
        structFieldNames,
        enumVariantTags,
        enumVariantOwners,
        namedConsts,
        initialConsts,
        monoRegistry,
    });
    ctx.seedFunctionIds(fnIdMap);
    const lowered = ctx.lowerFunction(fnItem);
    if (!lowered.isOk()) {
        return lowered;
    }
    addIRFunction(irModule, lowered.value);
    return Result.ok();
}

function ensureImplStructMetadata(
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    implTarget: string,
): void {
    if (!structFieldNames.has(implTarget) && structFieldNames.has("Self")) {
        structFieldNames.set(implTarget, [
            ...(structFieldNames.get("Self") ?? []),
        ]);
    }
    const selfStruct = irModule.structs.get("Self");
    if (!selfStruct) {
        return;
    }
    const targetStruct = irModule.structs.get(implTarget);
    const targetNeedsUpgrade =
        !targetStruct ||
        targetStruct.fields.every((field) => field.kind === IRTypeKind.Unit);
    if (targetNeedsUpgrade) {
        irModule.structs.set(
            implTarget,
            makeIRStructType(implTarget, [...selfStruct.fields]),
        );
    }
}

function rewriteSelfInMethod(method: FnItem, implTarget: string): FnItem {
    const rewriteType = (ty: TypeNode): TypeNode => {
        if (ty instanceof NamedTypeNode && ty.name === "Self") {
            return new NamedTypeNode(ty.span, implTarget);
        }
        if (ty instanceof RefTypeNode) {
            return new RefTypeNode(
                ty.span,
                ty.mutability,
                rewriteType(ty.inner),
            );
        }
        if (ty instanceof PtrTypeNode) {
            return new PtrTypeNode(
                ty.span,
                ty.mutability,
                rewriteType(ty.inner),
            );
        }
        return ty;
    };

    const newParams: ParamNode[] = method.params.map((p) => {
        let ty = rewriteType(p.ty);
        if (p.isReceiver) {
            // Parser stores &self/&mut self with ty=NamedTypeNode("Self"), losing the &.
            // Restore the reference so the IR param type matches the pointer the call site passes.
            if (
                p.receiverKind === ReceiverKind.ref ||
                p.receiverKind === ReceiverKind.refMut
            ) {
                let mut = Mutability.Immutable;
                if (p.receiverKind === ReceiverKind.refMut) {
                    mut = Mutability.Mutable;
                }
                ty = new RefTypeNode(p.span, mut, ty);
            }
        }
        const { name: originalName } = p;
        let name = originalName;
        if (p.isReceiver) {
            name = "self";
        }
        return {
            ...p,
            // Normalize receiver name: parser produces "Self" (capital) but the body uses "self".
            name,
            ty,
        };
    });

    const newReturnType = rewriteType(method.returnType);

    return new FnItem(
        method.span,
        method.name,
        newParams,
        newReturnType,
        method.body,
        method.derives,
        method.builtinName,
    );
}

function collectSelfConstBindings(
    selfTypeName: string,
    constItems: ConstItem[],
    namedConsts: Map<string, LoweringConstBinding>,
    traitConstItems: ConstItem[] = [],
): Map<string, LoweringConstBinding> {
    const bindings = new Map<string, LoweringConstBinding>();
    const overridden = new Set(constItems.map((constItem) => constItem.name));

    for (const constItem of constItems) {
        const binding = namedConsts.get(`${selfTypeName}::${constItem.name}`);
        if (binding) {
            bindings.set(`Self::${constItem.name}`, binding);
        }
    }

    for (const traitConst of traitConstItems) {
        if (overridden.has(traitConst.name)) {
            continue;
        }
        const binding = namedConsts.get(`${selfTypeName}::${traitConst.name}`);
        if (binding) {
            bindings.set(`Self::${traitConst.name}`, binding);
        }
    }

    return bindings;
}

function lowerImplMethods(
    item: ImplItem,
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    const implTarget = item.target.name;
    const initialConsts = collectSelfConstBindings(
        implTarget,
        item.constItems,
        namedConsts,
        [],
    );
    for (const method of item.methods) {
        if (method instanceof GenericFnItem) {
            continue;
        }
        if (!method.body) {
            continue;
        }
        ensureImplStructMetadata(irModule, structFieldNames, implTarget);
        const result = lowerOwnedFunction(
            rewriteSelfInMethod(method, implTarget),
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            initialConsts,
            monoRegistry,
        );
        if (result.isErr()) {
            return result;
        }
    }
    return Result.ok(undefined);
}

function lowerModuleItem(
    item: ModuleNode["items"][number],
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    if (item instanceof GenericFnItem || item instanceof GenericStructItem) {
        return Result.ok(undefined);
    }
    if (item instanceof FnItem && item.body) {
        return lowerOwnedFunction(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            undefined,
            monoRegistry,
        );
    }
    if (item instanceof ImplItem) {
        return lowerImplMethods(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            monoRegistry,
        );
    }
    if (item instanceof TraitImplItem) {
        let implTarget = "Self";
        if (item.target instanceof NamedTypeNode) {
            implTarget = item.target.name;
        }
        const initialConsts = collectSelfConstBindings(
            implTarget,
            item.constItems,
            namedConsts,
            item.trait.constItems,
        );
        for (const method of item.fnImpls) {
            if (!method.body) continue;
            ensureImplStructMetadata(irModule, structFieldNames, implTarget);
            const result = lowerOwnedFunction(
                rewriteSelfInMethod(method, implTarget),
                irModule,
                functionReturnTypes,
                structFieldNames,
                enumVariantTags,
                enumVariantOwners,
                namedConsts,
                fnIdMap,
                initialConsts,
                monoRegistry,
            );
            if (result.isErr()) {
                return result;
            }
        }
        return Result.ok(undefined);
    }
    if (item instanceof ModItem) {
        for (const modItem of item.items) {
            const result = lowerModuleItem(
                modItem,
                irModule,
                functionReturnTypes,
                structFieldNames,
                enumVariantTags,
                enumVariantOwners,
                namedConsts,
                fnIdMap,
                monoRegistry,
            );
            if (result.isErr()) {
                return result;
            }
        }
    }
    return Result.ok(undefined);
}

export function lowerAstModuleToSsa(
    moduleNode: ModuleNode,
): Result<IRModule, LoweringError> {
    const irModule = makeIRModule(moduleNode.name);
    const structFieldNames = new Map<string, string[]>();
    const enumVariantTags = new Map<string, number>();
    const enumVariantOwners = new Map<string, string>();
    seedStructMetadata(moduleNode, irModule, structFieldNames);
    seedBuiltinOptionMetadata(irModule, enumVariantTags, enumVariantOwners);
    seedBuiltinResultMetadata(irModule, enumVariantTags, enumVariantOwners);
    seedEnumMetadata(moduleNode, irModule, enumVariantTags, enumVariantOwners);

    // Collect generic items and generate monomorphized specializations
    const registry = new MonomorphizationRegistry();
    collectGenericItems(moduleNode, registry);
    const specializations = collectAndMonomorphize(moduleNode, registry);

    // Register specialization function IDs
    const fnIdMap = collectFunctionIds(moduleNode);
    const functionReturnTypes = collectFunctionReturnTypes(moduleNode);
    const namedConsts = new Map<string, LoweringConstBinding>();
    for (const item of moduleNode.items) {
        collectNamedConstBindings(item, namedConsts);
    }
    for (const spec of specializations) {
        fnIdMap.set(spec.name, hashName(spec.name));
        functionReturnTypes.set(
            spec.name,
            AstToSsaCtx.translateTypeNode(spec.returnType),
        );
    }

    // Lower regular items (pass registry so calls to generics get rewritten)
    for (const item of moduleNode.items) {
        const result = lowerModuleItem(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            registry,
        );
        if (result.isErr()) {
            return result;
        }
    }

    // Lower monomorphized specializations
    for (const spec of specializations) {
        const result = lowerOwnedFunction(
            spec,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            undefined,
            registry,
        );
        if (result.isErr()) {
            return result;
        }
    }

    return Result.ok(irModule);
}

function collectGenericItems(
    moduleNode: ModuleNode,
    registry: MonomorphizationRegistry,
): void {
    for (const item of moduleNode.items) {
        if (item instanceof GenericFnItem) {
            registry.registerGenericFn(item);
        }
        if (item instanceof GenericStructItem) {
            registry.registerGenericStruct(item);
        }
    }
}

function collectAndMonomorphize(
    moduleNode: ModuleNode,
    registry: MonomorphizationRegistry,
): FnItem[] {
    // Walk all non-generic function bodies to find call sites
    walkAst(moduleNode, (node) => {
        if (!(node instanceof CallExpr)) return;
        if (!(node.callee instanceof IdentifierExpr)) return;

        const generic = registry.lookupGenericFn(node.callee.name);
        if (generic === undefined) return;

        // Infer type arguments from the call expression's explicit type args
        // Use explicit args or infer from literals; full inference happens
        // In the inference pass which stores substitutions on TypeContext
        const subs = inferCallSiteTypeArgs(generic, node);
        if (subs === undefined) return;

        registry.getOrCreateFn(generic, subs);
    });

    return registry.allFnSpecializations();
}

function inferCallSiteTypeArgs(
    generic: GenericFnItem,
    call: CallExpr,
): SubstitutionMap | undefined {
    // Try explicit turbofish args first
    if (call.genericArgs !== undefined && call.genericArgs.length > 0) {
        return inferTypeArgs(generic, [], call.genericArgs);
    }

    // Infer from argument literal types
    const argTypes: (TypeNode | undefined)[] = call.args.map((arg) =>
        inferLiteralType(arg),
    );
    return inferTypeArgs(generic, argTypes);
}

function inferLiteralType(expr: Expression): TypeNode | undefined {
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
        // Arithmetic/bitwise ops preserve the operand type — try left then right
        return inferLiteralType(expr.left) ?? inferLiteralType(expr.right);
    }
    if (expr instanceof UnaryExpr) {
        return inferLiteralType(expr.operand);
    }
    return undefined;
}
