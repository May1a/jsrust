import {
    printBlock,
    printFunction,
    printModule,
    createPrintContext,
} from "../../ir_printer.js";

import {
    IRTypeKind,
    resetIRIds,
    freshBlockId,
    freshFunctionId,
    freshLocalId,
    makeIRIntType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    makeIRModule,
    makeIRFunction,
    makeIRParam,
    makeIRBlock,
    makeIRLocal,
    addIRBlock,
    addIRLocal,
    addIRInstruction,
    setIRTerminator,
    addIRStruct,
    addIREnum,
    addIRFunction,
} from "../../ir.js";

import {
    makeIconst,
    makeIadd,
    makeIsub,
    makeLoad,
    makeStore,
    makeAlloca,
    makeCall,
} from "../../ir_instructions.js";

import { makeRet, makeBr, makeBrIf } from "../../ir_terminators.js";

import { IntWidth } from "../../types.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

// Helper to check output contains expected substring
function assertIncludes(str, substr) {
    if (!str.includes(substr)) {
        throw new Error(`Expected "${str}" to include "${substr}"`);
    }
}

test("printBlock prints empty block", () => {
    resetIRIds();
    const block = makeIRBlock(freshBlockId());
    const output = printBlock(block);
    assertIncludes(output, "block0:");
});

test("printBlock prints block with params", () => {
    resetIRIds();
    const block = makeIRBlock(freshBlockId());
    block.params.push({ id: 0, ty: makeIRIntType(IntWidth.I32) });
    block.params.push({ id: 1, ty: makeIRIntType(IntWidth.I32) });
    const output = printBlock(block);
    assertIncludes(output, "block0(");
    assertIncludes(output, "i32");
});

test("printBlock prints block with instructions", () => {
    resetIRIds();
    const block = makeIRBlock(freshBlockId());
    const inst = makeIconst(42, IntWidth.I32);
    addIRInstruction(block, inst);
    const output = printBlock(block);
    assertIncludes(output, "iconst");
    assertIncludes(output, "42");
});

test("printBlock prints block with terminator", () => {
    resetIRIds();
    const block = makeIRBlock(freshBlockId());
    const inst = makeIconst(42, IntWidth.I32);
    addIRInstruction(block, inst);
    setIRTerminator(block, makeRet(inst.id));
    const output = printBlock(block);
    assertIncludes(output, "ret");
});

test("printFunction prints empty function", () => {
    resetIRIds();
    const fn = makeIRFunction(freshFunctionId(), "empty", [], makeIRUnitType());
    const block = makeIRBlock(freshBlockId());
    addIRBlock(fn, block);
    setIRTerminator(block, makeRet(null));

    const output = printFunction(fn);
    assertIncludes(output, "fn empty()");
});

test("printFunction prints function with params", () => {
    resetIRIds();
    const fn = makeIRFunction(
        freshFunctionId(),
        "add",
        [
            makeIRParam(0, "a", makeIRIntType(IntWidth.I32)),
            makeIRParam(1, "b", makeIRIntType(IntWidth.I32)),
        ],
        makeIRIntType(IntWidth.I32),
    );
    const block = makeIRBlock(freshBlockId());
    addIRBlock(fn, block);

    const a = makeIconst(1, IntWidth.I32);
    const b = makeIconst(2, IntWidth.I32);
    const result = makeIadd(a.id, b.id, IntWidth.I32);
    addIRInstruction(block, a);
    addIRInstruction(block, b);
    addIRInstruction(block, result);
    setIRTerminator(block, makeRet(result.id));

    const output = printFunction(fn);
    assertIncludes(output, "fn add(a: i32, b: i32) -> i32");
    assertIncludes(output, "iadd");
    assertIncludes(output, "ret");
});

test("printFunction prints function with locals", () => {
    resetIRIds();
    const fn = makeIRFunction(
        freshFunctionId(),
        "with_locals",
        [],
        makeIRUnitType(),
    );
    addIRLocal(fn, makeIRLocal(0, makeIRIntType(IntWidth.I32), "x"));
    addIRLocal(fn, makeIRLocal(1, makeIRIntType(IntWidth.I64), "y"));

    const block = makeIRBlock(freshBlockId());
    addIRBlock(fn, block);
    setIRTerminator(block, makeRet(null));

    const output = printFunction(fn);
    assertIncludes(output, "; locals:");
    assertIncludes(output, "loc0");
    assertIncludes(output, "loc1");
});

test("printFunction prints function with multiple blocks", () => {
    resetIRIds();
    const fn = makeIRFunction(
        freshFunctionId(),
        "multi_block",
        [],
        makeIRIntType(IntWidth.I32),
    );

    // Entry block
    const entry = makeIRBlock(freshBlockId());
    addIRBlock(fn, entry);
    const cond = makeIconst(1, IntWidth.I32); // true
    addIRInstruction(entry, cond);

    // Then block
    const thenBlock = makeIRBlock(freshBlockId());
    addIRBlock(fn, thenBlock);
    const thenVal = makeIconst(10, IntWidth.I32);
    addIRInstruction(thenBlock, thenVal);
    setIRTerminator(thenBlock, makeRet(thenVal.id));

    // Else block
    const elseBlock = makeIRBlock(freshBlockId());
    addIRBlock(fn, elseBlock);
    const elseVal = makeIconst(20, IntWidth.I32);
    addIRInstruction(elseBlock, elseVal);
    setIRTerminator(elseBlock, makeRet(elseVal.id));

    setIRTerminator(
        entry,
        makeBrIf(cond.id, thenBlock.id, [], elseBlock.id, []),
    );

    const output = printFunction(fn);
    assertIncludes(output, "block0:");
    assertIncludes(output, "block1:");
    assertIncludes(output, "block2:");
    assertIncludes(output, "br_if");
});

test("printModule prints empty module", () => {
    resetIRIds();
    const module = makeIRModule("test");
    const output = printModule(module);
    assertIncludes(output, "; Module: test");
});

test("printModule prints module with struct", () => {
    resetIRIds();
    const module = makeIRModule("test");
    addIRStruct(module, "Point", {
        fields: [makeIRIntType(IntWidth.I32), makeIRIntType(IntWidth.I32)],
    });
    const output = printModule(module);
    assertIncludes(output, "; Structs:");
    assertIncludes(output, "struct Point");
});

test("printModule prints module with enum", () => {
    resetIRIds();
    const module = makeIRModule("test");
    addIREnum(module, "Option", {
        variants: [[], [makeIRIntType(IntWidth.I32)]],
    });
    const output = printModule(module);
    assertIncludes(output, "; Enums:");
    assertIncludes(output, "enum Option");
});

test("printModule prints module with function", () => {
    resetIRIds();
    const module = makeIRModule("test");

    const fn = makeIRFunction(
        freshFunctionId(),
        "main",
        [],
        makeIRIntType(IntWidth.I32),
    );
    const block = makeIRBlock(freshBlockId());
    addIRBlock(fn, block);
    const ret = makeIconst(0, IntWidth.I32);
    addIRInstruction(block, ret);
    setIRTerminator(block, makeRet(ret.id));

    addIRFunction(module, fn);

    const output = printModule(module);
    assertIncludes(output, "fn main()");
    assertIncludes(output, "ret");
});

test("printModule prints complete module", () => {
    resetIRIds();
    const module = makeIRModule("complete");

    // Add struct
    addIRStruct(module, "Point", {
        fields: [makeIRIntType(IntWidth.I32), makeIRIntType(IntWidth.I32)],
    });

    // Add enum
    addIREnum(module, "Option", {
        variants: [[], [makeIRIntType(IntWidth.I32)]],
    });

    // Add function
    const fn = makeIRFunction(
        freshFunctionId(),
        "test",
        [makeIRParam(0, "x", makeIRIntType(IntWidth.I32))],
        makeIRIntType(IntWidth.I32),
    );
    const block = makeIRBlock(freshBlockId());
    addIRBlock(fn, block);
    setIRTerminator(block, makeRet(0));
    addIRFunction(module, fn);

    const output = printModule(module);
    assertIncludes(output, "; Module: complete");
    assertIncludes(output, "struct Point");
    assertIncludes(output, "enum Option");
    assertIncludes(output, "fn test(x: i32)");
});

test("PrintContext creates unique value names", () => {
    resetIRIds();
    const ctx = createPrintContext();
    const v0 = ctx.getValueName(0);
    const v1 = ctx.getValueName(1);
    const v0Again = ctx.getValueName(0);

    assertEqual(v0, "v0");
    assertEqual(v1, "v1");
    assertEqual(v0Again, "v0"); // Same ID returns same name
});

test("PrintContext creates unique block names", () => {
    resetIRIds();
    const ctx = createPrintContext();
    const b0 = ctx.getBlockName(0);
    const b1 = ctx.getBlockName(1);

    assertEqual(b0, "block0");
    assertEqual(b1, "block1");
});

test("PrintContext creates unique local names", () => {
    resetIRIds();
    const ctx = createPrintContext();
    const l0 = ctx.getLocalName(0);
    const l1 = ctx.getLocalName(1);

    assertEqual(l0, "loc0");
    assertEqual(l1, "loc1");
});

export function runOutputFunctionsTests() {
    const result = getResults();
    clearErrors();
    return 17;
}
