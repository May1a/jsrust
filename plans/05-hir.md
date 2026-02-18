# High-Level IR (HIR)

**File**: `hir.js`

**Dependencies**: `types.js`

## Task 5.1: HIR Module Structure
- [ ] `HModule` - container for items
- [ ] `HItem` - top-level items

## Task 5.2: HIR Items
- [ ] `HFnDecl` - function with params, return type, body
- [ ] `HStructDecl` - struct with fields
- [ ] `HEnumDecl` - enum with variants

## Task 5.3: HIR Blocks
- [ ] `HBlock` - sequence of statements, optional final expr

## Task 5.4: HIR Statements
- [ ] `HLetStmt` - variable binding with type and init
- [ ] `HAssignStmt` - assignment to place
- [ ] `HExprStmt` - expression for side effects
- [ ] `HReturnStmt` - return with value
- [ ] `HBreakStmt` - break with optional value
- [ ] `HContinueStmt` - continue

## Task 5.5: HIR Places (assignable locations)
- [ ] `HPlace` base type
- [ ] `HVarPlace` - variable
- [ ] `HFieldPlace` - field access
- [ ] `HIndexPlace` - index access
- [ ] `HDerefPlace` - dereference

## Task 5.6: HIR Expressions
- [ ] `HUnitExpr` - ()
- [ ] `HLiteralExpr` - literal with type
- [ ] `HVarExpr` - variable reference with type
- [ ] `HBinaryExpr` - binary operation
- [ ] `HUnaryExpr` - unary operation
- [ ] `HCallExpr` - function call
- [ ] `HFieldExpr` - field access
- [ ] `HIndexExpr` - index access
- [ ] `HRefExpr` - reference creation
- [ ] `HDerefExpr` - dereference
- [ ] `HStructExpr` - struct initialization
- [ ] `HEnumExpr` - enum variant construction

## Task 5.7: HIR Control Flow
- [ ] `HIfExpr` - if/else
- [ ] `HMatchExpr` - match expression
- [ ] `HLoopExpr` - loop
- [ ] `HWhileExpr` - while loop

## Task 5.8: HIR Patterns
- [ ] `HIdentPat` - identifier
- [ ] `HWildcardPat` - _
- [ ] `HLiteralPat` - literal
- [ ] `HStructPat` - struct destructuring
- [ ] `HTuplePat` - tuple destructuring
- [ ] `HOrPat` - alternative patterns

## Task 5.9: HIR Match Arms
- [ ] `HMatchArm` - pattern, optional guard, body

## Task 5.10: HIR Utilities
- [ ] `hirToString(hir)` - for debugging
- [ ] `collectVars(hir)` - find all variables used

## Testing
- [ ] Test file: `tests/hir/construction.js`
- [ ] Test file: `tests/hir/utilities.js`
