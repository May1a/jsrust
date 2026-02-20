import { parseModule } from "../../parser.js";
import * as ast from "../../ast.js";
import * as lib from "../lib.js";

const { test, assertEqual, assertTrue } = lib;
const { NodeKind } = ast;

export function runParserItemTests() {
    test("function item", () => {
        const result = parseModule("fn main() { return; }");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.FnItem);
        assertEqual(item.name, "main");
    });

    test("struct item", () => {
        const result = parseModule("struct Point { x: i32, y: i32 }");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.StructItem);
        assertEqual(item.fields.length, 2);
    });

    test("enum item", () => {
        const result = parseModule("enum E { A, B(i32) }");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.EnumItem);
        assertEqual(item.variants.length, 2);
    });

    test("trait item and trait impl item", () => {
        const result = parseModule(
            "trait Add { fn add(&self, other: &Self) -> Self; } impl Add for i32 { fn add(&self, other: &Self) -> Self { self + other } }",
        );
        assertTrue(result.ok);
        const traitItem = result.value.items[0];
        const implItem = result.value.items[1];
        assertEqual(traitItem.kind, NodeKind.TraitItem);
        assertEqual(traitItem.methods.length, 1);
        assertEqual(implItem.kind, NodeKind.ImplItem);
        assertTrue(implItem.traitType !== null);
    });

    test("derive attribute on struct", () => {
        const result = parseModule("#[derive(Clone, Copy, Debug)] struct S { x: i32 }");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.StructItem);
        assertEqual(item.derives.length, 3);
        assertEqual(item.derives[0], "Clone");
    });

    test("mod item", () => {
        const result = parseModule("mod inner { fn f() {} }");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.ModItem);
        assertEqual(item.items.length, 1);
        assertEqual(item.isPub, false);
    });

    test("use item", () => {
        const result = parseModule("use std::io;");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.UseItem);
        assertEqual(item.tree.path.length, 2);
    });

    test("use item with alias", () => {
        const result = parseModule("use math::sub as sub_math;");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.UseItem);
        assertEqual(item.tree.path.length, 2);
        assertEqual(item.tree.alias, "sub_math");
    });

    test("pub item visibility flags", () => {
        const result = parseModule("pub fn f() {} pub struct S {} pub enum E { A } pub mod m {}");
        assertTrue(result.ok);
        assertEqual(result.value.items[0].isPub, true);
        assertEqual(result.value.items[1].isPub, true);
        assertEqual(result.value.items[2].isPub, true);
        assertEqual(result.value.items[3].isPub, true);
    });

    test("impl item with receiver methods", () => {
        const result = parseModule(
            "struct Point { pub x: i32 } impl Point { pub fn new(x: i32) -> Self { Self { x } } fn get(&self) -> i32 { self.x } }",
        );
        assertTrue(result.ok);
        const implItem = result.value.items[1];
        assertEqual(implItem.kind, NodeKind.ImplItem);
        assertEqual(implItem.methods.length, 2);
        assertEqual(implItem.methods[0].isPub, true);
        assertEqual(implItem.methods[1].params[0].isReceiver, true);
        assertEqual(implItem.methods[1].params[0].receiverKind, "ref");
        assertEqual(result.value.items[0].fields[0].isPub, true);
    });

    test("generic function item", () => {
        const result = parseModule("fn id<T>(x: T) -> T { x }");
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.kind, NodeKind.FnItem);
        assertEqual(item.generics.length, 1);
        assertEqual(item.generics[0], "T");
        assertEqual(item.genericParams.length, 1);
        assertEqual(item.genericParams[0].name, "T");
    });

    test("generic function bounds + where clause", () => {
        const result = parseModule(
            "fn id<T: Clone>(x: T) -> T where T: Clone + Copy { x }",
        );
        assertTrue(result.ok);
        const item = result.value.items[0];
        assertEqual(item.genericParams.length, 1);
        assertEqual(item.genericParams[0].bounds.length, 1);
        assertEqual(item.whereClause.length, 1);
        assertEqual(item.whereClause[0].bounds.length, 2);
    });

    test("generic turbofish call expression", () => {
        const result = parseModule("fn main() { id::<i32>(1); }");
        assertTrue(result.ok);
        const fn = result.value.items[0];
        const exprStmt = fn.body.stmts[0];
        const call = exprStmt.expr;
        assertEqual(call.kind, NodeKind.CallExpr);
        assertEqual(call.typeArgs.length, 1);
    });

    return 13;
}
