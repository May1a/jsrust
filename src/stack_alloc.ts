/**
 * Stack Allocation
 *
 * Allocates stack slots for local variables in functions.
 */

import { type IRFunction, type IRLocal } from "./ir";
import { type LayoutCache } from "./memory_layout";

// ============================================================================
// Task 10.10: Frame Layout
// ============================================================================

interface FrameLayout {
    slots: Map<number, number>;
    size: number;
    align: number;
}

function makeFrameLayout(
    slots: Map<number, number>,
    size: number,
    align: number,
): FrameLayout {
    return { slots, size, align };
}

// ============================================================================
// Task 10.8: Stack Slot Allocator
// ============================================================================

/**
 * Stack slot allocator for function locals
 */
class StackAllocator {
    currentOffset: number; // Current frame offset (negative, grows downward)
    maxAlign: number; // Maximum alignment required
    slots: Map<number, number>; // Map LocalId to offset

    constructor() {
        this.currentOffset = 0;
        this.maxAlign = 1;
        this.slots = new Map();
    }

    /**
     * Allocate a slot for a local variable
     */
    allocSlot(local: IRLocal, layoutCache: LayoutCache): number {
        const layout = layoutCache.getLayout(local.ty);

        // Update max alignment
        this.maxAlign = Math.max(this.maxAlign, layout.align);

        // Align the offset (growing downward, so we align before allocation)
        // The offset is negative, so we need to subtract
        const alignedOffset = alignDown(
            this.currentOffset - layout.size,
            layout.align,
        );

        this.currentOffset = alignedOffset;
        this.slots.set(local.id, alignedOffset);

        return alignedOffset;
    }

    /**
     * Get the current frame size (absolute value of currentOffset)
     */
    getFrameSize(): number {
        return Math.abs(this.currentOffset);
    }

    /**
     * Get the frame alignment
     */
    getFrameAlign(): number {
        return this.maxAlign;
    }

    /**
     * Get the final frame layout
     */
    getFrameLayout(): FrameLayout {
        // Align the final frame size to the max alignment
        const alignedSize = alignUp(this.getFrameSize(), this.maxAlign);
        return makeFrameLayout(new Map(this.slots), alignedSize, this.maxAlign);
    }
    /**
     * Reset the allocator
     */
    reset() {
        this.currentOffset = 0;
        this.maxAlign = 1;
        this.slots.clear();
    }
}

// ============================================================================
// Task 10.9: Slot Allocation Helpers
// ============================================================================

/**
 * Align offset down to alignment boundary (for downward-growing stack)
 */
function alignDown(offset: number, alignment: number): number {
    if (alignment <= 1) return offset;
    const remainder = offset % alignment;
    if (remainder === 0) return offset;
    return offset - remainder - alignment;
}

/**
 * Align offset up to alignment boundary
 */
function alignUp(offset: number, alignment: number): number {
    if (alignment <= 1) return offset;
    const remainder = offset % alignment;
    if (remainder === 0) return offset;
    return offset + (alignment - remainder);
}

/**
 * Sort locals by alignment (descending) for better packing
 */
function sortLocalsByAlignment(
    locals: IRLocal[],
    layoutCache: LayoutCache,
): IRLocal[] {
    return [...locals].sort((a, b) => {
        const layoutA = layoutCache.getLayout(a.ty);
        const layoutB = layoutCache.getLayout(b.ty);
        // Sort by alignment descending (larger alignment first)
        return layoutB.align - layoutA.align;
    });
}

// ============================================================================
// Task 10.11: Function Frame
// ============================================================================

/**
 * Compute frame layout for a function
 */
function computeFrame(fn: IRFunction, layoutCache: LayoutCache): FrameLayout {
    const allocator = new StackAllocator();

    // Sort locals by alignment for better packing
    const sortedLocals = sortLocalsByAlignment(fn.locals, layoutCache);

    // Allocate slots for each local
    for (const local of sortedLocals) {
        allocator.allocSlot(local, layoutCache);
    }

    return allocator.getFrameLayout();
}

/**
 * Compute frame layout for a function with params
 */
function computeFrameWithParams(
    fn: IRFunction,
    layoutCache: LayoutCache,
): { frame: FrameLayout; paramOffsets: number[] } {
    const allocator = new StackAllocator();

    // First allocate parameters (in reverse order, so first param is at lowest address)
    const paramOffsets: number[] = [];
    for (let i = fn.params.length - 1; i >= 0; i--) {
        const param = fn.params[i];
        const layout = layoutCache.getLayout(param.ty);
        allocator.maxAlign = Math.max(allocator.maxAlign, layout.align);
        const alignedOffset = alignDown(
            allocator.currentOffset - layout.size,
            layout.align,
        );
        allocator.currentOffset = alignedOffset;
        paramOffsets[i] = alignedOffset;
    }
    // Sort locals by alignment for better packing
    const sortedLocals = sortLocalsByAlignment(fn.locals, layoutCache);
    // Allocate slots for each local
    for (const local of sortedLocals) {
        allocator.allocSlot(local, layoutCache);
    }
    return {
        frame: allocator.getFrameLayout(),
        paramOffsets,
    };
}

export {
    makeFrameLayout,
    StackAllocator,
    alignDown,
    alignUp,
    sortLocalsByAlignment,
    computeFrame,
    computeFrameWithParams,
};
