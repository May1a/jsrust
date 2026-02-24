// Variable tests for SSA variable tracking and phi construction
import { assertTrue, test } from "../lib";
import { IRBuilder } from "../../src/ir_builder";

export function testSimpleVarFlow() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "i32");
    builder.createBlock("entry");
    builder.switchToBlock(0);

    builder.declareVar("x", "i32");
    const val = builder.iconst(42, 0); // I32
    builder.defineVar("x", val);
    const used = builder.useVar("x");

    builder.ret(used);
    builder.sealBlock(0);

    const fn = builder.build();
    assertTrue(fn !== null);
}

export function testVarAcrossBlocks() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "unit");
    builder.createBlock("entry");
    builder.createBlock("other");
    builder.switchToBlock(0);

    builder.declareVar("x", "i32");
    const val = builder.iconst(1, 0);
    builder.defineVar("x", val);
    builder.br(1);

    builder.switchToBlock(1);
    const used = builder.useVar("x");
    builder.unreachable();

    builder.sealBlock(0);
    builder.sealBlock(1);

    const fn = builder.build();
    assertTrue(fn !== null);
}

export function runTests() {
    const tests = [
        ["Simple var flow", testSimpleVarFlow],
        ["Var across blocks", testVarAcrossBlocks],
    ];

    for (const [name, fn] of tests) {
        test(name, fn);
    }
}
