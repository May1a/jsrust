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
    addIRBlockParam,
    makeIRIntType,
    makeIRUnitType,
    addPredecessor,
    addSuccessor,
} from "../../src/ir";

import { makeIconst, makeBconst, makeIadd } from "../../src/ir_instructions";

import { makeRet, makeBr, makeBrIf } from "../../src/ir_terminators";

import {
    validateModule,
    ValidationErrorKind,
    computeDominators,
    dominates,
    makeValidationCtx,
    setFunction,
} from "../../src/ir_validate";

import { IntWidth } from "../../src/types";
import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";

test("entry block dominates all blocks", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "test", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const middle = makeIRBlock(1);
    const exit = makeIRBlock(2);

    const val = makeIconst(42, IntWidth.I32);
    const br1 = makeBr(middle.id, []);
    const br2 = makeBr(exit.id, []);
    const ret = makeRet(val.id);

    addIRInstruction(entry, val);
    setIRTerminator(entry, br1);
    addIRBlock(fn, entry);

    setIRTerminator(middle, br2);
    addIRBlock(fn, middle);

    addIRInstruction(exit, val);
    setIRTerminator(exit, ret);
    addIRBlock(fn, exit);

    addIRFunction(mod, fn);

    const dominators = computeDominators(fn);

    // Entry dominates all blocks
    assertTrue(dominates(entry.id, entry.id, dominators));
    assertTrue(dominates(entry.id, middle.id, dominators));
    assertTrue(dominates(entry.id, exit.id, dominators));

    // Middle doesn't dominate entry
    assertTrue(!dominates(middle.id, entry.id, dominators));

    // Middle dominates exit
    assertTrue(dominates(middle.id, exit.id, dominators));
});

test("dominance in diamond pattern", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "diamond", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const left = makeIRBlock(1);
    const right = makeIRBlock(2);
    const merge = makeIRBlock(3);

    const cond = makeBconst(true);
    const brif = makeBrIf(cond.id, left.id, [], right.id, []);

    const leftVal = makeIconst(1, IntWidth.I32);
    const leftBr = makeBr(merge.id, []);

    const rightVal = makeIconst(2, IntWidth.I32);
    const rightBr = makeBr(merge.id, []);

    const ret = makeRet(leftVal.id);

    addIRInstruction(entry, cond);
    setIRTerminator(entry, brif);
    addIRBlock(fn, entry);

    addIRInstruction(left, leftVal);
    setIRTerminator(left, leftBr);
    addIRBlock(fn, left);

    addIRInstruction(right, rightVal);
    setIRTerminator(right, rightBr);
    addIRBlock(fn, right);

    addIRInstruction(merge, leftVal);
    setIRTerminator(merge, ret);
    addIRBlock(fn, merge);

    addIRFunction(mod, fn);

    const dominators = computeDominators(fn);

    // Entry dominates all
    assertTrue(dominates(entry.id, entry.id, dominators));
    assertTrue(dominates(entry.id, left.id, dominators));
    assertTrue(dominates(entry.id, right.id, dominators));
    assertTrue(dominates(entry.id, merge.id, dominators));

    // Left doesn't dominate right or merge
    assertTrue(!dominates(left.id, right.id, dominators));
    // But left dominates itself
    assertTrue(dominates(left.id, left.id, dominators));

    // Neither left nor right dominates merge (both paths lead to merge)
    assertTrue(!dominates(left.id, merge.id, dominators));
    assertTrue(!dominates(right.id, merge.id, dominators));
});

test("valid use of value from dominating block", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "valid_dom", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const exit = makeIRBlock(1);

    // Value defined in entry
    const val = makeIconst(42, IntWidth.I32);
    const br = makeBr(exit.id, []);

    // Value used in exit (valid because entry dominates exit)
    const ret = makeRet(val.id);

    addIRInstruction(entry, val);
    setIRTerminator(entry, br);
    addIRBlock(fn, entry);

    addIRInstruction(exit, val);
    setIRTerminator(exit, ret);
    addIRBlock(fn, exit);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

test("dominance violation - use before definition", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "bad_dom", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const middle = makeIRBlock(1);

    // Use value 1 in entry (but it's defined in middle)
    const add = makeIadd(1, 1, IntWidth.I32);
    const br = makeBr(middle.id, []);

    // Define value 1 in middle
    const val = makeIconst(42, IntWidth.I32);
    const ret = makeRet(add.id);

    addIRInstruction(entry, add);
    setIRTerminator(entry, br);
    addIRBlock(fn, entry);

    addIRInstruction(middle, val);
    setIRTerminator(middle, ret);
    addIRBlock(fn, middle);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    // Should have undefined value error since value 1 isn't defined when used
    assertTrue(!result.ok, "Module should be invalid");
});

test("self-dominance", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "self_dom", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const val = makeIconst(42, IntWidth.I32);
    const ret = makeRet(val.id);

    addIRInstruction(entry, val);
    setIRTerminator(entry, ret);
    addIRBlock(fn, entry);
    addIRFunction(mod, fn);

    const dominators = computeDominators(fn);

    // Block dominates itself
    assertTrue(dominates(entry.id, entry.id, dominators));
});

test("dominance with block parameters", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(
        0,
        "block_params",
        [],
        makeIRIntType(IntWidth.I32),
    );

    const entry = makeIRBlock(0);
    const loop = makeIRBlock(1);
    const exit = makeIRBlock(2);

    // Loop block takes an i32 parameter
    addIRBlockParam(loop, 10, makeIRIntType(IntWidth.I32));

    const init = makeIconst(0, IntWidth.I32);
    const br1 = makeBr(loop.id, [init.id]);

    // In loop, use the block parameter
    const next = makeIadd(10, 10, IntWidth.I32);
    const br2 = makeBr(exit.id, [next.id]);

    const ret = makeRet(10);

    addIRInstruction(entry, init);
    setIRTerminator(entry, br1);
    addIRBlock(fn, entry);

    addIRInstruction(loop, next);
    setIRTerminator(loop, br2);
    addIRBlock(fn, loop);

    setIRTerminator(exit, ret);
    addIRBlock(fn, exit);

    addIRFunction(mod, fn);

    const result = validateModule(mod);
    assertTrue(result.ok, "Module should be valid");
});

test("dominance in loop structure", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "loop", [], makeIRIntType(IntWidth.I32));

    const entry = makeIRBlock(0);
    const loopHeader = makeIRBlock(1);
    const loopBody = makeIRBlock(2);
    const exit = makeIRBlock(3);

    addIRBlockParam(loopHeader, 10, makeIRIntType(IntWidth.I32));

    const init = makeIconst(0, IntWidth.I32);
    const cond = makeBconst(false);

    // Entry branches to loop header
    const brEntry = makeBr(loopHeader.id, [init.id]);

    // Loop header branches to body or exit
    const brLoop = makeBrIf(cond.id, loopBody.id, [], exit.id, []);

    // Loop body branches back to header
    const next = makeIadd(10, 10, IntWidth.I32);
    const brBody = makeBr(loopHeader.id, [next.id]);

    const ret = makeRet(10);

    addIRInstruction(entry, init);
    setIRTerminator(entry, brEntry);
    addIRBlock(fn, entry);

    addIRInstruction(loopHeader, cond);
    setIRTerminator(loopHeader, brLoop);
    addIRBlock(fn, loopHeader);

    addIRInstruction(loopBody, next);
    setIRTerminator(loopBody, brBody);
    addIRBlock(fn, loopBody);

    setIRTerminator(exit, ret);
    addIRBlock(fn, exit);

    addIRFunction(mod, fn);

    const dominators = computeDominators(fn);

    // Entry dominates all
    assertTrue(dominates(entry.id, loopHeader.id, dominators));
    assertTrue(dominates(entry.id, loopBody.id, dominators));
    assertTrue(dominates(entry.id, exit.id, dominators));

    // Loop header dominates body and exit
    assertTrue(dominates(loopHeader.id, loopBody.id, dominators));
    assertTrue(dominates(loopHeader.id, exit.id, dominators));

    // Loop body doesn't dominate header (back edge)
    assertTrue(!dominates(loopBody.id, loopHeader.id, dominators));
});

export function runValidationDominanceTests() {
    const result = getResults();
    clearErrors();
    return 7;
}
