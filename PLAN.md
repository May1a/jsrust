# PLAN: Split monolithic lowering into deep modules

## Current state

Slices 1–2 are done. Slices 3–6 created the seam interfaces but **did not extract the implementation**. All 4,383 lines of lowering logic still live in `src/passes/lowering/lower_module.ts` inside the monolithic `AstToSsaCtx` class (line 275). The sub-module files (`lower_expr.ts`, `lower_control_flow.ts`, `lower_closure.ts`) contain only type/interface stubs.

## GitHub issues

| Issue | Title | State | Reality |
|-------|-------|-------|---------|
| [#22](https://github.com/May1a/jsrust/issues/22) | PRD: Split monolithic AST-to-SSA lowering into deep modules | OPEN | — |
| [#23](https://github.com/May1a/jsrust/issues/23) | Slice 1: Extract type_translation and LoweringInput | **CLOSED** | Genuinely done |
| [#24](https://github.com/May1a/jsrust/issues/24) | Slice 2: Introduce LoweredValue { id, ty } tuples | OPEN | Genuinely done |
| [#25](https://github.com/May1a/jsrust/issues/25) | Slice 3: Extract lower_expr.ts | OPEN | Only interface stubs exist |
| [#26](https://github.com/May1a/jsrust/issues/26) | Slice 4: Extract lower_control_flow.ts | OPEN | Only interface stubs exist |
| [#27](https://github.com/May1a/jsrust/issues/27) | Slice 5: Extract lower_closure.ts | OPEN | Only interface stubs exist |
| [#28](https://github.com/May1a/jsrust/issues/28) | Slice 6: Extract lower_module.ts, wire compile.ts, delete ast_to_ssa.ts | OPEN | Only orchestration wiring done; implementation not extracted |

## What's genuinely done

### Slice 1 (#23) — DONE

- `src/passes/lowering/types.ts` — `LoweringInput`, `LoweredValue`, `FormatTag`, error types, `LocalBinding`, `LoopFrame`, `LoweringConstBinding`, `BuilderSnapshot`
- `src/passes/lowering/type_translation.ts` — pure free functions: `translateTypeNode`, `builtinToIrType`, `namedBuiltin`, `translateArrayTypeNode`, `translateTupleTypeNode`, `irTypeName`, `tupleStructName`
- `src/passes/lowering/index.ts` — barrel re-exports
- `src/utils/format_tags.ts` deleted; `FormatTag` consolidated into `lowering/types.ts`
- `deriveLoweringMaps` exported (was module-private)

### Slice 2 (#24) — DONE

- All `lower*` methods return `Result<LoweredValue, LoweringError>` (not bare `ValueId`)
- `resolveValueType` deleted
- `handleInstructionId` deleted
- `saveBuilderSnapshot` / `restoreBuilderSnapshot` / `withIsolatedBuilderScope` deleted
- `ast_to_ssa.ts` deleted; code moved to `lower_module.ts`

### Wired

- `compile.ts` imports from `./passes/lowering/lower_module` and passes `LoweringInput` correctly
- Test suite passes: 38 pass, 33 skip, 0 fail
- Lint passes on all files

## What was NOT done (the remaining work)

### The seam files are stubs

| File | Lines | Contains |
|------|-------|----------|
| `lower_expr.ts` | 31 | Only `LoweringExprCtx` interface + `LowerExpression` type alias |
| `lower_control_flow.ts` | 27 | Only `LoweringCfgCtx` interface + `LowerControlFlow` type alias |
| `lower_closure.ts` | 22 | Only `LoweringClosureCtx` interface + `LowerClosure` type alias |

None of these files contain any function implementations. All lowering logic remains as 178 methods on the `AstToSsaCtx` class in `lower_module.ts` (4,383 lines).

### `BuilderSnapshot` dead type

`BuilderSnapshot` interface is still declared in `types.ts:57` but never referenced (snapshot/restore methods were deleted in slice 2). Should be removed.

### `ModuleMetadata` import in lowering

`lower_module.ts:79` imports `ModuleMetadata` — violates the planned seam (decision D4). However this is by necessity: `deriveLoweringMaps` must accept `ModuleMetadata` to convert it to `LoweringInput`. Once the implementation is fully extracted, this import should be confined to the conversion function only.

## Remaining work

### The extraction pattern

For each method currently on `AstToSsaCtx`:

```
Before (method on AstToSsaCtx):
  private lowerBinary(expr: BinaryExpr): Result<LoweredValue, LoweringError> { ... }

After (free function in sub-module):
  export function lowerBinary(expr: BinaryExpr, builder: IRBuilder, ctx: LoweringExprCtx): Result<LoweredValue, LoweringError> { ... }
```

The `AstToSsaCtx` method body moves verbatim; `this.builder` becomes the `builder` parameter; `this.<field>` becomes `ctx.<field>`. Control-flow lowering receives a `lowerExpression: (expr: Expression) => Result<LoweredValue, LoweringError>` callback in its context for lowering sub-expressions.

### Slice 3 (#25): Extract expression lowering into `lower_expr.ts`

Move these methods from `AstToSsaCtx` → free functions in `lower_expr.ts`:

**Expression lowerers:**
- `lowerLiteral`, `lowerIdentifier` / `visitPathExpr`
- `lowerBinary`, `handleBinaryOperation`, `handleArithmeticOperation`, `handleComparisonOperation`, `handleBitwiseOperation`
- `lowerUnary`
- `lowerCall`, `lowerIdentifierCall`, `lowerMethodCall`, `lowerResolvedCall`
- `resolveReceiverArg`, `resolveQualifiedMethodName`, `resolveNamedCallReturnType`
- `lowerFieldAccess`, `lowerIndexExpr`
- `lowerStructLiteral`, `lowerTupleLiteral`, `lowerArrayLiteral`
- `lowerEnumConstructorCall`, `lowerSomeConstructor`, `lowerOkConstructor`, `lowerErrConstructor`
- `lowerEnumIsTag`, `lowerEnumUnwrap`
- `tryLowerBuiltinMethod`, `tryLowerBuiltinIsMethod`, `tryLowerBuiltinUnwrapMethod`
- `resolveEnumTypeForVariant`, `findEnumTypeByName`
- `resolveGenericCallName`

**Macro lowerers:**
- `lowerMacro`, `lowerPrintMacro`, `lowerAssert`, `lowerAssertEq`, `lowerAssertEqEnum`, `lowerEnumVariantFieldCmp`
- `preparePrintArguments`, `parseFormatTemplate`

**Statement lowerers:**
- `lowerStatement`, `lowerLetStatement`, `lowerConstItem`, `lowerBlock`
- `lowerAssign`, `lowerAssignTarget`, `lowerAssignTargetIdent`, `lowerAssignTargetDeref`, `lowerAssignTargetField`, `lowerAssignTargetIndex`

**Format tag helpers:**
- `resolveExpressionFormatTag`, `inferExpressionFormatTag`, `inferFormatTagFromValueType`
- `formatTagFromTypeNode` (static), `isIntegerFormatType` (static)
- `formatTagForLiteral` (static), `countFormatPlaceholders` (static)

**Binary op helpers:**
- `isArithmeticOperation` (static), `isComparisonOperation` (static), `isBitwiseOperation` (static)
- `resolveIntWidth`, `resolveFloatWidth`, `isFloatish`, `autoDerefForBinaryOp`

**Const helpers:**
- `lowerConstBinding`, `lookupConst`, `bindConst`, `currentConstScope`, `cloneConstScopes`
- `lowerExpression`, `lowerExpressionWithExpected`, `getExpressionVisitor`

**Value helpers:**
- `locals` state + `bindLocalValue`, `cloneLocals`, `restoreLocals`
- `registerEnumTypeMetadata`
- `defaultValueForType`, `unitValue`
- `loweredInst` (static), `loweredUnit`, `loweredValue`
- `peekExpectedValueType`, `resolveExpectedOptionPayloadType`, `resolveResultOkType`, `resolveResultErrType`, `resolveExpectedResultType`

Expected change: `lower_module.ts` shrinks by ~1,700 lines; `lower_expr.ts` grows to ~1,700 lines.

### Slice 4 (#26): Extract control-flow lowering into `lower_control_flow.ts`

Move these methods from `AstToSsaCtx`:

- `lowerIf`, `terminateIfBranches`
- `lowerLoop`, `lowerWhile`
- `lowerBreak`, `lowerContinue`
- `lowerReturn`
- `lowerMatchExpr`, `buildMatchCases`
- `resolveLiteralPatternValue`, `resolveStructPatternTag`
- `lowerMatchArms`, `lowerMatchArmBodies`
- `bindMatchArmPattern`, `bindStructPatternPayload`
- `createMergeBlock`, `mergeBlockArgs`, `mergeBlockResultValue`
- `resolveMergeResultType`, `connectMergePredecessors`
- `sealAllBlocks`
- `currentBlockValue`, `currentBlockId`, `isCurrentBlockTerminated`, `currentTypeKind`

`LoweringCfgCtx` already has a `lowerExpression` callback field — this lets CFG functions recurse into expression lowering without importing expression-specific types.

Expected change: `lower_module.ts` shrinks by ~400 lines; `lower_control_flow.ts` grows to ~400 lines.

### Slice 5 (#27): Extract closure lowering into `lower_closure.ts`

Move from `AstToSsaCtx`:

- `lowerClosure`, `lowerNonCapturingClosure`, `lowerClosureFunction`
- `collectFreeVars`
- `inferParamTypeFromBody`, `resolveClosureParamType`, `resolveClosureReturnType`, `inferExprType`
- Module-level `closureCounter` (already at module level, line 213)

The fresh `IRBuilder` pattern is already in `lowerNonCapturingClosure` (line 3034: `new AstToSsaCtx(options)` creates a fresh builder). After extraction, this becomes a standalone call to create a fresh `IRBuilder()` + `lowerClosureFunction(...)`.

Expected change: `lower_module.ts` shrinks by ~250 lines; `lower_closure.ts` grows to ~250 lines.

### Slice 6 (#28): Finish extraction, clean up `lower_module.ts`

After slices 3–5, `AstToSsaCtx` should only hold the orchestrator methods:

- `lowerFunction`, `getLowerableParams`, `startFunction`, `bindFunctionParams`
- `registerSyntheticFunctionId`, `requireFunctionId`
- `seedFunctionIds`
- `lowerModuleItem`, `lowerOwnedFunction`
- `lowerImplMethods`, `lowerTraitImplMethods`
- `ensureImplStructMetadata`, `rewriteSelfInMethod`
- `convertToInitialConsts`, `toLoweringBinding`
- Top-level: `deriveLoweringMaps`, `lowerAstModuleToSsa`, `lowerAstToSsa`
- Top-level: `collectGenericItems`, `collectAndMonomorphize`, `inferCallSiteTypeArgs`, `inferLiteralType`

The `AstToSsaCtx` class itself can optionally be replaced with a plain context object and free functions.

Cleanups:
- Delete `BuilderSnapshot` from `types.ts` (dead code since slice 2)
- Update `CONTEXT.md` sub-module table to reflect actual line counts
- Ensure `ModuleMetadata` import in `lower_module.ts` is only used by `deriveLoweringMaps`
- Close GitHub issues #22, #24, #25, #26, #27, #28

## Success criteria (remaining)

1. `lower_expr.ts` contains expression + statement lowering implementation (~1,700 lines)
2. `lower_control_flow.ts` contains CFG lowering implementation (~400 lines)
3. `lower_closure.ts` contains closure lowering implementation (~250 lines)
4. `lower_module.ts` contains only the orchestrator (~400 lines)
5. `compile.ts` imports from the new modules; passes `LoweringInput` (already done)
6. `LoweredValue { id, ty }` is universal return type (already done)
7. `resolveValueType`, `handleInstructionId`, snapshot/restore do not exist (already done)
8. `BuilderSnapshot` type removed from `types.ts`
9. `FormatTag` defined once in `lowering/types.ts` (already done)
10. All lowering functions receive `IRBuilder` as explicit argument
11. Each sub-module has a sliced context interface (interfaces exist; must be used)
12. `bun test tests/compile.test.ts tests/examples.test.ts` passes
13. `bun lint` passes on all modified files
14. No behavior changes — emitted LLVM IR is identical to baseline

## Test strategy

### During extraction

- **Regression gate**: `PATH="/root/.bun/bin:$PATH" bun test tests/compile.test.ts tests/examples.test.ts` must pass after every method is moved
- **Extract one method at a time**, verify, commit
- **No new tests during extraction** — the structural change is the deliverable

### After extraction

New unit tests for each sub-module:
- `type_translation.test.ts` — pure function assertions
- `lower_expr.test.ts` — expression lowering assertions
- `lower_control_flow.test.ts` — CFG construction assertions
- `lower_closure.test.ts` — closure lowering assertions
- `lower_module.test.ts` — integration assertions

## Skills an agent should load

- **`tdd`** — if a method extraction causes test failures, work red-green-refactor on the specific method
- **`diagnose`** — if the regression gate fails and the cause is unclear
- **`grill-with-docs`** — if any design decision needs revisiting against the lowering domain language in `CONTEXT.md`

## Reading order

1. `CONTEXT-MAP.md` — overall context map
2. `src/passes/lowering/CONTEXT.md` — lowering domain language and implementation decisions
3. `src/passes/CONTEXT.md` — passes context (inference, borrow, monomorphization)
4. `src/ir/CONTEXT.md` — SSA IR context
5. `src/parse/CONTEXT.md` — parsing context
6. `src/llvm/CONTEXT.md` — LLVM emission context
7. This file (`PLAN.md`)
8. The PRD on GitHub Issues ([#22](https://github.com/May1a/jsrust/issues/22))

## Out of scope

- Writing unit tests for new sub-modules (follow-up work)
- Adding new language features
- Changing the IR model or builder interface
- Changing the LLVM emission, printer, or toolchain
- Adding capture-supporting closures
- Changing parsing or inference
