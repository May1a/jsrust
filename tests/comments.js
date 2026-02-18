import { tokenize, TokenType } from "../tokenizer.js";
import * as lib from "./lib.js";

const { test, assertTokensMatch } = lib;

export function runCommentsTests() {
    const T = TokenType;
    
    test("line comment", () => {
        const tokens = tokenize("// this is a comment\nlet x = 1;");
        assertTokensMatch(tokens, [
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "1" },
            { type: T.Semicolon, value: ";" },
        ]);
    });
    
    test("line comment at end", () => {
        const tokens = tokenize("let x = 1; // comment");
        assertTokensMatch(tokens, [
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "1" },
            { type: T.Semicolon, value: ";" },
        ]);
    });
    
    test("block comment", () => {
        const tokens = tokenize("/* comment */let x = 1;");
        assertTokensMatch(tokens, [
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "1" },
            { type: T.Semicolon, value: ";" },
        ]);
    });
    
    test("multiline block comment", () => {
        const tokens = tokenize("/* line 1\n   line 2 */let x = 1;");
        assertTokensMatch(tokens, [
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "1" },
            { type: T.Semicolon, value: ";" },
        ]);
    });
    
    test("nested code with comments", () => {
        const tokens = tokenize(`
fn main() {
    // declare x
    let x = 1;
    /* multi
       line
       comment */
    let y = 2;
}
`);
        assertTokensMatch(tokens, [
            { type: T.Fn, value: "fn" },
            { type: T.Identifier, value: "main" },
            { type: T.OpenParen, value: "(" },
            { type: T.CloseParen, value: ")" },
            { type: T.OpenCurly, value: "{" },
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "1" },
            { type: T.Semicolon, value: ";" },
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "y" },
            { type: T.Eq, value: "=" },
            { type: T.Integer, value: "2" },
            { type: T.Semicolon, value: ";" },
            { type: T.CloseCurly, value: "}" },
        ]);
    });
    
    test("comment between tokens", () => {
        const tokens = tokenize("let/*comment*/x");
        assertTokensMatch(tokens, [
            { type: T.Let, value: "let" },
            { type: T.Identifier, value: "x" },
        ]);
    });
    
    return 6;
}
