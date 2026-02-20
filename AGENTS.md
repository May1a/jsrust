# JSRust - Rust compiler in JavaScript

A Rust compiler written in pure JavaScript with no dependencies.
Uses a custom C backend with a clang-built wasm run-path for frontend execution.

## Plans

See `plans/README.md` for the current planning structure.

- Current active/future planning tracks:
  - `plans/active/01-compiler-progress.md`
  - `plans/active/02-new-backend.md`
  - `plans/active/03-relaxed-borrow-model.md`
  - `plans/future/01-node-addon-availability.md`
  - `plans/future/02-untrusted-compatibility.md`
- Historical plans are archived in `plans/old/`.
- Backend workspace plans (submodule-prep):
  - `backend/plans/README.md`
  - `backend/plans/00-master-implementation-plan.md`
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

- active/01-compiler-progress.md updated (IR v2 string-literal pool + backend format-print milestone captured; module support milestone captured: inline/file modules + simple `use ... as ...` path resolution; inherent impl milestone captured: `impl Struct` parsing + receiver/static method dispatch + `Self` in methods; simplified trait milestone captured: `trait` parsing + `impl Trait for Type` + inherent-first trait method dispatch + strict `(Trait, Type)` uniqueness; compiler-builtin derive milestone captured: `#[derive(Clone, Copy, Debug)]` struct expansion; generic function milestone captured: generic fn signatures + turbofish call syntax + single-instance generic call binding + bounds/`where` semantic hard-errors; relaxed borrow/lifetime milestone captured: lifetime syntax erasure + borrow-lite dangling-escape checks + stable address-taken local lowering)
- active/02-new-backend.md in progress (JS wasm run-path integration wired; binary IR v2 + formatter builtins integrated; `run --codegen-wasm` generated-wasm in-memory execution integrated; parity milestone expanded: pointer/memory/aggregate lowering + data/memory sections + dynamic format host writers + non-hanging example parity matrix)
- active/03-relaxed-borrow-model.md implemented (lifetime tokenization + parser lifetime erasure + borrow-lite pass integration + stable reference-slot lowering + focused tests)
- plans/future/01-node-addon-availability.md deferred (non-priority)
- plans/future/02-untrusted-compatibility.md deferred (`third_party/untrusted` submodule added; compatibility milestone tracked)
- backend/plans/00-master-implementation-plan.md overhauled (interpreter-first)
- backend/plans/02-backend-scaffold-and-build.md implemented (initial)
- backend/plans/03-binary-ir-reader.md implemented (initial + IR v2 literal-section ingest)
- backend/plans/04-ir-interpreter-core.md implemented (initial + formatter builtins + `sconst` execution)
- backend/plans/05-ir-interpreter-runtime-model.md implemented (initial)
- backend/plans/06-driver-cli-artifacts.md implemented (initial + JS wasm adapter integration; formatter run-path active)
- backend/plans/07-testing-conformance-ci.md implemented (initial local suite + conditional JS integration tests + v2 fixture corpus)
- backend/plans/08-libc-overhaul-plan.md started (minimal bootstrap cleanup)
- backend/plans/future/01-wasm-codegen-core.md in progress (expanded parity-oriented wasm emission: pointer/memory/aggregate lowering + data/memory sections + additive dynamic format writer imports)
- backend/plans/future/02-wasm-data-memory-abi.md in progress (initial linear-memory/global/data ABI + string data segments + aggregate layout bridge)

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
- `--codegen-wasm`
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

- Keywords: `fn`, `let`, `const`, `static`, `true`, `false`, `type`, `use`, `pub`, `enum`, `struct`, `trait`, `unsafe`, `if`, `match`, `impl`, `mod`, `return`, `else`, `for`, `while`, `loop`, `where`, `self`
- Delimiters: `(`, `)`, `[`, `]`, `{`, `}`, `,`, `;`, `:`, `.`
- Operators: `+`, `-`, `*`, `/`, `%`, `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`, `&`, `|`, `^`
- Literals: integers, floats, strings, lifetime markers (`'a`, `'_`)
- Identifiers: alphanumeric + underscore
- Comments are discarded

### Error Handling

Invalid input produces `Invalid` tokens rather than throwing errors.
