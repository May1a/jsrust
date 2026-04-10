# 07 - Capturing Closures

## Objective

Implement closures that capture variables from their enclosing scope. Currently only non-capturing closures work (they are lowered as standalone functions). Capturing closures are pervasive in idiomatic Rust — used with iterators, callbacks, and higher-order functions.

## Prerequisites

- Plan 01 (Type Inference Correctness) — closure type inference
- Plan 02 (Lowering Correctness) — tuple lowering needed for capture tuples, field assignment for environment mutation
- Plan 06 (Range Expressions & `for` Loops) — closures are most useful with iterators

## Quality Policy

- Every feature must have comprehensive tests
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change

## Current State

**Non-capturing closures** already work:
- `src/passes/ast_to_ssa.ts` `lowerClosure` method
- `lowerNonCapturingClosure` extracts a standalone `__closure_N` function
- Checked with `collectFreeVars` — if any free variable exists in `this.locals`, the closure is rejected

**Capturing closures** are explicitly rejected:
```ts
// src/passes/ast_to_ssa.ts ~line 2935
if (!hasCaptures) {
    return this.lowerNonCapturingClosure(expr);
}
return loweringError(
    LoweringErrorKind.UnsupportedNode,
    "capturing closures are not implemented",
    expr.span,
);
```

## Design

### Closure Representation

A capturing closure consists of:
1. **A function pointer** — the closure body, compiled as a standalone function
2. **An environment** — a struct containing all captured variables

In IR, this is represented as a struct with two fields:
```
__closure_env_N {
    fn_ptr: fn(args...) -> ret,  // or ptr for dynamic dispatch
    captures: CaptureStruct       // struct containing captured variables
}
```

Or more practically, as two separate values passed together. The simplest approach:

**Approach: Fat closure = (fn_ptr, env_ptr)**

- The closure body function takes an extra first parameter: `env: ptr` (pointer to capture struct)
- The closure value is a struct: `{ fn_ptr, env_ptr }`
- Calling the closure calls `fn_ptr(env_ptr, ...args)`

### Capture Analysis

**File:** `src/passes/ast_to_ssa.ts` — extend `collectFreeVars`

For each closure:
1. Walk the closure body to find all referenced variables
2. For each referenced variable, determine if it is:
   - **Defined in the closure** (parameter or local) → not a capture
   - **Defined in enclosing scope** → capture
3. Classify each capture by how the variable is used:
   - **By value** (moved) → variable is consumed in the closure
   - **By reference** (`&T`) → variable is borrowed read-only
   - **By mutable reference** (`&mut T`) → variable is borrowed mutably

For this plan, start with **by-value captures only** (simplest). Reference captures require borrow checker integration.

### Capture Environment Layout

For a closure that captures variables `x: i32`, `y: bool`:

```
__capture_struct_N {
    _0: i32,  // x
    _1: bool, // y
}
```

The closure body function signature becomes:
```
fn __closure_body_N(env: ptr, /* original params */) -> ret
```

Inside the closure body, captures are loaded from `env` via `GEP` + `Load`.

### Closure Creation Lowering

1. Analyze captures (free variables)
2. Allocate capture struct on stack (`alloca`)
3. Store captured values into the struct fields
4. Create the closure function (lower body with env parameter)
5. Return a struct value: `{ fn_ptr, env_ptr }`

### Closure Call Lowering

When calling a closure value `f(args)`:
1. Extract `fn_ptr` from the closure struct (`StructGet` field 0)
2. Extract `env_ptr` from the closure struct (`StructGet` field 1)
3. Call `fn_ptr(env_ptr, ...args)` using `CallDyn` (indirect call)

### Closure as Function Arguments

Closures passed as function arguments (`fn apply(f: |i32| -> i32, x: i32) -> i32`) need:
- Function parameters of closure type accept the `{ fn_ptr, env_ptr }` struct
- Calling a closure parameter follows the same call-lowering pattern

### Closure Return Type

Closures returned from functions are **out of scope** for this plan. Returning closures requires heap allocation of the environment and is significantly more complex. This plan focuses on closures that:
- Are created and called within the same function
- Are passed as arguments to other functions
- Are stored in local variables

## Work Packages

### WP-07.A: Capture Analysis

- Extend `collectFreeVars` to return structured capture information (variable name, type, capture mode)
- Distinguish between: defined-in-closure, captured-by-value, captured-by-reference
- For this plan, implement by-value capture only
- Add tests: closure capturing one variable, multiple variables, nested captures

### WP-07.B: Capture Environment Struct

- Design capture struct layout (anonymous struct with fields matching captures)
- Register capture struct types in the IR module
- Generate deterministic names: `__capture_struct_N` where N is a counter
- Add tests: capture struct type is correct for various capture sets

### WP-07.C: Closure Body Lowering with Environment

- Lower closure body as a function with an extra `env: ptr` first parameter
- Inside the body, replace captured variable references with `GEP + Load` from env
- Replace captured variable assignments with `GEP + Store` to env (for mutable captures)
- Add tests: closure body uses captured variable correctly

### WP-07.D: Closure Creation Lowering

- Allocate capture struct
- Store captured values into struct
- Create closure body function
- Return `{ fn_ptr, env_ptr }` struct value
- Add tests: closure assigned to variable, closure used immediately

### WP-07.E: Closure Call Lowering

- Detect when a call target is a closure value (not a direct function name)
- Extract fn_ptr and env_ptr from closure struct
- Emit `CallDyn` with env as first argument
- Add tests: calling closure variable, calling closure argument, chaining closures

### WP-07.F: Non-Capturing Closure Compatibility

- Ensure non-capturing closures still work (no env parameter, no capture struct)
- Non-capturing closures can use the simpler representation (just fn_ptr, null env)
- Add regression tests for existing non-capturing closure examples

### WP-07.G: Integration

- Add example file demonstrating closures with captures
- Add example with closures passed as function arguments
- Add example with closures in loops
- Run full example suite

## Acceptance Criteria

All required:

- [ ] Closures can capture variables from enclosing scope by value
- [ ] Captured variables are accessible inside the closure body
- [ ] Closure values can be stored in variables and called later
- [ ] Closures can be passed as function arguments
- [ ] Capture struct layout is correct (field types and offsets)
- [ ] Non-capturing closures still work without capture overhead
- [ ] Multiple closures in the same function don't interfere
- [ ] All existing tests pass
- [ ] No lint errors

## Deferred (Future Plans)

- **By-reference captures** (`&x` in closure) — requires borrow checker integration
- **By-mutable-reference captures** (`&mut x` in closure) — requires borrow checker
- **Closures returned from functions** — requires heap allocation
- **Move closures** (`move || { ... }`) — explicit keyword for capture mode
- **Closures in structs** — storing closures in struct fields

## Files Affected

- `src/passes/ast_to_ssa.ts` — capture analysis, closure creation, closure call, closure body lowering
- `src/passes/inference.ts` — closure type inference with captures
- `src/ir/ir.ts` — possibly add closure type representation
- `src/ir/ir_builder.ts` — struct create/get for closure values
- `src/parse/ast.ts` — verify ClosureExpr carries enough information
- `src/utils/type_context.ts` — closure environment tracking
- `tests/compile.test.ts` — new tests
- `examples/` — new example file

## Risks

- **SSA block structure** — closure body is a separate function with its own blocks. Ensure block naming doesn't collide.
- **Capture struct lifetime** — the capture struct is stack-allocated. If the closure outlives the allocating function, this is undefined behavior. The borrow-lite checker should catch some cases but not all.
- **Indirect calls** — `CallDyn` must work correctly in both the interpreter and codegen backends. Verify with both backends.
- **Name generation** — closure body functions and capture structs must have unique, deterministic names to avoid collisions, especially with multiple closures in the same function.
