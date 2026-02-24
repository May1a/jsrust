export type Span = { line: number; column: number; start: number; end: number };
export type Node = { kind: NodeKind; span: Span } & Record<string, any>;
export type Token = {
    type: number;
    value: string;
    line: number;
    column: number;
};

enum NodeKind {
    LiteralExpr,
    IdentifierExpr,
    BinaryExpr,
    UnaryExpr,
    CallExpr,
    FieldExpr,
    IndexExpr,
    AssignExpr,
    IfExpr,
    MatchExpr,
    BlockExpr,
    ReturnExpr,
    BreakExpr,
    ContinueExpr,
    LoopExpr,
    WhileExpr,
    ForExpr,
    PathExpr,
    StructExpr,
    RangeExpr,
    RefExpr,
    DerefExpr,
    MacroExpr,
    ClosureExpr,
    LetStmt,
    ExprStmt,
    ItemStmt,
    FnItem,
    StructItem,
    EnumItem,
    ModItem,
    UseItem,
    IdentPat,
    WildcardPat,
    LiteralPat,
    RangePat,
    StructPat,
    TuplePat,
    SlicePat,
    OrPat,
    BindingPat,
    NamedType,
    TupleType,
    ArrayType,
    RefType,
    PtrType,
    FnType,
    GenericArgs,
    Module,
    Param,
    StructField,
    EnumVariant,
    UseTree,
    MatchArm,
    ImplItem,
    TraitItem,
}

enum LiteralKind {
    Int,
    Float,
    Bool,
    String,
    Char,
}
enum UnaryOp {
    Not,
    Neg,
    Deref,
    Ref,
}

enum BinaryOp {
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

enum Mutability {
    Immutable,
    Mutable,
}

enum BuiltinType {
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

function serializeAstValue(value: unknown): unknown {
    if (value instanceof AstNode) {
        return value.toJSON();
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeAstValue(item));
    }
    if (value instanceof Map) {
        return Array.from(value.entries()).map(([k, v]) => [
            serializeAstValue(k),
            serializeAstValue(v),
        ]);
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = serializeAstValue(v);
        }
        return out;
    }
    return value;
}

export type AstVisitor<R = void, C = void> = {
    visitNode?: (node: AstNode, ctx: C) => R;
    [key: string]: ((node: any, ctx: C) => R) | undefined;
};

export class AstNode {
    span: Span;
    kind: NodeKind = -1 as NodeKind;
    node: string = "AstNode";
    [key: string]: any;

    constructor(props: { span: Span }) {
        this.span = props.span;
    }

    accept<R = void, C = void>(visitor: AstVisitor<R, C>, ctx: C): R {
        const method = visitor[`visit${this.node}`];
        if (typeof method === "function") {
            return method(this, ctx);
        }
        if (typeof visitor.visitNode === "function") {
            return visitor.visitNode(this, ctx);
        }
        throw new Error(`No visitor method for node ${this.node}`);
    }

    toJSON(): Record<string, unknown> {
        const out: Record<string, unknown> = { node: this.node };
        for (const key of Object.keys(this)) {
            if (key === "kind") continue;
            out[key] = serializeAstValue(this[key]);
        }
        return out;
    }
}

export class Expression extends AstNode {}
export class Statement extends AstNode {}
export class Item extends AstNode {}
export class Pattern extends AstNode {}
export class TypeNode extends AstNode {}

function defineAstClass(base: any, kind: NodeKind, node: string) {
    return class extends base {
        readonly kind = kind;
        readonly node = node;

        constructor(props: { span: Span } & Record<string, unknown>) {
            super(props);
            Object.assign(this, props);
        }
    };
}

class GenericNode extends AstNode {
    kind: NodeKind;
    node: string;

    constructor(
        props: { span: Span; kind: NodeKind } & Record<string, unknown>,
    ) {
        super(props);
        this.kind = props.kind;
        this.node = `NodeKind${props.kind}`;
        Object.assign(this, props);
    }
}

export class LiteralExpr extends defineAstClass(
    Expression,
    NodeKind.LiteralExpr,
    "LiteralExpr",
) {}
export class IdentifierExpr extends defineAstClass(
    Expression,
    NodeKind.IdentifierExpr,
    "IdentifierExpr",
) {}
export class BinaryExpr extends defineAstClass(
    Expression,
    NodeKind.BinaryExpr,
    "BinaryExpr",
) {}
export class UnaryExpr extends defineAstClass(
    Expression,
    NodeKind.UnaryExpr,
    "UnaryExpr",
) {}
export class CallExpr extends defineAstClass(
    Expression,
    NodeKind.CallExpr,
    "CallExpr",
) {}
export class FieldExpr extends defineAstClass(
    Expression,
    NodeKind.FieldExpr,
    "FieldExpr",
) {}
export class IndexExpr extends defineAstClass(
    Expression,
    NodeKind.IndexExpr,
    "IndexExpr",
) {}
export class AssignExpr extends defineAstClass(
    Expression,
    NodeKind.AssignExpr,
    "AssignExpr",
) {}
export class IfExpr extends defineAstClass(
    Expression,
    NodeKind.IfExpr,
    "IfExpr",
) {}
export class MatchExpr extends defineAstClass(
    Expression,
    NodeKind.MatchExpr,
    "MatchExpr",
) {}
export class BlockExpr extends defineAstClass(
    Expression,
    NodeKind.BlockExpr,
    "BlockExpr",
) {}
export class ReturnExpr extends defineAstClass(
    Expression,
    NodeKind.ReturnExpr,
    "ReturnExpr",
) {}
export class BreakExpr extends defineAstClass(
    Expression,
    NodeKind.BreakExpr,
    "BreakExpr",
) {}
export class ContinueExpr extends defineAstClass(
    Expression,
    NodeKind.ContinueExpr,
    "ContinueExpr",
) {}
export class LoopExpr extends defineAstClass(
    Expression,
    NodeKind.LoopExpr,
    "LoopExpr",
) {}
export class WhileExpr extends defineAstClass(
    Expression,
    NodeKind.WhileExpr,
    "WhileExpr",
) {}
export class ForExpr extends defineAstClass(
    Expression,
    NodeKind.ForExpr,
    "ForExpr",
) {}
export class PathExpr extends defineAstClass(
    Expression,
    NodeKind.PathExpr,
    "PathExpr",
) {}
export class StructExpr extends defineAstClass(
    Expression,
    NodeKind.StructExpr,
    "StructExpr",
) {}
export class RangeExpr extends defineAstClass(
    Expression,
    NodeKind.RangeExpr,
    "RangeExpr",
) {}
export class RefExpr extends defineAstClass(
    Expression,
    NodeKind.RefExpr,
    "RefExpr",
) {}
export class DerefExpr extends defineAstClass(
    Expression,
    NodeKind.DerefExpr,
    "DerefExpr",
) {}
export class MacroExpr extends defineAstClass(
    Expression,
    NodeKind.MacroExpr,
    "MacroExpr",
) {}
export class ClosureExpr extends defineAstClass(
    Expression,
    NodeKind.ClosureExpr,
    "ClosureExpr",
) {}

export class LetStmt extends defineAstClass(
    Statement,
    NodeKind.LetStmt,
    "LetStmt",
) {}
export class ExprStmt extends defineAstClass(
    Statement,
    NodeKind.ExprStmt,
    "ExprStmt",
) {}
export class ItemStmt extends defineAstClass(
    Statement,
    NodeKind.ItemStmt,
    "ItemStmt",
) {}

export class FnItem extends defineAstClass(Item, NodeKind.FnItem, "FnItem") {}
export class StructItem extends defineAstClass(
    Item,
    NodeKind.StructItem,
    "StructItem",
) {}
export class EnumItem extends defineAstClass(
    Item,
    NodeKind.EnumItem,
    "EnumItem",
) {}
export class ModItem extends defineAstClass(
    Item,
    NodeKind.ModItem,
    "ModItem",
) {}
export class UseItem extends defineAstClass(
    Item,
    NodeKind.UseItem,
    "UseItem",
) {}
export class ImplItem extends defineAstClass(
    Item,
    NodeKind.ImplItem,
    "ImplItem",
) {}
export class TraitItem extends defineAstClass(
    Item,
    NodeKind.TraitItem,
    "TraitItem",
) {}

export class IdentPat extends defineAstClass(
    Pattern,
    NodeKind.IdentPat,
    "IdentPat",
) {}
export class WildcardPat extends defineAstClass(
    Pattern,
    NodeKind.WildcardPat,
    "WildcardPat",
) {}
export class LiteralPat extends defineAstClass(
    Pattern,
    NodeKind.LiteralPat,
    "LiteralPat",
) {}
export class RangePat extends defineAstClass(
    Pattern,
    NodeKind.RangePat,
    "RangePat",
) {}
export class StructPat extends defineAstClass(
    Pattern,
    NodeKind.StructPat,
    "StructPat",
) {}
export class TuplePat extends defineAstClass(
    Pattern,
    NodeKind.TuplePat,
    "TuplePat",
) {}
export class SlicePat extends defineAstClass(
    Pattern,
    NodeKind.SlicePat,
    "SlicePat",
) {}
export class OrPat extends defineAstClass(Pattern, NodeKind.OrPat, "OrPat") {}
export class BindingPat extends defineAstClass(
    Pattern,
    NodeKind.BindingPat,
    "BindingPat",
) {}

export class NamedTypeNode extends defineAstClass(
    TypeNode,
    NodeKind.NamedType,
    "NamedTypeNode",
) {}
export class TupleTypeNode extends defineAstClass(
    TypeNode,
    NodeKind.TupleType,
    "TupleTypeNode",
) {}
export class ArrayTypeNode extends defineAstClass(
    TypeNode,
    NodeKind.ArrayType,
    "ArrayTypeNode",
) {}
export class RefTypeNode extends defineAstClass(
    TypeNode,
    NodeKind.RefType,
    "RefTypeNode",
) {}
export class PtrTypeNode extends defineAstClass(
    TypeNode,
    NodeKind.PtrType,
    "PtrTypeNode",
) {}
export class FnTypeNode extends defineAstClass(
    TypeNode,
    NodeKind.FnType,
    "FnTypeNode",
) {}
export class GenericArgsNode extends defineAstClass(
    TypeNode,
    NodeKind.GenericArgs,
    "GenericArgsNode",
) {}

export class ModuleNode extends defineAstClass(
    AstNode,
    NodeKind.Module,
    "ModuleNode",
) {}
export class ParamNode extends defineAstClass(
    AstNode,
    NodeKind.Param,
    "ParamNode",
) {}
export class StructFieldNode extends defineAstClass(
    AstNode,
    NodeKind.StructField,
    "StructFieldNode",
) {}
export class EnumVariantNode extends defineAstClass(
    AstNode,
    NodeKind.EnumVariant,
    "EnumVariantNode",
) {}
export class UseTreeNode extends defineAstClass(
    AstNode,
    NodeKind.UseTree,
    "UseTreeNode",
) {}
export class MatchArmNode extends defineAstClass(
    AstNode,
    NodeKind.MatchArm,
    "MatchArmNode",
) {}

installAstMetadataAccessors(AstNode.prototype);

export type LegacyNode = { kind: NodeKind; span: Span } & Record<string, any>;
export type Node = AstNode | LegacyNode;

const NODE_CTOR_BY_KIND: Record<number, any> = {
    [NodeKind.LiteralExpr]: LiteralExpr,
    [NodeKind.IdentifierExpr]: IdentifierExpr,
    [NodeKind.BinaryExpr]: BinaryExpr,
    [NodeKind.UnaryExpr]: UnaryExpr,
    [NodeKind.CallExpr]: CallExpr,
    [NodeKind.FieldExpr]: FieldExpr,
    [NodeKind.IndexExpr]: IndexExpr,
    [NodeKind.AssignExpr]: AssignExpr,
    [NodeKind.IfExpr]: IfExpr,
    [NodeKind.MatchExpr]: MatchExpr,
    [NodeKind.BlockExpr]: BlockExpr,
    [NodeKind.ReturnExpr]: ReturnExpr,
    [NodeKind.BreakExpr]: BreakExpr,
    [NodeKind.ContinueExpr]: ContinueExpr,
    [NodeKind.LoopExpr]: LoopExpr,
    [NodeKind.WhileExpr]: WhileExpr,
    [NodeKind.ForExpr]: ForExpr,
    [NodeKind.PathExpr]: PathExpr,
    [NodeKind.StructExpr]: StructExpr,
    [NodeKind.RangeExpr]: RangeExpr,
    [NodeKind.RefExpr]: RefExpr,
    [NodeKind.DerefExpr]: DerefExpr,
    [NodeKind.MacroExpr]: MacroExpr,
    [NodeKind.ClosureExpr]: ClosureExpr,
    [NodeKind.LetStmt]: LetStmt,
    [NodeKind.ExprStmt]: ExprStmt,
    [NodeKind.ItemStmt]: ItemStmt,
    [NodeKind.FnItem]: FnItem,
    [NodeKind.StructItem]: StructItem,
    [NodeKind.EnumItem]: EnumItem,
    [NodeKind.ModItem]: ModItem,
    [NodeKind.UseItem]: UseItem,
    [NodeKind.IdentPat]: IdentPat,
    [NodeKind.WildcardPat]: WildcardPat,
    [NodeKind.LiteralPat]: LiteralPat,
    [NodeKind.RangePat]: RangePat,
    [NodeKind.StructPat]: StructPat,
    [NodeKind.TuplePat]: TuplePat,
    [NodeKind.SlicePat]: SlicePat,
    [NodeKind.OrPat]: OrPat,
    [NodeKind.BindingPat]: BindingPat,
    [NodeKind.NamedType]: NamedTypeNode,
    [NodeKind.TupleType]: TupleTypeNode,
    [NodeKind.ArrayType]: ArrayTypeNode,
    [NodeKind.RefType]: RefTypeNode,
    [NodeKind.PtrType]: PtrTypeNode,
    [NodeKind.FnType]: FnTypeNode,
    [NodeKind.GenericArgs]: GenericArgsNode,
    [NodeKind.Module]: ModuleNode,
    [NodeKind.Param]: ParamNode,
    [NodeKind.StructField]: StructFieldNode,
    [NodeKind.EnumVariant]: EnumVariantNode,
    [NodeKind.UseTree]: UseTreeNode,
    [NodeKind.MatchArm]: MatchArmNode,
    [NodeKind.ImplItem]: ImplItem,
    [NodeKind.TraitItem]: TraitItem,
};

function makeSpan(
    line: number,
    column: number,
    start: number,
    end: number,
): Span {
    return { line, column, start, end };
}

function makeSpanFromTokens(startToken: Token, endToken: Token): Span {
    return {
        line: startToken.line,
        column: startToken.column,
        start: startToken.column,
        end: endToken.column,
    };
}

function makeNode(
    kind: NodeKind,
    span: Span,
    props: Record<string, unknown>,
): Node {
    return { kind, span, ...props };
}

function makeLiteralExpr(
    span: Span,
    kind: LiteralKind,
    value: string | number | boolean,
    raw: string,
): Node {
    return makeNode(NodeKind.LiteralExpr, span, {
        literalKind: kind,
        value,
        raw,
    });
}

function makeIdentifierExpr(span: Span, name: string): Node {
    return makeNode(NodeKind.IdentifierExpr, span, { name });
}

function makeBinaryExpr(
    span: Span,
    op: BinaryOp,
    left: Node,
    right: Node,
): Node {
    return makeNode(NodeKind.BinaryExpr, span, { op, left, right });
}

function makeUnaryExpr(span: Span, op: UnaryOp, operand: Node): Node {
    return makeNode(NodeKind.UnaryExpr, span, { op, operand });
}

function makeCallExpr(
    span: Span,
    callee: Node,
    args: Node[],
    typeArgs: Node[] | null = null,
): Node {
    return makeNode(NodeKind.CallExpr, span, { callee, args, typeArgs });
}

/**
 * @param {Span} span
 * @param {Node} receiver
 * @param {string | Node} field
 * @returns {Node}
 */
function makeFieldExpr(span: Span, receiver: Node, field: string | Node): Node {
    return makeNode(NodeKind.FieldExpr, span, { receiver, field });
}

function makeIndexExpr(span: Span, receiver: Node, index: Node): Node {
    return makeNode(NodeKind.IndexExpr, span, { receiver, index });
}

/**
 * @param {Span} span
 * @param {Node} target
 * @param {Node} value
 * @returns {Node}
 */
function makeAssignExpr(span: Span, target: Node, value: Node): Node {
    return makeNode(NodeKind.AssignExpr, span, { target, value });
}

/**
 * @param {Span} span
 * @param {Node} condition
 * @param {Node} thenBranch
 * @param {Node | null} elseBranch
 * @returns {Node}
 */
function makeIfExpr(
    span: Span,
    condition: Node,
    thenBranch: Node,
    elseBranch: Node | null,
): Node {
    return makeNode(NodeKind.IfExpr, span, {
        condition,
        thenBranch,
        elseBranch,
    });
}

/**
 * @param {Span} span
 * @param {Node} scrutinee
 * @param {Node[]} arms
 * @returns {Node}
 */
function makeMatchExpr(span: Span, scrutinee: Node, arms: Node[]): Node {
    return makeNode(NodeKind.MatchExpr, span, { scrutinee, arms });
}

/**
 * @param {Span} span
 * @param {Node[]} stmts
 * @param {Node | null} expr
 * @returns {Node}
 */
function makeBlockExpr(span: Span, stmts: Node[], expr: Node | null): Node {
    return makeNode(NodeKind.BlockExpr, span, { stmts, expr });
}

/**
 * @param {Span} span
 * @param {Node | null} value
 * @returns {Node}
 */
function makeReturnExpr(span: Span, value: Node | null): Node {
    return makeNode(NodeKind.ReturnExpr, span, { value });
}

/**
 * @param {Span} span
 * @param {Node | null} value
 * @returns {Node}
 */
function makeBreakExpr(span: Span, value: Node | null): Node {
    return makeNode(NodeKind.BreakExpr, span, { value });
}

/**
 * @param {Span} span
 * @returns {Node}
 */
function makeContinueExpr(span: Span): Node {
    return makeNode(NodeKind.ContinueExpr, span, {});
}

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {Node} body
 * @returns {Node}
 */
function makeLoopExpr(span: Span, label: string | null, body: Node): Node {
    return makeNode(NodeKind.LoopExpr, span, { label, body });
}

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {Node} condition
 * @param {Node} body
 * @returns {Node}
 */
function makeWhileExpr(
    span: Span,
    label: string | null,
    condition: Node,
    body: Node,
): Node {
    return makeNode(NodeKind.WhileExpr, span, { label, condition, body });
}

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {Node} pat
 * @param {Node} iter
 * @param {Node} body
 * @returns {Node}
 */
function makeForExpr(
    span: Span,
    label: string | null,
    pat: Node,
    iter: Node,
    body: Node,
): Node {
    return makeNode(NodeKind.ForExpr, span, { label, pat, iter, body });
}

/**
 * @param {Span} span
 * @param {string[]} segments
 * @returns {Node}
 */
function makePathExpr(span: Span, segments: string[]): Node {
    return makeNode(NodeKind.PathExpr, span, { segments });
}

/**
 * @param {Span} span
 * @param {Node} path
 * @param {{ name: string, value: Node }[]} fields
 * @param {Node | null} spread
 * @returns {Node}
 */
function makeStructExpr(
    span: Span,
    path: Node,
    fields: { name: string; value: Node }[],
    spread: Node | null,
): Node {
    return makeNode(NodeKind.StructExpr, span, { path, fields, spread });
}

/**
 * @param {Span} span
 * @param {Node | null} start
 * @param {Node | null} end
 * @param {boolean} inclusive
 * @returns {Node}
 */
function makeRangeExpr(
    span: Span,
    start: Node | null,
    end: Node | null,
    inclusive: boolean,
): Node {
    return makeNode(NodeKind.RangeExpr, span, { start, end, inclusive });
}

function makeRefExpr(span: Span, mutability: Mutability, operand: Node): Node {
    return makeNode(NodeKind.RefExpr, span, { mutability, operand });
}

function makeDerefExpr(span: Span, operand: Node): Node {
    return makeNode(NodeKind.DerefExpr, span, { operand });
}
function makeMacroExpr(span: Span, name: string, args: Node[]): Node {
    return makeNode(NodeKind.MacroExpr, span, { name, args });
}

function makeClosureExpr(
    span: Span,
    params: Node[],
    returnType: Node | null,
    body: Node,
    isMove: boolean = false,
): Node {
    return makeNode(NodeKind.ClosureExpr, span, {
        params,
        returnType,
        body,
        isMove,
    });
}
function makeLetStmt(
    span: Span,
    pat: Node,
    ty: Node | null,
    init: Node | null,
): Node {
    return makeNode(NodeKind.LetStmt, span, { pat, ty, init });
}

function makeExprStmt(span: Span, expr: Node, hasSemicolon: boolean): Node {
    return makeNode(NodeKind.ExprStmt, span, { expr, hasSemicolon });
}

function makeItemStmt(span: Span, item: Node): Node {
    return makeNode(NodeKind.ItemStmt, span, { item });
}

function makeParam(
    span: Span,
    name: string,
    ty: Node | null = null,
    pat: Node | null = null,
    isReceiver: boolean = false,
    receiverKind: "value" | "ref" | "ref_mut" | null = null,
): Node {
    return makeNode(NodeKind.Param, span, {
        name,
        ty,
        pat,
        isReceiver,
        receiverKind,
    });
}

// FIXME: To many arguments
function makeFnItem(
    span: Span,
    name: string,
    generics: string[] | null,
    params: Node[],
    returnType: Node | null,
    body: Node | null,
    isAsync: boolean = false,
    isUnsafe: boolean = false,
    isConst: boolean = false,
    isPub: boolean = false,
    genericParams: { name: string; bounds: Node[] }[] | null = null,
    whereClause: { name: string; bounds: Node[] }[] | null = null,
    ignoredLifetimeParams: string[] = [],
    isTest: boolean = false,
    expectedOutput: string | null = null,
    isBuiltin: boolean = false,
    builtinName: string | null = null,
): Node {
    return makeNode(NodeKind.FnItem, span, {
        name,
        generics,
        genericParams,
        whereClause,
        ignoredLifetimeParams,
        params,
        returnType,
        body,
        isAsync,
        isUnsafe,
        isConst,
        isPub,
        isTest,
        expectedOutput,
        isBuiltin,
        builtinName,
    });
}

function makeStructField(
    span: Span,
    name: string,
    ty: Node | null,
    defaultValue: Node | null,
    isPub: boolean = false,
): Node {
    return makeNode(NodeKind.StructField, span, {
        name,
        ty,
        defaultValue,
        isPub,
    });
}

function makeStructItem(
    span: Span,
    name: string,
    generics: string[] | null,
    fields: Node[],
    isTuple: boolean,
    isPub: boolean = false,
    ignoredLifetimeParams: string[] = [],
): Node {
    return makeNode(NodeKind.StructItem, span, {
        name,
        generics,
        ignoredLifetimeParams,
        fields,
        isTuple,
        isPub,
    });
}

function makeEnumVariant(
    span: Span,
    name: string,
    fields: Node[],
    discriminant: Node | null,
): Node {
    return makeNode(NodeKind.EnumVariant, span, { name, fields, discriminant });
}

function makeEnumItem(
    span: Span,
    name: string,
    generics: string[] | null,
    variants: Node[],
    isPub: boolean = false,
    ignoredLifetimeParams: string[] = [],
): Node {
    return makeNode(NodeKind.EnumItem, span, {
        name,
        generics,
        ignoredLifetimeParams,
        variants,
        isPub,
    });
}

function makeModItem(
    span: Span,
    name: string,
    items: Node[],
    isInline: boolean,
    isPub: boolean = false,
): Node {
    return makeNode(NodeKind.ModItem, span, { name, items, isInline, isPub });
}

function makeUseTree(
    span: Span,
    path: string[],
    alias: string | null,
    children: Node[] | null,
): Node {
    return makeNode(NodeKind.UseTree, span, { path, alias, children });
}

function makeUseItem(span: Span, tree: Node, isPub: boolean): Node {
    return makeNode(NodeKind.UseItem, span, { tree, isPub });
}

function makeTraitItem(
    span: Span,
    name: string,
    methods: Node[],
    isUnsafe: boolean = false,
    isPub: boolean = false,
): Node {
    return makeNode(NodeKind.TraitItem, span, {
        name,
        methods,
        isUnsafe,
        isPub,
    });
}

function makeImplItem(
    span: Span,
    targetType: Node,
    traitType: Node | null,
    methods: Node[],
    isUnsafe: boolean = false,
    genericParams: { name: string; bounds: Node[] }[] | null = null,
    ignoredLifetimeParams: string[] = [],
): Node {
    return makeNode(NodeKind.ImplItem, span, {
        targetType,
        traitType,
        methods,
        isUnsafe,
        genericParams,
        ignoredLifetimeParams,
    });
}

function makeIdentPat(
    span: Span,
    name: string,
    mutability: Mutability,
    isRef: boolean,
    ty: Node | null,
): Node {
    return makeNode(NodeKind.IdentPat, span, { name, mutability, isRef, ty });
}

function makeWildcardPat(span: Span): Node {
    return makeNode(NodeKind.WildcardPat, span, {});
}

function makeLiteralPat(
    span: Span,
    literalKind: LiteralKind,
    value: string | number | boolean,
): Node {
    return makeNode(NodeKind.LiteralPat, span, { literalKind, value });
}

function makeRangePat(
    span: Span,
    start: Node,
    end: Node,
    inclusive: boolean,
): Node {
    return makeNode(NodeKind.RangePat, span, { start, end, inclusive });
}

function makeStructPat(
    span: Span,
    path: Node,
    fields: { name: string; pat: Node }[],
    rest: boolean,
): Node {
    return makeNode(NodeKind.StructPat, span, { path, fields, rest });
}

function makeTuplePat(span: Span, elements: Node[]): Node {
    return makeNode(NodeKind.TuplePat, span, { elements });
}

function makeSlicePat(span: Span, elements: Node[], rest: Node | null): Node {
    return makeNode(NodeKind.SlicePat, span, { elements, rest });
}

function makeOrPat(span: Span, alternatives: Node[]): Node {
    return makeNode(NodeKind.OrPat, span, { alternatives });
}

function makeBindingPat(span: Span, name: string, pat: Node): Node {
    return makeNode(NodeKind.BindingPat, span, { name, pat });
}

function makeMatchArm(
    span: Span,
    pat: Node,
    guard: Node | null,
    body: Node,
): Node {
    return makeNode(NodeKind.MatchArm, span, { pat, guard, body });
}

function makeNamedType(span: Span, name: string, args: Node | null): Node {
    return makeNode(NodeKind.NamedType, span, { name, args });
}

function makeTupleType(span: Span, elements: Node[]): Node {
    return makeNode(NodeKind.TupleType, span, { elements });
}

function makeArrayType(span: Span, element: Node, length: Node | null): Node {
    return makeNode(NodeKind.ArrayType, span, { element, length });
}

function makeRefType(
    span: Span,
    mutability: Mutability,
    inner: Node,
    ignoredLifetimeName: string | null = null,
): Node {
    return makeNode(NodeKind.RefType, span, {
        mutability,
        inner,
        ignoredLifetimeName,
    });
}

function makePtrType(span: Span, mutability: Mutability, inner: Node): Node {
    return makeNode(NodeKind.PtrType, span, { mutability, inner });
}

function makeFnType(
    span: Span,
    params: Node[],
    returnType: Node | null,
    isUnsafe: boolean,
    isConst: boolean = false,
): Node {
    return makeNode(NodeKind.FnType, span, {
        params,
        returnType,
        isUnsafe,
        isConst,
    });
}

function makeGenericArgs(span: Span, args: Node[]): Node {
    return makeNode(NodeKind.GenericArgs, span, { args });
}

function makeModule(span: Span, name: string, items: Node[]): Node {
    return makeNode(NodeKind.Module, span, { name, items });
}

function isExpr(node: Node): boolean {
    return (
        node.kind <= NodeKind.MacroExpr || node.kind === NodeKind.ClosureExpr
    );
}

function isStmt(node: Node): boolean {
    return node.kind >= NodeKind.LetStmt && node.kind <= NodeKind.ItemStmt;
}

function isItem(node: Node): boolean {
    return (
        (node.kind >= NodeKind.FnItem && node.kind <= NodeKind.UseItem) ||
        node.kind === NodeKind.ImplItem ||
        node.kind === NodeKind.TraitItem
    );
}

function isPat(node: Node): boolean {
    return node.kind >= NodeKind.IdentPat && node.kind <= NodeKind.BindingPat;
}

function isType(node: Node): boolean {
    return node.kind >= NodeKind.NamedType && node.kind <= NodeKind.GenericArgs;
}

export {
    NodeKind,
    LiteralKind,
    UnaryOp,
    BinaryOp,
    Mutability,
    BuiltinType,
    makeSpan,
    makeSpanFromTokens,
    makeNode,
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
    isExpr,
    isStmt,
    isItem,
    isPat,
    isType,
};
