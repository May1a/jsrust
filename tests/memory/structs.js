import { layoutStruct, layoutTuple, LayoutCache } from "../../memory_layout.js";

import { IntWidth, FloatWidth } from "../../types.js";
import { IRTypeKind } from "../../ir.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

// ============================================================================
// Task 10.3: Composite Layouts
// ============================================================================

test("layoutStruct returns empty layout for no fields", () => {
    const cache = new LayoutCache();
    const layout = layoutStruct([], cache);

    assertEqual(layout.size, 0);
    assertEqual(layout.align, 1);
    assertTrue(layout.fieldOffsets !== null);
    assertEqual(layout.fieldOffsets.length, 0);
});

test("layoutStruct calculates layout for single field", () => {
    const cache = new LayoutCache();
    const fields = [{ kind: IRTypeKind.Int, width: IntWidth.I32 }];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 4);
    assertEqual(layout.align, 4);
    assertTrue(layout.fieldOffsets !== null);
    assertEqual(layout.fieldOffsets.length, 1);
    assertEqual(layout.fieldOffsets[0], 0);
});

test("layoutStruct calculates layout for two i32 fields", () => {
    const cache = new LayoutCache();
    const fields = [
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 8);
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets[0], 0);
    assertEqual(layout.fieldOffsets[1], 4);
});

test("layoutStruct adds padding between fields", () => {
    const cache = new LayoutCache();
    // bool (1 byte) + padding (3 bytes) + i32 (4 bytes)
    const fields = [
        { kind: IRTypeKind.Bool },
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 8);
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets[0], 0); // bool at offset 0
    assertEqual(layout.fieldOffsets[1], 4); // i32 at offset 4 (after padding)
});

test("layoutStruct adds tail padding", () => {
    const cache = new LayoutCache();
    // i32 (4 bytes) + bool (1 byte) + tail padding (3 bytes)
    const fields = [
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
        { kind: IRTypeKind.Bool },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 8); // Must be multiple of 4 (alignment)
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets[0], 0); // i32 at offset 0
    assertEqual(layout.fieldOffsets[1], 4); // bool at offset 4
});

test("layoutStruct handles i64 alignment", () => {
    const cache = new LayoutCache();
    // bool (1 byte) + padding (7 bytes) + i64 (8 bytes)
    const fields = [
        { kind: IRTypeKind.Bool },
        { kind: IRTypeKind.Int, width: IntWidth.I64 },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 16);
    assertEqual(layout.align, 8);
    assertEqual(layout.fieldOffsets[0], 0);
    assertEqual(layout.fieldOffsets[1], 8);
});

test("layoutStruct handles mixed types", () => {
    const cache = new LayoutCache();
    // i8 (1) + padding (1) + i16 (2) + i32 (4) = 8 bytes
    const fields = [
        { kind: IRTypeKind.Int, width: IntWidth.I8 },
        { kind: IRTypeKind.Int, width: IntWidth.I16 },
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 8);
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets[0], 0); // i8 at 0
    assertEqual(layout.fieldOffsets[1], 2); // i16 at 2 (after 1 byte padding)
    assertEqual(layout.fieldOffsets[2], 4); // i32 at 4
});

test("layoutStruct handles f64", () => {
    const cache = new LayoutCache();
    // i32 (4) + padding (4) + f64 (8) = 16 bytes
    const fields = [
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
        { kind: IRTypeKind.Float, width: FloatWidth.F64 },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 16);
    assertEqual(layout.align, 8);
    assertEqual(layout.fieldOffsets[0], 0);
    assertEqual(layout.fieldOffsets[1], 8);
});

test("layoutStruct handles pointers", () => {
    const cache = new LayoutCache();
    // bool (1) + padding (7) + ptr (8) = 16 bytes
    const fields = [
        { kind: IRTypeKind.Bool },
        { kind: IRTypeKind.Ptr, inner: null },
    ];
    const layout = layoutStruct(fields, cache);

    assertEqual(layout.size, 16);
    assertEqual(layout.align, 8);
    assertEqual(layout.fieldOffsets[0], 0);
    assertEqual(layout.fieldOffsets[1], 8);
});

test("layoutTuple works like struct", () => {
    const cache = new LayoutCache();
    const elements = [
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
        { kind: IRTypeKind.Bool },
    ];
    const layout = layoutTuple(elements, cache);

    assertEqual(layout.size, 8);
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets[0], 0);
    assertEqual(layout.fieldOffsets[1], 4);
});

test("layoutStruct handles nested struct", () => {
    const cache = new LayoutCache();

    // Inner struct: i32 + bool = 8 bytes, align 4
    const innerFields = [
        { kind: IRTypeKind.Int, width: IntWidth.I32 },
        { kind: IRTypeKind.Bool },
    ];
    const innerLayout = layoutStruct(innerFields, cache);
    assertEqual(innerLayout.size, 8);

    // Outer struct: bool + inner + i64
    // bool (1) + padding (7) + inner (8) + i64 (8) = 24 bytes
    const outerFields = [
        { kind: IRTypeKind.Bool },
        { kind: IRTypeKind.Struct, name: "Inner", fields: innerFields },
        { kind: IRTypeKind.Int, width: IntWidth.I64 },
    ];
    const outerLayout = layoutStruct(outerFields, cache);

    assertEqual(outerLayout.align, 8);
    assertEqual(outerLayout.fieldOffsets[0], 0); // bool at 0
    assertEqual(outerLayout.fieldOffsets[1], 8); // inner at 8 (aligned to 4, but after bool padding)
    assertEqual(outerLayout.fieldOffsets[2], 16); // i64 at 16
});

export function runMemoryStructsTests() {
    const result = getResults();
    clearErrors();
    return 12;
}
