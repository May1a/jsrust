import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../main";
import { test, assertEqual, assertTrue } from "./lib";

/**
 * @param {string} prefix
 * @returns {string}
 */
function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @param {string} dir
 * @param {string} rel
 * @param {string} content
 * @returns {string}
 */
function writeFile(dir, rel, content) {
    const filePath = path.join(dir, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
}

export function runModuleTests() {
    test("Modules: inline module path + use alias compile", () => {
        const source = `
mod math {
    pub fn add(a: i32, b: i32) -> i32 { a + b }
    pub fn sub(a: i32, b: i32) -> i32 { a - b }
}

use math::sub as sub_math;

fn main() {
    let result = math::add(1, 2);
    let result2 = sub_math(1, 2);
    println!("{}", result);
    println!("{}", result2);
}
`;
        const result = compile(source, { validate: false });
        assertEqual(
            result.ok,
            true,
            `inline module should compile: ${result.errors.map((e) => e.message).join(", ")}`,
        );
        assertTrue(
            result.ir && result.ir.includes("fn math::add"),
            "expected module function name in IR",
        );
        assertTrue(
            result.ir && result.ir.includes("fn math::sub"),
            "expected aliased function target in IR",
        );
    });

    test("Modules: private item access denied across modules", () => {
        const source = `
mod a {
    fn secret() -> i32 { 1 }
}

fn main() {
    let value = a::secret();
    println!("{}", value);
}
`;
        const result = compile(source, { validate: false });
        assertEqual(result.ok, false, "private module item access should fail");
        assertTrue(
            result.errors.some((e) =>
                String(e.message).includes("not visible"),
            ),
            `expected visibility error, got: ${result.errors.map((e) => e.message).join(", ")}`,
        );
    });

    test("Modules: pub use re-export is visible across modules", () => {
        const source = `
mod a {
    mod b {
        pub fn f() -> i32 { 7 }
    }
    pub use b::f;
}

fn main() {
    let value = a::f();
    println!("{}", value);
}
`;
        const result = compile(source, { validate: false });
        assertEqual(
            result.ok,
            true,
            `pub use re-export should compile: ${result.errors.map((e) => e.message).join(", ")}`,
        );
    });

    test("Modules: pub use grouped re-exports compile", () => {
        const source = `
mod input {
    pub fn mk() -> i32 { 1 }
}
mod reader {
    pub fn end() -> i32 { 2 }
    pub fn read() -> i32 { 3 }
}
pub use { input::mk, reader::{end, read} };

fn main() {
    let a = mk();
    let b = end();
    let c = read();
    println!("{}", a + b + c);
}
`;
        const result = compile(source, { validate: false });
        assertEqual(
            result.ok,
            true,
            `pub use grouped re-exports should compile: ${result.errors.map((e) => e.message).join(", ")}`,
        );
    });

    test("Modules: private use alias is not visible across modules", () => {
        const source = `
mod a {
    mod b {
        pub fn f() -> i32 { 7 }
    }
    use b::f;
}

fn main() {
    let value = a::f();
    println!("{}", value);
}
`;
        const result = compile(source, { validate: false });
        assertEqual(
            result.ok,
            false,
            "private use alias should not be exported",
        );
        assertTrue(
            result.errors.some(
                (e) =>
                    String(e.message).includes("Path is not visible here") ||
                    String(e.message).includes("Unresolved path"),
            ),
            `expected visibility/path error, got: ${result.errors.map((e) => e.message).join(", ")}`,
        );
    });

    test("Modules: file module resolves name.rs", () => {
        const dir = makeTempDir("jsrust-mod-name-rs-");
        try {
            const mainPath = writeFile(
                dir,
                "main.rs",
                `
mod util;

fn main() {
    let value = util::add(1, 2);
    println!("{}", value);
}
`,
            );
            writeFile(
                dir,
                "util.rs",
                `
pub fn add(a: i32, b: i32) -> i32 { a + b }
`,
            );
            const source = fs.readFileSync(mainPath, "utf-8");
            const result = compile(source, {
                validate: false,
                sourcePath: mainPath,
            });
            assertEqual(
                result.ok,
                true,
                `name.rs module should compile: ${result.errors.map((e) => e.message).join(", ")}`,
            );
            assertTrue(
                result.ir && result.ir.includes("fn util::add"),
                "expected util::add in IR",
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("Modules: file module resolves name/mod.rs", () => {
        const dir = makeTempDir("jsrust-mod-name-mod-rs-");
        try {
            const mainPath = writeFile(
                dir,
                "main.rs",
                `
mod util;

fn main() {
    let value = util::sub(3, 1);
    println!("{}", value);
}
`,
            );
            writeFile(
                dir,
                "util/mod.rs",
                `
pub fn sub(a: i32, b: i32) -> i32 { a - b }
`,
            );
            const source = fs.readFileSync(mainPath, "utf-8");
            const result = compile(source, {
                validate: false,
                sourcePath: mainPath,
            });
            assertEqual(
                result.ok,
                true,
                `name/mod.rs module should compile: ${result.errors.map((e) => e.message).join(", ")}`,
            );
            assertTrue(
                result.ir && result.ir.includes("fn util::sub"),
                "expected util::sub in IR",
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("Modules: missing file module emits deterministic error", () => {
        const dir = makeTempDir("jsrust-mod-missing-");
        try {
            const mainPath = writeFile(
                dir,
                "main.rs",
                `
mod missing;
fn main() {}
`,
            );
            const source = fs.readFileSync(mainPath, "utf-8");
            const result = compile(source, {
                validate: false,
                sourcePath: mainPath,
            });
            assertEqual(result.ok, false, "missing module should fail");
            assertTrue(
                result.errors.some((e) =>
                    String(e.message).includes("Module file not found"),
                ),
                `expected missing module file error, got: ${result.errors.map((e) => e.message).join(", ")}`,
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("Modules: ambiguous module files emit deterministic error", () => {
        const dir = makeTempDir("jsrust-mod-ambiguous-");
        try {
            const mainPath = writeFile(
                dir,
                "main.rs",
                `
mod util;
fn main() {}
`,
            );
            writeFile(
                dir,
                "util.rs",
                "pub fn add(a: i32, b: i32) -> i32 { a + b }",
            );
            writeFile(
                dir,
                "util/mod.rs",
                "pub fn sub(a: i32, b: i32) -> i32 { a - b }",
            );
            const source = fs.readFileSync(mainPath, "utf-8");
            const result = compile(source, {
                validate: false,
                sourcePath: mainPath,
            });
            assertEqual(result.ok, false, "ambiguous module should fail");
            assertTrue(
                result.errors.some((e) =>
                    String(e.message).includes("Ambiguous module file"),
                ),
                `expected ambiguous module file error, got: ${result.errors.map((e) => e.message).join(", ")}`,
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("Modules: file include cycles are detected", () => {
        const dir = makeTempDir("jsrust-mod-cycle-");
        try {
            const mainPath = writeFile(
                dir,
                "main.rs",
                `
mod a;
fn main() {
    let v = a::f();
    println!("{}", v);
}
`,
            );
            writeFile(
                dir,
                "a.rs",
                `
mod b;
pub fn f() -> i32 { b::g() }
`,
            );
            writeFile(
                dir,
                "b.rs",
                `
mod a;
pub fn g() -> i32 { 1 }
`,
            );
            const source = fs.readFileSync(mainPath, "utf-8");
            const result = compile(source, {
                validate: false,
                sourcePath: mainPath,
            });
            assertEqual(result.ok, false, "module cycle should fail");
            assertTrue(
                result.errors.some((e) => String(e.message).includes("cycle")),
                `expected cycle error, got: ${result.errors.map((e) => e.message).join(", ")}`,
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("Modules: compile(source) rejects file modules without sourcePath", () => {
        const source = `
mod dep;
fn main() {}
`;
        const result = compile(source, { validate: false });
        assertEqual(
            result.ok,
            false,
            "file module without sourcePath should fail",
        );
        assertTrue(
            result.errors.some((e) => String(e.message).includes("sourcePath")),
            `expected sourcePath error, got: ${result.errors.map((e) => e.message).join(", ")}`,
        );
    });
}
