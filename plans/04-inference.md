# Type Inference

**File**: `inference.js`

**Dependencies**: `types.js`, `type_context.js`, `ast.js`

## Task 4.1: Inference Entry Point
- [ ] `inferModule(ctx, module)` - top-level entry
- [ ] Run in multiple passes

## Task 4.2: Declaration Gathering Pass
- [ ] Collect all struct definitions
- [ ] Collect all enum definitions
- [ ] Collect all function signatures
- [ ] Register in type context

## Task 4.3: Expression Inference
- [ ] `inferExpr(ctx, expr)` - main entry
- [ ] `inferLiteral(ctx, literal)` - integer defaults to i32, float to f64
- [ ] `inferIdentifier(ctx, ident)` - lookup in scope
- [ ] `inferBinary(ctx, binary)` - operators
- [ ] `inferUnary(ctx, unary)` - !, -, *, &
- [ ] `inferCall(ctx, call)` - function calls
- [ ] `inferField(ctx, field)` - field access
- [ ] `inferIndex(ctx, index)` - index access

## Task 4.4: Control Flow Inference
- [ ] `inferIf(ctx, ifExpr)` - both branches must unify
- [ ] `inferMatch(ctx, matchExpr)` - all arms must unify
- [ ] `inferBlock(ctx, block)` - type of final expr
- [ ] `inferLoop(ctx, loopExpr)` - can be any type (break)
- [ ] `inferWhile(ctx, whileExpr)` - always unit

## Task 4.5: Statement Checking
- [ ] `checkStmt(ctx, stmt)`
- [ ] `checkLetStmt(ctx, letStmt)` - infer or check type
- [ ] `checkExprStmt(ctx, exprStmt)`
- [ ] `checkReturnStmt(ctx, returnStmt)` - match fn return type

## Task 4.6: Function Body Checking
- [ ] `checkFnBody(ctx, fnDecl)`
- [ ] Set up parameter bindings
- [ ] Track current function for return checking

## Task 4.7: Pattern Type Checking
- [ ] `inferPattern(ctx, pattern)` - get pattern type
- [ ] `checkPattern(ctx, pattern, expectedType)` - check against type
- [ ] Bind pattern variables in scope

## Task 4.8: Unification
- [ ] `unify(ctx, t1, t2)` - make types equal
- [ ] Handle type variables
- [ ] Occurs check (prevent infinite types)
- [ ] Record substitutions

## Task 4.9: Substitution
- [ ] `substitute(ctx, type)` - replace type vars with bounds
- [ ] `applySubst(ctx)` - apply to entire function

## Task 4.10: Error Reporting
- [ ] `TypeError` type with message, span, notes
- [ ] Type mismatch errors
- [ ] Unbound variable errors
- [ ] Arity mismatch errors
- [ ] Field not found errors

## Task 4.11: Inference Finalization
- [ ] Resolve all remaining type variables
- [ ] Report ambiguous type errors
- [ ] Substitute concrete types everywhere

## Testing
- [ ] Test file: `tests/inference/expressions.js`
- [ ] Test file: `tests/inference/statements.js`
- [ ] Test file: `tests/inference/functions.js`
- [ ] Test file: `tests/inference/structs.js`
- [ ] Test file: `tests/inference/enums.js`
- [ ] Test file: `tests/inference/references.js`
- [ ] Test file: `tests/inference/errors.js`
