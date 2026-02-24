import { tokenize, TokenType } from "../src/tokenizer";
import * as lib from "./lib";

const { test, assertTokensMatch } = lib;

export function runDelimitersTests() {
    const T = TokenType;

    test("open paren", () => {
        const tokens = tokenize("(");
        assertTokensMatch(tokens, [{ type: T.OpenParen, value: "(" }]);
    });

    test("close paren", () => {
        const tokens = tokenize(")");
        assertTokensMatch(tokens, [{ type: T.CloseParen, value: ")" }]);
    });

    test("open curly", () => {
        const tokens = tokenize("{");
        assertTokensMatch(tokens, [{ type: T.OpenCurly, value: "{" }]);
    });

    test("close curly", () => {
        const tokens = tokenize("}");
        assertTokensMatch(tokens, [{ type: T.CloseCurly, value: "}" }]);
    });

    test("open square", () => {
        const tokens = tokenize("[");
        assertTokensMatch(tokens, [{ type: T.OpenSquare, value: "[" }]);
    });

    test("close square", () => {
        const tokens = tokenize("]");
        assertTokensMatch(tokens, [{ type: T.CloseSquare, value: "]" }]);
    });

    test("comma", () => {
        const tokens = tokenize(",");
        assertTokensMatch(tokens, [{ type: T.Comma, value: "," }]);
    });

    test("semicolon", () => {
        const tokens = tokenize(";");
        assertTokensMatch(tokens, [{ type: T.Semicolon, value: ";" }]);
    });

    test("colon", () => {
        const tokens = tokenize(":");
        assertTokensMatch(tokens, [{ type: T.Colon, value: ":" }]);
    });

    test("dot", () => {
        const tokens = tokenize(".");
        assertTokensMatch(tokens, [{ type: T.Dot, value: "." }]);
    });

    test("function call", () => {
        const tokens = tokenize("foo(a, b)");
        assertTokensMatch(tokens, [
            { type: T.Identifier, value: "foo" },
            { type: T.OpenParen, value: "(" },
            { type: T.Identifier, value: "a" },
            { type: T.Comma, value: "," },
            { type: T.Identifier, value: "b" },
            { type: T.CloseParen, value: ")" },
        ]);
    });

    test("block", () => {
        const tokens = tokenize("{ let x = 1; }");
        assertTokensMatch(tokens, [
            { type: T.OpenCurly, value: "{" },
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "1" },
            { type: T.Semicolon, value: ";" },
            { type: T.CloseCurly, value: "}" },
        ]);
    });

    test("array indexing", () => {
        const tokens = tokenize("arr[0]");
        assertTokensMatch(tokens, [
            { type: T.Identifier, value: "arr" },
            { type: T.OpenSquare, value: "[" },
            { type: T.Integer, value: "0" },
            { type: T.CloseSquare, value: "]" },
        ]);
    });

    test("type annotation", () => {
        const tokens = tokenize("x: i32");
        assertTokensMatch(tokens, [
            { type: T.Identifier, value: "x" },
            { type: T.Colon, value: ":" },
            { type: T.Identifier, value: "i32" },
        ]);
    });

    return 14;
}
