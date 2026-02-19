#include "fs.h"

#include "bytes.h"

#include <stdio.h>

static BackendStatus FS_status(jsrust_backend_error_code code, const char* message)
{
    return BackendStatus_make(code, ByteSpan_fromCString(message));
}

FSReadResult FS_readWholeFile(Arena* arena, const char* path, size_t maxBytes)
{
    ByteSpan span;
    FILE* file;
    long fileLen;
    size_t readLen;
    uint8_t* data;
    FSReadResult result;

    result.status = BackendStatus_ok();
    result.data = ByteSpan_fromParts(NULL, 0);

    file = fopen(path, "rb");
    if (!file) {
        result.status = FS_status(JSRUST_BACKEND_ERR_IO, "failed to open input file");
        return result;
    }

    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        result.status = FS_status(JSRUST_BACKEND_ERR_IO, "failed to seek input file");
        return result;
    }

    fileLen = ftell(file);
    if (fileLen < 0) {
        fclose(file);
        result.status = FS_status(JSRUST_BACKEND_ERR_IO, "failed to tell input file length");
        return result;
    }

    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        result.status = FS_status(JSRUST_BACKEND_ERR_IO, "failed to reset input file position");
        return result;
    }

    if ((size_t)fileLen > maxBytes) {
        fclose(file);
        result.status = FS_status(JSRUST_BACKEND_ERR_IO, "input file exceeds max size");
        return result;
    }

    data = (uint8_t*)Arena_alloc(arena, (size_t)fileLen, 1);
    if (!data && fileLen > 0) {
        fclose(file);
        result.status = FS_status(JSRUST_BACKEND_ERR_INTERNAL, "arena allocation failed while reading file");
        return result;
    }

    readLen = 0;
    while (readLen < (size_t)fileLen) {
        size_t got;

        got = fread(data + readLen, 1, (size_t)fileLen - readLen, file);
        if (got == 0) {
            fclose(file);
            result.status = FS_status(JSRUST_BACKEND_ERR_IO, "failed to read complete input file");
            return result;
        }
        readLen += got;
    }

    fclose(file);

    span.data = data;
    span.len = (size_t)fileLen;
    result.data = span;
    return result;
}

BackendStatus FS_writeFileAtomic(const char* path, ByteSpan content)
{
    char tempPath[1024];
    size_t pathLen;
    FILE* file;
    size_t written;
    size_t index;
    const char suffix[] = ".tmp";

    pathLen = ByteOps_cstrLen(path);
    if (pathLen + 5 >= sizeof(tempPath))
        return BackendStatus_make(JSRUST_BACKEND_ERR_IO, ByteSpan_fromCString("trace path too long"));

    for (index = 0; index < pathLen; ++index)
        tempPath[index] = path[index];
    for (index = 0; index < 5; ++index)
        tempPath[pathLen + index] = suffix[index];

    file = fopen(tempPath, "wb");
    if (!file)
        return BackendStatus_make(JSRUST_BACKEND_ERR_IO, ByteSpan_fromCString("failed to open temp output path"));

    written = 0;
    while (written < content.len) {
        size_t chunk;

        chunk = fwrite(content.data + written, 1, content.len - written, file);
        if (chunk == 0) {
            fclose(file);
            remove(tempPath);
            return BackendStatus_make(JSRUST_BACKEND_ERR_IO, ByteSpan_fromCString("failed to write output file"));
        }
        written += chunk;
    }

    if (fclose(file) != 0) {
        remove(tempPath);
        return BackendStatus_make(JSRUST_BACKEND_ERR_IO, ByteSpan_fromCString("failed to close output file"));
    }

    if (rename(tempPath, path) != 0) {
        remove(tempPath);
        return BackendStatus_make(JSRUST_BACKEND_ERR_IO, ByteSpan_fromCString("failed to atomically move output file"));
    }

    return BackendStatus_ok();
}

