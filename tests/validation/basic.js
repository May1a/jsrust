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
    makeIRUnitType,
} from "../../ir.js";

import {
    makeIconst,
    makeIadd,
    makeIsub,
    makeBconst,
    makeCallDyn,
} from "../../ir_instructions.js";

import { makeRet, makeBr, makeBrIf } from "../../ir_terminators.js";

import { validateModule, ValidationErrorKind } from "../../ir_validate.js";

import { IntWidth } from "../../types.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

test("valid simple function returns constant", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "main", [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    const val = makeIconst(42, IntWidth.I32);
    const ret = makeRet(val.id);

    addIRInstruction(block, val);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
    assertEqual(result.errors.length, 0);
});

test("valid function with parameters", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const params = [
        makeIRParam(0, "a", makeIRIntType(IntWidth.I32)),
        makeIRParam(1, "b", makeIRIntType(IntWidth.I32)),
    ];
    const fn = makeIRFunction(0, "add", params, makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    const sum = makeIadd(0, 1, IntWidth.I32);
    const ret = makeRet(sum.id);

    addIRInstruction(block, sum);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
    assertEqual(result.errors.length, 0);
});

test("valid function with multiple blocks", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "multi", [], makeIRIntType(IntWidth.I32));

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
    assertEqual(result.errors.length, 0);
});

test("undefined value in instruction", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "bad", [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    // Use undefined value 999
    const add = makeIadd(999, 998, IntWidth.I32);
    const ret = makeRet(add.id);

    addIRInstruction(block, add);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(result.errors.length > 0);
    assertTrue(
        result.errors.some(
            (e) => e.kind === ValidationErrorKind.UndefinedValue,
        ),
    );
});

test("undefined callee value in call_dyn instruction", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(
        0,
        "bad_call_dyn",
        [],
        makeIRIntType(IntWidth.I32),
    );
    const block = makeIRBlock(0);
    const callDyn = makeCallDyn(999, [], makeIRIntType(IntWidth.I32));
    const ret = makeRet(callDyn.id);

    addIRInstruction(block, callDyn);
    setIRTerminator(block, ret);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(
        result.errors.some(
            (e) =>
                e.kind === ValidationErrorKind.UndefinedValue &&
                String(e.message || "").includes("call_dyn callee"),
        ),
    );
});

test("missing terminator", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "no_term", [], makeIRUnitType());
    const block = makeIRBlock(0);
    // No terminator set

    addIRBlock(fn, block);
    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(
        result.errors.some(
            (e) => e.kind === ValidationErrorKind.MissingTerminator,
        ),
    );
});

test("branch to undefined block", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "bad_br", [], makeIRUnitType());
    const block = makeIRBlock(0);
    // Branch to non-existent block 999
    const br = makeBr(999, []);

    setIRTerminator(block, br);
    addIRBlock(fn, block);
    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(
        result.errors.some(
            (e) => e.kind === ValidationErrorKind.UndefinedBlock,
        ),
    );
});

test("duplicate function names", () => {
    resetIRIds();
    const mod = makeIRModule("test");

    const fn1 = makeIRFunction(0, "foo", [], makeIRUnitType());
    const block1 = makeIRBlock(0);
    setIRTerminator(block1, makeRet(null));
    addIRBlock(fn1, block1);
    addIRFunction(mod, fn1);

    const fn2 = makeIRFunction(1, "foo", [], makeIRUnitType());
    const block2 = makeIRBlock(1);
    setIRTerminator(block2, makeRet(null));
    addIRBlock(fn2, block2);
    addIRFunction(mod, fn2);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(
        result.errors.some(
            (e) => e.kind === ValidationErrorKind.DuplicateDefinition,
        ),
    );
});

test("unreachable block", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(
        0,
        "unreachable",
        [],
        makeIRIntType(IntWidth.I32),
    );

    const entry = makeIRBlock(0);
    const val = makeIconst(42, IntWidth.I32);
    const ret = makeRet(val.id);
    addIRInstruction(entry, val);
    setIRTerminator(entry, ret);
    addIRBlock(fn, entry);

    // Unreachable block
    const unreachable = makeIRBlock(1);
    const unreachableVal = makeIconst(0, IntWidth.I32);
    const unreachableRet = makeRet(unreachableVal.id);
    addIRInstruction(unreachable, unreachableVal);
    setIRTerminator(unreachable, unreachableRet);
    addIRBlock(fn, unreachable);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(!result.ok, "Module should be invalid");
    assertTrue(
        result.errors.some(
            (e) => e.kind === ValidationErrorKind.UnreachableBlock,
        ),
    );
});

export function runValidationBasicTests() {
    const result = getResults();
    clearErrors();
    return 8;
}
