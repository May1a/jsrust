# 09 - WASM Codegen API Contract (Library-Only MVP)

## Purpose

Define the additive backend C API for emitting `.wasm` artifacts from JSRust binary IR without changing interpreter execution defaults.

## API

```c
typedef struct {
    jsrust_backend_error_code code;
    const char* message;
    const uint8_t* wasm_data;
    size_t wasm_len;
} jsrust_backend_codegen_result;

jsrust_backend_codegen_result jsrust_backend_codegen_wasm_bytes(
    const uint8_t* input_data,
    size_t input_len,
    const char* entry_fn);
```

## Ownership and Lifetime

- `wasm_data` is owned by backend static storage.
- Pointer validity is guaranteed until the next call to `jsrust_backend_codegen_wasm_bytes(...)`.
- Caller must copy bytes if longer lifetime is needed.

## Supported MVP IR Subset

- scalar constants: `iconst`, `fconst`, `bconst`, `sconst`
- scalar arithmetic and comparisons
- scalar casts (current interpreter-aligned subset)
- function calls
- terminators: `ret`, `br`, `br_if`, `switch`, `unreachable`
- builtin output lowering:
    - `__jsrust_builtin_print_bytes`
    - `__jsrust_builtin_println_bytes`
    - `__jsrust_builtin_print_fmt`
    - `__jsrust_builtin_println_fmt`

## Unsupported (Emit-Time Validation Failure)

- memory operations: `alloca`, `load`, `store`, `memcpy`, `gep`, `ptradd`
- aggregate operations: `struct_*`, `enum_*`
- unsupported type kinds and unsupported call/value layouts in MVP

## Host Import Contract for Generated WASM

- `env.jsrust_write_byte(i32) -> i32`
- `env.jsrust_flush() -> i32`
- `env.jsrust_write_cstr(i32) -> i32`
- `env.jsrust_write_i64(i64) -> i32`
- `env.jsrust_write_f64(f64) -> i32`
- `env.jsrust_write_bool(i32) -> i32`
- `env.jsrust_write_char(i64) -> i32`

Return contract for imports:

- non-zero: success
- zero: generated wasm traps (`unreachable`)

## Backward Compatibility

- No changes to:
    - `jsrust_backend_run_bytes(...)`
    - `jsrust_backend_run_file(...)`
    - native backend CLI `run` contract
    - frontend canonical wasm execution adapter path
