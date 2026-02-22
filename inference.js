/** @typedef {import("./types.js").Type} Type */
/** @typedef {import("./types.js").FnType} FnType */
/** @typedef {import("./types.js").TypeVarType} TypeVarType */
/** @typedef {import("./types.js").Span} Span */
/** @typedef {import("./ast.js").Node} Node */
/** @typedef {import("./type_context.js").TypeContext} TypeContextModel */

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
    makeTypeVar,
    makeNamedType,
    makeOptionType,
    typeEquals,
    typeToString,
    isNumericType,
    isIntegerType,
    isFloatType,
    isBoolType,
    isUnitType,
    isNeverType,
    isTypeVar,
    isCopyableType,
} from "./types.js";

import { TypeContext } from "./type_context.js";

import {
    NodeKind,
    LiteralKind,
    UnaryOp,
    BinaryOp,
    Mutability,
    BuiltinType,
} from "./ast.js";

// ============================================================================
// Task 4.10: Error Reporting
// ============================================================================

/**
 * @typedef {object} TypeError
 * @property {string} message
 * @property {Span} [span]
 * @property {string[]} [notes]
 */

/**
 * Create a type error
 * @param {string} message
 * @param {Span} [span]
 * @param {string[]} [notes]
 * @returns {TypeError}
 */
function makeTypeError(message, span, notes) {
    return { message, span, notes };
}

/** @typedef {{ ok: true, type: Type }} InferenceSuccess */
/** @typedef {{ ok: false, errors: TypeError[] }} InferenceError */
/** @typedef {InferenceSuccess | InferenceError} InferenceResult */

/**
 * Create a successful inference result
 * @param {Type} type
 * @returns {InferenceResult}
 */
function ok(type) {
    return { ok: true, type };
}

/**
 * Create a failed inference result
 * @param {string} message
 * @param {Span} [span]
 * @param {string[]} [notes]
 * @returns {InferenceResult}
 */
function err(message, span, notes) {
    return { ok: false, errors: [makeTypeError(message, span, notes)] };
}

/**
 * @typedef {{ ok: true, types: Type[] } | { ok: false, errors: TypeError[] }} CombinedResult
 */

/**
 * Combine multiple results, collecting all errors
 * @param {InferenceResult[]} results
 * @returns {CombinedResult}
 */
function combineResults(results) {
    const errors = [];
    const types = [];
    for (const result of results) {
        if (!result.ok) {
            errors.push(...result.errors);
        } else {
            types.push(result.type);
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true, types };
}

/**
 * @param {Node} fnItem
 * @returns {TypeError[]}
 */
function collectUnsupportedGenericConstraintErrors(fnItem) {
    const errors = [];
    const genericParams = fnItem.genericParams || [];
    const hasTraitBounds = genericParams.some(
        (/** @type {{ bounds?: Node[] }} */ p) => (p.bounds || []).length > 0,
    );
    if (hasTraitBounds) {
        errors.push(
            makeTypeError(
                "Trait bounds are parsed but not implemented yet",
                fnItem.span,
            ),
        );
    }
    if ((fnItem.whereClause || []).length > 0) {
        errors.push(
            makeTypeError(
                "where clauses are parsed but not implemented yet",
                fnItem.span,
            ),
        );
    }
    return errors;
}

/**
 * @param {TypeContext} ctx
 * @param {Node} callee
 * @returns {import('./type_context.js').ItemDecl | null}
 */
function lookupDirectFunctionItemForCall(ctx, callee) {
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

/**
 * @param {TypeContext} ctx
 * @param {Type} type
 * @param {Set<string>} genericNames
 * @param {Map<string, Type>} bindings
 * @param {boolean} [createMissingBindings=true]
 * @returns {Type}
 */
function substituteGenericTypeBindings(
    ctx,
    type,
    genericNames,
    bindings,
    createMissingBindings = true,
) {
    const resolved = ctx.resolveType(type);
    switch (resolved.kind) {
        case TypeKind.Named: {
            if (genericNames.has(resolved.name) && !resolved.args) {
                const existing = bindings.get(resolved.name);
                if (existing) {
                    return ctx.resolveType(existing);
                }
                if (createMissingBindings) {
                    const fresh = ctx.freshTypeVar();
                    bindings.set(resolved.name, fresh);
                    return fresh;
                }
                return resolved;
            }
            if (!resolved.args) return resolved;
            return makeNamedType(
                resolved.name,
                resolved.args.map((/** @type {Type} */ t) =>
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
                resolved.elements.map((/** @type {Type} */ t) =>
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
                resolved.params.map((/** @type {Type} */ t) =>
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

/**
 * @param {TypeContext} ctx
 * @param {Node} call
 * @param {import('./type_context.js').ItemDecl} itemDecl
 * @returns {InferenceResult}
 */
function inferGenericFunctionCall(ctx, call, itemDecl) {
    const fnType = itemDecl.type;
    if (!fnType || fnType.kind !== TypeKind.Fn) {
        return err("Generic function type is not available", call.span);
    }
    const genericNames = itemDecl.node.generics || [];
    const genericSet = new Set(genericNames);
    const bindings = itemDecl.genericBindings || new Map();
    itemDecl.genericBindings = bindings;

    if (call.typeArgs !== null) {
        if (call.typeArgs.length !== genericNames.length) {
            return err(
                `Generic function expects ${genericNames.length} type arguments, got ${call.typeArgs.length}`,
                call.span,
            );
        }
        for (let i = 0; i < genericNames.length; i++) {
            const name = genericNames[i];
            const typeArgResult = resolveTypeNode(ctx, call.typeArgs[i]);
            if (!typeArgResult.ok) {
                return typeArgResult;
            }
            const existing = bindings.get(name);
            if (existing) {
                const unifyExisting = unify(ctx, existing, typeArgResult.type);
                if (!unifyExisting.ok) {
                    return { ok: false, errors: [unifyExisting.error] };
                }
            } else {
                bindings.set(name, typeArgResult.type);
            }
        }
    }

    if (call.args.length !== fnType.params.length) {
        return err(
            `Function expects ${fnType.params.length} arguments, got ${call.args.length}`,
            call.span,
        );
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
        const unifyResult = unify(ctx, argResult.type, expectedParamType);
        if (!unifyResult.ok) {
            return {
                ok: false,
                errors: [
                    makeTypeError(
                        `Argument type mismatch: expected ${typeToString(expectedParamType)}, got ${typeToString(argResult.type)}`,
                        call.args[i]?.span || call.span,
                    ),
                ],
            };
        }
    }

    const returnType = substituteGenericTypeBindings(
        ctx,
        fnType.returnType,
        genericSet,
        bindings,
    );
    const concreteParams = fnType.params.map((/** @type {Type} */ p) =>
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

/** @typedef {{ ok: true }} UnifySuccess */
/** @typedef {{ ok: false, error: TypeError }} UnifyError */
/** @typedef {UnifySuccess | UnifyError} UnifyResult */

/**
 * Unify two types, making them equal
 * @param {TypeContext} ctx
 * @param {Type} t1
 * @param {Type} t2
 * @returns {UnifyResult}
 */
function unify(ctx, t1, t2) {
    // Resolve type variables first
    t1 = ctx.resolveType(t1);
    t2 = ctx.resolveType(t2);

    // Same type - success
    if (typeEquals(t1, t2)) {
        return { ok: true };
    }

    // Unit types are always equal (regardless of span)
    if (t1.kind === TypeKind.Unit && t2.kind === TypeKind.Unit) {
        return { ok: true };
    }

    // Type variable unification
    if (t1.kind === TypeKind.TypeVar && t1.bound === null) {
        // Occurs check
        if (ctx.occursIn(t1.id, t2)) {
            return {
                ok: false,
                error: makeTypeError(
                    `Occurs check failed: type variable ?${t1.id} occurs in ${typeToString(t2)}`,
                    t1.span,
                ),
            };
        }
        const result = ctx.bindTypeVar(t1.id, t2);
        if (!result.ok) {
            return {
                ok: false,
                error: makeTypeError(
                    result.error || "Failed to bind type variable",
                    t1.span,
                ),
            };
        }
        return { ok: true };
    }

    if (t2.kind === TypeKind.TypeVar && t2.bound === null) {
        // Occurs check
        if (ctx.occursIn(t2.id, t1)) {
            return {
                ok: false,
                error: makeTypeError(
                    `Occurs check failed: type variable ?${t2.id} occurs in ${typeToString(t1)}`,
                    t2.span,
                ),
            };
        }
        const result = ctx.bindTypeVar(t2.id, t1);
        if (!result.ok) {
            return {
                ok: false,
                error: makeTypeError(
                    result.error || "Failed to bind type variable",
                    t2.span,
                ),
            };
        }
        return { ok: true };
    }

    // Never type unifies with anything (bottom type)
    if (t1.kind === TypeKind.Never) {
        return { ok: true };
    }
    if (t2.kind === TypeKind.Never) {
        return { ok: true };
    }

    // Tuple unification
    if (t1.kind === TypeKind.Tuple && t2.kind === TypeKind.Tuple) {
        if (t1.elements.length !== t2.elements.length) {
            return {
                ok: false,
                error: makeTypeError(
                    `Tuple length mismatch: expected ${t1.elements.length}, got ${t2.elements.length}`,
                    t1.span,
                ),
            };
        }
        for (let i = 0; i < t1.elements.length; i++) {
            const result = unify(ctx, t1.elements[i], t2.elements[i]);
            if (!result.ok) return result;
        }
        return { ok: true };
    }

    // Array unification
    if (t1.kind === TypeKind.Array && t2.kind === TypeKind.Array) {
        if (t1.length !== t2.length) {
            return {
                ok: false,
                error: makeTypeError(
                    `Array length mismatch: expected ${t1.length}, got ${t2.length}`,
                    t1.span,
                ),
            };
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
            return {
                ok: false,
                error: makeTypeError(
                    `Mutability mismatch: expected ${t1.mutable ? "mut" : "immutable"}, got ${t2.mutable ? "mut" : "immutable"}`,
                    t1.span,
                ),
            };
        }
        return unify(ctx, t1.inner, t2.inner);
    }

    // Pointer unification
    if (t1.kind === TypeKind.Ptr && t2.kind === TypeKind.Ptr) {
        if (t1.mutable !== t2.mutable) {
            return {
                ok: false,
                error: makeTypeError(
                    `Mutability mismatch: expected ${t1.mutable ? "mut" : "const"}, got ${t2.mutable ? "mut" : "const"}`,
                    t1.span,
                ),
            };
        }
        return unify(ctx, t1.inner, t2.inner);
    }

    // Function unification
    if (t1.kind === TypeKind.Fn && t2.kind === TypeKind.Fn) {
        if (t1.params.length !== t2.params.length) {
            return {
                ok: false,
                error: makeTypeError(
                    `Function parameter count mismatch: expected ${t1.params.length}, got ${t2.params.length}`,
                    t1.span,
                ),
            };
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
            return {
                ok: false,
                error: makeTypeError(
                    `Type mismatch: expected ${t1.name}, got ${t2.name}`,
                    t1.span,
                ),
            };
        }
        // Check generic args if present
        if (t1.args && t2.args) {
            if (t1.args.length !== t2.args.length) {
                return {
                    ok: false,
                    error: makeTypeError(
                        `Generic argument count mismatch for ${t1.name}`,
                        t1.span,
                    ),
                };
            }
            for (let i = 0; i < t1.args.length; i++) {
                const result = unify(ctx, t1.args[i], t2.args[i]);
                if (!result.ok) return result;
            }
        }
        return { ok: true };
    }

    // Struct type unification
    if (t1.kind === TypeKind.Struct && t2.kind === TypeKind.Struct) {
        if (t1.name !== t2.name) {
            return {
                ok: false,
                error: makeTypeError(
                    `Struct type mismatch: expected ${t1.name}, got ${t2.name}`,
                    t1.span,
                ),
            };
        }
        return { ok: true };
    }

    // Enum type unification
    if (t1.kind === TypeKind.Enum && t2.kind === TypeKind.Enum) {
        if (t1.name !== t2.name) {
            return {
                ok: false,
                error: makeTypeError(
                    `Enum type mismatch: expected ${t1.name}, got ${t2.name}`,
                    t1.span,
                ),
            };
        }
        return { ok: true };
    }

    // Integer type unification (different widths)
    if (t1.kind === TypeKind.Int && t2.kind === TypeKind.Int) {
        if (t1.width !== t2.width) {
            return {
                ok: false,
                error: makeTypeError(
                    `Integer type mismatch: expected ${typeToString(t1)}, got ${typeToString(t2)}`,
                    t1.span,
                ),
            };
        }
        return { ok: true };
    }

    // Float type unification (different widths)
    if (t1.kind === TypeKind.Float && t2.kind === TypeKind.Float) {
        if (t1.width !== t2.width) {
            return {
                ok: false,
                error: makeTypeError(
                    `Float type mismatch: expected ${typeToString(t1)}, got ${typeToString(t2)}`,
                    t1.span,
                ),
            };
        }
        return { ok: true };
    }

    // Default: types don't unify
    return {
        ok: false,
        error: makeTypeError(
            `Type mismatch: expected ${typeToString(t1)}, got ${typeToString(t2)}`,
            t1.span || t2.span,
        ),
    };
}

// ============================================================================
// Task 4.9: Substitution
// ============================================================================

/**
 * Substitute type variables with their bounds in a type
 * @param {TypeContext} ctx
 * @param {Type} type
 * @returns {Type}
 */
function substitute(ctx, type) {
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

/**
 * @param {Type} ty
 * @returns {string | null}
 */
function typeKeyForMethodLookup(ty) {
    switch (ty.kind) {
        case TypeKind.Struct:
        case TypeKind.Enum:
        case TypeKind.Named:
            return ty.name;
        case TypeKind.Int:
            return intWidthToName(ty.width);
        case TypeKind.Float:
            return floatWidthToName(ty.width);
        case TypeKind.Bool:
            return "bool";
        case TypeKind.Char:
            return "char";
        case TypeKind.String:
            return "str";
        case TypeKind.Unit:
            return "()";
        case TypeKind.Never:
            return "!";
        default:
            return null;
    }
}

/**
 * @param {Node | null | undefined} typeNode
 * @returns {string[]}
 */
function extractTypeNodeGenericParamNames(typeNode) {
    if (!typeNode || typeNode.kind !== NodeKind.NamedType || !typeNode.args?.args) {
        return [];
    }
    const names = [];
    for (const arg of typeNode.args.args) {
        if (arg?.kind === NodeKind.NamedType && arg.name) {
            names.push(arg.name);
        } else {
            names.push("");
        }
    }
    return names;
}

/**
 * @param {Type} receiverType
 * @returns {Type | null}
 */
function vecElementTypeForType(receiverType) {
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

/**
 * Instantiate impl generic method signatures for a concrete receiver type.
 * @param {TypeContext} ctx
 * @param {FnType} fnType
 * @param {Type} receiverType
 * @param {any} meta
 * @returns {FnType}
 */
function instantiateMethodTypeForReceiver(ctx, fnType, receiverType, meta) {
    const implGenericNames = Array.isArray(meta?.implGenericNames)
        ? meta.implGenericNames
        : [];
    if (implGenericNames.length === 0) {
        return fnType;
    }
    const targetGenericParamNames = Array.isArray(meta?.targetGenericParamNames)
        ? meta.targetGenericParamNames
        : [];
    if (
        receiverType.kind !== TypeKind.Named ||
        !receiverType.args ||
        receiverType.args.length === 0 ||
        targetGenericParamNames.length === 0
    ) {
        return fnType;
    }
    const genericSet = new Set(implGenericNames);
    const bindings = new Map();
    const count = Math.min(targetGenericParamNames.length, receiverType.args.length);
    for (let i = 0; i < count; i++) {
        const genericName = targetGenericParamNames[i];
        if (!genericName || !genericSet.has(genericName)) continue;
        bindings.set(genericName, receiverType.args[i]);
    }
    if (bindings.size === 0) {
        return fnType;
    }
    return /** @type {FnType} */ (
        substituteGenericTypeBindings(
            ctx,
            fnType,
            genericSet,
            bindings,
            false,
        )
    );
}

/**
 * @param {number} width
 * @returns {string}
 */
function intWidthToName(width) {
    switch (width) {
        case IntWidth.I8: return "i8";
        case IntWidth.I16: return "i16";
        case IntWidth.I32: return "i32";
        case IntWidth.I64: return "i64";
        case IntWidth.I128: return "i128";
        case IntWidth.Isize: return "isize";
        case IntWidth.U8: return "u8";
        case IntWidth.U16: return "u16";
        case IntWidth.U32: return "u32";
        case IntWidth.U64: return "u64";
        case IntWidth.U128: return "u128";
        case IntWidth.Usize: return "usize";
        default: return "unknown_int";
    }
}

/**
 * @param {number} width
 * @returns {string}
 */
function floatWidthToName(width) {
    switch (width) {
        case FloatWidth.F32: return "f32";
        case FloatWidth.F64: return "f64";
        default: return "unknown_float";
    }
}

/**
 * @param {TypeContext} ctx
 * @param {Node} typeNode
 * @returns {InferenceResult}
 */
function resolveImplTargetType(ctx, typeNode) {
    const tyResult = resolveTypeNode(ctx, typeNode);
    if (!tyResult.ok) return tyResult;
    const resolved = ctx.resolveType(tyResult.type);
    if (resolved.kind === TypeKind.Named) {
        const decl = ctx.lookupItem(resolved.name);
        if (!decl && !resolveBuiltinType(resolved.name)) {
            return err(
                `impl target must resolve to a known type: ${resolved.name}`,
                typeNode?.span,
            );
        }
    }
    const key = typeKeyForMethodLookup(tyResult.type);
    if (!key) {
        return err("impl target must be a concrete named/builtin type", typeNode?.span);
    }
    return ok(tyResult.type);
}

// ============================================================================
// Task 4.1: Inference Entry Point
// ============================================================================

/**
 * Infer types for a module
 * @param {TypeContext} ctx
 * @param {Node} module
 * @returns {{ ok: boolean, errors?: TypeError[] }}
 */
function inferModule(ctx, module) {
    // Task 4.2: Declaration Gathering Pass
    const gatherResult = gatherDeclarations(ctx, module);
    if (!gatherResult.ok) {
        return { ok: false, errors: gatherResult.errors };
    }

    // Check all function bodies
    const checkResult = checkModuleItems(ctx, module);
    if (!checkResult.ok) {
        return { ok: false, errors: checkResult.errors };
    }

    // Task 4.11: Inference Finalization
    const finalizeResult = finalizeInference(ctx);
    if (!finalizeResult.ok) {
        return { ok: false, errors: finalizeResult.errors };
    }

    return { ok: true };
}

// ============================================================================
// Task 4.2: Declaration Gathering Pass
// ============================================================================

/**
 * Gather all declarations in a module
 * @param {TypeContext} ctx
 * @param {Node} module
 * @returns {{ ok: boolean, errors?: TypeError[] }}
 */
function gatherDeclarations(ctx, module) {
    const errors = [];

    for (const item of module.items || []) {
        const result = gatherDeclaration(ctx, item);
        if (!result.ok) {
            errors.push(...(result.errors || []));
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true };
}

/**
 * Gather a single declaration
 * @param {TypeContext} ctx
 * @param {Node} item
 * @returns {{ ok: boolean, errors?: TypeError[] }}
 */
function gatherDeclaration(ctx, item) {
    switch (item.kind) {
        case NodeKind.FnItem: {
            const genericConstraintErrors = collectUnsupportedGenericConstraintErrors(item);
            if (genericConstraintErrors.length > 0) {
                return { ok: false, errors: genericConstraintErrors };
            }
            let pushedSelf = false;
            if (item.implTargetName && !ctx.currentImplSelfType()) {
                const builtinSelf = resolveBuiltinType(item.implTargetName);
                ctx.pushImplSelfType(
                    builtinSelf || makeStructType(item.implTargetName, [], item.span),
                );
                pushedSelf = true;
            }
            const typeResult = inferFnSignature(ctx, item);
            if (pushedSelf) {
                ctx.popImplSelfType();
            }
            if (!typeResult.ok) return typeResult;
            const registerResult = ctx.registerFn(
                item.name,
                item,
                typeResult.type,
            );
            if (!registerResult.ok) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            registerResult.error ||
                            "Failed to register function",
                            item.span,
                        ),
                    ],
                };
            }
            if (item.implTargetName && item.unqualifiedName) {
                const registerMethodResult = ctx.registerMethod(
                    item.implTargetName,
                    item.unqualifiedName,
                    item,
                    typeResult.type,
                    { receiver: item.params?.[0]?.receiverKind || null },
                );
                if (!registerMethodResult.ok) {
                    return {
                        ok: false,
                        errors: [
                            makeTypeError(
                                registerMethodResult.error ||
                                "Failed to register method",
                                item.span,
                            ),
                        ],
                    };
                }
            }
            return { ok: true };
        }

        case NodeKind.StructItem: {
            const registerResult = ctx.registerStruct(item.name, item);
            if (!registerResult.ok) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            registerResult.error || "Failed to register struct",
                            item.span,
                        ),
                    ],
                };
            }
            return { ok: true };
        }

        case NodeKind.EnumItem: {
            const registerResult = ctx.registerEnum(item.name, item);
            if (!registerResult.ok) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            registerResult.error || "Failed to register enum",
                            item.span,
                        ),
                    ],
                };
            }
            return { ok: true };
        }

        case NodeKind.TraitItem: {
            const traitErrors = [];
            for (const method of item.methods || []) {
                traitErrors.push(...collectUnsupportedGenericConstraintErrors(method));
            }
            if (traitErrors.length > 0) {
                return { ok: false, errors: traitErrors };
            }
            const registerResult = ctx.registerTrait(item.name, item);
            if (!registerResult.ok) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            registerResult.error || "Failed to register trait",
                            item.span,
                        ),
                    ],
                };
            }
            return { ok: true };
        }

        case NodeKind.ModItem: {
            const registerResult = ctx.registerMod(item.name, item);
            if (!registerResult.ok) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            registerResult.error || "Failed to register module",
                            item.span,
                        ),
                    ],
                };
            }
            // Recursively gather declarations from inline modules
            if (item.isInline && item.items) {
                ctx.pushScope();
                const gatherResult = gatherDeclarations(ctx, item);
                ctx.popScope();
                if (!gatherResult.ok) return gatherResult;
            }
            return { ok: true };
        }

        case NodeKind.UseItem:
            return { ok: true };

        case NodeKind.ImplItem: {
            const targetResult = resolveImplTargetType(ctx, item.targetType);
            if (!targetResult.ok) {
                return targetResult;
            }
            const targetType = targetResult.type;
            const targetName = typeKeyForMethodLookup(targetType);
            if (!targetName) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError("impl target must be concrete", item.span),
                    ],
                };
            }
            const errors = [];
            const isTraitImpl = !!item.traitType;
            const implGenericNames = (item.genericParams || []).map(
                (/** @type {{ name?: string }} */ p) => p.name || "",
            ).filter((/** @type {string} */ name) => name.length > 0);
            const targetGenericParamNames = extractTypeNodeGenericParamNames(item.targetType);

            /** @type {Map<string, Node>} */
            const implMethodsByName = new Map();
            for (const method of item.methods || []) {
                errors.push(...collectUnsupportedGenericConstraintErrors(method));
                if (implMethodsByName.has(method.name)) {
                    errors.push(
                        makeTypeError(
                            `Duplicate method in impl block: ${method.name}`,
                            method.span,
                        ),
                    );
                    continue;
                }
                implMethodsByName.set(method.name, method);
            }

            /** @type {Map<string, Node> | null} */
            let traitMethodsByName = null;
            let traitName = null;
            if (isTraitImpl) {
                traitName = item.traitType?.name || null;
                if (!traitName) {
                    errors.push(makeTypeError("Trait impl must name a trait", item.span));
                } else {
                    const traitDecl = ctx.lookupTrait(traitName);
                    if (!traitDecl) {
                        errors.push(
                            makeTypeError(`Unknown trait: ${traitName}`, item.span),
                        );
                    } else {
                        traitMethodsByName = new Map(
                            (traitDecl.node.methods || []).map((/** @type {Node} */ m) => [m.name, m]),
                        );
                        const implRegisterResult = ctx.registerTraitImpl(traitName, targetName);
                        if (!implRegisterResult.ok) {
                            errors.push(
                                makeTypeError(
                                    implRegisterResult.error ||
                                    "Duplicate trait impl",
                                    item.span,
                                ),
                            );
                        }
                    }
                }
            }

            ctx.pushImplSelfType(targetType);
            if (traitMethodsByName) {
                for (const [traitMethodName, traitMethod] of traitMethodsByName.entries()) {
                    const implMethod = implMethodsByName.get(traitMethodName);
                    if (!implMethod) {
                        errors.push(
                            makeTypeError(
                                `Trait method not implemented: ${traitMethodName}`,
                                item.span,
                            ),
                        );
                        continue;
                    }
                    const traitSig = inferFnSignature(ctx, traitMethod);
                    const implSig = inferFnSignature(ctx, implMethod);
                    if (!traitSig.ok) {
                        errors.push(...(traitSig.errors || []));
                        continue;
                    }
                    if (!implSig.ok) {
                        errors.push(...(implSig.errors || []));
                        continue;
                    }
                    if (!typeEquals(traitSig.type, implSig.type)) {
                        errors.push(
                            makeTypeError(
                                `Method signature mismatch for ${traitMethodName}: expected ${typeToString(traitSig.type)} got ${typeToString(implSig.type)}`,
                                implMethod.span,
                            ),
                        );
                    }
                }
                for (const [implMethodName, implMethod] of implMethodsByName.entries()) {
                    if (!traitMethodsByName.has(implMethodName)) {
                        errors.push(
                            makeTypeError(
                                `Method not in trait ${traitName}: ${implMethodName}`,
                                implMethod.span,
                            ),
                        );
                    }
                }
            }

            for (const method of item.methods || []) {
                const typeResult = inferFnSignature(ctx, method);
                if (!typeResult.ok) {
                    errors.push(...(typeResult.errors || []));
                    continue;
                }
                const symbolName = isTraitImpl
                    ? `${targetName}::<${traitName || "unknown"}>::${method.name}`
                    : `${targetName}::${method.name}`;
                const registerFnResult = ctx.registerFn(
                    symbolName,
                    method,
                    typeResult.type,
                );
                if (!registerFnResult.ok) {
                    errors.push(
                        makeTypeError(
                            registerFnResult.error ||
                            "Failed to register impl method",
                            method.span,
                        ),
                    );
                    continue;
                }
                if (isTraitImpl) {
                    const registerTraitMethodResult = ctx.registerTraitMethod(
                        targetName,
                        traitName || "unknown",
                        method.name,
                        method,
                        typeResult.type,
                        {
                            receiver: method.params?.[0]?.receiverKind || null,
                            implGenericNames,
                            targetGenericParamNames,
                            targetTypeName: targetName,
                        },
                    );
                    if (!registerTraitMethodResult.ok) {
                        errors.push(
                            makeTypeError(
                                registerTraitMethodResult.error ||
                                "Failed to register trait impl method",
                                method.span,
                            ),
                        );
                    }
                } else {
                    const registerMethodResult = ctx.registerMethod(
                        targetName,
                        method.name,
                        method,
                        typeResult.type,
                        {
                            receiver: method.params?.[0]?.receiverKind || null,
                            implGenericNames,
                            targetGenericParamNames,
                            targetTypeName: targetName,
                        },
                    );
                    if (!registerMethodResult.ok) {
                        errors.push(
                            makeTypeError(
                                registerMethodResult.error ||
                                "Failed to register impl method",
                                method.span,
                            ),
                        );
                    }
                }
            }
            ctx.popImplSelfType();
            if (errors.length > 0) {
                return { ok: false, errors };
            }
            return { ok: true };
        }

        default:
            return { ok: true };
    }
}

/**
 * Infer function signature type
 * @param {TypeContext} ctx
 * @param {Node} fnItem
 * @returns {InferenceResult}
 */
function inferFnSignature(ctx, fnItem) {
    const paramTypes = [];

    for (const param of fnItem.params || []) {
        if (param.ty) {
            const typeResult = resolveTypeNode(ctx, param.ty);
            if (!typeResult.ok) return typeResult;
            paramTypes.push(typeResult.type);
        } else {
            // No type annotation - create type variable
            paramTypes.push(ctx.freshTypeVar());
        }
    }

    let returnType;
    if (fnItem.returnType) {
        const result = resolveTypeNode(ctx, fnItem.returnType);
        if (!result.ok) return result;
        returnType = result.type;
    } else {
        // No return type annotation - default to unit
        returnType = makeUnitType();
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
 * @param {TypeContext} ctx
 * @param {Node} typeNode
 * @returns {InferenceResult}
 */
function resolveTypeNode(ctx, typeNode) {
    switch (typeNode.kind) {
        case NodeKind.NamedType: {
            if (typeNode.name === "Self") {
                const selfType = ctx.currentImplSelfType();
                if (selfType) {
                    return ok(selfType);
                }
            }
            /** @type {Type[] | null} */
            let args = null;
            if (typeNode.args && typeNode.args.args) {
                const argsResult = combineResults(
                    typeNode.args.args.map((/** @type {Node} */ a) => resolveTypeNode(ctx, a)),
                );
                if (!argsResult.ok) {
                    return { ok: false, errors: argsResult.errors };
                }
                args = argsResult.types;
            }
            // Check for builtin types
            const builtin = resolveBuiltinType(typeNode.name);
            if (builtin) {
                return ok(builtin);
            }

            // Check for user-defined types
            const item = ctx.lookupItem(typeNode.name);
            if (item) {
                if (item.kind === "struct") {
                    if (args && args.length > 0) {
                        return ok(makeNamedType(typeNode.name, args, typeNode.span));
                    }
                    return ok(makeStructType(typeNode.name, [], typeNode.span));
                }
                if (item.kind === "enum") {
                    if (args && args.length > 0) {
                        return ok(makeNamedType(typeNode.name, args, typeNode.span));
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
                (typeNode.elements || []).map((/** @type {Node} */ e) => resolveTypeNode(ctx, e)),
            );
            if (!elementsResult.ok) {
                return { ok: false, errors: elementsResult.errors };
            }
            return ok(makeTupleType(elementsResult.types, typeNode.span));
        }

        case NodeKind.ArrayType: {
            const elementResult = resolveTypeNode(ctx, typeNode.element);
            if (!elementResult.ok) return elementResult;
            // Length is optional for inference purposes
            const length = typeNode.length ? 0 : 0; // TODO: evaluate constant expression
            return ok(makeArrayType(elementResult.type, length, typeNode.span));
        }

        case NodeKind.RefType: {
            const innerResult = resolveTypeNode(ctx, typeNode.inner);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            if (!mutable && innerResult.type.kind === TypeKind.String) {
                return ok(innerResult.type);
            }
            return ok(makeRefType(innerResult.type, mutable, typeNode.span));
        }

        case NodeKind.PtrType: {
            const innerResult = resolveTypeNode(ctx, typeNode.inner);
            if (!innerResult.ok) return innerResult;
            const mutable = typeNode.mutability === Mutability.Mutable;
            return ok(makePtrType(innerResult.type, mutable, typeNode.span));
        }

        case NodeKind.FnType: {
            const paramsResult = combineResults(
                (typeNode.params || []).map((/** @type {Node} */ p) => resolveTypeNode(ctx, p)),
            );
            if (!paramsResult.ok) {
                return { ok: false, errors: paramsResult.errors };
            }
            let returnType = makeUnitType();
            if (typeNode.returnType) {
                const returnResult = resolveTypeNode(ctx, typeNode.returnType);
                if (!returnResult.ok) return returnResult;
                returnType = returnResult.type;
            }
            return ok(
                makeFnType(
                    paramsResult.types,
                    returnType,
                    typeNode.isUnsafe || false,
                    typeNode.isConst || false,
                    typeNode.span,
                ),
            );
        }

        default:
            return err(
                `Unknown type node kind: ${typeNode.kind}`,
                typeNode.span,
            );
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
            return makeIntType(IntWidth.I8);
        case "i16":
            return makeIntType(IntWidth.I16);
        case "i32":
            return makeIntType(IntWidth.I32);
        case "i64":
            return makeIntType(IntWidth.I64);
        case "i128":
            return makeIntType(IntWidth.I128);
        case "isize":
            return makeIntType(IntWidth.Isize);
        case "u8":
            return makeIntType(IntWidth.U8);
        case "u16":
            return makeIntType(IntWidth.U16);
        case "u32":
            return makeIntType(IntWidth.U32);
        case "u64":
            return makeIntType(IntWidth.U64);
        case "u128":
            return makeIntType(IntWidth.U128);
        case "usize":
            return makeIntType(IntWidth.Usize);
        case "f32":
            return makeFloatType(FloatWidth.F32);
        case "f64":
            return makeFloatType(FloatWidth.F64);
        case "bool":
            return makeBoolType();
        case "char":
            return makeCharType();
        case "str":
            return makeStringType();
        case "()":
            return makeUnitType();
        case "!":
            return makeNeverType();
        default:
            return null;
    }
}

/**
 * Check whether a type is copyable in the current type context.
 * @param {TypeContext} ctx
 * @param {Type} ty
 * @param {Set<string>} [visiting]
 * @returns {boolean}
 */
function isCopyableInContext(ctx, ty, visiting = new Set()) {
    return isCopyableType(ty, {
        resolveType: (/** @type {Type} */ t) => ctx.resolveType(t),
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

/**
 * Check all items in a module
 * @param {TypeContext} ctx
 * @param {Node} module
 * @returns {CheckResult}
 */
function checkModuleItems(ctx, module) {
    const errors = [];

    for (const item of module.items || []) {
        const result = checkItem(ctx, item);
        if (!result.ok) {
            errors.push(...(result.errors || []));
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true };
}

/** @typedef {{ ok: true } | { ok: false, errors: TypeError[] }} CheckResult */

/**
 * Check a single item
 * @param {TypeContext} ctx
 * @param {Node} item
 * @returns {CheckResult}
 */
function checkItem(ctx, item) {
    switch (item.kind) {
        case NodeKind.FnItem:
            return checkFnItem(ctx, item);

        case NodeKind.ImplItem: {
            const targetResult = resolveImplTargetType(ctx, item.targetType);
            if (!targetResult.ok) {
                return { ok: false, errors: targetResult.errors || [] };
            }
            const targetType = targetResult.type;
            const targetName = typeKeyForMethodLookup(targetType) || "unknown";
            const traitName = item.traitType?.name || null;
            ctx.pushImplSelfType(targetType);
            const result = checkModuleItems(ctx, {
                kind: NodeKind.Module,
                span: item.span,
                items: (item.methods || []).map((/** @type {Node} */ method) => ({
                    ...method,
                    kind: NodeKind.FnItem,
                    name: traitName
                        ? `${targetName}::<${traitName}>::${method.name}`
                        : `${targetName}::${method.name}`,
                    implTargetName: targetName,
                })),
            });
            ctx.popImplSelfType();
            return result;
        }

        case NodeKind.TraitItem:
            return { ok: true };

        case NodeKind.ModItem:
            if (item.isInline && item.items) {
                ctx.pushScope();
                const result = checkModuleItems(ctx, item);
                ctx.popScope();
                return result;
            }
            return { ok: true };

        default:
            return { ok: true };
    }
}

// ============================================================================
// Task 4.6: Function Body Checking
// ============================================================================

/**
 * Check a function item
 * @param {TypeContext} ctx
 * @param {Node} fnItem
 * @returns {CheckResult}
 */
function checkFnItem(ctx, fnItem) {
    const itemDecl = ctx.lookupItem(fnItem.name);
    if (!itemDecl || !itemDecl.type) {
        return {
            ok: false,
            errors: [
                makeTypeError(
                    `Function ${fnItem.name} not found in context`,
                    fnItem.span,
                ),
            ],
        };
    }

    const fnType = /** @type {FnType} */ (itemDecl.type);
    let pushedSelf = false;
    if (fnItem.implTargetName && !ctx.currentImplSelfType()) {
        const builtinSelf = resolveBuiltinType(fnItem.implTargetName);
        ctx.pushImplSelfType(
            builtinSelf || makeStructType(fnItem.implTargetName, [], fnItem.span),
        );
        pushedSelf = true;
    }
    ctx.pushScope();

    // Set current function context
    ctx.setCurrentFn(fnType, fnType.returnType);

    // Bind parameters
    for (let i = 0; i < fnItem.params.length; i++) {
        const param = fnItem.params[i];
        const paramType = fnType.params[i];
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
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            defineResult.error || "Failed to define parameter",
                            param.span,
                        ),
                    ],
                };
            }
        }
    }

    // Check function body
    /** @type {TypeError[]} */
    let errors = [];
    if (fnItem.body) {
        const bodyResult = inferExpr(ctx, fnItem.body);
        if (!bodyResult.ok) {
            errors = bodyResult.errors || [];
        } else {
            // Unify body type with return type
            const unifyResult = unify(ctx, bodyResult.type, fnType.returnType);
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
        return { ok: false, errors };
    }
    return { ok: true };
}

/**
 * Infer the type of an expression
 * @param {TypeContext} ctx
 * @param {Node} expr
 * @param {Type} [expectedType=null]
 * @returns {InferenceResult}
 */
function inferExpr(ctx, expr, expectedType = undefined) {
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
            return inferMatch(ctx, expr);

        case NodeKind.BlockExpr:
            return inferBlock(ctx, expr);

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
            return inferStructExpr(ctx, expr);

        case NodeKind.RangeExpr:
            return inferRange(ctx, expr);

        case NodeKind.RefExpr:
            return inferRef(ctx, expr);

        case NodeKind.DerefExpr:
            return inferDeref(ctx, expr);

        case NodeKind.MacroExpr:
            return inferMacro(ctx, expr);

        case NodeKind.ClosureExpr:
            return inferClosure(ctx, expr, expectedType);

        default:
            return err(`Unknown expression kind: ${expr.kind}`, expr.span);
    }
}

/**
 * Infer literal type
 * @param {TypeContext} ctx
 * @param {Node} literal
 * @param {Type} [expectedType=null]
 * @returns {InferenceResult}
 */
function inferLiteral(ctx, literal, expectedType = undefined) {
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
            return err(
                `Unknown literal kind: ${literal.literalKind}`,
                literal.span,
            );
    }
}

/**
 * Infer identifier type
 * @param {TypeContext} ctx
 * @param {Node} ident
 * @returns {InferenceResult}
 */
function inferIdentifier(ctx, ident) {
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
            return err(
                "Capturing closures cannot escape; only direct calls are supported",
                ident.span,
            );
        }

        ident.isImplicitCopyCandidate = isCopyableInContext(ctx, binding.type);
        ident.closureInfo = binding.closureInfo || null;
        return ok(binding.type);
    }

    // Look up item (function, struct, enum)
    const lookupName = ident.resolvedItemName || ident.name;
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

    return err(`Unbound identifier: ${ident.name}`, ident.span);
}

/**
 * Infer binary expression type
 * @param {TypeContext} ctx
 * @param {Node} binary
 * @returns {InferenceResult}
 */
function inferBinary(ctx, binary) {
    const leftResult = inferExpr(ctx, binary.left);
    if (!leftResult.ok) return leftResult;

    const rightResult = inferExpr(ctx, binary.right);
    if (!rightResult.ok) return rightResult;

    const leftType = ctx.resolveType(leftResult.type);
    const rightType = ctx.resolveType(rightResult.type);
    let leftValueType = leftType;
    let rightValueType = rightType;
    while (
        leftValueType &&
        (leftValueType.kind === TypeKind.Ref || leftValueType.kind === TypeKind.Ptr)
    ) {
        leftValueType = ctx.resolveType(leftValueType.inner);
    }
    while (
        rightValueType &&
        (rightValueType.kind === TypeKind.Ref || rightValueType.kind === TypeKind.Ptr)
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
                return err(
                    `Expected numeric type, got ${typeToString(leftType)}`,
                    binary.left.span,
                );
            }
            if (
                !isNumericType(rightValueType) &&
                rightValueType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected numeric type, got ${typeToString(rightType)}`,
                    binary.right.span,
                );
            }

            // Unify operand types
            const unifyResult = unify(ctx, leftValueType, rightValueType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
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
                return { ok: false, errors: [unifyResult.error] };
            }
            return ok(makeBoolType(binary.span));
        }

        // Logical operators
        case BinaryOp.And:
        case BinaryOp.Or: {
            // Both operands must be bool
            const boolType = makeBoolType();
            const leftUnify = unify(ctx, leftType, boolType);
            if (!leftUnify.ok) {
                return { ok: false, errors: [leftUnify.error] };
            }
            const rightUnify = unify(ctx, rightType, boolType);
            if (!rightUnify.ok) {
                return { ok: false, errors: [rightUnify.error] };
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
                return err(
                    `Expected integer type, got ${typeToString(leftType)}`,
                    binary.left.span,
                );
            }
            if (
                !isIntegerType(rightValueType) &&
                rightValueType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected integer type, got ${typeToString(rightType)}`,
                    binary.right.span,
                );
            }

            const unifyResult = unify(ctx, leftValueType, rightValueType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }

            return ok(ctx.resolveType(leftValueType));
        }

        default:
            return err(`Unknown binary operator: ${binary.op}`, binary.span);
    }
}

/**
 * Infer unary expression type
 * @param {TypeContext} ctx
 * @param {Node} unary
 * @returns {InferenceResult}
 */
function inferUnary(ctx, unary) {
    const operandResult = inferExpr(ctx, unary.operand);
    if (!operandResult.ok) return operandResult;

    const operandType = ctx.resolveType(operandResult.type);

    switch (unary.op) {
        case UnaryOp.Not: {
            const boolType = makeBoolType();
            const unifyResult = unify(ctx, operandType, boolType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }
            return ok(makeBoolType(unary.span));
        }

        case UnaryOp.Neg: {
            if (
                !isNumericType(operandType) &&
                operandType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected numeric type, got ${typeToString(operandType)}`,
                    unary.operand.span,
                );
            }
            return ok(operandType);
        }

        case UnaryOp.Deref: {
            if (
                operandType.kind !== TypeKind.Ref &&
                operandType.kind !== TypeKind.Ptr &&
                operandType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Cannot dereference non-reference type: ${typeToString(operandType)}`,
                    unary.operand.span,
                );
            }
            if (operandType.kind === TypeKind.Ref) {
                return ok(operandType.inner);
            }
            if (operandType.kind === TypeKind.Ptr) {
                return ok(operandType.inner);
            }
            // Type variable - create a fresh type for inner
            const innerType = ctx.freshTypeVar();
            const refType = makeRefType(innerType, false);
            const unifyResult = unify(ctx, operandType, refType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }
            return ok(innerType);
        }

        case UnaryOp.Ref: {
            const innerResult = inferExpr(ctx, unary.operand);
            if (!innerResult.ok) return innerResult;
            const mutable = unary.mutability === Mutability.Mutable;
            return ok(makeRefType(innerResult.type, mutable, unary.span));
        }

        default:
            return err(`Unknown unary operator: ${unary.op}`, unary.span);
    }
}

/**
 * Infer function call type
 * @param {TypeContext} ctx
 * @param {Node} call
 * @returns {InferenceResult}
 */
function inferCall(ctx, call) {
    ctx.enterAllowCapturingClosureValue();
    const calleeResult =
        call.callee?.kind === NodeKind.FieldExpr
            ? inferField(ctx, call.callee, true)
            : inferExpr(ctx, call.callee);
    ctx.exitAllowCapturingClosureValue();
    if (!calleeResult.ok) return calleeResult;

    const calleeType = ctx.resolveType(calleeResult.type);
    const genericCalleeItem = lookupDirectFunctionItemForCall(ctx, call.callee);
    const genericNames = genericCalleeItem?.node?.generics || [];
    if (genericCalleeItem && genericNames.length > 0) {
        return inferGenericFunctionCall(ctx, call, genericCalleeItem);
    }
    if (call.typeArgs !== null) {
        return err(
            "Explicit generic call arguments are only supported on generic function items",
            call.span,
        );
    }

    // Check if callee is a function type
    if (
        calleeType.kind !== TypeKind.Fn &&
        calleeType.kind !== TypeKind.TypeVar
    ) {
        return err(
            `Cannot call non-function type: ${typeToString(calleeType)}`,
            call.callee.span,
        );
    }

    // Handle type variable callee
    if (calleeType.kind === TypeKind.TypeVar) {
        const returnType = ctx.freshTypeVar();
        const paramTypes = call.args.map(() => ctx.freshTypeVar());
        const expectedFnType = makeFnType(paramTypes, returnType, false, false);
        const unifyResult = unify(ctx, calleeType, expectedFnType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }

        // Infer arguments
        for (let i = 0; i < call.args.length; i++) {
            const argResult = inferExpr(ctx, call.args[i], paramTypes[i]);
            if (!argResult.ok) return argResult;
            const argUnify = unify(ctx, argResult.type, paramTypes[i]);
            if (!argUnify.ok) {
                return { ok: false, errors: [argUnify.error] };
            }
        }

        return ok(returnType);
    }

    // Check argument count
    if (call.args.length !== calleeType.params.length) {
        return err(
            `Function expects ${calleeType.params.length} arguments, got ${call.args.length}`,
            call.span,
        );
    }

    // Infer and check arguments
    for (let i = 0; i < call.args.length; i++) {
        const argResult = inferExpr(ctx, call.args[i], calleeType.params[i]);
        if (!argResult.ok) return argResult;
        const unifyResult = unify(ctx, argResult.type, calleeType.params[i]);
        if (!unifyResult.ok) {
            return {
                ok: false,
                errors: [
                    makeTypeError(
                        `Argument type mismatch: expected ${typeToString(calleeType.params[i])}, got ${typeToString(argResult.type)}`,
                        call.args[i]?.span || call.span,
                    ),
                ],
            };
        }
    }

    return ok(calleeType.returnType);
}

/**
 * Infer closure expression type.
 * @param {TypeContext} ctx
 * @param {Node} closure
 * @param {Type} [expectedType]
 * @returns {InferenceResult}
 */
function inferClosure(ctx, closure, expectedType = undefined) {
    if (closure.isMove) {
        return err("move closures are not supported yet", closure.span);
    }

    const expectedResolved = expectedType ? ctx.resolveType(expectedType) : null;
    const expectedFn =
        expectedResolved && expectedResolved.kind === TypeKind.Fn
            ? expectedResolved
            : null;

    const params = closure.params || [];
    if (expectedFn && expectedFn.params.length !== params.length) {
        return err(
            `Closure expects ${expectedFn.params.length} parameters, got ${params.length}`,
            closure.span,
        );
    }

    /** @type {TypeError[]} */
    const errors = [];
    /** @type {Type[]} */
    const paramTypes = [];
    /** @type {Type} */
    let returnType = makeUnitType(closure.span);

    ctx.pushScope();
    ctx.pushClosureCaptureTracker(ctx.currentScopeDepth());
    try {
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            /** @type {Type} */
            let paramType;
            if (param.ty) {
                const paramTypeResult = resolveTypeNode(ctx, param.ty);
                if (!paramTypeResult.ok) {
                    errors.push(...paramTypeResult.errors);
                    paramType = ctx.freshTypeVar();
                } else {
                    paramType = paramTypeResult.type;
                }
            } else if (expectedFn) {
                paramType = expectedFn.params[i];
            } else {
                paramType = ctx.freshTypeVar();
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
                    errors.push(
                        makeTypeError(
                            defineResult.error || "Failed to define closure parameter",
                            param.span,
                        ),
                    );
                }
            }
        }

        /** @type {Type | undefined} */
        let explicitReturnType = undefined;
        if (closure.returnType) {
            const returnTypeResult = resolveTypeNode(ctx, closure.returnType);
            if (!returnTypeResult.ok) {
                errors.push(...returnTypeResult.errors);
            } else {
                explicitReturnType = returnTypeResult.type;
            }
        }

        const bodyExpectedType = explicitReturnType || (expectedFn ? expectedFn.returnType : undefined);
        const bodyResult = inferExpr(ctx, closure.body, bodyExpectedType);
        if (!bodyResult.ok) {
            errors.push(...(bodyResult.errors || []));
        } else {
            returnType = bodyResult.type;
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
        const captures = [];
        for (const capture of captureMap.values()) {
            const captureType = ctx.resolveType(capture.type);
            const byRef = capture.mutable === true;
            if (!byRef && !isCopyableInContext(ctx, captureType)) {
                errors.push(
                    makeTypeError(
                        `Immutable closure capture requires Copy type: ${capture.name}`,
                        closure.span,
                    ),
                );
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
        paramTypes.map((/** @type {Type} */ t) => ctx.resolveType(t)),
        ctx.resolveType(returnType),
        false,
        false, // closures aren't currently parsed with `const`
        closure.span,
    );
    closure.inferredType = fnType;

    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return ok(fnType);
}

/**
 * Infer field access type
 * @param {TypeContext} ctx
 * @param {Node} field
 * @param {boolean} [preferMethod=false]
 * @returns {InferenceResult}
 */
function inferField(ctx, field, preferMethod = false) {
    const receiverResult = inferExpr(ctx, field.receiver);
    if (!receiverResult.ok) return receiverResult;

    const receiverType = ctx.resolveType(receiverResult.type);
    let accessType = receiverType;
    while (
        accessType &&
        (accessType.kind === TypeKind.Ref || accessType.kind === TypeKind.Ptr)
    ) {
        accessType = ctx.resolveType(accessType.inner);
    }
    const fieldName =
        typeof field.field === "string" ? field.field : field.field.name;
    /**
     * @param {FnType} fnType
     * @param {string} symbolName
     * @param {any} [meta]
     * @returns {InferenceResult}
     */
    function asBoundMethod(fnType, symbolName, meta = null) {
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
        const structType = /** @type {import("./types.js").StructType} */ (accessType);
        if (preferMethod) {
            const candidates = ctx.lookupMethodCandidates(structType.name, fieldName);
            if (candidates.inherent && candidates.inherent.type?.kind === TypeKind.Fn) {
                return asBoundMethod(
                    /** @type {FnType} */(candidates.inherent.type),
                    candidates.inherent.symbolName,
                    candidates.inherent.meta,
                );
            }
            if (candidates.traits.length === 1 && candidates.traits[0].type?.kind === TypeKind.Fn) {
                return asBoundMethod(
                    /** @type {FnType} */(candidates.traits[0].type),
                    candidates.traits[0].symbolName,
                    candidates.traits[0].meta,
                );
            }
        }
        const fieldDef = structType.fields.find((/** @type {any} */ f) => f.name === fieldName);
        if (fieldDef) {
            return ok(fieldDef.type);
        }

        // Some lowering paths keep struct names but omit field metadata.
        // Fall back to the declared item definition in type context.
        const item = ctx.lookupItem(structType.name);
        if (item && item.kind === "struct") {
            const structField = item.node.fields?.find(
                (/** @type {any} */ f) => f.name === fieldName,
            );
            if (structField) {
                if (structField.ty) {
                    return resolveTypeNode(ctx, structField.ty);
                }
                return ok(ctx.freshTypeVar());
            }
            const candidates = ctx.lookupMethodCandidates(structType.name, fieldName);
            if (candidates.inherent && candidates.inherent.type?.kind === TypeKind.Fn) {
                return asBoundMethod(
                    /** @type {FnType} */(candidates.inherent.type),
                    candidates.inherent.symbolName,
                    candidates.inherent.meta,
                );
            }
            if (candidates.traits.length === 1 && candidates.traits[0].type?.kind === TypeKind.Fn) {
                return asBoundMethod(
                    /** @type {FnType} */(candidates.traits[0].type),
                    candidates.traits[0].symbolName,
                    candidates.traits[0].meta,
                );
            }
            if (candidates.traits.length > 1) {
                const traitNames = candidates.traits.map((c) => c.traitName).join(", ");
                return err(
                    `Ambiguous trait method '${fieldName}' for ${structType.name}; candidates: ${traitNames}`,
                    field.span,
                );
            }
        }

        return err(
            `Field '${fieldName}' not found in struct ${structType.name}`,
            field.span,
        );
    }

    // Handle named type (unresolved struct)
    if (accessType.kind === TypeKind.Named) {
        const namedType = /** @type {import("./types.js").NamedType} */ (accessType);
        const item = ctx.lookupItem(namedType.name);
        if (item && item.kind === "struct") {
            if (preferMethod) {
                const candidates = ctx.lookupMethodCandidates(namedType.name, fieldName);
                if (candidates.inherent && candidates.inherent.type?.kind === TypeKind.Fn) {
                    return asBoundMethod(
                        /** @type {FnType} */(candidates.inherent.type),
                        candidates.inherent.symbolName,
                        candidates.inherent.meta,
                    );
                }
                if (candidates.traits.length === 1 && candidates.traits[0].type?.kind === TypeKind.Fn) {
                    return asBoundMethod(
                        /** @type {FnType} */(candidates.traits[0].type),
                        candidates.traits[0].symbolName,
                        candidates.traits[0].meta,
                    );
                }
            }
            const structField = item.node.fields?.find(
                (/** @type {any} */ f) => f.name === fieldName,
            );
            if (!structField) {
                const candidates = ctx.lookupMethodCandidates(namedType.name, fieldName);
                if (candidates.inherent && candidates.inherent.type?.kind === TypeKind.Fn) {
                    return asBoundMethod(
                        /** @type {FnType} */(candidates.inherent.type),
                        candidates.inherent.symbolName,
                        candidates.inherent.meta,
                    );
                }
                if (candidates.traits.length === 1 && candidates.traits[0].type?.kind === TypeKind.Fn) {
                    return asBoundMethod(
                        /** @type {FnType} */(candidates.traits[0].type),
                        candidates.traits[0].symbolName,
                        candidates.traits[0].meta,
                    );
                }
                if (candidates.traits.length > 1) {
                    const traitNames = candidates.traits.map((c) => c.traitName).join(", ");
                    return err(
                        `Ambiguous trait method '${fieldName}' for ${namedType.name}; candidates: ${traitNames}`,
                        field.span,
                    );
                }
                return err(
                    `Field '${fieldName}' not found in struct ${namedType.name}`,
                    field.span,
                );
            }
            if (structField.ty) {
                return resolveTypeNode(ctx, structField.ty);
            }
            return ok(ctx.freshTypeVar());
        }
    }

    const typeKey = typeKeyForMethodLookup(accessType);
    if (typeKey) {
        const candidates = ctx.lookupMethodCandidates(typeKey, fieldName);
        if (candidates.inherent && candidates.inherent.type?.kind === TypeKind.Fn) {
            return asBoundMethod(
                /** @type {FnType} */(candidates.inherent.type),
                candidates.inherent.symbolName,
                candidates.inherent.meta,
            );
        }
        if (candidates.traits.length === 1 && candidates.traits[0].type?.kind === TypeKind.Fn) {
            return asBoundMethod(
                /** @type {FnType} */(candidates.traits[0].type),
                candidates.traits[0].symbolName,
                candidates.traits[0].meta,
            );
        }
        if (candidates.traits.length > 1) {
            const traitNames = candidates.traits.map((c) => c.traitName).join(", ");
            return err(
                `Ambiguous trait method '${fieldName}' for ${typeKey}; candidates: ${traitNames}`,
                field.span,
            );
        }
    }

    // Handle tuple field access (numeric index)
    if (accessType.kind === TypeKind.Tuple) {
        const tupleType = /** @type {import("./types.js").TupleType} */ (accessType);
        const index =
            typeof field.field === "number"
                ? field.field
                : parseInt(field.field.name, 10);
        if (
            isNaN(index) ||
            index < 0 ||
            index >= tupleType.elements.length
        ) {
            return err(`Tuple index out of bounds: ${field.field}`, field.span);
        }
        return ok(tupleType.elements[index]);
    }

    // Type variable - might be a struct
    if (accessType.kind === TypeKind.TypeVar) {
        const fieldType = ctx.freshTypeVar();
        // We'll need to constrain this later when we know more about the receiver
        return ok(fieldType);
    }

    return err(
        `Cannot access field on type: ${typeToString(receiverType)}`,
        field.span,
    );
}

/**
 * Infer index expression type
 * @param {TypeContext} ctx
 * @param {Node} index
 * @returns {InferenceResult}
 */
function inferIndex(ctx, index) {
    const receiverResult = inferExpr(ctx, index.receiver);
    if (!receiverResult.ok) return receiverResult;

    const indexResult = inferExpr(ctx, index.index);
    if (!indexResult.ok) return indexResult;

    const receiverType = ctx.resolveType(receiverResult.type);
    const indexType = ctx.resolveType(indexResult.type);

    // Index must be integer
    const intType = makeIntType(IntWidth.I32);
    const indexUnify = unify(ctx, indexType, intType);
    if (!indexUnify.ok) {
        return { ok: false, errors: [indexUnify.error] };
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
        return ok(makeOptionType(vecElementType, index.span));
    }

    // Type variable
    if (receiverType.kind === TypeKind.TypeVar) {
        const elementType = ctx.freshTypeVar();
        const sliceType = makeSliceType(elementType);
        const unifyResult = unify(ctx, receiverType, sliceType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }
        return ok(elementType);
    }

    return err(`Cannot index type: ${typeToString(receiverType)}`, index.span);
}

/**
 * Infer assignment expression type
 * @param {TypeContext} ctx
 * @param {Node} assign
 * @returns {InferenceResult}
 */
function inferAssign(ctx, assign) {
    const targetResult = inferExpr(ctx, assign.target);
    if (!targetResult.ok) return targetResult;

    const valueResult = inferExpr(ctx, assign.value);
    if (!valueResult.ok) return valueResult;

    const targetType = ctx.resolveType(targetResult.type);
    const valueType = ctx.resolveType(valueResult.type);

    let assignTargetType = targetType;
    if (targetType.kind === TypeKind.Ref && targetType.mutable === true) {
        assignTargetType = targetType.inner;
    }

    const unifyResult = unify(ctx, assignTargetType, valueType);
    if (!unifyResult.ok) {
        return { ok: false, errors: [unifyResult.error] };
    }

    return ok(makeUnitType(assign.span));
}

// ============================================================================
// Task 4.4: Control Flow Inference
// ============================================================================

/**
 * Infer if expression type
 * @param {TypeContext} ctx
 * @param {Node} ifExpr
 * @returns {InferenceResult}
 */
function inferIf(ctx, ifExpr) {
    const condResult = inferExpr(ctx, ifExpr.condition);
    if (!condResult.ok) return condResult;

    // Condition must be bool
    const boolType = makeBoolType();
    const condUnify = unify(ctx, condResult.type, boolType);
    if (!condUnify.ok) {
        return { ok: false, errors: [condUnify.error] };
    }

    const thenResult = inferExpr(ctx, ifExpr.thenBranch);
    if (!thenResult.ok) return thenResult;

    if (ifExpr.elseBranch) {
        const elseResult = inferExpr(ctx, ifExpr.elseBranch);
        if (!elseResult.ok) return elseResult;

        // Both branches must unify
        const unifyResult = unify(ctx, thenResult.type, elseResult.type);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }

        return ok(ctx.resolveType(thenResult.type));
    }

    // Without else branch, type is unit
    const unitUnify = unify(ctx, thenResult.type, makeUnitType());
    if (!unitUnify.ok) {
        return { ok: false, errors: [unitUnify.error] };
    }

    return ok(makeUnitType(ifExpr.span));
}

/**
 * Infer match expression type
 * @param {TypeContext} ctx
 * @param {Node} matchExpr
 * @returns {InferenceResult}
 */
function inferMatch(ctx, matchExpr) {
    const scrutineeResult = inferExpr(ctx, matchExpr.scrutinee);
    if (!scrutineeResult.ok) return scrutineeResult;

    const scrutineeType = ctx.resolveType(scrutineeResult.type);

    if (!matchExpr.arms || matchExpr.arms.length === 0) {
        return ok(makeUnitType(matchExpr.span));
    }

    /** @type {Type | null} */
    let resultType = null;
    /** @type {TypeError[]} */
    const errors = [];

    for (const arm of matchExpr.arms) {
        ctx.pushScope();

        // Check pattern
        const patResult = checkPattern(ctx, arm.pat, scrutineeType);
        if (!patResult.ok) {
            errors.push(...patResult.errors);
        }

        // Check guard
        if (arm.guard) {
            const guardResult = inferExpr(ctx, arm.guard);
            if (!guardResult.ok) {
                errors.push(...guardResult.errors);
            } else {
                const guardUnify = unify(ctx, guardResult.type, makeBoolType());
                if (!guardUnify.ok) {
                    errors.push(guardUnify.error);
                }
            }
        }

        // Infer body
        const bodyResult = inferExpr(ctx, arm.body);
        if (!bodyResult.ok) {
            errors.push(...bodyResult.errors);
        } else if (resultType === null) {
            resultType = bodyResult.type;
        } else {
            const unifyResult = unify(ctx, resultType, bodyResult.type);
            if (!unifyResult.ok) {
                errors.push(unifyResult.error);
            }
        }

        ctx.popScope();
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return ok(resultType || makeUnitType(matchExpr.span));
}

/**
 * Infer block expression type
 * @param {TypeContext} ctx
 * @param {Node} block
 * @returns {InferenceResult}
 */
function inferBlock(ctx, block) {
    ctx.pushScope();

    /** @type {TypeError[]} */
    const errors = [];
    let diverges = false;
    /** @type {Type | null} */
    let neverType = null;

    // Check statements
    for (const stmt of block.stmts || []) {
        const result = checkStmt(ctx, stmt);
        if (!result.ok) {
            errors.push(...result.errors);
        } else if (result.type && result.type.kind === TypeKind.Never) {
            diverges = true;
            neverType = result.type;
        }
    }

    // Final expression determines block type
    let resultType = makeUnitType(block.span);
    if (block.expr) {
        const exprResult = inferExpr(ctx, block.expr);
        if (!exprResult.ok) {
            errors.push(...exprResult.errors);
        } else {
            resultType = exprResult.type;
            if (resultType.kind === TypeKind.Never) {
                diverges = true;
                neverType = resultType;
            }
        }
    }

    ctx.popScope();

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return ok(diverges && neverType ? neverType : resultType);
}

/**
 * Infer loop expression type
 * @param {TypeContext} ctx
 * @param {Node} loopExpr
 * @returns {InferenceResult}
 */
function inferLoop(ctx, loopExpr) {
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

/**
 * Infer while expression type
 * @param {TypeContext} ctx
 * @param {Node} whileExpr
 * @returns {InferenceResult}
 */
function inferWhile(ctx, whileExpr) {
    const condResult = inferExpr(ctx, whileExpr.condition);
    if (!condResult.ok) return condResult;

    // Condition must be bool
    const boolType = makeBoolType();
    const condUnify = unify(ctx, condResult.type, boolType);
    if (!condUnify.ok) {
        return { ok: false, errors: [condUnify.error] };
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

/**
 * Infer for expression type
 * @param {TypeContext} ctx
 * @param {Node} forExpr
 * @returns {InferenceResult}
 */
function inferFor(ctx, forExpr) {
    const iterResult = inferExpr(ctx, forExpr.iter);
    if (!iterResult.ok) return iterResult;

    ctx.enterLoop(false, null);
    ctx.pushScope();

    // Bind pattern variable
    const patResult = inferPattern(ctx, forExpr.pat);
    if (!patResult.ok) {
        ctx.popScope();
        ctx.exitLoop();
        return patResult;
    }

    // TODO: Check that iterator is iterable

    const bodyResult = inferExpr(ctx, forExpr.body);
    ctx.popScope();
    ctx.exitLoop();

    if (!bodyResult.ok) return bodyResult;

    // For always returns unit
    return ok(makeUnitType(forExpr.span));
}

/**
 * Infer return expression type
 * @param {TypeContext} ctx
 * @param {Node} returnExpr
 * @returns {InferenceResult}
 */
function inferReturn(ctx, returnExpr) {
    const returnType = ctx.getCurrentReturnType();
    if (!returnType) {
        return err("Return statement outside of function", returnExpr.span);
    }

    if (returnExpr.value) {
        const valueResult = inferExpr(ctx, returnExpr.value, returnType);
        if (!valueResult.ok) return valueResult;

        const unifyResult = unify(ctx, valueResult.type, returnType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }
    } else {
        // Return without value must return unit
        const unifyResult = unify(ctx, makeUnitType(), returnType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }
    }

    return ok(makeNeverType(returnExpr.span));
}

/**
 * Infer break expression type
 * @param {TypeContext} ctx
 * @param {Node} breakExpr
 * @returns {InferenceResult}
 */
function inferBreak(ctx, breakExpr) {
    const loopCtx = ctx.currentLoop();
    if (!loopCtx) {
        return err("Break outside of loop", breakExpr.span);
    }

    loopCtx.hasBreak = true;

    if (breakExpr.value) {
        if (!loopCtx.allowsBreakValue) {
            return err(
                "Break with value is only allowed in loop expressions",
                breakExpr.span,
            );
        }
        const valueResult = inferExpr(ctx, breakExpr.value);
        if (!valueResult.ok) return valueResult;

        if (!loopCtx.breakType) {
            loopCtx.breakType = valueResult.type;
        } else {
            const unifyResult = unify(ctx, valueResult.type, loopCtx.breakType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }
        }
    } else if (loopCtx.allowsBreakValue && loopCtx.breakType) {
        const unifyResult = unify(ctx, makeUnitType(), loopCtx.breakType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }
    } else if (loopCtx.allowsBreakValue) {
        loopCtx.breakType = makeUnitType();
    }

    return ok(makeNeverType(breakExpr.span));
}

/**
 * Infer continue expression type
 * @param {TypeContext} ctx
 * @param {Node} continueExpr
 * @returns {InferenceResult}
 */
function inferContinue(ctx, continueExpr) {
    const loopCtx = ctx.currentLoop();
    if (!loopCtx) {
        return err("Continue outside of loop", continueExpr.span);
    }

    return ok(makeNeverType(continueExpr.span));
}

/**
 * Infer path expression type
 * @param {TypeContext} ctx
 * @param {Node} pathExpr
 * @returns {InferenceResult}
 */
function inferPath(ctx, pathExpr) {
    if (!pathExpr.segments || pathExpr.segments.length === 0) {
        return err("Empty path expression", pathExpr.span);
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
        return err(`Unbound item: ${itemName}`, pathExpr.span);
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
            .map((/** @type {string} */ name) => name || "")
            .filter((/** @type {string} */ name) => name.length > 0);
        const enumGenericSet = new Set(enumGenericParams);
        const enumBindings = new Map(
            enumGenericParams.map((/** @type {string} */ name) => [name, ctx.freshTypeVar()]),
        );

        // Find the variant
        const variants = enumNode.variants || [];
        const variantIndex = variants.findIndex((/** @type {any} */ v) => v.name === variantName);
        if (variantIndex === -1) {
            return err(`Unknown variant: ${variantName}`, pathExpr.span);
        }

        const variant = variants[variantIndex];
        const variantFields = variant.fields || [];
        const enumType =
            enumGenericParams.length > 0
                ? makeNamedType(
                    itemName,
                    enumGenericParams.map((/** @type {string} */ name) =>
                        enumBindings.get(name) || ctx.freshTypeVar(),
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
                                fieldTyResult.type,
                                enumGenericSet,
                                enumBindings,
                            ),
                        );
                    } else {
                        fieldTypes.push(ctx.freshTypeVar());
                    }
                } else {
                    fieldTypes.push(ctx.freshTypeVar());
                }
            }

            // Return a function type: (field_types) -> EnumType
            return ok(makeFnType(fieldTypes, enumType, false, false, pathExpr.span));
        }

        // No fields - return the enum type directly
        return ok(enumType);
    }

    // Handle struct constructors: StructName::new or just StructName
    if (item.kind === "struct") {
        /** @type {import("./types.js").StructType} */
        const structType = {
            kind: TypeKind.Struct,
            name: itemName,
            fields: (item.node.fields || []).map((/** @type {any} */ f) => ({
                name: f.name,
                type: f.ty ? (resolveTypeNode(ctx, f.ty).ok ? /** @type {InferenceSuccess} */(resolveTypeNode(ctx, f.ty)).type : ctx.freshTypeVar()) : ctx.freshTypeVar(),
            })),
            span: pathExpr.span,
        };
        return ok(structType);
    }

    return err(`Qualified paths not yet supported for: ${itemName}`, pathExpr.span);
}

/**
 * Infer struct expression type
 * @param {TypeContext} ctx
 * @param {Node} structExpr
 * @returns {InferenceResult}
 */
function inferStructExpr(ctx, structExpr) {
    const pathResult = inferExpr(ctx, structExpr.path);
    if (!pathResult.ok) return pathResult;

    const structType = ctx.resolveType(pathResult.type);

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
                errors.push(...(valueResult.errors || []));
            } else {
                elementTypes.push(valueResult.type);
            }
        }

        if (errors.length > 0) {
            return { ok: false, errors };
        }

        return ok(makeTupleType(elementTypes, structExpr.span));
    }

    // Check that it's a struct
    if (
        structType.kind !== TypeKind.Struct &&
        structType.kind !== TypeKind.Named &&
        structType.kind !== TypeKind.TypeVar
    ) {
        return err(
            `Expected struct type, got ${typeToString(structType)}`,
            structExpr.span,
        );
    }

    // Get struct definition
    let structDef = null;
    if (structType.kind === TypeKind.Struct) {
        structDef = ctx.lookupItem(structType.name);
    } else if (structType.kind === TypeKind.Named) {
        structDef = ctx.lookupItem(structType.name);
    }

    if (!structDef || structDef.kind !== "struct") {
        return err(
            `Unknown struct: ${typeToString(structType)}`,
            structExpr.span,
        );
    }

    // Check fields
    const errors = [];
    const seenFields = new Set();

    for (const field of structExpr.fields || []) {
        seenFields.add(field.name);

        const fieldDef = structDef.node.fields?.find(
            (/** @type {any} f */ f) => f.name === field.name,
        );
        if (!fieldDef) {
            errors.push(
                makeTypeError(`Unknown field: ${field.name}`, field.span),
            );
            continue;
        }

        const valueResult = inferExpr(ctx, field.value);
        if (!valueResult.ok) {
            errors.push(...(valueResult.errors || []));
            continue;
        }

        if (fieldDef.ty) {
            const fieldTypeResult = resolveTypeNode(ctx, fieldDef.ty);
            if (!fieldTypeResult.ok) {
                errors.push(...(fieldTypeResult.errors || []));
                continue;
            }

            const unifyResult = unify(
                ctx,
                valueResult.type,
                fieldTypeResult.type,
            );
            if (!unifyResult.ok) {
                errors.push(unifyResult.error);
            }
        }
    }

    // Check for missing fields
    for (const fieldDef of structDef.node.fields || []) {
        if (!seenFields.has(fieldDef.name) && !fieldDef.defaultValue) {
            errors.push(
                makeTypeError(
                    `Missing field: ${fieldDef.name}`,
                    structExpr.span,
                ),
            );
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return ok(structType);
}

/**
 * Infer range expression type
 * @param {TypeContext} ctx
 * @param {Node} rangeExpr
 * @returns {InferenceResult}
 */
function inferRange(ctx, rangeExpr) {
    const errors = [];

    if (rangeExpr.start) {
        const startResult = inferExpr(ctx, rangeExpr.start);
        if (!startResult.ok) {
            errors.push(...(startResult.errors || []));
        }
    }

    if (rangeExpr.end) {
        const endResult = inferExpr(ctx, rangeExpr.end);
        if (!endResult.ok) {
            errors.push(...(endResult.errors || []));
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // Range type is std::ops::Range<T> - for now return a placeholder
    return ok(makeNamedType("Range", null, rangeExpr.span));
}

/**
 * Infer reference expression type
 * @param {TypeContext} ctx
 * @param {Node} refExpr
 * @returns {InferenceResult}
 */
function inferRef(ctx, refExpr) {
    const operandResult = inferExpr(ctx, refExpr.operand);
    if (!operandResult.ok) return operandResult;

    const mutable = refExpr.mutability === Mutability.Mutable;
    return ok(makeRefType(operandResult.type, mutable, refExpr.span));
}

/**
 * Infer dereference expression type
 * @param {TypeContext} ctx
 * @param {Node} derefExpr
 * @returns {InferenceResult}
 */
function inferDeref(ctx, derefExpr) {
    const operandResult = inferExpr(ctx, derefExpr.operand);
    if (!operandResult.ok) return operandResult;

    const operandType = ctx.resolveType(operandResult.type);

    if (operandType.kind === TypeKind.Ref) {
        return ok(operandType.inner);
    }

    if (operandType.kind === TypeKind.Ptr) {
        return ok(operandType.inner);
    }

    if (operandType.kind === TypeKind.TypeVar) {
        const innerType = ctx.freshTypeVar();
        const refType = makeRefType(innerType, false);
        const unifyResult = unify(ctx, operandType, refType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }
        return ok(innerType);
    }

    return err(
        `Cannot dereference non-reference type: ${typeToString(operandType)}`,
        derefExpr.span,
    );
}

/**
 * Count placeholders in a format string
 * @param {string} str
 * @returns {number}
 */
function countFormatPlaceholders(str) {
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

/**
 * @param {TypeContext} ctx
 * @param {Type} ty
 * @returns {boolean}
 */
function isSupportedFormatType(ctx, ty) {
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
 * @param {TypeContext} ctx
 * @param {Node} macroExpr
 * @returns {InferenceResult}
 */
function inferMacro(ctx, macroExpr) {
    const macroName = macroExpr.name;

    // Handle known macros
    switch (macroName) {
        case "println":
        case "print": {
            if (!macroExpr.args || macroExpr.args.length === 0) {
                return err(
                    `${macroName}! requires a format string argument`,
                    macroExpr.span,
                );
            }

            const errors = [];
            const formatArg = macroExpr.args[0];

            // Check that format string is a string literal
            if (
                formatArg.kind !== NodeKind.LiteralExpr ||
                formatArg.literalKind !== LiteralKind.String
            ) {
                return err(
                    `${macroName}! format string must be a string literal`,
                    formatArg.span || macroExpr.span,
                );
            }

            // Count placeholders in format string
            const formatStr = String(formatArg.value);
            const placeholderCount = countFormatPlaceholders(formatStr);
            const formatArgs = macroExpr.args.slice(1);

            // Validate placeholder count matches argument count
            if (placeholderCount !== formatArgs.length) {
                return err(
                    `${macroName}! expected ${placeholderCount} format argument(s), got ${formatArgs.length}`,
                    macroExpr.span,
                );
            }

            // Check format argument types are supported by {} rendering.
            for (let i = 0; i < formatArgs.length; i++) {
                const arg = formatArgs[i];
                const argResult = inferExpr(ctx, arg);
                if (!argResult.ok) {
                    errors.push(...(argResult.errors || []));
                    continue;
                }
                if (!isSupportedFormatType(ctx, argResult.type)) {
                    errors.push(
                        makeTypeError(
                            `${macroName}! format argument ${i} type ${typeToString(ctx.resolveType(argResult.type))} is not supported by {}`,
                            arg.span || macroExpr.span,
                        ),
                    );
                }
            }

            if (errors.length > 0) {
                return { ok: false, errors };
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
                return err(
                    `${macroName}! requires a condition argument`,
                    macroExpr.span,
                );
            }

            const condResult = inferExpr(ctx, macroExpr.args[0]);
            if (!condResult.ok) return condResult;

            const condUnify = unify(ctx, condResult.type, makeBoolType());
            if (!condUnify.ok) {
                return { ok: false, errors: [condUnify.error] };
            }

            return ok(makeUnitType(macroExpr.span));
        }

        case "vec": {
            // vec![a, b, c] lowers to Vec<T>.
            if (!macroExpr.args || macroExpr.args.length === 0) {
                return ok(makeNamedType("Vec", [ctx.freshTypeVar()], macroExpr.span));
            }

            const firstResult = inferExpr(ctx, macroExpr.args[0]);
            if (!firstResult.ok) return firstResult;

            const elementType = firstResult.type;

            // Check all elements have the same type
            for (let i = 1; i < macroExpr.args.length; i++) {
                const elemResult = inferExpr(ctx, macroExpr.args[i]);
                if (!elemResult.ok) return elemResult;

                const unifyResult = unify(ctx, elementType, elemResult.type);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
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

/**
 * Check a statement
 * @param {TypeContext} ctx
 * @param {Node} stmt
 * @returns {InferenceResult}
 */
function checkStmt(ctx, stmt) {
    switch (stmt.kind) {
        case NodeKind.LetStmt:
            return checkLetStmt(ctx, stmt);

        case NodeKind.ExprStmt:
            return checkExprStmt(ctx, stmt);

        case NodeKind.ItemStmt: {
            // Items are already gathered, just check nested items
            const result = checkItem(ctx, stmt.item);
            if (!result.ok) return result;
            return ok(makeUnitType(stmt.span));
        }

        default:
            return {
                ok: false,
                errors: [
                    makeTypeError(
                        `Unknown statement kind: ${stmt.kind}`,
                        stmt.span,
                    ),
                ],
            };
    }
}

/**
 * Check a let statement
 * @param {TypeContext} ctx
 * @param {Node} letStmt
 * @returns {InferenceResult}
 */
function checkLetStmt(ctx, letStmt) {
    /** @type {TypeError[]} */
    const errors = [];

    /** @type {Type | undefined} */
    let declaredType = undefined;
    if (letStmt.ty) {
        const typeResult = resolveTypeNode(ctx, letStmt.ty);
        if (!typeResult.ok) {
            errors.push(...typeResult.errors);
        } else {
            declaredType = typeResult.type;
        }
    }

    let initType = null;
    if (letStmt.init) {
        const initResult = inferExpr(ctx, letStmt.init, declaredType);
        if (!initResult.ok) {
            errors.push(...(initResult.errors || []));
        } else {
            initType = initResult.type;
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
        varType = ctx.freshTypeVar();
    } else {
        // No type annotation and no initializer - error
        errors.push(
            makeTypeError(
                "Cannot infer type for variable without initializer or type annotation",
                letStmt.span,
            ),
        );
        varType = ctx.freshTypeVar();
    }

    // Bind pattern
    const patResult = checkPattern(ctx, letStmt.pat, varType);
    if (!patResult.ok) {
        errors.push(...(patResult.errors || []));
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
        return { ok: false, errors };
    }

    // If initializer diverges, the whole statement diverges
    if (initType && initType.kind === TypeKind.Never) {
        return ok(initType);
    }

    return ok(makeUnitType(letStmt.span));
}

/**
 * Check an expression statement
 * @param {TypeContext} ctx
 * @param {Node} exprStmt
 * @returns {InferenceResult}
 */
function checkExprStmt(ctx, exprStmt) {
    const result = inferExpr(ctx, exprStmt.expr);
    if (!result.ok) {
        return result;
    }
    // If expression type is never, the statement diverges
    if (result.type.kind === TypeKind.Never) {
        return result;
    }
    return ok(makeUnitType(exprStmt.span));
}

// ============================================================================
// Task 4.7: Pattern Type Checking
// ============================================================================

/**
 * Infer the type of a pattern
 * @param {TypeContext} ctx
 * @param {Node} pattern
 * @returns {InferenceResult}
 */
function inferPattern(ctx, pattern) {
    switch (pattern.kind) {
        case NodeKind.IdentPat: {
            const type = pattern.ty
                ? resolveTypeNode(ctx, pattern.ty)
                : ok(ctx.freshTypeVar());
            if (!type.ok) return type;

            const mutable = pattern.mutability === Mutability.Mutable;
            const defineResult = ctx.defineVar(
                pattern.name,
                type.type,
                mutable,
                pattern.span,
            );
            if (!defineResult.ok) {
                return err(
                    defineResult.error || "Failed to define variable",
                    pattern.span,
                );
            }

            return ok(type.type);
        }

        case NodeKind.WildcardPat:
            return ok(ctx.freshTypeVar());

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
                    return err(
                        `Unknown literal pattern kind: ${pattern.literalKind}`,
                        pattern.span,
                    );
            }
        }

        case NodeKind.TuplePat: {
            const elementsResult = combineResults(
                pattern.elements.map((/** @type {Node} */ e) => inferPattern(ctx, e)),
            );
            if (!elementsResult.ok) {
                return { ok: false, errors: elementsResult.errors };
            }
            return ok(makeTupleType(elementsResult.types, pattern.span));
        }

        case NodeKind.StructPat: {
            // Look up struct type
            const pathResult = inferExpr(ctx, pattern.path);
            if (!pathResult.ok) return pathResult;

            const structType = ctx.resolveType(pathResult.type);
            if (
                structType.kind !== TypeKind.Struct &&
                structType.kind !== TypeKind.Named
            ) {
                return err(
                    `Expected struct type in pattern, got ${typeToString(structType)}`,
                    pattern.span,
                );
            }

            // Bind fields
            for (const field of pattern.fields || []) {
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
                innerResult.type,
                false,
                pattern.span,
            );
            if (!defineResult.ok) {
                return err(
                    defineResult.error || "Failed to define binding",
                    pattern.span,
                );
            }

            return ok(innerResult.type);
        }

        case NodeKind.OrPat: {
            // All alternatives must have the same type
            if (!pattern.alternatives || pattern.alternatives.length === 0) {
                return ok(ctx.freshTypeVar());
            }

            const firstResult = inferPattern(ctx, pattern.alternatives[0]);
            if (!firstResult.ok) return firstResult;

            for (let i = 1; i < pattern.alternatives.length; i++) {
                const altResult = inferPattern(ctx, pattern.alternatives[i]);
                if (!altResult.ok) return altResult;

                const unifyResult = unify(
                    ctx,
                    firstResult.type,
                    altResult.type,
                );
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
            }

            return ok(firstResult.type);
        }

        case NodeKind.RangePat: {
            // Range patterns are for numeric types
            if (pattern.start) {
                const startResult = inferPattern(ctx, pattern.start);
                if (!startResult.ok) return startResult;
                return ok(startResult.type);
            }
            if (pattern.end) {
                const endResult = inferPattern(ctx, pattern.end);
                if (!endResult.ok) return endResult;
                return ok(endResult.type);
            }
            return ok(ctx.freshTypeVar());
        }

        case NodeKind.SlicePat: {
            // Slice patterns are for slices/arrays
            const elementType = ctx.freshTypeVar();
            for (const elem of pattern.elements || []) {
                const elemResult = inferPattern(ctx, elem);
                if (!elemResult.ok) return elemResult;
                const unifyResult = unify(ctx, elemResult.type, elementType);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
            }
            return ok(makeSliceType(elementType, pattern.span));
        }

        default:
            return err(`Unknown pattern kind: ${pattern.kind}`, pattern.span);
    }
}

/**
 * Check a pattern against an expected type
 * @param {TypeContext} ctx
 * @param {Node} pattern
 * @param {Type} expectedType
 * @returns {CheckResult}
 */
function checkPattern(ctx, pattern, expectedType) {
    expectedType = ctx.resolveType(expectedType);

    switch (pattern.kind) {
        case NodeKind.IdentPat: {
            let varType = expectedType;

            // If pattern has explicit type annotation, unify with expected
            if (pattern.ty) {
                const typeResult = resolveTypeNode(ctx, pattern.ty);
                if (!typeResult.ok) {
                    return { ok: false, errors: typeResult.errors };
                }
                const unifyResult = unify(ctx, typeResult.type, expectedType);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
                varType = typeResult.type;
            }

            const mutable = pattern.mutability === Mutability.Mutable;
            const defineResult = ctx.defineVar(
                pattern.name,
                varType,
                mutable,
                pattern.span,
            );
            if (!defineResult.ok) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            defineResult.error || "Failed to define variable",
                            pattern.span,
                        ),
                    ],
                };
            }

            return { ok: true };
        }

        case NodeKind.WildcardPat:
            return { ok: true };

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
                    return {
                        ok: false,
                        errors: [
                            makeTypeError(
                                `Unknown literal pattern kind: ${pattern.literalKind}`,
                                pattern.span,
                            ),
                        ],
                    };
            }

            const unifyResult = unify(ctx, literalType, expectedType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }
            return { ok: true };
        }

        case NodeKind.TuplePat: {
            if (expectedType.kind !== TypeKind.Tuple) {
                // Try to unify with a fresh tuple type
                const tupleResult = inferPattern(ctx, pattern);
                if (!tupleResult.ok) {
                    return { ok: false, errors: tupleResult.errors };
                }
                const unifyResult = unify(ctx, tupleResult.type, expectedType);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
                return { ok: true };
            }

            const tupleType = /** @type {import("./types.js").TupleType} */ (expectedType);

            if (pattern.elements.length !== tupleType.elements.length) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            `Tuple pattern length mismatch: expected ${tupleType.elements.length}, got ${pattern.elements.length}`,
                            pattern.span,
                        ),
                    ],
                };
            }

            const errors = [];
            for (let i = 0; i < pattern.elements.length; i++) {
                const result = checkPattern(
                    ctx,
                    pattern.elements[i],
                    tupleType.elements[i],
                );
                if (!result.ok) {
                    errors.push(...result.errors);
                }
            }

            if (errors.length > 0) {
                return { ok: false, errors };
            }
            return { ok: true };
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
                    return {
                        ok: false,
                        errors: [
                            makeTypeError(`Unknown enum: ${enumName}`, pattern.span),
                        ],
                    };
                }

                /** @type {Type} */
                let enumPatternType = makeEnumType(enumName, [], pattern.span);
                const enumGenericParams = (enumItem.node.generics || [])
                    .map((/** @type {string} */ name) => name || "")
                    .filter((/** @type {string} */ name) => name.length > 0);
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
                        args || enumGenericParams.map(() => ctx.freshTypeVar()),
                        pattern.span,
                    );
                }

                const enumUnify = unify(ctx, enumPatternType, expectedType);
                if (!enumUnify.ok) {
                    return { ok: false, errors: [enumUnify.error] };
                }

                const variant = (enumItem.node.variants || []).find(
                    (/** @type {any} */ v) => v.name === variantName,
                );
                if (!variant) {
                    return {
                        ok: false,
                        errors: [
                            makeTypeError(
                                `Unknown variant: ${enumName}::${variantName}`,
                                pattern.span,
                            ),
                        ],
                    };
                }

                const variantFields = variant.fields || [];
                if (pattern.fields.length !== variantFields.length) {
                    return {
                        ok: false,
                        errors: [
                            makeTypeError(
                                `Variant ${enumName}::${variantName} expects ${variantFields.length} field(s), got ${pattern.fields.length}`,
                                pattern.span,
                            ),
                        ],
                    };
                }

                const expectedResolved = ctx.resolveType(expectedType);
                const expectedArgs =
                    expectedResolved.kind === TypeKind.Named &&
                    expectedResolved.name === enumName &&
                    expectedResolved.args
                        ? expectedResolved.args
                        : null;
                const bindings = new Map();
                const genericSet = new Set(enumGenericParams);
                if (expectedArgs) {
                    const count = Math.min(expectedArgs.length, enumGenericParams.length);
                    for (let i = 0; i < count; i++) {
                        bindings.set(enumGenericParams[i], expectedArgs[i]);
                    }
                }

                const errors = [];
                for (let i = 0; i < pattern.fields.length; i++) {
                    const field = pattern.fields[i];
                    const fieldDef = variantFields[i];
                    let fieldType = ctx.freshTypeVar();
                    if (fieldDef?.ty) {
                        const fieldTypeResult = resolveTypeNode(ctx, fieldDef.ty);
                        if (!fieldTypeResult.ok) {
                            errors.push(...(fieldTypeResult.errors || []));
                            continue;
                        }
                        fieldType = substituteGenericTypeBindings(
                            ctx,
                            fieldTypeResult.type,
                            genericSet,
                            bindings,
                        );
                    }

                    const fieldResult = checkPattern(ctx, field.pat, fieldType);
                    if (!fieldResult.ok) {
                        errors.push(...(fieldResult.errors || []));
                    }
                }
                return errors.length > 0 ? { ok: false, errors } : { ok: true };
            }

            // Regular struct pattern.
            const pathResult = inferExpr(ctx, pattern.path);
            if (!pathResult.ok) {
                return { ok: false, errors: pathResult.errors };
            }
            const structType = ctx.resolveType(pathResult.type);
            const unifyResult = unify(ctx, structType, expectedType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }

            let structDef = null;
            if (structType.kind === TypeKind.Struct) {
                structDef = ctx.lookupItem(structType.name);
            } else if (structType.kind === TypeKind.Named) {
                structDef = ctx.lookupItem(structType.name);
            }
            if (!structDef || structDef.kind !== "struct") {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            `Unknown struct: ${typeToString(structType)}`,
                            pattern.span,
                        ),
                    ],
                };
            }

            const errors = [];
            const seenFields = new Set();
            for (const field of pattern.fields || []) {
                seenFields.add(field.name);
                const fieldDef = structDef.node.fields?.find(
                    (/** @type {any} */ f) => f.name === field.name,
                );
                if (!fieldDef) {
                    errors.push(
                        makeTypeError(
                            `Unknown field: ${field.name}`,
                            field.span,
                        ),
                    );
                    continue;
                }

                let fieldType = ctx.freshTypeVar();
                if (fieldDef.ty) {
                    const typeResult = resolveTypeNode(ctx, fieldDef.ty);
                    if (!typeResult.ok) {
                        errors.push(...(typeResult.errors || []));
                        continue;
                    }
                    fieldType = typeResult.type;
                }
                const fieldResult = checkPattern(ctx, field.pat, fieldType);
                if (!fieldResult.ok) {
                    errors.push(...(fieldResult.errors || []));
                }
            }
            if (!pattern.rest) {
                for (const fieldDef of structDef.node.fields || []) {
                    if (!seenFields.has(fieldDef.name)) {
                        errors.push(
                            makeTypeError(
                                `Missing field in pattern: ${fieldDef.name}`,
                                pattern.span,
                            ),
                        );
                    }
                }
            }
            return errors.length > 0 ? { ok: false, errors } : { ok: true };
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
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            defineResult.error || "Failed to define binding",
                            pattern.span,
                        ),
                    ],
                };
            }

            return { ok: true };
        }

        case NodeKind.OrPat: {
            if (!pattern.alternatives || pattern.alternatives.length === 0) {
                return { ok: true };
            }

            const errors = [];
            for (const alt of pattern.alternatives) {
                const result = checkPattern(ctx, alt, expectedType);
                if (!result.ok) {
                    errors.push(...(result.errors || []));
                }
            }

            if (errors.length > 0) {
                return { ok: false, errors };
            }
            return { ok: true };
        }

        case NodeKind.RangePat: {
            // Check that expected type is numeric
            if (
                !isNumericType(expectedType) &&
                expectedType.kind !== TypeKind.TypeVar
            ) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            `Range pattern requires numeric type, got ${typeToString(expectedType)}`,
                            pattern.span,
                        ),
                    ],
                };
            }

            if (pattern.start) {
                const startResult = inferPattern(ctx, pattern.start);
                if (!startResult.ok) {
                    return { ok: false, errors: startResult.errors };
                }
                const unifyResult = unify(ctx, startResult.type, expectedType);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
            }

            if (pattern.end) {
                const endResult = inferPattern(ctx, pattern.end);
                if (!endResult.ok) {
                    return { ok: false, errors: endResult.errors };
                }
                const unifyResult = unify(ctx, endResult.type, expectedType);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
            }

            return { ok: true };
        }

        case NodeKind.SlicePat: {
            // Check that expected type is array or slice
            let elementType;
            if (expectedType.kind === TypeKind.Array) {
                elementType = expectedType.element;
            } else if (expectedType.kind === TypeKind.Slice) {
                elementType = expectedType.element;
            } else if (expectedType.kind === TypeKind.TypeVar) {
                elementType = ctx.freshTypeVar();
                const sliceType = makeSliceType(elementType);
                const unifyResult = unify(ctx, expectedType, sliceType);
                if (!unifyResult.ok) {
                    return { ok: false, errors: [unifyResult.error] };
                }
            } else {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            `Slice pattern requires array or slice type, got ${typeToString(expectedType)}`,
                            pattern.span,
                        ),
                    ],
                };
            }

            const errors = [];
            for (const elem of pattern.elements || []) {
                const result = checkPattern(ctx, elem, elementType);
                if (!result.ok) {
                    errors.push(...(result.errors || []));
                }
            }

            if (errors.length > 0) {
                return { ok: false, errors };
            }
            return { ok: true };
        }

        default:
            return {
                ok: false,
                errors: [
                    makeTypeError(
                        `Unknown pattern kind: ${pattern.kind}`,
                        pattern.span,
                    ),
                ],
            };
    }
}

// ============================================================================
// Task 4.11: Inference Finalization
// ============================================================================

/**
 * Finalize inference by resolving all type variables
 * @param {TypeContext} ctx
 * @returns {{ ok: boolean, errors?: TypeError[] }}
 */
function finalizeInference(ctx) {
    const errors = [];

    // Check for unresolved type variables
    for (const [id, tv] of ctx.typeVars) {
        if (tv.bound === null) {
            errors.push(
                makeTypeError(
                    `Ambiguous type: cannot infer type for type variable ?${id}`,
                    tv.span,
                ),
            );
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true };
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
    makeTypeError,
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
