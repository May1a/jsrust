import {
    resetIRIds,
    freshValueId,
    freshBlockId,
    freshFunctionId,
    freshLocalId,
    makeIRModule,
    addIRFunction,
    addIRGlobal,
    addIRStruct,
    addIREnum,
    makeIRFunction,
    makeIRParam,
    addIRBlock,
    addIRLocal,
    makeIRBlock,
    makeIRLocal,
    makeIRGlobal,
    makeIRIntType,
    makeIRBoolType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    addIRInstruction,
    setIRTerminator,
} from "../../src/ir";

import { makeIconst } from "../../src/ir_instructions";
import { makeRet } from "../../src/ir_terminators";
import { IntWidth } from "../../src/types";
import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";

test("freshValueId generates unique IDs", () => {
    resetIRIds();
    assertEqual(freshValueId(), 0);
    assertEqual(freshValueId(), 1);
    assertEqual(freshValueId(), 2);
});

test("freshBlockId generates unique IDs", () => {
    resetIRIds();
    assertEqual(freshBlockId(), 0);
    assertEqual(freshBlockId(), 1);
});

test("freshFunctionId generates unique IDs", () => {
    resetIRIds();
    assertEqual(freshFunctionId(), 0);
    assertEqual(freshFunctionId(), 1);
});

test("freshLocalId generates unique IDs", () => {
    resetIRIds();
    assertEqual(freshLocalId(), 0);
    assertEqual(freshLocalId(), 1);
});

test("resetIRIds resets all counters", () => {
    resetIRIds();
    freshValueId();
    freshBlockId();
    freshFunctionId();
    freshLocalId();

    resetIRIds();
    assertEqual(freshValueId(), 0);
    assertEqual(freshBlockId(), 0);
    assertEqual(freshFunctionId(), 0);
    assertEqual(freshLocalId(), 0);
});

test("makeIRModule creates module", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    assertEqual(mod.name, "test");
    assertEqual(mod.functions.length, 0);
    assertEqual(mod.globals.length, 0);
    assertEqual(mod.structs.size, 0);
    assertEqual(mod.enums.size, 0);
});

test("addIRFunction adds function to module", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const fn = makeIRFunction(0, "main", [], makeIRUnitType());
    addIRFunction(mod, fn);
    assertEqual(mod.functions.length, 1);
    assertEqual(mod.functions[0].name, "main");
});

test("addIRGlobal adds global to module", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const global = makeIRGlobal("PI", makeIRIntType(IntWidth.I32), null);
    addIRGlobal(mod, global);
    assertEqual(mod.globals.length, 1);
    assertEqual(mod.globals[0].name, "PI");
});

test("addIRStruct adds struct to module", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const struct = makeIRStructType("Point", [
        makeIRIntType(IntWidth.I32),
        makeIRIntType(IntWidth.I32),
    ]);
    addIRStruct(mod, "Point", struct);
    assertEqual(mod.structs.size, 1);
    assertTrue(mod.structs.has("Point"));
});

test("addIREnum adds enum to module", () => {
    resetIRIds();
    const mod = makeIRModule("test");
    const enum_ = makeIREnumType("Option", [[], [makeIRIntType(IntWidth.I32)]]);
    addIREnum(mod, "Option", enum_);
    assertEqual(mod.enums.size, 1);
    assertTrue(mod.enums.has("Option"));
});

test("makeIRFunction creates function", () => {
    resetIRIds();
    const fn = makeIRFunction(0, "add", [], makeIRIntType(IntWidth.I32));
    assertEqual(fn.id, 0);
    assertEqual(fn.name, "add");
    assertEqual(fn.params.length, 0);
    assertEqual(fn.returnType.kind, 0);
    assertEqual(fn.blocks.length, 0);
    assertEqual(fn.locals.length, 0);
    assertEqual(fn.entry, null);
});

test("makeIRFunction with parameters", () => {
    resetIRIds();
    const params = [
        makeIRParam(0, "a", makeIRIntType(IntWidth.I32)),
        makeIRParam(1, "b", makeIRIntType(IntWidth.I32)),
    ];
    const fn = makeIRFunction(0, "add", params, makeIRIntType(IntWidth.I32));
    assertEqual(fn.params.length, 2);
    assertEqual(fn.params[0].name, "a");
    assertEqual(fn.params[1].name, "b");
});

test("makeIRParam creates parameter", () => {
    resetIRIds();
    const param = makeIRParam(0, "x", makeIRIntType(IntWidth.I32));
    assertEqual(param.id, 0);
    assertEqual(param.name, "x");
    assertEqual(param.ty.kind, 0);
});

test("addIRBlock adds block to function", () => {
    resetIRIds();
    const fn = makeIRFunction(0, "main", [], makeIRUnitType());
    const block = makeIRBlock(0);
    addIRBlock(fn, block);
    assertEqual(fn.blocks.length, 1);
    assertEqual(fn.entry.id, 0);
});

test("addIRBlock sets first block as entry", () => {
    resetIRIds();
    const fn = makeIRFunction(0, "main", [], makeIRUnitType());
    addIRBlock(fn, makeIRBlock(0));
    addIRBlock(fn, makeIRBlock(1));
    assertEqual(fn.entry.id, 0);
});

test("addIRLocal adds local to function", () => {
    resetIRIds();
    const fn = makeIRFunction(0, "main", [], makeIRUnitType());
    const local = makeIRLocal(0, makeIRIntType(IntWidth.I32), "x");
    addIRLocal(fn, local);
    assertEqual(fn.locals.length, 1);
    assertEqual(fn.locals[0].name, "x");
});

test("makeIRLocal creates stack slot", () => {
    resetIRIds();
    const local = makeIRLocal(0, makeIRIntType(IntWidth.I32), "temp");
    assertEqual(local.id, 0);
    assertEqual(local.ty.kind, 0);
    assertEqual(local.name, "temp");
});

test("makeIRLocal without name", () => {
    resetIRIds();
    const local = makeIRLocal(0, makeIRIntType(IntWidth.I32), null);
    assertEqual(local.name, null);
});

test("makeIRGlobal creates global variable", () => {
    resetIRIds();
    const init = makeIconst(42, IntWidth.I32);
    const global = makeIRGlobal("COUNTER", makeIRIntType(IntWidth.I32), init);
    assertEqual(global.name, "COUNTER");
    assertEqual(global.ty.kind, 0);
    assertTrue(global.init !== null);
});

test("makeIRGlobal without initializer", () => {
    resetIRIds();
    const global = makeIRGlobal("BUFFER", makeIRIntType(IntWidth.I32), null);
    assertEqual(global.name, "BUFFER");
    assertEqual(global.init, null);
});

test("complete function with block and terminator", () => {
    resetIRIds();
    const fn = makeIRFunction(0, "return_42", [], makeIRIntType(IntWidth.I32));
    const block = makeIRBlock(0);
    const value = makeIconst(42, IntWidth.I32);
    const term = makeRet(value.id);

    addIRInstruction(block, value);
    setIRTerminator(block, term);
    addIRBlock(fn, block);

    assertEqual(fn.blocks.length, 1);
    assertEqual(fn.blocks[0].instructions.length, 1);
    assertTrue(fn.blocks[0].terminator !== null);
});

test("function with multiple blocks", () => {
    resetIRIds();
    const fn = makeIRFunction(0, "multi_block", [], makeIRUnitType());

    const entry = makeIRBlock(0);
    const middle = makeIRBlock(1);
    const exit = makeIRBlock(2);

    addIRBlock(fn, entry);
    addIRBlock(fn, middle);
    addIRBlock(fn, exit);

    assertEqual(fn.blocks.length, 3);
    assertEqual(fn.entry.id, 0);
});

test("module with multiple functions", () => {
    resetIRIds();
    const mod = makeIRModule("test");

    const fn1 = makeIRFunction(0, "foo", [], makeIRUnitType());
    const fn2 = makeIRFunction(1, "bar", [], makeIRIntType(IntWidth.I32));

    addIRFunction(mod, fn1);
    addIRFunction(mod, fn2);

    assertEqual(mod.functions.length, 2);
    assertEqual(mod.functions[0].name, "foo");
    assertEqual(mod.functions[1].name, "bar");
});

export function runIRFunctionsTests() {
    const result = getResults();
    clearErrors();
    return 23;
}
