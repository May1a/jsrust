# IR Validation

**File**: `ir_validate.js`

**Dependencies**: `ir.js`, `ir_instructions.js`

## Task 12.1: Validation Error Types
- [x] `ValidationError` base type
- [x] `UndefinedValue` - value used before defined
- [x] `TypeMismatch` - operand type doesn't match
- [x] `MissingTerminator` - block has no terminator
- [x] `InvalidBlockArg` - branch arg count mismatch
- [x] `UndefinedBlock` - branch to non-existent block
- [x] `UndefinedFunction` - call to undefined function

## Task 12.2: Validation Context
- [x] `ValidationCtx` class
- [x] Current function reference
- [x] Defined values set
- [x] Error collection

## Task 12.3: Module Validation
- [x] `validateModule(module)` -> Result<void, ValidationError[]>
- [x] Check all functions exist
- [x] Check no duplicate function names

## Task 12.4: Function Validation
- [x] `validateFunction(fn)` -> Result<void, ValidationError[]>
- [x] Validate all blocks
- [x] Validate value definitions
- [x] Check all values used are defined

## Task 12.5: Block Validation
- [x] `validateBlock(block, ctx)`
- [x] Validate block parameters
- [x] Validate each instruction
- [x] Validate terminator exists

## Task 12.6: Instruction Validation
- [x] `validateInstruction(instr, ctx)`
- [x] Check operand values are defined
- [x] Check type consistency
- [x] Check destination is new value

## Task 12.7: Terminator Validation
- [x] `validateTerminator(term, ctx)`
- [x] Validate branch targets exist
- [x] Validate branch argument counts
- [x] Validate return type matches function

## Task 12.8: Dominance Check
- [x] Compute dominance tree
- [x] `dominates(a, b)` -> boolean
- [x] Check all uses are dominated by definitions
- [x] Handle block arguments specially

## Task 12.9: Type Checking
- [x] `checkInstructionTypes(instr, ctx)`
- [x] Binary ops: both operands same type
- [x] Comparison: operands compatible
- [x] Load/store: type matches slot type
- [x] Call: arg types match signature

## Task 12.10: Control Flow Check
- [x] Verify all blocks reachable from entry
- [x] Verify no critical edges (optional)
- [x] Verify all branches are to valid blocks

## Task 12.11: SSA Form Check
- [x] Each value defined exactly once
- [x] All uses dominated by definition
- [x] Block arguments match predecessor count

## Testing
- [x] Test file: `tests/validation/basic.js`
- [x] Test file: `tests/validation/types.js`
- [x] Test file: `tests/validation/control_flow.js`
- [x] Test file: `tests/validation/dominance.js`
