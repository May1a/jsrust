import { describe, test, expect } from "bun:test";
import { tokenize, TokenType } from "../src/tokenizer";

// Helper: tokenize a source fragment, appending a newline to avoid the
// tokenizer's undefined-peek edge case at end-of-input.
function tok(source: string) {
    return tokenize(source + "\n");
}

describe("literals", () => {
    test("integer literal", () => {
        const tokens = tok("42");
        expect(tokens[0].type).toBe(TokenType.Integer);
        expect(tokens[0].value).toBe("42");
    });

    test("float literal", () => {
        const tokens = tok("3.14");
        expect(tokens[0].type).toBe(TokenType.Float);
        expect(tokens[0].value).toBe("3.14");
    });

    test("boolean true", () => {
        const tokens = tok("true");
        expect(tokens[0].type).toBe(TokenType.True);
        expect(tokens[0].value).toBe("true");
    });

    test("boolean false", () => {
        const tokens = tok("false");
        expect(tokens[0].type).toBe(TokenType.False);
        expect(tokens[0].value).toBe("false");
    });

    test("string literal", () => {
        const tokens = tok('"hello"');
        expect(tokens[0].type).toBe(TokenType.String);
        expect(tokens[0].value).toBe('"hello"');
    });
});

describe("keywords", () => {
    const cases: [string, TokenType][] = [
        ["fn", TokenType.Fn],
        ["let", TokenType.Let],
        ["if", TokenType.If],
        ["else", TokenType.Else],
        ["return", TokenType.Return],
        ["struct", TokenType.Struct],
        ["enum", TokenType.Enum],
        ["impl", TokenType.Impl],
        ["mut", TokenType.Mut],
        ["pub", TokenType.Pub],
        ["for", TokenType.For],
        ["while", TokenType.While],
        ["loop", TokenType.Loop],
        ["match", TokenType.Match],
        ["break", TokenType.Break],
        ["continue", TokenType.Continue],
    ];

    for (const [kw, expected] of cases) {
        test(kw, () => {
            const tokens = tok(kw);
            expect(tokens[0].type).toBe(expected);
            expect(tokens[0].value).toBe(kw);
        });
    }
});

describe("operators", () => {
    const cases: [string, TokenType][] = [
        ["+", TokenType.Plus],
        ["-", TokenType.Minus],
        ["*", TokenType.Star],
        ["/", TokenType.Slash],
        ["%", TokenType.Percent],
        ["==", TokenType.EqEq],
        ["!=", TokenType.BangEq],
        ["<", TokenType.Lt],
        [">", TokenType.Gt],
        ["<=", TokenType.LtEq],
        [">=", TokenType.GtEq],
        ["&&", TokenType.AndAnd],
        ["||", TokenType.PipePipe],
        ["!", TokenType.Bang],
    ];

    for (const [op, expected] of cases) {
        test(JSON.stringify(op), () => {
            const tokens = tok(op);
            expect(tokens[0].type).toBe(expected);
            expect(tokens[0].value).toBe(op);
        });
    }
});

describe("delimiters", () => {
    const cases: [string, TokenType][] = [
        ["(", TokenType.OpenParen],
        [")", TokenType.CloseParen],
        ["{", TokenType.OpenCurly],
        ["}", TokenType.CloseCurly],
        ["[", TokenType.OpenSquare],
        ["]", TokenType.CloseSquare],
        [",", TokenType.Comma],
        [";", TokenType.Semicolon],
        [":", TokenType.Colon],
    ];

    for (const [delim, expected] of cases) {
        test(JSON.stringify(delim), () => {
            const tokens = tok(delim);
            expect(tokens[0].type).toBe(expected);
            expect(tokens[0].value).toBe(delim);
        });
    }
});

describe("identifiers", () => {
    test("plain identifier", () => {
        const tokens = tok("foo");
        expect(tokens[0].type).toBe(TokenType.Identifier);
        expect(tokens[0].value).toBe("foo");
    });

    test("underscore-leading identifier", () => {
        const tokens = tok("_bar");
        expect(tokens[0].type).toBe(TokenType.Identifier);
        expect(tokens[0].value).toBe("_bar");
    });

    test("identifier with digits", () => {
        const tokens = tok("foo42");
        expect(tokens[0].type).toBe(TokenType.Identifier);
        expect(tokens[0].value).toBe("foo42");
    });

    test("multiple tokens include identifier", () => {
        const tokens = tok("let x = 1;");
        expect(tokens[0].type).toBe(TokenType.Let);
        expect(tokens[1].type).toBe(TokenType.Identifier);
        expect(tokens[1].value).toBe("x");
    });
});
