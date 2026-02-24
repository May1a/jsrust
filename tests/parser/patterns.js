import { parsePattern } from "../../src/parser";
import * as ast from "../../src/ast";
import * as lib from "../lib";

const { test, assertEqual, assertTrue } = lib;
const { NodeKind } = ast;

export function runParserPatternTests() {
  test("identifier pattern", () => {
    const result = parsePattern("x");
    assertTrue(result.ok);
    assertEqual(result.value.kind, NodeKind.IdentPat);
  });

  test("tuple pattern", () => {
    const result = parsePattern("(a, b)");
    assertTrue(result.ok);
    assertEqual(result.value.kind, NodeKind.TuplePat);
  });

  test("struct pattern", () => {
    const result = parsePattern("Point { x, .. }");
    assertTrue(result.ok);
    assertEqual(result.value.kind, NodeKind.StructPat);
    assertEqual(result.value.fields.length, 1);
  });

  test("range pattern", () => {
    const result = parsePattern("1..=3");
    assertTrue(result.ok);
    assertEqual(result.value.kind, NodeKind.RangePat);
    assertEqual(result.value.inclusive, true);
  });

  test("or pattern", () => {
    const result = parsePattern("1 | 2");
    assertTrue(result.ok);
    assertEqual(result.value.kind, NodeKind.OrPat);
  });

  return 5;
}
