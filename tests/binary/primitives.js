import { IRSerializer, StringTable } from "../../src/ir_serialize";
import { IRDeserializer, DeserializeErrorKind } from "../../src/ir_deserialize";
import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";

// Helper to create a minimal valid module for testing
function createMinimalModule() {
    return {
        name: "test",
        functions: [],
        globals: [],
        structs: new Map(),
        enums: new Map(),
    };
}

test("StringTable deduplicates strings", () => {
    const table = new StringTable();
    const id1 = table.addString("hello");
    const id2 = table.addString("world");
    const id3 = table.addString("hello");

    assertEqual(id1, 0);
    assertEqual(id2, 1);
    assertEqual(id3, 0); // Should return same ID for duplicate
    assertEqual(table.getStrings().length, 2);
});

test("StringTable handles empty strings", () => {
    const table = new StringTable();
    const id = table.addString("");
    assertEqual(id, 0);
    assertEqual(table.getStrings()[0], "");
});

test("StringTable handles UTF-8 strings", () => {
    const table = new StringTable();
    const id = table.addString("héllo wörld 日本語");
    assertEqual(id, 0);
    assertEqual(table.getStrings()[0], "héllo wörld 日本語");
});

test("Serializer writes U8 correctly", () => {
    const serializer = new IRSerializer();
    const buffer = new ArrayBuffer(4);
    serializer.view = new DataView(buffer);
    serializer.pos = 0;

    serializer.writeU8(0x12);
    serializer.writeU8(0xff);

    assertEqual(serializer.pos, 2);
    assertEqual(new Uint8Array(buffer)[0], 0x12);
    assertEqual(new Uint8Array(buffer)[1], 0xff);
});

test("Serializer writes U16 little endian", () => {
    const serializer = new IRSerializer();
    const buffer = new ArrayBuffer(4);
    serializer.view = new DataView(buffer);
    serializer.pos = 0;

    serializer.writeU16(0x1234);

    assertEqual(serializer.pos, 2);
    // Little endian: low byte first
    assertEqual(new Uint8Array(buffer)[0], 0x34);
    assertEqual(new Uint8Array(buffer)[1], 0x12);
});

test("Serializer writes U32 little endian", () => {
    const serializer = new IRSerializer();
    const buffer = new ArrayBuffer(8);
    serializer.view = new DataView(buffer);
    serializer.pos = 0;

    serializer.writeU32(0x12345678);

    assertEqual(serializer.pos, 4);
    // Little endian: low byte first
    assertEqual(new Uint8Array(buffer)[0], 0x78);
    assertEqual(new Uint8Array(buffer)[1], 0x56);
    assertEqual(new Uint8Array(buffer)[2], 0x34);
    assertEqual(new Uint8Array(buffer)[3], 0x12);
});

test("Serializer writes I64 correctly", () => {
    const serializer = new IRSerializer();
    const buffer = new ArrayBuffer(16);
    serializer.view = new DataView(buffer);
    serializer.pos = 0;

    serializer.writeI64(BigInt(-123456789));

    assertEqual(serializer.pos, 8);
    // Verify by reading back
    const view = new DataView(buffer);
    const value = view.getBigInt64(0, true);
    assertEqual(value, BigInt(-123456789));
});

test("Serializer writes F64 correctly", () => {
    const serializer = new IRSerializer();
    const buffer = new ArrayBuffer(16);
    serializer.view = new DataView(buffer);
    serializer.pos = 0;

    serializer.writeF64(3.141592653589793);

    assertEqual(serializer.pos, 8);
    // Verify by reading back
    const view = new DataView(buffer);
    const value = view.getFloat64(0, true);
    assertEqual(value, 3.141592653589793);
});

test("Deserializer reads U8 correctly", () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([0x12, 0xff, 0x00, 0x01]);

    const deserializer = new IRDeserializer(buffer);
    assertEqual(deserializer.readU8(), 0x12);
    assertEqual(deserializer.readU8(), 0xff);
    assertEqual(deserializer.pos, 2);
});

test("Deserializer reads U16 little endian", () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([0x34, 0x12, 0x00, 0x00]);

    const deserializer = new IRDeserializer(buffer);
    assertEqual(deserializer.readU16(), 0x1234);
    assertEqual(deserializer.pos, 2);
});

test("Deserializer reads U32 little endian", () => {
    const buffer = new ArrayBuffer(8);
    new Uint8Array(buffer).set([
        0x78, 0x56, 0x34, 0x12, 0x00, 0x00, 0x00, 0x00,
    ]);

    const deserializer = new IRDeserializer(buffer);
    assertEqual(deserializer.readU32(), 0x12345678);
    assertEqual(deserializer.pos, 4);
});

test("Deserializer reads I64 correctly", () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setBigInt64(0, BigInt(-123456789), true);

    const deserializer = new IRDeserializer(buffer);
    assertEqual(deserializer.readI64(), BigInt(-123456789));
    assertEqual(deserializer.pos, 8);
});

test("Deserializer reads F64 correctly", () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setFloat64(0, 3.141592653589793, true);

    const deserializer = new IRDeserializer(buffer);
    assertEqual(deserializer.readF64(), 3.141592653589793);
    assertEqual(deserializer.pos, 8);
});

test("Deserializer detects invalid magic", () => {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setUint32(0, 0xdeadbeef, true); // Wrong magic
    view.setUint32(4, 1, true); // Version

    const deserializer = new IRDeserializer(buffer);
    const result = deserializer.deserializeModule();

    assertTrue(!result.ok);
    assertEqual(result.error.kind, DeserializeErrorKind.InvalidMagic);
});

test("Deserializer detects invalid version", () => {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setUint32(0, 0x52534a53, true); // Correct magic "JSRS"
    view.setUint32(4, 999, true); // Wrong version

    const deserializer = new IRDeserializer(buffer);
    const result = deserializer.deserializeModule();

    assertTrue(!result.ok);
    assertEqual(result.error.kind, DeserializeErrorKind.InvalidVersion);
});

test("Deserializer detects truncated data", () => {
    const buffer = new ArrayBuffer(10); // Too small for header

    const deserializer = new IRDeserializer(buffer);
    const result = deserializer.deserializeModule();

    assertTrue(!result.ok);
    assertEqual(result.error.kind, DeserializeErrorKind.TruncatedData);
});

export function runPrimitivesTests() {
    const result = getResults();
    clearErrors();
    return 18;
}
