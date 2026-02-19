#pragma once

#include "errors.h"

#include <stdbool.h>
#include <stddef.h>

typedef struct {
    jsrust_backend_error_code code;
    const char* message;
    int64_t exit_value;
    int has_exit_value;
} jsrust_backend_exec_result;

typedef struct {
    void* context;
    bool (*writeByte)(void* context, uint8_t value);
    bool (*flush)(void* context);
} BackendOutputSink;

jsrust_backend_exec_result jsrust_backend_run_bytes(
    const uint8_t* input_data,
    size_t input_len,
    const char* entry_fn,
    int trace_enabled,
    ByteSpan* out_trace,
    const BackendOutputSink* output_sink);

jsrust_backend_exec_result jsrust_backend_run_file(
    const char* input_path,
    const char* entry_fn,
    int trace_enabled,
    const char* trace_out_path);
