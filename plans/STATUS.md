# Plans Status (Current Structure)

## Active Track — Frontend Feature Plan Sequence

Plans 01–09 are sequential. Each plan depends on all preceding plans being complete.

| Plan | Title | Status |
|------|-------|--------|
| `01-type-inference-correctness.md` | Type Inference Correctness | complete |
| `02-lowering-correctness.md` | Lowering Correctness | pending |
| `03-ir-validation-strengthening.md` | IR Validation Strengthening | pending |
| `04-monomorphization-hardening.md` | Monomorphization Hardening | pending |
| `05-type-aliases-and-casts.md` | Type Aliases & Cast Expressions | pending |
| `06-ranges-and-for-loops.md` | Range Expressions & `for` Loops | pending |
| `07-capturing-closures.md` | Capturing Closures | pending |
| `08-try-operator-and-if-let.md` | `?` Operator & `if let` Patterns | pending |
| `09-static-items.md` | `static` Items | pending |

## Dependency Graph

```
P01 (Inference)
  └─→ P02 (Lowering)
       └─→ P03 (IR Validation)
            └─→ P04 (Monomorphization)
                 └─→ P05 (Type Aliases & Casts)
                      └─→ P06 (Ranges & For Loops)
                           └─→ P07 (Capturing Closures)
                                └─→ P08 (? Operator & if let)
                                     └─→ P09 (Static Items)
```

## Plan Removal

After completion, delete the plan file and update this status tracker.
