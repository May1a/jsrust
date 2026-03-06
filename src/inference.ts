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
    type ParamNode,
    RangeExpr,
    RefExpr,
    RefTypeNode,
    ReturnExpr,
    type Span,
    type Statement,
    StructExpr,
    StructItem,
    EnumItem,
    TraitImplItem,
    TraitItem,
    ArrayTypeNode,
    FnTypeNode,
    GenericArgsNode,
    PtrTypeNode,
    TupleTypeNode,
    type TypeNode,
    UnaryExpr,
    UnaryOp,
    UseItem,
    WhileExpr,
    type Item,
} from "./ast";
import { Result } from "better-result";
import { inferTypeArgs, mangledName } from "./monomorphize";
import type { TypeContext } from "./type_context";

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
    if (ty instanceof NamedTypeNode) {
        return ty.name;
    }
    if (ty instanceof TupleTypeNode) {
        if (ty.elements.length === 0) return "()";
        return `(${ty.elements.map(typeToString).join(", ")})`;
    }
    if (ty instanceof RefTypeNode) {
        let mutStr = "";
        if (ty.mutability === Mutability.Mutable) {
            mutStr = "mut ";
        }
        return `&${mutStr}${typeToString(ty.inner)}`;
    }
    return "<unknown>";
}

/**
 * Check if two types are structurally equivalent.
 */
function typesEqual(a: TypeNode, b: TypeNode): boolean {
    if (isInferredPlaceholder(a) || isInferredPlaceholder(b)) {
        return true;
    }
    if (a instanceof NamedTypeNode && b instanceof NamedTypeNode) {
        return a.name === b.name;
    }
    if (a instanceof TupleTypeNode && b instanceof TupleTypeNode) {
        if (a.elements.length !== b.elements.length) return false;
        return a.elements.every((el, i) => typesEqual(el, b.elements[i]));
    }
    if (a instanceof RefTypeNode && b instanceof RefTypeNode) {
        return a.mutability === b.mutability && typesEqual(a.inner, b.inner);
    }
    return false;
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
        ty: f.ty,
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
        typeCtx.registerFnSignature(`${qTarget}::${method.name}`, {
            params: buildParamList(method.params),
            returnType: method.returnType,
        });
        if (modulePrefix) {
            typeCtx.registerFnSignature(`${targetName}::${method.name}`, {
                params: buildParamList(method.params),
                returnType: method.returnType,
            });
        }
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
            const qualName = qualify(node.name);
            typeCtx.registerNamedType(
                qualName,
                new TupleTypeNode(node.span, []),
            );
            if (modulePrefix) {
                typeCtx.registerNamedType(
                    node.name,
                    new TupleTypeNode(node.span, []),
                );
            }
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
    errors: TypeError[],
): TypeNode | undefined {
    // Check if we already resolved this expression
    const cached = typeCtx.getExpressionType(expr);
    if (cached) return cached;

    const resolved = inferExprTypeInner(typeCtx, expr, errors);
    if (resolved) {
        typeCtx.setExpressionType(expr, resolved);
    }
    return resolved;
}

function inferExprTypeInner(
    typeCtx: TypeContext,
    expr: Expression,
    errors: TypeError[],
): TypeNode | undefined {
    if (expr instanceof LiteralExpr) {
        return inferLiteral(expr);
    }

    if (expr instanceof IdentifierExpr) {
        return inferIdentifier(typeCtx, expr, errors);
    }

    if (expr instanceof BinaryExpr) {
        return inferBinary(typeCtx, expr, errors);
    }

    if (expr instanceof UnaryExpr) {
        return inferUnary(typeCtx, expr, errors);
    }

    if (expr instanceof CallExpr) {
        return inferCall(typeCtx, expr, errors);
    }

    if (expr instanceof FieldExpr) {
        return inferFieldAccess(typeCtx, expr, errors);
    }

    if (expr instanceof StructExpr) {
        return inferStructLiteral(typeCtx, expr, errors);
    }

    if (expr instanceof BlockExpr) {
        return inferBlock(typeCtx, expr, errors);
    }

    if (expr instanceof IfExpr) {
        return inferIf(typeCtx, expr, errors);
    }

    if (expr instanceof RefExpr) {
        return inferRef(typeCtx, expr, errors);
    }

    if (expr instanceof MatchExpr) {
        return inferMatch(typeCtx, expr, errors);
    }

    if (expr instanceof ClosureExpr) {
        return expr.returnType;
    }

    return inferExprTypeExtended(typeCtx, expr, errors);
}

function inferExprTypeExtended(
    typeCtx: TypeContext,
    expr: Expression,
    errors: TypeError[],
): TypeNode | undefined {
    if (expr instanceof DerefExpr) {
        return inferDeref(typeCtx, expr, errors);
    }

    if (expr instanceof MacroExpr && expr.name === "vec") {
        let elemType: TypeNode | undefined;
        if (expr.args.length > 0) {
            const [firstArg] = expr.args;
            elemType = inferExprType(typeCtx, firstArg, errors);
        }
        for (const arg of expr.args) {
            inferExprType(typeCtx, arg, errors);
        }
        if (!elemType) return undefined;
        return new ArrayTypeNode(expr.span, elemType, undefined);
    }

    if (
        expr instanceof MacroExpr ||
        expr instanceof WhileExpr ||
        expr instanceof ForExpr ||
        expr instanceof LoopExpr ||
        expr instanceof AssignExpr
    ) {
        return inferUnitExpr(typeCtx, expr, errors);
    }

    if (
        expr instanceof ReturnExpr ||
        expr instanceof BreakExpr ||
        expr instanceof ContinueExpr
    ) {
        return inferDivergingExpr(typeCtx, expr, errors);
    }

    if (expr instanceof IndexExpr) {
        const receiverType = inferExprType(typeCtx, expr.receiver, errors);
        inferExprType(typeCtx, expr.index, errors);
        if (receiverType instanceof ArrayTypeNode) {
            return receiverType.element;
        }
        return undefined;
    }

    if (expr instanceof RangeExpr) {
        if (expr.start !== undefined) {
            inferExprType(typeCtx, expr.start, errors);
        }
        if (expr.end !== undefined) inferExprType(typeCtx, expr.end, errors);
        return undefined;
    }

    throw new Error(
        `Unhandled expression type in inference: ${expr.constructor.name}`,
    );
}

function inferLiteral(expr: LiteralExpr): TypeNode {
    switch (expr.literalKind) {
        case LiteralKind.Int: {
            return new NamedTypeNode(expr.span, "i32");
        }
        case LiteralKind.Float: {
            return new NamedTypeNode(expr.span, "f64");
        }
        case LiteralKind.Bool: {
            return new NamedTypeNode(expr.span, "bool");
        }
        case LiteralKind.String: {
            return new RefTypeNode(
                expr.span,
                Mutability.Immutable,
                new NamedTypeNode(expr.span, "str"),
            );
        }
        case LiteralKind.Char: {
            return new NamedTypeNode(expr.span, "char");
        }
        default: {
            throw new Error(
                `Unhandled literal kind in inference: ${String(expr.literalKind)}`,
            );
        }
    }
}

function inferIdentifier(
    typeCtx: TypeContext,
    expr: IdentifierExpr,
    errors: TypeError[],
): TypeNode | undefined {
    const varTy = typeCtx.lookupVariable(expr.name);
    if (varTy) return varTy;

    const fnSig = typeCtx.lookupFnSignature(expr.name);
    if (fnSig) {
        errors.push({
            message: `\`${expr.name}\` is a function and cannot be used as a first-class value`,
            span: expr.span,
        });
        return undefined;
    }

    const namedTy = typeCtx.lookupNamedType(expr.name);
    if (namedTy) {
        errors.push({
            message: `\`${expr.name}\` is a type and cannot be used as a value`,
            span: expr.span,
        });
        return undefined;
    }

    // Qualified paths (e.g. `Color::Green`, `Vec::new`) are enum variants or
    // associated items — not yet tracked in the type context. Return undefined
    // without an error; type propagation will handle the absence.
    if (expr.name.includes("::")) {
        return undefined;
    }

    errors.push({
        message: `Cannot find value \`${expr.name}\` in this scope`,
        span: expr.span,
    });
    return undefined;
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
    errors: TypeError[],
): TypeNode | undefined {
    const leftTy = inferExprType(typeCtx, expr.left, errors);
    const rightTy = inferExprType(typeCtx, expr.right, errors);

    // Comparison and logical operators always produce bool
    if (COMPARISON_OPS.has(expr.op) || LOGICAL_OPS.has(expr.op)) {
        return new NamedTypeNode(expr.span, "bool");
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

    return leftBase ?? rightBase;
}

function inferUnary(
    typeCtx: TypeContext,
    expr: UnaryExpr,
    errors: TypeError[],
): TypeNode | undefined {
    const operandTy = inferExprType(typeCtx, expr.operand, errors);

    if (expr.op === UnaryOp.Not) {
        // `!` on bool returns bool; on integers returns the integer type
        if (operandTy instanceof NamedTypeNode && operandTy.name === "bool") {
            return new NamedTypeNode(expr.span, "bool");
        }
        return operandTy;
    }

    if (expr.op === UnaryOp.Neg) {
        return operandTy;
    }

    if (expr.op === UnaryOp.Ref) {
        if (operandTy) {
            return new RefTypeNode(expr.span, Mutability.Immutable, operandTy);
        }
    }

    if (expr.op === UnaryOp.Deref) {
        if (operandTy instanceof RefTypeNode) {
            return operandTy.inner;
        }
        if (operandTy) {
            errors.push({
                message: `Cannot dereference value of type \`${typeToString(operandTy)}\``,
                span: expr.span,
            });
        }
        return undefined;
    }

    return operandTy;
}

function inferDeref(
    typeCtx: TypeContext,
    expr: DerefExpr,
    errors: TypeError[],
): TypeNode | undefined {
    const targetTy = inferExprType(typeCtx, expr.target, errors);
    if (targetTy instanceof RefTypeNode) {
        return targetTy.inner;
    }
    if (targetTy) {
        errors.push({
            message: `Cannot dereference value of type \`${typeToString(targetTy)}\``,
            span: expr.span,
        });
    }
    return undefined;
}

function inferUnitExpr(
    typeCtx: TypeContext,
    expr: MacroExpr | WhileExpr | ForExpr | LoopExpr | AssignExpr,
    errors: TypeError[],
): TupleTypeNode {
    if (expr instanceof WhileExpr) {
        inferExprType(typeCtx, expr.condition, errors);
        inferBlock(typeCtx, expr.body, errors);
    } else if (expr instanceof ForExpr) {
        inferExprType(typeCtx, expr.iter, errors);
        inferBlock(typeCtx, expr.body, errors);
    } else if (expr instanceof LoopExpr) {
        inferBlock(typeCtx, expr.body, errors);
    } else if (expr instanceof AssignExpr) {
        inferExprType(typeCtx, expr.target, errors);
        inferExprType(typeCtx, expr.value, errors);
    } else {
        for (const arg of expr.args) {
            inferExprType(typeCtx, arg, errors);
        }
    }
    return new TupleTypeNode(expr.span, []);
}

function inferDivergingExpr(
    typeCtx: TypeContext,
    expr: ReturnExpr | BreakExpr | ContinueExpr,
    errors: TypeError[],
): undefined {
    if (expr instanceof ReturnExpr && expr.value !== undefined) {
        inferExprType(typeCtx, expr.value, errors);
    } else if (expr instanceof BreakExpr && expr.value !== undefined) {
        inferExprType(typeCtx, expr.value, errors);
    }
    return undefined;
}

function inferCall(
    typeCtx: TypeContext,
    expr: CallExpr,
    errors: TypeError[],
): TypeNode | undefined {
    // Infer argument types for side effects (populates type context)
    const argTypes: (TypeNode | undefined)[] = [];
    for (const arg of expr.args) {
        argTypes.push(inferExprType(typeCtx, arg, errors));
    }

    // Resolve the callee
    if (expr.callee instanceof IdentifierExpr) {
        const genericResult = resolveGenericCall(typeCtx, expr, argTypes);
        if (genericResult) {
            return genericResult;
        }

        const sig = typeCtx.lookupFnSignature(expr.callee.name);
        if (sig) {
            return sig.returnType;
        }

        // Qualified paths (e.g. `Vec::new`) are not yet tracked — skip
        if (!expr.callee.name.includes("::")) {
            errors.push({
                message: `cannot find function \`${expr.callee.name}\` in this scope`,
                span: expr.callee.span,
            });
        }
        return undefined;
    }

    // Method call: callee is a FieldExpr (e.g., `obj.method(...)`)
    if (expr.callee instanceof FieldExpr) {
        const receiverTy = inferExprType(typeCtx, expr.callee.receiver, errors);
        if (receiverTy instanceof NamedTypeNode) {
            const methodSig = typeCtx.lookupFnSignature(
                `${receiverTy.name}::${expr.callee.field}`,
            );
            if (methodSig) {
                return methodSig.returnType;
            }
        }
        // Try through references
        if (
            receiverTy instanceof RefTypeNode &&
            receiverTy.inner instanceof NamedTypeNode
        ) {
            const methodSig = typeCtx.lookupFnSignature(
                `${receiverTy.inner.name}::${expr.callee.field}`,
            );
            if (methodSig) {
                return methodSig.returnType;
            }
        }

        // Receiver type is known but no matching method signature was found
        if (receiverTy) {
            errors.push({
                message: `no method \`${expr.callee.field}\` found for type \`${typeToString(receiverTy)}\``,
                span: expr.callee.span,
            });
        }
        return undefined;
    }

    return undefined;
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
    return ty;
}

function inferFieldAccess(
    typeCtx: TypeContext,
    expr: FieldExpr,
    errors: TypeError[],
): TypeNode | undefined {
    const receiverTy = inferExprType(typeCtx, expr.receiver, errors);
    if (!receiverTy) return undefined;

    // Direct struct type
    if (receiverTy instanceof NamedTypeNode) {
        const fieldTy = typeCtx.lookupStructField(receiverTy.name, expr.field);
        if (fieldTy) return fieldTy;

        errors.push({
            message: `No field \`${expr.field}\` on type \`${receiverTy.name}\``,
            span: expr.span,
        });
        return undefined;
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
        if (fieldTy) return fieldTy;

        errors.push({
            message: `No field \`${expr.field}\` on type \`${typeToString(receiverTy)}\``,
            span: expr.span,
        });
        return undefined;
    }

    return undefined;
}

function inferStructLiteral(
    typeCtx: TypeContext,
    expr: StructExpr,
    errors: TypeError[],
): TypeNode | undefined {
    if (!(expr.path instanceof IdentifierExpr)) return undefined;

    const structName = expr.path.name;
    const structFields = typeCtx.lookupStructFields(structName);

    if (!structFields) {
        errors.push({
            message: `Unknown struct \`${structName}\``,
            span: expr.span,
        });
        return undefined;
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

        const actualTy = inferExprType(typeCtx, fieldExpr, errors);
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

    return new NamedTypeNode(expr.span, structName);
}

function inferBlock(
    typeCtx: TypeContext,
    block: BlockExpr,
    errors: TypeError[],
): TypeNode | undefined {
    typeCtx.pushScope();
    inferStatements(typeCtx, block.stmts, errors);
    let resultTy: TypeNode | undefined;
    if (block.expr !== undefined) {
        resultTy = inferExprType(typeCtx, block.expr, errors);
    }
    typeCtx.popScope();
    return resultTy ?? new TupleTypeNode(block.span, []);
}

function inferIf(
    typeCtx: TypeContext,
    expr: IfExpr,
    errors: TypeError[],
): TypeNode | undefined {
    inferExprType(typeCtx, expr.condition, errors);
    const thenTy = inferExprType(typeCtx, expr.thenBranch, errors);
    if (expr.elseBranch !== undefined) {
        const elseTy = inferExprType(typeCtx, expr.elseBranch, errors);
        // If both branches have types, check they match
        if (thenTy && elseTy && !typesEqual(thenTy, elseTy)) {
            errors.push({
                message: `\`if\` and \`else\` have incompatible types: \`${typeToString(thenTy)}\` vs \`${typeToString(elseTy)}\``,
                span: expr.span,
            });
        }
        return thenTy;
    }
    return new TupleTypeNode(expr.span, []);
}

function inferRef(
    typeCtx: TypeContext,
    expr: RefExpr,
    errors: TypeError[],
): TypeNode | undefined {
    const innerTy = inferExprType(typeCtx, expr.target, errors);
    if (innerTy) {
        return new RefTypeNode(expr.span, expr.mutability, innerTy);
    }
    return undefined;
}

function inferMatch(
    typeCtx: TypeContext,
    expr: MatchExpr,
    errors: TypeError[],
): TypeNode | undefined {
    inferExprType(typeCtx, expr.matchOn, errors);
    let armTy: TypeNode | undefined;
    for (const arm of expr.arms) {
        const bodyTy = inferExprType(typeCtx, arm.body, errors);
        if (!armTy) {
            armTy = bodyTy;
        } else if (bodyTy && !typesEqual(armTy, bodyTy)) {
            errors.push({
                message: `Match arms have incompatible types: \`${typeToString(armTy)}\` vs \`${typeToString(bodyTy)}\``,
                span: arm.span,
            });
        }
    }
    return armTy;
}

// --- Statement Inference ---

function inferStatements(
    typeCtx: TypeContext,
    stmts: Statement[],
    errors: TypeError[],
): void {
    for (const stmt of stmts) {
        inferStatement(typeCtx, stmt, errors);
    }
}

function inferStatement(
    typeCtx: TypeContext,
    stmt: Statement,
    errors: TypeError[],
): void {
    if (stmt instanceof LetStmt) {
        inferLetStmt(typeCtx, stmt, errors);
        return;
    }

    if (stmt instanceof ExprStmt) {
        inferExprType(typeCtx, stmt.expr, errors);
        return;
    }

    if (stmt instanceof ItemStmt) {
        registerItemTypesWithPrefix(typeCtx, [stmt.item], "");
        return;
    }

    throw new Error(
        `Unhandled statement type in inference: ${stmt.constructor.name}`,
    );
}

function inferLetStmt(
    typeCtx: TypeContext,
    stmt: LetStmt,
    errors: TypeError[],
): void {
    const initTy = inferExprType(typeCtx, stmt.init, errors);
    const annotationTy = stmt.type;
    const hasAnnotation = !isInferredPlaceholder(annotationTy);

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
    errors: TypeError[],
    selfTypeName?: string,
): void {
    if (!fnItem.body) return;

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
    inferStatements(typeCtx, fnItem.body.stmts, errors);

    // If there's a tail expression, check it against the return type.
    // Resolve `Self` to the concrete impl target type so that e.g.
    // `-> Self` and a tail expression of type `Point` compare equal.
    if (fnItem.body.expr) {
        const tailTy = inferExprType(typeCtx, fnItem.body.expr, errors);
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
        const { name } = param;
        const { ty } = param;
        if (ty instanceof NamedTypeNode) {
            const builtIn = isBuiltinTypeName(ty.name);
            const known = typeCtx.lookupNamedType(ty.name);
            const generic = genericNames.has(ty.name);
            if (!known && !builtIn && !generic) {
                errors.push({
                    message: `Unknown parameter type \`${ty.name}\` for parameter \`${name}\``,
                    span: ty.span,
                });
            }
        }
    }

    const { returnType }: { returnType: TypeNode } = fnItem;
    if (returnType instanceof NamedTypeNode) {
        const builtIn = isBuiltinTypeName(returnType.name);
        const known = typeCtx.lookupNamedType(returnType.name);
        const generic = genericNames.has(returnType.name);
        if (!known && !builtIn && !generic) {
            errors.push({
                message: `Unknown return type \`${returnType.name}\` in function \`${fnItem.name}\``,
                span: returnType.span,
            });
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
            inferFnBody(typeCtx, method, errors, selfTypeName);
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
        inferFnBody(typeCtx, method, errors, selfTypeName);
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
        if (item instanceof GenericFnItem) {
            errors.push(...validateFnTypes(typeCtx, item));
            // Skip deep body inference for generic functions — type params aren't concrete
            continue;
        }
        if (item instanceof FnItem) {
            errors.push(...validateFnTypes(typeCtx, item));
            inferFnBody(typeCtx, item, errors);
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
    return Result.ok(undefined);
}
