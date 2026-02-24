import { parseExpression, parseModule } from "../../src/parser";
import * as lib from "../lib";

const { test, assertTrue } = lib;

export function runParserErrorTests() {
  test("missing closing paren", () => {
    const result = parseExpression("(1 + 2");
    assertTrue(!result.ok);
    assertTrue(result.errors.length > 0);
  });

  test("invalid item", () => {
    const result = parseModule("fn {");
    assertTrue(!result.ok);
    assertTrue(result.errors.length > 0);
  });

  return 2;
}
