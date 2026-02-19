import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const DEFAULT_BACKEND_WASM = path.join(
    BACKEND_DIR,
    "bin",
    "jsrust-backend.wasm",
);

const REQUIRED_WASM_EXPORTS = [
    "memory",
    "jsrust_wasm_alloc",
    "jsrust_wasm_reset",
    "jsrust_wasm_run",
    "jsrust_wasm_result_code",
    "jsrust_wasm_result_has_exit_value",
    "jsrust_wasm_result_exit_value",
    "jsrust_wasm_result_message_ptr",
    "jsrust_wasm_result_message_len",
    "jsrust_wasm_stdout_ptr",
    "jsrust_wasm_stdout_len",
    "jsrust_wasm_trace_ptr",
    "jsrust_wasm_trace_len",
];

const BACKEND_ERROR_LABELS = new Map([
    [0, "ok"],
    [10, "io-error"],
    [11, "invalid-args"],
    [20, "deserialize-error"],
    [21, "unsupported-version"],
    [30, "validate-error"],
    [40, "execute-error"],
    [100, "internal-error"],
]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * @typedef {object} BackendWasmExports
 * @property {WebAssembly.Memory} memory
 * @property {(size: number) => number} jsrust_wasm_alloc
 * @property {() => void} jsrust_wasm_reset
 * @property {(inputPtr: number, inputLen: number, entryPtr: number, entryLen: number, traceEnabled: number) => number} jsrust_wasm_run
 * @property {() => number} jsrust_wasm_result_code
 * @property {() => number} jsrust_wasm_result_has_exit_value
 * @property {() => number} jsrust_wasm_result_exit_value
 * @property {() => number} jsrust_wasm_result_message_ptr
 * @property {() => number} jsrust_wasm_result_message_len
 * @property {() => number} jsrust_wasm_stdout_ptr
 * @property {() => number} jsrust_wasm_stdout_len
 * @property {() => number} jsrust_wasm_trace_ptr
 * @property {() => number} jsrust_wasm_trace_len
 */

/** @type {{ path: string, exports: BackendWasmExports, memory: WebAssembly.Memory } | null} */
let wasmRuntime = null;

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function fileExists(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function canBuildBackend() {
    const makefilePath = path.join(BACKEND_DIR, "Makefile");
    if (!fileExists(makefilePath)) {
        return {
            ok: false,
            reason: `missing backend Makefile at ${makefilePath}`,
        };
    }

    const probe = spawnSync("make", ["--version"], { encoding: "utf-8" });
    if (probe.error) {
        return {
            ok: false,
            reason: `make not available: ${probe.error.message}`,
        };
    }
    if ((probe.status ?? 1) !== 0) {
        return {
            ok: false,
            reason: "make command probe returned non-zero",
        };
    }

    return { ok: true };
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function canCompileBackendWasm() {
    const probe = spawnSync("clang", ["--print-targets"], { encoding: "utf-8" });
    if (probe.error) {
        return {
            ok: false,
            reason: `clang not available: ${probe.error.message}`,
        };
    }
    if ((probe.status ?? 1) !== 0) {
        return {
            ok: false,
            reason: "clang target probe returned non-zero",
        };
    }
    if (!probe.stdout.includes("wasm32")) {
        return {
            ok: false,
            reason: "clang wasm32 target is unavailable",
        };
    }

    return { ok: true };
}

/**
 * @typedef {object} ResolveBackendWasmOptions
 * @property {string} [backendWasm]
 * @property {string} [cwd]
 */

/**
 * @typedef {{ ok: true, path: string, source: "cli" | "env" | "default" } | { ok: false, code: string, message: string }} ResolveBackendWasmResult
 */

/**
 * @param {ResolveBackendWasmOptions} [options={}]
 * @returns {ResolveBackendWasmResult}
 */
function resolveBackendWasm(options = {}) {
    const cwd = options.cwd || process.cwd();

    if (options.backendWasm) {
        return {
            ok: true,
            path: path.resolve(cwd, options.backendWasm),
            source: "cli",
        };
    }

    if (process.env.JSRUST_BACKEND_WASM) {
        return {
            ok: true,
            path: path.resolve(cwd, process.env.JSRUST_BACKEND_WASM),
            source: "env",
        };
    }

    return {
        ok: true,
        path: DEFAULT_BACKEND_WASM,
        source: "default",
    };
}

/**
 * @typedef {object} EnsureBackendWasmOptions
 * @property {string} [backendWasm]
 * @property {boolean} [buildIfMissing=true]
 */

/**
 * @typedef {{ ok: true, path: string, source: "cli" | "env" | "default", built: boolean } | ({ ok: false, code: string, message: string, stdout?: string, stderr?: string })} EnsureBackendWasmResult
 */

/**
 * @param {EnsureBackendWasmOptions} [options={}]
 * @returns {EnsureBackendWasmResult}
 */
function ensureBackendWasm(options = {}) {
    const resolved = resolveBackendWasm({
        backendWasm: options.backendWasm,
    });
    if (!resolved.ok) {
        return resolved;
    }

    if (fileExists(resolved.path)) {
        return {
            ok: true,
            path: resolved.path,
            source: resolved.source,
            built: false,
        };
    }

    if (resolved.source !== "default") {
        return {
            ok: false,
            code: "backend_wasm_missing",
            message: `backend wasm not found: ${resolved.path}`,
        };
    }

    if (options.buildIfMissing === false) {
        return {
            ok: false,
            code: "backend_wasm_missing",
            message: `backend wasm not found: ${resolved.path}`,
        };
    }

    const buildCheck = canBuildBackend();
    if (!buildCheck.ok) {
        return {
            ok: false,
            code: "backend_build_unavailable",
            message: buildCheck.reason,
        };
    }

    const clangCheck = canCompileBackendWasm();
    if (!clangCheck.ok) {
        return {
            ok: false,
            code: "backend_build_unavailable",
            message: clangCheck.reason,
        };
    }

    const build = spawnSync("make", ["-C", BACKEND_DIR, "wasm"], {
        encoding: "utf-8",
    });
    if (build.error) {
        return {
            ok: false,
            code: "backend_build_failed",
            message: `failed to invoke backend wasm build: ${build.error.message}`,
            stdout: build.stdout || "",
            stderr: build.stderr || "",
        };
    }
    if ((build.status ?? 1) !== 0) {
        return {
            ok: false,
            code: "backend_build_failed",
            message: `backend wasm build failed with exit code ${build.status ?? 1}`,
            stdout: build.stdout || "",
            stderr: build.stderr || "",
        };
    }

    if (!fileExists(resolved.path)) {
        return {
            ok: false,
            code: "backend_wasm_missing",
            message: `backend wasm not found after build: ${resolved.path}`,
        };
    }

    return {
        ok: true,
        path: resolved.path,
        source: resolved.source,
        built: true,
    };
}

/**
 * @param {{ path: string }} options
 * @returns {{ ok: true, path: string, exports: BackendWasmExports, memory: WebAssembly.Memory } | { ok: false, code: string, message: string }}
 */
function loadBackendWasm(options) {
    if (wasmRuntime && wasmRuntime.path === options.path) {
        return {
            ok: true,
            path: wasmRuntime.path,
            exports: wasmRuntime.exports,
            memory: wasmRuntime.memory,
        };
    }

    let bytes;
    try {
        bytes = fs.readFileSync(options.path);
    } catch (e) {
        return {
            ok: false,
            code: "backend_wasm_load_failed",
            message: `failed to read backend wasm: ${errorMessage(e)}`,
        };
    }

    let instance;
    try {
        const module = new WebAssembly.Module(bytes);
        instance = new WebAssembly.Instance(module, {});
    } catch (e) {
        return {
            ok: false,
            code: "backend_wasm_load_failed",
            message: `failed to instantiate backend wasm: ${errorMessage(e)}`,
        };
    }

    /** @type {BackendWasmExports} */
    const wasmExports = /** @type {BackendWasmExports} */ (instance.exports);

    for (const exportName of REQUIRED_WASM_EXPORTS) {
        if (!(exportName in wasmExports)) {
            return {
                ok: false,
                code: "backend_wasm_load_failed",
                message: `backend wasm missing export: ${exportName}`,
            };
        }
    }

    const memory = wasmExports.memory;
    if (!(memory instanceof WebAssembly.Memory)) {
        return {
            ok: false,
            code: "backend_wasm_load_failed",
            message: "backend wasm export 'memory' is not a WebAssembly.Memory",
        };
    }

    wasmRuntime = {
        path: options.path,
        exports: wasmExports,
        memory,
    };

    return {
        ok: true,
        path: options.path,
        exports: wasmExports,
        memory,
    };
}

/**
 * @param {WebAssembly.Memory} memory
 * @param {number} ptr
 * @param {number} len
 * @returns {Uint8Array}
 */
function readWasmBytes(memory, ptr, len) {
    if (!ptr || len <= 0) {
        return new Uint8Array();
    }
    return new Uint8Array(memory.buffer, ptr, len).slice();
}

/**
 * @param {BackendWasmExports} wasmExports
 * @param {WebAssembly.Memory} memory
 * @param {Uint8Array} bytes
 * @returns {{ ok: true, ptr: number } | { ok: false, code: string, message: string }}
 */
function allocAndWrite(wasmExports, memory, bytes) {
    if (bytes.length === 0) {
        return { ok: true, ptr: 0 };
    }

    let ptr;
    try {
        ptr = Number(wasmExports.jsrust_wasm_alloc(bytes.length));
    } catch (e) {
        return {
            ok: false,
            code: "backend_wasm_alloc_failed",
            message: `backend wasm allocation trap: ${errorMessage(e)}`,
        };
    }
    if (!ptr) {
        return {
            ok: false,
            code: "backend_wasm_alloc_failed",
            message: "backend wasm allocation failed",
        };
    }

    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
    return {
        ok: true,
        ptr,
    };
}

/**
 * @typedef {object} RunBackendWasmOptions
 * @property {string} [entry]
 * @property {boolean} [trace]
 * @property {string} [backendWasm]
 * @property {boolean} [buildIfMissing=true]
 */

/**
 * @typedef {{ ok: true, code: "ok", stdout: string, stdoutBytes: Uint8Array, traceBytes: Uint8Array, message: string, label: string, backendCode: number, hasExitValue: boolean, exitValue: number, exitCode: 0, wasmPath: string, built: boolean } | { ok: false, code: string, message: string, label: string, backendCode: number, stdout: string, stdoutBytes: Uint8Array, traceBytes: Uint8Array, stderr: string, exitCode: number | null, wasmPath?: string, built?: boolean }} RunBackendWasmResult
 */

/**
 * @param {Uint8Array} moduleBytes
 * @param {RunBackendWasmOptions} [options={}]
 * @returns {RunBackendWasmResult}
 */
function runBackendWasm(moduleBytes, options = {}) {
    const ensured = ensureBackendWasm({
        backendWasm: options.backendWasm,
        buildIfMissing: options.buildIfMissing,
    });
    if (!ensured.ok) {
        return {
            ok: false,
            code: ensured.code,
            message: ensured.message,
            label: "internal-error",
            backendCode: 100,
            stdout: "",
            stdoutBytes: new Uint8Array(),
            traceBytes: new Uint8Array(),
            stderr: `error[internal-error]: ${ensured.message}`,
            exitCode: null,
        };
    }

    const loaded = loadBackendWasm({ path: ensured.path });
    if (!loaded.ok) {
        return {
            ok: false,
            code: loaded.code,
            message: loaded.message,
            label: "internal-error",
            backendCode: 100,
            stdout: "",
            stdoutBytes: new Uint8Array(),
            traceBytes: new Uint8Array(),
            stderr: `error[internal-error]: ${loaded.message}`,
            exitCode: null,
            wasmPath: ensured.path,
            built: ensured.built,
        };
    }

    const wasmExports = loaded.exports;
    const memory = loaded.memory;
    const entry = options.entry || "main";
    const traceEnabled = options.trace ? 1 : 0;
    const entryBytes = textEncoder.encode(entry);

    try {
        wasmExports.jsrust_wasm_reset();
    } catch (e) {
        const message = `backend wasm reset trap: ${errorMessage(e)}`;
        return {
            ok: false,
            code: "backend_wasm_run_failed",
            message,
            label: "internal-error",
            backendCode: 100,
            stdout: "",
            stdoutBytes: new Uint8Array(),
            traceBytes: new Uint8Array(),
            stderr: `error[internal-error]: ${message}`,
            exitCode: null,
            wasmPath: ensured.path,
            built: ensured.built,
        };
    }

    const inputAlloc = allocAndWrite(wasmExports, memory, moduleBytes);
    if (!inputAlloc.ok) {
        return {
            ok: false,
            code: inputAlloc.code,
            message: inputAlloc.message,
            label: "internal-error",
            backendCode: 100,
            stdout: "",
            stdoutBytes: new Uint8Array(),
            traceBytes: new Uint8Array(),
            stderr: `error[internal-error]: ${inputAlloc.message}`,
            exitCode: null,
            wasmPath: ensured.path,
            built: ensured.built,
        };
    }

    const entryAlloc = allocAndWrite(wasmExports, memory, entryBytes);
    if (!entryAlloc.ok) {
        return {
            ok: false,
            code: entryAlloc.code,
            message: entryAlloc.message,
            label: "internal-error",
            backendCode: 100,
            stdout: "",
            stdoutBytes: new Uint8Array(),
            traceBytes: new Uint8Array(),
            stderr: `error[internal-error]: ${entryAlloc.message}`,
            exitCode: null,
            wasmPath: ensured.path,
            built: ensured.built,
        };
    }

    try {
        wasmExports.jsrust_wasm_run(
            inputAlloc.ptr,
            moduleBytes.length,
            entryAlloc.ptr,
            entryBytes.length,
            traceEnabled,
        );
    } catch (e) {
        const message = `backend wasm run trap: ${errorMessage(e)}`;
        return {
            ok: false,
            code: "backend_wasm_run_failed",
            message,
            label: "internal-error",
            backendCode: 100,
            stdout: "",
            stdoutBytes: new Uint8Array(),
            traceBytes: new Uint8Array(),
            stderr: `error[internal-error]: ${message}`,
            exitCode: null,
            wasmPath: ensured.path,
            built: ensured.built,
        };
    }

    const backendCode = Number(wasmExports.jsrust_wasm_result_code());
    const label = BACKEND_ERROR_LABELS.get(backendCode) || "unknown-error";

    const messagePtr = Number(wasmExports.jsrust_wasm_result_message_ptr());
    const messageLen = Number(wasmExports.jsrust_wasm_result_message_len());
    const stdoutPtr = Number(wasmExports.jsrust_wasm_stdout_ptr());
    const stdoutLen = Number(wasmExports.jsrust_wasm_stdout_len());
    const tracePtr = Number(wasmExports.jsrust_wasm_trace_ptr());
    const traceLen = Number(wasmExports.jsrust_wasm_trace_len());

    const messageBytes = readWasmBytes(memory, messagePtr, messageLen);
    const stdoutBytes = readWasmBytes(memory, stdoutPtr, stdoutLen);
    const traceBytes = readWasmBytes(memory, tracePtr, traceLen);

    const message = messageBytes.length > 0
        ? textDecoder.decode(messageBytes)
        : label;
    const stdout = stdoutBytes.length > 0
        ? textDecoder.decode(stdoutBytes)
        : "";

    if (backendCode === 0) {
        const hasExitValue = Number(wasmExports.jsrust_wasm_result_has_exit_value()) !== 0;
        const exitValue = Number(wasmExports.jsrust_wasm_result_exit_value());
        return {
            ok: true,
            code: "ok",
            stdout,
            stdoutBytes,
            traceBytes,
            message,
            label,
            backendCode,
            hasExitValue,
            exitValue,
            exitCode: 0,
            wasmPath: ensured.path,
            built: ensured.built,
        };
    }

    return {
        ok: false,
        code: "backend_run_failed",
        message,
        label,
        backendCode,
        stdout,
        stdoutBytes,
        traceBytes,
        stderr: `error[${label}]: ${message}`,
        exitCode: backendCode,
        wasmPath: ensured.path,
        built: ensured.built,
    };
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function canRunBackendIntegrationTests() {
    const resolved = resolveBackendWasm();
    if (!resolved.ok) {
        return { ok: false, reason: resolved.message };
    }

    if (fileExists(resolved.path)) {
        return { ok: true };
    }

    if (resolved.source !== "default") {
        return {
            ok: false,
            reason: `configured backend wasm not found: ${resolved.path}`,
        };
    }

    const buildCheck = canBuildBackend();
    if (!buildCheck.ok) {
        return { ok: false, reason: buildCheck.reason };
    }

    const clangCheck = canCompileBackendWasm();
    if (!clangCheck.ok) {
        return { ok: false, reason: clangCheck.reason };
    }

    return { ok: true };
}

export {
    DEFAULT_BACKEND_WASM,
    resolveBackendWasm,
    ensureBackendWasm,
    runBackendWasm,
    canRunBackendIntegrationTests,
};
