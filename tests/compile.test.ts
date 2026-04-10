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
import { EnumGetDataInst, IRTypeKind } from "../src/ir/ir";
import { inferModule } from "../src/passes/inference";
import { TypeContext } from "../src/utils/type_context";
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
