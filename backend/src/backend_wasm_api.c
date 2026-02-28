#include "backend_wasm_api.h"

#include "backend_api.h"
#include "bytes.h"
#include "wasm_alloc.h"

#include "alloc.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

static jsrust_backend_exec_result g_wasmResult;
static jsrust_backend_codegen_result g_wasmCodegenResult;
static ByteBuffer g_wasmMessage;
static ByteBuffer g_wasmStdout;
static ByteBuffer g_wasmTrace;
static ByteBuffer g_wasmCodegenWasm;
static bool g_wasmInitialized;

static bool BackendWasm_ensureBuffer(ByteBuffer* buffer, size_t initialCap)
{
    if (buffer->data) {
        buffer->len = 0;
        return true;
    }

    return ByteBuffer_init(buffer, initialCap);
}

static bool BackendWasm_setBufferFromSpan(ByteBuffer* buffer, ByteSpan span)
{
    if (!buffer->data)
        return false;

    buffer->len = 0;
    return ByteBuffer_appendSpan(buffer, span);
}

static bool BackendWasm_setBufferFromCString(ByteBuffer* buffer, const char* text)
{
    if (!buffer->data)
        return false;

    buffer->len = 0;
    return ByteBuffer_appendLiteral(buffer, text ? text : "");
}

static bool BackendWasm_prepareState(void)
{
    if (!BackendWasm_ensureBuffer(&g_wasmMessage, 64))
        return false;
    if (!BackendWasm_ensureBuffer(&g_wasmStdout, 128))
        return false;
    if (!BackendWasm_ensureBuffer(&g_wasmTrace, 128))
        return false;
    if (!BackendWasm_ensureBuffer(&g_wasmCodegenWasm, 256))
        return false;

    g_wasmMessage.len = 0;
    g_wasmStdout.len = 0;
    g_wasmTrace.len = 0;
    g_wasmCodegenWasm.len = 0;
    return true;
}

static uint32_t BackendWasm_fail(const char* message)
{
    g_wasmResult.code = JSRUST_BACKEND_ERR_INTERNAL;
    g_wasmResult.message = message;
    g_wasmResult.exit_value = 0;
    g_wasmResult.has_exit_value = 0;

    if (g_wasmInitialized)
        (void)BackendWasm_setBufferFromCString(&g_wasmMessage, message);

    return (uint32_t)g_wasmResult.code;
}

static bool BackendWasm_writeByte(void* context, uint8_t value)
{
    ByteBuffer* out;

    out = (ByteBuffer*)context;
    return ByteBuffer_appendByte(out, value);
}

static bool BackendWasm_flush(void* context)
{
    (void)context;
    return true;
}

uint32_t jsrust_wasm_alloc(uint32_t size)
{
    if (size == 0)
        return 0;

    uint8_t* ptr = malloc((size_t)size);
    if (!ptr)
        return 0;

    return (uint32_t)(uintptr_t)ptr;
}

void jsrust_wasm_reset(void)
{
    WasmAllocator_reset();

    g_wasmInitialized = false;
    g_wasmResult.code = JSRUST_BACKEND_OK;
    g_wasmResult.message = "ok";
    g_wasmResult.exit_value = 0;
    g_wasmResult.has_exit_value = 0;
    g_wasmCodegenResult.code = JSRUST_BACKEND_OK;
    g_wasmCodegenResult.message = "ok";
    g_wasmCodegenResult.wasm_data = NULL;
    g_wasmCodegenResult.wasm_len = 0;

    g_wasmMessage.data = NULL;
    g_wasmMessage.len = 0;
    g_wasmMessage.cap = 0;

    g_wasmStdout.data = NULL;
    g_wasmStdout.len = 0;
    g_wasmStdout.cap = 0;

    g_wasmTrace.data = NULL;
    g_wasmTrace.len = 0;
    g_wasmTrace.cap = 0;

    g_wasmCodegenWasm.data = NULL;
    g_wasmCodegenWasm.len = 0;
    g_wasmCodegenWasm.cap = 0;
}

uint32_t jsrust_wasm_run(
    uint32_t input_ptr,
    uint32_t input_len,
    uint32_t entry_ptr,
    uint32_t entry_len,
    uint32_t trace_enabled)
{
    const uint8_t* inputData;
    const uint8_t* entryData;
    char* entryCString;
    size_t index;
    BackendOutputSink output;
    ByteSpan trace;

    if (!g_wasmInitialized) {
        if (!BackendWasm_prepareState())
            return BackendWasm_fail("failed to initialize wasm buffers");
        g_wasmInitialized = true;
    }

    if (input_len > 0 && input_ptr == 0)
        return BackendWasm_fail("invalid input pointer");

    inputData = (const uint8_t*)(uintptr_t)input_ptr;
    entryData = (const uint8_t*)(uintptr_t)entry_ptr;
    entryCString = NULL;

    if (entry_len > 0) {
        entryCString = (char*)malloc((size_t)entry_len + 1);
        if (!entryCString)
            return BackendWasm_fail("failed to allocate entry buffer");

        for (index = 0; index < entry_len; ++index)
            entryCString[index] = (char)entryData[index];
        entryCString[entry_len] = '\0';
    }

    output.context = &g_wasmStdout;
    output.writeByte = BackendWasm_writeByte;
    output.flush = BackendWasm_flush;

    trace = ByteSpan_fromParts(NULL, 0);
    g_wasmResult = jsrust_backend_run_bytes(
        inputData,
        input_len,
        entryCString,
        trace_enabled ? 1 : 0,
        &trace,
        &output);

    if (!BackendWasm_setBufferFromCString(&g_wasmMessage, g_wasmResult.message)) {
        if (entryCString)
            free(entryCString);
        return BackendWasm_fail("failed to store wasm message output");
    }

    if (!BackendWasm_setBufferFromSpan(&g_wasmTrace, trace)) {
        if (entryCString)
            free(entryCString);
        return BackendWasm_fail("failed to store wasm trace output");
    }

    if (entryCString)
        free(entryCString);

    return (uint32_t)g_wasmResult.code;
}

uint32_t jsrust_wasm_codegen(
    uint32_t input_ptr,
    uint32_t input_len,
    uint32_t entry_ptr,
    uint32_t entry_len)
{
    const uint8_t* inputData;
    const uint8_t* entryData;
    char* entryCString;
    size_t index;

    if (!g_wasmInitialized) {
        if (!BackendWasm_prepareState())
            return BackendWasm_fail("failed to initialize wasm buffers");
        g_wasmInitialized = true;
    }

    if (input_len > 0 && input_ptr == 0)
        return BackendWasm_fail("invalid input pointer");

    inputData = (const uint8_t*)(uintptr_t)input_ptr;
    entryData = (const uint8_t*)(uintptr_t)entry_ptr;
    entryCString = NULL;

    if (entry_len > 0) {
        entryCString = (char*)malloc((size_t)entry_len + 1);
        if (!entryCString)
            return BackendWasm_fail("failed to allocate entry buffer");

        for (index = 0; index < entry_len; ++index)
            entryCString[index] = (char)entryData[index];
        entryCString[entry_len] = '\0';
    }

    g_wasmCodegenResult = jsrust_backend_codegen_wasm_bytes(
        inputData,
        input_len,
        entryCString);

    if (!BackendWasm_setBufferFromCString(&g_wasmMessage, g_wasmCodegenResult.message)) {
        if (entryCString)
            free(entryCString);
        return BackendWasm_fail("failed to store wasm message output");
    }

    g_wasmCodegenWasm.len = 0;
    if (g_wasmCodegenResult.code == JSRUST_BACKEND_OK && g_wasmCodegenResult.wasm_len > 0) {
        if (!ByteBuffer_appendSpan(
                &g_wasmCodegenWasm,
                ByteSpan_fromParts(g_wasmCodegenResult.wasm_data, g_wasmCodegenResult.wasm_len))) {
            if (entryCString)
                free(entryCString);
            return BackendWasm_fail("failed to store wasm codegen output");
        }
    }

    if (entryCString)
        free(entryCString);

    g_wasmResult.code = g_wasmCodegenResult.code;
    g_wasmResult.message = g_wasmCodegenResult.message;
    g_wasmResult.exit_value = 0;
    g_wasmResult.has_exit_value = 0;

    return (uint32_t)g_wasmCodegenResult.code;
}

uint32_t jsrust_wasm_result_code(void)
{
    return (uint32_t)g_wasmResult.code;
}

uint32_t jsrust_wasm_result_has_exit_value(void)
{
    return g_wasmResult.has_exit_value ? 1u : 0u;
}

int64_t jsrust_wasm_result_exit_value(void)
{
    return g_wasmResult.exit_value;
}

uint32_t jsrust_wasm_result_message_ptr(void)
{
    return g_wasmMessage.data ? (uint32_t)(uintptr_t)g_wasmMessage.data : 0;
}

uint32_t jsrust_wasm_result_message_len(void)
{
    return (uint32_t)g_wasmMessage.len;
}

uint32_t jsrust_wasm_stdout_ptr(void)
{
    return g_wasmStdout.data ? (uint32_t)(uintptr_t)g_wasmStdout.data : 0;
}

uint32_t jsrust_wasm_stdout_len(void)
{
    return (uint32_t)g_wasmStdout.len;
}

uint32_t jsrust_wasm_trace_ptr(void)
{
    return g_wasmTrace.data ? (uint32_t)(uintptr_t)g_wasmTrace.data : 0;
}

uint32_t jsrust_wasm_trace_len(void)
{
    return (uint32_t)g_wasmTrace.len;
}

uint32_t jsrust_wasm_codegen_wasm_ptr(void)
{
    return g_wasmCodegenWasm.data ? (uint32_t)(uintptr_t)g_wasmCodegenWasm.data : 0;
}

uint32_t jsrust_wasm_codegen_wasm_len(void)
{
    return (uint32_t)g_wasmCodegenWasm.len;
}
