import {
    AssignExpr,
    BinaryExpr,
    BinaryOp,
    BlockExpr,
    BreakExpr,
    BuiltinType,
    CallExpr,
    ContinueExpr,
    ExprStmt,
    type Expression,
    FnItem,
    IdentPattern,
    IdentifierExpr,
    IfExpr,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    LoopExpr,
    MatchExpr,
    type ModuleNode,
    NamedTypeNode,
    ReturnExpr,
    Span,
    type Statement,
    type TypeNode,
    UnaryExpr,
    UnaryOp,
    WhileExpr,
} from "./ast";
import { type Result, err, ok } from "./diagnostics";
import {
    addIRFunction,
    FcmpOp,
    FloatWidth,
    IcmpOp,
    IntWidth,
    type IRFunction,
    type IRModule,
    type IRType,
    IRTypeKind,
    type ValueId,
    internIRStringLiteral,
    makeIRBoolType,
    makeIRFloatType,
    makeIRIntType,
    makeIRModule,
    makeIRPtrType,
    makeIRStructType,
    makeIRUnitType,
    type BlockId,
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

function hashName(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 1_000_000;
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
            this.translateTypeNode(ty),
        );
        this.currentReturnType = this.translateTypeNode(fnDecl.returnType);

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
            const irType = this.translateTypeNode(typeNode);
            const allocaInst = this.builder.alloca(irType);
            const allocaId = this.instId(allocaInst.id);
            const paramId = this.builder.currentFunction?.params[i]?.id;
            if (paramId !== undefined) {
                this.builder.store(allocaId, paramId, irType);
            }
            this.locals.set(name, { ptr: allocaId, ty: irType });
        }

        const bodyResult = this.lowerBlock(fnDecl.body);
        if (!bodyResult.ok) {
            return bodyResult;
        }

        if (!this.isCurrentBlockTerminated()) {
            if (this.currentTypeKind() === IRTypeKind.Unit) {
                this.builder.ret(null);
            } else {
                this.builder.ret(
                    this.defaultValueForType(this.currentReturnType),
                );
            }
        }

        this.sealAllBlocks();
        return ok(this.builder.build());
    }

    private lowerBlock(
        block: BlockExpr,
    ): Result<ValueId | null, LoweringError> {
        for (const stmt of block.stmts) {
            const stmtResult = this.lowerStatement(stmt);
            if (!stmtResult.ok) {
                return stmtResult;
            }
            if (this.isCurrentBlockTerminated()) {
                return ok(null);
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
            return ok(undefined);
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
            const ty = this.translateTypeNode(stmt.type);
            const slot = this.builder.alloca(ty);
            const slotId = this.instId(slot.id);
            this.builder.store(slotId, initResult.value, ty);
            this.locals.set(stmt.pattern.name, {
                ptr: slotId,
                ty,
            });
        }
        return ok(undefined);
    }

    private lowerExpression(expr: Expression): Result<ValueId, LoweringError> {
        if (expr instanceof LiteralExpr) {
            return this.lowerLiteral(expr);
        }
        if (expr instanceof IdentifierExpr) {
            return this.lowerIdentifier(expr);
        }
        if (expr instanceof BinaryExpr) {
            return this.lowerBinary(expr);
        }
        if (expr instanceof UnaryExpr) {
            return this.lowerUnary(expr);
        }
        if (expr instanceof AssignExpr) {
            return this.lowerAssign(expr);
        }
        if (expr instanceof CallExpr) {
            return this.lowerCall(expr);
        }
        if (expr instanceof IfExpr) {
            return this.lowerIf(expr);
        }
        if (expr instanceof BlockExpr) {
            const blockResult = this.lowerBlock(expr);
            if (!blockResult.ok) {
                return blockResult;
            }
            if (blockResult.value === null) {
                return ok(this.unitValue());
            }
            return ok(blockResult.value);
        }
        if (expr instanceof ReturnExpr) {
            return this.lowerReturn(expr);
        }
        if (expr instanceof BreakExpr) {
            return this.lowerBreak(expr);
        }
        if (expr instanceof ContinueExpr) {
            return this.lowerContinue(expr);
        }
        if (expr instanceof LoopExpr) {
            return this.lowerLoop(expr);
        }
        if (expr instanceof WhileExpr) {
            return this.lowerWhile(expr);
        }
        if (expr instanceof MatchExpr) {
            return loweringError(
                LoweringErrorKind.UnsupportedNode,
                "match lowering is intentionally omitted in the small-scale AST refactor",
                expr.span,
            );
        }

        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            `Unsupported expression: ${expr.constructor.name}`,
            expr.span,
        );
    }

    private lowerLiteral(expr: LiteralExpr): Result<ValueId, LoweringError> {
        switch (expr.literalKind) {
            case LiteralKind.Int: {
                const value =
                    typeof expr.value === "number"
                        ? expr.value
                        : Number(expr.value);
                return ok(
                    this.instId(this.builder.iconst(value, IntWidth.I32).id),
                );
            }
            case LiteralKind.Float: {
                const value =
                    typeof expr.value === "number"
                        ? expr.value
                        : Number(expr.value);
                return ok(
                    this.instId(this.builder.fconst(value, FloatWidth.F64).id),
                );
            }
            case LiteralKind.Bool:
                return ok(
                    this.instId(this.builder.bconst(Boolean(expr.value)).id),
                );
            case LiteralKind.String: {
                const literalId = internIRStringLiteral(
                    this.irModule,
                    String(expr.value),
                );
                return ok(this.instId(this.builder.sconst(literalId).id));
            }
            case LiteralKind.Char: {
                const cp =
                    typeof expr.value === "string"
                        ? (expr.value.codePointAt(0) ?? 0)
                        : Number(expr.value);
                return ok(
                    this.instId(this.builder.iconst(cp, IntWidth.U32).id),
                );
            }
            default:
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported literal kind",
                    expr.span,
                );
        }
    }

    private lowerIdentifier(
        expr: IdentifierExpr,
    ): Result<ValueId, LoweringError> {
        const binding = this.locals.get(expr.name);
        if (binding !== undefined) {
            return ok(
                this.instId(this.builder.load(binding.ptr, binding.ty).id),
            );
        }

        const fnId = this.resolveFunctionId(expr.name);
        return ok(this.instId(this.builder.iconst(fnId, IntWidth.I64).id));
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

        switch (expr.op) {
            case BinaryOp.Add:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fadd(left, right, FloatWidth.F64)
                            : this.builder.iadd(left, right, IntWidth.I32)
                        ).id,
                    ),
                );
            case BinaryOp.Sub:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fsub(left, right, FloatWidth.F64)
                            : this.builder.isub(left, right, IntWidth.I32)
                        ).id,
                    ),
                );
            case BinaryOp.Mul:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fmul(left, right, FloatWidth.F64)
                            : this.builder.imul(left, right, IntWidth.I32)
                        ).id,
                    ),
                );
            case BinaryOp.Div:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fdiv(left, right, FloatWidth.F64)
                            : this.builder.idiv(left, right, IntWidth.I32)
                        ).id,
                    ),
                );
            case BinaryOp.Rem:
                return ok(
                    this.instId(
                        this.builder.imod(left, right, IntWidth.I32).id,
                    ),
                );
            case BinaryOp.Eq:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fcmp(FcmpOp.Oeq, left, right)
                            : this.builder.icmp(IcmpOp.Eq, left, right)
                        ).id,
                    ),
                );
            case BinaryOp.Ne:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fcmp(FcmpOp.One, left, right)
                            : this.builder.icmp(IcmpOp.Ne, left, right)
                        ).id,
                    ),
                );
            case BinaryOp.Lt:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fcmp(FcmpOp.Olt, left, right)
                            : this.builder.icmp(IcmpOp.Slt, left, right)
                        ).id,
                    ),
                );
            case BinaryOp.Le:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fcmp(FcmpOp.Ole, left, right)
                            : this.builder.icmp(IcmpOp.Sle, left, right)
                        ).id,
                    ),
                );
            case BinaryOp.Gt:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fcmp(FcmpOp.Ogt, left, right)
                            : this.builder.icmp(IcmpOp.Sgt, left, right)
                        ).id,
                    ),
                );
            case BinaryOp.Ge:
                return ok(
                    this.instId(
                        (isFloat
                            ? this.builder.fcmp(FcmpOp.Oge, left, right)
                            : this.builder.icmp(IcmpOp.Sge, left, right)
                        ).id,
                    ),
                );
            case BinaryOp.And:
            case BinaryOp.BitAnd:
                return ok(
                    this.instId(this.builder.iand(left, right, IntWidth.I8).id),
                );
            case BinaryOp.Or:
            case BinaryOp.BitOr:
                return ok(
                    this.instId(this.builder.ior(left, right, IntWidth.I8).id),
                );
            case BinaryOp.BitXor:
                return ok(
                    this.instId(
                        this.builder.ixor(left, right, IntWidth.I32).id,
                    ),
                );
            case BinaryOp.Shl:
                return ok(
                    this.instId(
                        this.builder.ishl(left, right, IntWidth.I32).id,
                    ),
                );
            case BinaryOp.Shr:
                return ok(
                    this.instId(
                        this.builder.ishr(left, right, IntWidth.I32).id,
                    ),
                );
            default:
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported binary operation",
                    expr.span,
                );
        }
    }

    private lowerUnary(expr: UnaryExpr): Result<ValueId, LoweringError> {
        const operandResult = this.lowerExpression(expr.operand);
        if (!operandResult.ok) {
            return operandResult;
        }
        const operand = operandResult.value;

        switch (expr.op) {
            case UnaryOp.Neg: {
                if (this.isFloatish(expr.operand)) {
                    return ok(
                        this.instId(
                            this.builder.fneg(operand, FloatWidth.F64).id,
                        ),
                    );
                }
                return ok(
                    this.instId(this.builder.ineg(operand, IntWidth.I32).id),
                );
            }
            case UnaryOp.Not: {
                const oneId = this.instId(this.builder.bconst(true).id);
                return ok(
                    this.instId(
                        this.builder.ixor(operand, oneId, IntWidth.I8).id,
                    ),
                );
            }
            case UnaryOp.Ref: {
                if (expr.operand instanceof IdentifierExpr) {
                    const binding = this.locals.get(expr.operand.name);
                    if (binding === undefined) {
                        return loweringError(
                            LoweringErrorKind.UnknownVariable,
                            `Unknown variable '${expr.operand.name}'`,
                            expr.operand.span,
                        );
                    }
                    return ok(binding.ptr);
                }

                const ptrTy = makeIRIntType(IntWidth.I64);
                const ptrId = this.instId(this.builder.alloca(ptrTy).id);
                this.builder.store(ptrId, operand, ptrTy);
                return ok(ptrId);
            }
            case UnaryOp.Deref:
                return ok(
                    this.instId(
                        this.builder.load(operand, makeIRIntType(IntWidth.I64))
                            .id,
                    ),
                );
            default:
                return loweringError(
                    LoweringErrorKind.UnsupportedNode,
                    "Unsupported unary operation",
                    expr.span,
                );
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
            return ok(this.instId(this.builder.call(fnId, args, retTy).id));
        }

        const calleeResult = this.lowerExpression(expr.callee);
        if (!calleeResult.ok) {
            return calleeResult;
        }
        return ok(
            this.instId(
                this.builder.callDyn(calleeResult.value, args, retTy).id,
            ),
        );
    }

    private lowerIf(expr: IfExpr): Result<ValueId, LoweringError> {
        const condResult = this.lowerExpression(expr.condition);
        if (!condResult.ok) {
            return condResult;
        }

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
        if (expr.elseBranch !== undefined) {
            const elseResult = this.lowerExpression(expr.elseBranch);
            if (!elseResult.ok) {
                return elseResult;
            }
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
        const frame = this.loopStack.at(-1);
        if (frame === undefined) {
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
        const frame = this.loopStack.at(-1);
        if (frame === undefined) {
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

    private translateTypeNode(typeNode: TypeNode): IRType {
        if (typeNode instanceof NamedTypeNode) {
            const builtin = this.namedBuiltin(typeNode.name);
            if (builtin !== null) {
                return this.builtinToIrType(builtin);
            }
            return makeIRStructType(typeNode.name, []);
        }
        return makeIRUnitType();
    }

    private namedBuiltin(name: string): BuiltinType | null {
        const n = name.toLowerCase();
        switch (n) {
            case "i8":
                return BuiltinType.I8;
            case "i16":
                return BuiltinType.I16;
            case "i32":
                return BuiltinType.I32;
            case "i64":
                return BuiltinType.I64;
            case "i128":
                return BuiltinType.I128;
            case "isize":
                return BuiltinType.Isize;
            case "u8":
                return BuiltinType.U8;
            case "u16":
                return BuiltinType.U16;
            case "u32":
                return BuiltinType.U32;
            case "u64":
                return BuiltinType.U64;
            case "u128":
                return BuiltinType.U128;
            case "usize":
                return BuiltinType.Usize;
            case "f32":
                return BuiltinType.F32;
            case "f64":
                return BuiltinType.F64;
            case "bool":
                return BuiltinType.Bool;
            case "char":
                return BuiltinType.Char;
            case "str":
                return BuiltinType.Str;
            case "unit":
                return BuiltinType.Unit;
            case "never":
                return BuiltinType.Never;
            default:
                return null;
        }
    }

    private builtinToIrType(ty: BuiltinType): IRType {
        switch (ty) {
            case BuiltinType.I8:
                return makeIRIntType(IntWidth.I8);
            case BuiltinType.I16:
                return makeIRIntType(IntWidth.I16);
            case BuiltinType.I32:
                return makeIRIntType(IntWidth.I32);
            case BuiltinType.I64:
                return makeIRIntType(IntWidth.I64);
            case BuiltinType.I128:
                return makeIRIntType(IntWidth.I128);
            case BuiltinType.Isize:
                return makeIRIntType(IntWidth.Isize);
            case BuiltinType.U8:
                return makeIRIntType(IntWidth.U8);
            case BuiltinType.U16:
                return makeIRIntType(IntWidth.U16);
            case BuiltinType.U32:
                return makeIRIntType(IntWidth.U32);
            case BuiltinType.U64:
                return makeIRIntType(IntWidth.U64);
            case BuiltinType.U128:
                return makeIRIntType(IntWidth.U128);
            case BuiltinType.Usize:
                return makeIRIntType(IntWidth.Usize);
            case BuiltinType.F32:
                return makeIRFloatType(FloatWidth.F32);
            case BuiltinType.F64:
                return makeIRFloatType(FloatWidth.F64);
            case BuiltinType.Bool:
                return makeIRBoolType();
            case BuiltinType.Char:
                return makeIRIntType(IntWidth.U32);
            case BuiltinType.Str:
                return makeIRPtrType(null);
            case BuiltinType.Unit:
            case BuiltinType.Never:
                return makeIRUnitType();
            default:
                return makeIRUnitType();
        }
    }

    private defaultValueForType(ty: IRType): ValueId {
        const kind = this.irTypeKindOf(ty);
        if (kind === IRTypeKind.Bool) {
            return this.instId(this.builder.bconst(false).id);
        }
        if (kind === IRTypeKind.Int) {
            const width = ty.width as IntWidth | undefined;
            return this.instId(
                this.builder.iconst(0, width ?? IntWidth.I32).id,
            );
        }
        if (kind === IRTypeKind.Float) {
            const width = ty.width as FloatWidth | undefined;
            return this.instId(
                this.builder.fconst(0, width ?? FloatWidth.F64).id,
            );
        }
        if (kind === IRTypeKind.Ptr) {
            return this.instId(this.builder.null(ty).id);
        }
        return this.unitValue();
    }

    private unitValue(): ValueId {
        return this.instId(this.builder.iconst(0, IntWidth.I8).id);
    }

    private resolveFunctionId(name: string): number {
        const existing = this.functionIds.get(name);
        if (existing !== undefined) {
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

    private instId(id: ValueId | null): ValueId {
        if (id === null) {
            return 0;
        }
        return id;
    }

    private currentTypeKind(): IRTypeKind {
        return this.irTypeKindOf(this.currentReturnType);
    }

    private irTypeKindOf(ty: IRType): IRTypeKind {
        return ty.kind as IRTypeKind;
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
