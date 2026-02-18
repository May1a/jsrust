import { tokenize, TokenType } from "../tokenizer.js";
import * as lib from "./lib.js";

const { test, assertTokensMatch } = lib;

export function runLiteralsTests() {
    const T = TokenType;

    test("decimal integer", () => {
        const tokens = tokenize("42");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "42" }]);
    });

    test("decimal integer zero", () => {
        const tokens = tokenize("0");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "0" }]);
    });

    test("large decimal integer", () => {
        const tokens = tokenize("1234567890");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "1234567890" }]);
    });

    test("hex integer lowercase", () => {
        const tokens = tokenize("0xdeadbeef");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "0xdeadbeef" }]);
    });

    test("hex integer uppercase", () => {
        const tokens = tokenize("0xDEADBEEF");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "0xDEADBEEF" }]);
    });

    test("hex integer mixed case", () => {
        const tokens = tokenize("0xAbCdEf");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "0xAbCdEf" }]);
    });

    test("octal integer", () => {
        const tokens = tokenize("0o755");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "0o755" }]);
    });

    test("binary integer", () => {
        const tokens = tokenize("0b101010");
        assertTokensMatch(tokens, [{ type: T.Integer, value: "0b101010" }]);
    });

    test("simple float", () => {
        const tokens = tokenize("3.14");
        assertTokensMatch(tokens, [{ type: T.Float, value: "3.14" }]);
    });

    test("float with exponent", () => {
        const tokens = tokenize("1e10");
        assertTokensMatch(tokens, [{ type: T.Float, value: "1e10" }]);
    });

    test("float with positive exponent", () => {
        const tokens = tokenize("1.5e+10");
        assertTokensMatch(tokens, [{ type: T.Float, value: "1.5e+10" }]);
    });

    test("float with negative exponent", () => {
        const tokens = tokenize("2.5e-5");
        assertTokensMatch(tokens, [{ type: T.Float, value: "2.5e-5" }]);
    });

    test("float uppercase E", () => {
        const tokens = tokenize("1E10");
        assertTokensMatch(tokens, [{ type: T.Float, value: "1E10" }]);
    });

    test("simple string", () => {
        const tokens = tokenize('"hello"');
        assertTokensMatch(tokens, [{ type: T.String, value: '"hello"' }]);
    });

    test("string with escape", () => {
        const tokens = tokenize('"hello\\nworld"');
        assertTokensMatch(tokens, [
            { type: T.String, value: '"hello\\nworld"' },
        ]);
    });

    test("string with escaped quote", () => {
        const tokens = tokenize('"say \\"hi\\""');
        assertTokensMatch(tokens, [
            { type: T.String, value: '"say \\"hi\\""' },
        ]);
    });

    test("string with backslash", () => {
        const tokens = tokenize('"path\\\\to\\\\file"');
        assertTokensMatch(tokens, [
            { type: T.String, value: '"path\\\\to\\\\file"' },
        ]);
    });

    test("single quoted string", () => {
        const tokens = tokenize("'a'");
        assertTokensMatch(tokens, [{ type: T.String, value: "'a'" }]);
    });

    test("empty string", () => {
        const tokens = tokenize('""');
        assertTokensMatch(tokens, [{ type: T.String, value: '""' }]);
    });

    test("multiple numbers", () => {
        const tokens = tokenize("42 3.14 0xFF");
        assertTokensMatch(tokens, [
            { type: T.Integer, value: "42" },
            { type: T.Float, value: "3.14" },
            { type: T.Integer, value: "0xFF" },
        ]);
    });

    return 21;
}
