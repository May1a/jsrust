/** @typedef {number} NodeKindValue */
/** @typedef {number} LiteralKindValue */
/** @typedef {number} UnaryOpValue */
/** @typedef {number} BinaryOpValue */
/** @typedef {number} MutabilityValue */
/** @typedef {number} BuiltinTypeValue */

/** @typedef {{ line: number, column: number, start: number, end: number }} Span */
/** @typedef {{ kind: NodeKindValue, span: Span } & Record<string, any>} Node */
/** @typedef {{ type: number, value: string, line: number, column: number }} Token */

const NodeKind = {
    LiteralExpr: 0,
    IdentifierExpr: 1,
    BinaryExpr: 2,
    UnaryExpr: 3,
    CallExpr: 4,
    FieldExpr: 5,
    IndexExpr: 6,
    AssignExpr: 7,
    IfExpr: 8,
    MatchExpr: 9,
    BlockExpr: 10,
    ReturnExpr: 11,
    BreakExpr: 12,
    ContinueExpr: 13,
    LoopExpr: 14,
    WhileExpr: 15,
    ForExpr: 16,
    PathExpr: 17,
    StructExpr: 18,
    RangeExpr: 19,
    RefExpr: 20,
    DerefExpr: 21,
    MacroExpr: 22,
    ClosureExpr: 55,
    LetStmt: 23,
    ExprStmt: 24,
    ItemStmt: 25,
    FnItem: 26,
    StructItem: 27,
    EnumItem: 28,
    ModItem: 29,
    UseItem: 30,
    IdentPat: 31,
    WildcardPat: 32,
    LiteralPat: 33,
    RangePat: 34,
    StructPat: 35,
    TuplePat: 36,
    SlicePat: 37,
    OrPat: 38,
    BindingPat: 39,
    NamedType: 40,
    TupleType: 41,
    ArrayType: 42,
    RefType: 43,
    PtrType: 44,
    FnType: 45,
    GenericArgs: 46,
    Module: 47,
    Param: 48,
    StructField: 49,
    EnumVariant: 50,
    UseTree: 51,
    MatchArm: 52,
    ImplItem: 53,
    TraitItem: 54,
};

const LiteralKind = {
    Int: 0,
    Float: 1,
    Bool: 2,
    String: 3,
    Char: 4,
};

const UnaryOp = {
    Not: 0,
    Neg: 1,
    Deref: 2,
    Ref: 3,
};

const BinaryOp = {
    Add: 0,
    Sub: 1,
    Mul: 2,
    Div: 3,
    Rem: 4,
    Eq: 5,
    Ne: 6,
    Lt: 7,
    Le: 8,
    Gt: 9,
    Ge: 10,
    And: 11,
    Or: 12,
    BitXor: 13,
    BitAnd: 14,
    BitOr: 15,
    Shl: 16,
    Shr: 17,
};

const Mutability = {
    Immutable: 0,
    Mutable: 1,
};

const BuiltinType = {
    I8: 0,
    I16: 1,
    I32: 2,
    I64: 3,
    I128: 4,
    Isize: 5,
    U8: 6,
    U16: 7,
    U32: 8,
    U64: 9,
    U128: 10,
    Usize: 11,
    F32: 12,
    F64: 13,
    Bool: 14,
    Char: 15,
    Str: 16,
    Unit: 17,
    Never: 18,
};

/**
 * @param {number} line
 * @param {number} column
 * @param {number} start
 * @param {number} end
 * @returns {Span}
 */
function makeSpan(line, column, start, end) {
    return { line, column, start, end };
}

/**
 * @param {Token} startToken
 * @param {Token} endToken
 * @returns {Span}
 */
function makeSpanFromTokens(startToken, endToken) {
    return {
        line: startToken.line,
        column: startToken.column,
        start: startToken.column,
        end: endToken.column,
    };
}

/**
 * @param {NodeKindValue} kind
 * @param {Span} span
 * @param {Record<string, unknown>} [props]
 * @returns {Node}
 */
function makeNode(kind, span, props) {
    return { kind, span, ...props };
}

/**
 * @param {Span} span
 * @param {LiteralKindValue} kind
 * @param {string | number | boolean} value
 * @param {string} raw
 * @returns {Node}
 */
function makeLiteralExpr(span, kind, value, raw) {
    return makeNode(NodeKind.LiteralExpr, span, {
        literalKind: kind,
        value,
        raw,
    });
}

/**
 * @param {Span} span
 * @param {string} name
 * @returns {Node}
 */
function makeIdentifierExpr(span, name) {
    return makeNode(NodeKind.IdentifierExpr, span, { name });
}

/**
 * @param {Span} span
 * @param {BinaryOpValue} op
 * @param {Node} left
 * @param {Node} right
 * @returns {Node}
 */
function makeBinaryExpr(span, op, left, right) {
    return makeNode(NodeKind.BinaryExpr, span, { op, left, right });
}

/**
 * @param {Span} span
 * @param {UnaryOpValue} op
 * @param {Node} operand
 * @returns {Node}
 */
function makeUnaryExpr(span, op, operand) {
    return makeNode(NodeKind.UnaryExpr, span, { op, operand });
}

/**
 * @param {Span} span
 * @param {Node} callee
 * @param {Node[]} args
 * @param {Node[] | null} [typeArgs=null]
 * @returns {Node}
 */
function makeCallExpr(span, callee, args, typeArgs = null) {
    return makeNode(NodeKind.CallExpr, span, { callee, args, typeArgs });
}

/**
 * @param {Span} span
 * @param {Node} receiver
 * @param {string | Node} field
 * @returns {Node}
 */
function makeFieldExpr(span, receiver, field) {
    return makeNode(NodeKind.FieldExpr, span, { receiver, field });
}

/**
 * @param {Span} span
 * @param {Node} receiver
 * @param {Node} index
 * @returns {Node}
 */
function makeIndexExpr(span, receiver, index) {
    return makeNode(NodeKind.IndexExpr, span, { receiver, index });
}

/**
 * @param {Span} span
 * @param {Node} target
 * @param {Node} value
 * @returns {Node}
 */
function makeAssignExpr(span, target, value) {
    return makeNode(NodeKind.AssignExpr, span, { target, value });
}

/**
 * @param {Span} span
 * @param {Node} condition
 * @param {Node} thenBranch
 * @param {Node | null} elseBranch
 * @returns {Node}
 */
function makeIfExpr(span, condition, thenBranch, elseBranch) {
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
function makeMatchExpr(span, scrutinee, arms) {
    return makeNode(NodeKind.MatchExpr, span, { scrutinee, arms });
}

/**
 * @param {Span} span
 * @param {Node[]} stmts
 * @param {Node | null} expr
 * @returns {Node}
 */
function makeBlockExpr(span, stmts, expr) {
    return makeNode(NodeKind.BlockExpr, span, { stmts, expr });
}

/**
 * @param {Span} span
 * @param {Node | null} value
 * @returns {Node}
 */
function makeReturnExpr(span, value) {
    return makeNode(NodeKind.ReturnExpr, span, { value });
}

/**
 * @param {Span} span
 * @param {Node | null} value
 * @returns {Node}
 */
function makeBreakExpr(span, value) {
    return makeNode(NodeKind.BreakExpr, span, { value });
}

/**
 * @param {Span} span
 * @returns {Node}
 */
function makeContinueExpr(span) {
    return makeNode(NodeKind.ContinueExpr, span, {});
}

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {Node} body
 * @returns {Node}
 */
function makeLoopExpr(span, label, body) {
    return makeNode(NodeKind.LoopExpr, span, { label, body });
}

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {Node} condition
 * @param {Node} body
 * @returns {Node}
 */
function makeWhileExpr(span, label, condition, body) {
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
function makeForExpr(span, label, pat, iter, body) {
    return makeNode(NodeKind.ForExpr, span, { label, pat, iter, body });
}

/**
 * @param {Span} span
 * @param {string[]} segments
 * @returns {Node}
 */
function makePathExpr(span, segments) {
    return makeNode(NodeKind.PathExpr, span, { segments });
}

/**
 * @param {Span} span
 * @param {Node} path
 * @param {{ name: string, value: Node }[]} fields
 * @param {Node | null} spread
 * @returns {Node}
 */
function makeStructExpr(span, path, fields, spread) {
    return makeNode(NodeKind.StructExpr, span, { path, fields, spread });
}

/**
 * @param {Span} span
 * @param {Node | null} start
 * @param {Node | null} end
 * @param {boolean} inclusive
 * @returns {Node}
 */
function makeRangeExpr(span, start, end, inclusive) {
    return makeNode(NodeKind.RangeExpr, span, { start, end, inclusive });
}

/**
 * @param {Span} span
 * @param {MutabilityValue} mutability
 * @param {Node} operand
 * @returns {Node}
 */
function makeRefExpr(span, mutability, operand) {
    return makeNode(NodeKind.RefExpr, span, { mutability, operand });
}

/**
 * @param {Span} span
 * @param {Node} operand
 * @returns {Node}
 */
function makeDerefExpr(span, operand) {
    return makeNode(NodeKind.DerefExpr, span, { operand });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node[]} args
 * @returns {Node}
 */
function makeMacroExpr(span, name, args) {
    return makeNode(NodeKind.MacroExpr, span, { name, args });
}

/**
 * @param {Span} span
 * @param {Node[]} params
 * @param {Node | null} returnType
 * @param {Node} body
 * @param {boolean} [isMove=false]
 * @returns {Node}
 */
function makeClosureExpr(span, params, returnType, body, isMove = false) {
    return makeNode(NodeKind.ClosureExpr, span, {
        params,
        returnType,
        body,
        isMove,
    });
}

/**
 * @param {Span} span
 * @param {Node} pat
 * @param {Node | null} ty
 * @param {Node | null} init
 * @returns {Node}
 */
function makeLetStmt(span, pat, ty, init) {
    return makeNode(NodeKind.LetStmt, span, { pat, ty, init });
}

/**
 * @param {Span} span
 * @param {Node} expr
 * @param {boolean} hasSemicolon
 * @returns {Node}
 */
function makeExprStmt(span, expr, hasSemicolon) {
    return makeNode(NodeKind.ExprStmt, span, { expr, hasSemicolon });
}

/**
 * @param {Span} span
 * @param {Node} item
 * @returns {Node}
 */
function makeItemStmt(span, item) {
    return makeNode(NodeKind.ItemStmt, span, { item });
}

/**
 * @param {Span} span
 * @param {string | null} name
 * @param {Node | null} ty
 * @param {Node | null} pat
 * @param {boolean} [isReceiver=false]
 * @param {"value" | "ref" | "ref_mut" | null} [receiverKind=null]
 * @returns {Node}
 */
function makeParam(
    span,
    name,
    ty,
    pat,
    isReceiver = false,
    receiverKind = null,
) {
    return makeNode(NodeKind.Param, span, {
        name,
        ty,
        pat,
        isReceiver,
        receiverKind,
    });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {string[] | null} generics
 * @param {Node[]} params
 * @param {Node | null} returnType
 * @param {Node | null} body
 * @param {boolean} isAsync
 * @param {boolean} isUnsafe
 * @param {boolean} [isConst=false]
 * @param {boolean} [isPub=false]
 * @param {{ name: string, bounds: Node[] }[] | null} [genericParams=null]
 * @param {{ name: string, bounds: Node[] }[] | null} [whereClause=null]
 * @param {string[]} [ignoredLifetimeParams=[]]
 * @param {boolean} [isTest=false]
 * @param {string | null} [expectedOutput=null]
 * @param {boolean} [isBuiltin=false]
 * @param {string | null} [builtinName=null]
 * @returns {Node}
 */
function makeFnItem(
    span,
    name,
    generics,
    params,
    returnType,
    body,
    isAsync,
    isUnsafe,
    isConst = false,
    isPub = false,
    genericParams = null,
    whereClause = null,
    ignoredLifetimeParams = [],
    isTest = false,
    expectedOutput = null,
    isBuiltin = false,
    builtinName = null,
) {
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

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node | null} ty
 * @param {Node | null} defaultValue
 * @param {boolean} [isPub=false]
 * @returns {Node}
 */
function makeStructField(span, name, ty, defaultValue, isPub = false) {
    return makeNode(NodeKind.StructField, span, {
        name,
        ty,
        defaultValue,
        isPub,
    });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {string[] | null} generics
 * @param {Node[]} fields
 * @param {boolean} isTuple
 * @param {boolean} [isPub=false]
 * @param {string[]} [ignoredLifetimeParams=[]]
 * @returns {Node}
 */
function makeStructItem(
    span,
    name,
    generics,
    fields,
    isTuple,
    isPub = false,
    ignoredLifetimeParams = [],
) {
    return makeNode(NodeKind.StructItem, span, {
        name,
        generics,
        ignoredLifetimeParams,
        fields,
        isTuple,
        isPub,
    });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node[]} fields
 * @param {Node | null} discriminant
 * @returns {Node}
 */
function makeEnumVariant(span, name, fields, discriminant) {
    return makeNode(NodeKind.EnumVariant, span, { name, fields, discriminant });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {string[] | null} generics
 * @param {Node[]} variants
 * @param {boolean} [isPub=false]
 * @param {string[]} [ignoredLifetimeParams=[]]
 * @returns {Node}
 */
function makeEnumItem(
    span,
    name,
    generics,
    variants,
    isPub = false,
    ignoredLifetimeParams = [],
) {
    return makeNode(NodeKind.EnumItem, span, {
        name,
        generics,
        ignoredLifetimeParams,
        variants,
        isPub,
    });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node[]} items
 * @param {boolean} isInline
 * @param {boolean} [isPub=false]
 * @returns {Node}
 */
function makeModItem(span, name, items, isInline, isPub = false) {
    return makeNode(NodeKind.ModItem, span, { name, items, isInline, isPub });
}

/**
 * @param {Span} span
 * @param {string[]} path
 * @param {string | null} alias
 * @param {Node[] | null} children
 * @returns {Node}
 */
function makeUseTree(span, path, alias, children) {
    return makeNode(NodeKind.UseTree, span, { path, alias, children });
}

/**
 * @param {Span} span
 * @param {Node} tree
 * @param {boolean} isPub
 * @returns {Node}
 */
function makeUseItem(span, tree, isPub) {
    return makeNode(NodeKind.UseItem, span, { tree, isPub });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node[]} methods
 * @param {boolean} [isUnsafe=false]
 * @param {boolean} [isPub=false]
 * @returns {Node}
 */
function makeTraitItem(span, name, methods, isUnsafe = false, isPub = false) {
    return makeNode(NodeKind.TraitItem, span, {
        name,
        methods,
        isUnsafe,
        isPub,
    });
}

/**
 * @param {Span} span
 * @param {Node} targetType
 * @param {Node | null} traitType
 * @param {Node[]} methods
 * @param {boolean} [isUnsafe=false]
 * @param {{ name: string, bounds: Node[] }[] | null} [genericParams=null]
 * @param {string[]} [ignoredLifetimeParams=[]]
 * @returns {Node}
 */
function makeImplItem(
    span,
    targetType,
    traitType,
    methods,
    isUnsafe = false,
    genericParams = null,
    ignoredLifetimeParams = [],
) {
    return makeNode(NodeKind.ImplItem, span, {
        targetType,
        traitType,
        methods,
        isUnsafe,
        genericParams,
        ignoredLifetimeParams,
    });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {MutabilityValue} mutability
 * @param {boolean} isRef
 * @param {Node | null} ty
 * @returns {Node}
 */
function makeIdentPat(span, name, mutability, isRef, ty) {
    return makeNode(NodeKind.IdentPat, span, { name, mutability, isRef, ty });
}

/**
 * @param {Span} span
 * @returns {Node}
 */
function makeWildcardPat(span) {
    return makeNode(NodeKind.WildcardPat, span, {});
}

/**
 * @param {Span} span
 * @param {LiteralKindValue} literalKind
 * @param {string | number | boolean} value
 * @returns {Node}
 */
function makeLiteralPat(span, literalKind, value) {
    return makeNode(NodeKind.LiteralPat, span, { literalKind, value });
}

/**
 * @param {Span} span
 * @param {Node} start
 * @param {Node} end
 * @param {boolean} inclusive
 * @returns {Node}
 */
function makeRangePat(span, start, end, inclusive) {
    return makeNode(NodeKind.RangePat, span, { start, end, inclusive });
}

/**
 * @param {Span} span
 * @param {Node} path
 * @param {{ name: string, pat: Node }[]} fields
 * @param {boolean} rest
 * @returns {Node}
 */
function makeStructPat(span, path, fields, rest) {
    return makeNode(NodeKind.StructPat, span, { path, fields, rest });
}

/**
 * @param {Span} span
 * @param {Node[]} elements
 * @returns {Node}
 */
function makeTuplePat(span, elements) {
    return makeNode(NodeKind.TuplePat, span, { elements });
}

/**
 * @param {Span} span
 * @param {Node[]} elements
 * @param {Node | null} rest
 * @returns {Node}
 */
function makeSlicePat(span, elements, rest) {
    return makeNode(NodeKind.SlicePat, span, { elements, rest });
}

/**
 * @param {Span} span
 * @param {Node[]} alternatives
 * @returns {Node}
 */
function makeOrPat(span, alternatives) {
    return makeNode(NodeKind.OrPat, span, { alternatives });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node} pat
 * @returns {Node}
 */
function makeBindingPat(span, name, pat) {
    return makeNode(NodeKind.BindingPat, span, { name, pat });
}

/**
 * @param {Span} span
 * @param {Node} pat
 * @param {Node | null} guard
 * @param {Node} body
 * @returns {Node}
 */
function makeMatchArm(span, pat, guard, body) {
    return makeNode(NodeKind.MatchArm, span, { pat, guard, body });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node | null} args
 * @returns {Node}
 */
function makeNamedType(span, name, args) {
    return makeNode(NodeKind.NamedType, span, { name, args });
}

/**
 * @param {Span} span
 * @param {Node[]} elements
 * @returns {Node}
 */
function makeTupleType(span, elements) {
    return makeNode(NodeKind.TupleType, span, { elements });
}

/**
 * @param {Span} span
 * @param {Node} element
 * @param {Node | null} length
 * @returns {Node}
 */
function makeArrayType(span, element, length) {
    return makeNode(NodeKind.ArrayType, span, { element, length });
}

/**
 * @param {Span} span
 * @param {MutabilityValue} mutability
 * @param {Node} inner
 * @param {string | null} [ignoredLifetimeName=null]
 * @returns {Node}
 */
function makeRefType(span, mutability, inner, ignoredLifetimeName = null) {
    return makeNode(NodeKind.RefType, span, {
        mutability,
        inner,
        ignoredLifetimeName,
    });
}

/**
 * @param {Span} span
 * @param {MutabilityValue} mutability
 * @param {Node} inner
 * @returns {Node}
 */
function makePtrType(span, mutability, inner) {
    return makeNode(NodeKind.PtrType, span, { mutability, inner });
}

/**
 * @param {Span} span
 * @param {Node[]} params
 * @param {Node | null} returnType
 * @param {boolean} isUnsafe
 * @param {boolean} [isConst=false]
 * @returns {Node}
 */
function makeFnType(span, params, returnType, isUnsafe, isConst = false) {
    return makeNode(NodeKind.FnType, span, {
        params,
        returnType,
        isUnsafe,
        isConst,
    });
}

/**
 * @param {Span} span
 * @param {Node[]} args
 * @returns {Node}
 */
function makeGenericArgs(span, args) {
    return makeNode(NodeKind.GenericArgs, span, { args });
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Node[]} items
 * @returns {Node}
 */
function makeModule(span, name, items) {
    return makeNode(NodeKind.Module, span, { name, items });
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isExpr(node) {
    return (
        node.kind <= NodeKind.MacroExpr || node.kind === NodeKind.ClosureExpr
    );
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isStmt(node) {
    return node.kind >= NodeKind.LetStmt && node.kind <= NodeKind.ItemStmt;
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isItem(node) {
    return (
        (node.kind >= NodeKind.FnItem && node.kind <= NodeKind.UseItem) ||
        node.kind === NodeKind.ImplItem ||
        node.kind === NodeKind.TraitItem
    );
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isPat(node) {
    return node.kind >= NodeKind.IdentPat && node.kind <= NodeKind.BindingPat;
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isType(node) {
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
