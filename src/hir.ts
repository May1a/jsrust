import { typeToString } from "./types";
import type { Type } from "./types";

export type Span = { line: number; column: number; start: number; end: number };

// ============================================================================
// HIR Node Kinds (Using distinct ranges to prevent overlap bugs)
// ============================================================================

export enum HItemKind {
    Fn = 100,
    Struct = 101,
    Enum = 102,
}

export enum HStmtKind {
    Let = 200,
    Assign = 201,
    Expr = 202,
    Return = 203,
    Break = 204,
    Continue = 205,
}

export enum HPlaceKind {
    Var = 300,
    Field = 301,
    Index = 302,
    Deref = 303,
}

export enum HExprKind {
    Unit = 400,
    Literal = 401,
    Var = 402,
    Binary = 403,
    Unary = 404,
    Call = 405,
    Field = 406,
    Index = 407,
    Ref = 408,
    Deref = 409,
    Struct = 410,
    Enum = 411,
    If = 412,
    Match = 413,
    Loop = 414,
    While = 415,
}

export enum HPatKind {
    Ident = 500,
    Wildcard = 501,
    Literal = 502,
    Struct = 503,
    Tuple = 504,
    Or = 505,
}

export enum HLiteralKind {
    Int = 600,
    Float = 601,
    Bool = 602,
    String = 603,
    Char = 604,
}

// ============================================================================
// Module Structure
// ============================================================================

export type HModule = {
    kind: HItemKind.Fn;
    span: Span;
    name: string;
    items: HItem[];
};

export function makeHModule(span: Span, name: string, items: HItem[]): HModule {
    return { kind: HItemKind.Fn, span, name, items };
}

// ============================================================================
// Items
// ============================================================================

export type HParam = {
    name: string | null;
    ty: Type;
    pat: HPat | null;
    span: Span;
};

export type HFnDecl = {
    kind: HItemKind.Fn;
    span: Span;
    name: string;
    generics: string[] | null;
    params: HParam[];
    returnType: Type;
    body: HBlock | null;
    isAsync: boolean;
    isUnsafe: boolean;
    isConst: boolean;
    isTest: boolean;
    expectedOutput: string | null;
};

export function makeHFnDecl(
    span: Span,
    name: string,
    generics: string[] | null,
    params: HParam[],
    returnType: Type,
    body: HBlock | null,
    isAsync: boolean,
    isUnsafe: boolean,
    isConst: boolean,
    isTest: boolean = false,
    expectedOutput: string | null = null,
): HFnDecl {
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
        isConst,
        isTest,
        expectedOutput,
    };
}

export function makeHParam(
    span: Span,
    name: string | null,
    ty: Type,
    pat: HPat | null,
): HParam {
    return { name, ty, pat, span };
}

export type HStructField = {
    name: string;
    ty: Type;
    defaultValue: HExpr | null;
    span: Span;
};

export type HStructDecl = {
    kind: HItemKind.Struct;
    span: Span;
    name: string;
    generics: string[] | null;
    fields: HStructField[];
    isTuple: boolean;
};

export function makeHStructDecl(
    span: Span,
    name: string,
    generics: string[] | null,
    fields: HStructField[],
    isTuple: boolean,
): HStructDecl {
    return { kind: HItemKind.Struct, span, name, generics, fields, isTuple };
}

export function makeHStructField(
    span: Span,
    name: string,
    ty: Type,
    defaultValue: HExpr | null,
): HStructField {
    return { name, ty, defaultValue, span };
}

export type HEnumVariant = {
    name: string;
    fields: Type[];
    discriminant: number | null;
    span: Span;
};

export type HEnumDecl = {
    kind: HItemKind.Enum;
    span: Span;
    name: string;
    generics: string[] | null;
    variants: HEnumVariant[];
};

export function makeHEnumDecl(
    span: Span,
    name: string,
    generics: string[] | null,
    variants: HEnumVariant[],
): HEnumDecl {
    return { kind: HItemKind.Enum, span, name, generics, variants };
}

export function makeHEnumVariant(
    span: Span,
    name: string,
    fields: Type[],
    discriminant: number | null,
): HEnumVariant {
    return { name, fields, discriminant, span };
}

export type HItem = HFnDecl | HStructDecl | HEnumDecl;

// ============================================================================
// Blocks
// ============================================================================

export type HBlock = {
    stmts: HStmt[];
    expr: HExpr | null;
    span: Span;
    ty: Type;
};

export function makeHBlock(
    span: Span,
    stmts: HStmt[],
    expr: HExpr | null,
    ty: Type,
): HBlock {
    return { stmts, expr, span, ty };
}

// ============================================================================
// Statements
// ============================================================================

export type HLetStmt = {
    kind: HStmtKind.Let;
    span: Span;
    pat: HPat;
    ty: Type;
    init: HExpr | null;
};

export function makeHLetStmt(
    span: Span,
    pat: HPat,
    ty: Type,
    init: HExpr | null,
): HLetStmt {
    return { kind: HStmtKind.Let, span, pat, ty, init };
}

export type HAssignStmt = {
    kind: HStmtKind.Assign;
    span: Span;
    place: HPlace;
    value: HExpr;
};

export function makeHAssignStmt(
    span: Span,
    place: HPlace,
    value: HExpr,
): HAssignStmt {
    return { kind: HStmtKind.Assign, span, place, value };
}

export type HExprStmt = {
    kind: HStmtKind.Expr;
    span: Span;
    expr: HExpr;
};

export function makeHExprStmt(span: Span, expr: HExpr): HExprStmt {
    return { kind: HStmtKind.Expr, span, expr };
}

export type HReturnStmt = {
    kind: HStmtKind.Return;
    span: Span;
    value: HExpr | null;
};

export function makeHReturnStmt(span: Span, value: HExpr | null): HReturnStmt {
    return { kind: HStmtKind.Return, span, value };
}

export type HBreakStmt = {
    kind: HStmtKind.Break;
    span: Span;
    value: HExpr | null;
    label: string | null;
};

export function makeHBreakStmt(
    span: Span,
    value: HExpr | null,
    label: string | null,
): HBreakStmt {
    return { kind: HStmtKind.Break, span, value, label };
}

export type HContinueStmt = {
    kind: HStmtKind.Continue;
    span: Span;
    label: string | null;
};

export function makeHContinueStmt(
    span: Span,
    label: string | null,
): HContinueStmt {
    return { kind: HStmtKind.Continue, span, label };
}

export type HStmt =
    | HLetStmt
    | HAssignStmt
    | HExprStmt
    | HReturnStmt
    | HBreakStmt
    | HContinueStmt;

// ============================================================================
// Places
// ============================================================================

export type HVarPlace = {
    kind: HPlaceKind.Var;
    span: Span;
    name: string;
    id: number;
    ty: Type;
};

export function makeHVarPlace(
    span: Span,
    name: string,
    id: number,
    ty: Type,
): HVarPlace {
    return { kind: HPlaceKind.Var, span, name, id, ty };
}

export type HFieldPlace = {
    kind: HPlaceKind.Field;
    span: Span;
    base: HPlace;
    field: string;
    index: number;
    ty: Type;
};

export function makeHFieldPlace(
    span: Span,
    base: HPlace,
    field: string,
    index: number,
    ty: Type,
): HFieldPlace {
    return { kind: HPlaceKind.Field, span, base, field, index, ty };
}

export type HIndexPlace = {
    kind: HPlaceKind.Index;
    span: Span;
    base: HPlace;
    index: HExpr;
    ty: Type;
};

export function makeHIndexPlace(
    span: Span,
    base: HPlace,
    index: HExpr,
    ty: Type,
): HIndexPlace {
    return { kind: HPlaceKind.Index, span, base, index, ty };
}

export type HDerefPlace = {
    kind: HPlaceKind.Deref;
    span: Span;
    base: HPlace;
    ty: Type;
};

export function makeHDerefPlace(
    span: Span,
    base: HPlace,
    ty: Type,
): HDerefPlace {
    return { kind: HPlaceKind.Deref, span, base, ty };
}

export type HPlace = HVarPlace | HFieldPlace | HIndexPlace | HDerefPlace;

// ============================================================================
// Expressions
// ============================================================================

export type HUnitExpr = {
    kind: HExprKind.Unit;
    span: Span;
    ty: Type;
};

export function makeHUnitExpr(span: Span, ty: Type): HUnitExpr {
    return { kind: HExprKind.Unit, span, ty };
}

export type HLiteralExpr = {
    kind: HExprKind.Literal;
    span: Span;
    literalKind: HLiteralKind;
    value: string | number | boolean;
    ty: Type;
};

export function makeHLiteralExpr(
    span: Span,
    literalKind: HLiteralKind,
    value: string | number | boolean,
    ty: Type,
): HLiteralExpr {
    return { kind: HExprKind.Literal, span, literalKind, value, ty };
}

export type HVarExpr = {
    kind: HExprKind.Var;
    span: Span;
    name: string;
    id: number;
    ty: Type;
    closureMeta?: {
        helperName: string;
        helperType: Type;
        captures: Array<{
            name: string;
            type: Type;
            mutable: boolean;
            mode: "value" | "ref";
        }>;
    };
};

export function makeHVarExpr(
    span: Span,
    name: string,
    id: number,
    ty: Type,
): HVarExpr {
    return { kind: HExprKind.Var, span, name, id, ty };
}

export type HBinaryExpr = {
    kind: HExprKind.Binary;
    span: Span;
    op: number;
    left: HExpr;
    right: HExpr;
    ty: Type;
};

export function makeHBinaryExpr(
    span: Span,
    op: number,
    left: HExpr,
    right: HExpr,
    ty: Type,
): HBinaryExpr {
    return { kind: HExprKind.Binary, span, op, left, right, ty };
}

export type HUnaryExpr = {
    kind: HExprKind.Unary;
    span: Span;
    op: number;
    operand: HExpr;
    ty: Type;
};

export function makeHUnaryExpr(
    span: Span,
    op: number,
    operand: HExpr,
    ty: Type,
): HUnaryExpr {
    return { kind: HExprKind.Unary, span, op, operand, ty };
}

export type HCallExpr = {
    kind: HExprKind.Call;
    span: Span;
    callee: HExpr;
    args: HExpr[];
    ty: Type;
};

export function makeHCallExpr(
    span: Span,
    callee: HExpr,
    args: HExpr[],
    ty: Type,
): HCallExpr {
    return { kind: HExprKind.Call, span, callee, args, ty };
}

export type HFieldExpr = {
    kind: HExprKind.Field;
    span: Span;
    base: HExpr;
    field: string;
    index: number;
    ty: Type;
};

export function makeHFieldExpr(
    span: Span,
    base: HExpr,
    field: string,
    index: number,
    ty: Type,
): HFieldExpr {
    return { kind: HExprKind.Field, span, base, field, index, ty };
}

export type HIndexExpr = {
    kind: HExprKind.Index;
    span: Span;
    base: HExpr;
    index: HExpr;
    ty: Type;
};

export function makeHIndexExpr(
    span: Span,
    base: HExpr,
    index: HExpr,
    ty: Type,
): HIndexExpr {
    return { kind: HExprKind.Index, span, base, index, ty };
}

export type HRefExpr = {
    kind: HExprKind.Ref;
    span: Span;
    mutable: boolean;
    operand: HExpr;
    ty: Type;
};

export function makeHRefExpr(
    span: Span,
    mutable: boolean,
    operand: HExpr,
    ty: Type,
): HRefExpr {
    return { kind: HExprKind.Ref, span, mutable, operand, ty };
}

export type HDerefExpr = {
    kind: HExprKind.Deref;
    span: Span;
    operand: HExpr;
    ty: Type;
};

export function makeHDerefExpr(
    span: Span,
    operand: HExpr,
    ty: Type,
): HDerefExpr {
    return { kind: HExprKind.Deref, span, operand, ty };
}

export type HStructExpr = {
    kind: HExprKind.Struct;
    span: Span;
    name: string;
    fields: { name: string; value: HExpr }[];
    spread: HExpr | null;
    ty: Type;
};

export function makeHStructExpr(
    span: Span,
    name: string,
    fields: { name: string; value: HExpr }[],
    spread: HExpr | null,
    ty: Type,
): HStructExpr {
    return { kind: HExprKind.Struct, span, name, fields, spread, ty };
}

export type HEnumExpr = {
    kind: HExprKind.Enum;
    span: Span;
    enumName: string;
    variantName: string;
    variantIndex: number;
    fields: HExpr[];
    ty: Type;
};

export function makeHEnumExpr(
    span: Span,
    enumName: string,
    variantName: string,
    variantIndex: number,
    fields: HExpr[],
    ty: Type,
): HEnumExpr {
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

export type HIfExpr = {
    kind: HExprKind.If;
    span: Span;
    condition: HExpr;
    thenBranch: HBlock;
    elseBranch: HBlock | null;
    ty: Type;
};

export function makeHIfExpr(
    span: Span,
    condition: HExpr,
    thenBranch: HBlock,
    elseBranch: HBlock | null,
    ty: Type,
): HIfExpr {
    return { kind: HExprKind.If, span, condition, thenBranch, elseBranch, ty };
}

export type HMatchExpr = {
    kind: HExprKind.Match;
    span: Span;
    scrutinee: HExpr;
    arms: HMatchArm[];
    ty: Type;
};

export function makeHMatchExpr(
    span: Span,
    scrutinee: HExpr,
    arms: HMatchArm[],
    ty: Type,
): HMatchExpr {
    return { kind: HExprKind.Match, span, scrutinee, arms, ty };
}

export type HLoopExpr = {
    kind: HExprKind.Loop;
    span: Span;
    label: string | null;
    body: HBlock;
    ty: Type;
};

export function makeHLoopExpr(
    span: Span,
    label: string | null,
    body: HBlock,
    ty: Type,
): HLoopExpr {
    return { kind: HExprKind.Loop, span, label, body, ty };
}

export type HWhileExpr = {
    kind: HExprKind.While;
    span: Span;
    label: string | null;
    condition: HExpr;
    body: HBlock;
    ty: Type;
};

export function makeHWhileExpr(
    span: Span,
    label: string | null,
    condition: HExpr,
    body: HBlock,
    ty: Type,
): HWhileExpr {
    return { kind: HExprKind.While, span, label, condition, body, ty };
}

export type HExpr =
    | HUnitExpr
    | HLiteralExpr
    | HVarExpr
    | HBinaryExpr
    | HUnaryExpr
    | HCallExpr
    | HFieldExpr
    | HIndexExpr
    | HRefExpr
    | HDerefExpr
    | HStructExpr
    | HEnumExpr
    | HIfExpr
    | HMatchExpr
    | HLoopExpr
    | HWhileExpr
    | HBlock;

// ============================================================================
// Patterns
// ============================================================================

export type HIdentPat = {
    kind: HPatKind.Ident;
    span: Span;
    name: string;
    id: number;
    ty: Type;
    mutable: boolean;
    isRef: boolean;
};

export function makeHIdentPat(
    span: Span,
    name: string,
    id: number,
    ty: Type,
    mutable: boolean,
    isRef: boolean,
): HIdentPat {
    return { kind: HPatKind.Ident, span, name, id, ty, mutable, isRef };
}

export type HWildcardPat = {
    kind: HPatKind.Wildcard;
    span: Span;
    ty: Type;
};

export function makeHWildcardPat(span: Span, ty: Type): HWildcardPat {
    return { kind: HPatKind.Wildcard, span, ty };
}

export type HLiteralPat = {
    kind: HPatKind.Literal;
    span: Span;
    literalKind: HLiteralKind;
    value: string | number | boolean;
    ty: Type;
};

export function makeHLiteralPat(
    span: Span,
    literalKind: HLiteralKind,
    value: string | number | boolean,
    ty: Type,
): HLiteralPat {
    return { kind: HPatKind.Literal, span, literalKind, value, ty };
}

export type HStructPat = {
    kind: HPatKind.Struct;
    span: Span;
    name: string;
    fields: { name: string; pat: HPat }[];
    rest: boolean;
    ty: Type;
};

export function makeHStructPat(
    span: Span,
    name: string,
    fields: { name: string; pat: HPat }[],
    rest: boolean,
    ty: Type,
): HStructPat {
    return { kind: HPatKind.Struct, span, name, fields, rest, ty };
}

export type HTuplePat = {
    kind: HPatKind.Tuple;
    span: Span;
    elements: HPat[];
    ty: Type;
};

export function makeHTuplePat(
    span: Span,
    elements: HPat[],
    ty: Type,
): HTuplePat {
    return { kind: HPatKind.Tuple, span, elements, ty };
}

export type HOrPat = {
    kind: HPatKind.Or;
    span: Span;
    alternatives: HPat[];
    ty: Type;
};

export function makeHOrPat(span: Span, alternatives: HPat[], ty: Type): HOrPat {
    return { kind: HPatKind.Or, span, alternatives, ty };
}

export type HPat =
    | HIdentPat
    | HWildcardPat
    | HLiteralPat
    | HStructPat
    | HTuplePat
    | HOrPat;

// ============================================================================
// Match Arm
// ============================================================================

export type HMatchArm = {
    pat: HPat;
    guard: HExpr | null;
    body: HBlock;
    span: Span;
};

export function makeHMatchArm(
    span: Span,
    pat: HPat,
    guard: HExpr | null,
    body: HBlock,
): HMatchArm {
    return { pat, guard, body, span };
}

// ============================================================================
// Utilities
// ============================================================================

export type HNode =
    | HModule
    | HItem
    | HBlock
    | HStmt
    | HPlace
    | HExpr
    | HPat
    | HMatchArm;

export function hirToString(hir: HNode): string {
    if ("items" in hir && "name" in hir) {
        return `module ${(hir as HModule).name} {
${(hir as HModule).items.map((i) => "  " + hirToString(i)).join("\\n")}
}`;
    }

    if ("kind" in hir) {
        switch (hir.kind) {
            case HItemKind.Fn: {
                const fn = hir as HFnDecl;
                const params = fn.params
                    .map((p) => `${p.name}: ${typeToString(p.ty)}`)
                    .join(", ");
                const body = fn.body ? hirToString(fn.body) : ";";
                return `fn ${fn.name}(${params}) -> ${typeToString(fn.returnType)} ${body}`;
            }
            case HItemKind.Struct: {
                const struct = hir as HStructDecl;
                const fields = struct.fields
                    .map((f) => `${f.name}: ${typeToString(f.ty)}`)
                    .join(", ");
                return `struct ${struct.name} { ${fields} }`;
            }
            case HItemKind.Enum: {
                const enum_ = hir as HEnumDecl;
                const variants = enum_.variants.map((v) => v.name).join(", ");
                return `enum ${enum_.name} { ${variants} }`;
            }

            case HStmtKind.Let: {
                const stmt = hir as HLetStmt;
                const init = stmt.init ? ` = ${hirToString(stmt.init)}` : "";
                return `let ${hirToString(stmt.pat)}: ${typeToString(stmt.ty)}${init};`;
            }
            case HStmtKind.Assign: {
                const stmt = hir as HAssignStmt;
                return `${hirToString(stmt.place)} = ${hirToString(stmt.value)};`;
            }
            case HStmtKind.Expr: {
                const stmt = hir as HExprStmt;
                return `${hirToString(stmt.expr)};`;
            }
            case HStmtKind.Return: {
                const stmt = hir as HReturnStmt;
                return stmt.value
                    ? `return ${hirToString(stmt.value)};`
                    : "return;";
            }
            case HStmtKind.Break: {
                const stmt = hir as HBreakStmt;
                return stmt.value
                    ? `break ${hirToString(stmt.value)};`
                    : "break;";
            }
            case HStmtKind.Continue: {
                return "continue;";
            }

            case HPlaceKind.Var: {
                const place = hir as HVarPlace;
                return place.name;
            }
            case HPlaceKind.Field: {
                const place = hir as HFieldPlace;
                return `${hirToString(place.base)}.${place.field}`;
            }
            case HPlaceKind.Index: {
                const place = hir as HIndexPlace;
                return `${hirToString(place.base)}[${hirToString(place.index)}]`;
            }
            case HPlaceKind.Deref: {
                const place = hir as HDerefPlace;
                return `*${hirToString(place.base)}`;
            }

            case HExprKind.Unit: {
                return "()";
            }
            case HExprKind.Literal: {
                const expr = hir as HLiteralExpr;
                return String(expr.value);
            }
            case HExprKind.Var: {
                const expr = hir as HVarExpr;
                return expr.name;
            }
            case HExprKind.Binary: {
                const expr = hir as HBinaryExpr;
                return `(${hirToString(expr.left)} ${binaryOpToString(expr.op)} ${hirToString(expr.right)})`;
            }
            case HExprKind.Unary: {
                const expr = hir as HUnaryExpr;
                return `${unaryOpToString(expr.op)}${hirToString(expr.operand)}`;
            }
            case HExprKind.Call: {
                const expr = hir as HCallExpr;
                const args = expr.args.map(hirToString).join(", ");
                return `${hirToString(expr.callee)}(${args})`;
            }
            case HExprKind.Field: {
                const expr = hir as HFieldExpr;
                return `${hirToString(expr.base)}.${expr.field}`;
            }
            case HExprKind.Index: {
                const expr = hir as HIndexExpr;
                return `${hirToString(expr.base)}[${hirToString(expr.index)}]`;
            }
            case HExprKind.Ref: {
                const expr = hir as HRefExpr;
                return `&${expr.mutable ? "mut " : ""}${hirToString(expr.operand)}`;
            }
            case HExprKind.Deref: {
                const expr = hir as HDerefExpr;
                return `*${hirToString(expr.operand)}`;
            }
            case HExprKind.Struct: {
                const expr = hir as HStructExpr;
                const fields = expr.fields
                    .map((f) => `${f.name}: ${hirToString(f.value)}`)
                    .join(", ");
                return `${expr.name} { ${fields} }`;
            }
            case HExprKind.Enum: {
                const expr = hir as HEnumExpr;
                const fields = expr.fields.map(hirToString).join(", ");
                return `${expr.enumName}::${expr.variantName}(${fields})`;
            }
            case HExprKind.If: {
                const expr = hir as HIfExpr;
                const else_ = expr.elseBranch
                    ? ` else ${hirToString(expr.elseBranch)}`
                    : "";
                return `if ${hirToString(expr.condition)} ${hirToString(expr.thenBranch)}${else_}`;
            }
            case HExprKind.Match: {
                const expr = hir as HMatchExpr;
                const arms = expr.arms
                    .map(
                        (a) =>
                            `  ${hirToString(a.pat)} => ${hirToString(a.body)}`,
                    )
                    .join(",\\n");
                return `match ${hirToString(expr.scrutinee)} {
${arms}
}`;
            }
            case HExprKind.Loop: {
                const expr = hir as HLoopExpr;
                return `loop ${hirToString(expr.body)}`;
            }
            case HExprKind.While: {
                const expr = hir as HWhileExpr;
                return `while ${hirToString(expr.condition)} ${hirToString(expr.body)}`;
            }

            case HPatKind.Ident: {
                const pat = hir as HIdentPat;
                return pat.name;
            }
            case HPatKind.Wildcard: {
                return "_";
            }
            case HPatKind.Literal: {
                const pat = hir as HLiteralPat;
                return String(pat.value);
            }
            case HPatKind.Struct: {
                const pat = hir as HStructPat;
                const fields = pat.fields
                    .map((f) => `${f.name}: ${hirToString(f.pat)}`)
                    .join(", ");
                return `${pat.name} { ${fields}${pat.rest ? " .." : ""} }`;
            }
            case HPatKind.Tuple: {
                const pat = hir as HTuplePat;
                return `(${pat.elements.map(hirToString).join(", ")})`;
            }
            case HPatKind.Or: {
                const pat = hir as HOrPat;
                return pat.alternatives.map(hirToString).join(" | ");
            }
        }
    }

    if ("stmts" in hir && "ty" in hir) {
        const block = hir as HBlock;
        const stmts = block.stmts.map((s) => "  " + hirToString(s)).join("\\n");
        const expr = block.expr ? "\\n  " + hirToString(block.expr) : "";
        return `{
${stmts}${expr}
}`;
    }

    if ("pat" in hir && "body" in hir) {
        const arm = hir as HMatchArm;
        const guard = arm.guard ? ` if ${hirToString(arm.guard)}` : "";
        return `${hirToString(arm.pat)}${guard} => ${hirToString(arm.body)}`;
    }

    return "<unknown>";
}

function binaryOpToString(op: number): string {
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

function unaryOpToString(op: number): string {
    const ops = ["!", "-", "*", "&"];
    return ops[op] ?? "?";
}

export function collectVars(hir: HNode): Set<number> {
    const vars = new Set<number>();

    function visit(node: any) {
        if (!node || typeof node !== "object") return;

        if (node.kind === HPlaceKind.Var && typeof node.id === "number") {
            vars.add(node.id);
        }

        if (node.kind === HExprKind.Var && typeof node.id === "number") {
            vars.add(node.id);
        }

        if (node.kind === HPatKind.Ident && typeof node.id === "number") {
            vars.add(node.id);
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        for (const key of Object.keys(node)) {
            if (key === "ty" || key === "span") continue;
            visit(node[key]);
        }
    }

    visit(hir);
    return vars;
}

export function isHExpr(node: any): node is HExpr {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HExprKind.Unit &&
        node.kind <= HExprKind.While
    );
}

export function isHStmt(node: any): node is HStmt {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HStmtKind.Let &&
        node.kind <= HStmtKind.Continue
    );
}

export function isHPlace(node: any): node is HPlace {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HPlaceKind.Var &&
        node.kind <= HPlaceKind.Deref
    );
}

export function isHPat(node: any): node is HPat {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HPatKind.Ident &&
        node.kind <= HPatKind.Or
    );
}

export function isHItem(node: any): node is HItem {
    return (
        node &&
        typeof node.kind === "number" &&
        node.kind >= HItemKind.Fn &&
        node.kind <= HItemKind.Enum
    );
}
