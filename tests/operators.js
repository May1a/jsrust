import { tokenize, TokenType } from "../tokenizer.js";
import * as lib from "./lib.js";

const { test, assertTokensMatch } = lib;

export function runOperatorsTests() {
    const T = TokenType;

    test("plus", () => {
        const tokens = tokenize("+");
        assertTokensMatch(tokens, [{ type: T.Plus, value: "+" }]);
    });

    test("minus", () => {
        const tokens = tokenize("-");
        assertTokensMatch(tokens, [{ type: T.Minus, value: "-" }]);
    });

    test("star", () => {
        const tokens = tokenize("*");
        assertTokensMatch(tokens, [{ type: T.Star, value: "*" }]);
    });

    test("slash", () => {
        const tokens = tokenize("/");
        assertTokensMatch(tokens, [{ type: T.Slash, value: "/" }]);
    });

    test("percent", () => {
        const tokens = tokenize("%");
        assertTokensMatch(tokens, [{ type: T.Percent, value: "%" }]);
    });

    test("assign", () => {
        const tokens = tokenize("=");
        assertTokensMatch(tokens, [{ type: T.Eq, value: "=" }]);
    });

    test("plus assign", () => {
        const tokens = tokenize("+=");
        assertTokensMatch(tokens, [{ type: T.PlusEq, value: "+=" }]);
    });

    test("minus assign", () => {
        const tokens = tokenize("-=");
        assertTokensMatch(tokens, [{ type: T.MinusEq, value: "-=" }]);
    });

    test("star assign", () => {
        const tokens = tokenize("*=");
        assertTokensMatch(tokens, [{ type: T.StarEq, value: "*=" }]);
    });

    test("slash assign", () => {
        const tokens = tokenize("/=");
        assertTokensMatch(tokens, [{ type: T.SlashEq, value: "/=" }]);
    });

    test("percent assign", () => {
        const tokens = tokenize("%=");
        assertTokensMatch(tokens, [{ type: T.PercentEq, value: "%=" }]);
    });

    test("and assign", () => {
        const tokens = tokenize("&=");
        assertTokensMatch(tokens, [{ type: T.AndEq, value: "&=" }]);
    });

    test("pipe assign", () => {
        const tokens = tokenize("|=");
        assertTokensMatch(tokens, [{ type: T.PipeEq, value: "|=" }]);
    });

    test("caret assign", () => {
        const tokens = tokenize("^=");
        assertTokensMatch(tokens, [{ type: T.CaretEq, value: "^=" }]);
    });

    test("equals", () => {
        const tokens = tokenize("==");
        assertTokensMatch(tokens, [{ type: T.EqEq, value: "==" }]);
    });

    test("bang", () => {
        const tokens = tokenize("!");
        assertTokensMatch(tokens, [{ type: T.Bang, value: "!" }]);
    });

    test("not equal", () => {
        const tokens = tokenize("!=");
        assertTokensMatch(tokens, [{ type: T.BangEq, value: "!=" }]);
    });

    test("less than", () => {
        const tokens = tokenize("<");
        assertTokensMatch(tokens, [{ type: T.Lt, value: "<" }]);
    });

    test("greater than", () => {
        const tokens = tokenize(">");
        assertTokensMatch(tokens, [{ type: T.Gt, value: ">" }]);
    });

    test("less than or equal", () => {
        const tokens = tokenize("<=");
        assertTokensMatch(tokens, [{ type: T.LtEq, value: "<=" }]);
    });

    test("greater than or equal", () => {
        const tokens = tokenize(">=");
        assertTokensMatch(tokens, [{ type: T.GtEq, value: ">=" }]);
    });

    test("and (single)", () => {
        const tokens = tokenize("&");
        assertTokensMatch(tokens, [{ type: T.And, value: "&" }]);
    });

    test("logical and", () => {
        const tokens = tokenize("&&");
        assertTokensMatch(tokens, [{ type: T.AndAnd, value: "&&" }]);
    });

    test("pipe (single)", () => {
        const tokens = tokenize("|");
        assertTokensMatch(tokens, [{ type: T.Pipe, value: "|" }]);
    });

    test("logical or", () => {
        const tokens = tokenize("||");
        assertTokensMatch(tokens, [{ type: T.PipePipe, value: "||" }]);
    });

    test("caret", () => {
        const tokens = tokenize("^");
        assertTokensMatch(tokens, [{ type: T.Caret, value: "^" }]);
    });

    test("expression with operators", () => {
        const tokens = tokenize("a + b * c == d && e");
        assertTokensMatch(tokens, [
            { type: T.Identifier, value: "a" },
            { type: T.Plus, value: "+" },
            { type: T.Identifier, value: "b" },
            { type: T.Star, value: "*" },
            { type: T.Identifier, value: "c" },
            { type: T.EqEq, value: "==" },
            { type: T.Identifier, value: "d" },
            { type: T.AndAnd, value: "&&" },
            { type: T.Identifier, value: "e" },
        ]);
    });

    return 28;
}
