# 01 - Type Inference Correctness

## Objective

Fix all known type inference bugs so that the inference pass produces correct, reliable types for every supported expression. This is the foundational plan — every subsequent plan depends on accurate type information.

## Prerequisites

None. This is the first plan in the sequence.

## Quality Policy

- Every fix must have a corresponding test in `tests/compile.test.ts`
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change
- If you discover a bug in a file you touch, fix it

## Known Issues

### 10.1 Integer Literal Inference Ignores Suffixes

**File:** `src/passes/inference.ts` (~line 1188)

```ts
case LiteralKind.Int: {
    return Result.ok(new NamedTypeNode(expr.span, "i32"));
}
```

All integer literals are hardcoded to `i32`. Type suffixes like `42u8`, `0xFFi64`, `100usize` are parsed by the tokenizer but discarded during inference.

**Fix:** Check `expr.literalSuffix` (or equivalent) on the `LiteralExpr` node. If present, use the suffix type. If absent, default to `i32` (current behavior).

**Required changes:**

- `src/parse/ast.ts` — verify `LiteralExpr` carries the suffix information from parsing
- `src/parse/parser.ts` — ensure suffix is attached to `LiteralExpr` during literal parsing
- `src/parse/tokenizer.ts` — verify integer token includes suffix text
- `src/passes/inference.ts` — read suffix and map to correct `NamedTypeNode`

**Suffix → type mapping:**
`i8`, `i16`, `i32`, `i64`, `i128`, `isize`, `u8`, `u16`, `u32`, `u64`, `u128`, `usize`

### 10.2 Float Literal Inference Ignores Suffixes

**File:** `src/passes/inference.ts` (~line 1191)

```ts
case LiteralKind.Float: {
    return Result.ok(new NamedTypeNode(expr.span, "f64"));
}
```

Same issue as integers. `3.14f32` should infer as `f32`.

**Fix:** Same approach as 10.1.

**Suffix → type mapping:** `f32`, `f64`

### 10.3 Inferred Placeholder (`_`) Accepts All Types

**File:** `src/passes/inference.ts` (~line 472)

```ts
function typesEqual(a: TypeNode, b: TypeNode): boolean {
    if (isInferredPlaceholder(a) || isInferredPlaceholder(b)) {
        return true;
    }
    // ...
}
```

When either side is `_`, `typesEqual` returns `true` unconditionally. This means `_` in a let-binding or function param silently matches any type, masking real type errors.

**Fix:** `_` should only be accepted in contexts where it is explicitly valid (let-binding right-hand-side inference, closure params). In type-comparison contexts like function argument checking, `_` should defer rather than accept. At minimum, if both sides are `_`, that should be an error (ambiguous type). The key insight is that `_` means "infer this" — it should participate in unification by binding the unknown, not by returning `true`.

**Approach:**
- Distinguish between "unification" (binding an unknown) and "equality check" (verifying two known types match)
- `typesEqual` should only be used for equality checks where both types are concrete
- Introduce a `unifyTypes` (or reuse the one in monomorphize.ts) for inference-time binding
- `_` in unification binds to the concrete side; `_` vs `_` is ambiguous and should collect an error

### 10.4 Qualified Path Expressions Return `undefined` Type

**File:** `src/passes/inference.ts` (~line 1289)

```ts
if (expr.name.includes("::")) {
    return Result.ok(undefined);
}
```

Qualified paths like `Vec::new`, `Option::None`, `Self::method` return `undefined` type with no error. This silently propagates bad type information.

**Fix:** Resolve qualified paths through the `TypeContext`. At minimum:
- `Enum::Variant` → resolve to the enum type (already partially handled for `Option::None`, `Result::Ok`, etc.)
- `Self::method` → resolve through current impl context
- `Type::method` → resolve through known impl blocks

For cases that cannot be resolved, return a `TypeError` rather than `undefined`.

### 10.5 Qualified Function Calls Return `undefined` Type

**File:** `src/passes/inference.ts` (~line 1631)

```ts
if (!calleeName.includes("::")) {
    return Result.err(...);
}
return Result.ok(undefined);
```

Same issue as 10.4 but for call expressions with qualified callees.

**Fix:** Same approach — resolve through `TypeContext` or return a proper error.

### 10.6 Closure Return Type Not Inferred From Body

**File:** `src/passes/inference.ts` (~line 1028)

```ts
if (expr instanceof ClosureExpr) {
    return Result.ok(expr.returnType);
}
```

When a closure has no explicit return type annotation, this returns the raw (possibly `InferredTypeNode`) annotation without inferring from the body.

**Fix:** If `expr.returnType` is an `InferredTypeNode`, infer the return type by examining the closure body's trailing expression (or return expressions). This requires a small recursive inference of the closure body.

### 10.7 Range Expressions Have No Type

**File:** `src/passes/inference.ts` (~line 1128)

```ts
return Result.ok(undefined); // RangeExpr has no inferred type
```

Range expressions return `undefined` type. While full range support is deferred to Plan 06, the inference pass should at minimum not return `undefined` — it should either produce a concrete range type or collect a clear "unsupported" error.

**Fix:** Return a `TypeError` with message "range expressions are not supported" (consistent with other unsupported features). This way the error is explicit rather than silently producing bad IR.

### 10.8 Generic Method Bodies Skip Inference

**File:** `src/passes/inference.ts` (~line 2873)

```ts
// Skip deep body inference for generic methods
```

Generic methods in impl blocks skip body inference entirely, meaning type errors inside generic method bodies are never caught.

**Fix:** After monomorphization produces concrete specializations, run inference on each specialization. This requires coordination with the monomorphization pass. Alternatively, perform a best-effort inference with generic params treated as unknowns.

## Work Packages

### WP-10.A: Literal Suffix Inference (10.1 + 10.2)

- Verify suffix propagation from tokenizer → parser → AST node
- Implement suffix-aware integer literal inference
- Implement suffix-aware float literal inference
- Add tests for every integer suffix type and both float suffix types
- Add tests for mixed-suffix arithmetic (e.g., `let x: u8 = 10u8 + 20u8`)

### WP-10.B: Placeholder Type Semantics (10.3)

- Refactor `typesEqual` to not treat `_` as universal acceptor
- Introduce or expose a `unifyTypes` function for inference binding
- Audit all call sites of `typesEqual` to determine correct usage
- Add tests: `_` in valid inference contexts, `_` producing errors in invalid contexts

### WP-10.C: Qualified Path Resolution (10.4 + 10.5)

- Resolve `Enum::Variant` paths to enum types
- Resolve `Self::` paths through impl context
- Resolve `Type::method` through known impl blocks
- Replace `Result.ok(undefined)` with proper resolution or typed error
- Add tests for each qualified path category

### WP-10.D: Closure Return Type Inference (10.6)

- Infer return type from closure body when annotation is `_`
- Handle closures with and without return expressions
- Add tests for inferred closure returns in variable bindings and function arguments

### WP-10.E: Error Quality for Unsupported Features (10.7)

- Replace `Result.ok(undefined)` for `RangeExpr` with explicit unsupported error
- Audit entire inference pass for other `Result.ok(undefined)` returns that should be errors
- Add compile test for each case

### WP-10.F: Generic Method Body Inference (10.8)

- Design strategy for inferring generic method bodies (post-monomorphization or symbolic)
- Implement chosen approach
- Add tests with type errors inside generic methods that are currently missed

## Acceptance Criteria

All required:

- [ ] Integer literals with suffixes infer to the correct type
- [ ] Float literals with suffixes infer to the correct type
- [ ] `_` placeholder no longer silently accepts all types in comparison
- [ ] Qualified paths produce concrete types or explicit errors (never `undefined`)
- [ ] Closure return types are inferred from body when annotation is absent
- [ ] No `Result.ok(undefined)` returns remain in the inference pass except for legitimate `void`/unit cases
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] No lint errors

## Files Affected

- `src/parse/ast.ts` — verify/extend LiteralExpr suffix field
- `src/parse/parser.ts` — suffix propagation
- `src/parse/tokenizer.ts` — suffix in token
- `src/passes/inference.ts` — all fixes
- `src/utils/type_context.ts` — qualified path resolution support
- `tests/compile.test.ts` — new tests
