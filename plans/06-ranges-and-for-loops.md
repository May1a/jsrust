# 06 - Range Expressions & `for` Loops

## Objective

Implement range expressions (`a..b`, `a..=b`) and `for` loop iteration over ranges. These are tightly coupled — ranges are the primary iterator type, and `for` loops are the primary consumer. Both are fundamental Rust control flow that is currently parsed but rejected.

## Prerequisites

- Plan 01 (Type Inference Correctness) — range and iterator type inference
- Plan 02 (Lowering Correctness) — assignment targets and correct deref needed for loop variable binding
- Plan 05 (Type Aliases & Casts) — range types may be aliased

## Quality Policy

- Every feature must have comprehensive tests
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change

---

## Part A: Range Type and Expressions

### Current State

- **Parsed in:** `src/parse/ast.ts` — `RangeExpr` exists with `start`, `end`, `inclusive` fields
- **Inference:** `src/passes/inference.ts` returns `undefined` type for ranges
- **Lowering:** `src/passes/ast_to_ssa.ts` (~line 704) — `"range expression lowering is not implemented"`

### Design

#### Range Representation in IR

A range is a struct-like value with two fields: `start` and `end`. The type varies based on the element type (`i32` range, `usize` range, etc.).

**IR approach:** Lower ranges as anonymous structs with two fields of the same type. Register a range struct type per element type (e.g., `__range_i32`, `__range_usize`).

```
Range<i32> → StructType { _0: i32, _1: i32 }  // start, end
Range<i32> inclusive → StructType { _0: i32, _1: i32 }  // same layout, inclusive flag is compile-time
```

The `inclusive` flag (`..=` vs `..`) is a compile-time property, not a runtime field. The iteration logic handles the difference.

#### Range Type in Inference

- `a..b` where `a: T`, `b: T` → `Range<T>` (exclusive end)
- `a..=b` where `a: T`, `b: T` → `RangeInclusive<T>` (inclusive end)
- `..b` → `RangeTo<T>` (unbounded start)
- `a..` → `RangeFrom<T>` (unbounded end)
- `..` → `RangeFull` (unbounded both)

For this plan, focus on the two most common forms: `a..b` and `a..=b`. Unbounded ranges can be deferred.

#### Range Expression Lowering

1. Lower `start` and `end` expressions to IR values
2. Create a struct value with both fields
3. Return the struct value

---

## Part B: `for` Loops

### Current State

- **Parsed in:** `src/parse/ast.ts` — `ForExpr` exists with `pattern`, `iterator`, `body`, `label` fields
- **Lowering:** `src/passes/ast_to_ssa.ts` (~line 696) — `"for-loop lowering is not implemented"`

### Design

#### Desugaring Strategy

A `for` loop desugars to a `loop` with an explicit iterator state:

```rust
// for pat in iter { body }
// desugars to:

let mut __iter = iter;
loop {
    let __next = __iter.next();  // or equivalent check
    if __next.is_none() {        // for Option-based iteration
        break;
    }
    let pat = __next.unwrap();   // or equivalent extraction
    body;
}
```

Since we don't have a full iterator trait, the desugaring is specialized for ranges:

**For `a..b` (exclusive):**
```
let mut __i = a;
loop {
    if __i >= b { break; }
    let pat = __i;
    body;
    __i = __i + 1;
}
```

**For `a..=b` (inclusive):**
```
let mut __i = a;
loop {
    if __i > b { break; }
    let pat = __i;
    body;
    __i = __i + 1;
}
```

#### Lowering Implementation

**File:** `src/passes/ast_to_ssa.ts`

Add `lowerForExpr` method:

1. Lower the iterator expression
2. If the iterator is a `RangeExpr`:
   a. Lower `start` and `end` values
   b. Allocate a mutable counter variable initialized to `start`
   c. Create a loop block structure: `loop_header`, `loop_body`, `loop_exit`
   d. `loop_header`: compare counter to `end` (using `Icmp` with `Lt` for `..`, `Le` for `..=`)
   e. If comparison is false (done), branch to `loop_exit`
   f. `loop_body`: bind loop variable from counter, lower body statements
   g. Increment counter (`Iadd` with 1)
   h. Branch back to `loop_header`
3. If the iterator is NOT a range, produce an error: "only range iterators are supported"
4. Handle `break` and `continue` labels for the for loop

#### Loop Variable Binding

The `pattern` in `for pat in ...` must be bound:
- `for x in ...` → bind `x` to counter value
- `for _ in ...` → no binding, discard value
- `for (a, b) in ...` → destructuring (requires tuple support from Plan 02)

#### `break` and `continue` in `for` Loops

`break` and `continue` inside `for` loops must branch to the correct blocks:
- `break` → branch to `loop_exit`
- `continue` → branch to the increment step, then back to `loop_header`

If the `for` loop has a label (`'label: for x in ...`), `break 'label` and `continue 'label` must resolve to this loop's blocks.

---

## Work Packages

### WP-15.A: Range Type in Inference

- Define range type representation (as struct-like types)
- Add range expression type inference
- Handle exclusive (`..`) and inclusive (`..=`) ranges
- Require both bounds to have the same type (or infer from one bound)
- Add tests: `0..10` → `Range<i32>`, `0usize..=100usize` → `RangeInclusive<usize>`

### WP-15.B: Range Expression Lowering

- Implement `lowerRangeExpr`
- Create struct value with start/end fields
- Register range struct types in IR module
- Add tests: range creation, range field access

### WP-15.C: For Loop Desugaring

- Implement `lowerForExpr`
- Desugar to loop + comparison + increment
- Handle exclusive and inclusive ranges
- Support `break` and `continue` within for loops
- Support labeled for loops
- Add tests: simple for loop, for with break, for with continue, for with nested loops, for with labeled break

### WP-15.D: Loop Variable Pattern Binding

- Bind simple identifier patterns from loop counter
- Bind wildcard patterns (no binding)
- Bind tuple patterns (if tuple support from Plan 02 is complete)
- Add tests for each pattern type

### WP-15.E: Remove Unsupported Feature Flags

- Remove `"range expression lowering is not implemented"` error
- Remove `"for-loop lowering is not implemented"` error
- Remove unsupported feature checks in `compile.ts` if any
- Add range/for tests to compile test suite

### WP-15.F: Integration

- Add example file: `for` loops with ranges, nested loops, break/continue
- Run full example suite
- Update expected IR outputs

## Acceptance Criteria

All required:

- [ ] `0..10` compiles and produces a range value
- [ ] `0..=10` compiles and produces an inclusive range value
- [ ] `for i in 0..10 { body }` compiles and executes correctly
- [ ] `for i in 0..=10 { body }` compiles and executes correctly
- [ ] `break` and `continue` work inside `for` loops
- [ ] Labeled `for` loops work with `break 'label` and `continue 'label`
- [ ] Loop variable binding works for identifier and wildcard patterns
- [ ] Non-range iterators produce a clear error
- [ ] All existing tests pass
- [ ] No lint errors

## Files Affected

- `src/passes/inference.ts` — range type inference, for-loop type checking
- `src/passes/ast_to_ssa.ts` — range lowering, for-loop desugaring
- `src/compile.ts` — remove unsupported feature entries
- `src/ir/ir_builder.ts` — comparison instructions for loop condition
- `src/parse/ast.ts` — verify ForExpr and RangeExpr nodes are complete
- `tests/compile.test.ts` — new tests
- `examples/` — new example file

## Risks

- **Loop block structure** — the desugared loop creates multiple blocks (header, body, increment, exit). Ensure SSA block structure is correct and dominance rules are maintained.
- **Mutable counter** — the counter variable must be mutable (allocated on stack with `alloca`). Ensure this works with the existing stable reference lowering.
- **Type inference for range bounds** — `0..n` where `n` is inferred must propagate the type to both bounds. This may require bidirectional inference.
- **Backend compatibility** — the desugared loop pattern must produce valid IR that the interpreter and codegen can handle. Test with both backends.
