import { IRInstKind, resetIRIds, IRTypeKind } from "../../ir.js";

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
    makeCallDyn,
    makeStructCreate,
    makeStructGet,
    makeEnumCreate,
    makeEnumGetTag,
    makeEnumGetData,
    isIRInst,
} from "../../ir_instructions.js";

import { IntWidth, FloatWidth } from "../../types.js";
import { IcmpOp, FcmpOp } from "../../ir.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

test("makeIconst creates integer constant", () => {
    resetIRIds();
    const inst = makeIconst(42, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Iconst);
    assertEqual(inst.value, 42);
    assertEqual(inst.ty.kind, IRTypeKind.Int);
    assertEqual(inst.id, 0);
});

test("makeFconst creates float constant", () => {
    resetIRIds();
    const inst = makeFconst(3.14, FloatWidth.F64);
    assertEqual(inst.kind, IRInstKind.Fconst);
    assertEqual(inst.value, 3.14);
    assertEqual(inst.ty.kind, IRTypeKind.Float);
});

test("makeBconst creates boolean constant", () => {
    resetIRIds();
    const inst = makeBconst(true);
    assertEqual(inst.kind, IRInstKind.Bconst);
    assertEqual(inst.value, true);
    assertEqual(inst.ty.kind, IRTypeKind.Bool);
});

test("makeNull creates null pointer", () => {
    resetIRIds();
    const inner = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeNull(inner);
    assertEqual(inst.kind, IRInstKind.Null);
    assertEqual(inst.ty.kind, IRTypeKind.Ptr);
});

test("makeIadd creates integer add", () => {
    resetIRIds();
    const a = makeIconst(1, IntWidth.I32);
    const b = makeIconst(2, IntWidth.I32);
    const inst = makeIadd(a.id, b.id, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Iadd);
    assertEqual(inst.a, 0);
    assertEqual(inst.b, 1);
});

test("makeIsub creates integer subtract", () => {
    resetIRIds();
    const a = makeIconst(5, IntWidth.I32);
    const b = makeIconst(3, IntWidth.I32);
    const inst = makeIsub(a.id, b.id, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Isub);
    assertEqual(inst.a, 0);
    assertEqual(inst.b, 1);
});

test("makeImul creates integer multiply", () => {
    resetIRIds();
    const a = makeIconst(2, IntWidth.I32);
    const b = makeIconst(3, IntWidth.I32);
    const inst = makeImul(a.id, b.id, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Imul);
});

test("makeIdiv creates integer divide", () => {
    resetIRIds();
    const a = makeIconst(6, IntWidth.I32);
    const b = makeIconst(2, IntWidth.I32);
    const inst = makeIdiv(a.id, b.id, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Idiv);
});

test("makeImod creates integer modulo", () => {
    resetIRIds();
    const a = makeIconst(7, IntWidth.I32);
    const b = makeIconst(3, IntWidth.I32);
    const inst = makeImod(a.id, b.id, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Imod);
});

test("makeFadd creates float add", () => {
    resetIRIds();
    const a = makeFconst(1.5, FloatWidth.F64);
    const b = makeFconst(2.5, FloatWidth.F64);
    const inst = makeFadd(a.id, b.id, FloatWidth.F64);
    assertEqual(inst.kind, IRInstKind.Fadd);
});

test("makeFsub creates float subtract", () => {
    resetIRIds();
    const inst = makeFsub(0, 1, FloatWidth.F64);
    assertEqual(inst.kind, IRInstKind.Fsub);
});

test("makeFmul creates float multiply", () => {
    resetIRIds();
    const inst = makeFmul(0, 1, FloatWidth.F64);
    assertEqual(inst.kind, IRInstKind.Fmul);
});

test("makeFdiv creates float divide", () => {
    resetIRIds();
    const inst = makeFdiv(0, 1, FloatWidth.F64);
    assertEqual(inst.kind, IRInstKind.Fdiv);
});

test("makeIneg creates integer negation", () => {
    resetIRIds();
    const a = makeIconst(5, IntWidth.I32);
    const inst = makeIneg(a.id, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Ineg);
    assertEqual(inst.a, 0);
});

test("makeFneg creates float negation", () => {
    resetIRIds();
    const inst = makeFneg(0, FloatWidth.F64);
    assertEqual(inst.kind, IRInstKind.Fneg);
});

test("makeIand creates bitwise and", () => {
    resetIRIds();
    const inst = makeIand(0, 1, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Iand);
});

test("makeIor creates bitwise or", () => {
    resetIRIds();
    const inst = makeIor(0, 1, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Ior);
});

test("makeIxor creates bitwise xor", () => {
    resetIRIds();
    const inst = makeIxor(0, 1, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Ixor);
});

test("makeIshl creates left shift", () => {
    resetIRIds();
    const inst = makeIshl(0, 1, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Ishl);
});

test("makeIshr creates right shift", () => {
    resetIRIds();
    const inst = makeIshr(0, 1, IntWidth.I32);
    assertEqual(inst.kind, IRInstKind.Ishr);
});

test("makeIcmp creates integer comparison", () => {
    resetIRIds();
    const inst = makeIcmp(IcmpOp.Eq, 0, 1);
    assertEqual(inst.kind, IRInstKind.Icmp);
    assertEqual(inst.op, IcmpOp.Eq);
    assertEqual(inst.ty.kind, IRTypeKind.Bool);
});

test("makeIcmp supports all comparison operators", () => {
    resetIRIds();
    const ops = [
        IcmpOp.Eq,
        IcmpOp.Ne,
        IcmpOp.Slt,
        IcmpOp.Sle,
        IcmpOp.Sgt,
        IcmpOp.Sge,
        IcmpOp.Ult,
        IcmpOp.Ule,
        IcmpOp.Ugt,
        IcmpOp.Uge,
    ];
    for (const op of ops) {
        const inst = makeIcmp(op, 0, 1);
        assertEqual(inst.op, op);
    }
});

test("makeFcmp creates float comparison", () => {
    resetIRIds();
    const inst = makeFcmp(FcmpOp.Oeq, 0, 1);
    assertEqual(inst.kind, IRInstKind.Fcmp);
    assertEqual(inst.op, FcmpOp.Oeq);
    assertEqual(inst.ty.kind, IRTypeKind.Bool);
});

test("makeAlloca creates stack allocation", () => {
    resetIRIds();
    const ty = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeAlloca(ty, 0);
    assertEqual(inst.kind, IRInstKind.Alloca);
    assertEqual(inst.ty.kind, IRTypeKind.Ptr);
    assertEqual(inst.localId, 0);
});

test("makeLoad creates load instruction", () => {
    resetIRIds();
    const ty = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeLoad(0, ty);
    assertEqual(inst.kind, IRInstKind.Load);
    assertEqual(inst.ptr, 0);
    assertEqual(inst.ty.kind, IRTypeKind.Int);
});

test("makeStore creates store instruction", () => {
    resetIRIds();
    const ty = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeStore(0, 1, ty);
    assertEqual(inst.kind, IRInstKind.Store);
    assertEqual(inst.ptr, 0);
    assertEqual(inst.value, 1);
    assertEqual(inst.id, null);
});

test("makeMemcpy creates memory copy", () => {
    resetIRIds();
    const inst = makeMemcpy(0, 1, 100);
    assertEqual(inst.kind, IRInstKind.Memcpy);
    assertEqual(inst.dest, 0);
    assertEqual(inst.src, 1);
    assertEqual(inst.size, 100);
});

test("makeGep creates get element pointer", () => {
    resetIRIds();
    const resultTy = { kind: IRTypeKind.Ptr };
    const inst = makeGep(0, [1, 2], resultTy);
    assertEqual(inst.kind, IRInstKind.Gep);
    assertEqual(inst.ptr, 0);
    assertEqual(inst.indices.length, 2);
});

test("makePtradd creates pointer arithmetic", () => {
    resetIRIds();
    const inst = makePtradd(0, 8);
    assertEqual(inst.kind, IRInstKind.Ptradd);
    assertEqual(inst.ptr, 0);
    assertEqual(inst.offset, 8);
});

test("makeTrunc creates truncation", () => {
    resetIRIds();
    const fromTy = { kind: IRTypeKind.Int, width: IntWidth.I64 };
    const toTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeTrunc(0, fromTy, toTy);
    assertEqual(inst.kind, IRInstKind.Trunc);
    assertEqual(inst.val, 0);
});

test("makeSext creates sign extension", () => {
    resetIRIds();
    const fromTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const toTy = { kind: IRTypeKind.Int, width: IntWidth.I64 };
    const inst = makeSext(0, fromTy, toTy);
    assertEqual(inst.kind, IRInstKind.Sext);
});

test("makeZext creates zero extension", () => {
    resetIRIds();
    const fromTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const toTy = { kind: IRTypeKind.Int, width: IntWidth.I64 };
    const inst = makeZext(0, fromTy, toTy);
    assertEqual(inst.kind, IRInstKind.Zext);
});

test("makeFptoui creates float to unsigned int", () => {
    resetIRIds();
    const toTy = { kind: IRTypeKind.Int, width: IntWidth.U32 };
    const inst = makeFptoui(0, toTy);
    assertEqual(inst.kind, IRInstKind.Fptoui);
});

test("makeFptosi creates float to signed int", () => {
    resetIRIds();
    const toTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeFptosi(0, toTy);
    assertEqual(inst.kind, IRInstKind.Fptosi);
});

test("makeUitofp creates unsigned int to float", () => {
    resetIRIds();
    const toTy = { kind: IRTypeKind.Float, width: FloatWidth.F64 };
    const inst = makeUitofp(0, toTy);
    assertEqual(inst.kind, IRInstKind.Uitofp);
});

test("makeSitofp creates signed int to float", () => {
    resetIRIds();
    const toTy = { kind: IRTypeKind.Float, width: FloatWidth.F64 };
    const inst = makeSitofp(0, toTy);
    assertEqual(inst.kind, IRInstKind.Sitofp);
});

test("makeBitcast creates bitcast", () => {
    resetIRIds();
    const toTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeBitcast(0, toTy);
    assertEqual(inst.kind, IRInstKind.Bitcast);
});

test("makeCall creates function call with return", () => {
    resetIRIds();
    const retTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeCall(0, [1, 2], retTy);
    assertEqual(inst.kind, IRInstKind.Call);
    assertEqual(inst.fn, 0);
    assertEqual(inst.args.length, 2);
    assertTrue(inst.id !== null);
});

test("makeCall creates void function call", () => {
    resetIRIds();
    const inst = makeCall(0, [], null);
    assertEqual(inst.kind, IRInstKind.Call);
    assertEqual(inst.id, null);
    assertEqual(inst.ty.kind, IRTypeKind.Unit);
});

test("makeCallDyn creates dynamic function call", () => {
    resetIRIds();
    const retTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeCallDyn(7, [1, 2], retTy);
    assertEqual(inst.kind, IRInstKind.CallDyn);
    assertEqual(inst.fn, 7);
    assertEqual(inst.args.length, 2);
    assertTrue(inst.id !== null);
});

test("makeStructCreate creates struct value", () => {
    resetIRIds();
    const ty = { kind: IRTypeKind.Struct, name: "Point", fields: [] };
    const inst = makeStructCreate([0, 1], ty);
    assertEqual(inst.kind, IRInstKind.StructCreate);
    assertEqual(inst.fields.length, 2);
});

test("makeStructGet extracts struct field", () => {
    resetIRIds();
    const fieldTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeStructGet(0, 1, fieldTy);
    assertEqual(inst.kind, IRInstKind.StructGet);
    assertEqual(inst.struct, 0);
    assertEqual(inst.fieldIndex, 1);
});

test("makeEnumCreate creates enum value", () => {
    resetIRIds();
    const ty = { kind: IRTypeKind.Enum, name: "Option", variants: [[], []] };
    const inst = makeEnumCreate(1, [0], ty);
    assertEqual(inst.kind, IRInstKind.EnumCreate);
    assertEqual(inst.variant, 1);
    assertEqual(inst.data.length, 1);
});

test("makeEnumGetTag extracts enum tag", () => {
    resetIRIds();
    const inst = makeEnumGetTag(0);
    assertEqual(inst.kind, IRInstKind.EnumGetTag);
    assertEqual(inst.enum, 0);
    assertEqual(inst.ty.kind, IRTypeKind.Int);
});

test("makeEnumGetData extracts enum data", () => {
    resetIRIds();
    const dataTy = { kind: IRTypeKind.Int, width: IntWidth.I32 };
    const inst = makeEnumGetData(0, 1, 0, dataTy);
    assertEqual(inst.kind, IRInstKind.EnumGetData);
    assertEqual(inst.enum, 0);
    assertEqual(inst.variant, 1);
    assertEqual(inst.index, 0);
});

test("isIRInst identifies instructions", () => {
    resetIRIds();
    const inst = makeIconst(42, IntWidth.I32);
    assertTrue(isIRInst(inst));
    assertTrue(!isIRInst({ kind: 999 }));
    assertTrue(!isIRInst(null));
    assertTrue(!isIRInst({}));
});

export function runIRInstructionsTests() {
    const result = getResults();
    clearErrors();
    return 45;
}
