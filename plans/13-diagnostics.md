# Diagnostics and Error Reporting

**File**: `diagnostics.js`

**Dependencies**: None

## Task 13.1: Source Location
- [x] `SourceLocation` - file, line, column
- [x] `SourceSpan` - start and end locations

## Task 13.2: Diagnostic Structure
- [x] `Diagnostic` type
- [x] Level: error, warning, note
- [x] Message
- [x] Span
- [x] Optional related info

## Task 13.3: Diagnostic Renderer
- [x] `renderDiagnostic(diag, source)` -> string
- [x] Show line of code with highlight
- [x] Show line numbers
- [x] Show caret under error

## Task 13.4: Error Collection
- [x] `DiagnosticCollector` class
- [x] `addError(message, span)`
- [x] `addWarning(message, span)`
- [x] `addNote(message, span)`
- [x] `hasErrors()` -> boolean
- [x] `getDiagnostics()` -> Diagnostic[]

## Task 13.5: Result Type
- [x] `Result<T, E>` type with Ok/Err
- [x] `ok(value)` -> Result
- [x] `err(error)` -> Result
- [x] `isOk(result)` -> boolean
- [x] `unwrap(result)` -> T (throws if Err)
- [x] `unwrapOr(result, default)` -> T

## Task 13.6: Error Formatting Utilities
- [x] `formatTypeMismatch(expected, found, span)`
- [x] `formatUndefinedVar(name, span)`
- [x] `formatDuplicateDef(name, span, prevSpan)`
- [x] `formatArityMismatch(expected, found, span)`

## Task 13.7: Source Context
- [x] `SourceContext` class
- [x] Store source lines for rendering
- [x] `getLine(lineNum)` -> string
- [x] `highlightSpan(span)` -> string

## Testing
- [x] Test file: `tests/diagnostics/rendering.js`
- [x] Test file: `tests/diagnostics/collection.js`
