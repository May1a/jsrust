# Handoff: JSRust LLVM IR backend pivot

## What was done

Completed a `setup-matt-pocock-skills` run followed by a `grill-with-docs` session that produced the project's domain scaffolding and a full architectural decision tree for replacing the C/WASM runtime with LLVM IR emission.

## Artifacts (read these — don't duplicate their content)

| Artifact | Path/URL |
|---|---|
| AGENTS.md (updated) | `/root/jsrust/AGENTS.md` |
| CONTEXT.md (glossary) | `/root/jsrust/CONTEXT.md` |
| ADR-0001 (LLVM IR pivot) | `/root/jsrust/docs/adr/0001-llvm-ir-backend.md` |
| Agent skill configs | `/root/jsrust/docs/agents/` (3 files) |
| GitHub issue (full decision list) | https://github.com/May1a/jsrust/issues/20 |
| Working branch | `plan-llvm-ir-backend` (pushed) |

## Implementation order

From the decision tree in the issue:

1. **LLVM IR emission** — build `src/llvm/` with a TypeScript AST for LLVM IR (`LlvmModule`, `LlvmFunction`, etc.), serialize to `.ll` text and `.bc` bitcode. Emit `__jsrust_print` wrapper → `printf` as a stopgap.
2. **Custom IR refactor** — phi nodes, `insertvalue`/`extractvalue`/GEP, LLVM-aligned types. Touch `ir.ts`, `ir_builder.ts`, `ast_to_ssa.ts`, `ir_validate.ts`.
3. **Remove C backend** — delete `backend/`, `src/backend/`, `docs/backend/`, `ir_serialize.ts`, `ir_deserialize.ts`, `ir_printer.ts`, `ir_binary_opcode.ts`, `memory_layout.ts`, `stack_alloc.ts`, `scripts/update-expected.ts`.

## CLI target

- `bun main.ts build file.rs` — emit `.ll` + `.bc`
- `bun main.ts run file.rs` — emit + `lli` (assert success)
- `bun main.ts test file.rs` — compile `#[test]` functions, run via `lli`

## Test strategy

- Replace IR snapshot tests with `lli` execution tests (`#[expect_output]` + `#[test]`)
- Run `opt -verify` on every compilation for IR well-formedness

## Suggested skills for next session

- **`tdd`** — red-green-refactor loop for the LLVM IR AST and emitter
- **`to-issues`** — if you want to break the implementation order into smaller tickets
- **`zoom-out`** — if unfamiliar with the codebase; start by reading CONTEXT.md and the issue

## One constraint

The `plans/` directory still exists but will be deleted. Don't reference it — treat it as dead.
