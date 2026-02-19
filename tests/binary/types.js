import { IRSerializer, serializeModule } from '../../ir_serialize.js';
import { IRDeserializer, deserializeModule } from '../../ir_deserialize.js';
import {
    IRTypeKind,
    resetIRIds,
    makeIRModule,
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
} from '../../ir.js';
import { IntWidth, FloatWidth } from '../../types.js';
import { test, assertEqual, assertTrue, getResults, clearErrors } from '../lib.js';

test('Serialize and deserialize integer types', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRIntType(IntWidth.I32),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 }, // Ret with no value
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions.length, 1);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRIntType(IntWidth.I32)));
});

test('Serialize and deserialize float types', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRFloatType(FloatWidth.F64),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRFloatType(FloatWidth.F64)));
});

test('Serialize and deserialize bool type', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRBoolType(),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRBoolType()));
});

test('Serialize and deserialize unit type', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRUnitType(),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRUnitType()));
});

test('Serialize and deserialize pointer type', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRPtrType(null),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRPtrType(null)));
});

test('Serialize and deserialize array type', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRArrayType(makeIRIntType(IntWidth.I32), 10),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRArrayType(makeIRIntType(IntWidth.I32), 10)));
});

test('Serialize and deserialize function type', () => {
    resetIRIds();
    const module = makeIRModule('test');
    const fnType = makeIRFnType([makeIRIntType(IntWidth.I32), makeIRBoolType()], makeIRUnitType());
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: fnType,
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertTrue(irTypeEquals(result.value.functions[0].returnType, fnType));
});

test('Serialize and deserialize struct type reference', () => {
    resetIRIds();
    const module = makeIRModule('test');
    module.structs.set('Point', {
        name: 'Point',
        fields: [
            { ty: makeIRIntType(IntWidth.I32) },
            { ty: makeIRIntType(IntWidth.I32) },
        ],
    });
    
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIRStructType('Point', []),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions[0].returnType.kind, IRTypeKind.Struct);
    assertEqual(result.value.functions[0].returnType.name, 'Point');
    assertTrue(result.value.structs.has('Point'));
});

test('Serialize and deserialize enum type reference', () => {
    resetIRIds();
    const module = makeIRModule('test');
    module.enums.set('Option', {
        name: 'Option',
        variants: [
            { name: 'None', fields: [] },
            { name: 'Some', fields: [makeIRIntType(IntWidth.I32)] },
        ],
    });
    
    const fn = {
        id: 0,
        name: 'test_fn',
        params: [],
        returnType: makeIREnumType('Option', []),
        blocks: [{
            id: 0,
            params: [],
            instructions: [],
            terminator: { kind: 0 },
            predecessors: [],
            successors: [],
        }],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    
    const data = serializeModule(module);
    const result = deserializeModule(data);
    
    assertTrue(result.ok);
    assertEqual(result.value.functions[0].returnType.kind, IRTypeKind.Enum);
    assertEqual(result.value.functions[0].returnType.name, 'Option');
    assertTrue(result.value.enums.has('Option'));
});

test('Serialize and deserialize all integer widths', () => {
    resetIRIds();
    const widths = [
        IntWidth.I8, IntWidth.I16, IntWidth.I32, IntWidth.I64, IntWidth.I128, IntWidth.Isize,
        IntWidth.U8, IntWidth.U16, IntWidth.U32, IntWidth.U64, IntWidth.U128, IntWidth.Usize,
    ];
    
    for (const width of widths) {
        const module = makeIRModule('test');
        const fn = {
            id: 0,
            name: 'test_fn',
            params: [],
            returnType: makeIRIntType(width),
            blocks: [{
                id: 0,
                params: [],
                instructions: [],
                terminator: { kind: 0 },
                predecessors: [],
                successors: [],
            }],
            locals: [],
            entry: null,
        };
        module.functions.push(fn);
        
        const data = serializeModule(module);
        const result = deserializeModule(data);
        
        assertTrue(result.ok, `Failed for width ${width}`);
        assertTrue(irTypeEquals(result.value.functions[0].returnType, makeIRIntType(width)), `Type mismatch for width ${width}`);
    }
});

export function runTypesTests() {
    const result = getResults();
    clearErrors();
    return 10;
}