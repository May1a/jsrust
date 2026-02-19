import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";
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
    makeBoundTypeVar,
    makeNamedType,
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
    typeEquals,
    typeToString,
    resetTypeVarId,
} from "../../types.js";

// ============================================================================
// Task 3.1: Primitive Types
// ============================================================================

test("makeIntType creates integer types", () => {
    const i32 = makeIntType(IntWidth.I32);
    assertEqual(i32.kind, TypeKind.Int);
    assertEqual(i32.width, IntWidth.I32);
    assertTrue(isIntegerType(i32));
    assertEqual(typeToString(i32), "i32");
});

test("makeIntType creates all integer widths", () => {
    const widths = [
        IntWidth.I8,
        IntWidth.I16,
        IntWidth.I32,
        IntWidth.I64,
        IntWidth.I128,
        IntWidth.Isize,
        IntWidth.U8,
        IntWidth.U16,
        IntWidth.U32,
        IntWidth.U64,
        IntWidth.U128,
        IntWidth.Usize,
    ];
    const names = [
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
    ];
    for (let i = 0; i < widths.length; i++) {
        const t = makeIntType(widths[i]);
        assertEqual(t.kind, TypeKind.Int);
        assertEqual(t.width, widths[i]);
        assertEqual(typeToString(t), names[i]);
    }
});

test("makeFloatType creates float types", () => {
    const f32 = makeFloatType(FloatWidth.F32);
    assertEqual(f32.kind, TypeKind.Float);
    assertEqual(f32.width, FloatWidth.F32);
    assertTrue(isFloatType(f32));
    assertEqual(typeToString(f32), "f32");

    const f64 = makeFloatType(FloatWidth.F64);
    assertEqual(f64.kind, TypeKind.Float);
    assertEqual(f64.width, FloatWidth.F64);
    assertEqual(typeToString(f64), "f64");
});

test("makeBoolType creates bool type", () => {
    const bool = makeBoolType();
    assertEqual(bool.kind, TypeKind.Bool);
    assertTrue(isBoolType(bool));
    assertEqual(typeToString(bool), "bool");
});

test("makeCharType creates char type", () => {
    const char = makeCharType();
    assertEqual(char.kind, TypeKind.Char);
    assertTrue(isCharType(char));
    assertEqual(typeToString(char), "char");
});

test("makeStringType creates string type", () => {
    const str = makeStringType();
    assertEqual(str.kind, TypeKind.String);
    assertTrue(isStringType(str));
    assertEqual(typeToString(str), "&str");
});

test("makeUnitType creates unit type", () => {
    const unit = makeUnitType();
    assertEqual(unit.kind, TypeKind.Unit);
    assertTrue(isUnitType(unit));
    assertEqual(typeToString(unit), "()");
});

test("makeNeverType creates never type", () => {
    const never = makeNeverType();
    assertEqual(never.kind, TypeKind.Never);
    assertTrue(isNeverType(never));
    assertEqual(typeToString(never), "!");
});

test("isNumericType returns true for integers and floats", () => {
    assertTrue(isNumericType(makeIntType(IntWidth.I32)));
    assertTrue(isNumericType(makeIntType(IntWidth.U64)));
    assertTrue(isNumericType(makeFloatType(FloatWidth.F32)));
    assertTrue(!isNumericType(makeBoolType()));
    assertTrue(!isNumericType(makeUnitType()));
});

// ============================================================================
// Task 3.2: Composite Types
// ============================================================================

test("makeTupleType creates tuple types", () => {
    const tuple = makeTupleType([makeIntType(IntWidth.I32), makeBoolType()]);
    assertEqual(tuple.kind, TypeKind.Tuple);
    assertEqual(tuple.elements.length, 2);
    assertTrue(isTupleType(tuple));
    assertEqual(typeToString(tuple), "(i32, bool)");
});

test("makeTupleType creates empty tuple (unit)", () => {
    const empty = makeTupleType([]);
    assertEqual(empty.kind, TypeKind.Tuple);
    assertEqual(empty.elements.length, 0);
    assertEqual(typeToString(empty), "()");
});

test("makeTupleType creates nested tuples", () => {
    const inner = makeTupleType([makeIntType(IntWidth.I32), makeBoolType()]);
    const outer = makeTupleType([inner, makeFloatType(FloatWidth.F64)]);
    assertEqual(typeToString(outer), "((i32, bool), f64)");
});

test("makeArrayType creates array types", () => {
    const arr = makeArrayType(makeIntType(IntWidth.I32), 10);
    assertEqual(arr.kind, TypeKind.Array);
    assertEqual(arr.length, 10);
    assertTrue(isArrayType(arr));
    assertEqual(typeToString(arr), "[i32; 10]");
});

test("makeSliceType creates slice types", () => {
    const slice = makeSliceType(makeIntType(IntWidth.I32));
    assertEqual(slice.kind, TypeKind.Slice);
    assertTrue(isSliceType(slice));
    assertEqual(typeToString(slice), "[i32]");
});

test("makeStructType creates struct types", () => {
    const struct = makeStructType("Point", [
        { name: "x", type: makeIntType(IntWidth.I32) },
        { name: "y", type: makeIntType(IntWidth.I32) },
    ]);
    assertEqual(struct.kind, TypeKind.Struct);
    assertEqual(struct.name, "Point");
    assertEqual(struct.fields.length, 2);
    assertTrue(isStructType(struct));
    assertEqual(typeToString(struct), "Point");
});

test("makeEnumType creates enum types", () => {
    const enumType = makeEnumType("Option", [
        { name: "Some", fields: [makeIntType(IntWidth.I32)] },
        { name: "None" },
    ]);
    assertEqual(enumType.kind, TypeKind.Enum);
    assertEqual(enumType.name, "Option");
    assertEqual(enumType.variants.length, 2);
    assertTrue(isEnumType(enumType));
    assertEqual(typeToString(enumType), "Option");
});

// ============================================================================
// Task 3.3: Reference Types
// ============================================================================

test("makeRefType creates immutable reference types", () => {
    const ref = makeRefType(makeIntType(IntWidth.I32), false);
    assertEqual(ref.kind, TypeKind.Ref);
    assertEqual(ref.mutable, false);
    assertTrue(isReferenceType(ref));
    assertEqual(typeToString(ref), "&i32");
});

test("makeRefType creates mutable reference types", () => {
    const ref = makeRefType(makeIntType(IntWidth.I32), true);
    assertEqual(ref.kind, TypeKind.Ref);
    assertEqual(ref.mutable, true);
    assertEqual(typeToString(ref), "&mut i32");
});

test("makePtrType creates const pointer types", () => {
    const ptr = makePtrType(makeIntType(IntWidth.I32), false);
    assertEqual(ptr.kind, TypeKind.Ptr);
    assertEqual(ptr.mutable, false);
    assertTrue(isPointerType(ptr));
    assertEqual(typeToString(ptr), "*const i32");
});

test("makePtrType creates mutable pointer types", () => {
    const ptr = makePtrType(makeIntType(IntWidth.I32), true);
    assertEqual(ptr.kind, TypeKind.Ptr);
    assertEqual(ptr.mutable, true);
    assertEqual(typeToString(ptr), "*mut i32");
});

// ============================================================================
// Task 3.4: Function Types
// ============================================================================

test("makeFnType creates function types", () => {
    const fn = makeFnType(
        [makeIntType(IntWidth.I32), makeBoolType()],
        makeUnitType(),
        false,
    );
    assertEqual(fn.kind, TypeKind.Fn);
    assertEqual(fn.params.length, 2);
    assertEqual(fn.isUnsafe, false);
    assertTrue(isFnType(fn));
    assertEqual(typeToString(fn), "fn(i32, bool) -> ()");
});

test("makeFnType creates unsafe function types", () => {
    const fn = makeFnType(
        [makeIntType(IntWidth.I32)],
        makeIntType(IntWidth.I32),
        true,
    );
    assertEqual(fn.isUnsafe, true);
    assertEqual(typeToString(fn), "unsafe fn(i32) -> i32");
});

test("makeFnType creates function with no parameters", () => {
    const fn = makeFnType([], makeUnitType(), false);
    assertEqual(fn.params.length, 0);
    assertEqual(typeToString(fn), "fn() -> ()");
});

// ============================================================================
// Task 3.5: Type Variables
// ============================================================================

test("makeTypeVar creates unbound type variables", () => {
    resetTypeVarId();
    const tv = makeTypeVar();
    assertEqual(tv.kind, TypeKind.TypeVar);
    assertEqual(tv.id, 0);
    assertEqual(tv.bound, null);
    assertTrue(isTypeVar(tv));
    assertEqual(typeToString(tv), "?0");
});

test("makeTypeVar creates unique ids", () => {
    resetTypeVarId();
    const tv1 = makeTypeVar();
    const tv2 = makeTypeVar();
    assertEqual(tv1.id, 0);
    assertEqual(tv2.id, 1);
});

test("makeBoundTypeVar creates bound type variables", () => {
    const bound = makeIntType(IntWidth.I32);
    const tv = makeBoundTypeVar(0, bound);
    assertEqual(tv.kind, TypeKind.TypeVar);
    assertEqual(tv.id, 0);
    assertEqual(tv.bound, bound);
    assertEqual(typeToString(tv), "i32");
});

// ============================================================================
// Named Types
// ============================================================================

test("makeNamedType creates named types without args", () => {
    const named = makeNamedType("MyType", null);
    assertEqual(named.kind, TypeKind.Named);
    assertEqual(named.name, "MyType");
    assertEqual(named.args, null);
    assertTrue(isNamedType(named));
    assertEqual(typeToString(named), "MyType");
});

test("makeNamedType creates named types with args", () => {
    const named = makeNamedType("Vec", [makeIntType(IntWidth.I32)]);
    assertEqual(named.kind, TypeKind.Named);
    assertEqual(named.name, "Vec");
    assertEqual(named.args.length, 1);
    assertEqual(typeToString(named), "Vec<i32>");
});

// ============================================================================
// Type Equality
// ============================================================================

test("typeEquals returns true for identical primitive types", () => {
    assertTrue(
        typeEquals(makeIntType(IntWidth.I32), makeIntType(IntWidth.I32)),
    );
    assertTrue(
        typeEquals(
            makeFloatType(FloatWidth.F64),
            makeFloatType(FloatWidth.F64),
        ),
    );
    assertTrue(typeEquals(makeBoolType(), makeBoolType()));
    assertTrue(typeEquals(makeUnitType(), makeUnitType()));
    assertTrue(typeEquals(makeNeverType(), makeNeverType()));
});

test("typeEquals returns false for different primitive types", () => {
    assertTrue(
        !typeEquals(makeIntType(IntWidth.I32), makeIntType(IntWidth.I64)),
    );
    assertTrue(
        !typeEquals(makeIntType(IntWidth.I32), makeFloatType(FloatWidth.F32)),
    );
    assertTrue(!typeEquals(makeBoolType(), makeUnitType()));
});

test("typeEquals compares tuple types", () => {
    const t1 = makeTupleType([makeIntType(IntWidth.I32), makeBoolType()]);
    const t2 = makeTupleType([makeIntType(IntWidth.I32), makeBoolType()]);
    const t3 = makeTupleType([makeBoolType(), makeIntType(IntWidth.I32)]);
    assertTrue(typeEquals(t1, t2));
    assertTrue(!typeEquals(t1, t3));
});

test("typeEquals compares array types", () => {
    const a1 = makeArrayType(makeIntType(IntWidth.I32), 10);
    const a2 = makeArrayType(makeIntType(IntWidth.I32), 10);
    const a3 = makeArrayType(makeIntType(IntWidth.I32), 5);
    const a4 = makeArrayType(makeBoolType(), 10);
    assertTrue(typeEquals(a1, a2));
    assertTrue(!typeEquals(a1, a3));
    assertTrue(!typeEquals(a1, a4));
});

test("typeEquals compares reference types", () => {
    const r1 = makeRefType(makeIntType(IntWidth.I32), false);
    const r2 = makeRefType(makeIntType(IntWidth.I32), false);
    const r3 = makeRefType(makeIntType(IntWidth.I32), true);
    assertTrue(typeEquals(r1, r2));
    assertTrue(!typeEquals(r1, r3));
});

test("typeEquals compares function types", () => {
    const f1 = makeFnType([makeIntType(IntWidth.I32)], makeBoolType(), false);
    const f2 = makeFnType([makeIntType(IntWidth.I32)], makeBoolType(), false);
    const f3 = makeFnType([makeIntType(IntWidth.I32)], makeBoolType(), true);
    assertTrue(typeEquals(f1, f2));
    assertTrue(!typeEquals(f1, f3));
});

test("typeEquals compares type variables", () => {
    resetTypeVarId();
    const tv1 = makeTypeVar();
    const tv2 = makeTypeVar();
    const tv3 = makeTypeVar();
    const bound = makeIntType(IntWidth.I32);
    tv1.bound = bound;
    tv2.bound = bound;

    // Same id, both unbound
    assertTrue(typeEquals(tv3, tv3));
    // Different ids
    assertTrue(!typeEquals(tv1, tv2));
    // Same id, both bound to same type
    const b1 = makeBoundTypeVar(0, makeIntType(IntWidth.I32));
    const b2 = makeBoundTypeVar(0, makeIntType(IntWidth.I32));
    assertTrue(typeEquals(b1, b2));
});

export function runTypeRepresentationTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
