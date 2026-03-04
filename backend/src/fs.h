#pragma once

#include "arena.h"
#include "errors.h"

typedef struct {
    BackendStatus status;
    ByteSpan data;
} FSReadResult;

FSReadResult FS_readWholeFile(Arena* arena, const char* path, size_t maxBytes);
BackendStatus FS_writeFileAtomic(const char* path, ByteSpan content);
