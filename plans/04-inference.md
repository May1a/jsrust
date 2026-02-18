# Type Inference

**File**: `inference.js`

**Dependencies**: `types.js`, `type_context.js`, `ast.js`

## Task 4.1: Inference Entry Point
- [x] `inferModule(ctx, module)` - top-level entry
- [x] Run in multiple passes

## Task 4.2: Declaration Gathering Pass
- [x] Collect all struct definitions
- [x] Collect all enum definitions
- [x] Collect all function signatures
- [x] Register in type context

## Task 4.3: Expression Inference
- [x] `inferExpr(ctx, expr)` - main entry
- [x] `inferLiteral(ctx, literal)` - integer defaults to i32, float to f64
- [x] `inferIdentifier(ctx, ident)` - lookup in scope
- [x] `inferBinary(ctx, binary)` - operators
- [x] `inferUnary(ctx, unary)` - !, -, *, &
- [x] `inferCall(ctx, call)` - function calls
- [x] `inferField(ctx, field)` - field access
- [x] `inferIndex(ctx, index)` - index access

## Task 4.4: Control Flow Inference
- [x] `inferIf(ctx, ifExpr)` - both branches must unify
- [x] `inferMatch(ctx, matchExpr)` - all arms must unify
- [x] `inferBlock(ctx, block)` - type of final expr
- [x] `inferLoop(ctx, loopExpr)` - can be any type (break)
- [x] `inferWhile(ctx, whileExpr)` - always unit

## Task 4.5: Statement Checking
- [x] `checkStmt(ctx, stmt)`
- [x] `checkLetStmt(ctx, letStmt)` - infer or check type
- [x] `checkExprStmt(ctx, exprStmt)`
- [x] `checkReturnStmt(ctx, returnStmt)` - match fn return type

## Task 4.6: Function Body Checking
- [x] `checkFnBody(ctx, fnDecl)`
- [x] Set up parameter bindings
- [x] Track current function for return checking

## Task 4.7: Pattern Type Checking
- [x] `inferPattern(ctx, pattern)` - get pattern type
- [x] `checkPattern(ctx, pattern, expectedType)` - check against type
- [x] Bind pattern variables in scope

## Task 4.8: Unification
- [x] `unify(ctx, t1, t2)` - make types equal
- [x] Handle type variables
- [x] Occurs check (prevent infinite types)
- [x] Record substitutions

## Task 4.9: Substitution
- [x] `substitute(ctx, type)` - replace type vars with bounds
- [x] `applySubst(ctx)` - apply to entire function

## Task 4.10: Error Reporting
- [x] `TypeError` type with message, span, notes
- [x] Type mismatch errors
- [x] Unbound variable errors
- [x] Arity mismatch errors
- [x] Field not found errors

## Task 4.11: Inference Finalization
- [x] Resolve all remaining type variables
- [x] Report ambiguous type errors
- [x] Substitute concrete types everywhere

## Testing
- [x] Test file: `tests/inference/expressions.js`
- [x] Test file: `tests/inference/statements.js`
- [x] Test file: `tests/inference/functions.js`
- [x] Test file: `tests/inference/structs.js`
- [x] Test file: `tests/inference/enums.js`
- [x] Test file: `tests/inference/references.js`
- [x] Test file: `tests/inference/errors.js`
