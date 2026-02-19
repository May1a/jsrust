import {
    makeFrameLayout,
    StackAllocator,
    alignDown,
    alignUp,
    sortLocalsByAlignment,
    computeFrame,
    computeFrameWithParams,
} from "../../stack_alloc.js";

import { LayoutCache } from "../../memory_layout.js";
import { IntWidth } from "../../types.js";
import {
    IRTypeKind,
    makeIRFunction,
    makeIRParam,
    addIRLocal,
    makeIRLocal,
    resetIRIds,
} from "../../ir.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

// ============================================================================
// Task 10.10: Frame Layout
// ============================================================================

test("makeFrameLayout creates frame layout", () => {
    const slots = new Map([
        [0, -8],
        [1, -16],
    ]);
    const layout = makeFrameLayout(slots, 16, 8);

    assertEqual(layout.size, 16);
    assertEqual(layout.align, 8);
    assertEqual(layout.slots.size, 2);
    assertEqual(layout.slots.get(0), -8);
    assertEqual(layout.slots.get(1), -16);
});

// ============================================================================
// Task 10.8: Stack Slot Allocator
// ============================================================================

test("StackAllocator starts with zero offset", () => {
    const allocator = new StackAllocator();
    assertEqual(allocator.getFrameSize(), 0);
    assertEqual(allocator.getFrameAlign(), 1);
});

test("StackAllocator allocates single slot", () => {
    const cache = new LayoutCache();
    const allocator = new StackAllocator();

    const local = {
        id: 0,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I32 },
        name: "x",
    };
    const offset = allocator.allocSlot(local, cache);

    assertEqual(offset, -4);
    assertEqual(allocator.getFrameSize(), 4);
    assertEqual(allocator.getFrameAlign(), 4);
});

test("StackAllocator allocates multiple slots", () => {
    const cache = new LayoutCache();
    const allocator = new StackAllocator();

    const local1 = {
        id: 0,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I32 },
        name: "x",
    };
    const local2 = {
        id: 1,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I32 },
        name: "y",
    };

    const offset1 = allocator.allocSlot(local1, cache);
    const offset2 = allocator.allocSlot(local2, cache);

    assertEqual(offset1, -4);
    assertEqual(offset2, -8);
    assertEqual(allocator.getFrameSize(), 8);
});

test("StackAllocator handles different alignments", () => {
    const cache = new LayoutCache();
    const allocator = new StackAllocator();

    const local1 = {
        id: 0,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I32 },
        name: "x",
    };
    const local2 = {
        id: 1,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I64 },
        name: "y",
    };

    const offset1 = allocator.allocSlot(local1, cache);
    const offset2 = allocator.allocSlot(local2, cache);

    assertEqual(offset1, -4);
    // i64 needs 8-byte alignment, so it goes to -16 (after padding)
    assertEqual(offset2, -16);
    assertEqual(allocator.getFrameAlign(), 8);
});

test("StackAllocator getFrameLayout returns complete layout", () => {
    const cache = new LayoutCache();
    const allocator = new StackAllocator();

    const local = {
        id: 0,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I32 },
        name: "x",
    };
    allocator.allocSlot(local, cache);

    const layout = allocator.getFrameLayout();

    assertEqual(layout.size, 4);
    assertEqual(layout.align, 4);
    assertEqual(layout.slots.get(0), -4);
});

test("StackAllocator reset clears state", () => {
    const cache = new LayoutCache();
    const allocator = new StackAllocator();

    const local = {
        id: 0,
        ty: { kind: IRTypeKind.Int, width: IntWidth.I32 },
        name: "x",
    };
    allocator.allocSlot(local, cache);
    allocator.reset();

    assertEqual(allocator.getFrameSize(), 0);
    assertEqual(allocator.getFrameAlign(), 1);
    assertEqual(allocator.slots.size, 0);
});

// ============================================================================
// Task 10.9: Slot Allocation Helpers
// ============================================================================

test("alignDown aligns to boundary", () => {
    assertEqual(alignDown(0, 4), 0);
    assertEqual(alignDown(-1, 4), -4);
    assertEqual(alignDown(-3, 4), -4);
    assertEqual(alignDown(-4, 4), -4);
    assertEqual(alignDown(-5, 4), -8);
    assertEqual(alignDown(-7, 4), -8);
    assertEqual(alignDown(-8, 4), -8);
});

test("alignDown handles alignment 1", () => {
    assertEqual(alignDown(0, 1), 0);
    assertEqual(alignDown(-5, 1), -5);
    assertEqual(alignDown(-100, 1), -100);
});

test("alignUp aligns to boundary", () => {
    assertEqual(alignUp(0, 4), 0);
    assertEqual(alignUp(1, 4), 4);
    assertEqual(alignUp(3, 4), 4);
    assertEqual(alignUp(4, 4), 4);
    assertEqual(alignUp(5, 4), 8);
});

test("sortLocalsByAlignment sorts by alignment descending", () => {
    const cache = new LayoutCache();

    const locals = [
        { id: 0, ty: { kind: IRTypeKind.Int, width: IntWidth.I32 }, name: "a" }, // align 4
        { id: 1, ty: { kind: IRTypeKind.Bool }, name: "b" }, // align 1
        { id: 2, ty: { kind: IRTypeKind.Int, width: IntWidth.I64 }, name: "c" }, // align 8
    ];

    const sorted = sortLocalsByAlignment(locals, cache);

    assertEqual(sorted[0].id, 2); // i64, align 8
    assertEqual(sorted[1].id, 0); // i32, align 4
    assertEqual(sorted[2].id, 1); // bool, align 1
});

// ============================================================================
// Task 10.11: Function Frame
// ============================================================================

test("computeFrame handles empty function", () => {
    resetIRIds();
    const cache = new LayoutCache();

    const fn = makeIRFunction(0, "test", [], { kind: IRTypeKind.Unit });
    const layout = computeFrame(fn, cache);

    assertEqual(layout.size, 0);
    assertEqual(layout.align, 1);
    assertEqual(layout.slots.size, 0);
});

test("computeFrame handles function with locals", () => {
    resetIRIds();
    const cache = new LayoutCache();

    const fn = makeIRFunction(0, "test", [], { kind: IRTypeKind.Unit });
    addIRLocal(
        fn,
        makeIRLocal(0, { kind: IRTypeKind.Int, width: IntWidth.I32 }, "x"),
    );
    addIRLocal(
        fn,
        makeIRLocal(1, { kind: IRTypeKind.Int, width: IntWidth.I32 }, "y"),
    );

    const layout = computeFrame(fn, cache);

    assertEqual(layout.size, 8);
    assertEqual(layout.align, 4);
    assertEqual(layout.slots.size, 2);
});

test("computeFrame sorts locals by alignment", () => {
    resetIRIds();
    const cache = new LayoutCache();

    const fn = makeIRFunction(0, "test", [], { kind: IRTypeKind.Unit });
    // Add in "wrong" order
    addIRLocal(fn, makeIRLocal(0, { kind: IRTypeKind.Bool }, "a")); // align 1
    addIRLocal(
        fn,
        makeIRLocal(1, { kind: IRTypeKind.Int, width: IntWidth.I64 }, "b"),
    ); // align 8
    addIRLocal(
        fn,
        makeIRLocal(2, { kind: IRTypeKind.Int, width: IntWidth.I32 }, "c"),
    ); // align 4

    const layout = computeFrame(fn, cache);

    // After sorting by alignment: i64, i32, bool
    // i64 at -8, i32 at -12, bool at -13
    // Total size aligned to 8 = 16
    assertEqual(layout.align, 8);
    assertTrue(layout.slots.get(1) < layout.slots.get(2)); // i64 before i32
    assertTrue(layout.slots.get(2) < layout.slots.get(0)); // i32 before bool
});

test("computeFrameWithParams handles parameters", () => {
    resetIRIds();
    const cache = new LayoutCache();

    const fn = makeIRFunction(
        0,
        "test",
        [
            makeIRParam(0, "a", { kind: IRTypeKind.Int, width: IntWidth.I32 }),
            makeIRParam(1, "b", { kind: IRTypeKind.Int, width: IntWidth.I32 }),
        ],
        { kind: IRTypeKind.Unit },
    );

    addIRLocal(
        fn,
        makeIRLocal(0, { kind: IRTypeKind.Int, width: IntWidth.I64 }, "x"),
    );

    const { frame, paramOffsets } = computeFrameWithParams(fn, cache);

    assertEqual(paramOffsets.length, 2);
    // Parameters are allocated in reverse order
    // First param at lower address
    assertTrue(paramOffsets[0] > paramOffsets[1]);
});

export function runMemoryStackAllocTests() {
    const result = getResults();
    clearErrors();
    return 16;
}
