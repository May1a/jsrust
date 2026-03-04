#include "log.h"

#include <stdio.h>

void Log_writeSpan(FILE* out, ByteSpan span)
{
    if (span.len == 0)
        return;

    (void)fwrite(span.data, 1, span.len, out);
}

void Log_writeLiteral(FILE* out, const char* literal)
{
    ByteSpan span;

    span = ByteSpan_fromCString(literal);
    Log_writeSpan(out, span);
}

void Log_writeStatusLine(FILE* out, BackendStatus status)
{
    ByteSpan label;

    label = BackendError_defaultMessage(status.code);
    Log_writeLiteral(out, "error[");
    Log_writeSpan(out, label);
    Log_writeLiteral(out, "]: ");
    Log_writeSpan(out, status.message.len ? status.message : label);
    Log_writeLiteral(out, "\n");
}

void Log_writeUsage(FILE* out)
{
    Log_writeLiteral(out, "Usage: jsrust-backend-c run --input <path> [--entry <fn>] [--trace] [--trace-out <path>]\n");
}
