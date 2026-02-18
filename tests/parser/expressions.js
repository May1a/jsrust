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

    return 5;
}
