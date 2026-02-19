#pragma once

#include "errors.h"

#include <stdio.h>

void Log_writeSpan(FILE* out, ByteSpan span);
void Log_writeLiteral(FILE* out, const char* literal);
void Log_writeStatusLine(FILE* out, BackendStatus status);
void Log_writeUsage(FILE* out);

