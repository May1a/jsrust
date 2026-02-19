// Memory tests for alloca, load, store, memcpy, gep, ptradd
import { assertEqual, test } from "../lib.js";
import { IRBuilder } from "../../ir_builder.js";
import { IntWidth } from "../../types.js";

// Additional memory-specific tests

export function testAllocaStackSlot() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "unit");
    builder.createBlock("entry");
    builder.switchToBlock(0);

    const ptr1 = builder.alloca("i32", 0);
    const ptr2 = builder.alloca("i64", 1);
    const ptr3 = builder.alloca("f64", 2);

    builder.unreachable();
    builder.sealBlock(0);
    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions.length, 3);
}

export function testGepArray() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "i32");
    builder.createBlock("entry");
    builder.switchToBlock(0);

    const arrPtr = builder.alloca("[10 x i32]", 0);
    const elemPtr = builder.gep(arrPtr, [0], "i32");
    builder.ret(elemPtr);

    builder.sealBlock(0);
    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 26); // Gep
}

export function testGepStruct() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "i32");
    builder.createBlock("entry");
    builder.switchToBlock(0);

    const structPtr = builder.alloca("Point", 0);
    const field2 = builder.gep(structPtr, [0, 1], "i32");
    builder.ret(field2);

    builder.sealBlock(0);
    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions[1].kind, 26); // Gep
}

export function testMemcpySequence() {
    const builder = new IRBuilder();
    builder.createFunction("test", [], "unit");
    builder.createBlock("entry");
    builder.switchToBlock(0);

    const dest = builder.alloca("i8", 0);
    const src = builder.iconst(42, IntWidth.I32); // Wrong type but for test
    const size = builder.iconst(4, IntWidth.I32);
    builder.memcpy(dest, dest, size); // simplified
    builder.unreachable();

    builder.sealBlock(0);
    const fn = builder.build();
    assertEqual(fn.blocks[0].instructions.at(-1).kind, 25); // Memcpy
}

export function runTests() {
    const tests = [
        ["Alloca stack slot", testAllocaStackSlot],
        ["Gep array", testGepArray],
        ["Gep struct", testGepStruct],
        ["Memcpy sequence", testMemcpySequence],
    ];

    for (const [name, fn] of tests) {
        test(name, fn);
    }
}
