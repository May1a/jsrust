import {
    type AssignExpr,
    BinaryExpr,
    BinaryOp,
    type BlockExpr,
    type BreakExpr,
    BuiltinType,
    type CallExpr,
    type ContinueExpr,
    ExprStmt,
    type Expression,
    FnItem,
    IdentPattern,
    IdentifierExpr,
    type IfExpr,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    type LoopExpr,
    type MatchExpr,
    type ModuleNode,
    NamedTypeNode,
    type ReturnExpr,
    type Span,
    type Statement,
    type TypeNode,
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
    | "visitIfExpr"
    | "visitBlockExpr"
    | "visitReturnExpr"
    | "visitBreakExpr"
    | "visitContinueExpr"
    | "visitLoopExpr"
    | "visitWhileExpr"
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
    type FloatType,
    type IRFunction,
    type IRModule,
    type IRType,
    type IntType,
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

// Hash constants for djb2 algorithm
const HASH_INITIAL_VALUE = 5381;
const HASH_MULTIPLIER = 33;

// Default values for type initialization
const DEFAULT_INT_VALUE = 0;
const DEFAULT_FLOAT_VALUE = 0;
const DEFAULT_UNIT_VALUE = 0;
const STRING_FIRST_CHAR_INDEX = 0;
const DEFAULT_CHAR_CODE = 0;

// Loop frame access
const LAST_FRAME_INDEX = -1;

const ZERO = 0;

function hashName(name: string): number {
    // Djb2 hash algorithm - requires bitwise operations for correct hashing
    let hash = HASH_INITIAL_VALUE;
    for (let i = 0; i < name.length; i++) {
        hash = Math.imul(hash, HASH_MULTIPLIER) + name.charCodeAt(i);
        hash |= ZERO;
    }
    return hash >>> ZERO;
}

export class AstToSsaCtx {
    readonly builder: IRBuilder;
    readonly irModule: IRModule;
    private readonly locals: Map<string, LocalBinding>;
    private readonly functionIds: Map<string, number>;
    private loopStack: LoopFrame[];
    private currentReturnType: IRType;

    constructor(options: { irModule?: IRModule } = {}) {
        this.builder = new IRBuilder();
        this.irModule = options.irModule ?? makeIRModule("main");
        this.locals = new Map();
        this.functionIds = new Map();
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

        const paramEntries = [...fnDecl.params.entries()];
        const paramTypes = paramEntries.map(([, ty]) =>
            AstToSsaCtx.translateTypeNode(ty),
        );
        this.currentReturnType = AstToSsaCtx.translateTypeNode(
            fnDecl.returnType,
        );

        this.builder.createFunction(
            fnDecl.name,
            paramTypes,
            this.currentReturnType,
        );
        const entryId = this.builder.createBlock("entry");
        this.builder.switchToBlock(entryId);

        for (let i = 0; i < paramEntries.length; i++) {
            const paramEntry = paramEntries[i];
            const [name, typeNode] = paramEntry;
            const irType = AstToSsaCtx.translateTypeNode(typeNode);
            const allocaInst = this.builder.alloca(irType);
            const allocaId = allocaInst.id;
            const paramId = this.builder.currentFunction?.params[i]?.id;
            if (
                paramId !== null &&
                typeof paramId !== "undefined" &&
                allocaId !== null
            ) {
                this.builder.store(allocaId, paramId, irType);
            }
            if (allocaId !== null) {
                this.locals.set(name, { ptr: allocaId, ty: irType });
            }
        }

        const bodyResult = this.lowerBlock(fnDecl.body);
        if (!bodyResult.ok) {
            return bodyResult;
        }

        if (!this.isCurrentBlockTerminated()) {
            if (this.currentTypeKind() === IRTypeKind.Unit) {
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
            const ty = AstToSsaCtx.translateTypeNode(stmt.type);
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
        return expr.accept(visitor);
    }

    private getExpressionVisitor(): ExpressionVisitor<
        Result<ValueId, LoweringError>
    > {
        return {
            visitLiteralExpr: (expr: LiteralExpr) => this.lowerLiteral(expr),
            visitIdentifierExpr: (expr: IdentifierExpr) =>
                this.lowerIdentifier(expr),
            visitBinaryExpr: (expr: BinaryExpr) => this.lowerBinary(expr),
            visitUnaryExpr: (expr: UnaryExpr) => this.lowerUnary(expr),
            visitAssignExpr: (expr: AssignExpr) => this.lowerAssign(expr),
            visitCallExpr: (expr: CallExpr) => this.lowerCall(expr),
            visitIfExpr: (expr: IfExpr) => this.lowerIf(expr),
            visitBlockExpr: (expr: BlockExpr) => {
                const blockResult = this.lowerBlock(expr);
                if (!blockResult.ok) {
                    return blockResult;
                }
                if (blockResult.value === null) {
                    return ok(this.unitValue());
                }
                return ok(blockResult.value);
            },
            visitReturnExpr: (expr: ReturnExpr) => this.lowerReturn(expr),
            visitBreakExpr: (expr: BreakExpr) => this.lowerBreak(expr),
            visitContinueExpr: (expr: ContinueExpr) => this.lowerContinue(expr),
            visitLoopExpr: (expr: LoopExpr) => this.lowerLoop(expr),
            visitWhileExpr: (expr: WhileExpr) => this.lowerWhile(expr),
            visitMatchExpr: (expr: MatchExpr) =>
                loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "match lowering is intentionally omitted in the small-scale AST refactor",
                    expr.span,
                ),
        };
    }

    private lowerLiteral(expr: LiteralExpr): Result<ValueId, LoweringError> {
        switch (expr.literalKind) {
            case LiteralKind.Int: {
                let value: number;
                if (typeof expr.value === "number") {
                    value = expr.value;
                } else {
                    value = Number(expr.value);
                }
                const constInst = this.builder.iconst(value, IntWidth.I32);
                return AstToSsaCtx.handleInstructionId(constInst.id);
            }
            case LiteralKind.Float: {
                let value: number;
                if (typeof expr.value === "number") {
                    value = expr.value;
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
                let cp: number;
                if (typeof expr.value === "string") {
                    cp =
                        expr.value.codePointAt(STRING_FIRST_CHAR_INDEX) ??
                        DEFAULT_CHAR_CODE;
                } else {
                    cp = Number(expr.value);
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
        if (binding !== null && typeof binding !== "undefined") {
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
        if (binding === null || typeof binding === "undefined") {
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
                    { start: 0, end: 0, fileId: 0 },
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
                    { start: 0, end: 0, fileId: 0 },
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
                    { start: 0, end: 0, fileId: 0 },
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

        const retTy = makeIRIntType(IntWidth.I64);
        if (expr.callee instanceof IdentifierExpr) {
            const fnId = this.resolveFunctionId(expr.callee.name);
            const callInst = this.builder.call(fnId, args, retTy);
            return ok(callInst.id);
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
            if (builtin !== undefined) {
                return AstToSsaCtx.builtinToIrType(builtin);
            }
            return makeIRStructType(typeNode.name, []);
        }
        return makeIRUnitType();
    }

    static namedBuiltin(name: string): BuiltinType | null {
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
                return makeIRPtrType();
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
        const { kind } = ty;
        if (kind === IRTypeKind.Bool) {
            const constInst = this.builder.bconst(false);
            return constInst.id;
        }
        if (kind === IRTypeKind.Int) {
            const intType = ty as IntType;
            const constInst = this.builder.iconst(
                DEFAULT_INT_VALUE,
                intType.width ?? IntWidth.I32,
            );
            return constInst.id;
        }
        if (kind === IRTypeKind.Float) {
            const floatType = ty as FloatType;
            const constInst = this.builder.fconst(
                DEFAULT_FLOAT_VALUE,
                floatType.width ?? FloatWidth.F64,
            );
            return constInst.id;
        }
        if (kind === IRTypeKind.Ptr) {
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
        const value = hashName(name);
        this.functionIds.set(name, value);
        return value;
    }

    private isCurrentBlockTerminated(): boolean {
        const block = this.builder.currentBlock;
        if (block === null) {
            return true;
        }
        return block.terminator !== null;
    }

    private sealAllBlocks(): void {
        const blocks = this.builder.currentFunction?.blocks ?? [];
        for (const block of blocks) {
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
                { start: 0, end: 0 },
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

export function lowerAstModuleToSsa(moduleNode: ModuleNode): IRModule {
    const irModule = makeIRModule(moduleNode.name);

    const fnIdMap = new Map<string, number>();
    for (const item of moduleNode.items) {
        if (item instanceof FnItem) {
            fnIdMap.set(item.name, hashName(item.name));
        }
    }

    for (const item of moduleNode.items) {
        if (!(item instanceof FnItem)) {
            continue;
        }
        const ctx = new AstToSsaCtx({ irModule });
        ctx.seedFunctionIds(fnIdMap);
        const lowered = ctx.lowerFunction(item);
        if (lowered.ok) {
            addIRFunction(irModule, lowered.value);
        }
    }

    return irModule;
}
