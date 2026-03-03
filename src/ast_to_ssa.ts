import {
    type AssignExpr,
    BinaryExpr,
    BinaryOp,
    type BlockExpr,
    type BreakExpr,
    BuiltinType,
    CallExpr,
    type ClosureExpr,
    type ContinueExpr,
    type DerefExpr,
    EnumItem,
    ExprStmt,
    type Expression,
    FieldExpr,
    FnItem,
    type ForExpr,
    GenericFnItem,
    GenericStructItem,
    ImplItem,
    IdentPattern,
    IdentifierExpr,
    InferredTypeNode,
    type IndexExpr,
    type IfExpr,
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
    type ParamNode,
    PtrTypeNode,
    type RangeExpr,
    type RefExpr,
    RefTypeNode,
    type ReturnExpr,
    Span,
    type Statement,
    StructItem,
    type StructExpr,
    TraitImplItem,
    type TypeNode,
    UseItem,
    UnaryExpr,
    UnaryOp,
    type WhileExpr,
    type AstVisitor,
    Mutability,
    walkAst,
    ReceiverKind,
} from "./ast";
import {
    MonomorphizationRegistry,
    inferTypeArgs,
    mangledName,
    type SubstitutionMap,
} from "./monomorphize";
import { type Result, err, ok, okVoid } from "./diagnostics";
import { BUILTIN_SYMBOLS } from "./builtin_symbols";

// Type alias for expression visitor to reduce complexity
type ExpressionVisitor<T> = Pick<
    AstVisitor<T, AstToSsaCtx>,
    | "visitLiteralExpr"
    | "visitIdentifierExpr"
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
>;
import {
    addIREnum,
    addIRFunction,
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
    type BlockId,
    FloatType,
    type IRFunction,
    type IRModule,
    type IRType,
    IntType,
    PtrType,
    StructType,
    type ValueId,
} from "./ir";
import { IRBuilder } from "./ir_builder";

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
}

interface LoopFrame {
    breakBlock: BlockId;
    continueBlock: BlockId;
}

function loweringError<T>(
    kind: LoweringErrorKind,
    message: string,
    span: Span,
): Result<T, LoweringError> {
    return err({ kind, message, span });
}

// Default values for type initialization
const DEFAULT_INT_VALUE = 0;
const DEFAULT_FLOAT_VALUE = 0;
const DEFAULT_UNIT_VALUE = 0;
const STRING_FIRST_CHAR_INDEX = 0;
const DEFAULT_CHAR_CODE = 0;
const HASH_FACTOR = 31;
const HASH_MODULUS = 1_000_000;
const VEC_CAPACITY_FALLBACK = 4;
const EMPTY_FORMAT = "";

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
    private readonly structFieldNames: Map<string, string[]>;
    private readonly enumVariantTags: Map<string, number>;
    private readonly monoRegistry?: MonomorphizationRegistry;
    private loopStack: LoopFrame[];
    private currentReturnType: IRType;

    constructor(
        options: {
            irModule?: IRModule;
            structFieldNames?: Map<string, string[]>;
            enumVariantTags?: Map<string, number>;
            monoRegistry?: MonomorphizationRegistry;
        } = {},
    ) {
        this.builder = new IRBuilder();
        this.irModule = options.irModule ?? makeIRModule("main");
        this.locals = new Map();
        this.functionIds = new Map();
        this.structFieldNames =
            options.structFieldNames ?? new Map<string, string[]>();
        this.enumVariantTags =
            options.enumVariantTags ?? new Map<string, number>();
        this.monoRegistry = options.monoRegistry;
        this.loopStack = [];
        this.currentReturnType = makeIRUnitType();
    }

    seedFunctionIds(ids: Map<string, number>): void {
        for (const [name, id] of ids.entries()) {
            this.functionIds.set(name, id);
        }
    }

    lowerFunction(fnDecl: FnItem): Result<IRFunction, LoweringError> {
        this.locals.clear();
        this.loopStack = [];

        const paramEntries = this.getLowerableParams(fnDecl);
        if (!paramEntries.ok) {
            return paramEntries;
        }
        const paramTypes = paramEntries.value.map(({ ty }) =>
            AstToSsaCtx.translateTypeNode(ty),
        );
        this.currentReturnType = AstToSsaCtx.translateTypeNode(
            fnDecl.returnType,
        );

        this.startFunction(fnDecl.name, paramTypes);
        this.bindFunctionParams(paramEntries.value);

        if (!fnDecl.body) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Function has no body",
                fnDecl.span,
            );
        }
        const bodyResult = this.lowerBlock(fnDecl.body);
        if (!bodyResult.ok) {
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
        return ok(this.builder.build());
    }

    private getLowerableParams(
        fnDecl: FnItem,
    ): Result<{ name?: string; ty: TypeNode }[], LoweringError> {
        const params: { name?: string; ty: TypeNode }[] = [];
        for (const param of fnDecl.params) {
            params.push({ name: param.name, ty: param.ty });
        }
        return ok(params);
    }

    private startFunction(name: string, paramTypes: IRType[]): void {
        this.builder.createFunction(name, paramTypes, this.currentReturnType);
        const entryId = this.builder.createBlock("entry");
        this.builder.switchToBlock(entryId);
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
            const allocaId = this.builder.alloca(irType).id;
            const param = currentFunction.params[i];
            this.builder.store(allocaId, param.id, irType);
            this.locals.set(paramEntry.name ?? "_", {
                ptr: allocaId,
                ty: irType,
                formatTag: AstToSsaCtx.formatTagFromTypeNode(paramEntry.ty),
            });
        }
    }

    private lowerBlock(
        block: BlockExpr,
    ): Result<ValueId | undefined, LoweringError> {
        for (const stmt of block.stmts) {
            const stmtResult = this.lowerStatement(stmt);
            if (!stmtResult.ok) {
                return stmtResult;
            }
            if (this.isCurrentBlockTerminated()) {
                return ok(undefined);
            }
        }

        if (!block.expr) {
            return ok(undefined);
        }

        const exprResult = this.lowerExpression(block.expr);
        if (!exprResult.ok) {
            return exprResult;
        }
        return ok(exprResult.value);
    }

    private lowerStatement(stmt: Statement): Result<void, LoweringError> {
        if (stmt instanceof LetStmt) {
            return this.lowerLetStatement(stmt);
        }
        if (stmt instanceof ExprStmt) {
            const exprResult = this.lowerExpression(stmt.expr);
            if (!exprResult.ok) {
                return exprResult;
            }
            return okVoid();
        }

        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            `Unsupported statement: ${stmt.constructor.name}`,
            stmt.span,
        );
    }

    private lowerLetStatement(stmt: LetStmt): Result<void, LoweringError> {
        const initResult = this.lowerExpression(stmt.init);
        if (!initResult.ok) {
            return initResult;
        }

        if (stmt.pattern instanceof IdentPattern) {
            let ty = AstToSsaCtx.translateTypeNode(stmt.type);
            if (this.isImplicitUnitTypeNode(stmt.type)) {
                const inferred = this.resolveValueType(initResult.value);
                if (inferred !== undefined) {
                    ty = inferred;
                }
            }
            const slot = this.builder.alloca(ty);
            const slotId = slot.id;
            this.builder.store(slotId, initResult.value, ty);
            this.locals.set(stmt.pattern.name, {
                ptr: slotId,
                ty,
                formatTag: this.inferExpressionFormatTag(stmt.init),
            });
        }
        return okVoid();
    }

    private lowerExpression(expr: Expression): Result<ValueId, LoweringError> {
        // Use visitor pattern to dispatch to appropriate handler
        const visitor = this.getExpressionVisitor();
        return expr.accept(visitor, this);
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
            visitBinaryExpr: (expr: BinaryExpr) => this.lowerBinary(expr),
            visitUnaryExpr: (expr: UnaryExpr) => this.lowerUnary(expr),
            visitAssignExpr: (expr: AssignExpr) => this.lowerAssign(expr),
            visitCallExpr: (expr: CallExpr) => this.lowerCall(expr),
            visitFieldExpr: (expr: FieldExpr) => this.lowerFieldAccess(expr),
            visitIndexExpr: (expr: IndexExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Index expression lowering not implemented",
                    expr.span,
                ),
            visitIfExpr: (expr: IfExpr) => this.lowerIf(expr),
            visitBlockExpr: (expr: BlockExpr) => {
                const blockResult = this.lowerBlock(expr);
                if (!blockResult.ok) {
                    return blockResult;
                }
                if (blockResult.value === undefined) {
                    return ok(this.unitValue());
                }
                return ok(blockResult.value);
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
        };
        return {
            visitLiteralExpr: expressionVisitors.visitLiteralExpr,
            visitIdentifierExpr: expressionVisitors.visitIdentifierExpr,
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
                const cp =
                    typeof expr.value === "string"
                        ? (expr.value.codePointAt(STRING_FIRST_CHAR_INDEX) ??
                          DEFAULT_CHAR_CODE)
                        : Number(expr.value);
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
        if (binding !== undefined) {
            const loadInst = this.builder.load(binding.ptr, binding.ty);
            return AstToSsaCtx.handleInstructionId(loadInst.id);
        }

        const variantTag = this.enumVariantTags.get(expr.name);
        if (variantTag !== undefined) {
            const enumType = this.resolveEnumTypeForVariant(expr.name);
            const inst = this.builder.enumCreate(
                variantTag,
                undefined,
                enumType,
            );
            return AstToSsaCtx.handleInstructionId(inst.id);
        }

        const fnId = this.resolveFunctionId(expr.name);
        const constInst = this.builder.iconst(fnId, IntWidth.I64);
        return AstToSsaCtx.handleInstructionId(constInst.id);
    }

    private resolveEnumTypeForVariant(variantPath: string): IRType {
        const colonColon = "::";
        const sepIndex = variantPath.indexOf(colonColon);
        if (sepIndex !== -1) {
            const enumName = variantPath.slice(0, sepIndex);
            const found = this.irModule.enums.get(enumName);
            if (found !== undefined) {
                return found;
            }
        }
        return makeIRUnitType();
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
        if (binding === undefined) {
            return loweringError(
                LoweringErrorKind.UnknownVariable,
                `Unknown variable '${expr.target.name}'`,
                expr.target.span,
            );
        }

        const valueResult = this.lowerExpression(expr.value);
        if (!valueResult.ok) {
            return valueResult;
        }
        this.builder.store(binding.ptr, valueResult.value, binding.ty);
        return ok(valueResult.value);
    }

    private lowerBinary(expr: BinaryExpr): Result<ValueId, LoweringError> {
        const leftResult = this.lowerExpression(expr.left);
        if (!leftResult.ok) {
            return leftResult;
        }
        const rightResult = this.lowerExpression(expr.right);
        if (!rightResult.ok) {
            return rightResult;
        }

        const left = leftResult.value;
        const right = rightResult.value;
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
            case BinaryOp.Eq: {
                throw new Error("Not implemented yet: BinaryOp.Eq case");
            }
            case BinaryOp.Ne: {
                throw new Error("Not implemented yet: BinaryOp.Ne case");
            }
            case BinaryOp.Lt: {
                throw new Error("Not implemented yet: BinaryOp.Lt case");
            }
            case BinaryOp.Le: {
                throw new Error("Not implemented yet: BinaryOp.Le case");
            }
            case BinaryOp.Gt: {
                throw new Error("Not implemented yet: BinaryOp.Gt case");
            }
            case BinaryOp.Ge: {
                throw new Error("Not implemented yet: BinaryOp.Ge case");
            }
            case BinaryOp.And: {
                throw new Error("Not implemented yet: BinaryOp.And case");
            }
            case BinaryOp.Or: {
                throw new Error("Not implemented yet: BinaryOp.Or case");
            }
            case BinaryOp.BitXor: {
                throw new Error("Not implemented yet: BinaryOp.BitXor case");
            }
            case BinaryOp.BitAnd: {
                throw new Error("Not implemented yet: BinaryOp.BitAnd case");
            }
            case BinaryOp.BitOr: {
                throw new Error("Not implemented yet: BinaryOp.BitOr case");
            }
            case BinaryOp.Shl: {
                throw new Error("Not implemented yet: BinaryOp.Shl case");
            }
            case BinaryOp.Shr: {
                throw new Error("Not implemented yet: BinaryOp.Shr case");
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
            case BinaryOp.Add: {
                throw new Error("Not implemented yet: BinaryOp.Add case");
            }
            case BinaryOp.Sub: {
                throw new Error("Not implemented yet: BinaryOp.Sub case");
            }
            case BinaryOp.Mul: {
                throw new Error("Not implemented yet: BinaryOp.Mul case");
            }
            case BinaryOp.Div: {
                throw new Error("Not implemented yet: BinaryOp.Div case");
            }
            case BinaryOp.Rem: {
                throw new Error("Not implemented yet: BinaryOp.Rem case");
            }
            case BinaryOp.And: {
                throw new Error("Not implemented yet: BinaryOp.And case");
            }
            case BinaryOp.Or: {
                throw new Error("Not implemented yet: BinaryOp.Or case");
            }
            case BinaryOp.BitXor: {
                throw new Error("Not implemented yet: BinaryOp.BitXor case");
            }
            case BinaryOp.BitAnd: {
                throw new Error("Not implemented yet: BinaryOp.BitAnd case");
            }
            case BinaryOp.BitOr: {
                throw new Error("Not implemented yet: BinaryOp.BitOr case");
            }
            case BinaryOp.Shl: {
                throw new Error("Not implemented yet: BinaryOp.Shl case");
            }
            case BinaryOp.Shr: {
                throw new Error("Not implemented yet: BinaryOp.Shr case");
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
            case BinaryOp.Add: {
                throw new Error("Not implemented yet: BinaryOp.Add case");
            }
            case BinaryOp.Sub: {
                throw new Error("Not implemented yet: BinaryOp.Sub case");
            }
            case BinaryOp.Mul: {
                throw new Error("Not implemented yet: BinaryOp.Mul case");
            }
            case BinaryOp.Div: {
                throw new Error("Not implemented yet: BinaryOp.Div case");
            }
            case BinaryOp.Rem: {
                throw new Error("Not implemented yet: BinaryOp.Rem case");
            }
            case BinaryOp.Eq: {
                throw new Error("Not implemented yet: BinaryOp.Eq case");
            }
            case BinaryOp.Ne: {
                throw new Error("Not implemented yet: BinaryOp.Ne case");
            }
            case BinaryOp.Lt: {
                throw new Error("Not implemented yet: BinaryOp.Lt case");
            }
            case BinaryOp.Le: {
                throw new Error("Not implemented yet: BinaryOp.Le case");
            }
            case BinaryOp.Gt: {
                throw new Error("Not implemented yet: BinaryOp.Gt case");
            }
            case BinaryOp.Ge: {
                throw new Error("Not implemented yet: BinaryOp.Ge case");
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
            return ok(addInst.id);
        }
        const addInst = this.builder.iadd(left, right, IntWidth.I32);
        return ok(addInst.id);
    }

    private handleSubOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const subInst = this.builder.fsub(left, right, FloatWidth.F64);
            return ok(subInst.id);
        }
        const subInst = this.builder.isub(left, right, IntWidth.I32);
        return ok(subInst.id);
    }

    private handleMulOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const mulInst = this.builder.fmul(left, right, FloatWidth.F64);
            return ok(mulInst.id);
        }
        const mulInst = this.builder.imul(left, right, IntWidth.I32);
        return ok(mulInst.id);
    }

    private handleDivOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const divInst = this.builder.fdiv(left, right, FloatWidth.F64);
            return ok(divInst.id);
        }
        const divInst = this.builder.idiv(left, right, IntWidth.I32);
        return ok(divInst.id);
    }

    private handleRemOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const remInst = this.builder.imod(left, right, IntWidth.I32);
        return ok(remInst.id);
    }

    // Comparison operation handlers
    private handleEqOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Oeq, left, right);
            return ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Eq, left, right);
        return ok(cmpInst.id);
    }

    private handleNeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.One, left, right);
            return ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Ne, left, right);
        return ok(cmpInst.id);
    }

    private handleLtOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Olt, left, right);
            return ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Slt, left, right);
        return ok(cmpInst.id);
    }

    private handleLeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Ole, left, right);
            return ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sle, left, right);
        return ok(cmpInst.id);
    }

    private handleGtOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Ogt, left, right);
            return ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sgt, left, right);
        return ok(cmpInst.id);
    }

    private handleGeOperation(
        left: ValueId,
        right: ValueId,
        isFloat: boolean,
    ): Result<ValueId, LoweringError> {
        if (isFloat) {
            const cmpInst = this.builder.fcmp(FcmpOp.Oge, left, right);
            return ok(cmpInst.id);
        }
        const cmpInst = this.builder.icmp(IcmpOp.Sge, left, right);
        return ok(cmpInst.id);
    }

    // Bitwise operation handlers
    private handleAndOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const andInst = this.builder.iand(left, right, IntWidth.I8);
        return ok(andInst.id);
    }

    private handleOrOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const orInst = this.builder.ior(left, right, IntWidth.I8);
        return ok(orInst.id);
    }

    private handleXorOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const xorInst = this.builder.ixor(left, right, IntWidth.I32);
        return ok(xorInst.id);
    }

    private handleShlOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const shlInst = this.builder.ishl(left, right, IntWidth.I32);
        return ok(shlInst.id);
    }

    private handleShrOperation(
        left: ValueId,
        right: ValueId,
    ): Result<ValueId, LoweringError> {
        const shrInst = this.builder.ishr(left, right, IntWidth.I32);
        return ok(shrInst.id);
    }

    private lowerUnary(expr: UnaryExpr): Result<ValueId, LoweringError> {
        const operandResult = this.lowerExpression(expr.operand);
        if (!operandResult.ok) return operandResult;
        const operand = operandResult.value;

        switch (expr.op) {
            case UnaryOp.Neg: {
                if (this.isFloatish(expr.operand)) {
                    const negInst = this.builder.fneg(operand, FloatWidth.F64);
                    return ok(negInst.id);
                }
                const negInst = this.builder.ineg(operand, IntWidth.I32);
                return ok(negInst.id);
            }
            case UnaryOp.Not: {
                const oneInst = this.builder.bconst(true);
                const xorInst = this.builder.ixor(
                    operand,
                    oneInst.id,
                    IntWidth.I8,
                );
                return ok(xorInst.id);
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
                    return ok(binding.ptr);
                }

                const ptrTy = makeIRIntType(IntWidth.I64);
                const allocaInst = this.builder.alloca(ptrTy);
                const ptrId = allocaInst.id;
                this.builder.store(ptrId, operand, ptrTy);
                return ok(ptrId);
            }
            case UnaryOp.Deref: {
                const loadInst = this.builder.load(
                    operand,
                    makeIRIntType(IntWidth.I64),
                );
                return ok(loadInst.id);
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
        const args: ValueId[] = [];
        for (const arg of expr.args) {
            const argResult = this.lowerExpression(arg);
            if (!argResult.ok) {
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
            if (resolvedName !== undefined) {
                return this.lowerResolvedCall(resolvedName, args, retTy);
            }
            return this.lowerIdentifierCall(expr.callee, args, retTy);
        }

        const calleeResult = this.lowerExpression(expr.callee);
        if (!calleeResult.ok) {
            return calleeResult;
        }
        const callDynInst = this.builder.callDyn(
            calleeResult.value,
            args,
            retTy,
        );
        return ok(callDynInst.id);
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
    ): Result<ValueId, LoweringError> {
        const returnType = this.resolveNamedCallReturnType(
            name,
            defaultReturnType,
        );
        const callInst = this.builder.call(
            this.resolveFunctionId(name),
            args,
            returnType,
        );
        return ok(callInst.id);
    }

    private lowerMethodCall(
        callee: FieldExpr,
        args: ValueId[],
    ): Result<ValueId, LoweringError> {
        const receiver = this.lowerExpression(callee.receiver);
        if (!receiver.ok) {
            return receiver;
        }
        const methodBuiltin = this.tryLowerBuiltinMethod(
            callee,
            receiver.value,
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
        const returnType =
            receiverType instanceof StructType
                ? receiverType
                : makeIRIntType(IntWidth.I64);
        const callInst = this.builder.call(
            this.resolveFunctionId(qualifiedName),
            [receiverArg, ...args],
            returnType,
        );
        return ok(callInst.id);
    }

    private tryLowerBuiltinMethod(
        callee: FieldExpr,
        receiverValue: ValueId,
    ): Result<ValueId, LoweringError> | undefined {
        switch (callee.field) {
            case "clone": {
                return ok(receiverValue);
            }
            case "len": {
                return AstToSsaCtx.handleInstructionId(
                    this.builder.iconst(0, IntWidth.I32).id,
                );
            }
            case "capacity": {
                return AstToSsaCtx.handleInstructionId(
                    this.builder.iconst(VEC_CAPACITY_FALLBACK, IntWidth.I32).id,
                );
            }
            case "push":
            case "get":
            case "pop": {
                return ok(this.unitValue());
            }
            default: {
                return undefined;
            }
        }
    }

    private resolveReceiverArg(
        callee: FieldExpr,
        receiverValue: ValueId,
    ): ValueId {
        if (!(callee.receiver instanceof IdentifierExpr)) {
            return receiverValue;
        }
        const binding = this.locals.get(callee.receiver.name);
        return binding ? binding.ptr : receiverValue;
    }

    private resolveQualifiedMethodName(
        methodName: string,
        receiverType: IRType | undefined,
    ): string {
        if (!(receiverType instanceof StructType)) {
            return methodName;
        }
        const maybeQualified = `${receiverType.name}::${methodName}`;
        return this.functionIds.has(maybeQualified)
            ? maybeQualified
            : methodName;
    }

    private lowerIdentifierCall(
        callee: IdentifierExpr,
        args: ValueId[],
        defaultReturnType: IRType,
    ): Result<ValueId, LoweringError> {
        if (this.locals.has(callee.name)) {
            return ok(this.unitValue());
        }
        const returnType = this.resolveNamedCallReturnType(
            callee.name,
            defaultReturnType,
        );
        const callInst = this.builder.call(
            this.resolveFunctionId(callee.name),
            args,
            returnType,
        );
        return ok(callInst.id);
    }

    private resolveNamedCallReturnType(name: string, fallback: IRType): IRType {
        // Derive the unqualified function name (e.g. "Point::create" → "create").
        const parts = name.split("::");
        const unqualifiedName = parts[parts.length - 1];

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
            case "assert":
            case "assert_eq": {
                return ok(this.unitValue());
            }
            case "vec": {
                return this.lowerVecMacro(expr);
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

    private lowerPrintMacro(
        expr: MacroExpr,
        appendNewline: boolean,
    ): Result<ValueId, LoweringError> {
        const preparedArgs = this.preparePrintArguments(expr);
        if (!preparedArgs.ok) {
            return preparedArgs;
        }
        const builtinName = appendNewline
            ? BUILTIN_SYMBOLS.PRINTLN_FMT
            : BUILTIN_SYMBOLS.PRINT_FMT;
        const callInst = this.builder.call(
            this.resolveFunctionId(builtinName),
            preparedArgs.value,
            makeIRUnitType(),
        );
        return AstToSsaCtx.handleInstructionId(callInst.id);
    }

    private preparePrintArguments(
        expr: MacroExpr,
    ): Result<ValueId[], LoweringError> {
        const templateResult = this.parseFormatTemplate(expr);
        if (!templateResult.ok) {
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
            if (!lowered.ok) {
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
        return ok(args);
    }

    private parseFormatTemplate(
        expr: MacroExpr,
    ): Result<FormatTemplate, LoweringError> {
        if (expr.args.length === 0) {
            return ok({
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
        if (!parsed.ok) {
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
        return ok({
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
            return local ? local.formatTag : undefined;
        }
        return undefined;
    }

    private inferFormatTagFromValueType(
        valueId: ValueId,
    ): FormatTag | undefined {
        const valueType = this.resolveValueType(valueId);
        if (valueType === undefined) {
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

    private lowerVecMacro(expr: MacroExpr): Result<ValueId, LoweringError> {
        const values: ValueId[] = [];
        const fieldTypes: IRType[] = [];
        for (const arg of expr.args) {
            const lowered = this.lowerExpression(arg);
            if (!lowered.ok) {
                return lowered;
            }
            values.push(lowered.value);
            fieldTypes.push(
                this.resolveValueType(lowered.value) ?? makeIRUnitType(),
            );
        }
        const vecTypeName = "Vec";
        const vecType =
            this.irModule.structs.get(vecTypeName) ??
            makeIRStructType(vecTypeName, fieldTypes);
        if (!this.irModule.structs.has(vecTypeName)) {
            this.irModule.structs.set(vecTypeName, vecType);
            this.structFieldNames.set(
                vecTypeName,
                fieldTypes.map((_, index) => `_${index}`),
            );
        }
        const vecCreate = this.builder.structCreate(values, vecType);
        return AstToSsaCtx.handleInstructionId(vecCreate.id);
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
            if (!lowered.ok) {
                return lowered;
            }
            fieldValues.push(lowered.value);
            fieldTypes.push(
                this.resolveValueType(lowered.value) ?? makeIRUnitType(),
            );
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
        if (!base.ok) {
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
        const fieldType = structType.fields[index] ?? makeIRUnitType();
        const fieldGet = this.builder.structGet(baseValue, index, fieldType);
        return AstToSsaCtx.handleInstructionId(fieldGet.id);
    }

    private lowerClosure(_expr: ClosureExpr): Result<ValueId, LoweringError> {
        const placeholder = this.builder.iconst(0, IntWidth.I64);
        return AstToSsaCtx.handleInstructionId(placeholder.id);
    }

    private lowerMatchExpr(expr: MatchExpr): Result<ValueId, LoweringError> {
        const scrutinee = this.lowerExpression(expr.matchOn);
        if (!scrutinee.ok) {
            return scrutinee;
        }

        const armBlocks: BlockId[] = expr.arms.map((_, index) =>
            this.builder.createBlock(`match_arm_${index}`),
        );
        const cases: { value: number; target: BlockId; args: ValueId[] }[] = [];
        let defaultArmIndex: number | undefined;
        let usesEnumPatterns = false;

        for (let index = 0; index < expr.arms.length; index++) {
            const arm = expr.arms[index];
            if ("literalKind" in arm.pattern && "value" in arm.pattern) {
                const raw = arm.pattern.value;
                const value = typeof raw === "number" ? raw : Number(raw);
                cases.push({ value, target: armBlocks[index], args: [] });
            } else if (arm.pattern instanceof IdentPattern) {
                const tag = this.enumVariantTags.get(arm.pattern.name);
                if (tag !== undefined) {
                    cases.push({
                        value: tag,
                        target: armBlocks[index],
                        args: [],
                    });
                    usesEnumPatterns = true;
                } else {
                    defaultArmIndex = index;
                }
            } else {
                defaultArmIndex = index;
            }
        }

        const switchValue = usesEnumPatterns
            ? this.builder.enumGetTag(scrutinee.value).id
            : scrutinee.value;

        let defaultBlock: BlockId;
        if (defaultArmIndex !== undefined) {
            defaultBlock = armBlocks[defaultArmIndex];
        } else if (armBlocks.length > 0) {
            const [firstArmBlock] = armBlocks;
            defaultBlock = firstArmBlock;
        } else {
            defaultBlock = this.builder.createBlock("match_default");
        }

        this.builder.switch(switchValue, cases, defaultBlock, []);

        return this.lowerMatchArms(expr.arms, armBlocks);
    }

    private lowerMatchArms(
        arms: MatchArmNode[],
        armBlocks: BlockId[],
    ): Result<ValueId, LoweringError> {
        const armValues: (ValueId | undefined)[] = [];

        for (let index = 0; index < arms.length; index++) {
            const arm = arms[index];
            this.builder.switchToBlock(armBlocks[index]);
            const body = this.lowerExpression(arm.body);
            if (!body.ok) {
                return body;
            }
            armValues.push(
                this.isCurrentBlockTerminated() ? undefined : body.value,
            );
        }

        const allProduceValues = armValues.every((v) => v !== undefined);
        const [firstArmValue] = armValues;
        const resultType =
            allProduceValues && firstArmValue !== undefined
                ? (this.resolveValueType(firstArmValue) ?? undefined)
                : undefined;

        const mergeId =
            resultType !== undefined
                ? this.builder.createBlock("match_merge", [resultType])
                : this.builder.createBlock("match_merge");

        for (let index = 0; index < arms.length; index++) {
            this.builder.switchToBlock(armBlocks[index]);
            if (!this.isCurrentBlockTerminated()) {
                const armValue = armValues[index];
                this.builder.br(
                    mergeId,
                    armValue !== undefined && resultType !== undefined
                        ? [armValue]
                        : [],
                );
            }
        }

        this.builder.switchToBlock(mergeId);

        if (resultType !== undefined) {
            const currentFn = this.builder.currentFunction;
            if (currentFn !== undefined) {
                const mergeBlock = currentFn.blocks.find(
                    (b) => b.id === mergeId,
                );
                if (mergeBlock !== undefined) {
                    const [param] = mergeBlock.params;
                    return ok(param.id);
                }
            }
        }

        return ok(this.unitValue());
    }

    private lowerIf(expr: IfExpr): Result<ValueId, LoweringError> {
        const condResult = this.lowerExpression(expr.condition);
        if (!condResult.ok) return condResult;

        const thenId = this.builder.createBlock("if_then");
        const elseId = this.builder.createBlock("if_else");

        this.builder.brIf(condResult.value, thenId, [], elseId, []);

        this.builder.switchToBlock(thenId);
        const thenResult = this.lowerBlock(expr.thenBranch);
        if (!thenResult.ok) {
            return thenResult;
        }
        const thenValue = this.isCurrentBlockTerminated()
            ? undefined
            : thenResult.value;

        this.builder.switchToBlock(elseId);
        let elseValue: ValueId | undefined;
        if (expr.elseBranch) {
            const elseResult = this.lowerExpression(expr.elseBranch);
            if (!elseResult.ok) return elseResult;
            elseValue = this.isCurrentBlockTerminated()
                ? undefined
                : elseResult.value;
        }

        return this.terminateIfBranches(thenId, thenValue, elseId, elseValue);
    }

    private terminateIfBranches(
        thenId: BlockId,
        thenValue: ValueId | undefined,
        elseId: BlockId,
        elseValue: ValueId | undefined,
    ): Result<ValueId, LoweringError> {
        const bothProduceValue =
            thenValue !== undefined && elseValue !== undefined;
        const resultType = bothProduceValue
            ? (this.resolveValueType(thenValue) ?? undefined)
            : undefined;

        const mergeId =
            resultType !== undefined
                ? this.builder.createBlock("if_merge", [resultType])
                : this.builder.createBlock("if_merge");

        this.builder.switchToBlock(thenId);
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(
                mergeId,
                thenValue !== undefined && resultType !== undefined
                    ? [thenValue]
                    : [],
            );
        }

        this.builder.switchToBlock(elseId);
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(
                mergeId,
                elseValue !== undefined && resultType !== undefined
                    ? [elseValue]
                    : [],
            );
        }

        this.builder.switchToBlock(mergeId);

        if (resultType !== undefined) {
            const currentFn = this.builder.currentFunction;
            if (currentFn !== undefined) {
                const mergeBlock = currentFn.blocks.find(
                    (b) => b.id === mergeId,
                );
                if (mergeBlock !== undefined) {
                    const [param] = mergeBlock.params;
                    return ok(param.id);
                }
            }
        }

        return ok(this.unitValue());
    }

    private lowerReturn(expr: ReturnExpr): Result<ValueId, LoweringError> {
        if (expr.value === undefined) {
            this.builder.ret();
            return ok(this.unitValue());
        }

        const valueResult = this.lowerExpression(expr.value);
        if (!valueResult.ok) {
            return valueResult;
        }

        this.builder.ret(valueResult.value);
        return ok(valueResult.value);
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
        return ok(this.unitValue());
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
        return ok(this.unitValue());
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
        if (!bodyResult.ok) {
            return bodyResult;
        }
        this.loopStack.pop();
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(header);
        }

        this.builder.switchToBlock(exit);
        return ok(this.unitValue());
    }

    private lowerWhile(expr: WhileExpr): Result<ValueId, LoweringError> {
        const header = this.builder.createBlock("while_header");
        const body = this.builder.createBlock("while_body");
        const exit = this.builder.createBlock("while_exit");

        this.builder.br(header);

        this.builder.switchToBlock(header);
        const condResult = this.lowerExpression(expr.condition);
        if (!condResult.ok) {
            return condResult;
        }
        this.builder.brIf(condResult.value, body, [], exit, []);

        this.builder.switchToBlock(body);
        this.loopStack.push({ breakBlock: exit, continueBlock: header });
        const bodyResult = this.lowerBlock(expr.body);
        if (!bodyResult.ok) {
            return bodyResult;
        }
        this.loopStack.pop();
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(header);
        }

        this.builder.switchToBlock(exit);
        return ok(this.unitValue());
    }

    static translateTypeNode(typeNode: TypeNode): IRType {
        if (typeNode instanceof NamedTypeNode) {
            const builtin = AstToSsaCtx.namedBuiltin(typeNode.name);
            if (builtin !== undefined) {
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
                return makeIRUnitType();
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
                return err("unsupported format token after `{`");
            }
            if (byte === "}") {
                const nextByte = literal[index + 1];
                if (nextByte === "}") {
                    index += 1;
                    continue;
                }
                return err("unmatched `}` in format string");
            }
        }
        return ok(count);
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

    private resolveFunctionId(name: string): number {
        const existing = this.functionIds.get(name);
        if (existing) {
            return existing;
        }
        if (name.includes("_")) {
            const [shortName] = name.split("_");
            const aliasTarget = this.functionIds.get(shortName);
            if (aliasTarget) {
                this.functionIds.set(name, aliasTarget);
                return aliasTarget;
            }
        }
        const value = hashName(name);
        this.functionIds.set(name, value);
        return value;
    }

    private isCurrentBlockTerminated(): boolean {
        const block = this.builder.currentBlock;
        if (!block) {
            return true;
        }
        return block.terminator !== undefined;
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
        return ok(id);
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
        modulePrefix ? `${modulePrefix}::${name}` : name;

    const registerStruct = (name: string, fields: string[], fieldTypes: IRType[]): void => {
        structFieldNames.set(name, fields);
        if (!irModule.structs.has(name)) {
            irModule.structs.set(name, makeIRStructType(name, fieldTypes));
        }
    };

    for (const item of items) {
        if (item instanceof StructItem || item instanceof GenericStructItem) {
            const names = item.fields.map((f) => f.name);
            const fieldTypes = item.fields.map((f) =>
                AstToSsaCtx.translateTypeNode(f.ty),
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
    seedStructMetadataForItems(moduleNode.items, irModule, structFieldNames, "");
}

function seedEnumMetadata(
    moduleNode: ModuleNode,
    irModule: IRModule,
    enumVariantTags: Map<string, number>,
): void {
    for (const item of moduleNode.items) {
        if (!(item instanceof EnumItem)) {
            continue;
        }
        const variantTypes: IRType[][] = item.variants.map(() => []);
        const enumType = makeIREnumType(item.name, variantTypes);
        if (!irModule.enums.has(item.name)) {
            addIREnum(irModule, item.name, enumType);
        }
        for (let index = 0; index < item.variants.length; index++) {
            const variant = item.variants[index];
            // Register both the short name (for pattern matching) and the
            // Fully-qualified name (for expression lowering)
            enumVariantTags.set(variant.name, index);
            enumVariantTags.set(`${item.name}::${variant.name}`, index);
        }
    }
}

function collectFunctionIds(moduleNode: ModuleNode): Map<string, number> {
    const fnIdMap = new Map<string, number>();
    for (const item of moduleNode.items) {
        collectItemFunctionIds(item, fnIdMap);
    }
    return fnIdMap;
}

function collectItemFunctionIds(
    item: ModuleNode["items"][number],
    fnIdMap: Map<string, number>,
    modulePrefix = "",
): void {
    const qualify = (name: string): string =>
        modulePrefix ? `${modulePrefix}::${name}` : name;

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
        for (const method of item.fnImpls) {
            fnIdMap.set(method.name, hashName(method.name));
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
        const targetName = item.path[item.path.length - 1];
        fnIdMap.set(targetName, hashName(targetName));
    }
}

function collectImplFunctionIds(
    item: ImplItem,
    fnIdMap: Map<string, number>,
    modulePrefix = "",
): void {
    const implTarget = item.target.name;
    const qualify = (name: string): string =>
        modulePrefix ? `${modulePrefix}::${name}` : name;
    const qImplTarget = qualify(implTarget);
    for (const method of item.methods) {
        fnIdMap.set(method.name, hashName(method.name));
        fnIdMap.set(`${implTarget}::${method.name}`, hashName(method.name));
        if (qImplTarget !== implTarget) {
            fnIdMap.set(`${qImplTarget}::${method.name}`, hashName(method.name));
        }
    }
}

function lowerOwnedFunction(
    fnItem: FnItem,
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    fnIdMap: Map<string, number>,
    monoRegistry?: MonomorphizationRegistry,
): void {
    const ctx = new AstToSsaCtx({
        irModule,
        structFieldNames,
        enumVariantTags,
        monoRegistry,
    });
    ctx.seedFunctionIds(fnIdMap);
    const lowered = ctx.lowerFunction(fnItem);
    if (!lowered.ok) {
        throw new Error(
            `Failed to lower function \`${fnItem.name}\`: ${lowered.error.message}`,
        );
    }
    addIRFunction(irModule, lowered.value);
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
                const mut =
                    p.receiverKind === ReceiverKind.refMut
                        ? Mutability.Mutable
                        : Mutability.Immutable;
                ty = new RefTypeNode(p.span, mut, ty);
            }
        }
        return {
            ...p,
            // Normalize receiver name: parser produces "Self" (capital) but the body uses "self".
            name: p.isReceiver ? "self" : p.name,
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

function lowerImplMethods(
    item: ImplItem,
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    fnIdMap: Map<string, number>,
    monoRegistry?: MonomorphizationRegistry,
): void {
    const implTarget =
        item.target instanceof NamedTypeNode ? item.target.name : "Self";
    if (implTarget === "Vec") {
        return;
    }
    for (const method of item.methods) {
        if (method instanceof GenericFnItem) {
            continue;
        }
        if (!method.body) {
            continue;
        }
        ensureImplStructMetadata(irModule, structFieldNames, implTarget);
        lowerOwnedFunction(
            rewriteSelfInMethod(method, implTarget),
            irModule,
            structFieldNames,
            enumVariantTags,
            fnIdMap,
            monoRegistry,
        );
    }
}

function lowerModuleItem(
    item: ModuleNode["items"][number],
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    fnIdMap: Map<string, number>,
    monoRegistry?: MonomorphizationRegistry,
): void {
    if (item instanceof GenericFnItem || item instanceof GenericStructItem) {
        return;
    }
    if (item instanceof FnItem && item.body) {
        lowerOwnedFunction(
            item,
            irModule,
            structFieldNames,
            enumVariantTags,
            fnIdMap,
            monoRegistry,
        );
        return;
    }
    if (item instanceof ImplItem) {
        lowerImplMethods(
            item,
            irModule,
            structFieldNames,
            enumVariantTags,
            fnIdMap,
            monoRegistry,
        );
        return;
    }
    if (item instanceof TraitImplItem) {
        for (const method of item.fnImpls) {
            if (method.body) {
                lowerOwnedFunction(
                    method,
                    irModule,
                    structFieldNames,
                    enumVariantTags,
                    fnIdMap,
                    monoRegistry,
                );
            }
        }
        return;
    }
    if (item instanceof ModItem) {
        for (const modItem of item.items) {
            lowerModuleItem(
                modItem,
                irModule,
                structFieldNames,
                enumVariantTags,
                fnIdMap,
                monoRegistry,
            );
        }
    }
}

export function lowerAstModuleToSsa(moduleNode: ModuleNode): IRModule {
    const irModule = makeIRModule(moduleNode.name);
    const structFieldNames = new Map<string, string[]>();
    const enumVariantTags = new Map<string, number>();
    seedStructMetadata(moduleNode, irModule, structFieldNames);
    seedEnumMetadata(moduleNode, irModule, enumVariantTags);

    // Collect generic items and generate monomorphized specializations
    const registry = new MonomorphizationRegistry();
    collectGenericItems(moduleNode, registry);
    const specializations = collectAndMonomorphize(moduleNode, registry);

    // Register specialization function IDs
    const fnIdMap = collectFunctionIds(moduleNode);
    for (const spec of specializations) {
        fnIdMap.set(spec.name, hashName(spec.name));
    }

    // Lower regular items (pass registry so calls to generics get rewritten)
    for (const item of moduleNode.items) {
        lowerModuleItem(
            item,
            irModule,
            structFieldNames,
            enumVariantTags,
            fnIdMap,
            registry,
        );
    }

    // Lower monomorphized specializations
    for (const spec of specializations) {
        lowerOwnedFunction(
            spec,
            irModule,
            structFieldNames,
            enumVariantTags,
            fnIdMap,
            registry,
        );
    }

    return irModule;
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
    if (expr instanceof IdentifierExpr) {
        // Cannot determine type without full context
        return undefined;
    }
    return undefined;
}
