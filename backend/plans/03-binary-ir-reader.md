# 03 - Binary IR Reader and Validation Gate

## Purpose

Implement strict ingestion of JSRust binary IR v1 in C, producing a validated in-memory module model ready for wasm lowering.

## Inputs

- JSRust binary contract v1: `/Users/may/jsrust/docs/backend/binary-ir-contract-v1.md`
- Validation semantics: `/Users/may/jsrust/docs/backend/validation-semantics.md`
- Fixture corpus: `/Users/may/jsrust/tests/fixtures/backend_ir_v1/`

## Deliverables

- Binary reader with complete header + section parsing
- Bounds-checked primitive readers (`u8/u16/u32/i64/f64` little-endian)
- In-memory IR model in C structs
- Immediate failure on invalid version/schema/reference
- Reader-level conformance tests against known fixtures

## Planned File Layout

- `/Users/may/jsrust/backend/src/ir_binary.h`
- `/Users/may/jsrust/backend/src/ir_binary.c`
- `/Users/may/jsrust/backend/src/ir_model.h`
- `/Users/may/jsrust/backend/src/ir_validate_min.h`
- `/Users/may/jsrust/backend/src/ir_validate_min.c`
- `/Users/may/jsrust/backend/tests/reader_cases.c`

## Data Structure Plan

### Module-Level

- string table (`char**`, count)
- struct table
- enum table
- globals
- functions

### Function-Level

- params, return type
- locals
- blocks

### Block-Level

- block params
- instruction list
- one terminator

## Task Breakdown

### Task 3.1 - Primitive Reader Core

- Build bounded cursor reader with:
  - `read_u8`, `read_u16`, `read_u32`, `read_i64`, `read_f64`
  - fail-fast on out-of-range reads
- Add helper to read and copy byte spans safely.

### Task 3.2 - Header + Section Dispatch

- Parse full 28-byte header.
- Validate magic exactly.
- Validate version equals `1`.
- Verify section offsets are monotonic and within file bounds.

### Task 3.3 - String Table

- Parse count and each string length+bytes.
- NUL-terminate copied strings in owned memory.
- Reject out-of-range string IDs in all downstream references.

### Task 3.4 - Type Decoder

- Implement tag-driven type decoder for all v1 type kinds.
- Preserve recursive nesting for arrays/functions.
- Validate recursion depth limits to avoid malicious nesting blowups.

### Task 3.5 - Globals/Functions/Blocks Decoder

- Decode globals and optional initializers.
- Decode function signatures and locals.
- Decode blocks, instructions, terminators.
- Reject unknown opcode/terminator/type tags.

### Task 3.6 - Minimal Structural Validation Gate

- Check obvious invariants before codegen:
  - every function has at least one block
  - block IDs are unique per function
  - referenced block IDs exist
  - referenced values are in-range where representable in reader model

### Task 3.7 - Memory Ownership + Cleanup

- Implement module destroy/free routines.
- Ensure no leaks on partial-parse failures.

## Acceptance Criteria

- Every fixture binary in `/Users/may/jsrust/tests/fixtures/backend_ir_v1/` parses successfully.
- Corrupted magic/version/header offsets are rejected with deterministic codes.
- Unknown opcode/type tag is rejected.
- Truncated fixtures at arbitrary cut points are rejected.

## Test Plan

- Golden-path parse tests for all fixture binaries.
- Negative corpus:
  - wrong magic
  - wrong version
  - invalid section offsets
  - truncated at each 8-byte boundary
  - out-of-range string/type references
- Leak/regression checks via repeated parse+destroy loops.

## Exit Condition

Reader is complete when it can parse and validate all v1 fixture artifacts and reliably reject malformed binaries without crashes or leaks.
