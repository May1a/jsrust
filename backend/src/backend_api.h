#pragma once

#include "errors.h"

typedef struct {
    jsrust_backend_error_code code;
    const char* message;
    int64_t exit_value;
    int has_exit_value;
} jsrust_backend_exec_result;

jsrust_backend_exec_result jsrust_backend_run_file(
    const char* input_path,
    const char* entry_fn,
    int trace_enabled,
    const char* trace_out_path);

