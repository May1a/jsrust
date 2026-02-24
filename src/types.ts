type TypeVarId = number;

export type Span = { line: number; column: number; start: number; end: number };

export const TypeKind = {
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
} as const satisfies Record<string, number>;

export type TypeKindValue = (typeof TypeKind)[keyof typeof TypeKind];

/**
 * Structural type model used throughout the compiler.
 */
export type IntType = {
    kind: typeof TypeKind.Int;
    width: IntWidth;
    span: Span;
};
export type FloatType = {
    kind: typeof TypeKind.Float;
    width: FloatWidth;
    span: Span;
};
export type BoolType = { kind: typeof TypeKind.Bool; span: Span };
export type CharType = { kind: typeof TypeKind.Char; span: Span };
export type StringType = { kind: typeof TypeKind.String; span: Span };
export type UnitType = { kind: typeof TypeKind.Unit; span: Span };
export type NeverType = { kind: typeof TypeKind.Never; span: Span };
export type TupleType = {
    kind: typeof TypeKind.Tuple;
    elements: Type[];
    span: Span;
};
export type ArrayType = {
    kind: typeof TypeKind.Array;
    element: Type;
    length: number;
    span: Span;
};
export type SliceType = {
    kind: typeof TypeKind.Slice;
    element: Type;
    span: Span;
};

export type StructField = {
    name: string;
    type: Type;
};

export type StructType = {
    kind: typeof TypeKind.Struct;
    name: string;
    fields: StructField[];
    span: Span;
};

export type EnumVariant = {
    name: string;
    fields: Type[];
};

export type EnumType = {
    kind: typeof TypeKind.Enum;
    name: string;
    variants: EnumVariant[];
    span: Span;
};

export type RefType = {
    kind: typeof TypeKind.Ref;
    inner: Type;
    mutable: boolean;
    span: Span;
};

export type PtrType = {
    kind: typeof TypeKind.Ptr;
    inner: Type;
    mutable: boolean;
    span: Span;
};

// TODO: have separate fn types of const and unsafe functions
export type FnType = {
    kind: typeof TypeKind.Fn;
    params: Type[];
    returnType: Type;
    isUnsafe: boolean;
    isConst: boolean;
    span: Span;
};

export type TypeVarType = {
    kind: typeof TypeKind.TypeVar;
    id: number;
    bound: Type | null;
    span: Span;
};

export type NamedType = {
    kind: typeof TypeKind.Named;
    name: string;
    args: Type[] | null;
    span: Span;
};

export type Type =
    | IntType
    | FloatType
    | BoolType
    | CharType
    | StringType
    | UnitType
    | NeverType
    | TupleType
    | ArrayType
    | SliceType
    | StructType
    | EnumType
    | RefType
    | PtrType
    | FnType
    | TypeVarType
    | NamedType;

export enum IntWidth {
    I8,
    I16,
    I32,
    I64,
    I128,
    Isize,
    U8,
    U16,
    U32,
    U64,
    U128,
    Usize,
}

export enum FloatWidth {
    F32,
    F64,
}

// ============================================================================
// Task 3.1: Type Representation - Primitive Types
// ============================================================================

function makeIntType(width: IntWidth, span: Span): Type {
    return { kind: TypeKind.Int, width, span };
}

function makeFloatType(width: FloatWidth, span: Span): Type {
    return { kind: TypeKind.Float, width, span };
}

function makeBoolType(span: Span): Type {
    return { kind: TypeKind.Bool, span };
}

function makeCharType(span: Span): Type {
    return { kind: TypeKind.Char, span };
}

function makeStringType(span: Span): Type {
    return { kind: TypeKind.String, span };
}

function makeUnitType(span: Span): Type {
    return { kind: TypeKind.Unit, span };
}

function makeNeverType(span: Span): Type {
    return { kind: TypeKind.Never, span };
}

// ============================================================================
// Task 3.2: Composite Types
// ============================================================================

function makeTupleType(elements: Type[], span: Span): Type {
    return { kind: TypeKind.Tuple, elements, span };
}

function makeArrayType(element: Type, length: number, span: Span): Type {
    return { kind: TypeKind.Array, element, length, span };
}

function makeSliceType(element: Type, span: Span): Type {
    return { kind: TypeKind.Slice, element, span };
}

function makeStructType(name: string, fields: StructField[], span: Span): Type {
    return { kind: TypeKind.Struct, name, fields, span };
}

function makeEnumType(name: string, variants: EnumVariant[], span: Span): Type {
    return { kind: TypeKind.Enum, name, variants, span };
}

// ============================================================================
// Task 3.3: Reference Types
// ============================================================================

function makeRefType(inner: Type, mutable: boolean, span: Span): Type {
    return { kind: TypeKind.Ref, inner, mutable, span };
}

function makePtrType(inner: Type, mutable: boolean, span: Span): Type {
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
function makeFnType(
    params: Type[],
    returnType: Type,
    isUnsafe: boolean,
    isConst: boolean = false,
    span: Span,
): Type {
    return { kind: TypeKind.Fn, params, returnType, isUnsafe, isConst, span };
}

// ============================================================================
// Task 3.5: Type Variables (for inference)
// ============================================================================

let nextTypeVarId: TypeVarId = 0;

/**
 * Reset type variable counter (useful for testing)
 */
function resetTypeVarId() {
    nextTypeVarId = 0;
}

function makeTypeVar(span: Span): Type {
    const id = nextTypeVarId++;
    return { kind: TypeKind.TypeVar, id, bound: null, span };
}

function makeBoundTypeVar(id: TypeVarId, type: Type, span: Span): Type {
    return { kind: TypeKind.TypeVar, id, bound: type, span };
}

function isBoundTypeVar(typeVar: Type): boolean {
    return typeVar.kind === TypeKind.TypeVar && typeVar.bound !== null;
}

function isUnboundTypeVar(typeVar: Type): boolean {
    return typeVar.kind === TypeKind.TypeVar && typeVar.bound === null;
}

// ============================================================================
// Named Type (for unresolved type references)
// ============================================================================

function makeNamedType(name: string, args: Type[] | null, span: Span): Type {
    return { kind: TypeKind.Named, name, args, span };
}

// TODO: rethink this
function makeOptionType(innerType: Type, span: Span): Type {
    return makeNamedType("Option", [innerType], span);
}

// ============================================================================
// Task 3.9: Type Utilities
// ============================================================================

function compareKind<
    T extends { kind: (typeof TypeKind)[keyof typeof TypeKind] },
>(a: T, b: { kind: (typeof TypeKind)[keyof typeof TypeKind] }): b is T {
    return a.kind === b.kind;
}

function typeEquals(a: Type, b: Type): boolean {
    if (!a || !b) throw "unreachable";
    // Handle type variables
    if (a.kind === TypeKind.TypeVar && b.kind === TypeKind.TypeVar) {
        if (a.id !== b.id) return false;
        if (!a.bound && !b.bound) return true;
        if (!a.bound || !b.bound) return false;
        return typeEquals(a.bound, b.bound);
    }

    // Different kinds are not equal
    if (!compareKind(a, b)) return false;

    switch (a.kind) {
        case TypeKind.Int: {
            return a.width === (b as typeof a).width;
        }
        case TypeKind.Float: {
            return a.width === (b as typeof a).width;
        }
        case TypeKind.Bool:
        case TypeKind.Char:
        case TypeKind.String:
        case TypeKind.Unit:
        case TypeKind.Never: {
            return true;
        }
        case TypeKind.Tuple: {
            const bElements = (b as typeof a).elements;
            if (a.elements.length !== bElements.length) return false;
            for (let i = 0; i < a.elements.length; i++) {
                if (!typeEquals(a.elements[i], bElements[i])) return false;
            }
            return true;
        }

        case TypeKind.Array: {
            const bArray = b as typeof a;
            return (
                a.length === bArray.length &&
                typeEquals(a.element, bArray.element)
            );
        }

        case TypeKind.Slice: {
            const bSlice = b as typeof a;
            return typeEquals(a.element, bSlice.element);
        }

        case TypeKind.Struct: {
            const bStruct = b as typeof a;
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
            const bEnum = b as typeof a;
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
            const bRef = b as typeof a;
            return (
                a.mutable === bRef.mutable && typeEquals(a.inner, bRef.inner)
            );
        }

        case TypeKind.Ptr: {
            const bPtr = b as typeof a;
            return (
                a.mutable === bPtr.mutable && typeEquals(a.inner, bPtr.inner)
            );
        }

        case TypeKind.Fn: {
            const bFn = b as typeof a;
            if (a.params.length !== bFn.params.length) return false;
            if (a.isUnsafe !== bFn.isUnsafe) return false;
            if (a.isConst !== bFn.isConst) return false;
            for (let i = 0; i < a.params.length; i++) {
                if (!typeEquals(a.params[i], bFn.params[i])) return false;
            }
            return typeEquals(a.returnType, bFn.returnType);
        }

        case TypeKind.Named: {
            const bNamed = b as typeof a;
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
function typeToString(type: Type): string {
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

function intWidthToString(width: IntWidth): string {
    const intStr = Object.entries(IntWidth).find((kv) => kv[1] == width);
    if (!intStr) return "<unknown int>";
    return intStr[0].toLowerCase();
}

function floatWidthToString(width: FloatWidth): string {
    const floatStr = Object.entries(FloatWidth).find((kv) => kv[1] == width);
    if (!floatStr) return `<unknown float>`;
    return floatStr[0].toLowerCase();
}

function isIntegerType(type: Type): boolean {
    return type.kind === TypeKind.Int;
}
function isFloatType(type: Type): boolean {
    return type.kind === TypeKind.Float;
}
function isNumericType(type: Type): boolean {
    return isIntegerType(type) || isFloatType(type);
}
function isReferenceType(type: Type): boolean {
    return type.kind === TypeKind.Ref;
}
function isPointerType(type: Type): boolean {
    return type.kind === TypeKind.Ptr;
}
function isFnType(type: Type): boolean {
    return type.kind === TypeKind.Fn;
}
function isTupleType(type: Type): boolean {
    return type.kind === TypeKind.Tuple;
}
function isArrayType(type: Type): boolean {
    return type.kind === TypeKind.Array;
}
function isSliceType(type: Type): boolean {
    return type.kind === TypeKind.Slice;
}
function isUnitType(type: Type): boolean {
    return type.kind === TypeKind.Unit;
}
function isNeverType(type: Type): boolean {
    return type.kind === TypeKind.Never;
}
function isBoolType(type: Type): boolean {
    return type.kind === TypeKind.Bool;
}
function isCharType(type: Type): boolean {
    return type.kind === TypeKind.Char;
}
function isStringType(type: Type): boolean {
    return type.kind === TypeKind.String;
}
function isTypeVar(type: Type): boolean {
    return type.kind === TypeKind.TypeVar;
}
function isNamedType(type: Type): boolean {
    return type.kind === TypeKind.Named;
}
function isStructType(type: Type): boolean {
    return type.kind === TypeKind.Struct;
}
function isEnumType(type: Type): boolean {
    return type.kind === TypeKind.Enum;
}

/**
 * Check if a type is copyable in the relaxed ownership model.
 * Named type copyability is delegated to `options.hasNamedTypeCopy`.
 */
function isCopyableType(
    type: Type,
    options: {
        resolveType?: (type: Type) => Type;
        hasNamedTypeCopy?: (name: string) => boolean;
    } = {},
): boolean {
    const resolveType = options.resolveType ?? ((t: Type) => t);
    const hasNamedTypeCopy = options.hasNamedTypeCopy ?? (() => false);
    const seen: Set<string> = new Set();

    const visit = (ty: Type): boolean => {
        const resolvedType = resolveType(ty);
        switch (resolvedType.kind) {
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
                return resolvedType.elements.every(visit);
            case TypeKind.Array:
                // TODO: should probably always return false?
                return visit(resolvedType.element);
            case TypeKind.Slice:
                // TODO: should probably always return true?
                return visit(resolvedType.element);
            case TypeKind.TypeVar:
                if (!resolvedType.bound) return false;
                return visit(resolvedType.bound);
            case TypeKind.Struct:
            case TypeKind.Enum:
            case TypeKind.Named: {
                const key = `${resolvedType.kind}:${resolvedType.name}`;
                if (seen.has(key)) {
                    return true;
                }
                seen.add(key);
                let argsCopy = true;
                if (resolvedType.kind === TypeKind.Named && resolvedType.args) {
                    argsCopy = resolvedType.args.every(visit);
                }
                const namedCopy = hasNamedTypeCopy(resolvedType.name);
                seen.delete(key);
                return argsCopy && namedCopy;
            }
            default:
                return false;
        }
    };

    return visit(type);
}

function getIntWidthSize(width: IntWidth): number {
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

function isSignedInt(width: IntWidth): boolean {
    return width <= IntWidth.Isize;
}

export {
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
    makeOptionType,
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
