# HIR to SSA Lowering

**File**: `hir_to_ssa.js`

**Dependencies**: `hir.js`, `ir_builder.js`

## Task 9.1: Lowering Context
- [ ] `HirToSsaCtx` class
- [ ] Reference to IRBuilder
- [ ] Break/continue target stack
- [ ] Return block for current function

## Task 9.2: Function Lowering
- [ ] `lowerFunction(hir, builder)` -> void
- [ ] Create entry block
- [ ] Declare parameters as variables
- [ ] Lower body
- [ ] Add implicit return if needed

## Task 9.3: Block Lowering
- [ ] `lowerBlock(hir, builder)` -> ValueId | null
- [ ] Lower each statement
- [ ] Return final expression value if present

## Task 9.4: Statement Lowering
- [ ] `lowerLetStmt(stmt, builder)` -> void
- [ ] `lowerAssignStmt(stmt, builder)` -> void
- [ ] `lowerExprStmt(stmt, builder)` -> void
- [ ] `lowerReturnStmt(stmt, builder)` -> void

## Task 9.5: Expression Lowering
- [ ] `lowerExpr(hir, builder)` -> ValueId
- [ ] `lowerUnit(builder)` -> ValueId
- [ ] `lowerLiteral(hir, builder)` -> ValueId
- [ ] `lowerVar(hir, builder)` -> ValueId
- [ ] `lowerBinary(hir, builder)` -> ValueId
- [ ] `lowerUnary(hir, builder)` -> ValueId
- [ ] `lowerCall(hir, builder)` -> ValueId
- [ ] `lowerField(hir, builder)` -> ValueId
- [ ] `lowerRef(hir, builder)` -> ValueId
- [ ] `lowerDeref(hir, builder)` -> ValueId
- [ ] `lowerStruct(hir, builder)` -> ValueId
- [ ] `lowerEnum(hir, builder)` -> ValueId

## Task 9.6: Place Lowering
- [ ] `lowerPlace(hir, builder)` -> ValueId (pointer)
- [ ] Handle variable, field, index, deref places

## Task 9.7: If Expression Lowering
- [ ] `lowerIf(hir, builder)` -> ValueId
- [ ] Create then/else/merge blocks
- [ ] Branch conditionally
- [ ] Pass values through block args
- [ ] Seal blocks appropriately

## Task 9.8: Match Expression Lowering
- [ ] `lowerMatch(hir, builder)` -> ValueId
- [ ] Create decision tree with branches
- [ ] Create merge block for result
- [ ] Handle guards

## Task 9.9: Loop Expression Lowering
- [ ] `lowerLoop(hir, builder)` -> ValueId
- [ ] Create loop header and body blocks
- [ ] Set up break/continue targets
- [ ] Handle loop value (from break)

## Task 9.10: While Expression Lowering
- [ ] `lowerWhile(hir, builder)` -> ValueId
- [ ] Create header, body, exit blocks
- [ ] Set up break/continue targets
- [ ] Always returns unit

## Task 9.11: For Expression Lowering
- [ ] `lowerFor(hir, builder)` -> ValueId
- [ ] Desugar to while-like pattern
- [ ] Handle iterator pattern

## Task 9.12: Break/Continue Handling
- [ ] Track break targets and their result values
- [ ] Track continue targets
- [ ] Branch to appropriate block

## Task 9.13: Pattern Matching Code Gen
- [ ] `lowerPatternCheck(value, pattern, builder)` -> (matches: ValueId, bindings: Map)
- [ ] Generate comparison code
- [ ] Extract bindings

## Task 9.14: Struct Operations
- [ ] Generate struct construction
- [ ] Generate field access with gep

## Task 9.15: Enum Operations
- [ ] Generate enum construction with tag + data
- [ ] Generate tag extraction for matching
- [ ] Generate data extraction

## Testing
- [ ] Test file: `tests/hir_to_ssa/expressions.js`
- [ ] Test file: `tests/hir_to_ssa/control_flow.js`
- [ ] Test file: `tests/hir_to_ssa/functions.js`
- [ ] Test file: `tests/hir_to_ssa/patterns.js`
- [ ] Test file: `tests/hir_to_ssa/loops.js`
