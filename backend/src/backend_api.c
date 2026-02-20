#include "backend_api.h"

#include "arena.h"
#include "exec_core.h"
#ifndef JSRUST_BACKEND_WASM
#include "fs.h"
#endif
#include "ir_binary.h"
#include "ir_validate_min.h"
#include "runtime.h"
#include "wasm_emit.h"

#ifndef JSRUST_BACKEND_WASM
#include <stdio.h>
#endif

typedef struct {
    Arena arena;
    TraceBuffer trace;
    RuntimeContext runtime;
    IRModule* module;
} BackendContext;

static ByteBuffer g_codegenOutput;

static const char* Backend_messageFromCode(jsrust_backend_error_code code)
{
    switch (code) {
    case JSRUST_BACKEND_OK:
        return "ok";
    case JSRUST_BACKEND_ERR_IO:
        return "io-error";
    case JSRUST_BACKEND_ERR_INVALID_ARGS:
        return "invalid-args";
    case JSRUST_BACKEND_ERR_DESERIALIZE:
        return "deserialize-error";
    case JSRUST_BACKEND_ERR_UNSUPPORTED_VERSION:
        return "unsupported-version";
    case JSRUST_BACKEND_ERR_VALIDATE:
        return "validate-error";
    case JSRUST_BACKEND_ERR_EXECUTE:
        return "execute-error";
    case JSRUST_BACKEND_ERR_INTERNAL:
        return "internal-error";
    }

    return "unknown-error";
}

static const char* Backend_messageFromSpan(ByteSpan span)
{
    static char message[256];
    size_t index;
    size_t limit;

    if (span.data == NULL || span.len == 0)
        return "";

    limit = span.len;
    if (limit > sizeof(message) - 1)
        limit = sizeof(message) - 1;

    for (index = 0; index < limit; ++index)
        message[index] = (char)span.data[index];

    message[limit] = '\0';
    return message;
}

static jsrust_backend_exec_result Backend_resultFromStatus(BackendStatus status)
{
    jsrust_backend_exec_result result;

    result.code = status.code;
    if (status.message.len > 0)
        result.message = Backend_messageFromSpan(status.message);
    else
        result.message = Backend_messageFromCode(status.code);
    result.exit_value = 0;
    result.has_exit_value = 0;
    return result;
}

static jsrust_backend_exec_result Backend_internalError(const char* message)
{
    jsrust_backend_exec_result result;

    result.code = JSRUST_BACKEND_ERR_INTERNAL;
    result.message = message;
    result.exit_value = 0;
    result.has_exit_value = 0;
    return result;
}

static jsrust_backend_codegen_result Backend_codegenResultFromStatus(BackendStatus status)
{
    jsrust_backend_codegen_result result;

    result.code = status.code;
    if (status.message.len > 0)
        result.message = Backend_messageFromSpan(status.message);
    else
        result.message = Backend_messageFromCode(status.code);
    result.wasm_data = NULL;
    result.wasm_len = 0;
    return result;
}

static jsrust_backend_codegen_result Backend_codegenInternalError(const char* message)
{
    jsrust_backend_codegen_result result;

    result.code = JSRUST_BACKEND_ERR_INTERNAL;
    result.message = message;
    result.wasm_data = NULL;
    result.wasm_len = 0;
    return result;
}

static jsrust_backend_exec_result Backend_runModuleBytes(
    BackendContext* context,
    ByteSpan input,
    ByteSpan entryName,
    ByteSpan* out_trace,
    const BackendOutputSink* output_sink)
{
    RuntimeOutputSink runtimeOutput;
    IRReadResult readModule;
    BackendStatus status;
    ExecCoreResult execResult;
    jsrust_backend_exec_result result;

    runtimeOutput.context = output_sink ? output_sink->context : NULL;
    runtimeOutput.writeByte = output_sink ? output_sink->writeByte : NULL;
    runtimeOutput.flush = output_sink ? output_sink->flush : NULL;

    readModule = IRBinary_readModule(&context->arena, input);
    if (readModule.status.code != JSRUST_BACKEND_OK)
        return Backend_resultFromStatus(readModule.status);

    context->module = readModule.module;

    status = IRValidate_minimal(context->module);
    if (status.code != JSRUST_BACKEND_OK)
        return Backend_resultFromStatus(status);

    status = Runtime_init(
        &context->runtime,
        &context->arena,
        context->module,
        &context->trace,
        &runtimeOutput);
    if (status.code != JSRUST_BACKEND_OK)
        return Backend_resultFromStatus(status);

    execResult = ExecCore_run(&context->runtime, entryName);
    if (execResult.status.code != JSRUST_BACKEND_OK)
        return Backend_resultFromStatus(execResult.status);

    if (out_trace)
        *out_trace = TraceBuffer_span(&context->trace);

    result.code = JSRUST_BACKEND_OK;
    result.message = "ok";
    result.has_exit_value = execResult.hasExitValue ? 1 : 0;
    result.exit_value = execResult.exitValue;
    return result;
}

jsrust_backend_exec_result jsrust_backend_run_bytes(
    const uint8_t* input_data,
    size_t input_len,
    const char* entry_fn,
    int trace_enabled,
    ByteSpan* out_trace,
    const BackendOutputSink* output_sink)
{
    BackendContext context;
    ByteSpan entryName;
    ByteSpan input;
    jsrust_backend_exec_result result;

    if (out_trace)
        *out_trace = ByteSpan_fromParts(NULL, 0);

    if (!input_data && input_len > 0)
        return Backend_internalError("invalid input buffer");

    if (!Arena_init(&context.arena, 2 * 1024 * 1024))
        return Backend_internalError("failed to initialize backend arena");

    if (!TraceBuffer_init(&context.trace, &context.arena, trace_enabled != 0)) {
        Arena_destroy(&context.arena);
        return Backend_internalError("failed to initialize trace buffer");
    }

    input = ByteSpan_fromParts(input_data, input_len);
    entryName = entry_fn ? ByteSpan_fromCString(entry_fn) : ByteSpan_fromCString("main");

    result = Backend_runModuleBytes(
        &context,
        input,
        entryName,
        out_trace,
        output_sink);

    Arena_destroy(&context.arena);
    return result;
}

jsrust_backend_codegen_result jsrust_backend_codegen_wasm_bytes(
    const uint8_t* input_data,
    size_t input_len,
    const char* entry_fn)
{
    Arena arena;
    ByteSpan input;
    ByteSpan entryName;
    IRReadResult readModule;
    BackendStatus status;
    WasmEmitResult emitResult;
    jsrust_backend_codegen_result result;

    if (!input_data && input_len > 0)
        return Backend_codegenInternalError("invalid input buffer");

    if (!Arena_init(&arena, 2 * 1024 * 1024))
        return Backend_codegenInternalError("failed to initialize backend arena");

    input = ByteSpan_fromParts(input_data, input_len);
    entryName = entry_fn ? ByteSpan_fromCString(entry_fn) : ByteSpan_fromCString("main");

    readModule = IRBinary_readModule(&arena, input);
    if (readModule.status.code != JSRUST_BACKEND_OK) {
        result = Backend_codegenResultFromStatus(readModule.status);
        Arena_destroy(&arena);
        return result;
    }

    status = IRValidate_minimal(readModule.module);
    if (status.code != JSRUST_BACKEND_OK) {
        result = Backend_codegenResultFromStatus(status);
        Arena_destroy(&arena);
        return result;
    }

    emitResult = WasmEmit_emitModule(&arena, readModule.module, entryName);
    if (emitResult.status.code != JSRUST_BACKEND_OK) {
        result = Backend_codegenResultFromStatus(emitResult.status);
        Arena_destroy(&arena);
        return result;
    }

    if (!g_codegenOutput.data) {
        if (!ByteBuffer_init(&g_codegenOutput, emitResult.wasmBytes.len + 64)) {
            Arena_destroy(&arena);
            return Backend_codegenInternalError("failed to initialize codegen output buffer");
        }
    }

    g_codegenOutput.len = 0;
    if (!ByteBuffer_appendSpan(&g_codegenOutput, emitResult.wasmBytes)) {
        Arena_destroy(&arena);
        return Backend_codegenInternalError("failed to persist codegen wasm output");
    }

    result.code = JSRUST_BACKEND_OK;
    result.message = "ok";
    result.wasm_data = g_codegenOutput.data;
    result.wasm_len = g_codegenOutput.len;

    Arena_destroy(&arena);
    return result;
}

#ifndef JSRUST_BACKEND_WASM
static bool Backend_outputWriteStdout(void* context, uint8_t value)
{
    FILE* out;

    out = context ? (FILE*)context : stdout;
    return fputc((int)value, out) != EOF;
}

static bool Backend_outputFlushStdout(void* context)
{
    FILE* out;

    out = context ? (FILE*)context : stdout;
    return fflush(out) == 0;
}

jsrust_backend_exec_result jsrust_backend_run_file(
    const char* input_path,
    const char* entry_fn,
    int trace_enabled,
    const char* trace_out_path)
{
    BackendOutputSink output;
    BackendContext context;
    ByteSpan entryName;
    FSReadResult readResult;
    ByteSpan trace;
    BackendStatus status;
    jsrust_backend_exec_result result;

    if (!Arena_init(&context.arena, 2 * 1024 * 1024))
        return Backend_internalError("failed to initialize backend arena");

    if (!TraceBuffer_init(&context.trace, &context.arena, trace_enabled != 0)) {
        Arena_destroy(&context.arena);
        return Backend_internalError("failed to initialize trace buffer");
    }

    readResult = FS_readWholeFile(&context.arena, input_path, 64 * 1024 * 1024);
    if (readResult.status.code != JSRUST_BACKEND_OK) {
        result = Backend_resultFromStatus(readResult.status);
        Arena_destroy(&context.arena);
        return result;
    }

    output.context = stdout;
    output.writeByte = Backend_outputWriteStdout;
    output.flush = Backend_outputFlushStdout;

    entryName = entry_fn ? ByteSpan_fromCString(entry_fn) : ByteSpan_fromCString("main");

    result = Backend_runModuleBytes(
        &context,
        readResult.data,
        entryName,
        &trace,
        &output);
    if (result.code != JSRUST_BACKEND_OK) {
        Arena_destroy(&context.arena);
        return result;
    }

    if (trace_enabled && trace_out_path) {
        status = FS_writeFileAtomic(trace_out_path, trace);
        if (status.code != JSRUST_BACKEND_OK) {
            result = Backend_resultFromStatus(status);
            Arena_destroy(&context.arena);
            return result;
        }
    }

    Arena_destroy(&context.arena);
    return result;
}
#endif
