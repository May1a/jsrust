# 05 - IR Interpreter Runtime Model (Memory, Globals, Calls)

## Purpose

Define and implement runtime state semantics for memory, globals, pointers, aggregates, and frame lifecycle in interpreter mode.

## Deliverables

- runtime memory model specification and implementation
- global init/storage semantics
- pointer and aggregate access behavior
- frame lifecycle and call boundary invariants

## Runtime Model Scope

- in-process execution only
- deterministic memory allocation strategy
- explicit handling of struct/enum layout semantics consistent with IR

## Task Breakdown

### Task 5.1 - Global State Initialization

- initialize global table before entry function execution
- support int/float/bool initializers
- reject unsupported global initializer forms early

### Task 5.2 - Memory Arena Strategy

- define arena(s) for interpreter-managed memory
- deterministic allocation policy for `alloca`/temporary objects
- explicit bounds metadata for pointer safety checks

### Task 5.3 - Memory Instructions

Implement runtime semantics for:

- `alloca`
- `load`
- `store`
- `memcpy`
- `gep`
- `ptradd`

with strict validation of:

- alignment assumptions
- pointer origin/region
- offset and bounds checks

### Task 5.4 - Struct and Enum Runtime Layout

- map struct fields to deterministic offsets
- map enum tag/payload representation
- implement `struct_create`, `struct_get`, `enum_create`, `enum_get_tag`, `enum_get_data` behavior

### Task 5.5 - Frame Lifecycle and Call Boundaries

- define frame push/pop semantics
- ensure no stale pointer/frame-local references survive invalidly
- enforce return value type correctness at frame unwind

### Task 5.6 - Safety Invariants

- prevent invalid pointer dereference
- prevent load/store type confusion
- ensure deterministic trap on invalid runtime state

### Task 5.7 - Performance Guardrails (Non-Optimization)

- avoid pathological overhead in value lookup and memory operations
- add simple counters for runtime diagnostics in debug mode

## Acceptance Criteria

- memory/global/aggregate fixtures execute correctly and deterministically
- invalid pointer/memory operations trap with stable diagnostics
- frame and global invariants hold under repeated run stress tests

## Test Plan

- focused memory op tests (alloca/load/store/gep/memcpy)
- struct/enum field/tag/payload access tests
- call stack stress tests and recursion-limit behavior
- negative tests for bounds/type violations

## Exit Condition

Runtime model track is complete when memory/global/aggregate IR programs execute correctly and runtime safety traps are deterministic.
