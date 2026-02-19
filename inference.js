/** @typedef {import("./types.js").Type} Type */
/** @typedef {import("./types.js").Span} Span */
/** @typedef {import("./ast.js").Node} Node */
/** @typedef {import("./type_context.js").TypeContext} TypeContext */

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
    typeEquals,
    typeToString,
    isNumericType,
    isIntegerType,
    isFloatType,
    isBoolType,
    isUnitType,
    isNeverType,
    isTypeVar,
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

/**
 * @typedef {object} InferenceResult
 * @property {boolean} ok
 * @property {Type} [type]
 * @property {TypeError[]} [errors]
 */

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
 * Combine multiple results, collecting all errors
 * @param {InferenceResult[]} results
 * @returns {{ ok: boolean, types?: Type[], errors?: TypeError[] }}
 */
function combineResults(results) {
    const errors = [];
    const types = [];
    for (const result of results) {
        if (!result.ok) {
            errors.push(...(result.errors || []));
        } else if (result.type !== undefined) {
            types.push(result.type);
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true, types };
}

// ============================================================================
// Task 4.8: Unification
// ============================================================================

/**
 * Unify two types, making them equal
 * @param {TypeContext} ctx
 * @param {Type} t1
 * @param {Type} t2
 * @returns {{ ok: boolean, error?: TypeError }}
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
            const typeResult = inferFnSignature(ctx, item);
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
            // Check for builtin types
            const builtin = resolveBuiltinType(typeNode.name);
            if (builtin) {
                return ok(builtin);
            }

            // Check for user-defined types
            const item = ctx.lookupItem(typeNode.name);
            if (item) {
                if (item.kind === "struct") {
                    return ok(makeStructType(typeNode.name, [], typeNode.span));
                }
                if (item.kind === "enum") {
                    return ok(makeEnumType(typeNode.name, [], typeNode.span));
                }
            }

            // Check for type alias
            const alias = ctx.lookupTypeAlias(typeNode.name);
            if (alias) {
                return ok(alias);
            }

            // Unknown type - keep as named for now
            let args = null;
            if (typeNode.args && typeNode.args.args) {
                const argsResult = combineResults(
                    typeNode.args.args.map((a) => resolveTypeNode(ctx, a)),
                );
                if (!argsResult.ok) {
                    return { ok: false, errors: argsResult.errors };
                }
                args = argsResult.types;
            }
            return ok(makeNamedType(typeNode.name, args, typeNode.span));
        }

        case NodeKind.TupleType: {
            const elementsResult = combineResults(
                (typeNode.elements || []).map((e) => resolveTypeNode(ctx, e)),
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
                (typeNode.params || []).map((p) => resolveTypeNode(ctx, p)),
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

// ============================================================================
// Module Item Checking
// ============================================================================

/**
 * Check all items in a module
 * @param {TypeContext} ctx
 * @param {Node} module
 * @returns {{ ok: boolean, errors?: TypeError[] }}
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

/**
 * Check a single item
 * @param {TypeContext} ctx
 * @param {Node} item
 * @returns {{ ok: boolean, errors?: TypeError[] }}
 */
function checkItem(ctx, item) {
    switch (item.kind) {
        case NodeKind.FnItem:
            return checkFnItem(ctx, item);

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
 * @returns {{ ok: boolean, errors?: TypeError[] }}
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

    const fnType = itemDecl.type;
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
function inferExpr(ctx, expr, expectedType = null) {
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
function inferLiteral(ctx, literal, expectedType = null) {
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
    // Look up variable binding
    const binding = ctx.lookupVar(ident.name);
    if (binding) {
        return ok(binding.type);
    }

    // Look up item (function, struct, enum)
    const item = ctx.lookupItem(ident.name);
    if (item) {
        if (item.kind === "fn" && item.type) {
            return ok(item.type);
        }
        if (item.kind === "struct") {
            return ok(makeStructType(item.name, [], ident.span));
        }
        if (item.kind === "enum") {
            return ok(makeEnumType(item.name, [], ident.span));
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

    switch (binary.op) {
        // Arithmetic operators
        case BinaryOp.Add:
        case BinaryOp.Sub:
        case BinaryOp.Mul:
        case BinaryOp.Div:
        case BinaryOp.Rem: {
            // Both operands must be numeric
            if (
                !isNumericType(leftType) &&
                leftType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected numeric type, got ${typeToString(leftType)}`,
                    binary.left.span,
                );
            }
            if (
                !isNumericType(rightType) &&
                rightType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected numeric type, got ${typeToString(rightType)}`,
                    binary.right.span,
                );
            }

            // Unify operand types
            const unifyResult = unify(ctx, leftType, rightType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }

            return ok(ctx.resolveType(leftType));
        }

        // Comparison operators
        case BinaryOp.Eq:
        case BinaryOp.Ne:
        case BinaryOp.Lt:
        case BinaryOp.Le:
        case BinaryOp.Gt:
        case BinaryOp.Ge: {
            // Unify operand types
            const unifyResult = unify(ctx, leftType, rightType);
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
                !isIntegerType(leftType) &&
                leftType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected integer type, got ${typeToString(leftType)}`,
                    binary.left.span,
                );
            }
            if (
                !isIntegerType(rightType) &&
                rightType.kind !== TypeKind.TypeVar
            ) {
                return err(
                    `Expected integer type, got ${typeToString(rightType)}`,
                    binary.right.span,
                );
            }

            const unifyResult = unify(ctx, leftType, rightType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }

            return ok(ctx.resolveType(leftType));
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
    const calleeResult = inferExpr(ctx, call.callee);
    if (!calleeResult.ok) return calleeResult;

    const calleeType = ctx.resolveType(calleeResult.type);

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
        const expectedFnType = makeFnType(paramTypes, returnType, false);
        const unifyResult = unify(ctx, calleeType, expectedFnType);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }

        // Infer arguments
        for (let i = 0; i < call.args.length; i++) {
            const argResult = inferExpr(ctx, call.args[i]);
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
        const argResult = inferExpr(ctx, call.args[i]);
        if (!argResult.ok) return argResult;
        const unifyResult = unify(ctx, argResult.type, calleeType.params[i]);
        if (!unifyResult.ok) {
            return { ok: false, errors: [unifyResult.error] };
        }
    }

    return ok(calleeType.returnType);
}

/**
 * Infer field access type
 * @param {TypeContext} ctx
 * @param {Node} field
 * @returns {InferenceResult}
 */
function inferField(ctx, field) {
    const receiverResult = inferExpr(ctx, field.receiver);
    if (!receiverResult.ok) return receiverResult;

    const receiverType = ctx.resolveType(receiverResult.type);
    const fieldName =
        typeof field.field === "string" ? field.field : field.field.name;

    // Handle struct field access
    if (receiverType.kind === TypeKind.Struct) {
        const fieldDef = receiverType.fields.find((f) => f.name === fieldName);
        if (fieldDef) {
            return ok(fieldDef.type);
        }

        // Some lowering paths keep struct names but omit field metadata.
        // Fall back to the declared item definition in type context.
        const item = ctx.lookupItem(receiverType.name);
        if (item && item.kind === "struct") {
            const structField = item.node.fields?.find(
                (f) => f.name === fieldName,
            );
            if (structField) {
                if (structField.ty) {
                    return resolveTypeNode(ctx, structField.ty);
                }
                return ok(ctx.freshTypeVar());
            }
        }

        return err(
            `Field '${fieldName}' not found in struct ${receiverType.name}`,
            field.span,
        );
    }

    // Handle named type (unresolved struct)
    if (receiverType.kind === TypeKind.Named) {
        const item = ctx.lookupItem(receiverType.name);
        if (item && item.kind === "struct") {
            const structField = item.node.fields?.find(
                (f) => f.name === fieldName,
            );
            if (!structField) {
                return err(
                    `Field '${fieldName}' not found in struct ${receiverType.name}`,
                    field.span,
                );
            }
            if (structField.ty) {
                return resolveTypeNode(ctx, structField.ty);
            }
            return ok(ctx.freshTypeVar());
        }
    }

    // Handle tuple field access (numeric index)
    if (receiverType.kind === TypeKind.Tuple) {
        const index =
            typeof field.field === "number"
                ? field.field
                : parseInt(field.field.name, 10);
        if (
            isNaN(index) ||
            index < 0 ||
            index >= receiverType.elements.length
        ) {
            return err(`Tuple index out of bounds: ${field.field}`, field.span);
        }
        return ok(receiverType.elements[index]);
    }

    // Type variable - might be a struct
    if (receiverType.kind === TypeKind.TypeVar) {
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
    const intType = makeIntType(IntWidth.Isize);
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

    const unifyResult = unify(ctx, targetType, valueType);
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

    let resultType = null;
    const errors = [];

    for (const arm of matchExpr.arms) {
        ctx.pushScope();

        // Check pattern
        const patResult = checkPattern(ctx, arm.pat, scrutineeType);
        if (!patResult.ok) {
            errors.push(...(patResult.errors || []));
        }

        // Check guard
        if (arm.guard) {
            const guardResult = inferExpr(ctx, arm.guard);
            if (!guardResult.ok) {
                errors.push(...(guardResult.errors || []));
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
            errors.push(...(bodyResult.errors || []));
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

    const errors = [];
    let diverges = false;
    let neverType = null;

    // Check statements
    for (const stmt of block.stmts || []) {
        const result = checkStmt(ctx, stmt);
        if (!result.ok) {
            errors.push(...(result.errors || []));
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
            errors.push(...(exprResult.errors || []));
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

    return ok(diverges ? neverType : resultType);
}

/**
 * Infer loop expression type
 * @param {TypeContext} ctx
 * @param {Node} loopExpr
 * @returns {InferenceResult}
 */
function inferLoop(ctx, loopExpr) {
    ctx.pushScope();

    const bodyResult = inferExpr(ctx, loopExpr.body);
    if (!bodyResult.ok) {
        ctx.popScope();
        return bodyResult;
    }

    ctx.popScope();

    // Loop can return any type via break
    // For now, return never type (diverges)
    return ok(makeNeverType(loopExpr.span));
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

    ctx.pushScope();
    const bodyResult = inferExpr(ctx, whileExpr.body);
    ctx.popScope();

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

    ctx.pushScope();

    // Bind pattern variable
    const patResult = inferPattern(ctx, forExpr.pat);
    if (!patResult.ok) {
        ctx.popScope();
        return patResult;
    }

    // TODO: Check that iterator is iterable

    const bodyResult = inferExpr(ctx, forExpr.body);
    ctx.popScope();

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
        const valueResult = inferExpr(ctx, returnExpr.value);
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
    // TODO: Check that we're in a loop
    // TODO: Handle break with value
    return ok(makeNeverType(breakExpr.span));
}

/**
 * Infer continue expression type
 * @param {TypeContext} ctx
 * @param {Node} continueExpr
 * @returns {InferenceResult}
 */
function inferContinue(ctx, continueExpr) {
    // TODO: Check that we're in a loop
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

    // Simple identifier
    if (pathExpr.segments.length === 1) {
        return inferIdentifier(ctx, {
            name: pathExpr.segments[0],
            span: pathExpr.span,
        });
    }

    // Qualified path - look up in items
    const itemName = pathExpr.segments[0];
    const item = ctx.lookupItem(itemName);
    if (!item) {
        return err(`Unbound item: ${itemName}`, pathExpr.span);
    }

    // Handle enum variants: EnumName::VariantName
    if (item.kind === "enum" && pathExpr.segments.length === 2) {
        const variantName = pathExpr.segments[1];
        const enumNode = item.node;

        // Find the variant
        const variants = enumNode.variants || [];
        const variantIndex = variants.findIndex(v => v.name === variantName);
        if (variantIndex === -1) {
            return err(`Unknown variant: ${variantName}`, pathExpr.span);
        }

        const variant = variants[variantIndex];
        const variantFields = variant.fields || [];

        // Build the enum type
        const enumType = {
            kind: TypeKind.Enum,
            name: itemName,
            variants: variants.map(v => ({
                name: v.name,
                fields: (v.fields || []).map(f => f.ty || null),
            })),
            span: pathExpr.span,
        };

        // If the variant has fields, return a function type that constructs the enum
        if (variantFields.length > 0) {
            // Resolve field types
            const fieldTypes = [];
            for (const field of variantFields) {
                if (field.ty) {
                    const fieldTyResult = resolveTypeNode(ctx, field.ty);
                    if (fieldTyResult.ok) {
                        fieldTypes.push(fieldTyResult.type);
                    } else {
                        fieldTypes.push(ctx.freshTypeVar());
                    }
                } else {
                    fieldTypes.push(ctx.freshTypeVar());
                }
            }

            // Return a function type: (field_types) -> EnumType
            return ok(makeFnType(fieldTypes, enumType, false, pathExpr.span));
        }

        // No fields - return the enum type directly
        return ok(enumType);
    }

    // Handle struct constructors: StructName::new or just StructName
    if (item.kind === "struct") {
        const structType = {
            kind: TypeKind.Struct,
            name: itemName,
            fields: (item.node.fields || []).map(f => ({
                name: f.name,
                type: f.ty,
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
            (f) => f.name === field.name,
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
            // println! and print! return unit type
            // They accept a format string and arguments

            if (!macroExpr.args || macroExpr.args.length === 0) {
                return err(
                    `${macroName}! requires at least a format string argument`,
                    macroExpr.span,
                );
            }

            const errors = [];

            // Check all arguments
            for (const arg of macroExpr.args) {
                const argResult = inferExpr(ctx, arg);
                if (!argResult.ok) {
                    errors.push(...(argResult.errors || []));
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
            // vec! creates a vector
            // For now, return a slice type
            if (!macroExpr.args || macroExpr.args.length === 0) {
                return ok(makeSliceType(ctx.freshTypeVar(), macroExpr.span));
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

            return ok(makeSliceType(elementType, macroExpr.span));
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
    const errors = [];

    let declaredType = null;
    if (letStmt.ty) {
        const typeResult = resolveTypeNode(ctx, letStmt.ty);
        if (!typeResult.ok) {
            errors.push(...(typeResult.errors || []));
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
                pattern.elements.map((e) => inferPattern(ctx, e)),
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
                // TODO: Check field type matches
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
 * @returns {{ ok: boolean, errors?: TypeError[] }}
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

            if (pattern.elements.length !== expectedType.elements.length) {
                return {
                    ok: false,
                    errors: [
                        makeTypeError(
                            `Tuple pattern length mismatch: expected ${expectedType.elements.length}, got ${pattern.elements.length}`,
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
                    expectedType.elements[i],
                );
                if (!result.ok) {
                    errors.push(...(result.errors || []));
                }
            }

            if (errors.length > 0) {
                return { ok: false, errors };
            }
            return { ok: true };
        }

        case NodeKind.StructPat: {
            // Get struct type from path
            const pathResult = inferExpr(ctx, pattern.path);
            if (!pathResult.ok) {
                return { ok: false, errors: pathResult.errors };
            }

            const structType = ctx.resolveType(pathResult.type);

            // Unify with expected type
            const unifyResult = unify(ctx, structType, expectedType);
            if (!unifyResult.ok) {
                return { ok: false, errors: [unifyResult.error] };
            }

            // Get struct definition
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

            // Check fields
            const errors = [];
            const seenFields = new Set();

            for (const field of pattern.fields || []) {
                seenFields.add(field.name);

                const fieldDef = structDef.node.fields?.find(
                    (f) => f.name === field.name,
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

                let fieldType;
                if (fieldDef.ty) {
                    const typeResult = resolveTypeNode(ctx, fieldDef.ty);
                    if (!typeResult.ok) {
                        errors.push(...(typeResult.errors || []));
                        continue;
                    }
                    fieldType = typeResult.type;
                } else {
                    fieldType = ctx.freshTypeVar();
                }

                const fieldResult = checkPattern(ctx, field.pat, fieldType);
                if (!fieldResult.ok) {
                    errors.push(...(fieldResult.errors || []));
                }
            }

            // Check for missing fields (unless rest pattern is present)
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

            if (errors.length > 0) {
                return { ok: false, errors };
            }
            return { ok: true };
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
