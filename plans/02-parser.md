# Parser Implementation

**File**: `parser.js`

**Dependencies**: `tokenizer.js`, `ast.js`

## Task 2.1: Parser Infrastructure
- [x] Define `ParseError` type with message, span, expected/found
- [x] Define `ParserState` with tokens, pos, errors
- [x] Implement `peek()`, `advance()`, `expect()`, `check()`
- [x] Implement error recovery helpers
- [x] Implement `Result<T, ParseError[]>` pattern

## Task 2.2: Token Utilities
- [x] `matchToken(type)` - consume if matches
- [x] `expectToken(type, message)` - consume or error
- [x] `skipToRecovery(tokenTypes)` - error recovery
- [x] `currentSpan()` - get current source location

## Task 2.3: Literal Parsing
- [x] `parseInteger()` - handle decimal, hex, octal, binary
- [x] `parseFloat()` - handle exponent notation
- [x] `parseString()` - handle escapes
- [x] `parseChar()` - single character literals
- [x] `parseBool()` - true/false keywords

## Task 2.4: Expression Parsing (Pratt Parser)
- [x] Define operator precedence table
- [x] `parseExpr(minPrec)` - main entry
- [x] `parseAtom()` - literals, identifiers, parens
- [x] `parsePostfix(expr)` - .field, [index], (args)
- [x] `parsePrefix()` - unary operators

## Task 2.5: Statement Parsing
- [x] `parseStmt()` - dispatch to statement types
- [x] `parseLetStmt()` - let bindings with optional type
- [x] `parseExprStmt()` - expression followed by semicolon
- [x] `parseItemStmt()` - nested items

## Task 2.6: Item Parsing
- [x] `parseItem()` - dispatch to item types
- [x] `parseFnItem()` - function definitions
- [x] `parseStructItem()` - struct definitions
- [x] `parseEnumItem()` - enum definitions
- [x] `parseModItem()` - module definitions
- [x] `parseUseItem()` - use declarations

## Task 2.7: Pattern Parsing
- [x] `parsePattern()` - main entry
- [x] `parseIdentPat()` - identifier patterns
- [x] `parseLiteralPat()` - literal patterns
- [x] `parseStructPat()` - struct destructuring
- [x] `parseTuplePat()` - tuple destructuring
- [x] `parseOrPat()` - alternative patterns

## Task 2.8: Type Parsing
- [x] `parseType()` - main entry
- [x] `parseNamedType()` - simple type names
- [x] `parseTupleType()` - tuple types
- [x] `parseArrayType()` - array types [T; N]
- [x] `parseRefType()` - reference types
- [x] `parseFnType()` - function pointer types

## Task 2.9: Control Flow Parsing
- [x] `parseIfExpr()` - if/else expressions
- [x] `parseMatchExpr()` - match expressions
- [x] `parseBlockExpr()` - block expressions
- [x] `parseLoopExpr()` - loop expressions
- [x] `parseWhileExpr()` - while expressions
- [x] `parseForExpr()` - for expressions

## Task 2.10: Module Parsing
- [x] `parseModule()` - top-level entry point
- [x] Handle end-of-file
- [x] Collect all top-level items

## Testing
- [x] Test file: `tests/parser/expressions.js`
- [x] Test file: `tests/parser/statements.js`
- [x] Test file: `tests/parser/items.js`
- [x] Test file: `tests/parser/patterns.js`
- [x] Test file: `tests/parser/types.js`
- [x] Test file: `tests/parser/errors.js`
