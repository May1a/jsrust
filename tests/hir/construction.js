/**
 * @typedef {import('../../hir.js').HModule} HModule
 * @typedef {import('../../hir.js').HItem} HItem
 * @typedef {import('../../hir.js').HFnDecl} HFnDecl
 * @typedef {import('../../hir.js').HStructDecl} HStructDecl
 * @typedef {import('../../hir.js').HEnumDecl} HEnumDecl
 * @typedef {import('../../hir.js').HBlock} HBlock
 * @typedef {import('../../hir.js').HStmt} HStmt
 * @typedef {import('../../hir.js').HExpr} HExpr
 * @typedef {import('../../hir.js').HPlace} HPlace
 * @typedef {import('../../hir.js').HPat} HPat
 */

import {
    HItemKind,
    HStmtKind,
    HPlaceKind,
    HExprKind,
    HPatKind,
    HLiteralKind,
    makeHModule,
    makeHFnDecl,
    makeHParam,
    makeHStructDecl,
    makeHStructField,
    makeHEnumDecl,
    makeHEnumVariant,
    makeHBlock,
    makeHLetStmt,
    makeHAssignStmt,
    makeHExprStmt,
    makeHReturnStmt,
    makeHBreakStmt,
    makeHContinueStmt,
    makeHVarPlace,
    makeHFieldPlace,
    makeHIndexPlace,
    makeHDerefPlace,
    makeHUnitExpr,
    makeHLiteralExpr,
    makeHVarExpr,
    makeHBinaryExpr,
    makeHUnaryExpr,
    makeHCallExpr,
    makeHFieldExpr,
    makeHIndexExpr,
    makeHRefExpr,
    makeHDerefExpr,
    makeHStructExpr,
    makeHEnumExpr,
    makeHIfExpr,
    makeHMatchExpr,
    makeHLoopExpr,
    makeHWhileExpr,
    makeHIdentPat,
    makeHWildcardPat,
    makeHLiteralPat,
    makeHStructPat,
    makeHTuplePat,
    makeHOrPat,
    makeHMatchArm,
    isHExpr,
    isHStmt,
    isHPlace,
    isHPat,
    isHItem,
} from "../../hir.js";

import {
    TypeKind,
    makeIntType,
    makeBoolType,
    makeUnitType,
    makeStringType,
    makeTupleType,
    makeFnType,
    IntWidth,
} from "../../types.js";

import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

// ============================================================================
// Test HIR Module Structure
// ============================================================================

test("makeHModule creates module with items", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const fn = makeHFnDecl(
        span,
        "main",
        null,
        [],
        makeUnitType(),
        null,
        false,
        false,
    );
    const mod = makeHModule(span, "test", [fn]);

    assertEqual(mod.name, "test");
    assertEqual(mod.items.length, 1);
    assertEqual(mod.items[0].name, "main");
});

// ============================================================================
// Test HIR Items
// ============================================================================

test("makeHFnDecl creates function declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const param = makeHParam(span, "x", makeIntType(IntWidth.I32), null);
    const fn = makeHFnDecl(
        span,
        "add",
        null,
        [param],
        makeIntType(IntWidth.I32),
        null,
        false,
        false,
    );

    assertEqual(fn.kind, HItemKind.Fn);
    assertEqual(fn.name, "add");
    assertEqual(fn.params.length, 1);
    assertEqual(fn.params[0].name, "x");
    assertEqual(fn.isAsync, false);
    assertEqual(fn.isUnsafe, false);
});

test("makeHFnDecl with generics", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const fn = makeHFnDecl(
        span,
        "identity",
        ["T"],
        [],
        makeUnitType(),
        null,
        false,
        false,
    );

    assertTrue(fn.generics !== null);
    assertEqual(fn.generics.length, 1);
    assertEqual(fn.generics[0], "T");
});

test("makeHStructDecl creates struct declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const field = makeHStructField(span, "x", makeIntType(IntWidth.I32), null);
    const struct = makeHStructDecl(span, "Point", null, [field], false);

    assertEqual(struct.kind, HItemKind.Struct);
    assertEqual(struct.name, "Point");
    assertEqual(struct.fields.length, 1);
    assertEqual(struct.fields[0].name, "x");
    assertEqual(struct.isTuple, false);
});

test("makeHStructDecl creates tuple struct", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const field = makeHStructField(span, "0", makeIntType(IntWidth.I32), null);
    const struct = makeHStructDecl(span, "Wrapper", null, [field], true);

    assertEqual(struct.isTuple, true);
});

test("makeHEnumDecl creates enum declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 40 };
    const variant1 = makeHEnumVariant(span, "None", [], null);
    const variant2 = makeHEnumVariant(
        span,
        "Some",
        [makeIntType(IntWidth.I32)],
        null,
    );
    const enum_ = makeHEnumDecl(span, "Option", null, [variant1, variant2]);

    assertEqual(enum_.kind, HItemKind.Enum);
    assertEqual(enum_.name, "Option");
    assertEqual(enum_.variants.length, 2);
    assertEqual(enum_.variants[0].name, "None");
    assertEqual(enum_.variants[1].fields.length, 1);
});

// ============================================================================
// Test HIR Blocks
// ============================================================================

test("makeHBlock creates block with statements", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const stmt = makeHExprStmt(span, makeHUnitExpr(span, makeUnitType()));
    const block = makeHBlock(span, [stmt], null, makeUnitType());

    assertEqual(block.stmts.length, 1);
    assertEqual(block.expr, null);
});

test("makeHBlock creates block with final expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    const block = makeHBlock(span, [], expr, makeIntType(IntWidth.I32));

    assertEqual(block.stmts.length, 0);
    assertTrue(block.expr !== null);
});

// ============================================================================
// Test HIR Statements
// ============================================================================

test("makeHLetStmt creates let statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 15 };
    const pat = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const init = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    const stmt = makeHLetStmt(span, pat, makeIntType(IntWidth.I32), init);

    assertEqual(stmt.kind, HStmtKind.Let);
    assertEqual(stmt.pat.kind, HPatKind.Ident);
    assertTrue(stmt.init !== null);
});

test("makeHAssignStmt creates assignment statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const place = makeHVarPlace(span, "x", 0, makeIntType(IntWidth.I32));
    const value = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        10,
        makeIntType(IntWidth.I32),
    );
    const stmt = makeHAssignStmt(span, place, value);

    assertEqual(stmt.kind, HStmtKind.Assign);
    assertEqual(stmt.place.kind, HPlaceKind.Var);
    assertEqual(stmt.value.kind, HExprKind.Literal);
});

test("makeHExprStmt creates expression statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const expr = makeHCallExpr(
        span,
        makeHVarExpr(span, "foo", 1, makeFnType([], makeUnitType(), false)),
        [],
        makeUnitType(),
    );
    const stmt = makeHExprStmt(span, expr);

    assertEqual(stmt.kind, HStmtKind.Expr);
    assertEqual(stmt.expr.kind, HExprKind.Call);
});

test("makeHReturnStmt creates return statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const value = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    const stmt = makeHReturnStmt(span, value);

    assertEqual(stmt.kind, HStmtKind.Return);
    assertTrue(stmt.value !== null);
});

test("makeHReturnStmt creates void return", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const stmt = makeHReturnStmt(span, null);

    assertEqual(stmt.kind, HStmtKind.Return);
    assertEqual(stmt.value, null);
});

test("makeHBreakStmt creates break statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const stmt = makeHBreakStmt(span, null, null);

    assertEqual(stmt.kind, HStmtKind.Break);
    assertEqual(stmt.value, null);
    assertEqual(stmt.label, null);
});

test("makeHBreakStmt creates break with label", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const stmt = makeHBreakStmt(span, null, "outer");

    assertEqual(stmt.label, "outer");
});

test("makeHContinueStmt creates continue statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const stmt = makeHContinueStmt(span, null);

    assertEqual(stmt.kind, HStmtKind.Continue);
    assertEqual(stmt.label, null);
});

// ============================================================================
// Test HIR Places
// ============================================================================

test("makeHVarPlace creates variable place", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const place = makeHVarPlace(span, "x", 0, makeIntType(IntWidth.I32));

    assertEqual(place.kind, HPlaceKind.Var);
    assertEqual(place.name, "x");
    assertEqual(place.id, 0);
});

test("makeHFieldPlace creates field place", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarPlace(span, "p", 0, makeUnitType());
    const place = makeHFieldPlace(
        span,
        base,
        "x",
        0,
        makeIntType(IntWidth.I32),
    );

    assertEqual(place.kind, HPlaceKind.Field);
    assertEqual(place.field, "x");
    assertEqual(place.index, 0);
    assertEqual(place.base.kind, HPlaceKind.Var);
});

test("makeHIndexPlace creates index place", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarPlace(span, "arr", 0, makeUnitType());
    const index = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        0,
        makeIntType(IntWidth.I32),
    );
    const place = makeHIndexPlace(span, base, index, makeIntType(IntWidth.I32));

    assertEqual(place.kind, HPlaceKind.Index);
    assertEqual(place.base.kind, HPlaceKind.Var);
    assertEqual(place.index.kind, HExprKind.Literal);
});

test("makeHDerefPlace creates deref place", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarPlace(span, "ptr", 0, makeUnitType());
    const place = makeHDerefPlace(span, base, makeIntType(IntWidth.I32));

    assertEqual(place.kind, HPlaceKind.Deref);
    assertEqual(place.base.kind, HPlaceKind.Var);
});

// ============================================================================
// Test HIR Expressions
// ============================================================================

test("makeHUnitExpr creates unit expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHUnitExpr(span, makeUnitType());

    assertEqual(expr.kind, HExprKind.Unit);
    assertEqual(expr.ty.kind, TypeKind.Unit);
});

test("makeHLiteralExpr creates integer literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );

    assertEqual(expr.kind, HExprKind.Literal);
    assertEqual(expr.literalKind, HLiteralKind.Int);
    assertEqual(expr.value, 42);
});

test("makeHLiteralExpr creates boolean literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.Bool,
        true,
        makeBoolType(),
    );

    assertEqual(expr.literalKind, HLiteralKind.Bool);
    assertEqual(expr.value, true);
});

test("makeHLiteralExpr creates string literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.String,
        "hello",
        makeStringType(),
    );

    assertEqual(expr.literalKind, HLiteralKind.String);
    assertEqual(expr.value, "hello");
});

test("makeHVarExpr creates variable expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32));

    assertEqual(expr.kind, HExprKind.Var);
    assertEqual(expr.name, "x");
    assertEqual(expr.id, 0);
});

test("makeHBinaryExpr creates binary expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const left = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        1,
        makeIntType(IntWidth.I32),
    );
    const right = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        2,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHBinaryExpr(
        span,
        0,
        left,
        right,
        makeIntType(IntWidth.I32),
    );

    assertEqual(expr.kind, HExprKind.Binary);
    assertEqual(expr.op, 0);
    assertEqual(expr.left.kind, HExprKind.Literal);
    assertEqual(expr.right.kind, HExprKind.Literal);
});

test("makeHUnaryExpr creates unary expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        5,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHUnaryExpr(span, 1, operand, makeIntType(IntWidth.I32));

    assertEqual(expr.kind, HExprKind.Unary);
    assertEqual(expr.op, 1);
    assertEqual(expr.operand.kind, HExprKind.Literal);
});

test("makeHCallExpr creates call expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const callee = makeHVarExpr(
        span,
        "foo",
        0,
        makeFnType([], makeUnitType(), false),
    );
    const expr = makeHCallExpr(span, callee, [], makeUnitType());

    assertEqual(expr.kind, HExprKind.Call);
    assertEqual(expr.callee.kind, HExprKind.Var);
    assertEqual(expr.args.length, 0);
});

test("makeHFieldExpr creates field expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarExpr(span, "p", 0, makeUnitType());
    const expr = makeHFieldExpr(span, base, "x", 0, makeIntType(IntWidth.I32));

    assertEqual(expr.kind, HExprKind.Field);
    assertEqual(expr.field, "x");
    assertEqual(expr.index, 0);
});

test("makeHIndexExpr creates index expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarExpr(span, "arr", 0, makeUnitType());
    const index = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        0,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHIndexExpr(span, base, index, makeIntType(IntWidth.I32));

    assertEqual(expr.kind, HExprKind.Index);
    assertEqual(expr.base.kind, HExprKind.Var);
    assertEqual(expr.index.kind, HExprKind.Literal);
});

test("makeHRefExpr creates reference expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32));
    const expr = makeHRefExpr(span, true, operand, makeUnitType());

    assertEqual(expr.kind, HExprKind.Ref);
    assertEqual(expr.mutable, true);
});

test("makeHDerefExpr creates dereference expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHVarExpr(span, "ptr", 0, makeUnitType());
    const expr = makeHDerefExpr(span, operand, makeIntType(IntWidth.I32));

    assertEqual(expr.kind, HExprKind.Deref);
    assertEqual(expr.operand.kind, HExprKind.Var);
});

test("makeHStructExpr creates struct expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const value = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        10,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHStructExpr(
        span,
        "Point",
        [{ name: "x", value }],
        null,
        makeUnitType(),
    );

    assertEqual(expr.kind, HExprKind.Struct);
    assertEqual(expr.name, "Point");
    assertEqual(expr.fields.length, 1);
    assertEqual(expr.fields[0].name, "x");
    assertEqual(expr.spread, null);
});

test("makeHEnumExpr creates enum expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 15 };
    const field = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHEnumExpr(
        span,
        "Option",
        "Some",
        1,
        [field],
        makeUnitType(),
    );

    assertEqual(expr.kind, HExprKind.Enum);
    assertEqual(expr.enumName, "Option");
    assertEqual(expr.variantName, "Some");
    assertEqual(expr.variantIndex, 1);
    assertEqual(expr.fields.length, 1);
});

// ============================================================================
// Test HIR Control Flow
// ============================================================================

test("makeHIfExpr creates if expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const cond = makeHLiteralExpr(
        span,
        HLiteralKind.Bool,
        true,
        makeBoolType(),
    );
    const thenBlock = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const expr = makeHIfExpr(span, cond, thenBlock, null, makeUnitType());

    assertEqual(expr.kind, HExprKind.If);
    assertEqual(expr.condition.kind, HExprKind.Literal);
    assertEqual(expr.elseBranch, null);
});

test("makeHIfExpr creates if-else expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 50 };
    const cond = makeHLiteralExpr(
        span,
        HLiteralKind.Bool,
        true,
        makeBoolType(),
    );
    const thenBlock = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const elseBlock = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const expr = makeHIfExpr(span, cond, thenBlock, elseBlock, makeUnitType());

    assertTrue(expr.elseBranch !== null);
});

test("makeHMatchExpr creates match expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 40 };
    const scrutinee = makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32));
    const pat = makeHWildcardPat(span, makeUnitType());
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const arm = makeHMatchArm(span, pat, null, body);
    const expr = makeHMatchExpr(span, scrutinee, [arm], makeUnitType());

    assertEqual(expr.kind, HExprKind.Match);
    assertEqual(expr.scrutinee.kind, HExprKind.Var);
    assertEqual(expr.arms.length, 1);
});

test("makeHLoopExpr creates loop expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const expr = makeHLoopExpr(span, null, body, makeUnitType());

    assertEqual(expr.kind, HExprKind.Loop);
    assertEqual(expr.label, null);
});

test("makeHLoopExpr creates labeled loop", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const expr = makeHLoopExpr(span, "outer", body, makeUnitType());

    assertEqual(expr.label, "outer");
});

test("makeHWhileExpr creates while expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const cond = makeHLiteralExpr(
        span,
        HLiteralKind.Bool,
        true,
        makeBoolType(),
    );
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const expr = makeHWhileExpr(span, null, cond, body, makeUnitType());

    assertEqual(expr.kind, HExprKind.While);
    assertEqual(expr.condition.kind, HExprKind.Literal);
});

// ============================================================================
// Test HIR Patterns
// ============================================================================

test("makeHIdentPat creates identifier pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );

    assertEqual(pat.kind, HPatKind.Ident);
    assertEqual(pat.name, "x");
    assertEqual(pat.id, 0);
    assertEqual(pat.mutable, false);
    assertEqual(pat.isRef, false);
});

test("makeHIdentPat creates mutable pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const pat = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        true,
        false,
    );

    assertEqual(pat.mutable, true);
});

test("makeHWildcardPat creates wildcard pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHWildcardPat(span, makeUnitType());

    assertEqual(pat.kind, HPatKind.Wildcard);
});

test("makeHLiteralPat creates literal pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHLiteralPat(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );

    assertEqual(pat.kind, HPatKind.Literal);
    assertEqual(pat.literalKind, HLiteralKind.Int);
    assertEqual(pat.value, 42);
});

test("makeHStructPat creates struct pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const fieldPat = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const pat = makeHStructPat(
        span,
        "Point",
        [{ name: "x", pat: fieldPat }],
        false,
        makeUnitType(),
    );

    assertEqual(pat.kind, HPatKind.Struct);
    assertEqual(pat.name, "Point");
    assertEqual(pat.fields.length, 1);
    assertEqual(pat.rest, false);
});

test("makeHTuplePat creates tuple pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 15 };
    const elem = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const pat = makeHTuplePat(
        span,
        [elem],
        makeTupleType([makeIntType(IntWidth.I32)]),
    );

    assertEqual(pat.kind, HPatKind.Tuple);
    assertEqual(pat.elements.length, 1);
});

test("makeHOrPat creates or pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const left = makeHLiteralPat(
        span,
        HLiteralKind.Int,
        1,
        makeIntType(IntWidth.I32),
    );
    const right = makeHLiteralPat(
        span,
        HLiteralKind.Int,
        2,
        makeIntType(IntWidth.I32),
    );
    const pat = makeHOrPat(span, [left, right], makeIntType(IntWidth.I32));

    assertEqual(pat.kind, HPatKind.Or);
    assertEqual(pat.alternatives.length, 2);
});

// ============================================================================
// Test HIR Match Arms
// ============================================================================

test("makeHMatchArm creates match arm", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const pat = makeHWildcardPat(span, makeUnitType());
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const arm = makeHMatchArm(span, pat, null, body);

    assertEqual(arm.pat.kind, HPatKind.Wildcard);
    assertEqual(arm.guard, null);
});

test("makeHMatchArm creates match arm with guard", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const pat = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const guard = makeHBinaryExpr(
        span,
        5, // Eq
        makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32)),
        makeHLiteralExpr(span, HLiteralKind.Int, 0, makeIntType(IntWidth.I32)),
        makeBoolType(),
    );
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const arm = makeHMatchArm(span, pat, guard, body);

    assertTrue(arm.guard !== null);
    assertEqual(arm.guard.kind, HExprKind.Binary);
});

// ============================================================================
// Test Type Guards
// ============================================================================

test("isHExpr correctly identifies expressions", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHUnitExpr(span, makeUnitType());
    const stmt = makeHReturnStmt(span, null);

    assertTrue(isHExpr(expr));
    assertTrue(!isHExpr(stmt));
});

test("isHStmt correctly identifies statements", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const stmt = makeHReturnStmt(span, null);
    const expr = makeHUnitExpr(span, makeUnitType());

    assertTrue(isHStmt(stmt));
    assertTrue(!isHStmt(expr));
});

test("isHPlace correctly identifies places", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const place = makeHVarPlace(span, "x", 0, makeIntType(IntWidth.I32));
    const expr = makeHUnitExpr(span, makeUnitType());

    assertTrue(isHPlace(place));
    assertTrue(!isHPlace(expr));
});

test("isHPat correctly identifies patterns", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHWildcardPat(span, makeUnitType());
    const expr = makeHUnitExpr(span, makeUnitType());

    assertTrue(isHPat(pat));
    assertTrue(!isHPat(expr));
});

test("isHItem correctly identifies items", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const fn = makeHFnDecl(
        span,
        "test",
        null,
        [],
        makeUnitType(),
        null,
        false,
        false,
    );
    const expr = makeHUnitExpr(span, makeUnitType());

    assertTrue(isHItem(fn));
    assertTrue(!isHItem(expr));
});

export function runHirConstructionTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
