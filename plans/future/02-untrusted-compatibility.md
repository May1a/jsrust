# Future Plan: `untrusted` Compatibility Target

## Goal

Track incremental frontend/runtime compatibility work needed to compile the upstream
`untrusted` crate (added as submodule at `third_party/untrusted`).

## Why This Target

- Small, dependency-free Rust library.
- Real-world parser-style code with practical API surfaces.
- Good medium-term validation target for language subset progress.

## Current State

- Submodule added:
  - `third_party/untrusted`
- Not expected to compile yet with current JSRust subset.
- Parser syntax-compat slice landed for `third_party/untrusted/src/input.rs`:
  - Consumes function-trait bound tails in bounds/`where` (`FnOnce(...) -> ...`).
  - Accepts restricted visibility syntax forms such as `pub(super)`.
  - Consumes postfix try-operator syntax (`expr?`) as parse-only compatibility.
- `lib.rs` re-export syntax support added:
  - `pub use { ... };` grouped import trees with empty prefix now parse and resolve.

## Planned Milestones (Future / Deferred)

1. Surface scan and gap map
   - Catalogue used Rust features in `third_party/untrusted`.
   - Map to supported/unsupported JSRust features.
2. Frontend compatibility slice
   - Prioritize minimal feature additions needed for first successful parse+typecheck.
3. IR/lowering parity slice
   - Ensure required control-flow/data-model constructs lower correctly.
4. Runtime/link slice
   - Validate generated program behavior for key `untrusted` entry points.

## Exit Criteria (Future)

- Representative `untrusted` source files compile through parse -> resolve -> infer -> lower.
- At least one meaningful execution path runs correctly under current run pipeline.
