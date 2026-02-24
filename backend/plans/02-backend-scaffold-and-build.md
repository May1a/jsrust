# 02 - Backend Scaffold and Build (Interpreter Runtime)

## Purpose

Establish a deterministic, dependency-free C backend scaffold for IR execution.

## Deliverables

- project skeleton for parser/interpreter/runtime/tests
- build targets for backend binary and tests
- central error code model
- deterministic diagnostics + IO wrappers

## Planned File Layout

- `/Users/may/jsrust/backend/src/main.c`
- `/Users/may/jsrust/backend/src/cli.c`
- `/Users/may/jsrust/backend/src/cli.h`
- `/Users/may/jsrust/backend/src/errors.h`
- `/Users/may/jsrust/backend/src/errors.c`
- `/Users/may/jsrust/backend/src/log.h`
- `/Users/may/jsrust/backend/src/log.c`
- `/Users/may/jsrust/backend/src/fs.h`
- `/Users/may/jsrust/backend/src/fs.c`
- `/Users/may/jsrust/backend/Makefile`

## Task Breakdown

### Task 2.1 - Build Baseline

- add `make build`, `make test`, `make clean`
- compile with deterministic flags and warnings enabled
- support debug/release toggle without changing runtime semantics

### Task 2.2 - CLI Skeleton

- initial command contract:
    - `jsrust-backend-c run --input <module.jsrbin> [--entry <fn>] [--trace]`
- strict argument validation and clear usage output
- deterministic default entry policy (`main`)

### Task 2.3 - Error Taxonomy

- define stable numeric error classes:
    - invalid args
    - io/read failure
    - deserialize/schema failure
    - validate failure
    - execute/runtime trap
    - internal failure
- central mapping function from internal errors to process exit codes

### Task 2.4 - IO Primitives

- bounded file read helper with explicit max-size policy
- consistent path/open/read errors
- optional output writer for trace/report files with atomic write pattern

### Task 2.5 - Determinism Controls

- deterministic diagnostic ordering
- no timestamps/random ids in normal output
- deterministic trace ordering when `--trace` enabled

## Acceptance Criteria

- build/test/clean targets work on baseline environment
- invalid CLI invocations return stable codes/messages
- missing or unreadable input returns stable IO error path
- deterministic diagnostics confirmed by repeated run comparison

## Exit Condition

Scaffold is complete when parser/interpreter implementation can proceed without structural or tooling decisions.
