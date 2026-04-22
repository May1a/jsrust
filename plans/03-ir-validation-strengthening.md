# 03 - IR Validation Strengthening

## Objective

Strengthen the IR validation pass (`ir_validate.ts`) from its current 91-line structural-only check to a comprehensive semantic validator that catches compiler bugs before they reach the backend. This is a critical quality gate — without it, frontend bugs silently produce invalid IR.

## Prerequisites

- Plan 01 (Type Inference Correctness) — validator needs correct types to check against
- Plan 02 (Lowering Correctness) — validator needs correct lowering to not fire on valid output

## Quality Policy

- Every validation check must have a positive test (valid IR passes) and a negative test (invalid IR caught)
- Validation errors must be deterministic and include the function name, block name, and instruction index
- No `eslint-disable` comments
- Run `bun lint <file>` after every change

## Current State

**File:** `src/ir/ir_validate.ts` (91 lines)

The validator currently checks only:
1. Function has an entry block
2. Branch targets reference blocks that exist within the function

It does **not** validate:
- Instruction type consistency
- Block parameter types
- Terminator presence in every block
- Value def-use consistency (every used `ValueId` is defined before use)
- Return type matching
- Call argument count/signature
- SSA dominance
- Enum tag bounds

## New Validation Checks

### 03.1 Terminator Presence

Every block must have a terminator. A block without a terminator is malformed.

**Implementation:**
```
for each block in function:
    if block has no terminator:
        error: "Block {name} has no terminator"
```

### 03.2 Block Parameter Consistency

Branch arguments must match the target block's parameter types and count.

**Implementation:**
```
for each terminator:
    for each (target_block, args) pair:
        if args.length != target.params.length:
            error: "Branch to {target} has {args.length} args, expected {target.params.length}"
        for each (arg, param) pair:
            if arg.type != param.type:
                error: "Argument type mismatch at index {i}: got {arg.type}, expected {param.type}"
```

### 03.3 Value Def-Use Consistency

Every `ValueId` used in an instruction must be defined earlier in the same function (instruction result, block parameter, or function parameter).

**Implementation:**
- Walk blocks in reverse post-order from entry
- Maintain a set of defined values
- For each instruction, check all operand `ValueId`s are in the defined set
- After processing each instruction, add its result `ValueId` to the set
- Block parameters are pre-defined at block start

### 03.4 Instruction Operand Type Consistency

Binary arithmetic instructions must have matching operand types. For example, `iadd` requires both operands to be integers.

**Implementation:**
- Map each `IRInstKind` to its expected operand type constraints:
  - `Iadd`, `Isub`, `Imul`, `Idiv`, `Imod` → both operands `IntType`
  - `Fadd`, `Fsub`, `Fmul`, `Fdiv` → both operands `FloatType`
  - `Iand`, `Ior`, `Ixor`, `Ishl`, `Ishr` → both operands `IntType`
  - `Icmp` → both operands same type (int or bool)
  - `Fcmp` → both operands `FloatType`
  - `Bconst` → result is `BoolType`
  - `Iconst` → result is `IntType`
  - `Fconst` → result is `FloatType`
  - `Sconst` → result is `PtrType` (pointer to string data)
- Check each instruction against its constraint
- Report mismatches with instruction kind, expected type, and actual type

### 03.5 Return Type Matching

Every `Ret` terminator's value type must match the function's declared return type.

**Implementation:**
```
for each function:
    for each block with Ret terminator:
        if ret.value.type != function.returnType:
            error: "Return type mismatch in block {name}: got {ret.value.type}, expected {function.returnType}"
```

### 03.6 Call Argument Count

`Call` instructions must pass the correct number of arguments for the callee.

**Implementation:**
- Maintain a map of function signatures in the module
- For each `Call` instruction, look up the callee and verify arg count
- For `CallDyn` (indirect calls), skip this check (or verify against known fn pointer types)

### 03.7 Enum Operations Bounds Check

- `EnumGetTag` on an enum value must have a valid enum type
- `EnumGetData` must have a valid variant index for the enum type

### 03.8 Struct Operations Check

- `StructGet` field index must be within bounds for the struct type
- `StructCreate` must have the correct number of fields

## Work Packages

### WP-03.A: Validation Infrastructure

- Extend `IRValidationError` with richer context: function name, block name, instruction index
- Add a `ValidationContext` that tracks defined values as the validator walks blocks
- Implement reverse post-order block traversal for correct dominance-aware validation

### WP-03.B: Structural Checks (03.1)

- Add terminator presence check for every block
- Add positive test: valid IR with terminators
- Add negative test: IR with missing terminator

### WP-03.C: Type Consistency Checks (03.2, 03.4, 03.5)

- Block parameter consistency for branches
- Instruction operand type checking
- Return type matching
- Add tests for each check (positive and negative)

### WP-03.D: Def-Use Consistency (03.3)

- Value liveness tracking across blocks
- Report use of undefined values
- Add tests: valid SSA, use-before-def, use of nonexistent value

### WP-03.E: Aggregate Bounds Checks (03.6, 03.7, 03.8)

- Call argument count
- Enum tag/data bounds
- Struct field bounds
- Add tests for each

### WP-03.F: Integration

- Run validator on all 29 example IR outputs
- Verify no false positives (all existing valid IR should pass)
- Add validator to the compilation pipeline as a mandatory gate (already done in compile.ts, verify it catches the new checks)

## Acceptance Criteria

All required:

- [ ] Every block without a terminator produces a validation error
- [ ] Branch arguments are checked against target block parameter types and count
- [ ] Every used `ValueId` is verified to be defined before use
- [ ] Arithmetic instruction operands are type-checked
- [ ] Return types are verified against function signatures
- [ ] Call argument counts are verified
- [ ] Enum and struct operations are bounds-checked
- [ ] All 29 existing example IR outputs pass validation (no false positives)
- [ ] Negative tests exist for every check
- [ ] No lint errors

## Files Affected

- `src/ir/ir_validate.ts` — all new validation logic
- `src/ir/ir.ts` — possibly extend types with validation metadata
- `src/compile.ts` — verify validation is called in pipeline
- `tests/compile.test.ts` — new validation tests

## Design Decisions

- **Severity levels:** Consider `Error` vs `Warning`. Initially, all new checks should be errors. Warnings can be added later for non-critical issues.
- **Recovery:** The validator should collect all errors rather than stopping at the first one. This gives maximum information from a single validation run.
- **Performance:** The validator runs on every compilation. Keep it O(n) in the number of instructions. The def-use check is the most expensive — use a simple set-based approach.
