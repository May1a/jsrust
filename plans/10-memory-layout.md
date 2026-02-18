# Memory Layout and Stack Allocation

**File**: `memory_layout.js`

**Dependencies**: `ir.js`

## Task 10.1: Layout Structure
- [ ] `TypeLayout` - size and alignment info
- [ ] `size` - in bytes
- [ ] `align` - alignment requirement in bytes
- [ ] `fields` - field offsets for structs

## Task 10.2: Primitive Layouts
- [ ] `layoutI8()` -> TypeLayout { size: 1, align: 1 }
- [ ] `layoutI16()` -> TypeLayout { size: 2, align: 2 }
- [ ] `layoutI32()` -> TypeLayout { size: 4, align: 4 }
- [ ] `layoutI64()` -> TypeLayout { size: 8, align: 8 }
- [ ] `layoutF32()` -> TypeLayout { size: 4, align: 4 }
- [ ] `layoutF64()` -> TypeLayout { size: 8, align: 8 }
- [ ] `layoutBool()` -> TypeLayout { size: 1, align: 1 }
- [ ] `layoutPtr()` -> TypeLayout { size: 8, align: 8 } (64-bit)

## Task 10.3: Composite Layouts
- [ ] `layoutStruct(fields)` -> TypeLayout
- [ ] Calculate field offsets with padding
- [ ] Calculate total size with tail padding
- [ ] `layoutTuple(elements)` -> TypeLayout

## Task 10.4: Array Layout
- [ ] `layoutArray(element, count)` -> TypeLayout
- [ ] Size = element_size * count
- [ ] Align = element_align

## Task 10.5: Enum Layout
- [ ] `layoutEnum(variants)` -> TypeLayout
- [ ] Calculate tag size (smallest fitting)
- [ ] Calculate largest variant size
- [ ] Handle discriminant alignment

## Task 10.6: Layout Cache
- [ ] `LayoutCache` class
- [ ] Cache computed layouts by type
- [ ] Handle recursive types

## Task 10.7: Alignment Utilities
- [ ] `alignTo(offset, alignment)` -> number
- [ ] Round up to next alignment boundary

## Task 10.8: Stack Slot Allocator
**File**: `stack_alloc.js`
- [ ] `StackAllocator` class
- [ ] Track current frame offset
- [ ] Track maximum alignment

## Task 10.9: Slot Allocation
- [ ] `allocSlot(type, layoutCache)` -> offset
- [ ] Sort locals by alignment for better packing
- [ ] Return frame-relative offset

## Task 10.10: Frame Layout
- [ ] `FrameLayout` structure
- [ ] Map LocalId to offset
- [ ] Total frame size
- [ ] Frame alignment

## Task 10.11: Function Frame
- [ ] `computeFrame(fn, layoutCache)` -> FrameLayout
- [ ] Process all locals in function
- [ ] Return complete frame info

## Testing
- [ ] Test file: `tests/memory/primitives.js`
- [ ] Test file: `tests/memory/structs.js`
- [ ] Test file: `tests/memory/enums.js`
- [ ] Test file: `tests/memory/arrays.js`
- [ ] Test file: `tests/memory/stack_alloc.js`
