export const BUILTIN_SYMBOLS = Object.freeze({
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
    ALLOCATOR: [
        BUILTIN_SYMBOLS.ALLOC,
        BUILTIN_SYMBOLS.REALLOC,
        BUILTIN_SYMBOLS.DEALLOC,
    ],
    MEMORY: [BUILTIN_SYMBOLS.COPY_NONOVERLAPPING],
    PANIC: [BUILTIN_SYMBOLS.PANIC_BOUNDS_CHECK],
});
