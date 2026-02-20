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

    return 7;
}
