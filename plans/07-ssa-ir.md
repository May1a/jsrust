# SSA IR Definitions

**File**: `ir.js`

**Dependencies**: None

## Task 7.1: IR Value Types
- [x] `ValueId` - unique identifier for SSA values (number)
- [x] `BlockId` - unique identifier for basic blocks (number)
- [x] `FunctionId` - unique identifier for functions (number)
- [x] `LocalId` - unique identifier for stack slots (number)

## Task 7.2: IR Types
- [x] `IRIntType` - i8, i16, i32, i64
- [x] `IRFloatType` - f32, f64
- [x] `IRBoolType` - boolean
- [x] `IRPtrType` - pointer
- [x] `IRUnitType` - ()
- [x] `IRStructType` - named struct with field types
- [x] `IREnumType` - named enum with variant types
- [x] `IRArrayType` - [T; N]
- [x] `IRFuncType` - function signature

## Task 7.3: IR Module
- [x] `IRModule` - container for functions and globals
- [x] `IRGlobal` - global variable definition

## Task 7.4: IR Function
- [x] `IRFunction` - function definition
- [x] Parameters with value IDs and types
- [x] Return type
- [x] List of basic blocks
- [x] List of local allocations
- [x] Entry block reference

## Task 7.5: IR Basic Block
- [x] `IRBlock` - basic block
- [x] Block parameters (phi alternative)
- [x] List of instructions
- [x] Terminator instruction

## Task 7.6: IR Local (Stack Slot)
- [x] `IRLocal` - stack allocation metadata
- [x] Type and optional name

## Task 7.7: Constant Instructions
**File**: `ir_instructions.js`
- [x] `iconst` - integer constant
- [x] `fconst` - float constant
- [x] `bconst` - boolean constant
- [x] `null` - null pointer

## Task 7.8: Arithmetic Instructions
- [x] `iadd`, `isub`, `imul`, `idiv`, `imod` - integer arithmetic
- [x] `fadd`, `fsub`, `fmul`, `fdiv` - float arithmetic
- [x] `ineg`, `fneg` - negation

## Task 7.9: Bitwise Instructions
- [x] `iand`, `ior`, `ixor` - bitwise ops
- [x] `ishl`, `ishr` - shifts

## Task 7.10: Comparison Instructions
- [x] `icmp` - integer comparison (eq, ne, slt, sle, sgt, sge, ult, ule, ugt, uge)
- [x] `fcmp` - float comparison (oeq, one, olt, ole, ogt, oge)

## Task 7.11: Memory Instructions
- [x] `alloca` - stack allocation
- [x] `load` - load from memory
- [x] `store` - store to memory
- [x] `memcpy` - memory copy

## Task 7.12: Address Instructions
- [x] `gep` - get element pointer
- [x] `ptradd` - pointer arithmetic

## Task 7.13: Conversion Instructions
- [x] `trunc` - truncate integer
- [x] `sext`, `zext` - sign/zero extend
- [x] `fptoui`, `fptosi` - float to int
- [x] `uitofp`, `sitofp` - int to float
- [x] `bitcast` - reinterpret bits

## Task 7.14: Call Instruction
- [x] `call` - function call with optional return value

## Task 7.15: Struct/Enum Instructions
- [x] `struct_create` - create struct value
- [x] `struct_get` - extract struct field
- [x] `enum_create` - create enum variant
- [x] `enum_get_tag` - get variant tag
- [x] `enum_get_data` - get variant data

## Task 7.16: Terminators
**File**: `ir_terminators.js`
- [x] `ret` - return from function
- [x] `br` - unconditional branch
- [x] `br_if` - conditional branch
- [x] `switch` - multi-way branch
- [x] `unreachable` - unreachable code

## Testing
- [x] Test file: `tests/ir/types.js`
- [x] Test file: `tests/ir/instructions.js`
- [x] Test file: `tests/ir/blocks.js`
- [x] Test file: `tests/ir/functions.js`
