import {
    resetIRIds,
    makeIRModule,
    addIRFunction,
    makeIRFunction,
    makeIRParam,
    addIRBlock,
    makeIRBlock,
    addIRInstruction,
    setIRTerminator,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRUnitType,
    makeIRPtrType,
} from '../../ir.js';

import {
    makeIconst,
    makeFconst,
    makeBconst,
    makeIadd,
    makeFadd,
    makeIcmp,
    makeFcmp,
    makeLoad,
    makeStore,
    makeAlloca,
} from '../../ir_instructions.js';

import {
    makeRet,
} from '../../ir_terminators.js';

import {
    validateModule,
    ValidationErrorKind,
} from '../../ir_validate.js';

import { IntWidth, FloatWidth } from '../../types.js';
import { test, assertEqual, assertTrue, getResults, clearErrors } from '../lib.js';

test('type mismatch in binary operation', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'bad', [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    
    const a = makeIconst(1, IntWidth.I32);
    const b = makeFconst(2.0, FloatWidth.F32);
    // Trying to add int and float - type mismatch
    const add = makeIadd(a.id, b.id, IntWidth.I32);
    const ret = makeRet(add.id);
    
    addIRInstruction(block, a);
    addIRInstruction(block, b);
    addIRInstruction(block, add);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(!result.ok, 'Module should be invalid');
    assertTrue(result.errors.some(e => e.kind === ValidationErrorKind.TypeMismatch));
});

test('valid integer comparison', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'cmp', [], makeIRBoolType());
    const block = makeIRBlock(0);
    
    const a = makeIconst(1, IntWidth.I32);
    const b = makeIconst(2, IntWidth.I32);
    const cmp = makeIcmp(0, a.id, b.id); // Eq
    const ret = makeRet(cmp.id);
    
    addIRInstruction(block, a);
    addIRInstruction(block, b);
    addIRInstruction(block, cmp);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(result.ok, 'Module should be valid');
});

test('type mismatch in comparison', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'bad_cmp', [], makeIRBoolType());
    const block = makeIRBlock(0);
    
    const a = makeIconst(1, IntWidth.I32);
    const b = makeIconst(2, IntWidth.I64); // Different width
    const cmp = makeIcmp(0, a.id, b.id);
    const ret = makeRet(cmp.id);
    
    addIRInstruction(block, a);
    addIRInstruction(block, b);
    addIRInstruction(block, cmp);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(!result.ok, 'Module should be invalid');
    assertTrue(result.errors.some(e => e.kind === ValidationErrorKind.TypeMismatch));
});

test('valid float operation', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'fadd', [], makeIRFloatType(FloatWidth.F64));
    const block = makeIRBlock(0);
    
    const a = makeFconst(1.5, FloatWidth.F64);
    const b = makeFconst(2.5, FloatWidth.F64);
    const add = makeFadd(a.id, b.id, FloatWidth.F64);
    const ret = makeRet(add.id);
    
    addIRInstruction(block, a);
    addIRInstruction(block, b);
    addIRInstruction(block, add);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(result.ok, 'Module should be valid');
});

test('valid load and store', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'load_store', [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    
    const alloca = makeAlloca(makeIRIntType(IntWidth.I32), 0);
    const val = makeIconst(42, IntWidth.I32);
    const store = makeStore(alloca.id, val.id, makeIRIntType(IntWidth.I32));
    const loaded = makeLoad(alloca.id, makeIRIntType(IntWidth.I32));
    const ret = makeRet(loaded.id);
    
    addIRInstruction(block, alloca);
    addIRInstruction(block, val);
    addIRInstruction(block, store);
    addIRInstruction(block, loaded);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(result.ok, 'Module should be valid');
});

test('return type mismatch', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    // Function expects i32 return
    const fn = makeIRFunction(0, 'bad_ret', [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    
    // But returns f32
    const val = makeFconst(3.14, FloatWidth.F32);
    const ret = makeRet(val.id);
    
    addIRInstruction(block, val);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(!result.ok, 'Module should be invalid');
    assertTrue(result.errors.some(e => e.kind === ValidationErrorKind.TypeMismatch));
});

test('valid unit return', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'unit_fn', [], makeIRUnitType());
    const block = makeIRBlock(0);
    
    const ret = makeRet(null);
    
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(result.ok, 'Module should be valid');
});

test('valid pointer operations', () => {
    resetIRIds();
    const mod = makeIRModule('test');
    const fn = makeIRFunction(0, 'ptr_fn', [], makeIRPtrType(makeIRIntType(IntWidth.I32)));
    const block = makeIRBlock(0);
    
    const alloca = makeAlloca(makeIRIntType(IntWidth.I32), 0);
    const ret = makeRet(alloca.id);
    
    addIRInstruction(block, alloca);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);
    
    const result = validateModule(mod);
    assertTrue(result.ok, 'Module should be valid');
});

export function runValidationTypesTests() {
    const result = getResults();
    clearErrors();
    return 8;
}