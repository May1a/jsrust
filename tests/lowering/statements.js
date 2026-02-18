/**
 * Tests for AST to HIR statement lowering
 */

import { assertEqual, assertTrue } from '../lib.js';
import {
    NodeKind,
    LiteralKind,
    Mutability,
    makeSpan,
    makeLiteralExpr,
    makeIdentifierExpr,
    makeBlockExpr,
    makeLetStmt,
    makeExprStmt,
    makeIdentPat,
    makeWildcardPat,
    makeTuplePat,
    makeNamedType,
} from '../../ast.js';
import {
    lowerStmt,
    lowerLetStmt,
    lowerBlock,
    LoweringCtx,
} from '../../lowering.js';
import {
    HStmtKind,
    HExprKind,
    HPatKind,
} from '../../hir.js';
import {
    TypeKind,
    IntWidth,
    makeUnitType,
    makeIntType,
    makeTupleType,
} from '../../types.js';
import { TypeContext } from '../../type_context.js';

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
// Let Statement Tests
// ============================================================================

function testLowerLetStmtSimple() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const pat = makeIdentPat(makeSpan(0, 0, 4, 1), 'x', Mutability.Immutable, false, null);
    const init = makeLiteralExpr(makeSpan(0, 0, 8, 1), LiteralKind.Int, 42, '42');
    const ast = makeLetStmt(makeSpan(0, 0, 0, 9), pat, null, init);

    const hir = lowerLetStmt(ctx, ast, typeCtx);

    assertEqual(hir.kind, HStmtKind.Let, 'Should be a let statement');
    assertEqual(hir.pat.kind, HPatKind.Ident, 'Should have ident pattern');
    assertEqual(hir.pat.name, 'x', 'Should have name "x"');
    assertEqual(hir.init.kind, HExprKind.Literal, 'Should have literal init');
}

function testLowerLetStmtWithType() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const pat = makeIdentPat(makeSpan(0, 0, 4, 1), 'y', Mutability.Immutable, false, null);
    const ty = makeNamedType(makeSpan(0, 0, 8, 3), 'i32', null);
    const init = makeLiteralExpr(makeSpan(0, 0, 14, 1), LiteralKind.Int, 10, '10');
    const ast = makeLetStmt(makeSpan(0, 0, 0, 15), pat, ty, init);

    const hir = lowerLetStmt(ctx, ast, typeCtx);

    assertEqual(hir.kind, HStmtKind.Let, 'Should be a let statement');
    assertEqual(hir.ty.kind, TypeKind.Int, 'Should have int type');
}

function testLowerLetStmtMutable() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const pat = makeIdentPat(makeSpan(0, 0, 8, 1), 'z', Mutability.Mutable, false, null);
    const init = makeLiteralExpr(makeSpan(0, 0, 12, 1), LiteralKind.Int, 0, '0');
    const ast = makeLetStmt(makeSpan(0, 0, 0, 13), pat, null, init);

    const hir = lowerLetStmt(ctx, ast, typeCtx);

    assertEqual(hir.kind, HStmtKind.Let, 'Should be a let statement');
    assertEqual(hir.pat.mutable, true, 'Should be mutable');
}

function testLowerLetStmtWildcard() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const pat = makeWildcardPat(makeSpan(0, 0, 4, 1));
    const init = makeLiteralExpr(makeSpan(0, 0, 8, 1), LiteralKind.Int, 1, '1');
    const ast = makeLetStmt(makeSpan(0, 0, 0, 9), pat, null, init);

    const hir = lowerLetStmt(ctx, ast, typeCtx);

    assertEqual(hir.kind, HStmtKind.Let, 'Should be a let statement');
    assertEqual(hir.pat.kind, HPatKind.Wildcard, 'Should have wildcard pattern');
}

// ============================================================================
// Expression Statement Tests
// ============================================================================

function testLowerExprStmt() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const expr = makeLiteralExpr(makeSpan(0, 0, 0, 1), LiteralKind.Int, 42, '42');
    const ast = makeExprStmt(makeSpan(0, 0, 0, 2), expr, true);

    const hir = lowerStmt(ctx, ast, typeCtx);

    assertEqual(hir.kind, HStmtKind.Expr, 'Should be an expr statement');
    assertEqual(hir.expr.kind, HExprKind.Literal, 'Should have literal expr');
}

function testLowerExprStmtWithFunctionCall() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    ctx.defineVar('foo', {
        kind: TypeKind.Fn,
        params: [],
        returnType: makeUnitType(),
        isUnsafe: false,
    }, false);

    const expr = makeIdentifierExpr(makeSpan(0, 0, 0, 3), 'foo');
    const ast = makeExprStmt(makeSpan(0, 0, 0, 5), expr, true);

    const hir = lowerStmt(ctx, ast, typeCtx);

    assertEqual(hir.kind, HStmtKind.Expr, 'Should be an expr statement');
}

// ============================================================================
// Block Tests
// ============================================================================

function testLowerBlockEmpty() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeBlockExpr(makeSpan(0, 0, 0, 2), [], null);
    const hir = lowerBlock(ctx, ast, typeCtx);

    assertEqual(hir.stmts.length, 0, 'Should have no statements');
    assertEqual(hir.expr, null, 'Should have no final expr');
    assertEqual(hir.ty.kind, TypeKind.Unit, 'Should have unit type');
}

function testLowerBlockWithStatements() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const stmt1 = makeLetStmt(
        makeSpan(0, 0, 0, 9),
        makeIdentPat(makeSpan(0, 0, 4, 1), 'x', Mutability.Immutable, false, null),
        null,
        makeLiteralExpr(makeSpan(0, 0, 8, 1), LiteralKind.Int, 1, '1')
    );
    const stmt2 = makeLetStmt(
        makeSpan(0, 0, 11, 10),
        makeIdentPat(makeSpan(0, 0, 15, 1), 'y', Mutability.Immutable, false, null),
        null,
        makeLiteralExpr(makeSpan(0, 0, 19, 1), LiteralKind.Int, 2, '2')
    );

    const ast = makeBlockExpr(makeSpan(0, 0, 0, 23), [stmt1, stmt2], null);
    const hir = lowerBlock(ctx, ast, typeCtx);

    assertEqual(hir.stmts.length, 2, 'Should have two statements');
    assertEqual(hir.expr, null, 'Should have no final expr');
}

function testLowerBlockWithFinalExpr() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const finalExpr = makeLiteralExpr(makeSpan(0, 0, 0, 1), LiteralKind.Int, 42, '42');
    const ast = makeBlockExpr(makeSpan(0, 0, 0, 3), [], finalExpr);
    const hir = lowerBlock(ctx, ast, typeCtx);

    assertEqual(hir.stmts.length, 0, 'Should have no statements');
    assertEqual(hir.expr.kind, HExprKind.Literal, 'Should have final expr');
    assertEqual(hir.ty.kind, TypeKind.Int, 'Should have int type');
}

function testLowerBlockWithStmtsAndFinalExpr() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const stmt = makeLetStmt(
        makeSpan(0, 0, 0, 9),
        makeIdentPat(makeSpan(0, 0, 4, 1), 'x', Mutability.Immutable, false, null),
        null,
        makeLiteralExpr(makeSpan(0, 0, 8, 1), LiteralKind.Int, 1, '1')
    );
    const finalExpr = makeIdentifierExpr(makeSpan(0, 0, 11, 1), 'x');

    ctx.defineVar('x', makeIntType(IntWidth.I32), false);

    const ast = makeBlockExpr(makeSpan(0, 0, 0, 14), [stmt], finalExpr);
    const hir = lowerBlock(ctx, ast, typeCtx);

    assertEqual(hir.stmts.length, 1, 'Should have one statement');
    assertEqual(hir.expr.kind, HExprKind.Var, 'Should have final var expr');
}

// ============================================================================
// Run Tests
// ============================================================================

export function runTests() {
    const tests = [
        ['Lower let stmt simple', testLowerLetStmtSimple],
        ['Lower let stmt with type', testLowerLetStmtWithType],
        ['Lower let stmt mutable', testLowerLetStmtMutable],
        ['Lower let stmt wildcard', testLowerLetStmtWildcard],
        ['Lower expr stmt', testLowerExprStmt],
        ['Lower expr stmt with function call', testLowerExprStmtWithFunctionCall],
        ['Lower block empty', testLowerBlockEmpty],
        ['Lower block with statements', testLowerBlockWithStatements],
        ['Lower block with final expr', testLowerBlockWithFinalExpr],
        ['Lower block with stmts and final expr', testLowerBlockWithStmtsAndFinalExpr],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, test] of tests) {
        try {
            test();
            passed++;
        } catch (e) {
            console.error(`  ✗ ${name}: ${e.message}`);
            failed++;
        }
    }

    return { passed, failed };
}