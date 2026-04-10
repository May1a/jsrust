# 05 - Type Aliases & Cast Expressions

## Objective

Implement two closely related features that are already parsed but rejected:

1. **Type aliases** (`type Name = ConcreteType;`) — user-defined type synonyms
2. **Cast expressions** (`expr as Type`) — explicit type conversions

These are both about mapping one type to another, which is why they share a plan. Type aliases are needed first because `as` casts may reference aliased types.

## Prerequisites

- Plan 01 (Type Inference Correctness) — type resolution depends on correct inference
- Plan 02 (Lowering Correctness) — deref and assignment must be correct before adding casts

## Quality Policy

- Every feature must have comprehensive tests
- No `eslint-disable` comments
- Use `Result` from `better-result`, `match` from `ts-pattern`
- Run `bun lint <file>` after every change

---

## Part A: Type Aliases

### Current State

**Parsed in:** `src/parse/ast.ts` — `TypeAliasItem` AST node exists
**Rejected in:** `src/compile.ts` (~line 302) — `"type-alias-item"` unsupported feature diagnostic
**Rejected in:** `src/passes/ast_to_ssa.ts` (~line 798) — `"type aliases are not implemented"`

### Required Changes

#### A1: Type Alias Registration

**File:** `src/passes/inference.ts`

When a `TypeAliasItem` is encountered during module traversal:
1. Register the alias in `TypeContext` as a named type mapping
2. Add a `typeAliases: Map<string, { params: GenericParamNode[]; target: TypeNode }>` field to `TypeContext`
3. When resolving a `NamedTypeNode`, check the alias map first:
   - If the alias has no parameters, substitute the aliased type directly
   - If the alias is generic, require matching generic arguments and substitute the alias parameters into the aliased type before continuing inference

**Important:** Type aliases are purely syntactic substitutions. `type Point = (i32, i32)` means `Point` is exactly `(i32, i32)` everywhere. No new types are created, even for generic aliases like `type Maybe<T> = Option<T>`.

#### A2: Recursive Alias Detection

Aliases may reference other aliases:
```rust
type Age = i32;
type PersonAge = Age;
```

And must NOT be self-referential:
```rust
type Foo = Foo; // ERROR: recursive type alias
```

**Implementation:** During registration, expand the alias transitively with a visited set. If a cycle is detected, emit a type error.

#### A3: Alias in All Type Positions

Aliases should work in:
- Variable declarations: `let x: MyAlias = ...;`
- Function parameters: `fn foo(x: MyAlias) -> MyAlias { ... }`
- Struct fields: `struct Bar { value: MyAlias }`
- Generic arguments: `Vec<MyAlias>`
- Cast targets: `x as MyAlias` (used in Part B)

#### A4: Alias Lowering

**File:** `src/passes/ast_to_ssa.ts`

Type aliases should be fully resolved by inference time. During lowering, all `NamedTypeNode`s that reference aliases should already be replaced with concrete types by the inference pass. No special lowering is needed — just verify that `TypeAliasItem` is processed (registered) and then skipped during lowering (no IR instruction needed).

### Tests for Type Aliases

- Simple alias: `type Int = i32; let x: Int = 5;`
- Alias to struct: `type Point = MyStruct;`
- Alias to generic: `type IntVec = Vec<i32>;`
- Generic alias instantiation: `type Maybe<T> = Option<T>; let x: Maybe<i32> = Some(1);`
- Alias to reference: `type IntRef = &i32;`
- Alias to tuple: `type Pair = (i32, i32);`
- Recursive alias error: `type X = X;`
- Mutually recursive alias error: `type A = B; type B = A;`
- Alias referencing another alias: `type A = i32; type B = A;`
- Alias in function signature: `fn foo(x: Int) -> Int`
- Alias in struct field: `struct S { x: Int }`

---

## Part B: Cast Expressions

### Current State

**Parsed in:** `src/parse/ast.ts` — `CastExpr` AST node exists
**Rejected in:** `src/compile.ts` (~line 274) — `"cast-expression"` unsupported feature diagnostic
**Rejected in:** `src/passes/ast_to_ssa.ts` (~line 757) — `"`as` casts are not implemented"`

### Required Changes

#### B1: Type Inference for Casts

**File:** `src/passes/inference.ts`

A cast expression `expr as T` has type `T`. The inference should:
1. Infer the type of `expr` (the source type)
2. The result type is the target type `T`
3. Validate that the cast is legal (see B3)

#### B2: Lowering for Casts

**File:** `src/passes/ast_to_ssa.ts`

The IR already has conversion instructions that map directly to Rust casts:

| Rust Cast | IR Instruction | Notes |
|---|---|---|
| `i8 → i16` | `Sext` | sign-extend |
| `i8 → u16` | `Sext` | sign-extend to preserve the signed value before reinterpretation in the wider target |
| `u8 → i16` | `Zext` | zero-extend |
| `u8 → u16` | `Zext` | zero-extend |
| `i32 → i8` | `Trunc` | truncate |
| `i64 → i32` | `Trunc` | truncate |
| `f64 → f32` | `Trunc` | float truncate |
| `f32 → i32` | `Fptosi` | float to signed int |
| `f64 → i32` | `Fptosi` | float to signed int |
| `f32 → u32` | `Fptoui` | float to unsigned int |
| `i32 → f32` | `Sitofp` | signed int to float |
| `u32 → f32` | `Uitofp` | unsigned int to float |
| `i32 → *T` | `Bitcast` | int to pointer |
| `*T → i32` | `Bitcast` | pointer to int |
| `*T → *U` | `Bitcast` | pointer to pointer |
| `T → T` | nop | same-type cast is identity |

**Implementation:**
1. Add a `lowerCastExpr` method
2. Lower the source expression
3. Get source and target IR types
4. Select the correct conversion instruction using `match` on (sourceKind, targetKind)
5. If no valid conversion exists, emit a lowering error

#### B3: Cast Validation

Legal casts (following Rust rules):
- Integer ↔ Integer (widening, narrowing, sign change)
- Float ↔ Float (widening, narrowing)
- Integer ↔ Float (all combinations)
- Pointer ↔ Integer (usize-sized)
- Pointer ↔ Pointer (any)
- Reference → Raw pointer (same pointee type, via `as *const T` / `as *mut T`)
- `bool` ↔ Integer
- Same-type (identity)

Illegal casts (should produce type errors):
- `bool` ↔ Float
- Integer/Float ↔ Struct/Enum
- Raw pointer → Reference

#### B4: Unsized Casts (Deferred)

Casts like `&[T; N] as &[T]` (unsized) are out of scope for this plan. These require fat pointer support which is a larger feature.

### Tests for Cast Expressions

- Integer widening: `let x: i32 = 42i8 as i32;`
- Integer narrowing: `let x: i8 = 1000i32 as i8;`
- Integer sign change: `let x: u32 = (-1i32) as u32;`
- Float narrowing: `let x: f32 = 3.14f64 as f32;`
- Float to int: `let x: i32 = 3.14f64 as i32;`
- Int to float: `let x: f64 = 42i32 as f64;`
- Pointer to int: `let x: usize = ptr as usize;`
- Same-type identity: `let x: i32 = 42 as i32;`
- Illegal cast error: `let x: bool = 1.0f64 as bool;` — type error

---

## Work Packages

### WP-05.A: Type Alias Infrastructure

- Add `typeAliases` map to `TypeContext`
- Implement alias registration during inference module traversal
- Implement recursive alias resolution with cycle detection
- Substitute aliases in all type positions during inference
- Add tests for alias registration and resolution

### WP-05.B: Type Alias Integration

- Remove `"type-alias-item"` from unsupported features list
- Remove the lowering rejection for `TypeAliasItem`
- Ensure aliases work in function signatures, struct fields, generic args
- Add integration tests with existing features

### WP-05.C: Cast Expression Inference

- Add cast expression type inference in `inferExpression`
- Implement cast legality validation
- Remove `"cast-expression"` from unsupported features list
- Add inference tests

### WP-05.D: Cast Expression Lowering

- Implement `lowerCastExpr` with full conversion instruction mapping
- Handle all legal cast combinations using the IR conversion instructions
- Add lowering tests with IR output verification

### WP-05.E: Integration

- Add example file using type aliases and casts together
- Run full example suite
- Verify no regressions

## Acceptance Criteria

All required:

- [ ] `type Name = Type;` works in all type positions
- [ ] Recursive type aliases produce clear errors
- [ ] Aliases can reference other aliases
- [ ] `expr as Type` compiles for all legal numeric casts
- [ ] `expr as Type` compiles for pointer casts
- [ ] Illegal casts produce clear type errors
- [ ] Casts and aliases work together (`x as MyAlias`)
- [ ] All existing tests pass
- [ ] No lint errors

## Files Affected

- `src/compile.ts` — remove unsupported feature entries
- `src/passes/inference.ts` — alias resolution, cast inference
- `src/passes/ast_to_ssa.ts` — cast lowering, alias item handling
- `src/utils/type_context.ts` — type alias storage
- `tests/compile.test.ts` — new tests
- `examples/` — new example file

## Risks

- **Alias cycles** — must be detected before they cause infinite loops. The visited-set approach is straightforward but must be applied consistently.
- **Cast instruction selection** — the mapping from (source, target) to IR instruction is large but finite. Use an exhaustive `match` to ensure all cases are covered.
- **Type alias in generic position** — `type IntVec = Vec<i32>; fn foo<T>() {}` — aliases in generic monomorphization need the alias to be resolved before unification. This should work naturally if inference resolves aliases eagerly.
