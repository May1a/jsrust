# Plans Status (Current Structure)

This status file tracks only the current planning tracks under `active/` and `future/`.

For historical completion and archived phase detail, see:

- `/Users/may/jsrust/plans/old/STATUS.md`

## Future Track

- `future/01-node-addon-availability.md`: Deferred (captured as non-priority future work)
- `future/02-untrusted-compatibility.md`: Deferred (submodule added at `third_party/untrusted`; compatibility work tracked as future milestone)

## Active Track

- `active/01-compiler-progress.md`: Updated (borrow-lite + lifetime-erasure milestone captured alongside prior frontend/backend milestones)
- `active/02-new-backend.md`: In progress (wasm run-path integration wired; binary IR v2 + formatter builtins integrated; `run --codegen-wasm` in-memory generated-wasm execution wired)
- `active/03-relaxed-borrow-model.md`: Implemented (lifetime syntax erasure, borrow-lite dangling-escape checks, and stable address-taken local lowering)
