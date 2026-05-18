# Context Map

JSRust is a Rust-to-LLVM-IR compiler written in TypeScript. The pipeline produces LLVM IR text and bitcode from Rust source.

## Contexts

- [Parse](./src/parse/CONTEXT.md) — tokenizing and parsing Rust source into an AST
- [Passes](./src/passes/CONTEXT.md) — inference, derive expansion, module resolution, borrow check, monomorphization
- [Lowering](./src/passes/lowering/CONTEXT.md) — translating the typed AST into SSA IR
- [SSA IR](./src/ir/CONTEXT.md) — the custom IR model, builder, and validation
- [LLVM](./src/llvm/CONTEXT.md) — emission, printing, and the LLVM toolchain

## Relationships

- **Parse → Passes**: Parse emits `ModuleNode` (AST); Passes consume it for type inference and borrow checking
- **Passes → Lowering**: Passes emit `TypedModule` + `ModuleMetadata`; Lowering consumes them to produce `IRModule`. The seam is a **LoweringInput** produced from `ModuleMetadata` — Lowering never imports the inference types directly.
- **Lowering → SSA IR**: Lowering uses the `IRBuilder` seam to construct instructions, blocks, and functions. The builder appends to an `IRModule`.
- **SSA IR → LLVM**: LLVM emission reads `IRModule` and emits `LlvmModule`; the printer renders it to `.ll` text.

## Cross-cutting

- **Compile** lives in [src/compile.ts](./src/compile.ts) — pipeline orchestration, not a context
- **Diagnostics** lives in [src/utils/diagnostics.ts](./src/utils/diagnostics.ts) — currently unused, not a context
- **ADR-0001** records the decision to target LLVM IR instead of a C/WASM runtime
