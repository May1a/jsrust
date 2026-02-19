import {
    assertEqual,
    assertTrue,
} from '../lib.js';
import {
    IRBuilder,
} from '../../ir_builder.js';
import {
    IntWidth,
    FloatWidth,
} from '../../types.js';

// ============================================================================
// Constant Instruction Tests
// ============================================================================

export function testIconst() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const value = builder.iconst(42, IntWidth.I32);
    builder.ret(value);

    const fn = builder.build();
    assertEqual(fn.blocks.length, 1);
    assertEqual(fn.blocks[0].instructions.length, 1);
    assertEqual(fn.blocks[0].instructions[0].value, 42);
}

export function testFconst() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const value = builder.fconst(3.14, FloatWidth.F64);
    builder.ret(value);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].value, 3.14);
}

export function testBconst() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'bool');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const value = builder.bconst(true);
    builder.ret(value);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].value, true);
}

export function testNull() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'ptr');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const value = builder.null('*i8');
    builder.ret(value);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 3); // Null
}

// ============================================================================
// Arithmetic Instruction Tests
// ============================================================================

export function testIadd() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(2, IntWidth.I32);
    const b = builder.iconst(3, IntWidth.I32);
    const sum = builder.iadd(a, b, IntWidth.I32);
    builder.ret(sum);

    const fn = builder.build();
    const [instr] = fn.blocks[0].instructions;
    assertEqual(instr.kind, 4); // Iadd
    assertEqual(instr.a, a);
    assertEqual(instr.b, b);
}

export function testIsub() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(5, IntWidth.I32);
    const b = builder.iconst(3, IntWidth.I32);
    const diff = builder.isub(a, b, IntWidth.I32);
    builder.ret(diff);

    const fn = builder.build();
    const [instr] = fn.blocks[0].instructions;
    assertEqual(instr.kind, 5); // Isub
}

export function testImul() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(4, IntWidth.I32);
    const b = builder.iconst(3, IntWidth.I32);
    const prod = builder.imul(a, b, IntWidth.I32);
    builder.ret(prod);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 6); // Imul
}

export function testIdiv() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(10, IntWidth.I32);
    const b = builder.iconst(2, IntWidth.I32);
    const quot = builder.idiv(a, b, IntWidth.I32);
    builder.ret(quot);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 7); // Idiv
}

export function testImod() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(10, IntWidth.I32);
    const b = builder.iconst(3, IntWidth.I32);
    const rem = builder.imod(a, b, IntWidth.I32);
    builder.ret(rem);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 8); // Imod
}

export function testFadd() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.fconst(1.5, FloatWidth.F64);
    const b = builder.fconst(2.5, FloatWidth.F64);
    const sum = builder.fadd(a, b, FloatWidth.F64);
    builder.ret(sum);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 9); // Fadd
}

export function testFsub() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.fconst(5.5, FloatWidth.F64);
    const b = builder.fconst(2.0, FloatWidth.F64);
    const diff = builder.fsub(a, b, FloatWidth.F64);
    builder.ret(diff);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 10); // Fsub
}

export function testFmul() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.fconst(3.0, FloatWidth.F64);
    const b = builder.fconst(4.0, FloatWidth.F64);
    const prod = builder.fmul(a, b, FloatWidth.F64);
    builder.ret(prod);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 11); // Fmul
}

export function testFdiv() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.fconst(10.0, FloatWidth.F64);
    const b = builder.fconst(2.5, FloatWidth.F64);
    const quot = builder.fdiv(a, b, FloatWidth.F64);
    builder.ret(quot);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 12); // Fdiv
}

export function testIneg() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(42, IntWidth.I32);
    const neg = builder.ineg(a, IntWidth.I32);
    builder.ret(neg);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 13); // Ineg
}

export function testFneg() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.fconst(3.14, FloatWidth.F64);
    const neg = builder.fneg(a, FloatWidth.F64);
    builder.ret(neg);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 14); // Fneg
}

// ============================================================================
// Bitwise Instruction Tests
// ============================================================================

export function testIand() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(0b1100, IntWidth.I32);
    const b = builder.iconst(0b1010, IntWidth.I32);
    const and = builder.iand(a, b, IntWidth.I32);
    builder.ret(and);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 15); // Iand
}

export function testIor() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(0b1100, IntWidth.I32);
    const b = builder.iconst(0b1010, IntWidth.I32);
    const or = builder.ior(a, b, IntWidth.I32);
    builder.ret(or);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 16); // Ior
}

export function testIxor() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(0b1100, IntWidth.I32);
    const b = builder.iconst(0b1010, IntWidth.I32);
    const xor = builder.ixor(a, b, IntWidth.I32);
    builder.ret(xor);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 17); // Ixor
}

export function testIshl() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(1, IntWidth.I32);
    const b = builder.iconst(3, IntWidth.I32);
    const shl = builder.ishl(a, b, IntWidth.I32);
    builder.ret(shl);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 18); // Ishl
}

export function testIshr() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(8, IntWidth.I32);
    const b = builder.iconst(2, IntWidth.I32);
    const shr = builder.ishr(a, b, IntWidth.I32);
    builder.ret(shr);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 19); // Ishr
}

// ============================================================================
// Comparison Instruction Tests
// ============================================================================

export function testIcmp() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'bool');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.iconst(5, IntWidth.I32);
    const b = builder.iconst(3, IntWidth.I32);
    const cmp = builder.icmp(2, a, b); // Slt
    builder.ret(cmp);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 20); // Icmp
    assertEqual(fn.blocks[0].instructions[0].op, 2); // Slt
}

export function testFcmp() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'bool');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const a = builder.fconst(1.5, FloatWidth.F64);
    const b = builder.fconst(2.5, FloatWidth.F64);
    const cmp = builder.fcmp(2, a, b); // Olt
    builder.ret(cmp);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 21); // Fcmp
    assertEqual(fn.blocks[0].instructions[0].op, 2); // Olt
}

// ============================================================================
// Memory Instruction Tests
// ============================================================================

export function testAlloca() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'ptr');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const ptr = builder.alloca('i32', 0);
    builder.ret(ptr);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 22); // Alloca
}

export function testLoad() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const ptr = builder.alloca('i32', 0);
    const load = builder.load(ptr, { kind: 0, width: IntWidth.I32 });
    builder.ret(load);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 23); // Load
}

export function testStore() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'unit');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const ptr = builder.alloca('i32', 0);
    const value = builder.iconst(42, IntWidth.I32);
    builder.store(ptr, value, { kind: 0, width: IntWidth.I32 });
    builder.unreachable();

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 24); // Store
}

export function testMemcpy() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'unit');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const dest = builder.alloca('i8', 1);
    const src = builder.alloca('i8', 2);
    const size = builder.iconst(10, IntWidth.I32);
    builder.memcpy(dest, src, size);
    builder.unreachable();

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 25); // Memcpy
}

// ============================================================================
// Address Instruction Tests
// ============================================================================

export function testGep() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'ptr');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const ptr = builder.alloca('*i32', 0);
    const indices = [0, 2];
    const gep = builder.gep(ptr, indices, 'i32');
    builder.ret(gep);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 26); // Gep
}

export function testPtradd() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'ptr');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const ptr = builder.alloca('*i8', 0);
    const offset = builder.iconst(10, IntWidth.I32);
    const ptrAdd = builder.ptradd(ptr, offset);
    builder.ret(ptrAdd);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 27); // Ptradd
}

// ============================================================================
// Conversion Instruction Tests
// ============================================================================

export function testTrunc() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i16');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.iconst(12345, IntWidth.I32);
    const truncated = builder.trunc(val, { kind: 0, width: IntWidth.I32 }, { kind: 0, width: IntWidth.I16 });
    builder.ret(truncated);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 28); // Trunc
}

export function testSext() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.iconst(42, IntWidth.I32);
    const extended = builder.sext(val, { kind: 0, width: IntWidth.I32 }, { kind: 0, width: IntWidth.I64 });
    builder.ret(extended);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 29); // Sext
}

export function testZext() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.iconst(42, IntWidth.I32);
    const extended = builder.zext(val, { kind: 0, width: IntWidth.I32 }, { kind: 0, width: IntWidth.I64 });
    builder.ret(extended);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 30); // Zext
}

export function testFptoui() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.fconst(3.14, FloatWidth.F64);
    const converted = builder.fptoui(val, { kind: 0, width: IntWidth.I32 });
    builder.ret(converted);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 31); // Fptoui
}

export function testFptosi() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.fconst(3.14, FloatWidth.F64);
    const converted = builder.fptosi(val, { kind: 0, width: IntWidth.I32 });
    builder.ret(converted);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 32); // Fptosi
}

export function testUitofp() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.iconst(42, IntWidth.I32);
    const converted = builder.uitofp(val, { kind: 1, width: FloatWidth.F64 });
    builder.ret(converted);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 33); // Uitofp
}

export function testSitofp() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.iconst(42, IntWidth.I32);
    const converted = builder.sitofp(val, { kind: 1, width: FloatWidth.F64 });
    builder.ret(converted);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 34); // Sitofp
}

export function testBitcast() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'f64');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const val = builder.iconst(42, IntWidth.I32);
    const casted = builder.bitcast(val, { kind: 1, width: FloatWidth.F64 });
    builder.ret(casted);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 35); // Bitcast
}

// ============================================================================
// Call Instruction Tests
// ============================================================================

export function testCall() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const fnId = 123;
    const arg = builder.iconst(10, IntWidth.I32);
    const result = builder.call(fnId, [arg], { kind: 0, width: IntWidth.I32 });
    builder.ret(result);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 36); // Call
    assertEqual(fn.blocks[0].instructions[0].args.length, 1);
}

export function testCallVoid() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'unit');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const fnId = 123;
    builder.call(fnId, [], null);
    builder.unreachable();

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 36); // Call
    assertEqual(fn.blocks[0].instructions[0].id, null);
}

// ============================================================================
// Struct/Enum Instruction Tests
// ============================================================================

export function testStructCreate() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'struct Point');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const field1 = builder.iconst(1, IntWidth.I32);
    const field2 = builder.iconst(2, IntWidth.I32);
    const struct = builder.structCreate([field1, field2], { kind: 5, name: 'Point', fields: [
        { kind: 0, width: IntWidth.I32 },
        { kind: 0, width: IntWidth.I32 }
    ]});
    builder.ret(struct);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 37); // StructCreate
}

export function testStructGet() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const field1 = builder.iconst(1, IntWidth.I32);
    const field2 = builder.iconst(2, IntWidth.I32);
    const struct = builder.structCreate([field1, field2], { kind: 5, name: 'Point', fields: [
        { kind: 0, width: IntWidth.I32 },
        { kind: 0, width: IntWidth.I32 }
    ]});
    const got = builder.structGet(struct, 1, { kind: 0, width: IntWidth.I32 });
    builder.ret(got);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 38); // StructGet
    assertEqual(fn.blocks[0].instructions[1].fieldIndex, 1);
}

export function testEnumCreate() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'enum Option');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const variant = 0; // Some
    const data = builder.iconst(42, IntWidth.I32);
    const enum_ = builder.enumCreate(variant, data, { kind: 6, name: 'Option', variants: [[{ kind: 0, width: IntWidth.I32 }]] });
    builder.ret(enum_);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[0].kind, 39); // EnumCreate
}

export function testEnumGetTag() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const data = builder.iconst(42, IntWidth.I32);
    const enum_ = builder.enumCreate(0, data, { kind: 6, name: 'Option', variants: [[{ kind: 0, width: IntWidth.I32 }]] });
    const tag = builder.enumGetTag(enum_);
    builder.ret(tag);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 40); // EnumGetTag
}

export function testEnumGetData() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const data = builder.iconst(42, IntWidth.I32);
    const enum_ = builder.enumCreate(0, data, { kind: 6, name: 'Option', variants: [[{ kind: 0, width: IntWidth.I32 }]] });
    const gotData = builder.enumGetData(enum_, 0, 0, { kind: 0, width: IntWidth.I32 });
    builder.ret(gotData);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 41); // EnumGetData
}

// ============================================================================
// Memory & Variable Tests
// ============================================================================

export function testVariableDeclAndUse() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    builder.declareVar('x', { kind: 0, width: IntWidth.I32 });
    const value = builder.iconst(42, IntWidth.I32);
    builder.defineVar('x', value);
    const used = builder.useVar('x');
    builder.ret(used);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions.length, 2); // iconst + (phi or direct use)
}

export function testAllocaAndStoreLoad() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);

    const ptr = builder.alloca('i32', 0);
    const value = builder.iconst(42, IntWidth.I32);
    builder.store(ptr, value, { kind: 0, width: IntWidth.I32 });
    const loaded = builder.load(ptr, { kind: 0, width: IntWidth.I32 });
    builder.ret(loaded);

    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions.length, 3);
}

// ============================================================================
// Terminators
// ============================================================================

export function testRet() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'i32');
    builder.createBlock('entry');
    builder.switchToBlock(0);
    builder.ret(builder.iconst(42, IntWidth.I32));
    const fn = builder.build();
    assertEqual(fn.blocks[0].terminator.kind, 0); // Ret
}

export function testBr() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'unit');
    builder.createBlock('entry');
    builder.createBlock('then');
    builder.switchToBlock(0);
    builder.br(1);
    builder.switchToBlock(1);
    builder.unreachable();
    const fn = builder.build();

    assertEqual(fn.blocks[0].terminator.kind, 1); // Br
    assertEqual(fn.blocks[0].terminator.target, 1);
}

export function testBrIf() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'unit');
    builder.createBlock('entry');
    builder.createBlock('then');
    builder.createBlock('else');
    builder.switchToBlock(0);
    builder.brIf(
        builder.bconst(true),
        1, [],
        2, []
    );
    builder.switchToBlock(1);
    builder.unreachable();
    builder.switchToBlock(2);
    builder.unreachable();
    const fn = builder.build();

    assertEqual(fn.blocks[0].terminator.kind, 2); // BrIf
    assertEqual(fn.blocks[0].terminator.thenBlock, 1);
    assertEqual(fn.blocks[0].terminator.elseBlock, 2);
}

export function testUnreachable() {
    const builder = new IRBuilder();
    builder.createFunction('test', [], 'unit');
    builder.createBlock('entry');
    builder.switchToBlock(0);
    builder.unreachable();
    const fn = builder.build();
    assertEqual(fn.blocks[0].terminator.kind, 4); // Unreachable
}

// ============================================================================
// Run Tests
// ============================================================================

export function runTests() {
    const tests = [
        ['Iconst', testIconst],
        ['Fconst', testFconst],
        ['Bconst', testBconst],
        ['Null', testNull],
        ['Iadd', testIadd],
        ['Isub', testIsub],
        ['Imul', testImul],
        ['Idiv', testIdiv],
        ['Imod', testImod],
        ['Fadd', testFadd],
        ['Fsub', testFsub],
        ['Fmul', testFmul],
        ['Fdiv', testFdiv],
        ['Ineg', testIneg],
        ['Fneg', testFneg],
        ['Iand', testIand],
        ['Ior', testIor],
        ['Ixor', testIxor],
        ['Ishl', testIshl],
        ['Ishr', testIshr],
        ['Icmp', testIcmp],
        ['Fcmp', testFcmp],
        ['Alloca', testAlloca],
        ['Load', testLoad],
        ['Store', testStore],
        ['Memcpy', testMemcpy],
        ['Gep', testGep],
        ['Ptradd', testPtradd],
        ['Trunc', testTrunc],
        ['Sext', testSext],
        ['Zext', testZext],
        ['Fptoui', testFptoui],
        ['Fptosi', testFptosi],
        ['Uitofp', testUitofp],
        ['Sitofp', testSitofp],
        ['Bitcast', testBitcast],
        ['Call', testCall],
        ['Call void', testCallVoid],
        ['StructCreate', testStructCreate],
        ['StructGet', testStructGet],
        ['EnumCreate', testEnumCreate],
        ['EnumGetTag', testEnumGetTag],
        ['EnumGetData', testEnumGetData],
        ['Variable decl and use', testVariableDeclAndUse],
        ['Alloca + store + load', testAllocaAndStoreLoad],
        ['Ret', testRet],
        ['Br', testBr],
        ['BrIf', testBrIf],
        ['Unreachable', testUnreachable],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, test] of tests) {
        try {
            test();
            passed++;
        } catch (e) {
            console.error(`  ✗ ${name}: ${e.message}`);
            failed++;
        }
    }

    return { passed, failed };
}
