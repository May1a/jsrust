#include "arena.h"

#include "bytes.h"

#include "alloc.h"

static bool Arena_grow(Arena* arena, size_t requiredCap)
{
    uint8_t* next;
    size_t nextCap;

    nextCap = arena->cap;
    while (nextCap < requiredCap)
        nextCap *= 2;

    next = (uint8_t*)realloc(arena->data, nextCap);
    if (!next)
        return false;

    arena->data = next;
    arena->cap = nextCap;
    ++arena->growCount;
    return true;
}

size_t Arena_alignment(size_t align)
{
    if (align == 0)
        return 1;

    return align;
}

bool Arena_init(Arena* arena, size_t initialCap)
{
    if (initialCap == 0)
        initialCap = 1024 * 1024;

    arena->data = (uint8_t*)malloc(initialCap);
    if (!arena->data)
        return false;

    arena->len = 0;
    arena->cap = initialCap;
    arena->growCount = 0;
    return true;
}

void Arena_destroy(Arena* arena)
{
    if (arena->data)
        free(arena->data);

    arena->data = NULL;
    arena->len = 0;
    arena->cap = 0;
    arena->growCount = 0;
}

void Arena_reset(Arena* arena)
{
    arena->len = 0;
}

void* Arena_alloc(Arena* arena, size_t size, size_t align)
{
    size_t mask;
    size_t offset;
    size_t end;

    align = Arena_alignment(align);
    mask = align - 1;
    offset = (arena->len + mask) & ~mask;
    end = offset + size;

    if (end < offset)
        return NULL;

    if (end > arena->cap) {
        if (!Arena_grow(arena, end))
            return NULL;
    }

    arena->len = end;
    return arena->data + offset;
}

void* Arena_allocZero(Arena* arena, size_t size, size_t align)
{
    uint8_t* ptr;

    ptr = (uint8_t*)Arena_alloc(arena, size, align);
    if (!ptr)
        return NULL;

    ByteOps_set(ptr, 0, size);
    return ptr;
}
