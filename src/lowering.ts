import type { Type, FnType, Span } from "./types";
import type { Node } from "./ast";
import type { TypeContext } from "./type_context";

import {
    NodeKind,
    LiteralKind,
    UnaryOp,
    BinaryOp,
    Mutability,
    makeBlockExpr,
} from "./ast";

import {
    HPlaceKind,
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
    type HItem,
    type HStmt,
    type HExpr,
    type HPlace,
    type HPat,
    type HBlock,
    type HModule,
    type HFnDecl,
    type HParam,
    type HStructDecl,
    type HEnumDecl,
    type HLetStmt,
    type HUnitExpr,
    type HLiteralExpr,
    type HVarExpr,
    type HBinaryExpr,
    type HUnaryExpr,
    type HIfExpr,
    type HMatchExpr,
    type HLoopExpr,
    type HWhileExpr,
    type HIdentPat,
    type HFieldExpr,
    type HStructExpr,
    type HRefExpr,
    type HDerefExpr,
    type HStructPat,
    type HTuplePat,
    type HOrPat,
} from "./hir";

import {
    TypeKind,
    IntWidth,
    FloatWidth,
    makeIntType,
    makeBoolType,
    makeRefType,
    makeFnType,
    makeUnitType,
    typeToString,
} from "./types";
import {
    FORMAT_TAG_STRING,
    FORMAT_TAG_INT,
    FORMAT_TAG_FLOAT,
    FORMAT_TAG_BOOL,
    FORMAT_TAG_CHAR,
} from "./format_tags";

const BUILTIN_PRINTLN_FMT_FN = "__jsrust_builtin_println_fmt";
const BUILTIN_PRINT_FMT_FN = "__jsrust_builtin_print_fmt";
const BUILTIN_ASSERT_FAIL_FN = "__jsrust_builtin_assert_fail";

type Segment =
    | { type: "literal"; value: string }
    | { type: "placeholder"; index: number };

/**
 * Parse a format string into segments.
 * Handles {} placeholders and escape sequences {{ and }}.
 */
function parseFormatString(str: string): {
    segments: Segment[];
    placeholderCount: number;
    errors: string[];
} {
    const segments: Segment[] = [];
    const errors: string[] = [];
    let literal = "";
    let i = 0;
    let placeholderIndex = 0;
    while (i < str.length) {
        if (str[i] === "{") {
            if (i + 1 < str.length && str[i + 1] === "{") {
                // Escaped {{ -> {
                literal += "{";
                i += 2;
            } else if (i + 1 < str.length && str[i + 1] === "}") {
                // Found {} placeholder
                if (literal.length > 0) {
                    segments.push({ type: "literal", value: literal });
                    literal = "";
                }
                segments.push({ type: "placeholder", index: placeholderIndex });
                placeholderIndex++;
                i += 2;
            } else {
                // Unescaped { without closing } - could be an error or just a literal
                // For simplicity, treat as literal
                literal += str[i];
                i += 1;
            }
        } else if (str[i] === "}") {
            if (i + 1 < str.length && str[i + 1] === "}") {
                // Escaped }} -> }
                literal += "}";
                i += 2;
            } else {
                // Unescaped } - treat as literal
                literal += str[i];
                i += 1;
            }
        } else {
            literal += str[i];
            i += 1;
        }
    }
    if (literal.length > 0) {
        segments.push({ type: "literal", value: literal });
    }
    return {
        segments: segments,
        placeholderCount: placeholderIndex,
        errors,
    };
}

function formatArgTagForType(ty: Type | null): number | null {
    if (!ty) return null;
    switch (ty.kind) {
        case TypeKind.String:
            return FORMAT_TAG_STRING;
        case TypeKind.Int:
            return FORMAT_TAG_INT;
        case TypeKind.Float:
            return FORMAT_TAG_FLOAT;
        case TypeKind.Bool:
            return FORMAT_TAG_BOOL;
        case TypeKind.Char:
            return FORMAT_TAG_CHAR;
        default:
            return null;
    }
}

// ============================================================================
// Task 6.1: Lowering Context
// ============================================================================

type LoweringError = {
    message: string;
    span: Span;
};

type VarInfo = {
    name: string;
    id: number;
    type: Type;
    mutable: boolean;
};

type ClosureCapture = {
    mode: "value" | "ref";
    name: string;
    varId: number;
    type: Type;
    mutable: boolean;
};

type ClosureBinding = {
    helperName: string;
    helperType: Type;
    captures: ClosureCapture[];
};

type ClosureMeta = {
    helperName: string;
    helperType: Type;
    captures: ClosureCapture[];
};

type ItemInfo = {
    kind: "fn" | "struct" | "enum";
    node: Node;
    type?: Type;
};

/**
 * Lowering context for tracking state during AST to HIR conversion
 */
class LoweringCtx {
    errors: LoweringError[];
    varBindings: Map<string, VarInfo>;
    varById: Map<number, VarInfo>;
    nextVarId: number;
    items: Map<string, ItemInfo>;
    currentFn: string | null;
    currentImplTargetName: string | null;
    structFieldIndices: Map<string, number>;
    generatedItems: HItem[];
    pendingPreludeStmts: HStmt[];
    closureBindings: Map<number, ClosureBinding>;
    nextClosureId: number;
    private _scopeStack: Map<string, VarInfo>[];

    constructor() {
        this.errors = [];
        this.varBindings = new Map();
        this.varById = new Map();
        this.nextVarId = 0;
        this.items = new Map();
        this.currentFn = null;
        this.currentImplTargetName = null;
        this.structFieldIndices = new Map();
        this.generatedItems = [];
        this.pendingPreludeStmts = [];
        this.closureBindings = new Map();
        this.nextClosureId = 0;
        this._scopeStack = [];
    }

    addError(message: string, span: Span): void {
        this.errors.push({ message, span });
    }

    freshVarId(): number {
        return this.nextVarId++;
    }

    /**
     * Define a variable binding
     */
    defineVar(name: string, type: Type, mutable: boolean = false): VarInfo {
        const id = this.freshVarId();
        const info = { name, id, type, mutable };
        this.varBindings.set(name, info);
        this.varById.set(id, info);
        return info;
    }

    /**
     * Look up a variable binding
     */
    lookupVar(name: string): VarInfo | null {
        return this.varBindings.get(name) || null;
    }

    lookupVarById(id: number): VarInfo | null {
        return this.varById.get(id) ?? null;
    }

    /** Register an item */
    registerItem(
        name: string,
        kind: "fn" | "struct" | "enum",
        node: Node,
        type?: Type,
    ): void {
        this.items.set(name, { kind, node, type });
    }

    lookupItem(name: string): ItemInfo | null {
        return this.items.get(name) || null;
    }

    /** Enter a new scope */
    pushScope(): void {
        this._scopeStack.push(new Map(this.varBindings));
    }

    /**
     * Exit current scope
     */
    popScope(): void {
        if (this._scopeStack.length > 0) {
            this.varBindings = this._scopeStack.pop()!;
        }
    }

    nextClosureSymbolId(): number {
        const id = this.nextClosureId;
        this.nextClosureId += 1;
        return id;
    }

    queueGeneratedItem(item: HItem): void {
        this.generatedItems.push(item);
    }

    consumeGeneratedItems(): HItem[] {
        if (this.generatedItems.length === 0) return [];
        const out = this.generatedItems;
        this.generatedItems = [];
        return out;
    }

    queuePreludeStmt(stmt: HStmt): void {
        this.pendingPreludeStmts.push(stmt);
    }

    consumePreludeStmts(): HStmt[] {
        if (this.pendingPreludeStmts.length === 0) return [];
        const out = this.pendingPreludeStmts;
        this.pendingPreludeStmts = [];
        return out;
    }

    registerClosureBinding(varId: number, binding: ClosureBinding): void {
        this.closureBindings.set(varId, binding);
    }

    lookupClosureBinding(varId: number): ClosureBinding | null {
        return this.closureBindings.get(varId) || null;
    }

    /**
     * Set struct field index for lookup
     */
    setFieldIndex(structName: string, fieldName: string, index: number): void {
        this.structFieldIndices.set(`${structName}.${fieldName}`, index);
    }

    /**
     * Get struct field index
     */
    getFieldIndex(structName: string, fieldName: string): number {
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
 */
function lowerModule(
    ast: Node,
    typeCtx: TypeContext,
): { module: HModule | null; errors: LoweringError[] } {
    const ctx = new LoweringCtx();

    // First pass: register all items
    for (const item of ast.items) {
        registerItem(ctx, item, typeCtx);
    }

    // Second pass: lower all items
    const items: HItem[] = [];
    for (const item of ast.items) {
        lowerItemIntoList(ctx, item, typeCtx, items);
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
 * Lower an item and append generated HIR items to output.
 */
function lowerItemIntoList(
    ctx: LoweringCtx,
    item: Node,
    typeCtx: TypeContext,
    output: HItem[],
): void {
    if (item.kind === NodeKind.ModItem) {
        for (const child of item.items) {
            lowerItemIntoList(ctx, child, typeCtx, output);
        }
        return;
    }
    if (item.kind === NodeKind.ImplItem) {
        const traitName = (item.traitType as { name?: string })?.name || null;
        for (const method of item.methods) {
            lowerItemIntoList(
                ctx,
                {
                    ...method,
                    name: traitName
                        ? `${(item.targetType as { name?: string })?.name || "__unresolved_target"}::<${traitName}>::${method.name}`
                        : `${(item.targetType as { name?: string })?.name || "__unresolved_target"}::${method.name}`,
                    implTargetName:
                        (item.targetType as { name?: string })?.name || null,
                    isImplMethod: true,
                    unqualifiedName: method.name,
                },
                typeCtx,
                output,
            );
        }
        return;
    }
    if (item.kind === NodeKind.UseItem) {
        return;
    }
    const hirItem = lowerItem(ctx, item, typeCtx);
    if (hirItem) {
        output.push(hirItem);
    }
    const generated = ctx.consumeGeneratedItems();
    if (generated.length > 0) {
        output.push(...generated);
    }
}

/**
 * Register an item in the context
 */
function registerItem(
    ctx: LoweringCtx,
    item: Node,
    typeCtx: TypeContext,
): void {
    switch (item.kind) {
        case NodeKind.FnItem: {
            const itemName = item.qualifiedName || item.name;
            const itemDecl = typeCtx.lookupItem(itemName);
            ctx.registerItem(itemName, "fn", item, itemDecl?.type);
            break;
        }
        case NodeKind.StructItem: {
            const itemName = item.qualifiedName || item.name;
            ctx.registerItem(itemName, "struct", item);
            // Register field indices
            for (let i = 0; i < (item.fields || []).length; i++) {
                ctx.setFieldIndex(itemName, item.fields[i].name, i);
            }
            break;
        }
        case NodeKind.EnumItem: {
            const itemName = item.qualifiedName || item.name;
            ctx.registerItem(itemName, "enum", item);
            break;
        }
        case NodeKind.ModItem: {
            for (const child of item.items || []) {
                registerItem(ctx, child, typeCtx);
            }
            break;
        }
        case NodeKind.TraitItem:
            break;
        case NodeKind.ImplItem: {
            const traitName =
                (item.traitType as { name?: string })?.name || null;
            for (const method of item.methods || []) {
                registerItem(
                    ctx,
                    {
                        ...method,
                        name: traitName
                            ? `${(item.targetType as { name?: string })?.name || "__unresolved_target"}::<${traitName}>::${method.name}`
                            : `${(item.targetType as { name?: string })?.name || "__unresolved_target"}::${method.name}`,
                    },
                    typeCtx,
                );
            }
            break;
        }
        case NodeKind.UseItem:
            break;
    }
}

// ============================================================================
// Task 6.3: Item Lowering
// ============================================================================

/**
 * Lower an AST item to HIR
 */
function lowerItem(
    ctx: LoweringCtx,
    item: Node,
    typeCtx: TypeContext,
): HItem | null {
    switch (item.kind) {
        case NodeKind.FnItem:
            return lowerFnItem(ctx, item, typeCtx);
        case NodeKind.StructItem:
            return lowerStructItem(ctx, item, typeCtx);
        case NodeKind.EnumItem:
            return lowerEnumItem(ctx, item, typeCtx);
        case NodeKind.TraitItem:
        case NodeKind.ModItem:
        case NodeKind.UseItem:
        case NodeKind.ImplItem:
            return null;
        default:
            ctx.addError(`Unknown item kind: ${item.kind}`, item.span);
            return null;
    }
}

/**
 * Lower a function item to HIR
 */
function lowerFnItem(
    ctx: LoweringCtx,
    fn: Node,
    typeCtx: TypeContext,
): HFnDecl | null {
    const previousFn = ctx.currentFn;
    const previousImplTargetName = ctx.currentImplTargetName;
    ctx.pushScope();
    const fnName = fn.qualifiedName || fn.name;
    ctx.currentFn = fnName;
    ctx.currentImplTargetName = fn.implTargetName || null;

    // Get function type from type context
    const itemDecl = typeCtx.lookupItem(fnName);
    let fnType = itemDecl?.type || fn.syntheticFnType || null;
    if (
        fnType &&
        fnType.kind === TypeKind.Fn &&
        (fn.generics || []).length > 0 &&
        itemDecl?.genericBindings
    ) {
        const genericNames = new Set<string>(fn.generics || []);
        const bindings = itemDecl.genericBindings;
        fnType = makeFnType(
            fnType.params.map((p: Type) =>
                substituteLoweringGenericType(
                    typeCtx,
                    p,
                    genericNames,
                    bindings,
                ),
            ),
            substituteLoweringGenericType(
                typeCtx,
                fnType.returnType,
                genericNames,
                bindings,
            ),
            fnType.isUnsafe || false,
            fnType.isConst || false,
            fnType.span,
        );
    }

    // Lower parameters
    const params: HParam[] = [];
    for (let i = 0; i < (fn.params || []).length; i++) {
        const param = fn.params[i];
        const paramType =
            (fnType as FnType | null)?.params?.[i] ||
            makeUnitType({ line: 0, column: 0, start: 0, end: 0 });
        const hParam = lowerParam(ctx, param, paramType, typeCtx);
        params.push(hParam);
    }

    // Get return type
    let returnType =
        (fnType as FnType | null)?.returnType ||
        makeUnitType({ line: 0, column: 0, start: 0, end: 0 });
    returnType = substituteLoweringGenericType(
        typeCtx,
        returnType,
        new Set(),
        new Map(),
    );

    // Lower body
    let body: HBlock | null = null;
    if (fn.body) {
        body = lowerBlock(ctx, fn.body, typeCtx);
    }

    ctx.popScope();
    ctx.currentFn = previousFn;
    ctx.currentImplTargetName = previousImplTargetName;

    return makeHFnDecl(
        fn.span,
        fnName,
        fn.generics,
        params,
        returnType,
        body,
        fn.isAsync || false,
        fn.isUnsafe || false,
        fn.isConst || false,
        fn.isTest || false,
        fn.expectedOutput ?? null,
    );
}

/**
 * Lower a function parameter
 */
function lowerParam(
    ctx: LoweringCtx,
    param: Node,
    type: Type,
    typeCtx: TypeContext,
): HParam {
    let pat: HPat | null = null;
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
 */
function lowerStructItem(
    ctx: LoweringCtx,
    struct: Node,
    typeCtx: TypeContext,
): HStructDecl {
    const fields = [];

    for (const field of struct.fields || []) {
        let fieldType: Type | null = null;
        if (field.ty) {
            const typeResult = resolveTypeFromAst(field.ty, typeCtx);
            if (typeResult.ok) {
                fieldType = typeResult.type;
            }
        }

        let defaultValue: HExpr | null = null;
        if (field.defaultValue) {
            defaultValue = lowerExpr(ctx, field.defaultValue, typeCtx);
        }

        fields.push(
            makeHStructField(
                field.span,
                field.name,
                fieldType ||
                    makeUnitType({ line: 0, column: 0, start: 0, end: 0 }),
                defaultValue,
            ),
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
 */
function lowerEnumItem(
    _ctx: LoweringCtx, // FIXME: unused param
    enum_: Node,
    typeCtx: TypeContext,
): HEnumDecl {
    const variants = [];

    for (const variant of enum_.variants || []) {
        const fields: Type[] = [];
        for (const field of variant.fields || []) {
            let fieldType: Type | null = null;
            if (field.ty) {
                const typeResult = resolveTypeFromAst(field.ty, typeCtx);
                if (typeResult.ok) {
                    fieldType = typeResult.type;
                }
            }
            fields.push(
                fieldType ||
                    makeUnitType({ line: 0, column: 0, start: 0, end: 0 }),
            );
        }

        let discriminant: number | null = null;
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
 */
function lowerStmt(ctx: LoweringCtx, stmt: Node, typeCtx: TypeContext): HStmt {
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
                makeHUnitExpr(
                    stmt.span,
                    makeUnitType({ line: 0, column: 0, start: 0, end: 0 }),
                ),
            );
        }
        default:
            ctx.addError(`Unknown statement kind: ${stmt.kind}`, stmt.span);
            return makeHExprStmt(
                stmt.span,
                makeHUnitExpr(
                    stmt.span,
                    makeUnitType({ line: 0, column: 0, start: 0, end: 0 }),
                ),
            );
    }
}

/**
 * Lower a let statement
 */
function lowerLetStmt(
    ctx: LoweringCtx,
    letStmt: Node,
    typeCtx: TypeContext,
): HLetStmt {
    // Get type from annotation or initializer
    let ty: Type | null = null;
    if (letStmt.ty) {
        const typeResult = resolveTypeFromAst(letStmt.ty, typeCtx);
        if (typeResult.ok) {
            ty = typeResult.type;
        }
    }

    // Lower initializer
    let init: HExpr | null = null;
    if (letStmt.init) {
        init = lowerExpr(ctx, letStmt.init, typeCtx);
        if (!ty && init) {
            ty = init.ty;
        }
    }

    if (!ty) {
        ty = makeUnitType({ line: 0, column: 0, start: 0, end: 0 });
    }

    // Lower pattern
    const pat = lowerPattern(ctx, letStmt.pat, ty, typeCtx);

    if (
        init &&
        (init as HVarExpr & { closureMeta?: ClosureMeta }).closureMeta &&
        pat.kind === HPatKind.Ident
    ) {
        const closureMeta = (init as HVarExpr & { closureMeta?: ClosureMeta })
            .closureMeta!;
        const captures: ClosureCapture[] = [];
        for (const capture of closureMeta.captures || []) {
            const sourceVar = ctx.lookupVar(capture.name);
            if (!sourceVar) {
                ctx.addError(
                    `Captured variable '${capture.name}' is not available during closure lowering`,
                    letStmt.span,
                );
                continue;
            }

            if (capture.mode === "ref") {
                captures.push({
                    mode: "ref",
                    name: capture.name,
                    varId: sourceVar.id,
                    type: sourceVar.type,
                    mutable: true,
                });
                continue;
            }

            const hiddenName = `__closure_cap_${(pat as HIdentPat).id}_${capture.name}`;
            const hiddenVar = ctx.defineVar(hiddenName, sourceVar.type, false);
            const hiddenPat = makeHIdentPat(
                letStmt.span,
                hiddenName,
                hiddenVar.id,
                sourceVar.type,
                false,
                false,
            );
            const hiddenInit = makeHVarExpr(
                letStmt.span,
                sourceVar.name,
                sourceVar.id,
                sourceVar.type,
            );
            ctx.queuePreludeStmt(
                makeHLetStmt(
                    letStmt.span,
                    hiddenPat,
                    sourceVar.type,
                    hiddenInit,
                ),
            );
            captures.push({
                mode: "value",
                name: capture.name,
                varId: hiddenVar.id,
                type: sourceVar.type,
                mutable: false,
            });
        }
        ctx.registerClosureBinding((pat as HIdentPat).id, {
            helperName: closureMeta.helperName,
            helperType: closureMeta.helperType,
            captures,
        });
    } else if (
        init &&
        (init as HVarExpr & { closureMeta?: ClosureMeta }).closureMeta &&
        (init as HVarExpr & { closureMeta?: ClosureMeta }).closureMeta!.captures
            ?.length > 0
    ) {
        ctx.addError(
            "Capturing closures currently require a simple identifier let-binding",
            letStmt.span,
        );
    }

    return makeHLetStmt(letStmt.span, pat, ty, init);
}

/**
 * Lower an expression statement
 */
function lowerExprStmt(
    ctx: LoweringCtx,
    exprStmt: Node,
    typeCtx: TypeContext,
): HStmt {
    if (exprStmt.expr.kind === NodeKind.AssignExpr) {
        const value = lowerExpr(ctx, exprStmt.expr.value, typeCtx);
        const place = extractPlace(ctx, exprStmt.expr.target, typeCtx);
        if (!place) {
            ctx.addError(
                "Invalid assignment target",
                exprStmt.expr.target.span,
            );
            return makeHExprStmt(
                exprStmt.span,
                makeHUnitExpr(
                    exprStmt.span,
                    makeUnitType({ line: 0, column: 0, start: 0, end: 0 }),
                ),
            );
        }
        return makeHAssignStmt(exprStmt.span, place, value);
    }

    const expr = lowerExpr(ctx, exprStmt.expr, typeCtx);
    return makeHExprStmt(exprStmt.span, expr);
}

// ============================================================================
// Task 6.5: Expression Lowering
// ============================================================================

/**
 * Lower an AST expression to HIR
 */
function lowerExpr(ctx: LoweringCtx, expr: Node, typeCtx: TypeContext): HExpr {
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

        case NodeKind.ClosureExpr:
            return lowerClosure(ctx, expr, typeCtx);

        default:
            ctx.addError(`Unknown expression kind: ${expr.kind}`, expr.span);
            return makeHUnitExpr(
                expr.span,
                makeUnitType({ line: 0, column: 0, start: 0, end: 0 }),
            );
    }
}

/**
 * Lower a literal expression
 */
function lowerLiteral(
    _ctx: LoweringCtx,
    lit: Node,
    _typeCtx: TypeContext,
): HLiteralExpr {
    const hirLitKind = convertLiteralKind(lit.literalKind);
    const ty = inferLiteralType(lit.literalKind);
    return makeHLiteralExpr(lit.span, hirLitKind, lit.value, ty);
}

/**
 * Convert AST literal kind to HIR literal kind
 */
function convertLiteralKind(astKind: number): number {
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
 */
function inferLiteralType(literalKind: number): Type {
    const defaultSpan: Span = { line: 0, column: 0, start: 0, end: 0 };
    switch (literalKind) {
        case LiteralKind.Int:
            return {
                kind: TypeKind.Int,
                width: IntWidth.I32,
                span: defaultSpan,
            };
        case LiteralKind.Float:
            return {
                kind: TypeKind.Float,
                width: FloatWidth.F64,
                span: defaultSpan,
            };
        case LiteralKind.Bool:
            return { kind: TypeKind.Bool, span: defaultSpan };
        case LiteralKind.String:
            return { kind: TypeKind.String, span: defaultSpan };
        case LiteralKind.Char:
            return { kind: TypeKind.Char, span: defaultSpan };
        default:
            return makeUnitType(defaultSpan);
    }
}

/**
 * Lower an identifier expression
 */
function lowerIdentifier(
    ctx: LoweringCtx,
    ident: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = ident.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    if (ident.name === "Self" && ctx.currentImplTargetName) {
        const selfType = {
            kind: TypeKind.Struct,
            name: ctx.currentImplTargetName,
            fields: [],
            span: defaultSpan,
        };
        return makeHVarExpr(
            ident.span,
            ctx.currentImplTargetName,
            -1,
            selfType,
        );
    }

    // Look up variable binding
    const varInfo = ctx.lookupVar(ident.name);
    if (varInfo) {
        const closureBinding = ctx.lookupClosureBinding(varInfo.id);
        if (closureBinding && closureBinding.captures.length > 0) {
            ctx.addError(
                "Capturing closures cannot escape; only direct calls are supported",
                ident.span,
            );
            return makeHUnitExpr(ident.span, makeUnitType(defaultSpan));
        }
        return makeHVarExpr(ident.span, varInfo.name, varInfo.id, varInfo.type);
    }

    // Look up item (function, struct, enum)
    const lookupName = ident.resolvedItemName || ident.name;
    const item = ctx.lookupItem(lookupName);
    if (item) {
        if (item.kind === "fn" && item.type) {
            // Function reference
            return makeHVarExpr(ident.span, lookupName, -1, item.type);
        }
        if (item.kind === "struct") {
            // Struct constructor - return as a reference
            const structTy = {
                kind: TypeKind.Struct,
                name: item.node.name,
                fields: [],
                span: defaultSpan,
            };
            return makeHVarExpr(ident.span, lookupName, -1, structTy);
        }
        if (item.kind === "enum") {
            // Enum reference
            const enumTy = {
                kind: TypeKind.Enum,
                name: item.node.name,
                variants: [],
                span: defaultSpan,
            };
            return makeHVarExpr(ident.span, lookupName, -1, enumTy);
        }
    }

    // Prelude-style `None` lowering to `Option::None` when unbound.
    if (ident.name === "None") {
        const optionItem = ctx.lookupItem("Option");
        if (optionItem && optionItem.kind === "enum") {
            return lowerPath(
                ctx,
                {
                    kind: NodeKind.PathExpr,
                    segments: ["Option", "None"],
                    span: ident.span,
                    resolvedItemName: null,
                },
                typeCtx,
            );
        }
    }

    // Also check type context
    const typeVar = typeCtx.lookupVar(ident.name);
    if (typeVar) {
        const resolvedType = typeCtx.resolveType(typeVar.type);
        return makeHVarExpr(ident.span, ident.name, -1, resolvedType);
    }

    ctx.addError(`Unbound identifier: ${ident.name}`, ident.span);
    return makeHUnitExpr(ident.span, makeUnitType(defaultSpan));
}

/**
 * Lower a binary expression
 */
function lowerBinary(
    ctx: LoweringCtx,
    binary: Node,
    typeCtx: TypeContext,
): HBinaryExpr {
    const defaultSpan: Span = binary.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    function autoDeref(expr: HExpr, span: Span): HExpr {
        let out = expr;
        while (
            out.ty &&
            (out.ty.kind === TypeKind.Ref || out.ty.kind === TypeKind.Ptr)
        ) {
            out = makeHDerefExpr(span, out, out.ty.inner);
        }
        return out;
    }

    let left = lowerExpr(ctx, binary.left, typeCtx);
    let right = lowerExpr(ctx, binary.right, typeCtx);

    const shouldAutoDeref =
        binary.op === BinaryOp.Add ||
        binary.op === BinaryOp.Sub ||
        binary.op === BinaryOp.Mul ||
        binary.op === BinaryOp.Div ||
        binary.op === BinaryOp.Rem ||
        binary.op === BinaryOp.Eq ||
        binary.op === BinaryOp.Ne ||
        binary.op === BinaryOp.Lt ||
        binary.op === BinaryOp.Le ||
        binary.op === BinaryOp.Gt ||
        binary.op === BinaryOp.Ge ||
        binary.op === BinaryOp.BitXor ||
        binary.op === BinaryOp.BitAnd ||
        binary.op === BinaryOp.BitOr ||
        binary.op === BinaryOp.Shl ||
        binary.op === BinaryOp.Shr;
    if (shouldAutoDeref) {
        left = autoDeref(left, binary.left.span);
        right = autoDeref(right, binary.right.span);
    }

    // Determine result type
    let ty = left.ty;
    if (binary.op >= BinaryOp.Eq && binary.op <= BinaryOp.Ge) {
        // Comparison operators return bool
        ty = { kind: TypeKind.Bool, span: defaultSpan };
    } else if (binary.op === BinaryOp.And || binary.op === BinaryOp.Or) {
        ty = { kind: TypeKind.Bool, span: defaultSpan };
    }

    return makeHBinaryExpr(binary.span, binary.op, left, right, ty);
}

/**
 * Lower a unary expression
 */
function lowerUnary(
    ctx: LoweringCtx,
    unary: Node,
    typeCtx: TypeContext,
): HUnaryExpr {
    const defaultSpan: Span = unary.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const operand = lowerExpr(ctx, unary.operand, typeCtx);

    let ty = operand.ty;
    if (unary.op === UnaryOp.Not) {
        ty = { kind: TypeKind.Bool, span: defaultSpan };
    }

    return makeHUnaryExpr(unary.span, unary.op, operand, ty);
}

function substituteLoweringGenericType(
    typeCtx: TypeContext,
    type: Type,
    genericNames: Set<string>,
    bindings: Map<string, Type>,
): Type {
    const defaultSpan: Span = type?.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const resolved = typeCtx.resolveType(type);
    if (resolved.kind === TypeKind.Named) {
        if (genericNames.has(resolved.name) && !resolved.args) {
            const bound = bindings.get(resolved.name);
            return bound ? typeCtx.resolveType(bound) : resolved;
        }
        const substitutedArgs = resolved.args
            ? resolved.args.map((t: Type) =>
                  substituteLoweringGenericType(
                      typeCtx,
                      t,
                      genericNames,
                      bindings,
                  ),
              )
            : null;
        const item = typeCtx.lookupItem(resolved.name);
        if (item && item.kind === "enum") {
            const enumNode = item.node as {
                generics?: string[];
                variants?: { name: string; fields?: { ty?: Node }[] }[];
            };
            const enumGenericParams = (enumNode.generics || [])
                .map((name: string) => name || "")
                .filter((name: string) => name.length > 0);
            const enumBindings = new Map<string, Type>();
            if (substitutedArgs) {
                const count = Math.min(
                    enumGenericParams.length,
                    substitutedArgs.length,
                );
                for (let i = 0; i < count; i++) {
                    enumBindings.set(enumGenericParams[i], substitutedArgs[i]);
                }
            }
            const enumGenericSet = new Set<string>(enumGenericParams);
            return {
                kind: TypeKind.Enum,
                name: resolved.name,
                variants: (enumNode.variants || []).map(
                    (variant: { name: string; fields?: { ty?: Node }[] }) => ({
                        name: variant.name,
                        fields: (variant.fields || []).map(
                            (field: { ty?: Node }) => {
                                if (!field?.ty)
                                    return makeUnitType(defaultSpan);
                                const fieldType = resolveTypeFromAst(
                                    field.ty,
                                    typeCtx,
                                );
                                if (!fieldType.ok)
                                    return makeUnitType(defaultSpan);
                                return substituteLoweringGenericType(
                                    typeCtx,
                                    fieldType.type,
                                    enumGenericSet,
                                    enumBindings,
                                );
                            },
                        ),
                    }),
                ),
                span: resolved.span,
            };
        }
        return {
            ...resolved,
            args: substitutedArgs,
        };
    }
    if (resolved.kind === TypeKind.Ref) {
        return {
            ...resolved,
            inner: substituteLoweringGenericType(
                typeCtx,
                resolved.inner,
                genericNames,
                bindings,
            ),
        };
    }
    if (resolved.kind === TypeKind.Ptr) {
        return {
            ...resolved,
            inner: substituteLoweringGenericType(
                typeCtx,
                resolved.inner,
                genericNames,
                bindings,
            ),
        };
    }
    if (resolved.kind === TypeKind.Tuple) {
        return {
            ...resolved,
            elements: resolved.elements.map((t: Type) =>
                substituteLoweringGenericType(
                    typeCtx,
                    t,
                    genericNames,
                    bindings,
                ),
            ),
        };
    }
    if (resolved.kind === TypeKind.Array) {
        return {
            ...resolved,
            element: substituteLoweringGenericType(
                typeCtx,
                resolved.element,
                genericNames,
                bindings,
            ),
        };
    }
    if (resolved.kind === TypeKind.Slice) {
        return {
            ...resolved,
            element: substituteLoweringGenericType(
                typeCtx,
                resolved.element,
                genericNames,
                bindings,
            ),
        };
    }
    if (resolved.kind === TypeKind.Fn) {
        return {
            ...resolved,
            params: resolved.params.map((t: Type) =>
                substituteLoweringGenericType(
                    typeCtx,
                    t,
                    genericNames,
                    bindings,
                ),
            ),
            returnType: substituteLoweringGenericType(
                typeCtx,
                resolved.returnType,
                genericNames,
                bindings,
            ),
        };
    }
    return resolved;
}

function vecElementTypeForType(ty: Type | null): Type | null {
    if (
        ty &&
        ty.kind === TypeKind.Named &&
        ty.name === "Vec" &&
        ty.args &&
        ty.args.length === 1
    ) {
        return ty.args[0];
    }
    return null;
}

function optionElementTypeForType(
    typeCtx: TypeContext,
    ty: Type | null,
): Type | null {
    if (!ty) return null;
    const resolved = typeCtx.resolveType(ty);
    if (
        resolved.kind === TypeKind.Named &&
        resolved.name === "Option" &&
        resolved.args &&
        resolved.args.length === 1
    ) {
        return typeCtx.resolveType(resolved.args[0]);
    }
    if (
        resolved.kind === TypeKind.Enum &&
        resolved.name === "Option" &&
        Array.isArray(resolved.variants)
    ) {
        const someVariant = resolved.variants.find(
            (variant: { name?: string; fields?: Type[] }) =>
                variant.name === "Some",
        );
        if (
            someVariant &&
            Array.isArray(someVariant.fields) &&
            someVariant.fields.length === 1
        ) {
            return typeCtx.resolveType(someVariant.fields[0]);
        }
    }
    return null;
}

function optionEnumTypeForType(
    typeCtx: TypeContext,
    ty: Type | null,
): Type | null {
    if (!ty) return null;
    const resolved = typeCtx.resolveType(ty);
    if (resolved.kind === TypeKind.Enum && resolved.name === "Option") {
        return resolved;
    }
    if (
        resolved.kind === TypeKind.Named &&
        resolved.name === "Option" &&
        resolved.args &&
        resolved.args.length === 1
    ) {
        const payloadType = typeCtx.resolveType(resolved.args[0]);
        return {
            kind: TypeKind.Enum,
            name: "Option",
            variants: [
                { name: "None", fields: [] },
                { name: "Some", fields: [payloadType] },
            ],
            span: resolved.span,
        };
    }
    return null;
}

function isEqLowerableType(
    typeCtx: TypeContext,
    ty: Type | null,
): boolean {
    if (!ty) return false;
    const resolved = typeCtx.resolveType(ty);
    return (
        resolved.kind === TypeKind.Int ||
        resolved.kind === TypeKind.Float ||
        resolved.kind === TypeKind.Bool
    );
}

type MethodMeta = {
    implGenericNames?: string[];
    targetGenericParamNames?: string[];
};

function instantiateLoweringMethodType(
    typeCtx: TypeContext,
    fnType: Type,
    receiverType: Type | null,
    meta: MethodMeta | null,
): Type {
    const implGenericNames = Array.isArray(meta?.implGenericNames)
        ? meta.implGenericNames
        : [];
    if (implGenericNames.length === 0) {
        return fnType;
    }
    if (
        !receiverType ||
        receiverType.kind !== TypeKind.Named ||
        !receiverType.args ||
        receiverType.args.length === 0
    ) {
        return fnType;
    }
    const targetGenericParamNames = Array.isArray(meta?.targetGenericParamNames)
        ? meta.targetGenericParamNames
        : [];
    if (targetGenericParamNames.length === 0) {
        return fnType;
    }
    const genericSet = new Set(implGenericNames);
    const bindings = new Map<string, Type>();
    const count = Math.min(
        targetGenericParamNames.length,
        receiverType.args.length,
    );
    for (let i = 0; i < count; i++) {
        const genericName = targetGenericParamNames[i];
        if (!genericName || !genericSet.has(genericName)) continue;
        bindings.set(genericName, receiverType.args[i]);
    }
    if (bindings.size === 0) {
        return fnType;
    }
    return substituteLoweringGenericType(typeCtx, fnType, genericSet, bindings);
}

type LookupCallItemResult = {
    kind: "fn" | "struct" | "enum";
    node: Node;
    type?: Type;
    genericBindings?: Map<string, Type>;
};

function lookupLoweringCallItem(
    typeCtx: TypeContext,
    callee: Node,
): LookupCallItemResult | null {
    if (callee.kind === NodeKind.IdentifierExpr) {
        const lookupName = callee.resolvedItemName || callee.name;
        return typeCtx.lookupItem(lookupName) as LookupCallItemResult | null;
    }
    if (callee.kind === NodeKind.PathExpr) {
        const lookupName =
            callee.resolvedItemName ||
            (callee.segments && callee.segments.length > 0
                ? callee.segments[0]
                : null);
        return lookupName
            ? (typeCtx.lookupItem(lookupName) as LookupCallItemResult | null)
            : null;
    }
    return null;
}

/**
 * Lower a call expression
 */
function lowerCall(ctx: LoweringCtx, call: Node, typeCtx: TypeContext): HExpr {
    const defaultSpan: Span = call.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    if (call.callee?.kind === NodeKind.IdentifierExpr) {
        const variantName = call.callee.name;
        if (
            (variantName === "Some" || variantName === "None") &&
            !ctx.lookupVar(variantName) &&
            !ctx.lookupItem(variantName)
        ) {
            const optionItem = ctx.lookupItem("Option");
            if (optionItem && optionItem.kind === "enum") {
                return lowerCall(
                    ctx,
                    {
                        ...call,
                        callee: {
                            kind: NodeKind.PathExpr,
                            segments: ["Option", variantName],
                            span: call.callee.span,
                            resolvedItemName: null,
                        },
                    },
                    typeCtx,
                );
            }
        }
    }

    if (call.callee?.kind === NodeKind.IdentifierExpr) {
        const closureVar = ctx.lookupVar(call.callee.name);
        if (closureVar) {
            const closureBinding = ctx.lookupClosureBinding(closureVar.id);
            if (closureBinding) {
                const captureArgs = closureBinding.captures.map((capture) => {
                    const sourceVar = ctx.lookupVarById(capture.varId);
                    const sourceExpr = makeHVarExpr(
                        call.callee!.span,
                        sourceVar?.name || capture.name,
                        capture.varId,
                        capture.type,
                    );
                    if (capture.mode === "ref") {
                        return makeHRefExpr(
                            call.callee!.span,
                            true,
                            sourceExpr,
                            makeRefType(capture.type, true, call.callee!.span),
                        );
                    }
                    return sourceExpr;
                });
                const userArgs = (call.args || []).map((arg: Node) =>
                    lowerExpr(ctx, arg, typeCtx),
                );
                const callee = makeHVarExpr(
                    call.callee.span,
                    closureBinding.helperName,
                    -1,
                    closureBinding.helperType,
                );
                const helperReturnType =
                    closureBinding.helperType.kind === TypeKind.Fn
                        ? closureBinding.helperType.returnType
                        : makeUnitType(call.span);
                return makeHCallExpr(
                    call.span,
                    callee,
                    [...captureArgs, ...userArgs],
                    helperReturnType,
                );
            }
        }
    }

    if (call.callee?.kind === NodeKind.FieldExpr) {
        const methodField = call.callee;
        const resolvedSymbol = methodField.resolvedMethodSymbolName || null;
        if (resolvedSymbol) {
            const methodMeta = typeCtx.lookupMethodBySymbol(resolvedSymbol) as {
                type?: Type;
                meta?: MethodMeta;
            } | null;
            const receiver = lowerExpr(ctx, methodField.receiver, typeCtx);
            if (methodMeta && methodMeta.type?.kind === TypeKind.Fn) {
                const methodType = instantiateLoweringMethodType(
                    typeCtx,
                    methodMeta.type,
                    receiver.ty,
                    methodMeta.meta || null,
                ) as FnType;
                let receiverArg = receiver;
                const receiverType = methodType.params[0];
                if (receiverType?.kind === TypeKind.Ref) {
                    const refTy = {
                        kind: TypeKind.Ref,
                        inner: receiver.ty,
                        mutable: receiverType.mutable === true,
                        span: defaultSpan,
                    };
                    receiverArg = makeHRefExpr(
                        methodField.receiver.span,
                        receiverType.mutable === true,
                        receiver,
                        refTy,
                    );
                }
                const args = [
                    receiverArg,
                    ...(call.args || []).map((arg: Node) =>
                        lowerExpr(ctx, arg, typeCtx),
                    ),
                ];
                const callee = makeHVarExpr(
                    call.callee.span,
                    resolvedSymbol,
                    -1,
                    methodType,
                );
                return makeHCallExpr(
                    call.span,
                    callee,
                    args,
                    methodType.returnType,
                );
            }
        }
        const methodName =
            typeof methodField.field === "string"
                ? methodField.field
                : methodField.field?.name;
        const receiver = lowerExpr(ctx, methodField.receiver, typeCtx);
        if (methodName && receiver.ty) {
            let receiverStructName: string | null = null;
            if (receiver.ty.kind === TypeKind.Struct) {
                receiverStructName = receiver.ty.name;
            } else if (receiver.ty.kind === TypeKind.Named) {
                receiverStructName = receiver.ty.name;
            }
            if (receiverStructName) {
                const methodDecl = typeCtx.lookupMethod(
                    receiverStructName,
                    methodName,
                ) as {
                    type?: Type;
                    symbolName?: string;
                    meta?: MethodMeta;
                } | null;
                if (methodDecl && methodDecl.type?.kind === TypeKind.Fn) {
                    const methodType = instantiateLoweringMethodType(
                        typeCtx,
                        methodDecl.type,
                        receiver.ty,
                        methodDecl.meta || null,
                    ) as FnType;
                    let receiverArg = receiver;
                    const receiverType = methodType.params[0];
                    if (receiverType?.kind === TypeKind.Ref) {
                        const refTy = {
                            kind: TypeKind.Ref,
                            inner: receiver.ty,
                            mutable: receiverType.mutable === true,
                            span: defaultSpan,
                        };
                        receiverArg = makeHRefExpr(
                            methodField.receiver.span,
                            receiverType.mutable === true,
                            receiver,
                            refTy,
                        );
                    }
                    const args = [
                        receiverArg,
                        ...(call.args || []).map((arg: Node) =>
                            lowerExpr(ctx, arg, typeCtx),
                        ),
                    ];
                    const callee = makeHVarExpr(
                        call.callee.span,
                        methodDecl.symbolName || methodName,
                        -1,
                        methodType,
                    );
                    return makeHCallExpr(
                        call.span,
                        callee,
                        args,
                        methodType.returnType,
                    );
                }
                ctx.addError(
                    `Unknown method on struct '${receiverStructName}': ${methodName}`,
                    call.callee.span,
                );
            }
        }
    }

    if (
        call.callee?.kind === NodeKind.PathExpr &&
        call.callee.segments?.length === 2
    ) {
        const enumName = call.callee.segments[0];
        const variantName = call.callee.segments[1];
        const enumItem = ctx.lookupItem(enumName);
        if (enumItem && enumItem.kind === "enum") {
            const loweredArgs = (call.args || []).map((arg: Node) =>
                lowerExpr(ctx, arg, typeCtx),
            );
            const enumNode = enumItem.node as {
                generics?: string[];
                variants?: { name: string; fields?: { ty?: Node }[] }[];
            };
            const variantIndex = findEnumVariantIndex(
                enumNode,
                variantName,
            );
            const enumNodeVariants = enumNode.variants || [];
            const variantNode = enumNodeVariants[variantIndex] || null;
            const enumGenericParams = (enumNode.generics || [])
                .map((name: string) => name || "")
                .filter((name: string) => name.length > 0);
            const genericSet = new Set<string>(enumGenericParams);
            const bindings = new Map<string, Type>();

            if (variantNode && variantNode.fields) {
                const count = Math.min(
                    variantNode.fields.length,
                    loweredArgs.length,
                );
                for (let i = 0; i < count; i++) {
                    const field = variantNode.fields[i];
                    if (!field?.ty) continue;
                    const fieldType = resolveTypeFromAst(field.ty, typeCtx);
                    if (!fieldType.ok || fieldType.type.kind !== TypeKind.Named)
                        continue;
                    if (
                        !genericSet.has(fieldType.type.name) ||
                        fieldType.type.args
                    )
                        continue;
                    bindings.set(fieldType.type.name, loweredArgs[i].ty);
                }
            }

            const enumTy = {
                kind: TypeKind.Enum,
                name: enumName,
                variants: enumNodeVariants.map(
                    (variant: { name: string; fields?: { ty?: Node }[] }) => {
                        const fields = (variant.fields || []).map(
                            (field: { ty?: Node }) => {
                                if (!field?.ty)
                                    return makeUnitType(defaultSpan);
                                const resolved = resolveTypeFromAst(
                                    field.ty,
                                    typeCtx,
                                );
                                if (!resolved.ok)
                                    return makeUnitType(defaultSpan);
                                return substituteLoweringGenericType(
                                    typeCtx,
                                    resolved.type,
                                    genericSet,
                                    bindings,
                                );
                            },
                        );
                        return { name: variant.name, fields };
                    },
                ),
                span: defaultSpan,
            };

            return makeHEnumExpr(
                call.span,
                enumName,
                variantName,
                variantIndex,
                loweredArgs,
                enumTy,
            );
        }
    }

    const callee = lowerExpr(ctx, call.callee, typeCtx);
    const args = (call.args || []).map((arg: Node) =>
        lowerExpr(ctx, arg, typeCtx),
    );

    // Get return type from callee type
    let ty = makeUnitType(defaultSpan);
    if (callee.ty && callee.ty.kind === TypeKind.Fn) {
        ty = callee.ty.returnType;
    }
    const itemDecl = lookupLoweringCallItem(typeCtx, call.callee);
    if (
        itemDecl &&
        itemDecl.kind === "fn" &&
        itemDecl.type?.kind === TypeKind.Fn
    ) {
        const genericNames = itemDecl.node?.generics || [];
        if (genericNames.length > 0) {
            const bindings = itemDecl.genericBindings || new Map();
            ty = substituteLoweringGenericType(
                typeCtx,
                itemDecl.type.returnType,
                new Set(genericNames),
                bindings,
            );
        }
    }

    return makeHCallExpr(call.span, callee, args, ty);
}

/**
 * Lower a macro invocation expression.
 * Currently supports `println!` and `print!` with a single string literal.
 */
function lowerMacro(
    ctx: LoweringCtx,
    macroExpr: Node,
    typeCtx: TypeContext,
): HExpr {
    switch (macroExpr.name) {
        case "println":
            return lowerPrintMacro(
                ctx,
                macroExpr,
                typeCtx,
                BUILTIN_PRINTLN_FMT_FN,
            );
        case "print":
            return lowerPrintMacro(
                ctx,
                macroExpr,
                typeCtx,
                BUILTIN_PRINT_FMT_FN,
            );
        case "assert_eq":
            return lowerAssertEqMacro(ctx, macroExpr, typeCtx);
        case "vec":
            return lowerVecMacro(ctx, macroExpr, typeCtx);
        default:
            ctx.addError(
                `Unsupported macro in lowering: ${macroExpr.name}!`,
                macroExpr.span,
            );
            return makeHUnitExpr(macroExpr.span, makeUnitType(macroExpr.span));
    }
}

/**
 * Lower `assert_eq!(a, b)` into `if a == b { () } else { __jsrust_builtin_assert_fail() }`.
 */
function lowerAssertEqMacro(
    ctx: LoweringCtx,
    macroExpr: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = macroExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const args = macroExpr.args || [];
    if (args.length !== 2) {
        ctx.addError("assert_eq! requires exactly 2 arguments", macroExpr.span);
        return makeHUnitExpr(macroExpr.span, makeUnitType(defaultSpan));
    }

    const left = lowerExpr(ctx, args[0], typeCtx);
    const right = lowerExpr(ctx, args[1], typeCtx);
    const optionLeftElement = optionElementTypeForType(typeCtx, left.ty);
    const optionRightElement = optionElementTypeForType(typeCtx, right.ty);
    const optionLeftEnumType = optionEnumTypeForType(typeCtx, left.ty);
    const optionRightEnumType = optionEnumTypeForType(typeCtx, right.ty);
    const unitType = makeUnitType(defaultSpan);
    const boolType = makeBoolType(defaultSpan);

    const failCallee = makeHVarExpr(
        macroExpr.span,
        BUILTIN_ASSERT_FAIL_FN,
        -1,
        makeFnType([], unitType, false, false, macroExpr.span),
    );
    const failCall = makeHCallExpr(macroExpr.span, failCallee, [], unitType);
    const trueExpr = makeHLiteralExpr(
        macroExpr.span,
        HLiteralKind.Bool,
        true,
        boolType,
    );
    const falseExpr = makeHLiteralExpr(
        macroExpr.span,
        HLiteralKind.Bool,
        false,
        boolType,
    );

    if (optionLeftElement && optionRightElement) {
        if (!isEqLowerableType(typeCtx, optionLeftElement)) {
            ctx.addError(
                `assert_eq! for Option<T> is only supported when T is int/float/bool; got ${typeToString(typeCtx.resolveType(optionLeftElement))}`,
                macroExpr.span,
            );
            return makeHUnitExpr(macroExpr.span, unitType);
        }

        const leftOptionExpr = optionLeftEnumType
            ? { ...left, ty: optionLeftEnumType }
            : left;
        const rightOptionExpr = optionRightEnumType
            ? { ...right, ty: optionRightEnumType }
            : right;
        const leftPayloadVar = ctx.defineVar(
            `__assert_eq_left_opt_${ctx.nextVarId}`,
            optionLeftElement,
            false,
        );
        const rightPayloadVar = ctx.defineVar(
            `__assert_eq_right_opt_${ctx.nextVarId}`,
            optionRightElement,
            false,
        );
        const leftPayloadPat = makeHIdentPat(
            macroExpr.span,
            leftPayloadVar.name,
            leftPayloadVar.id,
            optionLeftElement,
            false,
            false,
        );
        const rightPayloadPat = makeHIdentPat(
            macroExpr.span,
            rightPayloadVar.name,
            rightPayloadVar.id,
            optionRightElement,
            false,
            false,
        );
        const leftSomePat = makeHStructPat(
            macroExpr.span,
            "Option::Some",
            [{ name: "0", pat: leftPayloadPat }],
            false,
            leftOptionExpr.ty,
        );
        const leftNonePat = makeHStructPat(
            macroExpr.span,
            "Option::None",
            [],
            false,
            leftOptionExpr.ty,
        );
        const rightSomePat = makeHStructPat(
            macroExpr.span,
            "Option::Some",
            [{ name: "0", pat: rightPayloadPat }],
            false,
            rightOptionExpr.ty,
        );
        const rightNonePat = makeHStructPat(
            macroExpr.span,
            "Option::None",
            [],
            false,
            rightOptionExpr.ty,
        );
        const rightWildcardPat = makeHWildcardPat(
            macroExpr.span,
            rightOptionExpr.ty,
        );

        const payloadEq = makeHBinaryExpr(
            macroExpr.span,
            BinaryOp.Eq,
            makeHVarExpr(
                macroExpr.span,
                leftPayloadVar.name,
                leftPayloadVar.id,
                optionLeftElement,
            ),
            makeHVarExpr(
                macroExpr.span,
                rightPayloadVar.name,
                rightPayloadVar.id,
                optionRightElement,
            ),
            boolType,
        );

        const rightMatchInSome = makeHMatchExpr(
            macroExpr.span,
            rightOptionExpr as HExpr,
            [
                makeHMatchArm(
                    macroExpr.span,
                    rightSomePat,
                    null,
                    makeHBlock(macroExpr.span, [], payloadEq, boolType),
                ),
                makeHMatchArm(
                    macroExpr.span,
                    rightWildcardPat,
                    null,
                    makeHBlock(macroExpr.span, [], falseExpr, boolType),
                ),
            ],
            boolType,
        );
        const rightMatchInNone = makeHMatchExpr(
            macroExpr.span,
            rightOptionExpr as HExpr,
            [
                makeHMatchArm(
                    macroExpr.span,
                    rightNonePat,
                    null,
                    makeHBlock(macroExpr.span, [], trueExpr, boolType),
                ),
                makeHMatchArm(
                    macroExpr.span,
                    rightWildcardPat,
                    null,
                    makeHBlock(macroExpr.span, [], falseExpr, boolType),
                ),
            ],
            boolType,
        );
        const condition = makeHMatchExpr(
            macroExpr.span,
            leftOptionExpr as HExpr,
            [
                makeHMatchArm(
                    macroExpr.span,
                    leftNonePat,
                    null,
                    makeHBlock(macroExpr.span, [], rightMatchInNone, boolType),
                ),
                makeHMatchArm(
                    macroExpr.span,
                    leftSomePat,
                    null,
                    makeHBlock(macroExpr.span, [], rightMatchInSome, boolType),
                ),
            ],
            boolType,
        );

        return makeHIfExpr(
            macroExpr.span,
            condition,
            makeHBlock(
                macroExpr.span,
                [],
                makeHUnitExpr(macroExpr.span, unitType),
                unitType,
            ),
            makeHBlock(macroExpr.span, [], failCall, unitType),
            unitType,
        );
    }

    const condition = makeHBinaryExpr(
        macroExpr.span,
        BinaryOp.Eq,
        left,
        right,
        boolType,
    );
    const thenBranch = makeHBlock(
        macroExpr.span,
        [],
        makeHUnitExpr(macroExpr.span, unitType),
        unitType,
    );
    const elseBranch = makeHBlock(macroExpr.span, [], failCall, unitType);
    return makeHIfExpr(
        macroExpr.span,
        condition,
        thenBranch,
        elseBranch,
        unitType,
    );
}

/**
 * Lower print-like macros to builtin call form with a format literal and tagged args.
 */
function lowerPrintMacro(
    ctx: LoweringCtx,
    macroExpr: Node,
    typeCtx: TypeContext,
    builtinName: string,
): HExpr {
    const defaultSpan: Span = macroExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const args = macroExpr.args || [];
    if (args.length === 0) {
        ctx.addError(
            `${macroExpr.name}! requires a format string argument`,
            macroExpr.span,
        );
        return makeHUnitExpr(macroExpr.span, makeUnitType(defaultSpan));
    }

    const formatArg = args[0];
    if (
        formatArg.kind !== NodeKind.LiteralExpr ||
        formatArg.literalKind !== LiteralKind.String
    ) {
        ctx.addError(
            `${macroExpr.name}! format string must be a string literal`,
            formatArg.span || macroExpr.span,
        );
        return makeHUnitExpr(macroExpr.span, makeUnitType(defaultSpan));
    }

    const formatStr = String(formatArg.value);
    const formatArgs = args.slice(1);
    const parsed = parseFormatString(formatStr);

    // Validate placeholder count matches argument count
    if (parsed.placeholderCount !== formatArgs.length) {
        ctx.addError(
            `${macroExpr.name}! expected ${parsed.placeholderCount} format argument(s), got ${formatArgs.length}`,
            macroExpr.span,
        );
        return makeHUnitExpr(macroExpr.span, makeUnitType(defaultSpan));
    }

    const byteType = makeIntType(IntWidth.I32, macroExpr.span);
    const hirArgs = [lowerExpr(ctx, formatArg, typeCtx)];

    for (let i = 0; i < formatArgs.length; i++) {
        const arg = formatArgs[i];
        const hirArg = lowerExpr(ctx, arg, typeCtx);
        const tag = formatArgTagForType(hirArg.ty);
        if (tag === null) {
            ctx.addError(
                `${macroExpr.name}! format argument ${i} type ${typeToString(hirArg.ty)} is not supported by {}`,
                arg.span || macroExpr.span,
            );
            continue;
        }
        hirArgs.push(
            makeHLiteralExpr(
                arg.span || macroExpr.span,
                HLiteralKind.Int,
                tag,
                byteType,
            ),
        );
        hirArgs.push(hirArg);
    }

    if (ctx.errors.length > 0) {
        return makeHUnitExpr(macroExpr.span, makeUnitType(defaultSpan));
    }

    const unitType = makeUnitType(defaultSpan);
    const calleeType = makeFnType(
        hirArgs.map((arg) => arg.ty || byteType),
        unitType,
        false,
        false,
        macroExpr.span,
    );
    const callee = makeHVarExpr(macroExpr.span, builtinName, -1, calleeType);

    return makeHCallExpr(macroExpr.span, callee, hirArgs, unitType);
}

/**
 * Lower vec![a, b, c] into prelude statements:
 * let __vec_tmpN = Vec::new();
 * __vec_tmpN.push(a); ...
 * and return __vec_tmpN as expression.
 */
function lowerVecMacro(
    ctx: LoweringCtx,
    macroExpr: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = macroExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const args = macroExpr.args || [];
    const loweredArgs = args.map((arg: Node) => lowerExpr(ctx, arg, typeCtx));
    const elementType =
        loweredArgs.length > 0
            ? loweredArgs[0].ty
            : typeCtx.freshTypeVar(defaultSpan);
    const vecType = {
        kind: TypeKind.Named,
        name: "Vec",
        args: [elementType],
        span: defaultSpan,
    };

    const tempName = `__vec_tmp${ctx.freshVarId()}`;
    const tempVar = ctx.defineVar(tempName, vecType, true);
    const tempPat = makeHIdentPat(
        macroExpr.span,
        tempName,
        tempVar.id,
        vecType,
        true,
        false,
    );

    const newFnType = makeFnType([], vecType, false, false, macroExpr.span);
    const newCallee = makeHVarExpr(macroExpr.span, "Vec::new", -1, newFnType);
    const newCall = makeHCallExpr(macroExpr.span, newCallee, [], vecType);
    ctx.queuePreludeStmt(
        makeHLetStmt(macroExpr.span, tempPat, vecType, newCall),
    );

    for (const valueExpr of loweredArgs) {
        const receiverExpr = makeHVarExpr(
            macroExpr.span,
            tempName,
            tempVar.id,
            vecType,
        );
        const receiverRefType = makeRefType(vecType, true, macroExpr.span);
        const receiverArg = makeHRefExpr(
            macroExpr.span,
            true,
            receiverExpr,
            receiverRefType,
        );
        const pushFnType = makeFnType(
            [receiverRefType, valueExpr.ty],
            makeUnitType(defaultSpan),
            false,
            false,
            macroExpr.span,
        );
        const pushCallee = makeHVarExpr(
            macroExpr.span,
            "Vec::push",
            -1,
            pushFnType,
        );
        const pushCall = makeHCallExpr(
            macroExpr.span,
            pushCallee,
            [receiverArg, valueExpr],
            makeUnitType(defaultSpan),
        );
        ctx.queuePreludeStmt(makeHExprStmt(macroExpr.span, pushCall));
    }

    return makeHVarExpr(macroExpr.span, tempName, tempVar.id, vecType);
}

/**
 * Lower a field expression
 */
function lowerField(
    ctx: LoweringCtx,
    field: Node,
    typeCtx: TypeContext,
): HFieldExpr {
    const defaultSpan: Span = field.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const base = lowerExpr(ctx, field.receiver, typeCtx);
    const fieldName =
        typeof field.field === "string" ? field.field : field.field.name;
    let fieldBase = base;
    let baseType = base.ty;
    if (
        baseType &&
        (baseType.kind === TypeKind.Ref || baseType.kind === TypeKind.Ptr)
    ) {
        baseType = baseType.inner;
        fieldBase = makeHDerefExpr(
            field.span,
            base,
            baseType || makeUnitType(defaultSpan),
        );
    }

    // Get field index and type
    let index = 0;
    let ty = makeUnitType(defaultSpan);

    if (baseType && baseType.kind === TypeKind.Struct) {
        index = ctx.getFieldIndex(baseType.name, fieldName);
        const fieldDef = baseType.fields?.find(
            (f: { name: string; type: Type }) => f.name === fieldName,
        );
        if (fieldDef) {
            ty = fieldDef.type;
        } else {
            const item = typeCtx.lookupItem(baseType.name);
            if (item && item.kind === "struct") {
                const structNodeItem = item.node as {
                    fields?: { name: string; ty?: Node }[];
                };
                const structField = structNodeItem.fields?.find(
                    (f: { name: string; ty?: Node }) => f.name === fieldName,
                );
                if (structField?.ty) {
                    const resolvedType = resolveTypeFromAst(
                        structField.ty,
                        typeCtx,
                    );
                    if (resolvedType.ok) {
                        ty = resolvedType.type || makeUnitType(defaultSpan);
                    }
                }
            }
        }
    } else if (baseType && baseType.kind === TypeKind.Named) {
        index = ctx.getFieldIndex(baseType.name, fieldName);
        const item = typeCtx.lookupItem(baseType.name);
        if (item && item.kind === "struct") {
            const structNodeItem = item.node as {
                fields?: { name: string; ty?: Node }[];
                generics?: string[];
            };
            const structField = structNodeItem.fields?.find(
                (f: { name: string; ty?: Node }) => f.name === fieldName,
            );
            if (structField?.ty) {
                const resolvedType = resolveTypeFromAst(
                    structField.ty,
                    typeCtx,
                );
                if (resolvedType.ok) {
                    ty = resolvedType.type || makeUnitType(defaultSpan);
                    const genericParams = structNodeItem.generics || [];
                    const receiverArgs = baseType.args || [];
                    if (genericParams.length > 0 && receiverArgs.length > 0) {
                        const genericSet = new Set<string>();
                        const bindings = new Map<string, Type>();
                        const count = Math.min(
                            genericParams.length,
                            receiverArgs.length,
                        );
                        for (let i = 0; i < count; i++) {
                            const genericName = genericParams[i] || null;
                            if (!genericName) continue;
                            genericSet.add(genericName);
                            bindings.set(genericName, receiverArgs[i]);
                        }
                        if (bindings.size > 0) {
                            ty = substituteLoweringGenericType(
                                typeCtx,
                                ty,
                                genericSet,
                                bindings,
                            );
                        }
                    }
                }
            }
        }
    } else if (baseType && baseType.kind === TypeKind.Tuple) {
        // Tuple field access by index
        index = parseInt(fieldName, 10);
        if (
            !isNaN(index) &&
            baseType.elements &&
            index < baseType.elements.length
        ) {
            ty = baseType.elements[index];
        }
    }

    return makeHFieldExpr(field.span, fieldBase, fieldName, index, ty);
}

/**
 * Lower an index expression
 */
function lowerIndex(
    ctx: LoweringCtx,
    index: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = index.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const base = lowerExpr(ctx, index.receiver, typeCtx);
    const idx = lowerExpr(ctx, index.index, typeCtx);

    // Get element type
    let ty = makeUnitType(defaultSpan);
    if (base.ty && base.ty.kind === TypeKind.Array) {
        ty = base.ty.element;
    } else if (base.ty && base.ty.kind === TypeKind.Slice) {
        ty = base.ty.element;
    } else if (base.ty && base.ty.kind === TypeKind.Ptr) {
        ty = base.ty.inner;
    } else {
        const vecElement = base.ty ? vecElementTypeForType(base.ty) : null;
        if (vecElement) {
            const elementType = substituteLoweringGenericType(
                typeCtx,
                vecElement,
                new Set(),
                new Map(),
            );
            const receiverRefType = makeRefType(base.ty, false, index.span);
            const receiverArg = makeHRefExpr(
                index.span,
                false,
                base,
                receiverRefType,
            );
            const methodType = makeFnType(
                [receiverRefType, idx.ty],
                elementType,
                false,
                false,
                index.span,
            );
            const callee = makeHVarExpr(
                index.span,
                "Vec::index",
                -1,
                methodType,
            );
            return makeHCallExpr(
                index.span,
                callee,
                [receiverArg, idx],
                elementType,
            );
        }
    }

    return makeHIndexExpr(index.span, base, idx, ty);
}

/**
 * Lower an assignment expression
 */
function lowerAssign(
    ctx: LoweringCtx,
    assign: Node,
    typeCtx: TypeContext,
): HUnitExpr {
    const defaultSpan: Span = assign.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    lowerExpr(ctx, assign.value, typeCtx);

    // Extract place from target
    const place = extractPlace(ctx, assign.target, typeCtx);
    if (!place) {
        ctx.addError("Invalid assignment target", assign.target.span);
        return makeHUnitExpr(assign.span, makeUnitType(defaultSpan));
    }

    // Create assignment statement wrapped in a block
    // For now, assignments are statements, so return unit
    return makeHUnitExpr(assign.span, makeUnitType(defaultSpan));
}

/**
 * Lower a struct expression
 */
function lowerStructExpr(
    ctx: LoweringCtx,
    structExpr: Node,
    typeCtx: TypeContext,
): HStructExpr {
    const defaultSpan: Span = structExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const path = lowerExpr(ctx, structExpr.path, typeCtx);

    const fields = (structExpr.fields || []).map(
        (field: { name: string; value: Node }) => ({
            name: field.name,
            value: lowerExpr(ctx, field.value, typeCtx),
        }),
    );

    let spread: HExpr | null = null;
    if (structExpr.spread) {
        spread = lowerExpr(ctx, structExpr.spread, typeCtx);
    }

    // Get struct type
    let ty = path.ty;
    if (ty.kind === TypeKind.Struct) {
        // Already have struct type
    } else if (ty.kind === TypeKind.Named) {
        ty = {
            kind: TypeKind.Struct,
            name: ty.name,
            fields: [],
            span: defaultSpan,
        };
    }

    return makeHStructExpr(
        structExpr.span,
        (path as HVarExpr).name || "",
        fields,
        spread,
        ty,
    );
}

/**
 * Lower a reference expression
 */
function lowerRef(ctx: LoweringCtx, ref: Node, typeCtx: TypeContext): HRefExpr {
    const defaultSpan: Span = ref.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const operand = lowerExpr(ctx, ref.operand, typeCtx);
    const mutable = ref.mutability === Mutability.Mutable;

    const ty = {
        kind: TypeKind.Ref,
        inner: operand.ty,
        mutable,
        span: defaultSpan,
    };

    return makeHRefExpr(ref.span, mutable, operand, ty);
}

/**
 * Lower a dereference expression
 */
function lowerDeref(
    ctx: LoweringCtx,
    deref: Node,
    typeCtx: TypeContext,
): HDerefExpr {
    const defaultSpan: Span = deref.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const operand = lowerExpr(ctx, deref.operand, typeCtx);

    let ty = makeUnitType(defaultSpan);
    if (operand.ty && operand.ty.kind === TypeKind.Ref) {
        ty = operand.ty.inner;
    } else if (operand.ty && operand.ty.kind === TypeKind.Ptr) {
        ty = operand.ty.inner;
    }

    return makeHDerefExpr(deref.span, operand, ty);
}

/**
 * Lower a closure expression by synthesizing a helper function.
 */
function lowerClosure(
    ctx: LoweringCtx,
    closure: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = closure.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const inferredType =
        closure.inferredType && closure.inferredType.kind === TypeKind.Fn
            ? closure.inferredType
            : makeFnType(
                  [],
                  makeUnitType(defaultSpan),
                  false,
                  false,
                  defaultSpan,
              );
    const captures = closure.captureInfos || [];
    const helperName = `${ctx.currentFn || "closure"}::__closure_${ctx.nextClosureSymbolId()}`;

    const captureParamTypes = captures.map(
        (cap: { byRef?: boolean; type: Type }) =>
            cap.byRef ? makeRefType(cap.type, true, defaultSpan) : cap.type,
    );
    const helperType = makeFnType(
        [...captureParamTypes, ...(inferredType as FnType).params],
        (inferredType as FnType).returnType,
        false,
        false,
        defaultSpan,
    );

    const syntheticParams: Node[] = [];
    for (const capture of captures) {
        syntheticParams.push({
            kind: NodeKind.Param,
            span: defaultSpan,
            name: capture.name,
            ty: null,
            pat: null,
            isReceiver: false,
            receiverKind: null,
        } as Node);
    }
    for (let i = 0; i < (closure.params || []).length; i++) {
        const param = closure.params[i];
        syntheticParams.push({
            kind: NodeKind.Param,
            span: param.span || defaultSpan,
            name: param.name === "_" ? null : param.name,
            ty: null,
            pat: null,
            isReceiver: false,
            receiverKind: null,
        } as Node);
    }

    const bodyNode =
        closure.body?.kind === NodeKind.BlockExpr
            ? closure.body
            : makeBlockExpr(
                  closure.body?.span || defaultSpan,
                  [],
                  closure.body || null,
              );

    const syntheticFn = {
        kind: NodeKind.FnItem,
        span: defaultSpan,
        name: helperName,
        generics: null,
        params: syntheticParams,
        returnType: null,
        body: bodyNode,
        isAsync: false,
        isUnsafe: false,
        isPub: false,
        syntheticFnType: helperType,
    };
    const helperDecl = lowerFnItem(ctx, syntheticFn, typeCtx);
    if (helperDecl) {
        ctx.queueGeneratedItem(helperDecl);
    }

    const closureValue = makeHVarExpr(
        defaultSpan,
        helperName,
        -1,
        inferredType,
    );
    (closureValue as HVarExpr & { closureMeta?: ClosureMeta }).closureMeta = {
        helperName,
        helperType,
        captures: captures.map(
            (cap: {
                name: string;
                type: Type;
                mutable?: boolean;
                byRef?: boolean;
            }) => ({
                name: cap.name,
                type: cap.type,
                mutable: cap.mutable === true,
                mode: cap.byRef ? "ref" : "value",
            }),
        ),
    };
    return closureValue;
}

// ============================================================================
// Task 6.6: Control Flow Lowering
// ============================================================================

/**
 * Lower a block expression
 */
function lowerBlock(
    ctx: LoweringCtx,
    block: Node,
    typeCtx: TypeContext,
): HBlock {
    const defaultSpan: Span = block.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    ctx.pushScope();

    const stmts: HStmt[] = [];
    for (const stmt of block.stmts || []) {
        const lowered = lowerStmt(ctx, stmt, typeCtx);
        const preludes = ctx.consumePreludeStmts();
        if (preludes.length > 0) {
            stmts.push(...preludes);
        }
        stmts.push(lowered);
    }

    let expr: HExpr | null = null;
    let ty = makeUnitType(defaultSpan);

    if (block.expr) {
        expr = lowerExpr(ctx, block.expr, typeCtx);
        ty = expr.ty;
    }

    ctx.popScope();

    return makeHBlock(block.span, stmts, expr, ty);
}

/**
 * Lower an if expression
 */
function lowerIf(
    ctx: LoweringCtx,
    ifExpr: Node,
    typeCtx: TypeContext,
): HIfExpr {
    const defaultSpan: Span = ifExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const condition = lowerExpr(ctx, ifExpr.condition, typeCtx);
    const thenBranch = lowerBlock(ctx, ifExpr.thenBranch, typeCtx);

    let elseBranch: HBlock | null = null;
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
        ty = makeUnitType(defaultSpan);
    }

    return makeHIfExpr(ifExpr.span, condition, thenBranch, elseBranch, ty);
}

/**
 * Lower a match expression
 */
function lowerMatch(
    ctx: LoweringCtx,
    matchExpr: Node,
    typeCtx: TypeContext,
): HMatchExpr {
    const defaultSpan: Span = matchExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const scrutinee = lowerExpr(ctx, matchExpr.scrutinee, typeCtx);

    const arms = (matchExpr.arms || []).map((arm: Node) => {
        ctx.pushScope();

        const pat = lowerPattern(ctx, arm.pat, scrutinee.ty, typeCtx);

        let guard: HExpr | null = null;
        if (arm.guard) {
            guard = lowerExpr(ctx, arm.guard, typeCtx);
        }

        const body =
            arm.body.kind === NodeKind.BlockExpr
                ? lowerBlock(ctx, arm.body, typeCtx)
                : (() => {
                      const expr = lowerExpr(ctx, arm.body, typeCtx);
                      return makeHBlock(arm.body.span, [], expr, expr.ty);
                  })();

        ctx.popScope();

        return makeHMatchArm(arm.span, pat, guard, body);
    });

    // Determine result type from first arm
    let ty = makeUnitType(defaultSpan);
    if (arms.length > 0 && arms[0].body) {
        ty = arms[0].body.ty;
    }

    return makeHMatchExpr(matchExpr.span, scrutinee, arms, ty);
}

/**
 * Lower a loop expression
 */
function lowerLoop(
    ctx: LoweringCtx,
    loopExpr: Node,
    typeCtx: TypeContext,
): HLoopExpr {
    ctx.pushScope();
    const body = lowerBlock(ctx, loopExpr.body, typeCtx);
    ctx.popScope();

    // Loop can return different types via break, but typically returns unit
    const ty = { kind: TypeKind.Never, span: loopExpr.span };

    return makeHLoopExpr(loopExpr.span, loopExpr.label, body, ty);
}

/**
 * Lower a while expression
 */
function lowerWhile(
    ctx: LoweringCtx,
    whileExpr: Node,
    typeCtx: TypeContext,
): HWhileExpr {
    const defaultSpan: Span = whileExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    const condition = lowerExpr(ctx, whileExpr.condition, typeCtx);

    ctx.pushScope();
    const body = lowerBlock(ctx, whileExpr.body, typeCtx);
    ctx.popScope();

    // While always returns unit
    const ty = makeUnitType(defaultSpan);

    return makeHWhileExpr(whileExpr.span, whileExpr.label, condition, body, ty);
}

/**
 * Lower a for expression (desugar to while loop)
 */
function lowerFor(
    ctx: LoweringCtx,
    forExpr: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = forExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
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
    ctx.defineVar(iterVarName, iter.ty, true);

    // Lower body
    const body = lowerBlock(ctx, forExpr.body, typeCtx);

    ctx.popScope();

    // For now, return a while-like construct
    // In a full implementation, we'd create the desugared form
    const ty = makeUnitType(defaultSpan);

    // Return a placeholder - actual desugaring would be more complex
    return makeHWhileExpr(forExpr.span, forExpr.label, iter, body, ty);
}

/**
 * Lower a return expression
 */
function lowerReturn(
    _ctx: LoweringCtx,
    returnExpr: Node,
    _typeCtx: TypeContext,
): HUnitExpr {
    // Return is a statement in HIR
    // For now, return unit
    return makeHUnitExpr(returnExpr.span, {
        kind: TypeKind.Never,
        span: returnExpr.span,
    });
}

/**
 * Lower a break expression
 */
function lowerBreak(
    _ctx: LoweringCtx,
    breakExpr: Node,
    _typeCtx: TypeContext,
): HUnitExpr {
    return makeHUnitExpr(breakExpr.span, {
        kind: TypeKind.Never,
        span: breakExpr.span,
    });
}

/**
 * Lower a continue expression
 */
function lowerContinue(
    _ctx: LoweringCtx,
    continueExpr: Node,
    _typeCtx: TypeContext,
): HUnitExpr {
    return makeHUnitExpr(continueExpr.span, {
        kind: TypeKind.Never,
        span: continueExpr.span,
    });
}

/**
 * Lower a path expression
 */
function lowerPath(
    ctx: LoweringCtx,
    pathExpr: Node,
    typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = pathExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    if (!pathExpr.segments || pathExpr.segments.length === 0) {
        ctx.addError("Empty path expression", pathExpr.span);
        return makeHUnitExpr(pathExpr.span, makeUnitType(defaultSpan));
    }

    // Handle "()" as unit type for tuple expressions
    if (pathExpr.segments.length === 1 && pathExpr.segments[0] === "()") {
        return makeHUnitExpr(pathExpr.span, makeUnitType(defaultSpan));
    }

    if (pathExpr.resolvedItemName) {
        const syntheticIdent: Node = {
            name: pathExpr.segments[pathExpr.segments.length - 1] || "",
            resolvedItemName: pathExpr.resolvedItemName,
            span: pathExpr.span,
            kind: NodeKind.IdentifierExpr,
        };
        return lowerIdentifier(
            ctx,
            syntheticIdent,
            typeCtx,
        );
    }

    // Simple identifier
    if (pathExpr.segments.length === 1) {
        const syntheticIdent: Node = {
            name: pathExpr.segments[0],
            resolvedItemName: pathExpr.resolvedItemName || null,
            span: pathExpr.span,
            kind: NodeKind.IdentifierExpr,
        };
        return lowerIdentifier(
            ctx,
            syntheticIdent,
            typeCtx,
        );
    }

    // Qualified path - could be enum variant
    if (pathExpr.segments.length === 2) {
        const itemName = pathExpr.segments[0];
        const variantName = pathExpr.segments[1];

        const item = ctx.lookupItem(itemName);
        const methodDecl = typeCtx.lookupMethod(itemName, variantName) as {
            type?: Type;
            symbolName?: string;
        } | null;
        if (methodDecl && methodDecl.type?.kind === TypeKind.Fn) {
            return makeHVarExpr(
                pathExpr.span,
                methodDecl.symbolName || variantName,
                -1,
                methodDecl.type,
            );
        }
        if (item && item.kind === "enum") {
            // Enum variant
            const enumNode = item.node as {
                variants?: { name: string; fields?: { ty?: Node }[] }[];
            };
            const enumTy = {
                kind: TypeKind.Enum,
                name: itemName,
                variants: (enumNode.variants || []).map(
                    (variant: { name: string; fields?: { ty?: Node }[] }) => ({
                        name: variant.name,
                        fields: (variant.fields || []).map(
                            (field: { ty?: Node }) => {
                                if (!field?.ty)
                                    return makeUnitType(defaultSpan);
                                const resolved = resolveTypeFromAst(
                                    field.ty,
                                    typeCtx,
                                );
                                return resolved.ok
                                    ? resolved.type
                                    : makeUnitType(defaultSpan);
                            },
                        ),
                    }),
                ),
                span: defaultSpan,
            };
            const variantIndex = findEnumVariantIndex(
                enumNode,
                variantName,
            );
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
    return makeHUnitExpr(pathExpr.span, makeUnitType(defaultSpan));
}

/**
 * Find the index of an enum variant
 */
function findEnumVariantIndex(
    enumNode: { variants?: { name: string }[] },
    variantName: string,
): number {
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
 */
function lowerRange(
    ctx: LoweringCtx,
    rangeExpr: Node,
    _typeCtx: TypeContext,
): HExpr {
    const defaultSpan: Span = rangeExpr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };
    // For now, ranges are not fully implemented
    // Return a placeholder
    ctx.addError("Range expressions not yet supported", rangeExpr.span);
    return makeHUnitExpr(rangeExpr.span, makeUnitType(defaultSpan));
}

// ============================================================================
// Task 6.7: Pattern Lowering
// ============================================================================

/**
 * Lower an AST pattern to HIR
 */
function lowerPattern(
    ctx: LoweringCtx,
    pat: Node,
    expectedType: Type,
    typeCtx: TypeContext,
): HPat {
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
            lowerPattern(ctx, pat.pat, expectedType, typeCtx);
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
 */
function lowerIdentPat(
    ctx: LoweringCtx,
    pat: Node,
    expectedType: Type,
    typeCtx: TypeContext,
): HIdentPat {
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
 */
function lowerStructPat(
    ctx: LoweringCtx,
    pat: Node,
    expectedType: Type,
    typeCtx: TypeContext,
): HStructPat {
    const defaultSpan: Span = pat.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    // Get struct/enum-variant name from path.
    let structName = "";
    let enumName = "";
    let enumVariantName = "";
    if (pat.path?.kind === NodeKind.IdentifierExpr) {
        structName = pat.path.name;
    } else if (pat.path?.kind === NodeKind.PathExpr && pat.path.segments) {
        if (pat.path.segments.length === 2) {
            enumName = pat.path.segments[0];
            enumVariantName = pat.path.segments[1];
            structName = `${enumName}::${enumVariantName}`;
        } else {
            structName = pat.path.segments[pat.path.segments.length - 1];
        }
    }

    const structItem = enumName ? null : ctx.lookupItem(structName);
    const structNode = structItem?.node as {
        fields?: { name: string; ty?: Node }[];
    } | null;
    const enumItem = enumName ? ctx.lookupItem(enumName) : null;
    const enumNodeTyped =
        enumItem?.kind === "enum"
            ? (enumItem.node as {
                  generics?: string[];
                  variants?: { name: string; fields?: { ty?: Node }[] }[];
              })
            : null;
    const enumVariant = enumNodeTyped
        ? ((enumNodeTyped.variants || []).find(
              (variant: { name: string }) => variant.name === enumVariantName,
          ) as { name: string; fields?: { ty?: Node }[] } | null)
        : null;
    const enumGenericParams: string[] = (enumNodeTyped?.generics || [])
        .map((name: string) => name || "")
        .filter((name: string) => name.length > 0);
    const enumGenericSet = new Set<string>(enumGenericParams);
    const enumBindings = new Map<string, Type>();
    if (
        enumName &&
        expectedType?.kind === TypeKind.Named &&
        expectedType.name === enumName &&
        expectedType.args
    ) {
        const count = Math.min(
            enumGenericParams.length,
            expectedType.args.length,
        );
        for (let i = 0; i < count; i++) {
            enumBindings.set(enumGenericParams[i], expectedType.args[i]);
        }
    }
    const expectedEnumVariant =
        enumName &&
        expectedType?.kind === TypeKind.Enum &&
        expectedType.name === enumName
            ? (expectedType.variants || []).find(
                  (variant) => variant.name === enumVariantName,
              )
            : null;

    // Lower field patterns
    const fields = (pat.fields || []).map(
        (field: { name: string; pat: Node }) => {
            let fieldType = makeUnitType(defaultSpan);

            if (enumVariant && enumVariant.fields) {
                const tupleFieldIndex = Number.parseInt(field.name, 10);
                if (
                    Number.isInteger(tupleFieldIndex) &&
                    tupleFieldIndex >= 0 &&
                    tupleFieldIndex < (enumVariant.fields as Type[]).length
                ) {
                    if (
                        expectedEnumVariant &&
                        expectedEnumVariant.fields &&
                        tupleFieldIndex < expectedEnumVariant.fields.length
                    ) {
                        fieldType = expectedEnumVariant.fields[tupleFieldIndex];
                    }
                    const tupleField = (enumVariant.fields as { ty?: Node }[])[
                        tupleFieldIndex
                    ];
                    if (
                        tupleField?.ty &&
                        !(
                            expectedEnumVariant &&
                            expectedEnumVariant.fields &&
                            tupleFieldIndex < expectedEnumVariant.fields.length
                        )
                    ) {
                        const typeResult = resolveTypeFromAst(
                            tupleField.ty,
                            typeCtx,
                        );
                        if (typeResult.ok) {
                            fieldType = substituteLoweringGenericType(
                                typeCtx,
                                typeResult.type,
                                enumGenericSet,
                                enumBindings,
                            );
                        }
                    }
                }
            } else if (structNode && structNode.fields) {
                // Find field type from struct definition.
                const fieldDef = structNode.fields.find(
                    (f: { name: string; ty?: Node }) => f.name === field.name,
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
        },
    );

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
 */
function lowerTuplePat(
    ctx: LoweringCtx,
    pat: Node,
    expectedType: Type,
    typeCtx: TypeContext,
): HTuplePat {
    const defaultSpan: Span = pat.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    const elements = (pat.elements || []).map((elem: Node, i: number) => {
        let elemType = makeUnitType(defaultSpan);
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
 */
function lowerOrPat(
    ctx: LoweringCtx,
    pat: Node,
    expectedType: Type,
    typeCtx: TypeContext,
): HOrPat {
    const alternatives = (pat.alternatives || []).map((alt: Node) =>
        lowerPattern(ctx, alt, expectedType, typeCtx),
    );

    return makeHOrPat(pat.span, alternatives, expectedType);
}

// ============================================================================
// Task 6.8: Place Extraction
// ============================================================================

/**
 * Extract a place (assignable location) from an expression
 */
function extractPlace(
    ctx: LoweringCtx,
    expr: Node,
    typeCtx: TypeContext,
): HPlace | null {
    const defaultSpan: Span = expr.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    switch (expr.kind) {
        case NodeKind.IdentifierExpr: {
            const varInfo = ctx.lookupVar(expr.name);
            if (!varInfo) {
                ctx.addError(`Unbound identifier: ${expr.name}`, expr.span);
                return null;
            }
            if (
                varInfo.type &&
                varInfo.type.kind === TypeKind.Ref &&
                varInfo.type.mutable === true
            ) {
                const base = makeHVarPlace(
                    expr.span,
                    varInfo.name,
                    varInfo.id,
                    varInfo.type,
                );
                return makeHDerefPlace(
                    expr.span,
                    base,
                    varInfo.type.inner || makeUnitType(defaultSpan),
                );
            }
            return makeHVarPlace(
                expr.span,
                varInfo.name,
                varInfo.id,
                varInfo.type,
            );
        }

        case NodeKind.FieldExpr: {
            const extractedBase = extractPlace(ctx, expr.receiver, typeCtx);
            if (!extractedBase) return null;

            let base = extractedBase;
            let baseType = base.ty;
            if (
                baseType &&
                (baseType.kind === TypeKind.Ref ||
                    baseType.kind === TypeKind.Ptr)
            ) {
                baseType = baseType.inner || makeUnitType(defaultSpan);
                base = makeHDerefPlace(expr.span, base, baseType);
            }

            const fieldName =
                typeof expr.field === "string" ? expr.field : expr.field.name;
            let index = 0;
            let ty = makeUnitType(defaultSpan);

            if (baseType && baseType.kind === TypeKind.Struct) {
                index = ctx.getFieldIndex(baseType.name, fieldName);
                const fieldDef = baseType.fields?.find(
                    (f: { name: string; type: Type }) => f.name === fieldName,
                );
                if (fieldDef) {
                    ty = fieldDef.type;
                }
            } else if (baseType && baseType.kind === TypeKind.Named) {
                index = ctx.getFieldIndex(baseType.name, fieldName);
                const item = typeCtx.lookupItem(baseType.name);
                if (item && item.kind === "struct") {
                    const structNodeItem = item.node as {
                        fields?: { name: string; ty?: Node }[];
                        generics?: string[];
                    };
                    const structField = structNodeItem.fields?.find(
                        (f: { name: string; ty?: Node }) =>
                            f.name === fieldName,
                    );
                    if (structField?.ty) {
                        const resolvedType = resolveTypeFromAst(
                            structField.ty,
                            typeCtx,
                        );
                        if (resolvedType.ok) {
                            ty = resolvedType.type || makeUnitType(defaultSpan);
                            const genericParams = structNodeItem.generics || [];
                            const receiverArgs = baseType.args || [];
                            if (
                                genericParams.length > 0 &&
                                receiverArgs.length > 0
                            ) {
                                const genericSet = new Set<string>();
                                const bindings = new Map<string, Type>();
                                const count = Math.min(
                                    genericParams.length,
                                    receiverArgs.length,
                                );
                                for (let i = 0; i < count; i++) {
                                    const genericName =
                                        genericParams[i] || null;
                                    if (!genericName) continue;
                                    genericSet.add(genericName);
                                    bindings.set(genericName, receiverArgs[i]);
                                }
                                if (bindings.size > 0) {
                                    ty = substituteLoweringGenericType(
                                        typeCtx,
                                        ty,
                                        genericSet,
                                        bindings,
                                    );
                                }
                            }
                        }
                    }
                }
            }

            return makeHFieldPlace(expr.span, base, fieldName, index, ty);
        }

        case NodeKind.IndexExpr: {
            const base = extractPlace(ctx, expr.receiver, typeCtx);
            if (!base) return null;

            const index = lowerExpr(ctx, expr.index, typeCtx);
            let ty = makeUnitType(defaultSpan);

            if (base.ty && base.ty.kind === TypeKind.Array) {
                ty = base.ty.element;
            } else if (base.ty && base.ty.kind === TypeKind.Slice) {
                ty = base.ty.element;
            } else if (base.ty && base.ty.kind === TypeKind.Ptr) {
                ty = base.ty.inner;
            }

            return makeHIndexPlace(expr.span, base, index, ty);
        }

        case NodeKind.DerefExpr: {
            const base = extractPlace(ctx, expr.operand, typeCtx);
            if (!base) return null;
            if (base.kind === HPlaceKind.Deref) {
                return base;
            }

            let ty = makeUnitType(defaultSpan);
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

type TypeResult = {
    ok: true;
    type: Type;
};

type TypeError = {
    ok: false;
    error?: string;
};

type ResolveTypeResult = TypeResult | TypeError;

/**
 * Resolve an AST type node to a Type
 */
function resolveTypeFromAst(
    typeNode: Node,
    typeCtx: TypeContext,
): ResolveTypeResult {
    const defaultSpan: Span = typeNode?.span || {
        line: 0,
        column: 0,
        start: 0,
        end: 0,
    };

    if (!typeNode) {
        return { ok: false, error: "No type node" };
    }

    switch (typeNode.kind) {
        case NodeKind.NamedType: {
            let args: Type[] | null = null;
            if (typeNode.args && typeNode.args.args) {
                args = [];
                for (const arg of typeNode.args.args) {
                    const argResult = resolveTypeFromAst(arg, typeCtx);
                    if (!argResult.ok) return argResult;
                    args.push(argResult.type);
                }
            }
            // Check for builtin types
            const builtin = resolveBuiltinType(typeNode.name);
            if (builtin) {
                return { ok: true, type: builtin };
            }

            // Check type context for user-defined types
            const item = typeCtx.lookupItem(typeNode.name);
            if (item) {
                if (item.kind === "struct") {
                    if (args && args.length > 0) {
                        return {
                            ok: true,
                            type: {
                                kind: TypeKind.Named,
                                name: typeNode.name,
                                args,
                                span: defaultSpan,
                            },
                        };
                    }
                    return {
                        ok: true,
                        type: {
                            kind: TypeKind.Struct,
                            name: typeNode.name,
                            fields: [],
                            span: defaultSpan,
                        },
                    };
                }
                if (item.kind === "enum") {
                    const enumNodeItem = item.node as {
                        generics?: string[];
                        variants?: { name: string; fields?: { ty?: Node }[] }[];
                    };
                    const genericNames = (enumNodeItem.generics || []).filter(
                        (name: string) => !!name,
                    );
                    const genericSet = new Set<string>(genericNames);
                    const bindings = new Map<string, Type>();
                    if (args && args.length > 0) {
                        const count = Math.min(
                            genericNames.length,
                            args.length,
                        );
                        for (let i = 0; i < count; i++) {
                            bindings.set(genericNames[i], args[i]);
                        }
                    }
                    return {
                        ok: true,
                        type: {
                            kind: TypeKind.Enum,
                            name: typeNode.name,
                            variants: (enumNodeItem.variants || []).map(
                                (variant: {
                                    name: string;
                                    fields?: { ty?: Node }[];
                                }) => ({
                                    name: variant.name,
                                    fields: (variant.fields || []).map(
                                        (field: { ty?: Node }) => {
                                            if (!field?.ty)
                                                return makeUnitType(
                                                    defaultSpan,
                                                );
                                            const fieldType =
                                                resolveTypeFromAst(
                                                    field.ty,
                                                    typeCtx,
                                                );
                                            if (!fieldType.ok)
                                                return makeUnitType(
                                                    defaultSpan,
                                                );
                                            return substituteLoweringGenericType(
                                                typeCtx,
                                                fieldType.type,
                                                genericSet,
                                                bindings,
                                            );
                                        },
                                    ),
                                }),
                            ),
                            span: defaultSpan,
                        },
                    };
                }
            }

            // Return as named type
            return {
                ok: true,
                type: {
                    kind: TypeKind.Named,
                    name: typeNode.name,
                    args,
                    span: defaultSpan,
                },
            };
        }

        case NodeKind.TupleType: {
            const elements: Type[] = [];
            for (const elem of typeNode.elements || []) {
                const result = resolveTypeFromAst(elem, typeCtx);
                if (!result.ok) return result;
                elements.push(result.type);
            }
            return {
                ok: true,
                type: { kind: TypeKind.Tuple, elements, span: defaultSpan },
            };
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
                    span: defaultSpan,
                },
            };
        }

        case NodeKind.RefType: {
            const innerResult = resolveTypeFromAst(typeNode.inner, typeCtx);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            return {
                ok: true,
                type: {
                    kind: TypeKind.Ref,
                    inner: innerResult.type,
                    mutable,
                    span: defaultSpan,
                },
            };
        }

        case NodeKind.PtrType: {
            const innerResult = resolveTypeFromAst(typeNode.inner, typeCtx);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            return {
                ok: true,
                type: {
                    kind: TypeKind.Ptr,
                    inner: innerResult.type,
                    mutable,
                    span: defaultSpan,
                },
            };
        }

        case NodeKind.FnType: {
            const params: Type[] = [];
            for (const param of typeNode.params || []) {
                const result = resolveTypeFromAst(param, typeCtx);
                if (!result.ok) return result;
                params.push(result.type);
            }

            let returnType = makeUnitType(defaultSpan);
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
                    isConst: typeNode.isConst || false,
                    span: defaultSpan,
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
 */
function resolveBuiltinType(name: string): Type | null {
    const defaultSpan: Span = { line: 0, column: 0, start: 0, end: 0 };
    switch (name) {
        case "i8":
            return {
                kind: TypeKind.Int,
                width: IntWidth.I8,
                span: defaultSpan,
            };
        case "i16":
            return {
                kind: TypeKind.Int,
                width: IntWidth.I16,
                span: defaultSpan,
            };
        case "i32":
            return {
                kind: TypeKind.Int,
                width: IntWidth.I32,
                span: defaultSpan,
            };
        case "i64":
            return {
                kind: TypeKind.Int,
                width: IntWidth.I64,
                span: defaultSpan,
            };
        case "i128":
            return {
                kind: TypeKind.Int,
                width: IntWidth.I128,
                span: defaultSpan,
            };
        case "isize":
            return {
                kind: TypeKind.Int,
                width: IntWidth.Isize,
                span: defaultSpan,
            };
        case "u8":
            return {
                kind: TypeKind.Int,
                width: IntWidth.U8,
                span: defaultSpan,
            };
        case "u16":
            return {
                kind: TypeKind.Int,
                width: IntWidth.U16,
                span: defaultSpan,
            };
        case "u32":
            return {
                kind: TypeKind.Int,
                width: IntWidth.U32,
                span: defaultSpan,
            };
        case "u64":
            return {
                kind: TypeKind.Int,
                width: IntWidth.U64,
                span: defaultSpan,
            };
        case "u128":
            return {
                kind: TypeKind.Int,
                width: IntWidth.U128,
                span: defaultSpan,
            };
        case "usize":
            return {
                kind: TypeKind.Int,
                width: IntWidth.Usize,
                span: defaultSpan,
            };
        case "f32":
            return {
                kind: TypeKind.Float,
                width: FloatWidth.F32,
                span: defaultSpan,
            };
        case "f64":
            return {
                kind: TypeKind.Float,
                width: FloatWidth.F64,
                span: defaultSpan,
            };
        case "bool":
            return { kind: TypeKind.Bool, span: defaultSpan };
        case "char":
            return { kind: TypeKind.Char, span: defaultSpan };
        case "str":
            return { kind: TypeKind.String, span: defaultSpan };
        case "()":
            return { kind: TypeKind.Unit, span: defaultSpan };
        case "!":
            return { kind: TypeKind.Never, span: defaultSpan };
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
