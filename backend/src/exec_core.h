#pragma once

#include "errors.h"
#include "runtime.h"

typedef struct {
    BackendStatus status;
    int64_t exitValue;
    bool hasExitValue;
} ExecCoreResult;

ExecCoreResult ExecCore_run(RuntimeContext* runtime, ByteSpan entryName);

