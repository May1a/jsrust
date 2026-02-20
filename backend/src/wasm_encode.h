#pragma once

#include "arena.h"
#include "bytes.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    Arena* arena;
    uint8_t* data;
    size_t len;
    size_t cap;
} WasmEncodeBuffer;

bool WasmEncodeBuffer_init(WasmEncodeBuffer* buffer, Arena* arena, size_t initialCap);
bool WasmEncodeBuffer_appendByte(WasmEncodeBuffer* buffer, uint8_t value);
bool WasmEncodeBuffer_appendSpan(WasmEncodeBuffer* buffer, ByteSpan span);

bool WasmEncode_writeU32Leb(WasmEncodeBuffer* buffer, uint32_t value);
bool WasmEncode_writeI32Leb(WasmEncodeBuffer* buffer, int32_t value);
bool WasmEncode_writeI64Leb(WasmEncodeBuffer* buffer, int64_t value);
bool WasmEncode_writeF64(WasmEncodeBuffer* buffer, double value);

bool WasmEncode_writeName(WasmEncodeBuffer* buffer, ByteSpan name);
bool WasmEncode_writeSection(WasmEncodeBuffer* moduleBuffer, uint8_t sectionId, const WasmEncodeBuffer* sectionPayload);
