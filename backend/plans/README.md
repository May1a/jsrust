# Backend Plans Index

This plan set is execution-focused and decision-complete.

## Global Constraints

- Primary immediate deliverable: IR interpreter/executor
- No external dependencies
- Deterministic behavior (errors/results/log ordering)
- Input format: JSRust binary IR v1

## Active (Immediate) Plans

- `00-master-implementation-plan.md`: master sequencing, gates, and done criteria
- `01-prepare-backend.md`: copied upstream prep baseline
- `02-backend-scaffold-and-build.md`: project scaffold, build, errors, IO, determinism
- `03-binary-ir-reader.md`: strict binary IR ingest and validation gate
- `04-ir-interpreter-core.md`: instruction and control-flow interpreter core
- `05-ir-interpreter-runtime-model.md`: runtime state, memory model, call semantics
- `06-driver-cli-artifacts.md`: execution CLI/API contract and result handling
- `07-testing-conformance-ci.md`: fixture execution matrix, negative tests, CI gates
- `08-libc-overhaul-plan.md`: cleanup track for local `libc.h` bootstrap
- `STATUS.md`: execution status tracker

## Future Plans

- `future/01-wasm-codegen-core.md`: deferred wasm binary codegen
- `future/02-wasm-data-memory-abi.md`: deferred wasm memory/data/ABI track

## Execution Order (Immediate)

1. `00-master-implementation-plan.md`
2. `02-backend-scaffold-and-build.md`
3. `03-binary-ir-reader.md`
4. `04-ir-interpreter-core.md`
5. `05-ir-interpreter-runtime-model.md`
6. `06-driver-cli-artifacts.md`
7. `07-testing-conformance-ci.md`
8. `08-libc-overhaul-plan.md`

`01-prepare-backend.md` remains the upstream prep baseline and reference.
