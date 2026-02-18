/** @type {number | undefined} */
globalThis.iota = undefined;

/**
 * @param {boolean} reset
 */
function iota(reset = false) {
  if (!globalThis.iota || reset) globalThis.iota = 0;
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
  Else: iota(),
  Match: iota(),
  Impl: iota(),
  Mod: iota(),
  Return: iota(),
  For: iota(),
  While: iota(),
  Loop: iota(),
  Self: iota(),
  OpenParen: iota(),
  CloseParen: iota(),
  OpenCurly: iota(),
  CloseCurly: iota(),
  OpenSquare: iota(),
  CloseSquare: iota(),
  Comma: iota(),
  Semicolon: iota(),
  Colon: iota(),
  Dot: iota(),
  Plus: iota(),
  Minus: iota(),
  Star: iota(),
  Slash: iota(),
  Percent: iota(),
  Eq: iota(),
  EqEq: iota(),
  Bang: iota(),
  BangEq: iota(),
  Lt: iota(),
  Gt: iota(),
  LtEq: iota(),
  GtEq: iota(),
  And: iota(),
  AndAnd: iota(),
  Pipe: iota(),
  PipePipe: iota(),
  Caret: iota(),
  Identifier: iota(),
  Integer: iota(),
  Float: iota(),
  String: iota(),
  Eof: iota(),
};

/** @typedef {number} TokenTypeValue */
/** @typedef {{ type: TokenTypeValue, value: string, line: number, column: number }} Token */
/** @typedef {{ source: string, pos: number, line: number, column: number }} LexerState */

const KEYWORDS = {
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
  impl: TokenType.Impl,
  mod: TokenType.Mod,
  return: TokenType.Return,
  for: TokenType.For,
  while: TokenType.While,
  loop: TokenType.Loop,
  self: TokenType.Self,
};

/**
 * @param {string} source
 * @returns {LexerState}
 */
function initState(source) {
  return { source, pos: 0, line: 1, column: 1 };
}

/**
 * @param {LexerState} state
 * @returns {string | undefined}
 */
function peek(state) {
  return state.source[state.pos];
}

/**
 * @param {LexerState} state
 * @param {number} offset
 * @returns {string | undefined}
 */
function peekAt(state, offset) {
  return state.source[state.pos + offset];
}

/**
 * @param {LexerState} state
 * @returns {string | undefined}
 */
function advance(state) {
  const ch = state.source[state.pos];
  if (ch === undefined) return undefined;
  state.pos++;
  if (ch === "\n") {
    state.line++;
    state.column = 1;
  } else {
    state.column++;
  }
  return ch;
}

/**
 * @param {LexerState} state
 * @returns {void}
 */
function skipWhitespace(state) {
  while (peek(state) && /\s/.test(peek(state))) {
    advance(state);
  }
}

/**
 * @param {LexerState} state
 * @returns {void}
 */
function skipLineComment(state) {
  while (peek(state) && peek(state) !== "\n") {
    advance(state);
  }
}

/**
 * @param {LexerState} state
 * @returns {boolean}
 */
function skipBlockComment(state) {
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

/**
 * @param {LexerState} state
 * @returns {boolean}
 */
function isIdentifierStart(ch) {
  return ch && (ch === "_" || /[a-zA-Z]/.test(ch));
}

/**
 * @param {LexerState} state
 * @returns {boolean}
 */
function isIdentifierChar(ch) {
  return ch && (ch === "_" || /[a-zA-Z0-9]/.test(ch));
}

/**
 * @param {LexerState} state
 * @param {TokenTypeValue} type
 * @param {string} value
 * @param {number} startLine
 * @param {number} startColumn
 * @returns {Token}
 */
function makeToken(type, value, startLine, startColumn) {
  return { type, value, line: startLine, column: startColumn };
}

/**
 * @param {LexerState} state
 * @returns {Token}
 */
function readIdentifier(state) {
  const startLine = state.line;
  const startColumn = state.column;
  let value = "";
  while (isIdentifierChar(peek(state))) {
    value += advance(state);
  }
  const type = KEYWORDS[value] ?? TokenType.Identifier;
  return makeToken(type, value, startLine, startColumn);
}

/**
 * @param {LexerState} state
 * @returns {Token}
 */
function readNumber(state) {
  const startLine = state.line;
  const startColumn = state.column;
  let value = "";
  let isFloat = false;

  if (
    peek(state) === "0" &&
    (peekAt(state, 1) === "x" || peekAt(state, 1) === "X")
  ) {
    value += advance(state);
    value += advance(state);
    while (peek(state) && /[0-9a-fA-F]/.test(peek(state))) {
      value += advance(state);
    }
    return makeToken(TokenType.Integer, value, startLine, startColumn);
  }

  if (
    peek(state) === "0" &&
    (peekAt(state, 1) === "o" || peekAt(state, 1) === "O")
  ) {
    value += advance(state);
    value += advance(state);
    while (peek(state) && /[0-7]/.test(peek(state))) {
      value += advance(state);
    }
    return makeToken(TokenType.Integer, value, startLine, startColumn);
  }

  if (
    peek(state) === "0" &&
    (peekAt(state, 1) === "b" || peekAt(state, 1) === "B")
  ) {
    value += advance(state);
    value += advance(state);
    while (peek(state) && /[01]/.test(peek(state))) {
      value += advance(state);
    }
    return makeToken(TokenType.Integer, value, startLine, startColumn);
  }

  while (peek(state) && /[0-9]/.test(peek(state))) {
    value += advance(state);
  }

  if (peek(state) === "." && /[0-9]/.test(peekAt(state, 1))) {
    isFloat = true;
    value += advance(state);
    while (peek(state) && /[0-9]/.test(peek(state))) {
      value += advance(state);
    }
  }

  if (peek(state) && (peek(state) === "e" || peek(state) === "E")) {
    isFloat = true;
    value += advance(state);
    if (peek(state) === "+" || peek(state) === "-") {
      value += advance(state);
    }
    while (peek(state) && /[0-9]/.test(peek(state))) {
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

/**
 * @param {LexerState} state
 * @returns {Token}
 */
function readString(state) {
  const startLine = state.line;
  const startColumn = state.column;
  const quote = advance(state);
  let value = quote;

  while (peek(state) && peek(state) !== quote) {
    if (peek(state) === "\n") {
      return makeToken(TokenType.Invalid, value, startLine, startColumn);
    }
    if (peek(state) === "\\") {
      value += advance(state);
      if (peek(state)) {
        value += advance(state);
      }
    } else {
      value += advance(state);
    }
  }

  if (!peek(state)) {
    return makeToken(TokenType.Invalid, value, startLine, startColumn);
  }

  value += advance(state);
  return makeToken(TokenType.String, value, startLine, startColumn);
}

/**
 * @param {LexerState} state
 * @returns {Token | null}
 */
function readOperatorOrDelimiter(state) {
  const startLine = state.line;
  const startColumn = state.column;
  const ch = peek(state);

  const singleCharTokens = {
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
  };

  const twoCharTokens = {
    "==": TokenType.EqEq,
    "!=": TokenType.BangEq,
    "<=": TokenType.LtEq,
    ">=": TokenType.GtEq,
    "&&": TokenType.AndAnd,
    "||": TokenType.PipePipe,
  };

  const twoChar = peek(state) + peekAt(state, 1);
  if (twoCharTokens[twoChar]) {
    const value = advance(state) + advance(state);
    return makeToken(twoCharTokens[twoChar], value, startLine, startColumn);
  }

  if (ch === "=") {
    advance(state);
    return makeToken(TokenType.Eq, "=", startLine, startColumn);
  }

  if (ch === "&") {
    advance(state);
    return makeToken(TokenType.And, "&", startLine, startColumn);
  }

  if (ch === "|") {
    advance(state);
    return makeToken(TokenType.Pipe, "|", startLine, startColumn);
  }

  if (singleCharTokens[ch]) {
    advance(state);
    return makeToken(singleCharTokens[ch], ch, startLine, startColumn);
  }

  return null;
}

/**
 * @param {string} source
 * @returns {Token[]}
 */
function tokenize(source) {
  const state = initState(source);
  const tokens = [];

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

    if (/[0-9]/.test(ch)) {
      tokens.push(readNumber(state));
      continue;
    }

    if (ch === '"' || ch === "'") {
      tokens.push(readString(state));
      continue;
    }

    const opToken = readOperatorOrDelimiter(state);
    if (opToken) {
      tokens.push(opToken);
      continue;
    }

    tokens.push(
      makeToken(
        TokenType.Invalid,
        advance(state),
        startLine,
        startColumn,
      ),
    );
  }

  tokens.push(makeToken(TokenType.Eof, "", state.line, state.column));
  return tokens;
}

export { tokenize, TokenType };
