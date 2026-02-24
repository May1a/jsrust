// Control flow tests
import { assertEqual, test } from "../lib";
import { IRBuilder } from "../../src/ir_builder";
import { IntWidth } from "../../src/types";

export function testBrTarget() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "unit");
    builder.createBlock("entry");
    builder.createBlock("target");
    builder.switchToBlock(0);
    builder.br(1);
    builder.switchToBlock(1);
    builder.unreachable();
    builder.sealBlock(0);
    builder.sealBlock(1);

    const fn = builder.build();
    assertEqual(fn.blocks[0].terminator.kind, 1); // Br
    assertEqual(fn.blocks[0].successors[0], 1);
}

export function testBrIfFlow() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "unit");
    builder.createBlock("entry");
    builder.createBlock("then");
    builder.createBlock("else");
    builder.switchToBlock(0);

    const cond = builder.bconst(true);
    builder.brIf(cond, 1, [], 2, []);

    builder.switchToBlock(1);
    builder.unreachable();

    builder.switchToBlock(2);
    builder.unreachable();

    builder.sealBlock(0);
    builder.sealBlock(1);
    builder.sealBlock(2);

    const fn = builder.build();
    const brIf = fn.blocks[0].terminator;
    assertEqual(brIf.kind, 2);
    assertEqual(brIf.thenBlock, 1);
    assertEqual(brIf.elseBlock, 2);
}

export function testSwitch() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "unit");
    builder.createBlock("entry");
    builder.createBlock("case1");
    builder.createBlock("case2");
    builder.createBlock("default");
    builder.switchToBlock(0);

    const val = builder.iconst(1, IntWidth.I32);
    const cases = [
        { value: 1, target: 1, args: [] },
        { value: 2, target: 2, args: [] },
    ];
    builder.switch(val, cases, 3, []);

    builder.switchToBlock(1);
    builder.unreachable();
    builder.switchToBlock(2);
    builder.unreachable();
    builder.switchToBlock(3);
    builder.unreachable();

    builder.sealBlock(0);
    builder.sealBlock(1);
    builder.sealBlock(2);
    builder.sealBlock(3);

    const fn = builder.build();
    const sw = fn.blocks[0].terminator;
    assertEqual(sw.kind, 3);
    assertEqual(sw.cases.length, 2);
    assertEqual(sw.defaultBlock, 3);
}

export function functionWithMultipleBasicBlocks() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "i32");
    builder.createBlock("entry");
    builder.createBlock("if_true");
    builder.createBlock("if_false");
    builder.createBlock("merge");

    builder.switchToBlock(0);
    const cond = builder.bconst(true);
    builder.brIf(cond, 1, [], 2, []);

    builder.switchToBlock(1);
    const val1 = builder.iconst(1, IntWidth.I32);
    builder.br(3, [val1]);

    builder.switchToBlock(2);
    const val2 = builder.iconst(0, IntWidth.I32);
    builder.br(3, [val2]);

    builder.switchToBlock(3);
    // In a real SSA builder, we'd have a phi here
    builder.unreachable();

    builder.sealBlock(0);
    builder.sealBlock(1);
    builder.sealBlock(2);
    builder.sealBlock(3);

    const fn = builder.build();
    assertEqual(fn.blocks.length, 4);
    // Entry has BrIf
    assertEqual(fn.blocks[0].terminator.kind, 2);
    assertEqual(fn.blocks[1].terminator.kind, 1);
    assertEqual(fn.blocks[2].terminator.kind, 1);
}

export function runTests() {
    const tests = [
        ["Br target", testBrTarget],
        ["BrIf flow", testBrIfFlow],
        ["Switch", testSwitch],
        ["Multiple basic blocks", functionWithMultipleBasicBlocks],
    ];

    for (const [name, fn] of tests) {
        test(name, fn);
    }
}
