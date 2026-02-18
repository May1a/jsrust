# SSA IR Definitions

**File**: `ir.js`

**Dependencies**: None

## Task 7.1: IR Value Types
- [ ] `ValueId` - unique identifier for SSA values (number)
- [ ] `BlockId` - unique identifier for basic blocks (number)
- [ ] `FunctionId` - unique identifier for functions (number)
- [ ] `LocalId` - unique identifier for stack slots (number)

## Task 7.2: IR Types
- [ ] `IRIntType` - i8, i16, i32, i64
- [ ] `IRFloatType` - f32, f64
- [ ] `IRBoolType` - boolean
- [ ] `IRPtrType` - pointer
- [ ] `IRUnitType` - ()
- [ ] `IRStructType` - named struct with field types
- [ ] `IREnumType` - named enum with variant types
- [ ] `IRArrayType` - [T; N]
- [ ] `IRFuncType` - function signature

## Task 7.3: IR Module
- [ ] `IRModule` - container for functions and globals
- [ ] `IRGlobal` - global variable definition

## Task 7.4: IR Function
- [ ] `IRFunction` - function definition
- [ ] Parameters with value IDs and types
- [ ] Return type
- [ ] List of basic blocks
- [ ] List of local allocations
- [ ] Entry block reference

## Task 7.5: IR Basic Block
- [ ] `IRBlock` - basic block
- [ ] Block parameters (phi alternative)
- [ ] List of instructions
- [ ] Terminator instruction

## Task 7.6: IR Local (Stack Slot)
- [ ] `IRLocal` - stack allocation metadata
- [ ] Type and optional name

## Task 7.7: Constant Instructions
**File**: `ir_instructions.js`
- [ ] `iconst` - integer constant
- [ ] `fconst` - float constant
- [ ] `bconst` - boolean constant
- [ ] `null` - null pointer

## Task 7.8: Arithmetic Instructions
- [ ] `iadd`, `isub`, `imul`, `idiv`, `imod` - integer arithmetic
- [ ] `fadd`, `fsub`, `fmul`, `fdiv` - float arithmetic
- [ ] `ineg`, `fneg` - negation

## Task 7.9: Bitwise Instructions
- [ ] `iand`, `ior`, `ixor` - bitwise ops
- [ ] `ishl`, `ishr` - shifts

## Task 7.10: Comparison Instructions
- [ ] `icmp` - integer comparison (eq, ne, slt, sle, sgt, sge, ult, ule, ugt, uge)
- [ ] `fcmp` - float comparison (oeq, one, olt, ole, ogt, oge)

## Task 7.11: Memory Instructions
- [ ] `alloca` - stack allocation
- [ ] `load` - load from memory
- [ ] `store` - store to memory
- [ ] `memcpy` - memory copy

## Task 7.12: Address Instructions
- [ ] `gep` - get element pointer
- [ ] `ptradd` - pointer arithmetic

## Task 7.13: Conversion Instructions
- [ ] `trunc` - truncate integer
- [ ] `sext`, `zext` - sign/zero extend
- [ ] `fptoui`, `fptosi` - float to int
- [ ] `uitofp`, `sitofp` - int to float
- [ ] `bitcast` - reinterpret bits

## Task 7.14: Call Instruction
- [ ] `call` - function call with optional return value

## Task 7.15: Struct/Enum Instructions
- [ ] `struct_create` - create struct value
- [ ] `struct_get` - extract struct field
- [ ] `enum_create` - create enum variant
- [ ] `enum_get_tag` - get variant tag
- [ ] `enum_get_data` - get variant data

## Task 7.16: Terminators
**File**: `ir_terminators.js`
- [ ] `ret` - return from function
- [ ] `br` - unconditional branch
- [ ] `br_if` - conditional branch
- [ ] `switch` - multi-way branch
- [ ] `unreachable` - unreachable code

## Testing
- [ ] Test file: `tests/ir/types.js`
- [ ] Test file: `tests/ir/instructions.js`
- [ ] Test file: `tests/ir/blocks.js`
- [ ] Test file: `tests/ir/functions.js`
