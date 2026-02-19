// Variable tests for SSA variable tracking and phi construction
import { assertTrue } from "../lib.js";
import { IRBuilder } from "../../ir_builder.js";

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

    const fn = builder.build();
    assertTrue(fn !== null);
}

export function runTests() {
    const tests = [
        ["Simple var flow", testSimpleVarFlow],
        ["Var across blocks", testVarAcrossBlocks],
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
