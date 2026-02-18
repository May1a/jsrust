import { tokenize, TokenType } from "../tokenizer.js";
import * as lib from "./lib.js";

const { test, assertTokensMatch, assertEqual } = lib;

export function runErrorsTests() {
    const T = TokenType;
    
    test("unterminated string produces Invalid", () => {
        const tokens = tokenize('"hello');
        assertEqual(tokens[0].type, T.Invalid);
        assertEqual(tokens[0].value, '"hello');
    });
    
    test("unterminated single quote produces Invalid", () => {
        const tokens = tokenize("'a");
        assertEqual(tokens[0].type, T.Invalid);
        assertEqual(tokens[0].value, "'a");
    });
    
    test("newline in string produces Invalid", () => {
        const tokens = tokenize('"hello\nworld"');
        assertEqual(tokens[0].type, T.Invalid);
    });
    
    test("unknown character produces Invalid", () => {
        const tokens = tokenize("@");
        assertEqual(tokens[0].type, T.Invalid);
        assertEqual(tokens[0].value, "@");
    });
    
    test("multiple unknown characters", () => {
        const tokens = tokenize("@#$");
        assertEqual(tokens[0].type, T.Invalid);
        assertEqual(tokens[0].value, "@");
        assertEqual(tokens[1].type, T.Invalid);
        assertEqual(tokens[1].value, "#");
        assertEqual(tokens[2].type, T.Invalid);
        assertEqual(tokens[2].value, "$");
    });
    
    test("unknown char between valid tokens", () => {
        const tokens = tokenize("let @ x");
        assertEqual(tokens.length, 4);
        assertEqual(tokens[0].type, T.Let);
        assertEqual(tokens[1].type, T.Invalid);
        assertEqual(tokens[2].type, T.Identifier);
    });
    
    test("unterminated block comment", () => {
        const tokens = tokenize("let x /* unclosed");
        assertEqual(tokens.length, 3);
        assertEqual(tokens[0].type, T.Let);
        assertEqual(tokens[1].type, T.Identifier);
    });
    
    test("empty input produces only EOF", () => {
        const tokens = tokenize("");
        assertEqual(tokens.length, 1);
        assertEqual(tokens[0].type, T.Eof);
    });
    
    test("whitespace only produces only EOF", () => {
        const tokens = tokenize("   \n\t  ");
        assertEqual(tokens.length, 1);
        assertEqual(tokens[0].type, T.Eof);
    });
    
    return 9;
}
