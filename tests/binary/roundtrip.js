import { serializeModule } from '../../ir_serialize.js';
import { deserializeModule } from '../../ir_deserialize.js';
import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    resetIRIds,
    makeIRModule,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRArrayType,
    irTypeEquals,
    addIRFunction,
    addIRBlock,
    makeIRBlock,
    addIRInstruction,
    setIRTerminator,
    makeIRFunction,
    addIRLocal,
    makeIRLocal,
} from '../../ir.js';
import { IntWidth, FloatWidth } from '../../types.js';
import { makeIconst, makeIadd } from '../../ir_instructions.js';
import { makeRet } from '../../ir_terminators.js';
import { test, assertEqual, assertTrue, getResults, clearErrors } from '../lib.js';

test('Roundtrip empty module', () => {
    resetIRIds();
    const module = makeIRModule('test_module');
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions.length, 0);
    assertEqual(result.value.globals.length, 0);
});

test('Roundtrip simple function', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'main', [], makeIRUnitType());
    const block = makeIRBlock(0);
    setIRTerminator(block, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions.length, 1);
    assertEqual(result.value.functions[0].name, 'main');
    assertEqual(result.value.functions[0].blocks.length, 1);
});

test('Roundtrip function with parameters', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const params = [
        { id: 0, name: 'x', ty: makeIRIntType(IntWidth.I32) },
        { id: 1, name: 'y', ty: makeIRIntType(IntWidth.I32) },
    ];
    const fn = makeIRFunction(0, 'add', params, makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    setIRTerminator(block, { kind: IRTermKind.Ret, value: 0 });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions[0].params.length, 2);
});

test('Roundtrip function with locals', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'test_fn', [], makeIRUnitType());
    addIRLocal(fn, makeIRLocal(0, makeIRIntType(IntWidth.I32), 'temp'));
    addIRLocal(fn, makeIRLocal(1, makeIRPtrType(makeIRIntType(IntWidth.I32)), 'ptr'));
    const block = makeIRBlock(0);
    setIRTerminator(block, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions[0].locals.length, 2);
});

test('Roundtrip function with instructions', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'add', [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    
    // Add some instructions
    addIRInstruction(block, makeIconst(42, IntWidth.I32));
    addIRInstruction(block, makeIconst(10, IntWidth.I32));
    addIRInstruction(block, makeIadd(0, 1, IntWidth.I32));
    setIRTerminator(block, { kind: IRTermKind.Ret, value: 2 });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    const deserializedFn = result.value.functions[0];
    assertEqual(deserializedFn.blocks[0].instructions.length, 3);
    assertEqual(deserializedFn.blocks[0].instructions[0].kind, IRInstKind.Iconst);
    assertEqual(deserializedFn.blocks[0].instructions[2].kind, IRInstKind.Iadd);
});

test('Roundtrip multiple functions', () => {
    resetIRIds();
    const module = makeIRModule('test');
    
    // Function 1
    const fn1 = makeIRFunction(0, 'fn1', [], makeIRUnitType());
    const block1 = makeIRBlock(0);
    setIRTerminator(block1, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn1, block1);
    addIRFunction(module, fn1);
    
    // Function 2
    const fn2 = makeIRFunction(1, 'fn2', [], makeIRIntType(IntWidth.I32));
    const block2 = makeIRBlock(0);
    addIRInstruction(block2, makeIconst(123, IntWidth.I32));
    setIRTerminator(block2, { kind: IRTermKind.Ret, value: 0 });
    addIRBlock(fn2, block2);
    addIRFunction(module, fn2);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions.length, 2);
    assertEqual(result.value.functions[0].name, 'fn1');
    assertEqual(result.value.functions[1].name, 'fn2');
});

test('Roundtrip multiple blocks', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'multi_block', [], makeIRUnitType());
    
    // Entry block
    const entry = makeIRBlock(0);
    addIRInstruction(entry, makeIconst(1, IntWidth.I32));
    setIRTerminator(entry, { kind: IRTermKind.Br, target: 1, args: [] });
    addIRBlock(fn, entry);
    
    // Second block
    const block1 = makeIRBlock(1);
    setIRTerminator(block1, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block1);
    
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions[0].blocks.length, 2);
    assertEqual(result.value.functions[0].blocks[0].terminator.kind, IRTermKind.Br);
    assertEqual(result.value.functions[0].blocks[0].terminator.target, 1);
});

test('Roundtrip BrIf terminator', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'brif_test', [], makeIRUnitType());
    
    const entry = makeIRBlock(0);
    addIRInstruction(entry, { kind: IRInstKind.Bconst, id: 0, ty: makeIRBoolType(), value: true });
    setIRTerminator(entry, {
        kind: IRTermKind.BrIf,
        cond: 0,
        thenBlock: 1,
        thenArgs: [],
        elseBlock: 2,
        elseArgs: [],
    });
    addIRBlock(fn, entry);
    
    const thenBlock = makeIRBlock(1);
    setIRTerminator(thenBlock, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, thenBlock);
    
    const elseBlock = makeIRBlock(2);
    setIRTerminator(elseBlock, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, elseBlock);
    
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    const term = result.value.functions[0].blocks[0].terminator;
    assertEqual(term.kind, IRTermKind.BrIf);
    assertEqual(term.cond, 0);
    assertEqual(term.thenBlock, 1);
    assertEqual(term.elseBlock, 2);
});

test('Roundtrip Switch terminator', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'switch_test', [], makeIRUnitType());
    
    const entry = makeIRBlock(0);
    addIRInstruction(entry, makeIconst(1, IntWidth.I32));
    setIRTerminator(entry, {
        kind: IRTermKind.Switch,
        value: 0,
        cases: [
            { value: BigInt(1), target: 1, args: [] },
            { value: BigInt(2), target: 2, args: [] },
        ],
        defaultBlock: 3,
        defaultArgs: [],
    });
    addIRBlock(fn, entry);
    
    for (let i = 1; i <= 3; i++) {
        const block = makeIRBlock(i);
        setIRTerminator(block, { kind: IRTermKind.Ret, value: null });
        addIRBlock(fn, block);
    }
    
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    const term = result.value.functions[0].blocks[0].terminator;
    assertEqual(term.kind, IRTermKind.Switch);
    assertEqual(term.cases.length, 2);
    assertEqual(term.cases[0].value, BigInt(1));
    assertEqual(term.cases[1].value, BigInt(2));
    assertEqual(term.defaultBlock, 3);
});

test('Roundtrip block parameters', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'block_params', [], makeIRUnitType());
    
    const entry = makeIRBlock(0);
    setIRTerminator(entry, { kind: IRTermKind.Br, target: 1, args: [0] });
    addIRBlock(fn, entry);
    
    const block1 = makeIRBlock(1);
    block1.params.push({ id: 1, ty: makeIRIntType(IntWidth.I32) });
    setIRTerminator(block1, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block1);
    
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions[0].blocks[1].params.length, 1);
    assertEqual(result.value.functions[0].blocks[1].params[0].id, 1);
});

test('Roundtrip struct definitions', () => {
    resetIRIds();
    const module = makeIRModule('test');
    module.structs.set('Point', {
        name: 'Point',
        fields: [
            { ty: makeIRIntType(IntWidth.I32) },
            { ty: makeIRIntType(IntWidth.I32) },
        ],
    });
    module.structs.set('Color', {
        name: 'Color',
        fields: [
            { ty: makeIRIntType(IntWidth.U8) },
            { ty: makeIRIntType(IntWidth.U8) },
            { ty: makeIRIntType(IntWidth.U8) },
        ],
    });
    
    const fn = makeIRFunction(0, 'test', [], makeIRUnitType());
    const block = makeIRBlock(0);
    setIRTerminator(block, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.structs.size, 2);
    assertTrue(result.value.structs.has('Point'));
    assertTrue(result.value.structs.has('Color'));
    assertEqual(result.value.structs.get('Point').fields.length, 2);
});

test('Roundtrip enum definitions', () => {
    resetIRIds();
    const module = makeIRModule('test');
    module.enums.set('Option', {
        name: 'Option',
        variants: [
            { name: 'None', fields: [] },
            { name: 'Some', fields: [makeIRIntType(IntWidth.I32)] },
        ],
    });
    module.enums.set('Result', {
        name: 'Result',
        variants: [
            { name: 'Ok', fields: [makeIRIntType(IntWidth.I32)] },
            { name: 'Err', fields: [makeIRIntType(IntWidth.I32)] },
        ],
    });
    
    const fn = makeIRFunction(0, 'test', [], makeIRUnitType());
    const block = makeIRBlock(0);
    setIRTerminator(block, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.enums.size, 2);
    assertTrue(result.value.enums.has('Option'));
    assertTrue(result.value.enums.has('Result'));
    assertEqual(result.value.enums.get('Option').variants.length, 2);
});

test('Roundtrip globals', () => {
    resetIRIds();
    const module = makeIRModule('test');
    module.globals.push({
        name: 'COUNTER',
        ty: makeIRIntType(IntWidth.I32),
        init: BigInt(0),
    });
    module.globals.push({
        name: 'PI',
        ty: makeIRFloatType(FloatWidth.F64),
        init: 3.141592653589793,
    });
    
    const fn = makeIRFunction(0, 'test', [], makeIRUnitType());
    const block = makeIRBlock(0);
    setIRTerminator(block, { kind: IRTermKind.Ret, value: null });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.globals.length, 2);
    assertEqual(result.value.globals[0].name, 'COUNTER');
    assertEqual(result.value.globals[0].init, BigInt(0));
    assertEqual(result.value.globals[1].name, 'PI');
    assertEqual(result.value.globals[1].init, 3.141592653589793);
});

test('Roundtrip preserves binary size consistency', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = makeIRFunction(0, 'test', [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    addIRInstruction(block, makeIconst(42, IntWidth.I32));
    addIRInstruction(block, makeIadd(0, 0, IntWidth.I32));
    setIRTerminator(block, { kind: IRTermKind.Ret, value: 1 });
    addIRBlock(fn, block);
    addIRFunction(module, fn);
    
    const data1 = serializeModule(module);
    const data2 = serializeModule(module);
    
    // Serializing the same module twice should produce identical output
    assertEqual(data1.length, data2.length);
    for (let i = 0; i < data1.length; i++) {
        assertEqual(data1[i], data2[i], `Byte mismatch at position ${i}`);
    }
});

test('Roundtrip complex module', () => {
    resetIRIds();
    const module = makeIRModule('complex_test');
    
    // Add struct
    module.structs.set('Data', {
        name: 'Data',
        fields: [
            { ty: makeIRIntType(IntWidth.I32) },
            { ty: makeIRArrayType(makeIRIntType(IntWidth.U8), 16) },
        ],
    });
    
    // Add enum
    module.enums.set('Status', {
        name: 'Status',
        variants: [
            { name: 'Ok', fields: [] },
            { name: 'Error', fields: [makeIRIntType(IntWidth.I32)] },
        ],
    });
    
    // Add global
    module.globals.push({
        name: 'VERSION',
        ty: makeIRIntType(IntWidth.I32),
        init: BigInt(1),
    });
    
    // Add function with multiple blocks and instructions
    const fn = makeIRFunction(0, 'process', [
        { id: 0, name: 'input', ty: makeIRIntType(IntWidth.I32) },
    ], makeIRIntType(IntWidth.I32));
    
    addIRLocal(fn, makeIRLocal(0, makeIRIntType(IntWidth.I32), 'result'));
    
    const entry = makeIRBlock(0);
    addIRInstruction(entry, makeIconst(0, IntWidth.I32));
    setIRTerminator(entry, { kind: IRTermKind.Br, target: 1, args: [1] });
    addIRBlock(fn, entry);
    
    const loop = makeIRBlock(1);
    loop.params.push({ id: 2, ty: makeIRIntType(IntWidth.I32) });
    addIRInstruction(loop, makeIadd(2, 0, IntWidth.I32));
    setIRTerminator(loop, { kind: IRTermKind.Ret, value: 3 });
    addIRBlock(fn, loop);
    
    addIRFunction(module, fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions.length, 1);
    assertEqual(result.value.structs.size, 1);
    assertEqual(result.value.enums.size, 1);
    assertEqual(result.value.globals.length, 1);
    assertEqual(result.value.functions[0].blocks.length, 2);
    assertEqual(result.value.functions[0].params.length, 1);
    assertEqual(result.value.functions[0].locals.length, 1);
});

export function runRoundtripTests() {
    const result = getResults();
    clearErrors();
    return 15;
}