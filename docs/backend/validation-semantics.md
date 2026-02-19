# IR Validation Semantics for Backend Handoff

This document defines required validation behavior for IR accepted by backend consumers.

## Validation Scope

Validation is applied on SSA IR function/module structures before backend execution.

Required checks:

- duplicate definitions (functions, globals, SSA values)
- undefined values and blocks
- missing block terminators
- invalid block argument arity on branches
- type consistency for operands and terminators
- dominance constraints for SSA value use
- reachability constraints from entry block
- function return requirements

## Required Error Categories

Validation errors are categorized by `ValidationErrorKind`:

- `UndefinedValue`
- `TypeMismatch`
- `MissingTerminator`
- `InvalidBlockArg`
- `UndefinedBlock`
- `UndefinedFunction`
- `DuplicateDefinition`
- `UnreachableBlock`
- `DominanceViolation`
- `InvalidOperand`
- `MissingReturn`

## Backend Consumption Rule

Backends must reject IR that does not satisfy these validation semantics.

Recommended execution contract:

1. Deserialize binary IR.
2. Validate module/function IR.
3. Abort backend code generation on first fatal validation failure.

## Traceability to Tests

Validation behavior is covered by:

- `/Users/may/jsrust/tests/validation/basic.js`
- `/Users/may/jsrust/tests/validation/types.js`
- `/Users/may/jsrust/tests/validation/control_flow.js`
- `/Users/may/jsrust/tests/validation/dominance.js`
- `/Users/may/jsrust/tests/binary/conformance.js`
