import { tokenize, TokenType } from "./tokenizer";
import type { Token } from "./tokenizer";

import {
    NodeKind,
    LiteralKind,
    UnaryOp,
    BinaryOp,
    Mutability,
    makeSpan,
    makeLiteralExpr,
    makeIdentifierExpr,
    makeBinaryExpr,
    makeUnaryExpr,
    makeCallExpr,
    makeFieldExpr,
    makeIndexExpr,
    makeAssignExpr,
    makeIfExpr,
    makeMatchExpr,
    makeBlockExpr,
    makeReturnExpr,
    makeBreakExpr,
    makeContinueExpr,
    makeLoopExpr,
    makeWhileExpr,
    makeForExpr,
    makePathExpr,
    makeStructExpr,
    makeRangeExpr,
    makeRefExpr,
    makeDerefExpr,
    makeMacroExpr,
    makeClosureExpr,
    makeLetStmt,
    makeExprStmt,
    makeItemStmt,
    makeParam,
    makeFnItem,
    makeStructField,
    makeStructItem,
    makeEnumVariant,
    makeEnumItem,
    makeModItem,
    makeUseTree,
    makeUseItem,
    makeTraitItem,
    makeImplItem,
    makeIdentPat,
    makeWildcardPat,
    makeLiteralPat,
    makeRangePat,
    makeStructPat,
    makeTuplePat,
    makeSlicePat,
    makeOrPat,
    makeBindingPat,
    makeMatchArm,
    makeNamedType,
    makeTupleType,
    makeArrayType,
    makeRefType,
    makePtrType,
    makeFnType,
    makeGenericArgs,
    makeModule,
    type Span,
    BinaryOpValue,
} from "./ast";

type ParserState = { tokens: Token[]; pos: number; errors: ParseError[] };
type ParseError = {
    message: string;
    span: Span;
    expected: string[] | null;
    found: string | null;
};
type ParseResult = { ok: boolean; value: Node | null; errors: ParseError[] };

function createState(tokens: Token[]) {
    return { tokens, pos: 0, errors: [] };
}

function peek(state: ParserState, offset: number = 0): Token {
    return (
        state.tokens[state.pos + offset] ??
        state.tokens[state.tokens.length - 1]
    );
}

function advance(state: ParserState): Token {
    const token = peek(state);
    if (state.pos < state.tokens.length) {
        state.pos += 1;
    }
    return token;
}

function previous(state: ParserState): Token {
    if (state.pos - 1 >= 0) {
        return state.tokens[state.pos - 1];
    }
    return state.tokens[0] ?? peek(state);
}

function check(state: ParserState, type: number): boolean {
    return peek(state).type === type;
}

function isAtEnd(state: ParserState): boolean {
    return peek(state).type === TokenType.Eof;
}

function spanFromToken(token: Token): Span {
    const start = token.column;
    const end = token.column + (token.value ? token.value.length : 0);
    return makeSpan(token.line, token.column, start, end);
}

function mergeSpans(a: Span, b: Span): Span {
    return makeSpan(a.line, a.column, a.start, b.end);
}

function addError(
    state: ParserState,
    message: string,
    token: Token | null,
    expected: string[] | null = null,
): void {
    const span = token ? spanFromToken(token) : spanFromToken(peek(state));
    state.errors.push({
        message,
        span,
        expected,
        found: token ? (tokenNames[token.type] ?? null) : null,
    });
}

function matchToken(state: ParserState, type: number): Token | null {
    if (check(state, type)) {
        return advance(state);
    }
    return null;
}

function expectToken(state: ParserState, type: number, message: string) {
    if (check(state, type)) {
        return advance(state);
    }
    addError(state, message, peek(state), [tokenNames[type]]);
    return null;
}

function currentSpan(state: ParserState): Span {
    return spanFromToken(peek(state));
}

function skipToRecovery(state: ParserState, tokenTypes: number[]): void {
    while (!isAtEnd(state) && !tokenTypes.includes(peek(state).type)) {
        advance(state);
    }
}

function isIdentifierToken(token: Token): boolean {
    return token.type === TokenType.Identifier || token.type === TokenType.Self;
}

function isIdentifierValue(token: Token, value: string): boolean {
    return token.type === TokenType.Identifier && token.value === value;
}

function matchDouble(state: ParserState, type: number): Token | null {
    if (check(state, type) && peek(state, 1).type === type) {
        const first = advance(state);
        advance(state);
        return first;
    }
    return null;
}

function matchArrow(state: ParserState): Token | null {
    if (check(state, TokenType.Minus) && peek(state, 1).type === TokenType.Gt) {
        const token = advance(state);
        advance(state);
        return token;
    }
    return null;
}

function matchFatArrow(state: ParserState): Token | null {
    if (check(state, TokenType.FatArrow)) {
        return advance(state);
    }
    // Also support the old way for backwards compatibility
    if (check(state, TokenType.Eq) && peek(state, 1).type === TokenType.Gt) {
        const token = advance(state);
        advance(state);
        return token;
    }
    return null;
}

function matchInvalidSymbol(state: ParserState, symbol: string): Token | null {
    if (
        peek(state).type === TokenType.Invalid &&
        peek(state).value === symbol
    ) {
        return advance(state);
    }
    return null;
}

function parseOuterAttributes(state: ParserState): {
    derives: string[];
    isTest: boolean;
    expectedOutput: string | null;
    builtinName: string | null;
    consumedOnlyInert: boolean;
} {
    const derives: string[] = [];
    let isTest = false;
    let expectedOutput: string | null = null;
    let builtinName: string | null = null;
    let consumedAny = false;
    let consumedMeaningful = false;
    while (
        peek(state).type === TokenType.Invalid &&
        peek(state).value === "#" &&
        (peek(state, 1).type === TokenType.OpenSquare ||
            (peek(state, 1).type === TokenType.Bang &&
                peek(state, 2).type === TokenType.OpenSquare))
    ) {
        consumedAny = true;
        advance(state);
        const isInner = matchToken(state, TokenType.Bang) !== null;
        expectToken(state, TokenType.OpenSquare, "Expected [ after #");
        const attrName = peek(state);
        if (!isIdentifierToken(attrName)) {
            addError(state, "Expected attribute name", attrName, [
                "Identifier",
            ]);
            skipAttribute(state);
            continue;
        }
        const attrIdent = advance(state).value;
        if (isInner) {
            if (matchToken(state, TokenType.OpenParen)) {
                skipBalancedParens(state);
            }
            expectToken(
                state,
                TokenType.CloseSquare,
                "Expected ] after attribute",
            );
            continue;
        }
        if (attrIdent === "test") {
            isTest = true;
            consumedMeaningful = true;
            expectToken(
                state,
                TokenType.CloseSquare,
                "Expected ] after test attribute",
            );
            continue;
        }
        if (attrIdent === "expect_output") {
            consumedMeaningful = true;
            if (!matchToken(state, TokenType.OpenParen)) {
                addError(state, "Expected ( after expect_output", peek(state), [
                    "(",
                ]);
                skipAttribute(state);
                continue;
            }
            const valueToken = peek(state);
            if (
                valueToken.type === TokenType.String &&
                !valueToken.value.startsWith("'")
            ) {
                advance(state);
                expectedOutput = parseStringToken(valueToken);
            } else {
                addError(
                    state,
                    "Expected string literal in expect_output attribute",
                    valueToken,
                    ["String"],
                );
                if (
                    !check(state, TokenType.CloseParen) &&
                    !check(state, TokenType.CloseSquare) &&
                    !isAtEnd(state)
                ) {
                    advance(state);
                }
            }
            expectToken(
                state,
                TokenType.CloseParen,
                "Expected ) after expect_output argument",
            );
            expectToken(
                state,
                TokenType.CloseSquare,
                "Expected ] after expect_output attribute",
            );
            continue;
        }
        if (attrIdent === "derive") {
            consumedMeaningful = true;
            if (!matchToken(state, TokenType.OpenParen)) {
                addError(state, "Expected ( after derive", peek(state), ["("]);
                skipAttribute(state);
                continue;
            }
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                const nameToken = peek(state);
                if (!isIdentifierToken(nameToken)) {
                    addError(state, "Expected derive trait name", nameToken, [
                        "Identifier",
                    ]);
                    break;
                }
                derives.push(advance(state).value);
                if (!matchToken(state, TokenType.Comma)) break;
            }
            expectToken(
                state,
                TokenType.CloseParen,
                "Expected ) after derive list",
            );
            expectToken(
                state,
                TokenType.CloseSquare,
                "Expected ] after attribute",
            );
            continue;
        }
        if (attrIdent === "builtin") {
            consumedMeaningful = true;
            builtinName = "__attribute_builtin__";
            if (matchToken(state, TokenType.OpenParen)) {
                const keyToken = peek(state);
                if (!isIdentifierToken(keyToken) || keyToken.value !== "name") {
                    addError(
                        state,
                        'Expected builtin attribute argument `name = "..."`',
                        keyToken,
                        ["Identifier"],
                    );
                    skipBalancedParens(state);
                } else {
                    advance(state);
                    if (!matchToken(state, TokenType.Eq)) {
                        addError(
                            state,
                            "Expected = after builtin attribute name",
                            peek(state),
                            ["="],
                        );
                    }
                    const valueToken = peek(state);
                    if (
                        valueToken.type === TokenType.String &&
                        !valueToken.value.startsWith("'")
                    ) {
                        advance(state);
                        builtinName = parseStringToken(valueToken);
                    } else {
                        addError(
                            state,
                            "Expected string literal for builtin attribute name",
                            valueToken,
                            ["String"],
                        );
                    }
                    if (!check(state, TokenType.CloseParen)) {
                        skipBalancedParens(state);
                    } else {
                        expectToken(
                            state,
                            TokenType.CloseParen,
                            "Expected ) after builtin attribute",
                        );
                    }
                }
            }
            expectToken(
                state,
                TokenType.CloseSquare,
                "Expected ] after builtin attribute",
            );
            continue;
        }
        // Inert unknown attributes are accepted and ignored.
        if (matchToken(state, TokenType.OpenParen)) {
            skipBalancedParens(state);
        }
        expectToken(state, TokenType.CloseSquare, "Expected ] after attribute");
    }
    return {
        derives,
        isTest,
        expectedOutput,
        builtinName,
        consumedOnlyInert: consumedAny && !consumedMeaningful,
    };
}

function skipAttribute(state: ParserState) {
    let depth = 0;
    while (!isAtEnd(state)) {
        if (matchToken(state, TokenType.OpenSquare)) {
            depth += 1;
            continue;
        }
        if (matchToken(state, TokenType.CloseSquare)) {
            if (depth === 0) break;
            depth -= 1;
            continue;
        }
        advance(state);
    }
}

function skipBalancedParens(state: ParserState) {
    let depth = 1;
    while (!isAtEnd(state) && depth > 0) {
        if (matchToken(state, TokenType.OpenParen)) {
            depth += 1;
            continue;
        }
        if (matchToken(state, TokenType.CloseParen)) {
            depth -= 1;
            continue;
        }
        advance(state);
    }
}

function parseIntegerToken(token: Token): number {
    if (token.value.startsWith("0x") || token.value.startsWith("0X")) {
        return Number.parseInt(token.value.slice(2), 16);
    }
    if (token.value.startsWith("0o") || token.value.startsWith("0O")) {
        return Number.parseInt(token.value.slice(2), 8);
    }
    if (token.value.startsWith("0b") || token.value.startsWith("0B")) {
        return Number.parseInt(token.value.slice(2), 2);
    }
    return Number.parseInt(token.value, 10);
}

function parseFloatToken(token: Token): number {
    return Number.parseFloat(token.value);
}

function decodeEscapes(value: string): string {
    let result = "";
    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (ch !== "\\") {
            result += ch;
            continue;
        }
        const next = value[i + 1] ?? "";
        i += 1;
        if (next === "n") result += "\n";
        else if (next === "t") result += "\t";
        else if (next === "r") result += "\r";
        else if (next === "0") result += "\0";
        else if (next === "\\") result += "\\";
        else if (next === "'") result += "'";
        else if (next === '"') result += '"';
        else result += next;
    }
    return result;
}

function parseStringToken(token: Token): string {
    const raw = token.value;
    const inner = raw.length >= 2 ? raw.slice(1, -1) : "";
    return decodeEscapes(inner);
}

function parseCharToken(token: Token, state: ParserState): string {
    const value = parseStringToken(token);
    if (value.length !== 1) {
        addError(state, "Invalid char literal", token, null);
    }
    return value[0] ?? "";
}

function parseLiteralExpr(state: ParserState) {
    const token = peek(state);
    if (token.type === TokenType.Integer) {
        advance(state);
        const value = parseIntegerToken(token);
        return makeLiteralExpr(
            spanFromToken(token),
            LiteralKind.Int,
            value,
            token.value,
        );
    }
    if (token.type === TokenType.Float) {
        advance(state);
        const value = parseFloatToken(token);
        return makeLiteralExpr(
            spanFromToken(token),
            LiteralKind.Float,
            value,
            token.value,
        );
    }
    if (token.type === TokenType.String) {
        advance(state);
        if (token.value.startsWith("'")) {
            const value = parseCharToken(token, state);
            return makeLiteralExpr(
                spanFromToken(token),
                LiteralKind.Char,
                value,
                token.value,
            );
        }
        const value = parseStringToken(token);
        return makeLiteralExpr(
            spanFromToken(token),
            LiteralKind.String,
            value,
            token.value,
        );
    }
    if (token.type === TokenType.True || token.type === TokenType.False) {
        advance(state);
        return makeLiteralExpr(
            spanFromToken(token),
            LiteralKind.Bool,
            token.type === TokenType.True,
            token.value,
        );
    }
    return null;
}

function parsePathSegments(state: ParserState): string[] {
    const segments: string[] = [];
    const first = peek(state);
    if (!isIdentifierToken(first)) {
        addError(state, "Expected identifier", first, ["Identifier"]);
        return segments;
    }
    segments.push(advance(state).value);
    while (
        check(state, TokenType.Colon) &&
        peek(state, 1).type === TokenType.Colon
    ) {
        if (!isIdentifierToken(peek(state, 2))) {
            break;
        }
        advance(state);
        advance(state);
        const next = peek(state);
        if (!isIdentifierToken(next)) {
            addError(state, "Expected identifier segment", next, [
                "Identifier",
            ]);
            return segments;
        }
        segments.push(advance(state).value);
    }
    return segments;
}

function parsePathTypeNode(state: ParserState) {
    const start = peek(state);
    if (!isIdentifierToken(start)) {
        return null;
    }
    const segments = parsePathSegments(state);
    if (segments.length === 0) {
        return null;
    }
    const endToken = previous(state);
    let args: Node | undefined;
    if (matchToken(state, TokenType.Lt)) {
        const typeArgs: Node[] = [];
        while (!check(state, TokenType.Gt) && !isAtEnd(state)) {
            if (check(state, TokenType.Lifetime)) {
                advance(state);
            } else {
                const arg = parseType(state);
                if (arg) typeArgs.push(arg);
            }
            if (!matchToken(state, TokenType.Comma)) break;
        }
        const gtToken =
            expectToken(state, TokenType.Gt, "Expected > in generic args") ??
            endToken;
        args = makeGenericArgs(
            mergeSpans(spanFromToken(start), spanFromToken(gtToken)),
            typeArgs,
        );
    }
    return makeNamedType(
        mergeSpans(spanFromToken(start), spanFromToken(endToken)),
        segments.join("::"),
        args,
    );
}

/**
 * @param {ParserState} state
 * @returns {{ genericParams: { name: string, bounds: Node[] }[], ignoredLifetimeParams: string[] } | null}
 */
function parseGenericParamList(state: ParserState): {
    genericParams: { name: string; bounds: Node[] }[];
    ignoredLifetimeParams: string[];
} | null {
    if (!matchToken(state, TokenType.Lt)) {
        return null;
    }
    /** @type {{ name: string, bounds: Node[] }[]} */
    const genericParams: { name: string; bounds: Node[] }[] = [];
    /** @type {string[]} */
    const ignoredLifetimeParams: string[] = [];
    while (!check(state, TokenType.Gt) && !isAtEnd(state)) {
        if (check(state, TokenType.Lifetime)) {
            const lifetimeToken = advance(state);
            ignoredLifetimeParams.push(lifetimeToken.value ?? "");
            if (matchToken(state, TokenType.Colon)) {
                while (!isAtEnd(state)) {
                    if (
                        check(state, TokenType.Lifetime) ||
                        isIdentifierToken(peek(state))
                    ) {
                        advance(state);
                    } else {
                        break;
                    }
                    if (!matchToken(state, TokenType.Plus)) break;
                }
            }
            if (!matchToken(state, TokenType.Comma)) break;
            continue;
        }
        const paramToken =
            expectToken(
                state,
                TokenType.Identifier,
                "Expected generic parameter name",
            ) ?? peek(state);
        const name = paramToken.value ?? "";
        /** @type {Node[]} */
        const bounds: Node[] = [];
        if (matchToken(state, TokenType.Colon)) {
            while (!isAtEnd(state)) {
                const bound = parseTypeBound(state);
                if (bound) bounds.push(bound);
                if (!matchToken(state, TokenType.Plus)) break;
            }
        }
        genericParams.push({ name, bounds });
        if (!matchToken(state, TokenType.Comma)) break;
    }
    expectToken(state, TokenType.Gt, "Expected > after generic parameters");
    return { genericParams, ignoredLifetimeParams };
}

/**
 * @param {ParserState} state
 * @returns {{ name: string, bounds: Node[] }[] | null}
 */
function parseOptionalWhereClause(
    state: ParserState,
): { name: string; bounds: Node[] }[] | null {
    if (!matchToken(state, TokenType.Where)) {
        return null;
    }
    /** @type {{ name: string, bounds: Node[] }[]} */
    const whereClause: { name: string; bounds: Node[] }[] = [];
    while (
        !check(state, TokenType.OpenCurly) &&
        !check(state, TokenType.Semicolon) &&
        !isAtEnd(state)
    ) {
        const paramToken =
            expectToken(
                state,
                TokenType.Identifier,
                "Expected type parameter name in where clause",
            ) ?? peek(state);
        const name = paramToken.value ?? "";
        /** @type {Node[]} */
        const bounds: Node[] = [];
        if (matchToken(state, TokenType.Colon)) {
            while (!isAtEnd(state)) {
                const bound = parseTypeBound(state);
                if (bound) bounds.push(bound);
                if (!matchToken(state, TokenType.Plus)) break;
            }
        } else {
            addError(
                state,
                "Expected : in where clause predicate",
                peek(state),
                [":"],
            );
            break;
        }
        whereClause.push({ name, bounds });
        if (!matchToken(state, TokenType.Comma)) break;
    }
    return whereClause;
}

/**
 * Parse a generic/where bound and consume Rust function-trait bound tails
 * like `FnOnce(A, B) -> R` for syntax compatibility.
 * @param {ParserState} state
 * @returns {Node | null}
 */
function parseTypeBound(state: ParserState): Node | null {
    const bound = parsePathTypeNode(state) || parseType(state);
    if (
        !bound ||
        bound.kind !== NodeKind.NamedType ||
        !check(state, TokenType.OpenParen)
    ) {
        return bound;
    }
    const pathName = typeof bound.name === "string" ? bound.name : "";
    const tailName = pathName.includes("::")
        ? pathName.slice(pathName.lastIndexOf("::") + 2)
        : pathName;
    if (tailName !== "Fn" && tailName !== "FnMut" && tailName !== "FnOnce") {
        return bound;
    }

    expectToken(
        state,
        TokenType.OpenParen,
        "Expected ( in function trait bound",
    );
    if (!check(state, TokenType.CloseParen)) {
        while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
            parseType(state);
            if (!matchToken(state, TokenType.Comma)) break;
        }
    }
    expectToken(
        state,
        TokenType.CloseParen,
        "Expected ) in function trait bound",
    );
    if (matchArrow(state)) {
        parseType(state);
    }
    return bound;
}

/**
 * Parse `pub` and restricted `pub(...)` visibility for syntax compatibility.
 * Restriction details are intentionally discarded and mapped to boolean public.
 * @param {ParserState} state
 * @returns {boolean}
 */
function parseOptionalVisibility(state: ParserState): boolean {
    if (!matchToken(state, TokenType.Pub)) {
        return false;
    }
    if (!matchToken(state, TokenType.OpenParen)) {
        return true;
    }

    const first = peek(state);
    if (!isIdentifierToken(first)) {
        addError(state, "Expected visibility restriction in pub(...)", first, [
            "Identifier",
        ]);
    } else {
        advance(state);
        while (
            check(state, TokenType.Colon) &&
            peek(state, 1).type === TokenType.Colon
        ) {
            advance(state);
            advance(state);
            const next = peek(state);
            if (!isIdentifierToken(next)) {
                addError(
                    state,
                    "Expected identifier segment in pub(...)",
                    next,
                    ["Identifier"],
                );
                break;
            }
            advance(state);
        }
    }

    if (!matchToken(state, TokenType.CloseParen)) {
        addError(state, "Expected ) after pub(...)", peek(state), [")"]);
        skipToRecovery(state, [TokenType.CloseParen]);
        matchToken(state, TokenType.CloseParen);
    }
    return true;
}

/**
 * @param {ParserState} state
 * @param {Node} pathNode
 * @returns {Node}
 */
function parseStructExpr(state: ParserState, pathNode: Node): Node {
    const fields = [];
    let spread = null;
    expectToken(state, TokenType.OpenCurly, "Expected { in struct literal");
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        if (
            check(state, TokenType.Dot) &&
            peek(state, 1).type === TokenType.Dot
        ) {
            matchDouble(state, TokenType.Dot);
            spread = parseExpr(state, 0);
            if (!spread) {
                addError(
                    state,
                    "Expected expression after ..",
                    peek(state),
                    null,
                );
            }
            break;
        }
        const nameToken = peek(state);
        if (!isIdentifierToken(nameToken)) {
            addError(state, "Expected field name", nameToken, ["Identifier"]);
            skipToRecovery(state, [TokenType.Comma, TokenType.CloseCurly]);
            matchToken(state, TokenType.Comma);
            continue;
        }
        const name = advance(state).value;
        let value = null;
        if (matchToken(state, TokenType.Colon)) {
            value = parseExpr(state, 0);
        } else {
            value = makeIdentifierExpr(spanFromToken(nameToken), name);
        }
        if (value) {
            fields.push({ name, value });
        }
        matchToken(state, TokenType.Comma);
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseCurly,
            "Expected } after struct literal",
        ) ?? peek(state);
    return makeStructExpr(
        mergeSpans(pathNode.span, spanFromToken(endToken)),
        pathNode,
        fields,
        spread,
    );
}

/**
 * @param {ParserState} state
 * @param {boolean} [allowStructLiteral=true]
 * @returns {Node | null}
 */
function parseAtom(
    state: ParserState,
    allowStructLiteral: boolean = true,
): Node | null {
    const literal = parseLiteralExpr(state);
    if (literal) return literal;

    const token = peek(state);

    if (token.type === TokenType.OpenParen) {
        const startToken = advance(state);
        const elements = [];
        let hasComma = false;

        // Parse tuple or grouped expression
        if (!check(state, TokenType.CloseParen)) {
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                const elem = parseExpr(state, 0);
                if (elem) elements.push(elem);
                if (matchToken(state, TokenType.Comma)) {
                    hasComma = true;
                } else {
                    break;
                }
            }
        }

        const end =
            expectToken(state, TokenType.CloseParen, "Expected )") ??
            startToken;

        // Empty parens = unit literal
        if (elements.length === 0) {
            return makeLiteralExpr(
                mergeSpans(spanFromToken(startToken), spanFromToken(end)),
                LiteralKind.Int,
                0,
                "()",
            );
        }

        // Single element without comma = grouped expression
        if (elements.length === 1 && !hasComma) {
            elements[0].span = mergeSpans(
                spanFromToken(startToken),
                spanFromToken(end),
            );
            return elements[0];
        }

        // Multiple elements or trailing comma = tuple
        // For now, return as a struct expression (tuple is a struct with numeric fields)
        const span = mergeSpans(spanFromToken(startToken), spanFromToken(end));
        // Create a tuple as a struct with field names "0", "1", etc.
        const fields = elements.map((elem, i) => ({
            name: String(i),
            value: elem,
        }));
        const path = makePathExpr(span, ["()"]); // Unit type name for tuples
        return makeStructExpr(span, path, fields, null);
    }

    if (token.type === TokenType.OpenCurly) {
        return parseBlockExpr(state);
    }

    if (token.type === TokenType.If) {
        return parseIfExpr(state);
    }

    if (token.type === TokenType.Match) {
        return parseMatchExpr(state);
    }

    if (token.type === TokenType.Loop) {
        return parseLoopExpr(state);
    }

    if (token.type === TokenType.While) {
        return parseWhileExpr(state);
    }

    if (token.type === TokenType.For) {
        return parseForExpr(state);
    }

    if (token.type === TokenType.Return) {
        const start = advance(state);
        if (
            check(state, TokenType.Semicolon) ||
            check(state, TokenType.CloseCurly)
        ) {
            return makeReturnExpr(spanFromToken(start), null);
        }
        const value = parseExpr(state, 0);
        const span = value
            ? mergeSpans(spanFromToken(start), value.span)
            : spanFromToken(start);
        return makeReturnExpr(span, value);
    }

    if (token.type === TokenType.Identifier && token.value === "break") {
        const start = advance(state);
        if (
            check(state, TokenType.Semicolon) ||
            check(state, TokenType.CloseCurly)
        ) {
            return makeBreakExpr(spanFromToken(start), null);
        }
        const value = parseExpr(state, 0);
        const span = value
            ? mergeSpans(spanFromToken(start), value.span)
            : spanFromToken(start);
        return makeBreakExpr(span, value);
    }

    if (token.type === TokenType.Identifier && token.value === "continue") {
        const start = advance(state);
        return makeContinueExpr(spanFromToken(start));
    }

    if (isIdentifierToken(token)) {
        const startToken = token;
        const segments = parsePathSegments(state);
        const endToken = segments.length > 0 ? previous(state) : startToken;
        let node =
            segments.length > 1
                ? makePathExpr(
                      mergeSpans(
                          spanFromToken(startToken),
                          spanFromToken(endToken),
                      ),
                      segments,
                  )
                : makeIdentifierExpr(
                      spanFromToken(startToken),
                      segments[0] ?? startToken.value,
                  );
        if (allowStructLiteral && check(state, TokenType.OpenCurly)) {
            node = parseStructExpr(state, node);
        }
        return node;
    }

    addError(state, "Unexpected token", token, null);
    advance(state);
    return null;
}

/**
 * Parse macro invocation arguments
 * Macros use different delimiters: println!("..."), vec![...], macro!{...}
 */
function parseMacroArgs(state: ParserState): Node[] {
    const args: Node[] = [];

    // Determine the delimiter
    let endToken = TokenType.CloseParen;
    if (check(state, TokenType.OpenSquare)) {
        endToken = TokenType.CloseSquare;
    } else if (check(state, TokenType.OpenCurly)) {
        endToken = TokenType.CloseCurly;
    } else if (!check(state, TokenType.OpenParen)) {
        // No arguments
        return args;
    }

    // Consume opening delimiter
    advance(state);

    // Parse arguments
    if (!check(state, endToken)) {
        while (!check(state, endToken) && !isAtEnd(state)) {
            const arg = parseExpr(state, 0);
            if (arg) args.push(arg);
            if (
                endToken === TokenType.CloseSquare &&
                check(state, TokenType.Semicolon)
            ) {
                const semi = advance(state);
                addError(
                    state,
                    "Macro repeat form `[expr; count]` is not supported yet",
                    semi,
                    null,
                );
                const repeatCount = parseExpr(state, 0);
                if (repeatCount) args.push(repeatCount);
                while (!check(state, endToken) && !isAtEnd(state)) {
                    advance(state);
                }
                break;
            }
            if (!matchToken(state, TokenType.Comma)) break;
        }
    }

    // Consume closing delimiter
    expectToken(
        state,
        endToken,
        "Expected closing delimiter after macro arguments",
    );

    return args;
}

/**
 * @param {ParserState} state
 * @param {Node} expr
 * @returns {Node | null}
 */
function parsePostfix(state: ParserState, expr: Node): Node | null {
    let result = expr;
    /** @type {Node[] | null} */
    let pendingTypeArgs: Node[] | null = null;
    while (result) {
        if (
            check(state, TokenType.Dot) &&
            peek(state, 1).type === TokenType.Dot
        ) {
            return result;
        }
        if (check(state, TokenType.Invalid) && peek(state).value === "?") {
            // Parse-only compatibility: consume try-operator suffix.
            advance(state);
            continue;
        }
        // Handle macro invocation: identifier! followed by args
        if (matchToken(state, TokenType.Bang)) {
            // Check if this looks like a macro invocation (has delimiter after !)
            if (
                check(state, TokenType.OpenParen) ||
                check(state, TokenType.OpenSquare) ||
                check(state, TokenType.OpenCurly)
            ) {
                // Get macro name from the identifier expression
                let macroName = null;
                if (result.kind === 1) {
                    // NodeKind.IdentifierExpr
                    macroName = result.name;
                } else if (result.kind === 17) {
                    // NodeKind.PathExpr
                    // For paths, use the last segment
                    macroName = result.segments[result.segments.length - 1];
                }

                if (macroName) {
                    const args = parseMacroArgs(state);
                    const endToken = previous(state);
                    const span = mergeSpans(
                        result.span,
                        spanFromToken(endToken),
                    );
                    result = makeMacroExpr(span, macroName, args);
                    continue;
                }
            }
            // Not a macro invocation - put back the ! token
            state.pos -= 1;
            return result;
        }
        if (matchToken(state, TokenType.Dot)) {
            const fieldToken =
                expectToken(
                    state,
                    TokenType.Identifier,
                    "Expected field name",
                ) ?? peek(state);
            const field = fieldToken.value ?? "";
            const span = mergeSpans(result.span, spanFromToken(fieldToken));
            result = makeFieldExpr(span, result, field);
            continue;
        }
        if (matchToken(state, TokenType.OpenSquare)) {
            const indexExpr = parseExpr(state, 0);
            const endToken =
                expectToken(state, TokenType.CloseSquare, "Expected ]") ??
                peek(state);
            const span = indexExpr
                ? mergeSpans(result.span, spanFromToken(endToken))
                : mergeSpans(result.span, spanFromToken(endToken));
            result = makeIndexExpr(span, result, indexExpr ?? result);
            continue;
        }
        if (matchToken(state, TokenType.OpenParen)) {
            const args = [];
            if (!check(state, TokenType.CloseParen)) {
                while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                    const arg = parseExpr(state, 0);
                    if (arg) args.push(arg);
                    if (!matchToken(state, TokenType.Comma)) break;
                }
            }
            const endToken =
                expectToken(state, TokenType.CloseParen, "Expected )") ??
                peek(state);
            const span = mergeSpans(result.span, spanFromToken(endToken));
            result = makeCallExpr(span, result, args, pendingTypeArgs);
            pendingTypeArgs = null;
            continue;
        }
        if (
            check(state, TokenType.Colon) &&
            peek(state, 1).type === TokenType.Colon
        ) {
            advance(state);
            advance(state);
            if (!matchToken(state, TokenType.Lt)) {
                addError(
                    state,
                    "Expected <...> after :: for generic call arguments",
                    peek(state),
                    ["<"],
                );
                continue;
            }
            /** @type {Node[]} */
            const typeArgs: Node[] = [];
            while (!check(state, TokenType.Gt) && !isAtEnd(state)) {
                const typeArg = parseType(state);
                if (typeArg) typeArgs.push(typeArg);
                if (!matchToken(state, TokenType.Comma)) break;
            }
            expectToken(
                state,
                TokenType.Gt,
                "Expected > after generic call arguments",
            );
            pendingTypeArgs = typeArgs;
            if (!check(state, TokenType.OpenParen)) {
                addError(
                    state,
                    "Generic call arguments must be followed by function call parentheses",
                    peek(state),
                    ["("],
                );
                pendingTypeArgs = null;
            }
            continue;
        }
        break;
    }
    return result;
}

/**
 * @param {ParserState} state
 * @returns {Node | null}
 */
function parseClosureExpr(state: ParserState): Node | null {
    let isMove = false;
    let startToken = peek(state);
    if (isIdentifierValue(peek(state), "move")) {
        const next = peek(state, 1);
        if (next.type !== TokenType.Pipe && next.type !== TokenType.PipePipe) {
            return null;
        }
        startToken = advance(state);
        isMove = true;
    }

    const params = [];
    if (matchToken(state, TokenType.PipePipe)) {
        // No parameters.
    } else if (matchToken(state, TokenType.Pipe)) {
        while (!check(state, TokenType.Pipe) && !isAtEnd(state)) {
            const paramStart = peek(state);
            if (
                !isIdentifierToken(paramStart) &&
                !isIdentifierValue(paramStart, "_")
            ) {
                addError(state, "Expected closure parameter name", paramStart, [
                    "Identifier",
                ]);
                break;
            }

            const nameToken = advance(state);
            let ty = null;
            if (matchToken(state, TokenType.Colon)) {
                ty = parseType(state);
            }
            params.push(
                makeParam(
                    spanFromToken(nameToken),
                    nameToken.value ?? "_",
                    ty,
                    null,
                    false,
                    null,
                ),
            );

            if (!matchToken(state, TokenType.Comma)) {
                break;
            }
        }
        expectToken(
            state,
            TokenType.Pipe,
            "Expected | after closure parameters",
        );
    } else {
        return null;
    }

    let returnType = null;
    if (matchArrow(state)) {
        returnType = parseType(state);
    }

    let body = null;
    if (check(state, TokenType.OpenCurly)) {
        body = parseBlockExpr(state);
    } else {
        body = parseExpr(state, 0);
    }
    if (!body) {
        body = makeLiteralExpr(currentSpan(state), LiteralKind.Int, 0, "0");
    }

    const span = mergeSpans(spanFromToken(startToken), body.span);
    return makeClosureExpr(span, params, returnType, body, isMove);
}

/**
 * @param {ParserState} state
 * @param {boolean} [allowStructLiteral=true]
 * @returns {Node | null}
 */
function parsePrefix(
    state: ParserState,
    allowStructLiteral: boolean = true,
): Node | null {
    const token = peek(state);
    if (
        token.type === TokenType.PipePipe ||
        token.type === TokenType.Pipe ||
        (isIdentifierValue(token, "move") &&
            (peek(state, 1).type === TokenType.Pipe ||
                peek(state, 1).type === TokenType.PipePipe))
    ) {
        const closure = parseClosureExpr(state);
        if (closure) return closure;
    }
    if (token.type === TokenType.Bang) {
        advance(state);
        const operand = parsePrefix(state, allowStructLiteral);
        if (!operand) return null;
        const span = mergeSpans(spanFromToken(token), operand.span);
        return makeUnaryExpr(span, UnaryOp.Not, operand);
    }
    if (token.type === TokenType.Minus) {
        advance(state);
        const operand = parsePrefix(state, allowStructLiteral);
        if (!operand) return null;
        const span = mergeSpans(spanFromToken(token), operand.span);
        return makeUnaryExpr(span, UnaryOp.Neg, operand);
    }
    if (token.type === TokenType.Star) {
        advance(state);
        const operand = parsePrefix(state, allowStructLiteral);
        if (!operand) return null;
        const span = mergeSpans(spanFromToken(token), operand.span);
        return makeDerefExpr(span, operand);
    }
    if (token.type === TokenType.And) {
        advance(state);
        let mutability = Mutability.Immutable;
        if (
            check(state, TokenType.Mut) ||
            isIdentifierValue(peek(state), "mut")
        ) {
            advance(state);
            mutability = Mutability.Mutable;
        }
        const operand = parsePrefix(state, allowStructLiteral);
        if (!operand) return null;
        const span = mergeSpans(spanFromToken(token), operand.span);
        return makeRefExpr(span, mutability, operand);
    }
    const atom = parseAtom(state, allowStructLiteral);
    if (!atom) return null;
    return parsePostfix(state, atom);
}

type BinaryOpInfo = { prec: number; op: BinaryOpValue; assoc: string };

const binaryOps: Map<number, BinaryOpInfo> = new Map([
    [TokenType.PipePipe, { prec: 2, op: BinaryOp.Or, assoc: "left" }],
    [TokenType.AndAnd, { prec: 3, op: BinaryOp.And, assoc: "left" }],
    [TokenType.Pipe, { prec: 4, op: BinaryOp.BitOr, assoc: "left" }],
    [TokenType.Caret, { prec: 5, op: BinaryOp.BitXor, assoc: "left" }],
    [TokenType.And, { prec: 6, op: BinaryOp.BitAnd, assoc: "left" }],
    [TokenType.EqEq, { prec: 7, op: BinaryOp.Eq, assoc: "left" }],
    [TokenType.BangEq, { prec: 7, op: BinaryOp.Ne, assoc: "left" }],
    [TokenType.Lt, { prec: 8, op: BinaryOp.Lt, assoc: "left" }],
    [TokenType.LtEq, { prec: 8, op: BinaryOp.Le, assoc: "left" }],
    [TokenType.Gt, { prec: 8, op: BinaryOp.Gt, assoc: "left" }],
    [TokenType.GtEq, { prec: 8, op: BinaryOp.Ge, assoc: "left" }],
    [TokenType.Plus, { prec: 9, op: BinaryOp.Add, assoc: "left" }],
    [TokenType.Minus, { prec: 9, op: BinaryOp.Sub, assoc: "left" }],
    [TokenType.Star, { prec: 10, op: BinaryOp.Mul, assoc: "left" }],
    [TokenType.Slash, { prec: 10, op: BinaryOp.Div, assoc: "left" }],
    [TokenType.Percent, { prec: 10, op: BinaryOp.Rem, assoc: "left" }],
]);

/** @type {Map<number, BinaryOpValue>} */
const compoundAssignOps: Map<number, BinaryOpValue> = new Map([
    [TokenType.PlusEq, BinaryOp.Add],
    [TokenType.MinusEq, BinaryOp.Sub],
    [TokenType.StarEq, BinaryOp.Mul],
    [TokenType.SlashEq, BinaryOp.Div],
    [TokenType.PercentEq, BinaryOp.Rem],
    [TokenType.AndEq, BinaryOp.BitAnd],
    [TokenType.PipeEq, BinaryOp.BitOr],
    [TokenType.CaretEq, BinaryOp.BitXor],
]);

/**
 * @param {ParserState} state
 * @returns {{ token: Token, inclusive: boolean } | null}
 */
function parseRangeOperator(
    state: ParserState,
): { token: Token; inclusive: boolean } | null {
    if (check(state, TokenType.Dot) && peek(state, 1).type === TokenType.Dot) {
        const startToken = advance(state);
        advance(state);
        const inclusive = matchToken(state, TokenType.Eq) !== null;
        return { token: startToken, inclusive };
    }
    return null;
}

/**
 * @param {ParserState} state
 * @param {number} [minPrec=0]
 * @param {boolean} [allowStructLiteral=true]
 * @returns {Node | null}
 */
function parseExpr(
    state: ParserState,
    minPrec: number = 0,
    allowStructLiteral: boolean = true,
): Node | null {
    let left = parsePrefix(state, allowStructLiteral);
    if (!left) return null;
    while (true) {
        const rangeOp = parseRangeOperator(state);
        if (rangeOp) {
            const endExpr =
                check(state, TokenType.CloseParen) ||
                check(state, TokenType.CloseSquare) ||
                check(state, TokenType.CloseCurly) ||
                check(state, TokenType.Comma) ||
                check(state, TokenType.Semicolon) ||
                check(state, TokenType.Eof)
                    ? null
                    : parseExpr(state, 0, allowStructLiteral);
            const span = endExpr
                ? mergeSpans(left.span, endExpr.span)
                : mergeSpans(left.span, spanFromToken(rangeOp.token));
            left = makeRangeExpr(span, left, endExpr, rangeOp.inclusive);
            continue;
        }

        const compoundOp = compoundAssignOps.get(peek(state).type) ?? null;
        if (
            minPrec <= 1 &&
            (check(state, TokenType.Eq) || compoundOp !== null)
        ) {
            advance(state);
            const right = parseExpr(state, 1, allowStructLiteral);
            if (!right) return left;
            const value =
                compoundOp !== null
                    ? makeBinaryExpr(
                          mergeSpans(left.span, right.span),
                          compoundOp,
                          left,
                          right,
                      )
                    : right;
            const span = mergeSpans(left.span, right.span);
            left = makeAssignExpr(span, left, value);
            continue;
        }

        const opInfo = binaryOps.get(peek(state).type);
        if (!opInfo || opInfo.prec < minPrec) break;
        advance(state);
        const nextMinPrec =
            opInfo.assoc === "left" ? opInfo.prec + 1 : opInfo.prec;
        const right = parseExpr(state, nextMinPrec, allowStructLiteral);
        if (!right) return left;
        const span = mergeSpans(left.span, right.span);
        left = makeBinaryExpr(span, opInfo.op, left, right);
    }
    return left;
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseLetStmt(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.Let, "Expected let") ?? peek(state);
    const pat = parsePattern(state);
    let ty = null;
    let init = null;
    if (matchToken(state, TokenType.Colon)) {
        ty = parseType(state);
    }
    if (matchToken(state, TokenType.Eq)) {
        init = parseExpr(state, 0);
    }
    const endToken =
        expectToken(
            state,
            TokenType.Semicolon,
            "Expected ; after let statement",
        ) ?? peek(state);
    const span = pat
        ? mergeSpans(spanFromToken(start), spanFromToken(endToken))
        : spanFromToken(start);
    return makeLetStmt(
        span,
        pat ?? makeWildcardPat(spanFromToken(start)),
        ty,
        init,
    );
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseExprStmt(state: ParserState): Node {
    const expr = parseExpr(state, 0);
    const hasSemicolon = matchToken(state, TokenType.Semicolon) !== null;
    const span = expr ? mergeSpans(expr.span, expr.span) : currentSpan(state);
    return makeExprStmt(
        span,
        expr ?? makeLiteralExpr(span, LiteralKind.Int, 0, "0"),
        hasSemicolon,
    );
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseStmt(state: ParserState): Node {
    if (check(state, TokenType.Let)) {
        return parseLetStmt(state);
    }
    if (
        (peek(state).type === TokenType.Invalid && peek(state).value === "#") ||
        check(state, TokenType.Pub) ||
        check(state, TokenType.Fn) ||
        check(state, TokenType.Struct) ||
        check(state, TokenType.Enum) ||
        check(state, TokenType.Trait) ||
        check(state, TokenType.Mod) ||
        check(state, TokenType.Use) ||
        check(state, TokenType.Impl) ||
        check(state, TokenType.Unsafe)
    ) {
        const beforePos = state.pos;
        const beforeErrors = state.errors.length;
        const item = parseItem(state);
        if (item) {
            return makeItemStmt(item.span, item);
        }
        if (state.pos === beforePos || state.errors.length > beforeErrors) {
            const span = currentSpan(state);
            return makeItemStmt(span, makeModule(span, "error", []));
        }
        // Inert attributes consumed with no item; parse the next statement.
        return parseStmt(state);
    }
    return parseExprStmt(state);
}

/**
 * @param {ParserState} state
 * @param {{ allowReceiver?: boolean }} [options]
 * @returns {Node[]}
 */
function parseParamList(
    state: ParserState,
    options: { allowReceiver?: boolean } = {},
): Node[] {
    const { allowReceiver = false } = options;
    const params = [];
    expectToken(state, TokenType.OpenParen, "Expected ( in parameter list");
    if (!check(state, TokenType.CloseParen)) {
        let paramIndex = 0;
        while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
            const startToken = peek(state);
            let name = null;
            let ty = null;
            let isReceiver = false;
            /** @type {"value" | "ref" | "ref_mut" | null} */
            let receiverKind: "value" | "ref" | "ref_mut" | null = null;

            const canBeReceiver =
                allowReceiver &&
                paramIndex === 0 &&
                (startToken.type === TokenType.Self ||
                    (startToken.type === TokenType.And &&
                        (peek(state, 1).type === TokenType.Self ||
                            (peek(state, 1).type === TokenType.Mut &&
                                peek(state, 2).type === TokenType.Self))));
            if (canBeReceiver) {
                if (matchToken(state, TokenType.And)) {
                    if (matchToken(state, TokenType.Mut)) {
                        expectToken(
                            state,
                            TokenType.Self,
                            "Expected self in receiver parameter",
                        );
                        receiverKind = "ref_mut";
                        ty = makeRefType(
                            spanFromToken(startToken),
                            Mutability.Mutable,
                            makeNamedType(
                                spanFromToken(startToken),
                                "Self",
                                null,
                            ),
                        );
                    } else {
                        expectToken(
                            state,
                            TokenType.Self,
                            "Expected self in receiver parameter",
                        );
                        receiverKind = "ref";
                        ty = makeRefType(
                            spanFromToken(startToken),
                            Mutability.Immutable,
                            makeNamedType(
                                spanFromToken(startToken),
                                "Self",
                                null,
                            ),
                        );
                    }
                } else {
                    expectToken(
                        state,
                        TokenType.Self,
                        "Expected self receiver parameter",
                    );
                    receiverKind = "value";
                    ty = makeNamedType(spanFromToken(startToken), "Self", null);
                }
                isReceiver = true;
                name = "self";
            } else {
                if (
                    startToken.type === TokenType.Self ||
                    startToken.type === TokenType.And
                ) {
                    addError(
                        state,
                        "Receiver parameter is only allowed as the first method parameter",
                        startToken,
                        null,
                    );
                    if (startToken.type === TokenType.Self) {
                        name = advance(state).value;
                    } else {
                        advance(state);
                        if (check(state, TokenType.Mut)) {
                            advance(state);
                        }
                        if (check(state, TokenType.Self)) {
                            advance(state);
                            name = "self";
                        }
                    }
                }
                if (!name && isIdentifierToken(startToken)) {
                    name = advance(state).value;
                }
                if (matchToken(state, TokenType.Colon)) {
                    ty = parseType(state);
                }
            }

            const span = startToken
                ? spanFromToken(startToken)
                : currentSpan(state);
            params.push(
                makeParam(span, name, ty, null, isReceiver, receiverKind),
            );
            paramIndex += 1;
            if (!matchToken(state, TokenType.Comma)) break;
        }
    }
    expectToken(state, TokenType.CloseParen, "Expected ) after parameters");
    return params;
}

/**
 * @param {ParserState} state
 * @param {boolean} isUnsafe
 * @param {boolean} isPub
 * @param {boolean} [isConst=false]
 * @param {boolean} [allowReceiver=false]
 * @returns {Node}
 */
function parseFnItem(
    state: ParserState,
    isUnsafe: boolean,
    isPub: boolean,
    isConst: boolean = false,
    allowReceiver: boolean = false,
): Node {
    const start =
        expectToken(state, TokenType.Fn, "Expected fn") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected function name") ??
        peek(state);
    const genericList = parseGenericParamList(state);
    const genericParams = genericList ? genericList.genericParams : null;
    const ignoredLifetimeParams = genericList
        ? genericList.ignoredLifetimeParams
        : [];
    const generics = genericParams
        ? genericParams.map(
              (/** @type {{ name: string }} */ p: { name: string }) => p.name,
          )
        : null;
    const params = parseParamList(state, { allowReceiver });
    let returnType = null;
    if (matchArrow(state)) {
        returnType = parseType(state);
    }
    const whereClause = parseOptionalWhereClause(state);
    let body = null;
    if (check(state, TokenType.OpenCurly)) {
        body = parseBlockExpr(state);
    } else if (matchToken(state, TokenType.Semicolon)) {
        body = null;
    } else {
        addError(state, "Expected function body", peek(state), null);
    }
    const endSpan = body ? body.span : spanFromToken(nameToken);
    const span = mergeSpans(spanFromToken(start), endSpan);
    return makeFnItem(
        span,
        nameToken.value ?? "",
        generics,
        params,
        returnType,
        body,
        false, // isAsync
        isUnsafe,
        isConst,
        isPub,
        genericParams,
        whereClause,
        ignoredLifetimeParams,
        false, // isTest
        null, // expectedOutput
    );
}

/**
 * @param {ParserState} state
 * @param {boolean} isPub
 * @returns {Node}
 */
function parseStructItem(state: ParserState, isPub: boolean): Node {
    const start =
        expectToken(state, TokenType.Struct, "Expected struct") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected struct name") ??
        peek(state);
    const genericList = parseGenericParamList(state);
    const genericParams = genericList ? genericList.genericParams : null;
    const ignoredLifetimeParams = genericList
        ? genericList.ignoredLifetimeParams
        : [];
    const generics = genericParams
        ? genericParams.map(
              (/** @type {{ name: string }} */ p: { name: string }) => p.name,
          )
        : null;
    const fields = [];
    let isTuple = false;
    if (matchToken(state, TokenType.OpenCurly)) {
        while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
            const fieldIsPub = parseOptionalVisibility(state);
            const fieldNameToken =
                expectToken(
                    state,
                    TokenType.Identifier,
                    "Expected field name",
                ) ?? peek(state);
            let ty = null;
            let defaultValue = null;
            if (matchToken(state, TokenType.Colon)) {
                ty = parseType(state);
            }
            if (matchToken(state, TokenType.Eq)) {
                defaultValue = parseExpr(state, 0);
            }
            fields.push(
                makeStructField(
                    spanFromToken(fieldNameToken),
                    fieldNameToken.value ?? "",
                    ty,
                    defaultValue,
                    fieldIsPub,
                ),
            );
            if (!matchToken(state, TokenType.Comma)) break;
        }
        expectToken(
            state,
            TokenType.CloseCurly,
            "Expected } after struct body",
        );
    } else if (matchToken(state, TokenType.OpenParen)) {
        isTuple = true;
        if (!check(state, TokenType.CloseParen)) {
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                const ty = parseType(state);
                const span = ty ? ty.span : currentSpan(state);
                fields.push(makeStructField(span, "", ty, null));
                if (!matchToken(state, TokenType.Comma)) break;
            }
        }
        expectToken(
            state,
            TokenType.CloseParen,
            "Expected ) after tuple struct",
        );
        matchToken(state, TokenType.Semicolon);
    } else {
        matchToken(state, TokenType.Semicolon);
    }
    const endSpan =
        fields.length > 0
            ? fields[fields.length - 1].span
            : spanFromToken(nameToken);
    const span = mergeSpans(spanFromToken(start), endSpan);
    return makeStructItem(
        span,
        nameToken.value ?? "",
        generics,
        fields,
        isTuple,
        isPub,
        ignoredLifetimeParams,
    );
}

/**
 * @param {ParserState} state
 * @param {boolean} isUnsafe
 * @param {boolean} isPub
 * @returns {Node}
 */
function parseTraitItem(
    state: ParserState,
    isUnsafe: boolean,
    isPub: boolean,
): Node {
    const start =
        expectToken(state, TokenType.Trait, "Expected trait") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected trait name") ??
        peek(state);
    const methods = [];
    expectToken(state, TokenType.OpenCurly, "Expected { after trait name");
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        parseOuterAttributes(state);
        let methodIsConst = false;
        if (matchToken(state, TokenType.Const)) {
            methodIsConst = true;
        }
        if (check(state, TokenType.Fn)) {
            const method = parseFnItem(
                state,
                false,
                false,
                methodIsConst,
                true,
            );
            if (method.body) {
                addError(
                    state,
                    "Default trait methods are not supported in this compiler model",
                    previous(state),
                    null,
                );
            }
            methods.push({
                ...method,
                body: null,
            });
            continue;
        }
        addError(
            state,
            "Only method signatures are supported in trait declarations",
            peek(state),
            null,
        );
        skipToRecovery(state, [TokenType.CloseCurly, TokenType.Fn]);
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseCurly,
            "Expected } after trait block",
        ) ?? peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeTraitItem(span, nameToken.value ?? "", methods, isUnsafe, isPub);
}

/**
 * @param {ParserState} state
 * @param {boolean} isUnsafe
 * @returns {Node}
 */
function parseImplItem(state: ParserState, isUnsafe: boolean): Node {
    const start =
        expectToken(state, TokenType.Impl, "Expected impl") ?? peek(state);
    const genericList = parseGenericParamList(state);
    const genericParams = genericList ? genericList.genericParams : null;
    const ignoredLifetimeParams = genericList
        ? genericList.ignoredLifetimeParams
        : [];
    const firstType = parseType(state);
    /** @type {Node | null} */
    let traitType: Node | null = null;
    /** @type {Node | null} */
    let targetType: Node | null = firstType;
    if (matchToken(state, TokenType.For)) {
        traitType = firstType;
        targetType = parseType(state);
    }
    const methods = [];
    expectToken(state, TokenType.OpenCurly, "Expected { after impl target");
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        parseOuterAttributes(state);
        let methodIsPub = false;
        let methodIsUnsafe = false;
        let methodIsConst = false;
        if (parseOptionalVisibility(state)) methodIsPub = true;
        if (matchToken(state, TokenType.Unsafe)) methodIsUnsafe = true;
        if (matchToken(state, TokenType.Const)) methodIsConst = true;
        if (check(state, TokenType.Fn)) {
            const method = parseFnItem(
                state,
                methodIsUnsafe,
                methodIsPub,
                methodIsConst,
                true,
            );
            methods.push(method);
            continue;
        }
        addError(
            state,
            "Expected method item in impl block",
            peek(state),
            null,
        );
        skipToRecovery(state, [
            TokenType.CloseCurly,
            TokenType.Fn,
            TokenType.Pub,
            TokenType.Unsafe,
            TokenType.Const,
        ]);
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseCurly,
            "Expected } after impl block",
        ) ?? peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeImplItem(
        span,
        targetType ?? makeNamedType(spanFromToken(start), "unknown", null),
        traitType,
        methods,
        isUnsafe,
        genericParams,
        ignoredLifetimeParams,
    );
}

/**
 * @param {ParserState} state
 * @param {boolean} isPub
 * @returns {Node}
 */
function parseEnumItem(state: ParserState, isPub: boolean): Node {
    const start =
        expectToken(state, TokenType.Enum, "Expected enum") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected enum name") ??
        peek(state);
    const genericList = parseGenericParamList(state);
    const genericParams = genericList ? genericList.genericParams : null;
    const ignoredLifetimeParams = genericList
        ? genericList.ignoredLifetimeParams
        : [];
    const generics = genericParams
        ? genericParams.map(
              (/** @type {{ name: string }} */ p: { name: string }) => p.name,
          )
        : null;
    const variants = [];
    expectToken(state, TokenType.OpenCurly, "Expected { after enum name");
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        const variantNameToken =
            expectToken(state, TokenType.Identifier, "Expected variant name") ??
            peek(state);
        const fields = [];
        if (matchToken(state, TokenType.OpenParen)) {
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                const ty = parseType(state);
                const span = ty ? ty.span : currentSpan(state);
                fields.push(makeStructField(span, "", ty, null));
                if (!matchToken(state, TokenType.Comma)) break;
            }
            expectToken(
                state,
                TokenType.CloseParen,
                "Expected ) after variant fields",
            );
        } else if (matchToken(state, TokenType.OpenCurly)) {
            while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
                const fieldNameToken =
                    expectToken(
                        state,
                        TokenType.Identifier,
                        "Expected field name",
                    ) ?? peek(state);
                /** @type {Node | null} */
                let ty: Node | null = null;
                if (matchToken(state, TokenType.Colon)) {
                    ty = parseType(state);
                }
                fields.push(
                    makeStructField(
                        spanFromToken(fieldNameToken),
                        fieldNameToken.value ?? "",
                        ty,
                        null,
                    ),
                );
                if (!matchToken(state, TokenType.Comma)) break;
            }
            expectToken(
                state,
                TokenType.CloseCurly,
                "Expected } after variant fields",
            );
        }
        /** @type {Node | null} */
        let discriminant: Node | null = null;
        if (matchToken(state, TokenType.Eq)) {
            discriminant = parseExpr(state, 0);
        }
        const span = mergeSpans(
            spanFromToken(variantNameToken),
            discriminant ? discriminant.span : spanFromToken(variantNameToken),
        );
        variants.push(
            makeEnumVariant(
                span,
                variantNameToken.value ?? "",
                fields,
                discriminant,
            ),
        );
        matchToken(state, TokenType.Comma);
    }
    const endToken =
        expectToken(state, TokenType.CloseCurly, "Expected } after enum") ??
        peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeEnumItem(
        span,
        nameToken.value ?? "",
        generics,
        variants,
        isPub,
        ignoredLifetimeParams,
    );
}

/**
 * @param {ParserState} state
 * @param {boolean} isPub
 * @returns {Node}
 */
function parseModItem(state: ParserState, isPub: boolean): Node {
    const start =
        expectToken(state, TokenType.Mod, "Expected mod") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected module name") ??
        peek(state);
    /** @type {Node[]} */
    let items: Node[] = [];
    let isInline = false;
    if (matchToken(state, TokenType.OpenCurly)) {
        isInline = true;
        while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
            const item = parseItem(state);
            if (item) items.push(item);
            else
                skipToRecovery(state, [
                    TokenType.CloseCurly,
                    TokenType.Fn,
                    TokenType.Struct,
                    TokenType.Enum,
                    TokenType.Trait,
                    TokenType.Mod,
                    TokenType.Use,
                    TokenType.Impl,
                ]);
        }
        expectToken(state, TokenType.CloseCurly, "Expected } after module");
    } else {
        expectToken(state, TokenType.Semicolon, "Expected ; after module");
    }
    const endSpan =
        items.length > 0
            ? items[items.length - 1].span
            : spanFromToken(nameToken);
    const span = mergeSpans(spanFromToken(start), endSpan);
    return makeModItem(span, nameToken.value ?? "", items, isInline, isPub);
}

/**
 * @param {ParserState} state
 * @returns {{ path: string[], hasWildcard: boolean }}
 */
function parseUsePath(state: ParserState): {
    path: string[];
    hasWildcard: boolean;
} {
    /** @type {string[]} */
    const path: string[] = [];
    let hasWildcard = false;
    const first = peek(state);
    if (!isIdentifierToken(first)) {
        addError(state, "Expected identifier", first, ["Identifier"]);
        return { path, hasWildcard };
    }
    path.push(advance(state).value);
    while (
        check(state, TokenType.Colon) &&
        peek(state, 1).type === TokenType.Colon
    ) {
        advance(state);
        advance(state);
        const next = peek(state);
        if (next.type === TokenType.Star) {
            hasWildcard = true;
            addError(
                state,
                "Wildcard imports are not supported yet",
                next,
                null,
            );
            advance(state);
            break;
        }
        // Stop if we encounter a grouped import { ... }
        if (next.type === TokenType.OpenCurly) {
            break;
        }
        if (!isIdentifierToken(next)) {
            addError(state, "Expected identifier segment", next, [
                "Identifier",
            ]);
            return { path, hasWildcard };
        }
        path.push(advance(state).value);
    }
    return { path, hasWildcard };
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseUseTree(state: ParserState): Node {
    const startToken = peek(state);
    /** @type {string[]} */
    let path: string[] = [];
    let hasWildcard = false;
    const startsWithGroup = check(state, TokenType.OpenCurly);
    if (!startsWithGroup) {
        const parsed = parseUsePath(state);
        path = parsed.path;
        hasWildcard = parsed.hasWildcard;
    }
    /** @type {string | null} */
    let alias: string | null = null;
    if (!startsWithGroup && isIdentifierValue(peek(state), "as")) {
        advance(state);
        const aliasToken =
            expectToken(state, TokenType.Identifier, "Expected alias name") ??
            peek(state);
        alias = aliasToken.value ?? null;
    }
    /** @type {Node[] | null} */
    let children: Node[] | null = null;
    if (matchToken(state, TokenType.OpenCurly)) {
        children = [];
        if (!check(state, TokenType.CloseCurly)) {
            while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
                const child = parseUseTree(state);
                if (child) children.push(child);
                if (!matchToken(state, TokenType.Comma)) break;
            }
        }
        expectToken(state, TokenType.CloseCurly, "Expected } in use tree");
    }
    if (hasWildcard && children !== null) {
        addError(
            state,
            "Cannot combine wildcard and grouped imports",
            peek(state),
            null,
        );
    }
    const endToken = previous(state);
    const span = mergeSpans(spanFromToken(startToken), spanFromToken(endToken));
    return makeUseTree(span, path, alias, children);
}

/**
 * @param {ParserState} state
 * @param {boolean} isPub
 * @returns {Node}
 */
function parseUseItem(state: ParserState, isPub: boolean): Node {
    const start =
        expectToken(state, TokenType.Use, "Expected use") ?? peek(state);
    const tree = parseUseTree(state);
    const endToken =
        expectToken(state, TokenType.Semicolon, "Expected ; after use") ??
        peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeUseItem(span, tree, isPub);
}

/**
 * @param {ParserState} state
 * @returns {Node | null}
 */
function parseItem(state: ParserState): Node | null {
    const { derives, isTest, expectedOutput, builtinName, consumedOnlyInert } =
        parseOuterAttributes(state);
    let isPub = false;
    let isUnsafe = false;
    let isConst = false;
    isPub = parseOptionalVisibility(state);
    if (matchToken(state, TokenType.Unsafe)) {
        isUnsafe = true;
    }
    if (matchToken(state, TokenType.Const)) {
        if (check(state, TokenType.Fn)) {
            isConst = true;
        } else {
            addError(state, "Expected `fn` after `const`", peek(state), ["Fn"]);
            return null;
        }
    }
    /** @type {Node | null} */
    let item: Node | null = null;
    if (check(state, TokenType.Fn))
        item = parseFnItem(state, isUnsafe, isPub, isConst);
    else if (check(state, TokenType.Struct))
        item = parseStructItem(state, isPub);
    else if (check(state, TokenType.Enum)) item = parseEnumItem(state, isPub);
    else if (check(state, TokenType.Trait))
        item = parseTraitItem(state, isUnsafe, isPub);
    else if (check(state, TokenType.Mod)) item = parseModItem(state, isPub);
    else if (check(state, TokenType.Use)) item = parseUseItem(state, isPub);
    else if (check(state, TokenType.Impl))
        item = parseImplItem(state, isUnsafe);
    if (item) {
        item.derives = derives;
        if (item.kind === NodeKind.FnItem) {
            if (isTest) {
                item.isTest = true;
            }
            if (expectedOutput !== null) {
                item.expectedOutput = expectedOutput;
            }
            if (builtinName !== null) {
                item.isBuiltin = true;
                item.builtinName =
                    builtinName === "__attribute_builtin__"
                        ? item.name
                        : builtinName;
            }
        } else if (builtinName !== null) {
            addError(
                state,
                "#[builtin(...)] is only valid on function items",
                peek(state),
                null,
            );
        } else if (expectedOutput !== null) {
            addError(
                state,
                "#[expect_output(...)] is only valid on function items",
                peek(state),
                null,
            );
        }
        return item;
    }
    if (consumedOnlyInert) {
        return null;
    }
    addError(state, "Expected item", peek(state), null);
    return null;
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parsePattern(state: ParserState): Node {
    const alternatives = [];
    const first = parsePatternAtom(state);
    if (first) alternatives.push(first);
    while (matchToken(state, TokenType.Pipe)) {
        const next = parsePatternAtom(state);
        if (next) alternatives.push(next);
    }
    if (alternatives.length === 1) return alternatives[0];
    const span = mergeSpans(
        alternatives[0].span,
        alternatives[alternatives.length - 1].span,
    );
    return makeOrPat(span, alternatives);
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parsePatternAtom(state: ParserState): Node {
    const token = peek(state);
    if (token.type === TokenType.Identifier && token.value === "_") {
        advance(state);
        return makeWildcardPat(spanFromToken(token));
    }
    // Handle `mut` keyword for mutable patterns
    if (token.type === TokenType.Mut) {
        const mutToken = advance(state);
        const nameToken = peek(state);
        if (isIdentifierToken(nameToken)) {
            const name = advance(state).value;
            return makeIdentPat(
                mergeSpans(spanFromToken(mutToken), spanFromToken(nameToken)),
                name,
                Mutability.Mutable,
                false,
                null,
            );
        }
        // If `mut` is not followed by an identifier, treat it as an error
        addError(state, "Expected identifier after `mut`", nameToken, [
            "Identifier",
        ]);
        return makeWildcardPat(spanFromToken(mutToken));
    }
    if (token.type === TokenType.Identifier || token.type === TokenType.Self) {
        const startToken = token;
        const segments = parsePathSegments(state);
        const name = segments[segments.length - 1];

        // Check if this is a qualified path (e.g., Color::Red)
        if (segments.length > 1) {
            // This is a qualified path like Color::Red - could be enum variant or struct
            const endToken = previous(state);
            const path = makePathExpr(
                mergeSpans(spanFromToken(startToken), spanFromToken(endToken)),
                segments,
            );
            if (check(state, TokenType.OpenCurly)) {
                return parseStructPattern(state, path, startToken);
            }
            if (check(state, TokenType.OpenParen)) {
                return parseEnumTupleVariantPattern(state, path, startToken);
            }
            return makeStructPat(path.span, path, [], false);
        }

        if (matchInvalidSymbol(state, "@")) {
            const inner = parsePattern(state);
            const span = inner
                ? mergeSpans(spanFromToken(startToken), inner.span)
                : spanFromToken(startToken);
            return makeBindingPat(
                span,
                name,
                inner ?? makeWildcardPat(spanFromToken(startToken)),
            );
        }
        if (check(state, TokenType.OpenCurly)) {
            const path = makePathExpr(spanFromToken(startToken), [name]);
            return parseStructPattern(state, path, startToken);
        }
        if (check(state, TokenType.OpenParen)) {
            return parseTuplePattern(state, startToken, name);
        }
        return makeIdentPat(
            spanFromToken(startToken),
            name,
            Mutability.Immutable,
            false,
            null,
        );
    }
    if (token.type === TokenType.OpenParen) {
        return parseTuplePattern(state, token, null);
    }
    if (token.type === TokenType.OpenSquare) {
        return parseSlicePattern(state);
    }
    const literal = parseLiteralPat(state);
    if (literal) {
        if (
            check(state, TokenType.Dot) &&
            peek(state, 1).type === TokenType.Dot
        ) {
            matchDouble(state, TokenType.Dot);
            const inclusive = matchToken(state, TokenType.Eq) !== null;
            const end = parseLiteralPat(state);
            if (!end) {
                addError(
                    state,
                    "Expected end of range pattern",
                    peek(state),
                    null,
                );
                return literal;
            }
            const span = mergeSpans(literal.span, end.span);
            return makeRangePat(span, literal, end, inclusive);
        }
        return literal;
    }
    addError(state, "Expected pattern", token, null);
    advance(state);
    return makeWildcardPat(spanFromToken(token));
}

/**
 * @param {ParserState} state
 * @returns {Node | null}
 */
function parseLiteralPat(state: ParserState): Node | null {
    const token = peek(state);
    if (token.type === TokenType.Integer) {
        advance(state);
        const value = parseIntegerToken(token);
        return makeLiteralPat(spanFromToken(token), LiteralKind.Int, value);
    }
    if (token.type === TokenType.Float) {
        advance(state);
        const value = parseFloatToken(token);
        return makeLiteralPat(spanFromToken(token), LiteralKind.Float, value);
    }
    if (token.type === TokenType.String) {
        advance(state);
        if (token.value.startsWith("'")) {
            const value = parseCharToken(token, state);
            return makeLiteralPat(
                spanFromToken(token),
                LiteralKind.Char,
                value,
            );
        }
        const value = parseStringToken(token);
        return makeLiteralPat(spanFromToken(token), LiteralKind.String, value);
    }
    if (token.type === TokenType.True || token.type === TokenType.False) {
        advance(state);
        return makeLiteralPat(
            spanFromToken(token),
            LiteralKind.Bool,
            token.type === TokenType.True,
        );
    }
    return null;
}

/**
 * @param {ParserState} state
 * @param {Node} path
 * @param {Token} startToken
 * @returns {Node}
 */
function parseStructPattern(
    state: ParserState,
    path: Node,
    startToken: Token,
): Node {
    const fields = [];
    let rest = false;
    expectToken(state, TokenType.OpenCurly, "Expected { in struct pattern");
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        if (
            check(state, TokenType.Dot) &&
            peek(state, 1).type === TokenType.Dot
        ) {
            matchDouble(state, TokenType.Dot);
            rest = true;
            break;
        }
        const fieldNameToken =
            expectToken(state, TokenType.Identifier, "Expected field name") ??
            peek(state);
        /** @type {Node | null} */
        let pat: Node | null = null;
        if (matchToken(state, TokenType.Colon)) {
            pat = parsePattern(state);
        } else {
            pat = makeIdentPat(
                spanFromToken(fieldNameToken),
                fieldNameToken.value ?? "",
                Mutability.Immutable,
                false,
                null,
            );
        }
        fields.push({ name: fieldNameToken.value ?? "", pat });
        if (!matchToken(state, TokenType.Comma)) break;
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseCurly,
            "Expected } after struct pattern",
        ) ?? peek(state);
    const span = mergeSpans(spanFromToken(startToken), spanFromToken(endToken));
    return makeStructPat(span, path, fields, rest);
}

/**
 * @param {ParserState} state
 * @param {Node} path
 * @param {Token} startToken
 * @returns {Node}
 */
function parseEnumTupleVariantPattern(
    state: ParserState,
    path: Node,
    startToken: Token,
): Node {
    const elements = [];
    expectToken(
        state,
        TokenType.OpenParen,
        "Expected ( in enum variant pattern",
    );
    if (!check(state, TokenType.CloseParen)) {
        while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
            const pat = parsePattern(state);
            if (pat) elements.push(pat);
            if (!matchToken(state, TokenType.Comma)) break;
        }
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseParen,
            "Expected ) in enum variant pattern",
        ) ?? peek(state);
    const fields = elements.map((pat, i) => ({ name: String(i), pat }));
    const span = mergeSpans(spanFromToken(startToken), spanFromToken(endToken));
    return makeStructPat(span, path, fields, false);
}

/**
 * @param {ParserState} state
 * @param {Token} startToken
 * @param {string | null} name
 * @returns {Node}
 */
function parseTuplePattern(
    state: ParserState,
    startToken: Token,
    name: string | null,
): Node {
    const elements = [];
    expectToken(state, TokenType.OpenParen, "Expected ( in tuple pattern");
    let hasComma = false;
    if (!check(state, TokenType.CloseParen)) {
        while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
            const pat = parsePattern(state);
            if (pat) elements.push(pat);
            if (matchToken(state, TokenType.Comma)) {
                hasComma = true;
            } else {
                break;
            }
        }
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseParen,
            "Expected ) in tuple pattern",
        ) ?? peek(state);
    if (!hasComma && elements.length === 1 && name) {
        return makeIdentPat(
            spanFromToken(startToken),
            name,
            Mutability.Immutable,
            false,
            null,
        );
    }
    const span = mergeSpans(spanFromToken(startToken), spanFromToken(endToken));
    return makeTuplePat(span, elements);
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseSlicePattern(state: ParserState): Node {
    const startToken =
        expectToken(
            state,
            TokenType.OpenSquare,
            "Expected [ in slice pattern",
        ) ?? peek(state);
    const elements = [];
    /** @type {Node | null} */
    let rest: Node | null = null;
    if (!check(state, TokenType.CloseSquare)) {
        while (!check(state, TokenType.CloseSquare) && !isAtEnd(state)) {
            if (
                check(state, TokenType.Dot) &&
                peek(state, 1).type === TokenType.Dot
            ) {
                matchDouble(state, TokenType.Dot);
                rest = makeWildcardPat(spanFromToken(previous(state)));
                break;
            }
            const pat = parsePattern(state);
            if (pat) elements.push(pat);
            if (!matchToken(state, TokenType.Comma)) break;
        }
    }
    const endToken =
        expectToken(
            state,
            TokenType.CloseSquare,
            "Expected ] in slice pattern",
        ) ?? peek(state);
    const span = mergeSpans(spanFromToken(startToken), spanFromToken(endToken));
    return makeSlicePat(span, elements, rest);
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseType(state: ParserState): Node {
    const token = peek(state);
    if (token.type === TokenType.And) {
        const start = advance(state);
        let ignoredLifetimeName = null;
        if (check(state, TokenType.Lifetime)) {
            ignoredLifetimeName = advance(state).value ?? null;
        }
        let mutability = Mutability.Immutable;
        if (
            check(state, TokenType.Mut) ||
            isIdentifierValue(peek(state), "mut")
        ) {
            advance(state);
            mutability = Mutability.Mutable;
        }
        const inner = parseType(state);
        const span = inner
            ? mergeSpans(spanFromToken(start), inner.span)
            : spanFromToken(start);
        return makeRefType(
            span,
            mutability,
            inner ?? makeNamedType(span, "unknown", null),
            ignoredLifetimeName,
        );
    }
    if (token.type === TokenType.Star) {
        const start = advance(state);
        let mutability = Mutability.Immutable;
        if (matchToken(state, TokenType.Const)) {
            mutability = Mutability.Immutable;
        } else if (
            check(state, TokenType.Mut) ||
            isIdentifierValue(peek(state), "mut")
        ) {
            advance(state);
            mutability = Mutability.Mutable;
        }
        const inner = parseType(state);
        const span = inner
            ? mergeSpans(spanFromToken(start), inner.span)
            : spanFromToken(start);
        return makePtrType(
            span,
            mutability,
            inner ?? makeNamedType(span, "unknown", null),
        );
    }
    if (
        token.type === TokenType.Fn ||
        token.type === TokenType.Unsafe ||
        token.type === TokenType.Const
    ) {
        let isUnsafe = false;
        if (matchToken(state, TokenType.Unsafe)) {
            isUnsafe = true;
        }
        let isConst = false;
        if (matchToken(state, TokenType.Const)) {
            isConst = true;
        }
        const start =
            expectToken(state, TokenType.Fn, "Expected fn type") ?? token;
        const params = [];
        expectToken(state, TokenType.OpenParen, "Expected ( in fn type");
        if (!check(state, TokenType.CloseParen)) {
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                if (
                    isIdentifierToken(peek(state)) &&
                    peek(state, 1).type === TokenType.Colon &&
                    peek(state, 2).type !== TokenType.Colon
                ) {
                    advance(state);
                    advance(state);
                }
                const paramType = parseType(state);
                if (paramType) params.push(paramType);
                if (!matchToken(state, TokenType.Comma)) break;
            }
        }
        expectToken(state, TokenType.CloseParen, "Expected ) in fn type");
        let returnType = null;
        if (matchArrow(state)) {
            returnType = parseType(state);
        }
        const endSpan = returnType ? returnType.span : spanFromToken(start);
        const span = mergeSpans(spanFromToken(start), endSpan);
        return makeFnType(span, params, returnType, isUnsafe, isConst);
    }
    if (token.type === TokenType.OpenParen) {
        const start = advance(state);
        const elements = [];
        let hasComma = false;
        if (!check(state, TokenType.CloseParen)) {
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
                const element = parseType(state);
                if (element) elements.push(element);
                if (matchToken(state, TokenType.Comma)) {
                    hasComma = true;
                } else {
                    break;
                }
            }
        }
        const endToken =
            expectToken(
                state,
                TokenType.CloseParen,
                "Expected ) in tuple type",
            ) ?? start;
        // Empty parens () is unit type
        if (elements.length === 0) {
            return makeNamedType(
                mergeSpans(spanFromToken(start), spanFromToken(endToken)),
                "()",
                null,
            );
        }
        if (!hasComma && elements.length === 1) {
            return elements[0];
        }
        const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
        return makeTupleType(span, elements);
    }
    if (token.type === TokenType.OpenSquare) {
        const start = advance(state);
        const element = parseType(state);
        let length = null;
        if (matchToken(state, TokenType.Semicolon)) {
            length = parseExpr(state, 0);
        }
        const endToken =
            expectToken(
                state,
                TokenType.CloseSquare,
                "Expected ] in array type",
            ) ?? start;
        const span = element
            ? mergeSpans(spanFromToken(start), spanFromToken(endToken))
            : spanFromToken(start);
        return makeArrayType(
            span,
            element ?? makeNamedType(span, "unknown", null),
            length,
        );
    }
    if (isIdentifierToken(token)) {
        const pathType = parsePathTypeNode(state);
        if (pathType) {
            return pathType;
        }
    }
    addError(state, "Expected type", token, null);
    advance(state);
    return makeNamedType(spanFromToken(token), "unknown", null);
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseIfExpr(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.If, "Expected if") ?? peek(state);
    const condition = parseExpr(state, 0);
    const thenBranch = parseBlockExpr(state);
    /** @type {Node | null} */
    let elseBranch: Node | null = null;
    if (matchToken(state, TokenType.Else)) {
        if (check(state, TokenType.If)) {
            elseBranch = parseIfExpr(state);
        } else {
            elseBranch = parseBlockExpr(state);
        }
    }
    const endSpan = elseBranch ? elseBranch.span : thenBranch.span;
    const span = mergeSpans(spanFromToken(start), endSpan);
    return makeIfExpr(
        span,
        condition ??
            makeLiteralExpr(
                spanFromToken(start),
                LiteralKind.Bool,
                false,
                "false",
            ),
        thenBranch,
        elseBranch,
    );
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseMatchExpr(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.Match, "Expected match") ?? peek(state);
    const scrutinee = parseExpr(state, 0, false);
    expectToken(state, TokenType.OpenCurly, "Expected { after match");
    const arms = [];
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        const pat = parsePattern(state);
        /** @type {Node | null} */
        let guard: Node | null = null;
        if (matchToken(state, TokenType.If)) {
            guard = parseExpr(state, 0);
        }
        if (!matchFatArrow(state)) {
            addError(state, "Expected => in match arm", peek(state), null);
        }
        const body = check(state, TokenType.OpenCurly)
            ? parseBlockExpr(state)
            : parseExpr(state, 0);
        const span = body ? mergeSpans(pat.span, body.span) : pat.span;
        arms.push(
            makeMatchArm(
                span,
                pat,
                guard,
                body ?? makeLiteralExpr(pat.span, LiteralKind.Int, 0, "0"),
            ),
        );
        matchToken(state, TokenType.Comma);
    }
    const endToken =
        expectToken(state, TokenType.CloseCurly, "Expected } after match") ??
        peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeMatchExpr(
        span,
        scrutinee ??
            makeLiteralExpr(spanFromToken(start), LiteralKind.Int, 0, "0"),
        arms,
    );
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseBlockExpr(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.OpenCurly, "Expected {") ?? peek(state);
    const stmts = [];
    /** @type {Node | null} */
    let expr: Node | null = null;
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        if (check(state, TokenType.Let)) {
            stmts.push(parseLetStmt(state));
            continue;
        }
        if (
            (peek(state).type === TokenType.Invalid &&
                peek(state).value === "#") ||
            check(state, TokenType.Pub) ||
            check(state, TokenType.Fn) ||
            check(state, TokenType.Struct) ||
            check(state, TokenType.Enum) ||
            check(state, TokenType.Trait) ||
            check(state, TokenType.Mod) ||
            check(state, TokenType.Use) ||
            check(state, TokenType.Impl) ||
            check(state, TokenType.Unsafe)
        ) {
            const beforePos = state.pos;
            const beforeErrors = state.errors.length;
            const item = parseItem(state);
            if (item) {
                stmts.push(makeItemStmt(item.span, item));
            } else if (
                state.pos === beforePos ||
                state.errors.length > beforeErrors
            ) {
                skipToRecovery(state, [
                    TokenType.CloseCurly,
                    TokenType.Fn,
                    TokenType.Struct,
                    TokenType.Enum,
                    TokenType.Trait,
                    TokenType.Mod,
                    TokenType.Use,
                    TokenType.Impl,
                ]);
            }
            continue;
        }
        const expression = parseExpr(state, 0);
        if (expression && matchToken(state, TokenType.Semicolon)) {
            stmts.push(makeExprStmt(expression.span, expression, true));
            continue;
        }
        expr = expression;
        break;
    }
    const endToken =
        expectToken(state, TokenType.CloseCurly, "Expected }") ?? peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeBlockExpr(span, stmts, expr);
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseLoopExpr(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.Loop, "Expected loop") ?? peek(state);
    const body = parseBlockExpr(state);
    const span = mergeSpans(spanFromToken(start), body.span);
    return makeLoopExpr(span, null, body);
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseWhileExpr(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.While, "Expected while") ?? peek(state);
    const condition = parseExpr(state, 0);
    const body = parseBlockExpr(state);
    const span = mergeSpans(spanFromToken(start), body.span);
    return makeWhileExpr(
        span,
        null,
        condition ??
            makeLiteralExpr(
                spanFromToken(start),
                LiteralKind.Bool,
                false,
                "false",
            ),
        body,
    );
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseForExpr(state: ParserState): Node {
    const start =
        expectToken(state, TokenType.For, "Expected for") ?? peek(state);
    const pat = parsePattern(state);
    if (!isIdentifierValue(peek(state), "in")) {
        addError(state, "Expected in", peek(state), ["in"]);
    } else {
        advance(state);
    }
    const iter = parseExpr(state, 0);
    const body = parseBlockExpr(state);
    const span = mergeSpans(spanFromToken(start), body.span);
    return makeForExpr(
        span,
        null,
        pat,
        iter ?? makeLiteralExpr(spanFromToken(start), LiteralKind.Int, 0, "0"),
        body,
    );
}

/**
 * @param {ParserState} state
 * @returns {Node}
 */
function parseModuleFromState(state: ParserState): Node {
    const items = [];
    while (!isAtEnd(state)) {
        if (check(state, TokenType.Eof)) break;
        const item = parseItem(state);
        if (item) {
            items.push(item);
        } else {
            skipToRecovery(state, [
                TokenType.Fn,
                TokenType.Struct,
                TokenType.Enum,
                TokenType.Trait,
                TokenType.Mod,
                TokenType.Use,
                TokenType.Impl,
                TokenType.Invalid,
                TokenType.Eof,
            ]);
            if (check(state, TokenType.Eof)) break;
        }
    }
    const span =
        items.length > 0 ? items[items.length - 1].span : currentSpan(state);
    return makeModule(span, "root", items);
}

/**
 * @param {ParserState} state
 * @param {Node | null} value
 * @returns {ParseResult}
 */
function buildResult(state: ParserState, value: Node | null): ParseResult {
    return {
        ok: state.errors.length === 0 && value !== null,
        value,
        errors: state.errors,
    };
}

/**
 * @param {string} source
 * @returns {ParseResult}
 */
function parseModule(source: string): ParseResult {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const module = parseModuleFromState(state);
    return buildResult(state, module);
}

/**
 * @param {string} source
 * @returns {ParseResult}
 */
function parseExpression(source: string): ParseResult {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const expr = parseExpr(state, 0);
    return buildResult(state, expr);
}

/**
 * @param {string} source
 * @returns {ParseResult}
 */
function parseStatement(source: string): ParseResult {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const stmt = parseStmt(state);
    return buildResult(state, stmt);
}

/**
 * @param {string} source
 * @returns {ParseResult}
 */
function parsePatternSource(source: string): ParseResult {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const pat = parsePattern(state);
    return buildResult(state, pat);
}

/**
 * @param {string} source
 * @returns {ParseResult}
 */
function parseTypeSource(source: string): ParseResult {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const ty = parseType(state);
    return buildResult(state, ty);
}

export {
    parseModule,
    parseExpression,
    parseStatement,
    parsePatternSource as parsePattern,
    parseTypeSource as parseType,
};
