# Parser Implementation

**File**: `parser.js`

**Dependencies**: `tokenizer.js`, `ast.js`

## Task 2.1: Parser Infrastructure
- [ ] Define `ParseError` type with message, span, expected/found
- [ ] Define `ParserState` with tokens, pos, errors
- [ ] Implement `peek()`, `advance()`, `expect()`, `check()`
- [ ] Implement error recovery helpers
- [ ] Implement `Result<T, ParseError[]>` pattern

## Task 2.2: Token Utilities
- [ ] `matchToken(type)` - consume if matches
- [ ] `expectToken(type, message)` - consume or error
- [ ] `skipToRecovery(tokenTypes)` - error recovery
- [ ] `currentSpan()` - get current source location

## Task 2.3: Literal Parsing
- [ ] `parseInteger()` - handle decimal, hex, octal, binary
- [ ] `parseFloat()` - handle exponent notation
- [ ] `parseString()` - handle escapes
- [ ] `parseChar()` - single character literals
- [ ] `parseBool()` - true/false keywords

## Task 2.4: Expression Parsing (Pratt Parser)
- [ ] Define operator precedence table
- [ ] `parseExpr(minPrec)` - main entry
- [ ] `parseAtom()` - literals, identifiers, parens
- [ ] `parsePostfix(expr)` - .field, [index], (args)
- [ ] `parsePrefix()` - unary operators

## Task 2.5: Statement Parsing
- [ ] `parseStmt()` - dispatch to statement types
- [ ] `parseLetStmt()` - let bindings with optional type
- [ ] `parseExprStmt()` - expression followed by semicolon
- [ ] `parseItemStmt()` - nested items

## Task 2.6: Item Parsing
- [ ] `parseItem()` - dispatch to item types
- [ ] `parseFnItem()` - function definitions
- [ ] `parseStructItem()` - struct definitions
- [ ] `parseEnumItem()` - enum definitions
- [ ] `parseModItem()` - module definitions
- [ ] `parseUseItem()` - use declarations

## Task 2.7: Pattern Parsing
- [ ] `parsePattern()` - main entry
- [ ] `parseIdentPat()` - identifier patterns
- [ ] `parseLiteralPat()` - literal patterns
- [ ] `parseStructPat()` - struct destructuring
- [ ] `parseTuplePat()` - tuple destructuring
- [ ] `parseOrPat()` - alternative patterns

## Task 2.8: Type Parsing
- [ ] `parseType()` - main entry
- [ ] `parseNamedType()` - simple type names
- [ ] `parseTupleType()` - tuple types
- [ ] `parseArrayType()` - array types [T; N]
- [ ] `parseRefType()` - reference types
- [ ] `parseFnType()` - function pointer types

## Task 2.9: Control Flow Parsing
- [ ] `parseIfExpr()` - if/else expressions
- [ ] `parseMatchExpr()` - match expressions
- [ ] `parseBlockExpr()` - block expressions
- [ ] `parseLoopExpr()` - loop expressions
- [ ] `parseWhileExpr()` - while expressions
- [ ] `parseForExpr()` - for expressions

## Task 2.10: Module Parsing
- [ ] `parseModule()` - top-level entry point
- [ ] Handle end-of-file
- [ ] Collect all top-level items

## Testing
- [ ] Test file: `tests/parser/expressions.js`
- [ ] Test file: `tests/parser/statements.js`
- [ ] Test file: `tests/parser/items.js`
- [ ] Test file: `tests/parser/patterns.js`
- [ ] Test file: `tests/parser/types.js`
- [ ] Test file: `tests/parser/errors.js`
