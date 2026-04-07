import {
    AssignExpr,
    BinaryExpr,
    BinaryOp,
    BlockExpr,
    BreakExpr,
    CallExpr,
    ClosureExpr,
    ContinueExpr,
    ConstItem,
    DerefExpr,
    ExprStmt,
    type Expression,
    FieldExpr,
    FnItem,
    ForExpr,
    GenericFnItem,
    GenericStructItem,
    IdentPattern,
    IdentifierExpr,
    IfExpr,
    InferredTypeNode,
    IndexExpr,
    ImplItem,
    ItemStmt,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    LoopExpr,
    MacroExpr,
    MatchExpr,
    ModItem,
    ModuleNode,
    Mutability,
    NamedTypeNode,
    OptionTypeNode,
    ResultTypeNode,
    type ParamNode,
    RangeExpr,
    RefExpr,
    RefTypeNode,
    ReturnExpr,
    type Span,
    type Statement,
    StructExpr,
    StructPattern,
    StructItem,
    EnumItem,
    TraitImplItem,
    TraitItem,
    ArrayTypeNode,
    FnTypeNode,
    GenericArgsNode,
    PtrTypeNode,
    type Pattern,
    TupleTypeNode,
    type TypeNode,
    UnaryExpr,
    UnaryOp,
    UseItem,
    WhileExpr,
    type Item,
} from "../parse/ast";
import { Result } from "better-result";
import { match, P } from "ts-pattern";
import { inferTypeArgs, mangledName } from "./monomorphize";
import type { ConstBindingInfo, TypeContext } from "../utils/type_context";

interface FieldWithType {
    name: string;
    ty: TypeNode;
}

interface ParamWithType {
    name: string;
    ty: TypeNode;
}

function buildParamList(params: ParamNode[]): ParamWithType[] {
    const result: ParamWithType[] = [];
    for (const p of params) {
        if (!p.isReceiver) {
            result.push({ name: p.name, ty: p.ty });
        }
    }
    return result;
}

export interface TypeError {
    message: string;
    span?: Span;
}

interface InferFailure<T> {
    errors: TypeError[];
    fallback: T;
}

function mergeInferResult<T>(
    errors: TypeError[],
    result: Result<T, InferFailure<T>>,
): T {
    if (result.isErr()) {
        errors.push(...result.error.errors);
        return result.error.fallback;
    }
    return result.value;
}

function inferResultFrom<T>(
    fallback: T,
    errors: TypeError[],
): Result<T, InferFailure<T>> {
    if (errors.length > 0) {
        return Result.err({ errors, fallback });
    }
    return Result.ok(fallback);
}

const BUILTIN_TYPE_NAMES = new Set([
    "()",
    "unit",
    "i8",
    "i16",
    "i32",
    "i64",
    "i128",
    "isize",
    "u8",
    "u16",
    "u32",
    "u64",
    "u128",
    "usize",
    "f32",
    "f64",
    "bool",
    "char",
    "str",
    "Self",
]);

function isBuiltinTypeName(name: string): boolean {
    return BUILTIN_TYPE_NAMES.has(name);
}

/**
 * Check if a TypeNode represents an unresolved/inferred type placeholder.
 */
function isInferredPlaceholder(ty: TypeNode): boolean {
    return ty instanceof InferredTypeNode;
}

function binaryOpToString(op: BinaryOp): string {
    switch (op) {
        case BinaryOp.Add: {
            return "+";
        }
        case BinaryOp.Sub: {
            return "-";
        }
        case BinaryOp.Mul: {
            return "*";
        }
        case BinaryOp.Div: {
            return "/";
        }
        case BinaryOp.Rem: {
            return "%";
        }
        case BinaryOp.Eq: {
            return "==";
        }
        case BinaryOp.Ne: {
            return "!=";
        }
        case BinaryOp.Lt: {
            return "<";
        }
        case BinaryOp.Le: {
            return "<=";
        }
        case BinaryOp.Gt: {
            return ">";
        }
        case BinaryOp.Ge: {
            return ">=";
        }
        case BinaryOp.And: {
            return "&&";
        }
        case BinaryOp.Or: {
            return "||";
        }
        case BinaryOp.BitAnd: {
            return "&";
        }
        case BinaryOp.BitOr: {
            return "|";
        }
        case BinaryOp.BitXor: {
            return "^";
        }
        case BinaryOp.Shl: {
            return "<<";
        }
        case BinaryOp.Shr: {
            return ">>";
        }
        default: {
            const exhaustive: never = op;
            return exhaustive;
        }
    }
}

function unaryOpToString(op: UnaryOp): string {
    switch (op) {
        case UnaryOp.Neg: {
            return "-";
        }
        case UnaryOp.Not: {
            return "!";
        }
        case UnaryOp.Ref: {
            return "&";
        }
        case UnaryOp.Deref: {
            return "*";
        }
        default: {
            const exhaustive: never = op;
            return exhaustive;
        }
    }
}

function renderConstExpr(expr: Expression): string {
    return match(expr)
        .with(P.instanceOf(LiteralExpr), (literal) => String(literal.value))
        .with(P.instanceOf(IdentifierExpr), (identifier) => identifier.name)
        .with(P.instanceOf(UnaryExpr), (unary) => {
            const operator = unaryOpToString(unary.op);
            return `${operator}${renderConstExpr(unary.operand)}`;
        })
        .with(P.instanceOf(BinaryExpr), (binary) => {
            const operator = binaryOpToString(binary.op);
            const left = renderConstExpr(binary.left);
            const right = renderConstExpr(binary.right);
            return `${left} ${operator} ${right}`;
        })
        .otherwise(() => "_");
}

function evaluateConstInt(expr: Expression): number | undefined {
    if (expr instanceof LiteralExpr) {
        if (expr.literalKind === LiteralKind.Int) {
            return Number(expr.value);
        }
        const noValue: number | undefined = undefined;
        return noValue;
    }
    if (expr instanceof UnaryExpr) {
        const inner = evaluateConstInt(expr.operand);
        if (inner === undefined) {
            const noValue: number | undefined = undefined;
            return noValue;
        }
        if (expr.op === UnaryOp.Neg) {
            return -inner;
        }
        const noValue: number | undefined = undefined;
        return noValue;
    }
    if (expr instanceof BinaryExpr) {
        const left = evaluateConstInt(expr.left);
        const right = evaluateConstInt(expr.right);
        if (left === undefined || right === undefined) {
            const noValue: number | undefined = undefined;
            return noValue;
        }
        switch (expr.op) {
            case BinaryOp.Add: {
                return left + right;
            }
            case BinaryOp.Sub: {
                return left - right;
            }
            case BinaryOp.Mul: {
                return left * right;
            }
            case BinaryOp.Div: {
                return left / right;
            }
            case BinaryOp.Rem: {
                return left % right;
            }
            default: {
                const noValue: number | undefined = undefined;
                return noValue;
            }
        }
    }
    const noValue: number | undefined = undefined;
    return noValue;
}

function expressionsEqual(left: Expression, right: Expression): boolean {
    return match([left, right] as const)
        .with(
            [P.instanceOf(LiteralExpr), P.instanceOf(LiteralExpr)],
            ([lhs, rhs]) =>
                lhs.literalKind === rhs.literalKind && lhs.value === rhs.value,
        )
        .with(
            [P.instanceOf(IdentifierExpr), P.instanceOf(IdentifierExpr)],
            ([lhs, rhs]) => lhs.name === rhs.name,
        )
        .with(
            [P.instanceOf(UnaryExpr), P.instanceOf(UnaryExpr)],
            ([lhs, rhs]) =>
                lhs.op === rhs.op &&
                expressionsEqual(lhs.operand, rhs.operand),
        )
        .with(
            [P.instanceOf(BinaryExpr), P.instanceOf(BinaryExpr)],
            ([lhs, rhs]) =>
                lhs.op === rhs.op &&
                expressionsEqual(lhs.left, rhs.left) &&
                expressionsEqual(lhs.right, rhs.right),
        )
        .otherwise(() => false);
}

function arrayLengthsEqual(
    left: Expression | undefined,
    right: Expression | undefined,
): boolean {
    if (left === undefined || right === undefined) {
        return left === right;
    }

    const leftValue = evaluateConstInt(left);
    const rightValue = evaluateConstInt(right);
    if (leftValue !== undefined && rightValue !== undefined) {
        return leftValue === rightValue;
    }

    return expressionsEqual(left, right);
}

/**
 * Get a human-readable name for a TypeNode.
 */
function typeToString(ty: TypeNode): string {
    if (ty instanceof NamedTypeNode) {
        if (ty.args !== undefined) {
            return `${ty.name}<${ty.args.args.map(typeToString).join(", ")}>`;
        }
        return ty.name;
    }
    if (ty instanceof TupleTypeNode) {
        if (ty.elements.length === 0) {
            return "()";
        }
        return `(${ty.elements.map(typeToString).join(", ")})`;
    }
    if (ty instanceof RefTypeNode) {
        const mutStr = match(ty.mutability)
            .with(Mutability.Mutable, () => "mut ")
            .otherwise(() => "");
        return `&${mutStr}${typeToString(ty.inner)}`;
    }
    if (ty instanceof PtrTypeNode) {
        const pointerKind = match(ty.mutability)
            .with(Mutability.Mutable, () => "*mut ")
            .otherwise(() => "*const ");
        return `${pointerKind}${typeToString(ty.inner)}`;
    }
    if (ty instanceof ArrayTypeNode) {
        if (ty.length === undefined) {
            return `[${typeToString(ty.element)}]`;
        }
        return `[${typeToString(ty.element)}; ${renderConstExpr(ty.length)}]`;
    }
    if (ty instanceof FnTypeNode) {
        const params = ty.params.map(typeToString).join(", ");
        return `fn(${params}) -> ${typeToString(ty.returnType)}`;
    }
    if (ty instanceof InferredTypeNode) {
        return "_";
    }
    if (ty instanceof OptionTypeNode) {
        return `Option<${typeToString(ty.inner)}>`;
    }
    if (ty instanceof ResultTypeNode) {
        return `Result<${typeToString(ty.okType)}, ${typeToString(ty.errType)}>`;
    }
    return "<unknown>";
}

/**
 * Check if two types are structurally equivalent.
 */
function typesEqualList(left: TypeNode[], right: TypeNode[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((type, index) => typesEqual(type, right[index]));
}

function genericArgsEqual(
    left: GenericArgsNode | undefined,
    right: GenericArgsNode | undefined,
): boolean {
    if ((left === undefined) !== (right === undefined)) {
        return false;
    }
    if (left === undefined || right === undefined) {
        return true;
    }
    return typesEqualList(left.args, right.args);
}

function typesEqualSimple(a: TypeNode, b: TypeNode): boolean {
    return match([a, b] as const)
        .with(
            [P.instanceOf(NamedTypeNode), P.instanceOf(NamedTypeNode)],
            ([x, y]) => x.name === y.name && genericArgsEqual(x.args, y.args),
        )
        .with(
            [P.instanceOf(TupleTypeNode), P.instanceOf(TupleTypeNode)],
            ([x, y]) => typesEqualList(x.elements, y.elements),
        )
        .with(
            [P.instanceOf(ArrayTypeNode), P.instanceOf(ArrayTypeNode)],
            ([x, y]) =>
                arrayLengthsEqual(x.length, y.length) &&
                typesEqual(x.element, y.element),
        )
        .otherwise(() => false);
}

function typesEqualCompound(a: TypeNode, b: TypeNode): boolean {
    return match([a, b] as const)
        .with(
            [P.instanceOf(RefTypeNode), P.instanceOf(RefTypeNode)],
            ([x, y]) => x.mutability === y.mutability && typesEqual(x.inner, y.inner),
        )
        .with(
            [P.instanceOf(PtrTypeNode), P.instanceOf(PtrTypeNode)],
            ([x, y]) => x.mutability === y.mutability && typesEqual(x.inner, y.inner),
        )
        .with(
            [P.instanceOf(FnTypeNode), P.instanceOf(FnTypeNode)],
            ([x, y]) =>
                typesEqualList(x.params, y.params) &&
                typesEqual(x.returnType, y.returnType),
        )
        .with(
            [P.instanceOf(OptionTypeNode), P.instanceOf(OptionTypeNode)],
            ([x, y]) => typesEqual(x.inner, y.inner),
        )
        .with(
            [P.instanceOf(ResultTypeNode), P.instanceOf(ResultTypeNode)],
            ([x, y]) => typesEqual(x.okType, y.okType) && typesEqual(x.errType, y.errType),
        )
        .otherwise(() => false);
}

function typesEqual(a: TypeNode, b: TypeNode): boolean {
    if (isInferredPlaceholder(a) || isInferredPlaceholder(b)) {
        return true;
    }
    return typesEqualSimple(a, b) || typesEqualCompound(a, b);
}

function makeOptionType(span: Span, innerTy?: TypeNode): OptionTypeNode {
    return new OptionTypeNode(span, innerTy ?? new InferredTypeNode(span));
}

function makeResultType(
    span: Span,
    okTy?: TypeNode,
    errTy?: TypeNode,
): ResultTypeNode {
    return new ResultTypeNode(
        span,
        okTy ?? new InferredTypeNode(span),
        errTy ?? new InferredTypeNode(span),
    );
}

function getOptionResultRefSuggestion(ty: RefTypeNode): string | undefined {
    if (ty.inner instanceof OptionTypeNode) {
        return typeToString(
            makeOptionType(
                ty.span,
                new RefTypeNode(ty.span, ty.mutability, ty.inner.inner),
            ),
        );
    }
    if (ty.inner instanceof ResultTypeNode) {
        return typeToString(
            makeResultType(
                ty.span,
                new RefTypeNode(ty.span, ty.mutability, ty.inner.okType),
                ty.inner.errType,
            ),
        );
    }
    return undefined;
}

function getRefOptionResultFallback(
    innerName: string,
    mutability: Mutability,
): string {
    let refType = "&T";
    if (mutability === Mutability.Mutable) {
        refType = "&mut T";
    }
    return `${innerName}<${refType}>`;
}

function validateNamedTypeNode(
    typeCtx: TypeContext,
    ty: NamedTypeNode,
    genericNames: Set<string>,
): TypeError[] {
    const errors: TypeError[] = [];
    const builtIn = isBuiltinTypeName(ty.name);
    const known = typeCtx.lookupNamedType(ty.name);
    const generic = genericNames.has(ty.name);
    if (!known && !builtIn && !generic) {
        errors.push({
            message: `Unknown type \`${ty.name}\``,
            span: ty.span,
        });
    }
    if (ty.args !== undefined) {
        for (const arg of ty.args.args) {
            errors.push(...validateTypeNode(typeCtx, arg, genericNames));
        }
    }
    return errors;
}

function validateRefTypeNode(
    typeCtx: TypeContext,
    ty: RefTypeNode,
    genericNames: Set<string>,
): TypeError[] {
    const errors: TypeError[] = [];
    if (ty.inner instanceof OptionTypeNode) {
        const suggestion = getOptionResultRefSuggestion(ty);
        let suggestedType = suggestion;
        suggestedType ??= getRefOptionResultFallback("Option", ty.mutability);
        errors.push({
            message: `cannot use \`${typeToString(ty)}\`; use \`${suggestedType}\` instead`,
            span: ty.span,
        });
    } else if (ty.inner instanceof ResultTypeNode) {
        const suggestion = getOptionResultRefSuggestion(ty);
        let suggestedType = suggestion;
        suggestedType ??= getRefOptionResultFallback("Result", ty.mutability);
        errors.push({
            message: `cannot use \`${typeToString(ty)}\`; use \`${suggestedType}\` instead`,
            span: ty.span,
        });
    }
    errors.push(...validateTypeNode(typeCtx, ty.inner, genericNames));
    return errors;
}

function validateCompositeTypeNode(
    typeCtx: TypeContext,
    ty: TypeNode,
    genericNames: Set<string>,
): TypeError[] {
    const errors: TypeError[] = [];
    if (ty instanceof TupleTypeNode) {
        for (const element of ty.elements) {
            errors.push(...validateTypeNode(typeCtx, element, genericNames));
        }
        return errors;
    }
    if (ty instanceof ArrayTypeNode) {
        errors.push(...validateTypeNode(typeCtx, ty.element, genericNames));
        return errors;
    }
    if (ty instanceof PtrTypeNode) {
        errors.push(...validateTypeNode(typeCtx, ty.inner, genericNames));
        return errors;
    }
    if (ty instanceof FnTypeNode) {
        for (const paramTy of ty.params) {
            errors.push(...validateTypeNode(typeCtx, paramTy, genericNames));
        }
        errors.push(...validateTypeNode(typeCtx, ty.returnType, genericNames));
        return errors;
    }
    return errors;
}

function validateTypeNode(
    typeCtx: TypeContext,
    ty: TypeNode,
    genericNames: Set<string>,
): TypeError[] {
    if (ty instanceof InferredTypeNode) {
        return [];
    }
    if (ty instanceof NamedTypeNode) {
        return validateNamedTypeNode(typeCtx, ty, genericNames);
    }
    if (ty instanceof RefTypeNode) {
        return validateRefTypeNode(typeCtx, ty, genericNames);
    }
    if (ty instanceof OptionTypeNode) {
        return validateTypeNode(typeCtx, ty.inner, genericNames);
    }
    if (ty instanceof ResultTypeNode) {
        return [
            ...validateTypeNode(typeCtx, ty.okType, genericNames),
            ...validateTypeNode(typeCtx, ty.errType, genericNames),
        ];
    }
    return validateCompositeTypeNode(typeCtx, ty, genericNames);
}

// --- Comparison and logical ops that return bool ---
const COMPARISON_OPS = new Set([
    BinaryOp.Eq,
    BinaryOp.Ne,
    BinaryOp.Lt,
    BinaryOp.Le,
    BinaryOp.Gt,
    BinaryOp.Ge,
]);

const LOGICAL_OPS = new Set([BinaryOp.And, BinaryOp.Or]);

// --- Item Registration ---

function registerStructTypeWithPrefix(
    typeCtx: TypeContext,
    node: StructItem | GenericStructItem,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    const qualName = qualify(node.name);
    const fields: FieldWithType[] = node.fields.map((f) => ({
        name: f.name,
        ty: f.typeNode,
    }));
    typeCtx.registerNamedType(qualName, new TupleTypeNode(node.span, []));
    typeCtx.registerStructFields(qualName, fields);
    if (modulePrefix) {
        typeCtx.registerNamedType(node.name, new TupleTypeNode(node.span, []));
        typeCtx.registerStructFields(node.name, fields);
    }
}

function registerConstWithPrefix(
    typeCtx: TypeContext,
    node: ConstItem,
    qualify: (name: string) => string,
    modulePrefix: string,
    selfTypeName?: string,
): void {
    const binding: ConstBindingInfo = {
        typeNode: node.typeNode,
        value: node.value,
        selfTypeName,
    };
    const qualifiedName = qualify(node.name);
    typeCtx.registerNamedConst(qualifiedName, binding);
    if (modulePrefix) {
        typeCtx.registerNamedConst(node.name, binding);
    }
}

function registerImplConstsWithPrefix(
    typeCtx: TypeContext,
    node: ImplItem,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    const targetName = node.target.name;
    const qualifiedTargetName = qualify(targetName);
    for (const constItem of node.constItems) {
        const binding: ConstBindingInfo = {
            typeNode: constItem.typeNode,
            value: constItem.value,
            selfTypeName: targetName,
        };
        typeCtx.registerNamedConst(
            `${qualifiedTargetName}::${constItem.name}`,
            binding,
        );
        if (modulePrefix) {
            typeCtx.registerNamedConst(
                `${targetName}::${constItem.name}`,
                binding,
            );
        }
    }
}

function registerImplMethodsWithPrefix(
    typeCtx: TypeContext,
    node: ImplItem,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    let targetName: string | undefined;
    if (node.target instanceof NamedTypeNode) {
        targetName = node.target.name;
    }
    if (!targetName) return;
    const qTarget = qualify(targetName);
    for (const method of node.methods) {
        // Resolve `Self` → concrete type so callers get the concrete return type
        const returnType = resolveSelf(method.returnType, targetName);
        typeCtx.registerFnSignature(`${qTarget}::${method.name}`, {
            params: buildParamList(method.params),
            returnType,
        });
        if (modulePrefix) {
            typeCtx.registerFnSignature(`${targetName}::${method.name}`, {
                params: buildParamList(method.params),
                returnType,
            });
        }
    }
}

function traitConstDefaults(
    traitItem: TraitItem,
    implConsts: ConstItem[],
    selfTypeName: string,
): Map<string, ConstBindingInfo> {
    const overrides = new Map(implConsts.map((item) => [item.name, item]));
    const bindings = new Map<string, ConstBindingInfo>();
    for (const traitConst of traitItem.constItems) {
        const override = overrides.get(traitConst.name);
        if (override) {
            bindings.set(
                traitConst.name,
                {
                    typeNode: override.typeNode,
                    value: override.value,
                    selfTypeName,
                },
            );
            continue;
        }
        if (traitConst.value) {
            bindings.set(
                traitConst.name,
                {
                    typeNode: traitConst.typeNode,
                    value: traitConst.value,
                    selfTypeName,
                },
            );
        }
    }
    return bindings;
}

function registerTraitImplConstsWithPrefix(
    typeCtx: TypeContext,
    node: TraitImplItem,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    const targetName = node.target.name;
    const qualifiedTargetName = qualify(targetName);
    const bindings = new Map<string, ConstBindingInfo>();

    for (const constItem of node.constItems) {
        bindings.set(
            constItem.name,
            {
                typeNode: constItem.typeNode,
                value: constItem.value,
                selfTypeName: targetName,
            },
        );
    }

    const defaults = traitConstDefaults(node.trait, node.constItems, targetName);
    for (const [name, binding] of defaults) {
        if (!bindings.has(name)) {
            bindings.set(name, binding);
        }
    }

    for (const [name, binding] of bindings) {
        typeCtx.registerNamedConst(`${qualifiedTargetName}::${name}`, binding);
        if (modulePrefix) {
            typeCtx.registerNamedConst(`${targetName}::${name}`, binding);
        }
    }
}

function registerTraitImplMethodsWithPrefix(
    typeCtx: TypeContext,
    node: TraitImplItem,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    let targetName: string | undefined;
    if (node.target instanceof NamedTypeNode) {
        targetName = node.target.name;
    }
    if (!targetName) return;
    const qTarget = qualify(targetName);
    for (const method of node.fnImpls) {
        const resolvedParams = method.params.map((param) => ({
            ...param,
            ty: resolveSelf(param.ty, targetName),
        }));
        const resolvedReturnType = resolveSelf(method.returnType, targetName);
        typeCtx.registerFnSignature(`${qTarget}::${method.name}`, {
            params: buildParamList(resolvedParams),
            returnType: resolvedReturnType,
        });
        if (modulePrefix) {
            typeCtx.registerFnSignature(`${targetName}::${method.name}`, {
                params: buildParamList(resolvedParams),
                returnType: resolvedReturnType,
            });
        }
    }
}

function registerEnumItemType(
    typeCtx: TypeContext,
    node: EnumItem,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    const qualName = qualify(node.name);
    typeCtx.registerNamedType(qualName, new TupleTypeNode(node.span, []));
    if (modulePrefix) {
        typeCtx.registerNamedType(node.name, new TupleTypeNode(node.span, []));
    }
    for (const variant of node.variants) {
        typeCtx.registerVariantOwner(variant.name, node.name);
    }
}

function registerItemTypesWithPrefix(
    typeCtx: TypeContext,
    items: Item[],
    modulePrefix: string,
): void {
    const qualify = (name: string): string => {
        if (modulePrefix === "") {
            return name;
        }
        return `${modulePrefix}::${name}`;
    };

    for (const node of items) {
        registerItemTypeWithPrefix(typeCtx, node, qualify, modulePrefix);
    }
}

function registerItemTypeWithPrefix(
    typeCtx: TypeContext,
    node: Item,
    qualify: (name: string) => string,
    modulePrefix: string,
): void {
    if (node instanceof StructItem || node instanceof GenericStructItem) {
        registerStructTypeWithPrefix(typeCtx, node, qualify, modulePrefix);
        return;
    }
    if (node instanceof EnumItem) {
        registerEnumItemType(typeCtx, node, qualify, modulePrefix);
        return;
    }
    if (node instanceof ConstItem) {
        registerConstWithPrefix(typeCtx, node, qualify, modulePrefix);
        return;
    }
    if (node instanceof GenericFnItem) {
        const qualifiedName = qualify(node.name);
        typeCtx.registerFnSignature(qualifiedName, {
            params: buildParamList(node.params),
            returnType: node.returnType,
        });
        typeCtx.registerGenericFn(qualifiedName, node);
        return;
    }
    if (node instanceof FnItem) {
        typeCtx.registerFnSignature(qualify(node.name), {
            params: buildParamList(node.params),
            returnType: node.returnType,
        });
        return;
    }
    if (node instanceof ImplItem) {
        registerImplConstsWithPrefix(typeCtx, node, qualify, modulePrefix);
        registerImplMethodsWithPrefix(typeCtx, node, qualify, modulePrefix);
        return;
    }
    if (node instanceof TraitImplItem) {
        registerTraitImplConstsWithPrefix(typeCtx, node, qualify, modulePrefix);
        registerTraitImplMethodsWithPrefix(typeCtx, node, qualify, modulePrefix);
        return;
    }
    if (node instanceof ModItem) {
        registerItemTypesWithPrefix(typeCtx, node.items, qualify(node.name));
        return;
    }
    if (node instanceof UseItem) {
        registerUseItemAlias(typeCtx, node);
    }
}

function registerUseItemAlias(typeCtx: TypeContext, node: UseItem): void {
    if (node.path.length === 0) return;
    const fullPath = node.path.join("::");
    const localName = node.alias ?? node.path[node.path.length - 1];

    // Avoid re-registering if the local name matches the last segment (no alias)
    if (localName === fullPath) return;

    const lookupPaths = [fullPath];
    if (node.path[0] === "self" && node.path.length > 1) {
        lookupPaths.push(node.path.slice(1).join("::"));
    }

    for (const path of lookupPaths) {
        const sig = typeCtx.lookupFnSignature(path);
        if (sig) {
            typeCtx.registerFnSignature(localName, sig);
            break;
        }
    }

    for (const path of lookupPaths) {
        const binding = typeCtx.lookupNamedConst(path);
        if (!binding) {
            continue;
        }
        typeCtx.registerNamedConst(localName, binding);
        break;
    }
}

// --- Expression Type Inference ---

function inferExprType(
    typeCtx: TypeContext,
    expr: Expression,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    // Check if we already resolved this expression
    const cached = typeCtx.getExpressionType(expr);
    if (cached) {
        return Result.ok(cached);
    }

    const result = inferExprTypeInner(typeCtx, expr);
    if (result.isOk() && result.value !== undefined) {
        typeCtx.setExpressionType(expr, result.value);
    }
    if (result.isErr() && result.error.fallback !== undefined) {
        typeCtx.setExpressionType(expr, result.error.fallback);
    }
    return result;
}

function inferExprTypeInner(
    typeCtx: TypeContext,
    expr: Expression,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    if (expr instanceof LiteralExpr) {
        return inferLiteral(expr);
    }

    if (expr instanceof IdentifierExpr) {
        return inferIdentifier(typeCtx, expr);
    }

    if (expr instanceof BinaryExpr) {
        return inferBinary(typeCtx, expr);
    }

    if (expr instanceof UnaryExpr) {
        return inferUnary(typeCtx, expr);
    }

    if (expr instanceof CallExpr) {
        return inferCall(typeCtx, expr);
    }

    if (expr instanceof FieldExpr) {
        return inferFieldAccess(typeCtx, expr);
    }

    if (expr instanceof StructExpr) {
        return inferStructLiteral(typeCtx, expr);
    }

    if (expr instanceof BlockExpr) {
        return inferBlock(typeCtx, expr);
    }

    if (expr instanceof IfExpr) {
        return inferIf(typeCtx, expr);
    }

    if (expr instanceof RefExpr) {
        return inferRef(typeCtx, expr);
    }

    if (expr instanceof MatchExpr) {
        return inferMatch(typeCtx, expr);
    }

    if (expr instanceof ClosureExpr) {
        return Result.ok(expr.returnType);
    }

    return inferExprTypeExtended(typeCtx, expr);
}

function inferVecMacro(
    typeCtx: TypeContext,
    expr: MacroExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    let elemType: TypeNode | undefined;
    if (expr.args.length > 0) {
        const [firstArg] = expr.args;
        const firstResult = inferExprType(typeCtx, firstArg);
        if (firstResult.isErr()) {
            errors.push(...firstResult.error.errors);
            elemType = firstResult.error.fallback;
        } else {
            elemType = firstResult.value;
        }
    }
    for (const [index, arg] of expr.args.entries()) {
        const argResult = inferExprType(typeCtx, arg);
        let argType: TypeNode | undefined;
        if (argResult.isErr()) {
            errors.push(...argResult.error.errors);
            argType = argResult.error.fallback;
        } else {
            argType = argResult.value;
        }
        if (index > 0 && elemType && argType && !typesEqual(elemType, argType)) {
            errors.push({
                message: `Type mismatch in vec! macro: expected \`${typeToString(elemType)}\`, found \`${typeToString(argType)}\``,
                span: arg.span,
            });
        }
    }
    if (!elemType) {
        if (errors.length > 0) {
            return Result.err({ errors, fallback: undefined });
        }
        return Result.ok(undefined);
    }
    const inferredType = new ArrayTypeNode(expr.span, elemType, undefined);
    if (errors.length > 0) {
        return Result.err({ errors, fallback: inferredType });
    }
    return Result.ok(inferredType);
}

function inferIndexExpr(
    typeCtx: TypeContext,
    expr: IndexExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const receiverResult = inferExprType(typeCtx, expr.receiver);
    let receiverType: TypeNode | undefined;
    if (receiverResult.isErr()) {
        errors.push(...receiverResult.error.errors);
        receiverType = receiverResult.error.fallback;
    } else {
        receiverType = receiverResult.value;
    }
    const indexResult = inferExprType(typeCtx, expr.index);
    if (indexResult.isErr()) {
        errors.push(...indexResult.error.errors);
    }
    if (receiverType instanceof ArrayTypeNode) {
        if (errors.length > 0) {
            return Result.err({
                errors,
                fallback: receiverType.element,
            });
        }
        return Result.ok(receiverType.element);
    }
    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

function inferRangeExpr(
    typeCtx: TypeContext,
    expr: RangeExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    if (expr.start !== undefined) {
        const startResult = inferExprType(typeCtx, expr.start);
        if (startResult.isErr()) {
            errors.push(...startResult.error.errors);
        }
    }
    if (expr.end !== undefined) {
        const endResult = inferExprType(typeCtx, expr.end);
        if (endResult.isErr()) {
            errors.push(...endResult.error.errors);
        }
    }
    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

function inferExprTypeExtended(
    typeCtx: TypeContext,
    expr: Expression,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    if (expr instanceof DerefExpr) {
        return inferDeref(typeCtx, expr);
    }

    if (expr instanceof MacroExpr && expr.name === "vec") {
        return inferVecMacro(typeCtx, expr);
    }

    if (
        expr instanceof MacroExpr ||
        expr instanceof WhileExpr ||
        expr instanceof ForExpr ||
        expr instanceof LoopExpr ||
        expr instanceof AssignExpr
    ) {
        return inferUnitExpr(typeCtx, expr);
    }

    if (
        expr instanceof ReturnExpr ||
        expr instanceof BreakExpr ||
        expr instanceof ContinueExpr
    ) {
        return inferDivergingExpr(typeCtx, expr);
    }

    if (expr instanceof IndexExpr) {
        return inferIndexExpr(typeCtx, expr);
    }

    if (expr instanceof RangeExpr) {
        return inferRangeExpr(typeCtx, expr);
    }

    return Result.err({
        errors: [
            {
                message: `Unhandled expression type in inference: ${expr.constructor.name}`,
                span: expr.span,
            },
        ],
        fallback: undefined,
    });
}

function inferLiteral(
    expr: LiteralExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    switch (expr.literalKind) {
        case LiteralKind.Int: {
            return Result.ok(new NamedTypeNode(expr.span, "i32"));
        }
        case LiteralKind.Float: {
            return Result.ok(new NamedTypeNode(expr.span, "f64"));
        }
        case LiteralKind.Bool: {
            return Result.ok(new NamedTypeNode(expr.span, "bool"));
        }
        case LiteralKind.String: {
            return Result.ok(
                new RefTypeNode(
                    expr.span,
                    Mutability.Immutable,
                    new NamedTypeNode(expr.span, "str"),
                ),
            );
        }
        case LiteralKind.Char: {
            return Result.ok(new NamedTypeNode(expr.span, "char"));
        }
        default: {
            return Result.err({
                errors: [
                    {
                        message: `Unhandled literal kind in inference: ${String(expr.literalKind)}`,
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
    }
}

function inferIdentifier(
    typeCtx: TypeContext,
    expr: IdentifierExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const varTy = typeCtx.lookupVariable(expr.name);
    if (varTy) {
        return Result.ok(varTy);
    }

    const constBinding = typeCtx.lookupConst(expr.name);
    if (constBinding) {
        return Result.ok(constBinding.typeNode);
    }

    const fnSig = typeCtx.lookupFnSignature(expr.name);
    if (fnSig) {
        return Result.err({
            errors: [
                {
                    message: `\`${expr.name}\` is a function and cannot be used as a first-class value`,
                    span: expr.span,
                },
            ],
            fallback: undefined,
        });
    }

    const namedTy = typeCtx.lookupNamedType(expr.name);
    if (namedTy) {
        return Result.err({
            errors: [
                {
                    message: `\`${expr.name}\` is a type and cannot be used as a value`,
                    span: expr.span,
                },
            ],
            fallback: undefined,
        });
    }

    // `None` and `Some` refer to builtin Option variants unless a user-defined
    // enum has a variant with the same name, in which case we let the type
    // propagate naturally (return undefined, no error).
    if (expr.name === "None" || expr.name === "Some") {
        const owner = typeCtx.lookupVariantOwner(expr.name);
        if (owner && owner !== "Option") {
            return Result.ok(undefined);
        }
        return Result.ok(makeOptionType(expr.span));
    }

    if (
        expr.name === "Ok" ||
        expr.name === "Result::Ok" ||
        expr.name === "Err" ||
        expr.name === "Result::Err"
    ) {
        const owner = typeCtx.lookupVariantOwner(expr.name);
        if (owner && owner !== "Result") {
            return Result.ok(undefined);
        }
        return Result.ok(makeResultType(expr.span));
    }

    // Qualified paths (e.g. `Color::Green`, `Vec::new`) are enum variants or
    // associated items not represented in the current registries. Return
    // undefined without an error; type propagation will handle the absence.
    if (expr.name.includes("::")) {
        return Result.ok(undefined);
    }

    return Result.err({
        errors: [
            {
                message: `Cannot find value \`${expr.name}\` in this scope`,
                span: expr.span,
            },
        ],
        fallback: undefined,
    });
}

function derefType(ty: TypeNode): TypeNode {
    if (ty instanceof RefTypeNode) {
        return ty.inner;
    }
    return ty;
}

function inferBinary(
    typeCtx: TypeContext,
    expr: BinaryExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const leftTy = mergeInferResult(errors, inferExprType(typeCtx, expr.left));
    const rightTy = mergeInferResult(errors, inferExprType(typeCtx, expr.right));

    // Comparison and logical operators always produce bool
    if (COMPARISON_OPS.has(expr.op) || LOGICAL_OPS.has(expr.op)) {
        return inferResultFrom(new NamedTypeNode(expr.span, "bool"), errors);
    }

    // Arithmetic/bitwise operators: auto-deref references (Rust coerces &T op &T → T op T → T)
    let leftBase: TypeNode | undefined;
    if (leftTy) {
        leftBase = derefType(leftTy);
    }
    let rightBase: TypeNode | undefined;
    if (rightTy) {
        rightBase = derefType(rightTy);
    }

    if (leftBase && rightBase) {
        if (
            !isInferredPlaceholder(leftBase) &&
            !isInferredPlaceholder(rightBase) &&
            !typesEqual(leftBase, rightBase)
        ) {
            errors.push({
                message: `Type mismatch in binary expression: \`${typeToString(leftBase)}\` and \`${typeToString(rightBase)}\``,
                span: expr.span,
            });
        }
    }

    return inferResultFrom(leftBase ?? rightBase, errors);
}

function inferUnary(
    typeCtx: TypeContext,
    expr: UnaryExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const operandTy = mergeInferResult(
        errors,
        inferExprType(typeCtx, expr.operand),
    );

    if (expr.op === UnaryOp.Not) {
        // `!` on bool returns bool; on integers returns the integer type
        if (operandTy instanceof NamedTypeNode && operandTy.name === "bool") {
            return inferResultFrom(new NamedTypeNode(expr.span, "bool"), errors);
        }
        return inferResultFrom(operandTy, errors);
    }

    if (expr.op === UnaryOp.Neg) {
        return inferResultFrom(operandTy, errors);
    }

    if (expr.op === UnaryOp.Ref) {
        if (operandTy) {
            return inferResultFrom(
                new RefTypeNode(expr.span, Mutability.Immutable, operandTy),
                errors,
            );
        }
    }

    if (expr.op === UnaryOp.Deref) {
        if (operandTy instanceof RefTypeNode) {
            return inferResultFrom(operandTy.inner, errors);
        }
        if (operandTy) {
            errors.push({
                message: `Cannot dereference value of type \`${typeToString(operandTy)}\``,
                span: expr.span,
            });
        }
        return Result.err({ errors, fallback: undefined });
    }

    return inferResultFrom(operandTy, errors);
}

function inferDeref(
    typeCtx: TypeContext,
    expr: DerefExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const targetResult = inferExprType(typeCtx, expr.target);
    let targetTy: TypeNode | undefined;
    if (targetResult.isErr()) {
        errors.push(...targetResult.error.errors);
        targetTy = targetResult.error.fallback;
    } else {
        targetTy = targetResult.value;
    }
    if (targetTy instanceof RefTypeNode) {
        if (errors.length > 0) {
            return Result.err({ errors, fallback: targetTy.inner });
        }
        return Result.ok(targetTy.inner);
    }
    if (targetTy) {
        errors.push({
            message: `Cannot dereference value of type \`${typeToString(targetTy)}\``,
            span: expr.span,
        });
    }
    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

function inferUnitExpr(
    typeCtx: TypeContext,
    expr: MacroExpr | WhileExpr | ForExpr | LoopExpr | AssignExpr,
): Result<TupleTypeNode, InferFailure<TupleTypeNode>> {
    const errors: TypeError[] = [];
    if (expr instanceof WhileExpr) {
        mergeInferResult(errors, inferExprType(typeCtx, expr.condition));
        mergeInferResult(errors, inferBlock(typeCtx, expr.body));
    } else if (expr instanceof ForExpr) {
        mergeInferResult(errors, inferExprType(typeCtx, expr.iter));
        mergeInferResult(errors, inferBlock(typeCtx, expr.body));
    } else if (expr instanceof LoopExpr) {
        mergeInferResult(errors, inferBlock(typeCtx, expr.body));
    } else if (expr instanceof AssignExpr) {
        mergeInferResult(errors, inferExprType(typeCtx, expr.target));
        mergeInferResult(errors, inferExprType(typeCtx, expr.value));
    } else {
        for (const arg of expr.args) {
            mergeInferResult(errors, inferExprType(typeCtx, arg));
        }
    }
    return inferResultFrom(new TupleTypeNode(expr.span, []), errors);
}

function inferDivergingExpr(
    typeCtx: TypeContext,
    expr: ReturnExpr | BreakExpr | ContinueExpr,
): Result<undefined, InferFailure<undefined>> {
    const errors: TypeError[] = [];
    if (expr instanceof ReturnExpr && expr.value !== undefined) {
        const valResult = inferExprType(typeCtx, expr.value);
        if (valResult.isErr()) {
            errors.push(...valResult.error.errors);
        }
    } else if (expr instanceof BreakExpr && expr.value !== undefined) {
        const valResult = inferExprType(typeCtx, expr.value);
        if (valResult.isErr()) {
            errors.push(...valResult.error.errors);
        }
    }
    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

function inferCall(
    typeCtx: TypeContext,
    expr: CallExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    // Infer argument types for side effects (populates type context)
    const errors: TypeError[] = [];
    const argTypes: (TypeNode | undefined)[] = [];
    for (const arg of expr.args) {
        const argResult = inferExprType(typeCtx, arg);
        if (argResult.isErr()) {
            errors.push(...argResult.error.errors);
            argTypes.push(argResult.error.fallback);
        } else {
            argTypes.push(argResult.value);
        }
    }

    if (expr.callee instanceof IdentifierExpr) {
        const callResult = inferIdentifierCallType(
            typeCtx,
            expr,
            expr.callee,
            argTypes,
        );
        if (callResult.isErr()) {
            const combinedErrors = [...errors, ...callResult.error.errors];
            return Result.err({
                errors: combinedErrors,
                fallback: callResult.error.fallback,
            });
        }
        if (errors.length > 0) {
            return Result.err({ errors, fallback: callResult.value });
        }
        return Result.ok(callResult.value);
    }

    if (expr.callee instanceof FieldExpr) {
        const callResult = inferMethodCallType(typeCtx, expr);
        if (callResult.isErr()) {
            const combinedErrors = [...errors, ...callResult.error.errors];
            return Result.err({
                errors: combinedErrors,
                fallback: callResult.error.fallback,
            });
        }
        if (errors.length > 0) {
            return Result.err({ errors, fallback: callResult.value });
        }
        return Result.ok(callResult.value);
    }

    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

const BUILTIN_ENUM_CONSTRUCTOR_NAMES = new Set([
    "Some",
    "Option::Some",
    "None",
    "Option::None",
    "Ok",
    "Result::Ok",
    "Err",
    "Result::Err",
]);

function inferBuiltinEnumCallType(
    expr: CallExpr,
    calleeName: string,
    argTypes: (TypeNode | undefined)[],
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    if (calleeName === "Some" || calleeName === "Option::Some") {
        if (expr.args.length !== 1) {
            return Result.err({
                errors: [
                    {
                        message: "`Some` requires exactly one argument",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        const [innerTy] = argTypes;
        return Result.ok(makeOptionType(expr.span, innerTy));
    }
    if (calleeName === "None" || calleeName === "Option::None") {
        if (expr.args.length > 0) {
            return Result.err({
                errors: [
                    {
                        message: "`None` does not take any arguments",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(makeOptionType(expr.span));
    }
    if (calleeName === "Ok" || calleeName === "Result::Ok") {
        if (expr.args.length !== 1) {
            return Result.err({
                errors: [
                    {
                        message: "`Ok` requires exactly one argument",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        const [okTy] = argTypes;
        return Result.ok(makeResultType(expr.span, okTy));
    }
    // Err or Result::Err
    if (expr.args.length !== 1) {
        return Result.err({
            errors: [
                {
                    message: "`Err` requires exactly one argument",
                    span: expr.span,
                },
            ],
            fallback: undefined,
        });
    }
    const [errTy] = argTypes;
    return Result.ok(makeResultType(expr.span, undefined, errTy));
}

function inferIdentifierCallType(
    typeCtx: TypeContext,
    expr: CallExpr,
    callee: IdentifierExpr,
    argTypes: (TypeNode | undefined)[],
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const { name: calleeName } = callee;

    if (BUILTIN_ENUM_CONSTRUCTOR_NAMES.has(calleeName)) {
        return inferBuiltinEnumCallType(expr, calleeName, argTypes);
    }

    const genericResult = resolveGenericCall(typeCtx, expr, argTypes);
    if (genericResult) {
        return Result.ok(genericResult);
    }

    const sig = typeCtx.lookupFnSignature(calleeName);
    if (sig) {
        return Result.ok(sig.returnType);
    }

    // Qualified paths (e.g. `Vec::new`) are not yet tracked — skip
    if (!calleeName.includes("::")) {
        return Result.err({
            errors: [
                {
                    message: `cannot find function \`${calleeName}\` in this scope`,
                    span: callee.span,
                },
            ],
            fallback: undefined,
        });
    }
    return Result.ok(undefined);
}

function inferOptionMethodType(
    expr: CallExpr,
    receiverTy: OptionTypeNode,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const { callee } = expr;
    if (!(callee instanceof FieldExpr)) {
        return Result.ok(undefined);
    }
    const { inner } = receiverTy;
    const boolTy = new NamedTypeNode(callee.span, "bool");
    if (callee.field === "is_some" || callee.field === "is_none") {
        if (expr.args.length > 0) {
            return Result.err({
                errors: [
                    {
                        message: `\`${callee.field}\` does not take any arguments`,
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(boolTy);
    }
    if (callee.field === "unwrap") {
        if (expr.args.length > 0) {
            return Result.err({
                errors: [
                    {
                        message: "`unwrap` does not take any arguments",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(inner);
    }
    if (callee.field === "expect") {
        if (expr.args.length !== 1) {
            return Result.err({
                errors: [
                    {
                        message: "`expect` requires exactly one argument",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(inner);
    }
    return Result.ok(undefined);
}

function inferResultMethodType(
    expr: CallExpr,
    receiverTy: ResultTypeNode,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const { callee } = expr;
    if (!(callee instanceof FieldExpr)) {
        return Result.ok(undefined);
    }
    const okTy = receiverTy.okType;
    const errTy = receiverTy.errType;
    const boolTy = new NamedTypeNode(callee.span, "bool");
    if (callee.field === "is_ok" || callee.field === "is_err") {
        if (expr.args.length > 0) {
            return Result.err({
                errors: [
                    {
                        message: `\`${callee.field}\` does not take any arguments`,
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(boolTy);
    }
    if (callee.field === "unwrap") {
        if (expr.args.length > 0) {
            return Result.err({
                errors: [
                    {
                        message: "`unwrap` does not take any arguments",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(okTy);
    }
    if (callee.field === "expect") {
        if (expr.args.length !== 1) {
            return Result.err({
                errors: [
                    {
                        message: "`expect` requires exactly one argument",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(okTy);
    }
    if (callee.field === "unwrap_err") {
        if (expr.args.length > 0) {
            return Result.err({
                errors: [
                    {
                        message: "`unwrap_err` does not take any arguments",
                        span: expr.span,
                    },
                ],
                fallback: undefined,
            });
        }
        return Result.ok(errTy);
    }
    return Result.ok(undefined);
}

const OPTION_RESULT_BUILTIN_METHODS = [
    "is_some",
    "is_none",
    "unwrap",
    "unwrap_or",
    "unwrap_err",
    "ok",
    "err",
] as const;

function checkRefOptionResultMethodCall(
    receiverTy: TypeNode | undefined,
    callee: FieldExpr,
    expr: CallExpr,
    errors: TypeError[],
): boolean {
    if (!(receiverTy instanceof RefTypeNode)) {
        return false;
    }
    let { inner }: { inner: TypeNode } = receiverTy;
    while (inner instanceof RefTypeNode) {
        ({ inner } = inner);
    }
    if (!(inner instanceof OptionTypeNode) && !(inner instanceof ResultTypeNode)) {
        return false;
    }
    if (
        !(OPTION_RESULT_BUILTIN_METHODS as readonly string[]).includes(
            callee.field,
        )
    ) {
        return false;
    }
    if (inner instanceof OptionTypeNode) {
        errors.push({
            message: `cannot call \`${callee.field}\` on \`${typeToString(receiverTy)}\`; method is defined on \`Option\`, not on a reference to it`,
            span: expr.span,
        });
    } else {
        errors.push({
            message: `cannot call \`${callee.field}\` on \`${typeToString(receiverTy)}\`; method is defined on \`Result\`, not on a reference to it`,
            span: expr.span,
        });
    }
    return true;
}

function inferMethodCallType(
    typeCtx: TypeContext,
    expr: CallExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const { callee } = expr;
    if (!(callee instanceof FieldExpr)) {
        return Result.ok(undefined);
    }
    const receiverTy = mergeInferResult(
        errors,
        inferExprType(typeCtx, callee.receiver),
    );

    if (callee.field === "clone") {
        if (expr.args.length > 0) {
            errors.push({
                message: "`clone` does not take any arguments",
                span: expr.span,
            });
            return Result.err({ errors, fallback: undefined });
        }
        if (receiverTy) {
            return inferResultFrom(receiverTy, errors);
        }
    }

    // Reject calling Option/Result builtin methods through a reference — it is a
    // common mistake and the compiler should reject it explicitly.
    if (checkRefOptionResultMethodCall(receiverTy, callee, expr, errors)) {
        return Result.err({ errors, fallback: undefined });
    }

    const builtinResult = inferBuiltinMethodCallType(expr, receiverTy);
    if (builtinResult !== undefined) {
        if (builtinResult.isErr()) {
            return Result.err({
                errors: [...errors, ...builtinResult.error.errors],
                fallback: builtinResult.error.fallback,
            });
        }
        if (builtinResult.value !== undefined) {
            return inferResultFrom(builtinResult.value, errors);
        }
        if (
            receiverTy instanceof OptionTypeNode ||
            receiverTy instanceof ResultTypeNode
        ) {
            errors.push({
                message: `no method \`${callee.field}\` found for type \`${typeToString(receiverTy)}\``,
                span: callee.span,
            });
            return Result.err({ errors, fallback: undefined });
        }
    }

    const userResult = inferUserDefinedMethodType(typeCtx, receiverTy, callee);
    if (userResult.isErr()) {
        return Result.err({
            errors: [...errors, ...userResult.error.errors],
            fallback: userResult.error.fallback,
        });
    }
    return inferResultFrom(userResult.value, errors);
}

function inferBuiltinMethodCallType(
    expr: CallExpr,
    receiverTy: TypeNode | undefined,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> | undefined {
    if (receiverTy instanceof OptionTypeNode) {
        return inferOptionMethodType(expr, receiverTy);
    }
    if (receiverTy instanceof ResultTypeNode) {
        return inferResultMethodType(expr, receiverTy);
    }
    return undefined;
}

function inferUserDefinedMethodType(
    typeCtx: TypeContext,
    receiverTy: TypeNode | undefined,
    callee: FieldExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    if (receiverTy instanceof NamedTypeNode) {
        const methodSig = typeCtx.lookupFnSignature(
            `${receiverTy.name}::${callee.field}`,
        );
        if (methodSig) {
            return Result.ok(methodSig.returnType);
        }
    }
    // Try through references
    if (
        receiverTy instanceof RefTypeNode &&
        receiverTy.inner instanceof NamedTypeNode
    ) {
        const methodSig = typeCtx.lookupFnSignature(
            `${receiverTy.inner.name}::${callee.field}`,
        );
        if (methodSig) {
            return Result.ok(methodSig.returnType);
        }
    }

    // Receiver type is known but no matching method signature was found
    if (receiverTy) {
        return Result.err({
            errors: [
                {
                    message: `no method \`${callee.field}\` found for type \`${typeToString(receiverTy)}\``,
                    span: callee.span,
                },
            ],
            fallback: undefined,
        });
    }
    return Result.ok(undefined);
}

function resolveGenericCall(
    typeCtx: TypeContext,
    expr: CallExpr,
    argTypes: (TypeNode | undefined)[],
): TypeNode | undefined {
    if (!(expr.callee instanceof IdentifierExpr)) return undefined;

    const generic = typeCtx.lookupGenericFn(expr.callee.name);
    if (!generic) return undefined;

    const subs = inferTypeArgs(generic, argTypes, expr.genericArgs);
    if (!subs) return undefined;

    // Store the resolved substitution for use during SSA lowering
    typeCtx.setCallSubstitution(expr, subs);

    // Register the monomorphized specialization's signature
    const specializedName = mangledName(generic.name, subs);
    if (!typeCtx.lookupFnSignature(specializedName)) {
        // Build the substituted return type
        const returnType = substituteTypeNode(generic.returnType, subs);
        const params = buildParamList(generic.params).map((p) => ({
            name: p.name,
            ty: substituteTypeNode(p.ty, subs),
        }));
        typeCtx.registerFnSignature(specializedName, { params, returnType });
    }

    return substituteTypeNode(generic.returnType, subs);
}

function substituteTypeNode(
    ty: TypeNode,
    subs: Map<string, TypeNode>,
): TypeNode {
    if (ty instanceof NamedTypeNode) {
        const replacement = subs.get(ty.name);
        if (replacement) return replacement;
        if (ty.args) {
            const newArgs = new GenericArgsNode(
                ty.args.span,
                ty.args.args.map((a) => substituteTypeNode(a, subs)),
            );
            return new NamedTypeNode(ty.span, ty.name, newArgs);
        }
        return ty;
    }
    if (ty instanceof RefTypeNode) {
        return new RefTypeNode(
            ty.span,
            ty.mutability,
            substituteTypeNode(ty.inner, subs),
        );
    }
    if (ty instanceof TupleTypeNode) {
        return new TupleTypeNode(
            ty.span,
            ty.elements.map((el) => substituteTypeNode(el, subs)),
        );
    }
    if (ty instanceof ArrayTypeNode) {
        return new ArrayTypeNode(
            ty.span,
            substituteTypeNode(ty.element, subs),
            ty.length,
        );
    }
    if (ty instanceof PtrTypeNode) {
        return new PtrTypeNode(
            ty.span,
            ty.mutability,
            substituteTypeNode(ty.inner, subs),
        );
    }
    if (ty instanceof FnTypeNode) {
        return new FnTypeNode(
            ty.span,
            ty.params.map((p) => substituteTypeNode(p, subs)),
            substituteTypeNode(ty.returnType, subs),
        );
    }
    if (ty instanceof OptionTypeNode) {
        return new OptionTypeNode(ty.span, substituteTypeNode(ty.inner, subs));
    }
    if (ty instanceof ResultTypeNode) {
        return new ResultTypeNode(
            ty.span,
            substituteTypeNode(ty.okType, subs),
            substituteTypeNode(ty.errType, subs),
        );
    }
    return ty;
}

function inferFieldAccess(
    typeCtx: TypeContext,
    expr: FieldExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const receiverResult = inferExprType(typeCtx, expr.receiver);
    const errors: TypeError[] = [];
    let receiverTy: TypeNode | undefined;
    if (receiverResult.isErr()) {
        errors.push(...receiverResult.error.errors);
        receiverTy = receiverResult.error.fallback;
    } else {
        receiverTy = receiverResult.value;
    }
    if (!receiverTy) {
        if (errors.length > 0) {
            return Result.err({ errors, fallback: undefined });
        }
        return Result.ok(undefined);
    }

    // Direct struct type
    if (receiverTy instanceof NamedTypeNode) {
        const fieldTy = typeCtx.lookupStructField(receiverTy.name, expr.field);
        if (fieldTy) {
            if (errors.length > 0) {
                return Result.err({ errors, fallback: fieldTy });
            }
            return Result.ok(fieldTy);
        }

        errors.push({
            message: `No field \`${expr.field}\` on type \`${receiverTy.name}\``,
            span: expr.span,
        });
        return Result.err({ errors, fallback: undefined });
    }

    // Auto-deref through references
    if (
        receiverTy instanceof RefTypeNode &&
        receiverTy.inner instanceof NamedTypeNode
    ) {
        const fieldTy = typeCtx.lookupStructField(
            receiverTy.inner.name,
            expr.field,
        );
        if (fieldTy) {
            if (errors.length > 0) {
                return Result.err({ errors, fallback: fieldTy });
            }
            return Result.ok(fieldTy);
        }

        errors.push({
            message: `No field \`${expr.field}\` on type \`${typeToString(receiverTy)}\``,
            span: expr.span,
        });
        return Result.err({ errors, fallback: undefined });
    }

    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

function inferStructLiteral(
    typeCtx: TypeContext,
    expr: StructExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    if (!(expr.path instanceof IdentifierExpr)) {
        return Result.ok(undefined);
    }

    const errors: TypeError[] = [];
    const structName = expr.path.name;
    const structFields = typeCtx.lookupStructFields(structName);

    if (!structFields) {
        return Result.err({
            errors: [
                {
                    message: `Unknown struct \`${structName}\``,
                    span: expr.span,
                },
            ],
            fallback: undefined,
        });
    }

    // Type-check each field initializer
    for (const [fieldName, fieldExpr] of expr.fields) {
        const expectedFieldTy = typeCtx.lookupStructField(
            structName,
            fieldName,
        );
        if (!expectedFieldTy) {
            errors.push({
                message: `Unknown field \`${fieldName}\` in struct \`${structName}\``,
                span: fieldExpr.span,
            });
            continue;
        }

        const actualResult = inferExprType(typeCtx, fieldExpr);
        let actualTy: TypeNode | undefined;
        if (actualResult.isErr()) {
            errors.push(...actualResult.error.errors);
            actualTy = actualResult.error.fallback;
        } else {
            actualTy = actualResult.value;
        }
        if (
            actualTy &&
            !isInferredPlaceholder(expectedFieldTy) &&
            !isInferredPlaceholder(actualTy)
        ) {
            if (!typesEqual(expectedFieldTy, actualTy)) {
                errors.push({
                    message: `Type mismatch for field \`${fieldName}\` in struct \`${structName}\`: expected \`${typeToString(expectedFieldTy)}\`, found \`${typeToString(actualTy)}\``,
                    span: fieldExpr.span,
                });
            }
        }
    }

    const structType = new NamedTypeNode(expr.span, structName);
    if (errors.length > 0) {
        return Result.err({ errors, fallback: structType });
    }
    return Result.ok(structType);
}

function inferBlock(
    typeCtx: TypeContext,
    block: BlockExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    typeCtx.pushScope();
    errors.push(...inferStatements(typeCtx, block.stmts));
    let resultTy: TypeNode | undefined;
    if (block.expr !== undefined) {
        const exprResult = inferExprType(typeCtx, block.expr);
        if (exprResult.isErr()) {
            errors.push(...exprResult.error.errors);
            resultTy = exprResult.error.fallback;
        } else {
            resultTy = exprResult.value;
        }
    }
    typeCtx.popScope();
    const fallback = resultTy ?? new TupleTypeNode(block.span, []);
    if (errors.length > 0) {
        return Result.err({ errors, fallback });
    }
    return Result.ok(fallback);
}

function inferIf(
    typeCtx: TypeContext,
    expr: IfExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const condResult = inferExprType(typeCtx, expr.condition);
    if (condResult.isErr()) {
        errors.push(...condResult.error.errors);
    }
    const thenResult = inferExprType(typeCtx, expr.thenBranch);
    let thenTy: TypeNode | undefined;
    if (thenResult.isErr()) {
        errors.push(...thenResult.error.errors);
        thenTy = thenResult.error.fallback;
    } else {
        thenTy = thenResult.value;
    }
    if (expr.elseBranch !== undefined) {
        const elseResult = inferExprType(typeCtx, expr.elseBranch);
        let elseTy: TypeNode | undefined;
        if (elseResult.isErr()) {
            errors.push(...elseResult.error.errors);
            elseTy = elseResult.error.fallback;
        } else {
            elseTy = elseResult.value;
        }
        // If both branches have types, check they match
        if (thenTy && elseTy && !typesEqual(thenTy, elseTy)) {
            errors.push({
                message: `\`if\` and \`else\` have incompatible types: \`${typeToString(thenTy)}\` vs \`${typeToString(elseTy)}\``,
                span: expr.span,
            });
        }
        if (errors.length > 0) {
            return Result.err({ errors, fallback: thenTy });
        }
        return Result.ok(thenTy);
    }
    const unitType = new TupleTypeNode(expr.span, []);
    if (errors.length > 0) {
        return Result.err({ errors, fallback: unitType });
    }
    return Result.ok(unitType);
}

function inferRef(
    typeCtx: TypeContext,
    expr: RefExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const innerResult = inferExprType(typeCtx, expr.target);
    let innerTy: TypeNode | undefined;
    let errors: TypeError[] = [];
    if (innerResult.isErr()) {
        const { error } = innerResult;
        ({ errors, fallback: innerTy } = error);
    } else {
        innerTy = innerResult.value;
    }
    if (innerTy) {
        const refType = new RefTypeNode(expr.span, expr.mutability, innerTy);
        if (errors.length > 0) {
            return Result.err({ errors, fallback: refType });
        }
        return Result.ok(refType);
    }
    if (errors.length > 0) {
        return Result.err({ errors, fallback: undefined });
    }
    return Result.ok(undefined);
}

function inferMatch(
    typeCtx: TypeContext,
    expr: MatchExpr,
): Result<TypeNode | undefined, InferFailure<TypeNode | undefined>> {
    const errors: TypeError[] = [];
    const scrutineeResult = inferExprType(typeCtx, expr.matchOn);
    let scrutineeTy: TypeNode | undefined;
    if (scrutineeResult.isErr()) {
        errors.push(...scrutineeResult.error.errors);
        scrutineeTy = scrutineeResult.error.fallback;
    } else {
        scrutineeTy = scrutineeResult.value;
    }
    let armTy: TypeNode | undefined;
    for (const arm of expr.arms) {
        typeCtx.pushScope();
        bindMatchArmPatternTypes(typeCtx, arm.pattern, scrutineeTy);
        const bodyResult = inferExprType(typeCtx, arm.body);
        typeCtx.popScope();
        let bodyTy: TypeNode | undefined;
        if (bodyResult.isErr()) {
            errors.push(...bodyResult.error.errors);
            bodyTy = bodyResult.error.fallback;
        } else {
            bodyTy = bodyResult.value;
        }
        if (!armTy) {
            armTy = bodyTy;
        } else if (bodyTy && !typesEqual(armTy, bodyTy)) {
            errors.push({
                message: `Match arms have incompatible types: \`${typeToString(armTy)}\` vs \`${typeToString(bodyTy)}\``,
                span: arm.span,
            });
        }
    }
    if (errors.length > 0) {
        return Result.err({ errors, fallback: armTy });
    }
    return Result.ok(armTy);
}

function bindMatchArmPatternTypes(
    typeCtx: TypeContext,
    pattern: Pattern,
    scrutineeTy: TypeNode | undefined,
): void {
    if (pattern instanceof IdentPattern) {
        if (pattern.name === "_" || scrutineeTy === undefined) {
            return;
        }
        // Don't bind enum variant names as local variables (e.g. `None`, `Ok`)
        const isBuiltinVariant =
            pattern.name === "None" ||
            pattern.name === "Some" ||
            pattern.name === "Ok" ||
            pattern.name === "Err";
        if (
            isBuiltinVariant ||
            typeCtx.lookupVariantOwner(pattern.name) !== undefined
        ) {
            return;
        }
        typeCtx.setVariable(pattern.name, scrutineeTy);
        return;
    }

    if (!(pattern instanceof StructPattern)) {
        return;
    }

    for (const field of pattern.fields) {
        if (!(field.pattern instanceof IdentPattern)) {
            continue;
        }
        if (field.pattern.name === "_") {
            continue;
        }

        const fieldIndex = Number(field.name);
        if (Number.isNaN(fieldIndex)) {
            continue;
        }

        const fieldTy = resolveMatchPatternFieldType(
            typeCtx,
            pattern,
            scrutineeTy,
            fieldIndex,
        );
        if (fieldTy !== undefined) {
            typeCtx.setVariable(field.pattern.name, fieldTy);
        }
    }
}

function resolveMatchPatternFieldType(
    typeCtx: TypeContext,
    pattern: StructPattern,
    scrutineeTy: TypeNode | undefined,
    fieldIndex: number,
): TypeNode | undefined {
    if (!(pattern.path instanceof IdentifierExpr)) {
        return undefined;
    }

    let enumTy = scrutineeTy;
    if (enumTy instanceof RefTypeNode) {
        enumTy = enumTy.inner;
    }
    if (enumTy instanceof OptionTypeNode) {
        const variantName = pattern.path.name;
        const variantOwner = typeCtx.lookupVariantOwner(variantName);
        if (variantOwner !== undefined && variantOwner !== "Option") {
            return undefined;
        }
        if (fieldIndex === 0) {
            return enumTy.inner;
        }
        return undefined;
    }

    if (enumTy instanceof ResultTypeNode) {
        const variantName = pattern.path.name;
        const variantOwner = typeCtx.lookupVariantOwner(variantName);
        if (variantOwner !== undefined && variantOwner !== "Result") {
            return undefined;
        }
        if (variantName === "Ok" || variantName === "Result::Ok") {
            return enumTy.okType;
        }
        if (variantName === "Err" || variantName === "Result::Err") {
            return enumTy.errType;
        }
        return undefined;
    }

    if (!(enumTy instanceof NamedTypeNode)) {
        return undefined;
    }

    const variantName = pattern.path.name;
    const variantOwner = typeCtx.lookupVariantOwner(variantName);
    if (variantOwner !== undefined && variantOwner !== enumTy.name) {
        return undefined;
    }

    return undefined;
}

// --- Statement Inference ---

function inferStatements(
    typeCtx: TypeContext,
    stmts: Statement[],
): TypeError[] {
    const errors: TypeError[] = [];
    for (const stmt of stmts) {
        errors.push(...inferStatement(typeCtx, stmt));
    }
    return errors;
}

function inferStatement(
    typeCtx: TypeContext,
    stmt: Statement,
): TypeError[] {
    if (stmt instanceof LetStmt) {
        return inferLetStmt(typeCtx, stmt);
    }

    if (stmt instanceof ExprStmt) {
        const result = inferExprType(typeCtx, stmt.expr);
        if (result.isErr()) {
            return result.error.errors;
        }
        return [];
    }

    if (stmt instanceof ItemStmt) {
        if (stmt.item instanceof ConstItem) {
            const binding: ConstBindingInfo = {
                typeNode: stmt.item.typeNode,
                value: stmt.item.value,
            };
            typeCtx.setConst(stmt.item.name, binding);
            return inferConstBinding(typeCtx, binding, stmt.item.span);
        }
        registerItemTypesWithPrefix(typeCtx, [stmt.item], "");
        return [];
    }

    return [
        {
            message: `Unhandled statement type in inference: ${stmt.constructor.name}`,
            span: stmt.span,
        },
    ];
}

function inferLetStmt(
    typeCtx: TypeContext,
    stmt: LetStmt,
): TypeError[] {
    const errors: TypeError[] = [];
    const initResult = inferExprType(typeCtx, stmt.init);
    let initTy: TypeNode | undefined;
    if (initResult.isErr()) {
        errors.push(...initResult.error.errors);
        initTy = initResult.error.fallback;
    } else {
        initTy = initResult.value;
    }
    const annotationTy = stmt.type;
    const hasAnnotation = !isInferredPlaceholder(annotationTy);

    if (hasAnnotation) {
        errors.push(...validateTypeNode(typeCtx, annotationTy, new Set<string>()));
    }

    let resolvedTy: TypeNode;

    if (hasAnnotation && initTy) {
        // Both annotation and initializer present: check they agree
        if (
            !isInferredPlaceholder(initTy) &&
            !typesEqual(annotationTy, initTy)
        ) {
            errors.push({
                message: `Type mismatch: expected \`${typeToString(annotationTy)}\`, found \`${typeToString(initTy)}\``,
                span: stmt.span,
            });
        }
        resolvedTy = annotationTy;
    } else if (hasAnnotation) {
        resolvedTy = annotationTy;
    } else if (initTy) {
        resolvedTy = initTy;
    } else {
        resolvedTy = annotationTy; // Stays as "_"
    }

    // Bind the variable name from the pattern
    if (stmt.pattern instanceof IdentPattern) {
        typeCtx.setVariable(stmt.pattern.name, resolvedTy);
    }

    return errors;
}

function inferConstBinding(
    typeCtx: TypeContext,
    binding: ConstBindingInfo,
    span: Span,
    selfTypeName?: string,
): TypeError[] {
    const errors: TypeError[] = [];
    const declaredType = resolveSelf(binding.typeNode, selfTypeName);
    errors.push(...validateTypeNode(typeCtx, declaredType, new Set<string>()));

    if (!binding.value) {
        return errors;
    }

    const initResult = inferExprType(typeCtx, binding.value);
    const initTy = mergeInferResult(errors, initResult);
    if (!initTy) {
        return errors;
    }

    const resolvedInitType = resolveSelf(initTy, selfTypeName);
    if (!typesEqual(declaredType, resolvedInitType)) {
        errors.push({
            message: `Type mismatch: expected \`${typeToString(declaredType)}\`, found \`${typeToString(resolvedInitType)}\``,
            span,
        });
    }

    return errors;
}

function inferConstItem(
    typeCtx: TypeContext,
    item: ConstItem,
    selfTypeName?: string,
): TypeError[] {
    return inferConstBinding(
        typeCtx,
        {
            typeNode: item.typeNode,
            value: item.value,
            selfTypeName,
        },
        item.span,
        selfTypeName,
    );
}

function registerScopedSelfConstAliases(
    typeCtx: TypeContext,
    bindings: Map<string, ConstBindingInfo>,
): void {
    for (const [name, binding] of bindings) {
        typeCtx.setConst(`Self::${name}`, binding);
    }
}

function collectTraitImplScopedBindings(
    item: TraitImplItem,
    selfTypeName: string | undefined,
    errors: TypeError[],
): Map<string, ConstBindingInfo> {
    const traitConsts = new Map(
        item.trait.constItems.map((constItem) => [constItem.name, constItem]),
    );
    const scopedBindings = new Map<string, ConstBindingInfo>();

    for (const constItem of item.constItems) {
        const binding: ConstBindingInfo = {
            typeNode: constItem.typeNode,
            value: constItem.value,
            selfTypeName,
        };
        scopedBindings.set(constItem.name, binding);
        const traitConst = traitConsts.get(constItem.name);
        if (!traitConst) {
            errors.push({
                message: `Associated const \`${constItem.name}\` is not declared in trait \`${item.trait.name}\``,
                span: constItem.span,
            });
            continue;
        }
        const implType = resolveSelf(constItem.typeNode, selfTypeName);
        const traitType = resolveSelf(traitConst.typeNode, selfTypeName);
        if (typesEqual(implType, traitType)) {
            continue;
        }
        errors.push({
            message: `Associated const \`${constItem.name}\` for trait \`${item.trait.name}\` must have type \`${typeToString(traitType)}\`, found \`${typeToString(implType)}\``,
            span: constItem.span,
        });
    }

    const defaults = traitConstDefaults(
        item.trait,
        item.constItems,
        selfTypeName ?? "Self",
    );
    for (const [name, binding] of defaults) {
        if (scopedBindings.has(name)) {
            continue;
        }
        scopedBindings.set(name, binding);
    }

    for (const traitConst of item.trait.constItems) {
        if (scopedBindings.has(traitConst.name) || traitConst.value) {
            continue;
        }
        errors.push({
            message: `Missing associated const \`${traitConst.name}\` in impl of trait \`${item.trait.name}\``,
            span: item.span,
        });
    }

    return scopedBindings;
}

function traitImplConstSpan(item: TraitImplItem, name: string): Span {
    const implConst = item.constItems.find((constItem) => constItem.name === name);
    const traitConst = item.trait.constItems.find(
        (constItem) => constItem.name === name,
    );
    return implConst?.span ?? traitConst?.span ?? item.span;
}

// --- Function Body Inference ---

/**
 * Resolve `Self` to the concrete impl target type, if known.
 * Recursively descends into nested type positions (references, generics, etc.)
 * so that types like `&Self` or `Vec<Self>` are fully resolved.
 */
function resolveSelf(ty: TypeNode, selfTypeName: string | undefined): TypeNode {
    if (!selfTypeName) return ty;
    const subs = new Map<string, TypeNode>([
        ["Self", new NamedTypeNode(ty.span, selfTypeName)],
    ]);
    return substituteTypeNode(ty, subs);
}

function bindFnParams(
    typeCtx: TypeContext,
    fnItem: FnItem | GenericFnItem,
    selfTypeName: string | undefined,
): void {
    for (const param of fnItem.params) {
        const bindName = match(param.isReceiver)
            .with(true, () => "self")
            .otherwise(() => param.name);
        const ty = resolveSelf(param.ty, selfTypeName);
        typeCtx.setVariable(bindName, ty);
    }
}

function checkFnTailReturn(
    errors: TypeError[],
    typeCtx: TypeContext,
    fnItem: FnItem | GenericFnItem,
    selfTypeName: string | undefined,
): void {
    if (!fnItem.body?.expr) {
        return;
    }

    const tailResult = inferExprType(typeCtx, fnItem.body.expr);
    const tailTy = mergeInferResult(errors, tailResult);
    const declaredReturnType = resolveSelf(fnItem.returnType, selfTypeName);
    let resolvedTailTy: TypeNode | undefined;
    if (tailTy !== undefined) {
        resolvedTailTy = resolveSelf(tailTy, selfTypeName);
    }

    if (
        !resolvedTailTy ||
        isInferredPlaceholder(declaredReturnType) ||
        isInferredPlaceholder(resolvedTailTy) ||
        typesEqual(declaredReturnType, resolvedTailTy)
    ) {
        return;
    }

    errors.push({
        message: `Mismatched return type: expected \`${typeToString(declaredReturnType)}\`, found \`${typeToString(resolvedTailTy)}\``,
        span: fnItem.body.expr.span,
    });
}

function checkImplicitUnitReturn(
    errors: TypeError[],
    fnItem: FnItem | GenericFnItem,
    selfTypeName: string | undefined,
): void {
    const declaredReturnType = resolveSelf(fnItem.returnType, selfTypeName);
    const implicitUnitType = new TupleTypeNode(fnItem.span, []);
    if (
        isInferredPlaceholder(declaredReturnType) ||
        typesEqual(declaredReturnType, implicitUnitType)
    ) {
        return;
    }

    errors.push({
        message: `Mismatched return type: expected \`${typeToString(declaredReturnType)}\`, found \`()\``,
        span: fnItem.body?.span ?? fnItem.span,
    });
}

function inferFnBody(
    typeCtx: TypeContext,
    fnItem: FnItem | GenericFnItem,
    selfTypeName?: string,
): TypeError[] {
    if (!fnItem.body) {
        return [];
    }

    const errors: TypeError[] = [];
    typeCtx.pushScope();
    bindFnParams(typeCtx, fnItem, selfTypeName);

    // Infer body statements
    errors.push(...inferStatements(typeCtx, fnItem.body.stmts));

    // If there's a tail expression, check it against the return type.
    // Resolve `Self` to the concrete impl target type so that e.g.
    // `-> Self` and a tail expression of type `Point` compare equal.
    if (fnItem.body.expr) {
        checkFnTailReturn(errors, typeCtx, fnItem, selfTypeName);
    } else {
        checkImplicitUnitReturn(errors, fnItem, selfTypeName);
    }
    typeCtx.popScope();

    return errors;
}

// --- Duplicate Function Checking ---

function checkDuplicateFns(module: ModuleNode): TypeError[] {
    const names = new Map<string, Span>();
    const errors: TypeError[] = [];

    for (const item of module.items) {
        if (!(item instanceof FnItem)) {
            continue;
        }
        const prior = names.get(item.name);
        if (prior) {
            errors.push({
                message: `Duplicate function definition: \`${item.name}\``,
                span: item.span,
            });
            continue;
        }
        names.set(item.name, item.span);
    }

    return errors;
}

// --- Type Validation for Function Signatures ---

function collectGenericParamNames(fnItem: FnItem | GenericFnItem): Set<string> {
    const names = new Set<string>();
    if (fnItem instanceof GenericFnItem) {
        for (const param of fnItem.genericParams) {
            names.add(param.name);
        }
    }
    return names;
}

function validateFnTypes(
    typeCtx: TypeContext,
    fnItem: FnItem | GenericFnItem,
): TypeError[] {
    const errors: TypeError[] = [];
    const genericNames = collectGenericParamNames(fnItem);

    for (const param of fnItem.params.filter((p) => !p.isReceiver)) {
        errors.push(...validateTypeNode(typeCtx, param.ty, genericNames));
    }

    errors.push(...validateTypeNode(typeCtx, fnItem.returnType, genericNames));

    return errors;
}

function validateStructFieldTypes(
    typeCtx: TypeContext,
    item: StructItem | GenericStructItem,
): TypeError[] {
    const errors: TypeError[] = [];
    let genericNames = new Set<string>();
    if (item instanceof GenericStructItem) {
        genericNames = new Set(item.genericParams.map((param) => param.name));
    }

    for (const field of item.fields) {
        errors.push(...validateTypeNode(typeCtx, field.typeNode, genericNames));
    }

    return errors;
}

function validateEnumItemTypes(
    typeCtx: TypeContext,
    item: EnumItem,
): TypeError[] {
    const errors: TypeError[] = [];
    for (const variant of item.variants) {
        for (const field of variant.fields) {
            errors.push(
                ...validateTypeNode(
                    typeCtx,
                    field.typeNode,
                    new Set<string>(),
                ),
            );
        }
    }
    return errors;
}

// --- Impl Item Inference ---

function inferImplItem(typeCtx: TypeContext, item: ImplItem): TypeError[] {
    const errors: TypeError[] = [];

    // Register 'Self' as an alias for the impl target struct so that
    // 'Self { ... }' literals and 'Self' types within method bodies resolve correctly.
    const selfTypeName = item.target.name;
    const targetFields = typeCtx.lookupStructFields(selfTypeName);
    if (targetFields) {
        typeCtx.registerStructFields("Self", targetFields);
    }

    typeCtx.pushScope();
    const scopedBindings = new Map<string, ConstBindingInfo>();
    for (const constItem of item.constItems) {
        const binding: ConstBindingInfo = {
            typeNode: constItem.typeNode,
            value: constItem.value,
            selfTypeName,
        };
        scopedBindings.set(constItem.name, binding);
    }
    registerScopedSelfConstAliases(typeCtx, scopedBindings);
    for (const constItem of item.constItems) {
        const binding = scopedBindings.get(constItem.name);
        if (!binding) {
            continue;
        }
        errors.push(
            ...inferConstBinding(typeCtx, binding, constItem.span, selfTypeName),
        );
    }

    for (const method of item.methods) {
        errors.push(...validateFnTypes(typeCtx, method));
        if (method instanceof FnItem) {
            errors.push(...inferFnBody(typeCtx, method, selfTypeName));
        }
        // Skip deep body inference for generic methods
    }

    typeCtx.popScope();

    return errors;
}

function inferTraitImplItem(
    typeCtx: TypeContext,
    item: TraitImplItem,
): TypeError[] {
    const errors: TypeError[] = [];
    let selfTypeName: string | undefined;
    if (item.target instanceof NamedTypeNode) {
        selfTypeName = item.target.name;
    }
    if (selfTypeName) {
        const targetFields = typeCtx.lookupStructFields(selfTypeName);
        if (targetFields) {
            typeCtx.registerStructFields("Self", targetFields);
        }
    }

    typeCtx.pushScope();
    const scopedBindings = collectTraitImplScopedBindings(
        item,
        selfTypeName,
        errors,
    );
    registerScopedSelfConstAliases(typeCtx, scopedBindings);
    for (const [name, binding] of scopedBindings) {
        const span = traitImplConstSpan(item, name);
        errors.push(
            ...inferConstBinding(typeCtx, binding, span, binding.selfTypeName),
        );
    }

    for (const method of item.fnImpls) {
        errors.push(...validateFnTypes(typeCtx, method));
        errors.push(...inferFnBody(typeCtx, method, selfTypeName));
    }

    typeCtx.popScope();

    return errors;
}

// --- Module-Level Inference ---

export function inferModule(
    typeCtx: TypeContext,
    moduleNode: ModuleNode,
): Result<void, TypeError[]> {
    // Phase 1: Register all item types (structs, enums, functions, impls)
    registerItemTypesWithPrefix(typeCtx, moduleNode.items, "");

    const errors: TypeError[] = [];
    errors.push(...checkDuplicateFns(moduleNode));

    // Phase 2: Validate function signatures and infer function bodies
    for (const item of moduleNode.items) {
        errors.push(...inferModuleItem(typeCtx, item));
    }

    if (errors.length > 0) {
        return Result.err(errors);
    }
    return Result.ok();
}

function inferModuleItem(typeCtx: TypeContext, item: Item): TypeError[] {
    if (item instanceof StructItem || item instanceof GenericStructItem) {
        return validateStructFieldTypes(typeCtx, item);
    }
    if (item instanceof EnumItem) {
        return validateEnumItemTypes(typeCtx, item);
    }
    if (item instanceof GenericFnItem) {
        return validateFnTypes(typeCtx, item);
    }
    if (item instanceof ConstItem) {
        return inferConstItem(typeCtx, item);
    }
    if (item instanceof FnItem) {
        return [
            ...validateFnTypes(typeCtx, item),
            ...inferFnBody(typeCtx, item),
        ];
    }
    if (item instanceof ModItem) {
        const nested = inferModule(
            typeCtx,
            new ModuleNode(item.span, item.name, item.items),
        );
        if (nested.isOk()) {
            return [];
        }
        return nested.error;
    }
    if (item instanceof TraitItem) {
        return inferTraitItem(typeCtx, item);
    }
    if (item instanceof ImplItem) {
        return inferImplItem(typeCtx, item);
    }
    if (item instanceof TraitImplItem) {
        return inferTraitImplItem(typeCtx, item);
    }
    return [];
}

function inferTraitItem(typeCtx: TypeContext, item: TraitItem): TypeError[] {
    const errors: TypeError[] = [];
    for (const method of item.methods) {
        errors.push(...validateFnTypes(typeCtx, method));
    }
    typeCtx.pushScope();
    const scopedBindings = new Map<string, ConstBindingInfo>();
    for (const constItem of item.constItems) {
        scopedBindings.set(constItem.name, {
            typeNode: constItem.typeNode,
            value: constItem.value,
        });
    }
    registerScopedSelfConstAliases(typeCtx, scopedBindings);
    for (const constItem of item.constItems) {
        errors.push(...inferConstItem(typeCtx, constItem, "Self"));
    }
    typeCtx.popScope();
    return errors;
}
