# JSRust - Rust compiler in JavaScript

A Rust compiler written in pure JavaScript with no dependencies.

## Plans

See `plans/README.md` for the current implementation plans.

## Plan Status

- 02-parser.md complete
- 03-types.md complete

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
npm run compile
```

## Testing

```bash
npm run test
```

## Examples

- Simple Rust examples live in `examples/`
- The test suite compiles every `examples/*.rs` file via `tests/examples.js`

## TypeChecking

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
