/**
 * Memory Layout Calculation
 *
 * Computes size, alignment, and field offsets for IR types.
 */

import type { IRType, IntWidthValue, FloatWidthValue } from "./ir";

import { IntWidth, FloatWidth } from "./types";
import { IRTypeKind } from "./ir";

// ============================================================================
// Task 10.1: Layout Structure
// ============================================================================

type TypeLayout = {
    size: number;
    align: number;
    fieldOffsets: number[] | null;
};

function makeTypeLayout(
    size: number,
    align: number,
    fieldOffsets: number[] | null = null,
): TypeLayout {
    return { size, align, fieldOffsets: fieldOffsets };
}

// ============================================================================
// Task 10.2: Primitive Layouts
// ============================================================================

/**
 * Layout for i8: size 1, align 1
 */
function layoutI8(): TypeLayout {
    return makeTypeLayout(1, 1);
}

/**
 * Layout for i16: size 2, align 2
 */
function layoutI16(): TypeLayout {
    return makeTypeLayout(2, 2);
}

/**
 * Layout for i32: size 4, align 4
 */
function layoutI32(): TypeLayout {
    return makeTypeLayout(4, 4);
}

/**
 * Layout for i64: size 8, align 8
 */
function layoutI64(): TypeLayout {
    return makeTypeLayout(8, 8);
}

/**
 * Layout for i128: size 16, align 16
 */
function layoutI128(): TypeLayout {
    return makeTypeLayout(16, 16);
}

/**
 * Layout for f32: size 4, align 4
 */
function layoutF32(): TypeLayout {
    return makeTypeLayout(4, 4);
}

/**
 * Layout for f64: size 8, align 8
 */
function layoutF64(): TypeLayout {
    return makeTypeLayout(8, 8);
}

/**
 * Layout for bool: size 1, align 1
 */
function layoutBool(): TypeLayout {
    return makeTypeLayout(1, 1);
}

/**
 * Layout for pointer: size 8, align 8 (64-bit)
 */
function layoutPtr(): TypeLayout {
    return makeTypeLayout(8, 8);
}

/**
 * Layout for unit: size 0, align 1
 */
function layoutUnit(): TypeLayout {
    return makeTypeLayout(0, 1);
}

/**
 * Get layout for integer type by width
 */
function layoutInt(width: IntWidthValue): TypeLayout {
    switch (width) {
        case IntWidth.I8:
        case IntWidth.U8:
            return layoutI8();
        case IntWidth.I16:
        case IntWidth.U16:
            return layoutI16();
        case IntWidth.I32:
        case IntWidth.U32:
            return layoutI32();
        case IntWidth.I64:
        case IntWidth.U64:
            return layoutI64();
        case IntWidth.I128:
        case IntWidth.U128:
            return layoutI128();
        case IntWidth.Isize:
        case IntWidth.Usize:
            // 64-bit platform
            return layoutI64();
        default:
            return layoutI8();
    }
}

/**
 * Get layout for float type by width
 */
function layoutFloat(width: FloatWidthValue): TypeLayout {
    switch (width) {
        case FloatWidth.F32:
            return layoutF32();
        case FloatWidth.F64:
            return layoutF64();
        default:
            throw "unreachable";
    }
}

// ============================================================================
// Task 10.7: Alignment Utilities
// ============================================================================

/**
 * Align offset up to the next alignment boundary
 */
function alignTo(offset: number, alignment: number): number {
    if (alignment <= 1) return offset;
    const remainder = offset % alignment;
    if (remainder === 0) return offset;
    return offset + (alignment - remainder);
}

// ============================================================================
// Task 10.3: Composite Layouts
// ============================================================================

/**
 * Layout for struct types
 */
function layoutStruct(fields: IRType[], layoutCache: LayoutCache): TypeLayout {
    if (fields.length === 0) {
        return makeTypeLayout(0, 1, []);
    }

    const fieldOffsets = [];
    let currentOffset = 0;
    let maxAlign = 1;

    for (const field of fields) {
        const fieldLayout = layoutCache.getLayout(field);
        maxAlign = Math.max(maxAlign, fieldLayout.align);

        // Align current offset to field's alignment
        currentOffset = alignTo(currentOffset, fieldLayout.align);
        fieldOffsets.push(currentOffset);
        currentOffset += fieldLayout.size;
    }
    // Apply tail padding (struct size must be multiple of alignment)
    const size = alignTo(currentOffset, maxAlign);
    return makeTypeLayout(size, maxAlign, fieldOffsets);
}

/**
 * Layout for tuple types (same as struct)
 */
function layoutTuple(elements: IRType[], layoutCache: LayoutCache): TypeLayout {
    return layoutStruct(elements, layoutCache);
}

// ============================================================================
// Task 10.4: Array Layout
// ============================================================================

/**
 * Layout for array types
 */
function layoutArray(
    element: IRType,
    count: number,
    layoutCache: LayoutCache,
): TypeLayout {
    if (count === 0) {
        return makeTypeLayout(0, 1);
    }
    const elementLayout = layoutCache.getLayout(element);
    const size = elementLayout.size * count;
    // Array alignment is the element's alignment
    const align = elementLayout.align;
    return makeTypeLayout(size, align);
}

// ============================================================================
// Task 10.5: Enum Layout
// ============================================================================

/**
 * Calculate the minimum tag size needed for a number of variants
 */
function calculateTagSize(variantCount: number): number {
    if (variantCount <= 0) return 0;
    if (variantCount <= 256) return 1; // u8
    if (variantCount <= 65536) return 2; // u16
    if (variantCount <= 4294967296) return 4; // u32
    return 8; // u64
}

/**
 * Layout for enum types
 *
 * Enum layout:
 * - Tag field (discriminant) at offset 0
 * - Largest variant data after the tag (aligned)
 */
function layoutEnum(
    variants: IRType[][],
    layoutCache: LayoutCache,
): TypeLayout {
    if (variants.length === 0) {
        // Empty enum (never type equivalent)
        return makeTypeLayout(0, 1);
    }

    if (variants.length === 1) {
        // Single variant - just the data
        const variantFields = variants[0];
        if (variantFields.length === 0) {
            return makeTypeLayout(0, 1);
        }
        return layoutStruct(variantFields, layoutCache);
    }

    // Calculate tag size
    const tagSize = calculateTagSize(variants.length);
    const tagAlign = tagSize;

    // Find the largest variant
    let maxVariantSize = 0;
    let maxVariantAlign = 1;

    for (const variantFields of variants) {
        if (variantFields.length === 0) {
            continue;
        }
        const variantLayout = layoutStruct(variantFields, layoutCache);
        maxVariantSize = Math.max(maxVariantSize, variantLayout.size);
        maxVariantAlign = Math.max(maxVariantAlign, variantLayout.align);
    }
    // Enum alignment is max of tag align and variant align
    const enumAlign = Math.max(tagAlign, maxVariantAlign);
    // Tag at offset 0
    // Variant data starts after tag, aligned to variant alignment
    const dataOffset = alignTo(tagSize, maxVariantAlign);
    // Total size = dataOffset + maxVariantSize, aligned to enum alignment
    const totalSize = alignTo(dataOffset + maxVariantSize, enumAlign);
    // Store field offsets: [tagOffset, dataOffset]
    const fieldOffsets = [0, dataOffset];
    return makeTypeLayout(totalSize, enumAlign, fieldOffsets);
}

// ============================================================================
// Task 10.6: Layout Cache
// ============================================================================

/**
 * Cache for computed type layouts
 */
class LayoutCache {
    cache: Map<string, TypeLayout>;
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get layout for a type (computes and caches if not present)
     */
    getLayout(type: IRType): TypeLayout {
        const key = this.typeKey(type);
        const cached = this.cache.get(key);
        if (cached) {
            return cached;
        }

        const layout = this.computeLayout(type);
        this.cache.set(key, layout);
        return layout;
    }
    /**
     * Generate a unique key for a type
     */
    typeKey(type: IRType): string {
        switch (type.kind) {
            case IRTypeKind.Int:
                return `int_${type.width}`;
            case IRTypeKind.Float:
                return `float_${type.width}`;
            case IRTypeKind.Bool:
                return "bool";
            case IRTypeKind.Ptr:
                return "ptr";
            case IRTypeKind.Unit:
                return "unit";
            case IRTypeKind.Struct:
                return `struct_${type.name}`;
            case IRTypeKind.Enum:
                return `enum_${type.name}`;
            case IRTypeKind.Array:
                return `array_${this.typeKey(/** @type {IRType} */ type.element!)}_${type.length}`;
            case IRTypeKind.Fn:
                return `fn_${(type.params ?? []).map((p) => this.typeKey(/** @type {IRType} */ p)).join("_")}_${this.typeKey(/** @type {IRType} */ type.returnType!)}`;
            default:
                return `unknown_${type.kind}`;
        }
    }

    /**
     * Compute layout for a type
     * @param {IRType} type
     * @returns {TypeLayout}
     */
    computeLayout(type: IRType): TypeLayout {
        switch (type.kind) {
            case IRTypeKind.Int:
                return layoutInt(type.width as IntWidthValue);
            case IRTypeKind.Float:
                return layoutFloat(type.width as FloatWidthValue);
            case IRTypeKind.Bool:
                return layoutBool();
            case IRTypeKind.Ptr:
                return layoutPtr();
            case IRTypeKind.Unit:
                return layoutUnit();
            case IRTypeKind.Struct:
                return layoutStruct(type.fields as IRType[], this);
            case IRTypeKind.Enum:
                return layoutEnum(type.variants as IRType[][], this);
            case IRTypeKind.Array:
                return layoutArray(type.element as IRType, type.length!, this);
            case IRTypeKind.Fn:
                // Function types don't have a runtime layout
                // Return pointer size as a function pointer
                return layoutPtr();
            default:
                return layoutUnit();
        }
    }
    /**
     * Clear the cache
     */
    clear() {
        this.cache.clear();
    }
}

// ============================================================================
// Exports
// ============================================================================

export {
    makeTypeLayout,
    // Primitive layouts
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
    // Composite layouts
    layoutStruct,
    layoutTuple,
    layoutArray,
    layoutEnum,
    // Utilities
    alignTo,
    calculateTagSize,
    // Cache
    LayoutCache,
};
