import { parseExpression } from "../../parser.js";
import * as ast from "../../ast.js";
import * as lib from "../lib.js";

const { test, assertEqual, assertTrue } = lib;
const { NodeKind, BinaryOp } = ast;

export function runParserExpressionTests() {
    test("binary precedence", () => {
        const result = parseExpression("1 + 2 * 3");
        assertTrue(result.ok);
        const expr = result.value;
        assertEqual(expr.kind, NodeKind.BinaryExpr);
        assertEqual(expr.op, BinaryOp.Add);
        assertEqual(expr.right.op, BinaryOp.Mul);
    });

    test("postfix chain", () => {
        const result = parseExpression("foo(1, 2).bar[3]");
        assertTrue(result.ok);
        const expr = result.value;
        assertEqual(expr.kind, NodeKind.IndexExpr);
        assertEqual(expr.receiver.kind, NodeKind.FieldExpr);
        assertEqual(expr.receiver.receiver.kind, NodeKind.CallExpr);
    });

    test("if expression", () => {
        const result = parseExpression("if true { 1 } else { 2 }");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.IfExpr);
    });

    test("match expression", () => {
        const result = parseExpression("match value { _ => 1 }");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.MatchExpr);
    });

    test("range expression", () => {
        const result = parseExpression("1..=2");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.RangeExpr);
        assertEqual(result.value.inclusive, true);
    });

    test("compound assignment expression", () => {
        const result = parseExpression("x += 2");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.AssignExpr);
        assertEqual(result.value.target.kind, NodeKind.IdentifierExpr);
        assertEqual(result.value.value.kind, NodeKind.BinaryExpr);
        assertEqual(result.value.value.op, BinaryOp.Add);
    });

    test("bitwise compound assignment expression", () => {
        const result = parseExpression("x ^= 7");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.AssignExpr);
        assertEqual(result.value.value.kind, NodeKind.BinaryExpr);
        assertEqual(result.value.value.op, BinaryOp.BitXor);
    });

    test("closure expression with no params", () => {
        const result = parseExpression("|| 1");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.ClosureExpr);
        assertEqual(result.value.params.length, 0);
        assertEqual(result.value.body.kind, NodeKind.LiteralExpr);
    });

    test("closure expression with typed and untyped params", () => {
        const result = parseExpression("|x: i32, y| { x + y }");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.ClosureExpr);
        assertEqual(result.value.params.length, 2);
        assertEqual(result.value.params[0].name, "x");
        assertTrue(!!result.value.params[0].ty);
        assertEqual(result.value.params[1].name, "y");
        assertEqual(result.value.body.kind, NodeKind.BlockExpr);
    });

    test("closure expression with explicit return type", () => {
        const result = parseExpression("|x| -> i32 { x }");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.ClosureExpr);
        assertTrue(!!result.value.returnType);
    });

    return 10;
}
