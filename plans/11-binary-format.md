# Binary Format Serialization

**File**: `ir_serialize.js`

**Dependencies**: `ir.js`

## Task 11.1: Binary Format Header
- [x] Magic bytes: "JSRS" (0x4A 0x53 0x52 0x53)
- [x] Version: u32
- [x] Flags: u32
- [x] Section offsets: type, global, function

## Task 11.2: Serializer State
- [x] `IRSerializer` class
- [x] Buffer management (ArrayBuffer + DataView)
- [x] Position tracking
- [x] String table

## Task 11.3: String Table
- [x] Collect all strings during serialization
- [x] Assign string IDs
- [x] Write string table section
- [x] Format: count + [length, utf8_bytes]*

## Task 11.4: Primitive Writers
- [x] `writeU8(value)`
- [x] `writeU16(value)` - little endian
- [x] `writeU32(value)` - little endian
- [x] `writeU64(value)` - little endian
- [x] `writeI32(value)` - signed
- [x] `writeI64(value)` - signed
- [x] `writeF32(value)`
- [x] `writeF64(value)`
- [x] `writeBytes(data)`

## Task 11.5: Type Encoding
- [x] Encode type tag (u8)
- [x] `encodeIntType(bits)`
- [x] `encodeFloatType(bits)`
- [x] `encodeStructType(name, fields)`
- [x] `encodeEnumType(name, variants)`
- [x] `encodeArrayType(element, size)`
- [x] `encodePtrType()`

## Task 11.6: Function Encoding
- [x] Name (string table index)
- [x] Parameter count + types
- [x] Return type
- [x] Block count
- [x] Local count
- [x] Blocks encoded sequentially
- [x] Locals encoded sequentially

## Task 11.7: Block Encoding
- [x] Parameter count + types
- [x] Instruction count
- [x] Instructions encoded sequentially
- [x] Terminator encoded last

## Task 11.8: Instruction Encoding
- [x] Opcode (u8)
- [x] Destination value (u32)
- [x] Operands (vary by opcode)
- [x] Common patterns:
  - Binary: dest, a, b (3 x u32)
  - Unary: dest, a (2 x u32)
  - Constant: dest, type_tag, value_bytes
  - Memory: dest, ptr, type_tag

## Task 11.9: Terminator Encoding
- [x] Tag (u8)
- [x] `ret`: optional value (u32, 0xFFFFFFFF for none)
- [x] `br`: target + arg_count + args
- [x] `br_if`: cond + then_block + then_args + else_block + else_args
- [x] `switch`: value + case_count + cases + default

## Task 11.10: Module Serialization
- [x] `serializeModule(module)` -> Uint8Array
- [x] Two-pass: collect strings, then write
- [x] Calculate section offsets
- [x] Write header last

## Task 11.11: Deserializer State
**File**: `ir_deserialize.js`
- [x] `IRDeserializer` class
- [x] Buffer reference
- [x] Position tracking
- [x] String table cache

## Task 11.12: Primitive Readers
- [x] `readU8()` -> number
- [x] `readU16()` -> number
- [x] `readU32()` -> number
- [x] `readU64()` -> bigint
- [x] `readI32()` -> number
- [x] `readI64()` -> bigint
- [x] `readF32()` -> number
- [x] `readF64()` -> number
- [x] `readBytes(count)` -> Uint8Array

## Task 11.13: Module Deserialization
- [x] `deserializeModule(data)` -> Result<IRModule, DeserializeError>
- [x] Validate magic and version
- [x] Read string table
- [x] Read type section
- [x] Read function section

## Task 11.14: Error Handling
- [x] `DeserializeError` type
- [x] Invalid magic
- [x] Invalid version
- [x] Truncated data
- [x] Invalid opcode
- [x] Out of bounds references

## Testing
- [x] Test file: `tests/binary/primitives.js`
- [x] Test file: `tests/binary/types.js`
- [x] Test file: `tests/binary/instructions.js`
- [x] Test file: `tests/binary/roundtrip.js`
