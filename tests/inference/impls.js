import { parseModule } from "../../parser.js";
import { resolveModuleTree } from "../../module_resolver.js";
import { expandDerives } from "../../derive_expand.js";
import { TypeContext } from "../../type_context.js";
import { inferModule } from "../../inference.js";
import { assert, assertEq, testGroup } from "../lib.js";

function inferSource(source) {
    const parseResult = parseModule(source);
    if (!parseResult.ok || !parseResult.value) {
        return { ok: false, stage: "parse", errors: parseResult.errors || [] };
    }
    const resolveResult = resolveModuleTree(parseResult.value);
    if (!resolveResult.ok || !resolveResult.module) {
        return {
            ok: false,
            stage: "resolve",
            errors: resolveResult.errors || [],
        };
    }
    const deriveResult = expandDerives(resolveResult.module);
    if (!deriveResult.ok || !deriveResult.module) {
        return {
            ok: false,
            stage: "derive",
            errors: deriveResult.errors || [],
        };
    }
    const ctx = new TypeContext();
    const inferResult = inferModule(ctx, deriveResult.module);
    return { ...inferResult, ctx };
}

testGroup("Impl Inference", () => {
    assert("static method and Self constructor", () => {
        const result = inferSource(
            "struct Point { x: i32, y: i32 } impl Point { fn new(x: i32, y: i32) -> Self { Self { x, y } } } fn main() { let _p = Point::new(1, 2); }",
        );
        assertEq(result.ok, true);
    });

    assert("receiver method call", () => {
        const result = inferSource(
            "struct Point { x: i32, y: i32 } impl Point { fn add(&self, other: &Point) -> Point { Point { x: self.x + other.x, y: self.y + other.y } } } fn main() { let p1 = Point { x: 1, y: 2 }; let p2 = Point { x: 3, y: 4 }; let _p3 = p1.add(&p2); }",
        );
        assertEq(result.ok, true);
    });

    assert("unknown method on struct fails", () => {
        const result = inferSource(
            "struct Point { x: i32 } fn main() { let p = Point { x: 1 }; let _y = p.missing(); }",
        );
        assertEq(result.ok, false);
    });

    assert("impl target must exist", () => {
        const result = inferSource("impl Missing { fn x() {} }");
        assertEq(result.ok, false);
    });

    assert("trait impl method call on builtin type", () => {
        const result = inferSource(
            "trait Add { fn add(&self, other: &Self) -> Self; } impl Add for i32 { fn add(&self, other: &Self) -> Self { self + other } } fn main() { let a = 1; let b = 2; let _c = a.add(&b); }",
        );
        assertEq(result.ok, true);
    });

    assert("inherent method beats trait method", () => {
        const result = inferSource(
            "trait Add { fn add(&self, other: &Self) -> Self; } struct Point { x: i32 } impl Point { fn add(&self, other: &Point) -> Point { Point { x: self.x + other.x } } } impl Add for Point { fn add(&self, other: &Self) -> Self { Point { x: 0 } } } fn main() { let a = Point { x: 1 }; let b = Point { x: 2 }; let _c = a.add(&b); }",
        );
        assertEq(result.ok, true);
    });

    assert("duplicate trait impl rejected", () => {
        const result = inferSource(
            "trait Add { fn add(&self, other: &Self) -> Self; } impl Add for i32 { fn add(&self, other: &Self) -> Self { self + other } } impl Add for i32 { fn add(&self, other: &Self) -> Self { self + other } }",
        );
        assertEq(result.ok, false);
    });

    assert("missing trait method rejected", () => {
        const result = inferSource(
            "trait Add { fn add(&self, other: &Self) -> Self; } impl Add for i32 { }",
        );
        assertEq(result.ok, false);
    });

    assert("extra method in trait impl rejected", () => {
        const result = inferSource(
            "trait Add { fn add(&self, other: &Self) -> Self; } impl Add for i32 { fn add(&self, other: &Self) -> Self { self + other } fn extra(&self) -> Self { self + 1 } }",
        );
        assertEq(result.ok, false);
    });

    assert("ambiguous trait method call rejected", () => {
        const result = inferSource(
            "trait A { fn f(&self) -> i32; } trait B { fn f(&self) -> i32; } impl A for i32 { fn f(&self) -> i32 { 1 } } impl B for i32 { fn f(&self) -> i32 { 2 } } fn main() { let x = 1; let _y = x.f(); }",
        );
        assertEq(result.ok, false);
    });

    assert("derive clone/copy/debug on struct compiles", () => {
        const result = inferSource(
            "#[derive(Clone, Copy, Debug)] struct S { x: i32 } fn main() { let s = S { x: 1 }; let _c = s.clone(); }",
        );
        assertEq(result.ok, true);
    });
});

console.log("Impl inference tests complete");

export function runInferenceImplsTests() {
    return 11;
}
