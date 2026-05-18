# JSRust - Rust compiler in TypeScript

## Instructions

- After working on a file run:

```bash
bun lint <file>
```

### Error handling and control-flow

- Use the `Result` type from `better-result`
- Use `match` from `ts-pattern` for control flow (avoid ternaries)

Ensure that a high level of code quality is enforced.
DO **NOT** take shortcuts of any kind

Code which does not pass the lints is **NOT** working code (it **is** a bug)

### IF YOU SEE A BUG:

- It does **NOT** matter if it is unrelated to your task
- You **HAVE** to fix it

## Frontend Type-Safety Constraints

- Write typesafe code
- **NEVER** use an `eslint-disable` comment (if you see one, **remove** it)
- **NEVER** modify `oxlint.config.ts`

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `github.com:May1a/jsrust`. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — all five canonical labels used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
