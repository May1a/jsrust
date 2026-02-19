#include "backend_api.h"

#include "arena.h"
#include "exec_core.h"
#include "fs.h"
#include "ir_binary.h"
#include "ir_validate_min.h"
#include "runtime.h"

#include <stdlib.h>

typedef struct {
    Arena arena;
    TraceBuffer trace;
    RuntimeContext runtime;
    IRModule* module;
} BackendContext;

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

jsrust_backend_exec_result jsrust_backend_run_file(
    const char* input_path,
    const char* entry_fn,
    int trace_enabled,
    const char* trace_out_path)
{
    BackendContext* context;
    ByteSpan entryName;
    FSReadResult readResult;
    IRReadResult readModule;
    BackendStatus status;
    ExecCoreResult execResult;
    jsrust_backend_exec_result result;

    context = (BackendContext*)malloc(sizeof(BackendContext));
    if (!context) {
        result.code = JSRUST_BACKEND_ERR_INTERNAL;
        result.message = "failed to allocate backend context";
        result.exit_value = 0;
        result.has_exit_value = 0;
        return result;
    }

    if (!Arena_init(&context->arena, 2 * 1024 * 1024)) {
        free(context);
        result.code = JSRUST_BACKEND_ERR_INTERNAL;
        result.message = "failed to initialize backend arena";
        result.exit_value = 0;
        result.has_exit_value = 0;
        return result;
    }

    if (!TraceBuffer_init(&context->trace, &context->arena, trace_enabled != 0)) {
        Arena_destroy(&context->arena);
        free(context);
        result.code = JSRUST_BACKEND_ERR_INTERNAL;
        result.message = "failed to initialize trace buffer";
        result.exit_value = 0;
        result.has_exit_value = 0;
        return result;
    }

    entryName = entry_fn ? ByteSpan_fromCString(entry_fn) : ByteSpan_fromCString("main");

    readResult = FS_readWholeFile(&context->arena, input_path, 64 * 1024 * 1024);
    if (readResult.status.code != JSRUST_BACKEND_OK) {
        result = Backend_resultFromStatus(readResult.status);
        Arena_destroy(&context->arena);
        free(context);
        return result;
    }

    readModule = IRBinary_readModule(&context->arena, readResult.data);
    if (readModule.status.code != JSRUST_BACKEND_OK) {
        result = Backend_resultFromStatus(readModule.status);
        Arena_destroy(&context->arena);
        free(context);
        return result;
    }

    context->module = readModule.module;

    status = IRValidate_minimal(context->module);
    if (status.code != JSRUST_BACKEND_OK) {
        result = Backend_resultFromStatus(status);
        Arena_destroy(&context->arena);
        free(context);
        return result;
    }

    status = Runtime_init(&context->runtime, &context->arena, context->module, &context->trace);
    if (status.code != JSRUST_BACKEND_OK) {
        result = Backend_resultFromStatus(status);
        Arena_destroy(&context->arena);
        free(context);
        return result;
    }

    execResult = ExecCore_run(&context->runtime, entryName);
    if (execResult.status.code != JSRUST_BACKEND_OK) {
        result = Backend_resultFromStatus(execResult.status);
        Arena_destroy(&context->arena);
        free(context);
        return result;
    }

    if (trace_enabled && trace_out_path) {
        status = FS_writeFileAtomic(trace_out_path, TraceBuffer_span(&context->trace));
        if (status.code != JSRUST_BACKEND_OK) {
            result = Backend_resultFromStatus(status);
            Arena_destroy(&context->arena);
            free(context);
            return result;
        }
    }

    result.code = JSRUST_BACKEND_OK;
    result.message = "ok";
    result.has_exit_value = execResult.hasExitValue ? 1 : 0;
    result.exit_value = execResult.exitValue;

    Arena_destroy(&context->arena);
    free(context);
    return result;
}

