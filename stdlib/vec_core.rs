#[builtin(name = "__jsrust_alloc")]
fn __jsrust_alloc<T>(count: i32) -> *mut T;

#[builtin(name = "__jsrust_realloc")]
fn __jsrust_realloc<T>(ptr: *mut T, old_count: i32, new_count: i32) -> *mut T;

#[builtin(name = "__jsrust_dealloc")]
fn __jsrust_dealloc<T>(ptr: *mut T, count: i32);

#[builtin(name = "__jsrust_copy_nonoverlapping")]
fn __jsrust_copy_nonoverlapping<T>(src: *mut T, dst: *mut T, count: i32);

#[builtin(name = "__jsrust_panic_bounds_check")]
fn __jsrust_panic_bounds_check(index: i32, len: i32);

pub struct Vec<T> {
    ptr: *mut T,
    len: i32,
    cap: i32,
}

impl<T> Vec<T> {
    pub fn new() -> Self {
        Self {
            ptr: __jsrust_alloc::<T>(0),
            len: 0,
            cap: 0,
        }
    }

    pub fn with_capacity(capacity: i32) -> Self {
        Self {
            ptr: __jsrust_alloc::<T>(capacity),
            len: 0,
            cap: capacity,
        }
    }

    pub fn len(&self) -> i32 {
        self.len
    }

    pub fn capacity(&self) -> i32 {
        self.cap
    }

    fn grow(&mut self) {
        let old_ptr = self.ptr;
        let old_cap = self.cap;
        let new_cap = if old_cap == 0 { 1 } else { old_cap + old_cap };
        let new_ptr = __jsrust_alloc::<T>(new_cap);

        if self.len > 0 {
            __jsrust_copy_nonoverlapping::<T>(old_ptr, new_ptr, self.len);
        };

        if old_cap > 0 {
            __jsrust_dealloc::<T>(old_ptr, old_cap);
        };

        self.ptr = new_ptr;
        self.cap = new_cap;
    }

    pub fn push(&mut self, value: T) {
        let old_ptr = self.ptr;
        let old_cap = self.cap;
        let new_cap = if old_cap == 0 { 1 } else { old_cap + old_cap };
        let target_ptr = if self.len == self.cap {
            __jsrust_realloc::<T>(old_ptr, old_cap, new_cap)
        } else {
            self.ptr
        };
        let target_cap = if self.len == self.cap { new_cap } else { self.cap };
        self.ptr = target_ptr;
        self.cap = target_cap;

        self.ptr[self.len] = value;
        self.len = self.len + 1;
    }

    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            Option::None
        } else {
            self.len = self.len - 1;
            Option::Some(self.ptr[self.len])
        }
    }

    pub fn get(&self, index: i32) -> Option<T> {
        if index >= self.len {
            Option::None
        } else {
            Option::Some(self.ptr[index])
        }
    }

    pub fn index(&self, index: i32) -> Option<T> {
        if index >= self.len {
            Option::None
        } else {
            Option::Some(self.ptr[index])
        }
    }
}
