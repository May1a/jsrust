#pragma once

#include "arena.h"
#include "errors.h"
#include "ir_model.h"

typedef struct {
    BackendStatus status;
    IRModule* module;
} IRReadResult;

IRReadResult IRBinary_readModule(Arena* arena, ByteSpan input);

