import { TypeContext } from "../../type_context.js";
import {
    inferExpr,
    inferLiteral,
    inferBinary,
    inferUnary,
    inferCall,
    inferIdentifier,
    unify,
} from "../../inference.js";
import { NodeKind, LiteralKind, UnaryOp, BinaryOp, Mutability } from "../../ast.js";
import { TypeKind, IntWidth, FloatWidth, typeToString } from "../../types.js";
import { assert, assertEq, testGroup } from "../lib.js";

function makeSpan(line = 1, column = 1, start = 0, end = 0) {
    return { line, column, start, end };
}

function makeLiteralExpr(kind, value, raw) {
    return {
        kind: NodeKind.LiteralExpr,
        span: makeSpan(),
        literalKind: kind,
        value,
        raw,
    };
}

function makeIdentifierExpr(name) {
    return {
        kind: NodeKind.IdentifierExpr,
        span: makeSpan(),
        name,
    };
}

function makeBinaryExpr(op, left, right) {
    return {
        kind: NodeKind.BinaryExpr,
        span: makeSpan(),
        op,
        left,
        right,
    };
}

function makeUnaryExpr(op, operand) {
    return {
        kind: NodeKind.UnaryExpr,
        span: makeSpan(),
        op,
        operand,
    };
}

function makeCallExpr(callee, args) {
    return {
        kind: NodeKind.CallExpr,
        span: makeSpan(),
        callee,
        args,
    };
}

// Test literal inference
testGroup("Literal Inference", () => {
    assert("integer literal defaults to i32", () => {
        const ctx = new TypeContext();
        const lit = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const result = inferLiteral(ctx, lit);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
        assertEq(result.type.width, IntWidth.I32);
    });

    assert("float literal defaults to f64", () => {
        const ctx = new TypeContext();
        const lit = makeLiteralExpr(LiteralKind.Float, 3.14, "3.14");
        const result = inferLiteral(ctx, lit);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Float);
        assertEq(result.type.width, FloatWidth.F64);
    });

    assert("bool literal has bool type", () => {
        const ctx = new TypeContext();
        const lit = makeLiteralExpr(LiteralKind.Bool, true, "true");
        const result = inferLiteral(ctx, lit);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Bool);
    });

    assert("string literal has str type", () => {
        const ctx = new TypeContext();
        const lit = makeLiteralExpr(LiteralKind.String, "hello", '"hello"');
        const result = inferLiteral(ctx, lit);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.String);
    });

    assert("char literal has char type", () => {
        const ctx = new TypeContext();
        const lit = makeLiteralExpr(LiteralKind.Char, "a", "'a'");
        const result = inferLiteral(ctx, lit);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Char);
    });
});

// Test identifier inference
testGroup("Identifier Inference", () => {
    assert("unbound identifier fails", () => {
        const ctx = new TypeContext();
        const ident = makeIdentifierExpr("x");
        const result = inferIdentifier(ctx, ident);
        assert(!result.ok);
    });

    assert("bound variable returns its type", () => {
        const ctx = new TypeContext();
        ctx.defineVar("x", { kind: TypeKind.Int, width: IntWidth.I32 });
        const ident = makeIdentifierExpr("x");
        const result = inferIdentifier(ctx, ident);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });
});

// Test binary expression inference
testGroup("Binary Expression Inference", () => {
    assert("addition of two integers", () => {
        const ctx = new TypeContext();
        const left = makeLiteralExpr(LiteralKind.Int, 1, "1");
        const right = makeLiteralExpr(LiteralKind.Int, 2, "2");
        const binary = makeBinaryExpr(BinaryOp.Add, left, right);
        const result = inferBinary(ctx, binary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });

    assert("addition of two floats", () => {
        const ctx = new TypeContext();
        const left = makeLiteralExpr(LiteralKind.Float, 1.0, "1.0");
        const right = makeLiteralExpr(LiteralKind.Float, 2.0, "2.0");
        const binary = makeBinaryExpr(BinaryOp.Add, left, right);
        const result = inferBinary(ctx, binary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Float);
    });

    assert("comparison returns bool", () => {
        const ctx = new TypeContext();
        const left = makeLiteralExpr(LiteralKind.Int, 1, "1");
        const right = makeLiteralExpr(LiteralKind.Int, 2, "2");
        const binary = makeBinaryExpr(BinaryOp.Lt, left, right);
        const result = inferBinary(ctx, binary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Bool);
    });

    assert("logical and returns bool", () => {
        const ctx = new TypeContext();
        const left = makeLiteralExpr(LiteralKind.Bool, true, "true");
        const right = makeLiteralExpr(LiteralKind.Bool, false, "false");
        const binary = makeBinaryExpr(BinaryOp.And, left, right);
        const result = inferBinary(ctx, binary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Bool);
    });

    assert("bitwise xor on integers", () => {
        const ctx = new TypeContext();
        const left = makeLiteralExpr(LiteralKind.Int, 1, "1");
        const right = makeLiteralExpr(LiteralKind.Int, 2, "2");
        const binary = makeBinaryExpr(BinaryOp.BitXor, left, right);
        const result = inferBinary(ctx, binary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });
});

// Test unary expression inference
testGroup("Unary Expression Inference", () => {
    assert("not on bool returns bool", () => {
        const ctx = new TypeContext();
        const operand = makeLiteralExpr(LiteralKind.Bool, true, "true");
        const unary = makeUnaryExpr(UnaryOp.Not, operand);
        const result = inferUnary(ctx, unary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Bool);
    });

    assert("negation on integer returns integer", () => {
        const ctx = new TypeContext();
        const operand = makeLiteralExpr(LiteralKind.Int, 5, "5");
        const unary = makeUnaryExpr(UnaryOp.Neg, operand);
        const result = inferUnary(ctx, unary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });

    assert("negation on float returns float", () => {
        const ctx = new TypeContext();
        const operand = makeLiteralExpr(LiteralKind.Float, 3.14, "3.14");
        const unary = makeUnaryExpr(UnaryOp.Neg, operand);
        const result = inferUnary(ctx, unary);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Float);
    });
});

// Test unification
testGroup("Unification", () => {
    assert("same types unify", () => {
        const ctx = new TypeContext();
        const t1 = { kind: TypeKind.Int, width: IntWidth.I32 };
        const t2 = { kind: TypeKind.Int, width: IntWidth.I32 };
        const result = unify(ctx, t1, t2);
        assert(result.ok);
    });

    assert("different integer widths don't unify", () => {
        const ctx = new TypeContext();
        const t1 = { kind: TypeKind.Int, width: IntWidth.I32 };
        const t2 = { kind: TypeKind.Int, width: IntWidth.I64 };
        const result = unify(ctx, t1, t2);
        assert(!result.ok);
    });

    assert("type variable unifies with any type", () => {
        const ctx = new TypeContext();
        const tv = ctx.freshTypeVar();
        const t = { kind: TypeKind.Int, width: IntWidth.I32 };
        const result = unify(ctx, tv, t);
        assert(result.ok);
        assertEq(ctx.resolveType(tv).kind, TypeKind.Int);
    });

    assert("occurs check prevents infinite types", () => {
        const ctx = new TypeContext();
        const tv = ctx.freshTypeVar();
        // Create a type that contains tv
        const t = { kind: TypeKind.Ref, inner: tv, mutable: false };
        // Try to unify tv with t - should fail occurs check
        const result = unify(ctx, tv, t);
        assert(!result.ok);
    });
});

console.log("Expression inference tests complete");