import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";
import {
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
    makeRefType,
    makePtrType,
    makeFnType,
    makeNamedType,
    intWidthToString,
    floatWidthToString,
    getIntWidthSize,
    isSignedInt,
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
    isStructType,
    isEnumType,
    isCopyableType,
    typeToString,
} from "../../src/types";

// ============================================================================
// intWidthToString
// ============================================================================

test("intWidthToString returns correct names", () => {
    assertEqual(intWidthToString(IntWidth.I8), "i8");
    assertEqual(intWidthToString(IntWidth.I16), "i16");
    assertEqual(intWidthToString(IntWidth.I32), "i32");
    assertEqual(intWidthToString(IntWidth.I64), "i64");
    assertEqual(intWidthToString(IntWidth.I128), "i128");
    assertEqual(intWidthToString(IntWidth.Isize), "isize");
    assertEqual(intWidthToString(IntWidth.U8), "u8");
    assertEqual(intWidthToString(IntWidth.U16), "u16");
    assertEqual(intWidthToString(IntWidth.U32), "u32");
    assertEqual(intWidthToString(IntWidth.U64), "u64");
    assertEqual(intWidthToString(IntWidth.U128), "u128");
    assertEqual(intWidthToString(IntWidth.Usize), "usize");
});

// ============================================================================
// floatWidthToString
// ============================================================================

test("floatWidthToString returns correct names", () => {
    assertEqual(floatWidthToString(FloatWidth.F32), "f32");
    assertEqual(floatWidthToString(FloatWidth.F64), "f64");
});

// ============================================================================
// getIntWidthSize
// ============================================================================

test("getIntWidthSize returns correct byte sizes", () => {
    assertEqual(getIntWidthSize(IntWidth.I8), 1);
    assertEqual(getIntWidthSize(IntWidth.U8), 1);
    assertEqual(getIntWidthSize(IntWidth.I16), 2);
    assertEqual(getIntWidthSize(IntWidth.U16), 2);
    assertEqual(getIntWidthSize(IntWidth.I32), 4);
    assertEqual(getIntWidthSize(IntWidth.U32), 4);
    assertEqual(getIntWidthSize(IntWidth.I64), 8);
    assertEqual(getIntWidthSize(IntWidth.U64), 8);
    assertEqual(getIntWidthSize(IntWidth.I128), 16);
    assertEqual(getIntWidthSize(IntWidth.U128), 16);
    assertEqual(getIntWidthSize(IntWidth.Isize), 8);
    assertEqual(getIntWidthSize(IntWidth.Usize), 8);
});

// ============================================================================
// isSignedInt
// ============================================================================

test("isSignedInt returns true for signed integers", () => {
    assertTrue(isSignedInt(IntWidth.I8));
    assertTrue(isSignedInt(IntWidth.I16));
    assertTrue(isSignedInt(IntWidth.I32));
    assertTrue(isSignedInt(IntWidth.I64));
    assertTrue(isSignedInt(IntWidth.I128));
    assertTrue(isSignedInt(IntWidth.Isize));
});

test("isSignedInt returns false for unsigned integers", () => {
    assertTrue(!isSignedInt(IntWidth.U8));
    assertTrue(!isSignedInt(IntWidth.U16));
    assertTrue(!isSignedInt(IntWidth.U32));
    assertTrue(!isSignedInt(IntWidth.U64));
    assertTrue(!isSignedInt(IntWidth.U128));
    assertTrue(!isSignedInt(IntWidth.Usize));
});

// ============================================================================
// Type Predicate Functions
// ============================================================================

test("isIntegerType returns true only for integer types", () => {
    assertTrue(isIntegerType(makeIntType(IntWidth.I32)));
    assertTrue(!isIntegerType(makeFloatType(FloatWidth.F32)));
    assertTrue(!isIntegerType(makeBoolType()));
});

test("isFloatType returns true only for float types", () => {
    assertTrue(isFloatType(makeFloatType(FloatWidth.F32)));
    assertTrue(isFloatType(makeFloatType(FloatWidth.F64)));
    assertTrue(!isFloatType(makeIntType(IntWidth.I32)));
    assertTrue(!isFloatType(makeBoolType()));
});

test("isNumericType returns true for integers and floats", () => {
    assertTrue(isNumericType(makeIntType(IntWidth.I32)));
    assertTrue(isNumericType(makeIntType(IntWidth.U64)));
    assertTrue(isNumericType(makeFloatType(FloatWidth.F32)));
    assertTrue(isNumericType(makeFloatType(FloatWidth.F64)));
    assertTrue(!isNumericType(makeBoolType()));
    assertTrue(!isNumericType(makeCharType()));
    assertTrue(!isNumericType(makeUnitType()));
});

test("isReferenceType returns true only for reference types", () => {
    assertTrue(isReferenceType(makeRefType(makeIntType(IntWidth.I32), false)));
    assertTrue(isReferenceType(makeRefType(makeIntType(IntWidth.I32), true)));
    assertTrue(!isReferenceType(makeIntType(IntWidth.I32)));
    assertTrue(!isReferenceType(makePtrType(makeIntType(IntWidth.I32), false)));
});

test("isPointerType returns true only for pointer types", () => {
    assertTrue(isPointerType(makePtrType(makeIntType(IntWidth.I32), false)));
    assertTrue(isPointerType(makePtrType(makeIntType(IntWidth.I32), true)));
    assertTrue(!isPointerType(makeIntType(IntWidth.I32)));
    assertTrue(!isPointerType(makeRefType(makeIntType(IntWidth.I32), false)));
});

test("isFnType returns true only for function types", () => {
    assertTrue(isFnType(makeFnType([], makeUnitType(), false)));
    assertTrue(!isFnType(makeIntType(IntWidth.I32)));
    assertTrue(!isFnType(makeTupleType([])));
});

test("isTupleType returns true only for tuple types", () => {
    assertTrue(isTupleType(makeTupleType([])));
    assertTrue(isTupleType(makeTupleType([makeIntType(IntWidth.I32)])));
    assertTrue(!isTupleType(makeUnitType()));
    assertTrue(!isTupleType(makeArrayType(makeIntType(IntWidth.I32), 1)));
});

test("isArrayType returns true only for array types", () => {
    assertTrue(isArrayType(makeArrayType(makeIntType(IntWidth.I32), 10)));
    assertTrue(!isArrayType(makeSliceType(makeIntType(IntWidth.I32))));
    assertTrue(!isArrayType(makeTupleType([makeIntType(IntWidth.I32)])));
});

test("isSliceType returns true only for slice types", () => {
    assertTrue(isSliceType(makeSliceType(makeIntType(IntWidth.I32))));
    assertTrue(!isSliceType(makeArrayType(makeIntType(IntWidth.I32), 10)));
    assertTrue(!isSliceType(makeTupleType([makeIntType(IntWidth.I32)])));
});

test("isUnitType returns true only for unit types", () => {
    assertTrue(isUnitType(makeUnitType()));
    assertTrue(!isUnitType(makeTupleType([])));
    assertTrue(!isUnitType(makeBoolType()));
});

test("isNeverType returns true only for never types", () => {
    assertTrue(isNeverType(makeNeverType()));
    assertTrue(!isNeverType(makeUnitType()));
    assertTrue(!isNeverType(makeBoolType()));
});

test("isBoolType returns true only for bool types", () => {
    assertTrue(isBoolType(makeBoolType()));
    assertTrue(!isBoolType(makeIntType(IntWidth.I32)));
    assertTrue(!isBoolType(makeCharType()));
});

test("isCharType returns true only for char types", () => {
    assertTrue(isCharType(makeCharType()));
    assertTrue(!isCharType(makeBoolType()));
    assertTrue(!isCharType(makeIntType(IntWidth.U8)));
});

test("isStringType returns true only for string types", () => {
    assertTrue(isStringType(makeStringType()));
    assertTrue(!isStringType(makeCharType()));
    assertTrue(!isStringType(makeRefType(makeCharType(), false)));
});

test("isStructType returns true only for struct types", () => {
    const struct = { kind: 10, name: "Point", fields: [] };
    assertTrue(isStructType(struct));
    assertTrue(!isStructType(makeTupleType([])));
});

test("isEnumType returns true only for enum types", () => {
    const enumType = { kind: 11, name: "Option", variants: [] };
    assertTrue(isEnumType(enumType));
    assertTrue(!isEnumType(makeTupleType([])));
});

test("isCopyableType handles primitives and aggregates", () => {
    assertTrue(isCopyableType(makeIntType(IntWidth.I32)));
    assertTrue(isCopyableType(makeRefType(makeIntType(IntWidth.I32), false)));
    assertTrue(
        isCopyableType(
            makeTupleType([
                makeIntType(IntWidth.I32),
                makeRefType(makeIntType(IntWidth.I32), false),
            ]),
        ),
    );
    assertTrue(
        !isCopyableType(
            makeTupleType([makeIntType(IntWidth.I32), makeStringType()]),
        ),
    );
});

test("isCopyableType delegates named type copyability", () => {
    const named = makeNamedType("S", null);
    assertTrue(
        isCopyableType(named, {
            hasNamedTypeCopy: (name) => name === "S",
        }),
    );
    assertTrue(
        !isCopyableType(named, {
            hasNamedTypeCopy: () => false,
        }),
    );
});

// ============================================================================
// typeToString
// ============================================================================

test("typeToString formats primitive types", () => {
    assertEqual(typeToString(makeIntType(IntWidth.I32)), "i32");
    assertEqual(typeToString(makeFloatType(FloatWidth.F64)), "f64");
    assertEqual(typeToString(makeBoolType()), "bool");
    assertEqual(typeToString(makeCharType()), "char");
    assertEqual(typeToString(makeStringType()), "&str");
    assertEqual(typeToString(makeUnitType()), "()");
    assertEqual(typeToString(makeNeverType()), "!");
});

test("typeToString formats tuple types", () => {
    assertEqual(typeToString(makeTupleType([])), "()");
    assertEqual(
        typeToString(makeTupleType([makeIntType(IntWidth.I32)])),
        "(i32)",
    );
    assertEqual(
        typeToString(
            makeTupleType([makeIntType(IntWidth.I32), makeBoolType()]),
        ),
        "(i32, bool)",
    );
});

test("typeToString formats array types", () => {
    assertEqual(
        typeToString(makeArrayType(makeIntType(IntWidth.I32), 0)),
        "[i32; 0]",
    );
    assertEqual(
        typeToString(makeArrayType(makeBoolType(), 100)),
        "[bool; 100]",
    );
});

test("typeToString formats slice types", () => {
    assertEqual(
        typeToString(makeSliceType(makeIntType(IntWidth.I32))),
        "[i32]",
    );
    assertEqual(typeToString(makeSliceType(makeBoolType())), "[bool]");
});

test("typeToString formats reference types", () => {
    assertEqual(
        typeToString(makeRefType(makeIntType(IntWidth.I32), false)),
        "&i32",
    );
    assertEqual(
        typeToString(makeRefType(makeIntType(IntWidth.I32), true)),
        "&mut i32",
    );
    assertEqual(
        typeToString(
            makeRefType(makeRefType(makeIntType(IntWidth.I32), false), true),
        ),
        "&mut &i32",
    );
});

test("typeToString formats pointer types", () => {
    assertEqual(
        typeToString(makePtrType(makeIntType(IntWidth.I32), false)),
        "*const i32",
    );
    assertEqual(
        typeToString(makePtrType(makeIntType(IntWidth.I32), true)),
        "*mut i32",
    );
});

test("typeToString formats function types", () => {
    assertEqual(
        typeToString(makeFnType([], makeUnitType(), false)),
        "fn() -> ()",
    );
    assertEqual(
        typeToString(
            makeFnType([makeIntType(IntWidth.I32)], makeBoolType(), false),
        ),
        "fn(i32) -> bool",
    );
    assertEqual(
        typeToString(
            makeFnType(
                [makeIntType(IntWidth.I32), makeFloatType(FloatWidth.F64)],
                makeUnitType(),
                false,
            ),
        ),
        "fn(i32, f64) -> ()",
    );
    assertEqual(
        typeToString(
            makeFnType(
                [makeIntType(IntWidth.I32)],
                makeIntType(IntWidth.I32),
                true,
            ),
        ),
        "unsafe fn(i32) -> i32",
    );
});

test("typeToString formats struct types", () => {
    const struct = { kind: 10, name: "Point", fields: [] };
    assertEqual(typeToString(struct), "Point");
});

test("typeToString formats enum types", () => {
    const enumType = { kind: 11, name: "Option", variants: [] };
    assertEqual(typeToString(enumType), "Option");
});

test("typeToString formats nested types", () => {
    // Array of references
    assertEqual(
        typeToString(
            makeArrayType(makeRefType(makeIntType(IntWidth.I32), false), 10),
        ),
        "[&i32; 10]",
    );
    // Function returning reference
    assertEqual(
        typeToString(
            makeFnType(
                [],
                makeRefType(makeIntType(IntWidth.I32), false),
                false,
            ),
        ),
        "fn() -> &i32",
    );
    // Tuple with arrays
    assertEqual(
        typeToString(
            makeTupleType([
                makeArrayType(makeIntType(IntWidth.I32), 10),
                makeSliceType(makeBoolType()),
            ]),
        ),
        "([i32; 10], [bool])",
    );
});

export function runTypeUtilitiesTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
