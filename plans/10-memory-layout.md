# Memory Layout and Stack Allocation

**File**: `memory_layout.js`

**Dependencies**: `ir.js`

## Task 10.1: Layout Structure

- [x] `TypeLayout` - size and alignment info
- [x] `size` - in bytes
- [x] `align` - alignment requirement in bytes
- [x] `fields` - field offsets for structs

## Task 10.2: Primitive Layouts

- [x] `layoutI8()` -> TypeLayout { size: 1, align: 1 }
- [x] `layoutI16()` -> TypeLayout { size: 2, align: 2 }
- [x] `layoutI32()` -> TypeLayout { size: 4, align: 4 }
- [x] `layoutI64()` -> TypeLayout { size: 8, align: 8 }
- [x] `layoutF32()` -> TypeLayout { size: 4, align: 4 }
- [x] `layoutF64()` -> TypeLayout { size: 8, align: 8 }
- [x] `layoutBool()` -> TypeLayout { size: 1, align: 1 }
- [x] `layoutPtr()` -> TypeLayout { size: 8, align: 8 } (64-bit)

## Task 10.3: Composite Layouts

- [x] `layoutStruct(fields)` -> TypeLayout
- [x] Calculate field offsets with padding
- [x] Calculate total size with tail padding
- [x] `layoutTuple(elements)` -> TypeLayout

## Task 10.4: Array Layout

- [x] `layoutArray(element, count)` -> TypeLayout
- [x] Size = element_size \* count
- [x] Align = element_align

## Task 10.5: Enum Layout

- [x] `layoutEnum(variants)` -> TypeLayout
- [x] Calculate tag size (smallest fitting)
- [x] Calculate largest variant size
- [x] Handle discriminant alignment

## Task 10.6: Layout Cache

- [x] `LayoutCache` class
- [x] Cache computed layouts by type
- [x] Handle recursive types

## Task 10.7: Alignment Utilities

- [x] `alignTo(offset, alignment)` -> number
- [x] Round up to next alignment boundary

## Task 10.8: Stack Slot Allocator

**File**: `stack_alloc.js`

- [x] `StackAllocator` class
- [x] Track current frame offset
- [x] Track maximum alignment

## Task 10.9: Slot Allocation

- [x] `allocSlot(type, layoutCache)` -> offset
- [x] Sort locals by alignment for better packing
- [x] Return frame-relative offset

## Task 10.10: Frame Layout

- [x] `FrameLayout` structure
- [x] Map LocalId to offset
- [x] Total frame size
- [x] Frame alignment

## Task 10.11: Function Frame

- [x] `computeFrame(fn, layoutCache)` -> FrameLayout
- [x] Process all locals in function
- [x] Return complete frame info

## Testing

- [x] Test file: `tests/memory/primitives.js`
- [x] Test file: `tests/memory/structs.js`
- [x] Test file: `tests/memory/enums.js`
- [x] Test file: `tests/memory/arrays.js`
- [x] Test file: `tests/memory/stack_alloc.js`
