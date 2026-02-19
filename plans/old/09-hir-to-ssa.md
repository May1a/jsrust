# HIR to SSA Lowering

**File**: `hir_to_ssa.js`

**Dependencies**: `hir.js`, `ir_builder.js`

## Task 9.1: Lowering Context

- [x] `HirToSsaCtx` class
- [x] Reference to IRBuilder
- [x] Break/continue target stack
- [x] Return block for current function

## Task 9.2: Function Lowering

- [x] `lowerFunction(hir, builder)` -> void
- [x] Create entry block
- [x] Declare parameters as variables
- [x] Lower body
- [x] Add implicit return if needed

## Task 9.3: Block Lowering

- [x] `lowerBlock(hir, builder)` -> ValueId | null
- [x] Lower each statement
- [x] Return final expression value if present

## Task 9.4: Statement Lowering

- [x] `lowerLetStmt(stmt, builder)` -> void
- [x] `lowerAssignStmt(stmt, builder)` -> void
- [x] `lowerExprStmt(stmt, builder)` -> void
- [x] `lowerReturnStmt(stmt, builder)` -> void

## Task 9.5: Expression Lowering

- [x] `lowerExpr(hir, builder)` -> ValueId
- [x] `lowerUnit(builder)` -> ValueId
- [x] `lowerLiteral(hir, builder)` -> ValueId
- [x] `lowerVar(hir, builder)` -> ValueId
- [x] `lowerBinary(hir, builder)` -> ValueId
- [x] `lowerUnary(hir, builder)` -> ValueId
- [x] `lowerCall(hir, builder)` -> ValueId
- [x] `lowerField(hir, builder)` -> ValueId
- [x] `lowerRef(hir, builder)` -> ValueId
- [x] `lowerDeref(hir, builder)` -> ValueId
- [x] `lowerStruct(hir, builder)` -> ValueId
- [x] `lowerEnum(hir, builder)` -> ValueId

## Task 9.6: Place Lowering

- [x] `lowerPlace(hir, builder)` -> ValueId (pointer)
- [x] Handle variable, field, index, deref places

## Task 9.7: If Expression Lowering

- [x] `lowerIf(hir, builder)` -> ValueId
- [x] Create then/else/merge blocks
- [x] Branch conditionally
- [x] Pass values through block args
- [x] Seal blocks appropriately

## Task 9.8: Match Expression Lowering

- [x] `lowerMatch(hir, builder)` -> ValueId
- [x] Create decision tree with branches
- [x] Create merge block for result
- [x] Handle guards

## Task 9.9: Loop Expression Lowering

- [x] `lowerLoop(hir, builder)` -> ValueId
- [x] Create loop header and body blocks
- [x] Set up break/continue targets
- [x] Handle loop value (from break)

## Task 9.10: While Expression Lowering

- [x] `lowerWhile(hir, builder)` -> ValueId
- [x] Create header, body, exit blocks
- [x] Set up break/continue targets
- [x] Always returns unit

## Task 9.11: For Expression Lowering

- [x] `lowerFor(hir, builder)` -> ValueId
- [x] Desugar to while-like pattern
- [x] Handle iterator pattern

## Task 9.12: Break/Continue Handling

- [x] Track break targets and their result values
- [x] Track continue targets
- [x] Branch to appropriate block

## Task 9.13: Pattern Matching Code Gen

- [x] `lowerPatternCheck(value, pattern, builder)` -> (matches: ValueId, bindings: Map)
- [x] Generate comparison code
- [x] Extract bindings

## Task 9.14: Struct Operations

- [x] Generate struct construction
- [x] Generate field access with gep

## Task 9.15: Enum Operations

- [x] Generate enum construction with tag + data
- [x] Generate tag extraction for matching
- [x] Generate data extraction

## Testing

- [x] Test file: `tests/hir_to_ssa/expressions.js`
- [ ] Test file: `tests/hir_to_ssa/control_flow.js`
- [ ] Test file: `tests/hir_to_ssa/functions.js`
- [ ] Test file: `tests/hir_to_ssa/patterns.js`
- [ ] Test file: `tests/hir_to_ssa/loops.js`
