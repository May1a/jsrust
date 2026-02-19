#pragma once

/*
 * Backend bootstrap header.
 *
 * This file intentionally provides a very small, auditable surface.
 * Backend core code should prefer local helpers in src/ over libc string helpers.
 */

#include <errno.h>
#include <float.h>
#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const uint8_t* data;
    size_t len;
} ByteSpan;

typedef struct {
    uint8_t* data;
    size_t len;
    size_t cap;
} ByteBuffer;

static inline ByteSpan ByteSpan_make(const uint8_t* data, size_t len)
{
    ByteSpan value;
    value.data = data;
    value.len = len;
    return value;
}

#ifdef __cplusplus
}
#endif
