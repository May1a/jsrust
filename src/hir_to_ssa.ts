import { Type, TypeKind, IntWidth, FloatWidth, Span } from "./types";
import { Result, ok, err } from "./diagnostics";
import {
    HModule,
    HFnDecl,
    HBlock,
    HStmt,
    HExpr,
    HPlace,
    HPat,
    HMatchArm,
    HLetStmt,
    HAssignStmt,
    HExprStmt,
    HReturnStmt,
    HBreakStmt,
    HContinueStmt,
    HUnitExpr,
    HLiteralExpr,
    HVarExpr,
    HBinaryExpr,
    HUnaryExpr,
    HCallExpr,
    HFieldExpr,
    HIndexExpr,
    HRefExpr,
    HDerefExpr,
    HStructExpr,
    HEnumExpr,
    HIfExpr,
    HMatchExpr,
    HLoopExpr,
    HWhileExpr,
} from "./hir";
// @ts-ignore
// @ts-ignore
import {
    IRType,
    ValueId,
    BlockId,
    IRModule,
    IRFunction,
    IRTypeKind,
} from "./ir";

import {
    HItemKind,
    HStmtKind,
    HPlaceKind,
    HExprKind,
    HPatKind,
    HLiteralKind,
} from "./hir";
// @ts-ignore
import { IRBuilder } from "./ir_builder";
// @ts-ignore
import {
    IcmpOp,
    FcmpOp,
    makeIRUnitType,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,
    makeIRModule,
    addIRFunction,
    // @ts-ignore
    internIRStringLiteral,
} from "./ir";
import { BinaryOp, UnaryOp } from "./ast";

// ============================================================================
// Task 9.1: Lowering Context
// ============================================================================

/**  Context for HIR -> SSA lowering */

/**  Lowering error types */
export const LoweringErrorKind = {
    UnknownStatement: 0,
    UnknownExpression: 1,
    UnknownLiteral: 2,
    InvalidType: 3,
    UnknownVariable: 4,
    UnknownOperator: 5,
    MissingResult: 6,
    BreakOutsideLoop: 7,
    ContinueOutsideLoop: 8,
};

export type LoweringErrorKindValue = number;

export type LoweringError = {
    kind: LoweringErrorKindValue;
    message: string;
    span: Span;
};

/**  Create an error result */
function error<T>(
    kind: LoweringErrorKindValue,
    message: string,
    span: Span,
): Result<T, LoweringError> {
    return err({ kind, message, span });
}
export class HirToSsaCtx {
    builder: IRBuilder;
    irModule: IRModule | null;
    internalLiteralModule: IRModule;
    breakStack: BlockId[];
    continueStack: BlockId[];
    returnBlock: BlockId | null;
    returnType: IRType | null;
    varAllocas: Map<number, ValueId>;
    varValues: Map<number, ValueId>;
    varNames: Map<string, { id: number; ty: IRType }>;
    mutableVarIds: Set<number>;

    constructor(options: { irModule?: IRModule } = {}) {
        this.builder = new IRBuilder();

        this.irModule = options.irModule || null;

        this.internalLiteralModule =
            this.irModule ||
            ({ stringLiterals: [], stringLiteralIds: new Map() } as any);

        this.breakStack = [];

        this.continueStack = [];

        this.returnBlock = null;

        this.returnType = null;

        this.varAllocas = new Map();

        this.varValues = new Map();

        this.varNames = new Map();

        this.mutableVarIds = new Set();
    }

    /**  Ensure a variable has a stable storage slot. */
    ensureVarAlloca(varId: number, ty: IRType) {
        const existing = this.varAllocas.get(varId);
        if (existing !== undefined) {
            return existing;
        }
        const alloca = this.builder.alloca(ty);
        const allocaId = alloca.id as number;
        this.varAllocas.set(varId, allocaId);
        const current = this.varValues.get(varId);
        if (current !== undefined) {
            this.builder.store(allocaId, current, ty);
        }
        return allocaId;
    }

    // ============================================================================
    // Task 9.2: Function Lowering
    // ============================================================================

    /**  Lower a function declaration to IR */
    lowerFunction(fnDecl: HFnDecl): Result<IRFunction, LoweringError> {
        // Reset state for new function
        this.varAllocas.clear();
        this.varValues.clear();
        this.varNames.clear();
        this.mutableVarIds.clear();
        this.breakStack = [];
        this.continueStack = [];

        // Translate types
        const paramTypes = fnDecl.params.map((p) => this.translateType(p.ty));
        const returnType = this.translateType(fnDecl.returnType);
        this.returnType = returnType;

        // Create function
        this.builder.createFunction(fnDecl.name, paramTypes, returnType);

        // Create entry block
        const entryBlockId = this.builder.createBlock("entry");
        this.builder.switchToBlock(entryBlockId);
        this.builder.sealBlock(entryBlockId);

        // Declare parameters as variables
        for (let i = 0; i < fnDecl.params.length; i++) {
            const param = fnDecl.params[i];
            const paramValue = this.builder.currentFunction!.params[i];

            if (param.name) {
                // Store parameter value in variable map
                if (param.pat && param.pat.kind === HPatKind.Ident) {
                    const pat = param.pat;
                    this.varValues.set(
                        pat.id as number,
                        paramValue.id as number,
                    );
                    this.varNames.set(param.name, {
                        id: pat.id as number,
                        ty: paramTypes[i],
                    });
                } else {
                    // Simple parameter binding
                    this.varNames.set(param.name, {
                        id: -i - 1,
                        ty: paramTypes[i],
                    });
                    this.varValues.set(-i - 1, paramValue.id as number);
                }
            }
        }

        // Lower function body
        if (fnDecl.body) {
            const resultResult = this.lowerBlock(fnDecl.body);
            if (!resultResult.ok) return resultResult;
            const result = resultResult.value;

            // Add implicit return if needed
            if (!this.builder.currentBlock!.terminator) {
                if (this.returnType?.kind === IRTypeKind.Unit) {
                    this.builder.ret(null);
                } else if (result !== null) {
                    this.builder.ret(result);
                } else {
                    this.builder.ret(null);
                }
            }
        } else {
            // No body - just return
            this.builder.ret(null);
        }

        return ok(this.builder.build());
    }

    // ============================================================================
    // Task 9.3: Block Lowering
    // ============================================================================

    /**  Lower a block (sequence of statements + optional final expression) */
    lowerBlock(block: HBlock): Result<ValueId | null, LoweringError> {
        let finalValue = null;

        // Lower each statement
        for (const stmt of block.stmts) {
            const res_ipereoc = this.lowerStmt(stmt);
            if (!res_ipereoc.ok) return res_ipereoc;

            // If block is terminated, stop
            if (this.builder.currentBlock!.terminator) {
                return ok(null);
            }
        }

        // Lower final expression
        if (block.expr) {
            const res = this.lowerExpr(block.expr);
            if (!res.ok) return res;
            finalValue = res.value;
        }

        return ok(finalValue);
    }

    // ============================================================================
    // Task 9.4: Statement Lowering
    // ============================================================================

    /**  Lower a statement */
    lowerStmt(stmt: HStmt): Result<void, LoweringError> {
        const s = stmt;
        switch (stmt.kind) {
            case HStmtKind.Let:
                const res_hz9q3 = this.lowerLetStmt(s as HLetStmt);
                if (!res_hz9q3.ok) return res_hz9q3;
                break;
            case HStmtKind.Assign:
                const res_q36t6f = this.lowerAssignStmt(s as HAssignStmt);
                if (!res_q36t6f.ok) return res_q36t6f;
                break;
            case HStmtKind.Expr:
                const res_5l0bbb2 = this.lowerExprStmt(s as HExprStmt);
                if (!res_5l0bbb2.ok) return res_5l0bbb2;
                break;
            case HStmtKind.Return:
                const res_xqt7m = this.lowerReturnStmt(s as HReturnStmt);
                if (!res_xqt7m.ok) return res_xqt7m;
                break;
            case HStmtKind.Break:
                const res_rdsyje = this.lowerBreakStmt(s as HBreakStmt);
                if (!res_rdsyje.ok) return res_rdsyje;
                break;
            case HStmtKind.Continue:
                const res_rxlgpt = this.lowerContinueStmt(s as HContinueStmt);
                if (!res_rxlgpt.ok) return res_rxlgpt;
                break;
            default:
                return error(
                    LoweringErrorKind.UnknownStatement,
                    `Unknown statement kind`,
                    (stmt as HStmt).span,
                );
        }
        return ok(undefined);
    }

    /**  Lower a let statement */
    lowerLetStmt(stmt: HLetStmt): Result<void, LoweringError> {
        // Lower initializer
        let initValue = null;
        if (stmt.init) {
            const res = this.lowerExpr(stmt.init);
            if (!res.ok) return res;
            initValue = res.value;
        }

        // Bind pattern
        const res_qyedci = this.bindPattern(stmt.pat, initValue, stmt.ty);
        if (!res_qyedci.ok) return res_qyedci;
        return ok(undefined);
    }

    /**  Bind a pattern to a value */
    bindPattern(
        pat: HPat,
        value: ValueId | null,
        ty: Type,
    ): Result<void, LoweringError> {
        switch (pat.kind) {
            case HPatKind.Ident: {
                // Identifier pattern - bind variable
                const varId = pat.id as number;
                if (pat.mutable) {
                    this.mutableVarIds.add(varId);
                }
                if (pat.mutable) {
                    const irTy = this.translateType(ty);
                    const ptr = this.ensureVarAlloca(varId, irTy);
                    if (value !== null) {
                        this.builder.store(ptr, value, irTy);
                    }
                }
                if (value !== null) {
                    this.varValues.set(varId, value);
                }
                this.varNames.set(pat.name, {
                    id: varId,
                    ty: this.translateType(ty),
                });
                break;
            }
            case HPatKind.Wildcard: {
                // Wildcard - nothing to bind
                break;
            }
            case HPatKind.Literal: {
                // Literal pattern - no binding, used in match
                break;
            }
            case HPatKind.Struct: {
                // Struct pattern - bind each field
                if (value !== null && pat.fields) {
                    for (let i = 0; i < pat.fields.length; i++) {
                        const field = pat.fields[i];
                        const fieldTy = this.getFieldType(ty, field.name);
                        const fieldValue = this.builder.structGet(
                            value,
                            i,
                            this.translateType(fieldTy),
                        );
                        const res_3enn1j = this.bindPattern(
                            field.pat,
                            fieldValue.id as number,
                            fieldTy,
                        );
                        if (!res_3enn1j.ok) return res_3enn1j;
                    }
                }
                break;
            }
            case HPatKind.Tuple: {
                // Tuple pattern - bind each element
                if (
                    value !== null &&
                    pat.elements &&
                    ty.kind === TypeKind.Tuple
                ) {
                    for (let i = 0; i < pat.elements.length; i++) {
                        const elemPat = pat.elements[i];
                        const elemTy = ty.elements[i];
                        const elemValue = this.builder.structGet(
                            value,
                            i,
                            this.translateType(elemTy),
                        );
                        const res_79gddj = this.bindPattern(
                            elemPat,
                            elemValue.id as number,
                            elemTy,
                        );
                        if (!res_79gddj.ok) return res_79gddj;
                    }
                }
                break;
            }
            case HPatKind.Or: {
                // Or pattern - bind first alternative (they should all bind the same vars)
                if (pat.alternatives && pat.alternatives.length > 0) {
                    const res_ai5lub = this.bindPattern(
                        pat.alternatives[0],
                        value,
                        ty,
                    );
                    if (!res_ai5lub.ok) return res_ai5lub;
                }
                break;
            }
        }
        return ok(undefined);
    }

    /**  Lower an assignment statement */
    lowerAssignStmt(stmt: HAssignStmt): Result<void, LoweringError> {
        const valueResult = this.lowerExpr(stmt.value);
        if (!valueResult.ok) return valueResult;
        const value = valueResult.value;
        if (stmt.place.kind === HPlaceKind.Var) {
            const varId = stmt.place.id as number;
            if (this.mutableVarIds.has(varId)) {
                const ty = this.translateType(stmt.value.ty);
                const ptr = this.ensureVarAlloca(varId, ty);
                this.builder.store(ptr, value as number, ty);
                this.varValues.set(varId, value);
                return ok(undefined);
            }
            if (!this.varAllocas.has(varId)) {
                this.varValues.set(varId, value);
                return ok(undefined);
            }
        }
        const ptrResult = this.lowerPlaceToRef(stmt.place);
        if (!ptrResult.ok) return ptrResult;
        const ptr = ptrResult.value;
        const ty = this.translateType(stmt.value.ty);
        this.builder.store(ptr, value as number, ty);
        if (stmt.place.kind === HPlaceKind.Var) {
            this.varValues.set(stmt.place.id as number, value);
        }
        return ok(undefined);
    }

    /**  Lower an expression statement */
    lowerExprStmt(stmt: HExprStmt): Result<void, LoweringError> {
        const res_8dxk6k = this.lowerExpr(stmt.expr);
        if (!res_8dxk6k.ok) return res_8dxk6k;
        return ok(undefined);
    }

    /**  Lower a return statement */
    lowerReturnStmt(stmt: HReturnStmt): Result<void, LoweringError> {
        let value = null;
        if (stmt.value) {
            const res = this.lowerExpr(stmt.value);
            if (!res.ok) return res;
            value = res.value;
        }
        this.builder.ret(value);
        return ok(undefined);
    }

    /** Lower a break statement */
    lowerBreakStmt(stmt: HBreakStmt): Result<void, LoweringError> {
        const targetBlock = this.breakStack[this.breakStack.length - 1];
        if (targetBlock === undefined) {
            return error(
                LoweringErrorKind.BreakOutsideLoop,
                `Break outside loop`,
                stmt.span,
            );
        }

        let value = null;
        if (stmt.value) {
            const res = this.lowerExpr(stmt.value);
            if (!res.ok) return res;
            value = res.value;
        }

        this.builder.br(targetBlock, value !== null ? [value] : []);
        return ok(undefined);
    }

    /** Lower a continue statement */
    lowerContinueStmt(stmt: HContinueStmt): Result<void, LoweringError> {
        const targetBlock = this.continueStack[this.continueStack.length - 1];
        if (targetBlock === undefined) {
            return error(
                LoweringErrorKind.ContinueOutsideLoop,
                `Continue outside loop`,
                stmt.span,
            );
        }
        this.builder.br(targetBlock);
        return ok(undefined);
    }

    // ============================================================================
    // Task 9.5: Expression Lowering
    // ============================================================================

    /**  Lower an expression to a ValueId */
    lowerExpr(expr: HExpr): Result<ValueId, LoweringError> {
        const e = expr;
        if (!("kind" in expr)) {
            debugger;
            throw __filename;
        }
        switch (expr.kind) {
            case HExprKind.Unit:
                return this.lowerUnit(e as HUnitExpr);
            case HExprKind.Literal:
                return this.lowerLiteral(e as HLiteralExpr);
            case HExprKind.Var:
                return this.lowerVar(e as HVarExpr);
            case HExprKind.Binary:
                return this.lowerBinary(e as HBinaryExpr);
            case HExprKind.Unary:
                return this.lowerUnary(e as HUnaryExpr);
            case HExprKind.Call:
                return this.lowerCall(e as HCallExpr);
            case HExprKind.Field:
                return this.lowerField(e as HFieldExpr);
            case HExprKind.Index:
                return this.lowerIndex(e as HIndexExpr);
            case HExprKind.Ref:
                return this.lowerRef(e as HRefExpr);
            case HExprKind.Deref:
                return this.lowerDeref(e as HDerefExpr);
            case HExprKind.Struct:
                return this.lowerStruct(e as HStructExpr);
            case HExprKind.Enum:
                return this.lowerEnum(e as HEnumExpr);
            case HExprKind.If:
                return this.lowerIf(e as HIfExpr);
            case HExprKind.Match:
                return this.lowerMatch(e as HMatchExpr);
            case HExprKind.Loop:
                return this.lowerLoop(e as HLoopExpr);
            case HExprKind.While:
                return this.lowerWhile(e as HWhileExpr);
            default:
                return error(
                    LoweringErrorKind.UnknownExpression,
                    `Unknown expression kind`,
                    (expr as HExpr).span,
                );
        }
    }

    /**  Lower a unit expression */ lowerUnit(
        _expr: HUnitExpr,
    ): Result<ValueId, LoweringError> {
        // Unit is represented as a null/void value
        const inst = this.builder.iconst(0, IntWidth.I8);
        return ok(inst.id as number);
    }

    /**  Lower a literal expression */
    lowerLiteral(expr: HLiteralExpr): Result<ValueId, LoweringError> {
        switch (expr.literalKind) {
            case HLiteralKind.Int: {
                const width = this.getIntWidth(expr.ty);
                const inst = this.builder.iconst(expr.value as number, width);
                return ok(inst.id as number);
            }
            case HLiteralKind.Float: {
                const width = this.getFloatWidth(expr.ty);
                const inst = this.builder.fconst(expr.value as number, width);
                return ok(inst.id as number);
            }
            case HLiteralKind.Bool: {
                const inst = this.builder.bconst(expr.value as any);
                return ok(inst.id as number);
            }
            case HLiteralKind.String: {
                const literalId = internIRStringLiteral(
                    this.internalLiteralModule,
                    String(expr.value),
                );
                const inst = this.builder.sconst(literalId);
                return ok(inst.id as number);
            }
            case HLiteralKind.Char: {
                const codePoint =
                    typeof expr.value === "string"
                        ? (expr.value.codePointAt(0) ?? 0)
                        : Number(expr.value);
                const inst = this.builder.iconst(codePoint, IntWidth.U32);
                return ok(inst.id as number);
            }
            default:
                return error(
                    LoweringErrorKind.UnknownLiteral,
                    `Unknown literal kind`,
                    (expr as HExpr).span,
                );
        }
    }

    /**  Lower a variable expression */
    lowerVar(expr: HVarExpr): Result<ValueId, LoweringError> {
        const byIdAlloca = this.varAllocas.get(expr.id as number);
        if (byIdAlloca !== undefined) {
            const ty = this.translateType(expr.ty);
            const loadInst = this.builder.load(byIdAlloca, ty);
            return ok(loadInst.id as number);
        }

        const byIdValue = this.varValues.get(expr.id as number);
        if (byIdValue !== undefined) {
            return ok(byIdValue);
        }

        // Look up by name
        const varInfo = this.varNames.get(expr.name);
        if (varInfo) {
            const byNameAlloca = this.varAllocas.get(varInfo.id as number);
            if (byNameAlloca !== undefined) {
                const ty = this.translateType(expr.ty);
                const loadInst = this.builder.load(byNameAlloca, ty);
                return ok(loadInst.id as number);
            }
            const byNameValue = this.varValues.get(varInfo.id as number);
            if (byNameValue !== undefined) {
                return ok(byNameValue);
            }
        }

        // Function reference - return a placeholder
        const fnId = this.resolveFunctionId(expr.name);
        const inst = this.builder.iconst(fnId, IntWidth.I64);
        return ok(inst.id as number);
    }

    /**  Lower a binary expression */
    lowerBinary(expr: HBinaryExpr): Result<ValueId, LoweringError> {
        const leftResult = this.lowerExpr(expr.left);
        if (!leftResult.ok) return leftResult;
        const left = leftResult.value;
        const rightResult = this.lowerExpr(expr.right);
        if (!rightResult.ok) return rightResult;
        const right = rightResult.value;
        const ty = expr.ty; // For comparison operators, we need the operand type, not the result type
        const operandTy = expr.left.ty;
        let inst;
        switch (expr.op) {
            // Arithmetic
            case BinaryOp.Add: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.iadd(
                        left as number,
                        right as number,
                        this.getIntWidth(ty),
                    );
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fadd(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Sub: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.isub(
                        left as number,
                        right as number,
                        this.getIntWidth(ty),
                    );
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fsub(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Mul: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.imul(
                        left as number,
                        right as number,
                        this.getIntWidth(ty),
                    );
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fmul(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Div: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.idiv(
                        left as number,
                        right as number,
                        this.getIntWidth(ty),
                    );
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fdiv(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Rem: {
                inst = this.builder.imod(
                    left as number,
                    right as number,
                    this.getIntWidth(ty),
                );
                break;
            }

            // Comparison - use operand type, not result type (which is bool)
            case BinaryOp.Eq: {
                if (operandTy.kind === TypeKind.Int) {
                    inst = this.builder.icmp(
                        IcmpOp.Eq,
                        left as number,
                        right as number,
                    );
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(
                        FcmpOp.Oeq,
                        left as number,
                        right as number,
                    );
                } else if (operandTy.kind === TypeKind.Bool) {
                    inst = this.builder.icmp(
                        IcmpOp.Eq,
                        left as number,
                        right as number,
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Ne: {
                if (operandTy.kind === TypeKind.Int) {
                    inst = this.builder.icmp(
                        IcmpOp.Ne,
                        left as number,
                        right as number,
                    );
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(
                        FcmpOp.One,
                        left as number,
                        right as number,
                    );
                } else if (operandTy.kind === TypeKind.Bool) {
                    inst = this.builder.icmp(
                        IcmpOp.Ne,
                        left as number,
                        right as number,
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Lt: {
                if (operandTy.kind === TypeKind.Int) {
                    const isSigned = this.isSignedIntType(operandTy);
                    inst = this.builder.icmp(
                        isSigned ? IcmpOp.Slt : IcmpOp.Ult,
                        left,
                        right,
                    );
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(
                        FcmpOp.Olt,
                        left as number,
                        right as number,
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Le: {
                if (operandTy.kind === TypeKind.Int) {
                    const isSigned = this.isSignedIntType(operandTy);
                    inst = this.builder.icmp(
                        isSigned ? IcmpOp.Sle : IcmpOp.Ule,
                        left,
                        right,
                    );
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(
                        FcmpOp.Ole,
                        left as number,
                        right as number,
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Gt: {
                if (operandTy.kind === TypeKind.Int) {
                    const isSigned = this.isSignedIntType(operandTy);
                    inst = this.builder.icmp(
                        isSigned ? IcmpOp.Sgt : IcmpOp.Ugt,
                        left,
                        right,
                    );
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(
                        FcmpOp.Ogt,
                        left as number,
                        right as number,
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case BinaryOp.Ge: {
                if (operandTy.kind === TypeKind.Int) {
                    const isSigned = this.isSignedIntType(operandTy);
                    inst = this.builder.icmp(
                        isSigned ? IcmpOp.Sge : IcmpOp.Uge,
                        left,
                        right,
                    );
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(
                        FcmpOp.Oge,
                        left as number,
                        right as number,
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }

            // Logical
            case BinaryOp.And: {
                // Short-circuit and is handled separately
                // Here we do bitwise and for bools
                inst = this.builder.iand(
                    left as number,
                    right as number,
                    IntWidth.I8,
                );
                break;
            }
            case BinaryOp.Or: {
                // Short-circuit or is handled separately
                // Here we do bitwise or for bools
                inst = this.builder.ior(
                    left as number,
                    right as number,
                    IntWidth.I8,
                );
                break;
            }

            // Bitwise
            case BinaryOp.BitXor: {
                inst = this.builder.ixor(
                    left as number,
                    right as number,
                    this.getIntWidth(ty),
                );
                break;
            }
            case BinaryOp.BitAnd: {
                inst = this.builder.iand(
                    left as number,
                    right as number,
                    this.getIntWidth(ty),
                );
                break;
            }
            case BinaryOp.BitOr: {
                inst = this.builder.ior(
                    left as number,
                    right as number,
                    this.getIntWidth(ty),
                );
                break;
            }
            case BinaryOp.Shl: {
                inst = this.builder.ishl(
                    left as number,
                    right as number,
                    this.getIntWidth(ty),
                );
                break;
            }
            case BinaryOp.Shr: {
                inst = this.builder.ishr(
                    left as number,
                    right as number,
                    this.getIntWidth(ty),
                );
                break;
            }
            default:
                return error(
                    LoweringErrorKind.UnknownOperator,
                    `Unknown operator`,
                    (expr as HExpr).span,
                );
        }

        return ok(inst.id as number);
    }

    /**  Lower a unary expression */
    lowerUnary(expr: HUnaryExpr): Result<ValueId, LoweringError> {
        const operandResult = this.lowerExpr(expr.operand);
        if (!operandResult.ok) return operandResult;
        const operand = operandResult.value;
        const ty = expr.ty;

        let inst;

        switch (expr.op) {
            case UnaryOp.Neg: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.ineg(operand, this.getIntWidth(ty));
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fneg(operand, this.getFloatWidth(ty));
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case UnaryOp.Not: {
                if (ty.kind === TypeKind.Bool) {
                    // Logical not: xor with true
                    const one = this.builder.bconst(true);
                    inst = this.builder.ixor(
                        operand,
                        one.id as number,
                        IntWidth.I8,
                    );
                } else if (ty.kind === TypeKind.Int) {
                    // Bitwise not: xor with -1 (all ones)
                    const allOnes = this.builder.iconst(
                        -1,
                        this.getIntWidth(ty),
                    );
                    inst = this.builder.ixor(
                        operand,
                        allOnes.id as number,
                        this.getIntWidth(ty),
                    );
                } else {
                    return error(
                        LoweringErrorKind.InvalidType,
                        `Invalid type`,
                        (expr as HExpr).span,
                    );
                }
                break;
            }
            case UnaryOp.Deref: {
                // Deref is handled in lowerDeref
                const resultTy = this.translateType(ty);
                inst = this.builder.load(operand, resultTy);
                break;
            }
            case UnaryOp.Ref: {
                // Ref is handled in lowerRef
                // operand should already be a pointer
                inst = { id: operand };
                break;
            }
            default:
                return error(
                    LoweringErrorKind.UnknownOperator,
                    `Unknown operator`,
                    (expr as HExpr).span,
                );
        }

        return ok(inst.id as number);
    }

    /**  Lower a call expression */
    lowerCall(expr: HCallExpr): Result<ValueId, LoweringError> {
        // Get callee - could be a function name or a function pointer
        let fnId;
        let isDynamic = true;
        const { callee } = expr;
        if (!("kind" in callee)) {
            debugger;
            throw __filename;
        }
        if (callee.kind === HExprKind.Var && callee.id === -1) {
            fnId = this.resolveFunctionId(callee.name);
            isDynamic = false;
        } else {
            // Dynamic callee - evaluate to a runtime function id/hash value.
            const calleeRes = this.lowerExpr(expr.callee);
            if (!calleeRes.ok) return calleeRes;
            fnId = calleeRes.value;
        }

        const args = expr.args.map((arg) => {
            const argRes = this.lowerExpr(arg);
            if (!argRes.ok) throw argRes;
            return argRes.value;
        });
        const returnType = this.translateType(expr.ty);

        const inst = isDynamic
            ? this.builder.callDyn(fnId, args, returnType)
            : this.builder.call(fnId, args, returnType);
        return ok(inst.id as number);
    }

    /**  Lower a field access expression */
    lowerField(expr: HFieldExpr): Result<ValueId, LoweringError> {
        const baseResult = this.lowerExpr(expr.base);
        if (!baseResult.ok) return baseResult;
        const base = baseResult.value;
        const fieldIndex = expr.index;
        const fieldTy = this.translateType(expr.ty);

        const inst = this.builder.structGet(
            base as number,
            fieldIndex,
            fieldTy,
        );
        return ok(inst.id as number);
    }

    /**  Lower an index expression */
    lowerIndex(expr: HIndexExpr): Result<ValueId, LoweringError> {
        const baseResult = this.lowerExpr(expr.base);
        if (!baseResult.ok) return baseResult;
        const base = baseResult.value;
        const indexResult = this.lowerExpr(expr.index);
        if (!indexResult.ok) return indexResult;
        const index = indexResult.value;
        const elemTy = this.translateType(expr.ty);

        const ptrInst = this.builder.gep(base, [index as number], elemTy);
        const loadInst = this.builder.load(ptrInst.id as number, elemTy);
        return ok(loadInst.id as number);
    }

    /**  Lower a reference expression */
    lowerRef(expr: HRefExpr): Result<ValueId, LoweringError> {
        // Get a pointer to the operand
        const ptrResult = this.lowerPlaceToRef(expr.operand);
        if (!ptrResult.ok) return ptrResult;
        const ptr = ptrResult.value;
        return ok(ptr);
    }

    /**  Lower a dereference expression */
    lowerDeref(expr: HDerefExpr): Result<ValueId, LoweringError> {
        const ptrResult = this.lowerExpr(expr.operand);
        if (!ptrResult.ok) return ptrResult;
        const ptr = ptrResult.value;
        const ty = this.translateType(expr.ty);
        const inst = this.builder.load(ptr as number, ty);
        return ok(inst.id as number);
    }

    /**  Lower a struct construction expression */
    lowerStruct(expr: HStructExpr): Result<ValueId, LoweringError> {
        const fields = [];
        for (const f of expr.fields) {
            const res = this.lowerExpr(f.value);
            if (!res.ok) return res;
            fields.push(res.value);
        }
        const structTy = this.translateType(expr.ty);

        const inst = this.builder.structCreate(fields, structTy);
        return ok(inst.id as number);
    }

    /**  Lower an enum construction expression */
    lowerEnum(expr: HEnumExpr): Result<ValueId, LoweringError> {
        const variant = expr.variantIndex;
        let data: ValueId | null = null;

        if (expr.fields.length > 0) {
            if (expr.fields.length === 1) {
                const fieldResult = this.lowerExpr(expr.fields[0]);
                if (!fieldResult.ok) return fieldResult;
                data = fieldResult.value;
            } else {
                const fieldValues: ValueId[] = [];
                for (const f of expr.fields) {
                    const res = this.lowerExpr(f);
                    if (!res.ok) return res;
                    fieldValues.push(res.value);
                }
                const structInst = this.builder.structCreate(
                    fieldValues,
                    makeIRStructType(
                        "",
                        expr.fields.map((f: import("./hir").HExpr) =>
                            this.translateType(f.ty),
                        ),
                    ),
                );
                data = structInst.id as number;
            }
        }

        const enumTy = this.translateType(expr.ty);

        const inst = this.builder.enumCreate(variant, data, enumTy);
        return ok(inst.id as number);
    }

    // ============================================================================
    // Task 9.6: Place Lowering
    // ============================================================================

    /**  Lower a place to a reference (pointer) */
    lowerPlaceToRef(place: HPlace | HExpr): Result<ValueId, LoweringError> {
        // Handle expressions that are places
        if (!("kind" in place)) {
            debugger;
            throw __filename;
        }
        if (place.kind === HExprKind.Var && typeof place.name === "string") {
            const varInfo = this.varNames.get(place.name);
            if (varInfo) {
                return ok(
                    this.ensureVarAlloca(varInfo.id as number, varInfo.ty),
                );
            }
            return error(
                LoweringErrorKind.UnknownVariable,
                `Unknown variable`,
                place.span,
            );
        }
        if (place.kind === HExprKind.Field) {
            // Field access - need pointer to field
            const basePtrRes =
                place.base.ty && place.base.ty.kind === TypeKind.Ptr
                    ? this.lowerExpr(place.base)
                    : this.lowerPlaceToRef(place.base);
            if (!basePtrRes.ok) return basePtrRes;
            const basePtr = basePtrRes.value;

            const fieldIndex = place.index;
            const fieldTy = this.translateType(place.ty);
            const inst = this.builder.gep(
                basePtr,
                [
                    this.builder.iconst(0, IntWidth.I32).id as number,
                    this.builder.iconst(fieldIndex, IntWidth.I32).id as number,
                ],
                fieldTy,
            );
            return ok(inst.id as number);
        }

        if (place.kind === HExprKind.Index) {
            // Index access - need pointer to element
            const basePtrRes =
                place.base.ty && place.base.ty.kind === TypeKind.Ptr
                    ? this.lowerExpr(place.base)
                    : this.lowerPlaceToRef(place.base);
            if (!basePtrRes.ok) return basePtrRes;
            const basePtr = basePtrRes.value;

            const indexResult = this.lowerExpr(place.index);
            if (!indexResult.ok) return indexResult;
            const index = indexResult.value;
            const elemTy = this.translateType(place.ty);
            const inst = this.builder.gep(basePtr, [index as number], elemTy);
            return ok(inst.id as number);
        }

        if (place.kind === HExprKind.Deref) {
            // Deref - the operand is already a pointer
            return this.lowerExpr(place.operand);
        }

        // Handle HPlace types
        switch (place.kind) {
            case HPlaceKind.Var: {
                return ok(
                    this.ensureVarAlloca(
                        place.id as number,
                        this.translateType(place.ty),
                    ),
                );
            }
            case HPlaceKind.Field: {
                let basePtr: ValueId;
                if (place.base.ty && place.base.ty.kind === TypeKind.Ptr) {
                    if (place.base.kind === HPlaceKind.Deref) {
                        const basePtrResult = this.lowerPlaceToRef(place.base);
                        if (!basePtrResult.ok) return basePtrResult;
                        basePtr = basePtrResult.value;
                    } else {
                        const baseAddrResult = this.lowerPlaceToRef(place.base);
                        if (!baseAddrResult.ok) return baseAddrResult;
                        const baseAddr = baseAddrResult.value;
                        const ptrTy = this.translateType(place.base.ty);
                        basePtr = this.builder.load(baseAddr, ptrTy)
                            .id as number;
                    }
                } else {
                    const basePtrResult = this.lowerPlaceToRef(place.base);
                    if (!basePtrResult.ok) return basePtrResult;
                    basePtr = basePtrResult.value;
                }
                const fieldIndex = place.index;
                const fieldTy = this.translateType(place.ty);
                const inst = this.builder.gep(
                    basePtr,
                    [
                        this.builder.iconst(0, IntWidth.I32).id as number,
                        this.builder.iconst(fieldIndex, IntWidth.I32)
                            .id as number,
                    ],
                    fieldTy,
                );
                return ok(inst.id as number);
            }
            case HPlaceKind.Index: {
                let basePtr: ValueId;
                if (place.base.ty && place.base.ty.kind === TypeKind.Ptr) {
                    if (place.base.kind === HPlaceKind.Deref) {
                        const basePtrResult = this.lowerPlaceToRef(place.base);
                        if (!basePtrResult.ok) return basePtrResult;
                        basePtr = basePtrResult.value;
                    } else {
                        const baseAddrResult = this.lowerPlaceToRef(place.base);
                        if (!baseAddrResult.ok) return baseAddrResult;
                        const baseAddr = baseAddrResult.value;
                        const ptrTy = this.translateType(place.base.ty);
                        basePtr = this.builder.load(baseAddr, ptrTy)
                            .id as number;
                    }
                } else {
                    const basePtrResult = this.lowerPlaceToRef(place.base);
                    if (!basePtrResult.ok) return basePtrResult;
                    basePtr = basePtrResult.value;
                }
                const indexResult = this.lowerExpr(place.index);
                if (!indexResult.ok) return indexResult;
                const index = indexResult.value;
                const elemTy = this.translateType(place.ty);
                const inst = this.builder.gep(
                    basePtr,
                    [index as number],
                    elemTy,
                );
                return ok(inst.id as number);
            }
            case HPlaceKind.Deref: {
                const basePtrResult = this.lowerPlaceToRef(place.base);
                if (!basePtrResult.ok) return basePtrResult;
                const basePtr = basePtrResult.value;
                const ptrTy = this.translateType(place.base.ty);
                const inst = this.builder.load(basePtr as number, ptrTy);
                return ok(inst.id as number);
            }
            default:
                return error(
                    LoweringErrorKind.UnknownVariable,
                    `Unknown variable`,
                    place.span,
                );
        }
    }
    // ============================================================================
    // Task 9.7: If Expression Lowering
    // ============================================================================
    lowerIf(expr: HIfExpr): Result<ValueId, LoweringError> {
        const hasResult = expr.ty.kind !== TypeKind.Unit;
        const resultTy = this.translateType(expr.ty);

        // Create blocks
        const thenId = this.builder.createBlock("then");
        const elseId = expr.elseBranch
            ? this.builder.createBlock("else")
            : null;
        const mergeId = this.builder.createBlock(
            "merge",
            hasResult ? [resultTy] : [],
        );

        // Evaluate condition
        const condResult = this.lowerExpr(expr.condition);
        if (!condResult.ok) return condResult;
        const cond = condResult.value;

        // Branch to then/else
        if (elseId) {
            this.builder.brIf(cond, thenId, [], elseId, []);
        } else {
            this.builder.brIf(cond, thenId, [], mergeId, []);
        }

        // Lower then branch
        this.builder.switchToBlock(thenId);
        const thenResultResult = this.lowerBlock(expr.thenBranch);
        if (!thenResultResult.ok) return thenResultResult;
        const thenResult = thenResultResult.value;
        if (!this.builder.currentBlock!.terminator) {
            if (hasResult) {
                if (thenResult === null) {
                    return error(
                        LoweringErrorKind.MissingResult,
                        `Missing result`,
                        (expr as HExpr).span,
                    );
                }
                this.builder.br(mergeId, [thenResult]);
            } else {
                this.builder.br(mergeId);
            }
        }
        this.builder.sealBlock(thenId);

        // Lower else branch
        if (elseId && expr.elseBranch) {
            this.builder.switchToBlock(elseId);
            const elseResultResult = this.lowerBlock(expr.elseBranch);
            if (!elseResultResult.ok) return elseResultResult;
            const elseResult = elseResultResult.value;
            if (!this.builder.currentBlock!.terminator) {
                if (hasResult) {
                    if (elseResult === null) {
                        return error(
                            LoweringErrorKind.MissingResult,
                            `Missing result`,
                            (expr as HExpr).span,
                        );
                    }
                    this.builder.br(mergeId, [elseResult]);
                } else {
                    this.builder.br(mergeId);
                }
            }
            this.builder.sealBlock(elseId);
        }

        // Merge block
        this.builder.switchToBlock(mergeId);
        this.builder.sealBlock(mergeId);

        if (hasResult) {
            const mergeBlock = this.builder.currentBlock;
            if (!mergeBlock || mergeBlock.params.length !== 1) {
                return error(
                    LoweringErrorKind.MissingResult,
                    `Missing result`,
                    (expr as HExpr).span,
                );
            }
            return ok(mergeBlock.params[0].id);
        }

        return ok(this.builder.iconst(0, IntWidth.I8).id as number);
    }

    // ============================================================================
    // Task 9.8: Match Expression Lowering
    // ============================================================================

    /**  Lower a match expression */
    lowerMatch(expr: HMatchExpr): Result<ValueId, LoweringError> {
        const scrutineeResult = this.lowerExpr(expr.scrutinee);
        if (!scrutineeResult.ok) return scrutineeResult;
        const scrutinee = scrutineeResult.value;
        const arms = expr.arms;
        const hasResult = expr.ty.kind !== TypeKind.Unit;
        const resultTy = this.translateType(expr.ty);

        // For simple matches, use switch
        // For complex patterns, generate decision tree

        if (arms.length === 0) {
            // No arms - unreachable
            this.builder.unreachable();
            return ok(this.builder.iconst(0, IntWidth.I8).id as number);
        }

        // Check if all patterns are simple literals or enums
        const isSimple = arms.every(
            (arm) =>
                arm.pat.kind === HPatKind.Literal ||
                arm.pat.kind === HPatKind.Wildcard ||
                arm.pat.kind === HPatKind.Ident,
        );

        if (isSimple && arms.some((arm) => arm.pat.kind === HPatKind.Literal)) {
            // Use switch for simple literal patterns
            return this.lowerMatchSwitch(
                expr,
                scrutinee,
                arms,
                hasResult,
                resultTy,
            );
        }

        // Check for enum match
        if (expr.scrutinee.ty.kind === TypeKind.Enum) {
            return this.lowerEnumMatch(
                expr,
                scrutinee,
                arms,
                hasResult,
                resultTy,
            );
        }

        // General case: generate decision tree
        return this.lowerMatchDecisionTree(
            expr,
            scrutinee,
            arms,
            hasResult,
            resultTy,
        );
    }

    /**  Lower a match using switch */
    lowerMatchSwitch(
        expr: HMatchExpr,
        scrutinee: ValueId,
        arms: HMatchArm[],
        hasResult: boolean,
        resultTy: IRType,
    ): Result<ValueId, LoweringError> {
        const mergeId = this.builder.createBlock("match_merge");
        const armBlocks = arms.map((_, i) =>
            this.builder.createBlock(`arm${i}`),
        );

        // Build switch cases
        const cases = [];
        let defaultBlock = mergeId;

        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            if (arm.pat.kind === HPatKind.Literal) {
                const caseValue = Number(arm.pat.value);
                cases.push({
                    value: caseValue,
                    target: armBlocks[i],
                    args: [],
                });
            } else {
                // Wildcard or ident is default
                defaultBlock = armBlocks[i];
            }
        }

        this.builder.switch(scrutinee as number, cases, defaultBlock, []);

        // Lower each arm
        for (let i = 0; i < arms.length; i++) {
            this.builder.switchToBlock(armBlocks[i]);

            // Bind pattern
            const res_c2rpvb = this.bindPattern(
                arms[i].pat,
                scrutinee,
                expr.scrutinee.ty,
            );
            if (!res_c2rpvb.ok) return res_c2rpvb;

            // Check guard
            if (arms[i].guard) {
                const guardResultResult = this.lowerExpr(
                    arms[i].guard as HExpr,
                );
                if (!guardResultResult.ok) return guardResultResult;
                const guardResult = guardResultResult.value;
                const guardThenId = this.builder.createBlock("guard_then");
                const guardElseId = this.builder.createBlock("guard_else");
                this.builder.brIf(
                    guardResult,
                    guardThenId,
                    [],
                    guardElseId,
                    [],
                );

                // If guard fails, go to next arm or merge
                this.builder.switchToBlock(guardElseId);
                this.builder.br(mergeId, []);

                this.builder.switchToBlock(guardThenId);
            }

            const armResultResult = this.lowerBlock(arms[i].body);
            if (!armResultResult.ok) return armResultResult;
            if (!this.builder.currentBlock!.terminator) {
                this.builder.br(mergeId, []);
            }
            this.builder.sealBlock(armBlocks[i]);
        }

        this.builder.switchToBlock(mergeId);
        this.builder.sealBlock(mergeId);

        return ok(
            hasResult
                ? this.defaultValueForType(resultTy)
                : (this.builder.iconst(0, IntWidth.I8).id as number),
        );
    }

    /**  Lower an enum match */
    lowerEnumMatch(
        expr: HMatchExpr,
        scrutinee: ValueId,
        arms: HMatchArm[],
        hasResult: boolean,
        resultTy: IRType,
    ): Result<ValueId, LoweringError> {
        const mergeParams = hasResult && resultTy ? [resultTy] : [];
        const mergeId = this.builder.createBlock("match_merge", mergeParams);
        const armBlocks = arms.map((_, i) =>
            this.builder.createBlock(`arm${i}`),
        );

        // Get enum tag
        const tag = this.builder.enumGetTag(scrutinee as number);

        // Build switch on tag
        const cases = [];
        let defaultBlock = mergeId;
        const armVariantIndices = new Array(arms.length).fill(-1);

        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            if (arm.pat.kind === HPatKind.Struct) {
                const patternName = arm.pat.name || "";
                const variantName = patternName.includes("::")
                    ? patternName.split("::").slice(-1)[0]
                    : patternName;
                const variantIndex = this.findEnumVariantIndex(
                    expr.scrutinee.ty,
                    variantName,
                );
                if (variantIndex < 0) {
                    continue;
                }
                armVariantIndices[i] = variantIndex;
                cases.push({
                    value: variantIndex,
                    target: armBlocks[i],
                    args: [],
                });
            } else if (
                arm.pat.kind === HPatKind.Wildcard ||
                arm.pat.kind === HPatKind.Ident
            ) {
                defaultBlock = armBlocks[i];
            }
        }

        const defaultArgs =
            hasResult && mergeParams.length > 0 && defaultBlock === mergeId
                ? [this.defaultValueForType(resultTy) as number]
                : [];
        this.builder.switch(tag.id as number, cases, defaultBlock, defaultArgs);

        // Lower each arm
        for (let i = 0; i < arms.length; i++) {
            this.builder.switchToBlock(armBlocks[i]);

            // Bind pattern
            const res_7ygu3k = this.bindEnumPattern(
                arms[i].pat,
                scrutinee,
                expr.scrutinee.ty,
                armVariantIndices[i],
            );
            if (!res_7ygu3k.ok) return res_7ygu3k;

            const armResultResult = this.lowerBlock(arms[i].body);
            if (!armResultResult.ok) return armResultResult;
            const armResult = armResultResult.value;
            if (!this.builder.currentBlock!.terminator) {
                const branchArgs =
                    hasResult && armResult !== null ? [armResult] : [];
                this.builder.br(mergeId, branchArgs);
            }
            this.builder.sealBlock(armBlocks[i]);
        }

        this.builder.switchToBlock(mergeId);
        this.builder.sealBlock(mergeId);

        if (hasResult) {
            const mergeParam = this.builder.currentBlock!.params[0];
            if (mergeParam) {
                return ok(mergeParam.id as number);
            }
            return ok(this.defaultValueForType(resultTy));
        }
        return ok(this.builder.iconst(0, IntWidth.I8).id as number);
    }

    /**  Bind an enum pattern */
    bindEnumPattern(
        pat: HPat,
        enumValue: ValueId,
        enumTy: Type,
        variantIndex: number,
    ): Result<void, LoweringError> {
        if (pat.kind === HPatKind.Struct && pat.fields) {
            // Extract and bind each field
            for (let i = 0; i < pat.fields.length; i++) {
                const field = pat.fields[i];
                const fieldTy = this.getEnumFieldType(enumTy, variantIndex, i);
                const fieldValue = this.builder.enumGetData(
                    enumValue,
                    variantIndex < 0 ? 0 : variantIndex,
                    i,
                    this.translateType(fieldTy),
                );
                const res_t3ds6 = this.bindPattern(
                    field.pat,
                    fieldValue.id as number,
                    fieldTy,
                );
                if (!res_t3ds6.ok) return res_t3ds6;
            }
        } else if (pat.kind === HPatKind.Ident) {
            // Bind whole enum value
            this.varValues.set(pat.id as number, enumValue);
        }
        return ok(undefined);
    }

    /**  Lower a match using decision tree */
    lowerMatchDecisionTree(
        expr: HMatchExpr,
        scrutinee: ValueId,
        arms: HMatchArm[],
        hasResult: boolean,
        resultTy: IRType,
    ): Result<ValueId, LoweringError> {
        // Simplified: just lower first matching arm
        const mergeId = this.builder.createBlock("match_merge");

        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            // Create arm block (used for branching)
            this.builder.createBlock(`arm${i}`);
            const nextBlock =
                i < arms.length - 1
                    ? this.builder.createBlock(`next${i}`)
                    : mergeId;

            // Generate pattern check
            const patternCheckResult = this.lowerPatternCheck(
                scrutinee,
                arm.pat,
                expr.scrutinee.ty,
            );
            if (!patternCheckResult.ok) return patternCheckResult;
            const { matches, bindings } = patternCheckResult.value;

            if (matches !== null) {
                const thenBlock = this.builder.createBlock("pat_then");
                this.builder.brIf(matches, thenBlock, [], nextBlock, []);

                this.builder.switchToBlock(thenBlock);
            }

            // Apply bindings
            for (const [id, value] of Array.from(bindings.entries())) {
                this.varValues.set(id, value);
            }

            // Lower arm body
            const armResultResult = this.lowerBlock(arm.body);
            if (!armResultResult.ok) return armResultResult;
            if (!this.builder.currentBlock!.terminator) {
                this.builder.br(mergeId, []);
            }

            if (matches !== null) {
                this.builder.switchToBlock(nextBlock);
            }
        }

        this.builder.switchToBlock(mergeId);
        return ok(
            hasResult
                ? this.defaultValueForType(resultTy)
                : (this.builder.iconst(0, IntWidth.I8).id as number),
        );
    }

    /**  Lower a pattern check */
    /**  Lower a pattern check */
    lowerPatternCheck(
        value: ValueId,
        pattern: HPat,
        ty: Type,
    ): Result<
        { matches: ValueId | null; bindings: Map<number, ValueId> },
        LoweringError
    > {
        const bindings = new Map();

        switch (pattern.kind) {
            case HPatKind.Wildcard: {
                return ok({ matches: null, bindings });
            }
            case HPatKind.Ident: {
                bindings.set(pattern.id, value);
                return ok({ matches: null, bindings });
            }
            case HPatKind.Literal: {
                const litValue = this.builder.iconst(
                    Number(pattern.value),
                    this.getIntWidth(ty),
                );
                const matches = this.builder.icmp(
                    IcmpOp.Eq,
                    value,
                    litValue.id as number,
                );
                return ok({
                    matches: matches.id as number,
                    bindings,
                });
            }
            case HPatKind.Struct: {
                // For structs, check each field
                let matches = null;
                if (pattern.fields) {
                    for (let i = 0; i < pattern.fields.length; i++) {
                        const field = pattern.fields[i];
                        const fieldTy = this.getFieldType(ty, field.name);
                        const fieldValue = this.builder.structGet(
                            value,
                            i,
                            this.translateType(fieldTy),
                        );
                        const fieldCheckResult = this.lowerPatternCheck(
                            fieldValue.id as number,
                            field.pat,
                            fieldTy,
                        );
                        if (!fieldCheckResult.ok) return fieldCheckResult;
                        const fieldCheck = fieldCheckResult.value;

                        for (const [id, val] of Array.from(
                            fieldCheck.bindings.entries(),
                        )) {
                            bindings.set(id, val);
                        }

                        if (fieldCheck.matches !== null) {
                            if (matches === null) {
                                matches = fieldCheck.matches;
                            } else {
                                const andInst = this.builder.iand(
                                    matches,
                                    fieldCheck.matches,
                                    IntWidth.I8,
                                ) as unknown as { id: ValueId };
                                matches = andInst.id as number;
                            }
                        }
                    }
                }
                return ok({ matches, bindings });
            }
            case HPatKind.Tuple: {
                let matches = null;
                if (pattern.elements && ty.kind === TypeKind.Tuple) {
                    for (let i = 0; i < pattern.elements.length; i++) {
                        const elemPat = pattern.elements[i];
                        const elemTy = ty.elements[i];
                        const elemValue = this.builder.structGet(
                            value,
                            i,
                            this.translateType(elemTy),
                        );
                        const elemCheckResult = this.lowerPatternCheck(
                            elemValue.id as number,
                            elemPat,
                            elemTy,
                        );
                        if (!elemCheckResult.ok) return elemCheckResult;
                        const elemCheck = elemCheckResult.value;

                        for (const [id, val] of Array.from(
                            elemCheck.bindings.entries(),
                        )) {
                            bindings.set(id, val);
                        }

                        if (elemCheck.matches !== null) {
                            if (matches === null) {
                                matches = elemCheck.matches;
                            } else {
                                const andInst = this.builder.iand(
                                    matches,
                                    elemCheck.matches,
                                    IntWidth.I8,
                                ) as unknown as { id: ValueId };
                                matches = andInst.id as number;
                            }
                        }
                    }
                }
                return ok({ matches, bindings });
            }
            case HPatKind.Or: {
                // Or pattern - try each alternative
                if (pattern.alternatives && pattern.alternatives.length > 0) {
                    const firstCheckResult = this.lowerPatternCheck(
                        value,
                        pattern.alternatives[0],
                        ty,
                    );
                    if (!firstCheckResult.ok) return firstCheckResult;
                    const firstCheck = firstCheckResult.value;
                    return ok({
                        matches: firstCheck.matches,
                        bindings: firstCheck.bindings,
                    });
                }
                return ok({ matches: null, bindings });
            }
            default:
                return ok({ matches: null, bindings });
        }
    }

    // ============================================================================
    // Task 9.9: Loop Expression Lowering
    // ============================================================================

    /**  Lower a loop expression */
    lowerLoop(expr: HLoopExpr): Result<ValueId, LoweringError> {
        const headerId = this.builder.createBlock("loop_header");
        const bodyId = this.builder.createBlock("loop_body");
        const exitId = this.builder.createBlock("loop_exit");

        // Jump to header
        this.builder.br(headerId);

        // Header: always branch to body
        this.builder.switchToBlock(headerId);
        this.builder.br(bodyId);
        this.builder.sealBlock(headerId);

        // Body
        this.builder.switchToBlock(bodyId);
        this.breakStack.push(exitId);
        this.continueStack.push(headerId);

        const res_z8pvvs = this.lowerBlock(expr.body);
        if (!res_z8pvvs.ok) return res_z8pvvs;

        this.breakStack.pop();
        this.continueStack.pop();

        // Loop back
        if (!this.builder.currentBlock!.terminator) {
            this.builder.br(headerId);
        }
        this.builder.sealBlock(bodyId);

        // Exit
        this.builder.switchToBlock(exitId);
        this.builder.sealBlock(exitId);

        // Loop returns unit (or value from break)
        return ok(this.builder.iconst(0, IntWidth.I8).id as number);
    }

    // ============================================================================
    // Task 9.10: While Expression Lowering
    // ============================================================================

    /**  Lower a while expression */
    lowerWhile(expr: HWhileExpr): Result<ValueId, LoweringError> {
        const headerId = this.builder.createBlock("while_header");
        const bodyId = this.builder.createBlock("while_body");
        const exitId = this.builder.createBlock("while_exit");

        // Jump to header
        this.builder.br(headerId);

        // Header: check condition
        this.builder.switchToBlock(headerId);
        const condResult = this.lowerExpr(expr.condition);
        if (!condResult.ok) return condResult;
        const cond = condResult.value;
        this.builder.brIf(cond, bodyId, [], exitId, []);
        this.builder.sealBlock(headerId);

        // Body
        this.builder.switchToBlock(bodyId);
        this.breakStack.push(exitId);
        this.continueStack.push(headerId);

        const res_gin2s8 = this.lowerBlock(expr.body);
        if (!res_gin2s8.ok) return res_gin2s8;

        this.breakStack.pop();
        this.continueStack.pop();

        // Loop back
        if (!this.builder.currentBlock!.terminator) {
            this.builder.br(headerId);
        }
        this.builder.sealBlock(bodyId);

        // Exit
        this.builder.switchToBlock(exitId);
        this.builder.sealBlock(exitId);

        // While returns unit
        return ok(this.builder.iconst(0, IntWidth.I8).id as number);
    }

    // ============================================================================
    // Type Translation Helpers
    // ============================================================================

    /**  Translate a HIR type to an IR type */
    translateType(ty: Type | null | undefined): IRType {
        if (!ty) return makeIRUnitType();

        switch (ty.kind) {
            case TypeKind.Int:
                return makeIRIntType(this.translateIntWidth(ty.width));
            case TypeKind.Float:
                return makeIRFloatType(this.translateFloatWidth(ty.width));
            case TypeKind.Bool:
                return makeIRBoolType();
            case TypeKind.Char:
                return makeIRIntType(IntWidth.U32);
            case TypeKind.String:
                return makeIRPtrType(null);
            case TypeKind.Unit:
                return makeIRUnitType();
            case TypeKind.Never:
                return makeIRUnitType();
            case TypeKind.Tuple:
            case TypeKind.Struct: {
                let fields: IRType[] = [];
                let name = "";
                if (ty && ty.kind === TypeKind.Struct) {
                    const structTy = ty as import("./types").StructType;
                    fields = structTy.fields
                        ? structTy.fields.map(
                              (f: import("./types").StructField) =>
                                  this.translateType(f.type),
                          )
                        : [];
                    name = structTy.name || "";
                } else if (ty && ty.kind === TypeKind.Tuple) {
                    const tupleTy = ty as import("./types").TupleType;
                    fields = tupleTy.elements
                        ? tupleTy.elements.map((e: import("./types").Type) =>
                              this.translateType(e),
                          )
                        : [];
                }
                return makeIRStructType(name, fields);
            }
            case TypeKind.Enum:
                return makeIREnumType(
                    ty.name || "",
                    ty.variants
                        ? ty.variants.map((v) =>
                              (v.fields || []).map(
                                  (f: import("./types").Type) =>
                                      this.translateType(f),
                              ),
                          )
                        : [],
                );
            case TypeKind.Array:
                return makeIRArrayType(
                    this.translateType(ty.element),
                    ty.length || 0,
                );
            case TypeKind.Ref:
            case TypeKind.Ptr:
                return makeIRPtrType(this.translateType(ty.inner));
            case TypeKind.Fn:
                return makeIRFnType(
                    ty.params.map((p) => this.translateType(p)),
                    this.translateType(ty.returnType),
                );
            case TypeKind.Named:
                // Preserve named aggregate identity instead of collapsing to unit.
                return makeIRStructType(ty.name || "", []);
            case TypeKind.TypeVar:
                if (ty.bound) {
                    return this.translateType(ty.bound);
                }
                return makeIRUnitType();
            default:
                return makeIRUnitType();
        }
    }

    /**  Translate integer width */
    translateIntWidth(width: IntWidth) {
        // IR uses same IntWidth enum
        return width;
    }

    /**  Translate float width */
    translateFloatWidth(width: FloatWidth) {
        // IR uses same FloatWidth enum
        return width;
    }

    /**  Get integer width from type */
    getIntWidth(ty: Type) {
        if (ty.kind === TypeKind.Int) {
            return ty.width;
        }
        return IntWidth.I32;
    }

    /**  Get float width from type */
    getFloatWidth(ty: Type) {
        if (ty.kind === TypeKind.Float) {
            return ty.width;
        }
        return FloatWidth.F64;
    }

    /**  Check if integer type is signed */
    isSignedIntType(ty: Type) {
        if (ty.kind !== TypeKind.Int) return false;
        return ty.width <= IntWidth.Isize;
    }

    /**  Create a zero/default SSA value for a result type. */
    defaultValueForType(ty: Type | IRType | null | undefined): ValueId {
        if (!ty) {
            return this.builder.iconst(0, IntWidth.I32).id as number;
        }
        // Handle IRType - check for IRTypeKind properties
        const irType = ty as IRType;
        if (irType.kind === IRTypeKind.Bool) {
            return this.builder.bconst(false).id as number;
        }
        if (irType.kind === IRTypeKind.Int) {
            const width = (irType as any).width ?? IntWidth.I32;
            return this.builder.iconst(0, width).id as number;
        }
        if (irType.kind === IRTypeKind.Float) {
            const width = (irType as any).width ?? FloatWidth.F64;
            return this.builder.fconst(0, width).id as number;
        }
        // Handle Type - check for TypeKind properties
        const hirType = ty as Type;
        if (hirType.kind === TypeKind.Bool) {
            return this.builder.bconst(false).id as number;
        }
        if (hirType.kind === TypeKind.Int) {
            return this.builder.iconst(0, this.getIntWidth(hirType))
                .id as number;
        }
        if (hirType.kind === TypeKind.Float) {
            return this.builder.fconst(0, this.getFloatWidth(hirType))
                .id as number;
        }
        return this.builder.iconst(0, IntWidth.I32).id as number;
    }

    /**  Get field type from struct type */
    getFieldType(structTy: Type, fieldName: string) {
        if (structTy.kind === TypeKind.Struct && structTy.fields) {
            const field = structTy.fields.find(
                (f: import("./types").StructField) => f.name === fieldName,
            );
            if (field) {
                return field.type;
            }
        }
        return {
            kind: TypeKind.Unit,
            span: { start: 0, end: 0, line: 0, column: 0 },
        } as unknown as import("./types").Type;
    }

    /**  Get enum field type */
    getEnumFieldType(enumTy: Type, variantIndex: number, fieldIndex: number) {
        if (enumTy.kind === TypeKind.Enum && enumTy.variants) {
            const variant =
                variantIndex >= 0 && variantIndex < enumTy.variants.length
                    ? enumTy.variants[variantIndex]
                    : null;
            if (
                variant &&
                variant.fields &&
                fieldIndex < variant.fields.length
            ) {
                return variant.fields[fieldIndex];
            }
        }
        return {
            kind: TypeKind.Unit,
            span: { start: 0, end: 0, line: 0, column: 0 },
        } as unknown as import("./types").Type;
    }

    /**  Find enum variant index */
    findEnumVariantIndex(enumTy: Type, variantName: string) {
        if (enumTy.kind === TypeKind.Enum && enumTy.variants) {
            for (let i = 0; i < enumTy.variants.length; i++) {
                if (enumTy.variants[i].name === variantName) {
                    return i;
                }
            }
        }
        return -1;
    }

    /**  Resolve function name to ID */
    resolveFunctionId(name: string) {
        // Simple hash-based ID for now
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash) % 1000000;
    }
}

// ============================================================================
// Entry Point
// ============================================================================

/**  Lower a HIR function to SSA IR */
export function lowerHirToSsa(
    fnDecl: HFnDecl,
    options: { irModule?: IRModule } = {},
) {
    const ctx = new HirToSsaCtx(options);
    return ctx.lowerFunction(fnDecl);
}

/**  Lower a HIR module to SSA IR module */
export function lowerModuleToSsa(hirModule: HModule) {
    const irModule = makeIRModule(hirModule.name);

    for (const item of hirModule.items) {
        if (item.kind === HItemKind.Fn) {
            const ctx = new HirToSsaCtx({ irModule });
            const irFnRes = ctx.lowerFunction(item as any);
            if (irFnRes.ok) {
                addIRFunction(irModule, irFnRes.value);
            }
        }
    }

    return irModule;
}
