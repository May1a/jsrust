import { TypeContext } from "../../type_context.js";
import { inferModule, inferFnSignature, checkFnItem } from "../../inference.js";
import { NodeKind, LiteralKind, Mutability } from "../../ast.js";
import { TypeKind, IntWidth, makeIntType, makeFnType, makeUnitType } from "../../types.js";
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

function makeFnItem(name, generics, params, returnType, body, isAsync = false, isUnsafe = false) {
    return {
        kind: NodeKind.FnItem,
        span: makeSpan(),
        name,
        generics,
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
        const body = makeBlockExpr([], makeLiteralExpr(LiteralKind.Int, 42, "42"));
        const fn = makeFnItem("answer", null, params, makeNamedType("i32"), body);
        
        // Register function first
        const sigResult = inferFnSignature(ctx, fn);
        assert(sigResult.ok);
        ctx.registerFn("answer", fn, sigResult.type);
        
        const result = checkFnItem(ctx, fn);
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
        
        const sigResult = inferFnSignature(ctx, fn);
        assert(sigResult.ok);
        ctx.registerFn("add", fn, sigResult.type);
        
        const result = checkFnItem(ctx, fn);
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
        const body = makeBlockExpr([], makeLiteralExpr(LiteralKind.Int, 42, "42"));
        const fn = makeFnItem("answer", null, [], makeNamedType("i32"), body);
        const module = makeModule("test", [fn]);
        const result = inferModule(ctx, module);
        assert(result.ok);
    });
});

console.log("Function inference tests complete");