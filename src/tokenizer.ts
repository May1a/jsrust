export enum TokenType {
    Invalid,
    Fn,
    Let,
    Const,
    Static,
    True,
    False,
    Type,
    Use,
    Pub,
    Enum,
    Struct,
    Unsafe,
    If,
    Else,
    Match,
    Trait,
    Impl,
    Mod,
    Return,
    For,
    While,
    Loop,
    Where,
    Self,
    Mut,
    FatArrow,
    OpenParen,
    CloseParen,
    OpenCurly,
    CloseCurly,
    OpenSquare,
    CloseSquare,
    Comma,
    Semicolon,
    Colon,
    Dot,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Eq,
    PlusEq,
    MinusEq,
    StarEq,
    SlashEq,
    PercentEq,
    AndEq,
    PipeEq,
    CaretEq,
    EqEq,
    Bang,
    BangEq,
    Lt,
    Gt,
    LtEq,
    GtEq,
    And,
    AndAnd,
    Pipe,
    PipePipe,
    Caret,
    Identifier,
    Integer,
    Float,
    String,
    Lifetime,
    Eof,
}

export type TokenTypeValue = TokenType;

export interface Token {
    type: TokenTypeValue;
    value: string;
    line: number;
    column: number;
}

export interface LexerState {
    source: string;
    pos: number;
    line: number;
    column: number;
}

const Keywords: Record<string, TokenType> = {
    fn: TokenType.Fn,
    let: TokenType.Let,
    const: TokenType.Const,
    static: TokenType.Static,
    true: TokenType.True,
    false: TokenType.False,
    type: TokenType.Type,
    use: TokenType.Use,
    pub: TokenType.Pub,
    enum: TokenType.Enum,
    struct: TokenType.Struct,
    unsafe: TokenType.Unsafe,
    if: TokenType.If,
    else: TokenType.Else,
    match: TokenType.Match,
    trait: TokenType.Trait,
    impl: TokenType.Impl,
    mod: TokenType.Mod,
    return: TokenType.Return,
    for: TokenType.For,
    while: TokenType.While,
    loop: TokenType.Loop,
    where: TokenType.Where,
    self: TokenType.Self,
    mut: TokenType.Mut,
};

function initState(source: string) {
    return { source, pos: 0, line: 1, column: 1 } as LexerState;
}

function peek(state: LexerState) {
    return state.source[state.pos];
}

function peekAt(state: LexerState, offset: number) {
    return state.source[state.pos + offset];
}

function advance(state: LexerState) {
    const ch = state.source[state.pos];
    if (!ch) return undefined;
    state.pos++;
    if (ch === "\n") {
        state.line++;
        state.column = 1;
    } else {
        state.column++;
    }
    return ch;
}

function skipWhitespace(state: LexerState) {
    while (isWhitespace(peek(state))) {
        advance(state);
    }
}

function skipLineComment(state: LexerState) {
    while (peek(state) && peek(state) !== "\n") {
        advance(state);
    }
}

function skipBlockComment(state: LexerState): boolean {
    while (peek(state)) {
        if (peek(state) === "*" && peekAt(state, 1) === "/") {
            advance(state);
            advance(state);
            return true;
        }
        advance(state);
    }
    return false;
}

function isIdentifierStart(ch?: string) {
    return Boolean(ch) && (ch === "_" || /[a-zA-Z]/.test(ch));
}

function isIdentifierChar(ch?: string) {
    return Boolean(ch) && (ch === "_" || /[a-zA-Z0-9]/.test(ch));
}

function isWhitespace(ch?: string) {
    return Boolean(ch) && /\s/.test(ch);
}

function isDigit(ch?: string) {
    return Boolean(ch) && /[0-9]/.test(ch);
}

function isHexDigit(ch?: string) {
    return Boolean(ch) && /[0-9a-fA-F]/.test(ch);
}

function isOctalDigit(ch?: string) {
    return Boolean(ch) && /[0-7]/.test(ch);
}

function isBinaryDigit(ch?: string) {
    return Boolean(ch) && /[01]/.test(ch);
}

function makeToken(
    type: TokenTypeValue,
    value: string,
    startLine: number,
    startColumn: number,
): Token {
    return { type, value, line: startLine, column: startColumn };
}

function readIdentifier(state: LexerState): Token {
    const startLine = state.line;
    const startColumn = state.column;
    let value = "";
    while (isIdentifierChar(peek(state))) {
        value += advance(state);
    }
    const type = Keywords[value] ?? TokenType.Identifier;
    return makeToken(type, value, startLine, startColumn);
}

function readNumber(state: LexerState): Token {
    const startLine = state.line;
    const startColumn = state.column;
    let value = "";
    let isFloat = false;

    // Hex digit (0x)
    if (
        peek(state) === "0" &&
        (peekAt(state, 1) === "x" || peekAt(state, 1) === "X")
    ) {
        value += advance(state);
        value += advance(state);
        while (isHexDigit(peek(state))) {
            value += advance(state);
        }
        return makeToken(TokenType.Integer, value, startLine, startColumn);
    }
    // Octal digit (0o)
    if (
        peek(state) === "0" &&
        (peekAt(state, 1) === "o" || peekAt(state, 1) === "O")
    ) {
        value += advance(state);
        value += advance(state);
        while (isOctalDigit(peek(state))) {
            value += advance(state);
        }
        return makeToken(TokenType.Integer, value, startLine, startColumn);
    }
    // Binary digit (0b)
    if (
        peek(state) === "0" &&
        (peekAt(state, 1) === "b" || peekAt(state, 1) === "B")
    ) {
        value += advance(state);
        value += advance(state);
        while (isBinaryDigit(peek(state))) {
            value += advance(state);
        }
        return makeToken(TokenType.Integer, value, startLine, startColumn);
    }

    while (isDigit(peek(state))) {
        value += advance(state);
    }

    if (peek(state) === "." && isDigit(peekAt(state, 1))) {
        isFloat = true;
        value += advance(state);
        while (isDigit(peek(state))) {
            value += advance(state);
        }
    }

    if (peek(state) && (peek(state) === "e" || peek(state) === "E")) {
        isFloat = true;
        value += advance(state);
        if (peek(state) === "+" || peek(state) === "-") {
            value += advance(state);
        }
        while (isDigit(peek(state))) {
            value += advance(state);
        }
    }

    return makeToken(
        isFloat ? TokenType.Float : TokenType.Integer,
        value,
        startLine,
        startColumn,
    );
}

function readString(state: LexerState): Token {
    const startLine = state.line;
    const startColumn = state.column;
    const quote = advance(state);
    let value = quote ?? "";

    while (peek(state) && peek(state) !== quote) {
        if (peek(state) === "\n") {
            return makeToken(TokenType.Invalid, value, startLine, startColumn);
        }
        if (peek(state) === "\\") {
            const escaped = advance(state);
            value += escaped ?? "";
            if (peek(state)) {
                const next = advance(state);
                value += next ?? "";
            }
        } else {
            const ch = advance(state);
            value += ch ?? "";
        }
    }

    if (!peek(state)) {
        return makeToken(TokenType.Invalid, value, startLine, startColumn);
    }

    const closing = advance(state);
    value += closing ?? "";
    return makeToken(TokenType.String, value, startLine, startColumn);
}

function isLifetimeStart(state: LexerState): boolean {
    if (peek(state) !== "'") return false;
    const next = peekAt(state, 1);
    if (!next || !(next === "_" || /[a-zA-Z]/.test(next))) {
        return false;
    }
    let i = 2;
    while (isIdentifierChar(peekAt(state, i))) {
        i++;
    }
    // `'a'` and `'_` (with trailing `'`) are char literals, not lifetimes.
    return peekAt(state, i) !== "'";
}

function readLifetime(state: LexerState): Token {
    const startLine = state.line;
    const startColumn = state.column;
    let value = "";
    value += advance(state) ?? "";
    while (isIdentifierChar(peek(state))) {
        value += advance(state) ?? "";
    }
    return makeToken(TokenType.Lifetime, value, startLine, startColumn);
}

function readOperatorOrDelimiter(state: LexerState): Token | null {
    const startLine = state.line;
    const startColumn = state.column;
    const ch = peek(state);

    if (!ch) return null;

    const singleCharTokens: Record<string, TokenTypeValue> = {
        "(": TokenType.OpenParen,
        ")": TokenType.CloseParen,
        "{": TokenType.OpenCurly,
        "}": TokenType.CloseCurly,
        "[": TokenType.OpenSquare,
        "]": TokenType.CloseSquare,
        ",": TokenType.Comma,
        ";": TokenType.Semicolon,
        ":": TokenType.Colon,
        ".": TokenType.Dot,
        "+": TokenType.Plus,
        "-": TokenType.Minus,
        "*": TokenType.Star,
        "/": TokenType.Slash,
        "%": TokenType.Percent,
        "!": TokenType.Bang,
        "<": TokenType.Lt,
        ">": TokenType.Gt,
        "^": TokenType.Caret,
        "|": TokenType.Pipe,
        "=": TokenType.Eq,
        "&": TokenType.And,
    };

    const twoCharTokens: Record<string, TokenTypeValue> = {
        "+=": TokenType.PlusEq,
        "-=": TokenType.MinusEq,
        "*=": TokenType.StarEq,
        "/=": TokenType.SlashEq,
        "%=": TokenType.PercentEq,
        "&=": TokenType.AndEq,
        "|=": TokenType.PipeEq,
        "^=": TokenType.CaretEq,
        "==": TokenType.EqEq,
        "!=": TokenType.BangEq,
        "<=": TokenType.LtEq,
        ">=": TokenType.GtEq,
        "&&": TokenType.AndAnd,
        "||": TokenType.PipePipe,
        "=>": TokenType.FatArrow,
    };

    const next = peekAt(state, 1);
    const twoChar = ch + (next ?? "");
    if (next && twoCharTokens[twoChar]) {
        advance(state);
        advance(state);
        return makeToken(
            twoCharTokens[twoChar],
            twoChar,
            startLine,
            startColumn,
        );
    }
    if (singleCharTokens[ch]) {
        advance(state);
        return makeToken(singleCharTokens[ch], ch, startLine, startColumn);
    }
    return null;
}

export function tokenize(source: string): Token[] {
    const state = initState(source);
    const tokens: Token[] = [];

    while (peek(state)) {
        skipWhitespace(state);
        if (!peek(state)) break;

        const startLine = state.line;
        const startColumn = state.column;
        const ch = peek(state);

        if (ch === "/" && peekAt(state, 1) === "/") {
            advance(state);
            advance(state);
            skipLineComment(state);
            continue;
        }

        if (ch === "/" && peekAt(state, 1) === "*") {
            advance(state);
            advance(state);
            skipBlockComment(state);
            continue;
        }

        if (isIdentifierStart(ch)) {
            tokens.push(readIdentifier(state));
            continue;
        }

        if (isDigit(ch)) {
            tokens.push(readNumber(state));
            continue;
        }

        if (ch === "'") {
            if (isLifetimeStart(state)) {
                tokens.push(readLifetime(state));
            } else {
                tokens.push(readString(state));
            }
            continue;
        }

        if (ch === '"') {
            tokens.push(readString(state));
            continue;
        }

        const opToken = readOperatorOrDelimiter(state);
        if (opToken) {
            tokens.push(opToken);
            continue;
        }

        const invalidChar = advance(state) ?? "";
        tokens.push(
            makeToken(TokenType.Invalid, invalidChar, startLine, startColumn),
        );
    }

    tokens.push(makeToken(TokenType.Eof, "", state.line, state.column));
    return tokens;
}
