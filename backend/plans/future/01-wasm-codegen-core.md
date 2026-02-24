# Future 01 - WASM Codegen Core

Status: in progress (MVP expanded to cover parity-oriented pointer/memory/aggregate execution paths).

## Purpose

After interpreter milestones are complete, add a wasm binary generation backend path (no WAT, no emscripten).

## Prerequisites

- `02-backend-scaffold-and-build.md` complete
- `03-binary-ir-reader.md` complete
- `04-ir-interpreter-core.md` complete
- `05-ir-interpreter-runtime-model.md` complete
- semantic parity confidence from `07-testing-conformance-ci.md`

## Locked Constraints

- output format: `.wasm` only
- no WAT path
- no emscripten
- no external dependencies
- clang as compile toolchain for backend code

## Deliverables

- wasm binary writer utilities
- section encoder (type/function/code/export/global/memory as needed)
- instruction lowering map from IR to wasm opcodes
- deterministic unsupported-op diagnostics

## Current Milestone Snapshot

- Additive C API landed: `jsrust_backend_codegen_wasm_bytes(...)`
- `.wasm` emission path is library-only (no CLI surface changes)
- Deterministic wasm writer utilities landed (`wasm_encode`, `wasm_emit`)
- Imports locked for output sink:
    - `env.jsrust_write_byte(i32) -> i32`
    - `env.jsrust_flush() -> i32`
- Additive formatter/runtime writer imports for generated wasm:
    - `env.jsrust_write_cstr(i32) -> i32`
    - `env.jsrust_write_i64(i64) -> i32`
    - `env.jsrust_write_f64(f64) -> i32`
    - `env.jsrust_write_bool(i32) -> i32`
    - `env.jsrust_write_char(i64) -> i32`
- MVP supported subset:
    - scalar constants/arithmetic/comparisons/casts
    - calls and control-flow (`ret`, `br`, `br_if`, `switch`, `unreachable`)
    - builtin print and formatter lowering with deterministic validation limits
- pointer-like type lowering (`ptr`, `struct`, `enum`) as wasm `i32` values
- memory/global/data sections with string literal data-segment materialization
- lowered memory ops and aggregate ops used by current fixtures/examples:
    - `alloca`, `load`, `store`, `memcpy`, `gep`, `ptradd`
    - `struct_create`, `struct_get`, `enum_create`, `enum_get_tag`, `enum_get_data`

## Task Breakdown

### Task F1.1 - Wasm Encoding Primitives

- LEB128 encoders
- growable checked byte buffer
- section writer + length backpatching

Status: implemented (initial).

### Task F1.2 - Type and Signature Lowering

- IR scalar/aggregate lowering rules
- unsupported type rejection paths

Status: implemented (scalar MVP only).

### Task F1.3 - Function and Locals Emission

- type/function/code section emission
- locals index mapping and body generation

Status: implemented (dispatcher-loop lowering strategy).

### Task F1.4 - Instruction Lowering Core

- constants, arithmetic, comparisons, casts (supported subset)
- explicit stable failure for unsupported opcodes

Status: implemented (expanded beyond scalar MVP for active parity set).

### Task F1.5 - Control Flow Lowering

- `ret`, `br`, `br_if`, `switch` lowering strategy

Status: implemented (initial).

### Task F1.6 - Export Policy

- default export behavior (`main` if present)
- optional explicit export list extension point

Status: implemented (entry export plus memory export).

## Acceptance Criteria

- backend emits valid `.wasm` for active fixture/example parity subset
- wasm binaries are deterministic for identical input
- unsupported paths fail with stable diagnostics
