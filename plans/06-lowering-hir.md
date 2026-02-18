# AST to HIR Lowering

**File**: `lowering.js`

**Dependencies**: `ast.js`, `hir.js`, `types.js`

## Task 6.1: Lowering Context
- [ ] `LoweringCtx` class
- [ ] Track current function
- [ ] Error collection
- [ ] Variable name resolution

## Task 6.2: Module Lowering
- [ ] `lowerModule(ast, types)` -> HModule
- [ ] Process all items in order

## Task 6.3: Item Lowering
- [ ] `lowerFnItem(fn, types)` -> HFnDecl
- [ ] `lowerStructItem(struct)` -> HStructDecl
- [ ] `lowerEnumItem(enum)` -> HEnumDecl

## Task 6.4: Statement Lowering
- [ ] `lowerStmt(stmt, types)` -> HStmt
- [ ] `lowerLetStmt(let, types)` -> HLetStmt
- [ ] `lowerAssignStmt(assign)` -> HAssignStmt
- [ ] `lowerExprStmt(expr)` -> HExprStmt

## Task 6.5: Expression Lowering
- [ ] `lowerExpr(expr, types)` -> HExpr
- [ ] `lowerLiteral(lit)` -> HLiteralExpr
- [ ] `lowerBinary(binary, types)` -> HBinaryExpr
- [ ] `lowerUnary(unary, types)` -> HUnaryExpr
- [ ] `lowerCall(call, types)` -> HCallExpr
- [ ] `lowerField(field, types)` -> HFieldExpr
- [ ] `lowerRef(ref, types)` -> HRefExpr
- [ ] `lowerDeref(deref, types)` -> HDerefExpr
- [ ] `lowerStructInit(struct, types)` -> HStructExpr

## Task 6.6: Control Flow Lowering
- [ ] `lowerBlock(block, types)` -> HBlock
- [ ] `lowerIf(if, types)` -> HIfExpr
- [ ] `lowerMatch(match, types)` -> HMatchExpr
- [ ] `lowerLoop(loop, types)` -> HLoopExpr
- [ ] `lowerWhile(while, types)` -> HWhileExpr

## Task 6.7: Pattern Lowering
- [ ] `lowerPattern(pat)` -> HPattern
- [ ] `lowerIdentPat(ident)` -> HIdentPat
- [ ] `lowerStructPat(struct)` -> HStructPat
- [ ] `lowerTuplePat(tuple)` -> HTuplePat
- [ ] `lowerOrPat(or)` -> HOrPat

## Task 6.8: Place Extraction
- [ ] `extractPlace(expr)` -> HPlace | null
- [ ] Handle assign targets
- [ ] Error on invalid assignment targets

## Task 6.9: Desugaring
- [ ] Desugar `for` loops to `while` with iterator
- [ ] Desugar `..=` ranges to inclusive bounds
- [ ] Flatten chained comparisons

## Task 6.10: Type Annotation Propagation
- [ ] Attach inferred types to HIR nodes
- [ ] Ensure all expressions have type info

## Testing
- [ ] Test file: `tests/lowering/expressions.js`
- [ ] Test file: `tests/lowering/statements.js`
- [ ] Test file: `tests/lowering/control_flow.js`
- [ ] Test file: `tests/lowering/patterns.js`
