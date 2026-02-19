#pragma once

#include <stdint.h>

uint32_t jsrust_wasm_alloc(uint32_t size);
void jsrust_wasm_reset(void);
uint32_t jsrust_wasm_run(
    uint32_t input_ptr,
    uint32_t input_len,
    uint32_t entry_ptr,
    uint32_t entry_len,
    uint32_t trace_enabled);

uint32_t jsrust_wasm_result_code(void);
uint32_t jsrust_wasm_result_has_exit_value(void);
int64_t jsrust_wasm_result_exit_value(void);

uint32_t jsrust_wasm_result_message_ptr(void);
uint32_t jsrust_wasm_result_message_len(void);
uint32_t jsrust_wasm_stdout_ptr(void);
uint32_t jsrust_wasm_stdout_len(void);
uint32_t jsrust_wasm_trace_ptr(void);
uint32_t jsrust_wasm_trace_len(void);
