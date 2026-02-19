#pragma once

#include "arena.h"
#include "bytes.h"

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool enabled;
    Arena* arena;
    uint8_t* data;
    size_t len;
    size_t cap;
} TraceBuffer;

bool TraceBuffer_init(TraceBuffer* trace, Arena* arena, bool enabled);
bool TraceBuffer_appendSpan(TraceBuffer* trace, ByteSpan span);
bool TraceBuffer_appendLiteral(TraceBuffer* trace, const char* literal);
bool TraceBuffer_appendU32(TraceBuffer* trace, uint32_t value);
bool TraceBuffer_appendI64(TraceBuffer* trace, int64_t value);
bool TraceBuffer_appendNewline(TraceBuffer* trace);
ByteSpan TraceBuffer_span(const TraceBuffer* trace);

