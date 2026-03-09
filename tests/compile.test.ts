import { describe, expect, test } from "bun:test";
import { compile, compileToBinary, formatCompileError } from "../src/compile";
import { deserializeModule } from "../src/ir_deserialize";
import { EnumGetDataInst } from "../src/ir";
import { compileToIR } from "./helpers";

describe("compile", () => {
    test("rejects implicit unit for non-unit return type", () => {
        const result = compile("fn broken() -> i32 { let x = 1; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(formatCompileError(result.error)).toContain(
            "Mismatched return type: expected `i32`, found `()`",
        );
    });

    test("serializes alloca-based functions with backend-compatible layout", () => {
        const result = compileToBinary(
            "fn test_example() { let x = 1; let y = true; }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        const deserialized = deserializeModule(result.value.bytes);
        expect(deserialized.isOk()).toBe(true);
    });

    test("serializes enum payload access with concrete enum metadata", () => {
        const result = compileToBinary(
            "#[test] fn simple_opt() { assert_eq!(Some(5), Some(5)); }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        const deserialized = deserializeModule(result.value.bytes);
        expect(deserialized.isOk()).toBe(true);
        if (deserialized.isErr()) return;

        // Verify that EnumGetDataInst round-trips with the concrete enum name,
        // not the anonymous placeholder used before this fix.
        const module = deserialized.value;
        const enumGetDataInsts: EnumGetDataInst[] = [];
        for (const fn of module.functions) {
            for (const block of fn.blocks) {
                for (const inst of block.instructions) {
                    if (inst instanceof EnumGetDataInst) {
                        enumGetDataInsts.push(inst);
                    }
                }
            }
        }
        expect(enumGetDataInsts.length).toBeGreaterThan(0);
        for (const inst of enumGetDataInsts) {
            expect(inst.enumType.name).toBe("Option");
        }
    });

    test("routes non-exhaustive matches to a trap block", () => {
        const result = compileToIR("fn test() -> i32 { match 3 { 1 => 10, 2 => 20 } }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain("default: b3");
        expect(result.value).toContain("(match_trap):");
        expect(result.value).toContain("unreachable");
    });

    test("binds default identifier patterns to the scrutinee", () => {
        const result = compileToIR(
            "fn test() -> i32 { let y = 7; let x = 3; let z = match x { y => y }; z }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain("store v6 -> v7");
        expect(result.value).toContain("v9: i32      = load v7");
    });

    test("does not force builtin Option for user enums named Some or None", () => {
        const result = compileToIR(
            "enum Maybe { None, Some } fn test() { let x = Some; let _y = match x { Some => 1, None => 0 }; }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain("enum Maybe { [], [] }");
        expect(result.value).toContain("enum_create Maybe tag=1");
    });

    test("infers user-defined enum variant types rather than builtin Option", () => {
        // The return type annotation `Maybe` should be satisfied even though
        // the body contains bare `Some`, which is a variant of Maybe here.
        const result = compile(
            "enum Maybe { None, Some } fn test() -> Maybe { Some }",
        );
        expect(result.isOk()).toBe(true);
    });

    test("rejects Some with the wrong arity", () => {
        const result = compile("fn test() { let _x = Some(); }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "`Some` requires exactly one argument",
        );
    });

    test("rejects None with the wrong arity", () => {
        const result = compile("fn test() { let _x = None(1); }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "`None` does not take any arguments",
        );
    });
});
