# 07 - Testing, Conformance, and CI Gates (Interpreter)

## Purpose

Enforce semantic compatibility and regression safety for IR interpretation behavior.

## Inputs

- root fixture corpus: `/Users/may/jsrust/tests/fixtures/backend_ir_v1/`
- root binary conformance checks: `/Users/may/jsrust/tests/binary/conformance.js`

## Deliverables

- backend-side fixture runner for execution mode
- expected-result manifest for interpreter outputs
- malformed-binary negative corpus
- deterministic behavior checks in CI

## Task Breakdown

### Task 7.1 - Execution Fixture Manifest

- define backend execution manifest:
    - input fixture file
    - entry function
    - expected success/failure class
    - expected return value (if scalar)
- keep manifest deterministic and reviewable

### Task 7.2 - Positive Execution Suite

- execute each supported fixture
- assert exit status, return value, and critical diagnostics
- ensure repeated runs are byte-for-byte identical for traces and report outputs

### Task 7.3 - Negative Binary Suite

- mutate valid binaries to create:
    - invalid magic/version
    - invalid offsets
    - truncated data
    - invalid tags/opcodes
- assert deterministic reject behavior and correct error class

### Task 7.4 - Runtime Trap Suite

- add runtime-semantic negative programs for:
    - invalid branch targets
    - divide-by-zero
    - invalid memory access
    - type mismatch use cases
- assert trap code and stable error message prefix

### Task 7.5 - CI Pipeline Gates

- build backend
- run unit tests
- run fixture execution tests
- run determinism replay tests
- fail CI on any mismatch/regression

### Task 7.6 - Compatibility Policy

- if IR version changes in root:
    - backend CI must fail until support is explicitly added
- if fixture manifest changes:
    - backend expected execution manifest review/update required

## Acceptance Criteria

- all supported fixtures execute with expected deterministic outcomes
- malformed binaries are rejected deterministically
- runtime trap classes remain stable
- CI blocks semantic or determinism regressions

## Exit Condition

Testing track is complete when backend behavior drift is reliably caught before merge.
