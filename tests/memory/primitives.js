import {
    makeTypeLayout,
    layoutI8,
    layoutI16,
    layoutI32,
    layoutI64,
    layoutI128,
    layoutF32,
    layoutF64,
    layoutBool,
    layoutPtr,
    layoutUnit,
    layoutInt,
    layoutFloat,
    alignTo,
    LayoutCache,
} from "../../src/memory_layout";

import { IntWidth, FloatWidth } from "../../src/types";
import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";

// ============================================================================
// Task 10.1: Layout Structure
// ============================================================================

test("makeTypeLayout creates layout with size and align", () => {
    const layout = makeTypeLayout(8, 4);
    assertEqual(layout.size, 8);
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets, null);
});

test("makeTypeLayout creates layout with field offsets", () => {
    const layout = makeTypeLayout(16, 8, [0, 8]);
    assertEqual(layout.size, 16);
    assertEqual(layout.align, 8);
    assertTrue(layout.fieldOffsets !== null);
    assertEqual(layout.fieldOffsets.length, 2);
    assertEqual(layout.fieldOffsets[0], 0);
    assertEqual(layout.fieldOffsets[1], 8);
});

// ============================================================================
// Task 10.2: Primitive Layouts
// ============================================================================

test("layoutI8 returns correct layout", () => {
    const layout = layoutI8();
    assertEqual(layout.size, 1);
    assertEqual(layout.align, 1);
});

test("layoutI16 returns correct layout", () => {
    const layout = layoutI16();
    assertEqual(layout.size, 2);
    assertEqual(layout.align, 2);
});

test("layoutI32 returns correct layout", () => {
    const layout = layoutI32();
    assertEqual(layout.size, 4);
    assertEqual(layout.align, 4);
});

test("layoutI64 returns correct layout", () => {
    const layout = layoutI64();
    assertEqual(layout.size, 8);
    assertEqual(layout.align, 8);
});

test("layoutI128 returns correct layout", () => {
    const layout = layoutI128();
    assertEqual(layout.size, 16);
    assertEqual(layout.align, 16);
});

test("layoutF32 returns correct layout", () => {
    const layout = layoutF32();
    assertEqual(layout.size, 4);
    assertEqual(layout.align, 4);
});

test("layoutF64 returns correct layout", () => {
    const layout = layoutF64();
    assertEqual(layout.size, 8);
    assertEqual(layout.align, 8);
});

test("layoutBool returns correct layout", () => {
    const layout = layoutBool();
    assertEqual(layout.size, 1);
    assertEqual(layout.align, 1);
});

test("layoutPtr returns correct layout", () => {
    const layout = layoutPtr();
    assertEqual(layout.size, 8);
    assertEqual(layout.align, 8);
});

test("layoutUnit returns correct layout", () => {
    const layout = layoutUnit();
    assertEqual(layout.size, 0);
    assertEqual(layout.align, 1);
});

test("layoutInt returns correct layout for all widths", () => {
    // Signed integers
    assertEqual(layoutInt(IntWidth.I8).size, 1);
    assertEqual(layoutInt(IntWidth.I16).size, 2);
    assertEqual(layoutInt(IntWidth.I32).size, 4);
    assertEqual(layoutInt(IntWidth.I64).size, 8);
    assertEqual(layoutInt(IntWidth.I128).size, 16);
    assertEqual(layoutInt(IntWidth.Isize).size, 8); // 64-bit platform

    // Unsigned integers
    assertEqual(layoutInt(IntWidth.U8).size, 1);
    assertEqual(layoutInt(IntWidth.U16).size, 2);
    assertEqual(layoutInt(IntWidth.U32).size, 4);
    assertEqual(layoutInt(IntWidth.U64).size, 8);
    assertEqual(layoutInt(IntWidth.U128).size, 16);
    assertEqual(layoutInt(IntWidth.Usize).size, 8); // 64-bit platform
});

test("layoutFloat returns correct layout for all widths", () => {
    assertEqual(layoutFloat(FloatWidth.F32).size, 4);
    assertEqual(layoutFloat(FloatWidth.F32).align, 4);
    assertEqual(layoutFloat(FloatWidth.F64).size, 8);
    assertEqual(layoutFloat(FloatWidth.F64).align, 8);
});

// ============================================================================
// Task 10.7: Alignment Utilities
// ============================================================================

test("alignTo returns same offset for alignment 1", () => {
    assertEqual(alignTo(0, 1), 0);
    assertEqual(alignTo(5, 1), 5);
    assertEqual(alignTo(100, 1), 100);
});

test("alignTo aligns to 2-byte boundary", () => {
    assertEqual(alignTo(0, 2), 0);
    assertEqual(alignTo(1, 2), 2);
    assertEqual(alignTo(2, 2), 2);
    assertEqual(alignTo(3, 2), 4);
    assertEqual(alignTo(4, 2), 4);
    assertEqual(alignTo(5, 2), 6);
});

test("alignTo aligns to 4-byte boundary", () => {
    assertEqual(alignTo(0, 4), 0);
    assertEqual(alignTo(1, 4), 4);
    assertEqual(alignTo(2, 4), 4);
    assertEqual(alignTo(3, 4), 4);
    assertEqual(alignTo(4, 4), 4);
    assertEqual(alignTo(5, 4), 8);
    assertEqual(alignTo(7, 4), 8);
    assertEqual(alignTo(8, 4), 8);
});

test("alignTo aligns to 8-byte boundary", () => {
    assertEqual(alignTo(0, 8), 0);
    assertEqual(alignTo(1, 8), 8);
    assertEqual(alignTo(7, 8), 8);
    assertEqual(alignTo(8, 8), 8);
    assertEqual(alignTo(9, 8), 16);
    assertEqual(alignTo(15, 8), 16);
    assertEqual(alignTo(16, 8), 16);
});

test("alignTo aligns to 16-byte boundary", () => {
    assertEqual(alignTo(0, 16), 0);
    assertEqual(alignTo(1, 16), 16);
    assertEqual(alignTo(15, 16), 16);
    assertEqual(alignTo(16, 16), 16);
    assertEqual(alignTo(17, 16), 32);
});

// ============================================================================
// Task 10.6: Layout Cache
// ============================================================================

test("LayoutCache caches primitive layouts", () => {
    const cache = new LayoutCache();

    const i32a = cache.getLayout({ kind: 0, width: IntWidth.I32 }); // IRTypeKind.Int
    const i32b = cache.getLayout({ kind: 0, width: IntWidth.I32 });

    assertEqual(i32a.size, 4);
    assertEqual(i32a.align, 4);
    // Same object due to caching
    assertTrue(i32a === i32b);
});

test("LayoutCache returns different layouts for different types", () => {
    const cache = new LayoutCache();

    const i32 = cache.getLayout({ kind: 0, width: IntWidth.I32 });
    const i64 = cache.getLayout({ kind: 0, width: IntWidth.I64 });

    assertEqual(i32.size, 4);
    assertEqual(i64.size, 8);
    assertTrue(i32 !== i64);
});

export function runMemoryPrimitivesTests() {
    const result = getResults();
    clearErrors();
    return 28;
}
