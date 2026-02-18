# Binary Format Serialization

**File**: `ir_serialize.js`

**Dependencies**: `ir.js`

## Task 11.1: Binary Format Header
- [ ] Magic bytes: "JSRS" (0x4A 0x53 0x52 0x53)
- [ ] Version: u32
- [ ] Flags: u32
- [ ] Section offsets: type, global, function

## Task 11.2: Serializer State
- [ ] `IRSerializer` class
- [ ] Buffer management (ArrayBuffer + DataView)
- [ ] Position tracking
- [ ] String table

## Task 11.3: String Table
- [ ] Collect all strings during serialization
- [ ] Assign string IDs
- [ ] Write string table section
- [ ] Format: count + [length, utf8_bytes]*

## Task 11.4: Primitive Writers
- [ ] `writeU8(value)`
- [ ] `writeU16(value)` - little endian
- [ ] `writeU32(value)` - little endian
- [ ] `writeU64(value)` - little endian
- [ ] `writeI32(value)` - signed
- [ ] `writeI64(value)` - signed
- [ ] `writeF32(value)`
- [ ] `writeF64(value)`
- [ ] `writeBytes(data)`

## Task 11.5: Type Encoding
- [ ] Encode type tag (u8)
- [ ] `encodeIntType(bits)`
- [ ] `encodeFloatType(bits)`
- [ ] `encodeStructType(name, fields)`
- [ ] `encodeEnumType(name, variants)`
- [ ] `encodeArrayType(element, size)`
- [ ] `encodePtrType()`

## Task 11.6: Function Encoding
- [ ] Name (string table index)
- [ ] Parameter count + types
- [ ] Return type
- [ ] Block count
- [ ] Local count
- [ ] Blocks encoded sequentially
- [ ] Locals encoded sequentially

## Task 11.7: Block Encoding
- [ ] Parameter count + types
- [ ] Instruction count
- [ ] Instructions encoded sequentially
- [ ] Terminator encoded last

## Task 11.8: Instruction Encoding
- [ ] Opcode (u8)
- [ ] Destination value (u32)
- [ ] Operands (vary by opcode)
- [ ] Common patterns:
  - Binary: dest, a, b (3 x u32)
  - Unary: dest, a (2 x u32)
  - Constant: dest, type_tag, value_bytes
  - Memory: dest, ptr, type_tag

## Task 11.9: Terminator Encoding
- [ ] Tag (u8)
- [ ] `ret`: optional value (u32, 0xFFFFFFFF for none)
- [ ] `br`: target + arg_count + args
- [ ] `br_if`: cond + then_block + then_args + else_block + else_args
- [ ] `switch`: value + case_count + cases + default

## Task 11.10: Module Serialization
- [ ] `serializeModule(module)` -> Uint8Array
- [ ] Two-pass: collect strings, then write
- [ ] Calculate section offsets
- [ ] Write header last

## Task 11.11: Deserializer State
**File**: `ir_deserialize.js`
- [ ] `IRDeserializer` class
- [ ] Buffer reference
- [ ] Position tracking
- [ ] String table cache

## Task 11.12: Primitive Readers
- [ ] `readU8()` -> number
- [ ] `readU16()` -> number
- [ ] `readU32()` -> number
- [ ] `readU64()` -> bigint
- [ ] `readI32()` -> number
- [ ] `readI64()` -> bigint
- [ ] `readF32()` -> number
- [ ] `readF64()` -> number
- [ ] `readBytes(count)` -> Uint8Array

## Task 11.13: Module Deserialization
- [ ] `deserializeModule(data)` -> Result<IRModule, DeserializeError>
- [ ] Validate magic and version
- [ ] Read string table
- [ ] Read type section
- [ ] Read function section

## Task 11.14: Error Handling
- [ ] `DeserializeError` type
- [ ] Invalid magic
- [ ] Invalid version
- [ ] Truncated data
- [ ] Invalid opcode
- [ ] Out of bounds references

## Testing
- [ ] Test file: `tests/binary/primitives.js`
- [ ] Test file: `tests/binary/types.js`
- [ ] Test file: `tests/binary/instructions.js`
- [ ] Test file: `tests/binary/roundtrip.js`