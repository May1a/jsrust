/**
 * Tests for AST to HIR control flow lowering
 */

import { assertEqual, assertTrue, test } from "../lib.js";
import {
    NodeKind,
    LiteralKind,
    BinaryOp,
    Mutability,
    makeSpan,
    makeLiteralExpr,
    makeIdentifierExpr,
    makeBinaryExpr,
    makeBlockExpr,
    makeIfExpr,
    makeLoopExpr,
    makeWhileExpr,
    makeMatchExpr,
    makeMatchArm,
    makeIdentPat,
    makeLiteralPat,
} from "../../ast.js";
import {
    lowerIf,
    lowerLoop,
    lowerWhile,
    lowerMatch,
    LoweringCtx,
} from "../../lowering.js";
import { HExprKind, HPatKind } from "../../hir.js";
import {
    TypeKind,
    IntWidth,
    makeUnitType,
    makeIntType,
    makeBoolType,
} from "../../types.js";
import { TypeContext } from "../../type_context.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestTypeContext() {
    return new TypeContext();
}

function createTestLoweringCtx() {
    return new LoweringCtx();
}

// ============================================================================
// If Expression Tests
// ============================================================================

function testLowerIfSimple() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const condition = makeLiteralExpr(
        makeSpan(0, 0, 3, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const thenBranch = makeBlockExpr(makeSpan(0, 0, 8, 2), [], null);
    const ast = makeIfExpr(makeSpan(0, 0, 0, 12), condition, thenBranch, null);

    const hir = lowerIf(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.If, "Should be an if expression");
    assertEqual(
        hir.condition.kind,
        HExprKind.Literal,
        "Should have literal condition",
    );
    assertEqual(hir.thenBranch.stmts.length, 0, "Should have empty then block");
    assertEqual(hir.elseBranch, null, "Should have no else branch");
}

function testLowerIfWithElse() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const condition = makeLiteralExpr(
        makeSpan(0, 0, 3, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const thenBranch = makeBlockExpr(makeSpan(0, 0, 8, 2), [], null);
    const elseBranch = makeBlockExpr(makeSpan(0, 0, 18, 2), [], null);
    const ast = makeIfExpr(
        makeSpan(0, 0, 0, 22),
        condition,
        thenBranch,
        elseBranch,
    );

    const hir = lowerIf(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.If, "Should be an if expression");
    assertEqual(
        hir.elseBranch.kind,
        HExprKind.Unit,
        "Else should be a block (unit expr wrapper)",
    );
}

function testLowerIfWithFinalExpr() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const condition = makeLiteralExpr(
        makeSpan(0, 0, 3, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const thenExpr = makeLiteralExpr(
        makeSpan(0, 0, 9, 1),
        LiteralKind.Int,
        1,
        "1",
    );
    const thenBranch = makeBlockExpr(makeSpan(0, 0, 8, 3), [], thenExpr);
    const elseExpr = makeLiteralExpr(
        makeSpan(0, 0, 19, 1),
        LiteralKind.Int,
        2,
        "2",
    );
    const elseBranch = makeBlockExpr(makeSpan(0, 0, 18, 3), [], elseExpr);
    const ast = makeIfExpr(
        makeSpan(0, 0, 0, 23),
        condition,
        thenBranch,
        elseBranch,
    );

    const hir = lowerIf(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.If, "Should be an if expression");
    assertEqual(
        hir.thenBranch.expr.kind,
        HExprKind.Literal,
        "Then should have final expr",
    );
}

// ============================================================================
// Loop Expression Tests
// ============================================================================

function testLowerLoopSimple() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const body = makeBlockExpr(makeSpan(0, 0, 5, 2), [], null);
    const ast = makeLoopExpr(makeSpan(0, 0, 0, 9), null, body);

    const hir = lowerLoop(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Loop, "Should be a loop expression");
    assertEqual(hir.label, null, "Should have no label");
    assertEqual(hir.body.stmts.length, 0, "Should have empty body");
}

function testLowerLoopWithLabel() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const body = makeBlockExpr(makeSpan(0, 0, 10, 2), [], null);
    const ast = makeLoopExpr(makeSpan(0, 0, 0, 14), "outer", body);

    const hir = lowerLoop(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Loop, "Should be a loop expression");
    assertEqual(hir.label, "outer", 'Should have label "outer"');
}

function testLowerLoopNeverType() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const body = makeBlockExpr(makeSpan(0, 0, 5, 2), [], null);
    const ast = makeLoopExpr(makeSpan(0, 0, 0, 9), null, body);

    const hir = lowerLoop(ctx, ast, typeCtx);

    assertEqual(hir.ty.kind, TypeKind.Never, "Loop should have never type");
}

// ============================================================================
// While Expression Tests
// ============================================================================

function testLowerWhileSimple() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const condition = makeLiteralExpr(
        makeSpan(0, 0, 6, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const body = makeBlockExpr(makeSpan(0, 0, 11, 2), [], null);
    const ast = makeWhileExpr(makeSpan(0, 0, 0, 15), null, condition, body);

    const hir = lowerWhile(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.While, "Should be a while expression");
    assertEqual(hir.condition.kind, HExprKind.Literal, "Should have condition");
    assertEqual(hir.body.stmts.length, 0, "Should have empty body");
}

function testLowerWhileUnitType() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const condition = makeLiteralExpr(
        makeSpan(0, 0, 6, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const body = makeBlockExpr(makeSpan(0, 0, 11, 2), [], null);
    const ast = makeWhileExpr(makeSpan(0, 0, 0, 15), null, condition, body);

    const hir = lowerWhile(ctx, ast, typeCtx);

    assertEqual(hir.ty.kind, TypeKind.Unit, "While should have unit type");
}

// ============================================================================
// Match Expression Tests
// ============================================================================

function testLowerMatchSimple() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    ctx.defineVar("x", makeIntType(IntWidth.I32), false);

    const scrutinee = makeIdentifierExpr(makeSpan(0, 0, 6, 1), "x");

    const arm1Pat = makeLiteralPat(makeSpan(0, 0, 12, 1), LiteralKind.Int, 1);
    const arm1Body = makeBlockExpr(makeSpan(0, 0, 16, 2), [], null);
    const arm1 = makeMatchArm(makeSpan(0, 0, 12, 8), arm1Pat, null, arm1Body);

    const arm2Pat = makeIdentPat(
        makeSpan(0, 0, 22, 1),
        "_",
        Mutability.Immutable,
        false,
        null,
    );
    const arm2Body = makeBlockExpr(makeSpan(0, 0, 26, 2), [], null);
    const arm2 = makeMatchArm(makeSpan(0, 0, 22, 8), arm2Pat, null, arm2Body);

    const ast = makeMatchExpr(makeSpan(0, 0, 0, 30), scrutinee, [arm1, arm2]);

    const hir = lowerMatch(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Match, "Should be a match expression");
    assertEqual(hir.arms.length, 2, "Should have two arms");
    assertEqual(
        hir.arms[0].pat.kind,
        HPatKind.Literal,
        "First arm should have literal pattern",
    );
    assertEqual(
        hir.arms[1].pat.kind,
        HPatKind.Ident,
        "Second arm should have ident pattern",
    );
}

function testLowerMatchWithGuard() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    ctx.defineVar("n", makeIntType(IntWidth.I32), false);

    const scrutinee = makeIdentifierExpr(makeSpan(0, 0, 6, 1), "n");

    const armPat = makeIdentPat(
        makeSpan(0, 0, 12, 1),
        "x",
        Mutability.Immutable,
        false,
        null,
    );
    const guard = makeBinaryExpr(
        makeSpan(0, 0, 16, 5),
        BinaryOp.Gt,
        makeIdentifierExpr(makeSpan(0, 0, 16, 1), "x"),
        makeLiteralExpr(makeSpan(0, 0, 20, 1), LiteralKind.Int, 0, "0"),
    );
    const armBody = makeBlockExpr(makeSpan(0, 0, 24, 2), [], null);
    const arm = makeMatchArm(makeSpan(0, 0, 12, 16), armPat, guard, armBody);

    const ast = makeMatchExpr(makeSpan(0, 0, 0, 30), scrutinee, [arm]);

    const hir = lowerMatch(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Match, "Should be a match expression");
    assertEqual(hir.arms.length, 1, "Should have one arm");
    assertEqual(
        hir.arms[0].guard.kind,
        HExprKind.Binary,
        "Arm should have guard",
    );
}

// ============================================================================
// Run Tests
// ============================================================================

export function runTests() {
    const tests = [
        ["Lower if simple", testLowerIfSimple],
        ["Lower if with else", testLowerIfWithElse],
        ["Lower if with final expr", testLowerIfWithFinalExpr],
        ["Lower loop simple", testLowerLoopSimple],
        ["Lower loop with label", testLowerLoopWithLabel],
        ["Lower loop never type", testLowerLoopNeverType],
        ["Lower while simple", testLowerWhileSimple],
        ["Lower while unit type", testLowerWhileUnitType],
        ["Lower match simple", testLowerMatchSimple],
        ["Lower match with guard", testLowerMatchWithGuard],
    ];

    for (const [name, fn] of tests) {
        test(name, fn);
    }
}
