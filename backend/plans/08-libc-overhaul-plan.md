# 08 - Local `libc.h` Overhaul Plan

## Context

Bootstrap library file:

- `/Users/may/jsrust/backend/include/libc.h`

Source origin (fetched snapshot):

- [May1a/libc `lib.c`](https://raw.githubusercontent.com/May1a/libc/refs/heads/main/lib.c)

This file was intentionally renamed to `.h` and needs substantial cleanup before it can serve as stable backend runtime support.

## Purpose

Convert bootstrap `libc.h` into a minimal, auditable support layer aligned with interpreter runtime requirements.

## Constraints

- no third-party dependency additions
- deterministic behavior only
- explicit contracts for all exported helpers

## Deliverables

- clear public/private split
- cleaned symbol surface
- hardened memory/string/utility helpers used by runtime
- tests for retained API surface
- contract documentation

## Task Breakdown

### Task 8.1 - Symbol Inventory

- catalog all symbols
- classify each as keep/remove/replace/defer

### Task 8.2 - Surface Partitioning

- split public headers and private implementation units
- remove accidental exports and ambiguous macros

### Task 8.3 - Runtime Alignment

- align helper behavior with interpreter runtime needs
- remove host/platform assumptions not required by backend

### Task 8.4 - Type and Naming Hygiene

- normalize naming and fixed-width integer usage
- eliminate UB-prone macro patterns and pointer misuse risks

### Task 8.5 - Error Semantics

- define invalid-input behavior for each retained function
- ensure deterministic return/error behavior

### Task 8.6 - Hardening

- add bounds checks and safe copy patterns
- guard against overflow and underflow edge cases

### Task 8.7 - Test Harness

- add focused tests per retained function family
- include negative and boundary-case tests

### Task 8.8 - Documentation

- create `backend/include/libc-contract.md`
- document retained APIs, behavior guarantees, and exclusions

## Acceptance Criteria

- retained API is explicit and tested
- helper behavior is deterministic and runtime-compatible
- no hidden assumptions conflict with interpreter backend goals

## Exit Condition

Overhaul is complete when runtime support helpers are minimal, well-defined, and safe enough for long-term backend usage.
