# An entirely new Backend

- It should follow the current structure of the IR
- It will be entirely in C (for maximum portability and speed)
- It will be used and improved in the future, it should take the **binary** version of the IR
- Include an overview of the current codebase so an agent/human can have an ideal overview over the important parts, which are especially relevant for implementing a backend
- This will then be included as a git submodule

## Relevant Codebase Overview

- `/Users/may/jsrust/main.js`: orchestrates the compile pipeline from parsing through IR generation and validation.
- `/Users/may/jsrust/hir.js`: defines HIR node model and helper constructors used by lowering and SSA conversion.
- `/Users/may/jsrust/lowering.js`: lowers AST into HIR, including control flow and pattern structures.
- `/Users/may/jsrust/hir_to_ssa.js`: lowers HIR functions into SSA IR.
- `/Users/may/jsrust/ir.js`: SSA IR core model, IDs, and module/function/block data structures.
- `/Users/may/jsrust/ir_builder.js`: builder utilities for constructing SSA form.
- `/Users/may/jsrust/ir_serialize.js`: binary IR serialization implementation.
- `/Users/may/jsrust/ir_deserialize.js`: binary IR deserialization implementation.
- `/Users/may/jsrust/ir_validate.js`: IR structural and semantic validation passes.
- `/Users/may/jsrust/ir_printer.js`: human-readable textual IR output for debugging.
- `/Users/may/jsrust/tests/binary/*` and `/Users/may/jsrust/tests/e2e.js`: compatibility and end-to-end behavior checks relevant for backend confidence.

## Integration Shape (Implemented Initial)

- Backend implementation lives in `/Users/may/jsrust/backend` as submodule-prep workspace.
- JSRust emits binary IR and invokes backend via wasm bindings:
  - `/Users/may/jsrust/main.js` `run` subcommand
  - `/Users/may/jsrust/backend_runner.js` adapter (wasm resolution/build/load/run)
- Backend wasm resolution order is locked (`JSRUST_BACKEND_WASM`, default backend wasm path) with auto-build fallback for default path.
- Compatibility is enforced by:
  - `/Users/may/jsrust/tests/binary/conformance.js`
  - `/Users/may/jsrust/tests/backend/integration.js` (conditional in `npm run test`)

## Recent Milestone Update

- Binary IR contract migrated to v2 (32-byte header + dedicated string-literal section).
- Frontend now interns all string literals into module-level IR literal storage and emits `sconst`.
- Print macros now lower to backend formatter builtins (`__jsrust_builtin_print_fmt`, `__jsrust_builtin_println_fmt`) with tagged arguments.
- Backend interpreter now formats `{}` placeholders for string/int/float/bool/char at runtime.
- Fixture corpus and conformance tests moved to `/Users/may/jsrust/tests/fixtures/backend_ir_v2/`.
- Frontend `run` command now supports `--codegen-wasm` to compile binary IR to wasm bytes and execute generated wasm in-memory (no filesystem dependency for generated wasm run-path).
- WASM codegen parity milestone expanded:
  - function signature/return lowering now accepts pointer + aggregate kinds used by active examples.
  - generated wasm now emits memory/global/data sections and exports memory.
  - string literals now lower to deterministic data-segment addresses (`sconst` as pointer address).
  - memory/aggregate instructions used by active parity set now lower (`alloca/load/store/memcpy/gep/ptradd`, `struct_*`, `enum_*`).
  - formatter builtins now support dynamic (non-const) runtime values through additive host writer imports.
  - `--codegen-wasm` now passes all current `examples/*.rs` except known loop hang parity exclusion (`examples/06_loops.rs` also hangs in interpreter mode).
  - backend codegen fixtures `07_structs` and `09_references` promoted to positive coverage in backend C tests.
  - root backend integration tests now include a codegen parity matrix across non-hanging examples.

## Next Integration Steps

- Move backend workspace into dedicated git submodule when repository split is finalized.
- Expand integration tests for entrypoint variants and trace determinism assertions.
- Address the shared interpreter/generated-wasm non-termination issue for `examples/06_loops.rs` and then fold it into parity gating.
- Keep root/backend status files synchronized at each milestone boundary.
