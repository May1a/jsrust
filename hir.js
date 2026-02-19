/** @typedef {number} HNodeKindValue */
/** @typedef {number} HPlaceKindValue */
/** @typedef {number} HExprKindValue */
/** @typedef {number} HStmtKindValue */
/** @typedef {number} HPatKindValue */
/** @typedef {number} HItemKindValue */
/** @typedef {number} HLiteralKindValue */

/** @typedef {{ line: number, column: number, start: number, end: number }} Span */
/** @typedef {import('./types.js').Type} Type */

// ============================================================================
// HIR Node Kinds
// ============================================================================

const HItemKind = {
    Fn: 0,
    Struct: 1,
    Enum: 2,
};

const HStmtKind = {
    Let: 0,
    Assign: 1,
    Expr: 2,
    Return: 3,
    Break: 4,
    Continue: 5,
};

const HPlaceKind = {
    Var: 0,
    Field: 1,
    Index: 2,
    Deref: 3,
};

const HExprKind = {
    Unit: 0,
    Literal: 1,
    Var: 2,
    Binary: 3,
    Unary: 4,
    Call: 5,
    Field: 6,
    Index: 7,
    Ref: 8,
    Deref: 9,
    Struct: 10,
    Enum: 11,
    If: 12,
    Match: 13,
    Loop: 14,
    While: 15,
};

const HPatKind = {
    Ident: 0,
    Wildcard: 1,
    Literal: 2,
    Struct: 3,
    Tuple: 4,
    Or: 5,
};

const HLiteralKind = {
    Int: 0,
    Float: 1,
    Bool: 2,
    String: 3,
    Char: 4,
};

// ============================================================================
// Task 5.1: HIR Module Structure
// ============================================================================

/**
 * @typedef {HFnDecl | HStructDecl | HEnumDecl} HItem
 */

/**
 * @typedef {{ kind: HItemKindValue, span: Span }} HItemBase
 */

/**
 * @typedef {HItemBase & { name: string, items: HItem[] }} HModule
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {HItem[]} items
 * @returns {HModule}
 */
function makeHModule(span, name, items) {
    return { kind: HItemKind.Fn, span, name, items };
}

// ============================================================================
// Task 5.2: HIR Items
// ============================================================================

/**
 * @typedef {HItemBase & {
 *   name: string,
 *   generics: string[] | null,
 *   params: HParam[],
 *   returnType: Type,
 *   body: HBlock | null,
 *   isAsync: boolean,
 *   isUnsafe: boolean
 * }} HFnDecl
 */

/**
 * @typedef {{ name: string | null, ty: Type, pat: HPat | null, span: Span }} HParam
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {string[] | null} generics
 * @param {HParam[]} params
 * @param {Type} returnType
 * @param {HBlock | null} body
 * @param {boolean} isAsync
 * @param {boolean} isUnsafe
 * @returns {HFnDecl}
 */
function makeHFnDecl(
    span,
    name,
    generics,
    params,
    returnType,
    body,
    isAsync,
    isUnsafe,
) {
    return {
        kind: HItemKind.Fn,
        span,
        name,
        generics,
        params,
        returnType,
        body,
        isAsync,
        isUnsafe,
    };
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Type} ty
 * @param {HPat | null} pat
 * @returns {HParam}
 */
function makeHParam(span, name, ty, pat) {
    return { name, ty, pat, span };
}

/**
 * @typedef {HItemBase & {
 *   name: string,
 *   generics: string[] | null,
 *   fields: HStructField[],
 *   isTuple: boolean
 * }} HStructDecl
 */

/**
 * @typedef {{ name: string, ty: Type, defaultValue: HExpr | null, span: Span }} HStructField
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {string[] | null} generics
 * @param {HStructField[]} fields
 * @param {boolean} isTuple
 * @returns {HStructDecl}
 */
function makeHStructDecl(span, name, generics, fields, isTuple) {
    return { kind: HItemKind.Struct, span, name, generics, fields, isTuple };
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Type} ty
 * @param {HExpr | null} defaultValue
 * @returns {HStructField}
 */
function makeHStructField(span, name, ty, defaultValue) {
    return { name, ty, defaultValue, span };
}

/**
 * @typedef {HItemBase & {
 *   name: string,
 *   generics: string[] | null,
 *   variants: HEnumVariant[]
 * }} HEnumDecl
 */

/**
 * @typedef {{ name: string, fields: Type[], discriminant: number | null, span: Span }} HEnumVariant
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {string[] | null} generics
 * @param {HEnumVariant[]} variants
 * @returns {HEnumDecl}
 */
function makeHEnumDecl(span, name, generics, variants) {
    return { kind: HItemKind.Enum, span, name, generics, variants };
}

/**
 * @param {Span} span
 * @param {string} name
 * @param {Type[]} fields
 * @param {number | null} discriminant
 * @returns {HEnumVariant}
 */
function makeHEnumVariant(span, name, fields, discriminant) {
    return { name, fields, discriminant, span };
}

// ============================================================================
// Task 5.3: HIR Blocks
// ============================================================================

/**
 * @typedef {{ stmts: HStmt[], expr: HExpr | null, span: Span, ty: Type }} HBlock
 */

/**
 * @param {Span} span
 * @param {HStmt[]} stmts
 * @param {HExpr | null} expr
 * @param {Type} ty
 * @returns {HBlock}
 */
function makeHBlock(span, stmts, expr, ty) {
    return { stmts, expr, span, ty };
}

// ============================================================================
// Task 5.4: HIR Statements
// ============================================================================

/**
 * @typedef {HLetStmt | HAssignStmt | HExprStmt | HReturnStmt | HBreakStmt | HContinueStmt} HStmt
 */

/**
 * @typedef {{ kind: HStmtKindValue, span: Span }} HStmtBase
 */

/**
 * @typedef {HStmtBase & {
 *   pat: HPat,
 *   ty: Type,
 *   init: HExpr | null
 * }} HLetStmt
 */

/**
 * @param {Span} span
 * @param {HPat} pat
 * @param {Type} ty
 * @param {HExpr | null} init
 * @returns {HLetStmt}
 */
function makeHLetStmt(span, pat, ty, init) {
    return { kind: HStmtKind.Let, span, pat, ty, init };
}

/**
 * @typedef {HStmtBase & {
 *   place: HPlace,
 *   value: HExpr
 * }} HAssignStmt
 */

/**
 * @param {Span} span
 * @param {HPlace} place
 * @param {HExpr} value
 * @returns {HAssignStmt}
 */
function makeHAssignStmt(span, place, value) {
    return { kind: HStmtKind.Assign, span, place, value };
}

/**
 * @typedef {HStmtBase & { expr: HExpr }} HExprStmt
 */

/**
 * @param {Span} span
 * @param {HExpr} expr
 * @returns {HExprStmt}
 */
function makeHExprStmt(span, expr) {
    return { kind: HStmtKind.Expr, span, expr };
}

/**
 * @typedef {HStmtBase & { value: HExpr | null }} HReturnStmt
 */

/**
 * @param {Span} span
 * @param {HExpr | null} value
 * @returns {HReturnStmt}
 */
function makeHReturnStmt(span, value) {
    return { kind: HStmtKind.Return, span, value };
}

/**
 * @typedef {HStmtBase & { value: HExpr | null, label: string | null }} HBreakStmt
 */

/**
 * @param {Span} span
 * @param {HExpr | null} value
 * @param {string | null} label
 * @returns {HBreakStmt}
 */
function makeHBreakStmt(span, value, label) {
    return { kind: HStmtKind.Break, span, value, label };
}

/**
 * @typedef {HStmtBase & { label: string | null }} HContinueStmt
 */

/**
 * @param {Span} span
 * @param {string | null} label
 * @returns {HContinueStmt}
 */
function makeHContinueStmt(span, label) {
    return { kind: HStmtKind.Continue, span, label };
}

// ============================================================================
// Task 5.5: HIR Places (assignable locations)
// ============================================================================

/**
 * @typedef {HVarPlace | HFieldPlace | HIndexPlace | HDerefPlace} HPlace
 */

/**
 * @typedef {{ kind: HPlaceKindValue, ty: Type, span: Span }} HPlaceBase
 */

/**
 * @typedef {HPlaceBase & { name: string, id: number }} HVarPlace
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {number} id
 * @param {Type} ty
 * @returns {HVarPlace}
 */
function makeHVarPlace(span, name, id, ty) {
    return { kind: HPlaceKind.Var, span, name, id, ty };
}

/**
 * @typedef {HPlaceBase & { base: HPlace, field: string, index: number }} HFieldPlace
 */

/**
 * @param {Span} span
 * @param {HPlace} base
 * @param {string} field
 * @param {number} index
 * @param {Type} ty
 * @returns {HFieldPlace}
 */
function makeHFieldPlace(span, base, field, index, ty) {
    return { kind: HPlaceKind.Field, span, base, field, index, ty };
}

/**
 * @typedef {HPlaceBase & { base: HPlace, index: HExpr }} HIndexPlace
 */

/**
 * @param {Span} span
 * @param {HPlace} base
 * @param {HExpr} index
 * @param {Type} ty
 * @returns {HIndexPlace}
 */
function makeHIndexPlace(span, base, index, ty) {
    return { kind: HPlaceKind.Index, span, base, index, ty };
}

/**
 * @typedef {HPlaceBase & { base: HPlace }} HDerefPlace
 */

/**
 * @param {Span} span
 * @param {HPlace} base
 * @param {Type} ty
 * @returns {HDerefPlace}
 */
function makeHDerefPlace(span, base, ty) {
    return { kind: HPlaceKind.Deref, span, base, ty };
}

// ============================================================================
// Task 5.6: HIR Expressions
// ============================================================================

/**
 * @typedef {HUnitExpr | HLiteralExpr | HVarExpr | HBinaryExpr | HUnaryExpr | HCallExpr |
 *   HFieldExpr | HIndexExpr | HRefExpr | HDerefExpr | HStructExpr | HEnumExpr |
 *   HIfExpr | HMatchExpr | HLoopExpr | HWhileExpr} HExpr
 */

/**
 * @typedef {{ kind: HExprKindValue, ty: Type, span: Span }} HExprBase
 */

/**
 * @typedef {HExprBase & {}} HUnitExpr
 */

/**
 * @param {Span} span
 * @param {Type} ty
 * @returns {HUnitExpr}
 */
function makeHUnitExpr(span, ty) {
    return { kind: HExprKind.Unit, span, ty };
}

/**
 * @typedef {HExprBase & { literalKind: HLiteralKindValue, value: string | number | boolean }} HLiteralExpr
 */

/**
 * @param {Span} span
 * @param {HLiteralKindValue} literalKind
 * @param {string | number | boolean} value
 * @param {Type} ty
 * @returns {HLiteralExpr}
 */
function makeHLiteralExpr(span, literalKind, value, ty) {
    return { kind: HExprKind.Literal, span, literalKind, value, ty };
}

/**
 * @typedef {HExprBase & { name: string, id: number }} HVarExpr
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {number} id
 * @param {Type} ty
 * @returns {HVarExpr}
 */
function makeHVarExpr(span, name, id, ty) {
    return { kind: HExprKind.Var, span, name, id, ty };
}

/**
 * @typedef {HExprBase & { op: number, left: HExpr, right: HExpr }} HBinaryExpr
 */

/**
 * @param {Span} span
 * @param {number} op
 * @param {HExpr} left
 * @param {HExpr} right
 * @param {Type} ty
 * @returns {HBinaryExpr}
 */
function makeHBinaryExpr(span, op, left, right, ty) {
    return { kind: HExprKind.Binary, span, op, left, right, ty };
}

/**
 * @typedef {HExprBase & { op: number, operand: HExpr }} HUnaryExpr
 */

/**
 * @param {Span} span
 * @param {number} op
 * @param {HExpr} operand
 * @param {Type} ty
 * @returns {HUnaryExpr}
 */
function makeHUnaryExpr(span, op, operand, ty) {
    return { kind: HExprKind.Unary, span, op, operand, ty };
}

/**
 * @typedef {HExprBase & { callee: HExpr, args: HExpr[] }} HCallExpr
 */

/**
 * @param {Span} span
 * @param {HExpr} callee
 * @param {HExpr[]} args
 * @param {Type} ty
 * @returns {HCallExpr}
 */
function makeHCallExpr(span, callee, args, ty) {
    return { kind: HExprKind.Call, span, callee, args, ty };
}

/**
 * @typedef {HExprBase & { base: HExpr, field: string, index: number }} HFieldExpr
 */

/**
 * @param {Span} span
 * @param {HExpr} base
 * @param {string} field
 * @param {number} index
 * @param {Type} ty
 * @returns {HFieldExpr}
 */
function makeHFieldExpr(span, base, field, index, ty) {
    return { kind: HExprKind.Field, span, base, field, index, ty };
}

/**
 * @typedef {HExprBase & { base: HExpr, index: HExpr }} HIndexExpr
 */

/**
 * @param {Span} span
 * @param {HExpr} base
 * @param {HExpr} index
 * @param {Type} ty
 * @returns {HIndexExpr}
 */
function makeHIndexExpr(span, base, index, ty) {
    return { kind: HExprKind.Index, span, base, index, ty };
}

/**
 * @typedef {HExprBase & { mutable: boolean, operand: HExpr }} HRefExpr
 */

/**
 * @param {Span} span
 * @param {boolean} mutable
 * @param {HExpr} operand
 * @param {Type} ty
 * @returns {HRefExpr}
 */
function makeHRefExpr(span, mutable, operand, ty) {
    return { kind: HExprKind.Ref, span, mutable, operand, ty };
}

/**
 * @typedef {HExprBase & { operand: HExpr }} HDerefExpr
 */

/**
 * @param {Span} span
 * @param {HExpr} operand
 * @param {Type} ty
 * @returns {HDerefExpr}
 */
function makeHDerefExpr(span, operand, ty) {
    return { kind: HExprKind.Deref, span, operand, ty };
}

/**
 * @typedef {HExprBase & {
 *   name: string,
 *   fields: { name: string, value: HExpr }[],
 *   spread: HExpr | null
 * }} HStructExpr
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {{ name: string, value: HExpr }[]} fields
 * @param {HExpr | null} spread
 * @param {Type} ty
 * @returns {HStructExpr}
 */
function makeHStructExpr(span, name, fields, spread, ty) {
    return { kind: HExprKind.Struct, span, name, fields, spread, ty };
}

/**
 * @typedef {HExprBase & {
 *   enumName: string,
 *   variantName: string,
 *   variantIndex: number,
 *   fields: HExpr[]
 * }} HEnumExpr
 */

/**
 * @param {Span} span
 * @param {string} enumName
 * @param {string} variantName
 * @param {number} variantIndex
 * @param {HExpr[]} fields
 * @param {Type} ty
 * @returns {HEnumExpr}
 */
function makeHEnumExpr(span, enumName, variantName, variantIndex, fields, ty) {
    return {
        kind: HExprKind.Enum,
        span,
        enumName,
        variantName,
        variantIndex,
        fields,
        ty,
    };
}

// ============================================================================
// Task 5.7: HIR Control Flow
// ============================================================================

/**
 * @typedef {HExprBase & { condition: HExpr, thenBranch: HBlock, elseBranch: HBlock | null }} HIfExpr
 */

/**
 * @param {Span} span
 * @param {HExpr} condition
 * @param {HBlock} thenBranch
 * @param {HBlock | null} elseBranch
 * @param {Type} ty
 * @returns {HIfExpr}
 */
function makeHIfExpr(span, condition, thenBranch, elseBranch, ty) {
    return { kind: HExprKind.If, span, condition, thenBranch, elseBranch, ty };
}

/**
 * @typedef {HExprBase & { scrutinee: HExpr, arms: HMatchArm[] }} HMatchExpr
 */

/**
 * @param {Span} span
 * @param {HExpr} scrutinee
 * @param {HMatchArm[]} arms
 * @param {Type} ty
 * @returns {HMatchExpr}
 */
function makeHMatchExpr(span, scrutinee, arms, ty) {
    return { kind: HExprKind.Match, span, scrutinee, arms, ty };
}

/**
 * @typedef {HExprBase & { label: string | null, body: HBlock }} HLoopExpr
 */

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {HBlock} body
 * @param {Type} ty
 * @returns {HLoopExpr}
 */
function makeHLoopExpr(span, label, body, ty) {
    return { kind: HExprKind.Loop, span, label, body, ty };
}

/**
 * @typedef {HExprBase & { label: string | null, condition: HExpr, body: HBlock }} HWhileExpr
 */

/**
 * @param {Span} span
 * @param {string | null} label
 * @param {HExpr} condition
 * @param {HBlock} body
 * @param {Type} ty
 * @returns {HWhileExpr}
 */
function makeHWhileExpr(span, label, condition, body, ty) {
    return { kind: HExprKind.While, span, label, condition, body, ty };
}

// ============================================================================
// Task 5.8: HIR Patterns
// ============================================================================

/**
 * @typedef {HIdentPat | HWildcardPat | HLiteralPat | HStructPat | HTuplePat | HOrPat} HPat
 */

/**
 * @typedef {{ kind: HPatKindValue, ty: Type, span: Span }} HPatBase
 */

/**
 * @typedef {HPatBase & { name: string, id: number, mutable: boolean, isRef: boolean }} HIdentPat
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {number} id
 * @param {Type} ty
 * @param {boolean} mutable
 * @param {boolean} isRef
 * @returns {HIdentPat}
 */
function makeHIdentPat(span, name, id, ty, mutable, isRef) {
    return { kind: HPatKind.Ident, span, name, id, ty, mutable, isRef };
}

/**
 * @typedef {HPatBase & {}} HWildcardPat
 */

/**
 * @param {Span} span
 * @param {Type} ty
 * @returns {HWildcardPat}
 */
function makeHWildcardPat(span, ty) {
    return { kind: HPatKind.Wildcard, span, ty };
}

/**
 * @typedef {HPatBase & { literalKind: HLiteralKindValue, value: string | number | boolean }} HLiteralPat
 */

/**
 * @param {Span} span
 * @param {HLiteralKindValue} literalKind
 * @param {string | number | boolean} value
 * @param {Type} ty
 * @returns {HLiteralPat}
 */
function makeHLiteralPat(span, literalKind, value, ty) {
    return { kind: HPatKind.Literal, span, literalKind, value, ty };
}

/**
 * @typedef {HPatBase & {
 *   name: string,
 *   fields: { name: string, pat: HPat }[],
 *   rest: boolean
 * }} HStructPat
 */

/**
 * @param {Span} span
 * @param {string} name
 * @param {{ name: string, pat: HPat }[]} fields
 * @param {boolean} rest
 * @param {Type} ty
 * @returns {HStructPat}
 */
function makeHStructPat(span, name, fields, rest, ty) {
    return { kind: HPatKind.Struct, span, name, fields, rest, ty };
}

/**
 * @typedef {HPatBase & { elements: HPat[] }} HTuplePat
 */

/**
 * @param {Span} span
 * @param {HPat[]} elements
 * @param {Type} ty
 * @returns {HTuplePat}
 */
function makeHTuplePat(span, elements, ty) {
    return { kind: HPatKind.Tuple, span, elements, ty };
}

/**
 * @typedef {HPatBase & { alternatives: HPat[] }} HOrPat
 */

/**
 * @param {Span} span
 * @param {HPat[]} alternatives
 * @param {Type} ty
 * @returns {HOrPat}
 */
function makeHOrPat(span, alternatives, ty) {
    return { kind: HPatKind.Or, span, alternatives, ty };
}

// ============================================================================
// Task 5.9: HIR Match Arms
// ============================================================================

/**
 * @typedef {{ pat: HPat, guard: HExpr | null, body: HBlock, span: Span }} HMatchArm
 */

/**
 * @param {Span} span
 * @param {HPat} pat
 * @param {HExpr | null} guard
 * @param {HBlock} body
 * @returns {HMatchArm}
 */
function makeHMatchArm(span, pat, guard, body) {
    return { pat, guard, body, span };
}

// ============================================================================
// Task 5.10: HIR Utilities
// ============================================================================

/**
 * Convert HIR node to human-readable string (for debugging)
 * @param {HModule | HItem | HBlock | HStmt | HExpr | HPlace | HPat | HMatchArm} hir
 * @returns {string}
 */
function hirToString(hir) {
    if ("items" in hir) {
        // HModule
        return `module ${hir.name} {\n${hir.items.map((i) => "  " + hirToString(i)).join("\n")}\n}`;
    }

    if ("kind" in hir) {
        // Check for item kinds
        if (hir.kind === HItemKind.Fn) {
            const fn = /** @type {HFnDecl} */ (hir);
            const params = fn.params
                .map((p) => `${p.name}: ${typeToString(p.ty)}`)
                .join(", ");
            const body = fn.body ? hirToString(fn.body) : ";";
            return `fn ${fn.name}(${params}) -> ${typeToString(fn.returnType)} ${body}`;
        }

        if (hir.kind === HItemKind.Struct) {
            const struct = /** @type {HStructDecl} */ (hir);
            const fields = struct.fields
                .map((f) => `${f.name}: ${typeToString(f.ty)}`)
                .join(", ");
            return `struct ${struct.name} { ${fields} }`;
        }

        if (hir.kind === HItemKind.Enum) {
            const enum_ = /** @type {HEnumDecl} */ (hir);
            const variants = enum_.variants.map((v) => v.name).join(", ");
            return `enum ${enum_.name} { ${variants} }`;
        }

        // Check for statement kinds
        if (hir.kind === HStmtKind.Let) {
            const stmt = /** @type {HLetStmt} */ (hir);
            const init = stmt.init ? ` = ${hirToString(stmt.init)}` : "";
            return `let ${hirToString(stmt.pat)}: ${typeToString(stmt.ty)}${init};`;
        }

        if (hir.kind === HStmtKind.Assign) {
            const stmt = /** @type {HAssignStmt} */ (hir);
            return `${hirToString(stmt.place)} = ${hirToString(stmt.value)};`;
        }

        if (hir.kind === HStmtKind.Expr) {
            const stmt = /** @type {HExprStmt} */ (hir);
            return `${hirToString(stmt.expr)};`;
        }

        if (hir.kind === HStmtKind.Return) {
            const stmt = /** @type {HReturnStmt} */ (hir);
            return stmt.value
                ? `return ${hirToString(stmt.value)};`
                : "return;";
        }

        if (hir.kind === HStmtKind.Break) {
            const stmt = /** @type {HBreakStmt} */ (hir);
            return stmt.value ? `break ${hirToString(stmt.value)};` : "break;";
        }

        if (hir.kind === HStmtKind.Continue) {
            return "continue;";
        }

        // Check for place kinds
        if (hir.kind === HPlaceKind.Var) {
            const place = /** @type {HVarPlace} */ (hir);
            return place.name;
        }

        if (hir.kind === HPlaceKind.Field) {
            const place = /** @type {HFieldPlace} */ (hir);
            return `${hirToString(place.base)}.${place.field}`;
        }

        if (hir.kind === HPlaceKind.Index) {
            const place = /** @type {HIndexPlace} */ (hir);
            return `${hirToString(place.base)}[${hirToString(place.index)}]`;
        }

        if (hir.kind === HPlaceKind.Deref) {
            const place = /** @type {HDerefPlace} */ (hir);
            return `*${hirToString(place.base)}`;
        }

        // Check for expression kinds
        if (hir.kind === HExprKind.Unit) {
            return "()";
        }

        if (hir.kind === HExprKind.Literal) {
            const expr = /** @type {HLiteralExpr} */ (hir);
            return String(expr.value);
        }

        if (hir.kind === HExprKind.Var) {
            const expr = /** @type {HVarExpr} */ (hir);
            return expr.name;
        }

        if (hir.kind === HExprKind.Binary) {
            const expr = /** @type {HBinaryExpr} */ (hir);
            return `(${hirToString(expr.left)} ${binaryOpToString(expr.op)} ${hirToString(expr.right)})`;
        }

        if (hir.kind === HExprKind.Unary) {
            const expr = /** @type {HUnaryExpr} */ (hir);
            return `${unaryOpToString(expr.op)}${hirToString(expr.operand)}`;
        }

        if (hir.kind === HExprKind.Call) {
            const expr = /** @type {HCallExpr} */ (hir);
            const args = expr.args.map(hirToString).join(", ");
            return `${hirToString(expr.callee)}(${args})`;
        }

        if (hir.kind === HExprKind.Field) {
            const expr = /** @type {HFieldExpr} */ (hir);
            return `${hirToString(expr.base)}.${expr.field}`;
        }

        if (hir.kind === HExprKind.Index) {
            const expr = /** @type {HIndexExpr} */ (hir);
            return `${hirToString(expr.base)}[${hirToString(expr.index)}]`;
        }

        if (hir.kind === HExprKind.Ref) {
            const expr = /** @type {HRefExpr} */ (hir);
            return `&${expr.mutable ? "mut " : ""}${hirToString(expr.operand)}`;
        }

        if (hir.kind === HExprKind.Deref) {
            const expr = /** @type {HDerefExpr} */ (hir);
            return `*${hirToString(expr.operand)}`;
        }

        if (hir.kind === HExprKind.Struct) {
            const expr = /** @type {HStructExpr} */ (hir);
            const fields = expr.fields
                .map((f) => `${f.name}: ${hirToString(f.value)}`)
                .join(", ");
            return `${expr.name} { ${fields} }`;
        }

        if (hir.kind === HExprKind.Enum) {
            const expr = /** @type {HEnumExpr} */ (hir);
            const fields = expr.fields.map(hirToString).join(", ");
            return `${expr.enumName}::${expr.variantName}(${fields})`;
        }

        if (hir.kind === HExprKind.If) {
            const expr = /** @type {HIfExpr} */ (hir);
            const else_ = expr.elseBranch
                ? ` else ${hirToString(expr.elseBranch)}`
                : "";
            return `if ${hirToString(expr.condition)} ${hirToString(expr.thenBranch)}${else_}`;
        }

        if (hir.kind === HExprKind.Match) {
            const expr = /** @type {HMatchExpr} */ (hir);
            const arms = expr.arms
                .map((a) => `  ${hirToString(a.pat)} => ${hirToString(a.body)}`)
                .join(",\n");
            return `match ${hirToString(expr.scrutinee)} {\n${arms}\n}`;
        }

        if (hir.kind === HExprKind.Loop) {
            const expr = /** @type {HLoopExpr} */ (hir);
            return `loop ${hirToString(expr.body)}`;
        }

        if (hir.kind === HExprKind.While) {
            const expr = /** @type {HWhileExpr} */ (hir);
            return `while ${hirToString(expr.condition)} ${hirToString(expr.body)}`;
        }

        // Check for pattern kinds
        if (hir.kind === HPatKind.Ident) {
            const pat = /** @type {HIdentPat} */ (hir);
            return pat.name;
        }

        if (hir.kind === HPatKind.Wildcard) {
            return "_";
        }

        if (hir.kind === HPatKind.Literal) {
            const pat = /** @type {HLiteralPat} */ (hir);
            return String(pat.value);
        }

        if (hir.kind === HPatKind.Struct) {
            const pat = /** @type {HStructPat} */ (hir);
            const fields = pat.fields
                .map((f) => `${f.name}: ${hirToString(f.pat)}`)
                .join(", ");
            return `${pat.name} { ${fields}${pat.rest ? " .." : ""} }`;
        }

        if (hir.kind === HPatKind.Tuple) {
            const pat = /** @type {HTuplePat} */ (hir);
            return `(${pat.elements.map(hirToString).join(", ")})`;
        }

        if (hir.kind === HPatKind.Or) {
            const pat = /** @type {HOrPat} */ (hir);
            return pat.alternatives.map(hirToString).join(" | ");
        }
    }

    // Check for block
    if ("stmts" in hir && "ty" in hir) {
        const block = /** @type {HBlock} */ (hir);
        const stmts = block.stmts.map((s) => "  " + hirToString(s)).join("\n");
        const expr = block.expr ? "\n  " + hirToString(block.expr) : "";
        return `{\n${stmts}${expr}\n}`;
    }

    // Check for match arm
    if ("pat" in hir && "body" in hir) {
        const arm = /** @type {HMatchArm} */ (hir);
        const guard = arm.guard ? ` if ${hirToString(arm.guard)}` : "";
        return `${hirToString(arm.pat)}${guard} => ${hirToString(arm.body)}`;
    }

    return "<unknown>";
}

/**
 * @param {number} op
 * @returns {string}
 */
function binaryOpToString(op) {
    const ops = [
        "+",
        "-",
        "*",
        "/",
        "%",
        "==",
        "!=",
        "<",
        "<=",
        ">",
        ">=",
        "&&",
        "||",
        "^",
        "&",
        "|",
        "<<",
        ">>",
    ];
    return ops[op] ?? "?";
}

/**
 * @param {number} op
 * @returns {string}
 */
function unaryOpToString(op) {
    const ops = ["!", "-", "*", "&"];
    return ops[op] ?? "?";
}

/**
 * Collect all variable IDs used in an HIR node
 * @param {HModule | HItem | HBlock | HStmt | HExpr | HPlace | HPat | HMatchArm} hir
 * @returns {Set<number>}
 */
function collectVars(hir) {
    const vars = new Set();

    /**
     * @param {any} node
     */
    function visit(node) {
        if (!node || typeof node !== "object") return;

        // Variable place
        if (node.kind === HPlaceKind.Var && typeof node.id === "number") {
            vars.add(node.id);
        }

        // Variable expression
        if (node.kind === HExprKind.Var && typeof node.id === "number") {
            vars.add(node.id);
        }

        // Identifier pattern
        if (node.kind === HPatKind.Ident && typeof node.id === "number") {
            vars.add(node.id);
        }

        // Recurse into arrays
        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        // Recurse into object properties
        for (const key of Object.keys(node)) {
            if (key === "ty" || key === "span") continue;
            visit(node[key]);
        }
    }

    visit(hir);
    return vars;
}

/**
 * Check if an HIR node is an expression
 * @param {any} node
 * @returns {node is HExpr}
 */
function isHExpr(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HExprKind.Unit &&
        node.kind <= HExprKind.While
    );
}

/**
 * Check if an HIR node is a statement
 * @param {any} node
 * @returns {node is HStmt}
 */
function isHStmt(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HStmtKind.Let &&
        node.kind <= HStmtKind.Continue
    );
}

/**
 * Check if an HIR node is a place
 * @param {any} node
 * @returns {node is HPlace}
 */
function isHPlace(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HPlaceKind.Var &&
        node.kind <= HPlaceKind.Deref
    );
}

/**
 * Check if an HIR node is a pattern
 * @param {any} node
 * @returns {node is HPat}
 */
function isHPat(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HPatKind.Ident &&
        node.kind <= HPatKind.Or
    );
}

/**
 * Check if an HIR node is an item
 * @param {any} node
 * @returns {node is HItem}
 */
function isHItem(node) {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HItemKind.Fn &&
        node.kind <= HItemKind.Enum
    );
}

// Import typeToString from types.js for use in hirToString
import { typeToString } from "./types.js";

export {
    // Kinds
    HItemKind,
    HStmtKind,
    HPlaceKind,
    HExprKind,
    HPatKind,
    HLiteralKind,
    // Module
    makeHModule,
    // Items
    makeHFnDecl,
    makeHParam,
    makeHStructDecl,
    makeHStructField,
    makeHEnumDecl,
    makeHEnumVariant,
    // Block
    makeHBlock,
    // Statements
    makeHLetStmt,
    makeHAssignStmt,
    makeHExprStmt,
    makeHReturnStmt,
    makeHBreakStmt,
    makeHContinueStmt,
    // Places
    makeHVarPlace,
    makeHFieldPlace,
    makeHIndexPlace,
    makeHDerefPlace,
    // Expressions
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
    // Control flow
    makeHIfExpr,
    makeHMatchExpr,
    makeHLoopExpr,
    makeHWhileExpr,
    // Patterns
    makeHIdentPat,
    makeHWildcardPat,
    makeHLiteralPat,
    makeHStructPat,
    makeHTuplePat,
    makeHOrPat,
    // Match arm
    makeHMatchArm,
    // Utilities
    hirToString,
    collectVars,
    isHExpr,
    isHStmt,
    isHPlace,
    isHPat,
    isHItem,
};
