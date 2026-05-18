# JSRust

A Rust-to-LLVM-IR compiler written in TypeScript. Parses Rust source, type-checks it, and emits LLVM IR text and bitcode.

## Language

**Partial borrow check**:
The project's borrow verification pass. It rejects dangling references (references to locals or temporaries that escape their scope) but does not enforce full Rust aliasing rules.
_Avoid_: Borrow-lite, borrow checking, reference analysis

**Monomorphization**:
The strategy of substituting generic type parameters with concrete types before IR generation, producing a separate instantiation per unique concrete type (e.g., `id_i32`, `id_bool`). Currently used; alternatives (sharing, dynamic dispatch) are deferred for future exploration.
_Avoid_: Specialization, devirtualization

**SSA IR**:
The project's custom Static Single Assignment intermediate representation, modeled after LLVM IR. It sits between the typed AST and LLVM emission. Uses phi nodes, basic blocks with terminators, and LLVM-aligned types.
_Avoid_: JSRust IR (redundant in context), custom IR

**LLVM IR**:
The target output format. JSRust emits both human-readable `.ll` text and `.bc` bitcode, targeting the latest stable LLVM version.
_Avoid_: LLVM bitcode (when meaning the text format)

## Relationships

- **Rust source** → tokenizer → parser → **ModuleNode** (AST)
- **ModuleNode** → type inference → **TypedModule**
- **TypedModule** → partial borrow check → monomorphization → **SSA IR**
- **SSA IR** → validation → **LLVM IR** (text or bitcode)

## Flagged ambiguities

**Execution test**:
A test that compiles a `.rs` source file to LLVM IR, runs it through `lli`, and asserts stdout and exit code match expected values. Proves end-to-end correctness.
_Avoid_: Snapshot test, IR comparison test, regression test

- "backend" previously meant the C/WASM runtime — removed entirely (see ADR-0001). The term should no longer be used.
- "frontend" previously meant the TypeScript compiler — now "compiler" is preferred since there is no backend split.
