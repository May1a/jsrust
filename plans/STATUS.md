# Plans Status (Current Structure)

This status file tracks only the current planning tracks under `active/` and `future/`.

For historical completion and archived phase detail, see:

- `/Users/may/jsrust/plans/old/STATUS.md`

## Future Track

- `future/01-node-addon-availability.md`: Deferred (captured as non-priority future work)
- `future/02-untrusted-compatibility.md`: Deferred (submodule added at `third_party/untrusted`; compatibility work tracked as future milestone)

## Active Track

- `active/01-compiler-progress.md`: Updated (borrow-lite + lifetime-erasure milestones retained; strict stdlib-first Vec milestone captured: compiler-injected stdlib `Vec`, builtin declaration metadata, impl-generic method instantiation, `vec![...]` list form, by-value `get`/`[]`/`pop`, Copy-gated by-value diagnostics, and deterministic repeat-form unsupported error)
- `active/02-new-backend.md`: In progress (wasm run-path integration wired; binary IR v2 + formatter builtins integrated; `run --codegen-wasm` in-memory generated-wasm execution wired; allocator/copy/panic builtin wasm lowering + GEP/call coercion fixes landed; Vec interpreter/generated-wasm parity fixtures are green)
- `active/03-relaxed-borrow-model.md`: Implemented (lifetime syntax erasure, borrow-lite dangling-escape checks, and stable address-taken local lowering)
- `active/04-stdlib-vec-via-builtins.md`: Implemented (first milestone) (stdlib-injected Rust `Vec<T>` path active with allocator builtins and interpreter/generated-wasm parity for list-form `vec!`, `push`, `len`, `capacity`, `get`, `[]`, `pop`; repeat-form/by-ref indexing/`Option<T>` pop semantics remain deferred by design)
