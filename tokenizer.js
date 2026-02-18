"use strict";
/**
 * @param {bool?} reset
 */
function iota(reset) {
    if (!globalThis.iota || reset)
        globalThis.iota = 0;
    return globalThis.iota++;
}

const TokenType = {
    Invalid: iota(true),
    Fn: iota(),
    Let: iota(),
    Const: iota(),
    Static: iota(),
    True: iota(),
    False: iota(),
    Type: iota(),
    Use: iota(),
    Pub: iota(),
    Enum: iota(),
    Struct: iota(),
    Unsafe: iota(),
    If: iota(),
    Match: iota(),
    OpenParen: iota(),
    CloseParen: iota(),
    OpenCurly: iota(),
    CloseCurly: iota(),
    OpenSquare: iota(),
    CloseSquare: iota(),
};

/**
 * @param {string} str
 */
function toToken(str) {
    switch (str) {
        case "fn": return TokenType.Fn;
        case "let": return TokenType.Let;
        case "const": return TokenType.Const;
        case "static": return TokenType.Static;
        case "true": return TokenType.True;
        case "false": return TokenType.False;
        case "type": return TokenType.Type;
        case "use": return TokenType.Use;
        case "pub": return TokenType.Pub;
        case "enum": return TokenType.Enum;
        case "struct": return TokenType.Struct;
        case "unsafe": return TokenType.Unsafe;
        case "if": return TokenType.If;
        case "match": return TokenType.match;
        case "(": return TokenType.OpenParen;
        case ")": return TokenType.CloseParen;
        case "[": return TokenType.OpenSquare;
        case "]": return TokenType.CloseSquare;
        case "{": return TokenType.OpenCurly;
        case "}": return TokenType.CloseCurly;
        default: break;
    }
    return TokenType.Invalid;
}
