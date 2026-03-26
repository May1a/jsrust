import { describe, expect, test } from "bun:test";
import {
    compile,
    compileErrorDiagnostics,
    compileToBinary,
    formatCompileError,
} from "../src/compile";
import { deserializeModule } from "../src/ir/ir_deserialize";
import { EnumGetDataInst, IRTypeKind } from "../src/ir/ir";
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
            expect(inst.enumType.variants[1]).toHaveLength(1);
            expect(inst.enumType.variants[1]?.[0]?.kind).toBe(IRTypeKind.Int);
        }
    });

    test("preserves distinct concrete Option metadata entries", () => {
        const result = compileToBinary(
            "fn test() { let x: Option<i32> = None; let y: Option<bool> = None; let _ = x; let _ = y; }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        const deserialized = deserializeModule(result.value.bytes);
        expect(deserialized.isOk()).toBe(true);
        if (deserialized.isErr()) return;

        const optionPayloadKinds = [...deserialized.value.enums.values()]
            .filter((enumTy) => enumTy.name === "Option")
            .map((enumTy) => enumTy.variants[1]?.[0]?.kind);

        expect(optionPayloadKinds).toContain(IRTypeKind.Int);
        expect(optionPayloadKinds).toContain(IRTypeKind.Bool);
    });

    test("preserves contextual Result metadata for Ok and Err initializers", () => {
        const result = compileToBinary(
            "fn test() { let ok: Result<i32, bool> = Ok(1); let err: Result<i32, bool> = Err(true); let _ = ok; let _ = err; }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        const deserialized = deserializeModule(result.value.bytes);
        expect(deserialized.isOk()).toBe(true);
        if (deserialized.isErr()) return;

        const resultEnumVariants = [...deserialized.value.enums.values()]
            .filter((enumTy) => enumTy.name === "Result")
            .map((enumTy) => ({
                okKind: enumTy.variants[0]?.[0]?.kind,
                errKind: enumTy.variants[1]?.[0]?.kind,
            }));

        expect(resultEnumVariants).toContainEqual({
            okKind: IRTypeKind.Int,
            errKind: IRTypeKind.Bool,
        });
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

    test("rejects builtin Result methods with extra arguments", () => {
        const result = compile(
            "fn test() { let value: Result<i32, i32> = Ok(1); let _ = value.is_ok(123); }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "`is_ok` does not take any arguments",
        );
    });

    test("rejects builtin expect without its message argument", () => {
        const result = compile(
            "fn test() { let value: Result<i32, i32> = Ok(1); let _ = value.expect(); }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "`expect` requires exactly one argument",
        );
    });

    test("reports missing Result methods instead of swallowing the error", () => {
        const result = compile(
            "fn test() { let value: Result<i32, i32> = Ok(1); let _ = value.missing(); }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "no method `missing` found for type `Result<i32, i32>`",
        );
    });

    test("rejects &Option annotations with a targeted suggestion", () => {
        const result = compile("fn test() { let value: &Option<i32> = &Some(1); }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "cannot use `&Option<i32>`; use `Option<&i32>` instead",
        );
    });

    test("rejects &Result signatures with a targeted suggestion", () => {
        const result = compile(
            "fn test(value: &Result<i32, bool>) -> &Result<i32, bool> { value }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "cannot use `&Result<i32, bool>`; use `Result<&i32, bool>` instead",
        );
    });

    test("rejects parsed try expressions as unsupported instead of erasing them", () => {
        const result = compile("fn test() { let value: Result<i32, i32> = Ok(1); let _ = value?; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "`?` expressions are parsed but not implemented yet",
        );
        const diagnostics = compileErrorDiagnostics(result.error);
        expect(diagnostics).toBeDefined();
        expect(diagnostics?.[0]?.phase).toBe("type");
    });

    test("rejects parsed if-let expressions as unsupported instead of rewriting them", () => {
        const result = compile("fn test() -> i32 { if let Some(x) = Some(1) { x } else { 0 } }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "`if let` is parsed but not implemented yet",
        );
    });

    test("rejects parsed type aliases as unsupported instead of dropping them", () => {
        const result = compile("type Id = i32; fn test(value: Id) -> Id { value }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "type aliases are parsed but not implemented yet",
        );
    });

    test("accepts equivalent array lengths from separate annotations", () => {
        const result = compile("fn id(value: [i32; 3]) -> [i32; 3] { value }");
        expect(result.isOk()).toBe(true);
    });

    test("rejects heterogeneous vec! elements", () => {
        const result = compile("fn test() { let _ = vec![1, true]; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "Type mismatch in vec! macro: expected `i32`, found `bool`",
        );
    });

    test("renders raw pointer mismatches with readable type strings", () => {
        const result = compile(
            "fn test(value: *const i32) -> *mut i32 { value }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "expected `*mut i32`, found `*const i32`",
        );
    });

    test("renders function type mismatches with readable signatures", () => {
        const result = compile(
            "fn test(callback: fn(i32) -> i32) -> fn(bool) -> i32 { callback }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "expected `fn(bool) -> i32`, found `fn(i32) -> i32`",
        );
    });
});
