# Diagnostics and Error Reporting

**File**: `diagnostics.js`

**Dependencies**: None

## Task 13.1: Source Location
- [ ] `SourceLocation` - file, line, column
- [ ] `SourceSpan` - start and end locations

## Task 13.2: Diagnostic Structure
- [ ] `Diagnostic` type
- [ ] Level: error, warning, note
- [ ] Message
- [ ] Span
- [ ] Optional related info

## Task 13.3: Diagnostic Renderer
- [ ] `renderDiagnostic(diag, source)` -> string
- [ ] Show line of code with highlight
- [ ] Show line numbers
- [ ] Show caret under error

## Task 13.4: Error Collection
- [ ] `DiagnosticCollector` class
- [ ] `addError(message, span)`
- [ ] `addWarning(message, span)`
- [ ] `addNote(message, span)`
- [ ] `hasErrors()` -> boolean
- [ ] `getDiagnostics()` -> Diagnostic[]

## Task 13.5: Result Type
- [ ] `Result<T, E>` type with Ok/Err
- [ ] `ok(value)` -> Result
- [ ] `err(error)` -> Result
- [ ] `isOk(result)` -> boolean
- [ ] `unwrap(result)` -> T (throws if Err)
- [ ] `unwrapOr(result, default)` -> T

## Task 13.6: Error Formatting Utilities
- [ ] `formatTypeMismatch(expected, found, span)`
- [ ] `formatUndefinedVar(name, span)`
- [ ] `formatDuplicateDef(name, span, prevSpan)`
- [ ] `formatArityMismatch(expected, found, span)`

## Task 13.7: Source Context
- [ ] `SourceContext` class
- [ ] Store source lines for rendering
- [ ] `getLine(lineNum)` -> string
- [ ] `highlightSpan(span)` -> string

## Testing
- [ ] Test file: `tests/diagnostics/rendering.js`
- [ ] Test file: `tests/diagnostics/collection.js`