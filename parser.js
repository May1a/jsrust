import { tokenize, TokenType } from "./tokenizer.js";
import {
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
} from "./ast.js";

const tokenNames = Object.fromEntries(
    Object.entries(TokenType).map(([k, v]) => [v, k]),
);

function createState(tokens) {
    return { tokens, pos: 0, errors: [] };
}

function peek(state, offset = 0) {
    return (
        state.tokens[state.pos + offset] ??
        state.tokens[state.tokens.length - 1]
    );
}

function advance(state) {
    const token = peek(state);
    if (state.pos < state.tokens.length) {
        state.pos += 1;
    }
    return token;
}

function previous(state) {
    if (state.pos - 1 >= 0) {
        return state.tokens[state.pos - 1];
    }
    return state.tokens[0] ?? peek(state);
}

function check(state, type) {
    return peek(state).type === type;
}

function isAtEnd(state) {
    return peek(state).type === TokenType.Eof;
}

function spanFromToken(token) {
    const start = token.column;
    const end = token.column + (token.value ? token.value.length : 0);
    return makeSpan(token.line, token.column, start, end);
}

function mergeSpans(a, b) {
    return makeSpan(a.line, a.column, a.start, b.end);
}

function addError(state, message, token, expected = null) {
    const span = token ? spanFromToken(token) : spanFromToken(peek(state));
    state.errors.push({
        message,
        span,
        expected,
        found: token ? (tokenNames[token.type] ?? null) : null,
    });
}

function matchToken(state, type) {
    if (check(state, type)) {
        return advance(state);
    }
    return null;
}

function expectToken(state, type, message) {
    if (check(state, type)) {
        return advance(state);
    }
    addError(state, message, peek(state), [tokenNames[type]]);
    return null;
}

function currentSpan(state) {
    return spanFromToken(peek(state));
}

function skipToRecovery(state, tokenTypes) {
    while (!isAtEnd(state) && !tokenTypes.includes(peek(state).type)) {
        advance(state);
    }
}

function isIdentifierToken(token) {
    return token.type === TokenType.Identifier || token.type === TokenType.Self;
}

function isIdentifierValue(token, value) {
    return token.type === TokenType.Identifier && token.value === value;
}

function matchDouble(state, type) {
    if (check(state, type) && peek(state, 1).type === type) {
        const first = advance(state);
        advance(state);
        return first;
    }
    return null;
}

function matchArrow(state) {
    if (check(state, TokenType.Minus) && peek(state, 1).type === TokenType.Gt) {
        const token = advance(state);
        advance(state);
        return token;
    }
    return null;
}

function matchFatArrow(state) {
    if (check(state, TokenType.Eq) && peek(state, 1).type === TokenType.Gt) {
        const token = advance(state);
        advance(state);
        return token;
    }
    return null;
}

function matchInvalidSymbol(state, symbol) {
    if (
        peek(state).type === TokenType.Invalid &&
        peek(state).value === symbol
    ) {
        return advance(state);
    }
    return null;
}

function parseIntegerToken(token) {
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

function parseFloatToken(token) {
    return Number.parseFloat(token.value);
}

function decodeEscapes(value) {
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

function parseStringToken(token) {
    const raw = token.value;
    const inner = raw.length >= 2 ? raw.slice(1, -1) : "";
    return decodeEscapes(inner);
}

function parseCharToken(token, state) {
    const value = parseStringToken(token);
    if (value.length !== 1) {
        addError(state, "Invalid char literal", token, null);
    }
    return value[0] ?? "";
}

function parseLiteralExpr(state) {
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

function parsePathSegments(state) {
    const segments = [];
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

function parseStructExpr(state, pathNode) {
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
        fields.push({ name, value });
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

function parseAtom(state, allowStructLiteral = true) {
    const literal = parseLiteralExpr(state);
    if (literal) return literal;

    const token = peek(state);

    if (token.type === TokenType.OpenParen) {
        const startToken = advance(state);
        const expr = parseExpr(state, 0);
        const end =
            expectToken(state, TokenType.CloseParen, "Expected )") ??
            startToken;
        if (!expr) {
            return makeLiteralExpr(
                mergeSpans(spanFromToken(startToken), spanFromToken(end)),
                LiteralKind.Int,
                0,
                "0",
            );
        }
        expr.span = mergeSpans(spanFromToken(startToken), spanFromToken(end));
        return expr;
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

function parsePostfix(state, expr) {
    let result = expr;
    while (result) {
        if (
            check(state, TokenType.Dot) &&
            peek(state, 1).type === TokenType.Dot
        ) {
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
            result = makeCallExpr(span, result, args);
            continue;
        }
        break;
    }
    return result;
}

function parsePrefix(state, allowStructLiteral = true) {
    const token = peek(state);
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
        if (isIdentifierValue(peek(state), "mut")) {
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

const binaryOps = new Map([
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

function parseRangeOperator(state) {
    if (check(state, TokenType.Dot) && peek(state, 1).type === TokenType.Dot) {
        const startToken = advance(state);
        advance(state);
        const inclusive = matchToken(state, TokenType.Eq) !== null;
        return { token: startToken, inclusive };
    }
    return null;
}

function parseExpr(state, minPrec = 0, allowStructLiteral = true) {
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

        if (minPrec <= 1 && check(state, TokenType.Eq)) {
            advance(state);
            const right = parseExpr(state, 1, allowStructLiteral);
            if (!right) return left;
            const span = mergeSpans(left.span, right.span);
            left = makeAssignExpr(span, left, right);
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

function parseLetStmt(state) {
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

function parseExprStmt(state) {
    const expr = parseExpr(state, 0);
    const hasSemicolon = matchToken(state, TokenType.Semicolon) !== null;
    const span = expr ? mergeSpans(expr.span, expr.span) : currentSpan(state);
    return makeExprStmt(
        span,
        expr ?? makeLiteralExpr(span, LiteralKind.Int, 0, "0"),
        hasSemicolon,
    );
}

function parseStmt(state) {
    if (check(state, TokenType.Let)) {
        return parseLetStmt(state);
    }
    if (
        check(state, TokenType.Pub) ||
        check(state, TokenType.Fn) ||
        check(state, TokenType.Struct) ||
        check(state, TokenType.Enum) ||
        check(state, TokenType.Mod) ||
        check(state, TokenType.Use) ||
        check(state, TokenType.Unsafe)
    ) {
        const item = parseItem(state);
        const span = item ? item.span : currentSpan(state);
        return makeItemStmt(span, item ?? makeModule(span, "error", []));
    }
    return parseExprStmt(state);
}

function parseParamList(state) {
    const params = [];
    expectToken(state, TokenType.OpenParen, "Expected ( in parameter list");
    if (!check(state, TokenType.CloseParen)) {
        while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
            const token = peek(state);
            let name = null;
            if (isIdentifierToken(token)) {
                name = advance(state).value;
            }
            let ty = null;
            if (matchToken(state, TokenType.Colon)) {
                ty = parseType(state);
            }
            const span = token ? spanFromToken(token) : currentSpan(state);
            params.push(makeParam(span, name, ty, null));
            if (!matchToken(state, TokenType.Comma)) break;
        }
    }
    expectToken(state, TokenType.CloseParen, "Expected ) after parameters");
    return params;
}

function parseFnItem(state, isUnsafe) {
    const start =
        expectToken(state, TokenType.Fn, "Expected fn") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected function name") ??
        peek(state);
    const params = parseParamList(state);
    let returnType = null;
    if (matchArrow(state)) {
        returnType = parseType(state);
    }
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
        null,
        params,
        returnType,
        body,
        false,
        isUnsafe,
    );
}

function parseStructItem(state) {
    const start =
        expectToken(state, TokenType.Struct, "Expected struct") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected struct name") ??
        peek(state);
    const fields = [];
    let isTuple = false;
    if (matchToken(state, TokenType.OpenCurly)) {
        while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
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
    return makeStructItem(span, nameToken.value ?? "", null, fields, isTuple);
}

function parseEnumItem(state) {
    const start =
        expectToken(state, TokenType.Enum, "Expected enum") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected enum name") ??
        peek(state);
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
                let ty = null;
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
        let discriminant = null;
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
    return makeEnumItem(span, nameToken.value ?? "", null, variants);
}

function parseModItem(state) {
    const start =
        expectToken(state, TokenType.Mod, "Expected mod") ?? peek(state);
    const nameToken =
        expectToken(state, TokenType.Identifier, "Expected module name") ??
        peek(state);
    let items = [];
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
                    TokenType.Mod,
                    TokenType.Use,
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
    return makeModItem(span, nameToken.value ?? "", items, isInline);
}

function parseUseTree(state) {
    const startToken = peek(state);
    const path = parsePathSegments(state);
    let children = null;
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
    const endToken = previous(state);
    const span = mergeSpans(spanFromToken(startToken), spanFromToken(endToken));
    return makeUseTree(span, path, null, children);
}

function parseUseItem(state, isPub) {
    const start =
        expectToken(state, TokenType.Use, "Expected use") ?? peek(state);
    const tree = parseUseTree(state);
    const endToken =
        expectToken(state, TokenType.Semicolon, "Expected ; after use") ??
        peek(state);
    const span = mergeSpans(spanFromToken(start), spanFromToken(endToken));
    return makeUseItem(span, tree, isPub);
}

function parseItem(state) {
    let isPub = false;
    let isUnsafe = false;
    if (matchToken(state, TokenType.Pub)) {
        isPub = true;
    }
    if (matchToken(state, TokenType.Unsafe)) {
        isUnsafe = true;
    }
    if (check(state, TokenType.Fn)) return parseFnItem(state, isUnsafe);
    if (check(state, TokenType.Struct)) return parseStructItem(state);
    if (check(state, TokenType.Enum)) return parseEnumItem(state);
    if (check(state, TokenType.Mod)) return parseModItem(state);
    if (check(state, TokenType.Use)) return parseUseItem(state, isPub);
    addError(state, "Expected item", peek(state), null);
    return null;
}

function parsePattern(state) {
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

function parsePatternAtom(state) {
    const token = peek(state);
    if (token.type === TokenType.Identifier && token.value === "_") {
        advance(state);
        return makeWildcardPat(spanFromToken(token));
    }
    if (token.type === TokenType.Identifier || token.type === TokenType.Self) {
        const startToken = token;
        const name = advance(state).value;
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

function parseLiteralPat(state) {
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

function parseStructPattern(state, path, startToken) {
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
        let pat = null;
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

function parseTuplePattern(state, startToken, name) {
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

function parseSlicePattern(state) {
    const startToken =
        expectToken(
            state,
            TokenType.OpenSquare,
            "Expected [ in slice pattern",
        ) ?? peek(state);
    const elements = [];
    let rest = null;
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

function parseType(state) {
    const token = peek(state);
    if (token.type === TokenType.And) {
        const start = advance(state);
        let mutability = Mutability.Immutable;
        if (isIdentifierValue(peek(state), "mut")) {
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
        );
    }
    if (token.type === TokenType.Star) {
        const start = advance(state);
        let mutability = Mutability.Immutable;
        if (matchToken(state, TokenType.Const)) {
            mutability = Mutability.Immutable;
        } else if (isIdentifierValue(peek(state), "mut")) {
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
    if (token.type === TokenType.Fn || token.type === TokenType.Unsafe) {
        let isUnsafe = false;
        if (matchToken(state, TokenType.Unsafe)) {
            isUnsafe = true;
        }
        const start =
            expectToken(state, TokenType.Fn, "Expected fn type") ?? token;
        const params = [];
        expectToken(state, TokenType.OpenParen, "Expected ( in fn type");
        if (!check(state, TokenType.CloseParen)) {
            while (!check(state, TokenType.CloseParen) && !isAtEnd(state)) {
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
        return makeFnType(span, params, returnType, isUnsafe);
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
        const start = advance(state);
        let args = null;
        if (matchToken(state, TokenType.Lt)) {
            const typeArgs = [];
            while (!check(state, TokenType.Gt) && !isAtEnd(state)) {
                const arg = parseType(state);
                if (arg) typeArgs.push(arg);
                if (!matchToken(state, TokenType.Comma)) break;
            }
            const endToken =
                expectToken(
                    state,
                    TokenType.Gt,
                    "Expected > in generic args",
                ) ?? start;
            args = makeGenericArgs(
                mergeSpans(spanFromToken(start), spanFromToken(endToken)),
                typeArgs,
            );
        }
        return makeNamedType(spanFromToken(start), start.value ?? "", args);
    }
    addError(state, "Expected type", token, null);
    advance(state);
    return makeNamedType(spanFromToken(token), "unknown", null);
}

function parseIfExpr(state) {
    const start =
        expectToken(state, TokenType.If, "Expected if") ?? peek(state);
    const condition = parseExpr(state, 0);
    const thenBranch = parseBlockExpr(state);
    let elseBranch = null;
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

function parseMatchExpr(state) {
    const start =
        expectToken(state, TokenType.Match, "Expected match") ?? peek(state);
    const scrutinee = parseExpr(state, 0, false);
    expectToken(state, TokenType.OpenCurly, "Expected { after match");
    const arms = [];
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        const pat = parsePattern(state);
        let guard = null;
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

function parseBlockExpr(state) {
    const start =
        expectToken(state, TokenType.OpenCurly, "Expected {") ?? peek(state);
    const stmts = [];
    let expr = null;
    while (!check(state, TokenType.CloseCurly) && !isAtEnd(state)) {
        if (check(state, TokenType.Let)) {
            stmts.push(parseLetStmt(state));
            continue;
        }
        if (
            check(state, TokenType.Pub) ||
            check(state, TokenType.Fn) ||
            check(state, TokenType.Struct) ||
            check(state, TokenType.Enum) ||
            check(state, TokenType.Mod) ||
            check(state, TokenType.Use) ||
            check(state, TokenType.Unsafe)
        ) {
            const item = parseItem(state);
            const span = item ? item.span : currentSpan(state);
            stmts.push(
                makeItemStmt(span, item ?? makeModule(span, "error", [])),
            );
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

function parseLoopExpr(state) {
    const start =
        expectToken(state, TokenType.Loop, "Expected loop") ?? peek(state);
    const body = parseBlockExpr(state);
    const span = mergeSpans(spanFromToken(start), body.span);
    return makeLoopExpr(span, null, body);
}

function parseWhileExpr(state) {
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

function parseForExpr(state) {
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

function parseModuleFromState(state) {
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
                TokenType.Mod,
                TokenType.Use,
                TokenType.Eof,
            ]);
            if (check(state, TokenType.Eof)) break;
        }
    }
    const span =
        items.length > 0 ? items[items.length - 1].span : currentSpan(state);
    return makeModule(span, "root", items);
}

function buildResult(state, value) {
    return {
        ok: state.errors.length === 0 && value !== null,
        value,
        errors: state.errors,
    };
}

function parseModule(source) {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const module = parseModuleFromState(state);
    return buildResult(state, module);
}

function parseExpression(source) {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const expr = parseExpr(state, 0);
    return buildResult(state, expr);
}

function parseStatement(source) {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const stmt = parseStmt(state);
    return buildResult(state, stmt);
}

function parsePatternSource(source) {
    const tokens = tokenize(source);
    const state = createState(tokens);
    const pat = parsePattern(state);
    return buildResult(state, pat);
}

function parseTypeSource(source) {
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
