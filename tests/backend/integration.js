import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { canRunBackendIntegrationTests as backendIntegrationAvailable } from "../../backend_runner.js";
import { test, assertEqual, assertTrue } from "../lib.js";

const MAIN_PATH = path.resolve(process.cwd(), "main.js");
const RUN_FIXTURES_DIR = "tests/fixtures/run_cli";
const RUN_EMPTY_MAIN = `${RUN_FIXTURES_DIR}/01_empty_main.rs`;
const RUN_ARITHMETIC = `${RUN_FIXTURES_DIR}/03_arithmetic.rs`;
const RUN_HELLO_WORLD = `${RUN_FIXTURES_DIR}/10_hello_world.rs`;
const RUN_FUNCTIONS_PRINT = `${RUN_FIXTURES_DIR}/11_functions_print.rs`;
const RUN_FORMAT_PRINT_VAR = `${RUN_FIXTURES_DIR}/13_format_print_var.rs`;
const RUN_CLOSURE_PARAM = `${RUN_FIXTURES_DIR}/14_closure_param.rs`;

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

/**
 * @param {string} text
 */
function normalizedText(text) {
    return text.replace(/\r\n/g, "\n");
}

export function runBackendIntegrationTests() {
    test("Backend integration: run empty main", () => {
        const result = runMain(["run", RUN_EMPTY_MAIN]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: run arithmetic example", () => {
        const result = runMain(["run", RUN_ARITHMETIC]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: run hello world example", () => {
        const result = runMain(["run", RUN_HELLO_WORLD]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        const lines = result.stdout.trimEnd().split("\n");
        assertEqual(lines[0], "Hello, World!");
        assertEqual(lines[lines.length - 1], "ok");
    });

    test("Backend integration: run functions print example", () => {
        const result = runMain(["run", RUN_FUNCTIONS_PRINT]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        const lines = result.stdout.trimEnd().split("\n");
        assertEqual(lines[0], "Hello, world!");
        assertEqual(lines[lines.length - 1], "ok");
    });

    test("Backend integration: run format print vars example", () => {
        const result = runMain(["run", RUN_FORMAT_PRINT_VAR]);
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

    test("Backend integration: run closure function-parameter example", () => {
        const result = runMain(["run", RUN_CLOSURE_PARAM]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: run arithmetic via codegen wasm mode", () => {
        const result = runMain([
            "run",
            RUN_ARITHMETIC,
            "--codegen-wasm",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertEqual(result.stdout.trim(), "ok");
    });

    test("Backend integration: codegen wasm parity matrix", () => {
        const fixtures = [
            "tests/fixtures/backend_ir_v2/01_empty_main.rs",
            "tests/fixtures/backend_ir_v2/02_literals.rs",
            "tests/fixtures/backend_ir_v2/03_arithmetic.rs",
            "tests/fixtures/backend_ir_v2/04_functions.rs",
            "tests/fixtures/backend_ir_v2/07_structs.rs",
            "tests/fixtures/backend_ir_v2/09_references.rs",
            RUN_HELLO_WORLD,
            RUN_FUNCTIONS_PRINT,
            RUN_FORMAT_PRINT_VAR,
        ];

        for (const fixture of fixtures) {
            const interpreted = runMain(["run", fixture]);
            assertTrue(!interpreted.error, `spawn failed for interpreted run (${fixture}): ${interpreted.error?.message || ""}`);
            assertEqual(interpreted.status, 0, `interpreted stderr (${fixture}): ${interpreted.stderr}`);

            const generated = runMain(["run", fixture, "--codegen-wasm"]);
            assertTrue(!generated.error, `spawn failed for codegen run (${fixture}): ${generated.error?.message || ""}`);
            assertEqual(generated.status, 0, `codegen stderr (${fixture}): ${generated.stderr}`);

            assertEqual(
                normalizedText(generated.stdout),
                normalizedText(interpreted.stdout),
                `stdout parity mismatch for ${fixture}`,
            );
        }
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

    test("Backend integration: codegen wasm rejects dynamic call", () => {
        const result = runMain([
            "run",
            RUN_CLOSURE_PARAM,
            "--codegen-wasm",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue((result.status ?? 0) !== 0, "expected non-zero status");
        assertTrue(
            result.stderr.includes("wasm codegen: dynamic calls are not supported yet"),
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
                RUN_ARITHMETIC,
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

    test("Backend integration: test command passes with matching expect_output", () => {
        const result = runMain([
            "test",
            "tests/fixtures/test_cli/expect_output_match.rs",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertTrue(
            result.stdout.includes("test test_print_match ... ok"),
            `unexpected stdout: ${result.stdout}`,
        );
    });

    test("Backend integration: test command fails on expect_output mismatch", () => {
        const result = runMain([
            "test",
            "tests/fixtures/test_cli/expect_output_mismatch.rs",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertTrue((result.status ?? 0) !== 0, "expected non-zero status");
        assertTrue(
            result.stdout.includes("stdout mismatch at line"),
            `unexpected stdout: ${result.stdout}`,
        );
        assertTrue(
            result.stdout.includes("test result: FAILED"),
            `unexpected stdout: ${result.stdout}`,
        );
    });

    test("Backend integration: test command keeps legacy pass semantics without expect_output", () => {
        const result = runMain([
            "test",
            "tests/fixtures/test_cli/no_expect_output.rs",
        ]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertTrue(
            result.stdout.includes("test test_legacy_behavior ... ok"),
            `unexpected stdout: ${result.stdout}`,
        );
    });

    test("Backend integration: test command runs closure tests", () => {
        const result = runMain(["test", "examples/25_closures.rs"]);
        assertTrue(!result.error, `spawn failed: ${result.error?.message || ""}`);
        assertEqual(result.status, 0, `stderr: ${result.stderr}`);
        assertTrue(
            result.stdout.includes("test test_closure_as_parameter ... ok"),
            `unexpected stdout: ${result.stdout}`,
        );
        assertTrue(
            result.stdout.includes("test test_closures ... ok"),
            `unexpected stdout: ${result.stdout}`,
        );
    });
}
