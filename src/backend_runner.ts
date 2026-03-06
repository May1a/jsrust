import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Result, TaggedError } from "better-result";
import { match } from "ts-pattern";

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
const taggedError = TaggedError;

const BackendWasmLoadErrorBase = taggedError("BackendWasmLoadError")<{
    code: string;
    message: string;
    cause?: unknown;
}>();

class BackendWasmLoadError extends BackendWasmLoadErrorBase {}

const BackendWasmRuntimeErrorBase = taggedError("BackendWasmRuntimeError")<{
    code: string;
    message: string;
    cause?: unknown;
}>();

class BackendWasmRuntimeError extends BackendWasmRuntimeErrorBase {}

const BackendBuildErrorBase = taggedError("BackendBuildError")<{
    code: string;
    message: string;
    stdout?: string;
    stderr?: string;
}>();

class BackendBuildError extends BackendBuildErrorBase {}

const BackendWasmRunErrorBase = taggedError("BackendWasmRunError")<{
    code: string;
    message: string;
    label?: string;
    backendCode?: number;
    stdout?: string;
    stdoutBytes?: Uint8Array;
    traceBytes?: Uint8Array;
    exitCode?: number;
    wasmPath?: string;
    built?: boolean;
}>();

class BackendWasmRunError extends BackendWasmRunErrorBase {}

/**
 * Convert bigint | number to bigint
 */
function toBigInt(value: bigint | number): bigint {
    if (typeof value === "bigint") {
        return value;
    }
    return BigInt(value);
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
 * @returns {Result<void, BackendBuildError>}
 */
function canBuildBackend(): Result<void, BackendBuildError> {
    const makefilePath = path.join(BACKEND_DIR, "Makefile");
    if (!fileExists(makefilePath)) {
        return Result.err(
            new BackendBuildError({
                code: "backend_makefile_missing",
                message: `missing backend Makefile at ${makefilePath}`,
            }),
        );
    }

    const probe = spawnSync("make", ["--version"], { encoding: "utf8" });
    if (probe.error) {
        return Result.err(
            new BackendBuildError({
                code: "make_not_available",
                message: `make not available: ${probe.error.message}`,
            }),
        );
    }
    if ((probe.status ?? 1) !== 0) {
        return Result.err(
            new BackendBuildError({
                code: "make_probe_failed",
                message: "make command probe returned non-zero",
            }),
        );
    }

    return Result.ok(undefined);
}

/**
 * @returns {Result<void, BackendBuildError>}
 */
function canCompileBackendWasm(): Result<void, BackendBuildError> {
    const probe = spawnSync("clang", ["--print-targets"], {
        encoding: "utf8",
    });
    if (probe.error) {
        return Result.err(
            new BackendBuildError({
                code: "clang_not_available",
                message: `clang not available: ${probe.error.message}`,
            }),
        );
    }
    if ((probe.status ?? 1) !== 0) {
        return Result.err(
            new BackendBuildError({
                code: "clang_probe_failed",
                message: "clang target probe returned non-zero",
            }),
        );
    }
    if (!probe.stdout.includes("wasm32")) {
        return Result.err(
            new BackendBuildError({
                code: "clang_wasm32_unavailable",
                message: "clang wasm32 target is unavailable",
            }),
        );
    }

    return Result.ok(undefined);
}

interface ResolveBackendWasmOptions {
    backendWasm?: string;
    cwd?: string;
}

type ResolveBackendWasmResult = Result<
    { path: string; source: "cli" | "env" | "default" },
    BackendWasmLoadError
>;

function resolveBackendWasm(
    options: ResolveBackendWasmOptions = {},
): ResolveBackendWasmResult {
    const cwd = options.cwd ?? process.cwd();
    if (options.backendWasm) {
        return Result.ok({
            path: path.resolve(cwd, options.backendWasm),
            source: "cli",
        });
    }

    if (process.env.JSRUST_BACKEND_WASM) {
        return Result.ok({
            path: path.resolve(cwd, process.env.JSRUST_BACKEND_WASM),
            source: "env",
        });
    }
    return Result.ok({
        path: DEFAULT_BACKEND_WASM,
        source: "default",
    });
}

interface EnsureBackendWasmOptions {
    backendWasm?: string;
    buildIfMissing?: boolean;
}

type EnsureBackendWasmResult = Result<
    {
        path: string;
        source: "cli" | "env" | "default";
        built: boolean;
    },
    BackendBuildError | BackendWasmLoadError
>;

function ensureBackendWasm(
    options: EnsureBackendWasmOptions = {},
): EnsureBackendWasmResult {
    const resolved = resolveBackendWasm({
        backendWasm: options.backendWasm,
    });
    if (resolved.isErr()) return resolved;
    if (fileExists(resolved.value.path)) {
        return Result.ok({
            path: resolved.value.path,
            source: resolved.value.source,
            built: false,
        });
    }
    if (resolved.value.source !== "default") {
        return Result.err(
            new BackendBuildError({
                code: "backend_wasm_missing",
                message: `backend wasm not found: ${resolved.value.path}`,
            }),
        );
    }
    if (options.buildIfMissing === false) {
        return Result.err(
            new BackendBuildError({
                code: "backend_wasm_missing",
                message: `backend wasm not found: ${resolved.value.path}`,
            }),
        );
    }
    const buildCheck = canBuildBackend();
    if (buildCheck.isErr()) {
        return buildCheck;
    }
    const clangCheck = canCompileBackendWasm();
    if (clangCheck.isErr()) {
        return clangCheck;
    }
    const build = spawnSync("make", ["-C", BACKEND_DIR, "wasm"], {
        encoding: "utf8",
    });
    if (build.error) {
        return Result.err(
            new BackendBuildError({
                code: "backend_build_failed",
                message: `failed to invoke backend wasm build: ${build.error.message}`,
                stdout: build.stdout || "",
                stderr: build.stderr || "",
            }),
        );
    }
    if ((build.status ?? 1) !== 0) {
        return Result.err(
            new BackendBuildError({
                code: "backend_build_failed",
                message: `backend wasm build failed with exit code ${build.status ?? 1}`,
                stdout: build.stdout || "",
                stderr: build.stderr || "",
            }),
        );
    }
    if (!fileExists(resolved.value.path)) {
        return Result.err(
            new BackendBuildError({
                code: "backend_wasm_missing",
                message: `backend wasm not found after build: ${resolved.value.path}`,
            }),
        );
    }
    return Result.ok({
        path: resolved.value.path,
        source: resolved.value.source,
        built: true,
    });
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

function emptyBytes(): Uint8Array {
    return new Uint8Array();
}

function booleanFlag(value: boolean | undefined): number {
    return match(value).with(true, () => 1).otherwise(() => 0);
}

function getNumberExport(
    exports: WebAssembly.Exports,
    name: string,
): Result<(args?: number[]) => number, BackendWasmLoadError> {
    const value = exports[name];
    if (!isFunction(value)) {
        return Result.err(
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message: `backend wasm missing or invalid export: ${name}`,
            }),
        );
    }

    return Result.ok((args = []) => Number(value(...args)));
}

function getVoidExport(
    exports: WebAssembly.Exports,
    name: string,
): Result<(args?: number[]) => void, BackendWasmLoadError> {
    const value = exports[name];
    if (!isFunction(value)) {
        return Result.err(
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message: `backend wasm missing or invalid export: ${name}`,
            }),
        );
    }

    return Result.ok((args = []) => {
        value(...args);
    });
}

function getOptionalNumberExport(
    exports: WebAssembly.Exports,
    name: string,
): Result<((args?: number[]) => number) | undefined, BackendWasmLoadError> {
    if (!(name in exports)) {
        return Result.ok(undefined);
    }

    const value = exports[name];
    if (!isFunction(value)) {
        return Result.err(
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message: `backend wasm missing or invalid export: ${name}`,
            }),
        );
    }

    return Result.ok((args = []) => Number(value(...args)));
}

interface RequiredBackendNumberExports {
    alloc: (args?: number[]) => number;
    run: (args?: number[]) => number;
    resultCode: (args?: number[]) => number;
    hasExitValue: (args?: number[]) => number;
    exitValue: (args?: number[]) => number;
    messagePtr: (args?: number[]) => number;
    messageLen: (args?: number[]) => number;
    stdoutPtr: (args?: number[]) => number;
    stdoutLen: (args?: number[]) => number;
    tracePtr: (args?: number[]) => number;
    traceLen: (args?: number[]) => number;
}

interface OptionalCodegenNumberExports {
    codegen?: (args?: number[]) => number;
    codegenWasmPtr?: (args?: number[]) => number;
    codegenWasmLen?: (args?: number[]) => number;
}

function loadRequiredBackendNumberExports(
    exports: WebAssembly.Exports,
): Result<RequiredBackendNumberExports, BackendWasmLoadError> {
    return Result.gen(function* loadRequiredBackendExports() {
        const alloc = yield* getNumberExport(exports, "jsrust_wasm_alloc");
        const run = yield* getNumberExport(exports, "jsrust_wasm_run");
        const resultCode = yield* getNumberExport(
            exports,
            "jsrust_wasm_result_code",
        );
        const hasExitValue = yield* getNumberExport(
            exports,
            "jsrust_wasm_result_has_exit_value",
        );
        const exitValue = yield* getNumberExport(
            exports,
            "jsrust_wasm_result_exit_value",
        );
        const messagePtr = yield* getNumberExport(
            exports,
            "jsrust_wasm_result_message_ptr",
        );
        const messageLen = yield* getNumberExport(
            exports,
            "jsrust_wasm_result_message_len",
        );
        const stdoutPtr = yield* getNumberExport(
            exports,
            "jsrust_wasm_stdout_ptr",
        );
        const stdoutLen = yield* getNumberExport(
            exports,
            "jsrust_wasm_stdout_len",
        );
        const tracePtr = yield* getNumberExport(
            exports,
            "jsrust_wasm_trace_ptr",
        );
        const traceLen = yield* getNumberExport(
            exports,
            "jsrust_wasm_trace_len",
        );
        return Result.ok({
            alloc,
            run,
            resultCode,
            hasExitValue,
            exitValue,
            messagePtr,
            messageLen,
            stdoutPtr,
            stdoutLen,
            tracePtr,
            traceLen,
        });
    });
}

function loadOptionalCodegenNumberExports(
    exports: WebAssembly.Exports,
): Result<OptionalCodegenNumberExports, BackendWasmLoadError> {
    return Result.gen(function* loadOptionalCodegenExports() {
        const codegen = yield* getOptionalNumberExport(
            exports,
            "jsrust_wasm_codegen",
        );
        const codegenWasmPtr = yield* getOptionalNumberExport(
            exports,
            "jsrust_wasm_codegen_wasm_ptr",
        );
        const codegenWasmLen = yield* getOptionalNumberExport(
            exports,
            "jsrust_wasm_codegen_wasm_len",
        );
        return Result.ok({
            codegen,
            codegenWasmPtr,
            codegenWasmLen,
        });
    });
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
): Result<Uint8Array, BackendWasmLoadError> {
    return Result.try({
        try: () => fs.readFileSync(filePath),
        catch: (cause) =>
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message: `failed to read backend wasm: ${errorMessage(cause)}`,
                cause,
            }),
    });
}

function instantiateBackendWasm(
    bytes: Uint8Array,
): Result<WebAssembly.Instance, BackendWasmLoadError> {
    return Result.try({
        try: () => {
            const source = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(source).set(bytes);
            const module = new WebAssembly.Module(source);
            return new WebAssembly.Instance(module, {});
        },
        catch: (cause) =>
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message: `failed to instantiate backend wasm: ${errorMessage(cause)}`,
                cause,
            }),
    });
}

function validateBackendWasmExports(
    exports: WebAssembly.Exports,
): Result<{ memory: WebAssembly.Memory }, BackendWasmLoadError> {
    if (!(exports.memory instanceof WebAssembly.Memory)) {
        return Result.err(
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message:
                    "backend wasm export 'memory' is not a WebAssembly.Memory",
            }),
        );
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
            return Result.err(
                new BackendWasmLoadError({
                    code: "backend_wasm_load_failed",
                    message: `backend wasm missing or invalid export: ${fnName}`,
                }),
            );
        }
    }
    for (const fnName of CODEGEN_WASM_EXPORTS) {
        if (fnName in exports && !isFunction(exports[fnName])) {
            return Result.err(
                new BackendWasmLoadError({
                    code: "backend_wasm_load_failed",
                    message: `backend wasm has invalid codegen export: ${fnName}`,
                }),
            );
        }
    }
    return Result.ok({ memory: exports.memory });
}

function createBackendWasmExports(
    exports: WebAssembly.Exports,
    memory: WebAssembly.Memory,
): Result<BackendWasmExports, BackendWasmLoadError> {
    const reset = getVoidExport(exports, "jsrust_wasm_reset");
    if (reset.isErr()) {
        return reset;
    }

    const requiredExports = loadRequiredBackendNumberExports(exports);
    if (requiredExports.isErr()) {
        return requiredExports;
    }

    const optionalExports = loadOptionalCodegenNumberExports(exports);
    if (optionalExports.isErr()) {
        return optionalExports;
    }

    const required = requiredExports.value;
    const optional = optionalExports.value;
    const codegenExport = optional.codegen;
    const codegenWasmPtrExport = optional.codegenWasmPtr;
    const codegenWasmLenExport = optional.codegenWasmLen;
    let jsrustWasmCodegen: BackendWasmExports["jsrust_wasm_codegen"];
    if (codegenExport) {
        jsrustWasmCodegen = (
            inputPtr: number,
            inputLen: number,
            entryPtr: number,
            entryLen: number,
        ) => codegenExport([inputPtr, inputLen, entryPtr, entryLen]);
    }
    let jsrustWasmCodegenWasmPtr: BackendWasmExports["jsrust_wasm_codegen_wasm_ptr"];
    if (codegenWasmPtrExport) {
        jsrustWasmCodegenWasmPtr = () => codegenWasmPtrExport();
    }
    let jsrustWasmCodegenWasmLen: BackendWasmExports["jsrust_wasm_codegen_wasm_len"];
    if (codegenWasmLenExport) {
        jsrustWasmCodegenWasmLen = () => codegenWasmLenExport();
    }

    return Result.ok({
        memory,
        jsrust_wasm_alloc: (size: number) => required.alloc([size]),
        jsrust_wasm_reset: () => reset.value(),
        jsrust_wasm_run: (
            inputPtr: number,
            inputLen: number,
            entryPtr: number,
            entryLen: number,
            traceEnabled: number,
        ) =>
            required.run([
                inputPtr,
                inputLen,
                entryPtr,
                entryLen,
                traceEnabled,
            ]),
        jsrust_wasm_result_code: () => required.resultCode(),
        jsrust_wasm_result_has_exit_value: () => required.hasExitValue(),
        jsrust_wasm_result_exit_value: () => required.exitValue(),
        jsrust_wasm_result_message_ptr: () => required.messagePtr(),
        jsrust_wasm_result_message_len: () => required.messageLen(),
        jsrust_wasm_stdout_ptr: () => required.stdoutPtr(),
        jsrust_wasm_stdout_len: () => required.stdoutLen(),
        jsrust_wasm_trace_ptr: () => required.tracePtr(),
        jsrust_wasm_trace_len: () => required.traceLen(),
        jsrust_wasm_codegen: jsrustWasmCodegen,
        jsrust_wasm_codegen_wasm_ptr: jsrustWasmCodegenWasmPtr,
        jsrust_wasm_codegen_wasm_len: jsrustWasmCodegenWasmLen,
    });
}

function loadBackendWasm(options: { path: string }): Result<
    {
        path: string;
        exports: BackendWasmExports;
        memory: WebAssembly.Memory;
    },
    BackendWasmLoadError
> {
    if (wasmRuntime && wasmRuntime.path === options.path) {
        return Result.ok({
            path: wasmRuntime.path,
            exports: wasmRuntime.exports,
            memory: wasmRuntime.memory,
        });
    }
    const bytes = readBackendWasmFile(options.path);
    if (bytes.isErr()) {
        return bytes;
    }

    const instance = instantiateBackendWasm(bytes.value);
    if (instance.isErr()) {
        return instance;
    }

    const { exports } = instance.value;
    const validation = validateBackendWasmExports(exports);
    if (validation.isErr()) {
        return validation;
    }
    const wasmExports = createBackendWasmExports(
        exports,
        validation.value.memory,
    );
    if (wasmExports.isErr()) {
        return wasmExports;
    }

    wasmRuntime = {
        path: options.path,
        exports: wasmExports.value,
        memory: validation.value.memory,
    };
    return Result.ok({
        path: options.path,
        exports: wasmExports.value,
        memory: validation.value.memory,
    });
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
): Result<{ ptr: number }, BackendWasmRuntimeError> {
    if (bytes.length === 0) {
        return Result.ok({ ptr: 0 });
    }

    const ptrResult = Result.try({
        try: () => Number(wasmExports.jsrust_wasm_alloc(bytes.length)),
        catch: (cause) =>
            new BackendWasmRuntimeError({
                code: "backend_wasm_alloc_failed",
                message: `backend wasm allocation trap: ${errorMessage(cause)}`,
                cause,
            }),
    });

    if (ptrResult.isErr()) {
        return ptrResult;
    }

    const ptr = ptrResult.value;

    if (!ptr) {
        return Result.err(
            new BackendWasmRuntimeError({
                code: "backend_wasm_alloc_failed",
                message: "backend wasm allocation failed",
            }),
        );
    }

    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
    return Result.ok({ ptr });
}

function ensureCodegenWasmExports(
    wasmExports: BackendWasmExports,
): Result<void, BackendWasmLoadError> {
    if (!hasCodegenWasmExport(wasmExports)) {
        return Result.err(
            new BackendWasmLoadError({
                code: "backend_wasm_load_failed",
                message: "backend wasm missing one or more codegen exports",
            }),
        );
    }

    return Result.ok(undefined);
}

function rebuildBackendWasm(): Result<void, BackendBuildError> {
    const buildCheck = canBuildBackend();
    if (buildCheck.isErr()) {
        return buildCheck;
    }
    const clangCheck = canCompileBackendWasm();
    if (clangCheck.isErr()) {
        return clangCheck;
    }
    const build = spawnSync("make", ["-C", BACKEND_DIR, "wasm"], {
        encoding: "utf8",
    });
    if (build.error) {
        return Result.err(
            new BackendBuildError({
                code: "backend_build_failed",
                message: `failed to invoke backend wasm build: ${build.error.message}`,
                stdout: build.stdout || "",
                stderr: build.stderr || "",
            }),
        );
    }
    if ((build.status ?? 1) !== 0) {
        return Result.err(
            new BackendBuildError({
                code: "backend_build_failed",
                message: `backend wasm build failed with exit code ${build.status ?? 1}`,
                stdout: build.stdout || "",
                stderr: build.stderr || "",
            }),
        );
    }
    wasmRuntime = undefined;
    return Result.ok(undefined);
}

function runGeneratedWasmBytes(generatedWasmBytes: Uint8Array): Result<
    {
        stdoutBytes: Uint8Array;
        hasExitValue: boolean;
        exitValue: number;
    },
    BackendWasmLoadError
> {
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
                if (readCString(ptr)) {
                    return 1;
                }
                return 0;
            },
            jsrust_write_i64(value: bigint | number): number {
                pushText(toBigInt(value).toString());
                return 1;
            },
            jsrust_write_f64(value: number): number {
                let text = String(value);
                if (Number.isInteger(value)) {
                    text = value.toFixed(1);
                }
                pushText(text);
                return 1;
            },
            jsrust_write_bool(value: number): number {
                let text = "false";
                if (value !== 0) {
                    text = "true";
                }
                pushText(text);
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
    const instanceResult = Result.try({
        try: () => {
            const moduleInput = new Uint8Array(generatedWasmBytes.length);
            moduleInput.set(generatedWasmBytes);
            const module = new WebAssembly.Module(moduleInput);
            const instance = new WebAssembly.Instance(module, imports);
            if (instance.exports.memory instanceof WebAssembly.Memory) {
                generatedMemory = instance.exports.memory;
            }
            return instance;
        },
        catch: (cause) =>
            new BackendWasmLoadError({
                code: "generated_wasm_load_failed",
                message: `failed to instantiate generated wasm: ${errorMessage(cause)}`,
            }),
    });

    if (instanceResult.isErr()) {
        return instanceResult;
    }

    const instance = instanceResult.value;
    const mainExport = instance.exports.main;

    if (typeof mainExport !== "function") {
        return Result.err(
            new BackendWasmLoadError({
                code: "generated_wasm_run_failed",
                message: "generated wasm missing exported function: main",
            }),
        );
    }

    const exitValueResult = Result.try({
        try: () => mainExport() as unknown,
        catch: (cause) =>
            new BackendWasmLoadError({
                code: "generated_wasm_run_failed",
                message: `generated wasm trapped while running main: ${errorMessage(cause)}`,
            }),
    });

    if (exitValueResult.isErr()) {
        return exitValueResult;
    }

    const exitValueRaw: unknown = exitValueResult.value;
    const hasExitValue = exitValueRaw !== undefined;
    let exitValue = 0;
    if (hasExitValue) {
        exitValue = Number(exitValueRaw);
    }

    return Result.ok({
        stdoutBytes: Uint8Array.from(stdout),
        hasExitValue,
        exitValue,
    });
}

interface RunBackendWasmOptions {
    entry?: string;
    trace?: boolean;
    backendWasm?: string;
    buildIfMissing?: boolean;
}

interface RunBackendWasmSuccess {
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

type RunBackendWasmResult = Result<RunBackendWasmSuccess, BackendWasmRunError>;

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

function createBackendRunError(
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
): BackendWasmRunError {
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
    return new BackendWasmRunError({
        code,
        message,
        label,
        backendCode: backendCode ?? BACKEND_CODE.INTERNAL_ERROR,
        stdout: stdout ?? "",
        stdoutBytes: stdoutBytes ?? emptyBytes(),
        traceBytes: traceBytes ?? emptyBytes(),
        exitCode,
        wasmPath,
        built,
    });
}

function prepareBackendContext(
    options: RunBackendWasmOptions,
): Result<PreparedBackendContext, BackendWasmRunError> {
    const ensured = ensureBackendWasm({
        backendWasm: options.backendWasm,
        buildIfMissing: options.buildIfMissing,
    });
    if (ensured.isErr()) {
        return Result.err(
            createBackendRunError({
                code: ensured.error.code,
                message: ensured.error.message,
            }),
        );
    }
    const loaded = loadBackendWasm({ path: ensured.value.path });
    if (loaded.isErr()) {
        return Result.err(
            createBackendRunError({
                code: loaded.error.code,
                message: loaded.error.message,
                wasmPath: ensured.value.path,
                built: ensured.value.built,
            }),
        );
    }
    return Result.ok({
        wasmPath: ensured.value.path,
        built: ensured.value.built,
        source: ensured.value.source,
        exports: loaded.value.exports,
        memory: loaded.value.memory,
    });
}

function resetBackendWasm(
    context: BackendOutcomeContext,
    wasmExports: BackendWasmExports,
): Result<void, BackendWasmRunError> {
    return Result.try({
        try: () => {
            wasmExports.jsrust_wasm_reset();
        },
        catch: (cause) =>
            createBackendRunError({
                code: "backend_wasm_run_failed",
                message: `backend wasm reset trap: ${errorMessage(cause)}`,
                wasmPath: context.wasmPath,
                built: context.built,
            }),
    });
}

function allocBackendInput(
    context: BackendOutcomeContext,
    wasmExports: BackendWasmExports,
    memory: WebAssembly.Memory,
    bytes: Uint8Array,
): Result<{ ptr: number }, BackendWasmRunError> {
    return allocAndWrite(wasmExports, memory, bytes).mapError((error) =>
        createBackendRunError({
            code: error.code,
            message: error.message,
            wasmPath: context.wasmPath,
            built: context.built,
        }),
    );
}

function readDecodedWasmOutput(
    memory: WebAssembly.Memory,
    ptr: number,
    len: number,
): { bytes: Uint8Array; text: string } {
    const bytes = readWasmBytes(memory, ptr, len);
    let text = "";
    if (bytes.length > 0) {
        text = textDecoder.decode(bytes);
    }
    return {
        bytes,
        text,
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
        return Result.err(
            createBackendRunError({
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
            }),
        );
    }
    return Result.ok({
        code: "ok",
        stdout: stdoutOutput.text,
        stdoutBytes: stdoutOutput.bytes,
        traceBytes,
        message,
        label,
        backendCode,
        hasExitValue:
            Number(wasmExports.jsrust_wasm_result_has_exit_value()) !== 0,
        exitValue: Number(wasmExports.jsrust_wasm_result_exit_value()),
        exitCode: 0,
        wasmPath: context.wasmPath ?? "",
        built: context.built ?? false,
    });
}

function loadCodegenBackendContext(
    options: RunBackendWasmOptions,
): Result<PreparedBackendContext, BackendWasmRunError> {
    const prepared = prepareBackendContext(options);
    if (prepared.isErr()) {
        return prepared;
    }
    let context = prepared.value;
    let codegenExportCheck = ensureCodegenWasmExports(context.exports);
    if (codegenExportCheck.isErr() && context.source === "default") {
        const rebuild = rebuildBackendWasm();
        if (rebuild.isOk()) {
            const reloaded = loadBackendWasm({ path: context.wasmPath });
            if (reloaded.isOk()) {
                const reloadedCheck = ensureCodegenWasmExports(
                    reloaded.value.exports,
                );
                if (reloadedCheck.isOk()) {
                    context = {
                        wasmPath: context.wasmPath,
                        built: context.built,
                        source: context.source,
                        exports: reloaded.value.exports,
                        memory: reloaded.value.memory,
                    };
                    codegenExportCheck = reloadedCheck;
                }
            }
        }
    }
    if (codegenExportCheck.isErr()) {
        return Result.err(
            createBackendRunError({
                code: codegenExportCheck.error.code,
                message: codegenExportCheck.error.message,
                wasmPath: context.wasmPath,
                built: context.built,
            }),
        );
    }
    return Result.ok(context);
}

function runBackendCodegen(
    context: PreparedBackendContext,
    moduleBytes: Uint8Array,
    entryBytes: Uint8Array,
): Result<Uint8Array, BackendWasmRunError> {
    const wasmExports = context.exports;
    const { memory } = context;
    const inputAlloc = allocBackendInput(
        context,
        wasmExports,
        memory,
        moduleBytes,
    );
    if (inputAlloc.isErr()) return inputAlloc;
    const entryAlloc = allocBackendInput(
        context,
        wasmExports,
        memory,
        entryBytes,
    );
    if (entryAlloc.isErr()) return entryAlloc;
    if (!hasCodegenWasmExport(wasmExports)) {
        return Result.err(
            createBackendRunError({
                code: "backend_wasm_load_failed",
                message: "backend wasm codegen exports are unavailable",
                wasmPath: context.wasmPath,
                built: context.built,
            }),
        );
    }

    const codegenResult = Result.try({
        try: () =>
            wasmExports.jsrust_wasm_codegen(
                inputAlloc.value.ptr,
                moduleBytes.length,
                entryAlloc.value.ptr,
                entryBytes.length,
            ),
        catch: (cause) =>
            createBackendRunError({
                code: "backend_wasm_run_failed",
                message: `backend wasm codegen trap: ${errorMessage(cause)}`,
                wasmPath: context.wasmPath,
                built: context.built,
            }),
    });

    if (codegenResult.isErr()) {
        return codegenResult;
    }

    return Result.ok(
        readWasmBytes(
            memory,
            Number(wasmExports.jsrust_wasm_codegen_wasm_ptr()),
            Number(wasmExports.jsrust_wasm_codegen_wasm_len()),
        ),
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
    if (prepared.isErr()) {
        return prepared;
    }
    const wasmExports = prepared.value.exports;
    const { memory } = prepared.value;
    const entryBytes = textEncoder.encode(options.entry ?? "main");
    const resetFailure = resetBackendWasm(prepared.value, wasmExports);
    if (resetFailure.isErr()) return resetFailure;
    const inputAlloc = allocBackendInput(
        prepared.value,
        wasmExports,
        memory,
        moduleBytes,
    );
    if (inputAlloc.isErr()) return inputAlloc;
    const entryAlloc = allocBackendInput(
        prepared.value,
        wasmExports,
        memory,
        entryBytes,
    );
    if (entryAlloc.isErr()) return entryAlloc;

    const runResult = Result.try({
        try: () =>
            wasmExports.jsrust_wasm_run(
                inputAlloc.value.ptr,
                moduleBytes.length,
                entryAlloc.value.ptr,
                entryBytes.length,
                booleanFlag(options.trace),
            ),
        catch: (cause) =>
            createBackendRunError({
                code: "backend_wasm_run_failed",
                message: `backend wasm run trap: ${errorMessage(cause)}`,
                wasmPath: prepared.value.wasmPath,
                built: prepared.value.built,
            }),
    });

    if (runResult.isErr()) {
        return runResult;
    }

    return readBackendRunResult(prepared.value, wasmExports, memory);
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
    if (prepared.isErr()) {
        return prepared;
    }
    const wasmExports = prepared.value.exports;
    const { memory } = prepared.value;
    const entryBytes = textEncoder.encode(options.entry ?? "main");
    const resetFailure = resetBackendWasm(prepared.value, wasmExports);
    if (resetFailure.isErr()) return resetFailure;
    const generatedWasmBytes = runBackendCodegen(
        prepared.value,
        moduleBytes,
        entryBytes,
    );
    if (generatedWasmBytes.isErr()) return generatedWasmBytes;
    const { backendCode, label, message } = readBackendCodegenMessage(
        wasmExports,
        memory,
    );
    if (backendCode !== 0) {
        return Result.err(
            createBackendRunError({
                code: "backend_codegen_failed",
                message,
                label,
                backendCode,
                exitCode: backendCode,
                wasmPath: prepared.value.wasmPath,
                built: prepared.value.built,
            }),
        );
    }
    if (generatedWasmBytes.value.length === 0) {
        return Result.err(
            createBackendRunError({
                code: "backend_codegen_failed",
                message: "backend wasm codegen returned empty wasm output",
                wasmPath: prepared.value.wasmPath,
                built: prepared.value.built,
            }),
        );
    }
    const generatedRun = runGeneratedWasmBytes(generatedWasmBytes.value);
    if (generatedRun.isErr()) {
        return Result.err(
            createBackendRunError({
                code: generatedRun.error.code,
                message: generatedRun.error.message,
                label: "execute-error",
                backendCode: BACKEND_CODE.EXECUTE_ERROR,
                exitCode: BACKEND_CODE.EXECUTE_ERROR,
                wasmPath: prepared.value.wasmPath,
                built: prepared.value.built,
            }),
        );
    }
    const { stdoutBytes } = generatedRun.value;
    let stdout = "";
    if (stdoutBytes.length > 0) {
        stdout = textDecoder.decode(stdoutBytes);
    }
    return Result.ok({
        code: "ok",
        stdout,
        stdoutBytes,
        traceBytes: new Uint8Array(),
        message: "ok",
        label: "ok",
        backendCode: 0,
        hasExitValue: generatedRun.value.hasExitValue,
        exitValue: generatedRun.value.exitValue,
        exitCode: 0,
        wasmPath: prepared.value.wasmPath,
        built: prepared.value.built,
    });
}

function canRunBackendIntegrationTests(): Result<void, BackendBuildError> {
    const resolved = resolveBackendWasm();
    if (resolved.isErr()) {
        return Result.err(
            new BackendBuildError({
                code: "backend_wasm_resolve_failed",
                message: resolved.error.message,
            }),
        );
    }
    if (fileExists(resolved.value.path)) {
        return Result.ok(undefined);
    }
    if (resolved.value.source !== "default") {
        return Result.err(
            new BackendBuildError({
                code: "backend_wasm_missing",
                message: `configured backend wasm not found: ${resolved.value.path}`,
            }),
        );
    }
    const buildCheck = canBuildBackend();
    if (buildCheck.isErr()) {
        return buildCheck;
    }
    const clangCheck = canCompileBackendWasm();
    if (clangCheck.isErr()) {
        return clangCheck;
    }
    return Result.ok(undefined);
}

export {
    DEFAULT_BACKEND_WASM,
    resolveBackendWasm,
    ensureBackendWasm,
    runBackendWasm,
    runBackendCodegenWasm,
    canRunBackendIntegrationTests,
};
