// @ts-nocheck
/** @typedef {import('./types.js').Type} Type */
/** @typedef {import('./types.js').Span} Span */
/** @typedef {import('./ast.js').Node} Node */
/** @typedef {import('./type_context.js').TypeContext} TypeContext */

import { NodeKind, LiteralKind, UnaryOp, BinaryOp, Mutability } from "./ast.js";

import {
    HItemKind,
    HStmtKind,
    HPlaceKind,
    HExprKind,
    HPatKind,
    HLiteralKind,
    makeHModule,
    makeHFnDecl,
    makeHParam,
    makeHStructDecl,
    makeHStructField,
    makeHEnumDecl,
    makeHEnumVariant,
    makeHBlock,
    makeHLetStmt,
    makeHAssignStmt,
    makeHExprStmt,
    makeHReturnStmt,
    makeHBreakStmt,
    makeHContinueStmt,
    makeHVarPlace,
    makeHFieldPlace,
    makeHIndexPlace,
    makeHDerefPlace,
    makeHUnitExpr,
    makeHLiteralExpr,
    makeHVarExpr,
    makeHBinaryExpr,
    makeHUnaryExpr,
    makeHCallExpr,
    makeHFieldExpr,
    makeHIndexExpr,
    makeHRefExpr,
    makeHDerefExpr,
    makeHStructExpr,
    makeHEnumExpr,
    makeHIfExpr,
    makeHMatchExpr,
    makeHLoopExpr,
    makeHWhileExpr,
    makeHIdentPat,
    makeHWildcardPat,
    makeHLiteralPat,
    makeHStructPat,
    makeHTuplePat,
    makeHOrPat,
    makeHMatchArm,
} from "./hir.js";

import {
    TypeKind,
    IntWidth,
    FloatWidth,
    makeIntType,
    makeFnType,
    makeUnitType,
    typeToString,
} from "./types.js";

const BUILTIN_PRINTLN_BYTES_FN = "__jsrust_builtin_println_bytes";
const BUILTIN_PRINT_BYTES_FN = "__jsrust_builtin_print_bytes";

// ============================================================================
// Task 6.1: Lowering Context
// ============================================================================

/**
 * @typedef {object} LoweringError
 * @property {string} message
 * @property {Span} [span]
 */

/**
 * @typedef {object} VarInfo
 * @property {string} name
 * @property {number} id
 * @property {Type} type
 * @property {boolean} mutable
 */

/**
 * Lowering context for tracking state during AST to HIR conversion
 */
class LoweringCtx {
    constructor() {
        /** @type {LoweringError[]} */
        this.errors = [];

        /** @type {Map<string, VarInfo>} */
        this.varBindings = new Map();

        /** @type {number} */
        this.nextVarId = 0;

        /** @type {Map<string, { kind: 'fn' | 'struct' | 'enum', node: Node, type?: Type }>} */
        this.items = new Map();

        /** @type {string | null} */
        this.currentFn = null;

        /** @type {Map<string, number>} */
        this.structFieldIndices = new Map();
    }

    /**
     * Add an error
     * @param {string} message
     * @param {Span} [span]
     */
    addError(message, span) {
        this.errors.push({ message, span });
    }

    /**
     * Generate a fresh variable ID
     * @returns {number}
     */
    freshVarId() {
        return this.nextVarId++;
    }

    /**
     * Define a variable binding
     * @param {string} name
     * @param {Type} type
     * @param {boolean} mutable
     * @returns {VarInfo}
     */
    defineVar(name, type, mutable = false) {
        const id = this.freshVarId();
        const info = { name, id, type, mutable };
        this.varBindings.set(name, info);
        return info;
    }

    /**
     * Look up a variable binding
     * @param {string} name
     * @returns {VarInfo | null}
     */
    lookupVar(name) {
        return this.varBindings.get(name) || null;
    }

    /**
     * Register an item
     * @param {string} name
     * @param {'fn' | 'struct' | 'enum'} kind
     * @param {Node} node
     * @param {Type} [type]
     */
    registerItem(name, kind, node, type) {
        this.items.set(name, { kind, node, type });
    }

    /**
     * Look up an item
     * @param {string} name
     * @returns {{ kind: 'fn' | 'struct' | 'enum', node: Node, type?: Type } | null}
     */
    lookupItem(name) {
        return this.items.get(name) || null;
    }

    /**
     * Enter a new scope (for now, just clear var bindings)
     */
    pushScope() {
        // Save current bindings
        if (!this._scopeStack) {
            this._scopeStack = [];
        }
        this._scopeStack.push(new Map(this.varBindings));
    }

    /**
     * Exit current scope
     */
    popScope() {
        if (this._scopeStack && this._scopeStack.length > 0) {
            this.varBindings = this._scopeStack.pop();
        }
    }

    /**
     * Set struct field index for lookup
     * @param {string} structName
     * @param {string} fieldName
     * @param {number} index
     */
    setFieldIndex(structName, fieldName, index) {
        this.structFieldIndices.set(`${structName}.${fieldName}`, index);
    }

    /**
     * Get struct field index
     * @param {string} structName
     * @param {string} fieldName
     * @returns {number}
     */
    getFieldIndex(structName, fieldName) {
        const key = `${structName}.${fieldName}`;
        const index = this.structFieldIndices.get(key);
        return index !== undefined ? index : 0;
    }
}

// ============================================================================
// Task 6.2: Module Lowering
// ============================================================================

/**
 * Lower an AST module to HIR
 * @param {Node} ast
 * @param {TypeContext} typeCtx
 * @returns {{ module: import('./hir.js').HModule | null, errors: LoweringError[] }}
 */
function lowerModule(ast, typeCtx) {
    const ctx = new LoweringCtx();

    // First pass: register all items
    for (const item of ast.items || []) {
        registerItem(ctx, item, typeCtx);
    }

    // Second pass: lower all items
    const items = [];
    for (const item of ast.items || []) {
        const hirItem = lowerItem(ctx, item, typeCtx);
        if (hirItem) {
            items.push(hirItem);
        }
    }

    if (ctx.errors.length > 0) {
        return { module: null, errors: ctx.errors };
    }

    const span = ast.span || { line: 0, column: 0, start: 0, end: 0 };
    return {
        module: makeHModule(span, ast.name || "main", items),
        errors: [],
    };
}

/**
 * Register an item in the context
 * @param {LoweringCtx} ctx
 * @param {Node} item
 * @param {TypeContext} typeCtx
 */
function registerItem(ctx, item, typeCtx) {
    switch (item.kind) {
        case NodeKind.FnItem: {
            const itemDecl = typeCtx.lookupItem(item.name);
            ctx.registerItem(item.name, "fn", item, itemDecl?.type);
            break;
        }
        case NodeKind.StructItem: {
            ctx.registerItem(item.name, "struct", item);
            // Register field indices
            for (let i = 0; i < (item.fields || []).length; i++) {
                ctx.setFieldIndex(item.name, item.fields[i].name, i);
            }
            break;
        }
        case NodeKind.EnumItem: {
            ctx.registerItem(item.name, "enum", item);
            break;
        }
    }
}

// ============================================================================
// Task 6.3: Item Lowering
// ============================================================================

/**
 * Lower an AST item to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} item
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HItem | null}
 */
function lowerItem(ctx, item, typeCtx) {
    switch (item.kind) {
        case NodeKind.FnItem:
            return lowerFnItem(ctx, item, typeCtx);
        case NodeKind.StructItem:
            return lowerStructItem(ctx, item, typeCtx);
        case NodeKind.EnumItem:
            return lowerEnumItem(ctx, item, typeCtx);
        default:
            ctx.addError(`Unknown item kind: ${item.kind}`, item.span);
            return null;
    }
}

/**
 * Lower a function item to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} fn
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HFnDecl | null}
 */
function lowerFnItem(ctx, fn, typeCtx) {
    ctx.pushScope();
    ctx.currentFn = fn.name;

    // Get function type from type context
    const itemDecl = typeCtx.lookupItem(fn.name);
    const fnType = itemDecl?.type;

    // Lower parameters
    const params = [];
    for (let i = 0; i < (fn.params || []).length; i++) {
        const param = fn.params[i];
        const paramType = fnType?.params?.[i] || makeUnitType();
        const hParam = lowerParam(ctx, param, paramType, typeCtx);
        params.push(hParam);
    }

    // Get return type
    let returnType = fnType?.returnType || makeUnitType();

    // Lower body
    let body = null;
    if (fn.body) {
        body = lowerBlock(ctx, fn.body, typeCtx);
    }

    ctx.popScope();
    ctx.currentFn = null;

    return makeHFnDecl(
        fn.span,
        fn.name,
        fn.generics,
        params,
        returnType,
        body,
        fn.isAsync || false,
        fn.isUnsafe || false,
    );
}

/**
 * Lower a function parameter
 * @param {LoweringCtx} ctx
 * @param {Node} param
 * @param {Type} type
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HParam}
 */
function lowerParam(ctx, param, type, typeCtx) {
    let pat = null;
    if (param.pat) {
        pat = lowerPattern(ctx, param.pat, type, typeCtx);
    } else if (param.name) {
        // Create identifier pattern for named parameter
        const mutable = false; // Parameters are immutable by default
        const varInfo = ctx.defineVar(param.name, type, mutable);
        pat = makeHIdentPat(
            param.span,
            param.name,
            varInfo.id,
            type,
            mutable,
            false,
        );
    }

    return makeHParam(param.span, param.name, type, pat);
}

/**
 * Lower a struct item to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} struct
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HStructDecl}
 */
function lowerStructItem(ctx, struct, typeCtx) {
    const fields = [];

    for (const field of struct.fields || []) {
        let fieldType = null;
        if (field.ty) {
            const typeResult = resolveTypeFromAst(field.ty, typeCtx);
            if (typeResult.ok) {
                fieldType = typeResult.type;
            }
        }

        let defaultValue = null;
        if (field.defaultValue) {
            defaultValue = lowerExpr(ctx, field.defaultValue, typeCtx);
        }

        fields.push(
            makeHStructField(field.span, field.name, fieldType, defaultValue),
        );
    }

    return makeHStructDecl(
        struct.span,
        struct.name,
        struct.generics,
        fields,
        struct.isTuple || false,
    );
}

/**
 * Lower an enum item to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} enum_
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HEnumDecl}
 */
function lowerEnumItem(ctx, enum_, typeCtx) {
    const variants = [];

    for (const variant of enum_.variants || []) {
        const fields = [];
        for (const field of variant.fields || []) {
            let fieldType = null;
            if (field.ty) {
                const typeResult = resolveTypeFromAst(field.ty, typeCtx);
                if (typeResult.ok) {
                    fieldType = typeResult.type;
                }
            }
            fields.push(fieldType);
        }

        let discriminant = null;
        if (variant.discriminant) {
            // TODO: Evaluate constant expression
            discriminant = 0;
        }

        variants.push(
            makeHEnumVariant(variant.span, variant.name, fields, discriminant),
        );
    }

    return makeHEnumDecl(enum_.span, enum_.name, enum_.generics, variants);
}

// ============================================================================
// Task 6.4: Statement Lowering
// ============================================================================

/**
 * Lower an AST statement to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} stmt
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HStmt}
 */
function lowerStmt(ctx, stmt, typeCtx) {
    switch (stmt.kind) {
        case NodeKind.LetStmt:
            return lowerLetStmt(ctx, stmt, typeCtx);
        case NodeKind.ExprStmt:
            return lowerExprStmt(ctx, stmt, typeCtx);
        case NodeKind.ItemStmt: {
            // Items are handled at module level
            // Return an empty expression statement
            return makeHExprStmt(
                stmt.span,
                makeHUnitExpr(stmt.span, makeUnitType()),
            );
        }
        default:
            ctx.addError(`Unknown statement kind: ${stmt.kind}`, stmt.span);
            return makeHExprStmt(
                stmt.span,
                makeHUnitExpr(stmt.span, makeUnitType()),
            );
    }
}

/**
 * Lower a let statement
 * @param {LoweringCtx} ctx
 * @param {Node} letStmt
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HLetStmt}
 */
function lowerLetStmt(ctx, letStmt, typeCtx) {
    // Get type from annotation or initializer
    let ty = null;
    if (letStmt.ty) {
        const typeResult = resolveTypeFromAst(letStmt.ty, typeCtx);
        if (typeResult.ok) {
            ty = typeResult.type;
        }
    }

    // Lower initializer
    let init = null;
    if (letStmt.init) {
        init = lowerExpr(ctx, letStmt.init, typeCtx);
        if (!ty && init) {
            ty = init.ty;
        }
    }

    if (!ty) {
        ty = makeUnitType();
    }

    // Lower pattern
    const pat = lowerPattern(ctx, letStmt.pat, ty, typeCtx);

    return makeHLetStmt(letStmt.span, pat, ty, init);
}

/**
 * Lower an expression statement
 * @param {LoweringCtx} ctx
 * @param {Node} exprStmt
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExprStmt}
 */
function lowerExprStmt(ctx, exprStmt, typeCtx) {
    const expr = lowerExpr(ctx, exprStmt.expr, typeCtx);
    return makeHExprStmt(exprStmt.span, expr);
}

// ============================================================================
// Task 6.5: Expression Lowering
// ============================================================================

/**
 * Lower an AST expression to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} expr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExpr}
 */
function lowerExpr(ctx, expr, typeCtx) {
    switch (expr.kind) {
        case NodeKind.LiteralExpr:
            return lowerLiteral(ctx, expr, typeCtx);

        case NodeKind.IdentifierExpr:
            return lowerIdentifier(ctx, expr, typeCtx);

        case NodeKind.BinaryExpr:
            return lowerBinary(ctx, expr, typeCtx);

        case NodeKind.UnaryExpr:
            return lowerUnary(ctx, expr, typeCtx);

        case NodeKind.CallExpr:
            return lowerCall(ctx, expr, typeCtx);

        case NodeKind.FieldExpr:
            return lowerField(ctx, expr, typeCtx);

        case NodeKind.IndexExpr:
            return lowerIndex(ctx, expr, typeCtx);

        case NodeKind.AssignExpr:
            return lowerAssign(ctx, expr, typeCtx);

        case NodeKind.IfExpr:
            return lowerIf(ctx, expr, typeCtx);

        case NodeKind.MatchExpr:
            return lowerMatch(ctx, expr, typeCtx);

        case NodeKind.BlockExpr:
            return lowerBlock(ctx, expr, typeCtx);

        case NodeKind.ReturnExpr:
            return lowerReturn(ctx, expr, typeCtx);

        case NodeKind.BreakExpr:
            return lowerBreak(ctx, expr, typeCtx);

        case NodeKind.ContinueExpr:
            return lowerContinue(ctx, expr, typeCtx);

        case NodeKind.LoopExpr:
            return lowerLoop(ctx, expr, typeCtx);

        case NodeKind.WhileExpr:
            return lowerWhile(ctx, expr, typeCtx);

        case NodeKind.ForExpr:
            return lowerFor(ctx, expr, typeCtx);

        case NodeKind.PathExpr:
            return lowerPath(ctx, expr, typeCtx);

        case NodeKind.StructExpr:
            return lowerStructExpr(ctx, expr, typeCtx);

        case NodeKind.RangeExpr:
            return lowerRange(ctx, expr, typeCtx);

        case NodeKind.RefExpr:
            return lowerRef(ctx, expr, typeCtx);

        case NodeKind.DerefExpr:
            return lowerDeref(ctx, expr, typeCtx);

        case NodeKind.MacroExpr:
            return lowerMacro(ctx, expr, typeCtx);

        default:
            ctx.addError(`Unknown expression kind: ${expr.kind}`, expr.span);
            return makeHUnitExpr(expr.span, makeUnitType());
    }
}

/**
 * Lower a literal expression
 * @param {LoweringCtx} ctx
 * @param {Node} lit
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HLiteralExpr}
 */
function lowerLiteral(ctx, lit, typeCtx) {
    const hirLitKind = convertLiteralKind(lit.literalKind);
    let ty = inferLiteralType(lit.literalKind);
    return makeHLiteralExpr(lit.span, hirLitKind, lit.value, ty);
}

/**
 * Convert AST literal kind to HIR literal kind
 * @param {number} astKind
 * @returns {number}
 */
function convertLiteralKind(astKind) {
    switch (astKind) {
        case LiteralKind.Int:
            return HLiteralKind.Int;
        case LiteralKind.Float:
            return HLiteralKind.Float;
        case LiteralKind.Bool:
            return HLiteralKind.Bool;
        case LiteralKind.String:
            return HLiteralKind.String;
        case LiteralKind.Char:
            return HLiteralKind.Char;
        default:
            return HLiteralKind.Int;
    }
}

/**
 * Infer type for a literal
 * @param {number} literalKind
 * @returns {Type}
 */
function inferLiteralType(literalKind) {
    switch (literalKind) {
        case LiteralKind.Int:
            return { kind: TypeKind.Int, width: IntWidth.I32 };
        case LiteralKind.Float:
            return { kind: TypeKind.Float, width: FloatWidth.F64 };
        case LiteralKind.Bool:
            return { kind: TypeKind.Bool };
        case LiteralKind.String:
            return { kind: TypeKind.String };
        case LiteralKind.Char:
            return { kind: TypeKind.Char };
        default:
            return makeUnitType();
    }
}

/**
 * Lower an identifier expression
 * @param {LoweringCtx} ctx
 * @param {Node} ident
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExpr}
 */
function lowerIdentifier(ctx, ident, typeCtx) {
    // Look up variable binding
    const varInfo = ctx.lookupVar(ident.name);
    if (varInfo) {
        return makeHVarExpr(ident.span, varInfo.name, varInfo.id, varInfo.type);
    }

    // Look up item (function, struct, enum)
    const item = ctx.lookupItem(ident.name);
    if (item) {
        if (item.kind === "fn" && item.type) {
            // Function reference
            return makeHVarExpr(ident.span, ident.name, -1, item.type);
        }
        if (item.kind === "struct") {
            // Struct constructor - return as a reference
            const structTy = {
                kind: TypeKind.Struct,
                name: ident.name,
                fields: [],
            };
            return makeHVarExpr(ident.span, ident.name, -1, structTy);
        }
        if (item.kind === "enum") {
            // Enum reference
            const enumTy = {
                kind: TypeKind.Enum,
                name: ident.name,
                variants: [],
            };
            return makeHVarExpr(ident.span, ident.name, -1, enumTy);
        }
    }

    // Also check type context
    const typeVar = typeCtx.lookupVar(ident.name);
    if (typeVar) {
        const resolvedType = typeCtx.resolveType(typeVar.type);
        return makeHVarExpr(ident.span, ident.name, -1, resolvedType);
    }

    ctx.addError(`Unbound identifier: ${ident.name}`, ident.span);
    return makeHUnitExpr(ident.span, makeUnitType());
}

/**
 * Lower a binary expression
 * @param {LoweringCtx} ctx
 * @param {Node} binary
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HBinaryExpr}
 */
function lowerBinary(ctx, binary, typeCtx) {
    const left = lowerExpr(ctx, binary.left, typeCtx);
    const right = lowerExpr(ctx, binary.right, typeCtx);

    // Determine result type
    let ty = left.ty;
    if (binary.op >= BinaryOp.Eq && binary.op <= BinaryOp.Ge) {
        // Comparison operators return bool
        ty = { kind: TypeKind.Bool };
    } else if (binary.op === BinaryOp.And || binary.op === BinaryOp.Or) {
        ty = { kind: TypeKind.Bool };
    }

    return makeHBinaryExpr(binary.span, binary.op, left, right, ty);
}

/**
 * Lower a unary expression
 * @param {LoweringCtx} ctx
 * @param {Node} unary
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HUnaryExpr}
 */
function lowerUnary(ctx, unary, typeCtx) {
    const operand = lowerExpr(ctx, unary.operand, typeCtx);

    let ty = operand.ty;
    if (unary.op === UnaryOp.Not) {
        ty = { kind: TypeKind.Bool };
    }

    return makeHUnaryExpr(unary.span, unary.op, operand, ty);
}

/**
 * Lower a call expression
 * @param {LoweringCtx} ctx
 * @param {Node} call
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HCallExpr}
 */
function lowerCall(ctx, call, typeCtx) {
    const callee = lowerExpr(ctx, call.callee, typeCtx);
    const args = (call.args || []).map((arg) => lowerExpr(ctx, arg, typeCtx));

    // Get return type from callee type
    let ty = makeUnitType();
    if (callee.ty && callee.ty.kind === TypeKind.Fn) {
        ty = callee.ty.returnType;
    }

    return makeHCallExpr(call.span, callee, args, ty);
}

/**
 * Lower a macro invocation expression.
 * Currently supports `println!` and `print!` with a single string literal.
 * @param {LoweringCtx} ctx
 * @param {Node} macroExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExpr}
 */
function lowerMacro(ctx, macroExpr, typeCtx) {
    switch (macroExpr.name) {
        case "println":
            return lowerPrintMacro(ctx, macroExpr, BUILTIN_PRINTLN_BYTES_FN);
        case "print":
            return lowerPrintMacro(ctx, macroExpr, BUILTIN_PRINT_BYTES_FN);
        default:
            ctx.addError(`Unsupported macro in lowering: ${macroExpr.name}!`, macroExpr.span);
            return makeHUnitExpr(macroExpr.span, makeUnitType());
    }
}

/**
 * Lower print-like macros to builtin call form with UTF-8 byte args.
 * @param {LoweringCtx} ctx
 * @param {Node} macroExpr
 * @param {string} builtinName
 * @returns {import('./hir.js').HExpr}
 */
function lowerPrintMacro(ctx, macroExpr, builtinName) {
    const args = macroExpr.args || [];
    if (args.length === 0) {
        ctx.addError(`${macroExpr.name}! requires a string literal argument`, macroExpr.span);
        return makeHUnitExpr(macroExpr.span, makeUnitType());
    }

    if (args.length > 1) {
        ctx.addError(
            `${macroExpr.name}! formatting arguments are not supported yet`,
            macroExpr.span,
        );
        return makeHUnitExpr(macroExpr.span, makeUnitType());
    }

    const firstArg = args[0];
    if (
        firstArg.kind !== NodeKind.LiteralExpr ||
        firstArg.literalKind !== LiteralKind.String
    ) {
        ctx.addError(
            `${macroExpr.name}! currently requires a string literal as the first argument`,
            firstArg.span || macroExpr.span,
        );
        return makeHUnitExpr(macroExpr.span, makeUnitType());
    }

    const bytes = new TextEncoder().encode(String(firstArg.value));
    const byteType = makeIntType(IntWidth.I32, macroExpr.span);
    const hirArgs = Array.from(bytes, (byte) =>
        makeHLiteralExpr(macroExpr.span, HLiteralKind.Int, byte, byteType),
    );

    const unitType = makeUnitType(macroExpr.span);
    const calleeType = makeFnType(
        hirArgs.map(() => byteType),
        unitType,
        false,
        macroExpr.span,
    );
    const callee = makeHVarExpr(macroExpr.span, builtinName, -1, calleeType);

    return makeHCallExpr(macroExpr.span, callee, hirArgs, unitType);
}

/**
 * Lower a field expression
 * @param {LoweringCtx} ctx
 * @param {Node} field
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HFieldExpr}
 */
function lowerField(ctx, field, typeCtx) {
    const base = lowerExpr(ctx, field.receiver, typeCtx);
    const fieldName =
        typeof field.field === "string" ? field.field : field.field.name;

    // Get field index and type
    let index = 0;
    let ty = makeUnitType();

    if (base.ty && base.ty.kind === TypeKind.Struct) {
        index = ctx.getFieldIndex(base.ty.name, fieldName);
        const fieldDef = base.ty.fields?.find((f) => f.name === fieldName);
        if (fieldDef) {
            ty = fieldDef.type;
        }
    } else if (base.ty && base.ty.kind === TypeKind.Tuple) {
        // Tuple field access by index
        index = parseInt(fieldName, 10);
        if (
            !isNaN(index) &&
            base.ty.elements &&
            index < base.ty.elements.length
        ) {
            ty = base.ty.elements[index];
        }
    }

    return makeHFieldExpr(field.span, base, fieldName, index, ty);
}

/**
 * Lower an index expression
 * @param {LoweringCtx} ctx
 * @param {Node} index
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HIndexExpr}
 */
function lowerIndex(ctx, index, typeCtx) {
    const base = lowerExpr(ctx, index.receiver, typeCtx);
    const idx = lowerExpr(ctx, index.index, typeCtx);

    // Get element type
    let ty = makeUnitType();
    if (base.ty && base.ty.kind === TypeKind.Array) {
        ty = base.ty.element;
    } else if (base.ty && base.ty.kind === TypeKind.Slice) {
        ty = base.ty.element;
    }

    return makeHIndexExpr(index.span, base, idx, ty);
}

/**
 * Lower an assignment expression
 * @param {LoweringCtx} ctx
 * @param {Node} assign
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HUnitExpr}
 */
function lowerAssign(ctx, assign, typeCtx) {
    const value = lowerExpr(ctx, assign.value, typeCtx);

    // Extract place from target
    const place = extractPlace(ctx, assign.target, typeCtx);
    if (!place) {
        ctx.addError("Invalid assignment target", assign.target.span);
        return makeHUnitExpr(assign.span, makeUnitType());
    }

    // Create assignment statement wrapped in a block
    // For now, assignments are statements, so return unit
    return makeHUnitExpr(assign.span, makeUnitType());
}

/**
 * Lower a struct expression
 * @param {LoweringCtx} ctx
 * @param {Node} structExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HStructExpr}
 */
function lowerStructExpr(ctx, structExpr, typeCtx) {
    const path = lowerExpr(ctx, structExpr.path, typeCtx);

    const fields = (structExpr.fields || []).map((field) => ({
        name: field.name,
        value: lowerExpr(ctx, field.value, typeCtx),
    }));

    let spread = null;
    if (structExpr.spread) {
        spread = lowerExpr(ctx, structExpr.spread, typeCtx);
    }

    // Get struct type
    let ty = path.ty;
    if (ty.kind === TypeKind.Struct) {
        // Already have struct type
    } else if (ty.kind === TypeKind.Named) {
        ty = { kind: TypeKind.Struct, name: ty.name, fields: [] };
    }

    return makeHStructExpr(
        structExpr.span,
        path.name || "",
        fields,
        spread,
        ty,
    );
}

/**
 * Lower a reference expression
 * @param {LoweringCtx} ctx
 * @param {Node} ref
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HRefExpr}
 */
function lowerRef(ctx, ref, typeCtx) {
    const operand = lowerExpr(ctx, ref.operand, typeCtx);
    const mutable = ref.mutability === Mutability.Mutable;

    const ty = {
        kind: TypeKind.Ref,
        inner: operand.ty,
        mutable,
    };

    return makeHRefExpr(ref.span, mutable, operand, ty);
}

/**
 * Lower a dereference expression
 * @param {LoweringCtx} ctx
 * @param {Node} deref
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HDerefExpr}
 */
function lowerDeref(ctx, deref, typeCtx) {
    const operand = lowerExpr(ctx, deref.operand, typeCtx);

    let ty = makeUnitType();
    if (operand.ty && operand.ty.kind === TypeKind.Ref) {
        ty = operand.ty.inner;
    } else if (operand.ty && operand.ty.kind === TypeKind.Ptr) {
        ty = operand.ty.inner;
    }

    return makeHDerefExpr(deref.span, operand, ty);
}

// ============================================================================
// Task 6.6: Control Flow Lowering
// ============================================================================

/**
 * Lower a block expression
 * @param {LoweringCtx} ctx
 * @param {Node} block
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HBlock}
 */
function lowerBlock(ctx, block, typeCtx) {
    ctx.pushScope();

    const stmts = (block.stmts || []).map((stmt) =>
        lowerStmt(ctx, stmt, typeCtx),
    );

    let expr = null;
    let ty = makeUnitType();

    if (block.expr) {
        expr = lowerExpr(ctx, block.expr, typeCtx);
        ty = expr.ty;
    }

    ctx.popScope();

    return makeHBlock(block.span, stmts, expr, ty);
}

/**
 * Lower an if expression
 * @param {LoweringCtx} ctx
 * @param {Node} ifExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HIfExpr}
 */
function lowerIf(ctx, ifExpr, typeCtx) {
    const condition = lowerExpr(ctx, ifExpr.condition, typeCtx);
    const thenBranch = lowerBlock(ctx, ifExpr.thenBranch, typeCtx);

    let elseBranch = null;
    if (ifExpr.elseBranch) {
        if (ifExpr.elseBranch.kind === NodeKind.BlockExpr) {
            elseBranch = lowerBlock(ctx, ifExpr.elseBranch, typeCtx);
        } else {
            // Wrap non-block else in a block
            const elseExpr = lowerExpr(ctx, ifExpr.elseBranch, typeCtx);
            elseBranch = makeHBlock(
                ifExpr.elseBranch.span,
                [],
                elseExpr,
                elseExpr.ty,
            );
        }
    }

    // Determine result type
    let ty = thenBranch.ty;
    if (elseBranch) {
        // If both branches exist, use then branch type
        // (type inference should have unified them)
    } else {
        ty = makeUnitType();
    }

    return makeHIfExpr(ifExpr.span, condition, thenBranch, elseBranch, ty);
}

/**
 * Lower a match expression
 * @param {LoweringCtx} ctx
 * @param {Node} matchExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HMatchExpr}
 */
function lowerMatch(ctx, matchExpr, typeCtx) {
    const scrutinee = lowerExpr(ctx, matchExpr.scrutinee, typeCtx);

    const arms = (matchExpr.arms || []).map((arm) => {
        ctx.pushScope();

        const pat = lowerPattern(ctx, arm.pat, scrutinee.ty, typeCtx);

        let guard = null;
        if (arm.guard) {
            guard = lowerExpr(ctx, arm.guard, typeCtx);
        }

        const body = lowerBlock(ctx, arm.body, typeCtx);

        ctx.popScope();

        return makeHMatchArm(arm.span, pat, guard, body);
    });

    // Determine result type from first arm
    let ty = makeUnitType();
    if (arms.length > 0 && arms[0].body) {
        ty = arms[0].body.ty;
    }

    return makeHMatchExpr(matchExpr.span, scrutinee, arms, ty);
}

/**
 * Lower a loop expression
 * @param {LoweringCtx} ctx
 * @param {Node} loopExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HLoopExpr}
 */
function lowerLoop(ctx, loopExpr, typeCtx) {
    ctx.pushScope();
    const body = lowerBlock(ctx, loopExpr.body, typeCtx);
    ctx.popScope();

    // Loop can return any type via break, but typically returns unit
    const ty = { kind: TypeKind.Never };

    return makeHLoopExpr(loopExpr.span, loopExpr.label, body, ty);
}

/**
 * Lower a while expression
 * @param {LoweringCtx} ctx
 * @param {Node} whileExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HWhileExpr}
 */
function lowerWhile(ctx, whileExpr, typeCtx) {
    const condition = lowerExpr(ctx, whileExpr.condition, typeCtx);

    ctx.pushScope();
    const body = lowerBlock(ctx, whileExpr.body, typeCtx);
    ctx.popScope();

    // While always returns unit
    const ty = makeUnitType();

    return makeHWhileExpr(whileExpr.span, whileExpr.label, condition, body, ty);
}

/**
 * Lower a for expression (desugar to while loop)
 * @param {LoweringCtx} ctx
 * @param {Node} forExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExpr}
 */
function lowerFor(ctx, forExpr, typeCtx) {
    // Desugar for loop to while loop with iterator
    // for pat in iter { body } =>
    // {
    //   let mut __iter = iter.into_iter();
    //   while let Some(pat) = __iter.next() {
    //     body
    //   }
    // }

    ctx.pushScope();

    // Lower iterator expression
    const iter = lowerExpr(ctx, forExpr.iter, typeCtx);

    // Create iterator variable
    const iterVarName = "__iter";
    const iterVarInfo = ctx.defineVar(iterVarName, iter.ty, true);

    // Lower body
    const body = lowerBlock(ctx, forExpr.body, typeCtx);

    ctx.popScope();

    // For now, return a while-like construct
    // In a full implementation, we'd create the desugared form
    const ty = makeUnitType();

    // Return a placeholder - actual desugaring would be more complex
    return makeHWhileExpr(forExpr.span, forExpr.label, iter, body, ty);
}

/**
 * Lower a return expression
 * @param {LoweringCtx} ctx
 * @param {Node} returnExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HUnitExpr}
 */
function lowerReturn(ctx, returnExpr, typeCtx) {
    // Return is a statement in HIR
    // For now, return unit
    return makeHUnitExpr(returnExpr.span, { kind: TypeKind.Never });
}

/**
 * Lower a break expression
 * @param {LoweringCtx} ctx
 * @param {Node} breakExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HUnitExpr}
 */
function lowerBreak(ctx, breakExpr, typeCtx) {
    return makeHUnitExpr(breakExpr.span, { kind: TypeKind.Never });
}

/**
 * Lower a continue expression
 * @param {LoweringCtx} ctx
 * @param {Node} continueExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HUnitExpr}
 */
function lowerContinue(ctx, continueExpr, typeCtx) {
    return makeHUnitExpr(continueExpr.span, { kind: TypeKind.Never });
}

/**
 * Lower a path expression
 * @param {LoweringCtx} ctx
 * @param {Node} pathExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExpr}
 */
function lowerPath(ctx, pathExpr, typeCtx) {
    if (!pathExpr.segments || pathExpr.segments.length === 0) {
        ctx.addError("Empty path expression", pathExpr.span);
        return makeHUnitExpr(pathExpr.span, makeUnitType());
    }

    // Handle "()" as unit type for tuple expressions
    if (pathExpr.segments.length === 1 && pathExpr.segments[0] === "()") {
        return makeHUnitExpr(pathExpr.span, makeUnitType());
    }

    // Simple identifier
    if (pathExpr.segments.length === 1) {
        return lowerIdentifier(
            ctx,
            { name: pathExpr.segments[0], span: pathExpr.span },
            typeCtx,
        );
    }

    // Qualified path - could be enum variant
    if (pathExpr.segments.length === 2) {
        const itemName = pathExpr.segments[0];
        const variantName = pathExpr.segments[1];

        const item = ctx.lookupItem(itemName);
        if (item && item.kind === "enum") {
            // Enum variant
            const enumTy = {
                kind: TypeKind.Enum,
                name: itemName,
                variants: [],
            };
            const variantIndex = findEnumVariantIndex(item.node, variantName);
            return makeHEnumExpr(
                pathExpr.span,
                itemName,
                variantName,
                variantIndex,
                [],
                enumTy,
            );
        }
    }

    ctx.addError(
        `Unbound path: ${pathExpr.segments.join("::")}`,
        pathExpr.span,
    );
    return makeHUnitExpr(pathExpr.span, makeUnitType());
}

/**
 * Find the index of an enum variant
 * @param {Node} enumNode
 * @param {string} variantName
 * @returns {number}
 */
function findEnumVariantIndex(enumNode, variantName) {
    const variants = enumNode.variants || [];
    for (let i = 0; i < variants.length; i++) {
        if (variants[i].name === variantName) {
            return i;
        }
    }
    return 0;
}

/**
 * Lower a range expression
 * @param {LoweringCtx} ctx
 * @param {Node} rangeExpr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HExpr}
 */
function lowerRange(ctx, rangeExpr, typeCtx) {
    // For now, ranges are not fully implemented
    // Return a placeholder
    ctx.addError("Range expressions not yet supported", rangeExpr.span);
    return makeHUnitExpr(rangeExpr.span, makeUnitType());
}

// ============================================================================
// Task 6.7: Pattern Lowering
// ============================================================================

/**
 * Lower an AST pattern to HIR
 * @param {LoweringCtx} ctx
 * @param {Node} pat
 * @param {Type} expectedType
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HPat}
 */
function lowerPattern(ctx, pat, expectedType, typeCtx) {
    switch (pat.kind) {
        case NodeKind.IdentPat:
            return lowerIdentPat(ctx, pat, expectedType, typeCtx);

        case NodeKind.WildcardPat:
            return makeHWildcardPat(pat.span, expectedType);

        case NodeKind.LiteralPat: {
            const hirLitKind = convertLiteralKind(pat.literalKind);
            const ty = inferLiteralType(pat.literalKind);
            return makeHLiteralPat(pat.span, hirLitKind, pat.value, ty);
        }

        case NodeKind.StructPat:
            return lowerStructPat(ctx, pat, expectedType, typeCtx);

        case NodeKind.TuplePat:
            return lowerTuplePat(ctx, pat, expectedType, typeCtx);

        case NodeKind.OrPat:
            return lowerOrPat(ctx, pat, expectedType, typeCtx);

        case NodeKind.BindingPat: {
            // Binding pattern: name @ pat
            const innerPat = lowerPattern(ctx, pat.pat, expectedType, typeCtx);
            const varInfo = ctx.defineVar(pat.name, expectedType, false);
            return makeHIdentPat(
                pat.span,
                pat.name,
                varInfo.id,
                expectedType,
                false,
                false,
            );
        }

        default:
            ctx.addError(`Unknown pattern kind: ${pat.kind}`, pat.span);
            return makeHWildcardPat(pat.span, expectedType);
    }
}

/**
 * Lower an identifier pattern
 * @param {LoweringCtx} ctx
 * @param {Node} pat
 * @param {Type} expectedType
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HIdentPat}
 */
function lowerIdentPat(ctx, pat, expectedType, typeCtx) {
    const mutable = pat.mutability === Mutability.Mutable;
    const isRef = pat.isRef || false;

    // Determine type
    let ty = expectedType;
    if (pat.ty) {
        const typeResult = resolveTypeFromAst(pat.ty, typeCtx);
        if (typeResult.ok) {
            ty = typeResult.type;
        }
    }

    // Define variable
    const varInfo = ctx.defineVar(pat.name, ty, mutable);

    return makeHIdentPat(pat.span, pat.name, varInfo.id, ty, mutable, isRef);
}

/**
 * Lower a struct pattern
 * @param {LoweringCtx} ctx
 * @param {Node} pat
 * @param {Type} expectedType
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HStructPat}
 */
function lowerStructPat(ctx, pat, expectedType, typeCtx) {
    // Get struct name from path
    let structName = "";
    if (pat.path) {
        if (pat.path.kind === NodeKind.IdentifierExpr) {
            structName = pat.path.name;
        } else if (pat.path.kind === NodeKind.PathExpr && pat.path.segments) {
            structName = pat.path.segments[pat.path.segments.length - 1];
        }
    }

    // Get struct info
    const structItem = ctx.lookupItem(structName);
    const structNode = structItem?.node;

    // Lower field patterns
    const fields = (pat.fields || []).map((field) => {
        let fieldType = makeUnitType();

        // Find field type from struct definition
        if (structNode && structNode.fields) {
            const fieldDef = structNode.fields.find(
                (f) => f.name === field.name,
            );
            if (fieldDef && fieldDef.ty) {
                const typeResult = resolveTypeFromAst(fieldDef.ty, typeCtx);
                if (typeResult.ok) {
                    fieldType = typeResult.type;
                }
            }
        }

        return {
            name: field.name,
            pat: lowerPattern(ctx, field.pat, fieldType, typeCtx),
        };
    });

    return makeHStructPat(
        pat.span,
        structName,
        fields,
        pat.rest || false,
        expectedType,
    );
}

/**
 * Lower a tuple pattern
 * @param {LoweringCtx} ctx
 * @param {Node} pat
 * @param {Type} expectedType
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HTuplePat}
 */
function lowerTuplePat(ctx, pat, expectedType, typeCtx) {
    const elements = (pat.elements || []).map((elem, i) => {
        let elemType = makeUnitType();
        if (
            expectedType &&
            expectedType.kind === TypeKind.Tuple &&
            expectedType.elements
        ) {
            if (i < expectedType.elements.length) {
                elemType = expectedType.elements[i];
            }
        }
        return lowerPattern(ctx, elem, elemType, typeCtx);
    });

    return makeHTuplePat(pat.span, elements, expectedType);
}

/**
 * Lower an or pattern
 * @param {LoweringCtx} ctx
 * @param {Node} pat
 * @param {Type} expectedType
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HOrPat}
 */
function lowerOrPat(ctx, pat, expectedType, typeCtx) {
    const alternatives = (pat.alternatives || []).map((alt) =>
        lowerPattern(ctx, alt, expectedType, typeCtx),
    );

    return makeHOrPat(pat.span, alternatives, expectedType);
}

// ============================================================================
// Task 6.8: Place Extraction
// ============================================================================

/**
 * Extract a place (assignable location) from an expression
 * @param {LoweringCtx} ctx
 * @param {Node} expr
 * @param {TypeContext} typeCtx
 * @returns {import('./hir.js').HPlace | null}
 */
function extractPlace(ctx, expr, typeCtx) {
    switch (expr.kind) {
        case NodeKind.IdentifierExpr: {
            const varInfo = ctx.lookupVar(expr.name);
            if (!varInfo) {
                ctx.addError(`Unbound identifier: ${expr.name}`, expr.span);
                return null;
            }
            return makeHVarPlace(
                expr.span,
                varInfo.name,
                varInfo.id,
                varInfo.type,
            );
        }

        case NodeKind.FieldExpr: {
            const base = extractPlace(ctx, expr.receiver, typeCtx);
            if (!base) return null;

            const fieldName =
                typeof expr.field === "string" ? expr.field : expr.field.name;
            let index = 0;
            let ty = makeUnitType();

            if (base.ty && base.ty.kind === TypeKind.Struct) {
                index = ctx.getFieldIndex(base.ty.name, fieldName);
                const fieldDef = base.ty.fields?.find(
                    (f) => f.name === fieldName,
                );
                if (fieldDef) {
                    ty = fieldDef.type;
                }
            }

            return makeHFieldPlace(expr.span, base, fieldName, index, ty);
        }

        case NodeKind.IndexExpr: {
            const base = extractPlace(ctx, expr.receiver, typeCtx);
            if (!base) return null;

            const index = lowerExpr(ctx, expr.index, typeCtx);
            let ty = makeUnitType();

            if (base.ty && base.ty.kind === TypeKind.Array) {
                ty = base.ty.element;
            } else if (base.ty && base.ty.kind === TypeKind.Slice) {
                ty = base.ty.element;
            }

            return makeHIndexPlace(expr.span, base, index, ty);
        }

        case NodeKind.DerefExpr: {
            const base = extractPlace(ctx, expr.operand, typeCtx);
            if (!base) return null;

            let ty = makeUnitType();
            if (base.ty && base.ty.kind === TypeKind.Ref) {
                ty = base.ty.inner;
            } else if (base.ty && base.ty.kind === TypeKind.Ptr) {
                ty = base.ty.inner;
            }

            return makeHDerefPlace(expr.span, base, ty);
        }

        default:
            ctx.addError("Invalid assignment target", expr.span);
            return null;
    }
}

// ============================================================================
// Type Resolution Helper
// ============================================================================

/**
 * Resolve an AST type node to a Type
 * @param {Node} typeNode
 * @param {TypeContext} typeCtx
 * @returns {{ ok: boolean, type?: Type, error?: string }}
 */
function resolveTypeFromAst(typeNode, typeCtx) {
    if (!typeNode) {
        return { ok: false, error: "No type node" };
    }

    switch (typeNode.kind) {
        case NodeKind.NamedType: {
            // Check for builtin types
            const builtin = resolveBuiltinType(typeNode.name);
            if (builtin) {
                return { ok: true, type: builtin };
            }

            // Check type context for user-defined types
            const item = typeCtx.lookupItem(typeNode.name);
            if (item) {
                if (item.kind === "struct") {
                    return {
                        ok: true,
                        type: {
                            kind: TypeKind.Struct,
                            name: typeNode.name,
                            fields: [],
                        },
                    };
                }
                if (item.kind === "enum") {
                    return {
                        ok: true,
                        type: {
                            kind: TypeKind.Enum,
                            name: typeNode.name,
                            variants: [],
                        },
                    };
                }
            }

            // Return as named type
            return {
                ok: true,
                type: { kind: TypeKind.Named, name: typeNode.name, args: null },
            };
        }

        case NodeKind.TupleType: {
            const elements = [];
            for (const elem of typeNode.elements || []) {
                const result = resolveTypeFromAst(elem, typeCtx);
                if (!result.ok) return result;
                elements.push(result.type);
            }
            return { ok: true, type: { kind: TypeKind.Tuple, elements } };
        }

        case NodeKind.ArrayType: {
            const elementResult = resolveTypeFromAst(typeNode.element, typeCtx);
            if (!elementResult.ok) return elementResult;
            return {
                ok: true,
                type: {
                    kind: TypeKind.Array,
                    element: elementResult.type,
                    length: 0,
                },
            };
        }

        case NodeKind.RefType: {
            const innerResult = resolveTypeFromAst(typeNode.inner, typeCtx);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            return {
                ok: true,
                type: { kind: TypeKind.Ref, inner: innerResult.type, mutable },
            };
        }

        case NodeKind.PtrType: {
            const innerResult = resolveTypeFromAst(typeNode.inner, typeCtx);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            return {
                ok: true,
                type: { kind: TypeKind.Ptr, inner: innerResult.type, mutable },
            };
        }

        case NodeKind.FnType: {
            const params = [];
            for (const param of typeNode.params || []) {
                const result = resolveTypeFromAst(param, typeCtx);
                if (!result.ok) return result;
                params.push(result.type);
            }

            let returnType = makeUnitType();
            if (typeNode.returnType) {
                const result = resolveTypeFromAst(typeNode.returnType, typeCtx);
                if (!result.ok) return result;
                returnType = result.type;
            }

            return {
                ok: true,
                type: {
                    kind: TypeKind.Fn,
                    params,
                    returnType,
                    isUnsafe: typeNode.isUnsafe || false,
                },
            };
        }

        default:
            return {
                ok: false,
                error: `Unknown type node kind: ${typeNode.kind}`,
            };
    }
}

/**
 * Resolve a builtin type name to a Type
 * @param {string} name
 * @returns {Type | null}
 */
function resolveBuiltinType(name) {
    switch (name) {
        case "i8":
            return { kind: TypeKind.Int, width: IntWidth.I8 };
        case "i16":
            return { kind: TypeKind.Int, width: IntWidth.I16 };
        case "i32":
            return { kind: TypeKind.Int, width: IntWidth.I32 };
        case "i64":
            return { kind: TypeKind.Int, width: IntWidth.I64 };
        case "i128":
            return { kind: TypeKind.Int, width: IntWidth.I128 };
        case "isize":
            return { kind: TypeKind.Int, width: IntWidth.Isize };
        case "u8":
            return { kind: TypeKind.Int, width: IntWidth.U8 };
        case "u16":
            return { kind: TypeKind.Int, width: IntWidth.U16 };
        case "u32":
            return { kind: TypeKind.Int, width: IntWidth.U32 };
        case "u64":
            return { kind: TypeKind.Int, width: IntWidth.U64 };
        case "u128":
            return { kind: TypeKind.Int, width: IntWidth.U128 };
        case "usize":
            return { kind: TypeKind.Int, width: IntWidth.Usize };
        case "f32":
            return { kind: TypeKind.Float, width: FloatWidth.F32 };
        case "f64":
            return { kind: TypeKind.Float, width: FloatWidth.F64 };
        case "bool":
            return { kind: TypeKind.Bool };
        case "char":
            return { kind: TypeKind.Char };
        case "str":
            return { kind: TypeKind.String };
        case "()":
            return { kind: TypeKind.Unit };
        case "!":
            return { kind: TypeKind.Never };
        default:
            return null;
    }
}

// ============================================================================
// Exports
// ============================================================================

export {
    // Context
    LoweringCtx,
    // Module lowering
    lowerModule,
    // Item lowering
    lowerItem,
    lowerFnItem,
    lowerStructItem,
    lowerEnumItem,
    // Statement lowering
    lowerStmt,
    lowerLetStmt,
    lowerExprStmt,
    // Expression lowering
    lowerExpr,
    lowerLiteral,
    lowerIdentifier,
    lowerBinary,
    lowerUnary,
    lowerCall,
    lowerField,
    lowerIndex,
    lowerAssign,
    lowerStructExpr,
    lowerRef,
    lowerDeref,
    // Control flow lowering
    lowerBlock,
    lowerIf,
    lowerMatch,
    lowerLoop,
    lowerWhile,
    lowerFor,
    lowerReturn,
    lowerBreak,
    lowerContinue,
    lowerPath,
    lowerRange,
    // Pattern lowering
    lowerPattern,
    lowerIdentPat,
    lowerStructPat,
    lowerTuplePat,
    lowerOrPat,
    // Place extraction
    extractPlace,
    // Type resolution
    resolveTypeFromAst,
    resolveBuiltinType,
};
