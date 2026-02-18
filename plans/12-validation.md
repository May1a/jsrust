# IR Validation

**File**: `ir_validate.js`

**Dependencies**: `ir.js`, `ir_instructions.js`

## Task 12.1: Validation Error Types
- [ ] `ValidationError` base type
- [ ] `UndefinedValue` - value used before defined
- [ ] `TypeMismatch` - operand type doesn't match
- [ ] `MissingTerminator` - block has no terminator
- [ ] `InvalidBlockArg` - branch arg count mismatch
- [ ] `UndefinedBlock` - branch to non-existent block
- [ ] `UndefinedFunction` - call to undefined function

## Task 12.2: Validation Context
- [ ] `ValidationCtx` class
- [ ] Current function reference
- [ ] Defined values set
- [ ] Error collection

## Task 12.3: Module Validation
- [ ] `validateModule(module)` -> Result<void, ValidationError[]>
- [ ] Check all functions exist
- [ ] Check no duplicate function names

## Task 12.4: Function Validation
- [ ] `validateFunction(fn)` -> Result<void, ValidationError[]>
- [ ] Validate all blocks
- [ ] Validate value definitions
- [ ] Check all values used are defined

## Task 12.5: Block Validation
- [ ] `validateBlock(block, ctx)`
- [ ] Validate block parameters
- [ ] Validate each instruction
- [ ] Validate terminator exists

## Task 12.6: Instruction Validation
- [ ] `validateInstruction(instr, ctx)`
- [ ] Check operand values are defined
- [ ] Check type consistency
- [ ] Check destination is new value

## Task 12.7: Terminator Validation
- [ ] `validateTerminator(term, ctx)`
- [ ] Validate branch targets exist
- [ ] Validate branch argument counts
- [ ] Validate return type matches function

## Task 12.8: Dominance Check
- [ ] Compute dominance tree
- [ ] `dominates(a, b)` -> boolean
- [ ] Check all uses are dominated by definitions
- [ ] Handle block arguments specially

## Task 12.9: Type Checking
- [ ] `checkInstructionTypes(instr, ctx)`
- [ ] Binary ops: both operands same type
- [ ] Comparison: operands compatible
- [ ] Load/store: type matches slot type
- [ ] Call: arg types match signature

## Task 12.10: Control Flow Check
- [ ] Verify all blocks reachable from entry
- [ ] Verify no critical edges (optional)
- [ ] Verify all branches are to valid blocks

## Task 12.11: SSA Form Check
- [ ] Each value defined exactly once
- [ ] All uses dominated by definition
- [ ] Block arguments match predecessor count

## Testing
- [ ] Test file: `tests/validation/basic.js`
- [ ] Test file: `tests/validation/types.js`
- [ ] Test file: `tests/validation/control_flow.js`
- [ ] Test file: `tests/validation/dominance.js`