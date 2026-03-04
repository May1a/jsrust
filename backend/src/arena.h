#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint8_t* data;
    size_t len;
    size_t cap;
    size_t growCount;
} Arena;

bool Arena_init(Arena* arena, size_t initialCap);
void Arena_destroy(Arena* arena);
void Arena_reset(Arena* arena);
void* Arena_alloc(Arena* arena, size_t size, size_t align);
void* Arena_allocZero(Arena* arena, size_t size, size_t align);
size_t Arena_alignment(size_t align);
