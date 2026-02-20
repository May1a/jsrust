#include "wasm_encode.h"

static bool WasmEncodeBuffer_reserve(WasmEncodeBuffer* buffer, size_t requiredCap)
{
    uint8_t* nextData;
    size_t nextCap;

    if (requiredCap <= buffer->cap)
        return true;

    nextCap = buffer->cap ? buffer->cap : 64;
    while (nextCap < requiredCap)
        nextCap *= 2;

    nextData = (uint8_t*)Arena_alloc(buffer->arena, nextCap, _Alignof(uint8_t));
    if (!nextData)
        return false;

    if (buffer->len > 0)
        ByteOps_copy(nextData, buffer->data, buffer->len);

    buffer->data = nextData;
    buffer->cap = nextCap;
    return true;
}

bool WasmEncodeBuffer_init(WasmEncodeBuffer* buffer, Arena* arena, size_t initialCap)
{
    if (!buffer || !arena)
        return false;

    if (initialCap == 0)
        initialCap = 64;

    buffer->arena = arena;
    buffer->data = NULL;
    buffer->len = 0;
    buffer->cap = 0;

    return WasmEncodeBuffer_reserve(buffer, initialCap);
}

bool WasmEncodeBuffer_appendByte(WasmEncodeBuffer* buffer, uint8_t value)
{
    if (!WasmEncodeBuffer_reserve(buffer, buffer->len + 1))
        return false;

    buffer->data[buffer->len] = value;
    buffer->len += 1;
    return true;
}

bool WasmEncodeBuffer_appendSpan(WasmEncodeBuffer* buffer, ByteSpan span)
{
    if (span.len == 0)
        return true;

    if (!WasmEncodeBuffer_reserve(buffer, buffer->len + span.len))
        return false;

    ByteOps_copy(buffer->data + buffer->len, span.data, span.len);
    buffer->len += span.len;
    return true;
}

bool WasmEncode_writeU32Leb(WasmEncodeBuffer* buffer, uint32_t value)
{
    do {
        uint8_t byte;

        byte = (uint8_t)(value & 0x7Fu);
        value >>= 7;
        if (value != 0)
            byte |= 0x80u;
        if (!WasmEncodeBuffer_appendByte(buffer, byte))
            return false;
    } while (value != 0);

    return true;
}

bool WasmEncode_writeI32Leb(WasmEncodeBuffer* buffer, int32_t value)
{
    bool more;

    more = true;
    while (more) {
        uint8_t byte;
        int32_t next;

        byte = (uint8_t)(value & 0x7F);
        next = value >> 7;
        more = !(((next == 0) && ((byte & 0x40u) == 0)) || ((next == -1) && ((byte & 0x40u) != 0)));
        if (more)
            byte |= 0x80u;
        if (!WasmEncodeBuffer_appendByte(buffer, byte))
            return false;
        value = next;
    }

    return true;
}

bool WasmEncode_writeI64Leb(WasmEncodeBuffer* buffer, int64_t value)
{
    bool more;

    more = true;
    while (more) {
        uint8_t byte;
        int64_t next;

        byte = (uint8_t)(value & 0x7F);
        next = value >> 7;
        more = !(((next == 0) && ((byte & 0x40u) == 0)) || ((next == -1) && ((byte & 0x40u) != 0)));
        if (more)
            byte |= 0x80u;
        if (!WasmEncodeBuffer_appendByte(buffer, byte))
            return false;
        value = next;
    }

    return true;
}

bool WasmEncode_writeF64(WasmEncodeBuffer* buffer, double value)
{
    union {
        double f64;
        uint8_t bytes[8];
    } bits;
    size_t index;

    bits.f64 = value;
    for (index = 0; index < 8; ++index) {
        if (!WasmEncodeBuffer_appendByte(buffer, bits.bytes[index]))
            return false;
    }

    return true;
}

bool WasmEncode_writeName(WasmEncodeBuffer* buffer, ByteSpan name)
{
    if (!WasmEncode_writeU32Leb(buffer, (uint32_t)name.len))
        return false;
    return WasmEncodeBuffer_appendSpan(buffer, name);
}

bool WasmEncode_writeSection(WasmEncodeBuffer* moduleBuffer, uint8_t sectionId, const WasmEncodeBuffer* sectionPayload)
{
    if (!WasmEncodeBuffer_appendByte(moduleBuffer, sectionId))
        return false;
    if (!WasmEncode_writeU32Leb(moduleBuffer, (uint32_t)sectionPayload->len))
        return false;
    return WasmEncodeBuffer_appendSpan(moduleBuffer, ByteSpan_fromParts(sectionPayload->data, sectionPayload->len));
}
