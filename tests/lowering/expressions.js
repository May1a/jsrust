/**
 * Tests for AST to HIR expression lowering
 */

import { assertEqual, assertTrue, test } from "../lib.js";
import {
    NodeKind,
    LiteralKind,
    UnaryOp,
    BinaryOp,
    Mutability,
    makeSpan,
    makeLiteralExpr,
    makeIdentifierExpr,
    makeBinaryExpr,
    makeUnaryExpr,
    makeCallExpr,
    makeFieldExpr,
    makeRefExpr,
    makeDerefExpr,
    makeStructExpr,
    makePathExpr,
    makeModule,
    makeFnItem,
    makeParam,
    makeBlockExpr,
    makeLetStmt,
    makeIdentPat,
    makeNamedType,
} from "../../ast.js";
import { lowerModule, lowerExpr, LoweringCtx } from "../../lowering.js";
import { HExprKind, HLiteralKind, HPlaceKind } from "../../hir.js";
import {
    TypeKind,
    IntWidth,
    FloatWidth,
    makeUnitType,
    makeIntType,
    makeBoolType,
    makeStructType,
    makeFnType,
    makeRefType,
} from "../../types.js";
import { TypeContext } from "../../type_context.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a simple type context with a function
 */
function createTestTypeContext() {
    const typeCtx = new TypeContext();
    return typeCtx;
}

/**
 * Create a test lowering context
 */
function createTestLoweringCtx() {
    return new LoweringCtx();
}

// ============================================================================
// Literal Tests
// ============================================================================

function testLowerIntLiteral() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeLiteralExpr(
        makeSpan(0, 0, 0, 1),
        LiteralKind.Int,
        42,
        "42",
    );

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Literal, "Should be a literal expression");
    assertEqual(hir.literalKind, HLiteralKind.Int, "Should be an int literal");
    assertEqual(hir.value, 42, "Should have value 42");
    assertEqual(hir.ty.kind, TypeKind.Int, "Should have int type");
}

function testLowerFloatLiteral() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeLiteralExpr(
        makeSpan(0, 0, 0, 3),
        LiteralKind.Float,
        3.14,
        "3.14",
    );

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Literal, "Should be a literal expression");
    assertEqual(
        hir.literalKind,
        HLiteralKind.Float,
        "Should be a float literal",
    );
    assertEqual(hir.value, 3.14, "Should have value 3.14");
    assertEqual(hir.ty.kind, TypeKind.Float, "Should have float type");
}

function testLowerBoolLiteral() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeLiteralExpr(
        makeSpan(0, 0, 0, 4),
        LiteralKind.Bool,
        true,
        "true",
    );

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Literal, "Should be a literal expression");
    assertEqual(hir.literalKind, HLiteralKind.Bool, "Should be a bool literal");
    assertEqual(hir.value, true, "Should have value true");
    assertEqual(hir.ty.kind, TypeKind.Bool, "Should have bool type");
}

function testLowerStringLiteral() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeLiteralExpr(
        makeSpan(0, 0, 0, 5),
        LiteralKind.String,
        "hello",
        '"hello"',
    );

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Literal, "Should be a literal expression");
    assertEqual(
        hir.literalKind,
        HLiteralKind.String,
        "Should be a string literal",
    );
    assertEqual(hir.value, "hello", 'Should have value "hello"');
    assertEqual(hir.ty.kind, TypeKind.String, "Should have string type");
}

// ============================================================================
// Identifier Tests
// ============================================================================

function testLowerIdentifier() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    // Define a variable in the context
    ctx.defineVar("x", makeIntType(IntWidth.I32), false);

    const ast = makeIdentifierExpr(makeSpan(0, 0, 0, 1), "x");
    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Var, "Should be a var expression");
    assertEqual(hir.name, "x", 'Should have name "x"');
    assertEqual(hir.id, 0, "Should have id 0");
}

function testLowerUnboundIdentifier() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeIdentifierExpr(makeSpan(0, 0, 0, 1), "unknown");
    const hir = lowerExpr(ctx, ast, typeCtx);

    // Should return unit expression on error
    assertEqual(
        hir.kind,
        HExprKind.Unit,
        "Should return unit on unbound identifier",
    );
    assertEqual(ctx.errors.length, 1, "Should have one error");
}

// ============================================================================
// Binary Expression Tests
// ============================================================================

function testLowerBinaryAdd() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const left = makeLiteralExpr(makeSpan(0, 0, 0, 1), LiteralKind.Int, 1, "1");
    const right = makeLiteralExpr(
        makeSpan(0, 0, 2, 1),
        LiteralKind.Int,
        2,
        "2",
    );
    const ast = makeBinaryExpr(makeSpan(0, 0, 0, 3), BinaryOp.Add, left, right);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Binary, "Should be a binary expression");
    assertEqual(hir.op, BinaryOp.Add, "Should have Add operator");
    assertEqual(hir.left.kind, HExprKind.Literal, "Left should be literal");
    assertEqual(hir.right.kind, HExprKind.Literal, "Right should be literal");
}

function testLowerBinaryComparison() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const left = makeLiteralExpr(makeSpan(0, 0, 0, 1), LiteralKind.Int, 1, "1");
    const right = makeLiteralExpr(
        makeSpan(0, 0, 2, 1),
        LiteralKind.Int,
        2,
        "2",
    );
    const ast = makeBinaryExpr(makeSpan(0, 0, 0, 3), BinaryOp.Lt, left, right);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Binary, "Should be a binary expression");
    assertEqual(hir.op, BinaryOp.Lt, "Should have Lt operator");
    assertEqual(hir.ty.kind, TypeKind.Bool, "Comparison should return bool");
}

function testLowerBinaryLogical() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const left = makeLiteralExpr(
        makeSpan(0, 0, 0, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const right = makeLiteralExpr(
        makeSpan(0, 0, 6, 5),
        LiteralKind.Bool,
        false,
        "false",
    );
    const ast = makeBinaryExpr(
        makeSpan(0, 0, 0, 11),
        BinaryOp.And,
        left,
        right,
    );

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Binary, "Should be a binary expression");
    assertEqual(hir.op, BinaryOp.And, "Should have And operator");
    assertEqual(hir.ty.kind, TypeKind.Bool, "Logical op should return bool");
}

// ============================================================================
// Unary Expression Tests
// ============================================================================

function testLowerUnaryNot() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const operand = makeLiteralExpr(
        makeSpan(0, 0, 1, 4),
        LiteralKind.Bool,
        true,
        "true",
    );
    const ast = makeUnaryExpr(makeSpan(0, 0, 0, 5), UnaryOp.Not, operand);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Unary, "Should be a unary expression");
    assertEqual(hir.op, UnaryOp.Not, "Should have Not operator");
    assertEqual(hir.ty.kind, TypeKind.Bool, "Not should return bool");
}

function testLowerUnaryNeg() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const operand = makeLiteralExpr(
        makeSpan(0, 0, 1, 1),
        LiteralKind.Int,
        5,
        "5",
    );
    const ast = makeUnaryExpr(makeSpan(0, 0, 0, 2), UnaryOp.Neg, operand);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Unary, "Should be a unary expression");
    assertEqual(hir.op, UnaryOp.Neg, "Should have Neg operator");
    assertEqual(hir.ty.kind, TypeKind.Int, "Neg should return same type");
}

// ============================================================================
// Call Expression Tests
// ============================================================================

function testLowerCallExpression() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    // Register a function
    ctx.registerItem("foo", "fn", null, {
        kind: TypeKind.Fn,
        params: [makeIntType(IntWidth.I32)],
        returnType: makeIntType(IntWidth.I32),
        isUnsafe: false,
    });

    const callee = makeIdentifierExpr(makeSpan(0, 0, 0, 3), "foo");
    const arg = makeLiteralExpr(makeSpan(0, 0, 4, 1), LiteralKind.Int, 1, "1");
    const ast = makeCallExpr(makeSpan(0, 0, 0, 6), callee, [arg]);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Call, "Should be a call expression");
    assertEqual(hir.args.length, 1, "Should have one argument");
}

// ============================================================================
// Reference Expression Tests
// ============================================================================

function testLowerRefExpression() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    ctx.defineVar("x", makeIntType(IntWidth.I32), false);

    const operand = makeIdentifierExpr(makeSpan(0, 0, 1, 1), "x");
    const ast = makeRefExpr(
        makeSpan(0, 0, 0, 2),
        Mutability.Immutable,
        operand,
    );

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Ref, "Should be a ref expression");
    assertEqual(hir.mutable, false, "Should be immutable ref");
    assertEqual(hir.ty.kind, TypeKind.Ref, "Should have ref type");
}

function testLowerMutRefExpression() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    ctx.defineVar("y", makeIntType(IntWidth.I32), true);

    const operand = makeIdentifierExpr(makeSpan(0, 0, 5, 1), "y");
    const ast = makeRefExpr(makeSpan(0, 0, 0, 6), Mutability.Mutable, operand);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Ref, "Should be a ref expression");
    assertEqual(hir.mutable, true, "Should be mutable ref");
}

// ============================================================================
// Deref Expression Tests
// ============================================================================

function testLowerDerefExpression() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const refType = {
        kind: TypeKind.Ref,
        inner: makeIntType(IntWidth.I32),
        mutable: false,
    };
    ctx.defineVar("r", refType, false);

    const operand = makeIdentifierExpr(makeSpan(0, 0, 1, 1), "r");
    const ast = makeDerefExpr(makeSpan(0, 0, 0, 2), operand);

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Deref, "Should be a deref expression");
    assertEqual(hir.ty.kind, TypeKind.Int, "Should have inner type");
}

// ============================================================================
// Field Expression Tests
// ============================================================================

function testLowerFieldExpression() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    // Register a struct
    ctx.registerItem("Point", "struct", {
        kind: NodeKind.StructItem,
        name: "Point",
        fields: [
            { name: "x", ty: { kind: NodeKind.NamedType, name: "i32" } },
            { name: "y", ty: { kind: NodeKind.NamedType, name: "i32" } },
        ],
    });
    ctx.setFieldIndex("Point", "x", 0);
    ctx.setFieldIndex("Point", "y", 1);

    const structType = {
        kind: TypeKind.Struct,
        name: "Point",
        fields: [
            { name: "x", type: makeIntType(IntWidth.I32) },
            { name: "y", type: makeIntType(IntWidth.I32) },
        ],
    };
    ctx.defineVar("p", structType, false);

    const receiver = makeIdentifierExpr(makeSpan(0, 0, 0, 1), "p");
    const ast = makeFieldExpr(makeSpan(0, 0, 0, 3), receiver, "x");

    const hir = lowerExpr(ctx, ast, typeCtx);

    assertEqual(hir.kind, HExprKind.Field, "Should be a field expression");
    assertEqual(hir.field, "x", 'Should have field name "x"');
    assertEqual(hir.index, 0, "Should have field index 0");
}

function testLowerMethodCallExpression() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const pointType = makeStructType("Point", [], makeSpan(0, 0, 0, 0));
    pointType.fields = [
        { name: "x", type: makeIntType(IntWidth.I32) },
        { name: "y", type: makeIntType(IntWidth.I32) },
    ];

    typeCtx.registerMethod(
        "Point",
        "sum_with",
        { kind: NodeKind.FnItem, name: "Point::sum_with" },
        makeFnType(
            [makeRefType(pointType, false), makeRefType(pointType, false)],
            makeIntType(IntWidth.I32),
            false,
        ),
        {},
    );

    ctx.defineVar("p1", pointType, false);
    ctx.defineVar("p2", pointType, false);

    const ast = makeCallExpr(
        makeSpan(0, 0, 0, 12),
        makeFieldExpr(
            makeSpan(0, 0, 0, 9),
            makeIdentifierExpr(makeSpan(0, 0, 0, 2), "p1"),
            "sum_with",
        ),
        [makeRefExpr(makeSpan(0, 0, 10, 2), Mutability.Immutable, makeIdentifierExpr(makeSpan(0, 0, 11, 2), "p2"))],
    );

    const hir = lowerExpr(ctx, ast, typeCtx);
    assertEqual(hir.kind, HExprKind.Call, "Should lower to call expression");
    assertEqual(hir.callee.kind, HExprKind.Var, "Callee should be method symbol");
    assertEqual(hir.callee.name, "Point::sum_with", "Should use qualified method symbol");
    assertEqual(hir.args.length, 2, "Should inject receiver as first argument");
}

function testLowerStaticMethodPath() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    typeCtx.registerMethod(
        "Point",
        "new",
        { kind: NodeKind.FnItem, name: "Point::new" },
        makeFnType(
            [makeIntType(IntWidth.I32), makeIntType(IntWidth.I32)],
            makeStructType("Point", [], makeSpan(0, 0, 0, 0)),
            false,
        ),
        {},
    );

    const ast = makePathExpr(makeSpan(0, 0, 0, 8), ["Point", "new"]);
    const hir = lowerExpr(ctx, ast, typeCtx);
    assertEqual(hir.kind, HExprKind.Var, "Should lower to var expression");
    assertEqual(hir.name, "Point::new", "Should resolve to method symbol");
}

// ============================================================================
// Run Tests
// ============================================================================

export function runTests() {
    const tests = [
        ["Lower int literal", testLowerIntLiteral],
        ["Lower float literal", testLowerFloatLiteral],
        ["Lower bool literal", testLowerBoolLiteral],
        ["Lower string literal", testLowerStringLiteral],
        ["Lower identifier", testLowerIdentifier],
        ["Lower unbound identifier", testLowerUnboundIdentifier],
        ["Lower binary add", testLowerBinaryAdd],
        ["Lower binary comparison", testLowerBinaryComparison],
        ["Lower binary logical", testLowerBinaryLogical],
        ["Lower unary not", testLowerUnaryNot],
        ["Lower unary neg", testLowerUnaryNeg],
        ["Lower call expression", testLowerCallExpression],
        ["Lower ref expression", testLowerRefExpression],
        ["Lower mut ref expression", testLowerMutRefExpression],
        ["Lower deref expression", testLowerDerefExpression],
        ["Lower field expression", testLowerFieldExpression],
        ["Lower method call expression", testLowerMethodCallExpression],
        ["Lower static method path", testLowerStaticMethodPath],
    ];

    for (const [name, fn] of tests) {
        test(name, fn);
    }
}
