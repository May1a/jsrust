#pragma once

#include "arena.h"
#include "errors.h"
#include "ir_model.h"

typedef struct {
    BackendStatus status;
    ByteSpan wasmBytes;
} WasmEmitResult;

WasmEmitResult WasmEmit_emitModule(Arena* arena, const IRModule* module, ByteSpan entryName);
