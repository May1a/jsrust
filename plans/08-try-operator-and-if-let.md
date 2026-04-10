# 08 - `?` Operator & `if let` Patterns

## Objective

Implement two control-flow features that work with `Option` and `Result`:

1. **The `?` operator** — early return on `Err`/`None`, unwrap on `Ok`/`Some`
2. **`if let` patterns** — conditional destructuring of enums

Both are parsed but rejected. Both are extremely common in idiomatic Rust.

## Prerequisites

- Plan 01 (Type Inference Correctness) — `?` operator type depends on correct `Result`/`Option` inference
- Plan 02 (Lowering Correctness) — correct deref, assignment targets, match lowering
- Plan 05 (Type Aliases & Casts) — error types may be aliased

## Quality Policy

- Every feature must have comprehensive tests
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change

---

## Part A: The `?` Operator

### Current State

- **Parsed in:** `src/parse/ast.ts` — `TryExpr` AST node exists
- **Rejected in:** `src/compile.ts` (~line 267) — `"try-expression"` unsupported feature diagnostic
- **Rejected in:** `src/passes/ast_to_ssa.ts` (~line 751) — `"`?` expressions are not implemented"`

### Design

#### Desugaring

The `?` operator desugars differently depending on context:

**On `Result<T, E>` in a function returning `Result<U, E>`:**
```rust
expr? // desugars to:
match expr {
    Ok(v) => v,
    Err(e) => return Err(e),
}
```

**On `Option<T>` in a function returning `Option<T>`:**
```rust
expr? // desugars to:
match expr {
    Some(v) => v,
    None => return None,
}
```

**On `Result<T, E>` in a function returning `Result<U, F>` where `E: Into<F>`:**
This requires trait support (`From`/`Into`), which is out of scope. The `?` operator will only work when error types match exactly.

#### Type Inference

**File:** `src/passes/inference.ts`

The `?` expression `expr?` has type:
- If `expr: Result<T, E>` → type is `T`
- If `expr: Option<T>` → type is `T`

The enclosing function's return type must be:
- `Result<_, E>` (same `E`) or `Option<_>` — matching the error/none type

**Validation:**
- If `expr` is `Result<T, E1>` and enclosing function returns `Result<_, E2>` where `E1 != E2` → type error
- If `expr` is `Option<_>` and enclosing function returns `Result<_, _>` → type error
- If `expr` is `Result<_, _>` and enclosing function returns `Option<_>` → type error
- If `expr` is neither `Result` nor `Option` → type error: "the `?` operator can only be applied to values of type `Result` or `Option`"

#### Lowering

**File:** `src/passes/ast_to_ssa.ts`

Add `lowerTryExpr` method:

1. Lower the operand expression → `ValueId` (the Result/Option value)
2. Get the enum tag: `EnumGetTag`
3. Create three blocks: `ok_block`, `err_block`, `merge_block`
4. Emit `Switch` on the tag:
   - Tag `0` (Ok/Some) → branch to `ok_block`
   - Tag `1` (Err/None) → branch to `err_block`
5. `ok_block`: extract payload with `EnumGetData` → branch to `merge_block` with payload
6. `err_block`: emit `Ret` (early return with the error value wrapped in enum)
7. `merge_block`: result is the unwrapped payload value

For `Result<T, E>`:
```
ok_block: {
    payload = enum_get_data(value, 0)  // Ok payload
    br merge_block(payload)
}
err_block: {
    err_value = enum_get_data(value, 1)  // Err payload
    err_result = enum_create(1, err_value)  // Err wrapper for return type
    ret err_result
}
```

For `Option<T>`:
```
some_block: {
    payload = enum_get_data(value, 0)  // Some payload
    br merge_block(payload)
}
none_block: {
    none_result = enum_create(0)  // None
    ret none_result
}
```

### Work Packages — Part A

#### WP-08.A1: `?` Operator Type Inference

- Add `TryExpr` case to `inferExpression`
- Determine inner type from `Result<T, E>` or `Option<T>`
- Validate compatibility with enclosing function return type
- Add tests: `?` on Result, `?` on Option, type mismatch errors

#### WP-08.A2: `?` Operator Lowering

- Implement `lowerTryExpr` with switch-based desugaring
- Handle both `Result` and `Option` variants
- Ensure early return uses correct enum construction
- Add tests with IR output verification
- Remove `"try-expression"` from unsupported features

#### WP-08.A3: `?` Operator Integration

- Add tests: chaining `?` operators, `?` in nested expressions, `?` in `if` branches
- Add example file with `?` operator usage
- Run full example suite

---

## Part B: `if let` Patterns

### Current State

- **Parsed in:** `src/parse/ast.ts` — `IfLetExpr` AST node exists with `pattern`, `value`, `then_block`, `else_block`
- **Rejected in:** `src/compile.ts` (~line 281) — `"if-let-expression"` unsupported feature diagnostic
- **Rejected in:** `src/passes/ast_to_ssa.ts` (~line 763) — `"`if let` is not implemented"`

### Design

#### Desugaring

`if let Pat = expr { then } else { else_ }` desugars to a match:

```rust
match expr {
    Pat => { then }
    _ => { else_ }  // or unit if no else branch
}
```

This leverages the existing match infrastructure, which already supports pattern matching with enum variants, literals, wildcards, and struct patterns.

#### Type Inference

**File:** `src/passes/inference.ts`

`if let` has the same type as `if/else`:
- Both branches present → both must have same type, result is that type
- Only `then` branch → result is `unit`

The pattern binding introduces new variables in the `then` scope:
- `if let Some(x) = opt { x }` → `x` is bound in the then-block with type `T` (from `Option<T>`)

#### Lowering

**File:** `src/passes/ast_to_ssa.ts`

Add `lowerIfLetExpr` method:

1. Lower the value expression
2. Generate a match-like structure:
   - Create `match_block`, `then_block`, `else_block`, `merge_block`
   - Emit pattern test (depends on pattern type):
     - Enum variant pattern → `EnumGetTag` + comparison
     - Literal pattern → direct comparison
     - Wildcard → always matches
   - If pattern matches → branch to `then_block` with bindings
   - If pattern doesn't match → branch to `else_block`
3. `then_block`: bind pattern variables, lower then-body, branch to `merge_block`
4. `else_block`: lower else-body (or unit), branch to `merge_block`
5. `merge_block`: result from whichever branch was taken

#### Supported Patterns

For this plan, support the same patterns that `match` already supports:
- `Some(x)` / `None` — enum variant patterns
- `Ok(v)` / `Err(e)` — enum variant patterns
- `_` — wildcard
- `x` — identifier binding
- `Foo { field }` — struct pattern
- `Lit` — literal pattern

### Work Packages — Part B

#### WP-08.B1: `if let` Type Inference

- Add `IfLetExpr` case to `inferExpression`
- Determine pattern variable types from the scrutinee type
- Introduce pattern bindings into the then-scope
- Validate branch type consistency
- Add tests: `if let Some(x) = opt`, `if let Ok(v) = result`, `if let MyEnum::A(x) = val`

#### WP-08.B2: `if let` Lowering

- Implement `lowerIfLetExpr` reusing match lowering infrastructure
- Extract pattern-testing logic into a shared helper (used by both `match` and `if let`)
- Handle pattern variable binding in the then-block
- Handle optional else-block (default to unit)
- Remove `"if-let-expression"` from unsupported features
- Add tests with IR output verification

#### WP-08.B3: `if let` Integration

- Add tests: `if let` with else, `if let` chains (`else if let`), `if let` in loops
- Add example file
- Run full example suite

## Acceptance Criteria

All required:

### `?` Operator
- [ ] `result_value?` compiles for `Result<T, E>` with matching function return type
- [ ] `option_value?` compiles for `Option<T>` with matching function return type
- [ ] Early return on `Err`/`None` works correctly
- [ ] Unwrapped `Ok`/`Some` value is usable
- [ ] Type mismatches produce clear errors
- [ ] `?` on non-Result/Option produces clear error

### `if let`
- [ ] `if let Some(x) = opt { ... }` compiles and works
- [ ] `if let Ok(v) = result { ... } else { ... }` compiles and works
- [ ] Pattern variable bindings are accessible in the then-block
- [ ] `else if let` chains work
- [ ] Type inference for pattern variables is correct

### General
- [ ] All existing tests pass
- [ ] No lint errors

## Files Affected

- `src/compile.ts` — remove unsupported feature entries
- `src/passes/inference.ts` — try and if-let type inference
- `src/passes/ast_to_ssa.ts` — try and if-let lowering
- `src/utils/type_context.ts` — pattern binding scopes
- `tests/compile.test.ts` — new tests
- `examples/` — new example files

## Risks

- **Early return lowering** — the `?` operator emits a `Ret` in the middle of a function. Ensure the SSA block structure is correct (all blocks after the early return are still reachable via other paths if needed).
- **Pattern test sharing** — extracting pattern-matching logic from `match` lowering to share with `if let` requires refactoring. Ensure match tests still pass after refactoring.
- **`?` in `main`** — `?` in `fn main()` returning `()` is not valid Rust. Detect this and produce a clear error.
- **Nested `?`** — multiple `?` operators in the same expression (e.g., `foo()?.bar()?)` create multiple early-return paths. Ensure block naming is unique.
