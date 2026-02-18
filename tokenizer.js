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
    Bool: iota(),
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
};

/**
 * @param {string} str
 */
function toToken(str) {
    switch (str) {
        case "fn":
            return TokenType.Fn;
        case "let":
            return TokenType.Let;
        case "const":
            return 
    }
}
