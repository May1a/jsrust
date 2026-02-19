# SSA IR Builder

**File**: `ir_builder.js`

**Dependencies**: `ir.js`, `ir_instructions.js`, `ir_terminators.js`

## Task 8.1: Builder State

- [ ] `IRBuilder` class
- [ ] Current function reference
- [ ] Current block reference
- [ ] Next value ID counter
- [ ] Next block ID counter
- [ ] Set of sealed blocks

## Task 8.2: Block Management

- [ ] `createBlock()` - create new basic block
- [ ] `switchToBlock(blockId)` - set current insertion point
- [ ] `sealBlock(blockId)` - mark block as having all predecessors
- [ ] `predecessors(blockId)` - get predecessor blocks

## Task 8.3: Variable Tracking (SSA Construction)

- [ ] Variable definitions per block: `Map<string, Map<BlockId, ValueId>>`
- [ ] Incomplete phis: `Map<BlockId, Map<string, ValueId>>`
- [ ] Variable types: `Map<string, IRType>`

## Task 8.4: Constant Instructions

- [ ] `iconst(value, type)` -> ValueId
- [ ] `fconst(value, type)` -> ValueId
- [ ] `bconst(value)` -> ValueId
- [ ] `null(type)` -> ValueId

## Task 8.5: Arithmetic Instructions

- [ ] `iadd(a, b)` -> ValueId
- [ ] `isub(a, b)` -> ValueId
- [ ] `imul(a, b)` -> ValueId
- [ ] `idiv(a, b)` -> ValueId
- [ ] `imod(a, b)` -> ValueId
- [ ] `fadd(a, b)` -> ValueId
- [ ] `fsub(a, b)` -> ValueId
- [ ] `fmul(a, b)` -> ValueId
- [ ] `fdiv(a, b)` -> ValueId
- [ ] `ineg(a)` -> ValueId
- [ ] `fneg(a)` -> ValueId

## Task 8.6: Bitwise Instructions

- [ ] `iand(a, b)` -> ValueId
- [ ] `ior(a, b)` -> ValueId
- [ ] `ixor(a, b)` -> ValueId
- [ ] `ishl(a, b)` -> ValueId
- [ ] `ishr(a, b)` -> ValueId

## Task 8.7: Comparison Instructions

- [ ] `icmp(op, a, b)` -> ValueId
- [ ] `fcmp(op, a, b)` -> ValueId

## Task 8.8: Memory Instructions

- [ ] `alloca(type)` -> ValueId (returns pointer)
- [ ] `load(ptr, type)` -> ValueId
- [ ] `store(ptr, value, type)` -> void
- [ ] `memcpy(dest, src, size)` -> void

## Task 8.9: Address Instructions

- [ ] `gep(ptr, indices)` -> ValueId
- [ ] `ptradd(ptr, offset)` -> ValueId

## Task 8.10: Conversion Instructions

- [ ] `trunc(val, fromType, toType)` -> ValueId
- [ ] `sext(val, fromType, toType)` -> ValueId
- [ ] `zext(val, fromType, toType)` -> ValueId
- [ ] `fptoui(val)` -> ValueId
- [ ] `fptosi(val)` -> ValueId
- [ ] `uitofp(val)` -> ValueId
- [ ] `sitofp(val)` -> ValueId
- [ ] `bitcast(val, toType)` -> ValueId

## Task 8.11: Call Instruction

- [ ] `call(fn, args)` -> ValueId | null

## Task 8.12: Struct/Enum Instructions

- [ ] `structCreate(fields)` -> ValueId
- [ ] `structGet(struct, fieldIndex)` -> ValueId
- [ ] `enumCreate(variant, data)` -> ValueId
- [ ] `enumGetTag(enum)` -> ValueId
- [ ] `enumGetData(enum, variant, index)` -> ValueId

## Task 8.13: Terminators

- [ ] `ret(value)` -> void
- [ ] `br(target, args)` -> void
- [ ] `brIf(cond, then, thenArgs, else, elseArgs)` -> void
- [ ] `switch(value, cases, default)` -> void
- [ ] `unreachable()` -> void

## Task 8.14: Variable Operations

- [ ] `declareVar(name, type)` -> void
- [ ] `defineVar(name, value)` -> void
- [ ] `useVar(name)` -> ValueId

## Task 8.15: SSA Construction Helpers

- [ ] `writeVar(name, block, value)` -> void
- [ ] `readVar(name, block)` -> ValueId
- [ ] `readVarRecursive(name, block)` -> ValueId
- [ ] `addPhiOperands(phi, block)` -> void
- [ ] `tryRemoveTrivialPhi(phi)` -> ValueId

## Task 8.16: Finalization

- [ ] `build()` -> IRFunction
- [ ] Verify all blocks terminated
- [ ] Verify all blocks sealed

## Testing

- [ ] Test file: `tests/ir_builder/constants.js`
- [ ] Test file: `tests/ir_builder/arithmetic.js`
- [ ] Test file: `tests/ir_builder/memory.js`
- [ ] Test file: `tests/ir_builder/variables.js`
- [ ] Test file: `tests/ir_builder/control_flow.js`
