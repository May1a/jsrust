import {
    layoutEnum,
    calculateTagSize,
    LayoutCache,
} from '../../memory_layout.js';

import { IntWidth } from '../../types.js';
import { IRTypeKind } from '../../ir.js';
import { test, assertEqual, assertTrue, getResults, clearErrors } from '../lib.js';

// ============================================================================
// Task 10.5: Enum Layout
// ============================================================================

test('calculateTagSize returns 0 for 0 variants', () => {
    assertEqual(calculateTagSize(0), 0);
});

test('calculateTagSize returns 1 for up to 256 variants', () => {
    assertEqual(calculateTagSize(1), 1);
    assertEqual(calculateTagSize(2), 1);
    assertEqual(calculateTagSize(128), 1);
    assertEqual(calculateTagSize(256), 1);
});

test('calculateTagSize returns 2 for 257-65536 variants', () => {
    assertEqual(calculateTagSize(257), 2);
    assertEqual(calculateTagSize(1000), 2);
    assertEqual(calculateTagSize(65536), 2);
});

test('calculateTagSize returns 4 for 65537-4294967296 variants', () => {
    assertEqual(calculateTagSize(65537), 4);
    assertEqual(calculateTagSize(1000000), 4);
});

test('calculateTagSize returns 8 for more than 4294967296 variants', () => {
    assertEqual(calculateTagSize(4294967297), 8);
});

test('layoutEnum returns empty layout for no variants', () => {
    const cache = new LayoutCache();
    const layout = layoutEnum([], cache);
    
    assertEqual(layout.size, 0);
    assertEqual(layout.align, 1);
});

test('layoutEnum handles single unit variant', () => {
    const cache = new LayoutCache();
    const variants = [[]]; // Single variant with no data
    const layout = layoutEnum(variants, cache);
    
    assertEqual(layout.size, 0);
    assertEqual(layout.align, 1);
});

test('layoutEnum handles single variant with data', () => {
    const cache = new LayoutCache();
    const variants = [
        [{ kind: IRTypeKind.Int, width: IntWidth.I32 }],
    ];
    const layout = layoutEnum(variants, cache);
    
    // Single variant - just the data, no tag
    assertEqual(layout.size, 4);
    assertEqual(layout.align, 4);
});

test('layoutEnum handles two unit variants', () => {
    const cache = new LayoutCache();
    const variants = [[], []]; // Two variants with no data
    const layout = layoutEnum(variants, cache);
    
    // Tag (1 byte) + no data
    assertEqual(layout.size, 1);
    assertEqual(layout.align, 1);
});

test('layoutEnum handles Option<i32>', () => {
    const cache = new LayoutCache();
    const variants = [
        [],  // None
        [{ kind: IRTypeKind.Int, width: IntWidth.I32 }],  // Some(i32)
    ];
    const layout = layoutEnum(variants, cache);
    
    // Tag (1 byte) + padding (3 bytes) + i32 (4 bytes) = 8 bytes
    // Align to max(tag align=1, i32 align=4) = 4
    assertEqual(layout.align, 4);
    assertEqual(layout.fieldOffsets[0], 0);  // tag at 0
    assertEqual(layout.fieldOffsets[1], 4);  // data at 4
    assertEqual(layout.size, 8);
});

test('layoutEnum handles Option<i64>', () => {
    const cache = new LayoutCache();
    const variants = [
        [],  // None
        [{ kind: IRTypeKind.Int, width: IntWidth.I64 }],  // Some(i64)
    ];
    const layout = layoutEnum(variants, cache);
    
    // Tag (1 byte) + padding (7 bytes) + i64 (8 bytes) = 16 bytes
    // Align to max(tag align=1, i64 align=8) = 8
    assertEqual(layout.align, 8);
    assertEqual(layout.fieldOffsets[0], 0);  // tag at 0
    assertEqual(layout.fieldOffsets[1], 8);  // data at 8
    assertEqual(layout.size, 16);
});

test('layoutEnum handles multiple variants with different sizes', () => {
    const cache = new LayoutCache();
    const variants = [
        [],  // Variant A: no data
        [{ kind: IRTypeKind.Int, width: IntWidth.I32 }],  // Variant B: i32
        [{ kind: IRTypeKind.Int, width: IntWidth.I64 }],  // Variant C: i64
    ];
    const layout = layoutEnum(variants, cache);
    
    // Tag (1 byte) + padding (7 bytes) + max variant (i64 = 8 bytes) = 16 bytes
    assertEqual(layout.align, 8);
    assertEqual(layout.fieldOffsets[0], 0);  // tag at 0
    assertEqual(layout.fieldOffsets[1], 8);  // data at 8
    assertEqual(layout.size, 16);
});

test('layoutEnum handles variant with multiple fields', () => {
    const cache = new LayoutCache();
    const variants = [
        [],  // Variant A: no data
        [
            { kind: IRTypeKind.Int, width: IntWidth.I32 },
            { kind: IRTypeKind.Int, width: IntWidth.I32 },
        ],  // Variant B: two i32s
    ];
    const layout = layoutEnum(variants, cache);
    
    // Tag (1 byte) + padding (3 bytes) + two i32s (8 bytes) = 12 bytes
    assertEqual(layout.align, 4);
    assertEqual(layout.size, 12);
});

test('layoutEnum handles Result<i32, i64>', () => {
    const cache = new LayoutCache();
    const variants = [
        [{ kind: IRTypeKind.Int, width: IntWidth.I32 }],  // Ok(i32)
        [{ kind: IRTypeKind.Int, width: IntWidth.I64 }],  // Err(i64)
    ];
    const layout = layoutEnum(variants, cache);
    
    // Tag (1 byte) + padding (7 bytes) + max(i32, i64) = i64 (8 bytes) = 16 bytes
    assertEqual(layout.align, 8);
    assertEqual(layout.size, 16);
});

test('layoutEnum handles many variants', () => {
    const cache = new LayoutCache();
    // 300 variants - needs u16 tag
    const variants = [];
    for (let i = 0; i < 300; i++) {
        variants.push([]);
    }
    const layout = layoutEnum(variants, cache);
    
    // Tag (2 bytes) + no data
    assertEqual(layout.size, 2);
    assertEqual(layout.align, 2);
});

export function runMemoryEnumsTests() {
    const result = getResults();
    clearErrors();
    return 12;
}