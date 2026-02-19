# C Backend Submodule Interface Contract (Interpreter Run Mode)

This is the concrete handoff contract for the C backend submodule consuming JSRust binary IR.

## Input Contract

- Input format: binary IR file conforming to `/Users/may/jsrust/docs/backend/binary-ir-contract-v1.md`.
- Input extension: `.jsrbin` or `.bin`.
- Input must deserialize successfully and pass IR validation semantics.

## CLI Entrypoint Contract

Backend executable contract:

```txt
jsrust-backend-c run --input <path/to/module.jsrbin> [--entry <fn>] [--trace] [--trace-out <path>]
```

Required:

- `run`
- `--input`

Optional:

- `--entry` (defaults to `main`)
- `--trace`
- `--trace-out` (valid only with `--trace`)

## JSRust Frontend Invocation Contract

JSRust frontend integration entrypoint:

```txt
node /Users/may/jsrust/main.js run <file.rs> [--entry <fn>] [--trace] [--trace-out <path>] [--backend-bin <path>] [--out-bin <path>] [--keep-bin] [--no-validate] [--no-build-backend]
```

Behavior:

- compile Rust source to binary IR before backend invocation
- backend binary resolution order:
  1. `--backend-bin`
  2. `JSRUST_BACKEND_BIN`
  3. `/Users/may/jsrust/backend/bin/jsrust-backend-c`
- if default backend binary is missing and auto-build is enabled, frontend runs:

```txt
make -C /Users/may/jsrust/backend build
```

- backend success stdout is forwarded unchanged
- backend non-zero exit code is forwarded by frontend
- default binary artifact behavior:
  - temp `.jsrbin` is deleted on success
  - kept on failure with emitted path
  - persisted when `--keep-bin` or `--out-bin` is provided

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

## Exit Code Contract

CLI process exit codes map directly to `jsrust_backend_error_code`.

- `0`: success
- non-zero: stable failure category, machine-parseable

## Output Expectations

Success guarantees:

- stdout contains a deterministic single-line result (`ok` or `ok exit=<value>`)
- stderr contains no error diagnostics
- if `--trace --trace-out` is set, trace output is written atomically

Failure guarantees:

- non-zero exit code from contract set
- deterministic single-line primary diagnostic on stderr
- no partially written trace artifact at final output path

## Integration Test Expectation

JSRust side should invoke backend only after:

1. binary fixture compatibility checks pass
2. deserialize/validate compatibility checks pass

Reference conformance tests:

- `/Users/may/jsrust/tests/binary/conformance.js`
