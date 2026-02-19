import {
    resetIRIds,
    makeIRModule,
    addIRFunction,
    makeIRFunction,
    addIRBlock,
    makeIRBlock,
    addIRInstruction,
    setIRTerminator,
    addIRBlockParam,
    makeIRIntType,
    makeIRUnitType,
    addPredecessor,
    addSuccessor,
} from "../../ir.js";

import { makeIconst, makeBconst, makeIadd } from "../../ir_instructions.js";

import {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeSwitchCase,
    makeUnreachable,
} from "../../ir_terminators.js";

import { validateModule, ValidationErrorKind } from "../../ir_validate.js";

import { IntWidth } from "../../types.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

test("valid simple branch", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "branch", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const target = makeIRBlock(1);

    const val = makeIconst(42, IntWidth.I32);
    const br = makeBr(target.id, []);
    const ret = makeRet(val.id);

    addIRInstruction(entry, val);
    setIRTerminator(entry, br);
    addIRBlock(fn, entry);

    addIRInstruction(target, val);
    setIRTerminator(target, ret);
    addIRBlock(fn, target);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

test("valid br_if with both branches", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "br_if_test", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const then = makeIRBlock(1);
    const else_ = makeIRBlock(2);

    const cond = makeBconst(true);
    const brif = makeBrIf(cond.id, then.id, [], else_.id, []);

    const thenVal = makeIconst(1, IntWidth.I32);
    const thenRet = makeRet(thenVal.id);

    const elseVal = makeIconst(2, IntWidth.I32);
    const elseRet = makeRet(elseVal.id);

    addIRInstruction(entry, cond);
    setIRTerminator(entry, brif);
    addIRBlock(fn, entry);

    addIRInstruction(then, thenVal);
    setIRTerminator(then, thenRet);
    addIRBlock(fn, then);

    addIRInstruction(else_, elseVal);
    setIRTerminator(else_, elseRet);
    addIRBlock(fn, else_);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

test("valid switch", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(
        0,
        "switch_test",
        [],
        makeIRIntType(IntWidth.I32),
    );

    const entry = makeIRBlock(0);
    const case0 = makeIRBlock(1);
    const case1 = makeIRBlock(2);
    const default_ = makeIRBlock(3);

    const val = makeIconst(1, IntWidth.I32);
    const case0Val = makeIconst(0, IntWidth.I32);
    const case1Val = makeIconst(1, IntWidth.I32);

    const sw = makeSwitch(
        val.id,
        [
            makeSwitchCase(case0Val.id, case0.id, []),
            makeSwitchCase(case1Val.id, case1.id, []),
        ],
        default_.id,
        [],
    );

    const ret0 = makeRet(makeIconst(10, IntWidth.I32).id);
    const ret1 = makeRet(makeIconst(20, IntWidth.I32).id);
    const retDefault = makeRet(makeIconst(30, IntWidth.I32).id);

    addIRInstruction(entry, val);
    addIRInstruction(entry, case0Val);
    addIRInstruction(entry, case1Val);
    setIRTerminator(entry, sw);
    addIRBlock(fn, entry);

    addIRInstruction(case0, makeIconst(10, IntWidth.I32));
    setIRTerminator(case0, ret0);
    addIRBlock(fn, case0);

    addIRInstruction(case1, makeIconst(20, IntWidth.I32));
    setIRTerminator(case1, ret1);
    addIRBlock(fn, case1);

    addIRInstruction(default_, makeIconst(30, IntWidth.I32));
    setIRTerminator(default_, retDefault);
    addIRBlock(fn, default_);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

test("branch with block arguments", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "block_args", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const target = makeIRBlock(1);

    // Target block takes one i32 parameter
    addIRBlockParam(target, 2, makeIRIntType(IntWidth.I32));

    const val = makeIconst(42, IntWidth.I32);
    // Branch passes the value as argument
    const br = makeBr(target.id, [val.id]);
    const ret = makeRet(2); // Return the block parameter

    addIRInstruction(entry, val);
    setIRTerminator(entry, br);
    addIRBlock(fn, entry);

    setIRTerminator(target, ret);
    addIRBlock(fn, target);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

test("branch argument count mismatch", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "bad_args", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const target = makeIRBlock(1);

    // Target block takes one i32 parameter
    addIRBlockParam(target, 2, makeIRIntType(IntWidth.I32));

    const val = makeIconst(42, IntWidth.I32);
    // Branch passes no arguments but target expects one
    const br = makeBr(target.id, []);
    const ret = makeRet(2);

    addIRInstruction(entry, val);
    setIRTerminator(entry, br);
    addIRBlock(fn, entry);

    setIRTerminator(target, ret);
    addIRBlock(fn, target);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(
        result.errors.some(
            (e) => e.kind === ValidationErrorKind.InvalidBlockArg,
        ),
    );
});

test("valid unreachable terminator", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "unreachable_test", [], makeIRUnitType());

    const entry = makeIRBlock(0);
    setIRTerminator(entry, makeUnreachable());
    addIRBlock(fn, entry);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    // Unreachable is valid as a terminator
    assertTrue(result.ok, "Module should be valid");
});

test("diamond control flow", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "diamond", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const left = makeIRBlock(1);
    const right = makeIRBlock(2);
    const merge = makeIRBlock(3);

    // Merge block takes one parameter
    addIRBlockParam(merge, 10, makeIRIntType(IntWidth.I32));

    const cond = makeBconst(true);
    const brif = makeBrIf(cond.id, left.id, [], right.id, []);

    const leftVal = makeIconst(1, IntWidth.I32);
    const leftBr = makeBr(merge.id, [leftVal.id]);

    const rightVal = makeIconst(2, IntWidth.I32);
    const rightBr = makeBr(merge.id, [rightVal.id]);

    const ret = makeRet(10);

    // Entry
    addIRInstruction(entry, cond);
    setIRTerminator(entry, brif);
    addIRBlock(fn, entry);

    // Left
    addIRInstruction(left, leftVal);
    setIRTerminator(left, leftBr);
    addIRBlock(fn, left);

    // Right
    addIRInstruction(right, rightVal);
    setIRTerminator(right, rightBr);
    addIRBlock(fn, right);

    // Merge
    setIRTerminator(merge, ret);
    addIRBlock(fn, merge);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

export function runValidationControlFlowTests() {
    const result = getResults();
    clearErrors();
    return 7;
}
