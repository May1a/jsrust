# Compiler Progress and Long-Term Gap Plan

## Progress Completed

Based on archived plans in `/Users/may/jsrust/plans/old`:

- Parsing, AST, and type representation foundations were completed.
- Type inference, HIR modeling, and AST -> HIR lowering were completed.
- SSA IR model, builder support, and HIR -> SSA lowering were completed.
- Memory layout, binary format, diagnostics, validation, and textual output tracks were completed.
- End-to-end and binary-focused test suites exist and are actively used.

## Remaining for Functioning Rust Compiler

Prioritized milestones:

1. Language coverage expansion.
2. Semantic analysis maturity.
3. Backend/codegen integration.
4. Runtime/linking/toolchain integration.
5. Optimization/debuggability/diagnostics polish.

## Progress Matrix Template

Use this table for ongoing tracking:

| Area | Done | In Progress | Blocked | Next |
| ---- | ---- | ----------- | ------- | ---- |
| Frontend Language Coverage | Baseline subset implemented; loop `break`/`continue` semantics in type inference improved (`break <expr>` for `loop`); module support added (inline `mod`, file `mod name;`, simple `use path;` + `use path as alias;`, visibility-aware path resolution); inherent `impl Struct` support added (impl parsing, `pub` struct fields, receiver params `self`/`&self`/`&mut self`, static/receiver method dispatch, `Self` substitution in methods); simplified compiler-owned trait model added (`trait` item parsing, `impl Trait for Type`, global trait method lookup with inherent-first dispatch, strict `(Trait, Type)` uniqueness checks); compiler-builtin derive path added (`#[derive(Clone, Copy, Debug)]` for structs with compiler expansion); generic function milestone added (`fn f<T>(...)`, turbofish `f::<T>(...)`, single-instance generic call binding, bounds/`where` parsed with semantic hard-errors); relaxed lifetime syntax support added (tokenized lifetimes + parser acceptance/erasure for item/type lifetimes + inert `#[inline]`/`#![...]` attribute tolerance); first-order closure milestone added (`||`/`|x|`/typed closure params + optional `-> T`, unified callable type as `TypeKind.Fn` for fn items + closures, non-capturing closure `fn` compatibility, capturing closures direct-call only/non-escaping, mutable capture support, `CallDyn` path for callable values, minimal `assert_eq!` lowering support); strict stdlib-first Vec milestone added (compiler-managed stdlib injection + builtin declaration metadata + impl-generic method instantiation + `vec![...]` list desugaring + by-value `get`/`[]`/`pop` with Copy-gated diagnostics + deterministic repeat-form unsupported error) |  |  | Expand module/use coverage (`self`/`super`/`crate`, grouped/wildcard imports, deeper type-path support); move generic function model from single-instance to per-call instantiation and implement real bounds/`where` checking |
| Type/Semantic Analysis | Core local inference implemented; borrow-lite semantic pass added (`checkBorrowLite`) with hard errors for obvious dangling-reference escapes (returning refs to locals/temporaries, longer-lived assignment escapes) |  |  | Strengthen semantic checks and diagnostics |
| IR and Binary Contract | Core SSA + binary pipeline implemented; binary IR v2 added with module string-literal pool and `sconst` instruction |  |  | Expand contract coverage for richer literals/constant data |
| Backend Integration | C backend workspace and interpreter core implemented; backend-side `print!`/`println!` `{}` formatting path integrated | Frontend run path migrated to clang-built wasm backend bindings |  | Expand parity and integration coverage |
| Toolchain/Runtimes |  |  | Missing final execution/link model | Define runtime model and linking flow |
| Optimization and Debuggability |  |  | Missing optimization passes | Define initial optimization roadmap |

## Tracking Guidance

- Update the matrix at each milestone boundary.
- Keep `Done` factual and test-backed.
- Keep `Next` decision-complete so implementation can begin without extra design rounds.
