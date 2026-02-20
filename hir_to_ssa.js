// @ts-nocheck
/** @typedef {import('./hir.js').HFnDecl} HFnDecl */
/** @typedef {import('./hir.js').HBlock} HBlock */
/** @typedef {import('./hir.js').HStmt} HStmt */
/** @typedef {import('./hir.js').HExpr} HExpr */
/** @typedef {import('./hir.js').HPlace} HPlace */
/** @typedef {import('./hir.js').HPat} HPat */
/** @typedef {import('./hir.js').HMatchArm} HMatchArm */
/** @typedef {import('./ir.js').IRFunction} IRFunction */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').ValueId} ValueId */
/** @typedef {import('./ir.js').BlockId} BlockId */
/** @typedef {import('./types.js').Type} Type */

import {
    HItemKind,
    HStmtKind,
    HPlaceKind,
    HExprKind,
    HPatKind,
    HLiteralKind,
} from "./hir.js";
import { IRBuilder } from "./ir_builder.js";
import {
    IRTypeKind,
    IcmpOp,
    FcmpOp,
    freshValueId,
    makeIRUnitType,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,
    addIRInstruction,
    makeIRModule,
    addIRFunction,
    internIRStringLiteral,
} from "./ir.js";
import { IntWidth, FloatWidth, TypeKind } from "./types.js";
import { BinaryOp, UnaryOp } from "./ast.js";

// ============================================================================
// Task 9.1: Lowering Context
// ============================================================================

/**
 * Context for HIR -> SSA lowering
 */
export class HirToSsaCtx {
    /**
     * @param {{ irModule?: import('./ir.js').IRModule }} [options]
     */
    constructor(options = {}) {
        /** @type {IRBuilder} */
        this.builder = new IRBuilder();
        /** @type {import('./ir.js').IRModule | null} */
        this.irModule = options.irModule || null;
        /** @type {import('./ir.js').IRModule} */
        this.internalLiteralModule =
            this.irModule || {
                stringLiterals: [],
                stringLiteralIds: new Map(),
            };

        /** @type {BlockId[]} Stack of block IDs for break targets */
        this.breakStack = [];

        /** @type {BlockId[]} Stack of block IDs for continue targets */
        this.continueStack = [];

        /** @type {BlockId | null} Block to return to for function returns */
        this.returnBlock = null;

        /** @type {IRType | null} Return type for current function */
        this.returnType = null;

        /** @type {Map<number, ValueId>} Variable ID -> alloca pointer */
        this.varAllocas = new Map();

        /** @type {Map<number, ValueId>} Variable ID -> current SSA value */
        this.varValues = new Map();

        /** @type {Map<string, { id: number, ty: IRType }>} Variable name -> info */
        this.varNames = new Map();
    }

    // ============================================================================
    // Task 9.2: Function Lowering
    // ============================================================================

    /**
     * Lower a function declaration to IR
     * @param {HFnDecl} fnDecl
     * @returns {IRFunction}
     */
    lowerFunction(fnDecl) {
        // Reset state for new function
        this.varAllocas.clear();
        this.varValues.clear();
        this.varNames.clear();
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
            const paramValue = this.builder.currentFunction.params[i];

            if (param.name) {
                // Store parameter value in variable map
                if (param.pat && param.pat.kind === HPatKind.Ident) {
                    const pat = param.pat;
                    this.varValues.set(pat.id, paramValue.id);
                    this.varNames.set(param.name, {
                        id: pat.id,
                        ty: paramTypes[i],
                    });
                } else {
                    // Simple parameter binding
                    this.varNames.set(param.name, {
                        id: -i - 1,
                        ty: paramTypes[i],
                    });
                    this.varValues.set(-i - 1, paramValue.id);
                }
            }
        }

        // Lower function body
        if (fnDecl.body) {
            const result = this.lowerBlock(fnDecl.body);

            // Add implicit return if needed
            if (!this.builder.currentBlock.terminator) {
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

        return this.builder.build();
    }

    // ============================================================================
    // Task 9.3: Block Lowering
    // ============================================================================

    /**
     * Lower a block (sequence of statements + optional final expression)
     * @param {HBlock} block
     * @returns {ValueId | null}
     */
    lowerBlock(block) {
        let finalValue = null;

        // Lower each statement
        for (const stmt of block.stmts) {
            this.lowerStmt(stmt);

            // If block is terminated, stop
            if (this.builder.currentBlock.terminator) {
                return null;
            }
        }

        // Lower final expression
        if (block.expr) {
            finalValue = this.lowerExpr(block.expr);
        }

        return finalValue;
    }

    // ============================================================================
    // Task 9.4: Statement Lowering
    // ============================================================================

    /**
     * Lower a statement
     * @param {HStmt} stmt
     */
    lowerStmt(stmt) {
        switch (stmt.kind) {
            case HStmtKind.Let:
                this.lowerLetStmt(stmt);
                break;
            case HStmtKind.Assign:
                this.lowerAssignStmt(stmt);
                break;
            case HStmtKind.Expr:
                this.lowerExprStmt(stmt);
                break;
            case HStmtKind.Return:
                this.lowerReturnStmt(stmt);
                break;
            case HStmtKind.Break:
                this.lowerBreakStmt(stmt);
                break;
            case HStmtKind.Continue:
                this.lowerContinueStmt(stmt);
                break;
            default:
                throw new Error(`Unknown statement kind: ${stmt.kind}`);
        }
    }

    /**
     * Lower a let statement
     * @param {import('./hir.js').HLetStmt} stmt
     */
    lowerLetStmt(stmt) {
        // Lower initializer
        let initValue = null;
        if (stmt.init) {
            initValue = this.lowerExpr(stmt.init);
        }

        // Bind pattern
        this.bindPattern(stmt.pat, initValue, stmt.ty);
    }

    /**
     * Bind a pattern to a value
     * @param {HPat} pat
     * @param {ValueId | null} value
     * @param {Type} ty
     */
    bindPattern(pat, value, ty) {
        switch (pat.kind) {
            case HPatKind.Ident: {
                // Identifier pattern - bind variable
                if (value !== null) {
                    this.varValues.set(pat.id, value);
                }
                this.varNames.set(pat.name, {
                    id: pat.id,
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
                    const structTy = this.translateType(ty);
                    for (let i = 0; i < pat.fields.length; i++) {
                        const field = pat.fields[i];
                        const fieldTy = this.getFieldType(ty, field.name);
                        const fieldValue = this.builder.structGet(
                            value,
                            i,
                            this.translateType(fieldTy),
                        );
                        this.bindPattern(field.pat, fieldValue.id, fieldTy);
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
                        this.bindPattern(elemPat, elemValue.id, elemTy);
                    }
                }
                break;
            }
            case HPatKind.Or: {
                // Or pattern - bind first alternative (they should all bind the same vars)
                if (pat.alternatives && pat.alternatives.length > 0) {
                    this.bindPattern(pat.alternatives[0], value, ty);
                }
                break;
            }
        }
    }

    /**
     * Lower an assignment statement
     * @param {import('./hir.js').HAssignStmt} stmt
     */
    lowerAssignStmt(stmt) {
        const value = this.lowerExpr(stmt.value);
        const ptr = this.lowerPlaceToRef(stmt.place);
        const ty = this.translateType(stmt.value.ty);
        this.builder.store(ptr, value, ty);
    }

    /**
     * Lower an expression statement
     * @param {import('./hir.js').HExprStmt} stmt
     */
    lowerExprStmt(stmt) {
        this.lowerExpr(stmt.expr);
    }

    /**
     * Lower a return statement
     * @param {import('./hir.js').HReturnStmt} stmt
     */
    lowerReturnStmt(stmt) {
        let value = null;
        if (stmt.value) {
            value = this.lowerExpr(stmt.value);
        }
        this.builder.ret(value);
    }

    /**
     * Lower a break statement
     * @param {import('./hir.js').HBreakStmt} stmt
     */
    lowerBreakStmt(stmt) {
        const targetBlock = this.breakStack[this.breakStack.length - 1];
        if (targetBlock === undefined) {
            throw new Error("Break outside of loop");
        }

        let value = null;
        if (stmt.value) {
            value = this.lowerExpr(stmt.value);
        }

        this.builder.br(targetBlock, value !== null ? [value] : []);
    }

    /**
     * Lower a continue statement
     * @param {import('./hir.js').HContinueStmt} stmt
     */
    lowerContinueStmt(stmt) {
        const targetBlock = this.continueStack[this.continueStack.length - 1];
        if (targetBlock === undefined) {
            throw new Error("Continue outside of loop");
        }
        this.builder.br(targetBlock);
    }

    // ============================================================================
    // Task 9.5: Expression Lowering
    // ============================================================================

    /**
     * Lower an expression to a ValueId
     * @param {HExpr} expr
     * @returns {ValueId}
     */
    lowerExpr(expr) {
        switch (expr.kind) {
            case HExprKind.Unit:
                return this.lowerUnit(expr);
            case HExprKind.Literal:
                return this.lowerLiteral(expr);
            case HExprKind.Var:
                return this.lowerVar(expr);
            case HExprKind.Binary:
                return this.lowerBinary(expr);
            case HExprKind.Unary:
                return this.lowerUnary(expr);
            case HExprKind.Call:
                return this.lowerCall(expr);
            case HExprKind.Field:
                return this.lowerField(expr);
            case HExprKind.Index:
                return this.lowerIndex(expr);
            case HExprKind.Ref:
                return this.lowerRef(expr);
            case HExprKind.Deref:
                return this.lowerDeref(expr);
            case HExprKind.Struct:
                return this.lowerStruct(expr);
            case HExprKind.Enum:
                return this.lowerEnum(expr);
            case HExprKind.If:
                return this.lowerIf(expr);
            case HExprKind.Match:
                return this.lowerMatch(expr);
            case HExprKind.Loop:
                return this.lowerLoop(expr);
            case HExprKind.While:
                return this.lowerWhile(expr);
            default:
                throw new Error(`Unknown expression kind: ${expr.kind}`);
        }
    }

    /**
     * Lower a unit expression
     * @param {import('./hir.js').HUnitExpr} expr
     * @returns {ValueId}
     */
    lowerUnit(expr) {
        // Unit is represented as a null/void value
        const inst = this.builder.iconst(0, IntWidth.I8);
        return inst.id;
    }

    /**
     * Lower a literal expression
     * @param {import('./hir.js').HLiteralExpr} expr
     * @returns {ValueId}
     */
    lowerLiteral(expr) {
        switch (expr.literalKind) {
            case HLiteralKind.Int: {
                const width = this.getIntWidth(expr.ty);
                const inst = this.builder.iconst(expr.value, width);
                return inst.id;
            }
            case HLiteralKind.Float: {
                const width = this.getFloatWidth(expr.ty);
                const inst = this.builder.fconst(expr.value, width);
                return inst.id;
            }
            case HLiteralKind.Bool: {
                const inst = this.builder.bconst(expr.value);
                return inst.id;
            }
            case HLiteralKind.String: {
                const literalId = internIRStringLiteral(
                    this.internalLiteralModule,
                    String(expr.value),
                );
                const inst = this.builder.sconst(literalId);
                return inst.id;
            }
            case HLiteralKind.Char: {
                const codePoint =
                    typeof expr.value === "string"
                        ? (expr.value.codePointAt(0) ?? 0)
                        : Number(expr.value);
                const inst = this.builder.iconst(codePoint, IntWidth.U32);
                return inst.id;
            }
            default:
                throw new Error(`Unknown literal kind: ${expr.literalKind}`);
        }
    }

    /**
     * Lower a variable expression
     * @param {import('./hir.js').HVarExpr} expr
     * @returns {ValueId}
     */
    lowerVar(expr) {
        // Look up variable by ID
        const value = this.varValues.get(expr.id);
        if (value !== undefined) {
            return value;
        }

        // Look up by name
        const varInfo = this.varNames.get(expr.name);
        if (varInfo) {
            const val = this.varValues.get(varInfo.id);
            if (val !== undefined) {
                return val;
            }
        }

        // Function reference - return a placeholder
        const fnId = this.resolveFunctionId(expr.name);
        const inst = this.builder.iconst(fnId, IntWidth.I64);
        return inst.id;
    }

    /**
     * Lower a binary expression
     * @param {import('./hir.js').HBinaryExpr} expr
     * @returns {ValueId}
     */
    lowerBinary(expr) {
        const left = this.lowerExpr(expr.left);
        const right = this.lowerExpr(expr.right);
        const ty = expr.ty;
        const irTy = this.translateType(ty);
        
        // For comparison operators, we need the operand type, not the result type
        const operandTy = expr.left.ty;

        let inst;

        switch (expr.op) {
            // Arithmetic
            case BinaryOp.Add: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.iadd(left, right, this.getIntWidth(ty));
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fadd(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    throw new Error("Invalid type for add");
                }
                break;
            }
            case BinaryOp.Sub: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.isub(left, right, this.getIntWidth(ty));
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fsub(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    throw new Error("Invalid type for sub");
                }
                break;
            }
            case BinaryOp.Mul: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.imul(left, right, this.getIntWidth(ty));
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fmul(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    throw new Error("Invalid type for mul");
                }
                break;
            }
            case BinaryOp.Div: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.idiv(left, right, this.getIntWidth(ty));
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fdiv(
                        left,
                        right,
                        this.getFloatWidth(ty),
                    );
                } else {
                    throw new Error("Invalid type for div");
                }
                break;
            }
            case BinaryOp.Rem: {
                inst = this.builder.imod(left, right, this.getIntWidth(ty));
                break;
            }

            // Comparison - use operand type, not result type (which is bool)
            case BinaryOp.Eq: {
                if (operandTy.kind === TypeKind.Int) {
                    inst = this.builder.icmp(IcmpOp.Eq, left, right);
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(FcmpOp.Oeq, left, right);
                } else if (operandTy.kind === TypeKind.Bool) {
                    inst = this.builder.icmp(IcmpOp.Eq, left, right);
                } else {
                    throw new Error("Invalid type for eq");
                }
                break;
            }
            case BinaryOp.Ne: {
                if (operandTy.kind === TypeKind.Int) {
                    inst = this.builder.icmp(IcmpOp.Ne, left, right);
                } else if (operandTy.kind === TypeKind.Float) {
                    inst = this.builder.fcmp(FcmpOp.One, left, right);
                } else if (operandTy.kind === TypeKind.Bool) {
                    inst = this.builder.icmp(IcmpOp.Ne, left, right);
                } else {
                    throw new Error("Invalid type for ne");
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
                    inst = this.builder.fcmp(FcmpOp.Olt, left, right);
                } else {
                    throw new Error("Invalid type for lt");
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
                    inst = this.builder.fcmp(FcmpOp.Ole, left, right);
                } else {
                    throw new Error("Invalid type for le");
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
                    inst = this.builder.fcmp(FcmpOp.Ogt, left, right);
                } else {
                    throw new Error("Invalid type for gt");
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
                    inst = this.builder.fcmp(FcmpOp.Oge, left, right);
                } else {
                    throw new Error("Invalid type for ge");
                }
                break;
            }

            // Logical
            case BinaryOp.And: {
                // Short-circuit and is handled separately
                // Here we do bitwise and for bools
                inst = this.builder.iand(left, right, IntWidth.I8);
                break;
            }
            case BinaryOp.Or: {
                // Short-circuit or is handled separately
                // Here we do bitwise or for bools
                inst = this.builder.ior(left, right, IntWidth.I8);
                break;
            }

            // Bitwise
            case BinaryOp.BitXor: {
                inst = this.builder.ixor(left, right, this.getIntWidth(ty));
                break;
            }
            case BinaryOp.BitAnd: {
                inst = this.builder.iand(left, right, this.getIntWidth(ty));
                break;
            }
            case BinaryOp.BitOr: {
                inst = this.builder.ior(left, right, this.getIntWidth(ty));
                break;
            }
            case BinaryOp.Shl: {
                inst = this.builder.ishl(left, right, this.getIntWidth(ty));
                break;
            }
            case BinaryOp.Shr: {
                inst = this.builder.ishr(left, right, this.getIntWidth(ty));
                break;
            }
            default:
                throw new Error(`Unknown binary operator: ${expr.op}`);
        }

        return inst.id;
    }

    /**
     * Lower a unary expression
     * @param {import('./hir.js').HUnaryExpr} expr
     * @returns {ValueId}
     */
    lowerUnary(expr) {
        const operand = this.lowerExpr(expr.operand);
        const ty = expr.ty;

        let inst;

        switch (expr.op) {
            case UnaryOp.Neg: {
                if (ty.kind === TypeKind.Int) {
                    inst = this.builder.ineg(operand, this.getIntWidth(ty));
                } else if (ty.kind === TypeKind.Float) {
                    inst = this.builder.fneg(operand, this.getFloatWidth(ty));
                } else {
                    throw new Error("Invalid type for neg");
                }
                break;
            }
            case UnaryOp.Not: {
                if (ty.kind === TypeKind.Bool) {
                    // Logical not: xor with true
                    const one = this.builder.bconst(true);
                    inst = this.builder.ixor(operand, one.id, IntWidth.I8);
                } else if (ty.kind === TypeKind.Int) {
                    // Bitwise not: xor with -1 (all ones)
                    const allOnes = this.builder.iconst(
                        -1,
                        this.getIntWidth(ty),
                    );
                    inst = this.builder.ixor(
                        operand,
                        allOnes.id,
                        this.getIntWidth(ty),
                    );
                } else {
                    throw new Error("Invalid type for not");
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
                throw new Error(`Unknown unary operator: ${expr.op}`);
        }

        return inst.id;
    }

    /**
     * Lower a call expression
     * @param {import('./hir.js').HCallExpr} expr
     * @returns {ValueId}
     */
    lowerCall(expr) {
        // Get callee - could be a function name or a function pointer
        let fnId;
        if (expr.callee.kind === HExprKind.Var) {
            fnId = this.resolveFunctionId(expr.callee.name);
        } else {
            // Complex callee - evaluate it
            fnId = this.lowerExpr(expr.callee);
        }

        const args = expr.args.map((arg) => this.lowerExpr(arg));
        const returnType = this.translateType(expr.ty);

        const inst = this.builder.call(fnId, args, returnType);
        return inst.id;
    }

    /**
     * Lower a field access expression
     * @param {import('./hir.js').HFieldExpr} expr
     * @returns {ValueId}
     */
    lowerField(expr) {
        const base = this.lowerExpr(expr.base);
        const fieldIndex = expr.index;
        const fieldTy = this.translateType(expr.ty);

        const inst = this.builder.structGet(base, fieldIndex, fieldTy);
        return inst.id;
    }

    /**
     * Lower an index expression
     * @param {import('./hir.js').HIndexExpr} expr
     * @returns {ValueId}
     */
    lowerIndex(expr) {
        const base = this.lowerExpr(expr.base);
        const index = this.lowerExpr(expr.index);
        const elemTy = this.translateType(expr.ty);

        // For arrays, use gep
        const inst = this.builder.gep(base, [index], elemTy);
        return inst.id;
    }

    /**
     * Lower a reference expression
     * @param {import('./hir.js').HRefExpr} expr
     * @returns {ValueId}
     */
    lowerRef(expr) {
        // Get a pointer to the operand
        const ptr = this.lowerPlaceToRef(expr.operand);
        return ptr;
    }

    /**
     * Lower a dereference expression
     * @param {import('./hir.js').HDerefExpr} expr
     * @returns {ValueId}
     */
    lowerDeref(expr) {
        const ptr = this.lowerExpr(expr.operand);
        const ty = this.translateType(expr.ty);
        const inst = this.builder.load(ptr, ty);
        return inst.id;
    }

    /**
     * Lower a struct construction expression
     * @param {import('./hir.js').HStructExpr} expr
     * @returns {ValueId}
     */
    lowerStruct(expr) {
        const fields = expr.fields.map((f) => this.lowerExpr(f.value));
        const structTy = this.translateType(expr.ty);

        const inst = this.builder.structCreate(fields, structTy);
        return inst.id;
    }

    /**
     * Lower an enum construction expression
     * @param {import('./hir.js').HEnumExpr} expr
     * @returns {ValueId}
     */
    lowerEnum(expr) {
        const variant = expr.variantIndex;
        const data =
            expr.fields.length > 0
                ? expr.fields.length === 1
                    ? this.lowerExpr(expr.fields[0])
                    : this.builder.structCreate(
                          expr.fields.map((f) => this.lowerExpr(f)),
                          makeIRStructType(
                              "",
                              expr.fields.map((f) => this.translateType(f.ty)),
                          ),
                      ).id
                : null;
        const enumTy = this.translateType(expr.ty);

        const inst = this.builder.enumCreate(variant, data, enumTy);
        return inst.id;
    }

    // ============================================================================
    // Task 9.6: Place Lowering
    // ============================================================================

    /**
     * Lower a place to a reference (pointer)
     * @param {HPlace | HExpr} place
     * @returns {ValueId}
     */
    lowerPlaceToRef(place) {
        // Handle expressions that are places
        if (place.kind === HExprKind.Var) {
            // Variable - need to allocate if not already
            const varInfo = this.varNames.get(place.name);
            if (varInfo) {
                // For now, variables are SSA values, so we need to allocate
                const ty = this.translateType(place.ty);
                const alloca = this.builder.alloca(ty);
                const value = this.varValues.get(varInfo.id);
                if (value !== undefined) {
                    this.builder.store(alloca.id, value, ty);
                }
                return alloca.id;
            }
            throw new Error(`Unknown variable: ${place.name}`);
        }

        if (place.kind === HExprKind.Field) {
            // Field access - need pointer to field
            const basePtr = this.lowerPlaceToRef(place.base);
            const fieldIndex = place.index;
            const fieldTy = this.translateType(place.ty);
            const inst = this.builder.gep(
                basePtr,
                [
                    this.builder.iconst(0, IntWidth.I32).id,
                    this.builder.iconst(fieldIndex, IntWidth.I32).id,
                ],
                fieldTy,
            );
            return inst.id;
        }

        if (place.kind === HExprKind.Index) {
            // Index access - need pointer to element
            const basePtr = this.lowerPlaceToRef(place.base);
            const index = this.lowerExpr(place.index);
            const elemTy = this.translateType(place.ty);
            const inst = this.builder.gep(basePtr, [index], elemTy);
            return inst.id;
        }

        if (place.kind === HExprKind.Deref) {
            // Deref - the operand is already a pointer
            return this.lowerExpr(place.operand);
        }

        // Handle HPlace types
        switch (place.kind) {
            case HPlaceKind.Var: {
                const ty = this.translateType(place.ty);
                const alloca = this.builder.alloca(ty);
                const value = this.varValues.get(place.id);
                if (value !== undefined) {
                    this.builder.store(alloca.id, value, ty);
                }
                return alloca.id;
            }
            case HPlaceKind.Field: {
                const basePtr = this.lowerPlaceToRef(place.base);
                const fieldIndex = place.index;
                const fieldTy = this.translateType(place.ty);
                const inst = this.builder.gep(
                    basePtr,
                    [
                        this.builder.iconst(0, IntWidth.I32).id,
                        this.builder.iconst(fieldIndex, IntWidth.I32).id,
                    ],
                    fieldTy,
                );
                return inst.id;
            }
            case HPlaceKind.Index: {
                const basePtr = this.lowerPlaceToRef(place.base);
                const index = this.lowerExpr(place.index);
                const elemTy = this.translateType(place.ty);
                const inst = this.builder.gep(basePtr, [index], elemTy);
                return inst.id;
            }
            case HPlaceKind.Deref: {
                return this.lowerExpr(place.base);
            }
            default:
                throw new Error(`Unknown place kind: ${place.kind}`);
        }
    }

    // ============================================================================
    // Task 9.7: If Expression Lowering
    // ============================================================================

    /**
     * Lower an if expression
     * @param {import('./hir.js').HIfExpr} expr
     * @returns {ValueId}
     */
    lowerIf(expr) {
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
        const cond = this.lowerExpr(expr.condition);

        // Branch to then/else
        if (elseId) {
            this.builder.brIf(cond, thenId, [], elseId, []);
        } else {
            this.builder.brIf(cond, thenId, [], mergeId, []);
        }

        // Lower then branch
        this.builder.switchToBlock(thenId);
        const thenResult = this.lowerBlock(expr.thenBranch);
        if (!this.builder.currentBlock.terminator) {
            if (hasResult) {
                if (thenResult === null) {
                    throw new Error("If then branch is missing result value");
                }
                this.builder.br(mergeId, [thenResult]);
            } else {
                this.builder.br(mergeId);
            }
        }
        this.builder.sealBlock(thenId);

        // Lower else branch
        let elseResult = null;
        if (elseId && expr.elseBranch) {
            this.builder.switchToBlock(elseId);
            elseResult = this.lowerBlock(expr.elseBranch);
            if (!this.builder.currentBlock.terminator) {
                if (hasResult) {
                    if (elseResult === null) {
                        throw new Error(
                            "If else branch is missing result value",
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
                throw new Error("If merge block is missing result parameter");
            }
            return mergeBlock.params[0].id;
        }

        return this.builder.iconst(0, IntWidth.I8).id;
    }

    // ============================================================================
    // Task 9.8: Match Expression Lowering
    // ============================================================================

    /**
     * Lower a match expression
     * @param {import('./hir.js').HMatchExpr} expr
     * @returns {ValueId}
     */
    lowerMatch(expr) {
        const scrutinee = this.lowerExpr(expr.scrutinee);
        const arms = expr.arms;
        const hasResult = expr.ty.kind !== TypeKind.Unit;
        const resultTy = this.translateType(expr.ty);

        // For simple matches, use switch
        // For complex patterns, generate decision tree

        if (arms.length === 0) {
            // No arms - unreachable
            this.builder.unreachable();
            return this.builder.iconst(0, IntWidth.I8).id;
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

    /**
     * Lower a match using switch
     */
    lowerMatchSwitch(expr, scrutinee, arms, hasResult, resultTy) {
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
                const caseValue = this.builder.iconst(
                    Number(arm.pat.value),
                    IntWidth.I32,
                ).id;
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

        this.builder.switch(scrutinee, cases, defaultBlock, []);

        // Lower each arm
        let resultValue = null;
        for (let i = 0; i < arms.length; i++) {
            this.builder.switchToBlock(armBlocks[i]);

            // Bind pattern
            this.bindPattern(arms[i].pat, scrutinee, expr.scrutinee.ty);

            // Check guard
            if (arms[i].guard) {
                const guardResult = this.lowerExpr(arms[i].guard);
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

            const armResult = this.lowerBlock(arms[i].body);
            if (!this.builder.currentBlock.terminator) {
                this.builder.br(
                    mergeId,
                    hasResult && armResult !== null ? [armResult] : [],
                );
            }
            this.builder.sealBlock(armBlocks[i]);
        }

        this.builder.switchToBlock(mergeId);
        this.builder.sealBlock(mergeId);

        return hasResult
            ? this.builder.iconst(0, IntWidth.I32).id
            : this.builder.iconst(0, IntWidth.I8).id;
    }

    /**
     * Lower an enum match
     */
    lowerEnumMatch(expr, scrutinee, arms, hasResult, resultTy) {
        const mergeId = this.builder.createBlock("match_merge");
        const armBlocks = arms.map((_, i) =>
            this.builder.createBlock(`arm${i}`),
        );

        // Get enum tag
        const tag = this.builder.enumGetTag(scrutinee);

        // Build switch on tag
        const cases = [];
        let defaultBlock = mergeId;

        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            if (
                arm.pat.kind === HPatKind.Struct &&
                arm.pat.name === expr.scrutinee.ty.name
            ) {
                // Enum variant pattern - need to find variant index
                const variantIndex = this.findEnumVariantIndex(
                    expr.scrutinee.ty,
                    arm.pat.name,
                );
                const caseValue = this.builder.iconst(
                    variantIndex,
                    IntWidth.I32,
                ).id;
                cases.push({
                    value: caseValue,
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

        this.builder.switch(tag.id, cases, defaultBlock, []);

        // Lower each arm
        for (let i = 0; i < arms.length; i++) {
            this.builder.switchToBlock(armBlocks[i]);

            // Bind pattern
            this.bindEnumPattern(arms[i].pat, scrutinee, expr.scrutinee.ty);

            const armResult = this.lowerBlock(arms[i].body);
            if (!this.builder.currentBlock.terminator) {
                this.builder.br(
                    mergeId,
                    hasResult && armResult !== null ? [armResult] : [],
                );
            }
            this.builder.sealBlock(armBlocks[i]);
        }

        this.builder.switchToBlock(mergeId);
        this.builder.sealBlock(mergeId);

        return hasResult
            ? this.builder.iconst(0, IntWidth.I32).id
            : this.builder.iconst(0, IntWidth.I8).id;
    }

    /**
     * Bind an enum pattern
     */
    bindEnumPattern(pat, enumValue, enumTy) {
        if (pat.kind === HPatKind.Struct && pat.fields) {
            // Extract and bind each field
            for (let i = 0; i < pat.fields.length; i++) {
                const field = pat.fields[i];
                const fieldTy = this.getEnumFieldType(enumTy, i);
                const fieldValue = this.builder.enumGetData(
                    enumValue,
                    0,
                    i,
                    this.translateType(fieldTy),
                );
                this.bindPattern(field.pat, fieldValue.id, fieldTy);
            }
        } else if (pat.kind === HPatKind.Ident) {
            // Bind whole enum value
            this.varValues.set(pat.id, enumValue);
        }
    }

    /**
     * Lower a match using decision tree
     */
    lowerMatchDecisionTree(expr, scrutinee, arms, hasResult, resultTy) {
        // Simplified: just lower first matching arm
        const mergeId = this.builder.createBlock("match_merge");

        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            const armBlock = this.builder.createBlock(`arm${i}`);
            const nextBlock =
                i < arms.length - 1
                    ? this.builder.createBlock(`next${i}`)
                    : mergeId;

            // Generate pattern check
            const { matches, bindings } = this.lowerPatternCheck(
                scrutinee,
                arm.pat,
                expr.scrutinee.ty,
            );

            if (matches !== null) {
                const thenBlock = this.builder.createBlock("pat_then");
                this.builder.brIf(matches, thenBlock, [], nextBlock, []);

                this.builder.switchToBlock(thenBlock);
            }

            // Apply bindings
            for (const [id, value] of bindings) {
                this.varValues.set(id, value);
            }

            // Lower arm body
            const armResult = this.lowerBlock(arm.body);
            if (!this.builder.currentBlock.terminator) {
                this.builder.br(
                    mergeId,
                    hasResult && armResult !== null ? [armResult] : [],
                );
            }

            if (matches !== null) {
                this.builder.switchToBlock(nextBlock);
            }
        }

        this.builder.switchToBlock(mergeId);
        return hasResult
            ? this.builder.iconst(0, IntWidth.I32).id
            : this.builder.iconst(0, IntWidth.I8).id;
    }

    /**
     * Lower a pattern check
     * @returns {{ matches: ValueId | null, bindings: Map<number, ValueId> }}
     */
    lowerPatternCheck(value, pattern, ty) {
        const bindings = new Map();

        switch (pattern.kind) {
            case HPatKind.Wildcard: {
                return { matches: null, bindings };
            }
            case HPatKind.Ident: {
                bindings.set(pattern.id, value);
                return { matches: null, bindings };
            }
            case HPatKind.Literal: {
                const litValue = this.builder.iconst(
                    pattern.value,
                    this.getIntWidth(ty),
                );
                const matches = this.builder.icmp(
                    IcmpOp.Eq,
                    value,
                    litValue.id,
                );
                return { matches: matches.id, bindings };
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
                        const fieldCheck = this.lowerPatternCheck(
                            fieldValue.id,
                            field.pat,
                            fieldTy,
                        );

                        for (const [id, val] of fieldCheck.bindings) {
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
                                );
                                matches = andInst.id;
                            }
                        }
                    }
                }
                return { matches, bindings };
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
                        const elemCheck = this.lowerPatternCheck(
                            elemValue.id,
                            elemPat,
                            elemTy,
                        );

                        for (const [id, val] of elemCheck.bindings) {
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
                                );
                                matches = andInst.id;
                            }
                        }
                    }
                }
                return { matches, bindings };
            }
            case HPatKind.Or: {
                // Or pattern - try each alternative
                if (pattern.alternatives && pattern.alternatives.length > 0) {
                    const firstCheck = this.lowerPatternCheck(
                        value,
                        pattern.alternatives[0],
                        ty,
                    );
                    return firstCheck;
                }
                return { matches: null, bindings };
            }
            default:
                return { matches: null, bindings };
        }
    }

    // ============================================================================
    // Task 9.9: Loop Expression Lowering
    // ============================================================================

    /**
     * Lower a loop expression
     * @param {import('./hir.js').HLoopExpr} expr
     * @returns {ValueId}
     */
    lowerLoop(expr) {
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

        this.lowerBlock(expr.body);

        this.breakStack.pop();
        this.continueStack.pop();

        // Loop back
        if (!this.builder.currentBlock.terminator) {
            this.builder.br(headerId);
        }
        this.builder.sealBlock(bodyId);

        // Exit
        this.builder.switchToBlock(exitId);
        this.builder.sealBlock(exitId);

        // Loop returns unit (or value from break)
        return this.builder.iconst(0, IntWidth.I8).id;
    }

    // ============================================================================
    // Task 9.10: While Expression Lowering
    // ============================================================================

    /**
     * Lower a while expression
     * @param {import('./hir.js').HWhileExpr} expr
     * @returns {ValueId}
     */
    lowerWhile(expr) {
        const headerId = this.builder.createBlock("while_header");
        const bodyId = this.builder.createBlock("while_body");
        const exitId = this.builder.createBlock("while_exit");

        // Jump to header
        this.builder.br(headerId);

        // Header: check condition
        this.builder.switchToBlock(headerId);
        const cond = this.lowerExpr(expr.condition);
        this.builder.brIf(cond, bodyId, [], exitId, []);
        this.builder.sealBlock(headerId);

        // Body
        this.builder.switchToBlock(bodyId);
        this.breakStack.push(exitId);
        this.continueStack.push(headerId);

        this.lowerBlock(expr.body);

        this.breakStack.pop();
        this.continueStack.pop();

        // Loop back
        if (!this.builder.currentBlock.terminator) {
            this.builder.br(headerId);
        }
        this.builder.sealBlock(bodyId);

        // Exit
        this.builder.switchToBlock(exitId);
        this.builder.sealBlock(exitId);

        // While returns unit
        return this.builder.iconst(0, IntWidth.I8).id;
    }

    // ============================================================================
    // Type Translation Helpers
    // ============================================================================

    /**
     * Translate a HIR type to an IR type
     * @param {Type} ty
     * @returns {IRType}
     */
    translateType(ty) {
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
                const fields = ty.fields
                    ? ty.fields.map((f) => this.translateType(f.type || f))
                    : ty.elements
                      ? ty.elements.map((e) => this.translateType(e))
                      : [];
                return makeIRStructType(ty.name || "", fields);
            }
            case TypeKind.Enum:
                return makeIREnumType(
                    ty.name || "",
                    ty.variants ? ty.variants.map((v) => v.fields || []) : [],
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
                // Named type - treat as unit for now
                return makeIRUnitType();
            case TypeKind.TypeVar:
                if (ty.bound) {
                    return this.translateType(ty.bound);
                }
                return makeIRUnitType();
            default:
                return makeIRUnitType();
        }
    }

    /**
     * Translate integer width
     * @param {number} width
     * @returns {number}
     */
    translateIntWidth(width) {
        // IR uses same IntWidth enum
        return width;
    }

    /**
     * Translate float width
     * @param {number} width
     * @returns {number}
     */
    translateFloatWidth(width) {
        // IR uses same FloatWidth enum
        return width;
    }

    /**
     * Get integer width from type
     * @param {Type} ty
     * @returns {number}
     */
    getIntWidth(ty) {
        if (ty.kind === TypeKind.Int) {
            return ty.width;
        }
        return IntWidth.I32;
    }

    /**
     * Get float width from type
     * @param {Type} ty
     * @returns {number}
     */
    getFloatWidth(ty) {
        if (ty.kind === TypeKind.Float) {
            return ty.width;
        }
        return FloatWidth.F64;
    }

    /**
     * Check if integer type is signed
     * @param {Type} ty
     * @returns {boolean}
     */
    isSignedIntType(ty) {
        if (ty.kind !== TypeKind.Int) return false;
        return ty.width <= IntWidth.Isize;
    }

    /**
     * Get field type from struct type
     * @param {Type} structTy
     * @param {string} fieldName
     * @returns {Type}
     */
    getFieldType(structTy, fieldName) {
        if (structTy.kind === TypeKind.Struct && structTy.fields) {
            const field = structTy.fields.find((f) => f.name === fieldName);
            if (field) {
                return field.type;
            }
        }
        return { kind: TypeKind.Unit };
    }

    /**
     * Get enum field type
     * @param {Type} enumTy
     * @param {number} fieldIndex
     * @returns {Type}
     */
    getEnumFieldType(enumTy, fieldIndex) {
        if (enumTy.kind === TypeKind.Enum && enumTy.variants) {
            const variant = enumTy.variants[0]; // Simplified
            if (
                variant &&
                variant.fields &&
                fieldIndex < variant.fields.length
            ) {
                return variant.fields[fieldIndex];
            }
        }
        return { kind: TypeKind.Unit };
    }

    /**
     * Find enum variant index
     * @param {Type} enumTy
     * @param {string} variantName
     * @returns {number}
     */
    findEnumVariantIndex(enumTy, variantName) {
        if (enumTy.kind === TypeKind.Enum && enumTy.variants) {
            for (let i = 0; i < enumTy.variants.length; i++) {
                if (enumTy.variants[i].name === variantName) {
                    return i;
                }
            }
        }
        return 0;
    }

    /**
     * Resolve function name to ID
     * @param {string} name
     * @returns {number}
     */
    resolveFunctionId(name) {
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

/**
 * Lower a HIR function to SSA IR
 * @param {HFnDecl} hirFn
 * @returns {IRFunction}
 */
export function lowerHirToSsa(hirFn, options = {}) {
    const ctx = new HirToSsaCtx(options);
    return ctx.lowerFunction(hirFn);
}

/**
 * Lower a HIR module to SSA IR module
 * @param {import('./hir.js').HModule} hirModule
 * @returns {import('./ir.js').IRModule}
 */
export function lowerModuleToSsa(hirModule) {
    const irModule = makeIRModule(hirModule.name);

    for (const item of hirModule.items) {
        if (item.kind === HItemKind.Fn) {
            const ctx = new HirToSsaCtx({ irModule });
            const irFn = ctx.lowerFunction(item);
            addIRFunction(irModule, irFn);
        }
    }

    return irModule;
}
