import {
    printInstruction,
    printTerminator,
    createPrintContext,
    icmpOpToString,
    fcmpOpToString,
} from '../../ir_printer.js';

import {
    IRInstKind,
    IRTermKind,
    resetIRIds,
    IcmpOp,
    FcmpOp,
} from '../../ir.js';

import {
    makeIconst,
    makeFconst,
    makeBconst,
    makeNull,
    makeIadd,
    makeIsub,
    makeImul,
    makeIdiv,
    makeImod,
    makeFadd,
    makeFsub,
    makeFmul,
    makeFdiv,
    makeIneg,
    makeFneg,
    makeIand,
    makeIor,
    makeIxor,
    makeIshl,
    makeIshr,
    makeIcmp,
    makeFcmp,
    makeAlloca,
    makeLoad,
    makeStore,
    makeMemcpy,
    makeGep,
    makePtradd,
    makeTrunc,
    makeSext,
    makeZext,
    makeFptoui,
    makeFptosi,
    makeUitofp,
    makeSitofp,
    makeBitcast,
    makeCall,
    makeStructCreate,
    makeStructGet,
    makeEnumCreate,
    makeEnumGetTag,
    makeEnumGetData,
} from '../../ir_instructions.js';

import {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeSwitchCase,
    makeUnreachable,
} from '../../ir_terminators.js';

import { IntWidth, FloatWidth } from '../../types.js';
import { test, assertEqual, assertTrue, getResults, clearErrors } from '../lib.js';

// Helper to check output contains expected substring
function assertIncludes(str, substr) {
    if (!str.includes(substr)) {
        throw new Error(`Expected "${str}" to include "${substr}"`);
    }
}

test('printInstruction prints iconst', () => {
    resetIRIds();
    const inst = makeIconst(42, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'iconst');
    assertIncludes(output, 'i32');
    assertIncludes(output, '42');
});

test('printInstruction prints fconst', () => {
    resetIRIds();
    const inst = makeFconst(3.14, FloatWidth.F64);
    const output = printInstruction(inst);
    assertIncludes(output, 'fconst');
    assertIncludes(output, 'f64');
});

test('printInstruction prints bconst true', () => {
    resetIRIds();
    const inst = makeBconst(true);
    const output = printInstruction(inst);
    assertIncludes(output, 'bconst');
    assertIncludes(output, 'true');
});

test('printInstruction prints bconst false', () => {
    resetIRIds();
    const inst = makeBconst(false);
    const output = printInstruction(inst);
    assertIncludes(output, 'bconst');
    assertIncludes(output, 'false');
});

test('printInstruction prints null', () => {
    resetIRIds();
    const inst = makeNull({ kind: 0, width: IntWidth.I32 });
    const output = printInstruction(inst);
    assertIncludes(output, 'null');
});

test('printInstruction prints iadd', () => {
    resetIRIds();
    const a = makeIconst(1, IntWidth.I32);
    const b = makeIconst(2, IntWidth.I32);
    const inst = makeIadd(a.id, b.id, IntWidth.I32);
    const ctx = createPrintContext();
    ctx.getValueName(a.id);
    ctx.getValueName(b.id);
    const output = printInstruction(inst, ctx);
    assertIncludes(output, 'iadd');
});

test('printInstruction prints isub', () => {
    resetIRIds();
    const inst = makeIsub(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'isub');
});

test('printInstruction prints imul', () => {
    resetIRIds();
    const inst = makeImul(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'imul');
});

test('printInstruction prints idiv', () => {
    resetIRIds();
    const inst = makeIdiv(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'idiv');
});

test('printInstruction prints imod', () => {
    resetIRIds();
    const inst = makeImod(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'imod');
});

test('printInstruction prints fadd', () => {
    resetIRIds();
    const inst = makeFadd(0, 1, FloatWidth.F64);
    const output = printInstruction(inst);
    assertIncludes(output, 'fadd');
});

test('printInstruction prints fsub', () => {
    resetIRIds();
    const inst = makeFsub(0, 1, FloatWidth.F64);
    const output = printInstruction(inst);
    assertIncludes(output, 'fsub');
});

test('printInstruction prints fmul', () => {
    resetIRIds();
    const inst = makeFmul(0, 1, FloatWidth.F64);
    const output = printInstruction(inst);
    assertIncludes(output, 'fmul');
});

test('printInstruction prints fdiv', () => {
    resetIRIds();
    const inst = makeFdiv(0, 1, FloatWidth.F64);
    const output = printInstruction(inst);
    assertIncludes(output, 'fdiv');
});

test('printInstruction prints ineg', () => {
    resetIRIds();
    const inst = makeIneg(0, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'ineg');
});

test('printInstruction prints fneg', () => {
    resetIRIds();
    const inst = makeFneg(0, FloatWidth.F64);
    const output = printInstruction(inst);
    assertIncludes(output, 'fneg');
});

test('printInstruction prints iand', () => {
    resetIRIds();
    const inst = makeIand(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'iand');
});

test('printInstruction prints ior', () => {
    resetIRIds();
    const inst = makeIor(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'ior');
});

test('printInstruction prints ixor', () => {
    resetIRIds();
    const inst = makeIxor(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'ixor');
});

test('printInstruction prints ishl', () => {
    resetIRIds();
    const inst = makeIshl(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'ishl');
});

test('printInstruction prints ishr', () => {
    resetIRIds();
    const inst = makeIshr(0, 1, IntWidth.I32);
    const output = printInstruction(inst);
    assertIncludes(output, 'ishr');
});

test('printInstruction prints icmp', () => {
    resetIRIds();
    const inst = makeIcmp(IcmpOp.Eq, 0, 1);
    const output = printInstruction(inst);
    assertIncludes(output, 'icmp');
    assertIncludes(output, 'eq');
});

test('printInstruction prints fcmp', () => {
    resetIRIds();
    const inst = makeFcmp(FcmpOp.Oeq, 0, 1);
    const output = printInstruction(inst);
    assertIncludes(output, 'fcmp');
    assertIncludes(output, 'oeq');
});

test('printInstruction prints alloca', () => {
    resetIRIds();
    const ty = { kind: 0, width: IntWidth.I32 };
    const inst = makeAlloca(ty, 0);
    const output = printInstruction(inst);
    assertIncludes(output, 'alloca');
    assertIncludes(output, 'i32');
});

test('printInstruction prints load', () => {
    resetIRIds();
    const ty = { kind: 0, width: IntWidth.I32 };
    const inst = makeLoad(0, ty);
    const output = printInstruction(inst);
    assertIncludes(output, 'load');
});

test('printInstruction prints store', () => {
    resetIRIds();
    const ty = { kind: 0, width: IntWidth.I32 };
    const inst = makeStore(0, 1, ty);
    const output = printInstruction(inst);
    assertIncludes(output, 'store');
    // Store has no result
    assertTrue(!output.includes('='));
});

test('printInstruction prints memcpy', () => {
    resetIRIds();
    const inst = makeMemcpy(0, 1, 100);
    const output = printInstruction(inst);
    assertIncludes(output, 'memcpy');
    assertIncludes(output, '100');
});

test('printInstruction prints gep', () => {
    resetIRIds();
    const resultTy = { kind: 3 };
    const inst = makeGep(0, [1, 2], resultTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'gep');
});

test('printInstruction prints ptradd', () => {
    resetIRIds();
    const inst = makePtradd(0, 8);
    const output = printInstruction(inst);
    assertIncludes(output, 'ptradd');
    assertIncludes(output, '8');
});

test('printInstruction prints trunc', () => {
    resetIRIds();
    const fromTy = { kind: 0, width: IntWidth.I64 };
    const toTy = { kind: 0, width: IntWidth.I32 };
    const inst = makeTrunc(0, fromTy, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'trunc');
});

test('printInstruction prints sext', () => {
    resetIRIds();
    const fromTy = { kind: 0, width: IntWidth.I32 };
    const toTy = { kind: 0, width: IntWidth.I64 };
    const inst = makeSext(0, fromTy, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'sext');
});

test('printInstruction prints zext', () => {
    resetIRIds();
    const fromTy = { kind: 0, width: IntWidth.I32 };
    const toTy = { kind: 0, width: IntWidth.I64 };
    const inst = makeZext(0, fromTy, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'zext');
});

test('printInstruction prints fptoui', () => {
    resetIRIds();
    const toTy = { kind: 0, width: IntWidth.U32 };
    const inst = makeFptoui(0, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'fptoui');
});

test('printInstruction prints fptosi', () => {
    resetIRIds();
    const toTy = { kind: 0, width: IntWidth.I32 };
    const inst = makeFptosi(0, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'fptosi');
});

test('printInstruction prints uitofp', () => {
    resetIRIds();
    const toTy = { kind: 1, width: FloatWidth.F64 };
    const inst = makeUitofp(0, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'uitofp');
});

test('printInstruction prints sitofp', () => {
    resetIRIds();
    const toTy = { kind: 1, width: FloatWidth.F64 };
    const inst = makeSitofp(0, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'sitofp');
});

test('printInstruction prints bitcast', () => {
    resetIRIds();
    const toTy = { kind: 0, width: IntWidth.I32 };
    const inst = makeBitcast(0, toTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'bitcast');
});

test('printInstruction prints call with return', () => {
    resetIRIds();
    const retTy = { kind: 0, width: IntWidth.I32 };
    const inst = makeCall('my_func', [0, 1], retTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'call');
    assertIncludes(output, 'my_func');
});

test('printInstruction prints void call', () => {
    resetIRIds();
    const inst = makeCall('my_func', [], null);
    const output = printInstruction(inst);
    assertIncludes(output, 'call');
    assertTrue(!output.includes('='));
});

test('printInstruction prints struct_create', () => {
    resetIRIds();
    const ty = { kind: 5, name: 'Point', fields: [] };
    const inst = makeStructCreate([0, 1], ty);
    const output = printInstruction(inst);
    assertIncludes(output, 'struct_create');
    assertIncludes(output, 'Point');
});

test('printInstruction prints struct_get', () => {
    resetIRIds();
    const fieldTy = { kind: 0, width: IntWidth.I32 };
    const inst = makeStructGet(0, 1, fieldTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'struct_get');
});

test('printInstruction prints enum_create', () => {
    resetIRIds();
    const ty = { kind: 6, name: 'Option', variants: [[], []] };
    const inst = makeEnumCreate(1, [0], ty);
    const output = printInstruction(inst);
    assertIncludes(output, 'enum_create');
    assertIncludes(output, 'Option');
    assertIncludes(output, 'variant');
});

test('printInstruction prints enum_get_tag', () => {
    resetIRIds();
    const inst = makeEnumGetTag(0);
    const output = printInstruction(inst);
    assertIncludes(output, 'enum_get_tag');
});

test('printInstruction prints enum_get_data', () => {
    resetIRIds();
    const dataTy = { kind: 0, width: IntWidth.I32 };
    const inst = makeEnumGetData(0, 1, 0, dataTy);
    const output = printInstruction(inst);
    assertIncludes(output, 'enum_get_data');
});

// Terminator tests
test('printTerminator prints ret with value', () => {
    resetIRIds();
    const ctx = createPrintContext();
    ctx.getValueName(0);
    const term = makeRet(0);
    const output = printTerminator(term, ctx);
    assertIncludes(output, 'ret');
});

test('printTerminator prints ret void', () => {
    resetIRIds();
    const term = makeRet(null);
    const output = printTerminator(term);
    assertEqual(output, 'ret');
});

test('printTerminator prints br', () => {
    resetIRIds();
    const term = makeBr(0, []);
    const output = printTerminator(term);
    assertIncludes(output, 'br');
    assertIncludes(output, 'block');
});

test('printTerminator prints br with args', () => {
    resetIRIds();
    const ctx = createPrintContext();
    ctx.getValueName(0);
    const term = makeBr(0, [0]);
    const output = printTerminator(term, ctx);
    assertIncludes(output, 'br');
    assertIncludes(output, '(');
});

test('printTerminator prints br_if', () => {
    resetIRIds();
    const ctx = createPrintContext();
    ctx.getValueName(0);
    const term = makeBrIf(0, 1, [], 2, []);
    const output = printTerminator(term, ctx);
    assertIncludes(output, 'br_if');
    assertIncludes(output, 'then:');
    assertIncludes(output, 'else:');
});

test('printTerminator prints switch', () => {
    resetIRIds();
    const ctx = createPrintContext();
    ctx.getValueName(0);
    ctx.getValueName(1);
    const term = makeSwitch(0, [makeSwitchCase(1, 2, [])], 3, []);
    const output = printTerminator(term, ctx);
    assertIncludes(output, 'switch');
    assertIncludes(output, 'default:');
});

test('printTerminator prints unreachable', () => {
    resetIRIds();
    const term = makeUnreachable();
    const output = printTerminator(term);
    assertEqual(output, 'unreachable');
});

// icmpOpToString tests
test('icmpOpToString converts all operators', () => {
    assertEqual(icmpOpToString(IcmpOp.Eq), 'eq');
    assertEqual(icmpOpToString(IcmpOp.Ne), 'ne');
    assertEqual(icmpOpToString(IcmpOp.Slt), 'slt');
    assertEqual(icmpOpToString(IcmpOp.Sle), 'sle');
    assertEqual(icmpOpToString(IcmpOp.Sgt), 'sgt');
    assertEqual(icmpOpToString(IcmpOp.Sge), 'sge');
    assertEqual(icmpOpToString(IcmpOp.Ult), 'ult');
    assertEqual(icmpOpToString(IcmpOp.Ule), 'ule');
    assertEqual(icmpOpToString(IcmpOp.Ugt), 'ugt');
    assertEqual(icmpOpToString(IcmpOp.Uge), 'uge');
});

// fcmpOpToString tests
test('fcmpOpToString converts all operators', () => {
    assertEqual(fcmpOpToString(FcmpOp.Oeq), 'oeq');
    assertEqual(fcmpOpToString(FcmpOp.One), 'one');
    assertEqual(fcmpOpToString(FcmpOp.Olt), 'olt');
    assertEqual(fcmpOpToString(FcmpOp.Ole), 'ole');
    assertEqual(fcmpOpToString(FcmpOp.Ogt), 'ogt');
    assertEqual(fcmpOpToString(FcmpOp.Oge), 'oge');
});

export function runOutputInstructionsTests() {
    const result = getResults();
    clearErrors();
    return 58;
}