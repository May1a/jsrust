#include "bytes.h"

#include "alloc.h"

size_t ByteOps_cstrLen(const char* text)
{
    size_t len;

    len = 0;
    while (text[len] != '\0')
        ++len;

    return len;
}

void ByteOps_copy(uint8_t* out, const uint8_t* in, size_t len)
{
    size_t index;

    for (index = 0; index < len; ++index)
        out[index] = in[index];
}

void ByteOps_set(uint8_t* out, uint8_t value, size_t len)
{
    size_t index;

    for (index = 0; index < len; ++index)
        out[index] = value;
}

bool ByteOps_equal(const uint8_t* left, const uint8_t* right, size_t len)
{
    size_t index;

    for (index = 0; index < len; ++index) {
        if (left[index] != right[index])
            return false;
    }

    return true;
}

ByteSpan ByteSpan_fromCString(const char* text)
{
    ByteSpan span;

    span.data = (const uint8_t*)text;
    span.len = ByteOps_cstrLen(text);
    return span;
}

ByteSpan ByteSpan_fromParts(const uint8_t* data, size_t len)
{
    ByteSpan span;

    span.data = data;
    span.len = len;
    return span;
}

bool ByteSpan_equal(ByteSpan left, ByteSpan right)
{
    if (left.len != right.len)
        return false;

    return ByteOps_equal(left.data, right.data, left.len);
}

bool ByteSpan_equalLiteral(ByteSpan left, const char* literal)
{
    return ByteSpan_equal(left, ByteSpan_fromCString(literal));
}

int ByteSpan_compare(ByteSpan left, ByteSpan right)
{
    size_t index;
    size_t limit;

    limit = left.len < right.len ? left.len : right.len;
    for (index = 0; index < limit; ++index) {
        if (left.data[index] < right.data[index])
            return -1;
        if (left.data[index] > right.data[index])
            return 1;
    }

    if (left.len < right.len)
        return -1;
    if (left.len > right.len)
        return 1;
    return 0;
}

uint32_t ByteSpan_hashFunctionId(ByteSpan name)
{
    int32_t hash;
    size_t index;

    hash = 0;
    for (index = 0; index < name.len; ++index) {
        hash = (hash << 5) - hash + (int32_t)name.data[index];
        hash |= 0;
    }

    if (hash < 0)
        hash = -hash;

    return (uint32_t)(hash % 1000000);
}

bool ByteBuffer_init(ByteBuffer* buffer, size_t initialCap)
{
    if (initialCap == 0)
        initialCap = 64;

    buffer->data = (uint8_t*)malloc(initialCap);
    if (!buffer->data)
        return false;

    buffer->len = 0;
    buffer->cap = initialCap;
    return true;
}

void ByteBuffer_destroy(ByteBuffer* buffer)
{
    if (!buffer->data)
        return;

    free(buffer->data);
    buffer->data = NULL;
    buffer->len = 0;
    buffer->cap = 0;
}

bool ByteBuffer_reserve(ByteBuffer* buffer, size_t requiredCap)
{
    uint8_t* next;
    size_t nextCap;

    if (requiredCap <= buffer->cap)
        return true;

    nextCap = buffer->cap ? buffer->cap : 64;
    while (nextCap < requiredCap)
        nextCap *= 2;

    next = (uint8_t*)realloc(buffer->data, nextCap);
    if (!next)
        return false;

    buffer->data = next;
    buffer->cap = nextCap;
    return true;
}

bool ByteBuffer_appendByte(ByteBuffer* buffer, uint8_t value)
{
    if (!ByteBuffer_reserve(buffer, buffer->len + 1))
        return false;

    buffer->data[buffer->len] = value;
    ++buffer->len;
    return true;
}

bool ByteBuffer_appendSpan(ByteBuffer* buffer, ByteSpan span)
{
    if (span.len == 0)
        return true;

    if (!ByteBuffer_reserve(buffer, buffer->len + span.len))
        return false;

    ByteOps_copy(buffer->data + buffer->len, span.data, span.len);
    buffer->len += span.len;
    return true;
}

bool ByteBuffer_appendLiteral(ByteBuffer* buffer, const char* literal)
{
    return ByteBuffer_appendSpan(buffer, ByteSpan_fromCString(literal));
}
