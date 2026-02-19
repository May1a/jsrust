#include "trace.h"

static bool TraceBuffer_reserve(TraceBuffer* trace, size_t required)
{
    uint8_t* next;
    size_t index;
    size_t nextCap;

    if (!trace->enabled)
        return true;

    if (required <= trace->cap)
        return true;

    nextCap = trace->cap ? trace->cap : 256;
    while (nextCap < required)
        nextCap *= 2;

    next = (uint8_t*)Arena_alloc(trace->arena, nextCap, 1);
    if (!next)
        return false;

    for (index = 0; index < trace->len; ++index)
        next[index] = trace->data[index];

    trace->data = next;
    trace->cap = nextCap;
    return true;
}

bool TraceBuffer_init(TraceBuffer* trace, Arena* arena, bool enabled)
{
    trace->enabled = enabled;
    trace->arena = arena;
    trace->data = NULL;
    trace->len = 0;
    trace->cap = 0;
    return true;
}

bool TraceBuffer_appendSpan(TraceBuffer* trace, ByteSpan span)
{
    size_t index;

    if (!trace->enabled || span.len == 0)
        return true;

    if (!TraceBuffer_reserve(trace, trace->len + span.len))
        return false;

    for (index = 0; index < span.len; ++index)
        trace->data[trace->len + index] = span.data[index];

    trace->len += span.len;
    return true;
}

bool TraceBuffer_appendLiteral(TraceBuffer* trace, const char* literal)
{
    return TraceBuffer_appendSpan(trace, ByteSpan_fromCString(literal));
}

static bool TraceBuffer_appendUnsigned(TraceBuffer* trace, uint64_t value)
{
    uint8_t digits[32];
    size_t count;

    if (!trace->enabled)
        return true;

    if (value == 0)
        return TraceBuffer_appendLiteral(trace, "0");

    count = 0;
    while (value > 0) {
        digits[count] = (uint8_t)('0' + (value % 10));
        value /= 10;
        ++count;
    }

    while (count > 0) {
        --count;
        if (!TraceBuffer_appendSpan(trace, ByteSpan_fromParts(&digits[count], 1)))
            return false;
    }

    return true;
}

bool TraceBuffer_appendU32(TraceBuffer* trace, uint32_t value)
{
    return TraceBuffer_appendUnsigned(trace, value);
}

bool TraceBuffer_appendI64(TraceBuffer* trace, int64_t value)
{
    uint64_t absValue;

    if (!trace->enabled)
        return true;

    if (value < 0) {
        if (!TraceBuffer_appendLiteral(trace, "-"))
            return false;
        absValue = (uint64_t)(-(value + 1)) + 1;
    } else {
        absValue = (uint64_t)value;
    }

    return TraceBuffer_appendUnsigned(trace, absValue);
}

bool TraceBuffer_appendNewline(TraceBuffer* trace)
{
    return TraceBuffer_appendLiteral(trace, "\n");
}

ByteSpan TraceBuffer_span(const TraceBuffer* trace)
{
    return ByteSpan_fromParts(trace->data, trace->len);
}

