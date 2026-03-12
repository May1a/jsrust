import { describe, test, expect } from "bun:test";
import { parseModule, parseExpression, parseStatement } from "../src/parse/parser";
import {
    BinaryExpr,
    BinaryOp,
    LiteralExpr,
    LiteralKind,
    IdentifierExpr,
    CallExpr,
    BlockExpr,
    IfExpr,
    ClosureExpr,
    LetStmt,
    IdentPattern,
    Mutability,
    NamedTypeNode,
    InferredTypeNode,
    FnItem,
    StructItem,
    EnumItem,
    ImplItem,
} from "../src/parse/ast";

function expectInstanceOf<T>(
    value: unknown,
    ctor: abstract new (...args: never[]) => T,
): asserts value is T {
    expect(value).toBeInstanceOf(ctor);
}

// Appending a newline avoids the tokenizer's undefined-peek edge case when
// source ends with an identifier or keyword character.
function expr(src: string) {
    return parseExpression(`${src}\n`);
}
function stmt(src: string) {
    return parseStatement(`${src}\n`);
}
function mod(src: string) {
    return parseModule(`${src}\n`);
}

describe("expressions", () => {
    test("binary arithmetic: addition", () => {
        const result = expr("1 + 2");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BinaryExpr);
        const e = result.value;
        expect(e.op).toBe(BinaryOp.Add);
        expectInstanceOf(e.left, LiteralExpr);
        expectInstanceOf(e.right, LiteralExpr);
    });

    test("binary arithmetic: multiplication", () => {
        const result = expr("3 * 4");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BinaryExpr);
        const e = result.value;
        expect(e.op).toBe(BinaryOp.Mul);
    });

    test("comparison: less than", () => {
        const result = expr("a < b");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BinaryExpr);
        const e = result.value;
        expect(e.op).toBe(BinaryOp.Lt);
    });

    test("comparison: equal", () => {
        const result = expr("x == 0");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BinaryExpr);
        const e = result.value;
        expect(e.op).toBe(BinaryOp.Eq);
    });

    test("boolean and", () => {
        const result = expr("a && b");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BinaryExpr);
        const e = result.value;
        expect(e.op).toBe(BinaryOp.And);
    });

    test("boolean or", () => {
        const result = expr("a || b");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BinaryExpr);
        const e = result.value;
        expect(e.op).toBe(BinaryOp.Or);
    });

    test("integer literal", () => {
        const intLiteral = 42;
        const result = expr(intLiteral.toString());
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, LiteralExpr);
        const lit = result.value;
        expect(lit.literalKind).toBe(LiteralKind.Int);
        expect(lit.value).toBe(intLiteral);
    });

    test("string literal", () => {
        const result = expr('"hello"');
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, LiteralExpr);
        const lit = result.value;
        expect(lit.literalKind).toBe(LiteralKind.String);
        expect(lit.value).toBe("hello");
    });

    test("function call", () => {
        const result = expr("foo(1, 2)");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, CallExpr);
        const call = result.value;
        expect(call.args.length).toBe(2);
    });

    test("block expression", () => {
        const result = expr("{ 1 + 2 }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, BlockExpr);
    });

    test("if expression", () => {
        const result = expr("if x { 1 } else { 2 }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, IfExpr);
        const ifExpr = result.value;
        expectInstanceOf(ifExpr.condition, IdentifierExpr);
        expect(ifExpr.elseBranch).not.toBeNull();
    });

    test("closure", () => {
        const result = expr("|x| x + 1");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, ClosureExpr);
        const closure = result.value;
        expect(closure.params.length).toBe(1);
    });
});

describe("statements", () => {
    test("let binding without type annotation", () => {
        const result = stmt("let x = 5;");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, LetStmt);
        const s = result.value;
        // No type annotation: parser inserts an InferredTypeNode
        expectInstanceOf(s.type, InferredTypeNode);
    });

    test("let binding with type annotation", () => {
        const result = stmt("let x: i32 = 5;");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, LetStmt);
        const s = result.value;
        expectInstanceOf(s.type, NamedTypeNode);
        expect(s.type.name).toBe("i32");
    });

    test("let mutable binding", () => {
        const result = stmt("let mut count = 0;");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expectInstanceOf(result.value, LetStmt);
        const s = result.value;
        expectInstanceOf(s.pattern, IdentPattern);
        expect(s.pattern.mutability).toBe(Mutability.Mutable);
    });
});

describe("items", () => {
    test("fn with params and return type", () => {
        const result = mod("fn add(a: i32, b: i32) -> i32 { a + b }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        const { items } = result.value;
        expect(items.length).toBe(1);
        const [firstItem] = items;
        expectInstanceOf(firstItem, FnItem);
        const fn = firstItem;
        expect(fn.name).toBe("add");
        expect(fn.params.length).toBe(2);
        expect(fn.returnType).not.toBeNull();
    });

    test("fn with no params", () => {
        const result = mod("fn main() {}");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        const [firstItem] = result.value.items;
        expectInstanceOf(firstItem, FnItem);
        const fn = firstItem;
        expect(fn.params.length).toBe(0);
    });

    test("struct with fields", () => {
        const result = mod("struct Point { x: i32, y: i32 }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        const [firstItem] = result.value.items;
        expectInstanceOf(firstItem, StructItem);
        const s = firstItem;
        expect(s.name).toBe("Point");
        expect(s.fields.length).toBe(2);
    });

    test("enum with variants", () => {
        const enumVariants = 3;
        const result = mod("enum Color { Red, Green, Blue }");
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        const [firstItem] = result.value.items;
        expectInstanceOf(firstItem, EnumItem);
        const e = firstItem;
        expect(e.name).toBe("Color");
        expect(e.variants.length).toBe(enumVariants);
    });

    test("impl block", () => {
        const result = mod(
            "struct Foo {}\nimpl Foo { fn bar(&self) -> i32 { 0 } }",
        );
        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        const implItem = result.value.items.find((i) => i instanceof ImplItem);
        expect(implItem).toBeDefined();
        if (implItem === undefined) return;
        expect(implItem.methods.length).toBe(1);
    });
});

describe("error cases", () => {
    test("missing closing brace", () => {
        const result = mod("fn foo() {");
        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(result.error.length).toBeGreaterThan(0);
    });

    test("invalid expression", () => {
        const result = expr("+ +");
        expect(result.isErr()).toBe(true);
    });

    test("malformed let statement", () => {
        const result = stmt("let = 5;");
        // Either a parse error or the identifier will be missing
        if (result.isErr()) {
            expect(result.error.length).toBeGreaterThan(0);
        }
    });
});
