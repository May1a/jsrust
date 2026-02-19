# Textual Output and Debugging

**File**: `ir_printer.js`

**Dependencies**: `ir.js`

## Task 14.1: Type Printing
- [x] `printType(type)` -> string
- [x] Handle all IR types
- [x] Human-readable format

## Task 14.2: Instruction Printing
- [x] `printInstruction(instr)` -> string
- [x] Format: `vN = opcode operands`
- [x] Handle all instruction types
- [x] Show types where relevant

## Task 14.3: Terminator Printing
- [x] `printTerminator(term)` -> string
- [x] Format branch targets and args
- [x] Show phi-like block arguments

## Task 14.4: Block Printing
- [x] `printBlock(block)` -> string
- [x] Show block label
- [x] Show block parameters
- [x] Show all instructions
- [x] Show terminator

## Task 14.5: Function Printing
- [x] `printFunction(fn)` -> string
- [x] Show signature
- [x] Show locals (stack slots)
- [x] Show all blocks

## Task 14.6: Module Printing
- [x] `printModule(module)` -> string
- [x] Show all functions
- [x] Show type declarations

## Task 14.7: Value Naming
- [x] Track value names for debugging
- [x] `v0`, `v1`, `v2` for SSA values
- [x] `loc0`, `loc1` for locals
- [x] `block0`, `block1` for blocks

## Task 14.8: Source Mapping (Optional)
- [ ] Track source locations in IR
- [ ] Annotate IR output with source lines
- [ ] Help with debugging

## Testing
- [x] Test file: `tests/output/types.js`
- [x] Test file: `tests/output/instructions.js`
- [x] Test file: `tests/output/functions.js`
