/**
 * End-to-end tests for the JSRust compiler
 * Tests the full compilation pipeline from Rust source to SSA IR
 */

import * as lib from "./lib.js";
import { compile } from "../main.js";

const { test, assertEqual, assertTrue, printSummary, clearErrors } = lib;

// Helper to check compilation succeeds
function assertCompiles(source, description) {
    const result = compile(source, { validate: false });
    assertEqual(
        result.ok,
        true,
        `${description}: compilation should succeed. Errors: ${result.errors.join(", ")}`,
    );
    return result;
}

// Helper to check compilation fails
function assertFails(source, description) {
    const result = compile(source, { validate: false });
    assertEqual(
        result.ok,
        false,
        `${description}: compilation should fail`,
    );
    return result;
}

// Helper to check IR contains expected string
function assertIRContains(result, expected, description) {
    assertTrue(result.ir, `${description}: should have IR output`);
    assertTrue(
        result.ir.includes(expected),
        `${description}: IR should contain "${expected}"\nActual IR:\n${result.ir}`,
    );
}

let testsRun = 0;

export function runE2ETests() {
    clearErrors();

    // Empty and minimal programs
    test("E2E: empty source", () => {
        const result = assertCompiles("", "empty source");
        assertTrue(result.ir, "should produce IR");
        testsRun++;
    });

    test("E2E: empty main function", () => {
        const result = assertCompiles(`fn main() {}`, "empty main function");
        assertIRContains(result, "fn main()", "empty main");
        testsRun++;
    });

    test("E2E: function with unit return", () => {
        const result = assertCompiles(`fn foo() -> () {}`, "unit return function");
        assertIRContains(result, "fn foo()", "unit return");
        testsRun++;
    });

    // Literals and constants
    test("E2E: integer literal", () => {
        const result = assertCompiles(`fn main() { let x = 42; }`, "integer literal");
        assertIRContains(result, "iconst", "integer constant");
        testsRun++;
    });

    test("E2E: float literal", () => {
        const result = assertCompiles(`fn main() { let x = 3.14; }`, "float literal");
        assertIRContains(result, "fconst", "float constant");
        testsRun++;
    });

    test("E2E: boolean literals", () => {
        const result = assertCompiles(`fn main() { let a = true; let b = false; }`, "boolean literals");
        assertIRContains(result, "bconst", "boolean constant");
        testsRun++;
    });

    test("E2E: string literal", () => {
        const result = assertCompiles(`fn main() { let s = "hello"; }`, "string literal");
        assertTrue(result.ir, "should compile string");
        testsRun++;
    });

    // Arithmetic operations
    test("E2E: addition", () => {
        const result = assertCompiles(`fn main() { let x = 1 + 2; }`, "addition");
        assertIRContains(result, "iadd", "addition instruction");
        testsRun++;
    });

    test("E2E: subtraction", () => {
        const result = assertCompiles(`fn main() { let x = 5 - 3; }`, "subtraction");
        assertIRContains(result, "isub", "subtraction instruction");
        testsRun++;
    });

    test("E2E: multiplication", () => {
        const result = assertCompiles(`fn main() { let x = 4 * 3; }`, "multiplication");
        assertIRContains(result, "imul", "multiplication instruction");
        testsRun++;
    });

    test("E2E: division", () => {
        const result = assertCompiles(`fn main() { let x = 10 / 2; }`, "division");
        assertIRContains(result, "idiv", "division instruction");
        testsRun++;
    });

    test("E2E: modulo", () => {
        const result = assertCompiles(`fn main() { let x = 10 % 3; }`, "modulo");
        assertIRContains(result, "imod", "modulo instruction");
        testsRun++;
    });

    test("E2E: float arithmetic", () => {
        const result = assertCompiles(`fn main() { let x = 1.5 + 2.5; }`, "float addition");
        assertIRContains(result, "fadd", "float addition instruction");
        testsRun++;
    });

    // Comparison operations
    test("E2E: equality", () => {
        const result = assertCompiles(`fn main() { let b = 5 == 5; }`, "equality");
        assertIRContains(result, "icmp", "integer comparison");
        testsRun++;
    });

    test("E2E: inequality", () => {
        const result = assertCompiles(`fn main() { let b = 5 != 3; }`, "inequality");
        assertIRContains(result, "icmp", "integer comparison");
        testsRun++;
    });

    test("E2E: less than", () => {
        const result = assertCompiles(`fn main() { let b = 3 < 5; }`, "less than");
        assertIRContains(result, "icmp", "integer comparison");
        testsRun++;
    });

    test("E2E: greater than", () => {
        const result = assertCompiles(`fn main() { let b = 5 > 3; }`, "greater than");
        assertIRContains(result, "icmp", "integer comparison");
        testsRun++;
    });

    // Logical operations
    test("E2E: logical and", () => {
        const result = assertCompiles(`fn main() { let b = true && false; }`, "logical and");
        assertIRContains(result, "iand", "and instruction");
        testsRun++;
    });

    test("E2E: logical or", () => {
        const result = assertCompiles(`fn main() { let b = true || false; }`, "logical or");
        assertIRContains(result, "ior", "or instruction");
        testsRun++;
    });

    test("E2E: logical not", () => {
        const result = assertCompiles(`fn main() { let b = !true; }`, "logical not");
        assertIRContains(result, "ixor", "xor for not");
        testsRun++;
    });

    // Bitwise operations
    test("E2E: bitwise and", () => {
        const result = assertCompiles(`fn main() { let x = 0xFF & 0x0F; }`, "bitwise and");
        assertIRContains(result, "iand", "bitwise and");
        testsRun++;
    });

    test("E2E: bitwise or", () => {
        const result = assertCompiles(`fn main() { let x = 0xF0 | 0x0F; }`, "bitwise or");
        assertIRContains(result, "ior", "bitwise or");
        testsRun++;
    });

    test("E2E: bitwise xor", () => {
        const result = assertCompiles(`fn main() { let x = 0xFF ^ 0xAA; }`, "bitwise xor");
        assertIRContains(result, "ixor", "bitwise xor");
        testsRun++;
    });

    // Variables and assignments
    test("E2E: variable declaration", () => {
        const result = assertCompiles(`fn main() { let x = 10; }`, "variable declaration");
        assertTrue(result.ir, "should compile");
        testsRun++;
    });

    test("E2E: mutable variable", () => {
        const result = assertCompiles(`fn main() { let mut x = 10; x = 20; }`, "mutable variable");
        assertTrue(result.ir, "should compile");
        testsRun++;
    });

    test("E2E: type annotation", () => {
        const result = assertCompiles(`fn main() { let x: i32 = 10; }`, "type annotation");
        assertTrue(result.ir, "should compile");
        testsRun++;
    });

    test("E2E: multiple variables", () => {
        const result = assertCompiles(`fn main() { let a = 1; let b = 2; let c = a + b; }`, "multiple variables");
        assertIRContains(result, "iadd", "addition");
        testsRun++;
    });

    // Functions
    test("E2E: function with parameters", () => {
        const result = assertCompiles(`fn add(a: i32, b: i32) -> i32 { a + b }`, "function with parameters");
        assertIRContains(result, "fn add", "function definition");
        testsRun++;
    });

    test("E2E: function with return", () => {
        const result = assertCompiles(`fn forty_two() -> i32 { return 42; }`, "function with return");
        assertIRContains(result, "ret", "return instruction");
        testsRun++;
    });

    test("E2E: function call", () => {
        const result = assertCompiles(
            `fn double(x: i32) -> i32 { x * 2 } fn main() { let y = double(5); }`,
            "function call"
        );
        assertIRContains(result, "call", "call instruction");
        testsRun++;
    });

    test("E2E: function call with &str parameter", () => {
        const result = assertCompiles(
            `fn print_msg(msg: &str) {} fn main() { let hello = "hello"; print_msg(hello); }`,
            "function call with &str parameter"
        );
        assertIRContains(result, "call", "call instruction");
        testsRun++;
    });

    test("E2E: multiple functions", () => {
        const result = assertCompiles(
            `fn a() -> i32 { 1 } fn b() -> i32 { 2 } fn main() { let x = a() + b(); }`,
            "multiple functions"
        );
        assertIRContains(result, "fn a", "function a");
        assertIRContains(result, "fn b", "function b");
        assertIRContains(result, "fn main", "main function");
        testsRun++;
    });

    // Control flow
    test("E2E: if expression", () => {
        const result = assertCompiles(`fn main() { let x = if true { 1 } else { 2 }; }`, "if expression");
        assertIRContains(result, "br_if", "conditional branch");
        testsRun++;
    });

    test("E2E: if without else", () => {
        const result = assertCompiles(`fn main() { if true { let x = 1; } }`, "if without else");
        assertIRContains(result, "br_if", "conditional branch");
        testsRun++;
    });

    test("E2E: nested if", () => {
        const result = assertCompiles(
            `fn main() { let x = if true { if false { 1 } else { 2 } } else { 3 }; }`,
            "nested if"
        );
        assertTrue(result.ir, "should compile nested if");
        testsRun++;
    });

    test("E2E: loop", () => {
        const result = assertCompiles(`fn main() { loop { break; } }`, "loop");
        assertTrue(result.ir, "should compile loop");
        testsRun++;
    });

    test("E2E: while loop", () => {
        const result = assertCompiles(`fn main() { let mut i = 0; while i < 10 { i = i + 1; } }`, "while loop");
        assertIRContains(result, "br_if", "conditional branch for while");
        testsRun++;
    });

    test("E2E: break", () => {
        const result = assertCompiles(`fn main() { loop { break; } }`, "break");
        assertTrue(result.ir, "should compile break");
        testsRun++;
    });

    test("E2E: continue", () => {
        const result = assertCompiles(`fn main() { loop { continue; } }`, "continue");
        assertTrue(result.ir, "should compile continue");
        testsRun++;
    });

    // Structs
    test("E2E: empty struct", () => {
        const result = assertCompiles(`struct Empty {} fn main() { let e = Empty {}; }`, "empty struct");
        assertTrue(result.ir, "should compile empty struct");
        testsRun++;
    });

    test("E2E: struct with fields", () => {
        const result = assertCompiles(
            `struct Point { x: i32, y: i32 } fn main() { let p = Point { x: 1, y: 2 }; }`,
            "struct with fields"
        );
        assertTrue(result.ir, "should compile struct with fields");
        testsRun++;
    });

    test("E2E: struct field access", () => {
        const result = assertCompiles(
            `struct Point { x: i32, y: i32 } fn main() { let p = Point { x: 1, y: 2 }; let x = p.x; }`,
            "struct field access"
        );
        assertTrue(result.ir, "should compile field access");
        testsRun++;
    });

    // Enums
    test("E2E: simple enum", () => {
        const result = assertCompiles(
            `enum Color { Red, Green, Blue } fn main() { let c = Color::Red; }`,
            "simple enum"
        );
        assertTrue(result.ir, "should compile enum");
        testsRun++;
    });

    test("E2E: enum with data", () => {
        const result = assertCompiles(
            `enum Option { Some(i32), None } fn main() { let o = Option::Some(42); }`,
            "enum with data"
        );
        assertTrue(result.ir, "should compile enum with data");
        testsRun++;
    });

    // Match expressions
    test("E2E: match on enum", () => {
        const result = assertCompiles(
            `enum Color { Red, Green, Blue } fn main() { let c = Color::Red; match c { Color::Red => 1, Color::Green => 2, Color::Blue => 3 }; }`,
            "match on enum"
        );
        assertTrue(result.ir, "should compile match");
        testsRun++;
    });

    test("E2E: match with wildcard", () => {
        const result = assertCompiles(`fn main() { let x = 5; match x { 0 => 1, _ => 2 }; }`, "match with wildcard");
        assertTrue(result.ir, "should compile match with wildcard");
        testsRun++;
    });

    // References
    test("E2E: immutable reference", () => {
        const result = assertCompiles(`fn main() { let x = 10; let r = &x; }`, "immutable reference");
        assertTrue(result.ir, "should compile reference");
        testsRun++;
    });

    test("E2E: mutable reference", () => {
        const result = assertCompiles(`fn main() { let mut x = 10; let r = &mut x; }`, "mutable reference");
        assertTrue(result.ir, "should compile mutable reference");
        testsRun++;
    });

    test("E2E: dereference", () => {
        const result = assertCompiles(`fn main() { let x = 10; let r = &x; let y = *r; }`, "dereference");
        assertTrue(result.ir, "should compile dereference");
        testsRun++;
    });

    test("E2E: mutable reference write then read", () => {
        const result = assertCompiles(
            `fn main() { let mut x = 1; let r = &mut x; *r = 2; let y = *r; }`,
            "mutable reference write then read",
        );
        assertIRContains(result, "store i32", "mutable ref store");
        assertIRContains(result, "load i32", "mutable ref load");
        testsRun++;
    });

    // Type annotations
    test("E2E: integer types", () => {
        const types = ["i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128", "usize"];
        for (const ty of types) {
            const result = assertCompiles(`fn main() { let x: ${ty} = 10; }`, `integer type ${ty}`);
            assertTrue(result.ir, `should compile ${ty}`);
        }
        testsRun++;
    });

    test("E2E: float types", () => {
        const result = assertCompiles(`fn main() { let x: f32 = 1.0; let y: f64 = 2.0; }`, "float types");
        assertTrue(result.ir, "should compile float types");
        testsRun++;
    });

    test("E2E: tuple type", () => {
        const result = assertCompiles(`fn main() { let t: (i32, i32) = (1, 2); }`, "tuple type");
        assertTrue(result.ir, "should compile tuple type");
        testsRun++;
    });

    // Complex expressions
    test("E2E: chained arithmetic", () => {
        const result = assertCompiles(`fn main() { let x = 1 + 2 * 3 - 4 / 2; }`, "chained arithmetic");
        assertTrue(result.ir, "should compile chained arithmetic");
        testsRun++;
    });

    test("E2E: nested function calls", () => {
        const result = assertCompiles(
            `fn f(x: i32) -> i32 { x * 2 } fn g(x: i32) -> i32 { f(x) + 1 } fn main() { let x = g(f(5)); }`,
            "nested function calls"
        );
        assertIRContains(result, "call", "call instruction");
        testsRun++;
    });

    test("E2E: complex condition", () => {
        const result = assertCompiles(
            `fn main() { let x = if (1 < 2) && (3 > 2) { 1 } else { 0 }; }`,
            "complex condition"
        );
        assertTrue(result.ir, "should compile complex condition");
        testsRun++;
    });

    // Error cases
    test("E2E: undefined variable", () => {
        assertFails(`fn main() { let x = y; }`, "undefined variable");
        testsRun++;
    });

    test("E2E: undefined function", () => {
        assertFails(`fn main() { let x = undefined_fn(); }`, "undefined function");
        testsRun++;
    });

    test("E2E: vec repeat form is unsupported", () => {
        const result = assertFails(
            `fn main() { let v = vec![1; 3]; }`,
            "vec repeat unsupported",
        );
        const messages = result.errors.map((e) => e.message).join("\n");
        assertTrue(
            messages.includes("Macro repeat form `[expr; count]` is not supported yet"),
            `unexpected errors: ${messages}`,
        );
        testsRun++;
    });

    test("E2E: vec non-copy by-value index fails", () => {
        const result = assertFails(
            `struct S { x: i32 } fn main() { let v = vec![S { x: 1 }]; let _x = v[0]; }`,
            "vec non-copy index error",
        );
        const messages = result.errors.map((e) => e.message).join("\n");
        assertTrue(
            messages.includes("Vec index by-value requires Copy element type"),
            `unexpected errors: ${messages}`,
        );
        testsRun++;
    });

    return testsRun;
}

// Run tests if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    runE2ETests();
    printSummary(testsRun);
}
