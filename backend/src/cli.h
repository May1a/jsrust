#pragma once

#include "errors.h"

#include <stdbool.h>
#include <stddef.h>

typedef struct {
    bool ok;
    bool showUsage;
    const char* inputPath;
    ByteSpan entryName;
    bool traceEnabled;
    const char* traceOutPath;
    BackendStatus status;
} CLIOptions;

CLIOptions CLI_parse(int argc, const char** argv);

