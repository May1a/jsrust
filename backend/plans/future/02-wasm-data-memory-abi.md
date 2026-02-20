# Future 02 - WASM Data, Memory, and ABI

Status: in progress (initial memory/data ABI implementation landed for parity set).

## Purpose

Define wasm memory/global/data and ABI behavior for generated modules once codegen exists.

## Prerequisites

- `future/01-wasm-codegen-core.md` in progress
- interpreter runtime model semantics frozen (from `05-ir-interpreter-runtime-model.md`)

## Deliverables

- wasm linear-memory policy
- global/data emission strategy
- wasm ABI rules for params/returns/aggregates
- pointer/addressing mapping from IR semantics

## Task Breakdown

### Task F2.1 - Memory Model Definition

- initial memory pages and growth policy
- reserved regions and alignment rules

Status: implemented (initial: linear memory with reserved base + mutable heap pointer global).

### Task F2.2 - Global/Data Lowering

- globals and initializers mapping
- unsupported initializer rejection behavior

Status: implemented (initial: string literal pool lowered into data segments with pointer addresses).

### Task F2.3 - Memory Ops Lowering

- `alloca`, `load`, `store`, `memcpy`, `gep`, `ptradd`
- deterministic mapping rules and safety assumptions

Status: implemented (initial parity-oriented lowering aligned with interpreter behavior for current fixtures/examples).

### Task F2.4 - Struct/Enum Layout Bridge

- canonical offset/tag/payload layout mapping
- unsupported layout assertions

Status: implemented (initial packed slot/tag+payload model for current aggregate fixture/example coverage).

### Task F2.5 - ABI Contract

- calling convention for scalar + aggregate args/returns
- export/import surface documentation

Status: in progress (scalar+pointer+aggregate return/call surface active; further hardening pending).

## Acceptance Criteria

- generated wasm handles memory/global-heavy fixture subset correctly
- ABI behavior documented and stable
- layout-sensitive tests deterministic across repeated runs
