import { TypeContext } from "../../type_context.js";
import {
    checkStmt,
    checkLetStmt,
    inferBlock,
    inferExpr,
} from "../../inference.js";
import { NodeKind, LiteralKind, Mutability } from "../../ast.js";
import { TypeKind, IntWidth, makeIntType, makeUnitType } from "../../types.js";
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

function makeIdentPat(name, mutable = false) {
    return {
        kind: NodeKind.IdentPat,
        span: makeSpan(),
        name,
        mutability: mutable ? Mutability.Mutable : Mutability.Immutable,
        isRef: false,
        ty: null,
    };
}

function makeLetStmt(pat, ty, init) {
    return {
        kind: NodeKind.LetStmt,
        span: makeSpan(),
        pat,
        ty,
        init,
    };
}

function makeExprStmt(expr) {
    return {
        kind: NodeKind.ExprStmt,
        span: makeSpan(),
        expr,
        hasSemicolon: true,
    };
}

function makeBlockExpr(stmts, expr) {
    return {
        kind: NodeKind.BlockExpr,
        span: makeSpan(),
        stmts,
        expr,
    };
}

function makeLoopExpr(body) {
    return {
        kind: NodeKind.LoopExpr,
        span: makeSpan(),
        label: null,
        body,
    };
}

function makeWhileExpr(condition, body) {
    return {
        kind: NodeKind.WhileExpr,
        span: makeSpan(),
        label: null,
        condition,
        body,
    };
}

function makeBreakExpr(value = null) {
    return {
        kind: NodeKind.BreakExpr,
        span: makeSpan(),
        value,
    };
}

function makeContinueExpr() {
    return {
        kind: NodeKind.ContinueExpr,
        span: makeSpan(),
    };
}

function makeNamedType(name) {
    return {
        kind: NodeKind.NamedType,
        span: makeSpan(),
        name,
        args: null,
    };
}

// Test let statement checking
testGroup("Let Statement Checking", () => {
    assert("let with initializer infers type", () => {
        const ctx = new TypeContext();
        const pat = makeIdentPat("x");
        const init = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const letStmt = makeLetStmt(pat, null, init);
        const result = checkLetStmt(ctx, letStmt);
        assert(result.ok);
        const binding = ctx.lookupVar("x");
        assert(binding !== null);
        assertEq(binding.type.kind, TypeKind.Int);
    });

    assert("let with type annotation", () => {
        const ctx = new TypeContext();
        const pat = makeIdentPat("x");
        const ty = makeNamedType("i32");
        const init = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const letStmt = makeLetStmt(pat, ty, init);
        const result = checkLetStmt(ctx, letStmt);
        assert(result.ok);
        const binding = ctx.lookupVar("x");
        assert(binding !== null);
        assertEq(binding.type.kind, TypeKind.Int);
        assertEq(binding.type.width, IntWidth.I32);
    });

    assert("let without initializer or type fails", () => {
        const ctx = new TypeContext();
        const pat = makeIdentPat("x");
        const letStmt = makeLetStmt(pat, null, null);
        const result = checkLetStmt(ctx, letStmt);
        assert(!result.ok);
    });

    assert("let with type but no initializer", () => {
        const ctx = new TypeContext();
        const pat = makeIdentPat("x");
        const ty = makeNamedType("i32");
        const letStmt = makeLetStmt(pat, ty, null);
        const result = checkLetStmt(ctx, letStmt);
        assert(result.ok);
        const binding = ctx.lookupVar("x");
        assert(binding !== null);
        assertEq(binding.type.kind, TypeKind.Int);
    });
});

// Test block inference
testGroup("Block Inference", () => {
    assert("empty block has unit type", () => {
        const ctx = new TypeContext();
        const block = makeBlockExpr([], null);
        const result = inferBlock(ctx, block);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Unit);
    });

    assert("block with final expression has that type", () => {
        const ctx = new TypeContext();
        const expr = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const block = makeBlockExpr([], expr);
        const result = inferBlock(ctx, block);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });

    assert("block with let statement", () => {
        const ctx = new TypeContext();
        const pat = makeIdentPat("x");
        const init = makeLiteralExpr(LiteralKind.Int, 42, "42");
        const letStmt = makeLetStmt(pat, null, init);
        const expr = {
            kind: NodeKind.IdentifierExpr,
            span: makeSpan(),
            name: "x",
        };
        const block = makeBlockExpr([letStmt], expr);
        const result = inferBlock(ctx, block);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });
});

testGroup("Loop Control Flow Inference", () => {
    assert("break outside loop fails", () => {
        const ctx = new TypeContext();
        const result = inferExpr(ctx, makeBreakExpr());
        assert(!result.ok);
    });

    assert("continue outside loop fails", () => {
        const ctx = new TypeContext();
        const result = inferExpr(ctx, makeContinueExpr());
        assert(!result.ok);
    });

    assert("loop with break value yields break type", () => {
        const ctx = new TypeContext();
        const body = makeBlockExpr(
            [
                makeExprStmt(
                    makeBreakExpr(makeLiteralExpr(LiteralKind.Int, 7, "7")),
                ),
            ],
            null,
        );
        const result = inferExpr(ctx, makeLoopExpr(body));
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Int);
    });

    assert("while does not allow break value", () => {
        const ctx = new TypeContext();
        const condition = makeLiteralExpr(LiteralKind.Bool, true, "true");
        const body = makeBlockExpr(
            [
                makeExprStmt(
                    makeBreakExpr(makeLiteralExpr(LiteralKind.Int, 1, "1")),
                ),
            ],
            null,
        );
        const result = inferExpr(ctx, makeWhileExpr(condition, body));
        assert(!result.ok);
    });
});

console.log("Statement inference tests complete");

export function runInferenceStatementsTests() {
    return 11; // Number of tests
}
