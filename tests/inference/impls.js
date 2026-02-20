import { parseModule } from "../../parser.js";
import { resolveModuleTree } from "../../module_resolver.js";
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
        return { ok: false, stage: "resolve", errors: resolveResult.errors || [] };
    }
    const ctx = new TypeContext();
    const inferResult = inferModule(ctx, resolveResult.module);
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
});

console.log("Impl inference tests complete");

export function runInferenceImplsTests() {
    return 4;
}
