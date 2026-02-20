# JSRust Backend Workspace

This folder is a dedicated backend workspace that will later be split into its own git submodule.

## Immediate Priority

Maintain a **C-based IR execution engine** that interprets JSRust binary IR v2 directly and is consumed through wasm bindings from the JS frontend.

- Input: JSRust binary IR (`.bin` / `.jsrbin`)
- Behavior: parse, validate, execute entry function, report deterministic result/errors
- Canonical frontend integration: clang-built wasm module called directly from `/Users/may/jsrust/backend_runner.js`
- No external dependencies

## Future Priority

Program wasm codegen (emitting target `.wasm` artifacts from IR) is explicitly deferred to a future phase.

Current status update: the **library-only** wasm codegen API now covers the active parity set (scalar + pointer/memory + aggregate paths used by fixtures/examples):

- `jsrust_backend_codegen_wasm_bytes(...)` emits `.wasm` bytes from binary IR v2
- existing interpreter run-path remains default and unchanged
- generated modules include memory/global/data sections (string literal data segments + exported memory)
- formatter builtins support both const and dynamic runtime values via additive host writer imports

Future codegen constraints (already decided):

- Output target: wasm binary (`.wasm`) only
- Compiler/toolchain: clang only
- No emscripten
- No WAT generation path
- No external dependencies

## Local Library Bootstrap

A baseline library file was fetched from:

- [May1a/libc `lib.c`](https://raw.githubusercontent.com/May1a/libc/refs/heads/main/lib.c)

And intentionally renamed to header form for overhaul:

- `/Users/may/jsrust/backend/include/libc.h`

This file is currently bootstrap material and needs a substantial cleanup/refactor pass.

## Structure

- `/Users/may/jsrust/backend/plans/`: active + future implementation plans
- `/Users/may/jsrust/backend/include/`: local runtime/library headers
- `/Users/may/jsrust/backend/src/`: backend implementation source
- `/Users/may/jsrust/backend/tools/`: helper scripts and fixture runners
- `/Users/may/jsrust/backend/tests/`: backend-focused tests
