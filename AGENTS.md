# JSRust - Rust compiler in JavaScript

A Rust compiler written in pure JavaScript with no dependencies.
Will be moved to use custom backend

## Plans

See `plans/README.md` for the current planning structure.

- Current active/future planning tracks:
  - `plans/future/01-new-backend.md`
  - `plans/active/01-prepare-backend.md`
  - `plans/active/02-compiler-progress.md`
- Historical plans are archived in `plans/old/`.

## Plan Status

- future/01-new-backend.md not started
- active/01-prepare-backend.md complete
- active/02-compiler-progress.md initialized

## Important

Please keep this `AGENTS.md` up to date with the latest plans.

## Conventions

- **ES Modules** - Use `import`/`export`, not CommonJS
- No external dependencies
- JSDoc for type safety
- Pure JS, Node-compatible APIs only (easy to adapt to other environments)
- Minimal runtime requirements
- Errors-as-values error Handling (no exceptions)

## Running

```bash
npm run compile <file>
```

## Testing

```bash
npm run test
```

## Examples

- Simple Rust examples live in `examples/`
- The test suite compiles every `examples/*.rs` file via `tests/examples.js`

## TypeChecking (important)

```bash
npm run typecheck
```

## Tokenizer

The tokenizer emits tokens with the following structure:

```javascript
{
  type: number,    // TokenType enum value
  value: string,   // Raw text
  line: number,    // 1-based line number
  column: number   // 1-based column number
}
```

### Current Token Types

- Keywords: `fn`, `let`, `const`, `static`, `true`, `false`, `type`, `use`, `pub`, `enum`, `struct`, `unsafe`, `if`, `match`, `impl`, `mod`, `return`, `else`, `for`, `while`, `loop`, `self`
- Delimiters: `(`, `)`, `[`, `]`, `{`, `}`, `,`, `;`, `:`, `.`
- Operators: `+`, `-`, `*`, `/`, `%`, `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`, `&`, `|`, `^`
- Literals: integers, floats, strings
- Identifiers: alphanumeric + underscore
- Comments are discarded

### Error Handling

Invalid input produces `Invalid` tokens rather than throwing errors.
