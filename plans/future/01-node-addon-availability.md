# Future 01 - Node Addon Availability (Deferred)

Status: deferred (non-priority).

## Purpose

Make the JSRust compiler available as a Node addon in addition to the existing JavaScript and wasm-backed run paths.

## Priority and Scope

- This is intentionally not an active milestone.
- No implementation work is required now.
- Capture constraints and direction so implementation can start later without redesign.

## Constraints

- No external dependencies in core compiler/backend code paths.
- Keep error-as-value behavior stable across JS API and addon API surfaces.
- Preserve deterministic compile/run behavior and existing fixture compatibility.

## Future Deliverables

- Addon API contract for compile and run entrypoints.
- Packaging/build strategy for supported Node versions and host platforms.
- Conformance tests that compare addon behavior to existing JS/wasm paths.
- Documentation for installation, usage, and compatibility boundaries.

## Exit Criteria (When Prioritized)

- Node addon exposes stable compile + run APIs.
- Addon output/error behavior matches current canonical JS path.
- CI validates addon parity against representative fixture set.
