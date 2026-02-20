import { parseType } from "../../parser.js";
import * as ast from "../../ast.js";
import * as lib from "../lib.js";

const { test, assertEqual, assertTrue } = lib;
const { NodeKind } = ast;

export function runParserTypeTests() {
    test("named type", () => {
        const result = parseType("i32");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.NamedType);
    });

    test("tuple type", () => {
        const result = parseType("(i32, f32)");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.TupleType);
        assertEqual(result.value.elements.length, 2);
    });

    test("array type", () => {
        const result = parseType("[u8; 16]");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.ArrayType);
        assertEqual(result.value.length.kind, NodeKind.LiteralExpr);
    });

    test("reference type", () => {
        const result = parseType("&mut i32");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.RefType);
    });

    test("reference type with named lifetime", () => {
        const result = parseType("&'a i32");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.RefType);
        assertEqual(result.value.ignoredLifetimeName, "'a");
    });

    test("reference type with elided lifetime", () => {
        const result = parseType("&'_ i32");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.RefType);
        assertEqual(result.value.ignoredLifetimeName, "'_");
    });

    test("function type", () => {
        const result = parseType("fn(i32) -> i32");
        assertTrue(result.ok);
        assertEqual(result.value.kind, NodeKind.FnType);
    });

    return 7;
}
