/** @typedef {number} TypeKindValue */
/** @typedef {number} IntWidthValue */
/** @typedef {number} FloatWidthValue */
/** @typedef {number} TypeVarId */

/** @typedef {{ line: number, column: number, start: number, end: number }} Span */
/** @typedef {0} IntKind */
/** @typedef {1} FloatKind */
/** @typedef {2} BoolKind */
/** @typedef {3} CharKind */
/** @typedef {4} StringKind */
/** @typedef {5} UnitKind */
/** @typedef {6} NeverKind */
/** @typedef {7} TupleKind */
/** @typedef {8} ArrayKind */
/** @typedef {9} SliceKind */
/** @typedef {10} StructKind */
/** @typedef {11} EnumKind */
/** @typedef {12} RefKind */
/** @typedef {13} PtrKind */
/** @typedef {14} FnKind */
/** @typedef {15} TypeVarKind */
/** @typedef {16} NamedKind */

/**
 * Type kinds for the type system
 * @type {{
 *   Int: IntKind,
 *   Float: FloatKind,
 *   Bool: BoolKind,
 *   Char: CharKind,
 *   String: StringKind,
 *   Unit: UnitKind,
 *   Never: NeverKind,
 *   Tuple: TupleKind,
 *   Array: ArrayKind,
 *   Slice: SliceKind,
 *   Struct: StructKind,
 *   Enum: EnumKind,
 *   Ref: RefKind,
 *   Ptr: PtrKind,
 *   Fn: FnKind,
 *   TypeVar: TypeVarKind,
 *   Named: NamedKind
 * }}
 */
const TypeKind = {
    // Primitive types
    Int: 0,
    Float: 1,
    Bool: 2,
    Char: 3,
    String: 4,
    Unit: 5,
    Never: 6,

    // Composite types
    Tuple: 7,
    Array: 8,
    Slice: 9,
    Struct: 10,
    Enum: 11,

    // Reference types
    Ref: 12,
    Ptr: 13,

    // Function type
    Fn: 14,

    // Type variable (for inference)
    TypeVar: 15,

    // Named type (for user-defined types before resolution)
    Named: 16,
};

/**
 * Structural type model used throughout the compiler.
 *
 * @typedef {{ kind: IntKind, width: IntWidthValue, span?: Span }} IntType
 * @typedef {{ kind: FloatKind, width: FloatWidthValue, span?: Span }} FloatType
 * @typedef {{ kind: BoolKind, span?: Span }} BoolType
 * @typedef {{ kind: CharKind, span?: Span }} CharType
 * @typedef {{ kind: StringKind, span?: Span }} StringType
 * @typedef {{ kind: UnitKind, span?: Span }} UnitType
 * @typedef {{ kind: NeverKind, span?: Span }} NeverType
 * @typedef {{ kind: TupleKind, elements: Type[], span?: Span }} TupleType
 * @typedef {{ kind: ArrayKind, element: Type, length: number, span?: Span }} ArrayType
 * @typedef {{ kind: SliceKind, element: Type, span?: Span }} SliceType
 * @typedef {{ kind: StructKind, name: string, fields: { name: string, type: Type }[], span?: Span }} StructType
 * @typedef {{ kind: EnumKind, name: string, variants: { name: string, fields?: Type[] }[], span?: Span }} EnumType
 * @typedef {{ kind: RefKind, inner: Type, mutable: boolean, span?: Span }} RefType
 * @typedef {{ kind: PtrKind, inner: Type, mutable: boolean, span?: Span }} PtrType
 * @typedef {{ kind: FnKind, params: Type[], returnType: Type, isUnsafe: boolean, isConst: boolean, span?: Span }} FnType
 * @typedef {{ kind: TypeVarKind, id: number, bound: Type | null, span?: Span }} TypeVarType
 * @typedef {{ kind: NamedKind, name: string, args: Type[] | null, span?: Span }} NamedType
 *
 * @typedef {IntType | FloatType | BoolType | CharType | StringType | UnitType | NeverType | TupleType | ArrayType | SliceType | StructType | EnumType | RefType | PtrType | FnType | TypeVarType | NamedType} Type
 */

/**
 * Integer type widths
 */
const IntWidth = {
    I8: 0,
    I16: 1,
    I32: 2,
    I64: 3,
    I128: 4,
    Isize: 5,
    U8: 6,
    U16: 7,
    U32: 8,
    U64: 9,
    U128: 10,
    Usize: 11,
};

/**
 * Float type widths
 */
const FloatWidth = {
    F32: 0,
    F64: 1,
};

// ============================================================================
// Task 3.1: Type Representation - Primitive Types
// ============================================================================

/**
 * @param {IntWidthValue} width
 * @param {Span} [span]
 * @returns {Type}
 */
function makeIntType(width, span) {
    return { kind: TypeKind.Int, width, span };
}

/**
 * @param {FloatWidthValue} width
 * @param {Span} [span]
 * @returns {Type}
 */
function makeFloatType(width, span) {
    return { kind: TypeKind.Float, width, span };
}

/**
 * @param {Span} [span]
 * @returns {Type}
 */
function makeBoolType(span) {
    return { kind: TypeKind.Bool, span };
}

/**
 * @param {Span} [span]
 * @returns {Type}
 */
function makeCharType(span) {
    return { kind: TypeKind.Char, span };
}

/**
 * @param {Span} [span]
 * @returns {Type}
 */
function makeStringType(span) {
    return { kind: TypeKind.String, span };
}

/**
 * @param {Span} [span]
 * @returns {Type}
 */
function makeUnitType(span) {
    return { kind: TypeKind.Unit, span };
}

/**
 * @param {Span} [span]
 * @returns {Type}
 */
function makeNeverType(span) {
    return { kind: TypeKind.Never, span };
}

// ============================================================================
// Task 3.2: Composite Types
// ============================================================================

/**
 * @param {Type[]} elements
 * @param {Span} [span]
 * @returns {Type}
 */
function makeTupleType(elements, span) {
    return { kind: TypeKind.Tuple, elements, span };
}

/**
 * @param {Type} element
 * @param {number} length
 * @param {Span} [span]
 * @returns {Type}
 */
function makeArrayType(element, length, span) {
    return { kind: TypeKind.Array, element, length, span };
}

/**
 * @param {Type} element
 * @param {Span} [span]
 * @returns {Type}
 */
function makeSliceType(element, span) {
    return { kind: TypeKind.Slice, element, span };
}

/**
 * @param {string} name
 * @param {{ name: string, type: Type }[]} fields
 * @param {Span} [span]
 * @returns {Type}
 */
function makeStructType(name, fields, span) {
    return { kind: TypeKind.Struct, name, fields, span };
}

/**
 * @param {string} name
 * @param {{ name: string, fields?: Type[] }[]} variants
 * @param {Span} [span]
 * @returns {Type}
 */
function makeEnumType(name, variants, span) {
    return { kind: TypeKind.Enum, name, variants, span };
}

// ============================================================================
// Task 3.3: Reference Types
// ============================================================================

/**
 * @param {Type} inner
 * @param {boolean} mutable
 * @param {Span} [span]
 * @returns {Type}
 */
function makeRefType(inner, mutable, span) {
    return { kind: TypeKind.Ref, inner, mutable, span };
}

/**
 * @param {Type} inner
 * @param {boolean} mutable
 * @param {Span} [span]
 * @returns {Type}
 */
function makePtrType(inner, mutable, span) {
    return { kind: TypeKind.Ptr, inner, mutable, span };
}

// ============================================================================
// Task 3.4: Function Types
// ============================================================================

/**
 * @param {Type[]} params
 * @param {Type} returnType
 * @param {boolean} isUnsafe
 * @param {boolean} [isConst=false]
 * @param {Span} [span]
 * @returns {Type}
 */
function makeFnType(params, returnType, isUnsafe, isConst = false, span) {
    return { kind: TypeKind.Fn, params, returnType, isUnsafe, isConst, span };
}

// ============================================================================
// Task 3.5: Type Variables (for inference)
// ============================================================================

/** @type {TypeVarId} */
let nextTypeVarId = 0;

/**
 * Reset type variable counter (useful for testing)
 */
function resetTypeVarId() {
    nextTypeVarId = 0;
}

/**
 * @param {Span} [span]
 * @returns {Type}
 */
function makeTypeVar(span) {
    const id = nextTypeVarId++;
    return { kind: TypeKind.TypeVar, id, bound: null, span };
}

/**
 * @param {TypeVarId} id
 * @param {Type} type
 * @param {Span} [span]
 * @returns {Type}
 */
function makeBoundTypeVar(id, type, span) {
    return { kind: TypeKind.TypeVar, id, bound: type, span };
}

/**
 * @param {Type} typeVar
 * @returns {boolean}
 */
function isBoundTypeVar(typeVar) {
    return typeVar.kind === TypeKind.TypeVar && typeVar.bound !== null;
}

/**
 * @param {Type} typeVar
 * @returns {boolean}
 */
function isUnboundTypeVar(typeVar) {
    return typeVar.kind === TypeKind.TypeVar && typeVar.bound === null;
}

// ============================================================================
// Named Type (for unresolved type references)
// ============================================================================

/**
 * @param {string} name
 * @param {Type[] | null} args
 * @param {Span} [span]
 * @returns {Type}
 */
function makeNamedType(name, args, span) {
    return { kind: TypeKind.Named, name, args, span };
}

// ============================================================================
// Task 3.9: Type Utilities
// ============================================================================

/**
 * Check structural equality of two types
 * @param {Type} a
 * @param {Type} b
 * @returns {boolean}
 */
function typeEquals(a, b) {
    // Handle null/undefined
    if (!a || !b) return a === b;

    // Handle type variables
    if (a.kind === TypeKind.TypeVar && b.kind === TypeKind.TypeVar) {
        if (a.id !== b.id) return false;
        if (a.bound === null && b.bound === null) return true;
        if (a.bound === null || b.bound === null) return false;
        return typeEquals(a.bound, b.bound);
    }

    // Different kinds are not equal
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
        case TypeKind.Int:
            return a.width === /** @type {{ width?: IntWidthValue }} */ (b).width;

        case TypeKind.Float:
            return a.width === /** @type {{ width?: FloatWidthValue }} */ (b).width;

        case TypeKind.Bool:
        case TypeKind.Char:
        case TypeKind.String:
        case TypeKind.Unit:
        case TypeKind.Never:
            return true;

        case TypeKind.Tuple: {
            const bTuple = /** @type {{ elements?: Type[] }} */ (b);
            const bElements = bTuple.elements ?? [];
            if (a.elements.length !== bElements.length) return false;
            for (let i = 0; i < a.elements.length; i++) {
                if (!typeEquals(a.elements[i], bElements[i]))
                    return false;
            }
            return true;
        }

        case TypeKind.Array: {
            const bArray =
                /** @type {{ kind: typeof TypeKind.Array, element: Type, length: number }} */ (
                    b
                );
            return (
                a.length === bArray.length &&
                typeEquals(a.element, bArray.element)
            );
        }

        case TypeKind.Slice: {
            const bSlice =
                /** @type {{ kind: typeof TypeKind.Slice, element: Type }} */ (b);
            return typeEquals(a.element, bSlice.element);
        }

        case TypeKind.Struct: {
            const bStruct =
                /** @type {{ kind: typeof TypeKind.Struct, name: string, fields: { name: string, type: Type }[] }} */ (
                    b
                );
            if (a.name !== bStruct.name) return false;
            if (a.fields.length !== bStruct.fields.length) return false;
            for (let i = 0; i < a.fields.length; i++) {
                if (a.fields[i].name !== bStruct.fields[i].name) return false;
                if (!typeEquals(a.fields[i].type, bStruct.fields[i].type))
                    return false;
            }
            return true;
        }

        case TypeKind.Enum: {
            const bEnum =
                /** @type {{ kind: typeof TypeKind.Enum, name: string, variants: { name: string, fields?: Type[] }[] }} */ (
                    b
                );
            if (a.name !== bEnum.name) return false;
            if (a.variants.length !== bEnum.variants.length) return false;
            for (let i = 0; i < a.variants.length; i++) {
                if (a.variants[i].name !== bEnum.variants[i].name) return false;
                const aFields = a.variants[i].fields;
                const bFields = bEnum.variants[i].fields;
                if (!aFields && !bFields) continue;
                if (!aFields || !bFields) return false;
                if (aFields.length !== bFields.length) return false;
                for (let j = 0; j < aFields.length; j++) {
                    if (!typeEquals(aFields[j], bFields[j])) return false;
                }
            }
            return true;
        }

        case TypeKind.Ref: {
            const bRef =
                /** @type {{ kind: typeof TypeKind.Ref, inner: Type, mutable: boolean }} */ (
                    b
                );
            return (
                a.mutable === bRef.mutable && typeEquals(a.inner, bRef.inner)
            );
        }

        case TypeKind.Ptr: {
            const bPtr =
                /** @type {{ kind: typeof TypeKind.Ptr, inner: Type, mutable: boolean }} */ (
                    b
                );
            return (
                a.mutable === bPtr.mutable && typeEquals(a.inner, bPtr.inner)
            );
        }

        case TypeKind.Fn: {
            const bFn =
                /** @type {{ kind: typeof TypeKind.Fn, params: Type[], returnType: Type, isUnsafe: boolean, isConst: boolean }} */ (
                    b
                );
            if (a.params.length !== bFn.params.length) return false;
            if (a.isUnsafe !== bFn.isUnsafe) return false;
            if (a.isConst !== bFn.isConst) return false;
            for (let i = 0; i < a.params.length; i++) {
                if (!typeEquals(a.params[i], bFn.params[i])) return false;
            }
            return typeEquals(a.returnType, bFn.returnType);
        }

        case TypeKind.Named: {
            const bNamed =
                /** @type {{ kind: typeof TypeKind.Named, name: string, args: Type[] | null }} */ (
                    b
                );
            if (a.name !== bNamed.name) return false;
            if (!a.args && !bNamed.args) return true;
            if (!a.args || !bNamed.args) return false;
            if (a.args.length !== bNamed.args.length) return false;
            for (let i = 0; i < a.args.length; i++) {
                if (!typeEquals(a.args[i], bNamed.args[i])) return false;
            }
            return true;
        }

        default:
            return false;
    }
}

/**
 * Convert type to human-readable string
 * @param {Type} type
 * @returns {string}
 */
function typeToString(type) {
    switch (type.kind) {
        case TypeKind.Int:
            return intWidthToString(type.width);

        case TypeKind.Float:
            return floatWidthToString(type.width);

        case TypeKind.Bool:
            return "bool";

        case TypeKind.Char:
            return "char";

        case TypeKind.String:
            return "&str";

        case TypeKind.Unit:
            return "()";

        case TypeKind.Never:
            return "!";

        case TypeKind.Tuple:
            return `(${type.elements.map(typeToString).join(", ")})`;

        case TypeKind.Array:
            return `[${typeToString(type.element)}; ${type.length}]`;

        case TypeKind.Slice:
            return `[${typeToString(type.element)}]`;

        case TypeKind.Struct:
            return type.name;

        case TypeKind.Enum:
            return type.name;

        case TypeKind.Ref:
            return `&${type.mutable ? "mut " : ""}${typeToString(type.inner)}`;

        case TypeKind.Ptr:
            return `*${type.mutable ? "mut " : "const "}${typeToString(type.inner)}`;

        case TypeKind.Fn: {
            const params = type.params.map(typeToString).join(", ");
            const ret = typeToString(type.returnType);
            const unsafe = type.isUnsafe ? "unsafe " : "";
            const const_ = type.isConst ? "const " : "";
            return `${const_}${unsafe}fn(${params}) -> ${ret}`;
        }

        case TypeKind.TypeVar:
            if (type.bound) {
                return typeToString(type.bound);
            }
            return `?${type.id}`;

        case TypeKind.Named: {
            if (!type.args || type.args.length === 0) {
                return type.name;
            }
            return `${type.name}<${type.args.map(typeToString).join(", ")}>`;
        }

        default:
            return `<unknown>`;
    }
}

/**
 * @param {IntWidthValue} width
 * @returns {string}
 */
function intWidthToString(width) {
    switch (width) {
        case IntWidth.I8:
            return "i8";
        case IntWidth.I16:
            return "i16";
        case IntWidth.I32:
            return "i32";
        case IntWidth.I64:
            return "i64";
        case IntWidth.I128:
            return "i128";
        case IntWidth.Isize:
            return "isize";
        case IntWidth.U8:
            return "u8";
        case IntWidth.U16:
            return "u16";
        case IntWidth.U32:
            return "u32";
        case IntWidth.U64:
            return "u64";
        case IntWidth.U128:
            return "u128";
        case IntWidth.Usize:
            return "usize";
        default:
            return `<unknown int>`;
    }
}

/**
 * @param {FloatWidthValue} width
 * @returns {string}
 */
function floatWidthToString(width) {
    switch (width) {
        case FloatWidth.F32:
            return "f32";
        case FloatWidth.F64:
            return "f64";
        default:
            return `<unknown float>`;
    }
}

/**
 * Check if type is an integer type
 * @param {Type} type
 * @returns {boolean}
 */
function isIntegerType(type) {
    return type.kind === TypeKind.Int;
}

/**
 * Check if type is a float type
 * @param {Type} type
 * @returns {boolean}
 */
function isFloatType(type) {
    return type.kind === TypeKind.Float;
}

/**
 * Check if type is numeric (integer or float)
 * @param {Type} type
 * @returns {boolean}
 */
function isNumericType(type) {
    return type.kind === TypeKind.Int || type.kind === TypeKind.Float;
}

/**
 * Check if type is a reference type (&T or &mut T)
 * @param {Type} type
 * @returns {boolean}
 */
function isReferenceType(type) {
    return type.kind === TypeKind.Ref;
}

/**
 * Check if type is a pointer type (*const T or *mut T)
 * @param {Type} type
 * @returns {boolean}
 */
function isPointerType(type) {
    return type.kind === TypeKind.Ptr;
}

/**
 * Check if type is a function type
 * @param {Type} type
 * @returns {boolean}
 */
function isFnType(type) {
    return type.kind === TypeKind.Fn;
}

/**
 * Check if type is a tuple type
 * @param {Type} type
 * @returns {boolean}
 */
function isTupleType(type) {
    return type.kind === TypeKind.Tuple;
}

/**
 * Check if type is an array type
 * @param {Type} type
 * @returns {boolean}
 */
function isArrayType(type) {
    return type.kind === TypeKind.Array;
}

/**
 * Check if type is a slice type
 * @param {Type} type
 * @returns {boolean}
 */
function isSliceType(type) {
    return type.kind === TypeKind.Slice;
}

/**
 * Check if type is unit type
 * @param {Type} type
 * @returns {boolean}
 */
function isUnitType(type) {
    return type.kind === TypeKind.Unit;
}

/**
 * Check if type is never type
 * @param {Type} type
 * @returns {boolean}
 */
function isNeverType(type) {
    return type.kind === TypeKind.Never;
}

/**
 * Check if type is bool type
 * @param {Type} type
 * @returns {boolean}
 */
function isBoolType(type) {
    return type.kind === TypeKind.Bool;
}

/**
 * Check if type is char type
 * @param {Type} type
 * @returns {boolean}
 */
function isCharType(type) {
    return type.kind === TypeKind.Char;
}

/**
 * Check if type is string type
 * @param {Type} type
 * @returns {boolean}
 */
function isStringType(type) {
    return type.kind === TypeKind.String;
}

/**
 * Check if type is a type variable
 * @param {Type} type
 * @returns {boolean}
 */
function isTypeVar(type) {
    return type.kind === TypeKind.TypeVar;
}

/**
 * Check if type is a named type (unresolved)
 * @param {Type} type
 * @returns {boolean}
 */
function isNamedType(type) {
    return type.kind === TypeKind.Named;
}

/**
 * Check if type is a struct type
 * @param {Type} type
 * @returns {boolean}
 */
function isStructType(type) {
    return type.kind === TypeKind.Struct;
}

/**
 * Check if type is an enum type
 * @param {Type} type
 * @returns {boolean}
 */
function isEnumType(type) {
    return type.kind === TypeKind.Enum;
}

/**
 * Check if a type is copyable in the relaxed ownership model.
 * Named type copyability is delegated to `options.hasNamedTypeCopy`.
 * @param {Type} type
 * @param {{
 *   resolveType?: (type: Type) => Type,
 *   hasNamedTypeCopy?: (name: string) => boolean
 * }} [options]
 * @returns {boolean}
 */
function isCopyableType(type, options = {}) {
    const resolveType = options.resolveType || ((/** @type {Type} */ t) => t);
    const hasNamedTypeCopy = options.hasNamedTypeCopy || (() => false);
    /** @type {Set<string>} */
    const seen = new Set();

    /**
     * @param {Type} ty
     * @returns {boolean}
     */
    function visit(ty) {
        const resolved = resolveType(ty);
        switch (resolved.kind) {
            case TypeKind.Int:
            case TypeKind.Float:
            case TypeKind.Bool:
            case TypeKind.Char:
            case TypeKind.Unit:
            case TypeKind.Never:
            case TypeKind.Ref:
            case TypeKind.Ptr:
            case TypeKind.Fn:
                return true;
            case TypeKind.String:
                return false;
            case TypeKind.Tuple:
                return resolved.elements.every(visit);
            case TypeKind.Array:
                return visit(resolved.element);
            case TypeKind.Slice:
                return visit(resolved.element);
            case TypeKind.TypeVar:
                return resolved.bound ? visit(resolved.bound) : false;
            case TypeKind.Struct:
            case TypeKind.Enum:
            case TypeKind.Named: {
                const key = `${resolved.kind}:${resolved.name}`;
                if (seen.has(key)) {
                    return true;
                }
                seen.add(key);
                let argsCopy = true;
                if (resolved.kind === TypeKind.Named && resolved.args) {
                    argsCopy = resolved.args.every(visit);
                }
                const namedCopy = hasNamedTypeCopy(resolved.name);
                seen.delete(key);
                return argsCopy && namedCopy;
            }
            default:
                return false;
        }
    }

    return visit(type);
}

/**
 * Get the size of an integer type in bytes
 * @param {IntWidthValue} width
 * @returns {number}
 */
function getIntWidthSize(width) {
    switch (width) {
        case IntWidth.I8:
        case IntWidth.U8:
            return 1;
        case IntWidth.I16:
        case IntWidth.U16:
            return 2;
        case IntWidth.I32:
        case IntWidth.U32:
            return 4;
        case IntWidth.I64:
        case IntWidth.U64:
            return 8;
        case IntWidth.I128:
        case IntWidth.U128:
            return 16;
        case IntWidth.Isize:
        case IntWidth.Usize:
            // Assume 64-bit platform
            return 8;
        default:
            return 0;
    }
}

/**
 * Check if integer type is signed
 * @param {IntWidthValue} width
 * @returns {boolean}
 */
function isSignedInt(width) {
    return width <= IntWidth.Isize;
}

export {
    TypeKind,
    IntWidth,
    FloatWidth,
    // Primitive types
    makeIntType,
    makeFloatType,
    makeBoolType,
    makeCharType,
    makeStringType,
    makeUnitType,
    makeNeverType,
    // Composite types
    makeTupleType,
    makeArrayType,
    makeSliceType,
    makeStructType,
    makeEnumType,
    // Reference types
    makeRefType,
    makePtrType,
    // Function type
    makeFnType,
    // Type variables
    makeTypeVar,
    makeBoundTypeVar,
    isBoundTypeVar,
    isUnboundTypeVar,
    resetTypeVarId,
    // Named type
    makeNamedType,
    // Type utilities
    typeEquals,
    typeToString,
    intWidthToString,
    floatWidthToString,
    isIntegerType,
    isFloatType,
    isNumericType,
    isReferenceType,
    isPointerType,
    isFnType,
    isTupleType,
    isArrayType,
    isSliceType,
    isUnitType,
    isNeverType,
    isBoolType,
    isCharType,
    isStringType,
    isTypeVar,
    isNamedType,
    isStructType,
    isEnumType,
    isCopyableType,
    getIntWidthSize,
    isSignedInt,
};
