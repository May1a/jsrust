# 06 - Execution Driver, CLI, and Artifact Contract

## Purpose

Finalize backend execution-mode interface so JSRust can invoke the backend as an IR runner/interpreter.

## Deliverables

- stable CLI command contract
- stable exit codes and stderr diagnostics
- deterministic execution result format
- optional trace artifact policy

## CLI Contract (Immediate)

```txt
jsrust-backend-c run --input <path/to/module.jsrbin> [--entry <fn>] [--trace] [--trace-out <path>]
```

Required:

- `run`
- `--input`

Optional:

- `--entry` (default `main`)
- `--trace`
- `--trace-out` (valid only with `--trace`)

## Programmatic API Contract

```c
typedef enum jsrust_backend_error_code {
  JSRUST_BACKEND_OK = 0,
  JSRUST_BACKEND_ERR_IO = 10,
  JSRUST_BACKEND_ERR_INVALID_ARGS = 11,
  JSRUST_BACKEND_ERR_DESERIALIZE = 20,
  JSRUST_BACKEND_ERR_UNSUPPORTED_VERSION = 21,
  JSRUST_BACKEND_ERR_VALIDATE = 30,
  JSRUST_BACKEND_ERR_EXECUTE = 40,
  JSRUST_BACKEND_ERR_INTERNAL = 100
} jsrust_backend_error_code;

typedef struct jsrust_backend_exec_result {
  jsrust_backend_error_code code;
  const char *message;
  int64_t exit_value;
  int has_exit_value;
} jsrust_backend_exec_result;

jsrust_backend_exec_result jsrust_backend_run_file(
  const char *input_path,
  const char *entry_fn,
  int trace_enabled,
  const char *trace_out_path
);
```

## Task Breakdown

### Task 6.1 - CLI Parsing and Validation

- enforce valid combinations
- reject unknown flags
- stable usage/help text

### Task 6.2 - Execution Result Surface

- define stdout format for success:
  - execution status
  - optional scalar return value
- define stderr format for failure

### Task 6.3 - Trace Artifact Rules

- when trace enabled and output path provided:
  - write deterministic trace artifact atomically
- on failure:
  - no partial trace file at final path

### Task 6.4 - JS Integration Adapter Spec

- document subprocess invocation pattern from JS side
- define how JS maps exit code + stderr into diagnostics

## Acceptance Criteria

- CLI handles valid and invalid invocation matrix deterministically
- exit codes map 1:1 to error taxonomy
- successful execution emits stable result output
- trace behavior is deterministic and atomic

## Exit Condition

Driver track is complete when JS caller can run IR execution and parse outcomes without additional contract design.
