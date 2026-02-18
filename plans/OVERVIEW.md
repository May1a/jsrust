# JSRust Implementation Plan Overview

## Goal
Build a Rust-to-SSA-IR compiler in pure JavaScript that outputs a binary IR format.

## Architecture

```
Source Code
    |
    v
Tokenizer (done)
    |
    v
Parser --> AST
    |
    v
Type Checker --> Typed AST
    |
    v
HIR Lowering --> High-level IR
    |
    v
SSA Construction --> SSA IR
    |
    v
Binary Serialization --> .jsr file
```

## Constraints
- Pure JavaScript, ES modules only
- No external dependencies
- Errors-as-values error handling
- Node-compatible APIs

## Feature Scope (Moderate Rust Subset)
- Functions with parameters and return types
- Struct and enum definitions
- Pattern matching
- References and borrowing (no full borrow checker)
- Local type inference
- Loops (loop, while, for)
- If/else expressions
- Basic operators

## Plan Files
- `01-ast.md` - AST node definitions
- `02-parser.md` - Parser implementation
- `03-types.md` - Type system
- `04-inference.md` - Type inference
- `05-hir.md` - High-level IR
- `06-lowering.md` - AST to HIR lowering
- `07-ssa-ir.md` - SSA IR definitions
- `08-ssa-construction.md` - SSA construction
- `09-memory.md` - Memory layout and stack allocation
- `10-binary.md` - Binary format serialization
- `11-validation.md` - IR validation
- `12-output.md` - Textual output and debugging

## Task Status
Each plan file contains tasks marked with status:
- `[ ]` - Not started
- `[~]` - In progress
- `[x]` - Complete (tests pass)

## Agent Workflow
1. Pick a task from a plan file
2. Implement the code
3. Write tests
4. Run tests: `node tests/run.js`
5. Mark task complete in plan file
6. Move to next task
