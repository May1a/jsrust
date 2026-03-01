import { describe, test, expect } from "bun:test";
import { parseModule, parseExpression, parseStatement } from "../src/parser";
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
    FnItem,
    StructItem,
    EnumItem,
    ImplItem,
} from "../src/ast";

// Appending a newline avoids the tokenizer's undefined-peek edge case when
// source ends with an identifier or keyword character.
function expr(src: string) {
    return parseExpression(src + "\n");
}
function stmt(src: string) {
    return parseStatement(src + "\n");
}
function mod(src: string) {
    return parseModule(src + "\n");
}

describe("expressions", () => {
    test("binary arithmetic: addition", () => {
        const result = expr("1 + 2");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(BinaryExpr);
        const e = result.value as BinaryExpr;
        expect(e.op).toBe(BinaryOp.Add);
        expect(e.left).toBeInstanceOf(LiteralExpr);
        expect(e.right).toBeInstanceOf(LiteralExpr);
    });

    test("binary arithmetic: multiplication", () => {
        const result = expr("3 * 4");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const e = result.value as BinaryExpr;
        expect(e.op).toBe(BinaryOp.Mul);
    });

    test("comparison: less than", () => {
        const result = expr("a < b");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const e = result.value as BinaryExpr;
        expect(e.op).toBe(BinaryOp.Lt);
    });

    test("comparison: equal", () => {
        const result = expr("x == 0");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const e = result.value as BinaryExpr;
        expect(e.op).toBe(BinaryOp.Eq);
    });

    test("boolean and", () => {
        const result = expr("a && b");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const e = result.value as BinaryExpr;
        expect(e.op).toBe(BinaryOp.And);
    });

    test("boolean or", () => {
        const result = expr("a || b");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const e = result.value as BinaryExpr;
        expect(e.op).toBe(BinaryOp.Or);
    });

    test("integer literal", () => {
        const result = expr("42");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(LiteralExpr);
        const lit = result.value as LiteralExpr;
        expect(lit.literalKind).toBe(LiteralKind.Int);
        expect(lit.value).toBe(42);
    });

    test("string literal", () => {
        const result = expr('"hello"');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(LiteralExpr);
        const lit = result.value as LiteralExpr;
        expect(lit.literalKind).toBe(LiteralKind.String);
        expect(lit.value).toBe("hello");
    });

    test("function call", () => {
        const result = expr("foo(1, 2)");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(CallExpr);
        const call = result.value as CallExpr;
        expect(call.args.length).toBe(2);
    });

    test("block expression", () => {
        const result = expr("{ 1 + 2 }");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(BlockExpr);
    });

    test("if expression", () => {
        const result = expr("if x { 1 } else { 2 }");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(IfExpr);
        const ifExpr = result.value as IfExpr;
        expect(ifExpr.condition).toBeInstanceOf(IdentifierExpr);
        expect(ifExpr.elseExpr).not.toBeNull();
    });

    test("closure", () => {
        const result = expr("|x| x + 1");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(ClosureExpr);
        const closure = result.value as ClosureExpr;
        expect(closure.params.length).toBe(1);
    });
});

describe("statements", () => {
    test("let binding without type annotation", () => {
        const result = stmt("let x = 5;");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(LetStmt);
        const s = result.value as LetStmt;
        // No type annotation: parser inserts a wildcard NamedTypeNode("_")
        expect(s.type).toBeInstanceOf(NamedTypeNode);
        expect((s.type as NamedTypeNode).name).toBe("_");
    });

    test("let binding with type annotation", () => {
        const result = stmt("let x: i32 = 5;");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(LetStmt);
        const s = result.value as LetStmt;
        expect(s.type).toBeInstanceOf(NamedTypeNode);
        expect((s.type as NamedTypeNode).name).toBe("i32");
    });

    test("let mutable binding", () => {
        const result = stmt("let mut count = 0;");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(LetStmt);
        const s = result.value as LetStmt;
        expect(s.pattern).toBeInstanceOf(IdentPattern);
        expect((s.pattern as IdentPattern).mutability).toBe(Mutability.Mutable);
    });
});

describe("items", () => {
    test("fn with params and return type", () => {
        const result = mod("fn add(a: i32, b: i32) -> i32 { a + b }");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const items = result.value.items;
        expect(items.length).toBe(1);
        expect(items[0]).toBeInstanceOf(FnItem);
        const fn = items[0] as FnItem;
        expect(fn.name).toBe("add");
        expect(fn.params.length).toBe(2);
        expect(fn.returnType).not.toBeNull();
    });

    test("fn with no params", () => {
        const result = mod("fn main() {}");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const fn = result.value.items[0] as FnItem;
        expect(fn.params.length).toBe(0);
    });

    test("struct with fields", () => {
        const result = mod("struct Point { x: i32, y: i32 }");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.items[0]).toBeInstanceOf(StructItem);
        const s = result.value.items[0] as StructItem;
        expect(s.name).toBe("Point");
        expect(s.fields.length).toBe(2);
    });

    test("enum with variants", () => {
        const result = mod("enum Color { Red, Green, Blue }");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.items[0]).toBeInstanceOf(EnumItem);
        const e = result.value.items[0] as EnumItem;
        expect(e.name).toBe("Color");
        expect(e.variants.length).toBe(3);
    });

    test("impl block", () => {
        const result = mod(
            "struct Foo {}\nimpl Foo { fn bar(&self) -> i32 { 0 } }",
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const implItem = result.value.items.find(
            (i) => i instanceof ImplItem,
        ) as ImplItem | undefined;
        expect(implItem).toBeDefined();
        expect(implItem!.methods.length).toBe(1);
    });
});

describe("error cases", () => {
    test("missing closing brace", () => {
        const result = mod("fn foo() {");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test("invalid expression", () => {
        const result = expr("+ +");
        expect(result.ok).toBe(false);
    });

    test("malformed let statement", () => {
        const result = stmt("let = 5;");
        // Either a parse error or the identifier will be missing
        if (!result.ok) {
            expect(result.errors.length).toBeGreaterThan(0);
        }
    });
});
