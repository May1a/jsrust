import { Result } from "better-result";
import { match } from "ts-pattern";
import {
    BinaryExpr,
    BinaryOp,
    BlockExpr,
    ConstItem,
    type Expression,
    IdentifierExpr,
    LiteralExpr,
    LiteralKind,
    ModItem,
    type ModuleNode,
    NamedTypeNode,
    PathExpr,
    RefTypeNode,
    type Span,
    type TypeNode,
    UnaryExpr,
    UnaryOp,
    type Item,
} from "../parse/ast";
import { FloatWidth, IntWidth } from "../ir/ir";

export type ConstValue =
    | { kind: "int"; width: IntWidth; value: number }
    | { kind: "float"; width: FloatWidth; value: number }
    | { kind: "bool"; value: boolean }
    | { kind: "string"; value: string }
    | { kind: "char"; value: number };

export type ConstEvalError = {
    message: string;
    span: Span;
};

const BITS_I8 = 8;
const BITS_I16 = 16;
const BITS_I32 = 32;
const BITS_I64 = 64;
const BITS_I128 = 128;
const MIN_WIDE_INT_BITS = 64;

function intWidthBitSize(width: IntWidth): number {
    switch (width) {
        case IntWidth.I8: {
            return BITS_I8;
        }
        case IntWidth.I16: {
            return BITS_I16;
        }
        case IntWidth.I32: {
            return BITS_I32;
        }
        case IntWidth.I64: {
            return BITS_I64;
        }
        case IntWidth.I128: {
            return BITS_I128;
        }
        case IntWidth.Isize: {
            return BITS_I32;
        }
        case IntWidth.U8: {
            return BITS_I8;
        }
        case IntWidth.U16: {
            return BITS_I16;
        }
        case IntWidth.U32: {
            return BITS_I32;
        }
        case IntWidth.U64: {
            return BITS_I64;
        }
        case IntWidth.U128: {
            return BITS_I128;
        }
        case IntWidth.Usize: {
            return BITS_I32;
        }
        default: {
            const exhaustive: never = width;
            return exhaustive;
        }
    }
}

function isSignedIntWidth(width: IntWidth): boolean {
    return match(width)
        .with(
            IntWidth.I8,
            IntWidth.I16,
            IntWidth.I32,
            IntWidth.I64,
            IntWidth.I128,
            IntWidth.Isize,
            () => true,
        )
        .otherwise(() => false);
}

function namedTypeToIntWidth(name: string): IntWidth | undefined {
    const n = name.toLowerCase();
    return match(n)
        .with("i8", () => IntWidth.I8)
        .with("i16", () => IntWidth.I16)
        .with("i32", () => IntWidth.I32)
        .with("i64", () => IntWidth.I64)
        .with("i128", () => IntWidth.I128)
        .with("isize", () => IntWidth.Isize)
        .with("u8", () => IntWidth.U8)
        .with("u16", () => IntWidth.U16)
        .with("u32", () => IntWidth.U32)
        .with("u64", () => IntWidth.U64)
        .with("u128", () => IntWidth.U128)
        .with("usize", () => IntWidth.Usize)
        .otherwise((): undefined => undefined);
}

function namedTypeToFloatWidth(name: string): FloatWidth | undefined {
    const n = name.toLowerCase();
    return match(n)
        .with("f32", () => FloatWidth.F32)
        .with("f64", () => FloatWidth.F64)
        .otherwise((): undefined => undefined);
}

function err(message: string, span: Span): ConstEvalError {
    return { message, span };
}

function qualifyName(modulePrefix: string, name: string): string {
    if (modulePrefix === "") {
        return name;
    }
    return `${modulePrefix}::${name}`;
}

function collectConstItems(
    items: Item[],
    modulePrefix: string,
    out: { qualName: string; item: ConstItem }[],
): void {
    for (const item of items) {
        if (item instanceof ConstItem) {
            out.push({
                qualName: qualifyName(modulePrefix, item.name),
                item,
            });
        } else if (item instanceof ModItem) {
            collectConstItems(
                item.items,
                qualifyName(modulePrefix, item.name),
                out,
            );
        }
    }
}

function evalLiteral(expr: LiteralExpr): Result<ConstValue, ConstEvalError> {
    switch (expr.literalKind) {
        case LiteralKind.Int: {
            const value = Number(expr.value);
            return Result.ok({
                kind: "int",
                width: IntWidth.I32,
                value,
            });
        }
        case LiteralKind.Float: {
            const value = Number(expr.value);
            return Result.ok({
                kind: "float",
                width: FloatWidth.F64,
                value,
            });
        }
        case LiteralKind.Bool: {
            return Result.ok({ kind: "bool", value: Boolean(expr.value) });
        }
        case LiteralKind.String: {
            return Result.ok({ kind: "string", value: String(expr.value) });
        }
        case LiteralKind.Char: {
            let cp = Number(expr.value);
            if (typeof expr.value === "string") {
                cp = expr.value.codePointAt(0) ?? 0;
            }
            return Result.ok({ kind: "char", value: cp });
        }
        default: {
            const exhaustive: never = expr.literalKind;
            return Result.err(
                err(`unsupported literal in const: ${String(exhaustive)}`, expr.span),
            );
        }
    }
}

function asNumber(
    cv: ConstValue,
    span: Span,
): Result<number, ConstEvalError> {
    if (cv.kind === "int" || cv.kind === "float") {
        return Result.ok(cv.value);
    }
    if (cv.kind === "bool") {
        let n = 0;
        if (cv.value) {
            n = 1;
        }
        return Result.ok(n);
    }
    return Result.err(
        err("expected a numeric value in const expression", span),
    );
}

function asBool(cv: ConstValue, span: Span): Result<boolean, ConstEvalError> {
    if (cv.kind === "bool") {
        return Result.ok(cv.value);
    }
    return Result.err(err("expected `bool` in const expression", span));
}

function asIntValue(
    cv: ConstValue,
    span: Span,
): Result<number, ConstEvalError> {
    if (cv.kind === "int") {
        return Result.ok(cv.value);
    }
    return Result.err(err("expected integer in const expression", span));
}

function floatResultWidth(
    left: ConstValue,
    right: ConstValue,
): FloatWidth {
    if (left.kind === "float") {
        return left.width;
    }
    if (right.kind === "float") {
        return right.width;
    }
    return FloatWidth.F64;
}

function evalBinaryFloat(
    op: BinaryOp,
    a: number,
    b: number,
    width: FloatWidth,
    span: Span,
): Result<ConstValue, ConstEvalError> {
    return match(op)
        .with(BinaryOp.Add, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "float", width, value: a + b };
            return Result.ok(v);
        })
        .with(BinaryOp.Sub, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "float", width, value: a - b };
            return Result.ok(v);
        })
        .with(BinaryOp.Mul, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "float", width, value: a * b };
            return Result.ok(v);
        })
        .with(BinaryOp.Div, (): Result<ConstValue, ConstEvalError> => {
            if (b === 0) {
                return Result.err(err("division by zero in const", span));
            }
            const v: ConstValue = { kind: "float", width, value: a / b };
            return Result.ok(v);
        })
        .with(BinaryOp.Rem, (): Result<ConstValue, ConstEvalError> => {
            if (b === 0) {
                return Result.err(err("remainder by zero in const", span));
            }
            const v: ConstValue = { kind: "float", width, value: a % b };
            return Result.ok(v);
        })
        .with(BinaryOp.Eq, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a === b };
            return Result.ok(v);
        })
        .with(BinaryOp.Ne, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a !== b };
            return Result.ok(v);
        })
        .with(BinaryOp.Lt, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a < b };
            return Result.ok(v);
        })
        .with(BinaryOp.Le, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a <= b };
            return Result.ok(v);
        })
        .with(BinaryOp.Gt, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a > b };
            return Result.ok(v);
        })
        .with(BinaryOp.Ge, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a >= b };
            return Result.ok(v);
        })
        .otherwise(() =>
            Result.err(
                err("unsupported float operator in const expression", span),
            ),
        );
}

function evalBinaryBool(
    op: BinaryOp,
    left: ConstValue,
    right: ConstValue,
    span: Span,
): Result<ConstValue, ConstEvalError> {
    if (left.kind !== "bool" || right.kind !== "bool") {
        return Result.err(
            err("internal: evalBinaryBool expects bool operands", span),
        );
    }
    return match(op)
        .with(BinaryOp.And, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = {
                kind: "bool",
                value: left.value && right.value,
            };
            return Result.ok(v);
        })
        .with(BinaryOp.Or, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = {
                kind: "bool",
                value: left.value || right.value,
            };
            return Result.ok(v);
        })
        .with(BinaryOp.Eq, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = {
                kind: "bool",
                value: left.value === right.value,
            };
            return Result.ok(v);
        })
        .with(BinaryOp.Ne, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = {
                kind: "bool",
                value: left.value !== right.value,
            };
            return Result.ok(v);
        })
        .otherwise(() =>
            Result.err(
                err("unsupported bool operator in const expression", span),
            ),
        );
}

function intBinaryWidth(left: ConstValue, right: ConstValue): IntWidth {
    if (left.kind === "int") {
        return left.width;
    }
    if (right.kind === "int") {
        return right.width;
    }
    return IntWidth.I32;
}

function evalBinaryInt(
    op: BinaryOp,
    a: number,
    b: number,
    width: IntWidth,
    span: Span,
): Result<ConstValue, ConstEvalError> {
    return match(op)
        .with(BinaryOp.Add, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a + b };
            return Result.ok(v);
        })
        .with(BinaryOp.Sub, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a - b };
            return Result.ok(v);
        })
        .with(BinaryOp.Mul, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: Math.imul(a, b) };
            return Result.ok(v);
        })
        .with(BinaryOp.Div, (): Result<ConstValue, ConstEvalError> => {
            if (b === 0) {
                return Result.err(err("division by zero in const", span));
            }
            const v: ConstValue = {
                kind: "int",
                width,
                value: Math.trunc(a / b),
            };
            return Result.ok(v);
        })
        .with(BinaryOp.Rem, (): Result<ConstValue, ConstEvalError> => {
            if (b === 0) {
                return Result.err(err("remainder by zero in const", span));
            }
            const v: ConstValue = { kind: "int", width, value: a % b };
            return Result.ok(v);
        })
        .with(BinaryOp.BitAnd, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a & b };
            return Result.ok(v);
        })
        .with(BinaryOp.BitOr, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a | b };
            return Result.ok(v);
        })
        .with(BinaryOp.BitXor, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a ^ b };
            return Result.ok(v);
        })
        .with(BinaryOp.Shl, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a << b };
            return Result.ok(v);
        })
        .with(BinaryOp.Shr, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "int", width, value: a >> b };
            return Result.ok(v);
        })
        .with(BinaryOp.Eq, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a === b };
            return Result.ok(v);
        })
        .with(BinaryOp.Ne, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a !== b };
            return Result.ok(v);
        })
        .with(BinaryOp.Lt, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a < b };
            return Result.ok(v);
        })
        .with(BinaryOp.Le, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a <= b };
            return Result.ok(v);
        })
        .with(BinaryOp.Gt, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a > b };
            return Result.ok(v);
        })
        .with(BinaryOp.Ge, (): Result<ConstValue, ConstEvalError> => {
            const v: ConstValue = { kind: "bool", value: a >= b };
            return Result.ok(v);
        })
        .otherwise(() =>
            Result.err(
                err("unsupported integer operator in const expression", span),
            ),
        );
}

function evalBinary(
    op: BinaryOp,
    left: ConstValue,
    right: ConstValue,
    span: Span,
): Result<ConstValue, ConstEvalError> {
    if (left.kind === "float" || right.kind === "float") {
        const lr = asNumber(left, span);
        if (lr.isErr()) {
            return lr;
        }
        const rr = asNumber(right, span);
        if (rr.isErr()) {
            return rr;
        }
        const width = floatResultWidth(left, right);
        return evalBinaryFloat(op, lr.value, rr.value, width, span);
    }

    if (left.kind === "bool" && right.kind === "bool") {
        return evalBinaryBool(op, left, right, span);
    }

    const li = asIntValue(left, span);
    if (li.isErr()) {
        return li;
    }
    const ri = asIntValue(right, span);
    if (ri.isErr()) {
        return ri;
    }
    const a = Math.trunc(li.value);
    const b = Math.trunc(ri.value);
    const width = intBinaryWidth(left, right);
    return evalBinaryInt(op, a, b, width, span);
}

function evalUnary(
    op: UnaryOp,
    operand: ConstValue,
    span: Span,
): Result<ConstValue, ConstEvalError> {
    return match(op)
        .with(UnaryOp.Neg, (): Result<ConstValue, ConstEvalError> => {
            if (operand.kind === "float") {
                const v: ConstValue = {
                    kind: "float",
                    width: operand.width,
                    value: -operand.value,
                };
                return Result.ok(v);
            }
            if (operand.kind === "int") {
                const v: ConstValue = {
                    kind: "int",
                    width: operand.width,
                    value: -operand.value,
                };
                return Result.ok(v);
            }
            return Result.err(
                err("unary `-` expects a numeric const value", span),
            );
        })
        .with(UnaryOp.Not, (): Result<ConstValue, ConstEvalError> => {
            if (operand.kind === "bool") {
                const v: ConstValue = {
                    kind: "bool",
                    value: !operand.value,
                };
                return Result.ok(v);
            }
            return Result.err(
                err("unary `!` expects a `bool` const value", span),
            );
        })
        .otherwise(() =>
            Result.err(
                err("unsupported unary operator in const expression", span),
            ),
        );
}

function evalShortCircuitAnd(
    expr: BinaryExpr,
    values: ReadonlyMap<string, ConstValue>,
    evaluatingStack: ReadonlySet<string>,
): Result<ConstValue, ConstEvalError> {
    const l = evalExpression(expr.left, values, evaluatingStack);
    if (l.isErr()) {
        return l;
    }
    const lb = asBool(l.value, expr.left.span);
    if (lb.isErr()) {
        return lb;
    }
    if (!lb.value) {
        return Result.ok({ kind: "bool", value: false });
    }
    const r = evalExpression(expr.right, values, evaluatingStack);
    if (r.isErr()) {
        return r;
    }
    return asBool(r.value, expr.right.span).map((value) => ({
        kind: "bool" as const,
        value,
    }));
}

function evalShortCircuitOr(
    expr: BinaryExpr,
    values: ReadonlyMap<string, ConstValue>,
    evaluatingStack: ReadonlySet<string>,
): Result<ConstValue, ConstEvalError> {
    const l = evalExpression(expr.left, values, evaluatingStack);
    if (l.isErr()) {
        return l;
    }
    const lb = asBool(l.value, expr.left.span);
    if (lb.isErr()) {
        return lb;
    }
    if (lb.value) {
        return Result.ok({ kind: "bool", value: true });
    }
    const r = evalExpression(expr.right, values, evaluatingStack);
    if (r.isErr()) {
        return r;
    }
    return asBool(r.value, expr.right.span).map((value) => ({
        kind: "bool" as const,
        value,
    }));
}

function evalPathOrIdent(
    expr: IdentifierExpr | PathExpr,
    values: ReadonlyMap<string, ConstValue>,
    evaluatingStack: ReadonlySet<string>,
): Result<ConstValue, ConstEvalError> {
    if (evaluatingStack.has(expr.name)) {
        return Result.err(
            err(
                `cycle detected when evaluating const \`${expr.name}\``,
                expr.span,
            ),
        );
    }
    const found = values.get(expr.name);
    if (found === undefined) {
        return Result.err(
            err(
                `cannot find const value \`${expr.name}\` (forward references are not allowed)`,
                expr.span,
            ),
        );
    }
    return Result.ok(found);
}

function evalBlockInitializer(
    expr: BlockExpr,
    values: ReadonlyMap<string, ConstValue>,
    evaluatingStack: ReadonlySet<string>,
): Result<ConstValue, ConstEvalError> {
    if (expr.stmts.length > 0) {
        return Result.err(
            err(
                "only block tail expressions are supported in const initializers",
                expr.span,
            ),
        );
    }
    if (!expr.expr) {
        return Result.err(
            err("const block must end with an expression", expr.span),
        );
    }
    return evalExpression(expr.expr, values, evaluatingStack);
}

function evalExpression(
    expr: Expression,
    values: ReadonlyMap<string, ConstValue>,
    evaluatingStack: ReadonlySet<string>,
): Result<ConstValue, ConstEvalError> {
    if (expr instanceof LiteralExpr) {
        return evalLiteral(expr);
    }

    if (expr instanceof IdentifierExpr || expr instanceof PathExpr) {
        return evalPathOrIdent(expr, values, evaluatingStack);
    }

    if (expr instanceof UnaryExpr) {
        const inner = evalExpression(expr.operand, values, evaluatingStack);
        if (inner.isErr()) {
            return inner;
        }
        return evalUnary(expr.op, inner.value, expr.span);
    }

    if (expr instanceof BinaryExpr) {
        if (expr.op === BinaryOp.And) {
            return evalShortCircuitAnd(expr, values, evaluatingStack);
        }
        if (expr.op === BinaryOp.Or) {
            return evalShortCircuitOr(expr, values, evaluatingStack);
        }

        const l = evalExpression(expr.left, values, evaluatingStack);
        if (l.isErr()) {
            return l;
        }
        const r = evalExpression(expr.right, values, evaluatingStack);
        if (r.isErr()) {
            return r;
        }
        return evalBinary(expr.op, l.value, r.value, expr.span);
    }

    if (expr instanceof BlockExpr) {
        return evalBlockInitializer(expr, values, evaluatingStack);
    }

    return Result.err(
        err(
            `expression is not supported in const initializers (${expr.constructor.name})`,
            expr.span,
        ),
    );
}

function evalConstInitializer(
    expr: Expression,
    values: ReadonlyMap<string, ConstValue>,
    qualName: string,
): Result<ConstValue, ConstEvalError> {
    const stack = new Set<string>([qualName]);
    return evalExpression(expr, values, stack);
}

function fitsInIntRange(n: number, width: IntWidth): boolean {
    const bits = intWidthBitSize(width);
    if (bits >= MIN_WIDE_INT_BITS) {
        return Number.isFinite(n);
    }
    if (isSignedIntWidth(width)) {
        const max = 2 ** (bits - 1) - 1;
        const min = -(2 ** (bits - 1));
        return Number.isInteger(n) && n >= min && n <= max;
    }
    const maxU = 2 ** bits - 1;
    return Number.isInteger(n) && n >= 0 && n <= maxU;
}

function coerceNamedTypeAnnotation(
    cv: ConstValue,
    ann: NamedTypeNode,
    span: Span,
): Result<ConstValue, ConstEvalError> | undefined {
    const iw = namedTypeToIntWidth(ann.name);
    if (iw !== undefined) {
        if (cv.kind !== "int") {
            return Result.err(
                err(
                    `const value is not an integer (expected \`${ann.name}\`)`,
                    span,
                ),
            );
        }
        const rounded = Math.trunc(cv.value);
        if (!fitsInIntRange(rounded, iw)) {
            return Result.err(
                err(
                    `integer literal out of range for type \`${ann.name}\``,
                    span,
                ),
            );
        }
        const v: ConstValue = { kind: "int", width: iw, value: rounded };
        return Result.ok(v);
    }

    const fw = namedTypeToFloatWidth(ann.name);
    if (fw !== undefined) {
        if (cv.kind === "int") {
            const v: ConstValue = { kind: "float", width: fw, value: cv.value };
            return Result.ok(v);
        }
        if (cv.kind === "float") {
            let v = cv.value;
            if (fw === FloatWidth.F32) {
                v = Math.fround(cv.value);
            }
            const out: ConstValue = { kind: "float", width: fw, value: v };
            return Result.ok(out);
        }
        return Result.err(
            err(`const value is not a float (expected \`${ann.name}\`)`, span),
        );
    }

    if (ann.name === "bool") {
        if (cv.kind !== "bool") {
            return Result.err(err("const value is not `bool`", span));
        }
        return Result.ok(cv);
    }

    if (ann.name === "char") {
        if (cv.kind !== "char") {
            return Result.err(err("const value is not a `char`", span));
        }
        return Result.ok(cv);
    }

    return undefined;
}

function coerceToAnnotation(
    cv: ConstValue,
    ann: TypeNode,
    span: Span,
): Result<ConstValue, ConstEvalError> {
    if (ann instanceof NamedTypeNode) {
        const named = coerceNamedTypeAnnotation(cv, ann, span);
        if (named !== undefined) {
            return named;
        }
    }

    if (ann instanceof RefTypeNode && ann.inner instanceof NamedTypeNode) {
        if (ann.inner.name === "str" && cv.kind === "string") {
            return Result.ok(cv);
        }
    }

    return Result.err(
        err("unsupported const annotation type in const_eval", span),
    );
}

export function evaluateModuleConsts(
    moduleNode: ModuleNode,
): Result<Map<string, ConstValue>, ConstEvalError[]> {
    const ordered: { qualName: string; item: ConstItem }[] = [];
    collectConstItems(moduleNode.items, "", ordered);

    const values = new Map<string, ConstValue>();
    const errors: ConstEvalError[] = [];

    for (const { qualName, item } of ordered) {
        const ev = evalConstInitializer(item.value, values, qualName);
        if (ev.isErr()) {
            errors.push(ev.error);
            continue;
        }
        const coerced = coerceToAnnotation(ev.value, item.typeNode, item.span);
        if (coerced.isErr()) {
            errors.push(coerced.error);
            continue;
        }
        values.set(qualName, coerced.value);
    }

    if (errors.length > 0) {
        return Result.err(errors);
    }
    return Result.ok(values);
}
