# JSRust - Rust compiler in JavaScript

A Rust compiler written in pure JavaScript with no dependencies.
Uses a custom C backend with a clang-built wasm run-path for frontend execution.

## Plans

See `plans/README.md` for the current planning structure.

- Current active/future planning tracks:
  - `plans/active/01-prepare-backend.md`
  - `plans/active/02-compiler-progress.md`
  - `plans/active/03-new-backend.md`
  - `plans/future/01-node-addon-availability.md`
- Historical plans are archived in `plans/old/`.
- Backend workspace plans (submodule-prep):
  - `backend/plans/README.md`
  - `backend/plans/00-master-implementation-plan.md`
  - `backend/plans/01-prepare-backend.md`
  - `backend/plans/02-backend-scaffold-and-build.md`
  - `backend/plans/03-binary-ir-reader.md`
  - `backend/plans/04-ir-interpreter-core.md`
  - `backend/plans/05-ir-interpreter-runtime-model.md`
  - `backend/plans/06-driver-cli-artifacts.md`
  - `backend/plans/07-testing-conformance-ci.md`
  - `backend/plans/08-libc-overhaul-plan.md`
  - `backend/plans/future/01-wasm-codegen-core.md`
  - `backend/plans/future/02-wasm-data-memory-abi.md`
  - `backend/plans/STATUS.md`

## Plan Status

- active/01-prepare-backend.md complete
- active/02-compiler-progress.md initialized
- active/03-new-backend.md in progress (JS wasm run-path integration wired)
- plans/future/01-node-addon-availability.md deferred (non-priority)
- backend/plans/00-master-implementation-plan.md overhauled (interpreter-first)
- backend/plans/01-prepare-backend.md copied baseline
- backend/plans/02-backend-scaffold-and-build.md implemented (initial)
- backend/plans/03-binary-ir-reader.md implemented (initial)
- backend/plans/04-ir-interpreter-core.md implemented (initial)
- backend/plans/05-ir-interpreter-runtime-model.md implemented (initial)
- backend/plans/06-driver-cli-artifacts.md implemented (initial + JS wasm adapter integration)
- backend/plans/07-testing-conformance-ci.md implemented (initial local suite + conditional JS integration tests)
- backend/plans/08-libc-overhaul-plan.md started (minimal bootstrap cleanup)
- backend/plans/future/01-wasm-codegen-core.md deferred
- backend/plans/future/02-wasm-data-memory-abi.md deferred

## Important

Please keep this `AGENTS.md` up to date with the latest plans.

## Conventions

- **ES Modules** - Use `import`/`export`, not CommonJS
- No external dependencies
- JSDoc for type safety
- Pure JS, Node-compatible APIs only (easy to adapt to other environments)
- Minimal runtime requirements
- Errors-as-values error Handling (no exceptions)

## Backend C Coding Policy (Mandatory)

The backend workspace in `/Users/may/jsrust/backend` must follow these rules:

- Use WebKit-style C formatting.
- Function names must use `TypeName_action` form (example: `Arena_alloc`).
- Do not use identifiers containing `$`.
- Internal strings must be length-prefixed byte spans (`ptr + len`), not NUL-terminated strings.
- NUL-terminated strings are allowed only in short-lived host boundary adapters (CLI argv and filesystem calls).
- Reimplement required string/byte helpers locally for backend core code paths.
- Minimize allocations: use arena-first allocation with a single top-level backend context allocation and bounded arena growth.
- Use arena-backed dynamic arrays for variable-length data instead of per-object heap allocations.

Progress and status discipline:

- Update backend milestone state in `backend/plans/STATUS.md` at each milestone boundary.
- Keep this file updated when backend coding policy or plan status changes.

## Running

```bash
npm run compile <file>
```

```bash
node main.js run <file.rs>
```

Optional run flags:

- `--entry <fn>`
- `--trace --trace-out <path>`
- `--out-bin <path>`
- `--no-validate`

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
