import { Result } from "better-result";
import {
    BinaryExpr,
    BlockExpr,
    type ClosureExpr,
    type Expression,
    IdentPattern,
    IdentifierExpr,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    type Span,
    type TypeNode,
    walkAst,
} from "../../parse/ast";
import type { IRBuilder } from "../../ir/ir_builder";
import {
    addIRFunction,
    type BoolType,
    type FloatType,
    FloatWidth,
    IntWidth,
    type IRFunction,
    type IRModule,
    type IRType,
    IRTypeKind,
    type IntType,
    type ValueId,
    makeIRBoolType,
    makeIRFloatType,
    makeIRIntType,
    makeIRUnitType,
} from "../../ir/ir";
import {
    LoweringErrorKind,
    type LocalBinding,
    type LoweredValue,
    type LoweringError,
} from "./types";

let closureCounter = 0;

function loweringError<T>(
    kind: LoweringErrorKind,
    message: string,
    span: Span,
): Result<T, LoweringError> {
    return Result.err({ kind, message, span });
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

function collectFreeVars(expr: ClosureExpr): Set<string> {
    const params = new Set(expr.params.map((p) => p.name));
    const bound = new Set<string>(params);
    const free = new Set<string>();

    walkAst(expr.body, (node) => {
        if (node instanceof LetStmt && node.pattern instanceof IdentPattern) {
            bound.add(node.pattern.name);
        }
        if (node instanceof IdentifierExpr && !bound.has(node.name)) {
            free.add(node.name);
        }
    });

    return free;
}

export interface LoweringClosureCtx {
    locals: Map<string, LocalBinding>;
    functionIds: Map<string, number>;
    functionReturnTypes: Map<string, IRType>;
    irModule: IRModule;
    registerSyntheticFunctionId: (name: string) => number;
    lowerClosureFunction: (
        name: string,
        expr: ClosureExpr,
    ) => Result<IRFunction, LoweringError>;
}

export interface LoweringClosureFunctionCtx {
    translateTypeNode: (typeNode: TypeNode) => IRType;
    setCurrentReturnType: (ty: IRType) => void;
    startFunction: (
        name: string,
        paramTypes: IRType[],
        span: Span,
    ) => Result<void, LoweringError>;
    bindLocalValue: (
        name: string,
        value: ValueId,
        ty: IRType,
        options?: { typeNode?: TypeNode },
    ) => void;
    lowerExpression: (expr: Expression) => Result<LoweredValue, LoweringError>;
    isCurrentBlockTerminated: () => boolean;
    currentTypeKind: () => IRTypeKind;
    sealAllBlocks: () => void;
}

export type LowerClosure = (
    expr: ClosureExpr,
    builder: IRBuilder,
    ctx: LoweringClosureCtx,
) => Result<LoweredValue, LoweringError>;

function inferLiteralIRType(lit: LiteralExpr): IntType | FloatType | BoolType {
    if (lit.literalKind === LiteralKind.Float) {
        return makeIRFloatType(floatSuffixToWidth(lit.suffix));
    }
    if (lit.literalKind === LiteralKind.Bool) {
        return makeIRBoolType();
    }
    return makeIRIntType(intSuffixToWidth(lit.suffix));
}

function inferParamTypeFromBody(
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
            result = inferLiteralIRType(right);
        } else if (rightIsParam && left instanceof LiteralExpr) {
            result = inferLiteralIRType(left);
        }
    });
    return result;
}

function resolveClosureParamType(
    param: { name: string; ty: TypeNode },
    body: Expression,
    ctx: LoweringClosureFunctionCtx,
): IRType {
    const explicit = ctx.translateTypeNode(param.ty);
    if (explicit.kind !== IRTypeKind.Unit) {
        return explicit;
    }
    return inferParamTypeFromBody(param.name, body) ?? makeIRIntType(IntWidth.I32);
}

function inferExprType(
    expr: Expression,
    paramTypeMap: Map<string, IRType>,
): IRType {
    if (expr instanceof LiteralExpr) {
        return inferLiteralIRType(expr);
    }
    if (expr instanceof IdentifierExpr) {
        return paramTypeMap.get(expr.name) ?? makeIRUnitType();
    }
    if (expr instanceof BinaryExpr) {
        const leftTy = inferExprType(expr.left, paramTypeMap);
        const rightTy = inferExprType(expr.right, paramTypeMap);
        if (leftTy.kind !== IRTypeKind.Unit) return leftTy;
        if (rightTy.kind !== IRTypeKind.Unit) return rightTy;
    }
    if (expr instanceof BlockExpr && expr.expr !== undefined) {
        return inferExprType(expr.expr, paramTypeMap);
    }
    return makeIRUnitType();
}

function resolveClosureReturnType(
    expr: ClosureExpr,
    paramTypes: IRType[],
    ctx: LoweringClosureFunctionCtx,
): IRType {
    const explicit = ctx.translateTypeNode(expr.returnType);
    if (explicit.kind !== IRTypeKind.Unit) {
        return explicit;
    }
    const paramTypeMap = new Map<string, IRType>();
    for (let i = 0; i < expr.params.length; i++) {
        paramTypeMap.set(expr.params[i].name, paramTypes[i]);
    }
    return inferExprType(expr.body, paramTypeMap);
}

export function lowerClosureFunction(
    name: string,
    expr: ClosureExpr,
    builder: IRBuilder,
    ctx: LoweringClosureFunctionCtx,
): Result<IRFunction, LoweringError> {
    const paramEntries = expr.params.map((p) => ({
        name: p.name,
        ty: p.ty,
    }));
    const paramTypes = paramEntries.map((p) =>
        resolveClosureParamType(p, expr.body, ctx),
    );
    ctx.setCurrentReturnType(resolveClosureReturnType(expr, paramTypes, ctx));
    const startResult = ctx.startFunction(name, paramTypes, expr.span);
    if (startResult.isErr()) {
        return startResult;
    }

    const { currentFunction } = builder;
    if (currentFunction) {
        for (let i = 0; i < paramEntries.length; i++) {
            const paramEntry = paramEntries[i];
            const irType = paramTypes[i];
            ctx.bindLocalValue(paramEntry.name, currentFunction.params[i].id, irType, {
                typeNode: paramEntry.ty,
            });
        }
    }

    const bodyResult = ctx.lowerExpression(expr.body);
    if (!bodyResult.isOk()) {
        return bodyResult;
    }

    if (!ctx.isCurrentBlockTerminated()) {
        if (ctx.currentTypeKind() === IRTypeKind.Unit) {
            builder.ret();
        } else {
            builder.ret(bodyResult.value.id);
        }
    }

    ctx.sealAllBlocks();
    return Result.ok(builder.build());
}

function lowerNonCapturingClosure(
    expr: ClosureExpr,
    builder: IRBuilder,
    ctx: LoweringClosureCtx,
): Result<LoweredValue, LoweringError> {
    const name = `__closure_${closureCounter++}`;
    ctx.registerSyntheticFunctionId(name);

    const closureResult = ctx.lowerClosureFunction(name, expr);
    if (!closureResult.isOk()) {
        return closureResult;
    }

    addIRFunction(ctx.irModule, closureResult.value);
    const fnId = ctx.functionIds.get(name);
    if (fnId === undefined) {
        return loweringError(
            LoweringErrorKind.UnsupportedNode,
            `Unknown function \`${name}\``,
            expr.span,
        );
    }
    const idInst = builder.iconst(fnId, IntWidth.I64);
    return Result.ok({ id: idInst.id, ty: idInst.irType });
}

export function lowerClosureExpr(
    expr: ClosureExpr,
    builder: IRBuilder,
    ctx: LoweringClosureCtx,
): Result<LoweredValue, LoweringError> {
    const freeVars = collectFreeVars(expr);
    const hasCaptures = [...freeVars].some((name) => ctx.locals.has(name));
    if (!hasCaptures) {
        return lowerNonCapturingClosure(expr, builder, ctx);
    }
    return loweringError(
        LoweringErrorKind.UnsupportedNode,
        "capturing closures are not implemented",
        expr.span,
    );
}
