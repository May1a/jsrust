/**
 * Stack Allocation
 *
 * Allocates stack slots for local variables in functions.
 */

/** @typedef {import('./ir.js').IRFunction} IRFunction */
/** @typedef {import('./ir.js').IRLocal} IRLocal */
/** @typedef {import('./ir.js').LocalId} LocalId */
/** @typedef {import('./memory_layout.js').TypeLayout} TypeLayout */

import { LayoutCache } from "./memory_layout.js";

// ============================================================================
// Task 10.10: Frame Layout
// ============================================================================

/**
 * @typedef {object} FrameLayout
 * @property {Map<number, number>} slots - Map LocalId to frame offset
 * @property {number} size - Total frame size in bytes
 * @property {number} align - Frame alignment requirement
 */

/**
 * Create a FrameLayout
 * @param {Map<number, number>} slots
 * @param {number} size
 * @param {number} align
 * @returns {FrameLayout}
 */
function makeFrameLayout(slots, size, align) {
    return { slots, size, align };
}

// ============================================================================
// Task 10.8: Stack Slot Allocator
// ============================================================================

/**
 * Stack slot allocator for function locals
 */
class StackAllocator {
    constructor() {
        /** @type {number} Current frame offset (negative, grows downward) */
        this.currentOffset = 0;
        /** @type {number} Maximum alignment required */
        this.maxAlign = 1;
        /** @type {Map<number, number>} Map LocalId to offset */
        this.slots = new Map();
    }

    /**
     * Allocate a slot for a local variable
     * @param {import('./ir.js').IRLocal} local
     * @param {LayoutCache} layoutCache
     * @returns {number} Frame-relative offset (negative)
     */
    allocSlot(local, layoutCache) {
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
     * @returns {number}
     */
    getFrameSize() {
        return Math.abs(this.currentOffset);
    }

    /**
     * Get the frame alignment
     * @returns {number}
     */
    getFrameAlign() {
        return this.maxAlign;
    }

    /**
     * Get the final frame layout
     * @returns {FrameLayout}
     */
    getFrameLayout() {
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
 * @param {number} offset
 * @param {number} alignment
 * @returns {number}
 */
function alignDown(offset, alignment) {
    if (alignment <= 1) return offset;
    const remainder = offset % alignment;
    if (remainder === 0) return offset;
    return offset - remainder - alignment;
}

/**
 * Align offset up to alignment boundary
 * @param {number} offset
 * @param {number} alignment
 * @returns {number}
 */
function alignUp(offset, alignment) {
    if (alignment <= 1) return offset;
    const remainder = offset % alignment;
    if (remainder === 0) return offset;
    return offset + (alignment - remainder);
}

/**
 * Sort locals by alignment (descending) for better packing
 * @param {IRLocal[]} locals
 * @param {LayoutCache} layoutCache
 * @returns {IRLocal[]}
 */
function sortLocalsByAlignment(locals, layoutCache) {
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
 * @param {IRFunction} fn
 * @param {LayoutCache} layoutCache
 * @returns {FrameLayout}
 */
function computeFrame(fn, layoutCache) {
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
 * @param {IRFunction} fn
 * @param {LayoutCache} layoutCache
 * @returns {{ frame: FrameLayout, paramOffsets: number[] }}
 */
function computeFrameWithParams(fn, layoutCache) {
    const allocator = new StackAllocator();

    // First allocate parameters (in reverse order, so first param is at lowest address)
    const paramOffsets = [];
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

// ============================================================================
// Exports
// ============================================================================

export {
    makeFrameLayout,
    StackAllocator,
    alignDown,
    alignUp,
    sortLocalsByAlignment,
    computeFrame,
    computeFrameWithParams,
};
