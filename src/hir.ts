import { typeToString } from "./types";
import type { Type } from "./types";

export type Span = { line: number; column: number; start: number; end: number };

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

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = Record<string, JsonValue>;
type HValue = HNode | Type | JsonValue | Map<string, HValue>;
type HInit = { [field: string]: HValue };

function serializeHirValue(value: HValue): JsonValue {
    if (value instanceof HNode) {
        return value.toJSON();
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeHirValue(item as HValue));
    }
    if (value instanceof Map) {
        const out: JsonObject = {};
        for (const [k, v] of value.entries()) {
            out[k] = serializeHirValue(v);
        }
        return out;
    }
    if (value !== null && typeof value === "object") {
        const out: JsonObject = {};
        for (const [k, v] of Object.entries(value as JsonObject)) {
            out[k] = serializeHirValue(v as HValue);
        }
        return out;
    }
    return value as JsonPrimitive;
}

type HirVisitHandler<R, C> = (node: HNode, ctx: C) => R;
export type HirVisitor<R = void, C = void> = {
    visitNode?: HirVisitHandler<R, C>;
};

export class HNode {
    kind = -1;
    node = "HNode";

    accept<R = void, C = void>(visitor: HirVisitor<R, C>, ctx: C): R {
        const method = (
            visitor as Record<string, HirVisitHandler<R, C>>
        )[`visit${this.node}`];
        if (method) {
            return method(this, ctx);
        }
        if (visitor.visitNode) {
            return visitor.visitNode(this, ctx);
        }
        throw new Error(`No visitor method for node ${this.node}`);
    }

    toJSON(): JsonObject {
        const out: JsonObject = { node: this.node };
        const keys = Object.keys(this) as Array<keyof this>;
        for (const key of keys) {
            if (key === "kind") {
                continue;
            }
            out[String(key)] = serializeHirValue(this[key] as HValue);
        }
        return out;
    }
}

export class HItem extends HNode {}
export class HStmt extends HNode {}
export class HPlace extends HNode {}
export class HExpr extends HNode {}
export class HPat extends HNode {}

export class HModule extends HNode {
    kind = HItemKind.Fn;
    node = "HModule";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HFnDecl extends HItem {
    kind = HItemKind.Fn;
    node = "HFnDecl";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HStructDecl extends HItem {
    kind = HItemKind.Struct;
    node = "HStructDecl";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HEnumDecl extends HItem {
    kind = HItemKind.Enum;
    node = "HEnumDecl";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HBlock extends HExpr {
    kind = HExprKind.Unit;
    node = "HBlock";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HLetStmt extends HStmt {
    kind = HStmtKind.Let;
    node = "HLetStmt";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HAssignStmt extends HStmt {
    kind = HStmtKind.Assign;
    node = "HAssignStmt";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HExprStmt extends HStmt {
    kind = HStmtKind.Expr;
    node = "HExprStmt";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HReturnStmt extends HStmt {
    kind = HStmtKind.Return;
    node = "HReturnStmt";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HBreakStmt extends HStmt {
    kind = HStmtKind.Break;
    node = "HBreakStmt";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HContinueStmt extends HStmt {
    kind = HStmtKind.Continue;
    node = "HContinueStmt";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HVarPlace extends HPlace {
    kind = HPlaceKind.Var;
    node = "HVarPlace";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HFieldPlace extends HPlace {
    kind = HPlaceKind.Field;
    node = "HFieldPlace";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HIndexPlace extends HPlace {
    kind = HPlaceKind.Index;
    node = "HIndexPlace";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HDerefPlace extends HPlace {
    kind = HPlaceKind.Deref;
    node = "HDerefPlace";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HUnitExpr extends HExpr {
    kind = HExprKind.Unit;
    node = "HUnitExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HLiteralExpr extends HExpr {
    kind = HExprKind.Literal;
    node = "HLiteralExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HVarExpr extends HExpr {
    kind = HExprKind.Var;
    node = "HVarExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HBinaryExpr extends HExpr {
    kind = HExprKind.Binary;
    node = "HBinaryExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HUnaryExpr extends HExpr {
    kind = HExprKind.Unary;
    node = "HUnaryExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HCallExpr extends HExpr {
    kind = HExprKind.Call;
    node = "HCallExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HFieldExpr extends HExpr {
    kind = HExprKind.Field;
    node = "HFieldExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HIndexExpr extends HExpr {
    kind = HExprKind.Index;
    node = "HIndexExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HRefExpr extends HExpr {
    kind = HExprKind.Ref;
    node = "HRefExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HDerefExpr extends HExpr {
    kind = HExprKind.Deref;
    node = "HDerefExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HStructExpr extends HExpr {
    kind = HExprKind.Struct;
    node = "HStructExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HEnumExpr extends HExpr {
    kind = HExprKind.Enum;
    node = "HEnumExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HIfExpr extends HExpr {
    kind = HExprKind.If;
    node = "HIfExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HMatchExpr extends HExpr {
    kind = HExprKind.Match;
    node = "HMatchExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HLoopExpr extends HExpr {
    kind = HExprKind.Loop;
    node = "HLoopExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HWhileExpr extends HExpr {
    kind = HExprKind.While;
    node = "HWhileExpr";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HIdentPat extends HPat {
    kind = HPatKind.Ident;
    node = "HIdentPat";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HWildcardPat extends HPat {
    kind = HPatKind.Wildcard;
    node = "HWildcardPat";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HLiteralPat extends HPat {
    kind = HPatKind.Literal;
    node = "HLiteralPat";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HStructPat extends HPat {
    kind = HPatKind.Struct;
    node = "HStructPat";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HTuplePat extends HPat {
    kind = HPatKind.Tuple;
    node = "HTuplePat";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HOrPat extends HPat {
    kind = HPatKind.Or;
    node = "HOrPat";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HParam extends HNode {
    node = "HParam";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HStructField extends HNode {
    node = "HStructField";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HEnumVariant extends HNode {
    node = "HEnumVariant";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}

export class HMatchArm extends HNode {
    node = "HMatchArm";

    constructor(props: HInit) {
        super();
        Object.assign(this, props);
    }
}
function makeHModule(span: Span, name: string, items: HItem[]): HModule {
    return new HModule({ span, name, items });
}

function makeHFnDecl(
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
    return new HFnDecl({
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
    });
}

function makeHParam(
    span: Span,
    name: string | null,
    ty: Type,
    pat: HPat | null,
): HParam {
    return new HParam({ span, name, ty, pat });
}

function makeHStructDecl(
    span: Span,
    name: string,
    generics: string[] | null,
    fields: HStructField[],
    isTuple: boolean,
): HStructDecl {
    return new HStructDecl({ span, name, generics, fields, isTuple });
}

function makeHStructField(
    span: Span,
    name: string,
    ty: Type,
    defaultValue: HExpr | null,
): HStructField {
    return new HStructField({ span, name, ty, defaultValue });
}

function makeHEnumDecl(
    span: Span,
    name: string,
    generics: string[] | null,
    variants: HEnumVariant[],
): HEnumDecl {
    return new HEnumDecl({ span, name, generics, variants });
}

function makeHEnumVariant(
    span: Span,
    name: string,
    fields: Type[],
    discriminant: number | null,
): HEnumVariant {
    return new HEnumVariant({ span, name, fields, discriminant });
}

function makeHBlock(
    span: Span,
    stmts: HStmt[],
    expr: HExpr | null,
    ty: Type,
): HBlock {
    return new HBlock({ span, stmts, expr, ty });
}

function makeHLetStmt(
    span: Span,
    pat: HPat,
    ty: Type,
    init: HExpr | null,
): HLetStmt {
    return new HLetStmt({ span, pat, ty, init });
}

function makeHAssignStmt(
    span: Span,
    place: HPlace,
    value: HExpr,
): HAssignStmt {
    return new HAssignStmt({ span, place, value });
}

function makeHExprStmt(span: Span, expr: HExpr): HExprStmt {
    return new HExprStmt({ span, expr });
}

function makeHReturnStmt(span: Span, value: HExpr | null): HReturnStmt {
    return new HReturnStmt({ span, value });
}

function makeHBreakStmt(
    span: Span,
    value: HExpr | null,
    label: string | null,
): HBreakStmt {
    return new HBreakStmt({ span, value, label });
}

function makeHContinueStmt(
    span: Span,
    label: string | null,
): HContinueStmt {
    return new HContinueStmt({ span, label });
}

function makeHVarPlace(
    span: Span,
    name: string,
    id: number,
    ty: Type,
): HVarPlace {
    return new HVarPlace({ span, name, id, ty });
}

function makeHFieldPlace(
    span: Span,
    base: HPlace,
    field: string,
    index: number,
    ty: Type,
): HFieldPlace {
    return new HFieldPlace({ span, base, field, index, ty });
}

function makeHIndexPlace(
    span: Span,
    base: HPlace,
    index: HExpr,
    ty: Type,
): HIndexPlace {
    return new HIndexPlace({ span, base, index, ty });
}

function makeHDerefPlace(
    span: Span,
    base: HPlace,
    ty: Type,
): HDerefPlace {
    return new HDerefPlace({ span, base, ty });
}

function makeHUnitExpr(span: Span, ty: Type): HUnitExpr {
    return new HUnitExpr({ span, ty });
}

function makeHLiteralExpr(
    span: Span,
    literalKind: HLiteralKind,
    value: string | number | boolean,
    ty: Type,
): HLiteralExpr {
    return new HLiteralExpr({ span, literalKind, value, ty });
}

function makeHVarExpr(
    span: Span,
    name: string,
    id: number,
    ty: Type,
): HVarExpr {
    return new HVarExpr({ span, name, id, ty });
}

function makeHBinaryExpr(
    span: Span,
    op: number,
    left: HExpr,
    right: HExpr,
    ty: Type,
): HBinaryExpr {
    return new HBinaryExpr({ span, op, left, right, ty });
}

function makeHUnaryExpr(
    span: Span,
    op: number,
    operand: HExpr,
    ty: Type,
): HUnaryExpr {
    return new HUnaryExpr({ span, op, operand, ty });
}

function makeHCallExpr(
    span: Span,
    callee: HExpr,
    args: HExpr[],
    ty: Type,
): HCallExpr {
    return new HCallExpr({ span, callee, args, ty });
}

function makeHFieldExpr(
    span: Span,
    base: HExpr,
    field: string,
    index: number,
    ty: Type,
): HFieldExpr {
    return new HFieldExpr({ span, base, field, index, ty });
}

function makeHIndexExpr(
    span: Span,
    base: HExpr,
    index: HExpr,
    ty: Type,
): HIndexExpr {
    return new HIndexExpr({ span, base, index, ty });
}

function makeHRefExpr(
    span: Span,
    mutable: boolean,
    operand: HExpr,
    ty: Type,
): HRefExpr {
    return new HRefExpr({ span, mutable, operand, ty });
}

function makeHDerefExpr(
    span: Span,
    operand: HExpr,
    ty: Type,
): HDerefExpr {
    return new HDerefExpr({ span, operand, ty });
}

function makeHStructExpr(
    span: Span,
    name: string,
    fields: { name: string; value: HExpr }[],
    spread: HExpr | null,
    ty: Type,
): HStructExpr {
    return new HStructExpr({ span, name, fields, spread, ty });
}

function makeHEnumExpr(
    span: Span,
    enumName: string,
    variantName: string,
    variantIndex: number,
    fields: HExpr[],
    ty: Type,
): HEnumExpr {
    return new HEnumExpr({
        span,
        enumName,
        variantName,
        variantIndex,
        fields,
        ty,
    });
}

function makeHIfExpr(
    span: Span,
    condition: HExpr,
    thenBranch: HBlock,
    elseBranch: HBlock | null,
    ty: Type,
): HIfExpr {
    return new HIfExpr({ span, condition, thenBranch, elseBranch, ty });
}

function makeHMatchExpr(
    span: Span,
    scrutinee: HExpr,
    arms: HMatchArm[],
    ty: Type,
): HMatchExpr {
    return new HMatchExpr({ span, scrutinee, arms, ty });
}

function makeHLoopExpr(
    span: Span,
    label: string | null,
    body: HBlock,
    ty: Type,
): HLoopExpr {
    return new HLoopExpr({ span, label, body, ty });
}

function makeHWhileExpr(
    span: Span,
    label: string | null,
    condition: HExpr,
    body: HBlock,
    ty: Type,
): HWhileExpr {
    return new HWhileExpr({ span, label, condition, body, ty });
}

function makeHIdentPat(
    span: Span,
    name: string,
    id: number,
    ty: Type,
    mutable: boolean,
    isRef: boolean,
): HIdentPat {
    return new HIdentPat({ span, name, id, ty, mutable, isRef });
}

function makeHWildcardPat(span: Span, ty: Type): HWildcardPat {
    return new HWildcardPat({ span, ty });
}

function makeHLiteralPat(
    span: Span,
    literalKind: HLiteralKind,
    value: string | number | boolean,
    ty: Type,
): HLiteralPat {
    return new HLiteralPat({ span, literalKind, value, ty });
}

function makeHStructPat(
    span: Span,
    name: string,
    fields: { name: string; pat: HPat }[],
    rest: boolean,
    ty: Type,
): HStructPat {
    return new HStructPat({ span, name, fields, rest, ty });
}

function makeHTuplePat(
    span: Span,
    elements: HPat[],
    ty: Type,
): HTuplePat {
    return new HTuplePat({ span, elements, ty });
}

function makeHOrPat(span: Span, alternatives: HPat[], ty: Type): HOrPat {
    return new HOrPat({ span, alternatives, ty });
}

function makeHMatchArm(
    span: Span,
    pat: HPat,
    guard: HExpr | null,
    body: HBlock,
): HMatchArm {
    return new HMatchArm({ span, pat, guard, body });
}

function hirToString(hir: HNode): string {
    if (hir instanceof HModule) {
        const module = hir as HModule & { name: string; items: HItem[] };
        const itemLines = module.items.map((item) => `  ${hirToString(item)}`);
        return `module ${module.name} {\n${itemLines.join("\\n")}\n}`;
    }

    if (hir instanceof HFnDecl) {
        const fn = hir as HFnDecl & {
            name: string;
            params: Array<{ name: string; ty: Type }>;
            returnType: Type;
            body: HBlock | null;
        };
        const params = fn.params
            .map((param) => `${param.name}: ${typeToString(param.ty)}`)
            .join(", ");
        const body = fn.body ? hirToString(fn.body) : ";";
        return `fn ${fn.name}(${params}) -> ${typeToString(fn.returnType)} ${body}`;
    }
    if (hir instanceof HStructDecl) {
        const structDecl = hir as HStructDecl & {
            name: string;
            fields: Array<{ name: string; ty: Type }>;
        };
        const fields = structDecl.fields
            .map((field) => `${field.name}: ${typeToString(field.ty)}`)
            .join(", ");
        return `struct ${structDecl.name} { ${fields} }`;
    }
    if (hir instanceof HEnumDecl) {
        const enumDecl = hir as HEnumDecl & {
            name: string;
            variants: Array<{ name: string }>;
        };
        const variants = enumDecl.variants.map((variant) => variant.name).join(", ");
        return `enum ${enumDecl.name} { ${variants} }`;
    }
    if (hir instanceof HLetStmt) {
        const stmt = hir as HLetStmt & {
            pat: HPat;
            ty: Type;
            init: HExpr | null;
        };
        const init = stmt.init ? ` = ${hirToString(stmt.init)}` : "";
        return `let ${hirToString(stmt.pat)}: ${typeToString(stmt.ty)}${init};`;
    }
    if (hir instanceof HAssignStmt) {
        const stmt = hir as HAssignStmt & { place: HPlace; value: HExpr };
        return `${hirToString(stmt.place)} = ${hirToString(stmt.value)};`;
    }
    if (hir instanceof HExprStmt) {
        const stmt = hir as HExprStmt & { expr: HExpr };
        return `${hirToString(stmt.expr)};`;
    }
    if (hir instanceof HReturnStmt) {
        const stmt = hir as HReturnStmt & { value: HExpr | null };
        return stmt.value ? `return ${hirToString(stmt.value)};` : "return;";
    }
    if (hir instanceof HBreakStmt) {
        const stmt = hir as HBreakStmt & { value: HExpr | null };
        return stmt.value ? `break ${hirToString(stmt.value)};` : "break;";
    }
    if (hir instanceof HContinueStmt) {
        return "continue;";
    }
    if (hir instanceof HVarPlace) {
        return (hir as HVarPlace & { name: string }).name;
    }
    if (hir instanceof HFieldPlace) {
        const place = hir as HFieldPlace & { base: HPlace; field: string };
        return `${hirToString(place.base)}.${place.field}`;
    }
    if (hir instanceof HIndexPlace) {
        const place = hir as HIndexPlace & { base: HPlace; index: HExpr };
        return `${hirToString(place.base)}[${hirToString(place.index)}]`;
    }
    if (hir instanceof HDerefPlace) {
        return `*${hirToString((hir as HDerefPlace & { base: HPlace }).base)}`;
    }
    if (hir instanceof HUnitExpr) {
        return "()";
    }
    if (hir instanceof HLiteralExpr) {
        return String((hir as HLiteralExpr & { value: string | number | boolean }).value);
    }
    if (hir instanceof HVarExpr) {
        return (hir as HVarExpr & { name: string }).name;
    }
    if (hir instanceof HBinaryExpr) {
        const expr = hir as HBinaryExpr & {
            left: HExpr;
            right: HExpr;
            op: number;
        };
        return `(${hirToString(expr.left)} ${binaryOpToString(expr.op)} ${hirToString(expr.right)})`;
    }
    if (hir instanceof HUnaryExpr) {
        const expr = hir as HUnaryExpr & { op: number; operand: HExpr };
        return `${unaryOpToString(expr.op)}${hirToString(expr.operand)}`;
    }
    if (hir instanceof HCallExpr) {
        const expr = hir as HCallExpr & { callee: HExpr; args: HExpr[] };
        const args = expr.args.map((arg) => hirToString(arg)).join(", ");
        return `${hirToString(expr.callee)}(${args})`;
    }
    if (hir instanceof HFieldExpr) {
        const expr = hir as HFieldExpr & { base: HExpr; field: string };
        return `${hirToString(expr.base)}.${expr.field}`;
    }
    if (hir instanceof HIndexExpr) {
        const expr = hir as HIndexExpr & { base: HExpr; index: HExpr };
        return `${hirToString(expr.base)}[${hirToString(expr.index)}]`;
    }
    if (hir instanceof HRefExpr) {
        const expr = hir as HRefExpr & { mutable: boolean; operand: HExpr };
        return `&${expr.mutable ? "mut " : ""}${hirToString(expr.operand)}`;
    }
    if (hir instanceof HDerefExpr) {
        return `*${hirToString((hir as HDerefExpr & { operand: HExpr }).operand)}`;
    }
    if (hir instanceof HStructExpr) {
        const expr = hir as HStructExpr & {
            name: string;
            fields: Array<{ name: string; value: HExpr }>;
        };
        const fields = expr.fields
            .map((field) => `${field.name}: ${hirToString(field.value)}`)
            .join(", ");
        return `${expr.name} { ${fields} }`;
    }
    if (hir instanceof HEnumExpr) {
        const expr = hir as HEnumExpr & {
            enumName: string;
            variantName: string;
            fields: HExpr[];
        };
        const fields = expr.fields.map((field) => hirToString(field)).join(", ");
        return `${expr.enumName}::${expr.variantName}(${fields})`;
    }
    if (hir instanceof HIfExpr) {
        const expr = hir as HIfExpr & {
            condition: HExpr;
            thenBranch: HBlock;
            elseBranch: HBlock | null;
        };
        const elseBranch = expr.elseBranch
            ? ` else ${hirToString(expr.elseBranch)}`
            : "";
        return `if ${hirToString(expr.condition)} ${hirToString(expr.thenBranch)}${elseBranch}`;
    }
    if (hir instanceof HMatchExpr) {
        const expr = hir as HMatchExpr & { scrutinee: HExpr; arms: HMatchArm[] };
        const arms = expr.arms.map((arm) => `  ${hirToString(arm)}`).join(",\\n");
        return `match ${hirToString(expr.scrutinee)} {\n${arms}\n}`;
    }
    if (hir instanceof HLoopExpr) {
        return `loop ${hirToString((hir as HLoopExpr & { body: HBlock }).body)}`;
    }
    if (hir instanceof HWhileExpr) {
        const expr = hir as HWhileExpr & { condition: HExpr; body: HBlock };
        return `while ${hirToString(expr.condition)} ${hirToString(expr.body)}`;
    }
    if (hir instanceof HIdentPat) {
        return (hir as HIdentPat & { name: string }).name;
    }
    if (hir instanceof HWildcardPat) {
        return "_";
    }
    if (hir instanceof HLiteralPat) {
        return String((hir as HLiteralPat & { value: string | number | boolean }).value);
    }
    if (hir instanceof HStructPat) {
        const pat = hir as HStructPat & {
            name: string;
            fields: Array<{ name: string; pat: HPat }>;
            rest: boolean;
        };
        const fields = pat.fields
            .map((field) => `${field.name}: ${hirToString(field.pat)}`)
            .join(", ");
        return `${pat.name} { ${fields}${pat.rest ? " .." : ""} }`;
    }
    if (hir instanceof HTuplePat) {
        const tuple = hir as HTuplePat & { elements: HPat[] };
        return `(${tuple.elements.map((item) => hirToString(item)).join(", ")})`;
    }
    if (hir instanceof HOrPat) {
        const orPat = hir as HOrPat & { alternatives: HPat[] };
        return orPat.alternatives.map((item) => hirToString(item)).join(" | ");
    }

    if (hir instanceof HBlock) {
        const block = hir as HBlock & { stmts: HStmt[]; expr: HExpr | null };
        const stmts = block.stmts.map((stmt) => `  ${hirToString(stmt)}`).join("\\n");
        const expr = block.expr ? "\\n  " + hirToString(block.expr) : "";
        return `{\n${stmts}${expr}\n}`;
    }

    if (hir instanceof HMatchArm) {
        const arm = hir as HMatchArm & { pat: HPat; guard: HExpr | null; body: HBlock };
        const guard = arm.guard ? ` if ${hirToString(arm.guard)}` : "";
        return `${hirToString(arm.pat)}${guard} => ${hirToString(arm.body)}`;
    }

    return "<invalid-hir-node>";
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

function collectVars(hir: HNode): Set<number> {
    const vars = new Set<number>();

    const visit = (node: HNode | Type | JsonValue): void => {
        if (node instanceof HVarPlace && typeof (node as { id?: number }).id === "number") {
            vars.add((node as { id: number }).id);
        }
        if (node instanceof HVarExpr && typeof (node as { id?: number }).id === "number") {
            vars.add((node as { id: number }).id);
        }
        if (node instanceof HIdentPat && typeof (node as { id?: number }).id === "number") {
            vars.add((node as { id: number }).id);
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item as HNode | Type | JsonValue);
            }
            return;
        }

        if (node !== null && typeof node === "object") {
            for (const value of Object.values(node as JsonObject)) {
                visit(value as HNode | Type | JsonValue);
            }
        }
    };

    visit(hir);
    return vars;
}

function isHExpr(node: HNode): node is HExpr {
    return node instanceof HExpr;
}

function isHStmt(node: HNode): node is HStmt {
    return node instanceof HStmt;
}

function isHPlace(node: HNode): node is HPlace {
    return node instanceof HPlace;
}

function isHPat(node: HNode): node is HPat {
    return node instanceof HPat;
}

function isHItem(node: HNode): node is HItem {
    return node instanceof HItem;
}

function visitHir<R = void, C = void>(node: HNode, visitor: HirVisitor<R, C>, ctx: C): R {
    return node.accept(visitor, ctx);
}

export {
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
    hirToString,
    collectVars,
    isHExpr,
    isHStmt,
    isHPlace,
    isHPat,
    isHItem,
    visitHir,
};
