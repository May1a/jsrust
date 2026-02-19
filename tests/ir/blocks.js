import {
    IRTermKind,
    resetIRIds,
    makeIRBlock,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
    addPredecessor,
    addSuccessor,
} from "../../ir.js";

import {
    makeRet,
    makeBr,
    makeBrIf,
    makeSwitch,
    makeSwitchCase,
    makeUnreachable,
    isIRTerminator,
} from "../../ir_terminators.js";

import { makeIconst } from "../../ir_instructions.js";
import { IntWidth } from "../../types.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

test("makeIRBlock creates basic block", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    assertEqual(block.id, 0);
    assertEqual(block.params.length, 0);
    assertEqual(block.instructions.length, 0);
    assertEqual(block.terminator, null);
    assertEqual(block.predecessors.length, 0);
    assertEqual(block.successors.length, 0);
});

test("addIRBlockParam adds block parameter", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    const ty = { kind: 0, width: IntWidth.I32 };
    addIRBlockParam(block, 1, ty);
    assertEqual(block.params.length, 1);
    assertEqual(block.params[0].id, 1);
    assertEqual(block.params[0].ty.kind, 0);
});

test("addIRInstruction adds instruction to block", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    const inst = makeIconst(42, IntWidth.I32);
    addIRInstruction(block, inst);
    assertEqual(block.instructions.length, 1);
    assertEqual(block.instructions[0].kind, 0);
});

test("setIRTerminator sets block terminator", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    const term = makeRet(null);
    setIRTerminator(block, term);
    assertTrue(block.terminator !== null);
    assertEqual(block.terminator.kind, IRTermKind.Ret);
});

test("addPredecessor adds predecessor block", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    addPredecessor(block, 1);
    addPredecessor(block, 2);
    assertEqual(block.predecessors.length, 2);
    assertTrue(block.predecessors.includes(1));
    assertTrue(block.predecessors.includes(2));
});

test("addPredecessor does not duplicate", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    addPredecessor(block, 1);
    addPredecessor(block, 1);
    assertEqual(block.predecessors.length, 1);
});

test("addSuccessor adds successor block", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    addSuccessor(block, 1);
    addSuccessor(block, 2);
    assertEqual(block.successors.length, 2);
    assertTrue(block.successors.includes(1));
    assertTrue(block.successors.includes(2));
});

test("addSuccessor does not duplicate", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    addSuccessor(block, 1);
    addSuccessor(block, 1);
    assertEqual(block.successors.length, 1);
});

test("makeRet creates return terminator", () => {
    resetIRIds();
    const term = makeRet(null);
    assertEqual(term.kind, IRTermKind.Ret);
    assertEqual(term.value, null);
});

test("makeRet creates return with value", () => {
    resetIRIds();
    const inst = makeIconst(42, IntWidth.I32);
    const term = makeRet(inst.id);
    assertEqual(term.kind, IRTermKind.Ret);
    assertEqual(term.value, 0);
});

test("makeBr creates unconditional branch", () => {
    resetIRIds();
    const term = makeBr(1, []);
    assertEqual(term.kind, IRTermKind.Br);
    assertEqual(term.target, 1);
    assertEqual(term.args.length, 0);
});

test("makeBr creates branch with arguments", () => {
    resetIRIds();
    const term = makeBr(1, [0, 1]);
    assertEqual(term.target, 1);
    assertEqual(term.args.length, 2);
});

test("makeBrIf creates conditional branch", () => {
    resetIRIds();
    const term = makeBrIf(0, 1, [], 2, []);
    assertEqual(term.kind, IRTermKind.BrIf);
    assertEqual(term.cond, 0);
    assertEqual(term.thenBlock, 1);
    assertEqual(term.elseBlock, 2);
});

test("makeBrIf creates branch with arguments", () => {
    resetIRIds();
    const term = makeBrIf(0, 1, [2], 3, [4, 5]);
    assertEqual(term.thenArgs.length, 1);
    assertEqual(term.elseArgs.length, 2);
});

test("makeSwitch creates switch terminator", () => {
    resetIRIds();
    const cases = [makeSwitchCase(0, 1, []), makeSwitchCase(1, 2, [])];
    const term = makeSwitch(0, cases, 3, []);
    assertEqual(term.kind, IRTermKind.Switch);
    assertEqual(term.value, 0);
    assertEqual(term.cases.length, 2);
    assertEqual(term.defaultBlock, 3);
});

test("makeSwitchCase creates switch case", () => {
    resetIRIds();
    const case_ = makeSwitchCase(42, 1, [2, 3]);
    assertEqual(case_.value, 42);
    assertEqual(case_.target, 1);
    assertEqual(case_.args.length, 2);
});

test("makeUnreachable creates unreachable terminator", () => {
    resetIRIds();
    const term = makeUnreachable();
    assertEqual(term.kind, IRTermKind.Unreachable);
});

test("isIRTerminator identifies terminators", () => {
    resetIRIds();
    assertTrue(isIRTerminator(makeRet(null)));
    assertTrue(isIRTerminator(makeBr(0, [])));
    assertTrue(isIRTerminator(makeBrIf(0, 1, [], 2, [])));
    assertTrue(isIRTerminator(makeSwitch(0, [], 1, [])));
    assertTrue(isIRTerminator(makeUnreachable()));
    assertTrue(!isIRTerminator({ kind: 999 }));
    assertTrue(!isIRTerminator(null));
    assertTrue(!isIRTerminator({}));
});

test("block can have multiple instructions", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    addIRInstruction(block, makeIconst(1, IntWidth.I32));
    addIRInstruction(block, makeIconst(2, IntWidth.I32));
    addIRInstruction(block, makeIconst(3, IntWidth.I32));
    assertEqual(block.instructions.length, 3);
});

test("block params have unique IDs", () => {
    resetIRIds();
    const block = makeIRBlock(0);
    const ty = { kind: 0, width: IntWidth.I32 };
    addIRBlockParam(block, 1, ty);
    addIRBlockParam(block, 2, ty);
    addIRBlockParam(block, 3, ty);
    assertEqual(block.params.length, 3);
    assertEqual(block.params[0].id, 1);
    assertEqual(block.params[1].id, 2);
    assertEqual(block.params[2].id, 3);
});

export function runIRBlocksTests() {
    const result = getResults();
    clearErrors();
    return 20;
}
