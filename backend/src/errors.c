#include "errors.h"

BackendStatus BackendStatus_make(jsrust_backend_error_code code, ByteSpan message)
{
    BackendStatus status;

    status.code = code;
    status.message = message;
    return status;
}

BackendStatus BackendStatus_ok(void)
{
    return BackendStatus_make(JSRUST_BACKEND_OK, ByteSpan_fromCString("ok"));
}

ByteSpan BackendError_defaultMessage(jsrust_backend_error_code code)
{
    switch (code) {
    case JSRUST_BACKEND_OK:
        return ByteSpan_fromCString("ok");
    case JSRUST_BACKEND_ERR_IO:
        return ByteSpan_fromCString("io-error");
    case JSRUST_BACKEND_ERR_INVALID_ARGS:
        return ByteSpan_fromCString("invalid-args");
    case JSRUST_BACKEND_ERR_DESERIALIZE:
        return ByteSpan_fromCString("deserialize-error");
    case JSRUST_BACKEND_ERR_UNSUPPORTED_VERSION:
        return ByteSpan_fromCString("unsupported-version");
    case JSRUST_BACKEND_ERR_VALIDATE:
        return ByteSpan_fromCString("validate-error");
    case JSRUST_BACKEND_ERR_EXECUTE:
        return ByteSpan_fromCString("execute-error");
    case JSRUST_BACKEND_ERR_INTERNAL:
        return ByteSpan_fromCString("internal-error");
    }

    return ByteSpan_fromCString("unknown-error");
}

int BackendError_exitCode(jsrust_backend_error_code code)
{
    return (int)code;
}

