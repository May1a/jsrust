# ADR-0001: LLVM IR backend replaces C/WASM runtime

JSRust originally compiled Rust source to a custom SSA IR, serialized it to a binary format, and executed it via a C-based WASM runtime (interpreter and codegen). The split between a TypeScript "frontend" and a C "backend" added language boundary complexity, a bespoke binary format, and a WASM memory bridge — all for a runtime that did not produce standalone binaries.

We decided to remove the C backend entirely and target LLVM IR instead. The custom SSA IR is retained but refactored to mirror LLVM's model (phi nodes, insertvalue/extractvalue, LLVM-aligned types). A new lowering pass emits LLVM IR text and bitcode. Users run `lli`, `opt`, or `clang` on the output.

This is hard to reverse — every IR instruction, the type system, and the lowering pass are touched. Without this ADR, a future reader would wonder why the IR looks suspiciously like LLVM's or why there's no binary serialization.

**Considered options:**
- **Keep C backend, add LLVM IR as secondary target** — rejected: the C backend was the more complex and less useful path, and maintaining both would be unsustainable.
- **Emit LLVM IR directly from AST (skip custom IR)** — rejected: the custom IR is a useful intermediate that simplifies lowering and diagnostics.
