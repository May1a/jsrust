import { tokenize, TokenType } from "../tokenizer.js";
import * as lib from "./lib.js";

const { test, assertTokensMatch } = lib;

export function runKeywordsTests() {
    const T = TokenType;

    test("fn keyword", () => {
        const tokens = tokenize("fn");
        assertTokensMatch(tokens, [{ type: T.Fn, value: "fn" }]);
    });

    test("let keyword", () => {
        const tokens = tokenize("let");
        assertTokensMatch(tokens, [{ type: T.Let, value: "let" }]);
    });

    test("const keyword", () => {
        const tokens = tokenize("const");
        assertTokensMatch(tokens, [{ type: T.Const, value: "const" }]);
    });

    test("static keyword", () => {
        const tokens = tokenize("static");
        assertTokensMatch(tokens, [{ type: T.Static, value: "static" }]);
    });

    test("true keyword", () => {
        const tokens = tokenize("true");
        assertTokensMatch(tokens, [{ type: T.True, value: "true" }]);
    });

    test("false keyword", () => {
        const tokens = tokenize("false");
        assertTokensMatch(tokens, [{ type: T.False, value: "false" }]);
    });

    test("type keyword", () => {
        const tokens = tokenize("type");
        assertTokensMatch(tokens, [{ type: T.Type, value: "type" }]);
    });

    test("use keyword", () => {
        const tokens = tokenize("use");
        assertTokensMatch(tokens, [{ type: T.Use, value: "use" }]);
    });

    test("pub keyword", () => {
        const tokens = tokenize("pub");
        assertTokensMatch(tokens, [{ type: T.Pub, value: "pub" }]);
    });

    test("enum keyword", () => {
        const tokens = tokenize("enum");
        assertTokensMatch(tokens, [{ type: T.Enum, value: "enum" }]);
    });

    test("struct keyword", () => {
        const tokens = tokenize("struct");
        assertTokensMatch(tokens, [{ type: T.Struct, value: "struct" }]);
    });

    test("unsafe keyword", () => {
        const tokens = tokenize("unsafe");
        assertTokensMatch(tokens, [{ type: T.Unsafe, value: "unsafe" }]);
    });

    test("if keyword", () => {
        const tokens = tokenize("if");
        assertTokensMatch(tokens, [{ type: T.If, value: "if" }]);
    });

    test("else keyword", () => {
        const tokens = tokenize("else");
        assertTokensMatch(tokens, [{ type: T.Else, value: "else" }]);
    });

    test("match keyword", () => {
        const tokens = tokenize("match");
        assertTokensMatch(tokens, [{ type: T.Match, value: "match" }]);
    });

    test("trait keyword", () => {
        const tokens = tokenize("trait");
        assertTokensMatch(tokens, [{ type: T.Trait, value: "trait" }]);
    });

    test("impl keyword", () => {
        const tokens = tokenize("impl");
        assertTokensMatch(tokens, [{ type: T.Impl, value: "impl" }]);
    });

    test("mod keyword", () => {
        const tokens = tokenize("mod");
        assertTokensMatch(tokens, [{ type: T.Mod, value: "mod" }]);
    });

    test("return keyword", () => {
        const tokens = tokenize("return");
        assertTokensMatch(tokens, [{ type: T.Return, value: "return" }]);
    });

    test("for keyword", () => {
        const tokens = tokenize("for");
        assertTokensMatch(tokens, [{ type: T.For, value: "for" }]);
    });

    test("while keyword", () => {
        const tokens = tokenize("while");
        assertTokensMatch(tokens, [{ type: T.While, value: "while" }]);
    });

    test("loop keyword", () => {
        const tokens = tokenize("loop");
        assertTokensMatch(tokens, [{ type: T.Loop, value: "loop" }]);
    });

    test("self keyword", () => {
        const tokens = tokenize("self");
        assertTokensMatch(tokens, [{ type: T.Self, value: "self" }]);
    });

    test("keywords are not matched inside identifiers", () => {
        const tokens = tokenize("fnx");
        assertTokensMatch(tokens, [{ type: T.Identifier, value: "fnx" }]);
    });

    test("identifiers are recognized", () => {
        const tokens = tokenize("foo _bar CamelCase __underscore__");
        assertTokensMatch(tokens, [
            { type: T.Identifier, value: "foo" },
            { type: T.Identifier, value: "_bar" },
            { type: T.Identifier, value: "CamelCase" },
            { type: T.Identifier, value: "__underscore__" },
        ]);
    });

    return 26;
}
