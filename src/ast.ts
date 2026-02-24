import { TokenType } from "./tokenizer";

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
    toToken(type: TokenType, value?: string): import("./tokenizer").Token {
        return {
            type,
            value: value ?? "",
            line: this.line,
            column: this.column,
        };
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
    visitPathExpr(node: PathExpr, ctx: C): R;
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
    visitTraitItem(node: TraitItem, ctx: C): R;
    visitIdentPat(node: IdentPat, ctx: C): R;
    visitWildcardPat(node: WildcardPat, ctx: C): R;
    visitLiteralPat(node: LiteralPat, ctx: C): R;
    visitRangePat(node: RangePat, ctx: C): R;
    visitStructPat(node: StructPat, ctx: C): R;
    visitTuplePat(node: TuplePat, ctx: C): R;
    visitSlicePat(node: SlicePat, ctx: C): R;
    visitOrPat(node: OrPat, ctx: C): R;
    visitBindingPat(node: BindingPat, ctx: C): R;
    visitNamedTypeNode(node: NamedTypeNode, ctx: C): R;
    visitTupleTypeNode(node: TupleTypeNode, ctx: C): R;
    visitArrayTypeNode(node: ArrayTypeNode, ctx: C): R;
    visitRefTypeNode(node: RefTypeNode, ctx: C): R;
    visitPtrTypeNode(node: PtrTypeNode, ctx: C): R;
    visitFnTypeNode(node: FnTypeNode, ctx: C): R;
    visitGenericArgsNode(node: GenericArgsNode, ctx: C): R;
    visitModuleNode(node: ModuleNode, ctx: C): R;
    visitParamNode(node: ParamNode, ctx: C): R;
    visitStructFieldNode(node: StructFieldNode, ctx: C): R;
    visitEnumVariantNode(node: EnumVariantNode, ctx: C): R;
    visitUseTreeNode(node: UseTreeNode, ctx: C): R;
    visitMatchArmNode(node: MatchArmNode, ctx: C): R;
}

export abstract class AstNode {
    readonly span: Span;

    constructor(span: Span) {
        this.span = span;
    }

    abstract accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R;
}

export abstract class Expression extends AstNode {}
export abstract class Statement extends AstNode {}
export abstract class Item extends AstNode {}
export abstract class Pattern extends AstNode {}
export abstract class TypeNode extends AstNode {}

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
        if (visitor.visitBlockExpr) return visitor.visitBlockExpr(this, ctx);
        throw new Error(`No visitor method for BlockExpr`);
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
    constructor(span: Span) {
        super(span);
    }
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
    readonly pat: Pattern;
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
        this.pat = pat;
        this.iter = iter;
        this.body = body;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitForExpr(this, ctx);
    }
}

export class PathExpr extends Expression {
    readonly segments: string[];

    constructor(span: Span, segments: string[]) {
        super(span);
        this.segments = segments;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitPathExpr(this, ctx);
    }
}

export type StructExprField = {
    name: string;
    value: Expression;
};

export class StructExpr extends Expression {
    readonly path: Expression;
    readonly fields: StructExprField[];

    constructor(span: Span, path: Expression, fields: StructExprField[]) {
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
    readonly operand: Expression;

    constructor(span: Span, mutability: Mutability, operand: Expression) {
        super(span);
        this.mutability = mutability;
        this.operand = operand;
    }
    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        return visitor.visitRefExpr(this, ctx);
    }
}

export class DerefExpr extends Expression {
    readonly target: Expression;

    constructor(span: Span, operand: Expression) {
        super(span);
        this.target = operand;
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
    readonly params: ParamNode[];
    readonly returnType: TypeNode; // TODO: Default assign unit
    readonly body: Expression;

    constructor(
        span: Span,
        params: ParamNode[],
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
    readonly pat: Pattern;
    readonly type: TypeNode;
    readonly init: Expression;

    constructor(span: Span, pat: Pattern, ty: TypeNode, init: Expression) {
        super(span);
        this.pat = pat;
        this.type = ty;
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
export type GenericParam = {
    name: string;
    bounds: TypeNode[];
};

export type WhereClauseItem = {
    name: string;
    bounds: TypeNode[];
};

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
    readonly params: ParamNode[];
    readonly returnType: TypeNode;
    readonly body: BlockExpr;
    readonly attributes: FnAttributes[] = [];
    readonly derives: string[] = [];

    constructor(
        span: Span,
        name: string,
        params: ParamNode[],
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
        if (visitor.visitFnItem) return visitor.visitFnItem(this, ctx);
        throw new Error(`No visitor method for FnItem`);
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
        if (visitor.visitStructItem) return visitor.visitStructItem(this, ctx);
        throw new Error(`No visitor method for StructItem`);
    }
}

export class EnumVariantNode extends AstNode {
    readonly node = "EnumVariantNode";
    readonly name: string;
    readonly fields: Map<string, TypeNode>;

    constructor(
        span: Span,
        name: string,
        fields: StructFieldNode[],
        discriminant: Expression | null,
    ) {
        super(span);
        this.name = name;
        this.fields = fields;
        this.discriminant = discriminant;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitEnumVariantNode)
            return visitor.visitEnumVariantNode(this, ctx);
        throw new Error(`No visitor method for EnumVariantNode`);
    }
}

export class EnumItem extends Item {
    readonly node = "EnumItem";
    readonly name: string;
    readonly generics: string[] | null;
    readonly ignoredLifetimeParams: string[];
    readonly variants: EnumVariantNode[];
    readonly isPub: boolean;
    readonly derives: string[];

    constructor(
        span: Span,
        name: string,
        generics: string[] | null,
        ignoredLifetimeParams: string[],
        variants: EnumVariantNode[],
        isPub: boolean,
        derives: string[],
    ) {
        super(span);
        this.name = name;
        this.generics = generics;
        this.ignoredLifetimeParams = ignoredLifetimeParams;
        this.variants = variants;
        this.isPub = isPub;
        this.derives = derives;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitEnumItem) return visitor.visitEnumItem(this, ctx);
        throw new Error(`No visitor method for EnumItem`);
    }
}

export class ModItem extends Item {
    readonly node = "ModItem";
    readonly name: string;
    readonly items: Item[];
    readonly isInline: boolean;
    readonly isPub: boolean;

    constructor(
        span: Span,
        name: string,
        items: Item[],
        isInline: boolean,
        isPub: boolean,
    ) {
        super(span);
        this.name = name;
        this.items = items;
        this.isInline = isInline;
        this.isPub = isPub;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitModItem) return visitor.visitModItem(this, ctx);
        throw new Error(`No visitor method for ModItem`);
    }
}

export class UseTreeNode extends AstNode {
    readonly node = "UseTreeNode";
    readonly path: string[];
    readonly alias: string | null;
    readonly children: UseTreeNode[] | null;

    constructor(
        span: Span,
        path: string[],
        alias: string | null,
        children: UseTreeNode[] | null,
    ) {
        super(span);
        this.path = path;
        this.alias = alias;
        this.children = children;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitUseTreeNode)
            return visitor.visitUseTreeNode(this, ctx);
        throw new Error(`No visitor method for UseTreeNode`);
    }
}

export class UseItem extends Item {
    readonly node = "UseItem";
    readonly tree: UseTreeNode;
    readonly isPub: boolean;

    constructor(span: Span, tree: UseTreeNode, isPub: boolean) {
        super(span);
        this.tree = tree;
        this.isPub = isPub;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitUseItem) return visitor.visitUseItem(this, ctx);
        throw new Error(`No visitor method for UseItem`);
    }
}

export class TraitItem extends Item {
    readonly node = "TraitItem";
    readonly name: string;
    readonly methods: FnItem[];
    readonly isUnsafe: boolean;
    readonly isPub: boolean;

    constructor(
        span: Span,
        name: string,
        methods: FnItem[],
        isUnsafe: boolean,
        isPub: boolean,
    ) {
        super(span);
        this.name = name;
        this.methods = methods;
        this.isUnsafe = isUnsafe;
        this.isPub = isPub;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitTraitItem) return visitor.visitTraitItem(this, ctx);
        throw new Error(`No visitor method for TraitItem`);
    }
}

export class ImplItem extends Item {
    readonly node = "ImplItem";
    readonly targetType: TypeNode;
    readonly traitType: TypeNode | null;
    readonly methods: FnItem[];
    readonly isUnsafe: boolean;
    readonly genericParams: GenericParam[] | null;
    readonly ignoredLifetimeParams: string[];

    constructor(
        span: Span,
        targetType: TypeNode,
        traitType: TypeNode | null,
        methods: FnItem[],
        isUnsafe: boolean,
        genericParams: GenericParam[] | null,
        ignoredLifetimeParams: string[],
    ) {
        super(span);
        this.targetType = targetType;
        this.traitType = traitType;
        this.methods = methods;
        this.isUnsafe = isUnsafe;
        this.genericParams = genericParams;
        this.ignoredLifetimeParams = ignoredLifetimeParams;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitImplItem) return visitor.visitImplItem(this, ctx);
        throw new Error(`No visitor method for ImplItem`);
    }
}

export class IdentPat extends Pattern {
    readonly node = "IdentPat";
    readonly name: string;
    readonly mutability: Mutability;
    readonly isRef: boolean;
    readonly ty: TypeNode | null;

    constructor(
        span: Span,
        name: string,
        mutability: Mutability,
        isRef: boolean,
        ty: TypeNode | null,
    ) {
        super(span);
        this.name = name;
        this.mutability = mutability;
        this.isRef = isRef;
        this.ty = ty;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitIdentPat) return visitor.visitIdentPat(this, ctx);
        throw new Error(`No visitor method for IdentPat`);
    }
}

export class WildcardPat extends Pattern {
    readonly node = "WildcardPat";

    constructor(span: Span) {
        super(span);
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitWildcardPat)
            return visitor.visitWildcardPat(this, ctx);
        throw new Error(`No visitor method for WildcardPat`);
    }
}

export class LiteralPat extends Pattern {
    readonly node = "LiteralPat";
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
        if (visitor.visitLiteralPat) return visitor.visitLiteralPat(this, ctx);
        throw new Error(`No visitor method for LiteralPat`);
    }
}

export class RangePat extends Pattern {
    readonly node = "RangePat";
    readonly start: Pattern;
    readonly end: Pattern;
    readonly inclusive: boolean;

    constructor(span: Span, start: Pattern, end: Pattern, inclusive: boolean) {
        super(span);
        this.start = start;
        this.end = end;
        this.inclusive = inclusive;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitRangePat) return visitor.visitRangePat(this, ctx);
        throw new Error(`No visitor method for RangePat`);
    }
}

export interface StructPatField {
    name: string;
    pat: Pattern;
}

export class StructPat extends Pattern {
    readonly node = "StructPat";
    readonly path: Expression;
    readonly fields: StructPatField[];
    readonly rest: boolean;

    constructor(
        span: Span,
        path: Expression,
        fields: StructPatField[],
        rest: boolean,
    ) {
        super(span);
        this.path = path;
        this.fields = fields;
        this.rest = rest;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitStructPat) return visitor.visitStructPat(this, ctx);
        throw new Error(`No visitor method for StructPat`);
    }
}

export class TuplePat extends Pattern {
    readonly node = "TuplePat";
    readonly elements: Pattern[];

    constructor(span: Span, elements: Pattern[]) {
        super(span);
        this.elements = elements;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitTuplePat) return visitor.visitTuplePat(this, ctx);
        throw new Error(`No visitor method for TuplePat`);
    }
}

export class SlicePat extends Pattern {
    readonly node = "SlicePat";
    readonly elements: Pattern[];
    readonly rest: Pattern | null;

    constructor(span: Span, elements: Pattern[], rest: Pattern | null) {
        super(span);
        this.elements = elements;
        this.rest = rest;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitSlicePat) return visitor.visitSlicePat(this, ctx);
        throw new Error(`No visitor method for SlicePat`);
    }
}

export class OrPat extends Pattern {
    readonly node = "OrPat";
    readonly alternatives: Pattern[];

    constructor(span: Span, alternatives: Pattern[]) {
        super(span);
        this.alternatives = alternatives;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitOrPat) return visitor.visitOrPat(this, ctx);
        throw new Error(`No visitor method for OrPat`);
    }
}

export class BindingPat extends Pattern {
    readonly node = "BindingPat";
    readonly name: string;
    readonly pat: Pattern;

    constructor(span: Span, name: string, pat: Pattern) {
        super(span);
        this.name = name;
        this.pat = pat;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitBindingPat) return visitor.visitBindingPat(this, ctx);
        throw new Error(`No visitor method for BindingPat`);
    }
}

export class MatchArmNode extends AstNode {
    readonly node = "MatchArmNode";
    readonly pat: Pattern;
    readonly guard: Expression | null;
    readonly body: Expression;

    constructor(
        span: Span,
        pat: Pattern,
        guard: Expression | null,
        body: Expression,
    ) {
        super(span);
        this.pat = pat;
        this.guard = guard;
        this.body = body;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitMatchArmNode)
            return visitor.visitMatchArmNode(this, ctx);
        throw new Error(`No visitor method for MatchArmNode`);
    }
}

export class NamedTypeNode extends TypeNode {
    readonly node = "NamedTypeNode";
    readonly name: string;
    readonly args: GenericArgsNode | null;

    constructor(span: Span, name: string, args: GenericArgsNode | null) {
        super(span);
        this.name = name;
        this.args = args;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitNamedTypeNode)
            return visitor.visitNamedTypeNode(this, ctx);
        throw new Error(`No visitor method for NamedTypeNode`);
    }
}

export class TupleTypeNode extends TypeNode {
    readonly node = "TupleTypeNode";
    readonly elements: TypeNode[];

    constructor(span: Span, elements: TypeNode[]) {
        super(span);
        this.elements = elements;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitTupleTypeNode)
            return visitor.visitTupleTypeNode(this, ctx);
        throw new Error(`No visitor method for TupleTypeNode`);
    }
}

export class ArrayTypeNode extends TypeNode {
    readonly node = "ArrayTypeNode";
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
    readonly node = "RefTypeNode";
    readonly mutability: Mutability;
    readonly inner: TypeNode;
    readonly ignoredLifetimeName: string | null;

    constructor(
        span: Span,
        mutability: Mutability,
        inner: TypeNode,
        ignoredLifetimeName: string | null,
    ) {
        super(span);
        this.mutability = mutability;
        this.inner = inner;
        this.ignoredLifetimeName = ignoredLifetimeName;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitRefTypeNode)
            return visitor.visitRefTypeNode(this, ctx);
        throw new Error(`No visitor method for RefTypeNode`);
    }
}

export class PtrTypeNode extends TypeNode {
    readonly node = "PtrTypeNode";
    readonly mutability: Mutability;
    readonly inner: TypeNode;

    constructor(span: Span, mutability: Mutability, inner: TypeNode) {
        super(span);
        this.mutability = mutability;
        this.inner = inner;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitPtrTypeNode)
            return visitor.visitPtrTypeNode(this, ctx);
        throw new Error(`No visitor method for PtrTypeNode`);
    }
}

export class FnTypeNode extends TypeNode {
    readonly node = "FnTypeNode";
    readonly params: TypeNode[];
    readonly returnType: TypeNode | null;
    readonly isUnsafe: boolean;
    readonly isConst: boolean;

    constructor(
        span: Span,
        params: TypeNode[],
        returnType: TypeNode | null,
        isUnsafe: boolean,
        isConst: boolean,
    ) {
        super(span);
        this.params = params;
        this.returnType = returnType;
        this.isUnsafe = isUnsafe;
        this.isConst = isConst;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitFnTypeNode) return visitor.visitFnTypeNode(this, ctx);
        throw new Error(`No visitor method for FnTypeNode`);
    }
}

export class GenericArgsNode extends TypeNode {
    readonly node = "GenericArgsNode";
    readonly args: TypeNode[];

    constructor(span: Span, args: TypeNode[]) {
        super(span);
        this.args = args;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitGenericArgsNode)
            return visitor.visitGenericArgsNode(this, ctx);
        throw new Error(`No visitor method for GenericArgsNode`);
    }
}

export class ModuleNode extends AstNode {
    readonly node = "ModuleNode";
    readonly name: string;
    readonly items: Item[];

    constructor(span: Span, name: string, items: Item[]) {
        super(span);
        this.name = name;
        this.items = items;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitModuleNode) return visitor.visitModuleNode(this, ctx);
        throw new Error(`No visitor method for ModuleNode`);
    }
}

export type ReceiverKind = "value" | "ref" | "ref_mut";

export class ParamNode extends AstNode {
    readonly node = "ParamNode";
    readonly name: string;
    readonly ty: TypeNode | null;
    readonly pat: Pattern | null;
    readonly isReceiver: boolean;
    readonly receiverKind: ReceiverKind | null;

    constructor(
        span: Span,
        name: string,
        ty: TypeNode | null,
        pat: Pattern | null,
        isReceiver: boolean,
        receiverKind: ReceiverKind | null,
    ) {
        super(span);
        this.name = name;
        this.ty = ty;
        this.pat = pat;
        this.isReceiver = isReceiver;
        this.receiverKind = receiverKind;
    }

    accept<R, C>(visitor: AstVisitor<R, C>, ctx: C): R {
        if (visitor.visitParamNode) return visitor.visitParamNode(this, ctx);
        throw new Error(`No visitor method for ParamNode`);
    }
}

export type Node = AstNode;

export function isExpr(node: Node): node is Expression {
    return node instanceof Expression;
}

export function isStmt(node: Node): node is Statement {
    return node instanceof Statement;
}

export function isItem(node: Node): node is Item {
    return node instanceof Item;
}

export function isPat(node: Node): node is Pattern {
    return node instanceof Pattern;
}

export function isType(node: Node): node is TypeNode {
    return node instanceof TypeNode;
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
        if (value instanceof AstNode) {
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
