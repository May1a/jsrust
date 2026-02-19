#include "wasm_alloc.h"

#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint32_t size;
} WasmAllocatorHeader;

extern unsigned char __heap_base;

static uint32_t g_wasmAllocatorOffset;

static uint32_t WasmAllocator_alignUp(uint32_t value, uint32_t alignment)
{
    uint32_t mask;

    if (alignment == 0)
        return value;

    mask = alignment - 1;
    return (value + mask) & ~mask;
}

static uint32_t WasmAllocator_initialOffset(void)
{
    if (g_wasmAllocatorOffset == 0)
        g_wasmAllocatorOffset = (uint32_t)(uintptr_t)&__heap_base;

    return g_wasmAllocatorOffset;
}

static int WasmAllocator_ensureCapacity(uint32_t requiredEnd)
{
    uint32_t currentPages;
    uint32_t requiredPages;
    uint32_t growPages;
    size_t growResult;

    currentPages = (uint32_t)__builtin_wasm_memory_size(0);
    requiredPages = (requiredEnd + 65535u) / 65536u;

    if (requiredPages <= currentPages)
        return 1;

    growPages = requiredPages - currentPages;
    growResult = __builtin_wasm_memory_grow(0, growPages);
    if (growResult == (size_t)-1)
        return 0;

    return 1;
}

void WasmAllocator_reset(void)
{
    g_wasmAllocatorOffset = 0;
}

void* malloc(size_t size)
{
    uint32_t start;
    uint32_t payload;
    uint64_t totalSize;
    uint64_t end64;
    uint32_t end;
    WasmAllocatorHeader* header;

    if (size == 0)
        size = 1;

    start = WasmAllocator_alignUp(WasmAllocator_initialOffset(), 8u);

    if (size > (size_t)UINT32_MAX - sizeof(WasmAllocatorHeader))
        return NULL;

    totalSize = sizeof(WasmAllocatorHeader) + (uint64_t)size;
    end64 = (uint64_t)start + totalSize;
    if (end64 > UINT32_MAX)
        return NULL;

    end = (uint32_t)end64;
    if (!WasmAllocator_ensureCapacity(end))
        return NULL;

    header = (WasmAllocatorHeader*)(uintptr_t)start;
    header->size = (uint32_t)size;

    payload = start + (uint32_t)sizeof(WasmAllocatorHeader);
    g_wasmAllocatorOffset = end;
    return (void*)(uintptr_t)payload;
}

void free(void* ptr)
{
    (void)ptr;
}

void* realloc(void* ptr, size_t size)
{
    WasmAllocatorHeader* header;
    uint32_t oldSize;
    uint8_t* out;
    uint8_t* in;
    size_t index;

    if (!ptr)
        return malloc(size);

    if (size == 0) {
        free(ptr);
        return NULL;
    }

    header = (WasmAllocatorHeader*)((uint8_t*)ptr - sizeof(WasmAllocatorHeader));
    oldSize = header->size;

    if (size <= oldSize) {
        header->size = (uint32_t)size;
        return ptr;
    }

    out = (uint8_t*)malloc(size);
    if (!out)
        return NULL;

    in = (uint8_t*)ptr;
    for (index = 0; index < oldSize; ++index)
        out[index] = in[index];

    return out;
}
