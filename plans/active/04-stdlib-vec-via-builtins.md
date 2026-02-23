# Plan: Stdlib Vec via Allocator Builtins

## Status (2026-02-21)

Implemented milestone scope:

- Compiler-managed stdlib injection is active (`stdlib/vec_core.rs` prepended in `/Users/may/jsrust/main.js`) with prelude `Vec` exposure.
- Builtin declaration metadata is implemented on `FnItem` via `#[builtin(name = \"...\")]` and declaration-only builtin signatures.
- Builtin symbol registry is live in `/Users/may/jsrust/builtin_symbols.js` with:
  `__jsrust_alloc`, `__jsrust_realloc`, `__jsrust_dealloc`, `__jsrust_copy_nonoverlapping`, `__jsrust_panic_bounds_check`.
- Frontend generic impl plumbing needed for `impl<T> Vec<T>` method resolution/lowering is in place.
- Vec surface for this milestone is implemented:
  `vec![a, b, c]` list form, `new`, `with_capacity`, `len`, `capacity`, `push`, `pop` (`Option<T>`), `get` (`Option<T>`), `[]` by value with runtime bounds panic via `__jsrust_panic_bounds_check`.
- Negative/frontend semantic gates are implemented:
  repeat form (`vec![x; n]`) emits deterministic unsupported diagnostic; `get`/`pop` return built-in `Option<T>`; `assert_eq!` has Option-aware lowering for int/float/bool payloads; and bare prelude-style `Some`/`None` expressions are accepted as `Option` variant constructors/values.
- Backend interpreter and wasm codegen both dispatch allocator/copy/panic builtins, with parity on Vec run fixtures.
- Conformance/snapshot artifacts were regenerated (`examples/expected/*`, `tests/fixtures/backend_ir_v2/*`).

Deferred (unchanged for this milestone):

- `std::vec::Vec` pathing (still prelude-only `Vec`).
- By-reference indexing.
- by-reference indexing semantics (currently `[]` returns by value and panics on bounds failure).

## Overview

This plan outlines a scalable approach to implementing `Vec<T>` and other standard library types in jsrust. Instead of hardcoding type-specific runtime handlers, we implement:

1. **Low-level allocator builtins** - Expose `malloc`, `realloc`, `free` to compiled Rust code
2. **Rust-based stdlib** - Implement `Vec`, `Box`, `String` etc. in Rust, compiled by jsrust
3. **Compiler-internal attributes** - A notation system for marking builtins and internal APIs

This approach scales because:
- Adding new types requires only Rust code, not compiler changes
- Generic types work via monomorphization (existing IR infrastructure)
- Memory layout is handled by the compiler, not hardcoded in C

---

## Phase 1: Allocator Builtin Foundation

### 1.1 Builtin Symbol Registry

Create a centralized registry for builtin symbols that the compiler recognizes specially.

**File: `builtin_symbols.js`** (refactored)

```javascript
// Allocator builtins - low-level memory operations
export const BUILTIN_SYMBOLS = Object.freeze({
    // Core allocator ABI (stable, used by compiled Rust code)
    ALLOC: "__jsrust_alloc",           // (size: usize, align: usize) -> *mut u8
    REALLOC: "__jsrust_realloc",       // (ptr: *mut u8, old_size: usize, new_size: usize, align: usize) -> *mut u8
    DEALLOC: "__jsrust_dealloc",       // (ptr: *mut u8, size: usize, align: usize)
    
    // Copy operations
    COPY_NONOVERLAPPING: "__jsrust_copy_nonoverlapping", // (src: *const T, dst: *mut T, count: usize)
    
    // Panic/abort builtins
    PANIC: "__jsrust_panic",           // (msg: *const u8, len: usize) -> !
    PANIC_BOUNDS_CHECK: "__jsrust_panic_bounds_check", // (index: usize, len: usize) -> !
    
    // I/O builtins (for print macros)
    WRITE_BYTES: "__jsrust_write_bytes", // (ptr: *const u8, len: usize)
    FLUSH_OUTPUT: "__jsrust_flush_output",
    
    // Deprecated: format-specific builtins will be removed
    // PRINTLN_FMT, PRINT_FMT - to be replaced by WRITE_BYTES based formatting
});

// Builtin categories for validation
export const BUILTIN_CATEGORIES = Object.freeze({
    ALLOCATOR: [BUILTIN_SYMBOLS.ALLOC, BUILTIN_SYMBOLS.REALLOC, BUILTIN_SYMBOLS.DEALLOC],
    MEMORY: [BUILTIN_SYMBOLS.COPY_NONOVERLAPPING],
    PANIC: [BUILTIN_SYMBOLS.PANIC, BUILTIN_SYMBOLS.PANIC_BOUNDS_CHECK],
    IO: [BUILTIN_SYMBOLS.WRITE_BYTES, BUILTIN_SYMBOLS.FLUSH_OUTPUT],
});
```

### 1.2 Compiler-Internal Attribute

Define an attribute system to mark functions as compiler-internal builtins.

**Parser extension:**

```rust
#[jsrust::builtin(name = "__jsrust_alloc")]
/// Compiler builtin: allocate memory with size and alignment.
/// Returns null pointer on allocation failure.
pub fn __jsrust_alloc(size: usize, align: usize) -> *mut u8;

#[jsrust::builtin(name = "__jsrust_dealloc")]
/// Compiler builtin: deallocate memory previously allocated.
pub fn __jsrust_dealloc(ptr: *mut u8, size: usize, align: usize);
```

**Alternative: simpler notation**

```rust
#[builtin]
extern "jsrust" {
    fn __jsrust_alloc(size: usize, align: usize) -> *mut u8;
    fn __jsrust_realloc(ptr: *mut u8, old_size: usize, new_size: usize, align: usize) -> *mut u8;
    fn __jsrust_dealloc(ptr: *mut u8, size: usize, align: usize);
    fn __jsrust_copy_nonoverlapping<T>(src: *const T, dst: *mut T, count: usize);
    fn __jsrust_panic(msg: *const u8, len: usize) -> !;
    fn __jsrust_write_bytes(ptr: *const u8, len: usize);
}
```

**Implementation in `parser.js`:**

- Parse `#[builtin]` attribute on `extern` blocks
- Recognize `"jsrust"` ABI as builtin ABI
- Mark items with `isBuiltin: true` in AST
- During lowering, builtin calls emit special IR instructions or direct runtime calls

### 1.3 C Runtime Implementation

**File: `backend/src/runtime.c`** (updated)

```c
// Allocator builtin implementations

BackendStatus Runtime_builtinAlloc(
    RuntimeContext* runtime,
    uint64_t size,
    uint64_t align,
    uint32_t* outCellIndex)
{
    void* ptr;
    uint32_t cellIndex;
    ExecValue value;
    BackendStatus status;
    
    // Use arena allocation with proper alignment
    ptr = Arena_alloc(runtime->arena, (size_t)size, (size_t)align);
    if (!ptr && size > 0) {
        return Runtime_error("allocation failed (out of memory)");
    }
    
    // Store pointer in a cell for tracking
    status = Runtime_allocateCell(runtime, ExecValue_makeUnit(), &cellIndex);
    if (status.code != JSRUST_BACKEND_OK) {
        return status;
    }
    
    // Store raw pointer as integer
    runtime->cells[cellIndex].value = ExecValue_makeInt((int64_t)(uintptr_t)ptr);
    runtime->cells[cellIndex].ptrKind = RuntimePtrKind_Heap;
    runtime->cells[cellIndex].allocSize = (uint32_t)size;
    runtime->cells[cellIndex].allocAlign = (uint32_t)align;
    
    *outCellIndex = cellIndex;
    return BackendStatus_ok();
}

BackendStatus Runtime_builtinDealloc(
    RuntimeContext* runtime,
    uint32_t cellIndex,
    uint64_t size,
    uint64_t align)
{
    RuntimeCell* cell;
    
    if (cellIndex >= runtime->cellCount) {
        return Runtime_error("dealloc: invalid pointer");
    }
    
    cell = &runtime->cells[cellIndex];
    if (!cell->occupied || cell->ptrKind != RuntimePtrKind_Heap) {
        return Runtime_error("dealloc: pointer is not a heap allocation");
    }
    
    // Arena allocation: no explicit free needed
    // Mark cell as freed for safety
    cell->occupied = 0;
    cell->ptrKind = RuntimePtrKind_Invalid;
    
    return BackendStatus_ok();
}
```

**File: `backend/src/runtime.h`** (updated)

```c
typedef enum {
    RuntimePtrKind_Invalid = 0,
    RuntimePtrKind_Stack,    // alloca-based
    RuntimePtrKind_Heap,     // builtin_alloc-based
} RuntimePtrKind;

typedef struct {
    ExecValue value;
    uint8_t occupied;
    uint8_t ptrKind;
    uint32_t allocSize;    // for heap pointers
    uint32_t allocAlign;   // for heap pointers
} RuntimeCell;
```

---

## Phase 2: Rust Stdlib Implementation

### 2.1 Stdlib Crate Structure

Create a `stdlib/` directory with Rust implementations:

```
stdlib/
├── Cargo.toml          (for tooling only, not used by jsrust)
├── lib.rs              (crate root)
├── alloc/
│   ├── mod.rs
│   ├── alloc.rs        (GlobalAlloc trait + allocator frontend)
│   ├── boxed.rs        (Box<T>)
│   ├── vec.rs          (Vec<T>)
│   └── string.rs       (String)
├── marker/
│   └── copy.rs         (Copy, Clone traits - compiler-known)
└── builtin/
    └── jsrust.rs       (builtin declarations)
```

### 2.2 Builtin Declarations

**File: `stdlib/builtin/jsrust.rs`**

```rust
//! jsrust compiler builtin declarations.
//! 
//! These functions are implemented by the jsrust runtime, not compiled
//! from Rust code. They provide low-level memory and I/O operations.

#[jsrust::builtin]
extern "jsrust" {
    /// Allocate memory with the given size and alignment.
    /// Returns a null pointer if allocation fails.
    pub fn __jsrust_alloc(size: usize, align: usize) -> *mut u8;
    
    /// Reallocate memory to a new size.
    /// The old size is used for copy optimization.
    pub fn __jsrust_realloc(
        ptr: *mut u8,
        old_size: usize,
        new_size: usize,
        align: usize
    ) -> *mut u8;
    
    /// Deallocate memory.
    /// The size and alignment should match the original allocation.
    pub fn __jsrust_dealloc(ptr: *mut u8, size: usize, align: usize);
    
    /// Copy memory non-overlapping regions.
    /// Equivalent to ptr::copy_nonoverlapping.
    pub fn __jsrust_copy_nonoverlapping<T>(src: *const T, dst: *mut T, count: usize);
    
    /// Abort execution with a panic message.
    pub fn __jsrust_panic(msg: *const u8, len: usize) -> !;
    
    /// Write bytes to the output stream.
    pub fn __jsrust_write_bytes(ptr: *const u8, len: usize);
    
    /// Flush the output stream.
    pub fn __jsrust_flush_output();
}

/// Panic with a static message.
#[inline(never)]
#[track_caller]
pub fn panic_static(msg: &'static str) -> ! {
    unsafe {
        __jsrust_panic(msg.as_ptr(), msg.len());
    }
}

/// Bounds check helper.
#[inline]
pub fn bounds_check(index: usize, len: usize) {
    if index >= len {
        panic_static("index out of bounds");
    }
}
```

### 2.3 Allocator Implementation

**File: `stdlib/alloc/alloc.rs`**

```rust
//! Global allocator implementation using jsrust builtins.

use crate::builtin::jsrust::*;

/// Allocate memory with the given layout.
/// 
/// # Safety
/// The caller must ensure the layout is valid.
pub unsafe fn alloc(layout: core::alloc::Layout) -> *mut u8 {
    __jsrust_alloc(layout.size(), layout.align())
}

/// Allocate zero-initialized memory.
pub unsafe fn alloc_zeroed(layout: core::alloc::Layout) -> *mut u8 {
    let ptr = alloc(layout);
    if !ptr.is_null() {
        // Zero the memory
        __jsrust_write_bytes(ptr, 0, layout.size());  // actually need memset
    }
    ptr
}

/// Deallocate memory.
/// 
/// # Safety
/// The caller must ensure:
/// - `ptr` was allocated with the same layout
/// - `ptr` is currently valid
pub unsafe fn dealloc(ptr: *mut u8, layout: core::alloc::Layout) {
    __jsrust_dealloc(ptr, layout.size(), layout.align());
}

/// Reallocate memory.
/// 
/// # Safety
/// See standard library `GlobalAlloc::realloc` for requirements.
pub unsafe fn realloc(
    ptr: *mut u8,
    old_layout: core::alloc::Layout,
    new_size: usize,
) -> *mut u8 {
    __jsrust_realloc(
        ptr,
        old_layout.size(),
        new_size,
        old_layout.align(),
    )
}
```

### 2.4 Vec Implementation

**File: `stdlib/alloc/vec.rs`**

```rust
//! A contiguous growable array type.
//! 
//! This is a simplified `Vec<T>` implementation that uses jsrust's
//! allocator builtins.

use core::marker::PhantomData;
use core::mem::{self, ManuallyDrop};
use core::ptr::{self, NonNull};

use super::alloc::{alloc, dealloc, realloc};
use crate::builtin::jsrust::{__jsrust_copy_nonoverlapping, panic_static, bounds_check};

/// The layout for a Vec's internal buffer.
/// 
/// A Vec contains:
/// - `ptr`: pointer to the heap-allocated buffer
/// - `len`: number of initialized elements
/// - `cap`: total capacity in elements
#[repr(C)]
pub struct Vec<T> {
    ptr: NonNull<T>,
    len: usize,
    cap: usize,
    _marker: PhantomData<T>,
}

impl<T> Vec<T> {
    /// Construct an empty Vec.
    pub const fn new() -> Self {
        Self {
            ptr: unsafe { NonNull::new_unchecked(1 as *mut T) }, // dangling
            len: 0,
            cap: 0,
            _marker: PhantomData,
        }
    }
    
    /// Construct a Vec with a given capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        let mut vec = Self::new();
        if capacity > 0 {
            vec.reserve_exact(capacity);
        }
        vec
    }
    
    /// Returns the number of elements.
    pub fn len(&self) -> usize {
        self.len
    }
    
    /// Returns true if the Vec is empty.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
    
    /// Returns the total capacity.
    pub fn capacity(&self) -> usize {
        self.cap
    }
    
    /// Append an element to the end.
    pub fn push(&mut self, value: T) {
        if self.len == self.cap {
            self.reserve(1);
        }
        
        unsafe {
            let end = self.as_mut_ptr().add(self.len);
            ptr::write(end, value);
        }
        self.len += 1;
    }
    
    /// Remove and return the last element.
    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        
        self.len -= 1;
        unsafe {
            Some(ptr::read(self.as_ptr().add(self.len)))
        }
    }
    
    /// Reserve capacity for at least `additional` more elements.
    pub fn reserve(&mut self, additional: usize) {
        let new_cap = self.len.checked_add(additional)
            .and_then(|n| n.checked_next_power_of_two())
            .expect("capacity overflow");
        self.grow(new_cap);
    }
    
    /// Reserve exact capacity.
    pub fn reserve_exact(&mut self, additional: usize) {
        let new_cap = self.len.checked_add(additional)
            .expect("capacity overflow");
        self.grow(new_cap);
    }
    
    /// Grow the buffer to the new capacity.
    fn grow(&mut self, new_cap: usize) {
        if new_cap <= self.cap {
            return;
        }
        
        let elem_size = mem::size_of::<T>();
        let elem_align = mem::align_of::<T>();
        
        if elem_size == 0 {
            // ZST - no actual allocation needed
            self.cap = usize::MAX;
            return;
        }
        
        let new_size = new_cap.checked_mul(elem_size)
            .expect("allocation size overflow");
        
        let new_ptr = if self.cap == 0 {
            // First allocation
            unsafe {
                let layout = core::alloc::Layout::from_size_align(new_size, elem_align)
                    .expect("invalid layout");
                NonNull::new(alloc(layout)).expect("allocation failed")
            }
        } else {
            // Reallocation
            unsafe {
                let old_size = self.cap * elem_size;
                let ptr = self.as_mut_ptr() as *mut u8;
                let new_raw = realloc(ptr, 
                    core::alloc::Layout::from_size_align(old_size, elem_align).unwrap(),
                    new_size
                );
                NonNull::new(new_raw).expect("reallocation failed")
            }
        };
        
        self.ptr = unsafe { NonNull::new_unchecked(new_ptr.as_ptr() as *mut T) };
        self.cap = new_cap;
    }
    
    /// Get a pointer to the buffer.
    pub fn as_ptr(&self) -> *const T {
        self.ptr.as_ptr()
    }
    
    /// Get a mutable pointer to the buffer.
    pub fn as_mut_ptr(&mut self) -> *mut T {
        self.ptr.as_ptr()
    }
    
    /// Get a slice view.
    pub fn as_slice(&self) -> &[T] {
        unsafe {
            core::slice::from_raw_parts(self.as_ptr(), self.len)
        }
    }
    
    /// Get a mutable slice view.
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        unsafe {
            core::slice::from_raw_parts_mut(self.as_mut_ptr(), self.len)
        }
    }
    
    /// Index into the Vec.
    pub fn get(&self, index: usize) -> Option<&T> {
        if index >= self.len {
            return None;
        }
        unsafe {
            Some(&*self.as_ptr().add(index))
        }
    }
    
    /// Mutably index into the Vec.
    pub fn get_mut(&mut self, index: usize) -> Option<&mut T> {
        if index >= self.len {
            return None;
        }
        unsafe {
            Some(&mut *self.as_mut_ptr().add(index))
        }
    }
}

impl<T> core::ops::Index<usize> for Vec<T> {
    type Output = T;
    
    fn index(&self, index: usize) -> &T {
        bounds_check(index, self.len);
        unsafe {
            &*self.as_ptr().add(index)
        }
    }
}

impl<T> core::ops::IndexMut<usize> for Vec<T> {
    fn index_mut(&mut self, index: usize) -> &mut T {
        bounds_check(index, self.len);
        unsafe {
            &mut *self.as_mut_ptr().add(index)
        }
    }
}

impl<T> Drop for Vec<T> {
    fn drop(&mut self) {
        // Drop all elements
        while self.pop().is_some() {}
        
        // Deallocate buffer
        if self.cap > 0 && mem::size_of::<T>() > 0 {
            let elem_size = mem::size_of::<T>();
            let elem_align = mem::align_of::<T>();
            unsafe {
                let layout = core::alloc::Layout::from_size_align(
                    self.cap * elem_size,
                    elem_align
                ).unwrap();
                dealloc(self.as_mut_ptr() as *mut u8, layout);
            }
        }
    }
}

// Clone implementation for Clone types
impl<T: Clone> Clone for Vec<T> {
    fn clone(&self) -> Self {
        let mut new_vec = Self::with_capacity(self.len);
        for item in self.as_slice() {
            new_vec.push(item.clone());
        }
        new_vec
    }
}

// IntoIterator implementation
impl<T> IntoIterator for Vec<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;
    
    fn into_iterator(self) -> Self::IntoIter {
        let (ptr, len, cap) = (self.ptr, self.len, self.cap);
        mem::forget(self); // Don't run destructor
        IntoIter { ptr, len, cap, start: 0 }
    }
}

pub struct IntoIter<T> {
    ptr: NonNull<T>,
    len: usize,
    cap: usize,
    start: usize,
}

impl<T> Iterator for IntoIter<T> {
    type Item = T;
    
    fn next(&mut self) -> Option<T> {
        if self.start >= self.len {
            return None;
        }
        let item = unsafe { ptr::read(self.ptr.as_ptr().add(self.start)) };
        self.start += 1;
        Some(item)
    }
}

impl<T> Drop for IntoIter<T> {
    fn drop(&mut self) {
        // Drop remaining elements
        while self.start < self.len {
            unsafe { ptr::drop_in_place(self.ptr.as_ptr().add(self.start)) };
            self.start += 1;
        }
        
        // Deallocate
        if self.cap > 0 && mem::size_of::<T>() > 0 {
            unsafe {
                dealloc(
                    self.ptr.as_ptr() as *mut u8,
                    core::alloc::Layout::from_size_align(
                        self.cap * mem::size_of::<T>(),
                        mem::align_of::<T>()
                    ).unwrap()
                );
            }
        }
    }
}

// From slice implementation
impl<T: Clone> From<&[T]> for Vec<T> {
    fn from(slice: &[T]) -> Self {
        let mut vec = Self::with_capacity(slice.len());
        for item in slice {
            vec.push(item.clone());
        }
        vec
    }
}

impl<T> Default for Vec<T> {
    fn default() -> Self {
        Self::new()
    }
}
```

### 2.5 vec! Macro

**File: `stdlib/alloc/vec.rs`** (append)

```rust
/// Create a Vec from a list of elements.
#[macro_export]
macro_rules! vec {
    () => (
        $crate::alloc::vec::Vec::new()
    );
    ($elem:expr; $n:expr) => (
        {
            let mut v = $crate::alloc::vec::Vec::with_capacity($n);
            let elem = $elem;
            for _ in 0..$n {
                v.push(elem.clone());
            }
            v
        }
    );
    ($($x:expr),+ $(,)?) => (
        {
            let mut v = $crate::alloc::vec::Vec::new();
            $( v.push($x); )+
            v
        }
    );
}
```

---

## Phase 3: Compiler Integration

### 3.1 Stdlib Inclusion

**Approach:** Include stdlib sources with the compiler and compile them alongside user code.

**File: `stdlib/lib.rs`**

```rust
//! jsrust standard library.
//! 
//! This library is automatically linked when compiling with jsrust.

#![no_std]
#![feature(lang_items)]

pub mod builtin;
pub mod alloc;
pub mod marker;

// Re-exports
pub use alloc::vec::Vec;
pub use alloc::boxed::Box;
pub use alloc::string::String;

// Panic handler
#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    use builtin::jsrust::panic_static;
    if let Some(msg) = info.payload().downcast_ref::<&str>() {
        panic_static(msg);
    } else {
        panic_static("panic occurred");
    }
}

// Required lang items for no_std
#[lang = "eh_personality"]
fn eh_personality() {}

#[lang = "sized"]
trait Sized {}
```

### 3.2 Module Resolver Update

**File: `module_resolver.js`** (updated)

Add support for implicitly including stdlib:

```javascript
import { STDLIB_SOURCES } from "./stdlib_sources.js";

// Resolve stdlib paths
function resolveStdlibModule(path) {
    if (path.startsWith("std::") || path.startsWith("jsrust::")) {
        const moduleName = path.split("::")[1];
        const source = STDLIB_SOURCES[moduleName];
        if (source) {
            return {
                ok: true,
                source,
                path: `builtin://stdlib/${moduleName}.rs`,
            };
        }
    }
    return { ok: false, error: `Unknown stdlib module: ${path}` };
}
```

### 3.3 Parser Support for Builtin Attribute

**File: `parser.js`** (updated)

```javascript
// Parse builtin attribute
function parseBuiltinAttribute(parser) {
    // #[jsrust::builtin] or #[builtin]
    const attr = {
        kind: "Builtin",
        name: null,
        span: parser.span(),
    };
    
    // Optionally parse builtin name: #[builtin(name = "__jsrust_alloc")]
    if (parser.check(TokenKind.LParen)) {
        parser.consume(TokenKind.LParen);
        parser.expect(TokenKind.Identifier); // "name"
        parser.expect(TokenKind.Eq);
        attr.name = parser.expect(TokenKind.StringLiteral).value;
        parser.expect(TokenKind.RParen);
    }
    
    return attr;
}

// In parseFnItem:
if (hasAttribute(item, "builtin")) {
    item.isBuiltin = true;
    item.builtinName = getAttributeValue(item, "builtin", "name");
}
```

### 3.4 Lowering for Builtin Calls

**File: `lowering.js`** (updated)

```javascript
function lowerBuiltinCall(ctx, call, builtinName) {
    const args = call.args.map(arg => lowerExpr(ctx, arg));
    
    // Emit special IR for known builtins
    switch (builtinName) {
        case BUILTIN_SYMBOLS.ALLOC: {
            const resultType = { kind: TypeKind.Ptr, inner: { kind: TypeKind.U8 }, mutable: true };
            return makeBuiltinCallExpr(call.span, builtinName, args, resultType);
        }
        case BUILTIN_SYMBOLS.DEALLOC:
        case BUILTIN_SYMBOLS.COPY_NONOVERLAPPING:
            return makeBuiltinCallExpr(call.span, builtinName, args, makeUnitType());
        default:
            // Generic builtin call
            return makeBuiltinCallExpr(call.span, builtinName, args, makeUnitType());
    }
}
```

### 3.5 IR Extension for Builtins

**File: `ir_instructions.js`** (updated)

```javascript
// Builtin instruction kind
const IRInstKind_Builtin = 100;  // or add to enum

// Builtin call instruction
function makeBuiltinInst(span, builtinName, args, resultType) {
    return {
        kind: IRInstKind_Builtin,
        span,
        builtinName,
        args,
        resultType,
        // ... other fields
    };
}
```

### 3.6 Backend Builtin Dispatch

**File: `backend/src/exec_core.c`** (updated)

```c
static BackendStatus Exec_executeBuiltin(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    BuiltinId builtinId,
    ExecValue* outValue)
{
    switch (builtinId) {
    case BuiltinId_Alloc: {
        ExecValue sizeVal, alignVal;
        uint32_t cellIndex;
        
        status = Exec_readOperand(frame, inst->callArgs.items[0], &sizeVal);
        if (status.code != JSRUST_BACKEND_OK) return status;
        status = Exec_readOperand(frame, inst->callArgs.items[1], &alignVal);
        if (status.code != JSRUST_BACKEND_OK) return status;
        
        status = Runtime_builtinAlloc(
            engine->runtime,
            (uint64_t)sizeVal.i64,
            (uint64_t)alignVal.i64,
            &cellIndex
        );
        if (status.code != JSRUST_BACKEND_OK) return status;
        
        *outValue = ExecValue_makePtr(cellIndex);
        return BackendStatus_ok();
    }
    case BuiltinId_Dealloc: {
        ExecValue ptrVal, sizeVal, alignVal;
        uint32_t cellIndex;
        
        status = Exec_readOperand(frame, inst->callArgs.items[0], &ptrVal);
        if (status.code != JSRUST_BACKEND_OK) return status;
        status = Exec_readOperand(frame, inst->callArgs.items[1], &sizeVal);
        if (status.code != JSRUST_BACKEND_OK) return status;
        status = Exec_readOperand(frame, inst->callArgs.items[2], &alignVal);
        if (status.code != JSRUST_BACKEND_OK) return status;
        
        cellIndex = ptrVal.index;
        return Runtime_builtinDealloc(
            engine->runtime,
            cellIndex,
            (uint64_t)sizeVal.i64,
            (uint64_t)alignVal.i64
        );
    }
    // ... other builtins
    }
}
```

---

## Phase 4: Testing & Examples

### 4.1 Example: Vec Basics

**File: `examples/30_stdlib_vec.rs`**

```rust
#[test]
fn test_vec_new() {
    let v: Vec<i32> = Vec::new();
    assert_eq!(v.len(), 0);
    assert_eq!(v.capacity(), 0);
}

#[test]
fn test_vec_push() {
    let mut v = Vec::new();
    v.push(1);
    v.push(2);
    v.push(3);
    assert_eq!(v.len(), 3);
    assert_eq!(v[0], 1);
    assert_eq!(v[1], 2);
    assert_eq!(v[2], 3);
}

#[test]
fn test_vec_macro() {
    let v = vec![1, 2, 3, 4, 5];
    assert_eq!(v.len(), 5);
    assert_eq!(v[2], 3);
}

#[test]
fn test_vec_pop() {
    let mut v = vec![1, 2, 3];
    assert_eq!(v.pop(), Some(3));
    assert_eq!(v.pop(), Some(2));
    assert_eq!(v.pop(), Some(1));
    assert_eq!(v.pop(), None);
}

#[test]
fn test_vec_iter() {
    let v = vec![1, 2, 3];
    let mut sum = 0;
    for x in v {
        sum += x;
    }
    assert_eq!(sum, 6);
}
```

### 4.2 Example: Vec with Structs

**File: `examples/31_stdlib_vec_structs.rs`**

```rust
struct Point {
    x: i32,
    y: i32,
}

#[test]
fn test_vec_struct() {
    let mut points = Vec::new();
    points.push(Point { x: 1, y: 2 });
    points.push(Point { x: 3, y: 4 });
    
    assert_eq!(points.len(), 2);
    assert_eq!(points[0].x, 1);
    assert_eq!(points[1].y, 4);
}
```

### 4.3 Example: Generic Functions with Vec

**File: `examples/32_stdlib_vec_generic.rs`**

```rust
fn sum_vec(v: Vec<i32>) -> i32 {
    let mut total = 0;
    for x in v {
        total += x;
    }
    total
}

#[test]
fn test_generic_vec() {
    let v = vec![1, 2, 3, 4, 5];
    assert_eq!(sum_vec(v), 15);
}
```

---

## Phase 5: Migration & Cleanup

### 5.1 Remove Old Vec Builtins

Once the stdlib Vec is working:

1. Remove `INTERNAL_VEC_*` from `builtin_symbols.js`
2. Remove `RuntimeVecObject` from `runtime.h`/`runtime.c`
3. Remove `Runtime_reserveVecs` and related functions
4. Remove `Exec_executeBuiltinVec*` functions from `exec_core.c`

### 5.2 Update Print Macros

Replace format-specific builtins with `WRITE_BYTES`-based formatting:

```rust
// In stdlib
pub fn print<T: Display>(value: T) {
    let mut buf = String::new();
    value.fmt(&mut buf);
    unsafe {
        __jsrust_write_bytes(buf.as_ptr(), buf.len());
    }
}

pub fn println<T: Display>(value: T) {
    print(value);
    unsafe {
        __jsrust_write_bytes(b"\n".as_ptr(), 1);
        __jsrust_flush_output();
    }
}
```

---

## Implementation Order

1. **Phase 1.1-1.2**: Builtin registry + attribute parsing
2. **Phase 1.3**: C runtime alloc/dealloc builtins
3. **Phase 2.1-2.3**: Stdlib structure + allocator frontend
4. **Phase 2.4**: Vec implementation
5. **Phase 3.1-3.4**: Compiler integration
6. **Phase 3.5-3.6**: IR + backend updates
7. **Phase 4**: Testing & examples
8. **Phase 5**: Migration & cleanup

---

## Open Questions

1. **Copy/Clone trait integration**: How are `Copy` and `Clone` traits handled? Currently they're compiler-known with special handling.

2. **Drop glue**: When does the compiler generate drop code? Need to ensure Vec's `Drop` impl is called at the right times.

3. **Monomorphization caching**: Should we cache monomorphized instantiations like `Vec<i32>` across compilation units?

4. **Allocator error handling**: Should allocation failure panic or return `Result`? (Rust's default is to panic/abort)

5. **Null pointer representation**: How are null pointers represented in the IR/runtime? Currently using `UINT32_MAX` as sentinel.

---

## Success Criteria

1. `vec![1, 2, 3]` compiles and runs correctly
2. `Vec::push`, `Vec::pop`, `Vec::len` work
3. Vec iteration with `for` loops works
4. Vec with struct elements works
5. Generic functions taking `Vec<T>` work
6. No hardcoded type-specific runtime code for Vec
7. Memory is properly allocated and deallocated
