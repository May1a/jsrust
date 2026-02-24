/**
 * @typedef {import('../../src/hir').HModule} HModule
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
    makeHVarPlace,
    makeHFieldPlace,
    makeHDerefPlace,
    makeHUnitExpr,
    makeHLiteralExpr,
    makeHVarExpr,
    makeHBinaryExpr,
    makeHUnaryExpr,
    makeHCallExpr,
    makeHFieldExpr,
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
    hirToString,
    collectVars,
} from "../../src/hir";

import {
    makeIntType,
    makeBoolType,
    makeUnitType,
    makeFnType,
    IntWidth,
} from "../../src/types";

import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";

// ============================================================================
// Test hirToString
// ============================================================================

test("hirToString formats unit expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHUnitExpr(span, makeUnitType());
    assertEqual(hirToString(expr), "()");
});

test("hirToString formats integer literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    assertEqual(hirToString(expr), "42");
});

test("hirToString formats boolean literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.Bool,
        true,
        makeBoolType(),
    );
    assertEqual(hirToString(expr), "true");
});

test("hirToString formats string literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.String,
        "hello",
        makeUnitType(),
    );
    assertEqual(hirToString(expr), "hello");
});

test("hirToString formats variable expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32));
    assertEqual(hirToString(expr), "x");
});

test("hirToString formats binary expression", () => {
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
    assertEqual(hirToString(expr), "(1 + 2)");
});

test("hirToString formats unary expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        5,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHUnaryExpr(span, 1, operand, makeIntType(IntWidth.I32));
    assertEqual(hirToString(expr), "-5");
});

test("hirToString formats call expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const callee = makeHVarExpr(
        span,
        "foo",
        0,
        makeFnType([], makeUnitType(), false),
    );
    const expr = makeHCallExpr(span, callee, [], makeUnitType());
    assertEqual(hirToString(expr), "foo()");
});

test("hirToString formats call expression with args", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const callee = makeHVarExpr(
        span,
        "add",
        0,
        makeFnType([], makeUnitType(), false),
    );
    const arg1 = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        1,
        makeIntType(IntWidth.I32),
    );
    const arg2 = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        2,
        makeIntType(IntWidth.I32),
    );
    const expr = makeHCallExpr(
        span,
        callee,
        [arg1, arg2],
        makeIntType(IntWidth.I32),
    );
    assertEqual(hirToString(expr), "add(1, 2)");
});

test("hirToString formats field expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarExpr(span, "p", 0, makeUnitType());
    const expr = makeHFieldExpr(span, base, "x", 0, makeIntType(IntWidth.I32));
    assertEqual(hirToString(expr), "p.x");
});

test("hirToString formats reference expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32));
    const expr = makeHRefExpr(span, false, operand, makeUnitType());
    assertEqual(hirToString(expr), "&x");
});

test("hirToString formats mutable reference expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHVarExpr(span, "x", 0, makeIntType(IntWidth.I32));
    const expr = makeHRefExpr(span, true, operand, makeUnitType());
    assertEqual(hirToString(expr), "&mut x");
});

test("hirToString formats dereference expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const operand = makeHVarExpr(span, "ptr", 0, makeUnitType());
    const expr = makeHDerefExpr(span, operand, makeIntType(IntWidth.I32));
    assertEqual(hirToString(expr), "*ptr");
});

test("hirToString formats struct expression", () => {
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
    assertEqual(hirToString(expr), "Point { x: 10 }");
});

test("hirToString formats enum expression", () => {
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
    assertEqual(hirToString(expr), "Option::Some(42)");
});

test("hirToString formats if expression", () => {
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
    const result = hirToString(expr);
    assertTrue(result.startsWith("if true"));
    assertTrue(result.includes("()"));
});

test("hirToString formats loop expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const body = makeHBlock(
        span,
        [],
        makeHUnitExpr(span, makeUnitType()),
        makeUnitType(),
    );
    const expr = makeHLoopExpr(span, null, body, makeUnitType());
    const result = hirToString(expr);
    assertTrue(result.startsWith("loop"));
});

test("hirToString formats while expression", () => {
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
    const result = hirToString(expr);
    assertTrue(result.startsWith("while true"));
});

test("hirToString formats let statement", () => {
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
    const result = hirToString(stmt);
    assertTrue(result.startsWith("let x:"));
    assertTrue(result.includes("42"));
});

test("hirToString formats assignment statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const place = makeHVarPlace(span, "x", 0, makeIntType(IntWidth.I32));
    const value = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        10,
        makeIntType(IntWidth.I32),
    );
    const stmt = makeHAssignStmt(span, place, value);
    assertEqual(hirToString(stmt), "x = 10;");
});

test("hirToString formats return statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const value = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    const stmt = makeHReturnStmt(span, value);
    assertEqual(hirToString(stmt), "return 42;");
});

test("hirToString formats void return statement", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const stmt = makeHReturnStmt(span, null);
    assertEqual(hirToString(stmt), "return;");
});

test("hirToString formats variable place", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const place = makeHVarPlace(span, "x", 0, makeIntType(IntWidth.I32));
    assertEqual(hirToString(place), "x");
});

test("hirToString formats field place", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarPlace(span, "p", 0, makeUnitType());
    const place = makeHFieldPlace(
        span,
        base,
        "x",
        0,
        makeIntType(IntWidth.I32),
    );
    assertEqual(hirToString(place), "p.x");
});

test("hirToString formats deref place", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const base = makeHVarPlace(span, "ptr", 0, makeUnitType());
    const place = makeHDerefPlace(span, base, makeIntType(IntWidth.I32));
    assertEqual(hirToString(place), "*ptr");
});

test("hirToString formats identifier pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    assertEqual(hirToString(pat), "x");
});

test("hirToString formats wildcard pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHWildcardPat(span, makeUnitType());
    assertEqual(hirToString(pat), "_");
});

test("hirToString formats literal pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHLiteralPat(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    assertEqual(hirToString(pat), "42");
});

test("hirToString formats struct pattern", () => {
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
    assertEqual(hirToString(pat), "Point { x: x }");
});

test("hirToString formats tuple pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 15 };
    const elem = makeHIdentPat(
        span,
        "x",
        0,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const pat = makeHTuplePat(span, [elem], makeUnitType());
    assertEqual(hirToString(pat), "(x)");
});

test("hirToString formats or pattern", () => {
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
    assertEqual(hirToString(pat), "1 | 2");
});

test("hirToString formats function declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
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
    const result = hirToString(fn);
    assertTrue(result.startsWith("fn main"));
    assertTrue(result.includes("()"));
});

test("hirToString formats struct declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const field = makeHStructField(span, "x", makeIntType(IntWidth.I32), null);
    const struct = makeHStructDecl(span, "Point", null, [field], false);
    const result = hirToString(struct);
    assertTrue(result.startsWith("struct Point"));
    assertTrue(result.includes("x:"));
});

test("hirToString formats enum declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 40 };
    const variant1 = makeHEnumVariant(span, "None", [], null);
    const variant2 = makeHEnumVariant(
        span,
        "Some",
        [makeIntType(IntWidth.I32)],
        null,
    );
    const enum_ = makeHEnumDecl(span, "Option", null, [variant1, variant2]);
    const result = hirToString(enum_);
    assertTrue(result.startsWith("enum Option"));
    assertTrue(result.includes("None"));
    assertTrue(result.includes("Some"));
});

test("hirToString formats module", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
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
    const result = hirToString(mod);
    assertTrue(result.startsWith("module test"));
    assertTrue(result.includes("fn main"));
});

// ============================================================================
// Test collectVars
// ============================================================================

test("collectVars finds variable in expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHVarExpr(span, "x", 42, makeIntType(IntWidth.I32));
    const vars = collectVars(expr);
    assertTrue(vars.has(42));
    assertEqual(vars.size, 1);
});

test("collectVars finds multiple variables", () => {
    const span = { line: 1, column: 1, start: 0, end: 10 };
    const left = makeHVarExpr(span, "x", 1, makeIntType(IntWidth.I32));
    const right = makeHVarExpr(span, "y", 2, makeIntType(IntWidth.I32));
    const expr = makeHBinaryExpr(
        span,
        0,
        left,
        right,
        makeIntType(IntWidth.I32),
    );
    const vars = collectVars(expr);
    assertTrue(vars.has(1));
    assertTrue(vars.has(2));
    assertEqual(vars.size, 2);
});

test("collectVars finds variable in place", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const place = makeHVarPlace(span, "x", 10, makeIntType(IntWidth.I32));
    const vars = collectVars(place);
    assertTrue(vars.has(10));
});

test("collectVars finds variable in pattern", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const pat = makeHIdentPat(
        span,
        "x",
        5,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const vars = collectVars(pat);
    assertTrue(vars.has(5));
});

test("collectVars finds nested variables", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const base = makeHVarPlace(span, "p", 1, makeUnitType());
    const place = makeHFieldPlace(
        span,
        base,
        "x",
        0,
        makeIntType(IntWidth.I32),
    );
    const value = makeHVarExpr(span, "y", 2, makeIntType(IntWidth.I32));
    const stmt = makeHAssignStmt(span, place, value);
    const vars = collectVars(stmt);
    assertTrue(vars.has(1));
    assertTrue(vars.has(2));
});

test("collectVars finds variables in block", () => {
    const span = { line: 1, column: 1, start: 0, end: 20 };
    const expr = makeHVarExpr(span, "x", 1, makeIntType(IntWidth.I32));
    const stmt = makeHExprStmt(span, expr);
    const block = makeHBlock(span, [stmt], null, makeUnitType());
    const vars = collectVars(block);
    assertTrue(vars.has(1));
});

test("collectVars finds variables in if expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const cond = makeHVarExpr(span, "cond", 1, makeBoolType());
    const thenBlock = makeHBlock(
        span,
        [],
        makeHVarExpr(span, "x", 2, makeIntType(IntWidth.I32)),
        makeIntType(IntWidth.I32),
    );
    const expr = makeHIfExpr(
        span,
        cond,
        thenBlock,
        null,
        makeIntType(IntWidth.I32),
    );
    const vars = collectVars(expr);
    assertTrue(vars.has(1));
    assertTrue(vars.has(2));
});

test("collectVars finds variables in match expression", () => {
    const span = { line: 1, column: 1, start: 0, end: 40 };
    const scrutinee = makeHVarExpr(span, "x", 1, makeIntType(IntWidth.I32));
    const pat = makeHIdentPat(
        span,
        "y",
        2,
        makeIntType(IntWidth.I32),
        false,
        false,
    );
    const body = makeHBlock(
        span,
        [],
        makeHVarExpr(span, "y", 2, makeIntType(IntWidth.I32)),
        makeIntType(IntWidth.I32),
    );
    const arm = makeHMatchArm(span, pat, null, body);
    const expr = makeHMatchExpr(
        span,
        scrutinee,
        [arm],
        makeIntType(IntWidth.I32),
    );
    const vars = collectVars(expr);
    assertTrue(vars.has(1));
    assertTrue(vars.has(2));
});

test("collectVars returns empty set for literal", () => {
    const span = { line: 1, column: 1, start: 0, end: 5 };
    const expr = makeHLiteralExpr(
        span,
        HLiteralKind.Int,
        42,
        makeIntType(IntWidth.I32),
    );
    const vars = collectVars(expr);
    assertEqual(vars.size, 0);
});

test("collectVars finds variables in function declaration", () => {
    const span = { line: 1, column: 1, start: 0, end: 30 };
    const body = makeHBlock(
        span,
        [],
        makeHVarExpr(span, "x", 1, makeIntType(IntWidth.I32)),
        makeIntType(IntWidth.I32),
    );
    const fn = makeHFnDecl(
        span,
        "get_x",
        null,
        [],
        makeIntType(IntWidth.I32),
        body,
        false,
        false,
    );
    const vars = collectVars(fn);
    assertTrue(vars.has(1));
});

export function runHirUtilitiesTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
