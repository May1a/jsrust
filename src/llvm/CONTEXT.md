# LLVM

Emission, printing, and toolchain for the LLVM IR target format. Consumes `IRModule` and produces `.ll` text and `.bc` bitcode.

## Language

**LLVM IR**:
The target output format. JSRust emits both human-readable `.ll` text and `.bc` bitcode, targeting the latest stable LLVM version.
_Avoid_: LLVM bitcode (when meaning the text format)

**LlvmModule**:
The top-level LLVM data structure. Contains source name, target version, named types, globals, declarations, and `LlvmFunction` definitions. Constructed by the emission pass from `IRModule`.
_Avoid_: LLVM program, LLVM unit

**LLVM emission**:
The pass that translates `IRModule` → `LlvmModule`. Walks every IR instruction, terminator, type, and function; maps each to its LLVM counterpart. Handles integer width mapping, enum aggregate layout, struct insertvalue/extractvalue, phi node generation, and printf declarations.
_Avoid_: LLVM codegen, LLVM lowering

**LLVM printer**:
Renders `LlvmModule` to `.ll` text format. Handles indentation, name escaping, type printing, global initializer formatting, and block-level instruction output.
_Avoid_: LLVM serializer, .ll writer

**LLVM toolchain**:
Wraps `llc`, `opt`, `lli`, and other LLVM CLI tools. Handles temporary file writing, assembly, verification, and execution of emitted bitcode. Used by execution tests.
_Avoid_: LLVM runner, backend tools

**Execution test**:
A test that compiles a `.rs` source file to LLVM IR, runs it through `lli`, and asserts stdout and exit code match expected values. Proves end-to-end correctness.
_Avoid_: Snapshot test, IR comparison test, regression test

## Relationships

- **SSA IR** → **LLVM emission** → **LlvmModule**
- **LlvmModule** → **LLVM printer** → `.ll` text
- **LlvmModule** → **LLVM toolchain** → `.bc` bitcode → **Execution test** via `lli`

## Example dialogue

> **Dev:** "Do we emit opaque pointers or typed pointers?"
> **Domain expert:** "Opaque pointers. The IR uses `PtrType` with an inner type, but the emitter maps to LLVM's opaque pointer `ptr`. Type information travels via GEP result types and load/store target types rather than pointer types."

## Flagged ambiguities

- "backend" previously meant the C/WASM runtime — removed entirely (see ADR-0001). The term should no longer be used.
- "frontend" previously meant the TypeScript compiler — now "compiler" is preferred since there is no backend split.
