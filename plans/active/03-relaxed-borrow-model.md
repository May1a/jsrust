# Relaxed Borrow Model and Lifetime Erasure

## Goal

Ship a borrow-lite ownership model that keeps references pointer-like while avoiding rustc-level lifetime/borrow strictness.

## Scope

- Parse and ignore lifetime parameters/annotations (`'a`, `'_`) for items and reference types.
- Keep references as aliasing pointers (no exclusive-borrow conflict rejection).
- Enforce only a minimal safety floor:
  - reject returning references to locals/temporaries,
  - reject obvious local-reference escapes into longer-lived bindings.
- Stabilize reference lowering so address-taken locals use stable storage slots.

## Implemented Milestones

1. Lifetime syntax erasure
   - Tokenizer adds `Lifetime` token (`'a`, `'_`) while preserving char literal handling.
   - Parser accepts lifetime params/args and reference lifetimes, storing ignored item/ref metadata.
   - Inert attributes accepted/ignored for this track (`#[inline]`, `#![...]`).
2. Borrow-lite semantic pass
   - New `checkBorrowLite(moduleAst, typeCtx)` pass runs after inference and before lowering.
   - Minimal dangling-reference escape checks are hard errors (diagnostic kind `borrow`).
3. Stable reference lowering
   - HIR->SSA lowering now uses lazy, stable allocas for address-taken locals.
   - `&x` reuses the same storage slot for `x` across repeated borrows.
4. Coverage/tests
   - Parser coverage added for lifetime item/type syntax and inert attribute acceptance.
   - New borrow-lite inference tests added.
   - HIR->SSA and E2E coverage added for stable references and `&mut` write/read flow.

## Notes

- This track targets borrow/lifetime readiness, not full `third_party/untrusted` compatibility.
- Grouped imports, closures, `?`, and broader trait-system/runtime compatibility remain separate tracks.
