import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const DEFAULT_BACKEND_WASM = path.join(
    BACKEND_DIR,
    "bin",
    "jsrust-backend.wasm",
);

const CODEGEN_WASM_EXPORTS = [
    "jsrust_wasm_codegen",
    "jsrust_wasm_codegen_wasm_ptr",
    "jsrust_wasm_codegen_wasm_len",
];

const BACKEND_CODE = {
    OK: 0,
    IO_ERROR: 10,
    INVALID_ARGS: 11,
    DESERIALIZE_ERROR: 20,
    UNSUPPORTED_VERSION: 21,
    VALIDATE_ERROR: 30,
    EXECUTE_ERROR: 40,
    INTERNAL_ERROR: 100,
} as const;

const BACKEND_ERROR_LABELS = new Map<number, string>([
    [BACKEND_CODE.OK, "ok"],
    [BACKEND_CODE.IO_ERROR, "io-error"],
    [BACKEND_CODE.INVALID_ARGS, "invalid-args"],
    [BACKEND_CODE.DESERIALIZE_ERROR, "deserialize-error"],
    [BACKEND_CODE.UNSUPPORTED_VERSION, "unsupported-version"],
    [BACKEND_CODE.VALIDATE_ERROR, "validate-error"],
    [BACKEND_CODE.EXECUTE_ERROR, "execute-error"],
    [BACKEND_CODE.INTERNAL_ERROR, "internal-error"],
]);

const BYTE_MASK = 0xff;
const MAX_UNICODE_CODE_POINT = 0x10_ff_ff;
const SURROGATE_PAIR_START = 0xd8_00;
const SURROGATE_PAIR_END = 0xdf_ff;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Convert bigint | number to bigint
 */
function toBigInt(value: bigint | number): bigint {
    return typeof value === "bigint" ? value : BigInt(value);
}

interface BackendWasmExports {
    memory: WebAssembly.Memory;
    jsrust_wasm_alloc: (size: number) => number;
    jsrust_wasm_reset: () => void;
    jsrust_wasm_run: (
        inputPtr: number,
        inputLen: number,
        entryPtr: number,
        entryLen: number,
        traceEnabled: number,
    ) => number;
    jsrust_wasm_codegen?: (
        inputPtr: number,
        inputLen: number,
        entryPtr: number,
        entryLen: number,
    ) => number;
    jsrust_wasm_result_code: () => number;
    jsrust_wasm_result_has_exit_value: () => number;
    jsrust_wasm_result_exit_value: () => number;
    jsrust_wasm_result_message_ptr: () => number;
    jsrust_wasm_result_message_len: () => number;
    jsrust_wasm_stdout_ptr: () => number;
    jsrust_wasm_stdout_len: () => number;
    jsrust_wasm_trace_ptr: () => number;
    jsrust_wasm_trace_len: () => number;
    jsrust_wasm_codegen_wasm_ptr?: () => number;
    jsrust_wasm_codegen_wasm_len?: () => number;
}

let wasmRuntime:
    | {
          path: string;
          exports: BackendWasmExports;
          memory: WebAssembly.Memory;
      }
    | undefined;

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function fileExists(filePath: string): boolean {
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
function canBuildBackend(): { ok: true } | { ok: false; reason: string } {
    const makefilePath = path.join(BACKEND_DIR, "Makefile");
    if (!fileExists(makefilePath)) {
        return {
            ok: false,
            reason: `missing backend Makefile at ${makefilePath}`,
        };
    }

    const probe = spawnSync("make", ["--version"], { encoding: "utf8" });
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
function canCompileBackendWasm(): { ok: true } | { ok: false; reason: string } {
    const probe = spawnSync("clang", ["--print-targets"], {
        encoding: "utf8",
    });
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

interface ResolveBackendWasmOptions {
    backendWasm?: string;
    cwd?: string;
}

type ResolveBackendWasmResult =
    | { ok: true; path: string; source: "cli" | "env" | "default" }
    | { ok: false; code: string; message: string };

function resolveBackendWasm(
    options: ResolveBackendWasmOptions = {},
): ResolveBackendWasmResult {
    const cwd = options.cwd ?? process.cwd();
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

interface EnsureBackendWasmOptions {
    backendWasm?: string;
    buildIfMissing?: boolean;
}

type EnsureBackendWasmResult =
    | {
          ok: true;
          path: string;
          source: "cli" | "env" | "default";
          built: boolean;
      }
    | {
          ok: false;
          code: string;
          message: string;
          stdout?: string;
          stderr?: string;
      };

function ensureBackendWasm(
    options: EnsureBackendWasmOptions = {},
): EnsureBackendWasmResult {
    const resolved = resolveBackendWasm({
        backendWasm: options.backendWasm,
    });
    if (!resolved.ok) return resolved;
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
        encoding: "utf8",
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

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

function emptyBytes(): Uint8Array {
    return new Uint8Array();
}

function getNumberExport(
    exports: WebAssembly.Exports,
    name: string,
): (args?: number[]) => number {
    const value = exports[name];
    return (args = []) => {
        if (!isFunction(value)) {
            throw new Error(`backend wasm missing or invalid export: ${name}`);
        }
        return Number(value(...args));
    };
}

function getVoidExport(
    exports: WebAssembly.Exports,
    name: string,
): (args?: number[]) => void {
    const value = exports[name];
    return (args = []) => {
        if (!isFunction(value)) {
            throw new Error(`backend wasm missing or invalid export: ${name}`);
        }
        value(...args);
    };
}

function hasCodegenWasmExport(
    exports: BackendWasmExports,
): exports is BackendWasmExports & {
    jsrust_wasm_codegen: (
        inputPtr: number,
        inputLen: number,
        entryPtr: number,
        entryLen: number,
    ) => number;
    jsrust_wasm_codegen_wasm_ptr: () => number;
    jsrust_wasm_codegen_wasm_len: () => number;
} {
    return (
        typeof exports.jsrust_wasm_codegen === "function" &&
        typeof exports.jsrust_wasm_codegen_wasm_ptr === "function" &&
        typeof exports.jsrust_wasm_codegen_wasm_len === "function"
    );
}

function readBackendWasmFile(
    filePath: string,
): Uint8Array | { ok: false; code: string; message: string } {
    try {
        return fs.readFileSync(filePath);
    } catch (error) {
        return {
            ok: false,
            code: "backend_wasm_load_failed",
            message: `failed to read backend wasm: ${errorMessage(error)}`,
        };
    }
}

function instantiateBackendWasm(
    bytes: Uint8Array,
): WebAssembly.Instance | { ok: false; code: string; message: string } {
    try {
        const source = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(source).set(bytes);
        const module = new WebAssembly.Module(source);
        return new WebAssembly.Instance(module, {});
    } catch (error) {
        return {
            ok: false,
            code: "backend_wasm_load_failed",
            message: `failed to instantiate backend wasm: ${errorMessage(error)}`,
        };
    }
}

function validateBackendWasmExports(
    exports: WebAssembly.Exports,
): { ok: true; memory: WebAssembly.Memory } | {
    ok: false;
    code: string;
    message: string;
} {
    if (!(exports.memory instanceof WebAssembly.Memory)) {
        return {
            ok: false,
            code: "backend_wasm_load_failed",
            message: "backend wasm export 'memory' is not a WebAssembly.Memory",
        };
    }
    const requiredFunctions = [
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
    for (const fnName of requiredFunctions) {
        if (!isFunction(exports[fnName])) {
            return {
                ok: false,
                code: "backend_wasm_load_failed",
                message: `backend wasm missing or invalid export: ${fnName}`,
            };
        }
    }
    for (const fnName of CODEGEN_WASM_EXPORTS) {
        if (fnName in exports && !isFunction(exports[fnName])) {
            return {
                ok: false,
                code: "backend_wasm_load_failed",
                message: `backend wasm has invalid codegen export: ${fnName}`,
            };
        }
    }
    return { ok: true, memory: exports.memory };
}

function createBackendWasmExports(
    exports: WebAssembly.Exports,
    memory: WebAssembly.Memory,
): BackendWasmExports {
    const alloc = getNumberExport(exports, "jsrust_wasm_alloc");
    const reset = getVoidExport(exports, "jsrust_wasm_reset");
    const run = getNumberExport(exports, "jsrust_wasm_run");
    const resultCode = getNumberExport(exports, "jsrust_wasm_result_code");
    const hasExitValue = getNumberExport(
        exports,
        "jsrust_wasm_result_has_exit_value",
    );
    const exitValue = getNumberExport(exports, "jsrust_wasm_result_exit_value");
    const messagePtr = getNumberExport(exports, "jsrust_wasm_result_message_ptr");
    const messageLen = getNumberExport(exports, "jsrust_wasm_result_message_len");
    const stdoutPtr = getNumberExport(exports, "jsrust_wasm_stdout_ptr");
    const stdoutLen = getNumberExport(exports, "jsrust_wasm_stdout_len");
    const tracePtr = getNumberExport(exports, "jsrust_wasm_trace_ptr");
    const traceLen = getNumberExport(exports, "jsrust_wasm_trace_len");
    const codegen =
        "jsrust_wasm_codegen" in exports
            ? getNumberExport(exports, "jsrust_wasm_codegen")
            : undefined;
    const codegenWasmPtr =
        "jsrust_wasm_codegen_wasm_ptr" in exports
            ? getNumberExport(exports, "jsrust_wasm_codegen_wasm_ptr")
            : undefined;
    const codegenWasmLen =
        "jsrust_wasm_codegen_wasm_len" in exports
            ? getNumberExport(exports, "jsrust_wasm_codegen_wasm_len")
            : undefined;

    return {
        memory,
        jsrust_wasm_alloc: (size: number) => alloc([size]),
        jsrust_wasm_reset: () => reset(),
        jsrust_wasm_run: (
            inputPtr: number,
            inputLen: number,
            entryPtr: number,
            entryLen: number,
            traceEnabled: number,
        ) => run([inputPtr, inputLen, entryPtr, entryLen, traceEnabled]),
        jsrust_wasm_result_code: () => resultCode(),
        jsrust_wasm_result_has_exit_value: () => hasExitValue(),
        jsrust_wasm_result_exit_value: () => exitValue(),
        jsrust_wasm_result_message_ptr: () => messagePtr(),
        jsrust_wasm_result_message_len: () => messageLen(),
        jsrust_wasm_stdout_ptr: () => stdoutPtr(),
        jsrust_wasm_stdout_len: () => stdoutLen(),
        jsrust_wasm_trace_ptr: () => tracePtr(),
        jsrust_wasm_trace_len: () => traceLen(),
        jsrust_wasm_codegen: codegen
            ? (
                  inputPtr: number,
                  inputLen: number,
                  entryPtr: number,
                  entryLen: number,
              ) => codegen([inputPtr, inputLen, entryPtr, entryLen])
            : undefined,
        jsrust_wasm_codegen_wasm_ptr: codegenWasmPtr
            ? () => codegenWasmPtr()
            : undefined,
        jsrust_wasm_codegen_wasm_len: codegenWasmLen
            ? () => codegenWasmLen()
            : undefined,
    };
}

function loadBackendWasm(options: { path: string }):
    | {
          ok: true;
          path: string;
          exports: BackendWasmExports;
          memory: WebAssembly.Memory;
      }
    | { ok: false; code: string; message: string } {
    if (wasmRuntime !== undefined && wasmRuntime.path === options.path) {
        return {
            ok: true,
            path: wasmRuntime.path,
            exports: wasmRuntime.exports,
            memory: wasmRuntime.memory,
        };
    }
    const bytes = readBackendWasmFile(options.path);
    if (!(bytes instanceof Uint8Array)) {
        return bytes;
    }
    const instance = instantiateBackendWasm(bytes);
    if (!(instance instanceof WebAssembly.Instance)) {
        return instance;
    }
    const { exports } = instance;
    const validation = validateBackendWasmExports(exports);
    if (!validation.ok) {
        return validation;
    }
    const wasmExports = createBackendWasmExports(exports, validation.memory);

    wasmRuntime = {
        path: options.path,
        exports: wasmExports,
        memory: validation.memory,
    };
    return {
        ok: true,
        path: options.path,
        exports: wasmExports,
        memory: validation.memory,
    };
}

function readWasmBytes(
    memory: WebAssembly.Memory,
    ptr: number,
    len: number,
): Uint8Array {
    if (!ptr || len <= 0) {
        return new Uint8Array();
    }
    return new Uint8Array(memory.buffer, ptr, len).slice();
}

function allocAndWrite(
    wasmExports: BackendWasmExports,
    memory: WebAssembly.Memory,
    bytes: Uint8Array,
): { ok: true; ptr: number } | { ok: false; code: string; message: string } {
    if (bytes.length === 0) {
        return { ok: true, ptr: 0 };
    }
    let ptr;
    try {
        ptr = Number(wasmExports.jsrust_wasm_alloc(bytes.length));
    } catch (error) {
        return {
            ok: false,
            code: "backend_wasm_alloc_failed",
            message: `backend wasm allocation trap: ${errorMessage(error)}`,
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

function ensureCodegenWasmExports(
    wasmExports: BackendWasmExports,
): { ok: true } | { ok: false; code: string; message: string } {
    for (const exportName of CODEGEN_WASM_EXPORTS) {
        if (!(exportName in wasmExports)) {
            return {
                ok: false,
                code: "backend_wasm_load_failed",
                message: `backend wasm missing codegen export: ${exportName}`,
            };
        }
    }
    return { ok: true };
}

function rebuildBackendWasm():
    | { ok: true }
    | {
          ok: false;
          code: string;
          message: string;
          stdout: string;
          stderr: string;
      } {
    const buildCheck = canBuildBackend();
    if (!buildCheck.ok) {
        return {
            ok: false,
            code: "backend_build_unavailable",
            message: buildCheck.reason,
            stdout: "",
            stderr: "",
        };
    }
    const clangCheck = canCompileBackendWasm();
    if (!clangCheck.ok) {
        return {
            ok: false,
            code: "backend_build_unavailable",
            message: clangCheck.reason,
            stdout: "",
            stderr: "",
        };
    }
    const build = spawnSync("make", ["-C", BACKEND_DIR, "wasm"], {
        encoding: "utf8",
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
    wasmRuntime = undefined;
    return { ok: true };
}

function runGeneratedWasmBytes(generatedWasmBytes: Uint8Array):
    | {
          ok: true;
          stdoutBytes: Uint8Array;
          hasExitValue: boolean;
          exitValue: number;
      }
    | { ok: false; code: string; message: string } {
    const stdout: number[] = [];
    let generatedMemory: WebAssembly.Memory;

    function pushAscii(value: number): void {
        stdout.push(value & BYTE_MASK);
    }
    function pushText(text: string): void {
        const encoded = textEncoder.encode(text);
        for (const value of encoded) {
            pushAscii(value);
        }
    }
    function readCString(value: number): boolean {
        if (!(generatedMemory instanceof WebAssembly.Memory)) {
            return false;
        }
        const bytes = new Uint8Array(generatedMemory.buffer);
        let ptr = value >>> 0;
        while (ptr < bytes.length) {
            const b = bytes[ptr];
            if (b === 0) {
                return true;
            }
            stdout.push(b);
            ptr += 1;
        }
        return false;
    }
    const imports = {
        env: {
            jsrust_write_byte(value: number): number {
                stdout.push(value & BYTE_MASK);
                return 1;
            },
            jsrust_flush(): number {
                return 1;
            },
            jsrust_write_cstr(ptr: number): number {
                return readCString(ptr) ? 1 : 0;
            },
            jsrust_write_i64(value: bigint | number): number {
                pushText(toBigInt(value).toString());
                return 1;
            },
            jsrust_write_f64(value: number): number {
                const text = Number.isInteger(value)
                    ? value.toFixed(1)
                    : String(value);
                pushText(text);
                return 1;
            },
            jsrust_write_bool(value: number): number {
                pushText(value ? "true" : "false");
                return 1;
            },
            jsrust_write_char(value: bigint | number): number {
                const codePoint = Number(toBigInt(value));
                if (
                    !Number.isInteger(codePoint) ||
                    codePoint < 0 ||
                    codePoint > MAX_UNICODE_CODE_POINT
                ) {
                    return 0;
                }
                if (
                    codePoint >= SURROGATE_PAIR_START &&
                    codePoint <= SURROGATE_PAIR_END
                ) {
                    return 0;
                }
                pushText(String.fromCodePoint(codePoint));
                return 1;
            },
        },
    };
    let instance;
    try {
        const moduleInput = new Uint8Array(generatedWasmBytes.length);
        moduleInput.set(generatedWasmBytes);
        const module = new WebAssembly.Module(moduleInput);
        instance = new WebAssembly.Instance(module, imports);
        if (instance.exports.memory instanceof WebAssembly.Memory) {
            generatedMemory = instance.exports.memory;
        }
    } catch (error) {
        return {
            ok: false,
            code: "generated_wasm_load_failed",
            message: `failed to instantiate generated wasm: ${errorMessage(error)}`,
        };
    }
    const mainExport = instance.exports.main;
    if (typeof mainExport !== "function") {
        return {
            ok: false,
            code: "generated_wasm_run_failed",
            message: "generated wasm missing exported function: main",
        };
    }
    let exitValueRaw: unknown;
    try {
        exitValueRaw = mainExport();
    } catch (error) {
        return {
            ok: false,
            code: "generated_wasm_run_failed",
            message: `generated wasm trapped while running main: ${errorMessage(error)}`,
        };
    }
    const hasExitValue = exitValueRaw !== undefined;
    const exitValue = hasExitValue ? Number(exitValueRaw) : 0;
    return {
        ok: true,
        stdoutBytes: Uint8Array.from(stdout),
        hasExitValue,
        exitValue,
    };
}

interface RunBackendWasmOptions {
    entry?: string;
    trace?: boolean;
    backendWasm?: string;
    buildIfMissing?: boolean;
}

type RunBackendWasmResult =
    | {
          ok: true;
          code: "ok";
          stdout: string;
          stdoutBytes: Uint8Array;
          traceBytes: Uint8Array;
          message: string;
          label: string;
          backendCode: number;
          hasExitValue: boolean;
          exitValue: number;
          exitCode: 0;
          wasmPath: string;
          built: boolean;
      }
    | {
          ok: false;
          code: string;
          message: string;
          label: string;
          backendCode: number;
          stdout: string;
          stdoutBytes: Uint8Array;
          traceBytes: Uint8Array;
          stderr: string;
          exitCode: number | undefined;
          wasmPath?: string;
          built?: boolean;
      };

interface PreparedBackendContext {
    wasmPath: string;
    built: boolean;
    source: "cli" | "env" | "default";
    exports: BackendWasmExports;
    memory: WebAssembly.Memory;
}

interface BackendOutcomeContext {
    wasmPath?: string;
    built?: boolean;
}

function createBackendFailure(
    details: BackendOutcomeContext & {
        code: string;
        message: string;
        label?: string;
        backendCode?: number;
        stdout?: string;
        stdoutBytes?: Uint8Array;
        traceBytes?: Uint8Array;
        exitCode?: number;
    },
): RunBackendWasmResult {
    const {
        label: inputLabel,
        message,
        code,
        backendCode,
        stdout,
        stdoutBytes,
        traceBytes,
        exitCode,
        wasmPath,
        built,
    } = details;
    const label = inputLabel ?? "internal-error";
    return {
        ok: false,
        code,
        message,
        label,
        backendCode: backendCode ?? BACKEND_CODE.INTERNAL_ERROR,
        stdout: stdout ?? "",
        stdoutBytes: stdoutBytes ?? emptyBytes(),
        traceBytes: traceBytes ?? emptyBytes(),
        stderr: `error[${label}]: ${message}`,
        exitCode,
        wasmPath,
        built,
    };
}

function prepareBackendContext(
    options: RunBackendWasmOptions,
): PreparedBackendContext | RunBackendWasmResult {
    const ensured = ensureBackendWasm({
        backendWasm: options.backendWasm,
        buildIfMissing: options.buildIfMissing,
    });
    if (!ensured.ok) {
        return createBackendFailure({
            code: ensured.code,
            message: ensured.message,
        });
    }
    const loaded = loadBackendWasm({ path: ensured.path });
    if (!loaded.ok) {
        return createBackendFailure({
            code: loaded.code,
            message: loaded.message,
            wasmPath: ensured.path,
            built: ensured.built,
        });
    }
    return {
        wasmPath: ensured.path,
        built: ensured.built,
        source: ensured.source,
        exports: loaded.exports,
        memory: loaded.memory,
    };
}

function resetBackendWasm(
    context: BackendOutcomeContext,
    wasmExports: BackendWasmExports,
): RunBackendWasmResult | undefined {
    try {
        wasmExports.jsrust_wasm_reset();
        return undefined;
    } catch (error) {
        return createBackendFailure({
            code: "backend_wasm_run_failed",
            message: `backend wasm reset trap: ${errorMessage(error)}`,
            wasmPath: context.wasmPath,
            built: context.built,
        });
    }
}

function allocBackendInput(
    context: BackendOutcomeContext,
    wasmExports: BackendWasmExports,
    memory: WebAssembly.Memory,
    bytes: Uint8Array,
): { ptr: number } | RunBackendWasmResult {
    const allocation = allocAndWrite(wasmExports, memory, bytes);
    if (allocation.ok) {
        return { ptr: allocation.ptr };
    }
    return createBackendFailure({
        code: allocation.code,
        message: allocation.message,
        wasmPath: context.wasmPath,
        built: context.built,
    });
}

function readDecodedWasmOutput(
    memory: WebAssembly.Memory,
    ptr: number,
    len: number,
): { bytes: Uint8Array; text: string } {
    const bytes = readWasmBytes(memory, ptr, len);
    return {
        bytes,
        text: bytes.length > 0 ? textDecoder.decode(bytes) : "",
    };
}

function readBackendRunResult(
    context: BackendOutcomeContext,
    wasmExports: BackendWasmExports,
    memory: WebAssembly.Memory,
): RunBackendWasmResult {
    const backendCode = Number(wasmExports.jsrust_wasm_result_code());
    const label = BACKEND_ERROR_LABELS.get(backendCode) ?? "unknown-error";
    const messageOutput = readDecodedWasmOutput(
        memory,
        Number(wasmExports.jsrust_wasm_result_message_ptr()),
        Number(wasmExports.jsrust_wasm_result_message_len()),
    );
    const stdoutOutput = readDecodedWasmOutput(
        memory,
        Number(wasmExports.jsrust_wasm_stdout_ptr()),
        Number(wasmExports.jsrust_wasm_stdout_len()),
    );
    const traceBytes = readWasmBytes(
        memory,
        Number(wasmExports.jsrust_wasm_trace_ptr()),
        Number(wasmExports.jsrust_wasm_trace_len()),
    );
    const message = messageOutput.text || label;
    if (backendCode !== 0) {
        return createBackendFailure({
            code: "backend_run_failed",
            message,
            label,
            backendCode,
            stdout: stdoutOutput.text,
            stdoutBytes: stdoutOutput.bytes,
            traceBytes,
            exitCode: backendCode,
            wasmPath: context.wasmPath,
            built: context.built,
        });
    }
    return {
        ok: true,
        code: "ok",
        stdout: stdoutOutput.text,
        stdoutBytes: stdoutOutput.bytes,
        traceBytes,
        message,
        label,
        backendCode,
        hasExitValue: Number(wasmExports.jsrust_wasm_result_has_exit_value()) !== 0,
        exitValue: Number(wasmExports.jsrust_wasm_result_exit_value()),
        exitCode: 0,
        wasmPath: context.wasmPath ?? "",
        built: context.built ?? false,
    };
}

function loadCodegenBackendContext(
    options: RunBackendWasmOptions,
): PreparedBackendContext | RunBackendWasmResult {
    const prepared = prepareBackendContext(options);
    if ("ok" in prepared) {
        return prepared;
    }
    let context = prepared;
    let codegenExportCheck = ensureCodegenWasmExports(context.exports);
    if (!codegenExportCheck.ok && context.source === "default") {
        const rebuild = rebuildBackendWasm();
        if (rebuild.ok) {
            const reloaded = loadBackendWasm({ path: context.wasmPath });
            if (reloaded.ok) {
                const reloadedCheck = ensureCodegenWasmExports(reloaded.exports);
                if (reloadedCheck.ok) {
                    context = {
                        wasmPath: context.wasmPath,
                        built: context.built,
                        source: context.source,
                        exports: reloaded.exports,
                        memory: reloaded.memory,
                    };
                    codegenExportCheck = reloadedCheck;
                }
            }
        }
    }
    if (!codegenExportCheck.ok) {
        return createBackendFailure({
            code: codegenExportCheck.code,
            message: codegenExportCheck.message,
            wasmPath: context.wasmPath,
            built: context.built,
        });
    }
    return context;
}

function runBackendCodegen(
    context: PreparedBackendContext,
    moduleBytes: Uint8Array,
    entryBytes: Uint8Array,
): Uint8Array | RunBackendWasmResult {
    const wasmExports = context.exports;
    const { memory } = context;
    const inputAlloc = allocBackendInput(
        context,
        wasmExports,
        memory,
        moduleBytes,
    );
    if ("ok" in inputAlloc) return inputAlloc;
    const entryAlloc = allocBackendInput(context, wasmExports, memory, entryBytes);
    if ("ok" in entryAlloc) return entryAlloc;
    if (!hasCodegenWasmExport(wasmExports)) {
        return createBackendFailure({
            code: "backend_wasm_load_failed",
            message: "backend wasm codegen exports are unavailable",
            wasmPath: context.wasmPath,
            built: context.built,
        });
    }
    try {
        wasmExports.jsrust_wasm_codegen(
            inputAlloc.ptr,
            moduleBytes.length,
            entryAlloc.ptr,
            entryBytes.length,
        );
    } catch (error) {
        return createBackendFailure({
            code: "backend_wasm_run_failed",
            message: `backend wasm codegen trap: ${errorMessage(error)}`,
            wasmPath: context.wasmPath,
            built: context.built,
        });
    }
    return readWasmBytes(
        memory,
        Number(wasmExports.jsrust_wasm_codegen_wasm_ptr()),
        Number(wasmExports.jsrust_wasm_codegen_wasm_len()),
    );
}

function readBackendCodegenMessage(
    wasmExports: BackendWasmExports,
    memory: WebAssembly.Memory,
): { backendCode: number; label: string; message: string } {
    const backendCode = Number(wasmExports.jsrust_wasm_result_code());
    const label = BACKEND_ERROR_LABELS.get(backendCode) ?? "unknown-error";
    const messageOutput = readDecodedWasmOutput(
        memory,
        Number(wasmExports.jsrust_wasm_result_message_ptr()),
        Number(wasmExports.jsrust_wasm_result_message_len()),
    );
    return {
        backendCode,
        label,
        message: messageOutput.text || label,
    };
}

function runBackendWasm(
    moduleBytes: Uint8Array,
    options: RunBackendWasmOptions = {},
): RunBackendWasmResult {
    const prepared = prepareBackendContext(options);
    if ("ok" in prepared) {
        return prepared;
    }
    const wasmExports = prepared.exports;
    const { memory } = prepared;
    const entryBytes = textEncoder.encode(options.entry ?? "main");
    const resetFailure = resetBackendWasm(prepared, wasmExports);
    if (resetFailure) return resetFailure;
    const inputAlloc = allocBackendInput(
        prepared,
        wasmExports,
        memory,
        moduleBytes,
    );
    if ("ok" in inputAlloc) return inputAlloc;
    const entryAlloc = allocBackendInput(prepared, wasmExports, memory, entryBytes);
    if ("ok" in entryAlloc) return entryAlloc;
    try {
        wasmExports.jsrust_wasm_run(
            inputAlloc.ptr,
            moduleBytes.length,
            entryAlloc.ptr,
            entryBytes.length,
            options.trace ? 1 : 0,
        );
    } catch (error) {
        return createBackendFailure({
            code: "backend_wasm_run_failed",
            message: `backend wasm run trap: ${errorMessage(error)}`,
            wasmPath: prepared.wasmPath,
            built: prepared.built,
        });
    }
    return readBackendRunResult(prepared, wasmExports, memory);
}

/**
 * Compile binary IR to generated wasm bytes using backend codegen, then execute
 * the generated wasm in-memory through host imports.
 */
function runBackendCodegenWasm(
    moduleBytes: Uint8Array,
    options: RunBackendWasmOptions = {},
): RunBackendWasmResult {
    const prepared = loadCodegenBackendContext(options);
    if ("ok" in prepared) {
        return prepared;
    }
    const wasmExports = prepared.exports;
    const { memory } = prepared;
    const entryBytes = textEncoder.encode(options.entry ?? "main");
    const resetFailure = resetBackendWasm(prepared, wasmExports);
    if (resetFailure) return resetFailure;
    const generatedWasmBytes = runBackendCodegen(prepared, moduleBytes, entryBytes);
    if ("ok" in generatedWasmBytes) return generatedWasmBytes;
    const { backendCode, label, message } = readBackendCodegenMessage(
        wasmExports,
        memory,
    );
    if (backendCode !== 0) {
        return createBackendFailure({
            code: "backend_codegen_failed",
            message,
            label,
            backendCode,
            exitCode: backendCode,
            wasmPath: prepared.wasmPath,
            built: prepared.built,
        });
    }
    if (generatedWasmBytes.length === 0) {
        return createBackendFailure({
            code: "backend_codegen_failed",
            message: "backend wasm codegen returned empty wasm output",
            wasmPath: prepared.wasmPath,
            built: prepared.built,
        });
    }
    const generatedRun = runGeneratedWasmBytes(generatedWasmBytes);
    if (!generatedRun.ok) {
        return createBackendFailure({
            code: generatedRun.code,
            message: generatedRun.message,
            label: "execute-error",
            backendCode: BACKEND_CODE.EXECUTE_ERROR,
            exitCode: BACKEND_CODE.EXECUTE_ERROR,
            wasmPath: prepared.wasmPath,
            built: prepared.built,
        });
    }
    const { stdoutBytes } = generatedRun;
    const stdout =
        stdoutBytes.length > 0 ? textDecoder.decode(stdoutBytes) : "";
    return {
        ok: true,
        code: "ok",
        stdout,
        stdoutBytes,
        traceBytes: new Uint8Array(),
        message: "ok",
        label: "ok",
        backendCode: 0,
        hasExitValue: generatedRun.hasExitValue,
        exitValue: generatedRun.exitValue,
        exitCode: 0,
        wasmPath: prepared.wasmPath,
        built: prepared.built,
    };
}

function canRunBackendIntegrationTests():
    | { ok: true }
    | { ok: false; reason: string } {
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
    runBackendCodegenWasm,
    canRunBackendIntegrationTests,
};
