import { type TokenType } from "./tokenizer";

export class Token {
    type: TokenType;
    value?: string | number;
    line: number;
    column: number;

    constructor(
        type: TokenType,
        line: number,
        column: number,
        value?: string | number,
    ) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }
}

export class Span {
    line: number;
    column: number;
    start: number;
    end: number;
    constructor(line: number, column: number, start: number, end: number) {
        this.line = line;
        this.column = column;
        this.start = start;
        this.end = end;
    }
    toToken(type: TokenType, value?: string | number): Token {
        return new Token(type, this.line, this.column, value);
    }
}

export enum UnaryOp {
    Not,
    Neg,
    Deref,
    Ref,
}

export enum BinaryOp {
    Add,
    Sub,
    Mul,
    Div,
    Rem,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
    BitXor,
    BitAnd,
    BitOr,
    Shl,
    Shr,
}

export enum Mutability {
    Immutable,
    Mutable,
}

export enum BuiltinType {
    I8,
    I16,
    I32,
    I64,
    I128,
    Isize,
    U8,
    U16,
    U32,
    U64,
    U128,
    Usize,
    F32,
    F64,
    Bool,
    Char,
    Str,
    Unit,
    Never,
}
/**
 * Will be implemented by other classes (e.g.: for type-checking)
 */
export interface AstVisitor<R, C> {
    visitLiteralExpr(node: LiteralExpr, ctx: C): R;
    visitIdentifierExpr(node: IdentifierExpr, ctx: C): R;
    visitBinaryExpr(node: BinaryExpr, ctx: C): R;
    visitUnaryExpr(node: UnaryExpr, ctx: C): R;
    visitCallExpr(node: CallExpr, ctx: C): R;
    visitFieldExpr(node: FieldExpr, ctx: C): R;
    visitIndexExpr(node: IndexExpr, ctx: C): R;
    visitAssignExpr(node: AssignExpr, ctx: C): R;
    visitIfExpr(node: IfExpr, ctx: C): R;
    visitMatchExpr(node: MatchExpr, ctx: C): R;
    visitBlockExpr(node: BlockExpr, ctx: C): R;
    visitReturnExpr(node: ReturnExpr, ctx: C): R;
    visitBreakExpr(node: BreakExpr, ctx: C): R;
    visitContinueExpr(node: ContinueExpr, ctx: C): R;
    visitLoopExpr(node: LoopExpr, ctx: C): R;
    visitWhileExpr(node: WhileExpr, ctx: C): R;
    visitForExpr(node: ForExpr, ctx: C): R;
    visitStructExpr(node: StructExpr, ctx: C): R;
    visitRangeExpr(node: RangeExpr, ctx: C): R;
    visitRefExpr(node: RefExpr, ctx: C): R;
    visitDerefExpr(node: DerefExpr, ctx: C): R;
    visitMacroExpr(node: MacroExpr, ctx: C): R;
    visitClosureExpr(node: ClosureExpr, ctx: C): R;
    visitLetStmt(node: LetStmt, ctx: C): R;
    visitExprStmt(node: ExprStmt, ctx: C): R;
    visitItemStmt(node: ItemStmt, ctx: C): R;
    visitFnItem(node: FnItem, ctx: C): R;
    visitStructItem(node: StructItem, ctx: C): R;
    visitEnumItem(node: EnumItem, ctx: C): R;
    visitModItem(node: ModItem, ctx: C): R;
    visitUseItem(node: UseItem, ctx: C): R;
    visitImplItem(node: ImplItem, ctx: C): R;
    visitTraitImplItem(node: TraitImplItem, ctx: C): R;
    visitTraitItem(node: TraitItem, ctx: C): R;
    visitIdentPat(node: IdentPattern, ctx: C): R;
    visitWildcardPat(node: WildcardPattern, ctx: C): R;
    visitLiteralPat(node: LiteralPattern, ctx: C): R;
    visitRangePat(node: RangePattern, ctx: C): R;
    visitStructPat(node: StructPattern, ctx: C): R;
    visitTuplePat(node: TuplePattern, ctx: C): R;
    visitNamedTypeNode(node: NamedTypeNode, ctx: C): R;
    visitTupleTypeNode(node: TupleTypeNode, ctx: C): R;
    visitArrayTypeNode(node: ArrayTypeNode, ctx: C): R;
    visitRefTypeNode(node: RefTypeNode, ctx: C): R;
    visitPtrTypeNode(node: PtrTypeNode, ctx: C): R;
    visitFnTypeNode(node: FnTypeNode, ctx: C): R;
    visitGenericArgsNode(node: GenericArgsNode, ctx: C): R;
    visitModuleNode(node: ModuleNode, ctx: C): R;
    visitMatchArmNode(node: MatchArmNode, ctx: C): R;
    visitTraitMethod(node: TraitMethod, ctx: C): R;
}

export abstract class Node {
    readonly span: Span;

    constructor(span: Span) {
        this.span = span;
    }

    abstract accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R;
}

export abstract class Expression extends Node {}
export abstract class Statement extends Node {}
export abstract class Item extends Node {}
export abstract class Pattern extends Node {}
export abstract class TypeNode extends Node {}

export enum LiteralKind {
    Int,
    Float,
    Bool,
    String,
    Char,
}

export class LiteralExpr extends Expression {
    readonly literalKind: LiteralKind;
    readonly value: string | number | boolean;

    constructor(
        span: Span,
        literalKind: LiteralKind,
        value: string | number | boolean,
    ) {
        super(span);
        this.literalKind = literalKind;
        this.value = value;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitLiteralExpr(this, ctx);
    }
}

export class IdentifierExpr extends Expression {
    readonly name: string;

    constructor(span: Span, name: string) {
        super(span);
        this.name = name;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitIdentifierExpr(this, ctx);
    }
}

export class BinaryExpr extends Expression {
    readonly op: BinaryOp;
    readonly left: Expression;
    readonly right: Expression;

    constructor(span: Span, op: BinaryOp, left: Expression, right: Expression) {
        super(span);
        this.op = op;
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitBinaryExpr(this, ctx);
    }
}

export class UnaryExpr extends Expression {
    readonly op: UnaryOp;
    readonly operand: Expression;

    constructor(span: Span, op: UnaryOp, operand: Expression) {
        super(span);
        this.op = op;
        this.operand = operand;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitUnaryExpr(this, ctx);
    }
}

export class CallExpr extends Expression {
    readonly callee: Expression;
    readonly args: Expression[];
    readonly genericArgs?: TypeNode[];

    constructor(
        span: Span,
        callee: Expression,
        args: Expression[],
        typeArgs?: TypeNode[],
    ) {
        super(span);
        this.callee = callee;
        this.args = args;
        this.genericArgs = typeArgs;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitCallExpr(this, ctx);
    }
}

/**
 * field access expression
 * e.g.: `some_struct.a`
 */
export class FieldExpr extends Expression {
    readonly receiver: Expression;
    readonly field: string;

    constructor(span: Span, receiver: Expression, field: string) {
        super(span);
        this.receiver = receiver;
        this.field = field;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitFieldExpr(this, ctx);
    }
}

export class IndexExpr extends Expression {
    readonly receiver: Expression;
    readonly index: Expression;

    constructor(span: Span, receiver: Expression, index: Expression) {
        super(span);
        this.receiver = receiver;
        this.index = index;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitIndexExpr(this, ctx);
    }
}

export class AssignExpr extends Expression {
    readonly target: Expression;
    readonly value: Expression;

    constructor(span: Span, target: Expression, value: Expression) {
        super(span);
        this.target = target;
        this.value = value;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitAssignExpr(this, ctx);
    }
}

// TODO: make this more robust
export class IfExpr extends Expression {
    readonly condition: Expression;
    readonly thenBranch: BlockExpr;
    readonly elseBranch?: Expression;

    constructor(
        span: Span,
        condition: Expression,
        thenBranch: BlockExpr,
        elseBranch?: Expression,
    ) {
        super(span);
        this.condition = condition;
        this.thenBranch = thenBranch;
        this.elseBranch = elseBranch;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitIfExpr(this, ctx);
    }
}

export class MatchExpr extends Expression {
    readonly matchOn: Expression;
    readonly arms: MatchArmNode[];

    constructor(span: Span, matchOn: Expression, arms: MatchArmNode[]) {
        super(span);
        this.matchOn = matchOn;
        this.arms = arms;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitMatchExpr(this, ctx);
    }
}

export class BlockExpr extends Expression {
    readonly stmts: Statement[];
    readonly expr: Expression; // NOTE: unsure what this means??

    constructor(span: Span, stmts: Statement[], expr: Expression) {
        super(span);
        this.stmts = stmts;
        this.expr = expr;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitBlockExpr(this, ctx);
    }
}

export class ReturnExpr extends Expression {
    readonly value: Expression;

    constructor(span: Span, value: Expression) {
        super(span);
        this.value = value;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitReturnExpr(this, ctx);
    }
}

export class BreakExpr extends Expression {
    readonly value?: Expression;

    constructor(span: Span, value?: Expression) {
        super(span);
        this.value = value;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitBreakExpr(this, ctx);
    }
}

export class ContinueExpr extends Expression {
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitContinueExpr(this, ctx);
    }
}

export class LoopExpr extends Expression {
    readonly label?: string;
    readonly body: BlockExpr;

    constructor(span: Span, body: BlockExpr, label?: string) {
        super(span);
        this.label = label;
        this.body = body;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitLoopExpr(this, ctx);
    }
}

export class WhileExpr extends Expression {
    readonly label?: string;
    readonly condition: Expression;
    readonly body: BlockExpr;

    constructor(
        span: Span,
        condition: Expression,
        body: BlockExpr,
        label?: string,
    ) {
        super(span);
        this.label = label;
        this.condition = condition;
        this.body = body;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitWhileExpr(this, ctx);
    }
}

export class ForExpr extends Expression {
    readonly label?: string;
    readonly pattern: Pattern;
    readonly iter: Expression;
    readonly body: BlockExpr;

    constructor(
        span: Span,
        pat: Pattern,
        iter: Expression,
        body: BlockExpr,
        label?: string,
    ) {
        super(span);
        this.label = label;
        this.pattern = pat;
        this.iter = iter;
        this.body = body;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitForExpr(this, ctx);
    }
}

export class StructExpr extends Expression {
    readonly path: Expression;
    readonly fields: Map<string, Expression>;

    constructor(span: Span, path: Expression, fields: Map<string, Expression>) {
        super(span);
        this.path = path;
        this.fields = fields;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitStructExpr(this, ctx);
    }
}

export class RangeExpr extends Expression {
    readonly start?: Expression;
    readonly end?: Expression;

    constructor(span: Span, start?: Expression, end?: Expression) {
        super(span);
        this.start = start;
        this.end = end;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitRangeExpr(this, ctx);
    }
}

export class RefExpr extends Expression {
    readonly mutability: Mutability;
    readonly target: Expression;

    constructor(span: Span, mutability: Mutability, target: Expression) {
        super(span);
        this.mutability = mutability;
        this.target = target;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitRefExpr(this, ctx);
    }
}

export class DerefExpr extends Expression {
    readonly target: Expression;

    constructor(span: Span, target: Expression) {
        super(span);
        this.target = target;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitDerefExpr(this, ctx);
    }
}

export class MacroExpr extends Expression {
    readonly name: string;
    readonly args: Expression[];

    constructor(span: Span, name: string, args: Expression[]) {
        super(span);
        this.name = name;
        this.args = args;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitMacroExpr(this, ctx);
    }
}

export class ClosureExpr extends Expression {
    readonly params: Pattern[];
    readonly returnType: TypeNode; // TODO: Default assign unit
    readonly body: Expression;

    constructor(
        span: Span,
        params: Expression[],
        returnType: TypeNode,
        body: Expression,
    ) {
        super(span);
        this.params = params;
        this.returnType = returnType;
        this.body = body;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitClosureExpr(this, ctx);
    }
}

export class LetStmt extends Statement {
    readonly pattern: Pattern;
    readonly type: TypeNode;
    readonly init: Expression;

    constructor(
        span: Span,
        pattern: Pattern,
        type: TypeNode,
        init: Expression,
    ) {
        super(span);
        this.pattern = pattern;
        this.type = type;
        this.init = init;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitLetStmt(this, ctx);
    }
}

export class ExprStmt extends Statement {
    readonly expr: Expression;
    readonly isReturn: boolean; // no semicolon

    constructor(span: Span, expr: Expression, isReturn: boolean) {
        super(span);
        this.expr = expr;
        this.isReturn = isReturn;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitExprStmt(this, ctx);
    }
}

export class ItemStmt extends Statement {
    readonly item: Item;

    constructor(span: Span, item: Item) {
        super(span);
        this.item = item;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitItemStmt(this, ctx);
    }
}
export interface GenericParam {
    name: string;
    bounds: TypeNode[];
}

enum FnAttributes {
    unsafeFn,
    asyncFn,
    constFn,
    testFn,
    builtin,
}

/**
 * TODO: take generics into account
 */
export class FnItem extends Item {
    readonly name: string;
    readonly params: Map<string, TypeNode>;
    readonly returnType: TypeNode;
    readonly body: BlockExpr;
    readonly attributes: FnAttributes[] = [];
    readonly derives: string[] = [];

    constructor(
        span: Span,
        name: string,
        params: Map<string, TypeNode>,
        returnType: TypeNode,
        body: BlockExpr,
        attributes: FnAttributes[] = [],
        derives: string[] = [],
    ) {
        super(span);
        this.name = name;
        this.params = params;
        this.returnType = returnType;
        this.body = body;
        this.attributes = attributes;
        this.derives = derives;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitFnItem(this, ctx);
    }
}

export class StructItem extends Item {
    readonly name: string;
    readonly fields: Map<string, TypeNode>;
    readonly derives: string[] = [];

    constructor(
        span: Span,
        name: string,
        fields: Map<string, TypeNode>,
        derives: string[] = [],
    ) {
        super(span);
        this.name = name;
        this.fields = fields;
        this.derives = derives;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitStructItem(this, ctx);
    }
}

export class EnumItem extends Item {
    readonly name: string;
    readonly variants: Map<string, TypeNode>; // TODO: change this
    readonly derives: string[];

    constructor(
        span: Span,
        name: string,
        variants: Map<string, TypeNode>,
        derives: string[] = [],
    ) {
        super(span);
        this.name = name;
        this.variants = variants;
        this.derives = derives;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitEnumItem(this, ctx);
    }
}

export class ModItem extends Item {
    readonly name: string;
    readonly items: Item[]; // TODO: think about this

    constructor(span: Span, name: string, items: Item[]) {
        super(span);
        this.name = name;
        this.items = items;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitModItem(this, ctx);
    }
}

function pathToString(path: string[]): string {
    if (!path.length) {
        throw new Error("Assert: cannot resolve empty path");
    }
    return path.join("::");
}

type UsePrefix = "crate" | "mod"; // TODO: add more

export class UseItem extends Item {
    prefix?: UsePrefix;
    path: string[];

    constructor(span: Span, path: string[], prefix?: UsePrefix) {
        super(span);
        this.path = path;
        this.prefix = prefix;
    }

    toFullPath(): string {
        if (this.prefix) {
            return pathToString([this.prefix, ...this.path]);
        }
        return pathToString(this.path);
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitUseItem(this, ctx);
    }
}

export class TraitMethod extends Item {
    readonly name: string;
    readonly returnType: TypeNode;

    constructor(span: Span, name: string, returnType: TypeNode) {
        super(span);
        this.name = name;
        this.returnType = returnType;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitTraitMethod(this, ctx);
    }
}

export class TraitItem extends Item {
    readonly name: string;
    readonly methods: TraitMethod[];

    constructor(span: Span, name: string, methods: FnItem[]) {
        super(span);
        this.name = name;
        this.methods = methods;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitTraitItem(this, ctx);
    }
}

export class TraitImplItem extends Item {
    readonly name: string;
    readonly target: TypeNode;
    readonly trait: TraitItem;
    readonly fnImpls: FnItem[];

    constructor(
        span: Span,
        name: string,
        trait: TraitItem,
        target: TypeNode,
        fnImpls: FnItem[],
    ) {
        super(span);
        this.name = name;
        this.trait = trait;
        this.target = target;
        this.fnImpls = fnImpls;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitTraitImplItem(this, ctx);
    }
}

export class ImplItem extends Item {
    readonly target: TypeNode;
    readonly methods: FnItem[];

    constructor(span: Span, target: TypeNode, methods: FnItem[]) {
        super(span);
        this.target = target;
        this.methods = methods;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitImplItem(this, ctx);
    }
}

export class IdentPattern extends Pattern {
    readonly name: string;
    readonly mutability: Mutability;
    readonly type: TypeNode;

    constructor(
        span: Span,
        name: string,
        mutability: Mutability,
        ty: TypeNode,
    ) {
        super(span);
        this.name = name;
        this.mutability = mutability;
        this.type = ty;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitIdentPat(this, ctx);
    }
}

export class WildcardPattern extends Pattern {
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitWildcardPat(this, ctx);
    }
}

export class LiteralPattern extends Pattern {
    readonly literalKind: LiteralKind;
    readonly value: string | number | boolean;

    constructor(
        span: Span,
        literalKind: LiteralKind,
        value: string | number | boolean,
    ) {
        super(span);
        this.literalKind = literalKind;
        this.value = value;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitLiteralPat(this, ctx);
    }
}

export class RangePattern extends Pattern {
    readonly start: Pattern;
    readonly end: Pattern;

    constructor(span: Span, start: Pattern, end: Pattern) {
        super(span);
        this.start = start;
        this.end = end;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitRangePat(this, ctx);
    }
}

export interface StructPatternField {
    name: string;
    pattern: Pattern;
}

export class StructPattern extends Pattern {
    readonly path: Expression;
    readonly fields: StructPatternField[];
    readonly rest: boolean;

    constructor(
        span: Span,
        path: Expression,
        fields: StructPatternField[],
        rest: boolean,
    ) {
        super(span);
        this.path = path;
        this.fields = fields;
        this.rest = rest;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitStructPat(this, ctx);
    }
}

export class TuplePattern extends Pattern {
    readonly elements: Pattern[];

    constructor(span: Span, elements: Pattern[]) {
        super(span);
        this.elements = elements;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitTuplePat(this, ctx);
    }
}

export class MatchArmNode extends Node {
    readonly pattern: Pattern;
    readonly body: Expression;

    constructor(span: Span, pattern: Pattern, body: Expression) {
        super(span);
        this.pattern = pattern;
        this.body = body;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitMatchArmNode(this, ctx);
    }
}

export class NamedTypeNode extends TypeNode {
    readonly name: string;
    readonly args: GenericArgsNode | null;

    constructor(span: Span, name: string, args: GenericArgsNode | null) {
        super(span);
        this.name = name;
        this.args = args;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitNamedTypeNode(this, ctx);
    }
}

export class TupleTypeNode extends TypeNode {
    readonly elements: TypeNode[];

    constructor(span: Span, elements: TypeNode[]) {
        super(span);
        this.elements = elements;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitTupleTypeNode(this, ctx);
    }
}

export class ArrayTypeNode extends TypeNode {
    readonly element: TypeNode;
    readonly length: Expression | null;

    constructor(span: Span, element: TypeNode, length: Expression | null) {
        super(span);
        this.element = element;
        this.length = length;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitArrayTypeNode)
            return visitor.visitArrayTypeNode(this, ctx);
        throw new Error(`No visitor method for ArrayTypeNode`);
    }
}

export class RefTypeNode extends TypeNode {
    readonly mutability: Mutability;
    readonly inner: TypeNode;

    constructor(span: Span, mutability: Mutability, inner: TypeNode) {
        super(span);
        this.mutability = mutability;
        this.inner = inner;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitRefTypeNode(this, ctx);
    }
}

export class PtrTypeNode extends TypeNode {
    readonly mutability: Mutability;
    readonly inner: TypeNode;

    constructor(span: Span, mutability: Mutability, inner: TypeNode) {
        super(span);
        this.mutability = mutability;
        this.inner = inner;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitPtrTypeNode(this, ctx);
    }
}

export class FnTypeNode extends TypeNode {
    readonly params: TypeNode[];
    readonly returnType: TypeNode;

    constructor(span: Span, params: TypeNode[], returnType: TypeNode) {
        super(span);
        this.params = params;
        this.returnType = returnType;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitFnTypeNode(this, ctx);
    }
}

export class GenericArgsNode extends TypeNode {
    readonly args: TypeNode[];

    constructor(span: Span, args: TypeNode[]) {
        super(span);
        this.args = args;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitGenericArgsNode(this, ctx);
    }
}

export class ModuleNode extends Node {
    readonly name: string;
    readonly items: Item[];

    constructor(span: Span, name: string, items: Item[]) {
        super(span);
        this.name = name;
        this.items = items;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitModuleNode(this, ctx);
    }
}

export enum ReceiverKind {
    value,
    ref,
    refMut,
}

export function visitAst<R = void, C = void>(
    node: Node,
    visitor: AstVisitor<R, C>,
    ctx: C,
): R {
    return node.accept(visitor, ctx);
}

export function walkAst(node: Node, fn: (node: Node) => void): void {
    fn(node);
    const walkValue = (value: unknown): void => {
        if (value instanceof Node) {
            walkAst(value, fn);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                walkValue(item);
            }
        } else if (value !== null && typeof value === "object") {
            for (const v of Object.values(value as Record<string, unknown>)) {
                walkValue(v);
            }
        }
    };
    const obj = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (key === "span" || key === "node") continue;
        walkValue(obj[key]);
    }
}

export function mergeSpans(a: Span, b: Span): Span {
    return new Span(a.line, a.column, a.start, b.end);
}
