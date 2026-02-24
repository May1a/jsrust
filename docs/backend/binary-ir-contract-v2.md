# JSRust Binary IR Contract v2

This document is the normative contract for backend consumers of JSRust binary IR.

## Version Policy

- Magic: `0x52534A53` (`"JSRS"`, little-endian)
- Version: `2`
- Flags: `0` (reserved, must be present in header)
- Byte order: little-endian for all numeric fields.

Compatibility policy:

- Patch/minor compiler changes may not change this format when `VERSION=2`.
- Any incompatible binary schema change must bump `VERSION`.
- Unknown version must be rejected by consumers.

## File Layout

Header is 32 bytes, in this exact order:

1. `u32 magic`
2. `u32 version`
3. `u32 flags`
4. `u32 string_table_offset`
5. `u32 types_offset`
6. `u32 literals_offset`
7. `u32 globals_offset`
8. `u32 functions_offset`

Sections are stored contiguously and addressed by offsets from file start.

Section ids used by serializer:

- `0`: string table
- `1`: types
- `2`: string literals
- `3`: globals
- `4`: functions

## Schema Invariants

The following invariants are required by v2 and relied upon by backend integration tests:

- String table is append-only per file and IDs are `u32` indexes into section-local array.
- String literal pool section stores UTF-8 literal bytes (`count` then repeated `len + bytes`).
- `sconst` instruction references string literal pool entries by `u32 literal_id`.
- Struct and enum definitions are serialized before globals/functions and referenced by string IDs.
- Function records contain params, return type, blocks, locals, and entry id.
- Block records contain block params, instruction stream, and exactly one terminator encoding.
- Missing return value is encoded explicitly by presence byte (`0`) for `ret`.
- Numeric constants use fixed widths:
    - integer constants: signed `i64`
    - float constants: `f64`
- Terminator and instruction tags are numeric enums and must be known by deserializers.

## Failure Semantics

Deserializer must fail (not continue) for at least:

- invalid magic
- unsupported version
- truncated input (including truncated header)
- invalid instruction opcode
- invalid type tag
- invalid terminator tag
- out-of-bounds string/type/reference indexes

## Traceability

The following tests enforce this contract:

- `/Users/may/jsrust/tests/binary/primitives.js`
- `/Users/may/jsrust/tests/binary/roundtrip.js`
- `/Users/may/jsrust/tests/binary/conformance.js`

Fixture corpus for this contract version:

- `/Users/may/jsrust/tests/fixtures/backend_ir_v2/`
