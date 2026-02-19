# Future 01 - WASM Codegen Core (Deferred)

Status: deferred until interpreter track is stable.

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

## Task Breakdown

### Task F1.1 - Wasm Encoding Primitives

- LEB128 encoders
- growable checked byte buffer
- section writer + length backpatching

### Task F1.2 - Type and Signature Lowering

- IR scalar/aggregate lowering rules
- unsupported type rejection paths

### Task F1.3 - Function and Locals Emission

- type/function/code section emission
- locals index mapping and body generation

### Task F1.4 - Instruction Lowering Core

- constants, arithmetic, comparisons, casts (supported subset)
- explicit stable failure for unsupported opcodes

### Task F1.5 - Control Flow Lowering

- `ret`, `br`, `br_if`, `switch` lowering strategy

### Task F1.6 - Export Policy

- default export behavior (`main` if present)
- optional explicit export list extension point

## Acceptance Criteria

- backend emits valid `.wasm` for supported fixture subset
- wasm binaries are deterministic for identical input
- unsupported paths fail with stable diagnostics
