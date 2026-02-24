import { floatWidthToString, FnType, intWidthToString, Type } from "./types";
import { Span, Node } from "./ast";

import {
    TypeKind,
    IntWidth,
    FloatWidth,
    makeIntType,
    makeFloatType,
    makeBoolType,
    makeCharType,
    makeStringType,
    makeUnitType,
    makeNeverType,
    makeTupleType,
    makeArrayType,
    makeSliceType,
    makeStructType,
    makeEnumType,
    makeRefType,
    makePtrType,
    makeFnType,
    makeNamedType,
    typeEquals,
    typeToString,
    isNumericType,
    isIntegerType,
    isCopyableType,
} from "./types";

import { NodeKind, LiteralKind, UnaryOp, BinaryOp, Mutability } from "./ast";
import { err, isErr, ok, Result } from "./diagnostics";
import { ItemDecl, TypeContext } from "./type_context";

// ============================================================================
// Task 4.10: Error Reporting
// ============================================================================

export type TypeError = {
    message: string;
    span?: Span;
    notes?: string[];
};

export type CombinedResult =
    | { ok: true; types: Type[] }
    | { ok: false; errors: TypeError[] };
export type UnifySuccess = { ok: true };
export type UnifyError = { ok: false; error: TypeError };
export type UnifyResult = UnifySuccess | UnifyError;

type InferenceResult<T> = Result<T, TypeError[]>;

function combineResults(
    results: InferenceResult<Type>[],
): InferenceResult<Type[]> {
    const errors: TypeError[] = [];
    const types: Type[] = [];
    for (const result of results) {
        if (isErr(result)) {
            errors.push(...result.error);
        } else {
            types.push(result.value);
        }
    }
    if (errors.length > 0) {
        return err(errors);
    }
    return ok(types);
}

function collectUnsupportedGenericConstraintErrors(
    fnItem: Node,
): Result<void, TypeError[]> {
    const errors: TypeError[] = [];
    const genericParams = fnItem.genericParams || [];
    const hasTraitBounds: boolean = genericParams.some(
        (p: { bounds?: Node[] }) => (p.bounds || []).length > 0,
    );
    if (hasTraitBounds) {
        errors.push({
            message: "Trait bounds are parsed but not implemented yet", // TODO: implement
            span: fnItem.span,
        });
    }
    if ((fnItem.whereClause || []).length > 0) {
        errors.push({
            message: "where clauses are parsed but not implemented yet", // TODO: implement
            span: fnItem.span,
        });
    }
    if (errors.length > 0) return err(errors);
    return ok(undefined);
}

function lookupDirectFunctionItemForCall(
    ctx: TypeContext,
    callee: Node,
    // FIXME: use Result type
): ItemDecl | null {
    if (callee.kind === NodeKind.IdentifierExpr) {
        const lookupName = callee.resolvedItemName || callee.name;
        const item = ctx.lookupItem(lookupName);
        return item && item.kind === "fn" ? item : null;
    }
    if (callee.kind === NodeKind.PathExpr) {
        const lookupName =
            callee.resolvedItemName ||
            (callee.segments && callee.segments.length > 0
                ? callee.segments[0]
                : null);
        if (!lookupName) return null;
        const item = ctx.lookupItem(lookupName);
        return item && item.kind === "fn" ? item : null;
    }
    return null;
}

function substituteGenericTypeBindings(
    ctx: TypeContext,
    type: Type,
    genericNames: Set<string>,
    bindings: Map<string, Type>,
    createMissingBindings: boolean = true,
): Type {
    const resolved = ctx.resolveType(type);
    switch (resolved.kind) {
        case TypeKind.Named: {
            if (genericNames.has(resolved.name) && !resolved.args) {
                const existing = bindings.get(resolved.name);
                if (existing) {
                    return ctx.resolveType(existing);
                }
                if (createMissingBindings) {
                    const fresh = ctx.freshTypeVar(resolved.span);
                    bindings.set(resolved.name, fresh);
                    return fresh;
                }
                return resolved;
            }
            if (!resolved.args) return resolved;
            return makeNamedType(
                resolved.name,
                resolved.args.map((t) =>
                    substituteGenericTypeBindings(
                        ctx,
                        t,
                        genericNames,
                        bindings,
                        createMissingBindings,
                    ),
                ),
                resolved.span,
            );
        }
        case TypeKind.Tuple:
            return makeTupleType(
                resolved.elements.map((t) =>
                    substituteGenericTypeBindings(
                        ctx,
                        t,
                        genericNames,
                        bindings,
                        createMissingBindings,
                    ),
                ),
                resolved.span,
            );
        case TypeKind.Array:
            return makeArrayType(
                substituteGenericTypeBindings(
                    ctx,
                    resolved.element,
                    genericNames,
                    bindings,
                    createMissingBindings,
                ),
                resolved.length,
                resolved.span,
            );
        case TypeKind.Slice:
            return makeSliceType(
                substituteGenericTypeBindings(
                    ctx,
                    resolved.element,
                    genericNames,
                    bindings,
                    createMissingBindings,
                ),
                resolved.span,
            );
        case TypeKind.Ref:
            return makeRefType(
                substituteGenericTypeBindings(
                    ctx,
                    resolved.inner,
                    genericNames,
                    bindings,
                    createMissingBindings,
                ),
                resolved.mutable,
                resolved.span,
            );
        case TypeKind.Ptr:
            return makePtrType(
                substituteGenericTypeBindings(
                    ctx,
                    resolved.inner,
                    genericNames,
                    bindings,
                    createMissingBindings,
                ),
                resolved.mutable,
                resolved.span,
            );
        case TypeKind.Fn:
            return makeFnType(
                resolved.params.map((t) =>
                    substituteGenericTypeBindings(
                        ctx,
                        t,
                        genericNames,
                        bindings,
                        createMissingBindings,
                    ),
                ),
                substituteGenericTypeBindings(
                    ctx,
                    resolved.returnType,
                    genericNames,
                    bindings,
                    createMissingBindings,
                ),
                resolved.isUnsafe,
                resolved.isConst,
                resolved.span,
            );
        default:
            return resolved;
    }
}

function inferGenericFunctionCall(
    ctx: TypeContext,
    call: Node,
    itemDecl: ItemDecl,
): Result<Type, TypeError> {
    const fnType = itemDecl.type;
    if (!fnType || fnType.kind !== TypeKind.Fn) {
        return err({
            message: "Generic function type is not available",
            span: call.span,
        });
    }
    const genericNames = itemDecl.node.generics ?? []; // FIXME: typesafety
    const genericSet: Set<string> = new Set(genericNames);
    const bindings: Map<string, Type> = itemDecl.genericBindings ?? new Map();
    itemDecl.genericBindings = bindings;

    if (call.typeArgs !== null) {
        if (call.typeArgs.length !== genericNames.length) {
            return err({
                message: `Generic function expects ${genericNames.length} type arguments, got ${call.typeArgs.length}`,
                span: call.span,
            });
        }
        for (let i = 0; i < genericNames.length; i++) {
            const name = genericNames[i];
            const typeArgResult = resolveTypeNode(ctx, call.typeArgs[i]);
            if (!typeArgResult.ok) {
                return err(typeArgResult.error[0]);
            }
            const existing = bindings.get(name);
            if (existing) {
                const unifyExisting = unify(ctx, existing, typeArgResult.value);
                if (!unifyExisting.ok) {
                    return err(unifyExisting.error);
                }
            } else {
                bindings.set(name, typeArgResult.value);
            }
        }
    }

    if (call.args.length !== fnType.params.length) {
        return err({
            message: `Function expects ${fnType.params.length} arguments, got ${call.args.length}`,
            span: call.span,
        });
    }

    for (let i = 0; i < call.args.length; i++) {
        const argResult = inferExpr(ctx, call.args[i]);
        if (!argResult.ok) return argResult;
        const expectedParamType = substituteGenericTypeBindings(
            ctx,
            fnType.params[i],
            genericSet,
            bindings,
        );
        const unifyResult = unify(ctx, argResult.value, expectedParamType);
        if (!unifyResult.ok) {
            return err({
                message: `Argument type mismatch: expected ${typeToString(expectedParamType)}, got ${typeToString(argResult.value)}`,
                span: call.args[i]?.span ?? call.span,
            });
        }
    }

    const returnType = substituteGenericTypeBindings(
        ctx,
        fnType.returnType,
        genericSet,
        bindings,
    );
    const concreteParams = fnType.params.map((p) =>
        substituteGenericTypeBindings(ctx, p, genericSet, bindings, false),
    );
    const concreteReturn = substituteGenericTypeBindings(
        ctx,
        fnType.returnType,
        genericSet,
        bindings,
        false,
    );
    itemDecl.type = makeFnType(
        concreteParams,
        concreteReturn,
        fnType.isUnsafe || false,
        fnType.isConst || false,
        fnType.span,
    );
    return ok(returnType);
}

// ============================================================================
// Task 4.8: Unification
// ============================================================================

/**
 * Unify two types, making them equal
 * @param {TypeContext} ctx
 * @param {Type} t1
 * @param {Type} t2
 * @returns {UnifyResult}
 */
function unify(ctx: TypeContext, t1: Type, t2: Type): Result<void, TypeError> {
    // Resolve type variables first
    t1 = ctx.resolveType(t1);
    t2 = ctx.resolveType(t2);

    // Same type - success
    if (typeEquals(t1, t2)) {
        return ok(undefined);
    }

    // Unit types are always equal (regardless of span)
    if (t1.kind === TypeKind.Unit && t2.kind === TypeKind.Unit) {
        return ok(undefined);
    }

    // Type variable unification
    if (t1.kind === TypeKind.TypeVar && t1.bound === null) {
        // Occurs check
        if (ctx.occursIn(t1.id, t2)) {
            return err({
                message: `Occurs check failed: type variable ?${t1.id} occurs in ${typeToString(t2)}`,
                span: t1.span,
            });
        }
        const result = ctx.bindTypeVar(t1.id, t2);
        if (!result.ok) {
            return err({
                message: result.err ?? "Failed to bind type variable",
                span: t1.span,
            });
        }
        return ok(undefined);
    }

    if (t2.kind === TypeKind.TypeVar && t2.bound === null) {
        // Occurs check
        if (ctx.occursIn(t2.id, t1)) {
            return err({
                message: `Occurs check failed: type variable ?${t2.id} occurs in ${typeToString(t1)}`,
                span: t2.span,
            });
        }
        const result = ctx.bindTypeVar(t2.id, t1);
        if (!result.ok) {
            return err({
                message: result.err ?? "Failed to bind type variable",
                span: t2.span,
            });
        }
        return ok(undefined);
    }

    // Never type unifies with anything (bottom type)
    if (t1.kind === TypeKind.Never) {
        return ok(undefined);
    }
    if (t2.kind === TypeKind.Never) {
        return ok(undefined);
    }

    // Tuple unification
    if (t1.kind === TypeKind.Tuple && t2.kind === TypeKind.Tuple) {
        if (t1.elements.length !== t2.elements.length) {
            return err({
                message: `Tuple length mismatch: expected ${t1.elements.length}, got ${t2.elements.length}`,
                span: t1.span,
            });
        }
        for (let i = 0; i < t1.elements.length; i++) {
            const result = unify(ctx, t1.elements[i], t2.elements[i]);
            if (!result.ok) return result;
        }
        return ok(undefined);
    }

    // Array unification
    if (t1.kind === TypeKind.Array && t2.kind === TypeKind.Array) {
        if (t1.length !== t2.length) {
            return err({
                message: `Array length mismatch: expected ${t1.length}, got ${t2.length}`,
                span: t1.span,
            });
        }
        return unify(ctx, t1.element, t2.element);
    }

    // Slice unification
    if (t1.kind === TypeKind.Slice && t2.kind === TypeKind.Slice) {
        return unify(ctx, t1.element, t2.element);
    }

    // Reference unification
    if (t1.kind === TypeKind.Ref && t2.kind === TypeKind.Ref) {
        if (t1.mutable !== t2.mutable) {
            return err({
                message: `Mutability mismatch: expected ${t1.mutable ? "mut" : "immutable"}, got ${t2.mutable ? "mut" : "immutable"}`,
                span: t1.span,
            });
        }
        return unify(ctx, t1.inner, t2.inner);
    }

    // Pointer unification
    if (t1.kind === TypeKind.Ptr && t2.kind === TypeKind.Ptr) {
        if (t1.mutable !== t2.mutable) {
            return err({
                message: `Mutability mismatch: expected ${t1.mutable ? "mut" : "const"}, got ${t2.mutable ? "mut" : "const"}`,
                span: t1.span,
            });
        }
        return unify(ctx, t1.inner, t2.inner);
    }

    // Function unification
    if (t1.kind === TypeKind.Fn && t2.kind === TypeKind.Fn) {
        if (t1.params.length !== t2.params.length) {
            return err({
                message: `Function parameter count mismatch: expected ${t1.params.length}, got ${t2.params.length}`,
                span: t1.span,
            });
        }
        for (let i = 0; i < t1.params.length; i++) {
            const result = unify(ctx, t1.params[i], t2.params[i]);
            if (!result.ok) return result;
        }
        return unify(ctx, t1.returnType, t2.returnType);
    }

    // Named type unification (for struct/enum)
    if (t1.kind === TypeKind.Named && t2.kind === TypeKind.Named) {
        if (t1.name !== t2.name) {
            return err({
                message: `Type mismatch: expected ${t1.name}, got ${t2.name}`,
                span: t1.span,
            });
        }
        // Check generic args if present
        if (t1.args && t2.args) {
            if (t1.args.length !== t2.args.length) {
                return err({
                    message: `Generic argument count mismatch for ${t1.name}`,
                    span: t1.span,
                });
            }
            for (let i = 0; i < t1.args.length; i++) {
                const result = unify(ctx, t1.args[i], t2.args[i]);
                if (!result.ok) return result;
            }
        }
        return ok(undefined);
    }

    // Struct type unification
    if (t1.kind === TypeKind.Struct && t2.kind === TypeKind.Struct) {
        if (t1.name !== t2.name) {
            return err({
                message: `Struct type mismatch: expected ${t1.name}, got ${t2.name}`,
                span: t1.span,
            });
        }
        return ok(undefined);
    }

    // Enum type unification
    if (t1.kind === TypeKind.Enum && t2.kind === TypeKind.Enum) {
        if (t1.name !== t2.name) {
            return err({
                message: `Enum type mismatch: expected ${t1.name}, got ${t2.name}`,
                span: t1.span,
            });
        }

        return ok(undefined);
    }

    // Integer type unification (different widths)
    if (t1.kind === TypeKind.Int && t2.kind === TypeKind.Int) {
        if (t1.width !== t2.width) {
            return err({
                message: `Integer type mismatch: expected ${typeToString(t1)}, got ${typeToString(t2)}`,
                span: t1.span,
            });
        }
        return ok(undefined);
    }

    // Float type unification (different widths)
    if (t1.kind === TypeKind.Float && t2.kind === TypeKind.Float) {
        if (t1.width !== t2.width) {
            return err({
                message: `Float type mismatch: expected ${typeToString(t1)}, got ${typeToString(t2)}`,
                span: t1.span,
            });
        }
        return ok(undefined);
    }

    // Default: types don't unify
    return err({
        message: `Type mismatch: expected ${typeToString(t1)}, got ${typeToString(t2)}`,
        span: t1.span ?? t2.span,
    });
}

// ============================================================================
// Task 4.9: Substitution
// ============================================================================

/** Substitute type variables with their bounds in a type */
function substitute(ctx: TypeContext, type: Type): Type {
    type = ctx.resolveType(type);

    switch (type.kind) {
        case TypeKind.TypeVar:
            if (type.bound) {
                return substitute(ctx, type.bound);
            }
            return type;
        case TypeKind.Tuple:
            return makeTupleType(
                type.elements.map((t) => substitute(ctx, t)),
                type.span,
            );
        case TypeKind.Array:
            return makeArrayType(
                substitute(ctx, type.element),
                type.length,
                type.span,
            );
        case TypeKind.Slice:
            return makeSliceType(substitute(ctx, type.element), type.span);
        case TypeKind.Ref:
            return makeRefType(
                substitute(ctx, type.inner),
                type.mutable,
                type.span,
            );
        case TypeKind.Ptr:
            return makePtrType(
                substitute(ctx, type.inner),
                type.mutable,
                type.span,
            );
        case TypeKind.Fn:
            return makeFnType(
                type.params.map((t) => substitute(ctx, t)),
                substitute(ctx, type.returnType),
                type.isUnsafe,
                type.isConst,
                type.span,
            );
        case TypeKind.Named:
            if (type.args) {
                return makeNamedType(
                    type.name,
                    type.args.map((t) => substitute(ctx, t)),
                    type.span,
                );
            }
            return type;
        default:
            return type;
    }
}

function typeKeyForMethodLookup(ty: Type): string | null {
    switch (ty.kind) {
        case TypeKind.Struct:
        case TypeKind.Enum:
        case TypeKind.Named:
            return ty.name;
        case TypeKind.Int:
            return intWidthToString(ty.width);
        case TypeKind.Float:
            return floatWidthToString(ty.width);
        case TypeKind.Bool:
            return "bool";
        case TypeKind.Char:
            return "char";
        case TypeKind.String:
            return "str"; // TODO: reconsider this
        case TypeKind.Unit:
            return "()";
        case TypeKind.Never:
            return "!";
        default:
            return null;
    }
}

function extractTypeNodeGenericParamNames(typeNode: Node | null): string[] {
    if (
        !typeNode ||
        typeNode.kind !== NodeKind.NamedType ||
        !typeNode.args?.args
    ) {
        return [];
    }
    const names: string[] = [];
    for (const arg of typeNode.args.args) {
        if (arg?.kind === NodeKind.NamedType && arg.name) {
            names.push(arg.name);
        } else {
            names.push("");
        }
    }
    return names;
}

function vecElementTypeForType(receiverType: Type): Type | null {
    if (
        receiverType.kind === TypeKind.Named &&
        receiverType.name === "Vec" &&
        receiverType.args &&
        receiverType.args.length === 1
    ) {
        return receiverType.args[0];
    }
    return null;
}

type MethodImplMeta = {
    implGenericNames?: string[];
    targetGenericParamNames?: string[];
};

/** Instantiate impl generic method signatures for a concrete receiver type. */
function instantiateMethodTypeForReceiver(
    ctx: TypeContext,
    fnType: FnType,
    receiverType: Type,
    meta: MethodImplMeta,
): FnType {
    const implGenericNames = Array.isArray(meta?.implGenericNames) // FIXME: typesafety
        ? meta.implGenericNames
        : [];
    if (implGenericNames.length === 0) {
        return fnType;
    }
    const targetGenericParamNames = Array.isArray(meta?.targetGenericParamNames) // FIXME: typesafety
        ? meta.targetGenericParamNames
        : [];
    if (
        receiverType.kind !== TypeKind.Named || // FIXME: typesafety
        !receiverType.args ||
        receiverType.args.length === 0 ||
        targetGenericParamNames.length === 0
    ) {
        return fnType;
    }
    const genericSet: Set<string> = new Set(implGenericNames);
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
    return substituteGenericTypeBindings(
        ctx,
        fnType,
        genericSet,
        bindings,
        false,
    ) as FnType;
}

function resolveImplTargetType(
    ctx: TypeContext,
    typeNode: Node,
): Result<Type, TypeError> {
    const tyResult = resolveTypeNode(ctx, typeNode);
    if (!tyResult.ok) return err(tyResult.error[0]);
    const resolved = ctx.resolveType(tyResult.value);
    if (resolved.kind === TypeKind.Named) {
        const decl = ctx.lookupItem(resolved.name);
        if (!decl && !resolveBuiltinType(resolved.name, resolved.span)) {
            return err({
                message: `impl target must resolve to a known type: ${resolved.name}`,
                span: typeNode?.span,
            });
        }
    }
    const key = typeKeyForMethodLookup(tyResult.value);
    if (!key) {
        return err({
            message: "impl target must be a concrete named/builtin type",
            span: typeNode?.span,
        });
    }
    return ok(tyResult.value);
}

// ============================================================================
// Task 4.1: Inference Entry Point
// ============================================================================

/**
 * Infer types for a module
 * TODO: clean up this function
 */
function inferModule(
    ctx: TypeContext,
    module: Node,
): Result<void, TypeError[]> {
    // Task 4.2: Declaration Gathering Pass
    const gatherResult = gatherDeclarations(ctx, module);
    if (!gatherResult.ok) {
        return err(gatherResult.error);
    }

    // Check all function bodies
    const checkResult = checkModuleItems(ctx, module);
    if (!checkResult.ok) {
        return err(checkResult.error);
    }

    // Task 4.11: Inference Finalization
    const finalizeResult = finalizeInference(ctx);
    if (!finalizeResult.ok) {
        return err(finalizeResult.error);
    }

    return ok(undefined);
}

// ============================================================================
// Task 4.2: Declaration Gathering Pass
// ============================================================================

/** Gather all declarations in a module */
function gatherDeclarations(
    ctx: TypeContext,
    module: Node,
): Result<void, TypeError[]> {
    const errors: TypeError[] = [];
    for (const item of module.items || []) {
        const result = gatherDeclaration(ctx, item);
        if (!result.ok) {
            errors.push(...result.error);
        }
    }
    if (errors.length > 0) return err(errors);
    return ok(undefined);
}

/** Gather a single declaration */
function gatherDeclaration(
    ctx: TypeContext,
    item: Node,
): Result<void, TypeError[]> {
    switch (item.kind) {
        case NodeKind.FnItem: {
            const genericConstraintErrors =
                collectUnsupportedGenericConstraintErrors(item);
            if (!genericConstraintErrors.ok) {
                return err(genericConstraintErrors.error);
            }
            let pushedSelf = false;
            if (item.implTargetName && !ctx.currentImplSelfType()) {
                const builtinSelf = resolveBuiltinType(
                    item.implTargetName,
                    item.span,
                );
                ctx.pushImplSelfType(
                    builtinSelf ||
                        makeStructType(item.implTargetName, [], item.span),
                );
                pushedSelf = true;
            }
            const typeResult = inferFnSignature(ctx, item);
            if (pushedSelf) {
                ctx.popImplSelfType();
            }
            if (!typeResult.ok) return typeResult;
            const itemName = item.qualifiedName || item.name;
            const registerResult = ctx.registerFn(
                itemName,
                item,
                typeResult.value,
            );
            if (!registerResult.ok) {
                return err([
                    {
                        message:
                            registerResult.error ??
                            "Failed to register function",
                        span: item.span,
                    },
                ]);
            }
            if (item.implTargetName && item.unqualifiedName) {
                const registerMethodResult = ctx.registerMethod(
                    item.implTargetName,
                    item.unqualifiedName,
                    item,
                    typeResult.value,
                    { receiver: item.params?.[0]?.receiverKind || null },
                );
                if (!registerMethodResult.ok) {
                    return err([
                        {
                            message:
                                registerMethodResult.err ??
                                "Failed to register method",
                            span: item.span,
                        },
                    ]);
                }
            }
            return ok(undefined);
        }

        case NodeKind.StructItem: {
            const itemName = item.qualifiedName || item.name;
            const registerResult = ctx.registerStruct(itemName, item);
            if (!registerResult.ok) {
                return err([
                    {
                        message:
                            registerResult.error ?? "Failed to register struct",
                        span: item.span,
                    },
                ]);
            }
            return ok(undefined);
        }

        case NodeKind.EnumItem: {
            const itemName = item.qualifiedName || item.name;
            const registerResult = ctx.registerEnum(itemName, item);
            if (!registerResult.ok) {
                return err([
                    {
                        message:
                            registerResult.error ?? "Failed to register enum",
                        span: item.span,
                    },
                ]);
            }
            return ok(undefined);
        }

        case NodeKind.TraitItem: {
            const traitErrors: TypeError[] = [];
            for (const method of item.methods || []) {
                const traitResult =
                    collectUnsupportedGenericConstraintErrors(method);
                if (!traitResult.ok) {
                    traitErrors.push(...traitResult.error);
                }
            }
            if (traitErrors.length > 0) {
                return err(traitErrors);
            }
            const registerResult = ctx.registerTrait(item.name, item);
            if (!registerResult.ok) {
                return err([
                    {
                        message:
                            registerResult.err ?? "Failed to register trait",
                        span: item.span,
                    },
                ]);
            }
            return ok(undefined);
        }

        case NodeKind.ModItem: {
            const registerResult = ctx.registerMod(item.name, item);
            if (!registerResult.ok) {
                return err([
                    {
                        message:
                            registerResult.error ?? "Failed to register module",
                        span: item.span,
                    },
                ]);
            }
            // Recursively gather declarations from inline modules
            if (item.isInline && item.items) {
                ctx.pushScope();
                const gatherResult = gatherDeclarations(ctx, item);
                ctx.popScope();
                if (!gatherResult.ok) return gatherResult;
            }
            return ok(undefined);
        }

        case NodeKind.UseItem:
            return ok(undefined);

        case NodeKind.ImplItem: {
            const targetResult = resolveImplTargetType(ctx, item.targetType);
            if (!targetResult.ok) {
                return err([targetResult.error]);
            }
            const targetType = targetResult.value;
            const targetName = typeKeyForMethodLookup(targetType);
            if (!targetName) {
                return err([
                    {
                        message: "impl target must be concrete",
                        span: item.span,
                    },
                ]);
            }
            const errors = [];
            const isTraitImpl = !!item.traitType;
            const implGenericNames = (item.genericParams || [])
                .map((p: { name?: string }) => p.name || "")
                .filter((name: string) => name.length > 0);
            const targetGenericParamNames = extractTypeNodeGenericParamNames(
                item.targetType,
            );

            const implMethodsByName = new Map<string, Node>();
            for (const method of item.methods) {
                const traitResult =
                    collectUnsupportedGenericConstraintErrors(method);
                if (!traitResult.ok) {
                    errors.push(...traitResult.error);
                }
                if (implMethodsByName.has(method.name)) {
                    errors.push({
                        message: `Duplicate method in impl block: ${method.name}`,
                        span: method.span,
                    });
                    continue;
                }
                implMethodsByName.set(method.name, method);
            }

            let traitMethodsByName: Map<string, Node> | null = null;
            let traitName = null;
            if (isTraitImpl) {
                traitName = item.traitType?.name || null;
                if (!traitName) {
                    errors.push({
                        message: "Trait impl must name a trait",
                        span: item.span,
                    });
                } else {
                    const traitDecl = ctx.lookupTrait(traitName);
                    if (!traitDecl) {
                        errors.push({
                            message: `Unknown trait: ${traitName}`,
                            span: item.span,
                        });
                    } else {
                        traitMethodsByName = new Map(
                            (traitDecl.node.methods || []).map((m: Node) => [
                                m.name,
                                m,
                            ]),
                        );
                        const implRegisterResult = ctx.registerTraitImpl(
                            traitName,
                            targetName,
                        );
                        if (!implRegisterResult.ok) {
                            errors.push({
                                message: implRegisterResult.err,
                                span: item.span,
                            });
                        }
                    }
                }
            }

            ctx.pushImplSelfType(targetType);
            if (traitMethodsByName) {
                for (const [traitMethodName, traitMethod] of Array.from(
                    traitMethodsByName.entries(),
                )) {
                    const implMethod = implMethodsByName.get(traitMethodName);
                    if (!implMethod) {
                        errors.push({
                            message: `Trait method not implemented: ${traitMethodName}`,
                            span: item.span,
                        });
                        continue;
                    }
                    const traitSig = inferFnSignature(ctx, traitMethod);
                    const implSig = inferFnSignature(ctx, implMethod);
                    if (!traitSig.ok) {
                        errors.push(...traitSig.error);
                        continue;
                    }
                    if (!implSig.ok) {
                        errors.push(...implSig.error);
                        continue;
                    }
                    if (!typeEquals(traitSig.value, implSig.value)) {
                        errors.push({
                            message: `Method signature mismatch for ${traitMethodName}: expected ${typeToString(traitSig.value)} got ${typeToString(implSig.value)}`,
                            span: implMethod.span,
                        });
                    }
                }
                for (const [implMethodName, implMethod] of Array.from(
                    implMethodsByName.entries(),
                )) {
                    if (!traitMethodsByName.has(implMethodName)) {
                        errors.push({
                            message: `Method not in trait ${traitName}: ${implMethodName}`,
                            span: implMethod.span,
                        });
                    }
                }
            }

            for (const method of item.methods) {
                const typeResult = inferFnSignature(ctx, method);
                if (!typeResult.ok) {
                    errors.push(...typeResult.error);
                    continue;
                }
                const symbolName = isTraitImpl
                    ? `${targetName}::<${traitName || "__unresolved_trait"}>::${method.name}`
                    : `${targetName}::${method.name}`;
                const registerFnResult = ctx.registerFn(
                    symbolName,
                    method,
                    typeResult.value,
                );
                if (!registerFnResult.ok) {
                    errors.push({
                        message:
                            registerFnResult.error ??
                            "Failed to register impl method",
                        span: method.span,
                    });
                    continue;
                }
                if (isTraitImpl) {
                    const registerTraitMethodResult = ctx.registerTraitMethod(
                        targetName,
                        traitName || "__unresolved_trait",
                        method.name,
                        method,
                        typeResult.value,
                        {
                            receiver: method.params?.[0]?.receiverKind || null,
                            implGenericNames,
                            targetGenericParamNames,
                            targetTypeName: targetName,
                        },
                    );
                    if (!registerTraitMethodResult.ok) {
                        errors.push({
                            message:
                                registerTraitMethodResult.err ||
                                "Failed to register trait impl method",
                            span: method.span,
                        });
                    }
                } else {
                    const registerMethodResult = ctx.registerMethod(
                        targetName,
                        method.name,
                        method,
                        typeResult.value,
                        {
                            receiver: method.params?.[0]?.receiverKind || null,
                            implGenericNames,
                            targetGenericParamNames,
                            targetTypeName: targetName,
                        },
                    );
                    if (!registerMethodResult.ok) {
                        errors.push({
                            message:
                                registerMethodResult.err ||
                                "Failed to register impl method",
                            span: method.span,
                        });
                    }
                }
            }
            ctx.popImplSelfType();
            if (errors.length > 0) {
                return err(errors);
            }
            return ok(undefined);
        }

        default:
            return ok(undefined);
    }
}

/**
 * Infer function signature type
 * @param {TypeContext} ctx
 * @param {Node} fnItem
 * @returns {InferenceResult}
 */
function inferFnSignature(
    ctx: TypeContext,
    fnItem: Node,
): Result<Type, TypeError[]> {
    const paramTypes: Type[] = [];
    for (const param of fnItem.params || []) {
        if (param.ty) {
            const typeResult = resolveTypeNode(ctx, param.ty);
            if (!typeResult.ok) return typeResult;
            paramTypes.push(typeResult.value);
        } else {
            // No type annotation - create type variable
            paramTypes.push(ctx.freshTypeVar(param.span));
        }
    }

    let returnType: Type;
    if (fnItem.returnType) {
        const result = resolveTypeNode(ctx, fnItem.returnType);
        if (!result.ok) return result;
        returnType = result.value;
    } else {
        // No return type annotation - default to unit
        returnType = makeUnitType(fnItem.span);
    }
    return ok(
        makeFnType(
            paramTypes,
            returnType,
            fnItem.isUnsafe || false,
            fnItem.isConst || false,
            fnItem.span,
        ),
    );
}

// ============================================================================
// Type Resolution
// ============================================================================

/**
 * Resolve an AST type node to a Type
 */
function resolveTypeNode(
    ctx: TypeContext,
    typeNode: Node,
): Result<Type, TypeError[]> {
    switch (typeNode.kind) {
        case NodeKind.NamedType: {
            if (typeNode.name === "Self") {
                const selfType = ctx.currentImplSelfType();
                if (selfType) {
                    return ok(selfType);
                }
            }

            let args: Type[] | null = null;
            if (typeNode.args && typeNode.args.args) {
                const argsResult = combineResults(
                    // FIXME: typesafety
                    typeNode.args.args.map((a: Node) =>
                        resolveTypeNode(ctx, a),
                    ),
                );
                if (!argsResult.ok) {
                    return err(argsResult.error);
                }
                args = argsResult.value;
            }
            // Check for builtin types
            const builtin = resolveBuiltinType(typeNode.name, typeNode.span);
            if (builtin) {
                return ok(builtin);
            }

            // Check for user-defined types
            const item = ctx.lookupItem(typeNode.name);
            if (item) {
                if (item.kind === "struct") {
                    if (args && args.length > 0) {
                        return ok(
                            makeNamedType(typeNode.name, args, typeNode.span),
                        );
                    }
                    return ok(makeStructType(typeNode.name, [], typeNode.span));
                }
                if (item.kind === "enum") {
                    if (args && args.length > 0) {
                        return ok(
                            makeNamedType(typeNode.name, args, typeNode.span),
                        );
                    }
                    return ok(makeEnumType(typeNode.name, [], typeNode.span));
                }
            }
            // Check for type alias
            const alias = ctx.lookupTypeAlias(typeNode.name);
            if (alias) {
                return ok(alias);
            }
            // Unknown type - keep as named for now
            return ok(makeNamedType(typeNode.name, args, typeNode.span));
        }
        case NodeKind.TupleType: {
            const elementsResult = combineResults(
                (typeNode.elements || []).map((e: Node) =>
                    resolveTypeNode(ctx, e),
                ),
            );
            if (!elementsResult.ok) {
                return err(elementsResult.error);
            }
            return ok(makeTupleType(elementsResult.value, typeNode.span));
        }

        case NodeKind.ArrayType: {
            const elementResult = resolveTypeNode(ctx, typeNode.element);
            if (!elementResult.ok) return elementResult;
            // Length is optional for inference purposes
            const length = typeNode.length ? 0 : 0; // TODO: evaluate constant expression
            return ok(
                makeArrayType(elementResult.value, length, typeNode.span),
            );
        }

        case NodeKind.RefType: {
            const innerResult = resolveTypeNode(ctx, typeNode.inner);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            if (!mutable && innerResult.value.kind === TypeKind.String) {
                return ok(innerResult.value);
            }
            return ok(makeRefType(innerResult.value, mutable, typeNode.span));
        }

        case NodeKind.PtrType: {
            const innerResult = resolveTypeNode(ctx, typeNode.inner);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            return ok(makePtrType(innerResult.value, mutable, typeNode.span));
        }

        case NodeKind.FnType: {
            const paramsResult = combineResults(
                (typeNode.params || []).map((p: Node) =>
                    resolveTypeNode(ctx, p),
                ),
            );
            if (!paramsResult.ok) {
                return err(paramsResult.error);
            }
            let returnType = makeUnitType(typeNode.span);
            if (typeNode.returnType) {
                const returnResult = resolveTypeNode(ctx, typeNode.returnType);
                if (!returnResult.ok) return returnResult;
                returnType = returnResult.value;
            }
            return ok(
                makeFnType(
                    paramsResult.value,
                    returnType,
                    typeNode.isUnsafe || false,
                    typeNode.isConst || false,
                    typeNode.span,
                ),
            );
        }

        default:
            return err([
                {
                    message: `Unknown type node kind: ${typeNode.kind}`,
                    span: typeNode.span,
                },
            ]);
    }
}

/** Resolve a builtin type name to a Type, or null if not a builtin */
function resolveBuiltinType(name: string, span: Span): Type | null {
    switch (name) {
        case "i8":
            return makeIntType(IntWidth.I8, span);
        case "i16":
            return makeIntType(IntWidth.I16, span);
        case "i32":
            return makeIntType(IntWidth.I32, span);
        case "i64":
            return makeIntType(IntWidth.I64, span);
        case "i128":
            return makeIntType(IntWidth.I128, span);
        case "isize":
            return makeIntType(IntWidth.Isize, span);
        case "u8":
            return makeIntType(IntWidth.U8, span);
        case "u16":
            return makeIntType(IntWidth.U16, span);
        case "u32":
            return makeIntType(IntWidth.U32, span);
        case "u64":
            return makeIntType(IntWidth.U64, span);
        case "u128":
            return makeIntType(IntWidth.U128, span);
        case "usize":
            return makeIntType(IntWidth.Usize, span);
        case "f32":
            return makeFloatType(FloatWidth.F32, span);
        case "f64":
            return makeFloatType(FloatWidth.F64, span);
        case "bool":
            return makeBoolType(span);
        case "char":
            return makeCharType(span);
        case "str":
            return makeStringType(span);
        case "()":
            return makeUnitType(span);
        case "!":
            return makeNeverType(span);
        default:
            return null;
    }
}

/** Check whether a type is copyable in the current type context. */
function isCopyableInContext(
    ctx: TypeContext,
    ty: Type,
    _visiting: Set<string> = new Set(), // FIXME: unused parameter
): boolean {
    return isCopyableType(ty, {
        resolveType: (t) => ctx.resolveType(t),
        hasNamedTypeCopy: (name) => {
            if (ctx.traitImpls && ctx.traitImpls.has(`Copy::${name}`)) {
                return true;
            }
            return false;
        },
    });
}

// ============================================================================
// Module Item Checking
// ============================================================================

/** Check all items in a module */
function checkModuleItems(
    ctx: TypeContext,
    module: Node,
): Result<void, TypeError[]> {
    const errors: TypeError[] = [];

    for (const item of module.items) {
        const result = checkItem(ctx, item);
        if (!result.ok) {
            errors.push(result.error);
        }
    }
    if (errors.length > 0) {
        return err(errors);
    }
    return ok(undefined);
}

/** Check a single item */
function checkItem(ctx: TypeContext, item: Node): Result<void, TypeError> {
    switch (item.kind) {
        case NodeKind.FnItem:
            return checkFnItem(ctx, item);

        case NodeKind.ImplItem: {
            const targetResult = resolveImplTargetType(ctx, item.targetType);
            if (!targetResult.ok) {
                return err(targetResult.error);
            }
            const targetType = targetResult.value;
            const targetName =
                typeKeyForMethodLookup(targetType) || "__unresolved_target";
            const traitName = item.traitType?.name || null;
            ctx.pushImplSelfType(targetType);
            const result = checkModuleItems(ctx, {
                kind: NodeKind.Module,
                span: item.span,
                items: item.methods.map((method: Node) => ({
                    ...method,
                    kind: NodeKind.FnItem,
                    name: traitName
                        ? `${targetName}::<${traitName}>::${method.name}`
                        : `${targetName}::${method.name}`,
                    implTargetName: targetName,
                })),
            });
            ctx.popImplSelfType();
            if (result.ok) return ok(undefined);
            return err(result.error[0]);
        }

        case NodeKind.TraitItem:
            return ok(undefined);

        case NodeKind.ModItem:
            if (item.isInline && item.items) {
                ctx.pushScope();
                const result = checkModuleItems(ctx, item);
                ctx.popScope();
                if (result.ok) return ok(undefined);
                return err(result.error[0]);
            }
            return ok(undefined);

        default:
            return ok(undefined);
    }
}

// ============================================================================
// Task 4.6: Function Body Checking
// ============================================================================

/** Check a function item */
function checkFnItem(ctx: TypeContext, fnItem: Node): Result<void, TypeError> {
    const itemDecl = ctx.lookupItem(fnItem.qualifiedName || fnItem.name);
    if (!itemDecl || !itemDecl.type) {
        return err({
            message: `Function ${fnItem.name} not found in context`,
            span: fnItem.span,
        });
    }

    const fnType = itemDecl.type;
    let pushedSelf = false;
    if (fnItem.implTargetName && !ctx.currentImplSelfType()) {
        const builtinSelf = resolveBuiltinType(
            fnItem.implTargetName,
            fnItem.span,
        );
        ctx.pushImplSelfType(
            builtinSelf ||
                makeStructType(fnItem.implTargetName, [], fnItem.span),
        );
        pushedSelf = true;
    }
    ctx.pushScope();

    // Set current function context
    ctx.setCurrentFn(fnType, (fnType as FnType).returnType);

    // Bind parameters
    for (let i = 0; i < fnItem.params.length; i++) {
        const param = fnItem.params[i];
        const paramType = (fnType as FnType).params[i];
        if (param.name) {
            const defineResult = ctx.defineVar(
                param.name,
                paramType,
                false,
                param.span,
            );
            if (!defineResult.ok) {
                ctx.popScope();
                ctx.clearCurrentFn();
                return err({
                    message: defineResult.error || "Failed to define parameter",
                    span: param.span,
                });
            }
        }
    }

    // Check function body

    const errors: TypeError[] = [];
    if (fnItem.body) {
        const bodyResult = inferExpr(ctx, fnItem.body);
        if (!bodyResult.ok) {
            errors.push(bodyResult.error);
        } else {
            // Unify body type with return type
            const unifyResult = unify(
                ctx,
                bodyResult.value,
                (fnType as FnType).returnType,
            );
            if (!unifyResult.ok) {
                errors.push(unifyResult.error);
            }
        }
    }

    ctx.popScope();
    ctx.clearCurrentFn();
    if (pushedSelf) {
        ctx.popImplSelfType();
    }

    if (errors.length > 0) {
        return err(errors[0]);
    }
    return ok(undefined);
}

function toSingleResult(
    result: Result<Type, TypeError[]>,
): Result<Type, TypeError> {
    if (!result.ok) return err(result.error[0]);
    return ok(result.value);
}
/** Infer the type of an expression */
function inferExpr(
    ctx: TypeContext,
    expr: Node,
    expectedType?: Type,
): Result<Type, TypeError> {
    switch (expr.kind) {
        case NodeKind.LiteralExpr:
            return inferLiteral(ctx, expr, expectedType);
        case NodeKind.IdentifierExpr:
            return inferIdentifier(ctx, expr);
        case NodeKind.BinaryExpr:
            return inferBinary(ctx, expr);
        case NodeKind.UnaryExpr:
            return inferUnary(ctx, expr);
        case NodeKind.CallExpr:
            return inferCall(ctx, expr);
        case NodeKind.FieldExpr:
            return inferField(ctx, expr);
        case NodeKind.IndexExpr:
            return inferIndex(ctx, expr);
        case NodeKind.AssignExpr:
            return inferAssign(ctx, expr);
        case NodeKind.IfExpr:
            return inferIf(ctx, expr);
        case NodeKind.MatchExpr:
            return toSingleResult(inferMatch(ctx, expr));
        case NodeKind.BlockExpr:
            return toSingleResult(inferBlock(ctx, expr));
        case NodeKind.ReturnExpr:
            return inferReturn(ctx, expr);
        case NodeKind.BreakExpr:
            return inferBreak(ctx, expr);
        case NodeKind.ContinueExpr:
            return inferContinue(ctx, expr);
        case NodeKind.LoopExpr:
            return inferLoop(ctx, expr);
        case NodeKind.WhileExpr:
            return inferWhile(ctx, expr);
        case NodeKind.ForExpr:
            return inferFor(ctx, expr);
        case NodeKind.PathExpr:
            return inferPath(ctx, expr);
        case NodeKind.StructExpr:
            return toSingleResult(inferStructExpr(ctx, expr));
        case NodeKind.RangeExpr:
            return toSingleResult(inferRange(ctx, expr));
        case NodeKind.RefExpr:
            return inferRef(ctx, expr);
        case NodeKind.DerefExpr:
            return inferDeref(ctx, expr);
        case NodeKind.MacroExpr:
            return toSingleResult(inferMacro(ctx, expr));
        case NodeKind.ClosureExpr:
            return inferClosure(ctx, expr, expectedType);
        default:
            return err({
                message: `Unknown expression kind: ${expr.kind}`,
                span: expr.span,
            });
    }
}

/** Infer literal type */
function inferLiteral(
    ctx: TypeContext,
    literal: Node,
    expectedType?: Type,
): Result<Type, TypeError> {
    switch (literal.literalKind) {
        case LiteralKind.Int: {
            if (expectedType) {
                const resolved = ctx.resolveType(expectedType);
                if (resolved.kind === TypeKind.Int) {
                    return ok(makeIntType(resolved.width, literal.span));
                }
            }
            return ok(makeIntType(IntWidth.I32, literal.span));
        }
        case LiteralKind.Float: {
            if (expectedType) {
                const resolved = ctx.resolveType(expectedType);
                if (resolved.kind === TypeKind.Float) {
                    return ok(makeFloatType(resolved.width, literal.span));
                }
            }
            return ok(makeFloatType(FloatWidth.F64, literal.span));
        }
        case LiteralKind.Bool:
            return ok(makeBoolType(literal.span));
        case LiteralKind.String:
            return ok(makeStringType(literal.span));
        case LiteralKind.Char:
            return ok(makeCharType(literal.span));
        default:
            return err({
                message: `Unknown literal kind: ${literal.literalKind}`,
                span: literal.span,
            });
    }
}

/** Infer identifier type */
function inferIdentifier(
    ctx: TypeContext,
    ident: Node,
): Result<Type, TypeError> {
    if (ident.name === "Self") {
        const selfType = ctx.currentImplSelfType();
        if (selfType) {
            return ok(selfType);
        }
    }
    // Look up variable binding
    const bindingLookup = ctx.lookupVarWithDepth(ident.name);
    if (bindingLookup) {
        const binding = bindingLookup.binding;
        const bindingDepth = bindingLookup.depth;
        for (const tracker of ctx.getClosureCaptureTrackers()) {
            if (bindingDepth < tracker.closureDepth) {
                tracker.captures.set(ident.name, binding);
            }
        }
        if (
            binding.closureInfo &&
            binding.closureInfo.captures &&
            binding.closureInfo.captures.length > 0 &&
            !ctx.canUseCapturingClosureValue()
        ) {
            return err({
                message:
                    "Capturing closures cannot escape; only direct calls are supported",
                span: ident.span,
            });
        }
        ident.isImplicitCopyCandidate = isCopyableInContext(ctx, binding.type);
        ident.closureInfo = binding.closureInfo ?? null;
        return ok(binding.type);
    }

    // Look up item (function, struct, enum)
    const lookupName = ident.resolvedItemName ?? ident.name;
    const item = ctx.lookupItem(lookupName);
    if (item) {
        if (item.kind === "fn" && item.type) {
            ident.isImplicitCopyCandidate = true;
            return ok(item.type);
        }
        if (item.kind === "struct") {
            const ty = makeStructType(item.name, [], ident.span);
            ident.isImplicitCopyCandidate = isCopyableInContext(ctx, ty);
            return ok(ty);
        }
        if (item.kind === "enum") {
            const ty = makeEnumType(item.name, [], ident.span);
            ident.isImplicitCopyCandidate = isCopyableInContext(ctx, ty);
            return ok(ty);
        }
    }
    // Prelude-style Option variants (`Some`, `None`) when unbound.
    if (ident.name === "Some" || ident.name === "None") {
        const optionItem = ctx.lookupItem("Option");
        if (optionItem && optionItem.kind === "enum") {
            return inferPath(ctx, {
                kind: NodeKind.PathExpr,
                segments: ["Option", ident.name],
                span: ident.span,
                resolvedItemName: null,
            });
        }
    }

    return err({
        message: `Unbound identifier: ${ident.name}`,
        span: ident.span,
    });
}

/** Infer binary expression type */
function inferBinary(ctx: TypeContext, binary: Node): Result<Type, TypeError> {
    const leftResult = inferExpr(ctx, binary.left);
    if (!leftResult.ok) return leftResult;
    const rightResult = inferExpr(ctx, binary.right);
    if (!rightResult.ok) return rightResult;
    const leftType = ctx.resolveType(leftResult.value);
    const rightType = ctx.resolveType(rightResult.value);
    let leftValueType = leftType;
    let rightValueType = rightType;
    while (
        leftValueType &&
        (leftValueType.kind === TypeKind.Ref ||
            leftValueType.kind === TypeKind.Ptr)
    ) {
        leftValueType = ctx.resolveType(leftValueType.inner);
    }
    while (
        rightValueType &&
        (rightValueType.kind === TypeKind.Ref ||
            rightValueType.kind === TypeKind.Ptr)
    ) {
        rightValueType = ctx.resolveType(rightValueType.inner);
    }
    switch (binary.op) {
        // Arithmetic operators
        case BinaryOp.Add:
        case BinaryOp.Sub:
        case BinaryOp.Mul:
        case BinaryOp.Div:
        case BinaryOp.Rem: {
            // Both operands must be numeric
            if (
                !isNumericType(leftValueType) &&
                leftValueType.kind !== TypeKind.TypeVar
            ) {
                return err({
                    message: `Expected numeric type, got ${typeToString(leftType)}`,
                    span: binary.left.span,
                });
            }
            if (
                !isNumericType(rightValueType) &&
                rightValueType.kind !== TypeKind.TypeVar
            ) {
                return err({
                    message: `Expected numeric type, got ${typeToString(rightType)}`,
                    span: binary.right.span,
                });
            }

            // Unify operand types
            const unifyResult = unify(ctx, leftValueType, rightValueType);
            if (!unifyResult.ok) {
                return err(unifyResult.error);
            }
            return ok(ctx.resolveType(leftValueType));
        }
        // Comparison operators
        case BinaryOp.Eq:
        case BinaryOp.Ne:
        case BinaryOp.Lt:
        case BinaryOp.Le:
        case BinaryOp.Gt:
        case BinaryOp.Ge: {
            // Unify operand types
            const unifyResult = unify(ctx, leftValueType, rightValueType);
            if (!unifyResult.ok) {
                return err(unifyResult.error);
            }
            return ok(makeBoolType(binary.span));
        }

        // Logical operators
        case BinaryOp.And:
        case BinaryOp.Or: {
            // Both operands must be bool
            const boolType = makeBoolType(rightType.span); // FIXME: Is this correct???
            const leftUnify = unify(ctx, leftType, boolType);
            if (!leftUnify.ok) {
                return err(leftUnify.error);
            }
            const rightUnify = unify(ctx, rightType, boolType);
            if (!rightUnify.ok) {
                return err(rightUnify.error);
            }
            return ok(makeBoolType(binary.span));
        }
        // Bitwise operators
        case BinaryOp.BitXor:
        case BinaryOp.BitAnd:
        case BinaryOp.BitOr:
        case BinaryOp.Shl:
        case BinaryOp.Shr: {
            // Both operands must be integers
            if (
                !isIntegerType(leftValueType) &&
                leftValueType.kind !== TypeKind.TypeVar
            ) {
                return err({
                    message: `Expected integer type, got ${typeToString(leftType)}`,
                    span: binary.left.span,
                });
            }
            if (
                !isIntegerType(rightValueType) &&
                rightValueType.kind !== TypeKind.TypeVar
            ) {
                return err({
                    message: `Expected integer type, got ${typeToString(rightType)}`,
                    span: binary.right.span,
                });
            }

            const unifyResult = unify(ctx, leftValueType, rightValueType);
            if (!unifyResult.ok) {
                return err(unifyResult.error);
            }

            return ok(ctx.resolveType(leftValueType));
        }

        default:
            return err({
                message: `Unknown binary operator: ${binary.op}`,
                span: binary.span,
            });
    }
}

/** Infer unary expression type */
function inferUnary(ctx: TypeContext, unary: Node): Result<Type, TypeError> {
    const operandResult = inferExpr(ctx, unary.operand);
    if (!operandResult.ok) return operandResult;

    const operandType = ctx.resolveType(operandResult.value);

    switch (unary.op) {
        case UnaryOp.Not: {
            const boolType = makeBoolType(unary.span);
            const unifyResult = unify(ctx, operandType, boolType);
            if (!unifyResult.ok) {
                return err(unifyResult.error);
            }
            return ok(makeBoolType(unary.span));
        }

        case UnaryOp.Neg: {
            if (
                !isNumericType(operandType) &&
                operandType.kind !== TypeKind.TypeVar
            ) {
                return err({
                    message: `Expected numeric type, got ${typeToString(operandType)}`,
                    span: unary.operand.span,
                });
            }
            return ok(operandType);
        }

        case UnaryOp.Deref: {
            if (
                operandType.kind !== TypeKind.Ref &&
                operandType.kind !== TypeKind.Ptr &&
                operandType.kind !== TypeKind.TypeVar
            ) {
                return err({
                    message: `Cannot dereference non-reference type: ${typeToString(operandType)}`,
                    span: unary.operand.span,
                });
            }
            if (operandType.kind === TypeKind.Ref) {
                return ok(operandType.inner);
            }
            if (operandType.kind === TypeKind.Ptr) {
                return ok(operandType.inner);
            }
            // Type variable - create a fresh type for inner
            const innerType = ctx.freshTypeVar(unary.span);
            const refType = makeRefType(innerType, false, unary.span);
            const unifyResult = unify(ctx, operandType, refType);
            if (!unifyResult.ok) {
                return err(unifyResult.error);
            }
            return ok(innerType);
        }

        case UnaryOp.Ref: {
            const innerResult = inferExpr(ctx, unary.operand);
            if (!innerResult.ok) return innerResult;
            const mutable = unary.mutability === Mutability.Mutable;
            return ok(makeRefType(innerResult.value, mutable, unary.span));
        }

        default:
            return err({
                message: `Unknown unary operator: ${unary.op}`,
                span: unary.span,
            });
    }
}

/** Infer function call type */
function inferCall(ctx: TypeContext, call: Node): Result<Type, TypeError> {
    ctx.enterAllowCapturingClosureValue();
    const calleeResult =
        call.callee?.kind === NodeKind.FieldExpr
            ? inferField(ctx, call.callee, true)
            : inferExpr(ctx, call.callee);
    ctx.exitAllowCapturingClosureValue();
    if (!calleeResult.ok) return calleeResult;

    const calleeType = ctx.resolveType(calleeResult.value);
    const genericCalleeItem = lookupDirectFunctionItemForCall(ctx, call.callee);
    const genericNames = genericCalleeItem?.node?.generics || [];
    if (genericCalleeItem && genericNames.length > 0) {
        return inferGenericFunctionCall(ctx, call, genericCalleeItem);
    }
    if (call.typeArgs !== null) {
        return err({
            message:
                "Explicit generic call arguments are only supported on generic function items",
            span: call.span,
        });
    }

    // Check if callee is a function type
    if (
        calleeType.kind !== TypeKind.Fn &&
        calleeType.kind !== TypeKind.TypeVar
    ) {
        return err({
            message: `Cannot call non-function type: ${typeToString(calleeType)}`,
            span: call.callee.span,
        });
    }

    // Handle type variable callee
    if (calleeType.kind === TypeKind.TypeVar) {
        const returnType = ctx.freshTypeVar(call.span);
        const paramTypes = call.args.map(() => ctx.freshTypeVar(call.span));
        const expectedFnType = makeFnType(
            paramTypes,
            returnType,
            false,
            false,
            call.span,
        );
        const unifyResult = unify(ctx, calleeType, expectedFnType);
        if (!unifyResult.ok) {
            return err(unifyResult.error);
        }

        // Infer arguments
        for (let i = 0; i < call.args.length; i++) {
            const argResult = inferExpr(ctx, call.args[i], paramTypes[i]);
            if (!argResult.ok) return argResult;
            const argUnify = unify(ctx, argResult.value, paramTypes[i]);
            if (!argUnify.ok) {
                return err(argUnify.error);
            }
        }
        return ok(returnType);
    }
    // Check argument count
    if (call.args.length !== calleeType.params.length) {
        return err({
            message: `Function expects ${calleeType.params.length} arguments, got ${call.args.length}`,
            span: call.span,
        });
    }
    // Infer and check arguments
    for (let i = 0; i < call.args.length; i++) {
        const argResult = inferExpr(ctx, call.args[i], calleeType.params[i]);
        if (!argResult.ok) return argResult;
        const unifyResult = unify(ctx, argResult.value, calleeType.params[i]);
        if (!unifyResult.ok) {
            return err({
                message: `Argument type mismatch: expected ${typeToString(calleeType.params[i])}, got ${typeToString(argResult.value)}`,
                span: call.args[i]?.span || call.span,
            });
        }
    }

    return ok(calleeType.returnType);
}

/** Infer closure expression type. */
function inferClosure(
    ctx: TypeContext,
    closure: Node,
    expectedType?: Type,
): Result<Type, TypeError> {
    if (closure.isMove) {
        return err({
            message: "move closures are not supported yet",
            span: closure.span,
        });
    }
    const expectedResolved = expectedType
        ? ctx.resolveType(expectedType)
        : null;
    const expectedFn =
        expectedResolved && expectedResolved.kind === TypeKind.Fn
            ? expectedResolved
            : null;

    const params = closure.params || [];
    if (expectedFn && expectedFn.params.length !== params.length) {
        return err({
            message: `Closure expects ${expectedFn.params.length} parameters, got ${params.length}`,
            span: closure.span,
        });
    }
    const errors: TypeError[] = [];

    const paramTypes: Type[] = [];

    let returnType = makeUnitType(closure.span);

    ctx.pushScope();
    ctx.pushClosureCaptureTracker(ctx.currentScopeDepth());
    try {
        for (let i = 0; i < params.length; i++) {
            const param = params[i];

            let paramType;
            if (param.ty) {
                const paramTypeResult = resolveTypeNode(ctx, param.ty);
                if (!paramTypeResult.ok) {
                    errors.push(...paramTypeResult.error);
                    paramType = ctx.freshTypeVar(param.span);
                } else {
                    paramType = paramTypeResult.value;
                }
            } else if (expectedFn) {
                paramType = expectedFn.params[i];
            } else {
                paramType = ctx.freshTypeVar(param.span);
            }
            paramTypes.push(paramType);

            if (param.name && param.name !== "_") {
                const defineResult = ctx.defineVar(
                    param.name,
                    paramType,
                    false,
                    param.span,
                );
                if (!defineResult.ok) {
                    errors.push({
                        message:
                            defineResult.error ??
                            "Failed to define closure parameter",
                        span: param.span,
                    });
                }
            }
        }

        let explicitReturnType = undefined;
        if (closure.returnType) {
            const returnTypeResult = resolveTypeNode(ctx, closure.returnType);
            if (!returnTypeResult.ok) {
                errors.push(...returnTypeResult.error);
            } else {
                explicitReturnType = returnTypeResult.value;
            }
        }

        const bodyExpectedType =
            explicitReturnType ||
            (expectedFn ? expectedFn.returnType : undefined);
        const bodyResult = inferExpr(ctx, closure.body, bodyExpectedType);
        if (!bodyResult.ok) {
            errors.push(bodyResult.error);
        } else {
            returnType = bodyResult.value;
        }
        if (explicitReturnType) {
            const returnUnify = unify(ctx, returnType, explicitReturnType);
            if (!returnUnify.ok) {
                errors.push(returnUnify.error);
            } else {
                returnType = explicitReturnType;
            }
        } else if (expectedFn) {
            const returnUnify = unify(ctx, returnType, expectedFn.returnType);
            if (!returnUnify.ok) {
                errors.push(returnUnify.error);
            } else {
                returnType = expectedFn.returnType;
            }
        }
    } finally {
        const captureMap = ctx.popClosureCaptureTracker() || new Map();
        ctx.popScope();

        /** @type {{ name: string, type: Type, mutable: boolean, byRef: boolean }[]} */
        const captures: {
            name: string;
            type: Type;
            mutable: boolean;
            byRef: boolean;
        }[] = [];
        for (const capture of captureMap.values()) {
            const captureType = ctx.resolveType(capture.type);
            const byRef = capture.mutable === true;
            if (!byRef && !isCopyableInContext(ctx, captureType)) {
                errors.push({
                    message: `Immutable closure capture requires Copy type: ${capture.name}`,
                    span: closure.span,
                });
                continue;
            }
            captures.push({
                name: capture.name,
                type: captureType,
                mutable: capture.mutable === true,
                byRef,
            });
        }
        closure.captureInfos = captures;
        closure.isCapturing = captures.length > 0;
    }

    const fnType = makeFnType(
        paramTypes.map((t) => ctx.resolveType(t)),
        ctx.resolveType(returnType),
        false,
        false, // closures aren't currently parsed with `const`
        closure.span,
    );
    closure.inferredType = fnType;

    if (errors.length > 0) {
        return err(errors[0]);
    }
    return ok(fnType);
}

/** Infer field access type */
function inferField(
    ctx: TypeContext,
    field: Node,
    preferMethod: boolean = false,
): Result<Type, TypeError> {
    const receiverResult = inferExpr(ctx, field.receiver);
    if (!receiverResult.ok) return receiverResult;

    const receiverType = ctx.resolveType(receiverResult.value);
    let accessType = receiverType;
    while (
        accessType &&
        (accessType.kind === TypeKind.Ref || accessType.kind === TypeKind.Ptr)
    ) {
        accessType = ctx.resolveType(accessType.inner);
    }
    const fieldName =
        typeof field.field === "string" ? field.field : field.field.name;

    function asBoundMethod(
        fnType: FnType,
        symbolName: string,
        meta: MethodImplMeta = {},
    ): Result<Type, TypeError> {
        const instantiated = instantiateMethodTypeForReceiver(
            ctx,
            fnType,
            accessType,
            meta,
        );
        const boundType = makeFnType(
            instantiated.params.slice(1),
            instantiated.returnType,
            instantiated.isUnsafe || false,
            instantiated.isConst || false,
            field.span,
        );
        field.resolvedMethodSymbolName = symbolName;
        return ok(boundType);
    }

    // Handle struct field access
    if (accessType.kind === TypeKind.Struct) {
        const structType = accessType;
        if (preferMethod) {
            const candidates = ctx.lookupMethodCandidates(
                structType.name,
                fieldName,
            );
            if (
                candidates.inherent &&
                candidates.inherent.type?.kind === TypeKind.Fn
            ) {
                return asBoundMethod(
                    candidates.inherent.type,
                    candidates.inherent.symbolName,
                    candidates.inherent.meta,
                );
            }
            if (
                candidates.traits.length === 1 &&
                candidates.traits[0].type?.kind === TypeKind.Fn
            ) {
                return asBoundMethod(
                    candidates.traits[0].type,
                    candidates.traits[0].symbolName,
                    candidates.traits[0].meta,
                );
            }
        }
        const fieldDef = structType.fields.find((f) => f.name === fieldName);
        if (fieldDef) {
            return ok(fieldDef.type);
        }

        // Some lowering paths keep struct names but omit field metadata.
        // Fall back to the declared item definition in type context.
        const item = ctx.lookupItem(structType.name);
        if (item && item.kind === "struct") {
            const structField = item.node.fields?.find(
                (f: Node) => f.name === fieldName,
            );
            if (structField) {
                if (structField.ty) {
                    const resolvedTypeNode = resolveTypeNode(
                        ctx,
                        structField.ty,
                    );
                    if (!resolvedTypeNode.ok) {
                        return err(resolvedTypeNode.error[0]);
                    }
                    return ok(resolvedTypeNode.value);
                }
                return ok(ctx.freshTypeVar(field.span));
            }
            const candidates = ctx.lookupMethodCandidates(
                structType.name,
                fieldName,
            );
            if (
                candidates.inherent &&
                candidates.inherent.type?.kind === TypeKind.Fn
            ) {
                return asBoundMethod(
                    candidates.inherent.type,
                    candidates.inherent.symbolName,
                    candidates.inherent.meta,
                );
            }
            if (
                candidates.traits.length === 1 &&
                candidates.traits[0].type?.kind === TypeKind.Fn
            ) {
                return asBoundMethod(
                    candidates.traits[0].type,
                    candidates.traits[0].symbolName,
                    candidates.traits[0].meta,
                );
            }
            if (candidates.traits.length > 1) {
                const traitNames = candidates.traits
                    .map((c) => c.traitName)
                    .join(", ");
                return err({
                    message: `Ambiguous trait method '${fieldName}' for ${structType.name}; candidates: ${traitNames}`,
                    span: field.span,
                });
            }
        }
        return err({
            message: `Field '${fieldName}' not found in struct ${structType.name}`,
            span: field.span,
        });
    }

    // Handle named type (unresolved struct)
    if (accessType.kind === TypeKind.Named) {
        const namedType = accessType;
        const item = ctx.lookupItem(namedType.name);
        if (item && item.kind === "struct") {
            if (preferMethod) {
                const candidates = ctx.lookupMethodCandidates(
                    namedType.name,
                    fieldName,
                );
                if (
                    candidates.inherent &&
                    candidates.inherent.type?.kind === TypeKind.Fn
                ) {
                    return asBoundMethod(
                        candidates.inherent.type,
                        candidates.inherent.symbolName,
                        candidates.inherent.meta,
                    );
                }
                if (
                    candidates.traits.length === 1 &&
                    candidates.traits[0].type?.kind === TypeKind.Fn
                ) {
                    return asBoundMethod(
                        candidates.traits[0].type,
                        candidates.traits[0].symbolName,
                        candidates.traits[0].meta,
                    );
                }
            }
            const structField = item.node.fields?.find(
                (f: Node) => f.name === fieldName,
            );
            if (!structField) {
                const candidates = ctx.lookupMethodCandidates(
                    namedType.name,
                    fieldName,
                );
                if (
                    candidates.inherent &&
                    candidates.inherent.type?.kind === TypeKind.Fn
                ) {
                    return asBoundMethod(
                        candidates.inherent.type,
                        candidates.inherent.symbolName,
                        candidates.inherent.meta,
                    );
                }
                if (
                    candidates.traits.length === 1 &&
                    candidates.traits[0].type?.kind === TypeKind.Fn
                ) {
                    return asBoundMethod(
                        candidates.traits[0].type,
                        candidates.traits[0].symbolName,
                        candidates.traits[0].meta,
                    );
                }
                if (candidates.traits.length > 1) {
                    const traitNames = candidates.traits
                        .map((c) => c.traitName)
                        .join(", ");
                    return err({
                        message: `Ambiguous trait method '${fieldName}' for ${namedType.name}; candidates: ${traitNames}`,
                        span: field.span,
                    });
                }
                return err({
                    message: `Field '${fieldName}' not found in struct ${namedType.name}`,
                    span: field.span,
                });
            }
            if (structField.ty) {
                const resolvedTypeNode = resolveTypeNode(ctx, structField.ty);
                if (!resolvedTypeNode.ok) {
                    return err(resolvedTypeNode.error[0]);
                }
                return ok(resolvedTypeNode.value);
            }
            return ok(ctx.freshTypeVar(field.span));
        }
    }

    const typeKey = typeKeyForMethodLookup(accessType);
    if (typeKey) {
        const candidates = ctx.lookupMethodCandidates(typeKey, fieldName);
        if (
            candidates.inherent &&
            candidates.inherent.type?.kind === TypeKind.Fn
        ) {
            return asBoundMethod(
                candidates.inherent.type,
                candidates.inherent.symbolName,
                candidates.inherent.meta,
            );
        }
        if (
            candidates.traits.length === 1 &&
            candidates.traits[0].type?.kind === TypeKind.Fn
        ) {
            return asBoundMethod(
                candidates.traits[0].type,
                candidates.traits[0].symbolName,
                candidates.traits[0].meta,
            );
        }
        if (candidates.traits.length > 1) {
            const traitNames = candidates.traits
                .map((c) => c.traitName)
                .join(", ");
            return err({
                message: `Ambiguous trait method '${fieldName}' for ${typeKey}; candidates: ${traitNames}`,
                span: field.span,
            });
        }
    }

    // Handle tuple field access (numeric index)
    if (accessType.kind === TypeKind.Tuple) {
        const tupleType = accessType;
        const index =
            typeof field.field === "number"
                ? field.field
                : parseInt(field.field.name, 10);
        if (isNaN(index) || index < 0 || index >= tupleType.elements.length) {
            return err({
                message: `Tuple index out of bounds: ${field.field}`,
                span: field.span,
            });
        }
        return ok(tupleType.elements[index]);
    }

    // Type variable - might be a struct
    if (accessType.kind === TypeKind.TypeVar) {
        const fieldType = ctx.freshTypeVar(accessType.span);
        // We'll need to constrain this later when we know more about the receiver
        return ok(fieldType);
    }

    return err({
        message: `Cannot access field on type: ${typeToString(receiverType)}`,
        span: field.span,
    });
}

/** Infer index expression type */
function inferIndex(ctx: TypeContext, index: Node): Result<Type, TypeError> {
    const receiverResult = inferExpr(ctx, index.receiver);
    if (!receiverResult.ok) return receiverResult;

    const indexResult = inferExpr(ctx, index.index);
    if (!indexResult.ok) return indexResult;

    const receiverType = ctx.resolveType(receiverResult.value);
    const indexType = ctx.resolveType(indexResult.value);

    // Index must be integer
    const intType = makeIntType(IntWidth.I32, index.span);
    const indexUnify = unify(ctx, indexType, intType);
    if (!indexUnify.ok) {
        return err({
            message: `Index must be integer`,
            span: index.span,
        });
    }

    // Array indexing
    if (receiverType.kind === TypeKind.Array) {
        return ok(receiverType.element);
    }

    // Slice indexing
    if (receiverType.kind === TypeKind.Slice) {
        return ok(receiverType.element);
    }

    // Raw pointer indexing
    if (receiverType.kind === TypeKind.Ptr) {
        return ok(receiverType.inner);
    }

    // Vec<T> indexing delegates to stdlib method semantics (`Vec::index`).
    const vecElementType = vecElementTypeForType(receiverType);
    if (vecElementType) {
        return ok(vecElementType);
    }

    // Type variable
    if (receiverType.kind === TypeKind.TypeVar) {
        const elementType = ctx.freshTypeVar(receiverType.span);
        const sliceType = makeSliceType(elementType, index.span);
        const unifyResult = unify(ctx, receiverType, sliceType);
        if (!unifyResult.ok) {
            return err({
                message: `Cannot index type: ${typeToString(receiverType)}`,
                span: index.span,
            });
        }
        return ok(elementType);
    }

    return err({
        message: `Cannot index type: ${typeToString(receiverType)}`,
        span: index.span,
    });
}

/** Infer assignment expression type */
function inferAssign(ctx: TypeContext, assign: Node): Result<Type, TypeError> {
    const targetResult = inferExpr(ctx, assign.target);
    if (!targetResult.ok) return targetResult;

    const valueResult = inferExpr(ctx, assign.value);
    if (!valueResult.ok) return valueResult;

    const targetType = ctx.resolveType(targetResult.value);
    const valueType = ctx.resolveType(valueResult.value);

    let assignTargetType = targetType;
    if (targetType.kind === TypeKind.Ref && targetType.mutable === true) {
        assignTargetType = targetType.inner;
    }

    const unifyResult = unify(ctx, assignTargetType, valueType);
    if (!unifyResult.ok) {
        return err(unifyResult.error);
    }

    return ok(makeUnitType(assign.span));
}

// ============================================================================
// Task 4.4: Control Flow Inference
// ============================================================================

/** Infer if expression type */
function inferIf(ctx: TypeContext, ifExpr: Node): Result<Type, TypeError> {
    const condResult = inferExpr(ctx, ifExpr.condition);
    if (!condResult.ok) return condResult;

    // Condition must be bool
    const boolType = makeBoolType(ifExpr.span);
    const condUnify = unify(ctx, condResult.value, boolType);
    if (!condUnify.ok) {
        return err(condUnify.error);
    }

    const thenResult = inferExpr(ctx, ifExpr.thenBranch);
    if (!thenResult.ok) return thenResult;

    if (ifExpr.elseBranch) {
        const elseResult = inferExpr(ctx, ifExpr.elseBranch);
        if (!elseResult.ok) return elseResult;

        // Both branches must unify
        const unifyResult = unify(ctx, thenResult.value, elseResult.value);
        if (!unifyResult.ok) {
            return err(unifyResult.error);
        }

        return ok(ctx.resolveType(thenResult.value));
    }

    // Without else branch, type is unit
    const unitUnify = unify(ctx, thenResult.value, makeUnitType(ifExpr.span));
    if (!unitUnify.ok) {
        return err(unitUnify.error);
    }

    return ok(makeUnitType(ifExpr.span));
}

/** Infer match expression type */
function inferMatch(
    ctx: TypeContext,
    matchExpr: Node,
): Result<Type, TypeError[]> {
    const scrutineeResult = inferExpr(ctx, matchExpr.scrutinee);
    if (!scrutineeResult.ok) return err([scrutineeResult.error]);

    const scrutineeType = ctx.resolveType(scrutineeResult.value);

    if (!matchExpr.arms || matchExpr.arms.length === 0) {
        return ok(makeUnitType(matchExpr.span));
    }

    let resultType = null;

    const errors = [];

    for (const arm of matchExpr.arms) {
        ctx.pushScope();

        // Check pattern
        const patResult = checkPattern(ctx, arm.pat, scrutineeType);
        if (!patResult.ok) {
            errors.push(...patResult.error);
        }

        // Check guard
        if (arm.guard) {
            const guardResult = inferExpr(ctx, arm.guard);
            if (!guardResult.ok) {
                errors.push(guardResult.error);
            } else {
                const guardUnify = unify(
                    ctx,
                    guardResult.value,
                    makeBoolType(arm.guard.span),
                );
                if (!guardUnify.ok) {
                    errors.push(guardUnify.error);
                }
            }
        }

        // Infer body
        const bodyResult = inferExpr(ctx, arm.body);
        if (!bodyResult.ok) {
            errors.push(bodyResult.error);
        } else if (resultType === null) {
            resultType = bodyResult.value;
        } else {
            const unifyResult = unify(ctx, resultType, bodyResult.value);
            if (!unifyResult.ok) {
                errors.push(unifyResult.error);
            }
        }

        ctx.popScope();
    }

    if (errors.length > 0) {
        return err(errors);
    }

    return ok(resultType || makeUnitType(matchExpr.span));
}

/** Infer block expression type */
function inferBlock(ctx: TypeContext, block: Node): Result<Type, TypeError[]> {
    ctx.pushScope();

    const errors: TypeError[] = [];
    let diverges = false;

    let neverType = null;

    // Check statements
    for (const stmt of block.stmts || []) {
        const result = checkStmt(ctx, stmt);
        if (!result.ok) {
            errors.push(result.error);
        } else if (result.value && result.value.kind === TypeKind.Never) {
            diverges = true;
            neverType = result.value;
        }
    }

    // Final expression determines block type
    let resultType = makeUnitType(block.span);
    if (block.expr) {
        const exprResult = inferExpr(ctx, block.expr);
        if (!exprResult.ok) {
            errors.push(exprResult.error);
        } else {
            resultType = exprResult.value;
            if (resultType.kind === TypeKind.Never) {
                diverges = true;
                neverType = resultType;
            }
        }
    }

    ctx.popScope();

    if (errors.length > 0) {
        return err(errors);
    }

    return ok(diverges && neverType ? neverType : resultType);
}

/** Infer loop expression type */
function inferLoop(ctx: TypeContext, loopExpr: Node): Result<Type, TypeError> {
    ctx.enterLoop(true, null);
    ctx.pushScope();

    const bodyResult = inferExpr(ctx, loopExpr.body);
    if (!bodyResult.ok) {
        ctx.popScope();
        ctx.exitLoop();
        return bodyResult;
    }

    ctx.popScope();
    const loopCtx = ctx.exitLoop();
    if (!loopCtx || !loopCtx.hasBreak) {
        return ok(makeNeverType(loopExpr.span));
    }
    if (!loopCtx.breakType) {
        return ok(makeUnitType(loopExpr.span));
    }
    return ok(ctx.resolveType(loopCtx.breakType));
}

/** Infer while expression type */
function inferWhile(
    ctx: TypeContext,
    whileExpr: Node,
): Result<Type, TypeError> {
    const condResult = inferExpr(ctx, whileExpr.condition);
    if (!condResult.ok) return condResult;

    // Condition must be bool
    const boolType = makeBoolType(whileExpr.span);
    const condUnify = unify(ctx, condResult.value, boolType);
    if (!condUnify.ok) {
        return err(condUnify.error);
    }

    ctx.enterLoop(false, null);
    ctx.pushScope();
    const bodyResult = inferExpr(ctx, whileExpr.body);
    ctx.popScope();
    ctx.exitLoop();

    if (!bodyResult.ok) return bodyResult;

    // While always returns unit
    return ok(makeUnitType(whileExpr.span));
}

/** Infer for expression type */
function inferFor(ctx: TypeContext, forExpr: Node): Result<Type, TypeError> {
    const iterResult = inferExpr(ctx, forExpr.iter);
    if (!iterResult.ok) return iterResult;

    ctx.enterLoop(false, null);
    ctx.pushScope();

    // Bind pattern variable
    const patResult = inferPattern(ctx, forExpr.pat);
    if (!patResult.ok) {
        ctx.popScope();
        ctx.exitLoop();
        return err(patResult.error[0]);
    }

    // TODO: Check that iterator is iterable

    const bodyResult = inferExpr(ctx, forExpr.body);
    ctx.popScope();
    ctx.exitLoop();

    if (!bodyResult.ok) return bodyResult;

    // For always returns unit
    return ok(makeUnitType(forExpr.span));
}

/** Infer return expression type */
function inferReturn(
    ctx: TypeContext,
    returnExpr: Node,
): Result<Type, TypeError> {
    const returnType = ctx.getCurrentReturnType();
    if (!returnType) {
        return err({
            message: "Return outside of function",
            span: returnExpr.span,
        });
    }

    if (returnExpr.value) {
        const valueResult = inferExpr(ctx, returnExpr.value, returnType);
        if (!valueResult.ok) return valueResult;

        const unifyResult = unify(ctx, valueResult.value, returnType);
        if (!unifyResult.ok) {
            return err(unifyResult.error);
        }
    } else {
        // Return without value must return unit
        const unifyResult = unify(
            ctx,
            makeUnitType(returnExpr.span),
            returnType,
        );
        if (!unifyResult.ok) {
            return err(unifyResult.error);
        }
    }
    return ok(makeNeverType(returnExpr.span));
}

/** Infer break expression type */
function inferBreak(
    ctx: TypeContext,
    breakExpr: Node,
): Result<Type, TypeError> {
    const loopCtx = ctx.currentLoop();
    if (!loopCtx) {
        return err({
            message: "Break outside of loop",
            span: breakExpr.span,
        });
    }

    loopCtx.hasBreak = true;

    if (breakExpr.value) {
        if (!loopCtx.allowsBreakValue) {
            return err({
                message: "Break with value is only allowed in loop expressions",
                span: breakExpr.span,
            });
        }
        const valueResult = inferExpr(ctx, breakExpr.value);
        if (!valueResult.ok) return valueResult;

        if (!loopCtx.breakType) {
            loopCtx.breakType = valueResult.value;
        } else {
            const unifyResult = unify(
                ctx,
                valueResult.value,
                loopCtx.breakType,
            );
            if (!unifyResult.ok) {
                return err(unifyResult.error);
            }
        }
    } else if (loopCtx.allowsBreakValue && loopCtx.breakType) {
        const unifyResult = unify(
            ctx,
            makeUnitType(breakExpr.span),
            loopCtx.breakType,
        );
        if (!unifyResult.ok) {
            return err(unifyResult.error);
        }
    } else if (loopCtx.allowsBreakValue) {
        loopCtx.breakType = makeUnitType(breakExpr.span);
    }

    return ok(makeNeverType(breakExpr.span));
}

/** Infer continue expression type */
function inferContinue(
    ctx: TypeContext,
    continueExpr: Node,
): Result<Type, TypeError> {
    const loopCtx = ctx.currentLoop();
    if (!loopCtx) {
        return err({
            message: "Continue outside of loop",
            span: continueExpr.span,
        });
    }

    return ok(makeNeverType(continueExpr.span));
}

/** Infer path expression type */
function inferPath(ctx: TypeContext, pathExpr: Node): Result<Type, TypeError> {
    if (!pathExpr.segments || pathExpr.segments.length === 0) {
        return err({
            message: "Empty path expression",
            span: pathExpr.span,
        });
    }

    // Handle "()" as unit type for tuple expressions
    if (pathExpr.segments.length === 1 && pathExpr.segments[0] === "()") {
        return ok(makeUnitType(pathExpr.span));
    }

    if (pathExpr.resolvedItemName) {
        const resolvedItem = ctx.lookupItem(pathExpr.resolvedItemName);
        if (resolvedItem) {
            if (resolvedItem.kind === "fn" && resolvedItem.type) {
                return ok(resolvedItem.type);
            }
            if (resolvedItem.kind === "struct") {
                return ok(makeStructType(resolvedItem.name, [], pathExpr.span));
            }
            if (resolvedItem.kind === "enum") {
                return ok(makeEnumType(resolvedItem.name, [], pathExpr.span));
            }
        }
    }

    // Simple identifier
    if (pathExpr.segments.length === 1) {
        return inferIdentifier(ctx, {
            kind: NodeKind.IdentifierExpr,
            name: pathExpr.segments[0],
            resolvedItemName: pathExpr.resolvedItemName || null,
            span: pathExpr.span,
        });
    }

    // Qualified path - look up in items
    const itemName = pathExpr.segments[0];
    const item = ctx.lookupItem(itemName);
    if (!item) {
        return err({
            message: `Unbound item: ${itemName}`,
            span: pathExpr.span,
        });
    }

    if (item.kind === "struct" && pathExpr.segments.length === 2) {
        const methodName = pathExpr.segments[1];
        const method = ctx.lookupMethod(itemName, methodName);
        if (method) {
            pathExpr.resolvedMethodSymbolName = method.symbolName;
            return ok(method.type);
        }
    }

    // Handle enum variants: EnumName::VariantName
    if (item.kind === "enum" && pathExpr.segments.length === 2) {
        const variantName = pathExpr.segments[1];
        const enumNode = item.node;
        const enumGenericParams = (enumNode.generics || [])
            .map((name: string) => name || "")
            .filter((name: string) => name.length > 0);
        const enumGenericSet: Set<string> = new Set(enumGenericParams);
        const enumBindings = new Map<string, Type>(
            enumGenericParams.map((name: string) => [
                name,
                ctx.freshTypeVar(pathExpr.span),
            ]),
        );

        // Find the variant
        const variants = enumNode.variants || [];
        const variantIndex = variants.findIndex(
            (v: Node) => v.name === variantName,
        );
        if (variantIndex === -1) {
            return err({
                message: `Unknown variant: ${variantName}`,
                span: pathExpr.span,
            });
        }

        const variant = variants[variantIndex];
        const variantFields = variant.fields || [];
        const enumType =
            enumGenericParams.length > 0
                ? makeNamedType(
                      itemName,
                      enumGenericParams.map(
                          (name: string) =>
                              enumBindings.get(name) ||
                              ctx.freshTypeVar(pathExpr.span),
                      ),
                      pathExpr.span,
                  )
                : makeEnumType(itemName, [], pathExpr.span);

        // If the variant has fields, return a function type that constructs the enum
        if (variantFields.length > 0) {
            // Resolve field types
            const fieldTypes = [];
            for (const field of variantFields) {
                if (field.ty) {
                    const fieldTyResult = resolveTypeNode(ctx, field.ty);
                    if (fieldTyResult.ok) {
                        fieldTypes.push(
                            substituteGenericTypeBindings(
                                ctx,
                                fieldTyResult.value,
                                enumGenericSet,
                                enumBindings,
                            ),
                        );
                    } else {
                        fieldTypes.push(ctx.freshTypeVar(pathExpr.span));
                    }
                } else {
                    fieldTypes.push(ctx.freshTypeVar(pathExpr.span));
                }
            }

            // Return a function type: (field_types) -> EnumType
            return ok(
                makeFnType(fieldTypes, enumType, false, false, pathExpr.span),
            );
        }

        // No fields - return the enum type directly
        return ok(enumType);
    }

    // Handle struct constructors: StructName::new or just StructName
    if (item.kind === "struct") {
        const structType = {
            kind: TypeKind.Struct,
            name: itemName,
            fields: (item.node.fields || []).map((f: Node) => ({
                name: f.name,
                type: f.ty
                    ? resolveTypeNode(ctx, f.ty).ok // TODO: refactor this
                        ? (resolveTypeNode(ctx, f.ty) as { value: Type }).value
                        : ctx.freshTypeVar(pathExpr.span)
                    : ctx.freshTypeVar(pathExpr.span),
            })),
            span: pathExpr.span,
        };
        return ok(structType);
    }

    return err({
        message: `Qualified paths not yet supported for: ${itemName}`,
        span: pathExpr.span,
    });
}

/**
 * Infer struct expression type
 */
function inferStructExpr(
    ctx: TypeContext,
    structExpr: Node,
): Result<Type, TypeError[]> {
    const pathResult = inferExpr(ctx, structExpr.path);
    if (!pathResult.ok) return err([pathResult.error]);

    const structType = ctx.resolveType(pathResult.value);

    // Handle tuple expressions (path is "()" or Unit type)
    if (
        structType.kind === TypeKind.Unit ||
        (structType.kind === TypeKind.Named && structType.name === "()")
    ) {
        // This is a tuple expression
        const elementTypes = [];
        const errors = [];

        for (const field of structExpr.fields || []) {
            const valueResult = inferExpr(ctx, field.value);
            if (!valueResult.ok) {
                errors.push(valueResult.error);
            } else {
                elementTypes.push(valueResult.value);
            }
        }
        if (errors.length > 0) {
            return err(errors);
        }

        return ok(makeTupleType(elementTypes, structExpr.span));
    }

    // Check that it's a struct
    if (
        structType.kind !== TypeKind.Struct &&
        structType.kind !== TypeKind.Named &&
        structType.kind !== TypeKind.TypeVar
    ) {
        return err([
            {
                message: `Expected struct type, got ${typeToString(structType)}`,
                span: structExpr.span,
            },
        ]);
    }

    // Get struct definition
    let structDef = null;
    if (structType.kind === TypeKind.Struct) {
        structDef = ctx.lookupItem(structType.name);
    } else if (structType.kind === TypeKind.Named) {
        structDef = ctx.lookupItem(structType.name);
    }

    if (!structDef || structDef.kind !== "struct") {
        return err([
            {
                message: `Unknown struct: ${typeToString(structType)}`,
                span: structExpr.span,
            },
        ]);
    }

    // Check fields
    const errors: TypeError[] = [];
    const seenFields = new Set();

    for (const field of structExpr.fields) {
        seenFields.add(field.name);

        const fieldDef = structDef.node.fields?.find(
            (f: Node) => f.name === field.name,
        );
        if (!fieldDef) {
            errors.push({
                message: `Unknown field: ${field.name}`,
                span: field.span,
            });
            continue;
        }

        const valueResult = inferExpr(ctx, field.value);
        if (!valueResult.ok) {
            errors.push(valueResult.error);
            continue;
        }

        if (fieldDef.ty) {
            const fieldTypeResult = resolveTypeNode(ctx, fieldDef.ty);
            if (!fieldTypeResult.ok) {
                errors.push(...fieldTypeResult.error);
                continue;
            }

            const unifyResult = unify(
                ctx,
                valueResult.value,
                fieldTypeResult.value,
            );
            if (!unifyResult.ok) {
                errors.push(unifyResult.error);
            }
        }
    }

    // Check for missing fields
    for (const fieldDef of structDef.node.fields) {
        if (!seenFields.has(fieldDef.name) && !fieldDef.defaultValue) {
            errors.push({
                message: `Missing field: ${fieldDef.name}`,
                span: structExpr.span,
            });
        }
    }

    if (errors.length > 0) {
        return err(errors);
    }

    return ok(structType);
}

/**
 * Infer range expression type
 * @param {TypeContext} ctx
 * @param {Node} rangeExpr
 * @returns {InferenceResult}
 */
function inferRange(
    ctx: TypeContext,
    rangeExpr: Node,
): Result<Type, TypeError[]> {
    const errors = [];
    if (rangeExpr.start) {
        const startResult = inferExpr(ctx, rangeExpr.start);
        if (!startResult.ok) {
            errors.push(startResult.error);
        }
    }
    if (rangeExpr.end) {
        const endResult = inferExpr(ctx, rangeExpr.end);
        if (!endResult.ok) {
            errors.push(endResult.error);
        }
    }
    if (errors.length > 0) {
        return err(errors);
    }
    // Range type is std::ops::Range<T> - for now return a placeholder
    return ok(makeNamedType("Range", null, rangeExpr.span));
}

/** Infer reference expression type */
function inferRef(ctx: TypeContext, refExpr: Node): Result<Type, TypeError> {
    const operandResult = inferExpr(ctx, refExpr.operand);
    if (!operandResult.ok) return operandResult;

    const mutable = refExpr.mutability === Mutability.Mutable;
    return ok(makeRefType(operandResult.value, mutable, refExpr.span));
}

/** Infer dereference expression type */
function inferDeref(
    ctx: TypeContext,
    derefExpr: Node,
): Result<Type, TypeError> {
    const operandResult = inferExpr(ctx, derefExpr.operand);
    if (!operandResult.ok) return operandResult;

    const operandType = ctx.resolveType(operandResult.value);

    if (operandType.kind === TypeKind.Ref) {
        return ok(operandType.inner);
    }

    if (operandType.kind === TypeKind.Ptr) {
        return ok(operandType.inner);
    }

    if (operandType.kind === TypeKind.TypeVar) {
        const innerType = ctx.freshTypeVar(operandType.span);
        const refType = makeRefType(innerType, false, innerType.span);
        const unifyResult = unify(ctx, operandType, refType);
        if (!unifyResult.ok) {
            return err(unifyResult.error);
        }
        return ok(innerType);
    }

    return err({
        message: `Cannot dereference non-reference type: ${typeToString(operandType)}`,
        span: derefExpr.span,
    });
}

/** Count placeholders in a format string */
function countFormatPlaceholders(str: string): number {
    let count = 0;
    let i = 0;
    while (i < str.length) {
        if (str[i] === "{") {
            if (i + 1 < str.length && str[i + 1] === "{") {
                // Escaped {{ -> skip
                i += 2;
            } else if (i + 1 < str.length && str[i + 1] === "}") {
                // Found {} placeholder
                count++;
                i += 2;
            } else {
                i++;
            }
        } else if (str[i] === "}") {
            if (i + 1 < str.length && str[i + 1] === "}") {
                // Escaped }} -> skip
                i += 2;
            } else {
                i++;
            }
        } else {
            i++;
        }
    }
    return count;
}

function isSupportedFormatType(ctx: TypeContext, ty: Type): boolean {
    const resolved = ctx.resolveType(ty);
    return (
        resolved.kind === TypeKind.Int ||
        resolved.kind === TypeKind.Float ||
        resolved.kind === TypeKind.Bool ||
        resolved.kind === TypeKind.Char ||
        resolved.kind === TypeKind.String
    );
}

/**
 * Infer macro invocation type
 * Handles built-in macros like println! and print!
 */
function inferMacro(
    ctx: TypeContext,
    macroExpr: Node,
): Result<Type, TypeError[]> {
    const macroName = macroExpr.name;

    // Handle known macros
    switch (macroName) {
        case "println":
        case "print": {
            if (!macroExpr.args || macroExpr.args.length === 0) {
                return err([
                    {
                        message: `${macroName}! requires a format string argument`,
                        span: macroExpr.span,
                    },
                ]);
            }

            const errors: TypeError[] = [];
            const formatArg = macroExpr.args[0];

            // Check that format string is a string literal
            if (
                formatArg.kind !== NodeKind.LiteralExpr ||
                formatArg.literalKind !== LiteralKind.String
            ) {
                return err([
                    {
                        message: `${macroName}! format string must be a string literal`,
                        span: formatArg.span || macroExpr.span,
                    },
                ]);
            }

            // Count placeholders in format string
            const formatStr = String(formatArg.value);
            const placeholderCount = countFormatPlaceholders(formatStr);
            const formatArgs = macroExpr.args.slice(1);

            // Validate placeholder count matches argument count
            if (placeholderCount !== formatArgs.length) {
                return err([
                    {
                        message: `${macroName}! expected ${placeholderCount} format argument(s), got ${formatArgs.length}`,
                        span: macroExpr.span,
                    },
                ]);
            }

            // Check format argument types are supported by {} rendering.
            for (let i = 0; i < formatArgs.length; i++) {
                const arg = formatArgs[i];
                const argResult = inferExpr(ctx, arg);
                if (!argResult.ok) {
                    errors.push(argResult.error);
                    continue;
                }
                if (!isSupportedFormatType(ctx, argResult.value)) {
                    errors.push({
                        message: `${macroName}! format argument ${i} type ${typeToString(ctx.resolveType(argResult.value))} is not supported by {}`,
                        span: arg.span ?? macroExpr.span,
                    });
                }
            }

            if (errors.length > 0) {
                return err(errors);
            }

            // Return unit type
            return ok(makeUnitType(macroExpr.span));
        }

        case "panic": {
            // panic! never returns
            return ok(makeNeverType(macroExpr.span));
        }

        case "assert":
        case "debug_assert": {
            // assert! takes a boolean expression
            if (!macroExpr.args || macroExpr.args.length === 0) {
                return err([
                    {
                        message: `${macroName}! requires a condition argument`,
                        span: macroExpr.span,
                    },
                ]);
            }

            const condResult = inferExpr(ctx, macroExpr.args[0]);
            if (!condResult.ok) return err([condResult.error]);

            const condUnify = unify(
                ctx,
                condResult.value,
                makeBoolType(macroExpr.span),
            );
            if (!condUnify.ok) {
                return err([condUnify.error]);
            }
            return ok(makeUnitType(macroExpr.span));
        }

        case "vec": {
            // vec![a, b, c] lowers to Vec<T>.
            if (!macroExpr.args || macroExpr.args.length === 0) {
                return ok(
                    makeNamedType(
                        "Vec",
                        [ctx.freshTypeVar(macroExpr.span)],
                        macroExpr.span,
                    ),
                );
            }

            const firstResult = inferExpr(ctx, macroExpr.args[0]);
            if (!firstResult.ok) return err([firstResult.error]);

            const elementType = firstResult.value;

            // Check all elements have the same type
            for (let i = 1; i < macroExpr.args.length; i++) {
                const elemResult = inferExpr(ctx, macroExpr.args[i]);
                if (!elemResult.ok) return err([elemResult.error]);

                const unifyResult = unify(ctx, elementType, elemResult.value);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
            }

            return ok(makeNamedType("Vec", [elementType], macroExpr.span));
        }

        default:
            // Unknown macro - for now, return unit type
            // In a full implementation, we'd look up macro definitions
            return ok(makeUnitType(macroExpr.span));
    }
}

// ============================================================================
// Task 4.5: Statement Checking
// ============================================================================

/** Check a statement */
function checkStmt(ctx: TypeContext, stmt: Node): Result<Type, TypeError> {
    switch (stmt.kind) {
        case NodeKind.LetStmt:
            const checksmt = checkLetStmt(ctx, stmt);
            if (!checksmt.ok) {
                if (checksmt.error.length > 0) {
                    return err(checksmt.error[0]);
                }
                return err({
                    message: "Let statement type checking failed",
                    span: stmt.span,
                });
            }
            return ok(checksmt.value);

        case NodeKind.ExprStmt:
            return checkExprStmt(ctx, stmt);

        case NodeKind.ItemStmt: {
            // Items are already gathered, just check nested items
            const result = checkItem(ctx, stmt.item);
            if (!result.ok) return result;
            return ok(makeUnitType(stmt.span));
        }

        default:
            return err({
                message: `Unknown statement kind: ${stmt.kind}`,
                span: stmt.span,
            });
    }
}

/** Check a let statement */
function checkLetStmt(
    ctx: TypeContext,
    letStmt: Node,
): Result<Type, TypeError[]> {
    const errors: TypeError[] = [];

    let declaredType = undefined;
    if (letStmt.ty) {
        const typeResult = resolveTypeNode(ctx, letStmt.ty);
        if (!typeResult.ok) {
            errors.push(...typeResult.error);
        } else {
            declaredType = typeResult.value;
        }
    }

    let initType: Type | null = null;
    if (letStmt.init) {
        const initResult = inferExpr(ctx, letStmt.init, declaredType);
        if (!initResult.ok) {
            errors.push(initResult.error);
        } else {
            initType = initResult.value;
        }
    }
    // Determine the type
    let varType;
    if (declaredType && initType) {
        const unifyResult = unify(ctx, declaredType, initType);
        if (!unifyResult.ok) {
            errors.push(unifyResult.error);
        }
        varType = declaredType;
    } else if (declaredType) {
        varType = declaredType;
    } else if (initType) {
        varType = initType;
    } else if (letStmt.init) {
        // Initializer exists but failed to infer; avoid emitting a noisy
        // follow-up "cannot infer variable type" error.
        varType = ctx.freshTypeVar(letStmt.span);
    } else {
        // No type annotation and no initializer - error
        errors.push({
            message:
                "Cannot infer type for variable without initializer or type annotation",
            span: letStmt.span,
        });
        varType = ctx.freshTypeVar(letStmt.span);
    }

    // Bind pattern
    const patResult = checkPattern(ctx, letStmt.pat, varType);
    if (!patResult.ok) {
        errors.push(...patResult.error);
    } else if (
        letStmt.init &&
        letStmt.init.kind === NodeKind.ClosureExpr &&
        letStmt.pat.kind === NodeKind.IdentPat
    ) {
        const binding = ctx.lookupVar(letStmt.pat.name);
        if (binding) {
            binding.closureInfo = {
                captures: letStmt.init.captureInfos || [],
                inferredType: letStmt.init.inferredType || varType,
            };
        }
    }

    if (errors.length > 0) {
        return err(errors);
    }

    // If initializer diverges, the whole statement diverges
    if (initType && initType.kind === TypeKind.Never) {
        return ok(initType);
    }

    return ok(makeUnitType(letStmt.span));
}

/** Check an expression statement */
function checkExprStmt(
    ctx: TypeContext,
    exprStmt: Node,
): Result<Type, TypeError> {
    const result = inferExpr(ctx, exprStmt.expr);
    if (!result.ok) {
        return result;
    }
    // If expression type is never, the statement diverges
    if (result.value.kind === TypeKind.Never) {
        return result;
    }
    return ok(makeUnitType(exprStmt.span));
}

// ============================================================================
// Task 4.7: Pattern Type Checking
// ============================================================================

/** Infer the type of a pattern */
function inferPattern(
    ctx: TypeContext,
    pattern: Node,
): Result<Type, TypeError[]> {
    switch (pattern.kind) {
        case NodeKind.IdentPat: {
            const type = pattern.ty
                ? resolveTypeNode(ctx, pattern.ty)
                : ok(ctx.freshTypeVar(pattern.span));
            if (!type.ok) return err(type.error);

            const mutable = pattern.mutability === Mutability.Mutable;
            const defineResult = ctx.defineVar(
                pattern.name,
                type.value,
                mutable,
                pattern.span,
            );
            if (!defineResult.ok) {
                return err([
                    {
                        message:
                            defineResult.error || "Failed to define variable",
                        span: pattern.span,
                    },
                ]);
            }
            return ok(type.value);
        }
        case NodeKind.WildcardPat:
            return ok(ctx.freshTypeVar(pattern.span));
        case NodeKind.LiteralPat: {
            switch (pattern.literalKind) {
                case LiteralKind.Int:
                    return ok(makeIntType(IntWidth.I32, pattern.span));
                case LiteralKind.Float:
                    return ok(makeFloatType(FloatWidth.F64, pattern.span));
                case LiteralKind.Bool:
                    return ok(makeBoolType(pattern.span));
                case LiteralKind.String:
                    return ok(makeStringType(pattern.span));
                case LiteralKind.Char:
                    return ok(makeCharType(pattern.span));
                default:
                    return err([
                        {
                            message: `Unknown literal pattern kind: ${pattern.literalKind}`,
                            span: pattern.span,
                        },
                    ]);
            }
        }
        case NodeKind.TuplePat: {
            const elementsResult = combineResults(
                pattern.elements.map((e: Node) => inferPattern(ctx, e)),
            );
            if (!elementsResult.ok) {
                return err(elementsResult.error);
            }
            return ok(makeTupleType(elementsResult.value, pattern.span));
        }

        case NodeKind.StructPat: {
            // Look up struct type
            const pathResult = inferExpr(ctx, pattern.path);
            if (!pathResult.ok) return err([pathResult.error]);

            const structType = ctx.resolveType(pathResult.value);
            if (
                structType.kind !== TypeKind.Struct &&
                structType.kind !== TypeKind.Named
            ) {
                return err([
                    {
                        message: `Expected struct type in pattern, got ${typeToString(structType)}`,
                        span: pattern.span,
                    },
                ]);
            }

            // Bind fields
            for (const field of pattern.fields) {
                const fieldResult = inferPattern(ctx, field.pat);
                if (!fieldResult.ok) return fieldResult;
            }

            return ok(structType);
        }

        case NodeKind.BindingPat: {
            const innerResult = inferPattern(ctx, pattern.pat);
            if (!innerResult.ok) return innerResult;

            const defineResult = ctx.defineVar(
                pattern.name,
                innerResult.value,
                false,
                pattern.span,
            );
            if (!defineResult.ok) {
                return err([
                    {
                        message:
                            defineResult.error ?? "Failed to define binding",
                        span: pattern.span,
                    },
                ]);
            }

            return ok(innerResult.value);
        }

        case NodeKind.OrPat: {
            // All alternatives must have the same type
            if (!pattern.alternatives || pattern.alternatives.length === 0) {
                return ok(ctx.freshTypeVar(pattern.span));
            }
            const firstResult = inferPattern(ctx, pattern.alternatives[0]);
            if (!firstResult.ok) return firstResult;
            for (let i = 1; i < pattern.alternatives.length; i++) {
                const altResult = inferPattern(ctx, pattern.alternatives[i]);
                if (!altResult.ok) return altResult;

                const unifyResult = unify(
                    ctx,
                    firstResult.value,
                    altResult.value,
                );
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
            }

            return ok(firstResult.value);
        }

        case NodeKind.RangePat: {
            // Range patterns are for numeric types
            if (pattern.start) {
                const startResult = inferPattern(ctx, pattern.start);
                if (!startResult.ok) return startResult;
                return ok(startResult.value);
            }
            if (pattern.end) {
                const endResult = inferPattern(ctx, pattern.end);
                if (!endResult.ok) return endResult;
                return ok(endResult.value);
            }
            return ok(ctx.freshTypeVar(pattern.span));
        }

        case NodeKind.SlicePat: {
            // Slice patterns are for slices/arrays
            const elementType = ctx.freshTypeVar(pattern.span);
            for (const elem of pattern.elements || []) {
                const elemResult = inferPattern(ctx, elem);
                if (!elemResult.ok) return elemResult;
                const unifyResult = unify(ctx, elemResult.value, elementType);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
            }
            return ok(makeSliceType(elementType, pattern.span));
        }

        default:
            return err([
                {
                    message: `Unknown pattern kind: ${pattern.kind}`,
                    span: pattern.span,
                },
            ]);
    }
}

/** Check a pattern against an expected type */
function checkPattern(
    ctx: TypeContext,
    pattern: Node,
    expectedType: Type,
): Result<void, TypeError[]> {
    expectedType = ctx.resolveType(expectedType);

    switch (pattern.kind) {
        case NodeKind.IdentPat: {
            let varType = expectedType;

            // If pattern has explicit type annotation, unify with expected
            if (pattern.ty) {
                const typeResult = resolveTypeNode(ctx, pattern.ty);
                if (!typeResult.ok) {
                    return err(typeResult.error);
                }
                const unifyResult = unify(ctx, typeResult.value, expectedType);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
                varType = typeResult.value;
            }
            const mutable = pattern.mutability === Mutability.Mutable;
            const defineResult = ctx.defineVar(
                pattern.name,
                varType,
                mutable,
                pattern.span,
            );
            if (!defineResult.ok) {
                return err([
                    {
                        message:
                            defineResult.error ?? "Failed to define variable",
                        span: pattern.span,
                    },
                ]);
            }

            return ok(undefined);
        }

        case NodeKind.WildcardPat:
            return ok(undefined);
        case NodeKind.LiteralPat: {
            let literalType;
            switch (pattern.literalKind) {
                case LiteralKind.Int:
                    literalType = makeIntType(IntWidth.I32, pattern.span);
                    break;
                case LiteralKind.Float:
                    literalType = makeFloatType(FloatWidth.F64, pattern.span);
                    break;
                case LiteralKind.Bool:
                    literalType = makeBoolType(pattern.span);
                    break;
                case LiteralKind.String:
                    literalType = makeStringType(pattern.span);
                    break;
                case LiteralKind.Char:
                    literalType = makeCharType(pattern.span);
                    break;
                default:
                    return err([
                        {
                            message: `Unknown literal pattern kind: ${pattern.literalKind}`,
                            span: pattern.span,
                        },
                    ]);
            }

            const unifyResult = unify(ctx, literalType, expectedType);
            if (!unifyResult.ok) {
                return err([unifyResult.error]);
            }
            return ok(undefined);
        }

        case NodeKind.TuplePat: {
            if (expectedType.kind !== TypeKind.Tuple) {
                // Try to unify with a fresh tuple type
                const tupleResult = inferPattern(ctx, pattern);
                if (!tupleResult.ok) {
                    return err(tupleResult.error);
                }
                const unifyResult = unify(ctx, tupleResult.value, expectedType);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
                return ok(undefined);
            }

            const tupleType = expectedType;

            if (pattern.elements.length !== tupleType.elements.length) {
                return err([
                    {
                        message: `Tuple pattern length mismatch: expected ${tupleType.elements.length}, got ${pattern.elements.length}`,
                        span: pattern.span,
                    },
                ]);
            }

            const errors: TypeError[] = [];
            for (let i = 0; i < pattern.elements.length; i++) {
                const result = checkPattern(
                    ctx,
                    pattern.elements[i],
                    tupleType.elements[i],
                );
                if (!result.ok) {
                    errors.push(...result.error);
                }
            }

            if (errors.length > 0) {
                return err(errors);
            }
            return ok(undefined);
        }

        case NodeKind.StructPat: {
            const pathSegments =
                pattern.path?.kind === NodeKind.PathExpr
                    ? pattern.path.segments || []
                    : [];
            const isEnumVariantPath = pathSegments.length === 2;
            if (isEnumVariantPath) {
                const enumName = pathSegments[0];
                const variantName = pathSegments[1];
                const enumItem = ctx.lookupItem(enumName);
                if (!enumItem || enumItem.kind !== "enum") {
                    return err([
                        {
                            message: `Unknown enum: ${enumName}`,
                            span: pattern.span,
                        },
                    ]);
                }

                let enumPatternType = makeEnumType(enumName, [], pattern.span);
                const enumGenericParams = (enumItem.node.generics || [])
                    .map((name?: string) => name || "")
                    .filter((name: string) => name.length > 0);
                if (enumGenericParams.length > 0) {
                    const expectedResolved = ctx.resolveType(expectedType);
                    let args = null;
                    if (
                        expectedResolved.kind === TypeKind.Named &&
                        expectedResolved.name === enumName &&
                        expectedResolved.args
                    ) {
                        args = expectedResolved.args;
                    }
                    enumPatternType = makeNamedType(
                        enumName,
                        args ??
                            enumGenericParams.map(() =>
                                ctx.freshTypeVar(pattern.span),
                            ),
                        pattern.span,
                    );
                }

                const enumUnify = unify(ctx, enumPatternType, expectedType);
                if (!enumUnify.ok) {
                    return err([enumUnify.error]);
                }

                const variant = (enumItem.node.variants || []).find(
                    (v: Node) => v.name === variantName,
                );
                if (!variant) {
                    return err([
                        {
                            message: `Unknown variant: ${enumName}::${variantName}`,
                            span: pattern.span,
                        },
                    ]);
                }

                const variantFields = variant.fields || [];
                if (pattern.fields.length !== variantFields.length) {
                    return err([
                        {
                            message: `Variant ${enumName}::${variantName} expects ${variantFields.length} field(s), got ${pattern.fields.length}`,
                            span: pattern.span,
                        },
                    ]);
                }
                const expectedResolved = ctx.resolveType(expectedType);
                const expectedArgs =
                    expectedResolved.kind === TypeKind.Named &&
                    expectedResolved.name === enumName &&
                    expectedResolved.args
                        ? expectedResolved.args
                        : null;
                const bindings = new Map();
                const genericSet: Set<string> = new Set(enumGenericParams);
                if (expectedArgs) {
                    const count = Math.min(
                        expectedArgs.length,
                        enumGenericParams.length,
                    );
                    for (let i = 0; i < count; i++) {
                        bindings.set(enumGenericParams[i], expectedArgs[i]);
                    }
                }

                const errors = [];
                for (let i = 0; i < pattern.fields.length; i++) {
                    const field = pattern.fields[i];
                    const fieldDef = variantFields[i];
                    let fieldType = ctx.freshTypeVar(pattern.span);
                    if (fieldDef?.ty) {
                        const fieldTypeResult = resolveTypeNode(
                            ctx,
                            fieldDef.ty,
                        );
                        if (!fieldTypeResult.ok) {
                            errors.push(...fieldTypeResult.error);
                            continue;
                        }
                        fieldType = substituteGenericTypeBindings(
                            ctx,
                            fieldTypeResult.value,
                            genericSet,
                            bindings,
                        );
                    }

                    const fieldResult = checkPattern(ctx, field.pat, fieldType);
                    if (!fieldResult.ok) {
                        errors.push(...fieldResult.error);
                    }
                }
                if (errors.length > 0) return err(errors);
                return ok(undefined);
            }

            // Regular struct pattern.
            const pathResult = inferExpr(ctx, pattern.path);
            if (!pathResult.ok) {
                return err([pathResult.error]);
            }
            const structType = ctx.resolveType(pathResult.value);
            const unifyResult = unify(ctx, structType, expectedType);
            if (!unifyResult.ok) return err([unifyResult.error]);
            let structDef = null;
            if (structType.kind === TypeKind.Struct) {
                structDef = ctx.lookupItem(structType.name);
            } else if (structType.kind === TypeKind.Named) {
                structDef = ctx.lookupItem(structType.name);
            }
            if (!structDef || structDef.kind !== "struct") {
                return err([
                    {
                        message: `Unknown struct: ${typeToString(structType)}`,
                        span: pattern.span,
                    },
                ]);
            }

            const errors: TypeError[] = [];
            const seenFields: Set<string> = new Set();
            for (const field of pattern.fields as Node[]) {
                seenFields.add(field.name);
                const fieldDef: Node | null =
                    structDef.node.fields?.find(
                        (f: Node) => f.name === field.name,
                    ) || null;
                if (!fieldDef) {
                    errors.push({
                        message: `Unknown field: ${field.name}`,
                        span: field.span,
                    });
                    continue;
                }

                let fieldType = ctx.freshTypeVar(field.span);
                if (fieldDef.ty) {
                    const typeResult = resolveTypeNode(ctx, fieldDef.ty);
                    if (!typeResult.ok) {
                        errors.push(...typeResult.error);
                        continue;
                    }
                    fieldType = typeResult.value;
                }
                const fieldResult = checkPattern(ctx, field.pat, fieldType);
                if (!fieldResult.ok) {
                    errors.push(...fieldResult.error);
                }
            }
            if (!pattern.rest) {
                for (const fieldDef of structDef.node.fields) {
                    if (!seenFields.has(fieldDef.name)) {
                        errors.push({
                            message: `Missing field in pattern: ${fieldDef.name}`,
                            span: pattern.span,
                        });
                    }
                }
            }
            if (errors.length > 0) return err(errors);
            return ok(undefined);
        }

        case NodeKind.BindingPat: {
            const innerResult = checkPattern(ctx, pattern.pat, expectedType);
            if (!innerResult.ok) return innerResult;

            const defineResult = ctx.defineVar(
                pattern.name,
                expectedType,
                false,
                pattern.span,
            );
            if (!defineResult.ok) {
                return err([
                    {
                        message:
                            defineResult.error || "Failed to define binding",
                        span: pattern.span,
                    },
                ]);
            }

            return ok(undefined);
        }

        case NodeKind.OrPat: {
            if (!pattern.alternatives || pattern.alternatives.length === 0) {
                return ok(undefined);
            }

            const errors: TypeError[] = [];
            for (const alt of pattern.alternatives) {
                const result = checkPattern(ctx, alt, expectedType);
                if (!result.ok) {
                    errors.push(...result.error);
                }
            }

            if (errors.length > 0) {
                return err(errors);
            }
            return ok(undefined);
        }

        case NodeKind.RangePat: {
            // Check that expected type is numeric
            if (
                !isNumericType(expectedType) &&
                expectedType.kind !== TypeKind.TypeVar
            ) {
                return err([
                    {
                        message: `Range pattern requires numeric type, got ${typeToString(expectedType)}`,
                        span: pattern.span,
                    },
                ]);
            }

            if (pattern.start) {
                const startResult = inferPattern(ctx, pattern.start);
                if (!startResult.ok) {
                    return err(startResult.error);
                }
                const unifyResult = unify(ctx, startResult.value, expectedType);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
            }

            if (pattern.end) {
                const endResult = inferPattern(ctx, pattern.end);
                if (!endResult.ok) {
                    return err(endResult.error);
                }
                const unifyResult = unify(ctx, endResult.value, expectedType);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
            }

            return ok(undefined);
        }

        case NodeKind.SlicePat: {
            // Check that expected type is array or slice
            let elementType;
            if (expectedType.kind === TypeKind.Array) {
                elementType = expectedType.element;
            } else if (expectedType.kind === TypeKind.Slice) {
                elementType = expectedType.element;
            } else if (expectedType.kind === TypeKind.TypeVar) {
                elementType = ctx.freshTypeVar(expectedType.span);
                const sliceType = makeSliceType(elementType, elementType.span);
                const unifyResult = unify(ctx, expectedType, sliceType);
                if (!unifyResult.ok) {
                    return err([unifyResult.error]);
                }
            } else {
                return err([
                    {
                        message: `Slice pattern requires array or slice type, got ${typeToString(expectedType)}`,
                        span: pattern.span,
                    },
                ]);
            }

            const errors: TypeError[] = [];
            for (const elem of pattern.elements || []) {
                const result = checkPattern(ctx, elem, elementType);
                if (!result.ok) errors.push(...result.error);
            }

            if (errors.length > 0) {
                return err(errors);
            }
            return ok(undefined);
        }

        default:
            return err([
                {
                    message: `Unknown pattern kind: ${pattern.kind}`,
                    span: pattern.span,
                },
            ]);
    }
}

// ============================================================================
// Task 4.11: Inference Finalization
// ============================================================================

/** Finalize inference by resolving all type variables */
function finalizeInference(ctx: TypeContext): Result<void, TypeError[]> {
    const errors = [];

    // Check for unresolved type variables
    for (const [id, tv] of ctx.typeVars) {
        if (tv.bound === null) {
            errors.push({
                message: `Ambiguous type: cannot infer type for type variable ?${id}`,
                span: tv.span,
            });
        }
    }
    if (errors.length > 0) {
        return err(errors);
    }
    return ok(undefined);
}

// ============================================================================
// Exports
// ============================================================================

export {
    // Entry point
    inferModule,
    // Unification
    unify,
    // Substitution
    substitute,
    // Expression inference
    inferExpr,
    inferLiteral,
    inferIdentifier,
    inferBinary,
    inferUnary,
    inferCall,
    inferClosure,
    inferField,
    inferIndex,
    inferAssign,
    // Control flow inference
    inferIf,
    inferMatch,
    inferBlock,
    inferLoop,
    inferWhile,
    inferFor,
    inferReturn,
    inferBreak,
    inferContinue,
    inferPath,
    inferStructExpr,
    inferRange,
    inferRef,
    inferDeref,
    inferMacro,
    // Statement checking
    checkStmt,
    checkLetStmt,
    checkExprStmt,
    // Pattern checking
    inferPattern,
    checkPattern,
    // Type resolution
    resolveTypeNode,
    resolveBuiltinType,
    isCopyableInContext,
    // Error handling
    ok,
    err,
    combineResults,
    // Declaration gathering
    gatherDeclarations,
    gatherDeclaration,
    inferFnSignature,
    // Finalization
    finalizeInference,
};
