import {
    type AssignExpr,
    BinaryExpr,
    BinaryOp,
    type BlockExpr,
    type BreakExpr,
    BuiltinType,
    type CallExpr,
    type ClosureExpr,
    type ContinueExpr,
    type DerefExpr,
    ExprStmt,
    type Expression,
    FieldExpr,
    FnItem,
    type ForExpr,
    ImplItem,
    IdentPattern,
    IdentifierExpr,
    type IndexExpr,
    type IfExpr,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    type LoopExpr,
    type MacroExpr,
    type MatchExpr,
    ModItem,
    type ModuleNode,
    NamedTypeNode,
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
} from "./ast";
import { type Result, err, ok, okVoid } from "./diagnostics";

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
    addIRFunction,
    FcmpOp,
    FloatWidth,
    IcmpOp,
    IntWidth,
    internIRStringLiteral,
    IRTypeKind,
    makeIRBoolType,
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

// Loop frame access
const LAST_FRAME_INDEX = -1;

const ZERO = 0;

function hashName(name: string): number {
    // Keep in sync with backend/src/bytes.c: ByteSpan_hashFunctionId
    let hash = ZERO;
    for (let i = 0; i < name.length; i++) {
        hash = (Math.imul(hash, HASH_FACTOR) + name.charCodeAt(i)) | ZERO;
        hash |= ZERO;
    }
    if (hash < ZERO) {
        hash = -hash;
    }
    return hash % HASH_MODULUS;
}

function zeroSpan(): Span {
    return new Span(ZERO, ZERO, ZERO, ZERO);
}

export class AstToSsaCtx {
    readonly builder: IRBuilder;
    readonly irModule: IRModule;
    private readonly locals: Map<string, LocalBinding>;
    private readonly functionIds: Map<string, number>;
    private readonly structFieldNames: Map<string, string[]>;
    private loopStack: LoopFrame[];
    private currentReturnType: IRType;

    constructor(
        options: {
            irModule?: IRModule;
            structFieldNames?: Map<string, string[]>;
        } = {},
    ) {
        this.builder = new IRBuilder();
        this.irModule = options.irModule ?? makeIRModule("main");
        this.locals = new Map();
        this.functionIds = new Map();
        this.structFieldNames = options.structFieldNames ?? new Map();
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
            if (typeof bodyResult.value !== "undefined") {
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
            if (param.isReceiver) {
                continue;
            }
            if (!param.ty) {
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Function parameter is missing a type",
                    fnDecl.span,
                );
            }
            params.push({ name: param.name, ty: param.ty });
        }
        return ok(params);
    }

    private startFunction(name: string, paramTypes: IRType[]): void {
        this.builder.createFunction(name, paramTypes, this.currentReturnType);
        const entryId = this.builder.createBlock("entry");
        this.builder.switchToBlock(entryId);
    }

    private bindFunctionParams(params: { name?: string; ty: TypeNode }[]): void {
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
            this.locals.set(paramEntry.name ?? "_", { ptr: allocaId, ty: irType });
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

        if (typeof block.expr === "undefined") {
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
                if (typeof inferred !== "undefined") {
                    ty = inferred;
                }
            }
            const slot = this.builder.alloca(ty);
            const slotId = slot.id;
            this.builder.store(slotId, initResult.value, ty);
            this.locals.set(stmt.pattern.name, {
                ptr: slotId,
                ty,
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
        const expressionVisitors: ExpressionVisitor<Result<ValueId, LoweringError>> = {
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
                if (typeof blockResult.value === "undefined") {
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
            visitStructExpr: (expr: StructExpr) => this.lowerStructLiteral(expr),
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
            visitTupleTypeNode: () => unsupported("TupleTypeNode"),
            visitArrayTypeNode: () => unsupported("ArrayTypeNode"),
            visitRefTypeNode: () => unsupported("RefTypeNode"),
            visitPtrTypeNode: () => unsupported("PtrTypeNode"),
            visitFnTypeNode: () => unsupported("FnTypeNode"),
            visitGenericArgsNode: () => unsupported("GenericArgsNode"),
            visitModuleNode: () => unsupported("ModuleNode"),
            visitMatchArmNode: () => unsupported("MatchArmNode"),
            visitTraitMethod: () => unsupported("TraitMethod"),
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
        if (typeof binding !== "undefined") {
            const loadInst = this.builder.load(binding.ptr, binding.ty);
            return AstToSsaCtx.handleInstructionId(loadInst.id);
        }

        const fnId = this.resolveFunctionId(expr.name);
        const constInst = this.builder.iconst(fnId, IntWidth.I64);
        return AstToSsaCtx.handleInstructionId(constInst.id);
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
        if (typeof binding === "undefined") {
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
                    this.builder.iconst(ZERO, IntWidth.I32).id,
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

    private resolveReceiverArg(callee: FieldExpr, receiverValue: ValueId): ValueId {
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
        const parts = name.split("::");
        const lastPart = parts[parts.length - 1];
        if (parts.length > 1 && lastPart === "new") {
            return makeIRStructType(parts[0], []);
        }
        return fallback;
    }

    private lowerMacro(expr: MacroExpr): Result<ValueId, LoweringError> {
        switch (expr.name) {
            case "print":
            case "println":
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

    private lowerStructLiteral(expr: StructExpr): Result<ValueId, LoweringError> {
        if (!(expr.path instanceof IdentifierExpr)) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "Unsupported struct constructor path",
                expr.span,
            );
        }

        const structName = expr.path.name;
        const fieldOrder =
            this.structFieldNames.get(structName) ?? [...expr.fields.keys()];
        if (fieldOrder.length === ZERO) {
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
        const structType = existingType ?? makeIRStructType(structName, fieldTypes);
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
            if (inner.kind === IRTypeKind.Struct) {
                const deref = this.builder.load(baseValue, inner);
                baseValue = deref.id;
                baseType = inner;
            }
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
        if (index < ZERO) {
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
        const merge = this.builder.createBlock("match_merge");
        const cases: { value: number; target: BlockId; args: ValueId[] }[] = [];
        let defaultBlock = merge;

        for (let index = 0; index < expr.arms.length; index++) {
            const arm = expr.arms[index];
            if ("literalKind" in arm.pattern && "value" in arm.pattern) {
                const raw = arm.pattern.value;
                const value =
                    typeof raw === "number" ? raw : Number(raw);
                cases.push({ value, target: armBlocks[index], args: [] });
            } else {
                defaultBlock = armBlocks[index];
            }
        }

        this.builder.switch(scrutinee.value, cases, defaultBlock, []);

        for (let index = 0; index < expr.arms.length; index++) {
            const arm = expr.arms[index];
            this.builder.switchToBlock(armBlocks[index]);
            const body = this.lowerExpression(arm.body);
            if (!body.ok) {
                return body;
            }
            if (!this.isCurrentBlockTerminated()) {
                this.builder.br(merge);
            }
        }

        this.builder.switchToBlock(merge);
        return ok(this.unitValue());
    }

    private lowerIf(expr: IfExpr): Result<ValueId, LoweringError> {
        const condResult = this.lowerExpression(expr.condition);
        if (!condResult.ok) return condResult;

        const thenId = this.builder.createBlock("if_then");
        const elseId = this.builder.createBlock("if_else");
        const mergeId = this.builder.createBlock("if_merge");

        this.builder.brIf(condResult.value, thenId, [], elseId, []);

        this.builder.switchToBlock(thenId);
        const thenResult = this.lowerBlock(expr.thenBranch);
        if (!thenResult.ok) {
            return thenResult;
        }
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(mergeId);
        }

        this.builder.switchToBlock(elseId);
        if (expr.elseBranch) {
            const elseResult = this.lowerExpression(expr.elseBranch);
            if (!elseResult.ok) return elseResult;
        }
        if (!this.isCurrentBlockTerminated()) {
            this.builder.br(mergeId);
        }

        this.builder.switchToBlock(mergeId);
        return ok(this.unitValue());
    }

    private lowerReturn(expr: ReturnExpr): Result<ValueId, LoweringError> {
        if (typeof expr.value === "undefined") {
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

    private static translateTypeNode(typeNode: TypeNode): IRType {
        if (typeNode instanceof NamedTypeNode) {
            const builtin = AstToSsaCtx.namedBuiltin(typeNode.name);
            if (typeof builtin !== "undefined") {
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

    private defaultValueForType(ty: IRType): ValueId {
        if (ty.kind === IRTypeKind.Bool) {
            const constInst = this.builder.bconst(false);
            return constInst.id;
        }
        if (ty instanceof IntType) {
            const constInst = this.builder.iconst(
                DEFAULT_INT_VALUE,
                ty.width,
            );
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
        return typeof block.terminator !== "undefined";
    }

    private isImplicitUnitTypeNode(typeNode: TypeNode): boolean {
        return (
            typeNode instanceof NamedTypeNode &&
            typeNode.name.toLowerCase() === "unit"
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

function seedStructMetadata(
    moduleNode: ModuleNode,
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
): void {
    for (const item of moduleNode.items) {
        if (!(item instanceof StructItem)) {
            continue;
        }
        const names = item.fields.map(f => f.name);
        structFieldNames.set(item.name, names);
        if (!irModule.structs.has(item.name)) {
            irModule.structs.set(
                item.name,
                makeIRStructType(
                    item.name,
                    names.map(() => makeIRUnitType()),
                ),
            );
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

function collectItemFunctionIds(item: ModuleNode["items"][number], fnIdMap: Map<string, number>): void {
    if (item instanceof FnItem && item.body) {
        fnIdMap.set(item.name, hashName(item.name));
        return;
    }
    if (item instanceof ImplItem) {
        collectImplFunctionIds(item, fnIdMap);
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
            if (modItem instanceof FnItem && modItem.body) {
                fnIdMap.set(modItem.name, hashName(modItem.name));
                fnIdMap.set(
                    `${item.name}::${modItem.name}`,
                    hashName(modItem.name),
                );
            }
        }
        return;
    }
    if (item instanceof UseItem) {
        const targetName = item.path[item.path.length - 1];
        fnIdMap.set(targetName, hashName(targetName));
    }
}

function collectImplFunctionIds(item: ImplItem, fnIdMap: Map<string, number>): void {
    const implTarget =
        item.target instanceof NamedTypeNode ? item.target.name : "Self";
    if (implTarget === "Vec") {
        return;
    }
    for (const method of item.methods) {
        fnIdMap.set(method.name, hashName(method.name));
        fnIdMap.set(`${implTarget}::${method.name}`, hashName(method.name));
    }
}

function lowerOwnedFunction(
    fnItem: FnItem,
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    fnIdMap: Map<string, number>,
): void {
    const ctx = new AstToSsaCtx({ irModule, structFieldNames });
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
        structFieldNames.set(implTarget, [...(structFieldNames.get("Self") ?? [])]);
    }
    const selfStruct = irModule.structs.get("Self");
    if (!selfStruct) {
        return;
    }
    const targetStruct = irModule.structs.get(implTarget);
    const targetNeedsUpgrade =
        !targetStruct ||
        targetStruct.fields.every(field => field.kind === IRTypeKind.Unit);
    if (targetNeedsUpgrade) {
        irModule.structs.set(
            implTarget,
            makeIRStructType(implTarget, [...selfStruct.fields]),
        );
    }
}

function rewriteNewMethodReturnType(method: FnItem, implTarget: string): FnItem {
    const returnsUnit = isUnitNamedTypeNode(method.returnType);
    if (method.name !== "new" || !returnsUnit) {
        return method;
    }
    return new FnItem(
        method.span,
        method.name,
        method.params,
        new NamedTypeNode(method.returnType.span, implTarget),
        method.body,
        method.derives,
        method.builtinName,
    );
}

function isUnitNamedTypeNode(typeNode: TypeNode): boolean {
    return typeNode instanceof NamedTypeNode && typeNode.name === "unit";
}

export function lowerAstModuleToSsa(moduleNode: ModuleNode): IRModule {
    const irModule = makeIRModule(moduleNode.name);
    const structFieldNames = new Map<string, string[]>();
    seedStructMetadata(moduleNode, irModule, structFieldNames);
    const fnIdMap = collectFunctionIds(moduleNode);

    for (const item of moduleNode.items) {
        if (item instanceof FnItem && item.body) {
            lowerOwnedFunction(item, irModule, structFieldNames, fnIdMap);
            continue;
        }
        if (item instanceof ImplItem) {
            const implTarget =
                item.target instanceof NamedTypeNode
                    ? item.target.name
                    : "Self";
            if (implTarget === "Vec") {
                continue;
            }
            for (const method of item.methods) {
                if (!method.body) {
                    continue;
                }
                ensureImplStructMetadata(irModule, structFieldNames, implTarget);
                lowerOwnedFunction(
                    rewriteNewMethodReturnType(method, implTarget),
                    irModule,
                    structFieldNames,
                    fnIdMap,
                );
            }
            continue;
        }
        if (item instanceof TraitImplItem) {
            for (const method of item.fnImpls) {
                if (!method.body) {
                    continue;
                }
                lowerOwnedFunction(method, irModule, structFieldNames, fnIdMap);
            }
            continue;
        }
        if (item instanceof ModItem) {
            for (const modItem of item.items) {
                if (!(modItem instanceof FnItem) || !modItem.body) {
                    continue;
                }
                lowerOwnedFunction(modItem, irModule, structFieldNames, fnIdMap);
            }
        }
    }

    return irModule;
}
