import {
    IRTypeKind,
    resetIRIds,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,
    irTypeEquals,
    irTypeToString,
    isIRIntType,
    isIRFloatType,
    isIRBoolType,
    isIRPtrType,
    isIRUnitType,
    isIRStructType,
    isIREnumType,
    isIRArrayType,
    isIRFnType,
} from '../../ir.js';

import { IntWidth, FloatWidth } from '../../types.js';
import { test, assertEqual, assertTrue, getResults, clearErrors } from '../lib.js';

test('makeIRIntType creates integer types', () => {
    resetIRIds();
    const ty = makeIRIntType(IntWidth.I32);
    assertEqual(ty.kind, IRTypeKind.Int);
    assertEqual(ty.width, IntWidth.I32);
});

test('makeIRFloatType creates float types', () => {
    resetIRIds();
    const ty = makeIRFloatType(FloatWidth.F64);
    assertEqual(ty.kind, IRTypeKind.Float);
    assertEqual(ty.width, FloatWidth.F64);
});

test('makeIRBoolType creates bool type', () => {
    resetIRIds();
    const ty = makeIRBoolType();
    assertEqual(ty.kind, IRTypeKind.Bool);
});

test('makeIRPtrType creates pointer type', () => {
    resetIRIds();
    const inner = makeIRIntType(IntWidth.I32);
    const ty = makeIRPtrType(inner);
    assertEqual(ty.kind, IRTypeKind.Ptr);
    assertTrue(ty.inner !== null);
    assertEqual(ty.inner.kind, IRTypeKind.Int);
});

test('makeIRUnitType creates unit type', () => {
    resetIRIds();
    const ty = makeIRUnitType();
    assertEqual(ty.kind, IRTypeKind.Unit);
});

test('makeIRStructType creates struct type', () => {
    resetIRIds();
    const fields = [makeIRIntType(IntWidth.I32), makeIRBoolType()];
    const ty = makeIRStructType('Point', fields);
    assertEqual(ty.kind, IRTypeKind.Struct);
    assertEqual(ty.name, 'Point');
    assertEqual(ty.fields.length, 2);
});

test('makeIREnumType creates enum type', () => {
    resetIRIds();
    const variants = [[], [makeIRIntType(IntWidth.I32)]];
    const ty = makeIREnumType('Option', variants);
    assertEqual(ty.kind, IRTypeKind.Enum);
    assertEqual(ty.name, 'Option');
    assertEqual(ty.variants.length, 2);
});

test('makeIRArrayType creates array type', () => {
    resetIRIds();
    const ty = makeIRArrayType(makeIRIntType(IntWidth.I32), 10);
    assertEqual(ty.kind, IRTypeKind.Array);
    assertEqual(ty.length, 10);
    assertEqual(ty.element.kind, IRTypeKind.Int);
});

test('makeIRFnType creates function type', () => {
    resetIRIds();
    const params = [makeIRIntType(IntWidth.I32), makeIRBoolType()];
    const ret = makeIRUnitType();
    const ty = makeIRFnType(params, ret);
    assertEqual(ty.kind, IRTypeKind.Fn);
    assertEqual(ty.params.length, 2);
    assertEqual(ty.returnType.kind, IRTypeKind.Unit);
});

test('irTypeEquals compares types correctly', () => {
    resetIRIds();
    const i32a = makeIRIntType(IntWidth.I32);
    const i32b = makeIRIntType(IntWidth.I32);
    const i64 = makeIRIntType(IntWidth.I64);
    
    assertTrue(irTypeEquals(i32a, i32b));
    assertTrue(!irTypeEquals(i32a, i64));
    
    const boola = makeIRBoolType();
    const boolb = makeIRBoolType();
    assertTrue(irTypeEquals(boola, boolb));
    
    const unita = makeIRUnitType();
    const unitb = makeIRUnitType();
    assertTrue(irTypeEquals(unita, unitb));
});

test('irTypeEquals compares struct types', () => {
    resetIRIds();
    const fields1 = [makeIRIntType(IntWidth.I32)];
    const fields2 = [makeIRIntType(IntWidth.I32)];
    const fields3 = [makeIRIntType(IntWidth.I64)];
    
    const s1 = makeIRStructType('Foo', fields1);
    const s2 = makeIRStructType('Foo', fields2);
    const s3 = makeIRStructType('Foo', fields3);
    const s4 = makeIRStructType('Bar', fields1);
    
    assertTrue(irTypeEquals(s1, s2));
    assertTrue(!irTypeEquals(s1, s3));
    assertTrue(!irTypeEquals(s1, s4));
});

test('irTypeEquals compares array types', () => {
    resetIRIds();
    const a1 = makeIRArrayType(makeIRIntType(IntWidth.I32), 10);
    const a2 = makeIRArrayType(makeIRIntType(IntWidth.I32), 10);
    const a3 = makeIRArrayType(makeIRIntType(IntWidth.I32), 20);
    
    assertTrue(irTypeEquals(a1, a2));
    assertTrue(!irTypeEquals(a1, a3));
});

test('irTypeToString formats types correctly', () => {
    resetIRIds();
    assertEqual(irTypeToString(makeIRIntType(IntWidth.I32)), 'i32');
    assertEqual(irTypeToString(makeIRIntType(IntWidth.U8)), 'u8');
    assertEqual(irTypeToString(makeIRFloatType(FloatWidth.F32)), 'f32');
    assertEqual(irTypeToString(makeIRBoolType()), 'bool');
    assertEqual(irTypeToString(makeIRUnitType()), '()');
    assertEqual(irTypeToString(makeIRPtrType(makeIRIntType(IntWidth.I32))), '*i32');
});

test('irTypeToString formats array types', () => {
    resetIRIds();
    const ty = makeIRArrayType(makeIRIntType(IntWidth.I32), 5);
    assertEqual(irTypeToString(ty), '[i32; 5]');
});

test('irTypeToString formats function types', () => {
    resetIRIds();
    const ty = makeIRFnType([makeIRIntType(IntWidth.I32)], makeIRBoolType());
    assertEqual(irTypeToString(ty), 'fn(i32) -> bool');
});

test('isIRIntType checks integer types', () => {
    resetIRIds();
    assertTrue(isIRIntType(makeIRIntType(IntWidth.I32)));
    assertTrue(!isIRIntType(makeIRBoolType()));
});

test('isIRFloatType checks float types', () => {
    resetIRIds();
    assertTrue(isIRFloatType(makeIRFloatType(FloatWidth.F64)));
    assertTrue(!isIRFloatType(makeIRIntType(IntWidth.I32)));
});

test('isIRBoolType checks bool types', () => {
    resetIRIds();
    assertTrue(isIRBoolType(makeIRBoolType()));
    assertTrue(!isIRBoolType(makeIRIntType(IntWidth.I32)));
});

test('isIRPtrType checks pointer types', () => {
    resetIRIds();
    assertTrue(isIRPtrType(makeIRPtrType(makeIRIntType(IntWidth.I32))));
    assertTrue(!isIRPtrType(makeIRIntType(IntWidth.I32)));
});

test('isIRUnitType checks unit types', () => {
    resetIRIds();
    assertTrue(isIRUnitType(makeIRUnitType()));
    assertTrue(!isIRUnitType(makeIRIntType(IntWidth.I32)));
});

test('isIRStructType checks struct types', () => {
    resetIRIds();
    assertTrue(isIRStructType(makeIRStructType('Foo', [])));
    assertTrue(!isIRStructType(makeIRIntType(IntWidth.I32)));
});

test('isIREnumType checks enum types', () => {
    resetIRIds();
    assertTrue(isIREnumType(makeIREnumType('Option', [])));
    assertTrue(!isIREnumType(makeIRIntType(IntWidth.I32)));
});

test('isIRArrayType checks array types', () => {
    resetIRIds();
    assertTrue(isIRArrayType(makeIRArrayType(makeIRIntType(IntWidth.I32), 5)));
    assertTrue(!isIRArrayType(makeIRIntType(IntWidth.I32)));
});

test('isIRFnType checks function types', () => {
    resetIRIds();
    assertTrue(isIRFnType(makeIRFnType([], makeIRUnitType())));
    assertTrue(!isIRFnType(makeIRIntType(IntWidth.I32)));
});

export function runIRTypesTests() {
    const result = getResults();
    clearErrors();
    return 24;
}
