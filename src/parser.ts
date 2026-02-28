import { tokenize, TokenType, type Token } from "./tokenizer";
import {
    ArrayTypeNode,
    AssignExpr,
    BinaryExpr,
    BinaryOp,
    BindingPattern,
    BlockExpr,
    BreakExpr,
    CallExpr,
    ClosureExpr,
    ContinueExpr,
    DerefExpr,
    EnumItem,
    type EnumVariantNode,
    ExprStmt,
    FieldExpr,
    FnItem,
    FnTypeNode,
    ForExpr,
    GenericArgsNode,
    IdentPattern,
    IdentifierExpr,
    IfExpr,
    ImplItem,
    IndexExpr,
    ItemStmt,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    LiteralPattern,
    LoopExpr,
    MacroExpr,
    MatchArmNode,
    MatchExpr,
    ModItem,
    ModuleNode,
    Mutability,
    NamedTypeNode,
    OrPattern,
    type ParamNode,
    PathExpr,
    PtrTypeNode,
    RangeExpr,
    RangePattern,
    RefExpr,
    RefTypeNode,
    ReturnExpr,
    SlicePattern,
    Span,
    StructExpr,
    type StructFieldNode,
    StructItem,
    StructPattern,
    type StructPatternField,
    TraitItem,
    TuplePattern,
    TupleTypeNode,
    UnaryExpr,
    UnaryOp,
    UseItem,
    WhileExpr,
    WildcardPattern,
    type Expression,
    type Item,
    type Pattern,
    type Statement,
    type TypeNode,
} from "./ast";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParseDiagnostic {
    message: string;
    line: number;
    column: number;
}
export type ParseResult<T> =
    | { ok: true; value: T }
    | { ok: false; errors: ParseDiagnostic[] };

export function parseModule(source: string): ParseResult<ModuleNode> {
    const p = new Parser(tokenize(source));
    const value = p.parseModuleNode();
    return p.errors.length > 0
        ? { ok: false, errors: p.errors }
        : { ok: true, value };
}

export function parseExpression(source: string): ParseResult<Expression> {
    const p = new Parser(tokenize(source));
    const value = p.parseExpr(0);
    return p.errors.length > 0
        ? { ok: false, errors: p.errors }
        : { ok: true, value };
}

export function parseStatement(source: string): ParseResult<Statement> {
    const p = new Parser(tokenize(source));
    const value = p.parseStatement();
    if (value === undefined) {
        return { ok: false, errors: [{ message: "Expected statement", line: 1, column: 1 }] };
    }
    return p.errors.length > 0
        ? { ok: false, errors: p.errors }
        : { ok: true, value };
}

export function parseType(source: string): ParseResult<TypeNode> {
    const p = new Parser(tokenize(source));
    const value = p.parseTypeNode();
    return p.errors.length > 0
        ? { ok: false, errors: p.errors }
        : { ok: true, value };
}

export function parsePattern(source: string): ParseResult<Pattern> {
    const p = new Parser(tokenize(source));
    const value = p.parsePattern();
    return p.errors.length > 0
        ? { ok: false, errors: p.errors }
        : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseIntValue(s: string): number {
    if (s.startsWith("0x") || s.startsWith("0X")) return Number.parseInt(s.slice(2), 16);
    if (s.startsWith("0o") || s.startsWith("0O")) return Number.parseInt(s.slice(2), 8);
    if (s.startsWith("0b") || s.startsWith("0B")) return Number.parseInt(s.slice(2), 2);
    return Number.parseInt(s, 10);
}

function isCharLiteral(raw: string): boolean {
    return raw.startsWith("'");
}

function processStringValue(raw: string): string {
    if (raw.length < 2) return raw;
    const closingQuoteOffset = -1;
    const inner = raw.slice(1, closingQuoteOffset);
    return inner
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\0/g, "\0");
}

const TYPE_SUFFIX_RE = /^([uif]\d+|usize|isize)$/;
const RANGE_PRECEDENCE = 1;
const ASSIGNMENT_PRECEDENCE = 2;
const OR_PRECEDENCE = 3;
const AND_PRECEDENCE = 4;
const COMPARISON_PRECEDENCE = 5;
const BIT_OR_PRECEDENCE = 6;
const BIT_XOR_PRECEDENCE = 7;
const BIT_AND_PRECEDENCE = 8;
const ADDITIVE_PRECEDENCE = 9;
const MULTIPLICATIVE_PRECEDENCE = 10;
const POSTFIX_PRECEDENCE = 11;
const UNIT_LITERAL_VALUE = 0;
const ERROR_LITERAL_VALUE = 0;

const INFIX_PRECEDENCE = new Map<TokenType, number>([
    [TokenType.Eq, ASSIGNMENT_PRECEDENCE],
    [TokenType.PlusEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.MinusEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.StarEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.SlashEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.PercentEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.AndEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.PipeEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.CaretEq, ASSIGNMENT_PRECEDENCE],
    [TokenType.PipePipe, OR_PRECEDENCE],
    [TokenType.AndAnd, AND_PRECEDENCE],
    [TokenType.EqEq, COMPARISON_PRECEDENCE],
    [TokenType.BangEq, COMPARISON_PRECEDENCE],
    [TokenType.LtEq, COMPARISON_PRECEDENCE],
    [TokenType.GtEq, COMPARISON_PRECEDENCE],
    [TokenType.Pipe, BIT_OR_PRECEDENCE],
    [TokenType.Caret, BIT_XOR_PRECEDENCE],
    [TokenType.And, BIT_AND_PRECEDENCE],
    [TokenType.Plus, ADDITIVE_PRECEDENCE],
    [TokenType.Minus, ADDITIVE_PRECEDENCE],
    [TokenType.Star, MULTIPLICATIVE_PRECEDENCE],
    [TokenType.Slash, MULTIPLICATIVE_PRECEDENCE],
    [TokenType.Percent, MULTIPLICATIVE_PRECEDENCE],
]);

const COMPOUND_ASSIGNMENT_OPERATORS: Partial<Record<TokenType, BinaryOp>> = {
    [TokenType.PlusEq]: BinaryOp.Add,
    [TokenType.MinusEq]: BinaryOp.Sub,
    [TokenType.StarEq]: BinaryOp.Mul,
    [TokenType.SlashEq]: BinaryOp.Div,
    [TokenType.PercentEq]: BinaryOp.Rem,
    [TokenType.AndEq]: BinaryOp.BitAnd,
    [TokenType.PipeEq]: BinaryOp.BitOr,
    [TokenType.CaretEq]: BinaryOp.BitXor,
};

const BINARY_OPERATORS: Partial<Record<TokenType, BinaryOp>> = {
    [TokenType.PipePipe]: BinaryOp.Or,
    [TokenType.AndAnd]: BinaryOp.And,
    [TokenType.EqEq]: BinaryOp.Eq,
    [TokenType.BangEq]: BinaryOp.Ne,
    [TokenType.Lt]: BinaryOp.Lt,
    [TokenType.Gt]: BinaryOp.Gt,
    [TokenType.LtEq]: BinaryOp.Le,
    [TokenType.GtEq]: BinaryOp.Ge,
    [TokenType.Pipe]: BinaryOp.BitOr,
    [TokenType.Caret]: BinaryOp.BitXor,
    [TokenType.And]: BinaryOp.BitAnd,
    [TokenType.Plus]: BinaryOp.Add,
    [TokenType.Minus]: BinaryOp.Sub,
    [TokenType.Star]: BinaryOp.Mul,
    [TokenType.Slash]: BinaryOp.Div,
    [TokenType.Percent]: BinaryOp.Rem,
};

const EXPRESSION_START_TOKENS = new Set<TokenType>([
    TokenType.Integer,
    TokenType.Float,
    TokenType.String,
    TokenType.True,
    TokenType.False,
    TokenType.Identifier,
    TokenType.Self,
    TokenType.OpenParen,
    TokenType.OpenCurly,
    TokenType.OpenSquare,
    TokenType.And,
    TokenType.Star,
    TokenType.Minus,
    TokenType.Bang,
    TokenType.If,
    TokenType.Match,
    TokenType.Loop,
    TokenType.While,
    TokenType.For,
    TokenType.Return,
    TokenType.Break,
    TokenType.Continue,
    TokenType.Pipe,
    TokenType.PipePipe,
]);

const ITEM_START_TOKENS = new Set<TokenType>([
    TokenType.Fn,
    TokenType.Struct,
    TokenType.Enum,
    TokenType.Impl,
    TokenType.Trait,
    TokenType.Mod,
    TokenType.Use,
    TokenType.Hash,
    TokenType.Unsafe,
]);

function isBlockLikeExpr(e: Expression): boolean {
    return (
        e instanceof BlockExpr ||
        e instanceof IfExpr ||
        e instanceof MatchExpr ||
        e instanceof LoopExpr ||
        e instanceof WhileExpr ||
        e instanceof ForExpr
    );
}

function isTypeSuffix(s: string): boolean {
    return TYPE_SUFFIX_RE.test(s);
}

class Parser {
    private readonly tokens: Token[];
    private pos = 0;
    readonly errors: ParseDiagnostic[] = [];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    // -----------------------------------------------------------------------
    // Core token operations
    // -----------------------------------------------------------------------

    peek(): Token {
        return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
    }

    peekAt(offset: number): Token {
        const idx = this.pos + offset;
        if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1];
        return this.tokens[idx];
    }

    advance(): Token {
        const t = this.peek();
        if (t.type !== TokenType.Eof) this.pos++;
        return t;
    }

    check(type: TokenType): boolean {
        return this.peek().type === type;
    }

    eat(type: TokenType): Token | undefined {
        if (this.check(type)) return this.advance();
        return undefined;
    }

    expect(type: TokenType): Token {
        if (this.check(type)) return this.advance();
        const tok = this.peek();
        this.errors.push({
            message: `Expected ${TokenType[type]}, got ${TokenType[tok.type]} ('${tok.value}')`,
            line: tok.line,
            column: tok.column,
        });
        return tok;
    }

    makeSpan(tok: Token): Span {
        return new Span(tok.line, tok.column, 0, 0);
    }

    spanFrom(startToken: Token): Span {
        return new Span(startToken.line, startToken.column, 0, 0);
    }

    // -----------------------------------------------------------------------
    // Multi-token sequence helpers
    // -----------------------------------------------------------------------

    checkThinArrow(): boolean {
        return this.peek().type === TokenType.Minus && this.peekAt(1).type === TokenType.Gt;
    }

    eatThinArrow(): boolean {
        if (this.checkThinArrow()) {
            this.advance();
            this.advance();
            return true;
        }
        return false;
    }

    checkColonColon(): boolean {
        return this.peek().type === TokenType.Colon && this.peekAt(1).type === TokenType.Colon;
    }

    eatColonColon(): boolean {
        if (this.checkColonColon()) {
            this.advance();
            this.advance();
            return true;
        }
        return false;
    }

    checkDotDot(): boolean {
        return (
            this.peek().type === TokenType.Dot &&
            this.peekAt(1).type === TokenType.Dot &&
            this.peekAt(2).type !== TokenType.Eq
        );
    }

    eatDotDot(): boolean {
        if (this.checkDotDot()) {
            this.advance();
            this.advance();
            return true;
        }
        return false;
    }

    checkDotDotEq(): boolean {
        return (
            this.peek().type === TokenType.Dot &&
            this.peekAt(1).type === TokenType.Dot &&
            this.peekAt(2).type === TokenType.Eq
        );
    }

    eatDotDotEq(): boolean {
        if (this.checkDotDotEq()) {
            this.advance();
            this.advance();
            this.advance();
            return true;
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Utility
    // -----------------------------------------------------------------------

    private eatPub(): void {
        if (!this.eat(TokenType.Pub)) return;
        // Pub(crate) / pub(super) / pub(in path)
        if (this.eat(TokenType.OpenParen)) {
            let depth = 1;
            while (depth > 0 && !this.check(TokenType.Eof)) {
                if (this.check(TokenType.OpenParen)) depth++;
                else if (this.check(TokenType.CloseParen)) depth--;
                this.advance();
            }
        }
    }

    private skipGenericParams(): void {
        if (!this.check(TokenType.Lt)) return;
        let depth = 1;
        this.advance(); // Consume <
        while (depth > 0 && !this.check(TokenType.Eof)) {
            if (this.check(TokenType.Lt)) depth++;
            else if (this.check(TokenType.Gt)) depth--;
            this.advance();
        }
    }

    private skipWhereClause(): void {
        if (!this.check(TokenType.Where)) return;
        this.advance();
        // Consume until { or ;
        while (!this.check(TokenType.OpenCurly) && !this.check(TokenType.Semicolon) && !this.check(TokenType.Eof)) {
            this.advance();
        }
    }

    private skipBracketContent(): void {
        // Skips content inside [...] including the closing ]
        let depth = 1;
        while (depth > 0 && !this.check(TokenType.Eof)) {
            if (this.check(TokenType.OpenSquare)) depth++;
            else if (this.check(TokenType.CloseSquare)) depth--;
            this.advance();
        }
    }

    private skipUntil(...terminators: TokenType[]): void {
        while (
            !terminators.some((terminator) => this.check(terminator)) &&
            !this.check(TokenType.Eof)
        ) {
            this.advance();
        }
    }

    private canStartExpression(): boolean {
        if (EXPRESSION_START_TOKENS.has(this.peek().type)) return true;
        return this.peek().type === TokenType.Dot && (this.checkDotDot() || this.checkDotDotEq());
    }

    // -----------------------------------------------------------------------
    // Attributes
    // -----------------------------------------------------------------------

    parseAttributes(): { derives: string[] } {
        const derives: string[] = [];

        while (this.check(TokenType.Hash)) {
            this.advance(); // Consume #
            const isBang = this.eat(TokenType.Bang) !== undefined; // #! inner attribute

            if (!this.eat(TokenType.OpenSquare)) break;

            if (
                !isBang &&
                this.check(TokenType.Identifier) &&
                this.peek().value === "derive"
            ) {
                this.advance(); // Consume "derive"
                if (this.eat(TokenType.OpenParen)) {
                    while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
                        if (this.check(TokenType.Identifier)) {
                            derives.push(this.advance().value);
                        }
                        this.eat(TokenType.Comma);
                    }
                    this.eat(TokenType.CloseParen);
                }
                this.expect(TokenType.CloseSquare);
            } else {
                this.skipBracketContent(); // Consumes until and including ]
            }
        }

        return { derives };
    }

    // -----------------------------------------------------------------------
    // Module
    // -----------------------------------------------------------------------

    parseModuleNode(name = "main"): ModuleNode {
        const start = this.peek();
        const items: Item[] = [];

        while (!this.check(TokenType.Eof) && !this.check(TokenType.CloseCurly)) {
            const parsed = this.parseItems();
            for (const item of parsed) {
                items.push(item);
            }
        }

        return new ModuleNode(this.spanFrom(start), name, items);
    }

    // -----------------------------------------------------------------------
    // Items
    // -----------------------------------------------------------------------

    private parseItems(): Item[] {
        // Skip standalone semicolons
        if (this.eat(TokenType.Semicolon)) return [];

        const { derives } = this.parseAttributes();
        this.eatPub();

        const start = this.peek();
        return (
            this.parseDirectItem(start, derives) ??
            this.parseUnsafeItem(start, derives) ??
            this.parseTypeAliasItem() ??
            this.parseStaticOrConstItem() ??
            this.parseUnexpectedItem()
        );
    }

    private parseDirectItem(start: Token, derives: string[]): Item[] | undefined {
        if (this.eat(TokenType.Fn)) return [this.parseFnBody(start, derives)];
        if (this.eat(TokenType.Struct)) return [this.parseStructBody(start, derives)];
        if (this.eat(TokenType.Enum)) return [this.parseEnumBody(start, derives)];
        if (this.eat(TokenType.Impl)) return [this.parseImplBody(start)];
        if (this.eat(TokenType.Trait)) return [this.parseTraitBody(start)];
        if (this.eat(TokenType.Mod)) return [this.parseModBody(start)];
        if (this.eat(TokenType.Use)) return this.parseUseBody(start);
        return undefined;
    }

    private parseUnsafeItem(start: Token, derives: string[]): Item[] | undefined {
        if (!this.eat(TokenType.Unsafe)) return undefined;
        if (this.eat(TokenType.Fn)) return [this.parseFnBody(start, derives)];
        if (this.eat(TokenType.Impl)) return [this.parseImplBody(start)];
        if (this.eat(TokenType.Trait)) return [this.parseTraitBody(start)];
        if (this.check(TokenType.OpenCurly)) {
            this.skipBlock();
        }
        return [];
    }

    private parseTypeAliasItem(): Item[] | undefined {
        if (!this.eat(TokenType.Type)) return undefined;
        this.eat(TokenType.Identifier);
        this.skipGenericParams();
        if (this.eat(TokenType.Eq)) {
            this.skipUntil(TokenType.Semicolon);
        }
        this.eat(TokenType.Semicolon);
        return [];
    }

    private parseStaticOrConstItem(): Item[] | undefined {
        if (!this.check(TokenType.Static) && !this.check(TokenType.Const)) return undefined;
        this.advance();
        this.skipUntil(TokenType.Semicolon, TokenType.CloseCurly);
        this.eat(TokenType.Semicolon);
        return [];
    }

    private parseUnexpectedItem(): Item[] {
        const tok = this.peek();
        if (tok.type !== TokenType.Eof && tok.type !== TokenType.CloseCurly) {
            this.errors.push({
                message: `Unexpected token '${tok.value}' in item position`,
                line: tok.line,
                column: tok.column,
            });
            this.advance();
        }
        return [];
    }

    // -----------------------------------------------------------------------
    // Fn item
    // -----------------------------------------------------------------------

    private parseFnBody(startTok: Token, derives: string[]): FnItem {
        this.skipGenericParams();
        const name = this.expect(TokenType.Identifier).value;
        this.skipGenericParams(); // Generics after name

        this.expect(TokenType.OpenParen);
        const params = this.parseFnParams();
        this.expect(TokenType.CloseParen);

        this.skipWhereClause();

        let returnType: TypeNode = new TupleTypeNode(this.spanFrom(startTok), []);
        if (this.eatThinArrow()) {
            returnType = this.parseTypeNode();
        }

        this.skipWhereClause();

        let body: BlockExpr | undefined;
        if (this.check(TokenType.OpenCurly)) {
            body = this.parseBlock();
        } else {
            this.eat(TokenType.Semicolon);
        }

        return new FnItem(this.spanFrom(startTok), name, params, returnType, body, derives);
    }

    private parseFnParams(): ParamNode[] {
        const params: ParamNode[] = [];

        while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
            const paramStart = this.peek();

            // &self / &mut self
            if (this.check(TokenType.And)) {
                this.advance(); // Consume &
                const isMut = this.eat(TokenType.Mut) !== undefined;
                if (this.eat(TokenType.Self)) {
                    params.push({
                        span: this.spanFrom(paramStart),
                        isReceiver: true,
                        receiverKind: isMut ? "ref_mut" : "ref",
                    });
                    this.eat(TokenType.Comma);
                    continue;
                }
                // Not self — backtrack by reparsing as type
                // (rare: &Type param)
                this.pos -= isMut ? 2 : 1; // Undo & (and mut if consumed)
            }

            // Self
            if (this.eat(TokenType.Self)) {
                params.push({
                    span: this.spanFrom(paramStart),
                    isReceiver: true,
                    receiverKind: "value",
                });
                this.eat(TokenType.Comma);
                continue;
            }

            // Mut (for mut self or mut name: type)
            this.eat(TokenType.Mut);

            // _ or name
            let name: string;
            if (this.check(TokenType.Identifier) || this.check(TokenType.Self)) {
                name = this.advance().value;
            } else {
                // Unexpected
                break;
            }

            // If followed by colon, it's name: Type
            if (!this.eat(TokenType.Colon)) {
                // No colon; this might be just a type name used as a param.
                // Treat it as a name with inferred type.
                params.push({
                    span: this.spanFrom(paramStart),
                    name,
                    ty: new NamedTypeNode(this.spanFrom(paramStart), "_"),
                    isReceiver: false,
                });
                this.eat(TokenType.Comma);
                continue;
            }

            const ty = this.parseTypeNode();
            params.push({
                span: this.spanFrom(paramStart),
                name,
                ty,
                isReceiver: false,
            });

            if (!this.eat(TokenType.Comma)) break;
        }

        return params;
    }

    // -----------------------------------------------------------------------
    // Struct item
    // -----------------------------------------------------------------------

    private parseStructBody(startTok: Token, derives: string[]): StructItem {
        const name = this.expect(TokenType.Identifier).value;
        this.skipGenericParams();
        this.skipWhereClause();

        const fields: StructFieldNode[] = [];

        if (this.eat(TokenType.OpenCurly)) {
            // Normal struct { field: Type, ... }
            while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
                const fieldStart = this.peek();
                this.eatPub();
                const fieldName = this.expect(TokenType.Identifier).value;
                this.expect(TokenType.Colon);
                const ty = this.parseTypeNode();
                fields.push({ span: this.spanFrom(fieldStart), name: fieldName, ty });
                if (!this.eat(TokenType.Comma)) break;
            }
            this.expect(TokenType.CloseCurly);
        } else if (this.eat(TokenType.OpenParen)) {
            // Tuple struct Foo(A, B)
            let idx = 0;
            while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
                const fieldStart = this.peek();
                this.eatPub();
                const ty = this.parseTypeNode();
                fields.push({ span: this.spanFrom(fieldStart), name: String(idx++), ty });
                if (!this.eat(TokenType.Comma)) break;
            }
            this.expect(TokenType.CloseParen);
        }
        this.eat(TokenType.Semicolon);

        return new StructItem(this.spanFrom(startTok), name, fields, derives);
    }

    // -----------------------------------------------------------------------
    // Enum item
    // -----------------------------------------------------------------------

    private parseEnumBody(startTok: Token, derives: string[]): EnumItem {
        const name = this.expect(TokenType.Identifier).value;
        this.skipGenericParams();
        this.skipWhereClause();

        this.expect(TokenType.OpenCurly);
        const variants: EnumVariantNode[] = [];

        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            variants.push(this.parseEnumVariant());
            if (!this.eat(TokenType.Comma)) break;
        }

        this.expect(TokenType.CloseCurly);
        return new EnumItem(this.spanFrom(startTok), name, variants, derives);
    }

    private parseEnumVariant(): EnumVariantNode {
        const variantStart = this.peek();
        const variantName = this.expect(TokenType.Identifier).value;
        const fields = this.parseEnumVariantFields();
        if (this.eat(TokenType.Eq)) {
            this.skipUntil(TokenType.Comma, TokenType.CloseCurly);
        }
        return { span: this.spanFrom(variantStart), name: variantName, fields };
    }

    private parseEnumVariantFields(): StructFieldNode[] {
        if (this.eat(TokenType.OpenParen)) {
            return this.parseTupleFields(TokenType.CloseParen);
        }
        if (!this.eat(TokenType.OpenCurly)) return [];
        const fields: StructFieldNode[] = [];
        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            const fs = this.peek();
            const fieldName = this.expect(TokenType.Identifier).value;
            this.expect(TokenType.Colon);
            const ty = this.parseTypeNode();
            fields.push({ span: this.spanFrom(fs), name: fieldName, ty });
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseCurly);
        return fields;
    }

    private parseTupleFields(closeToken: TokenType): StructFieldNode[] {
        const fields: StructFieldNode[] = [];
        let index = 0;
        while (!this.check(closeToken) && !this.check(TokenType.Eof)) {
            const fieldStart = this.peek();
            const ty = this.parseTypeNode();
            fields.push({ span: this.spanFrom(fieldStart), name: String(index++), ty });
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(closeToken);
        return fields;
    }

    // -----------------------------------------------------------------------
    // Impl item
    // -----------------------------------------------------------------------

    private parseImplBody(startTok: Token): ImplItem {
        this.skipGenericParams();
        const typeA = this.parseTypeNode();

        const { target, traitType } = this.parseImplTarget(typeA);

        this.skipWhereClause();
        this.expect(TokenType.OpenCurly);

        const methods: FnItem[] = [];
        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            this.parseImplMember(methods);
        }

        this.expect(TokenType.CloseCurly);
        return new ImplItem(this.spanFrom(startTok), target, methods, traitType);
    }

    private parseImplTarget(typeA: TypeNode): { target: TypeNode; traitType?: TypeNode } {
        if (!this.check(TokenType.For)) {
            return { target: typeA };
        }
        this.advance();
        return { target: this.parseTypeNode(), traitType: typeA };
    }

    private parseImplMember(methods: FnItem[]): void {
        const { derives } = this.parseAttributes();
        this.eatPub();
        this.eat(TokenType.Unsafe);
        if (this.eat(TokenType.Fn)) {
            methods.push(this.parseFnBody(this.peek(), derives));
            return;
        }
        if (this.check(TokenType.Type) || this.check(TokenType.Const) || this.check(TokenType.Static)) {
            this.advance();
            this.skipUntil(TokenType.Semicolon, TokenType.CloseCurly);
            this.eat(TokenType.Semicolon);
            return;
        }
        this.reportUnexpectedImplToken();
    }

    private reportUnexpectedImplToken(): void {
        const tok = this.peek();
        if (tok.type !== TokenType.CloseCurly && tok.type !== TokenType.Eof) {
            this.errors.push({
                message: `Unexpected token in impl block: '${tok.value}'`,
                line: tok.line,
                column: tok.column,
            });
            this.advance();
        }
    }

    // -----------------------------------------------------------------------
    // Trait item
    // -----------------------------------------------------------------------

    private parseTraitBody(startTok: Token): TraitItem {
        const name = this.expect(TokenType.Identifier).value;
        this.skipGenericParams();

        // Skip : Bounds
        if (this.eat(TokenType.Colon)) {
            while (!this.check(TokenType.OpenCurly) && !this.check(TokenType.Where) && !this.check(TokenType.Eof)) {
                this.advance();
            }
        }

        this.skipWhereClause();
        this.expect(TokenType.OpenCurly);

        const methods: FnItem[] = [];
        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            const { derives } = this.parseAttributes();
            this.eatPub();
            if (this.eat(TokenType.Unsafe)) {
                // Consume
            }
            if (this.eat(TokenType.Fn)) {
                const fnStart = this.peek();
                methods.push(this.parseFnBody(fnStart, derives));
            } else if (this.check(TokenType.Type)) {
                while (!this.check(TokenType.Semicolon) && !this.check(TokenType.Eof) && !this.check(TokenType.CloseCurly)) {
                    this.advance();
                }
                this.eat(TokenType.Semicolon);
            } else {
                const tok = this.peek();
                if (tok.type !== TokenType.CloseCurly && tok.type !== TokenType.Eof) {
                    this.advance();
                }
            }
        }

        this.expect(TokenType.CloseCurly);
        return new TraitItem(this.spanFrom(startTok), name, methods);
    }

    // -----------------------------------------------------------------------
    // Mod item
    // -----------------------------------------------------------------------

    private parseModBody(startTok: Token): ModItem {
        const name = this.expect(TokenType.Identifier).value;

        if (this.eat(TokenType.Semicolon)) {
            // External mod — no body
            return new ModItem(this.spanFrom(startTok), name, []);
        }

        this.expect(TokenType.OpenCurly);
        const mod = this.parseModuleNode(name);
        this.expect(TokenType.CloseCurly);
        return new ModItem(this.spanFrom(startTok), name, mod.items);
    }

    // -----------------------------------------------------------------------
    // Use item
    // -----------------------------------------------------------------------

    private parseUseBody(startTok: Token): UseItem[] {
        const items = this.parseUsePath(startTok, []);
        this.eat(TokenType.Semicolon);
        return items;
    }

    private parseUsePath(startTok: Token, prefix: string[]): UseItem[] {
        // Collect path segments
        const segments: string[] = [...prefix];

        // Crate:: or self:: or super::
        if (this.check(TokenType.Identifier) || this.check(TokenType.Self)) {
            segments.push(this.advance().value);
        }

        while (this.checkColonColon()) {
            this.eatColonColon();

            if (this.check(TokenType.OpenCurly)) {
                // Use a::b::{ c, d }
                this.advance(); // Consume {
                const result: UseItem[] = [];
                while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
                    result.push(...this.parseUsePath(startTok, segments));
                    if (!this.eat(TokenType.Comma)) break;
                }
                this.expect(TokenType.CloseCurly);
                return result;
            }

            if (this.check(TokenType.Star)) {
                this.advance();
                return [new UseItem(this.spanFrom(startTok), [...segments, "*"])];
            }

            if (this.check(TokenType.Identifier) || this.check(TokenType.Self)) {
                segments.push(this.advance().value);
            } else {
                break;
            }
        }

        // Optional `as alias`
        if (this.check(TokenType.Identifier) && this.peek().value === "as") {
            this.advance(); // Consume "as"
            this.eat(TokenType.Identifier); // Consume alias (dropped)
        }

        if (segments.length === 0) return [];
        return [new UseItem(this.spanFrom(startTok), segments)];
    }

    // -----------------------------------------------------------------------
    // Block
    // -----------------------------------------------------------------------

    parseBlock(): BlockExpr {
        const start = this.peek();
        this.expect(TokenType.OpenCurly);
        const stmts: Statement[] = [];
        let tail: Expression | undefined;

        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            const stmt = this.parseStatement();
            if (stmt === undefined) break;

            if (stmt instanceof ExprStmt && stmt.isReturn) {
                // Block-like expressions (if/match/loop/while/for/block) don't
                // Need a trailing semicolon to appear as statements mid-block.
                if (!this.check(TokenType.CloseCurly) && isBlockLikeExpr(stmt.expr)) {
                    stmts.push(new ExprStmt(stmt.span, stmt.expr, false));
                    continue;
                }
                tail = stmt.expr;
                break;
            }
            stmts.push(stmt);
        }

        this.expect(TokenType.CloseCurly);
        return new BlockExpr(this.spanFrom(start), stmts, tail);
    }

    private skipBlock(): void {
        if (!this.eat(TokenType.OpenCurly)) return;
        let depth = 1;
        while (depth > 0 && !this.check(TokenType.Eof)) {
            if (this.check(TokenType.OpenCurly)) depth++;
            else if (this.check(TokenType.CloseCurly)) depth--;
            this.advance();
        }
    }

    // -----------------------------------------------------------------------
    // Statements
    // -----------------------------------------------------------------------

    parseStatement(): Statement | undefined {
        // Skip standalone semicolons
        if (this.eat(TokenType.Semicolon)) return this.parseStatement();

        const start = this.peek();
        return (
            this.parseLetStatement(start) ??
            this.parseItemStatement(start) ??
            this.parseExpressionStatement(start)
        );
    }

    private parseLetStatement(start: Token): Statement | undefined {
        if (!this.eat(TokenType.Let)) return undefined;
        const pat = this.parsePattern();
        let ty: TypeNode = new NamedTypeNode(this.spanFrom(start), "_");
        if (this.eat(TokenType.Colon)) {
            ty = this.parseTypeNode();
        }
        this.expect(TokenType.Eq);
        const init = this.parseExpr(0);
        this.eat(TokenType.Semicolon);
        return new LetStmt(this.spanFrom(start), pat, ty, init);
    }

    private parseItemStatement(start: Token): Statement | undefined {
        if (!this.isStatementItemStart()) return undefined;
        const items = this.parseItems();
        if (items.length > 0) {
            return new ItemStmt(this.spanFrom(start), items[0]);
        }
        return undefined;
    }

    private parseExpressionStatement(start: Token): Statement | undefined {
        if (!this.canStartExpression()) {
            this.reportUnexpectedStatement();
            return undefined;
        }
        const expr = this.parseExpr(0);
        return new ExprStmt(this.spanFrom(start), expr, !this.eat(TokenType.Semicolon));
    }

    private isStatementItemStart(): boolean {
        if (ITEM_START_TOKENS.has(this.peek().type)) return true;
        return this.check(TokenType.Pub) && ITEM_START_TOKENS.has(this.peekAt(1).type);
    }

    private reportUnexpectedStatement(): void {
        const tok = this.peek();
        if (tok.type !== TokenType.CloseCurly && tok.type !== TokenType.Eof) {
            this.errors.push({
                message: `Unexpected token '${tok.value}' in statement`,
                line: tok.line,
                column: tok.column,
            });
            this.advance();
        }
    }

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    parseTypeNode(): TypeNode {
        const start = this.peek();

        if (this.check(TokenType.Lifetime)) {
            this.advance();
            return this.parseTypeNode();
        }
        return (
            this.parseReferenceType(start) ??
            this.parsePointerType(start) ??
            this.parseParenType(start) ??
            this.parseBracketType(start) ??
            this.parseFnType(start) ??
            this.parseNamedType(start) ??
            this.parseUnknownType(start)
        );
    }

    private parseReferenceType(start: Token): TypeNode | undefined {
        if (!this.eat(TokenType.And)) return undefined;
        if (this.check(TokenType.Lifetime)) this.advance();
        const mut = this.eat(TokenType.Mut) !== undefined;
        const inner = this.parseTypeNode();
        return new RefTypeNode(
            this.spanFrom(start),
            mut ? Mutability.Mutable : Mutability.Immutable,
            inner,
        );
    }

    private parsePointerType(start: Token): TypeNode | undefined {
        if (!this.eat(TokenType.Star)) return undefined;
        const mut = this.eat(TokenType.Mut) !== undefined;
        if (!mut) this.eat(TokenType.Const);
        const inner = this.parseTypeNode();
        return new PtrTypeNode(
            this.spanFrom(start),
            mut ? Mutability.Mutable : Mutability.Immutable,
            inner,
        );
    }

    private parseParenType(start: Token): TypeNode | undefined {
        if (!this.eat(TokenType.OpenParen)) return undefined;
        if (this.eat(TokenType.CloseParen)) {
            return new TupleTypeNode(this.spanFrom(start), []);
        }
        const first = this.parseTypeNode();
        if (this.eat(TokenType.CloseParen)) {
            return first;
        }
        this.expect(TokenType.Comma);
        const elements: TypeNode[] = [first];
        while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
            elements.push(this.parseTypeNode());
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseParen);
        return new TupleTypeNode(this.spanFrom(start), elements);
    }

    private parseBracketType(start: Token): TypeNode | undefined {
        if (!this.eat(TokenType.OpenSquare)) return undefined;
        const elem = this.parseTypeNode();
        if (this.eat(TokenType.Semicolon)) {
            const len = this.parseExpr(0);
            this.expect(TokenType.CloseSquare);
            return new ArrayTypeNode(this.spanFrom(start), elem, len);
        }
        this.expect(TokenType.CloseSquare);
        return new NamedTypeNode(
            this.spanFrom(start),
            "slice",
            new GenericArgsNode(this.spanFrom(start), [elem]),
        );
    }

    private parseFnType(start: Token): TypeNode | undefined {
        if (!this.eat(TokenType.Fn)) return undefined;
        this.expect(TokenType.OpenParen);
        const params: TypeNode[] = [];
        while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
            if (
                (this.check(TokenType.Identifier) || this.check(TokenType.Self)) &&
                this.peekAt(1).type === TokenType.Colon
            ) {
                this.advance();
                this.advance();
            }
            params.push(this.parseTypeNode());
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseParen);
        let retType: TypeNode = new TupleTypeNode(this.spanFrom(start), []);
        if (this.eatThinArrow()) {
            retType = this.parseTypeNode();
        }
        return new FnTypeNode(this.spanFrom(start), params, retType);
    }

    private parseNamedType(start: Token): TypeNode | undefined {
        if (!this.check(TokenType.Identifier) && !this.check(TokenType.Self)) return undefined;
        let name = this.advance().value;
        while (this.checkColonColon()) {
            const next2 = this.peekAt(2).type;
            if (next2 === TokenType.Lt) {
                this.eatColonColon();
                break;
            }
            if (next2 !== TokenType.Identifier && next2 !== TokenType.Self) break;
            this.eatColonColon();
            name += `::${this.advance().value}`;
        }
        const args = this.check(TokenType.Lt) ? this.parseGenericArgs() : undefined;
        return new NamedTypeNode(this.spanFrom(start), name, args);
    }

    private parseUnknownType(start: Token): TypeNode {
        const errTok = this.peek();
        this.errors.push({
            message: `Expected type, got '${errTok.value}'`,
            line: errTok.line,
            column: errTok.column,
        });
        return new NamedTypeNode(this.spanFrom(start), "_");
    }

    private parseGenericArgs(): GenericArgsNode {
        const start = this.peek();
        this.expect(TokenType.Lt);
        const args: TypeNode[] = [];
        while (!this.check(TokenType.Gt) && !this.check(TokenType.Eof)) {
            args.push(this.parseTypeNode());
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.Gt);
        return new GenericArgsNode(this.spanFrom(start), args);
    }

    // -----------------------------------------------------------------------
    // Patterns
    // -----------------------------------------------------------------------

    parsePattern(): Pattern {
        const start = this.peek();
        const pat = this.parsePatternAtom();

        // Or pattern
        if (this.check(TokenType.Pipe)) {
            const alts: Pattern[] = [pat];
            while (this.eat(TokenType.Pipe)) {
                alts.push(this.parsePatternAtom());
            }
            return new OrPattern(this.spanFrom(start), alts);
        }

        return pat;
    }

    private parsePatternAtom(): Pattern {
        const start = this.peek();
        return (
            this.parseWildcardPattern(start) ??
            this.parseMutablePattern(start) ??
            this.parseNumericPattern(start) ??
            this.parseBooleanPattern(start) ??
            this.parseStringPattern(start) ??
            this.parseTuplePatternNode(start) ??
            this.parseSlicePatternNode(start) ??
            this.parsePathPattern(start) ??
            this.parseUnknownPattern()
        );
    }

    private parseWildcardPattern(start: Token): Pattern | undefined {
        if (!this.check(TokenType.Identifier) || this.peek().value !== "_") return undefined;
        this.advance();
        return new WildcardPattern(this.spanFrom(start));
    }

    private parseMutablePattern(start: Token): Pattern | undefined {
        if (!this.eat(TokenType.Mut)) return undefined;
        const name = this.expect(TokenType.Identifier).value;
        if (this.eat(TokenType.At)) {
            const subPat = this.parsePatternAtom();
            return new BindingPattern(this.spanFrom(start), name, Mutability.Mutable, subPat);
        }
        return new IdentPattern(
            this.spanFrom(start),
            name,
            Mutability.Mutable,
            new NamedTypeNode(this.spanFrom(start), "_"),
        );
    }

    private parseNumericPattern(start: Token): Pattern | undefined {
        const literal = this.tryParseNumericLiteralPattern(start);
        if (literal === undefined) return undefined;
        if (this.checkDotDotEq()) {
            this.eatDotDotEq();
            return new RangePattern(this.spanFrom(start), literal, this.parseLiteralPatternEnd());
        }
        if (this.checkDotDot()) {
            this.eatDotDot();
            return new RangePattern(this.spanFrom(start), literal, this.parseLiteralPatternEnd());
        }
        return literal;
    }

    private tryParseNumericLiteralPattern(start: Token): LiteralPattern | undefined {
        let isNegative = false;
        const saved = this.pos;
        if (this.eat(TokenType.Minus)) {
            isNegative = true;
        }
        if (!this.check(TokenType.Integer) && !this.check(TokenType.Float)) {
            this.pos = saved;
            return undefined;
        }
        const tok = this.advance();
        if (this.check(TokenType.Identifier) && isTypeSuffix(this.peek().value)) {
            this.advance();
        }
        const isFloat = tok.type === TokenType.Float;
        const rawValue = isFloat ? Number.parseFloat(tok.value) : parseIntValue(tok.value);
        const value = isNegative ? -rawValue : rawValue;
        return new LiteralPattern(
            this.spanFrom(start),
            isFloat ? LiteralKind.Float : LiteralKind.Int,
            value,
        );
    }

    private parseBooleanPattern(start: Token): Pattern | undefined {
        if (!this.check(TokenType.True) && !this.check(TokenType.False)) return undefined;
        const tok = this.advance();
        return new LiteralPattern(
            this.spanFrom(start),
            LiteralKind.Bool,
            tok.type === TokenType.True,
        );
    }

    private parseStringPattern(start: Token): Pattern | undefined {
        if (!this.check(TokenType.String)) return undefined;
        const tok = this.advance();
        return new LiteralPattern(
            this.spanFrom(start),
            isCharLiteral(tok.value) ? LiteralKind.Char : LiteralKind.String,
            processStringValue(tok.value),
        );
    }

    private parseTuplePatternNode(start: Token): Pattern | undefined {
        if (!this.eat(TokenType.OpenParen)) return undefined;
        if (this.eat(TokenType.CloseParen)) {
            return new TuplePattern(this.spanFrom(start), []);
        }
        const elements: Pattern[] = [];
        do {
            elements.push(this.parsePattern());
        } while (this.eat(TokenType.Comma) && !this.check(TokenType.CloseParen));
        this.expect(TokenType.CloseParen);
        return new TuplePattern(this.spanFrom(start), elements);
    }

    private parseSlicePatternNode(start: Token): Pattern | undefined {
        if (!this.eat(TokenType.OpenSquare)) return undefined;
        const elements: Pattern[] = [];
        let rest: Pattern | undefined;
        while (!this.check(TokenType.CloseSquare) && !this.check(TokenType.Eof)) {
            if (this.checkDotDot()) {
                this.eatDotDot();
                if (!this.check(TokenType.CloseSquare) && !this.check(TokenType.Comma)) {
                    rest = this.parsePatternAtom();
                }
                this.eat(TokenType.Comma);
                break;
            }
            elements.push(this.parsePatternAtom());
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseSquare);
        return new SlicePattern(this.spanFrom(start), elements, rest);
    }

    private parsePathPattern(start: Token): Pattern | undefined {
        if (!this.check(TokenType.Identifier) && !this.check(TokenType.Self)) return undefined;
        const { lastName, pathExpr } = this.parsePatternPath(start);
        if (this.eat(TokenType.OpenCurly)) {
            return this.finishStructPattern(start, pathExpr);
        }
        if (this.eat(TokenType.OpenParen)) {
            return this.finishTupleStructPattern(start, pathExpr);
        }
        if (this.eat(TokenType.At)) {
            return new BindingPattern(
                this.spanFrom(start),
                lastName,
                Mutability.Immutable,
                this.parsePatternAtom(),
            );
        }
        return new IdentPattern(
            this.spanFrom(start),
            lastName,
            Mutability.Immutable,
            new NamedTypeNode(this.spanFrom(start), "_"),
        );
    }

    private parsePatternPath(start: Token): { lastName: string; pathExpr: Expression } {
        const firstName = this.advance().value;
        const segments: string[] = [firstName];
        while (
            this.checkColonColon() &&
            (this.peekAt(2).type === TokenType.Identifier || this.peekAt(2).type === TokenType.Self)
        ) {
            this.eatColonColon();
            segments.push(this.advance().value);
        }
        const lastName = segments[segments.length - 1];
        return {
            lastName,
            pathExpr:
                segments.length > 1
                    ? new PathExpr(this.spanFrom(start), segments)
                    : new IdentifierExpr(this.spanFrom(start), lastName),
        };
    }

    private finishStructPattern(start: Token, pathExpr: Expression): Pattern {
        const fields: StructPatternField[] = [];
        let hasRest = false;
        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            if (this.checkDotDot()) {
                this.eatDotDot();
                hasRest = true;
                break;
            }
            const fieldName = this.expect(TokenType.Identifier).value;
            const pattern = this.eat(TokenType.Colon)
                ? this.parsePattern()
                : new IdentPattern(
                    this.spanFrom(start),
                    fieldName,
                    Mutability.Immutable,
                    new NamedTypeNode(this.spanFrom(start), "_"),
                );
            fields.push({ name: fieldName, pattern });
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseCurly);
        return new StructPattern(this.spanFrom(start), pathExpr, fields, hasRest);
    }

    private finishTupleStructPattern(start: Token, pathExpr: Expression): Pattern {
        const elems: Pattern[] = [];
        while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
            elems.push(this.parsePattern());
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseParen);
        const fields: StructPatternField[] = elems.map((pattern, index) => ({
            name: String(index),
            pattern,
        }));
        return new StructPattern(this.spanFrom(start), pathExpr, fields, false);
    }

    private parseUnknownPattern(): Pattern {
        const tok = this.peek();
        this.errors.push({
            message: `Expected pattern, got '${tok.value}'`,
            line: tok.line,
            column: tok.column,
        });
        if (tok.type !== TokenType.Eof && tok.type !== TokenType.CloseCurly) {
            this.advance();
        }
        return new WildcardPattern(this.makeSpan(tok));
    }

    private parseLiteralPatternEnd(): LiteralPattern {
        const start = this.peek();
        const hasMinus = this.eat(TokenType.Minus) !== undefined;
        if (this.check(TokenType.Integer) || this.check(TokenType.Float)) {
            const tok = this.advance();
            if (this.check(TokenType.Identifier) && isTypeSuffix(this.peek().value)) {
                this.advance();
            }
            const isFloat = tok.type === TokenType.Float;
            const rawVal = isFloat ? Number.parseFloat(tok.value) : parseIntValue(tok.value);
            const v = hasMinus ? -rawVal : rawVal;
            return new LiteralPattern(
                this.spanFrom(start),
                isFloat ? LiteralKind.Float : LiteralKind.Int,
                v,
            );
        }
        if (this.check(TokenType.String)) {
            const tok = this.advance();
            return new LiteralPattern(
                this.spanFrom(start),
                isCharLiteral(tok.value) ? LiteralKind.Char : LiteralKind.String,
                processStringValue(tok.value),
            );
        }
        return new LiteralPattern(this.spanFrom(start), LiteralKind.Int, ERROR_LITERAL_VALUE);
    }

    // -----------------------------------------------------------------------
    // Expressions — Pratt parser
    // -----------------------------------------------------------------------

    parseExpr(minPrec: number, noStructLiteral = false): Expression {
        let left = this.parsePrefix(noStructLiteral);

        for (;;) {
            const nextLeft = this.parsePostfixExpr(left, minPrec);
            if (nextLeft === undefined) break;
            left = nextLeft;
        }

        for (;;) {
            const prec = this.getInfixPrec();
            if (prec <= minPrec) break;
            left = this.parseInfix(left, prec, noStructLiteral);
        }

        return left;
    }

    private parsePostfixExpr(left: Expression, minPrec: number): Expression | undefined {
        if (minPrec >= POSTFIX_PRECEDENCE) return undefined;
        return (
            this.parseDotPostfix(left) ??
            this.parseCallPostfix(left) ??
            this.parseIndexPostfix(left) ??
            this.parseTryPostfix(left) ??
            this.parseTurbofishPostfix(left) ??
            this.parseCastPostfix(left)
        );
    }

    private parseDotPostfix(left: Expression): Expression | undefined {
        if (!this.check(TokenType.Dot) || this.checkDotDot() || this.checkDotDotEq()) return undefined;
        this.advance();
        if (this.check(TokenType.Integer)) {
            const idxTok = this.advance();
            return new FieldExpr(this.spanFrom(idxTok), left, idxTok.value);
        }
        const fieldTok = this.peek();
        const field = this.expect(TokenType.Identifier).value;
        let typeArgs: TypeNode[] | undefined;
        if (this.checkColonColon() && this.peekAt(2).type === TokenType.Lt) {
            this.eatColonColon();
            typeArgs = this.parseGenericArgs().args;
        }
        if (!this.eat(TokenType.OpenParen)) {
            return new FieldExpr(this.spanFrom(fieldTok), left, field);
        }
        const args = this.parseArgList();
        this.expect(TokenType.CloseParen);
        const fieldExpr = new FieldExpr(this.spanFrom(fieldTok), left, field);
        return new CallExpr(this.spanFrom(fieldTok), fieldExpr, args, typeArgs);
    }

    private parseCallPostfix(left: Expression): Expression | undefined {
        if (!this.check(TokenType.OpenParen)) return undefined;
        const callStart = this.peek();
        this.advance();
        const args = this.parseArgList();
        this.expect(TokenType.CloseParen);
        return new CallExpr(this.spanFrom(callStart), left, args);
    }

    private parseIndexPostfix(left: Expression): Expression | undefined {
        if (!this.check(TokenType.OpenSquare)) return undefined;
        const idxStart = this.peek();
        this.advance();
        const index = this.parseExpr(0);
        this.expect(TokenType.CloseSquare);
        return new IndexExpr(this.spanFrom(idxStart), left, index);
    }

    private parseTryPostfix(left: Expression): Expression | undefined {
        if (!this.check(TokenType.Question)) return undefined;
        this.advance();
        return left;
    }

    private parseTurbofishPostfix(left: Expression): Expression | undefined {
        if (!this.checkColonColon() || this.peekAt(2).type !== TokenType.Lt) return undefined;
        this.eatColonColon();
        const ga = this.parseGenericArgs();
        if (!this.eat(TokenType.OpenParen)) return left;
        const args = this.parseArgList();
        this.expect(TokenType.CloseParen);
        return new CallExpr(ga.span, left, args, ga.args);
    }

    private parseCastPostfix(left: Expression): Expression | undefined {
        if (!this.check(TokenType.Identifier) || this.peek().value !== "as") return undefined;
        this.advance();
        this.parseTypeNode();
        return left;
    }

    private getInfixPrec(): number {
        const tok = this.peek().type;
        if (tok === TokenType.Dot) {
            return this.checkDotDot() || this.checkDotDotEq() ? RANGE_PRECEDENCE : 0;
        }
        if (tok === TokenType.Lt) {
            return this.peekAt(1).type === TokenType.Lt ? ADDITIVE_PRECEDENCE : COMPARISON_PRECEDENCE;
        }
        if (tok === TokenType.Gt) {
            return this.peekAt(1).type === TokenType.Gt ? ADDITIVE_PRECEDENCE : COMPARISON_PRECEDENCE;
        }
        return INFIX_PRECEDENCE.get(tok) ?? 0;
    }

    private parseInfix(left: Expression, prec: number, noStructLiteral: boolean): Expression {
        const start = this.peek();
        return (
            this.parseRangeInfix(start, left, noStructLiteral) ??
            this.parseAssignmentInfix(start, left, prec, noStructLiteral) ??
            this.parseShiftInfix(start, left, prec, noStructLiteral) ??
            this.parseBinaryInfix(start, left, prec, noStructLiteral) ??
            this.parseInvalidInfix(start, left)
        );
    }

    private parseRangeInfix(
        start: Token,
        left: Expression,
        noStructLiteral: boolean,
    ): Expression | undefined {
        if (this.checkDotDotEq()) {
            this.eatDotDotEq();
            return this.finishRangeInfix(start, left, noStructLiteral, true);
        }
        if (!this.checkDotDot()) return undefined;
        this.eatDotDot();
        return this.finishRangeInfix(start, left, noStructLiteral, false);
    }

    private finishRangeInfix(
        start: Token,
        left: Expression,
        noStructLiteral: boolean,
        inclusive: boolean,
    ): Expression {
        if (this.canStartExpression()) {
            const right = this.parseExpr(RANGE_PRECEDENCE, noStructLiteral);
            return new RangeExpr(this.spanFrom(start), left, right, inclusive);
        }
        return new RangeExpr(this.spanFrom(start), left, undefined, inclusive);
    }

    private parseAssignmentInfix(
        start: Token,
        left: Expression,
        prec: number,
        noStructLiteral: boolean,
    ): Expression | undefined {
        if (this.check(TokenType.Eq)) {
            this.advance();
            return new AssignExpr(
                this.spanFrom(start),
                left,
                this.parseExpr(prec - 1, noStructLiteral),
            );
        }
        const compoundOp = COMPOUND_ASSIGNMENT_OPERATORS[this.peek().type];
        if (compoundOp === undefined) return undefined;
        this.advance();
        const right = this.parseExpr(prec - 1, noStructLiteral);
        return new AssignExpr(
            this.spanFrom(start),
            left,
            new BinaryExpr(this.spanFrom(start), compoundOp, left, right),
        );
    }

    private parseShiftInfix(
        start: Token,
        left: Expression,
        prec: number,
        noStructLiteral: boolean,
    ): Expression | undefined {
        if (this.check(TokenType.Lt) && this.peekAt(1).type === TokenType.Lt) {
            this.advance();
            this.advance();
            return new BinaryExpr(
                this.spanFrom(start),
                BinaryOp.Shl,
                left,
                this.parseExpr(prec, noStructLiteral),
            );
        }
        if (!this.check(TokenType.Gt) || this.peekAt(1).type !== TokenType.Gt) return undefined;
        this.advance();
        this.advance();
        return new BinaryExpr(
            this.spanFrom(start),
            BinaryOp.Shr,
            left,
            this.parseExpr(prec, noStructLiteral),
        );
    }

    private parseBinaryInfix(
        start: Token,
        left: Expression,
        prec: number,
        noStructLiteral: boolean,
    ): Expression | undefined {
        const op = BINARY_OPERATORS[this.peek().type];
        if (op === undefined) return undefined;
        this.advance();
        return new BinaryExpr(this.spanFrom(start), op, left, this.parseExpr(prec, noStructLiteral));
    }

    private parseInvalidInfix(start: Token, left: Expression): Expression {
        this.errors.push({
            message: `Unexpected infix token '${start.value}'`,
            line: start.line,
            column: start.column,
        });
        this.advance();
        return left;
    }

    private parsePrefix(noStructLiteral: boolean): Expression {
        const start = this.peek();
        return (
            this.parseLiteralPrefix(start) ??
            this.parseRangePrefix(start, noStructLiteral) ??
            this.parseControlFlowPrefix(start, noStructLiteral) ??
            this.parseUnaryPrefix(start, noStructLiteral) ??
            this.parseGroupingPrefix(start) ??
            this.parseArrayPrefix(start) ??
            this.parseClosurePrefix(start) ??
            this.parsePathPrefix(start, noStructLiteral) ??
            this.parseInvalidPrefix(start)
        );
    }

    private parseIdentifierExpr(startTok: Token, noStructLiteral: boolean): Expression {
        const { baseExpr, lastName } = this.parsePathExpression(startTok);
        const macroExpr = this.parseMacroExpr(startTok, lastName);
        if (macroExpr !== undefined) return macroExpr;
        if (!noStructLiteral && this.check(TokenType.OpenCurly)) {
            return this.parseStructExpr(startTok, baseExpr);
        }
        return baseExpr;
    }

    private parseLiteralPrefix(start: Token): Expression | undefined {
        if (this.check(TokenType.Integer)) {
            const tok = this.advance();
            if (this.check(TokenType.Identifier) && isTypeSuffix(this.peek().value)) {
                this.advance();
            }
            return new LiteralExpr(this.spanFrom(start), LiteralKind.Int, parseIntValue(tok.value));
        }
        if (this.check(TokenType.Float)) {
            const tok = this.advance();
            if (this.check(TokenType.Identifier) && isTypeSuffix(this.peek().value)) {
                this.advance();
            }
            return new LiteralExpr(this.spanFrom(start), LiteralKind.Float, Number.parseFloat(tok.value));
        }
        if (this.check(TokenType.True) || this.check(TokenType.False)) {
            const tok = this.advance();
            return new LiteralExpr(this.spanFrom(start), LiteralKind.Bool, tok.type === TokenType.True);
        }
        if (!this.check(TokenType.String)) return undefined;
        const tok = this.advance();
        return new LiteralExpr(
            this.spanFrom(start),
            isCharLiteral(tok.value) ? LiteralKind.Char : LiteralKind.String,
            processStringValue(tok.value),
        );
    }

    private parseRangePrefix(start: Token, noStructLiteral: boolean): Expression | undefined {
        if (this.checkDotDotEq()) {
            this.eatDotDotEq();
            return this.finishPrefixRange(start, noStructLiteral, true);
        }
        if (!this.checkDotDot()) return undefined;
        this.eatDotDot();
        return this.finishPrefixRange(start, noStructLiteral, false);
    }

    private finishPrefixRange(start: Token, noStructLiteral: boolean, inclusive: boolean): Expression {
        if (this.canStartExpression()) {
            const end = this.parseExpr(RANGE_PRECEDENCE, noStructLiteral);
            return new RangeExpr(this.spanFrom(start), undefined, end, inclusive);
        }
        return new RangeExpr(this.spanFrom(start), undefined, undefined, inclusive);
    }

    private parseControlFlowPrefix(start: Token, noStructLiteral: boolean): Expression | undefined {
        if (this.check(TokenType.OpenCurly)) return this.parseBlock();
        if (this.eat(TokenType.If)) return this.parseIfExpr(start);
        if (this.eat(TokenType.Match)) return this.parseMatchExpr(start);
        if (this.eat(TokenType.Return)) {
            const value = this.canStartExpression() ? this.parseExpr(0, noStructLiteral) : undefined;
            return new ReturnExpr(this.spanFrom(start), value);
        }
        if (this.eat(TokenType.Break)) {
            if (this.check(TokenType.Lifetime)) this.advance();
            const value = this.canStartExpression() ? this.parseExpr(0, noStructLiteral) : undefined;
            return new BreakExpr(this.spanFrom(start), value);
        }
        if (this.eat(TokenType.Continue)) {
            if (this.check(TokenType.Lifetime)) this.advance();
            return new ContinueExpr(this.spanFrom(start));
        }
        if (this.eat(TokenType.Loop)) {
            return new LoopExpr(this.spanFrom(start), this.parseBlock());
        }
        if (this.eat(TokenType.While)) {
            return new WhileExpr(this.spanFrom(start), this.parseExpr(0, true), this.parseBlock());
        }
        if (!this.eat(TokenType.For)) return undefined;
        const pat = this.parsePattern();
        this.consumeForInToken();
        return new ForExpr(this.spanFrom(start), pat, this.parseExpr(0, true), this.parseBlock());
    }

    private consumeForInToken(): void {
        if (this.check(TokenType.In)) {
            this.advance();
            return;
        }
        if (this.check(TokenType.Identifier) && this.peek().value === "in") {
            this.advance();
            return;
        }
        this.expect(TokenType.In);
    }

    private parseUnaryPrefix(start: Token, noStructLiteral: boolean): Expression | undefined {
        if (this.eat(TokenType.And)) {
            if (this.check(TokenType.Lifetime)) this.advance();
            const mut = this.eat(TokenType.Mut) !== undefined;
            const inner = this.parseExpr(POSTFIX_PRECEDENCE, noStructLiteral);
            return new RefExpr(
                this.spanFrom(start),
                mut ? Mutability.Mutable : Mutability.Immutable,
                inner,
            );
        }
        if (this.eat(TokenType.Star)) {
            return new DerefExpr(
                this.spanFrom(start),
                this.parseExpr(POSTFIX_PRECEDENCE, noStructLiteral),
            );
        }
        if (this.eat(TokenType.Minus)) {
            return new UnaryExpr(
                this.spanFrom(start),
                UnaryOp.Neg,
                this.parseExpr(POSTFIX_PRECEDENCE, noStructLiteral),
            );
        }
        if (!this.eat(TokenType.Bang)) return undefined;
        return new UnaryExpr(
            this.spanFrom(start),
            UnaryOp.Not,
            this.parseExpr(POSTFIX_PRECEDENCE, noStructLiteral),
        );
    }

    private parseGroupingPrefix(start: Token): Expression | undefined {
        if (!this.eat(TokenType.OpenParen)) return undefined;
        if (this.eat(TokenType.CloseParen)) {
            return new LiteralExpr(this.spanFrom(start), LiteralKind.Int, UNIT_LITERAL_VALUE);
        }
        const first = this.parseExpr(0);
        if (this.eat(TokenType.CloseParen)) return first;
        this.expect(TokenType.Comma);
        const elems: Expression[] = [first];
        while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
            elems.push(this.parseExpr(0));
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseParen);
        return new MacroExpr(this.spanFrom(start), "tuple", elems);
    }

    private parseArrayPrefix(start: Token): Expression | undefined {
        if (!this.eat(TokenType.OpenSquare)) return undefined;
        const elems: Expression[] = [];
        while (!this.check(TokenType.CloseSquare) && !this.check(TokenType.Eof)) {
            elems.push(this.parseExpr(0));
            if (!this.eat(TokenType.Comma)) break;
        }
        this.expect(TokenType.CloseSquare);
        return new MacroExpr(this.spanFrom(start), "vec", elems);
    }

    private parseClosurePrefix(start: Token): Expression | undefined {
        if (!this.check(TokenType.Pipe) && !this.check(TokenType.PipePipe)) return undefined;
        return this.parseClosureExpr(start);
    }

    private parsePathPrefix(start: Token, noStructLiteral: boolean): Expression | undefined {
        if (!this.check(TokenType.Identifier) && !this.check(TokenType.Self)) return undefined;
        return this.parseIdentifierExpr(start, noStructLiteral);
    }

    private parseInvalidPrefix(start: Token): Expression {
        const tok = this.peek();
        this.errors.push({
            message: `Unexpected token '${tok.value}' in expression`,
            line: tok.line,
            column: tok.column,
        });
        if (tok.type !== TokenType.Eof) this.advance();
        return new LiteralExpr(this.spanFrom(start), LiteralKind.Int, ERROR_LITERAL_VALUE);
    }

    private parsePathExpression(startTok: Token): { baseExpr: Expression; lastName: string } {
        const firstName = this.advance().value;
        const segments: string[] = [firstName];
        while (this.checkColonColon()) {
            const next2Type = this.peekAt(2).type;
            if (next2Type !== TokenType.Identifier && next2Type !== TokenType.Self) break;
            this.eatColonColon();
            segments.push(this.advance().value);
        }
        const lastName = segments[segments.length - 1];
        return {
            baseExpr:
                segments.length > 1
                    ? new PathExpr(this.spanFrom(startTok), segments)
                    : new IdentifierExpr(this.spanFrom(startTok), lastName),
            lastName,
        };
    }

    private parseMacroExpr(startTok: Token, macroName: string): Expression | undefined {
        if (!this.check(TokenType.Bang) || this.peekAt(1).type === TokenType.Eq) return undefined;
        this.advance();
        const args = this.parseDelimitedMacroArgs();
        return new MacroExpr(this.spanFrom(startTok), macroName, args);
    }

    private parseDelimitedMacroArgs(): Expression[] {
        if (this.eat(TokenType.OpenParen)) {
            return this.parseMacroArgsUntil(TokenType.CloseParen, false);
        }
        if (this.eat(TokenType.OpenSquare)) {
            return this.parseMacroArgsUntil(TokenType.CloseSquare, false);
        }
        if (this.eat(TokenType.OpenCurly)) {
            return this.parseMacroArgsUntil(TokenType.CloseCurly, true);
        }
        return [];
    }

    private parseMacroArgsUntil(closeToken: TokenType, allowSemicolon: boolean): Expression[] {
        const args: Expression[] = [];
        while (!this.check(closeToken) && !this.check(TokenType.Eof)) {
            args.push(this.parseExpr(0));
            if (this.eat(TokenType.Comma)) continue;
            if (allowSemicolon && this.eat(TokenType.Semicolon)) continue;
            break;
        }
        this.expect(closeToken);
        return args;
    }

    private parseStructExpr(startTok: Token, path: Expression): StructExpr {
        this.expect(TokenType.OpenCurly);
        const fields = new Map<string, Expression>();

        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            // Rest: ..expr
            if (this.checkDotDot()) {
                this.eatDotDot();
                this.parseExpr(0); // Spread; ignored for now.
                break;
            }

            const fieldName = this.expect(TokenType.Identifier).value;
            if (this.eat(TokenType.Colon)) {
                fields.set(fieldName, this.parseExpr(0));
            } else {
                // Shorthand: field name = variable with same name
                fields.set(fieldName, new IdentifierExpr(this.spanFrom(startTok), fieldName));
            }
            if (!this.eat(TokenType.Comma)) break;
        }

        this.expect(TokenType.CloseCurly);
        return new StructExpr(this.spanFrom(startTok), path, fields);
    }

    private parseClosureExpr(startTok: Token): ClosureExpr {
        const params: ParamNode[] = [];

        if (this.eat(TokenType.PipePipe)) {
            // || — no params
        } else {
            this.expect(TokenType.Pipe);
            while (!this.check(TokenType.Pipe) && !this.check(TokenType.Eof)) {
                const paramStart = this.peek();
                this.eat(TokenType.Mut); // Consume optional mut

                if (this.check(TokenType.Pipe)) break;

                let name: string;
                if (this.check(TokenType.Identifier) || this.check(TokenType.Self)) {
                    name = this.advance().value;
                } else if (this.check(TokenType.And)) {
                    // &self or &mut self in closure
                    this.advance();
                    this.eat(TokenType.Mut);
                    if (this.check(TokenType.Self)) {
                        this.advance();
                    }
                    this.eat(TokenType.Comma);
                    continue;
                } else {
                    break;
                }

                let ty: TypeNode | undefined;
                if (this.eat(TokenType.Colon)) {
                    ty = this.parseTypeNode();
                }

                params.push({
                    span: this.spanFrom(paramStart),
                    name,
                    ty: ty ?? new NamedTypeNode(this.spanFrom(paramStart), "_"),
                    isReceiver: false,
                });

                if (!this.eat(TokenType.Comma)) break;
            }
            this.expect(TokenType.Pipe);
        }

        let returnType: TypeNode = new TupleTypeNode(this.spanFrom(startTok), []);
        if (this.eatThinArrow()) {
            returnType = this.parseTypeNode();
        }

        const body = this.parseExpr(0);
        return new ClosureExpr(this.spanFrom(startTok), params, returnType, body);
    }

    private parseIfExpr(startTok: Token): IfExpr {
        // Handle `if let pat = expr`
        if (this.eat(TokenType.Let)) {
            const _pat = this.parsePattern();
            this.expect(TokenType.Eq);
            const _val = this.parseExpr(0, true);
            // Represent as a synthetic true condition (if-let not lowered)
            const cond = new LiteralExpr(this.spanFrom(startTok), LiteralKind.Bool, true);
            const thenBranch = this.parseBlock();
            const elseBranch = this.parseElseBranch();
            return new IfExpr(this.spanFrom(startTok), cond, thenBranch, elseBranch);
        }

        const cond = this.parseExpr(0, true);
        const thenBranch = this.parseBlock();
        const elseBranch = this.parseElseBranch();
        return new IfExpr(this.spanFrom(startTok), cond, thenBranch, elseBranch);
    }

    private parseElseBranch(): Expression | undefined {
        if (!this.eat(TokenType.Else)) return undefined;
        return this.eat(TokenType.If)
            ? this.parseIfExpr(this.tokens[this.pos - 1])
            : this.parseBlock();
    }

    private parseMatchExpr(startTok: Token): MatchExpr {
        const scrutinee = this.parseExpr(0, true);
        this.expect(TokenType.OpenCurly);
        const arms: MatchArmNode[] = [];

        while (!this.check(TokenType.CloseCurly) && !this.check(TokenType.Eof)) {
            const armStart = this.peek();

            // Leading | in pattern
            this.eat(TokenType.Pipe);

            const pat = this.parsePattern();
            let guard: Expression | undefined;
            if (this.eat(TokenType.If)) {
                guard = this.parseExpr(0, true);
            }
            this.expect(TokenType.FatArrow);
            const body = this.parseExpr(0);

            arms.push(new MatchArmNode(this.spanFrom(armStart), pat, body, guard));

            // Trailing comma: required unless body is a block
            if (!this.eat(TokenType.Comma)) {
                // If the body wasn't a block, we still need to stop
                if (!(body instanceof BlockExpr)) break;
            }
        }

        this.expect(TokenType.CloseCurly);
        return new MatchExpr(this.spanFrom(startTok), scrutinee, arms);
    }

    private parseArgList(): Expression[] {
        const args: Expression[] = [];
        while (!this.check(TokenType.CloseParen) && !this.check(TokenType.Eof)) {
            args.push(this.parseExpr(0));
            if (!this.eat(TokenType.Comma)) break;
        }
        return args;
    }
}
