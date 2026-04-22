# JSRust Plans

## Plan removal
After the completion of a plan it should be deleted.

## Current Plan Files

- `STATUS.md`: status tracker for the active plan set.

### Frontend Plans (01–09)

Sequential plan sequence for frontend correctness and feature implementation.
Execute in order — each plan depends on all preceding plans being complete.

| # | File | Description |
|---|------|-------------|
| 01 | `01-type-inference-correctness.md` | Fix all type inference bugs (literal suffixes, `_` placeholder, qualified paths, closure returns) |
| 02 | `02-lowering-correctness.md` | Fix deref type, assignment targets, tuple/array lowering |
| 03 | `03-ir-validation-strengthening.md` | Add semantic IR validation (type consistency, def-use, return types) |
| 04 | `04-monomorphization-hardening.md` | Fix generic arg checking, extend unification, generic struct support |
| 05 | `05-type-aliases-and-casts.md` | Implement `type` aliases and `as` cast expressions |
| 06 | `06-ranges-and-for-loops.md` | Implement range expressions and `for` loop iteration |
| 07 | `07-capturing-closures.md` | Implement closures that capture enclosing variables |
| 08 | `08-try-operator-and-if-let.md` | Implement `?` operator and `if let` patterns |
| 09 | `09-static-items.md` | Implement `static` global items |
