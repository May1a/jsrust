import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { canRunBackendIntegrationTests as backendIntegrationAvailable } from "../../backend_runner.js";
import { test, assertEqual, assertTrue } from "../lib.js";

const MAIN_PATH = path.resolve(process.cwd(), "main.js");

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canRunBackendIntegrationGate() {
    return backendIntegrationAvailable();
}

/**
 * @param {string[]} args
 * @returns {import("child_process").SpawnSyncReturns<string>}
 */
function runMain(args) {
    return spawnSync(process.execPath, [MAIN_PATH, ...args], {
        encoding: "utf-8",
    });
}

export function runBackendIntegrationTests() {
    test("Backend integration: run empty main", () => {
        const result = runMain(["run", "examples/01_empty_main.rs"]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: run arithmetic example", () => {
        const result = runMain(["run", "examples/03_arithmetic.rs"]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: run hello world example", () => {
        const result = runMain(["run", "examples/10_hello_world.rs"]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        const lines = result.stdout.trimEnd().split("\n");
        assertEqual(lines[0], "Hello, World!");
        assertEqual(lines[lines.length - 1], "ok");
    });

    test("Backend integration: run functions print example", () => {
        const result = runMain(["run", "examples/11_functions_print.rs"]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        const lines = result.stdout.trimEnd().split("\n");
        assertEqual(lines[0], "Hello, world!");
        assertEqual(lines[lines.length - 1], "ok");
    });

    test("Backend integration: run format print vars example", () => {
        const result = runMain(["run", "examples/13_format_print_var.rs"]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        const lines = result.stdout.trimEnd().split("\n");
        assertEqual(lines[0], "Hello, world!");
        assertEqual(lines[1], "42");
        assertEqual(lines[2], "3.14");
        assertEqual(lines[3], "true");
        assertEqual(lines[4], "a");
        assertEqual(lines[lines.length - 1], "ok");
    });

    test("Backend integration: run arithmetic via codegen wasm mode", () => {
        const result = runMain([
            "run",
            "examples/03_arithmetic.rs",
            "--codegen-wasm",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: --trace rejected in codegen wasm mode", () => {
        const result = runMain([
            "run",
            "examples/01_empty_main.rs",
            "--codegen-wasm",
            "--trace",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue((result.status ?? 0) !== 0, "expected non-zero status");
        assertTrue(
            result.stderr.includes("--trace is not supported with --codegen-wasm"),
            `unexpected stderr: ${result.stderr}`,
        );
    });

    test("Backend integration: missing entry returns execute error", () => {
        const result = runMain([
            "run",
            "examples/04_functions.rs",
            "--entry",
            "does_not_exist",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue(
            (result.status ?? 0) !== 0,
            "expected non-zero status for missing entry",
        );
        assertTrue(
            result.stderr.includes("error[execute-error]:"),
            `unexpected stderr: ${result.stderr}`,
        );
    });

    test("Backend integration: trace output is written", () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsrust-trace-"));
        const tracePath = path.join(tempDir, "trace.txt");

        try {
            const result = runMain([
                "run",
                "examples/03_arithmetic.rs",
                "--trace",
                "--trace-out",
                tracePath,
            ]);
            assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
            assertEqual(result.status, 0, `stderr: ${result.stderr}`);
            assertTrue(fs.existsSync(tracePath), `trace file missing: ${tracePath}`);
            const trace = fs.readFileSync(tracePath, "utf-8");
            assertTrue(trace.length > 0, "trace file should not be empty");
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test("Backend integration: --backend-bin is rejected", () => {
        const result = runMain([
            "run",
            "examples/01_empty_main.rs",
            "--backend-bin",
            "ignored",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue((result.status ?? 0) !== 0, "expected non-zero status");
        assertTrue(
            result.stderr.includes("unknown option for run: --backend-bin"),
            `unexpected stderr: ${result.stderr}`,
        );
    });

    test("Backend integration: --no-build-backend is rejected", () => {
        const result = runMain([
            "run",
            "examples/01_empty_main.rs",
            "--no-build-backend",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue((result.status ?? 0) !== 0, "expected non-zero status");
        assertTrue(
            result.stderr.includes("unknown option for run: --no-build-backend"),
            `unexpected stderr: ${result.stderr}`,
        );
    });

    test("Backend integration: --keep-bin is rejected", () => {
        const result = runMain([
            "run",
            "examples/01_empty_main.rs",
            "--keep-bin",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue((result.status ?? 0) !== 0, "expected non-zero status");
        assertTrue(
            result.stderr.includes("unknown option for run: --keep-bin"),
            `unexpected stderr: ${result.stderr}`,
        );
    });
}
