# 09 - `static` Items

## Objective

Implement `static` items — module-level mutable or immutable global variables with explicit types and initializers. These are parsed but rejected, and are needed for any program that requires global state.

## Prerequisites

- Plan 01 (Type Inference Correctness) — static item type inference
- Plan 02 (Lowering Correctness) — correct deref and load/store for static access
- Plan 05 (Type Aliases & Casts) — static types may use aliases

## Quality Policy

- Every feature must have comprehensive tests
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change

## Current State

- **Parsed in:** `src/parse/ast.ts` — `StaticItem` AST node exists with `name`, `type`, `value`, `mutable` fields
- **Rejected in:** `src/compile.ts` (~line 309) — `"static-item"` unsupported feature diagnostic
- **Rejected in:** `src/passes/ast_to_ssa.ts` (~line 804) — `"`static` items are not implemented"`

### Difference from `const`

| Aspect | `const` | `static` |
|---|---|---|
| Evaluation | Compile-time, inlined | Runtime, initialized once |
| Memory | No address | Has a fixed address |
| Mutability | Always immutable | Can be `mut` (with `unsafe`) |
| Reference | Cannot take `&` of const | Can take `&` of static |
| Generic | Cannot be generic | Cannot be generic |

## Design

### IR Representation

**File:** `src/ir/ir.ts`

The IR already has `IRGlobal`:

```ts
class IRGlobal {
    name: string;
    type: IRType;
    init?: IRValue;
    mutable: boolean;
}
```

Add `IRModule.globals: IRGlobal[]` population for static items.

### Inference

**File:** `src/passes/inference.ts`

1. Register `static` items in `TypeContext` during module traversal
2. Infer the type of the initializer expression
3. Validate initializer type matches declared type (or infer from initializer if no type annotation)
4. Store in a new `statics: Map<string, { type: TypeNode, mutable: boolean }>` field in `TypeContext`
5. When a variable name is resolved, check statics in addition to locals and consts

**Key difference from const:** Statics are not evaluated at compile time. Their initializer is lowered as IR that runs at program startup.

### Lowering

**File:** `src/passes/ast_to_ssa.ts`

#### Static Declaration

Add `lowerStaticItem` method:

1. Lower the initializer expression
2. Create an `IRGlobal` with the initializer value
3. Add to `IRModule.globals`
4. The global has a fixed address that can be referenced

#### Static Access

When a variable reference resolves to a static item:
1. Look up the global by name
2. Emit `Load` from the global's address (or `GEP` + `Load` if the global is a struct)
3. For `&STATIC`, the address is the global itself (no `Load` needed, just reference the global)

#### Static Mutation

For `mut static` items (requires `unsafe` in real Rust, but we don't enforce that since `unsafe` isn't implemented):
1. Assignment to a static: `STATIC = new_value` → `Store` to the global's address
2. Field assignment: `STATIC.field = value` → `GEP` + `Store`

#### Initialization Order

Statics are initialized before `main` runs. In the IR, this is represented by:
- Each global has an initializer value
- The backend executes initializers in declaration order before entering `main`

For this plan, restrict initializers to:
- Literal values (integers, floats, bools, strings)
- Const expressions (references to other `const` items)
- Struct/array constructors with literal/const fields

**Not supported** (future):
- Statics initialized by function calls
- Statics referencing other statics
- Static constructors

### Work Packages

#### WP-18.A: Static Item Infrastructure

- Add `statics` map to `TypeContext`
- Register static items during inference module traversal
- Resolve static variable references in inference
- Remove `"static-item"` from unsupported features in `compile.ts`
- Add tests: static declaration, static type checking

#### WP-18.B: Static Lowering — Declaration

- Implement `lowerStaticItem`
- Create `IRGlobal` entries with initializer values
- Handle simple initializers (literals, const refs)
- Add tests: static integer, static bool, static string, static struct

#### WP-18.C: Static Lowering — Access

- When resolving a variable name, check if it's a static
- Emit `Load` from the global address for reads
- Emit `&STATIC` as the global address itself (no load)
- Add tests: reading static value, taking reference to static, passing static to function

#### WP-18.D: Static Lowering — Mutation

- Implement assignment to `mut static` items
- Emit `Store` to the global address
- Add tests: mutating static value, reading after mutation

#### WP-18.E: Initialization Constraints

- Validate initializers are compile-time evaluable (literals, const refs)
- Reject function calls in static initializers with clear error
- Reject references to other statics with clear error (circular initialization risk)
- Add tests: valid initializers, invalid initializers with error messages

#### WP-18.F: Integration

- Add example file with static items
- Verify backend handles global initialization correctly
- Run full example suite

## Acceptance Criteria

All required:

- [ ] `static X: i32 = 42;` compiles
- [ ] `static X: i32 = 42;` can be read in expressions
- [ ] `static mut X: i32 = 0;` can be mutated
- [ ] `&STATIC` produces a reference to the static's address
- [ ] Struct-typed statics work
- [ ] String-typed statics work
- [ ] Invalid initializers (function calls, other statics) produce clear errors
- [ ] All existing tests pass
- [ ] No lint errors

## Deferred (Future Plans)

- **Static constructors** — statics initialized by function calls
- **Thread-local statics** — `thread_local!` macro
- **Lazy statics** — `lazy_static!` / `std::sync::OnceLock`
- **Non-literal initializers** — expressions requiring runtime evaluation

## Files Affected

- `src/compile.ts` — remove unsupported feature entry
- `src/passes/inference.ts` — static type inference, static resolution
- `src/passes/ast_to_ssa.ts` — static declaration lowering, static access lowering
- `src/utils/type_context.ts` — static storage and lookup
- `src/ir/ir.ts` — IRGlobal usage
- `tests/compile.test.ts` — new tests
- `examples/` — new example file

## Risks

- **Backend global initialization** — the IR interpreter and codegen must initialize globals before `main`. Verify both backends handle this correctly.
- **Name collisions** — static names must not collide with function names, const names, or struct names. Use the existing `TypeContext` namespace or add a separate namespace.
- **Const vs static distinction** — ensure the inference and lowering passes treat `const` and `static` differently (const is compile-time, static has an address).
