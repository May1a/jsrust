# Future 02 - WASM Data, Memory, and ABI (Deferred)

Status: deferred until Future 01 starts and interpreter runtime semantics are locked.

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

### Task F2.2 - Global/Data Lowering

- globals and initializers mapping
- unsupported initializer rejection behavior

### Task F2.3 - Memory Ops Lowering

- `alloca`, `load`, `store`, `memcpy`, `gep`, `ptradd`
- deterministic mapping rules and safety assumptions

### Task F2.4 - Struct/Enum Layout Bridge

- canonical offset/tag/payload layout mapping
- unsupported layout assertions

### Task F2.5 - ABI Contract

- calling convention for scalar + aggregate args/returns
- export/import surface documentation

## Acceptance Criteria

- generated wasm handles memory/global-heavy fixture subset correctly
- ABI behavior documented and stable
- layout-sensitive tests deterministic across repeated runs
