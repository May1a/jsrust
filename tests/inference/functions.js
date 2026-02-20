import { TypeContext } from "../../type_context.js";
import { inferModule, inferFnSignature } from "../../inference.js";
import { parseModule } from "../../parser.js";
import { NodeKind, LiteralKind, Mutability } from "../../ast.js";
import {
    TypeKind,
    IntWidth,
    makeIntType,
    makeFnType,
    makeUnitType,
} from "../../types.js";
import { assert, assertEq, testGroup } from "../lib.js";

function makeSpan(line = 1, column = 1, start = 0, end = 0) {
    return { line, column, start, end };
}

function makeLiteralExpr(kind, value, raw) {
    return {
        kind: NodeKind.LiteralExpr,
        span: makeSpan(),
        literalKind: kind,
        value,
        raw,
    };
}

function makeIdentifierExpr(name) {
    return {
        kind: NodeKind.IdentifierExpr,
        span: makeSpan(),
        name,
    };
}

function makeBinaryExpr(op, left, right) {
    return {
        kind: NodeKind.BinaryExpr,
        span: makeSpan(),
        op,
        left,
        right,
    };
}

function makeBlockExpr(stmts, expr) {
    return {
        kind: NodeKind.BlockExpr,
        span: makeSpan(),
        stmts,
        expr,
    };
}

function makeParam(name, ty) {
    return {
        kind: NodeKind.Param,
        span: makeSpan(),
        name,
        ty,
        pat: null,
    };
}

function makeFnItem(
    name,
    generics,
    params,
    returnType,
    body,
    isAsync = false,
    isUnsafe = false,
) {
    return {
        kind: NodeKind.FnItem,
        span: makeSpan(),
        name,
        generics,
        genericParams: generics
            ? generics.map((/** @type {string} */ g) => ({ name: g, bounds: [] }))
            : null,
        whereClause: null,
        params,
        returnType,
        body,
        isAsync,
        isUnsafe,
    };
}

function makeNamedType(name) {
    return {
        kind: NodeKind.NamedType,
        span: makeSpan(),
        name,
        args: null,
    };
}

function makeModule(name, items) {
    return {
        kind: NodeKind.Module,
        span: makeSpan(),
        name,
        items,
    };
}

/**
 * @param {string} source
 * @returns {import("../../inference.js").InferenceResult}
 */
function inferSource(source) {
    const parseResult = parseModule(source);
    assert(parseResult.ok, `parse failed: ${parseResult.errors?.map((e) => e.message).join(", ")}`);
    const ctx = new TypeContext();
    return inferModule(ctx, parseResult.value);
}

// Test function signature inference
testGroup("Function Signature Inference", () => {
    assert("function with explicit types", () => {
        const ctx = new TypeContext();
        const params = [
            makeParam("x", makeNamedType("i32")),
            makeParam("y", makeNamedType("i32")),
        ];
        const fn = makeFnItem("add", null, params, makeNamedType("i32"), null);
        const result = inferFnSignature(ctx, fn);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Fn);
        assertEq(result.type.params.length, 2);
        assertEq(result.type.returnType.kind, TypeKind.Int);
    });

    assert("function without return type defaults to unit", () => {
        const ctx = new TypeContext();
        const params = [];
        const fn = makeFnItem("foo", null, params, null, null);
        const result = inferFnSignature(ctx, fn);
        assert(result.ok);
        assertEq(result.type.kind, TypeKind.Fn);
        assertEq(result.type.returnType.kind, TypeKind.Unit);
    });
});

// Test function body checking
testGroup("Function Body Checking", () => {
    assert("simple return function", () => {
        const ctx = new TypeContext();
        const params = [];
        const body = makeBlockExpr(
            [],
            makeLiteralExpr(LiteralKind.Int, 42, "42"),
        );
        const fn = makeFnItem(
            "answer",
            null,
            params,
            makeNamedType("i32"),
            body,
        );
        const module = makeModule("test", [fn]);
        const result = inferModule(ctx, module);
        assert(result.ok);
    });

    assert("function with parameters", () => {
        const ctx = new TypeContext();
        const params = [
            makeParam("x", makeNamedType("i32")),
            makeParam("y", makeNamedType("i32")),
        ];
        const body = makeBlockExpr([], {
            kind: NodeKind.BinaryExpr,
            span: makeSpan(),
            op: 0, // Add
            left: makeIdentifierExpr("x"),
            right: makeIdentifierExpr("y"),
        });
        const fn = makeFnItem("add", null, params, makeNamedType("i32"), body);
        const module = makeModule("test", [fn]);
        const result = inferModule(ctx, module);
        assert(result.ok);
    });
});

// Test module inference
testGroup("Module Inference", () => {
    assert("empty module", () => {
        const ctx = new TypeContext();
        const module = makeModule("test", []);
        const result = inferModule(ctx, module);
        assert(result.ok);
    });

    assert("module with simple function", () => {
        const ctx = new TypeContext();
        const body = makeBlockExpr(
            [],
            makeLiteralExpr(LiteralKind.Int, 42, "42"),
        );
        const fn = makeFnItem("answer", null, [], makeNamedType("i32"), body);
        const module = makeModule("test", [fn]);
        const result = inferModule(ctx, module);
        assert(result.ok);
    });

    assert("generic identity function compiles", () => {
        const result = inferSource("fn id<T>(x: T) -> T { x } fn main() { let _x = id(1); }");
        assert(result.ok, `inference failed: ${result.errors?.map((e) => e.message).join(", ")}`);
    });

    assert("generic turbofish call compiles", () => {
        const result = inferSource("fn id<T>(x: T) -> T { x } fn main() { let _x = id::<i32>(1); }");
        assert(result.ok, `inference failed: ${result.errors?.map((e) => e.message).join(", ")}`);
    });

    assert("generic turbofish mismatch errors", () => {
        const result = inferSource("fn id<T>(x: T) -> T { x } fn main() { let _x = id::<i32>(true); }");
        assertEq(result.ok, false);
    });

    assert("single-instance generic lock errors on conflicting calls", () => {
        const result = inferSource("fn id<T>(x: T) -> T { x } fn main() { let _x = id(1); let _y = id(true); }");
        assertEq(result.ok, false);
    });

    assert("generic trait bounds are semantic hard-errors", () => {
        const result = inferSource("fn f<T: Copy>(x: T) -> T { x }");
        assertEq(result.ok, false);
    });

    assert("where clauses are semantic hard-errors", () => {
        const result = inferSource("fn f<T>(x: T) -> T where T: Copy { x }");
        assertEq(result.ok, false);
    });

    assert("non-capturing closure unifies with fn parameter type", () => {
        const result = inferSource(
            "fn takes(f: fn(i32) -> i32) { let _y: i32 = f(1); } fn main() { let add_one = |z| z + 1; takes(add_one); }",
        );
        assert(result.ok, `inference failed: ${result.errors?.map((e) => e.message).join(", ")}`);
    });

    assert("mutable captures are supported for direct closure calls", () => {
        const result = inferSource(
            "fn main() { let mut x: i32 = 1; let bump = |v: i32| { x += v; x }; let _y: i32 = bump(2); }",
        );
        assert(result.ok, `inference failed: ${result.errors?.map((e) => e.message).join(", ")}`);
    });

    assert("capturing closures cannot escape via fn parameter passing", () => {
        const result = inferSource(
            "fn takes(f: fn(i32) -> i32) { let _y: i32 = f(1); } fn main() { let x: i32 = 1; let add = |v: i32| v + x; takes(add); }",
        );
        assertEq(result.ok, false);
    });
});

console.log("Function inference tests complete");

export function runInferenceFunctionsTests() {
    return 10; // Number of tests
}
