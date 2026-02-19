# AST Node Definitions

**File**: `ast.js`

**Dependencies**: None

## Task 1.1: Base AST Structure

- [x] Define `Span` type (line, column, start, end)
- [x] Define `Node` base with span property
- [x] Export all AST types

## Task 1.2: Expression Nodes

- [x] `LiteralExpr` - int, float, bool, string, char
- [x] `IdentifierExpr` - variable names
- [x] `BinaryExpr` - a + b, a && b, etc.
- [x] `UnaryExpr` - !a, -a, \*a, &a
- [x] `CallExpr` - foo(a, b)
- [x] `FieldExpr` - a.field
- [x] `IndexExpr` - a[i]
- [x] `AssignExpr` - a = b

## Task 1.3: Control Flow Nodes

- [x] `IfExpr` - if/else with optional else
- [x] `MatchExpr` - pattern matching
- [x] `BlockExpr` - { stmts; expr? }
- [x] `ReturnExpr` - return value
- [x] `BreakExpr` - break with optional value
- [x] `ContinueExpr` - continue
- [x] `LoopExpr` - loop { }
- [x] `WhileExpr` - while cond { }
- [x] `ForExpr` - for pat in iter { }

## Task 1.4: Type-Related Nodes

- [x] `PathExpr` - a::b::c
- [x] `StructExpr` - Foo { x: 1 }
- [x] `RangeExpr` - a..b, a..=b
- [x] `RefExpr` - &x, &mut x
- [x] `DerefExpr` - \*x

## Task 1.5: Statement Nodes

- [x] `LetStmt` - let x = expr; let x: T = expr;
- [x] `ExprStmt` - expression with semicolon
- [x] `ItemStmt` - nested item declarations

## Task 1.6: Item Nodes

- [x] `FnItem` - fn name(params) -> ret { }
- [x] `StructItem` - struct Name { fields }
- [x] `EnumItem` - enum Name { Variants }
- [x] `ModItem` - mod name { }
- [x] `UseItem` - use path::to::item

## Task 1.7: Pattern Nodes

- [x] `IdentPat` - x
- [x] `WildcardPat` - \_
- [x] `LiteralPat` - 1, "hello"
- [x] `RangePat` - 1..10
- [x] `StructPat` - Foo { x, .. }
- [x] `TuplePat` - (a, b)
- [x] `SlicePat` - [first, rest @ ..]
- [x] `OrPat` - a | b
- [x] `BindingPat` - x @ pat

## Task 1.8: Type Annotation Nodes

- [x] `NamedType` - i32, Foo
- [x] `TupleType` - (A, B)
- [x] `ArrayType` - [T; N]
- [x] `RefType` - &T, &mut T
- [x] `PtrType` - *const T, *mut T
- [x] `FnType` - fn(A) -> B
- [x] `GenericArgs` - Foo<T, U>

## Task 1.9: Module Node

- [x] `Module` - root container with items

## Testing

- [x] Unit tests verifying AST node construction
- [x] Test file: `tests/ast.js`
