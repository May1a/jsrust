import { describe, expect, test } from "bun:test";
import {
    compile,
    compileErrorDiagnostics,
    compileToBinary,
    formatCompileError,
} from "../src/compile";
import {
    BlockExpr,
    ClosureExpr,
    FnItem,
    IdentPattern,
    IdentifierExpr,
    InferredTypeNode,
    LetStmt,
    LiteralExpr,
    LiteralKind,
    ModuleNode,
    Mutability,
    NamedTypeNode,
    Span,
    TupleTypeNode,
} from "../src/parse/ast";
import { deserializeModule } from "../src/ir/ir_deserialize";
import { inferModule } from "../src/passes/inference";
import { TypeContext } from "../src/utils/type_context";
import { compileToIR } from "./helpers";
import {
    validateFunction,
    checkCallArgs,
    checkReturnTypes,
    populateAndCheckDefUse,
    ValidationContext,
    type IRValidationError,
} from "../src/ir/ir_validate";
import {
    BconstInst,
    BrTerm,
    CallInst,
    EnumCreateInst,
    EnumGetDataInst,
    FconstInst,
    FloatWidth,
    IaddInst,
    IcmpInst,
    IconstInst,
    IntWidth,
    type IRFunction,
    IRTypeKind,
    RetTerm,
    StoreInst,
    StructCreateInst,
    StructGetInst,
    addIRBlock,
    addIRBlockParam,
    addIRInstruction,
    freshBlockId,
    freshFunctionId,
    freshValueId,
    makeIRBlock,
    makeIRBoolType,
    makeIREnumType,
    makeIRFloatType,
    makeIRFnType,
    makeIRFunction,
    makeIRIntType,
    makeIRStructType,
    makeIRUnitType,
    setIRTerminator,
} from "../src/ir/ir";

function findValidationError(
    errors: IRValidationError[],
    substr: string,
): IRValidationError | undefined {
    return errors.find((e) => e.message.includes(substr));
}

function makeTestValidationFn(): IRFunction {
    return makeIRFunction(
        freshFunctionId(),
        "test",
        [],
        makeIRUnitType(),
    );
}

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

    describe("const items", () => {
        test("inlines top-level const values", () => {
            const result = compileToIR(
                "const VALUE: i32 = 7; fn test() -> i32 { VALUE }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 7");
        });

        test("resolves qualified consts from nested modules", () => {
            const result = compileToIR(
                "mod inner { pub const VALUE: i32 = 5; } fn test() -> i32 { inner::VALUE }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 5");
        });

        test("inlines block-local const items", () => {
            const result = compileToIR(
                "fn test() -> i32 { const VALUE: i32 = 2; VALUE + 1 }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 2");
            expect(result.value).toContain("iadd");
        });

        test("resolves inherent associated consts", () => {
            const result = compileToIR(
                "struct Foo {} impl Foo { const VALUE: i32 = 9; } fn test() -> i32 { Foo::VALUE }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 9");
        });

        test("resolves Self associated consts inside inherent impl methods", () => {
            const result = compileToIR(
                "struct Foo {} impl Foo { const VALUE: i32 = 9; fn get() -> i32 { Self::VALUE } } fn test() -> i32 { Foo::get() }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 9");
            expect(result.value).toContain("call get()");
        });

        test("resolves Self associated consts inside nested inherent const initializers", () => {
            const result = compileToIR(
                "struct Foo {} impl Foo { const A: i32 = 1; const B: i32 = { const LOCAL: i32 = Self::A; LOCAL }; } fn test() -> i32 { Foo::B }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 1");
        });

        test("resolves trait associated consts through impl defaults", () => {
            const result = compileToIR(
                "trait Has { const VALUE: i32 = 4; } impl Has for i32 {} fn test() -> i32 { i32::VALUE }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 4");
        });

        test("resolves Self associated consts inside trait impl methods", () => {
            const result = compileToIR(
                "trait Has { const VALUE: i32 = 4; fn get(&self) -> i32 { Self::VALUE } } impl Has for i32 { fn get(&self) -> i32 { Self::VALUE } } fn test() -> i32 { let value = 1; value.get() }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 4");
            expect(result.value).toContain("call get");
        });

        test("resolves Self references between inherent associated consts during inference", () => {
            const result = compileToIR(
                "struct Foo {} impl Foo { const A: i32 = 1; const B: i32 = Self::A; } fn test() -> i32 { Foo::B }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 1");
        });

        test("resolves Self references between trait const defaults", () => {
            const result = compileToIR(
                "trait Has { const A: i32 = 1; const B: i32 = Self::A; } impl Has for i32 {} fn test() -> i32 { i32::B }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 1");
        });

        test("resolves const aliases from use items", () => {
            const result = compileToIR(
                "mod inner { pub const VALUE: i32 = 5; } use inner::VALUE as ALIAS; fn test() -> i32 { ALIAS }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 5");
        });

        test("resolves self-prefixed const aliases from use items", () => {
            const result = compileToIR(
                "const VALUE: i32 = 5; use self::VALUE as ALIAS; fn test() -> i32 { ALIAS }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 5");
        });

        test("resolves chained const references", () => {
            const result = compileToIR(
                "const A: i32 = B; const B: i32 = 3; fn test() -> i32 { A }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;

            expect(result.value).toContain("iconst 3");
        });

        test("rejects recursive const references with a targeted error", () => {
            const result = compile(
                "const A: i32 = B; const B: i32 = A; fn test() -> i32 { A }",
            );
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;

            expect(formatCompileError(result.error)).toContain(
                "recursive const definition detected",
            );
        });

        test("rejects trait impls that omit required associated consts", () => {
            const result = compile(
                "trait Has { const VALUE: i32; } impl Has for i32 {} fn test() -> i32 { 0 }",
            );
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;

            expect(formatCompileError(result.error)).toContain(
                "Missing associated const `VALUE` in impl of trait `Has`",
            );
        });

        test("rejects trait impls that add undeclared associated consts", () => {
            const result = compile(
                "trait Has {} impl Has for i32 { const VALUE: i32 = 1; } fn test() -> i32 { 0 }",
            );
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;

            expect(formatCompileError(result.error)).toContain(
                "Associated const `VALUE` is not declared in trait `Has`",
            );
        });

        test("rejects trait impls that change associated const types", () => {
            const result = compile(
                "trait Has { const VALUE: i32; } impl Has for i32 { const VALUE: bool = true; } fn test() -> i32 { 0 }",
            );
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;

            expect(formatCompileError(result.error)).toContain(
                "Associated const `VALUE` for trait `Has` must have type `i32`, found `bool`",
            );
        });
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

describe("type inference", () => {
    test("infers integer literal suffixes correctly", () => {
        const suffixCases: [string, string][] = [
            ["i8", "fn test() -> i8 { 1i8 }"],
            ["i16", "fn test() -> i16 { 1i16 }"],
            ["i32", "fn test() -> i32 { 1i32 }"],
            ["i64", "fn test() -> i64 { 1i64 }"],
            ["isize", "fn test() -> isize { 1isize }"],
            ["u8", "fn test() -> u8 { 1u8 }"],
            ["u16", "fn test() -> u16 { 1u16 }"],
            ["u32", "fn test() -> u32 { 1u32 }"],
            ["u64", "fn test() -> u64 { 1u64 }"],
            ["usize", "fn test() -> usize { 1usize }"],
        ];
        for (const [label, code] of suffixCases) {
            const result = compile(code);
            expect(result.isOk(), `suffix ${label} should compile`).toBe(true);
        }
    });

    test("infers float literal suffixes correctly", () => {
        const result = compile("fn test() -> f32 { 3.14f32 }");
        expect(result.isOk()).toBe(true);

        const result2 = compile("fn test() -> f64 { 3.14f64 }");
        expect(result2.isOk()).toBe(true);
    });

    test("rejects mismatched integer suffix types", () => {
        const result = compile("fn test() -> i32 { 1u8 }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "expected `i32`, found `u8`",
        );
    });

    test("rejects mismatched float suffix types", () => {
        const result = compile("fn test() -> f64 { 1.0f32 }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "expected `f64`, found `f32`",
        );
    });

    test("defaults unsuffixed integer literals to i32", () => {
        const result = compile("fn test() -> i32 { 42 }");
        expect(result.isOk()).toBe(true);
    });

    test("defaults unsuffixed float literals to f64", () => {
        const result = compile("fn test() -> f64 { 3.14 }");
        expect(result.isOk()).toBe(true);
    });

    test("allows suffixed arithmetic with matching types", () => {
        const result = compile("fn test() -> u8 { let x: u8 = 10u8 + 20u8; x }");
        expect(result.isOk()).toBe(true);
    });

    test("placeholder _ in let-binding does not mask real type mismatches", () => {
        const result = compile("fn test() -> i32 { let _: bool = 42; 0 }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "expected `bool`, found `i32`",
        );
    });

    test("placeholder _ in let-binding accepts matching types", () => {
        const result = compile("fn test() -> i32 { let _ = 42; 0 }");
        expect(result.isOk()).toBe(true);
    });

    test("if-else with _ return types does not suppress mismatch", () => {
        const result = compile(
            "fn test() { let _ = if true { 1 } else { true }; }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain("incompatible types");
    });

    test("match arms with _ types does not suppress mismatch", () => {
        const result = compile(
            "fn test() { let _ = match 0 { 0 => 1, 1 => true }; }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "incompatible types",
        );
    });

    test("Option<_> unifies with Option<i32> in let-binding", () => {
        const result = compile(
            "fn test() { let x: Option<i32> = None; let _ = x; }",
        );
        expect(result.isOk()).toBe(true);
    });

    test("Result<_> unifies with Result<i32, bool> in let-binding", () => {
        const result = compile(
            "fn test() { let x: Result<i32, bool> = Ok(1); let _ = x; }",
        );
        expect(result.isOk()).toBe(true);
    });

    test("resolves qualified enum variant paths", () => {
        const result = compileToIR(
            "enum Color { Red, Green, Blue } fn test() -> Color { Color::Red }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain("enum Color");
    });

    test("rejects qualified paths to unknown types", () => {
        const result = compile("fn test() { let _ = Nonexistent::foo; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "cannot find value `Nonexistent::foo`",
        );
    });

    test("rejects qualified function calls to unknown types", () => {
        const result = compile("fn test() { Unknown::method(); }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "cannot find function `Unknown::method`",
        );
    });

    test("infers closure return type from body expression", () => {
        const result = compileToIR("fn test() { let f = || 42; }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain("__closure_0() -> i32");
    });

    test("infers closure return type from body with parameter usage", () => {
        const result = compileToIR(
            "fn test() { let add = |x: i32, y: i32| x + y; }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain(
            "__closure_0(v0 arg0: i32, v1 arg1: i32) -> i32",
        );
    });

    test("uses explicit closure return type annotation when present", () => {
        const result = compileToIR(
            "fn test() { let f = || -> i32 { 42 }; }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;

        expect(result.value).toContain("__closure_0() -> i32");
    });

    test("propagates closure body inference errors", () => {
        const span = new Span(1, 1, 0, 0);
        const closureBody = new BlockExpr(
            span,
            [
                new LetStmt(
                    span,
                    new IdentPattern(
                        span,
                        "value",
                        Mutability.Immutable,
                        new InferredTypeNode(span),
                    ),
                    new NamedTypeNode(span, "bool"),
                    new LiteralExpr(span, LiteralKind.Int, 1),
                ),
            ],
            new IdentifierExpr(span, "value"),
        );
        const closure = new ClosureExpr(
            span,
            [],
            new InferredTypeNode(span),
            closureBody,
        );
        const module = new ModuleNode(span, "main", [
            new FnItem(
                span,
                "test",
                [],
                new TupleTypeNode(span, []),
                new BlockExpr(
                    span,
                    [
                        new LetStmt(
                            span,
                            new IdentPattern(
                                span,
                                "f",
                                Mutability.Immutable,
                                new InferredTypeNode(span),
                            ),
                            new InferredTypeNode(span),
                            closure,
                        ),
                    ],
                ),
            ),
        ]);

        const result = inferModule(new TypeContext(), module);
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(result.error[0]?.message).toContain(
            "expected `bool`, found `i32`",
        );
    });

    test("range expressions produce explicit error", () => {
        const result = compile("fn test() { let _ = 1..10; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "range expressions are not supported",
        );
    });

    test("indexing non-array type produces error", () => {
        const result = compile("fn test() { let x = 5; let _ = x[0]; }");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "cannot index into value of type `i32`",
        );
    });

    test("unknown Option method produces error", () => {
        const result = compile(
            "fn test() { let value: Option<i32> = Some(1); let _ = value.missing(); }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "no method `missing` found for type `Option<i32>`",
        );
    });

    test("unknown Result method produces error", () => {
        const result = compile(
            "fn test() { let value: Result<i32, bool> = Ok(1); let _ = value.missing(); }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "no method `missing` found for type `Result<i32, bool>`",
        );
    });

    test("catches type errors inside generic method bodies", () => {
        const result = compile(
            "struct Pair { x: i32, y: i32 } impl Pair { fn bad<T>(self) -> bool { let x: bool = 42; true } }",
        );
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;

        expect(formatCompileError(result.error)).toContain(
            "expected `bool`, found `i32`",
        );
    });
});

describe("lowering correctness (plan 02)", () => {
    describe("deref type (02.1)", () => {
        test("deref &i32 loads i32 not i64", () => {
            const result = compileToIR(
                "fn test() { let x: i32 = 42; let r = &x; let y = *r; let _ = y; }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("i32           = load");
            expect(result.value).not.toContain("i64           = load");
        });

        test("deref &bool loads bool not i64", () => {
            const result = compileToIR(
                "fn test() { let x: bool = true; let r = &x; let y = *r; let _ = y; }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("bool          = load");
        });

        test("deref &&i32 loads the inner reference type", () => {
            const result = compileToIR(
                "fn test() { let x: i32 = 1; let r = &x; let rr = &r; let inner = *rr; let _ = inner; }",
            );
            expect(result.isOk()).toBe(true);
        });
    });

    describe("assignment targets (02.2)", () => {
        test("struct field assignment compiles", () => {
            const result = compileToIR(
                "struct Point { x: i32, y: i32 } fn test() { let mut p = Point { x: 1, y: 2 }; p.x = 10; let _ = p; }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("gep");
            expect(result.value).toContain("store");
        });

        test("deref write assignment compiles", () => {
            const result = compileToIR(
                "fn test() { let mut x: i32 = 0; let r = &mut x; *r = 99; let _ = x; }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("store");
        });

        test("array index assignment compiles", () => {
            const result = compileToIR(
                "fn test() { let mut arr = vec![1i32, 2, 3]; arr[0] = 42; let _ = arr; }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("gep");
            expect(result.value).toContain("store");
        });

        test("unsupported assignment targets produce a clear error", () => {
            const result = compile(
                "fn test() { let x = 1; 42 = x; }",
            );
            expect(result.isErr()).toBe(true);
        });
    });

    describe("tuple lowering (02.3)", () => {
        test("tuple construction compiles to a struct", () => {
            const result = compileToIR(
                "fn test() { let t = (1i32, true); let _ = t; }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("struct_create");
        });

        test("tuple field access compiles", () => {
            const result = compileToIR(
                "fn test() -> i32 { let t = (42i32, false); t.0 }",
            );
            expect(result.isOk()).toBe(true);
            if (result.isErr()) return;
            expect(result.value).toContain("struct_get");
        });

        test("empty tuple () lowers to unit", () => {
            const result = compileToIR(
                "fn test() -> () { let _t = (); }",
            );
            expect(result.isOk()).toBe(true);
        });

        test("tuple type annotation is recognised", () => {
            const result = compile(
                "fn test() -> (i32, bool) { (1, true) }",
            );
            expect(result.isOk()).toBe(true);
        });

        test("nested tuples compile", () => {
            const result = compileToIR(
                "fn test() { let t = ((1i32, 2i32), true); let _ = t; }",
            );
            expect(result.isOk()).toBe(true);
        });
    });
});

describe("ir validation", () => {
    const BAD_BLOCK_ID = 999;
    const BAD_VALUE_ID = 9999;
    const OUT_OF_BOUNDS_INDEX = 5;
    const OUT_OF_BOUNDS_VARIANT = 9;
    const TEST_INT_VALUE = 42;

    describe("terminator presence", () => {
        test("passes when every block has a terminator", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isOk()).toBe(true);
        });

        test("fails when a block has no terminator", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(result.error).toHaveLength(1);
            expect(findValidationError(result.error, "no terminator")).toBeDefined();
        });
    });

    describe("branch targets", () => {
        test("fails when branch target does not exist", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            setIRTerminator(block, new BrTerm(BAD_BLOCK_ID, []));
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(findValidationError(result.error, "does not exist")).toBeDefined();
        });

        test("passes when branch targets exist", () => {
            const fn = makeTestValidationFn();
            const a = makeIRBlock(freshBlockId(), "a");
            const b = makeIRBlock(freshBlockId(), "b");
            addIRBlock(fn, a);
            addIRBlock(fn, b);
            setIRTerminator(a, new BrTerm(b.id, []));
            setIRTerminator(b, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isOk()).toBe(true);
        });
    });

    describe("block parameter consistency", () => {
        test("fails when branch arg count does not match params", () => {
            const fn = makeTestValidationFn();
            const a = makeIRBlock(freshBlockId(), "a");
            const b = makeIRBlock(freshBlockId(), "b");
            addIRBlockParam(b, freshValueId(), makeIRIntType(IntWidth.I32));
            addIRBlockParam(b, freshValueId(), makeIRBoolType());
            addIRBlock(fn, a);
            addIRBlock(fn, b);
            setIRTerminator(a, new BrTerm(b.id, [freshValueId()]));
            setIRTerminator(b, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "has 1 arguments, expected 2"),
            ).toBeDefined();
        });
    });

    describe("def-use consistency", () => {
        test("passes when all values are defined before use", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const c1 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                1,
            );
            const c2 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                2,
            );
            addIRInstruction(block, c1);
            addIRInstruction(block, c2);
            addIRInstruction(
                block,
                new IaddInst(
                    freshValueId(),
                    makeIRIntType(IntWidth.I32),
                    c1.id,
                    c2.id,
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isOk()).toBe(true);
        });

        test("fails when a value is used before definition", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const c1 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                1,
            );
            addIRInstruction(block, c1);
            addIRInstruction(
                block,
                new IaddInst(
                    freshValueId(),
                    makeIRIntType(IntWidth.I32),
                    c1.id,
                    BAD_VALUE_ID,
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "used before definition"),
            ).toBeDefined();
        });
    });

    describe("instruction operand type consistency", () => {
        test("passes when int arithmetic operands are IntType", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const c1 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                1,
            );
            const c2 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                2,
            );
            addIRInstruction(block, c1);
            addIRInstruction(block, c2);
            addIRInstruction(
                block,
                new IaddInst(
                    freshValueId(),
                    makeIRIntType(IntWidth.I32),
                    c1.id,
                    c2.id,
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isOk()).toBe(true);
        });

        test("fails when int arithmetic gets a float operand", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const c1 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                1,
            );
            const c2 = new FconstInst(
                freshValueId(),
                makeIRFloatType(FloatWidth.F64),
                2,
            );
            addIRInstruction(block, c1);
            addIRInstruction(block, c2);
            addIRInstruction(
                block,
                new IaddInst(
                    freshValueId(),
                    makeIRIntType(IntWidth.I32),
                    c1.id,
                    c2.id,
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "must be IntType"),
            ).toBeDefined();
        });

        test("fails when Icmp operands have different types", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const c1 = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                1,
            );
            const c2 = new BconstInst(freshValueId(), true);
            addIRInstruction(block, c1);
            addIRInstruction(block, c2);
            addIRInstruction(
                block,
                new IcmpInst(freshValueId(), 0, c1.id, c2.id),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "must have same type"),
            ).toBeDefined();
        });

        test("fails when Store pointer is not PtrType", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const val = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                TEST_INT_VALUE,
            );
            const ptr = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                0,
            );
            addIRInstruction(block, val);
            addIRInstruction(block, ptr);
            addIRInstruction(
                block,
                new StoreInst(freshValueId(), val.id, ptr.id),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "must be PtrType"),
            ).toBeDefined();
        });
    });

    describe("enum operations bounds check", () => {
        test("passes when enum tag is in bounds", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const enumTy = makeIREnumType("MyEnum", [
                [],
                [makeIRIntType(IntWidth.I32)],
            ]);
            addIRInstruction(
                block,
                new EnumCreateInst(freshValueId(), 0, undefined, enumTy),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isOk()).toBe(true);
        });

        test("fails when EnumCreate tag is out of bounds", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            addIRInstruction(
                block,
                new EnumCreateInst(
                    freshValueId(),
                    OUT_OF_BOUNDS_INDEX,
                    undefined,
                    makeIREnumType("MyEnum", [[]]),
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "out of bounds"),
            ).toBeDefined();
        });

        test("fails when EnumGetData variant is out of bounds", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const enumTy = makeIREnumType("MyEnum", [[]]);
            const ev = new EnumCreateInst(
                freshValueId(),
                0,
                undefined,
                enumTy,
            );
            addIRInstruction(block, ev);
            addIRInstruction(
                block,
                new EnumGetDataInst(
                    freshValueId(),
                    ev.id,
                    enumTy,
                    makeIRIntType(IntWidth.I32),
                    OUT_OF_BOUNDS_VARIANT,
                    0,
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "out of bounds"),
            ).toBeDefined();
        });
    });

    describe("struct operations check", () => {
        test("fails when StructGet index is out of bounds", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const structTy = makeIRStructType("MyStruct", [
                makeIRIntType(IntWidth.I32),
            ]);
            const sv = new StructCreateInst(
                freshValueId(),
                [freshValueId()],
                structTy,
            );
            addIRInstruction(block, sv);
            addIRInstruction(
                block,
                new StructGetInst(
                    freshValueId(),
                    sv.id,
                    OUT_OF_BOUNDS_INDEX,
                    structTy,
                    makeIRIntType(IntWidth.I32),
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "out of bounds"),
            ).toBeDefined();
        });

        test("fails when StructCreate field count does not match", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const structTy = makeIRStructType("MyStruct", [
                makeIRIntType(IntWidth.I32),
                makeIRBoolType(),
            ]);
            addIRInstruction(
                block,
                new StructCreateInst(
                    freshValueId(),
                    [freshValueId()],
                    structTy,
                ),
            );
            setIRTerminator(block, new RetTerm());
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(
                findValidationError(result.error, "has 1 fields, expected 2"),
            ).toBeDefined();
        });
    });

    describe("call argument count", () => {
        test("passes when args match callee params", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const argVal = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                TEST_INT_VALUE,
            );
            addIRInstruction(block, argVal);
            const calleeType = makeIRFnType(
                [makeIRIntType(IntWidth.I32)],
                makeIRUnitType(),
            );
            addIRInstruction(
                block,
                new CallInst(
                    freshValueId(),
                    0,
                    [argVal.id],
                    calleeType,
                    makeIRUnitType(),
                ),
            );
            setIRTerminator(block, new RetTerm());
            const ctx = new ValidationContext(fn);
            populateAndCheckDefUse(ctx);
            checkCallArgs(ctx);
            expect(ctx.errors).toHaveLength(0);
        });

        test("fails when call has wrong arg count", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const argVal = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                TEST_INT_VALUE,
            );
            addIRInstruction(block, argVal);
            const calleeType = makeIRFnType(
                [makeIRIntType(IntWidth.I32), makeIRBoolType()],
                makeIRUnitType(),
            );
            addIRInstruction(
                block,
                new CallInst(
                    freshValueId(),
                    0,
                    [argVal.id],
                    calleeType,
                    makeIRUnitType(),
                ),
            );
            setIRTerminator(block, new RetTerm());
            const ctx = new ValidationContext(fn);
            populateAndCheckDefUse(ctx);
            checkCallArgs(ctx);
            expect(ctx.errors.length).toBeGreaterThan(0);
            expect(
                findValidationError(ctx.errors, "has 1 args, expected 2"),
            ).toBeDefined();
        });
    });

    describe("return type matching", () => {
        test("passes when return value matches function return type", () => {
            const fn = makeIRFunction(
                freshFunctionId(),
                "test",
                [],
                makeIRIntType(IntWidth.I32),
            );
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const val = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                TEST_INT_VALUE,
            );
            addIRInstruction(block, val);
            setIRTerminator(block, new RetTerm(val.id));
            const ctx = new ValidationContext(fn);
            populateAndCheckDefUse(ctx);
            checkReturnTypes(ctx);
            expect(ctx.errors).toHaveLength(0);
        });

        test("fails when return value type does not match", () => {
            const fn = makeIRFunction(
                freshFunctionId(),
                "test",
                [],
                makeIRBoolType(),
            );
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const val = new IconstInst(
                freshValueId(),
                makeIRIntType(IntWidth.I32),
                TEST_INT_VALUE,
            );
            addIRInstruction(block, val);
            setIRTerminator(block, new RetTerm(val.id));
            const ctx = new ValidationContext(fn);
            populateAndCheckDefUse(ctx);
            checkReturnTypes(ctx);
            expect(ctx.errors.length).toBeGreaterThan(0);
            expect(
                findValidationError(
                    ctx.errors,
                    "Return type mismatch",
                ),
            ).toBeDefined();
        });
    });

    describe("validation error context", () => {
        test("includes function name in error", () => {
            const fn = makeIRFunction(
                freshFunctionId(),
                "my_func",
                [],
                makeIRUnitType(),
            );
            const block = makeIRBlock(freshBlockId(), "entry");
            addIRBlock(fn, block);
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(result.error[0].functionName).toBe("my_func");
        });

        test("includes block name when applicable", () => {
            const fn = makeTestValidationFn();
            const block = makeIRBlock(freshBlockId(), "my_block");
            addIRBlock(fn, block);
            const result = validateFunction(fn);
            expect(result.isErr()).toBe(true);
            if (result.isOk()) return;
            expect(result.error[0].blockName).toBe("my_block");
        });
    });
});
