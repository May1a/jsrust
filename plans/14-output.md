# Textual Output and Debugging

**File**: `ir_printer.js`

**Dependencies**: `ir.js`

## Task 14.1: Type Printing
- [ ] `printType(type)` -> string
- [ ] Handle all IR types
- [ ] Human-readable format

## Task 14.2: Instruction Printing
- [ ] `printInstruction(instr)` -> string
- [ ] Format: `vN = opcode operands`
- [ ] Handle all instruction types
- [ ] Show types where relevant

## Task 14.3: Terminator Printing
- [ ] `printTerminator(term)` -> string
- [ ] Format branch targets and args
- [ ] Show phi-like block arguments

## Task 14.4: Block Printing
- [ ] `printBlock(block)` -> string
- [ ] Show block label
- [ ] Show block parameters
- [ ] Show all instructions
- [ ] Show terminator

## Task 14.5: Function Printing
- [ ] `printFunction(fn)` -> string
- [ ] Show signature
- [ ] Show locals (stack slots)
- [ ] Show all blocks

## Task 14.6: Module Printing
- [ ] `printModule(module)` -> string
- [ ] Show all functions
- [ ] Show type declarations

## Task 14.7: Value Naming
- [ ] Track value names for debugging
- [ ] `v0`, `v1`, `v2` for SSA values
- [ ] `loc0`, `loc1` for locals
- [ ] `block0`, `block1` for blocks

## Task 14.8: Source Mapping (Optional)
- [ ] Track source locations in IR
- [ ] Annotate IR output with source lines
- [ ] Help with debugging

## Testing
- [ ] Test file: `tests/output/types.js`
- [ ] Test file: `tests/output/instructions.js`
- [ ] Test file: `tests/output/functions.js`