import { layoutArray, LayoutCache } from "../../src/memory_layout";

import { IntWidth, FloatWidth } from "../../src/types";
import { IRTypeKind } from "../../src/ir";
import {
  test,
  assertEqual,
  getResults,
  clearErrors,
} from "../lib";

// ============================================================================
// Task 10.4: Array Layout
// ============================================================================

test("layoutArray returns empty layout for zero elements", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I32 },
    0,
    cache,
  );

  assertEqual(layout.size, 0);
  assertEqual(layout.align, 1);
});

test("layoutArray calculates layout for single i32", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I32 },
    1,
    cache,
  );

  assertEqual(layout.size, 4);
  assertEqual(layout.align, 4);
});

test("layoutArray calculates layout for multiple i32s", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I32 },
    10,
    cache,
  );

  assertEqual(layout.size, 40); // 4 * 10
  assertEqual(layout.align, 4);
});

test("layoutArray calculates layout for i8 array", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I8 },
    100,
    cache,
  );

  assertEqual(layout.size, 100); // 1 * 100
  assertEqual(layout.align, 1);
});

test("layoutArray calculates layout for i64 array", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I64 },
    5,
    cache,
  );

  assertEqual(layout.size, 40); // 8 * 5
  assertEqual(layout.align, 8);
});

test("layoutArray calculates layout for f64 array", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Float, width: FloatWidth.F64 },
    3,
    cache,
  );

  assertEqual(layout.size, 24); // 8 * 3
  assertEqual(layout.align, 8);
});

test("layoutArray calculates layout for bool array", () => {
  const cache = new LayoutCache();
  const layout = layoutArray({ kind: IRTypeKind.Bool }, 8, cache);

  assertEqual(layout.size, 8); // 1 * 8
  assertEqual(layout.align, 1);
});

test("layoutArray calculates layout for pointer array", () => {
  const cache = new LayoutCache();
  const layout = layoutArray({ kind: IRTypeKind.Ptr, inner: null }, 4, cache);

  assertEqual(layout.size, 32); // 8 * 4
  assertEqual(layout.align, 8);
});

test("layoutArray calculates layout for nested array", () => {
  const cache = new LayoutCache();
  // [i32; 4] inner array
  const innerArray = {
    kind: IRTypeKind.Array,
    element: { kind: IRTypeKind.Int, width: IntWidth.I32 },
    length: 4,
  };
  // [[i32; 4]; 3] outer array
  const layout = layoutArray(innerArray, 3, cache);

  assertEqual(layout.size, 48); // (4 * 4) * 3
  assertEqual(layout.align, 4);
});

test("layoutArray uses element alignment", () => {
  const cache = new LayoutCache();
  // Array of i64 has alignment 8
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I64 },
    2,
    cache,
  );

  assertEqual(layout.align, 8);
});

test("layoutArray calculates layout for large array", () => {
  const cache = new LayoutCache();
  const layout = layoutArray(
    { kind: IRTypeKind.Int, width: IntWidth.I32 },
    1000,
    cache,
  );

  assertEqual(layout.size, 4000); // 4 * 1000
  assertEqual(layout.align, 4);
});

export function runMemoryArraysTests() {
  const result = getResults();
  clearErrors();
  return 11;
}
