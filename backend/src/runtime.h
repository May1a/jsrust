#pragma once

#include "arena.h"
#include "errors.h"
#include "ir_model.h"
#include "trace.h"

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    ExecValueKind_Unit = 0,
    ExecValueKind_Int = 1,
    ExecValueKind_Float = 2,
    ExecValueKind_Bool = 3,
    ExecValueKind_Ptr = 4,
    ExecValueKind_StructRef = 5,
    ExecValueKind_EnumRef = 6
} ExecValueKind;

typedef struct {
    uint8_t kind;
    int64_t i64;
    double f64;
    uint8_t b;
    uint32_t index;
    uint32_t aux;
} ExecValue;

typedef struct {
    ExecValue value;
    uint8_t occupied;
} RuntimeCell;

typedef struct {
    uint32_t fieldCount;
    ExecValue* fields;
} RuntimeStructObject;

typedef struct {
    uint32_t tag;
    uint8_t hasData;
    ExecValue data;
} RuntimeEnumObject;

typedef struct {
    Arena* arena;
    const IRModule* module;
    TraceBuffer* trace;
    void* outputContext;
    bool (*outputWriteByte)(void* context, uint8_t value);
    bool (*outputFlush)(void* context);

    ExecValue* globals;

    RuntimeCell* cells;
    uint32_t cellCount;
    uint32_t cellCap;

    RuntimeStructObject* structs;
    uint32_t structCount;
    uint32_t structCap;

    RuntimeEnumObject* enums;
    uint32_t enumCount;
    uint32_t enumCap;

    uint32_t recursionDepth;
    uint32_t recursionLimit;
} RuntimeContext;

typedef struct {
    void* context;
    bool (*writeByte)(void* context, uint8_t value);
    bool (*flush)(void* context);
} RuntimeOutputSink;

ExecValue ExecValue_makeUnit(void);
ExecValue ExecValue_makeInt(int64_t value);
ExecValue ExecValue_makeFloat(double value);
ExecValue ExecValue_makeBool(uint8_t value);
ExecValue ExecValue_makePtr(uint32_t cellIndex);
ExecValue ExecValue_makeStructRef(uint32_t index);
ExecValue ExecValue_makeEnumRef(uint32_t index);

BackendStatus Runtime_init(
    RuntimeContext* runtime,
    Arena* arena,
    const IRModule* module,
    TraceBuffer* trace,
    const RuntimeOutputSink* output);
const IRFunction* Runtime_findFunctionByEntry(const RuntimeContext* runtime, ByteSpan name);
const IRFunction* Runtime_findFunctionByHash(const RuntimeContext* runtime, uint32_t hashId);

BackendStatus Runtime_allocateCell(RuntimeContext* runtime, ExecValue initial, uint32_t* outIndex);
BackendStatus Runtime_storeCell(RuntimeContext* runtime, uint32_t cellIndex, ExecValue value);
BackendStatus Runtime_loadCell(RuntimeContext* runtime, uint32_t cellIndex, ExecValue* outValue);
BackendStatus Runtime_copyCell(RuntimeContext* runtime, uint32_t destIndex, uint32_t srcIndex);

BackendStatus Runtime_allocateStruct(RuntimeContext* runtime, const ExecValue* fields, uint32_t fieldCount, uint32_t* outIndex);
BackendStatus Runtime_readStructField(RuntimeContext* runtime, uint32_t structIndex, uint32_t fieldIndex, ExecValue* outValue);

BackendStatus Runtime_allocateEnum(RuntimeContext* runtime, uint32_t tag, uint8_t hasData, ExecValue data, uint32_t* outIndex);
BackendStatus Runtime_readEnumTag(RuntimeContext* runtime, uint32_t enumIndex, uint32_t* outTag);
BackendStatus Runtime_readEnumData(RuntimeContext* runtime, uint32_t enumIndex, uint32_t expectedTag, ExecValue* outData);

bool Runtime_traceLiteral(RuntimeContext* runtime, const char* literal);
bool Runtime_traceU32(RuntimeContext* runtime, uint32_t value);
bool Runtime_traceI64(RuntimeContext* runtime, int64_t value);
bool Runtime_traceNewline(RuntimeContext* runtime);
bool Runtime_writeOutputByte(RuntimeContext* runtime, uint8_t value);
bool Runtime_flushOutput(RuntimeContext* runtime);
