import { compile } from "../../main.js";
import { assert, assertTrue } from "../lib.js";

function hasBorrowError(result) {
    return (result.errors || []).some((e) => e.kind === "borrow");
}

export function runInferenceBorrowLiteTests() {
    assert("borrow-lite: shared and mutable borrows may coexist", () => {
        const result = compile(
            "fn main() { let mut x = 1; let a = &x; let b = &mut x; }",
            { validate: false },
        );
        assertTrue(result.ok);
    });

    assert("borrow-lite: non-copy values can be aliased by reference reuse", () => {
        const result = compile(
            "struct S { x: i32 } fn touch(_a: &S, _b: &S) {} fn main() { let s = S { x: 1 }; touch(&s, &s); }",
            { validate: false },
        );
        assertTrue(result.ok);
    });

    assert("borrow-lite: copyable values can be reused after pass-by-value", () => {
        const result = compile(
            "fn takes(_x: i32) {} fn main() { let x = 1; takes(x); takes(x); }",
            { validate: false },
        );
        assertTrue(result.ok);
    });

    assert("borrow-lite: reject return reference to local", () => {
        const result = compile("fn bad() -> &i32 { let x = 1; &x }", {
            validate: false,
        });
        assertTrue(!result.ok);
        assertTrue(hasBorrowError(result));
    });

    assert("borrow-lite: reject escaping local reference through outer binding", () => {
        const result = compile(
            "fn bad() -> i32 { let mut r: &i32; { let x = 1; r = &x; }; 0 }",
            { validate: false },
        );
        assertTrue(!result.ok);
        assertTrue(hasBorrowError(result));
    });

    assert("borrow-lite: allow returning references derived from parameters", () => {
        const result = compile("fn good<'a>(x: &'a i32) -> &'a i32 { x }", {
            validate: false,
        });
        assertTrue(result.ok);
    });

    return 6;
}
