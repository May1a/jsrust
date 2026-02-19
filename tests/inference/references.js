import { TypeContext } from "../../type_context.js";
import { inferExpr, inferRef, inferDeref, unify } from "../../inference.js";
import { NodeKind, LiteralKind, Mutability } from "../../ast.js";
import { TypeKind, IntWidth, makeIntType, makeRefType } from "../../types.js";
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

function makeRefExpr(mutability, operand) {
    return {
        kind: NodeKind.RefExpr,
        span: makeSpan(),
        mutability,
        operand,
    };
}

function makeDerefExpr(operand) {
    return {
        kind: NodeKind.DerefExpr,
        span: makeSpan(),
        operand,
    };
}

// Test reference inference
testGroup("Reference Inference", () => {
    assert("immutable reference to integer", () => {
        const ctx = new TypeContext();
        const operand = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const refExpr = makeRefExpr(Mutability.Immutable, operand);
        const result = inferRef(ctx, refExpr);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Ref);
        assertEq(result.type.mutable, false);
        assertEq(result.type.inner.kind, TypeKind.Int);
    });

    assert("mutable reference to integer", () => {
        const ctx = new TypeContext();
        const operand = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const refExpr = makeRefExpr(Mutability.Mutable, operand);
        const result = inferRef(ctx, refExpr);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Ref);
        assertEq(result.type.mutable, true);
        assertEq(result.type.inner.kind, TypeKind.Int);
    });

    assert("reference to variable", () => {
        const ctx = new TypeContext();
        ctx.defineVar("x", { kind: TypeKind.Int, width: IntWidth.I32 });
        const operand = makeIdentifierExpr("x");
        const refExpr = makeRefExpr(Mutability.Immutable, operand);
        const result = inferRef(ctx, refExpr);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Ref);
    });
});

// Test dereference inference
testGroup("Dereference Inference", () => {
    assert("dereference immutable reference", () => {
        const ctx = new TypeContext();
        const innerType = { kind: TypeKind.Int, width: IntWidth.I32 };
        const refType = makeRefType(innerType, false);
        ctx.defineVar("r", refType);

        const operand = makeIdentifierExpr("r");
        const derefExpr = makeDerefExpr(operand);
        const result = inferDeref(ctx, derefExpr);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });

    assert("dereference mutable reference", () => {
        const ctx = new TypeContext();
        const innerType = { kind: TypeKind.Int, width: IntWidth.I32 };
        const refType = makeRefType(innerType, true);
        ctx.defineVar("r", refType);

        const operand = makeIdentifierExpr("r");
        const derefExpr = makeDerefExpr(operand);
        const result = inferDeref(ctx, derefExpr);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });

    assert("dereference non-reference fails", () => {
        const ctx = new TypeContext();
        ctx.defineVar("x", { kind: TypeKind.Int, width: IntWidth.I32 });

        const operand = makeIdentifierExpr("x");
        const derefExpr = makeDerefExpr(operand);
        const result = inferDeref(ctx, derefExpr);
        assert(!result.ok);
    });
});

// Test reference unification
testGroup("Reference Unification", () => {
    assert("same reference types unify", () => {
        const ctx = new TypeContext();
        const t1 = makeRefType(
            { kind: TypeKind.Int, width: IntWidth.I32 },
            false,
        );
        const t2 = makeRefType(
            { kind: TypeKind.Int, width: IntWidth.I32 },
            false,
        );
        const result = unify(ctx, t1, t2);
        assert(result.ok);
    });

    assert("mutable and immutable don't unify", () => {
        const ctx = new TypeContext();
        const t1 = makeRefType(
            { kind: TypeKind.Int, width: IntWidth.I32 },
            true,
        );
        const t2 = makeRefType(
            { kind: TypeKind.Int, width: IntWidth.I32 },
            false,
        );
        const result = unify(ctx, t1, t2);
        assert(!result.ok);
    });

    assert("reference with type variable", () => {
        const ctx = new TypeContext();
        const tv = ctx.freshTypeVar();
        const refType = makeRefType(
            { kind: TypeKind.Int, width: IntWidth.I32 },
            false,
        );
        const result = unify(ctx, tv, refType);
        assert(result.ok);
        assertEq(ctx.resolveType(tv).kind, TypeKind.Ref);
    });
});

console.log("Reference inference tests complete");
