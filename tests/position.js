import { tokenize, TokenType } from "../tokenizer.js";
import * as lib from "./lib.js";

const { test, assertEqual } = lib;

export function runPositionTests() {
    const T = TokenType;
    
    test("single token position", () => {
        const tokens = tokenize("fn");
        assertEqual(tokens[0].line, 1);
        assertEqual(tokens[0].column, 1);
    });
    
    test("token after space", () => {
        const tokens = tokenize("   let");
        assertEqual(tokens[0].line, 1);
        assertEqual(tokens[0].column, 4);
    });
    
    test("tokens on multiple lines", () => {
        const tokens = tokenize("let\nfn");
        assertEqual(tokens[0].line, 1);
        assertEqual(tokens[0].column, 1);
        assertEqual(tokens[1].line, 2);
        assertEqual(tokens[1].column, 1);
    });
    
    test("token after multiple newlines", () => {
        const tokens = tokenize("\n\n\nfn");
        assertEqual(tokens[0].line, 4);
        assertEqual(tokens[0].column, 1);
    });
    
    test("tokens on same line have correct columns", () => {
        const tokens = tokenize("let x = 1;");
        assertEqual(tokens[0].column, 1);  // let
        assertEqual(tokens[1].column, 5);  // x
        assertEqual(tokens[2].column, 7);  // =
        assertEqual(tokens[3].column, 9);  // 1
        assertEqual(tokens[4].column, 10); // ;
    });
    
    test("comment does not affect position of next token", () => {
        const tokens = tokenize("// comment\nlet");
        assertEqual(tokens[0].line, 2);
        assertEqual(tokens[0].column, 1);
    });
    
    test("block comment spanning lines", () => {
        const tokens = tokenize("let /* \n */ fn");
        assertEqual(tokens[0].line, 1);  // let
        assertEqual(tokens[1].line, 2);  // fn
        assertEqual(tokens[1].column, 5);
    });
    
    test("EOF token position", () => {
        const tokens = tokenize("let");
        const eof = tokens[tokens.length - 1];
        assertEqual(eof.type, T.Eof);
        assertEqual(eof.line, 1);
        assertEqual(eof.column, 4);
    });
    
    test("complex code positions", () => {
        const tokens = tokenize(`fn main() {
    let x = 42;
}`);
        assertEqual(tokens[0].line, 1);  // fn
        assertEqual(tokens[0].column, 1);
        assertEqual(tokens[1].line, 1);  // main
        assertEqual(tokens[1].column, 4);
        assertEqual(tokens[2].line, 1);  // (
        assertEqual(tokens[2].column, 8);
        assertEqual(tokens[3].line, 1);  // )
        assertEqual(tokens[3].column, 9);
        assertEqual(tokens[4].line, 1);  // {
        assertEqual(tokens[4].column, 11);
        assertEqual(tokens[5].line, 2);  // let
        assertEqual(tokens[5].column, 5);
    });
    
    return 9;
}
