#pragma once

#include "arena.h"

#include <stdbool.h>
#include <stddef.h>

#define ARENA_VEC_DECLARE(TypeName, ElemType)                                                 \
    typedef struct {                                                                          \
        ElemType* items;                                                                      \
        size_t len;                                                                           \
        size_t cap;                                                                           \
    } TypeName;                                                                               \
    static inline bool TypeName##_init(TypeName* vec)                                         \
    {                                                                                         \
        vec->items = NULL;                                                                    \
        vec->len = 0;                                                                         \
        vec->cap = 0;                                                                         \
        return true;                                                                          \
    }                                                                                         \
    static inline bool TypeName##_reserve(TypeName* vec, Arena* arena, size_t requiredCap)    \
    {                                                                                         \
        ElemType* next;                                                                       \
        size_t index;                                                                         \
        size_t nextCap;                                                                       \
        if (requiredCap <= vec->cap)                                                          \
            return true;                                                                      \
        nextCap = vec->cap ? vec->cap : 4;                                                    \
        while (nextCap < requiredCap)                                                         \
            nextCap *= 2;                                                                     \
        next = (ElemType*)Arena_alloc(arena, nextCap * sizeof(ElemType), _Alignof(ElemType)); \
        if (!next)                                                                            \
            return false;                                                                     \
        for (index = 0; index < vec->len; ++index)                                            \
            next[index] = vec->items[index];                                                  \
        vec->items = next;                                                                    \
        vec->cap = nextCap;                                                                   \
        return true;                                                                          \
    }                                                                                         \
    static inline bool TypeName##_append(TypeName* vec, Arena* arena, ElemType value)         \
    {                                                                                         \
        if (!TypeName##_reserve(vec, arena, vec->len + 1))                                    \
            return false;                                                                     \
        vec->items[vec->len] = value;                                                         \
        ++vec->len;                                                                           \
        return true;                                                                          \
    }
