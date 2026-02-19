import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const DEFAULT_BACKEND_BINARY = path.join(
    BACKEND_DIR,
    "bin",
    "jsrust-backend-c",
);

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
 * @typedef {object} ResolveBackendBinaryOptions
 * @property {string} [backendBinary]
 * @property {string} [cwd]
 */

/**
 * @typedef {object} EnsureBackendBinaryOptions
 * @property {string} [backendBinary]
 * @property {boolean} [buildIfMissing=true]
 */

/**
 * @typedef {{ ok: true, path: string, source: "cli" | "env" | "default" }} ResolveBackendBinaryResultOk
 * @typedef {{ ok: false, code: string, message: string }} ResultError
 * @typedef {ResolveBackendBinaryResultOk | ResultError} ResolveBackendBinaryResult
 */

/**
 * Resolve backend binary path using CLI, env, then default.
 * @param {ResolveBackendBinaryOptions} [options={}]
 * @returns {ResolveBackendBinaryResult}
 */
function resolveBackendBinary(options = {}) {
    const cwd = options.cwd || process.cwd();
    if (options.backendBinary) {
        return {
            ok: true,
            path: path.resolve(cwd, options.backendBinary),
            source: "cli",
        };
    }

    if (process.env.JSRUST_BACKEND_BIN) {
        return {
            ok: true,
            path: path.resolve(cwd, process.env.JSRUST_BACKEND_BIN),
            source: "env",
        };
    }

    return {
        ok: true,
        path: DEFAULT_BACKEND_BINARY,
        source: "default",
    };
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
 * @typedef {{ ok: true, path: string, source: "cli" | "env" | "default", built: boolean } | (ResultError & { stdout?: string, stderr?: string })} EnsureBackendBinaryResult
 */

/**
 * Resolve backend binary and build if missing when allowed.
 * @param {EnsureBackendBinaryOptions} [options={}]
 * @returns {EnsureBackendBinaryResult}
 */
function ensureBackendBinary(options = {}) {
    const resolved = resolveBackendBinary({
        backendBinary: options.backendBinary,
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
            code: "backend_binary_missing",
            message: `backend binary not found: ${resolved.path}`,
        };
    }

    if (options.buildIfMissing === false) {
        return {
            ok: false,
            code: "backend_binary_missing",
            message: `backend binary not found: ${resolved.path}`,
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

    const build = spawnSync("make", ["-C", BACKEND_DIR, "build"], {
        encoding: "utf-8",
    });
    if (build.error) {
        return {
            ok: false,
            code: "backend_build_failed",
            message: `failed to invoke backend build: ${build.error.message}`,
            stdout: build.stdout || "",
            stderr: build.stderr || "",
        };
    }
    if ((build.status ?? 1) !== 0) {
        return {
            ok: false,
            code: "backend_build_failed",
            message: `backend build failed with exit code ${build.status ?? 1}`,
            stdout: build.stdout || "",
            stderr: build.stderr || "",
        };
    }

    if (!fileExists(resolved.path)) {
        return {
            ok: false,
            code: "backend_binary_missing",
            message: `backend binary not found after build: ${resolved.path}`,
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
 * @typedef {object} RunBackendBinaryOptions
 * @property {string} [backendBinary]
 * @property {boolean} [buildIfMissing=true]
 */

/**
 * @typedef {{ ok: true, code: "ok", stdout: string, stderr: string, exitCode: number, binaryPath: string, built: boolean } | ({ ok: false, code: string, message: string, stdout: string, stderr: string, exitCode: number | null, binaryPath?: string, built?: boolean })} RunBackendBinaryResult
 */

/**
 * Run backend executable.
 * @param {string[]} args
 * @param {RunBackendBinaryOptions} [options={}]
 * @returns {RunBackendBinaryResult}
 */
function runBackendBinary(args, options = {}) {
    const ensured = ensureBackendBinary({
        backendBinary: options.backendBinary,
        buildIfMissing: options.buildIfMissing,
    });
    if (!ensured.ok) {
        return {
            ok: false,
            code: ensured.code,
            message: ensured.message,
            stdout: ensured.stdout || "",
            stderr: ensured.stderr || "",
            exitCode: null,
        };
    }

    const run = spawnSync(ensured.path, args, {
        encoding: "utf-8",
    });
    if (run.error) {
        return {
            ok: false,
            code: "backend_spawn_failed",
            message: `failed to execute backend binary: ${run.error.message}`,
            stdout: run.stdout || "",
            stderr: run.stderr || "",
            exitCode: null,
            binaryPath: ensured.path,
            built: ensured.built,
        };
    }

    const status = run.status ?? 1;
    const stdout = run.stdout || "";
    const stderr = run.stderr || "";

    if (status === 0) {
        return {
            ok: true,
            code: "ok",
            stdout,
            stderr,
            exitCode: status,
            binaryPath: ensured.path,
            built: ensured.built,
        };
    }

    return {
        ok: false,
        code: "backend_process_failed",
        message: `backend exited with code ${status}`,
        stdout,
        stderr,
        exitCode: status,
        binaryPath: ensured.path,
        built: ensured.built,
    };
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function canRunBackendIntegrationTests() {
    const resolved = resolveBackendBinary();
    if (!resolved.ok) {
        return { ok: false, reason: resolved.message };
    }

    if (fileExists(resolved.path)) {
        return { ok: true };
    }

    if (resolved.source !== "default") {
        return {
            ok: false,
            reason: `configured backend binary not found: ${resolved.path}`,
        };
    }

    const buildCheck = canBuildBackend();
    if (!buildCheck.ok) {
        return { ok: false, reason: buildCheck.reason };
    }

    return { ok: true };
}

export {
    DEFAULT_BACKEND_BINARY,
    resolveBackendBinary,
    ensureBackendBinary,
    runBackendBinary,
    canRunBackendIntegrationTests,
};
