import { parseStatement } from "../../src/parser";
import * as ast from "../../src/ast";
import * as lib from "../lib";

const { test, assertEqual, assertTrue } = lib;
const { NodeKind } = ast;

export function runParserStatementTests() {
  test("let statement with type", () => {
    const result = parseStatement("let x: i32 = 3;");
    assertTrue(result.ok);
    const stmt = result.value;
    assertEqual(stmt.kind, NodeKind.LetStmt);
    assertEqual(stmt.ty.kind, NodeKind.NamedType);
  });

  test("expression statement with semicolon", () => {
    const result = parseStatement("x + 1;");
    assertTrue(result.ok);
    const stmt = result.value;
    assertEqual(stmt.kind, NodeKind.ExprStmt);
    assertEqual(stmt.hasSemicolon, true);
  });

  test("expression statement without semicolon", () => {
    const result = parseStatement("x + 1");
    assertTrue(result.ok);
    const stmt = result.value;
    assertEqual(stmt.kind, NodeKind.ExprStmt);
    assertEqual(stmt.hasSemicolon, false);
  });

  return 3;
}
