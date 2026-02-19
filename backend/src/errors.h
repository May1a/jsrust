#pragma once

#include "bytes.h"

#include <stdint.h>

typedef enum {
    JSRUST_BACKEND_OK = 0,
    JSRUST_BACKEND_ERR_IO = 10,
    JSRUST_BACKEND_ERR_INVALID_ARGS = 11,
    JSRUST_BACKEND_ERR_DESERIALIZE = 20,
    JSRUST_BACKEND_ERR_UNSUPPORTED_VERSION = 21,
    JSRUST_BACKEND_ERR_VALIDATE = 30,
    JSRUST_BACKEND_ERR_EXECUTE = 40,
    JSRUST_BACKEND_ERR_INTERNAL = 100
} jsrust_backend_error_code;

typedef struct {
    jsrust_backend_error_code code;
    ByteSpan message;
} BackendStatus;

BackendStatus BackendStatus_make(jsrust_backend_error_code code, ByteSpan message);
BackendStatus BackendStatus_ok(void);
ByteSpan BackendError_defaultMessage(jsrust_backend_error_code code);
int BackendError_exitCode(jsrust_backend_error_code code);

