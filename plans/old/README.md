# JSRust Compiler Implementation Plans

This directory contains implementation plans split into manageable tasks optimized for multi-agent collaboration.

## Overview

Building a Rust-to-SSA-IR compiler in pure JavaScript with:

- **Language support**: Functions, structs, enums, pattern matching, references, loops
- **Memory model**: Explicit alloca/load/store with linear scope allocator
- **Type system**: Local type inference within functions
- **IR output**: Binary format with structured serialization

## Plan Files

| File                   | Description                    | Dependencies                      |
| ---------------------- | ------------------------------ | --------------------------------- |
| `01-ast.md`            | AST node definitions           | None                              |
| `02-parser.md`         | Parser implementation          | 01-ast                            |
| `03-types.md`          | Type representation            | None                              |
| `04-type-inference.md` | Type checking & inference      | 03-types, 01-ast                  |
| `05-hir.md`            | High-level IR definitions      | 03-types                          |
| `06-lowering-hir.md`   | AST to HIR lowering            | 01-ast, 05-hir, 04-type-inference |
| `07-ssa-ir.md`         | SSA IR definitions             | 05-hir                            |
| `08-ssa-builder.md`    | SSA construction               | 07-ssa-ir                         |
| `09-hir-to-ssa.md`     | HIR to SSA lowering            | 05-hir, 07-ssa-ir, 08-ssa-builder |
| `10-memory-layout.md`  | Type layout & stack allocation | 07-ssa-ir                         |
| `11-binary-format.md`  | Binary serialization           | 07-ssa-ir, 10-memory-layout       |
| `12-validation.md`     | IR validation passes           | 07-ssa-ir, 09-hir-to-ssa          |
| `13-diagnostics.md`    | Error reporting system         | None                              |
| `14-output.md`         | Textual IR output              | 07-ssa-ir                         |

## Task Completion Protocol

An agent marks a task as complete when:

1. Implementation is done
2. Tests are written
3. All tests pass (`node tests/run.js`)

## Current Status

See `STATUS.md` for task completion tracking.

## Agent Workflow

1. Read a plan file to find incomplete tasks
2. Implement the code for that task
3. Write corresponding tests
4. Run `node tests/run.js` to verify
5. Mark task complete in plan file: `[ ]` → `[x]`
6. Update `STATUS.md` if phase complete

## Parallel Work Opportunities

Independent tasks that can be worked on simultaneously:

- **01-ast** and **03-types** have no dependencies
- **07-ssa-ir** and **13-diagnostics** are independent
- Multiple tests files can be written in parallel
