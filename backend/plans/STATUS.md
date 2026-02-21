# Backend Plan Status

## Active (Immediate)

- `00-master-implementation-plan.md`: overhauled for interpreter-first execution
- `02-backend-scaffold-and-build.md`: implemented (initial)
- `03-binary-ir-reader.md`: implemented (initial + IR v2 literal-section ingest)
- `04-ir-interpreter-core.md`: implemented (initial + formatter builtins + `sconst` execution)
- `05-ir-interpreter-runtime-model.md`: implemented (initial)
- `06-driver-cli-artifacts.md`: implemented (initial + JS wasm adapter integration; frontend process-spawn path removed; formatter run-path active)
- `07-testing-conformance-ci.md`: implemented (initial local suite + conditional root integration tests + v2 fixture corpus)
- `08-libc-overhaul-plan.md`: started (minimal bootstrap cleanup)

## Future

- `future/01-wasm-codegen-core.md`: in progress (expanded parity-oriented wasm emission: pointer/memory/aggregate lowering + dynamic formatter host writers + memory export; stdlib-first Vec builtin parity landed for alloc/realloc/dealloc/copy/panic dispatch and GEP/call coercion fixes)
- `future/02-wasm-data-memory-abi.md`: in progress (initial linear-memory/global/data ABI, string literal data segments, and aggregate layout bridge landed)
