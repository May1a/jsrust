# PLAN: Split monolithic `ast_to_ssa.ts` into deep lowering modules

## Branch purpose

This branch contains the **context and plan** for refactoring the monolithic lowering pass (`src/passes/ast_to_ssa.ts`, 4,631 lines) into five deep sub-modules under `src/passes/lowering/`. No implementation code exists yet — this branch carries only the documentation (context map, context files, issue breakdown, and this plan). Implementation happens in subsequent PRs.

## Skills an agent should load

When picking up this work, load these skills:

- **`grill-with-docs`** — if any design decision needs revisiting, grill against the constraints in `CONTEXT-MAP.md` and the per-context CONTEXT.md files
- **`diagnose`** — if the test suite fails after a slice, use the diagnosis loop to find the root cause
- **`tdd`** — when writing unit tests for the new sub-modules (after the refactor, not during)
- **`improve-codebase-architecture`** — if the split reveals new architectural friction or the module boundaries need adjustment

## Reading order for a new agent

1. **`CONTEXT-MAP.md`** (repo root) — the overall context map, listing all contexts and their relationships
2. **`src/passes/lowering/CONTEXT.md`** — the detailed lowering context with all grilling decisions encoded as domain language
3. **`src/passes/CONTEXT.md`** — the passes context (inference, borrow, monomorphization)
4. **`src/ir/CONTEXT.md`** — the SSA IR context (IRBuilder, IRFunction, IRBlock, etc.)
5. **`src/parse/CONTEXT.md`** — the parsing context (AST nodes, ModuleNode, etc.)
6. **`src/llvm/CONTEXT.md`** — the LLVM context (emission, printing, toolchain)
7. **This file (`PLAN.md`)** — the implementation plan
8. **The PRD on GitHub Issues** — the official specification

## GitHub issues

All issues are labeled `ready-for-agent` and listed in dependency order.

| Issue | Title | Blocked by |
|---|---|---|
| [#22](https://github.com/May1a/jsrust/issues/22) | PRD: Split monolithic AST-to-SSA lowering into deep modules | - |
| [#23](https://github.com/May1a/jsrust/issues/23) | Slice 1: Extract type_translation and LoweringInput | None |
| [#24](https://github.com/May1a/jsrust/issues/24) | Slice 2: Introduce LoweredValue tuples | #23 |
| [#25](https://github.com/May1a/jsrust/issues/25) | Slice 3: Extract lower_expr.ts | #24 |
| [#26](https://github.com/May1a/jsrust/issues/26) | Slice 4: Extract lower_control_flow.ts | #25 |
| [#27](https://github.com/May1a/jsrust/issues/27) | Slice 5: Extract lower_closure.ts with fresh builder | #26 |
| [#28](https://github.com/May1a/jsrust/issues/28) | Slice 6: Extract lower_module.ts, wire compile.ts, delete ast_to_ssa.ts | #27 |

## The problem

`ast_to_ssa.ts` holds all of this in one class:

- Expression lowering (literals, binary/unary ops, field/index access, struct literals, calls, macros)
- Statement lowering (let, const, blocks)
- Control-flow graph construction (if, loop, while, match, break, continue, return)
- Phi-node insertion and merge-block management
- Memory allocation for locals (alloca/load/store)
- Type translation (TypeNode → IRType, builtin mapping)
- Format-string parsing and format-tag inference
- Enum constructor lowering (Some, Ok, Err, Option/Result resolution)
- Builtin method lowering (is_some, is_none, is_ok, is_err, unwrap, expect, clone)
- Closure lowering (free-variable analysis, non-capturing closures → IR functions)
- Method-call dispatch and receiver resolution
- Const resolution (const scopes, const binding, cycle detection)
- Monomorphization orchestration (generic item collection, specialization lowering)
- Impl/trait dispatch and Self-type rewriting
- Snapshot/restore for isolated builder scopes
- Module-level iteration over items

It is 4,631 lines with ~50 instance methods and no internal seams.

## The solution (summary)

Split into five files under `src/passes/lowering/`:

| # | File | Concern |
|---|------|---------|
| 1 | `types.ts` | `LoweringInput`, `LoweredValue`, `FormatTag`, error types |
| 2 | `type_translation.ts` | Pure `TypeNode → IRType` mapping |
| 3 | `lower_expr.ts` | Expression + statement lowering |
| 4 | `lower_control_flow.ts` | Control-flow graph construction |
| 5 | `lower_closure.ts` | Closure lowering with fresh builder |
| 6 | `lower_module.ts` | Orchestrator, impl/trait, monomorphization |

## All implementation decisions (from grilling)

These are non-negotiable. See `src/passes/lowering/CONTEXT.md` for the domain-language framing.

### D1: Fresh `IRBuilder` per closure function

Closure lowering creates a new `IRBuilder()` instance. The old `saveBuilderSnapshot` / `restoreBuilderSnapshot` / `withIsolatedBuilderScope` methods are deleted. The closure lowering produces a full `IRFunction` which is added to the `IRModule` via `addIRFunction(irModule, fn)`.

### D2: `LoweredValue` bundles `id` and `ty`

Every `lower*` function returns `{ id: ValueId; ty: IRType }` instead of bare `ValueId`. The `resolveValueType` method (which walked params, block params, and instructions to find a ValueId's type) is deleted. `handleInstructionId` (which checked for null IDs) is also deleted.

### D3: Sliced contexts

Each sub-module defines its own context interface. The orchestrator constructs the appropriate slice for each call. Example:

```ts
// In lower_expr.ts
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

// In lower_control_flow.ts
interface LoweringCfgCtx {
  loopStack: LoopFrame[];
  currentReturnType: IRType;
  locals: Map<string, LocalBinding>;
  enumVariantTags: Map<string, number>;
  enumVariantOwners: Map<string, string>;
  structFieldNames: Map<string, string[]>;
  irModule: IRModule;
  // ... plus whatever lower_expr methods are called during sub-expression lowering
}
```

### D4: `LoweringInput` seam

`lowerAstModuleToSsa(moduleNode, loweringInput: LoweringInput)` — it does NOT accept `ModuleMetadata`. The function `deriveLoweringMaps(metadata: ModuleMetadata) → LoweringInput` converts metadata into lowering input. `compile.ts` is responsible for calling `deriveLoweringMaps` before lowering.

### D5: Type translation is pure

`translateTypeNode(typeNode) → IRType`, `builtinToIrType(ty) → IRType`, `namedBuiltin(name) → BuiltinType` are free functions. No `this`, no context, no builder access. No dependencies on other lowering modules.

### D6: `FormatTag` consolidation

The `FormatTag` enum in `ast_to_ssa.ts` (which duplicates `format_tags.ts`) is moved to `src/passes/lowering/types.ts`. The file `src/utils/format_tags.ts` is deleted. All lowering code imports `FormatTag` from `src/passes/lowering/types`.

### D7: `irModule` as shared writable

The `IRModule` is passed by reference to sub-modules that register types (`registerEnumTypeMetadata` → `irModule.enums.set`), intern strings (`internIRStringLiteral`), or register struct types. The caller at the module level adds functions via `addIRFunction`. No delta-accumulation pattern.

### D8: No direct IRBuilder field reads

Lowering code accesses `IRBuilder` only through public methods. No reading of `builder.currentFunction`, `builder.currentBlock`, `builder.sealedBlocks`, etc. If a sub-module needs to query builder state, add a proper method to `IRBuilder` (e.g., `isTerminated()`, `getCurrentBlockId()`, `getFunctionParamTypes()`).

## Vertical slice plan

Each slice is independently verifiable by running the full test suite:

```bash
bun test tests/compile.test.ts tests/examples.test.ts
```

All slices must pass before moving to the next.

### Slice 1: Extract `type_translation` and `LoweringInput` (AFK) — [#23](https://github.com/May1a/jsrust/issues/23)

**Files created:**
- `src/passes/lowering/types.ts` — `LoweringInput` interface, `LoweredValue = { id: ValueId; ty: IRType }`, `FormatTag` enum, `LoweringError` types, `LocalBinding`, `LoopFrame`, `LoweringConstBinding`, `BuilderSnapshot`, `FormatTemplate`
- `src/passes/lowering/type_translation.ts` — `translateTypeNode`, `builtinToIrType`, `namedBuiltin`, `translateArrayTypeNode`, `translateTupleTypeNode`, `irTypeName`, `tupleStructName`

**Files modified:**
- `src/passes/ast_to_ssa.ts` — import `translateTypeNode`, `builtinToIrType`, `namedBuiltin` from `./lowering/type_translation`; remove the static methods (or delegate to them). Import `LoweringInput`, `LoweredValue`, `FormatTag` from `./lowering/types`.
- `src/passes/lowering/index.ts` — re-export module types and type_translation

Introduce `deriveLoweringMaps` as a free function exported from a new file or from `lower_module.ts` (but `lower_module.ts` is created in slice 6... hmm). Actually, slice 1 should create the converter function somewhere. Let me reconsider.

**Revised for slice 1:** Create `src/passes/lowering/types.ts`, `type_translation.ts`, `index.ts`. Create `deriveLoweringMaps` in a temporary location (could be in `lowering/` or as a free function exported from the index). The function `lowerAstModuleToSsa` still accepts `ModuleMetadata` during this slice — the seam migration happens in slice 6.

**What to verify:**
```bash
bun test tests/compile.test.ts tests/examples.test.ts
```
Must pass.

**Key principle:** This slice is about moving the *type* glue (types + pure type translation) into the new directory while keeping the old class working. No behavior change. No test should break.

### Slice 2: Introduce `LoweredValue { id, ty }` tuples (AFK) — [#24](https://github.com/May1a/jsrust/issues/24)

**Files modified:**
- `src/passes/ast_to_ssa.ts` — change ALL `lower*` method return types from `Result<ValueId, LoweringError>` to `Result<LoweredValue, LoweringError>`. Update every call site that destructures the result to use `.value.id` and `.value.ty`. Delete `resolveValueType` and `handleInstructionId`.

**No new files.**

**What to verify:** Test suite passes. Type is now available on every lowerer return without querying.

**Key principle:** This is a mechanical change with ~50 call sites. Do it in one pass, run tests, fix any missed sites. The type of every expression is now explicitly known at the call site.

### Slice 3: Extract `lower_expr.ts` (AFK) — [#25](https://github.com/May1a/jsrust/issues/25)

**File created:**
- `src/passes/lowering/lower_expr.ts`

**Content moved from `AstToSsaCtx` (instance methods → free functions):**
- `lowerLiteral`, `lowerIdentifier`, `lowerBinary`, `lowerUnary`
- `lowerCall`, `lowerIdentifierCall`, `lowerMethodCall`, `lowerResolvedCall`, `resolveReceiverArg`, `resolveQualifiedMethodName`, `resolveNamedCallReturnType`
- `lowerFieldAccess`, `lowerIndexExpr`, `lowerStructLiteral`, `lowerTupleLiteral`, `lowerArrayLiteral`
- `lowerMacro`, `lowerPrintMacro`, `lowerAssert`, `lowerAssertEq`, `lowerAssertEqEnum`, `lowerEnumVariantFieldCmp`, `preparePrintArguments`, `parseFormatTemplate`
- `lowerStatement`, `lowerLetStatement`, `lowerConstItem`, `lowerBlock`
- `lowerAssign`, `lowerAssignTarget`, `lowerAssignTargetIdent`, `lowerAssignTargetDeref`, `lowerAssignTargetField`, `lowerAssignTargetIndex`
- `lowerReturn` (called from expression visitor, but CFG-adjacent — could go in this slice or slice 4)
- `lowerEnumConstructorCall`, `lowerSomeConstructor`, `lowerOkConstructor`, `lowerErrConstructor`
- `resolveExpectedOptionPayloadType`, `resolveResultOkType`, `resolveResultErrType`, `peekExpectedValueType`, `resolveExpectedResultType`
- `lowerEnumIsTag`, `lowerEnumUnwrap`
- `tryLowerBuiltinMethod`, `tryLowerBuiltinIsMethod`, `tryLowerBuiltinUnwrapMethod`
- `resolveGenericCallName`, `resolveEnumTypeForVariant`, `findEnumTypeByName`
- Format tag helpers: `resolveExpressionFormatTag`, `inferExpressionFormatTag`, `inferFormatTagFromValueType`, `formatTagFromTypeNode`, `isIntegerFormatType`, `formatTagForLiteral`, `countFormatPlaceholders`
- Binary op helpers: `handleBinaryOperation`, `handleArithmeticOperation`, `handleComparisonOperation`, `handleBitwiseOperation`, all `handle*Operation` methods, `isArithmeticOperation`, `isComparisonOperation`, `isBitwiseOperation`, `resolveIntWidth`, `resolveFloatWidth`, `isFloatish`, `autoDerefForBinaryOp`
- `visitPathExpr` (delegates to `lowerIdentifier`)
- Constants: `lowerConstBinding`, `lookupConst`, `bindConst`, `currentConstScope`, `cloneConstScopes`
- Locals: `bindLocalValue`, `cloneLocals`, `restoreLocals`, `registerEnumTypeMetadata`
- `defaultValueForType`, `unitValue`

**Each function signature becomes:**
```ts
export function lowerBinary(expr: BinaryExpr, builder: IRBuilder, ctx: LoweringExprCtx): Result<LoweredValue, LoweringError>
```

**The `AstToSsaCtx` class delegates:**
```ts
private lowerBinary(expr: BinaryExpr): Result<LoweredValue, LoweringError> {
  return lowerBinaryImpl(expr, this.builder, this.makeExprCtx());
}
```
Where `makeExprCtx()` constructs the slice from the instance fields.

**What to verify:** Full test suite passes. The expression lowering implementation lives in `lower_expr.ts`. `AstToSsaCtx` is a delegating shell.

### Slice 4: Extract `lower_control_flow.ts` (AFK) — [#26](https://github.com/May1a/jsrust/issues/26)

**File created:**
- `src/passes/lowering/lower_control_flow.ts`

**Content moved from `AstToSsaCtx`:**
- `lowerIf`, `terminateIfBranches`
- `lowerLoop`, `lowerWhile`
- `lowerBreak`, `lowerContinue`
- `lowerMatchExpr`, `buildMatchCases`, `resolveLiteralPatternValue`, `resolveStructPatternTag`
- `lowerMatchArms`, `lowerMatchArmBodies`, `bindMatchArmPattern`, `bindStructPatternPayload`
- `createMergeBlock`, `mergeBlockArgs`, `mergeBlockResultValue`, `resolveMergeResultType`, `connectMergePredecessors`
- `sealAllBlocks`
- `lowerReturn` (if not already in slice 3)
- `currentBlockValue`, `currentBlockId`, `isCurrentBlockTerminated`, `currentTypeKind`

**Each function signature:**
```ts
export function lowerIf(expr: IfExpr, builder: IRBuilder, ctx: LoweringCfgCtx): Result<LoweredValue, LoweringError>
```

`LoweringCfgCtx` includes: `loopStack`, `currentReturnType`, `locals`, `enumVariantTags`, `enumVariantOwners`, `structFieldNames`, `irModule`. It also needs access to the expression lowerer (from slice 3) since CFG lowering calls `lowerExpression` to lower sub-expressions. This means `LoweringCfgCtx` must include a `lowerExpression: (expr: Expression) => Result<LoweredValue, LoweringError>` callback.

**What to verify:** Full test suite passes. Control-flow logic lives in `lower_control_flow.ts`.

### Slice 5: Extract `lower_closure.ts` with fresh builder (AFK) — [#27](https://github.com/May1a/jsrust/issues/27)

**File created:**
- `src/passes/lowering/lower_closure.ts`

**Content moved from `AstToSsaCtx`:**
- `lowerClosure`, `lowerNonCapturingClosure`, `lowerClosureFunction`
- `collectFreeVars`, `inferParamTypeFromBody`, `resolveClosureParamType`, `resolveClosureReturnType`, `inferExprType`

**DELETED from `AstToSsaCtx`:**
- `saveBuilderSnapshot`, `restoreBuilderSnapshot`, `withIsolatedBuilderScope` — replaced by fresh `IRBuilder` convention
- `closureCounter` — moved to `lower_closure.ts` as module-level state

**The fresh builder convention:**
```ts
export function lowerClosure(expr: ClosureExpr, builder: IRBuilder, ctx: LoweringCtx): Result<LoweredValue, LoweringError> {
  const freeVars = collectFreeVars(expr);
  const hasCaptures = [...freeVars].some((v) => ctx.locals.has(v));
  if (!hasCaptures) {
    const closureBuilder = new IRBuilder();  // fresh builder
    const fn = lowerClosureFunction(name, expr, closureBuilder, ctx);
    // fn is added to irModule, closureBuilder is discarded
  }
}
```

**What to verify:** Full test suite passes. Snapshot/restore is gone. Closures produce correct functions.

### Slice 6: Extract `lower_module.ts`, wire `compile.ts`, delete `ast_to_ssa.ts` (AFK) — [#28](https://github.com/May1a/jsrust/issues/28)

**File created:**
- `src/passes/lowering/lower_module.ts`

**Content moved (remaining from `AstToSsaCtx` + module-level functions):**
- `lowerAstModuleToSsa` — now accepts `(moduleNode, loweringInput: LoweringInput)` instead of `(moduleNode, metadata: ModuleMetadata)`
- `deriveLoweringMaps` — converts `ModuleMetadata → LoweringInput`
- `lowerModuleItem`
- `lowerOwnedFunction`
- `lowerImplMethods`, `lowerTraitImplMethods`
- `rewriteSelfInMethod`, `ensureImplStructMetadata`, `convertToInitialConsts`, `toLoweringBinding`
- `collectGenericItems`, `collectAndMonomorphize`, `inferCallSiteTypeArgs`, `inferLiteralType`
- `lowerFunction` (function-level setup: param binding, body lowering, return, seal)
- `getLowerableParams`, `startFunction`, `bindFunctionParams`
- `registerSyntheticFunctionId`, `requireFunctionId`

**`compile.ts` changes:**
```ts
// Before:
import { lowerAstModuleToSsa } from "./passes/ast_to_ssa";
const loweringResult = lowerAstModuleToSsa(module, metadata);

// After:
import { lowerAstModuleToSsa, deriveLoweringMaps } from "./passes/lowering/lower_module";
const loweringInput = deriveLoweringMaps(metadata, moduleNode, irModule);
const loweringResult = lowerAstModuleToSsa(module, loweringInput);
```

**Deleted:**
- `src/passes/ast_to_ssa.ts` — entire file
- `AstToSsaCtx` class
- All delegating shell methods

**What to verify:** Full test suite passes. `ast_to_ssa.ts` no longer exists. `compile.ts` imports from the new modules.

## Test strategy

### During the refactor (all slices)

- **Regression gate**: `bun test tests/compile.test.ts tests/examples.test.ts` must pass after every slice
- **No new tests written during the refactor** — the structural change is the deliverable
- **Lint**: `bun lint <file>` after each file is modified

### After the refactor (future work)

New unit tests for each sub-module:
- `type_translation.test.ts` — pure function assertions
- `lower_expr.test.ts` — expression lowering assertions
- `lower_control_flow.test.ts` — CFG construction assertions
- `lower_closure.test.ts` — closure lowering assertions
- `lower_module.test.ts` — integration assertions

Test pattern: construct input AST nodes, call the lowering function, assert on the IR structure. Follow the same test style as `tests/compile.test.ts`.

## Success criteria

1. `ast_to_ssa.ts` no longer exists
2. Five files exist under `src/passes/lowering/` (plus `types.ts` and `index.ts`)
3. `compile.ts` imports from the new modules and passes `LoweringInput`
4. `LoweringInput` seam: lowering never imports `ModuleMetadata` or `TypeContext`
5. `LoweredValue { id, ty }` is the universal return type from all lowering functions
6. `resolveValueType` and `handleInstructionId` no longer exist
7. `saveBuilderSnapshot` / `restoreBuilderSnapshot` / `withIsolatedBuilderScope` no longer exist
8. Closure lowering uses a fresh `IRBuilder` instance
9. `FormatTag` is defined once in `lowering/types.ts`; `format_tags.ts` is deleted
10. All lowering functions receive `IRBuilder` as an explicit argument
11. Each sub-module has a sliced context interface declaring only the state it reads
12. `bun test tests/compile.test.ts tests/examples.test.ts` passes
13. `bun lint` passes on all modified files
14. No behavior changes — emitted LLVM IR is identical to baseline

## Out of scope

- Writing unit tests for the new sub-modules (follow-up work)
- Adding new language features
- Changing the IR model or builder interface (beyond what D8 requires)
- Changing the LLVM emission, printer, or toolchain
- Adding capture-supporting closures
- Changing parsing or inference
