import { describe, expect, test } from "bun:test";
import {
    compileToLlvm,
    formatCompileError,
} from "../src/compile";
import { TestFnItem } from "../src/parse/ast";
import { parseModule } from "../src/parse/parser";
import {
    LLVM_I32,
    LLVM_I8,
    llvmArray,
    printLlvmModule,
    type LlvmModule,
} from "../src/llvm";
import { compileToLlvmText } from "./helpers";

const SHORT_C_STRING_LENGTH = 4;

describe("compile diagnostics", () => {
    test("rejects implicit unit for non-unit return type", () => {
        const result = compileToLlvm("fn broken() -> i32 { let x = 1; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            return;
        }
        expect(formatCompileError(result.error)).toContain(
            "Mismatched return type: expected `i32`, found `()`",
        );
    });

    test("rejects unsupported try expressions before LLVM emission", () => {
        const result = compileToLlvm(
            "fn test() { let value: Result<i32, i32> = Ok(1); let _ = value?; }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            return;
        }
        expect(formatCompileError(result.error)).toContain(
            "`?` expressions are parsed but not implemented yet",
        );
    });
});

describe("LLVM IR emission", () => {
    test("emits a void test function", () => {
        const result = compileToLlvmText("#[test] fn test_example() {}");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toContain("define i32 @test_example()");
        expect(result.value).toContain("ret i32 0");
    });

    test("emits integer arithmetic", () => {
        const result = compileToLlvmText(
            "fn test() -> i32 { let a = 10 + 5; a }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toContain(" = add i32 10, 5");
        expect(result.value).toContain("ret i32");
    });

    test("lowers block parameters to phi nodes", () => {
        const result = compileToLlvmText(
            "fn test(flag: bool) -> i32 { if flag { 1 } else { 2 } }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toContain(" = phi i32");
    });

    test("emits insertvalue and extractvalue for structs", () => {
        const result = compileToLlvmText(
            "struct Point { x: i32, y: i32 } fn test() -> i32 { let p = Point { x: 1, y: 2 }; p.x }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toContain("insertvalue %struct.Point");
        expect(result.value).toContain("extractvalue %struct.Point");
    });

    test("emits enum aggregates for Option", () => {
        const result = compileToLlvmText(
            "#[test] fn simple_opt() { assert_eq!(Some(5), Some(5)); }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toContain("%enum.Option");
        expect(result.value).toContain("insertvalue");
        expect(result.value).toContain("extractvalue");
    });

    test("emits printf declaration and format globals for println", () => {
        const result = compileToLlvmText(
            String.raw`#[test] #[expect_output("value: 42\n")] fn test_example() { println!("value: {}", 42); }`,
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toContain("declare i32 @printf(ptr, ...)");
        expect(result.value).toContain("%lld");
    });
});

describe("test discovery", () => {
    test("parses expect_output in either attribute order", () => {
        const source =
            "#[expect_output(\"hi\\n\")]\n#[test]\nfn test_example() {}";
        const result = compileToLlvm(source);
        expect(result.isOk()).toBe(true);

        const parsed = parseModule(source);
        expect(parsed.isOk()).toBe(true);
        if (parsed.isErr()) {
            return;
        }
        const [item] = parsed.value.items;
        expect(item).toBeInstanceOf(TestFnItem);
        if (!(item instanceof TestFnItem)) {
            return;
        }
        expect(item.expectedOutput).toBe("hi\n");
    });
});

describe("LLVM printer", () => {
    test("escapes global names and C strings", () => {
        const module: LlvmModule = {
            sourceName: "unit",
            targetVersion: "22.1.5",
            namedTypes: [],
            globals: [
                {
                    name: "quoted\"name",
                    type: llvmArray(SHORT_C_STRING_LENGTH, LLVM_I8),
                    initializer: 'c"hi\\00"',
                    linkage: "private",
                    unnamedAddr: true,
                },
            ],
            declarations: [],
            functions: [
                {
                    name: "main",
                    returnType: LLVM_I32,
                    params: [],
                    blocks: [{ name: "b0", lines: [], terminator: "ret i32 0" }],
                },
            ],
        };

        const printed = printLlvmModule(module);
        expect(printed).toContain(String.raw`@"quoted\22name"`);
        expect(printed).toContain("ret i32 0");
    });
});
