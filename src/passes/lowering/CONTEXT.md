# Lowering

Translates the typed AST into SSA IR. Consumes a `ModuleNode` plus `LoweringInput` and produces an `IRModule` populated with lowered functions, struct types, enum types, and string literals.

Currently a single monolithic file (`ast_to_ssa.ts`, ~4,600 lines). Being split into five sub-modules by concern.

## Language

**Lowering**:
The pass that produces SSA IR from the typed AST. Walks every item in the `ModuleNode`, lowers each function body to instructions and control-flow graphs, registers types in the `IRModule`, and handles monomorphization call sites. The entry point is `lowerAstModuleToSsa(moduleNode, loweringInput) → IRModule`.
_Avoid_: Code generation, AST-to-IR, SSA construction

**LoweringInput**:
The seam data structure passed from inference into lowering. Contains struct field names and types, function IDs and return types, enum variant tags and owners, named constants, impl constants, generic function registrations, and call-site substitutions. The lowering module never imports `ModuleMetadata` or `TypeContext` — it only reads `LoweringInput`.
_Avoid_: Lowering context bag, metadata map

**LoweredValue**:
The return type of every expression and statement lowerer. A tuple `{ id: ValueId; ty: IRType }` that bundles the produced value with its IR type. Eliminates the need for `resolveValueType` — the type travels with the value from creation to consumption.
_Avoid_: Value result, expression output

**Type translation**:
A pure module that maps AST `TypeNode` → `IRType` with no lowering state or builder access. Converts named types, built-in types, Option/Result enum types, reference/pointer types, tuple types, and array types. Static, no dependencies on the rest of the lowering pipeline.
_Avoid_: Type lowering, type conversion

**Format tag**:
An enum (`String | Int | Float | Bool | Char`) attached to local bindings and inferred from literals. Used by the print/println macro lowering to emit the correct format-string specifier alongside each value. Consolidated into a single definition in the lowering types module; the duplicate in `format_tags.ts` is removed.
_Avoid_: Print type marker, format kind

**IRBuilder** (passed as argument):
The `IRBuilder` instance is passed explicitly into every sub-module's free functions. No lowering function directly reads the builder's internal fields; all access goes through builder methods. Enables a fresh `IRBuilder` per closure function (no snapshot/restore hack).
_Avoid_: Builder context, code emitter

**Sliced context**:
Each sub-module receives only the subset of lowering state it actually reads. `lower_expr` gets `LoweringExprCtx` (locals, consts, functionIds, structFieldNames, etc.), while `lower_control_flow` gets `LoweringCfgCtx` (loopStack, currentReturnType, locals, enumVariantTags). No sub-module receives the full state bag.
_Avoid_: Shared context, global state

**Phi merging**:
The pattern shared by `if`, `match`, and `loop` control flow: create a merge block with block parameters for the result type, connect each predecessor with a `br` carrying its value as args, then read the phi-block parameter at the merge. Extracted into `lower_control_flow.ts` with shared helpers (`createMergeBlock`, `connectMergePredecessors`, `mergeBlockResultValue`).
_Avoid_: Phi insertion, value joining

## Sub-modules

The split produces five files under `src/passes/lowering/`:

| File | Concern | ~Lines | Receives |
|---|---|---|---|
| `types.ts` | `LoweringInput`, `LoweredValue`, `FormatTag`, error types, common interfaces | ~60 | n/a (pure types) |
| `type_translation.ts` | `translateTypeNode`, `builtinToIrType`, `namedBuiltin` | ~200 | no builder or context |
| `lower_expr.ts` | Expression + statement lowering: literals, binary/unary, field/index, struct literals, calls, macros (print, assert, assert_eq, vec, tuple), assignments, let, const, block | ~1,700 | `(expr, builder: IRBuilder, ctx: LoweringExprCtx)` |
| `lower_control_flow.ts` | `if`/`else` phi merges, `loop`/`while` with break/continue, `match` with enum/literal patterns, `return` | ~400 | `(expr, builder: IRBuilder, ctx: LoweringCfgCtx)` |
| `lower_closure.ts` | Free-var collection, non-capturing closure → IR function lowering, fresh `IRBuilder` per closure | ~250 | `(expr, builder: IRBuilder, ctx: LoweringCtx)` |
| `lower_module.ts` | Orchestrator: `lowerAstModuleToSsa`, `deriveLoweringMaps` (converts `ModuleMetadata → LoweringInput`), impl/trait dispatch, `rewriteSelfInMethod`, monomorphization orchestration | ~400 | `(moduleNode, loweringInput)` |

## Implementation decisions (from grilling)

### D1: Fresh `IRBuilder` per closure function

Closures are lowered by creating a new `IRBuilder` instance for the closure function body. The old snapshot/restore mechanism (`saveBuilderSnapshot`, `restoreBuilderSnapshot`, `withIsolatedBuilderScope`) is deleted. The closure lowering produces a full `IRFunction` from the fresh builder, which is then added to the `IRModule`.

### D2: `LoweredValue` bundles `id` and `ty`

Every `lower*` function returns `LoweredValue = { id: ValueId; ty: IRType }` instead of bare `ValueId`. The `resolveValueType` traversal is eliminated — the type is available on every return value. `handleInstructionId` (which checked for null IDs) is also eliminated since null-check and type are bundled in one return type.

### D3: Sliced contexts

Each sub-module defines its own context interface declaring exactly which maps and state it reads. The orchestrator (`lower_module.ts`) constructs the appropriate slice for each call. Example:

```ts
interface LoweringExprCtx {
  locals: Map<string, LocalBinding>;
  constScopes: Map<string, LoweringConstBinding>[];
  constResolutionStack: LoweringConstBinding[];
  functionIds: Map<string, number>;
  functionReturnTypes: Map<string, IRType>;
  structFieldNames: Map<string, string[]>;
  enumVariantTags: Map<string, number>;
  enumVariantOwners: Map<string, string>;
  namedConsts: Map<string, LoweringConstBinding>;
  irModule: IRModule;
  currentReturnType: IRType;
  expectedValueTypes: IRType[];
}
```

### D4: `LoweringInput` seam between inference and lowering

`lowerAstModuleToSsa` accepts `LoweringInput` directly, not `ModuleMetadata`. `deriveLoweringMaps(metadata)` produces the `LoweringInput` from `ModuleMetadata`. `compile.ts` is responsible for calling `deriveLoweringMaps` before passing the result to lowering. The lowering module never imports `ModuleMetadata` or `TypeContext`.

### D5: Type translation is a pure module

`translateTypeNode`, `builtinToIrType`, and `namedBuiltin` are free functions with zero dependencies on lowering state or the `IRBuilder`. They take a `TypeNode` and return an `IRType`. No `this`, no context, no builder.

### D6: `FormatTag` consolidated into lowering types

The `FormatTag` enum defined in `ast_to_ssa.ts` (which duplicates `format_tags.ts`) is moved to `src/passes/lowering/types.ts`. `format_tags.ts` is removed. All lowering code uses the single definition.

### D7: `irModule` passed as writable shared state

The `IRModule` is passed by reference to sub-modules that need to register types, intern strings, or add functions. No delta-accumulation pattern — the current approach is sufficient and simpler.

### D8: IRBuilder internal fields are not read directly

Lowering code accesses the builder only through its public methods. Snapshot/restore is eliminated entirely (see D1). If lowering needs to query builder state, a proper method is added to `IRBuilder` rather than reading `builder.currentFunction` etc. directly.

## Implementation plan (vertical slices)

Six slices, each independently verifiable by the full test suite:

1. **Extract `type_translation` and `LoweringInput`**: Create `types.ts`, `type_translation.ts`. Wire `ast_to_ssa.ts` to import from new files. Create `deriveLoweringMaps`.
2. **Introduce `LoweredValue { id, ty }` tuples**: Change all return types, eliminate `resolveValueType` and `handleInstructionId`.
3. **Extract `lower_expr.ts`**: Move expression + statement lowerers to free functions with `LoweringExprCtx`.
4. **Extract `lower_control_flow.ts`**: Move CFG lowering to free functions with `LoweringCfgCtx`.
5. **Extract `lower_closure.ts` + fresh builder**: Move closure lowering, eliminate snapshot/restore.
6. **Extract `lower_module.ts` as orchestrator, wire `compile.ts`, delete `ast_to_ssa.ts`**: `lowerAstModuleToSsa` accepts `LoweringInput`. Delete old `AstToSsaCtx`.

## Relationships

- **ModuleNode** (from Parse) + **LoweringInput** (from Passes) → **lowerAstModuleToSsa** → **IRModule** (to SSA IR)
- **Monomorphization** runs within lowering: generic items are collected, call sites are monomorphized, specializations are lowered as additional functions in the same `IRModule`

## Example dialogue

> **Dev:** "When lowering an `if` expression, how do the then and else branches agree on a result type?"
> **Domain expert:** "The merge block gets a block parameter of the resolved type. If both branches return `i32`, the merge parameter is `i32`. If only one branch returns a value and the other returns unit, the merge has no parameter — the result is `()` (unit). The `terminateIfBranches` helper handles this: it checks whether all reachable predecessors supply a value of the same type, then creates the merge block accordingly."
>
> **Dev:** "What happens when type translation hits a `NamedTypeNode` it doesn't recognize?"
> **Domain expert:** "It returns `StructType(name, [])` — an empty struct. The struct's actual fields are filled in later when `deriveLoweringMaps` pre-populates the IRModule struct registry from `ModuleMetadata`. If the struct never gets field metadata, lowering will produce errors when field access is attempted, or the LLVM printer will emit an empty struct type."
>
> **Dev:** "Why does `LoweringInput` have a function field `getCallSubstitution`?"
> **Domain expert:** "Because inference produces the substitution map for each generic call site — the lowering module just needs to look it up. Making it a function field keeps the lookup logic decoupled: inference can change how it stores substitutions without lowering needing to know. This is the seam between the two modules."

## Flagged ambiguities

- "lowering" previously referred only to the monolithic `ast_to_ssa.ts` — now refers to the entire `src/passes/lowering/` directory with its sub-modules
- "format tag" was duplicated across `ast_to_ssa.ts` and `format_tags.ts` — consolidated into `lowering/types.ts`
- "context" in the old code meant the full `AstToSsaCtx` bag of all state — now refers to the sliced context interfaces each sub-module declares
