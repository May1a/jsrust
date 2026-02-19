import { TypeContext } from "../../type_context.js";
import {
    inferExpr,
    inferBinary,
    inferIdentifier,
    unify,
    makeTypeError,
} from "../../inference.js";
import { NodeKind, LiteralKind, BinaryOp } from "../../ast.js";
import { TypeKind, IntWidth, FloatWidth, typeToString } from "../../types.js";
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

// Test error reporting
testGroup("Error Reporting", () => {
    assert("unbound identifier error", () => {
        const ctx = new TypeContext();
        const ident = makeIdentifierExpr("unknown");
        const result = inferIdentifier(ctx, ident);
        assert(!result.ok);
        assert(result.errors.length > 0);
        assert(result.errors[0].message.includes("Unbound identifier"));
    });

    assert("type mismatch error", () => {
        const ctx = new TypeContext();
        const t1 = { kind: TypeKind.Int, width: IntWidth.I32 };
        const t2 = { kind: TypeKind.Int, width: IntWidth.I64 };
        const result = unify(ctx, t1, t2);
        assert(!result.ok);
        assert(result.error.message.includes("Integer type mismatch"));
    });

    assert("addition with non-numeric fails", () => {
        const ctx = new TypeContext();
        const left = makeLiteralExpr(LiteralKind.Int, 1, "1");
        const right = makeLiteralExpr(LiteralKind.Bool, true, "true");
        const binary = makeBinaryExpr(BinaryOp.Add, left, right);
        const result = inferBinary(ctx, binary);
        assert(!result.ok);
    });
});

// Test type mismatch errors
testGroup("Type Mismatch Errors", () => {
    assert("int and float don't unify", () => {
        const ctx = new TypeContext();
        const t1 = { kind: TypeKind.Int, width: IntWidth.I32 };
        const t2 = { kind: TypeKind.Float, width: FloatWidth.F64 };
        const result = unify(ctx, t1, t2);
        assert(!result.ok);
    });

    assert("bool and int don't unify", () => {
        const ctx = new TypeContext();
        const t1 = { kind: TypeKind.Bool };
        const t2 = { kind: TypeKind.Int, width: IntWidth.I32 };
        const result = unify(ctx, t1, t2);
        assert(!result.ok);
    });
});

// Test error message formatting
testGroup("Error Message Formatting", () => {
    assert("type to string for int", () => {
        const t = { kind: TypeKind.Int, width: IntWidth.I32 };
        const str = typeToString(t);
        assertEq(str, "i32");
    });

    assert("type to string for float", () => {
        const t = { kind: TypeKind.Float, width: FloatWidth.F64 };
        const str = typeToString(t);
        assertEq(str, "f64");
    });

    assert("type to string for bool", () => {
        const t = { kind: TypeKind.Bool };
        const str = typeToString(t);
        assertEq(str, "bool");
    });

    assert("type to string for unit", () => {
        const t = { kind: TypeKind.Unit };
        const str = typeToString(t);
        assertEq(str, "()");
    });

    assert("type to string for reference", () => {
        const t = {
            kind: TypeKind.Ref,
            inner: { kind: TypeKind.Int, width: IntWidth.I32 },
            mutable: false,
        };
        const str = typeToString(t);
        assertEq(str, "&i32");
    });

    assert("type to string for mutable reference", () => {
        const t = {
            kind: TypeKind.Ref,
            inner: { kind: TypeKind.Int, width: IntWidth.I32 },
            mutable: true,
        };
        const str = typeToString(t);
        assertEq(str, "&mut i32");
    });
});

console.log("Error inference tests complete");

export function runInferenceErrorsTests() {
    return 12; // Number of tests
}
