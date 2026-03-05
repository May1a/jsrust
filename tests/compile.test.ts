import { describe, expect, test } from "bun:test";
import { compile, compileToBinary, formatCompileError } from "../src/compile";
import { deserializeModule } from "../src/ir_deserialize";

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
});
