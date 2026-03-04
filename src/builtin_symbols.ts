export const BUILTIN_SYMBOLS = Object.freeze({
    PRINT_BYTES: "__jsrust_builtin_print_bytes",
    PRINTLN_BYTES: "__jsrust_builtin_println_bytes",
    PRINT_FMT: "__jsrust_builtin_print_fmt",
    PRINTLN_FMT: "__jsrust_builtin_println_fmt",
    ALLOC: "__jsrust_alloc",
    REALLOC: "__jsrust_realloc",
    DEALLOC: "__jsrust_dealloc",
    COPY_NONOVERLAPPING: "__jsrust_copy_nonoverlapping",
    PANIC_BOUNDS_CHECK: "__jsrust_panic_bounds_check",
});

export const BUILTIN_ENUMS = Object.freeze({
    Option: Object.freeze({
        variants: Object.freeze(["None", "Some"]),
        genericParams: Object.freeze(["T"]),
    }),
});

export const BUILTIN_CATEGORIES = Object.freeze({
    OUTPUT: [
        BUILTIN_SYMBOLS.PRINT_BYTES,
        BUILTIN_SYMBOLS.PRINTLN_BYTES,
        BUILTIN_SYMBOLS.PRINT_FMT,
        BUILTIN_SYMBOLS.PRINTLN_FMT,
    ],
    ALLOCATOR: [
        BUILTIN_SYMBOLS.ALLOC,
        BUILTIN_SYMBOLS.REALLOC,
        BUILTIN_SYMBOLS.DEALLOC,
    ],
    MEMORY: [BUILTIN_SYMBOLS.COPY_NONOVERLAPPING],
    PANIC: [BUILTIN_SYMBOLS.PANIC_BOUNDS_CHECK],
});
