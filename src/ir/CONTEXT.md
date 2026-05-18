# SSA IR

The project's custom Static Single Assignment intermediate representation, modeled after LLVM IR. Sits between the typed AST and LLVM emission.

## Language

**SSA IR**:
A three-address-code IR with phi nodes, basic blocks with terminators, and LLVM-aligned types. Every value has a unique `ValueId`. Produced by lowering, consumed by validation and LLVM emission.
_Avoid_: JSRust IR (redundant in context), custom IR

**IRModule**:
The top-level container. Holds a list of `IRFunction`, string literals, struct type definitions, and enum type definitions. Serialized to LLVM IR by the LLVM context.
_Avoid_: Module, IR program

**IRFunction**:
A named function with typed parameters, a return type, and a list of `IRBlock`. Entry block is the first block.
_Avoid_: Function body, function definition

**IRBlock**:
A basic block identified by `BlockId`. Contains a list of `IRInst` and exactly one `IRTerm` (branch, return, switch, unreachable). Has typed phi-node parameters. Accumulates predecessor edges for SSA construction.
_Avoid_: Basic block body

**IRInst**:
A single one-result instruction with a `ValueId`, an instruction type (add, load, call, structCreate, etc.), and operand `ValueId` references. Also carries its result `IRType`.
_Avoid_: Statement, operation

**IRTerm**:
A terminator instruction. Marks the end of a block and transfers control: `br`, `brIf`, `switch`, `ret`, `unreachable`.
_Avoid_: Control flow instruction, exit instruction

**IRBuilder**:
Incremental construction interface for SSA IR. Manages the current function and block, appends instructions and terminators, creates blocks, tracks SSA variable definitions and incomplete phi nodes. Exposes a `build()` method that finalizes and returns the `IRFunction`. Used by the Lowering context.
_Avoid_: IR emitter, SSA emitter

**IRType**:
Abstract base for the type system: `IntType`, `FloatType`, `BoolType`, `PtrType`, `UnitType`, `StructType`, `EnumType`, `ArrayType`, `FnType`. Each has a `kind` discriminant (`IRTypeKind`). Supports `typeEq` for structural comparison and a visitor for pattern matching.
_Avoid_: Type representation, type descriptor

**IR validation**:
A pass that checks def-use chains, terminator presence on every block, branch target validity, instruction operand types, enum/struct bounds, and block parameter correctness. Produces a list of `IRValidationError` or passes.
_Avoid_: IR checker, verifier

## Relationships

- **Lowering** → constructs **IRFunction** via **IRBuilder** → stored in **IRModule**
- **IR validation** reads **IRModule** → reports errors or passes
- **LLVM emission** reads **IRModule** → produces **LlvmModule**

## Example dialogue

> **Dev:** "What happens if a block has no terminator when `build()` is called?"
> **Domain expert:** "`IRBuilder.build()` throws. The lowering pass should have emitted a terminator for every reachable block. Unreachable blocks without terminators are caught during IR validation — `checkTerminatorPresence` flags them."

## Flagged ambiguities

- "Module" previously meant both `ModuleNode` (AST) and `IRModule` (SSA) — resolved: always qualify with the context prefix (`IRModule`, `ModuleNode`)
- "validate" previously meant both IR validation and the compile option — now "IR validation" for the pass, "validate option" for the compile flag
