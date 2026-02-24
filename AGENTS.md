# JSRust - Rust compiler in TypeScript

A Rust compiler written in pure TypeScript with no dependencies.

## Plans

See `plans/README.md` for the current planning structure.

## Plan Status

- `plans/STATUS.md`

## Running

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

- Use `npm run test:update-examples` to regenerate changed/missing IR snapshots in `examples/expected/`.
- Simple Rust examples live in `examples/`
- The test suite compiles every `examples/*.rs` file via `tests/examples.js`
