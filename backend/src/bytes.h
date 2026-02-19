#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    const uint8_t* data;
    size_t len;
} ByteSpan;

typedef struct {
    uint8_t* data;
    size_t len;
    size_t cap;
} ByteBuffer;

size_t ByteOps_cstrLen(const char* text);
void ByteOps_copy(uint8_t* out, const uint8_t* in, size_t len);
void ByteOps_set(uint8_t* out, uint8_t value, size_t len);
bool ByteOps_equal(const uint8_t* left, const uint8_t* right, size_t len);

ByteSpan ByteSpan_fromCString(const char* text);
ByteSpan ByteSpan_fromParts(const uint8_t* data, size_t len);
bool ByteSpan_equal(ByteSpan left, ByteSpan right);
bool ByteSpan_equalLiteral(ByteSpan left, const char* literal);
int ByteSpan_compare(ByteSpan left, ByteSpan right);
uint32_t ByteSpan_hashFunctionId(ByteSpan name);

bool ByteBuffer_init(ByteBuffer* buffer, size_t initialCap);
void ByteBuffer_destroy(ByteBuffer* buffer);
bool ByteBuffer_reserve(ByteBuffer* buffer, size_t requiredCap);
bool ByteBuffer_appendByte(ByteBuffer* buffer, uint8_t value);
bool ByteBuffer_appendSpan(ByteBuffer* buffer, ByteSpan span);
bool ByteBuffer_appendLiteral(ByteBuffer* buffer, const char* literal);

