# An entirely new Backend

- It should follow the current structure of the IR
- It will be entirely in C (for maximum portability and speed)
- It will be used and improved in the future, it should take the **binary** version of the IR
- Include an overview of the current codebase so an agent/human can have an ideal overview over the important parts, which are especially relevant for implementing a backend
- This will then be included as a git submodule

## Relevant Codebase Overview

- `/Users/may/jsrust/main.js`: orchestrates the compile pipeline from parsing through IR generation and validation.
- `/Users/may/jsrust/hir.js`: defines HIR node model and helper constructors used by lowering and SSA conversion.
- `/Users/may/jsrust/lowering.js`: lowers AST into HIR, including control flow and pattern structures.
- `/Users/may/jsrust/hir_to_ssa.js`: lowers HIR functions into SSA IR.
- `/Users/may/jsrust/ir.js`: SSA IR core model, IDs, and module/function/block data structures.
- `/Users/may/jsrust/ir_builder.js`: builder utilities for constructing SSA form.
- `/Users/may/jsrust/ir_serialize.js`: binary IR serialization implementation.
- `/Users/may/jsrust/ir_deserialize.js`: binary IR deserialization implementation.
- `/Users/may/jsrust/ir_validate.js`: IR structural and semantic validation passes.
- `/Users/may/jsrust/ir_printer.js`: human-readable textual IR output for debugging.
- `/Users/may/jsrust/tests/binary/*` and `/Users/may/jsrust/tests/e2e.js`: compatibility and end-to-end behavior checks relevant for backend confidence.

## Integration Shape (Implemented Initial)

- Backend implementation lives in `/Users/may/jsrust/backend` as submodule-prep workspace.
- JSRust now emits binary IR and invokes backend via:
  - `/Users/may/jsrust/main.js` `run` subcommand
  - `/Users/may/jsrust/backend_runner.js` adapter (resolution/build/run)
- Backend binary resolution order is locked (`--backend-bin`, `JSRUST_BACKEND_BIN`, default backend path) with auto-build fallback for default path.
- Compatibility is enforced by:
  - `/Users/may/jsrust/tests/binary/conformance.js`
  - `/Users/may/jsrust/tests/backend/integration.js` (conditional in `npm run test`)

## Next Integration Steps

- Move backend workspace into dedicated git submodule when repository split is finalized.
- Expand integration tests for entrypoint variants and trace determinism assertions.
- Keep root/backend status files synchronized at each milestone boundary.
