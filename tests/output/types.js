import {
    printType,
} from '../../ir_printer.js';

import {
    IRTypeKind,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,
} from '../../ir.js';

import { IntWidth, FloatWidth } from '../../types.js';
import { test, assertEqual, getResults, clearErrors } from '../lib.js';

test('printType prints i32', () => {
    const ty = makeIRIntType(IntWidth.I32);
    assertEqual(printType(ty), 'i32');
});

test('printType prints i64', () => {
    const ty = makeIRIntType(IntWidth.I64);
    assertEqual(printType(ty), 'i64');
});

test('printType prints u8', () => {
    const ty = makeIRIntType(IntWidth.U8);
    assertEqual(printType(ty), 'u8');
});

test('printType prints usize', () => {
    const ty = makeIRIntType(IntWidth.Usize);
    assertEqual(printType(ty), 'usize');
});

test('printType prints f32', () => {
    const ty = makeIRFloatType(FloatWidth.F32);
    assertEqual(printType(ty), 'f32');
});

test('printType prints f64', () => {
    const ty = makeIRFloatType(FloatWidth.F64);
    assertEqual(printType(ty), 'f64');
});

test('printType prints bool', () => {
    const ty = makeIRBoolType();
    assertEqual(printType(ty), 'bool');
});

test('printType prints unit', () => {
    const ty = makeIRUnitType();
    assertEqual(printType(ty), '()');
});

test('printType prints pointer', () => {
    const inner = makeIRIntType(IntWidth.I32);
    const ty = makeIRPtrType(inner);
    assertEqual(printType(ty), '*i32');
});

test('printType prints raw pointer', () => {
    const ty = makeIRPtrType(null);
    assertEqual(printType(ty), 'ptr');
});

test('printType prints struct', () => {
    const ty = makeIRStructType('Point', [
        makeIRIntType(IntWidth.I32),
        makeIRIntType(IntWidth.I32),
    ]);
    assertEqual(printType(ty), 'Point');
});

test('printType prints enum', () => {
    const ty = makeIREnumType('Option', [
        [],
        [makeIRIntType(IntWidth.I32)],
    ]);
    assertEqual(printType(ty), 'Option');
});

test('printType prints array', () => {
    const ty = makeIRArrayType(makeIRIntType(IntWidth.I32), 10);
    assertEqual(printType(ty), '[i32; 10]');
});

test('printType prints function type', () => {
    const ty = makeIRFnType(
        [makeIRIntType(IntWidth.I32), makeIRIntType(IntWidth.I32)],
        makeIRIntType(IntWidth.I32)
    );
    assertEqual(printType(ty), 'fn(i32, i32) -> i32');
});

test('printType prints void function type', () => {
    const ty = makeIRFnType([], makeIRUnitType());
    assertEqual(printType(ty), 'fn() -> ()');
});

export function runOutputTypesTests() {
    const result = getResults();
    clearErrors();
    return 16;
}