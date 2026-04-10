# 04 - Monomorphization Hardening

## Objective

Harden the monomorphization pass to correctly handle all generic patterns, add proper error checking, and eliminate silent fallbacks that produce incorrect specializations.

## Prerequisites

- Plan 01 (Type Inference Correctness) — generic type inference depends on correct literal and expression types
- Plan 02 (Lowering Correctness) — generic struct lowering depends on correct lowering infrastructure

## Quality Policy

- Every fix must have a corresponding test
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change

## Known Issues

### 04.1 Type Argument Arity Not Checked

**File:** `src/passes/monomorphize.ts` (~line 488)

```ts
for (let i = 0; i < generic.genericParams.length && i < explicitTypeArgs.length; i++) {
    subs.set(generic.genericParams[i].name, explicitTypeArgs[i]);
}
return subs;
```

When explicit type args are provided (turbofish syntax), too few args silently leave params unbound, and too many args are silently ignored.

**Example:** `fn foo<T, U>(x: T, y: U)` called as `foo::<i32>(1, 2)` — `U` is never bound, no error.

**Fix:**
- If `explicitTypeArgs.length < generic.genericParams.length` → error: "expected N type arguments, got M"
- If `explicitTypeArgs.length > generic.genericParams.length` → error: "expected N type arguments, got M"

### 04.2 Unbound Generic Params Silently Skip

**File:** `src/passes/monomorphize.ts` (~line 508)

```ts
if (!subs.has(gp.name)) {
    return undefined;
}
```

When a generic param cannot be inferred from arguments, `collectAndMonomorphize` returns `undefined` and silently skips the function. No error is produced.

**Fix:** If any generic param remains unbound after attempting inference, produce a clear type error: "cannot infer type for generic parameter `{name}` — consider providing explicit type arguments".

### 04.3 Type Mangling Falls Back to "unknown"

**File:** `src/passes/monomorphize.ts` (~line 84)

```ts
return "unknown";
```

`typeToMangledString` returns `"unknown"` for unhandled `TypeNode` subclasses. This produces mangled names like `fn__unknown` which are confusing and may collide.

**Fix:** Handle all `TypeNode` subclasses:
- `FnTypeNode` → `fn_PARAM_TYPES__RETURN_TYPE`
- `PtrTypeNode` → `ptr_MUT_INNER`
- `OptionTypeNode` → `option_INNER`
- `ResultTypeNode` → `result_OK_ERR`
- `InferredTypeNode` → error (should be resolved by inference before monomorphization)
- Any unhandled type → explicit error rather than silent fallback

### 04.4 SubstituteType Returns Unchanged for Unknown Subclasses

**File:** `src/passes/monomorphize.ts` (~line 151)

```ts
return ty;
```

`substituteType` returns the type unchanged for unknown `TypeNode` subclasses. This means generic params embedded in unhandled type nodes are never substituted.

**Fix:** Handle all `TypeNode` subclasses recursively. Add cases for `FnTypeNode`, `PtrTypeNode`, `OptionTypeNode`, `ResultTypeNode`. Add an exhaustiveness check (default case that errors on unrecognized subclasses).

### 04.5 UnifyTypes Has Limited Coverage

**File:** `src/passes/monomorphize.ts` (~line 517)

`unifyTypes` only handles `NamedTypeNode`, `RefTypeNode`, `TupleTypeNode`, `ArrayTypeNode`.

Missing:
- `FnTypeNode` (function pointer types as generic args)
- `PtrTypeNode` (raw pointer types as generic args)
- `OptionTypeNode` / `ResultTypeNode` (standard library types as generic args)
- Nested generic constraints

**Fix:** Add cases for all missing `TypeNode` subclasses. Each case should recursively unify the inner types. For `OptionTypeNode<T>` vs `OptionTypeNode<U>`, unify `T` vs `U`.

### 04.6 Generic Structs Not Monomorphized in Expressions

`GenericStructItem` exists in the AST but the monomorphization pass only processes `GenericFnItem`. Struct instantiation expressions like `GenericStruct::<i32> { field: 1 }` are not monomorphized.

**Fix:**
- Extend `collectGenericItems` to register `GenericStructItem`s
- Find struct instantiation sites and infer type args
- Generate specialized `StructItem`s with mangled names
- Update all references to use the specialized names

### 04.7 No Support for Generic Impl Blocks

`impl<T> SomeType<T> { ... }` is not supported. Only concrete inherent impls work.

**Fix:** This is a larger feature. For now, add a clear error when a generic impl block is encountered, rather than silently ignoring it. Full support can be added in a future plan.

## Work Packages

### WP-04.A: Arity and Binding Checks (04.1 + 04.2)

- Add type argument count validation
- Add error for unbound generic params
- Add tests: too few args, too many args, unbound param
- Verify error messages are clear and actionable

### WP-04.B: Complete Type Coverage (04.3 + 04.4 + 04.5)

- Extend `typeToMangledString` for all `TypeNode` subclasses
- Extend `substituteType` for all `TypeNode` subclasses
- Extend `unifyTypes` for all `TypeNode` subclasses
- Add exhaustiveness checks (default case errors)
- Add tests for each new type in generic position:
  - `fn foo<T>(x: *const T)` — pointer generic
  - `fn foo<T>(x: fn(T) -> T)` — fn pointer generic
  - `fn foo<T>(x: Option<T>)` — Option generic
  - `fn foo<T, E>(x: Result<T, E>)` — Result generic

### WP-04.C: Generic Struct Monomorphization (04.6)

- Register `GenericStructItem` in the monomorphization registry
- Find struct instantiation sites and infer type args from field values
- Generate specialized struct definitions with mangled names
- Update struct references in function bodies
- Add tests: generic struct instantiation, generic struct as function argument, generic struct with multiple type params

### WP-04.D: Generic Impl Error Handling (04.7)

- Detect generic impl blocks during monomorphization
- Emit clear error: "generic impl blocks are not supported"
- Add test for the error case

### WP-04.E: Integration Testing

- Run full example suite
- Add a stress test with complex generic patterns
- Verify monomorphized names are deterministic and unique

## Acceptance Criteria

All required:

- [ ] Wrong number of type arguments produces a clear error
- [ ] Unbound generic params produce a clear error (never silently skip)
- [ ] `typeToMangledString` handles all `TypeNode` subclasses (no "unknown")
- [ ] `substituteType` handles all `TypeNode` subclasses
- [ ] `unifyTypes` handles all `TypeNode` subclasses
- [ ] Generic structs can be instantiated with type arguments
- [ ] Generic impl blocks produce a clear error
- [ ] All existing tests pass
- [ ] No lint errors

## Files Affected

- `src/passes/monomorphize.ts` — all fixes
- `src/passes/ast_to_ssa.ts` — generic struct reference updates
- `src/parse/ast.ts` — may need GenericStructItem adjustments
- `tests/compile.test.ts` — new tests
- `examples/` — possibly add generic struct example

## Risks

- **Name collision in mangling** — different types must produce different mangled names. Ensure the mangling scheme is injective.
- **Generic struct lowering is complex** — struct layout depends on type args, so the IR struct type must be generated per specialization. Coordinate with the memory layout pass.
- **Recursive generics** — `struct Tree<T> { children: Vec<Tree<T>> }` requires careful handling to avoid infinite monomorphization. Add a recursion depth limit.
