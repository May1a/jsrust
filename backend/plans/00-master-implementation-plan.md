# 00 - Master Backend Implementation Plan (Interpreter-First)

## Objective

Build a standalone C backend that consumes JSRust binary IR v1 and **executes/interprets IR directly** with deterministic behavior.

WASM generation is explicitly deferred to future plans.

## Locked Decisions

- Immediate backend mode: IR interpretation/execution
- No external dependencies
- Build with standard C toolchain (clang preferred)
- Input contract: JSRust binary IR v1
- Deterministic results and diagnostics required

## Deferred Decisions (Future Track)

- wasm binary generation (`.wasm`)
- wasm ABI/export policy details
- wasm memory/data section encoding strategy

## Milestone Sequence (Immediate)

1. Scaffold/build/error model baseline
2. Binary IR reader + hard validation gate
3. Interpreter core (control flow + instruction semantics)
4. Runtime model (values, memory, call frames, globals)
5. CLI/API driver for execution mode
6. Conformance tests + CI gating
7. `libc.h` overhaul to support runtime needs cleanly

## Work Packages

### WP-1: Scaffold and Deterministic Build

- finalize folder structure
- create build targets and test runner entry points
- centralize error codes and diagnostic formatting
- implement deterministic file IO wrappers

Gate:

- binary builds reproducibly
- argument and IO failures map to stable codes

### WP-2: Binary Reader and Validation Gate

- implement bounded binary parser
- parse/validate header, sections, tags, references
- construct owned in-memory IR model
- reject malformed input deterministically

Gate:

- parses all known-good fixtures
- rejects corrupted fixtures without crashes/leaks

### WP-3: Interpreter Core

- execute function/block graph starting at entry
- support terminator semantics (`ret`, `br`, `br_if`, `switch`)
- support current instruction subset with precise type-aware behavior
- deterministic trap/error semantics for unsupported ops

Gate:

- expression/control-flow fixture programs execute correctly
- unsupported instructions fail with stable diagnostics

### WP-4: Runtime Model

- define runtime value representation
- define frame/stack model and local/value lookup
- define global storage and initialization behavior
- define memory/pointer semantics for supported IR ops

Gate:

- memory/global heavy fixtures execute deterministically
- runtime state invariants hold under test

### WP-5: Driver/CLI Contract

- finalize execution command contract
- add entry-function selection (`main` default)
- add deterministic result formatting (exit + optional value)
- guarantee stable failure behavior and no partial artifacts

Gate:

- JS side can invoke backend execution with no further design decisions

### WP-6: Testing and CI

- add backend fixture execution suite
- add negative malformed-binary corpus
- add deterministic repeated-run checks
- block merges on conformance regression

Gate:

- CI catches parse/execute behavior drift and deterministic failures

### WP-7: `libc.h` Overhaul

- audit and split public/private APIs
- remove host assumptions not needed for interpreter runtime
- harden safety/correctness and add tests

Gate:

- runtime support layer is explicit, minimal, and validated

## Done Definition (Immediate Track)

All required:

- WP-1..WP-7 complete with acceptance criteria met
- `backend/plans/STATUS.md` updated at each milestone close
- deterministic execution confirmed across repeated runs
- root fixture compatibility maintained

## Risk Register

- IR semantic mismatch vs JS pipeline
    - mitigation: fixture-based parity checks and expected-result manifest
- runtime memory model bugs
    - mitigation: focused memory/global tests and invariant checks
- schema drift risk
    - mitigation: strict version checks + CI fixture updates only via review
- bootstrap library quality risk (`libc.h`)
    - mitigation: dedicated cleanup milestone before broad usage

## Reporting Cadence

- Update `backend/plans/STATUS.md` at each milestone boundary.
- Record unresolved decisions inside the owning phase plan file.
