# 02 - Lowering Correctness

## Objective

Fix all known correctness bugs in the AST-to-SSA lowering pass (`ast_to_ssa.ts`). These are cases where valid, type-checked Rust programs produce incorrect IR — either silently wrong code or unnecessary rejection of valid programs.

## Prerequisites

- Plan 01 (Type Inference Correctness) should be completed first, since lowering depends on accurate type information.

## Quality Policy

- Every fix must have a corresponding test
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change
- If you discover a bug in a file you touch, fix it

## Known Issues

### 02.1 Deref Always Loads as I64

**File:** `src/passes/ast_to_ssa.ts` (~line 1506)

```ts
case UnaryOp.Deref: {
    const loadInst = this.builder.load(operand, makeIRIntType(IntWidth.I64));
```

`*x` always loads as `I64` regardless of the actual pointee type. This means:
- Dereferencing a `&bool` reads 8 bytes instead of 1
- Dereferencing a `&u8` reads 8 bytes instead of 1
- Dereferencing a `&f64` reads as integer, not float
- Dereferencing a `&Struct` reads as integer, not struct

**Fix:** Resolve the pointee type from the expression's inferred type (which should be correct after Plan 01). Use `translateTypeNode` to get the correct IR type, then use that for the load.

**Approach:**
1. Get the inferred type of the `DerefExpr` from the expression type cache in `TypeContext`
2. The expression type of `*x` where `x: &T` is `T`
3. Call `this.translateTypeNode(T)` to get the IR type
4. Use that IR type in `this.builder.load(operand, irType)`

### 02.2 Assignment Only Supports Identifier Targets

**File:** `src/passes/ast_to_ssa.ts` (~line 1002)

```ts
if (!(expr.target instanceof IdentifierExpr)) {
    return loweringError(..., "Only identifier assignment targets are supported");
}
```

This rejects all of the following valid Rust patterns:
- `self.field = value` (struct field assignment)
- `tuple.0 = value` (tuple field assignment)
- `array[index] = value` (index assignment)
- `*ptr = value` (dereference write)

**Fix:** Support assignment targets recursively:

- **`IdentifierExpr`** — current behavior (store to variable's alloca)
- **`FieldExpr`** (`x.field = val`) — lower `x` to get base pointer, compute field offset with `GEP`, then `store`
- **`IndexExpr`** (`arr[i] = val`) — lower `arr` to get base pointer, lower `i` to get index, compute offset with `ptradd` or `GEP`, then `store`
- **`DerefExpr`** (`*ptr = val`) — lower `ptr` to get address, then `store` to that address

Each case needs:
1. Lower the target expression to get the address (pointer value)
2. Lower the value expression
3. Determine the store type from the inferred type
4. Emit `store` instruction

### 02.3 Tuple Types Silently Become Unit

**File:** `src/passes/ast_to_ssa.ts` (~line 3314)

```ts
return makeIRUnitType(); // at end of translateTypeNode — TupleTypeNode fallback
```

When `translateTypeNode` encounters a `TupleTypeNode`, it falls through to the default case and returns `UnitType`. This means all tuple values are lowered as `void`, losing all data.

**Fix:** Tuples should be lowered as anonymous structs in the IR. Map each element type through `translateTypeNode` and create a `StructType` with synthetic field names (`_0`, `_1`, etc.).

**Approach:**
1. Add a `TupleTypeNode` case to `translateTypeNode`
2. Create an anonymous `StructType` with fields `_0`, `_1`, ... matching the tuple elements
3. Register the struct type in the module's struct map (with a generated name like `__tuple_N` where N is based on arity + element types)
4. Tuple construction: `StructCreate` with all element values
5. Tuple field access (`tuple.0`): `StructGet` with field index
6. Deduplicate identical tuple struct types to avoid duplication

### 02.4 Array Types with Non-Literal Lengths Silently Become Unit

**File:** `src/passes/ast_to_ssa.ts` (~line 3322)

```ts
return makeIRUnitType();
```

When `ArrayTypeNode` has a non-literal length expression, the entire array type is discarded.

**Fix:** The length of an array must be a const expression. After Plan 01's const evaluation is complete, this length should be resolvable at compile time. Two options:

**Option A (preferred):** Evaluate the length expression as a const and use the resulting integer.
**Option B:** Reject non-literal array lengths with a clear error message.

### 02.5 Struct Field Access Through References Not Handled Explicitly

When accessing `x.field` where `x` is `&Struct` or `&mut Struct`, the lowering should auto-deref. Verify this is handled correctly — if the deref fix (02.1) changes behavior here, ensure field access on references still works.

This is a verification task rather than a known bug — check after 02.1 is fixed.

### 02.6 Non-Exhaustive Match Arms May Produce Silent Miscompilation

**File:** `src/passes/ast_to_ssa.ts` (match lowering)

When a match is non-exhaustive, the compiler creates a `match_trap` block with `unreachable`. This is correct for well-typed programs but can silently miscompile if inference missed a case.

**Fix:** After Plan 01 ensures inference is correct, verify that the match lowering produces correct switch instructions for all tested enum variants. Add specific tests for:
- Match on enums with all variants covered
- Match with wildcard `_` arm
- Match on non-enum types (integers)

## Work Packages

### WP-02.A: Deref Type Correctness (02.1)

- Modify `lowerUnaryExpression` `Deref` case to resolve pointee type
- Use inferred expression type from `TypeContext` to determine IR load type
- Add tests: deref `&bool`, `&u8`, `&f64`, `&struct`, `&&i32` (nested ref)
- Verify existing reference examples still produce correct IR
- Run `bun test tests/examples.test.ts` to verify no regressions

### WP-02.B: Assignment Target Expansion (02.2)

- Add recursive target resolution for `FieldExpr`, `IndexExpr`, `DerefExpr`
- Each target type computes the destination address, then emits a typed store
- Add tests for each target type:
  - `point.x = 5` (struct field)
  - `self.value = new_val` (method self field)
  - `arr[0] = 42` (index)
  - `*ptr = 99` (deref write)
- Test combined cases: `self.data[0].x = 7` (nested)

### WP-02.C: Tuple Lowering (02.3)

- Add `TupleTypeNode` case to `translateTypeNode`
- Create anonymous struct representation for tuples
- Implement tuple construction lowering (tuple literal → `StructCreate`)
- Implement tuple field access lowering (`tuple.0` → `StructGet`)
- Deduplicate identical tuple types
- Add tests: tuple construction, tuple field access, nested tuples, tuples as function args/returns

### WP-02.D: Array Length Resolution (02.4)

- Add const-evaluation path for array length expressions, or
- Emit clear error for non-const array lengths
- Add tests: `[0u8; 10]` (literal), `[0u8; SOME_CONST]` (const)

### WP-02.E: Verification Pass (02.5 + 02.6)

- After all fixes, run full example test suite
- Verify struct field access through references works correctly
- Verify match lowering produces correct switches
- Check all 29 examples produce unchanged or improved IR

## Acceptance Criteria

All required:

- [ ] `*x` loads the correct type based on pointee (not hardcoded I64)
- [ ] `struct.field = value` compiles correctly
- [ ] `arr[index] = value` compiles correctly
- [ ] `*ptr = value` compiles correctly
- [ ] Tuple types lower as anonymous structs (not unit)
- [ ] Tuple field access (`t.0`) works
- [ ] Array types with const lengths resolve correctly
- [ ] All existing examples still pass
- [ ] All new tests pass
- [ ] No lint errors

## Files Affected

- `src/passes/ast_to_ssa.ts` — all fixes (deref, assignment targets, tuples, arrays)
- `src/ir/ir_builder.ts` — possibly extend for new store/gep patterns
- `src/ir/ir.ts` — possibly add helper for anonymous struct types
- `src/utils/type_context.ts` — expression type cache for deref fix
- `tests/compile.test.ts` — new tests
- `examples/` — possibly add new example files for tuples and field assignment

## Risks

- **Deref fix may cascade** — changing deref from I64 to correct type may expose downstream bugs in the interpreter or backend. Run full example suite after fix.
- **Tuple lowering adds complexity** — anonymous struct deduplication needs care to avoid name collisions. Use deterministic naming based on element types.
- **Assignment targets change store patterns** — field/index stores may need different GEP/ptradd sequences than the interpreter currently handles. Verify backend compatibility.
