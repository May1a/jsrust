# 04 - IR Interpreter Core

## Purpose

Implement the execution engine that interprets validated JSRust IR function/block/instruction graphs.

## Inputs

- decoded IR model from `03-binary-ir-reader.md`
- validation requirements from `/Users/may/jsrust/docs/backend/validation-semantics.md`

## Deliverables

- entrypoint execution loop
- basic-block dispatcher
- instruction evaluator for supported opcode set
- trap/error handling model for unsupported or invalid runtime states

## Execution Model

- function execution starts at entry block
- current frame owns locals + SSA value table
- terminators drive block transitions or function exit
- runtime errors stop execution immediately with stable error code

## Task Breakdown

### Task 4.1 - Execution Context Structures

- define `ExecContext`:
  - module reference
  - global state
  - call stack
  - current frame pointer
- define `Frame`:
  - function id/ref
  - current block id
  - SSA value table
  - local storage table

### Task 4.2 - Value Representation

- define tagged runtime value type supporting current IR primitives:
  - integers
  - floats
  - bool
  - pointer/opaque handle
  - unit
- include conversion helpers with explicit failure semantics

### Task 4.3 - Terminator Semantics

- implement `ret`
- implement `br`
- implement `br_if`
- implement `switch`
- verify branch arg arity/type before transition

### Task 4.4 - Core Instruction Semantics

Implement and test execution semantics for currently-used core ops:

- constants: `iconst`, `fconst`, `bconst`, `null`
- int arithmetic/logical/bitwise/shift ops
- float arithmetic ops
- compare ops (`icmp`, `fcmp`)
- unary ops (`ineg`, `fneg`)
- basic casts where present in current IR fixtures

### Task 4.5 - Function Call Semantics

- resolve call target in module
- evaluate args and initialize callee frame
- return value propagation to caller SSA table
- handle recursion limits/stack guard policy

### Task 4.6 - Runtime Trap Semantics

Define deterministic failure behavior for:

- invalid value id access
- type mismatch at runtime
- missing block/invalid jump
- divide-by-zero and invalid numeric operations
- unsupported opcode

### Task 4.7 - Optional Trace Mode

- emit deterministic execution trace when enabled
- include block transitions, instruction ids, and result summaries

## Acceptance Criteria

- interpreter executes supported fixtures end-to-end
- control-flow-heavy fixtures produce deterministic results
- all runtime traps map to stable error classes/messages
- trace mode output is stable across repeated runs

## Test Plan

- per-opcode semantic unit tests
- block/branch/switch behavior tests
- function call/return tests (including nested calls)
- deterministic replay tests (same input => same output + trace)

## Exit Condition

Interpreter core is complete when non-memory-heavy fixture set executes correctly and unsupported ops fail deterministically.
