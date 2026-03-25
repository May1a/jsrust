import {
    AssignExpr,
    BinaryExpr,
    BinaryOp,
    BlockExpr,
    BreakExpr,
    CallExpr,
    ClosureExpr,
    ContinueExpr,
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
import type { TypeContext } from "../utils/type_context";

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

type InferResult<T = TypeNode | undefined> = { value: T; errors: TypeError[] };

function ok<T>(value: T): InferResult<T> {
    return { value, errors: [] };
}

function withErrors<T>(value: T, errors: TypeError[]): InferResult<T> {
    return { value, errors };
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

/**
 * Get a human-readable name for a TypeNode.
 */
function typeToString(ty: TypeNode): string {
    return match(ty)
        .with(P.instanceOf(NamedTypeNode), (t) => {
            if (t.args !== undefined) {
                return `${t.name}<${t.args.args.map(typeToString).join(", ")}>`;
            }
            return t.name;
        })
        .with(P.instanceOf(TupleTypeNode), (t) => {
            if (t.elements.length === 0) {
                return "()";
            }
            return `(${t.elements.map(typeToString).join(", ")})`;
        })
        .with(P.instanceOf(RefTypeNode), (t) => {
            const mutStr = match(t.mutability)
                .with(Mutability.Mutable, () => "mut ")
                .otherwise(() => "");
            return `&${mutStr}${typeToString(t.inner)}`;
        })
        .with(P.instanceOf(OptionTypeNode), (t) => `Option<${typeToString(t.inner)}>`)
        .with(
            P.instanceOf(ResultTypeNode),
            (t) => `Result<${typeToString(t.okType)}, ${typeToString(t.errType)}>`,
        )
        .otherwise(() => "<unknown>");
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
            ([x, y]) => x.length === y.length && typesEqual(x.element, y.element),
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
        if (node instanceof StructItem || node instanceof GenericStructItem) {
            registerStructTypeWithPrefix(typeCtx, node, qualify, modulePrefix);
            continue;
        }
        if (node instanceof EnumItem) {
            registerEnumItemType(typeCtx, node, qualify, modulePrefix);
            continue;
        }
        if (node instanceof GenericFnItem) {
            const qualName = qualify(node.name);
            typeCtx.registerFnSignature(qualName, {
                params: buildParamList(node.params),
                returnType: node.returnType,
            });
            typeCtx.registerGenericFn(qualName, node);
            continue;
        }
        if (node instanceof FnItem) {
            typeCtx.registerFnSignature(qualify(node.name), {
                params: buildParamList(node.params),
                returnType: node.returnType,
            });
            continue;
        }
        if (node instanceof ImplItem) {
            registerImplMethodsWithPrefix(typeCtx, node, qualify, modulePrefix);
            continue;
        }
        if (node instanceof TraitImplItem) {
            registerTraitImplMethodsWithPrefix(
                typeCtx,
                node,
                qualify,
                modulePrefix,
            );
            continue;
        }
        if (node instanceof ModItem) {
            registerItemTypesWithPrefix(
                typeCtx,
                node.items,
                qualify(node.name),
            );
            continue;
        }
        if (node instanceof UseItem) {
            registerUseItemAlias(typeCtx, node);
        }
    }
}

function registerUseItemAlias(typeCtx: TypeContext, node: UseItem): void {
    if (node.path.length === 0) return;
    const fullPath = node.path.join("::");
    const localName = node.alias ?? node.path[node.path.length - 1];

    // Avoid re-registering if the local name matches the last segment (no alias)
    if (localName === fullPath) return;

    const sig = typeCtx.lookupFnSignature(fullPath);
    if (sig) {
        typeCtx.registerFnSignature(localName, sig);
    }
}

// --- Expression Type Inference ---

function inferExprType(
    typeCtx: TypeContext,
    expr: Expression,
): InferResult {
    // Check if we already resolved this expression
    const cached = typeCtx.getExpressionType(expr);
    if (cached) {
        return ok(cached);
    }

    const result = inferExprTypeInner(typeCtx, expr);
    if (result.value) {
        typeCtx.setExpressionType(expr, result.value);
    }
    return result;
}

function inferExprTypeInner(
    typeCtx: TypeContext,
    expr: Expression,
): InferResult {
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
        return ok(expr.returnType);
    }

    return inferExprTypeExtended(typeCtx, expr);
}

function inferVecMacro(
    typeCtx: TypeContext,
    expr: MacroExpr,
): InferResult {
    const errors: TypeError[] = [];
    let elemType: TypeNode | undefined;
    if (expr.args.length > 0) {
        const [firstArg] = expr.args;
        const firstResult = inferExprType(typeCtx, firstArg);
        errors.push(...firstResult.errors);
        elemType = firstResult.value;
    }
    for (const arg of expr.args) {
        const argResult = inferExprType(typeCtx, arg);
        errors.push(...argResult.errors);
    }
    if (!elemType) {
        return withErrors(undefined, errors);
    }
    return withErrors(
        new ArrayTypeNode(expr.span, elemType, undefined),
        errors,
    );
}

function inferIndexExpr(
    typeCtx: TypeContext,
    expr: IndexExpr,
): InferResult {
    const errors: TypeError[] = [];
    const receiverResult = inferExprType(typeCtx, expr.receiver);
    errors.push(...receiverResult.errors);
    const indexResult = inferExprType(typeCtx, expr.index);
    errors.push(...indexResult.errors);
    if (receiverResult.value instanceof ArrayTypeNode) {
        return withErrors(receiverResult.value.element, errors);
    }
    return withErrors(undefined, errors);
}

function inferRangeExpr(
    typeCtx: TypeContext,
    expr: RangeExpr,
): InferResult {
    const errors: TypeError[] = [];
    if (expr.start !== undefined) {
        const startResult = inferExprType(typeCtx, expr.start);
        errors.push(...startResult.errors);
    }
    if (expr.end !== undefined) {
        const endResult = inferExprType(typeCtx, expr.end);
        errors.push(...endResult.errors);
    }
    return withErrors(undefined, errors);
}

function inferExprTypeExtended(
    typeCtx: TypeContext,
    expr: Expression,
): InferResult {
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

    return withErrors(undefined, [
        {
            message: `Unhandled expression type in inference: ${expr.constructor.name}`,
            span: expr.span,
        },
    ]);
}

function inferLiteral(
    expr: LiteralExpr,
): InferResult {
    switch (expr.literalKind) {
        case LiteralKind.Int: {
            return ok(new NamedTypeNode(expr.span, "i32"));
        }
        case LiteralKind.Float: {
            return ok(new NamedTypeNode(expr.span, "f64"));
        }
        case LiteralKind.Bool: {
            return ok(new NamedTypeNode(expr.span, "bool"));
        }
        case LiteralKind.String: {
            return ok(
                new RefTypeNode(
                    expr.span,
                    Mutability.Immutable,
                    new NamedTypeNode(expr.span, "str"),
                ),
            );
        }
        case LiteralKind.Char: {
            return ok(new NamedTypeNode(expr.span, "char"));
        }
        default: {
            return withErrors(undefined, [
                {
                    message: `Unhandled literal kind in inference: ${String(expr.literalKind)}`,
                    span: expr.span,
                },
            ]);
        }
    }
}

function inferIdentifier(
    typeCtx: TypeContext,
    expr: IdentifierExpr,
): InferResult {
    const varTy = typeCtx.lookupVariable(expr.name);
    if (varTy) {
        return ok(varTy);
    }

    const fnSig = typeCtx.lookupFnSignature(expr.name);
    if (fnSig) {
        return withErrors(undefined, [
            {
                message: `\`${expr.name}\` is a function and cannot be used as a first-class value`,
                span: expr.span,
            },
        ]);
    }

    const namedTy = typeCtx.lookupNamedType(expr.name);
    if (namedTy) {
        return withErrors(undefined, [
            {
                message: `\`${expr.name}\` is a type and cannot be used as a value`,
                span: expr.span,
            },
        ]);
    }

    // `None` and `Some` refer to builtin Option variants unless a user-defined
    // enum has a variant with the same name, in which case we let the type
    // propagate naturally (return undefined, no error).
    if (expr.name === "None" || expr.name === "Some") {
        const owner = typeCtx.lookupVariantOwner(expr.name);
        if (owner && owner !== "Option") {
            return ok(undefined);
        }
        return ok(makeOptionType(expr.span));
    }

    if (
        expr.name === "Ok" ||
        expr.name === "Result::Ok" ||
        expr.name === "Err" ||
        expr.name === "Result::Err"
    ) {
        const owner = typeCtx.lookupVariantOwner(expr.name);
        if (owner && owner !== "Result") {
            return ok(undefined);
        }
        return ok(makeResultType(expr.span));
    }

    // Qualified paths (e.g. `Color::Green`, `Vec::new`) are enum variants or
    // associated items — not yet tracked in the type context. Return undefined
    // without an error; type propagation will handle the absence.
    if (expr.name.includes("::")) {
        return ok(undefined);
    }

    return withErrors(undefined, [
        {
            message: `Cannot find value \`${expr.name}\` in this scope`,
            span: expr.span,
        },
    ]);
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
): InferResult {
    const errors: TypeError[] = [];
    const leftResult = inferExprType(typeCtx, expr.left);
    errors.push(...leftResult.errors);
    const rightResult = inferExprType(typeCtx, expr.right);
    errors.push(...rightResult.errors);
    const leftTy = leftResult.value;
    const rightTy = rightResult.value;

    // Comparison and logical operators always produce bool
    if (COMPARISON_OPS.has(expr.op) || LOGICAL_OPS.has(expr.op)) {
        return withErrors(new NamedTypeNode(expr.span, "bool"), errors);
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

    return withErrors(leftBase ?? rightBase, errors);
}

function inferUnary(
    typeCtx: TypeContext,
    expr: UnaryExpr,
): InferResult {
    const errors: TypeError[] = [];
    const operandResult = inferExprType(typeCtx, expr.operand);
    errors.push(...operandResult.errors);
    const operandTy = operandResult.value;

    if (expr.op === UnaryOp.Not) {
        // `!` on bool returns bool; on integers returns the integer type
        if (operandTy instanceof NamedTypeNode && operandTy.name === "bool") {
            return withErrors(new NamedTypeNode(expr.span, "bool"), errors);
        }
        return withErrors(operandTy, errors);
    }

    if (expr.op === UnaryOp.Neg) {
        return withErrors(operandTy, errors);
    }

    if (expr.op === UnaryOp.Ref) {
        if (operandTy) {
            return withErrors(
                new RefTypeNode(expr.span, Mutability.Immutable, operandTy),
                errors,
            );
        }
    }

    if (expr.op === UnaryOp.Deref) {
        if (operandTy instanceof RefTypeNode) {
            return withErrors(operandTy.inner, errors);
        }
        if (operandTy) {
            errors.push({
                message: `Cannot dereference value of type \`${typeToString(operandTy)}\``,
                span: expr.span,
            });
        }
        return withErrors(undefined, errors);
    }

    return withErrors(operandTy, errors);
}

function inferDeref(
    typeCtx: TypeContext,
    expr: DerefExpr,
): InferResult {
    const errors: TypeError[] = [];
    const targetResult = inferExprType(typeCtx, expr.target);
    errors.push(...targetResult.errors);
    const targetTy = targetResult.value;
    if (targetTy instanceof RefTypeNode) {
        return withErrors(targetTy.inner, errors);
    }
    if (targetTy) {
        errors.push({
            message: `Cannot dereference value of type \`${typeToString(targetTy)}\``,
            span: expr.span,
        });
    }
    return withErrors(undefined, errors);
}

function inferUnitExpr(
    typeCtx: TypeContext,
    expr: MacroExpr | WhileExpr | ForExpr | LoopExpr | AssignExpr,
): InferResult<TupleTypeNode> {
    const errors: TypeError[] = [];
    if (expr instanceof WhileExpr) {
        const condResult = inferExprType(typeCtx, expr.condition);
        errors.push(...condResult.errors);
        const bodyResult = inferBlock(typeCtx, expr.body);
        errors.push(...bodyResult.errors);
    } else if (expr instanceof ForExpr) {
        const iterResult = inferExprType(typeCtx, expr.iter);
        errors.push(...iterResult.errors);
        const bodyResult = inferBlock(typeCtx, expr.body);
        errors.push(...bodyResult.errors);
    } else if (expr instanceof LoopExpr) {
        const bodyResult = inferBlock(typeCtx, expr.body);
        errors.push(...bodyResult.errors);
    } else if (expr instanceof AssignExpr) {
        const targetResult = inferExprType(typeCtx, expr.target);
        errors.push(...targetResult.errors);
        const valueResult = inferExprType(typeCtx, expr.value);
        errors.push(...valueResult.errors);
    } else {
        for (const arg of expr.args) {
            const argResult = inferExprType(typeCtx, arg);
            errors.push(...argResult.errors);
        }
    }
    return withErrors(new TupleTypeNode(expr.span, []), errors);
}

function inferDivergingExpr(
    typeCtx: TypeContext,
    expr: ReturnExpr | BreakExpr | ContinueExpr,
): InferResult<undefined> {
    const errors: TypeError[] = [];
    if (expr instanceof ReturnExpr && expr.value !== undefined) {
        const valResult = inferExprType(typeCtx, expr.value);
        errors.push(...valResult.errors);
    } else if (expr instanceof BreakExpr && expr.value !== undefined) {
        const valResult = inferExprType(typeCtx, expr.value);
        errors.push(...valResult.errors);
    }
    return withErrors(undefined, errors);
}

function inferCall(
    typeCtx: TypeContext,
    expr: CallExpr,
): InferResult {
    // Infer argument types for side effects (populates type context)
    const errors: TypeError[] = [];
    const argTypes: (TypeNode | undefined)[] = [];
    for (const arg of expr.args) {
        const argResult = inferExprType(typeCtx, arg);
        errors.push(...argResult.errors);
        argTypes.push(argResult.value);
    }

    if (expr.callee instanceof IdentifierExpr) {
        const callResult = inferIdentifierCallType(
            typeCtx,
            expr,
            expr.callee,
            argTypes,
        );
        errors.push(...callResult.errors);
        return withErrors(callResult.value, errors);
    }

    if (expr.callee instanceof FieldExpr) {
        const callResult = inferMethodCallType(typeCtx, expr);
        errors.push(...callResult.errors);
        return withErrors(callResult.value, errors);
    }

    return withErrors(undefined, errors);
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
): InferResult {
    if (calleeName === "Some" || calleeName === "Option::Some") {
        if (expr.args.length !== 1) {
            return withErrors(undefined, [
                {
                    message: "`Some` requires exactly one argument",
                    span: expr.span,
                },
            ]);
        }
        const [innerTy] = argTypes;
        return ok(makeOptionType(expr.span, innerTy));
    }
    if (calleeName === "None" || calleeName === "Option::None") {
        if (expr.args.length > 0) {
            return withErrors(undefined, [
                {
                    message: "`None` does not take any arguments",
                    span: expr.span,
                },
            ]);
        }
        return ok(makeOptionType(expr.span));
    }
    if (calleeName === "Ok" || calleeName === "Result::Ok") {
        if (expr.args.length !== 1) {
            return withErrors(undefined, [
                {
                    message: "`Ok` requires exactly one argument",
                    span: expr.span,
                },
            ]);
        }
        const [okTy] = argTypes;
        return ok(makeResultType(expr.span, okTy));
    }
    // Err or Result::Err
    if (expr.args.length !== 1) {
        return withErrors(undefined, [
            {
                message: "`Err` requires exactly one argument",
                span: expr.span,
            },
        ]);
    }
    const [errTy] = argTypes;
    return ok(makeResultType(expr.span, undefined, errTy));
}

function inferIdentifierCallType(
    typeCtx: TypeContext,
    expr: CallExpr,
    callee: IdentifierExpr,
    argTypes: (TypeNode | undefined)[],
): InferResult {
    const { name: calleeName } = callee;

    if (BUILTIN_ENUM_CONSTRUCTOR_NAMES.has(calleeName)) {
        return inferBuiltinEnumCallType(expr, calleeName, argTypes);
    }

    const genericResult = resolveGenericCall(typeCtx, expr, argTypes);
    if (genericResult) {
        return ok(genericResult);
    }

    const sig = typeCtx.lookupFnSignature(calleeName);
    if (sig) {
        return ok(sig.returnType);
    }

    // Qualified paths (e.g. `Vec::new`) are not yet tracked — skip
    if (!calleeName.includes("::")) {
        return withErrors(undefined, [
            {
                message: `cannot find function \`${calleeName}\` in this scope`,
                span: callee.span,
            },
        ]);
    }
    return ok(undefined);
}

function inferOptionMethodType(
    expr: CallExpr,
    receiverTy: OptionTypeNode,
): InferResult {
    const { callee } = expr;
    if (!(callee instanceof FieldExpr)) {
        return ok(undefined);
    }
    const { inner } = receiverTy;
    const boolTy = new NamedTypeNode(callee.span, "bool");
    if (callee.field === "is_some" || callee.field === "is_none") {
        if (expr.args.length > 0) {
            return withErrors(undefined, [
                {
                    message: `\`${callee.field}\` does not take any arguments`,
                    span: expr.span,
                },
            ]);
        }
        return ok(boolTy);
    }
    if (callee.field === "unwrap") {
        if (expr.args.length > 0) {
            return withErrors(undefined, [
                {
                    message: "`unwrap` does not take any arguments",
                    span: expr.span,
                },
            ]);
        }
        return ok(inner);
    }
    if (callee.field === "expect") {
        if (expr.args.length !== 1) {
            return withErrors(undefined, [
                {
                    message: "`expect` requires exactly one argument",
                    span: expr.span,
                },
            ]);
        }
        return ok(inner);
    }
    return ok(undefined);
}

function inferResultMethodType(
    expr: CallExpr,
    receiverTy: ResultTypeNode,
): InferResult {
    const { callee } = expr;
    if (!(callee instanceof FieldExpr)) {
        return ok(undefined);
    }
    const okTy = receiverTy.okType;
    const errTy = receiverTy.errType;
    const boolTy = new NamedTypeNode(callee.span, "bool");
    if (callee.field === "is_ok" || callee.field === "is_err") {
        if (expr.args.length > 0) {
            return withErrors(undefined, [
                {
                    message: `\`${callee.field}\` does not take any arguments`,
                    span: expr.span,
                },
            ]);
        }
        return ok(boolTy);
    }
    if (callee.field === "unwrap") {
        if (expr.args.length > 0) {
            return withErrors(undefined, [
                {
                    message: "`unwrap` does not take any arguments",
                    span: expr.span,
                },
            ]);
        }
        return ok(okTy);
    }
    if (callee.field === "expect") {
        if (expr.args.length !== 1) {
            return withErrors(undefined, [
                {
                    message: "`expect` requires exactly one argument",
                    span: expr.span,
                },
            ]);
        }
        return ok(okTy);
    }
    if (callee.field === "unwrap_err") {
        if (expr.args.length > 0) {
            return withErrors(undefined, [
                {
                    message: "`unwrap_err` does not take any arguments",
                    span: expr.span,
                },
            ]);
        }
        return ok(errTy);
    }
    return ok(undefined);
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
): InferResult {
    const errors: TypeError[] = [];
    const { callee } = expr;
    if (!(callee instanceof FieldExpr)) {
        return ok(undefined);
    }
    const receiverResult = inferExprType(typeCtx, callee.receiver);
    errors.push(...receiverResult.errors);
    const receiverTy = receiverResult.value;

    if (callee.field === "clone") {
        if (expr.args.length > 0) {
            errors.push({
                message: "`clone` does not take any arguments",
                span: expr.span,
            });
            return withErrors(undefined, errors);
        }
        if (receiverTy) {
            return withErrors(receiverTy, errors);
        }
    }

    // Reject calling Option/Result builtin methods through a reference — it is a
    // common mistake and the compiler should reject it explicitly.
    if (checkRefOptionResultMethodCall(receiverTy, callee, expr, errors)) {
        return withErrors(undefined, errors);
    }

    // Builtin Option methods
    if (receiverTy instanceof OptionTypeNode) {
        const inferredResult = inferOptionMethodType(expr, receiverTy);
        errors.push(...inferredResult.errors);
        if (inferredResult.value !== undefined) {
            return withErrors(inferredResult.value, errors);
        }
    }

    // Builtin Result methods
    if (receiverTy instanceof ResultTypeNode) {
        const inferredResult = inferResultMethodType(expr, receiverTy);
        errors.push(...inferredResult.errors);
        if (inferredResult.value !== undefined) {
            return withErrors(inferredResult.value, errors);
        }
    }

    const userResult = inferUserDefinedMethodType(typeCtx, receiverTy, callee);
    errors.push(...userResult.errors);
    return withErrors(userResult.value, errors);
}

function inferUserDefinedMethodType(
    typeCtx: TypeContext,
    receiverTy: TypeNode | undefined,
    callee: FieldExpr,
): InferResult {
    if (receiverTy instanceof NamedTypeNode) {
        const methodSig = typeCtx.lookupFnSignature(
            `${receiverTy.name}::${callee.field}`,
        );
        if (methodSig) {
            return ok(methodSig.returnType);
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
            return ok(methodSig.returnType);
        }
    }

    // Receiver type is known but no matching method signature was found
    if (receiverTy) {
        return withErrors(undefined, [
            {
                message: `no method \`${callee.field}\` found for type \`${typeToString(receiverTy)}\``,
                span: callee.span,
            },
        ]);
    }
    return ok(undefined);
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
): InferResult {
    const receiverResult = inferExprType(typeCtx, expr.receiver);
    const errors: TypeError[] = [...receiverResult.errors];
    const receiverTy = receiverResult.value;
    if (!receiverTy) {
        return withErrors(undefined, errors);
    }

    // Direct struct type
    if (receiverTy instanceof NamedTypeNode) {
        const fieldTy = typeCtx.lookupStructField(receiverTy.name, expr.field);
        if (fieldTy) {
            return withErrors(fieldTy, errors);
        }

        errors.push({
            message: `No field \`${expr.field}\` on type \`${receiverTy.name}\``,
            span: expr.span,
        });
        return withErrors(undefined, errors);
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
            return withErrors(fieldTy, errors);
        }

        errors.push({
            message: `No field \`${expr.field}\` on type \`${typeToString(receiverTy)}\``,
            span: expr.span,
        });
        return withErrors(undefined, errors);
    }

    return withErrors(undefined, errors);
}

function inferStructLiteral(
    typeCtx: TypeContext,
    expr: StructExpr,
): InferResult {
    if (!(expr.path instanceof IdentifierExpr)) {
        return ok(undefined);
    }

    const errors: TypeError[] = [];
    const structName = expr.path.name;
    const structFields = typeCtx.lookupStructFields(structName);

    if (!structFields) {
        return withErrors(undefined, [
            {
                message: `Unknown struct \`${structName}\``,
                span: expr.span,
            },
        ]);
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
        errors.push(...actualResult.errors);
        const actualTy = actualResult.value;
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

    return withErrors(new NamedTypeNode(expr.span, structName), errors);
}

function inferBlock(
    typeCtx: TypeContext,
    block: BlockExpr,
): InferResult {
    const errors: TypeError[] = [];
    typeCtx.pushScope();
    errors.push(...inferStatements(typeCtx, block.stmts));
    let resultTy: TypeNode | undefined;
    if (block.expr !== undefined) {
        const exprResult = inferExprType(typeCtx, block.expr);
        errors.push(...exprResult.errors);
        resultTy = exprResult.value;
    }
    typeCtx.popScope();
    return withErrors(resultTy ?? new TupleTypeNode(block.span, []), errors);
}

function inferIf(
    typeCtx: TypeContext,
    expr: IfExpr,
): InferResult {
    const errors: TypeError[] = [];
    const condResult = inferExprType(typeCtx, expr.condition);
    errors.push(...condResult.errors);
    const thenResult = inferExprType(typeCtx, expr.thenBranch);
    errors.push(...thenResult.errors);
    const thenTy = thenResult.value;
    if (expr.elseBranch !== undefined) {
        const elseResult = inferExprType(typeCtx, expr.elseBranch);
        errors.push(...elseResult.errors);
        const elseTy = elseResult.value;
        // If both branches have types, check they match
        if (thenTy && elseTy && !typesEqual(thenTy, elseTy)) {
            errors.push({
                message: `\`if\` and \`else\` have incompatible types: \`${typeToString(thenTy)}\` vs \`${typeToString(elseTy)}\``,
                span: expr.span,
            });
        }
        return withErrors(thenTy, errors);
    }
    return withErrors(new TupleTypeNode(expr.span, []), errors);
}

function inferRef(
    typeCtx: TypeContext,
    expr: RefExpr,
): InferResult {
    const innerResult = inferExprType(typeCtx, expr.target);
    const innerTy = innerResult.value;
    if (innerTy) {
        return withErrors(
            new RefTypeNode(expr.span, expr.mutability, innerTy),
            innerResult.errors,
        );
    }
    return withErrors(undefined, innerResult.errors);
}

function inferMatch(
    typeCtx: TypeContext,
    expr: MatchExpr,
): InferResult {
    const errors: TypeError[] = [];
    const scrutineeResult = inferExprType(typeCtx, expr.matchOn);
    errors.push(...scrutineeResult.errors);
    const scrutineeTy = scrutineeResult.value;
    let armTy: TypeNode | undefined;
    for (const arm of expr.arms) {
        typeCtx.pushScope();
        bindMatchArmPatternTypes(typeCtx, arm.pattern, scrutineeTy);
        const bodyResult = inferExprType(typeCtx, arm.body);
        errors.push(...bodyResult.errors);
        typeCtx.popScope();
        const bodyTy = bodyResult.value;
        if (!armTy) {
            armTy = bodyTy;
        } else if (bodyTy && !typesEqual(armTy, bodyTy)) {
            errors.push({
                message: `Match arms have incompatible types: \`${typeToString(armTy)}\` vs \`${typeToString(bodyTy)}\``,
                span: arm.span,
            });
        }
    }
    return withErrors(armTy, errors);
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
        return result.errors;
    }

    if (stmt instanceof ItemStmt) {
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
    errors.push(...initResult.errors);
    const initTy = initResult.value;
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

    // Bind parameters into scope
    for (const param of fnItem.params) {
        // Receiver params (self / &self / &mut self) are accessed as lowercase `self` in Rust code.
        // The parser stores name: "Self" (for the type), but variable lookups use "self".
        let bindName = param.name;
        if (param.isReceiver) {
            bindName = "self";
        }
        // Resolve `Self` to the concrete impl target type for all params, so that
        // lookups like `self.foo()` and arguments typed `&Self` are handled correctly.
        const ty = resolveSelf(param.ty, selfTypeName);
        typeCtx.setVariable(bindName, ty);
    }

    // Infer body statements
    errors.push(...inferStatements(typeCtx, fnItem.body.stmts));

    // If there's a tail expression, check it against the return type.
    // Resolve `Self` to the concrete impl target type so that e.g.
    // `-> Self` and a tail expression of type `Point` compare equal.
    if (fnItem.body.expr) {
        const tailResult = inferExprType(typeCtx, fnItem.body.expr);
        errors.push(...tailResult.errors);
        const tailTy = tailResult.value;
        const declaredReturnType = resolveSelf(fnItem.returnType, selfTypeName);
        let resolvedTailTy: TypeNode | undefined;
        if (tailTy) {
            resolvedTailTy = resolveSelf(tailTy, selfTypeName);
        }
        if (
            resolvedTailTy &&
            !isInferredPlaceholder(declaredReturnType) &&
            !isInferredPlaceholder(resolvedTailTy)
        ) {
            if (!typesEqual(declaredReturnType, resolvedTailTy)) {
                errors.push({
                    message: `Mismatched return type: expected \`${typeToString(declaredReturnType)}\`, found \`${typeToString(resolvedTailTy)}\``,
                    span: fnItem.body.expr.span,
                });
            }
        }
    } else {
        const declaredReturnType = resolveSelf(fnItem.returnType, selfTypeName);
        const implicitUnitType = new TupleTypeNode(fnItem.span, []);
        if (
            !isInferredPlaceholder(declaredReturnType) &&
            !typesEqual(declaredReturnType, implicitUnitType)
        ) {
            errors.push({
                message: `Mismatched return type: expected \`${typeToString(declaredReturnType)}\`, found \`()\``,
                span: fnItem.body.span,
            });
        }
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

    for (const method of item.methods) {
        errors.push(...validateFnTypes(typeCtx, method));
        if (method instanceof FnItem) {
            errors.push(...inferFnBody(typeCtx, method, selfTypeName));
        }
        // Skip deep body inference for generic methods
    }

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
    for (const method of item.fnImpls) {
        errors.push(...validateFnTypes(typeCtx, method));
        errors.push(...inferFnBody(typeCtx, method, selfTypeName));
    }
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
        if (item instanceof StructItem || item instanceof GenericStructItem) {
            errors.push(...validateStructFieldTypes(typeCtx, item));
        }
        if (item instanceof EnumItem) {
            errors.push(...validateEnumItemTypes(typeCtx, item));
        }
        if (item instanceof GenericFnItem) {
            errors.push(...validateFnTypes(typeCtx, item));
            // Skip deep body inference for generic functions — type params aren't concrete
            continue;
        }
        if (item instanceof FnItem) {
            errors.push(...validateFnTypes(typeCtx, item));
            errors.push(...inferFnBody(typeCtx, item));
        }
        if (item instanceof ModItem) {
            const nested = inferModule(
                typeCtx,
                new ModuleNode(item.span, item.name, item.items),
            );
            if (!nested.isOk()) {
                errors.push(...nested.error);
            }
        }
        if (item instanceof TraitItem) {
            for (const method of item.methods) {
                if (
                    method instanceof FnItem ||
                    method instanceof GenericFnItem
                ) {
                    errors.push(...validateFnTypes(typeCtx, method));
                }
            }
        }
        if (item instanceof ImplItem) {
            errors.push(...inferImplItem(typeCtx, item));
        }
        if (item instanceof TraitImplItem) {
            errors.push(...inferTraitImplItem(typeCtx, item));
        }
    }

    if (errors.length > 0) {
        return Result.err(errors);
    }
    return Result.ok();
}
