# Prepare for New Backend (Immediate Plan)

## Purpose

Prepare a stable, decision-complete handoff surface for the future C backend.

## Scope

- Stabilize binary IR contract and version behavior.
- Build reproducible fixtures and conformance checks.
- Define backend submodule interface contract and failure semantics.

## Task List

1. Define and lock binary IR contract/version policy.
2. Add/verify fixture corpus of `.rs` inputs and expected binary IR artifacts.
3. Document binary schema invariants and required validation semantics.
4. Define C backend submodule interface contract (input file format, entrypoint API, error codes, output expectations).
5. Add CI-oriented conformance checks for serialize/deserialize/validate compatibility.

## Acceptance Criteria

- A versioned binary IR contract document exists and is referenced by tests.
- Fixture corpus covers representative language constructs currently supported by compiler pipeline.
- Validation expectations are documented and traceable to tests.
- A concrete backend invocation contract is written and can be implemented in C without additional design decisions.
- CI conformance checks fail on schema or compatibility regression.

## Non-Goals

- No C backend implementation in this phase.
- No optimization pass implementation in this phase.
- No expansion of language feature set unless needed to complete contract coverage.
