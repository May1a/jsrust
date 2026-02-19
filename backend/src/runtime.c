#include "runtime.h"

#include "bytes.h"

static BackendStatus Runtime_error(const char* message)
{
    return BackendStatus_make(JSRUST_BACKEND_ERR_EXECUTE, ByteSpan_fromCString(message));
}

static bool Runtime_reserveCells(RuntimeContext* runtime, uint32_t required)
{
    RuntimeCell* next;
    uint32_t nextCap;
    uint32_t index;

    if (required <= runtime->cellCap)
        return true;

    nextCap = runtime->cellCap ? runtime->cellCap : 16;
    while (nextCap < required)
        nextCap *= 2;

    next = (RuntimeCell*)Arena_allocZero(runtime->arena, nextCap * sizeof(RuntimeCell), _Alignof(RuntimeCell));
    if (!next)
        return false;

    for (index = 0; index < runtime->cellCount; ++index)
        next[index] = runtime->cells[index];

    runtime->cells = next;
    runtime->cellCap = nextCap;
    return true;
}

static bool Runtime_reserveStructs(RuntimeContext* runtime, uint32_t required)
{
    RuntimeStructObject* next;
    uint32_t nextCap;
    uint32_t index;

    if (required <= runtime->structCap)
        return true;

    nextCap = runtime->structCap ? runtime->structCap : 16;
    while (nextCap < required)
        nextCap *= 2;

    next = (RuntimeStructObject*)Arena_allocZero(runtime->arena, nextCap * sizeof(RuntimeStructObject), _Alignof(RuntimeStructObject));
    if (!next)
        return false;

    for (index = 0; index < runtime->structCount; ++index)
        next[index] = runtime->structs[index];

    runtime->structs = next;
    runtime->structCap = nextCap;
    return true;
}

static bool Runtime_reserveEnums(RuntimeContext* runtime, uint32_t required)
{
    RuntimeEnumObject* next;
    uint32_t nextCap;
    uint32_t index;

    if (required <= runtime->enumCap)
        return true;

    nextCap = runtime->enumCap ? runtime->enumCap : 16;
    while (nextCap < required)
        nextCap *= 2;

    next = (RuntimeEnumObject*)Arena_allocZero(runtime->arena, nextCap * sizeof(RuntimeEnumObject), _Alignof(RuntimeEnumObject));
    if (!next)
        return false;

    for (index = 0; index < runtime->enumCount; ++index)
        next[index] = runtime->enums[index];

    runtime->enums = next;
    runtime->enumCap = nextCap;
    return true;
}

ExecValue ExecValue_makeUnit(void)
{
    ExecValue value;

    value.kind = ExecValueKind_Unit;
    value.i64 = 0;
    value.f64 = 0;
    value.b = 0;
    value.index = 0;
    value.aux = 0;
    return value;
}

ExecValue ExecValue_makeInt(int64_t number)
{
    ExecValue value;

    value = ExecValue_makeUnit();
    value.kind = ExecValueKind_Int;
    value.i64 = number;
    return value;
}

ExecValue ExecValue_makeFloat(double number)
{
    ExecValue value;

    value = ExecValue_makeUnit();
    value.kind = ExecValueKind_Float;
    value.f64 = number;
    return value;
}

ExecValue ExecValue_makeBool(uint8_t flag)
{
    ExecValue value;

    value = ExecValue_makeUnit();
    value.kind = ExecValueKind_Bool;
    value.b = flag ? 1 : 0;
    return value;
}

ExecValue ExecValue_makePtr(uint32_t cellIndex)
{
    ExecValue value;

    value = ExecValue_makeUnit();
    value.kind = ExecValueKind_Ptr;
    value.index = cellIndex;
    return value;
}

ExecValue ExecValue_makeStructRef(uint32_t index)
{
    ExecValue value;

    value = ExecValue_makeUnit();
    value.kind = ExecValueKind_StructRef;
    value.index = index;
    return value;
}

ExecValue ExecValue_makeEnumRef(uint32_t index)
{
    ExecValue value;

    value = ExecValue_makeUnit();
    value.kind = ExecValueKind_EnumRef;
    value.index = index;
    return value;
}

BackendStatus Runtime_init(RuntimeContext* runtime, Arena* arena, const IRModule* module, TraceBuffer* trace)
{
    uint32_t index;

    runtime->arena = arena;
    runtime->module = module;
    runtime->trace = trace;
    runtime->cells = NULL;
    runtime->cellCount = 0;
    runtime->cellCap = 0;
    runtime->structs = NULL;
    runtime->structCount = 0;
    runtime->structCap = 0;
    runtime->enums = NULL;
    runtime->enumCount = 0;
    runtime->enumCap = 0;
    runtime->recursionDepth = 0;
    runtime->recursionLimit = 512;

    if (module->globalCount > 0) {
        runtime->globals = (ExecValue*)Arena_allocZero(arena, module->globalCount * sizeof(ExecValue), _Alignof(ExecValue));
        if (!runtime->globals)
            return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for globals"));
    } else {
        runtime->globals = NULL;
    }

    for (index = 0; index < module->globalCount; ++index) {
        const IRGlobal* global;

        global = &module->globals[index];
        if (!global->hasInit) {
            runtime->globals[index] = ExecValue_makeUnit();
            continue;
        }

        switch (global->ty->kind) {
        case IRTypeKind_Int:
            runtime->globals[index] = ExecValue_makeInt(global->initInt);
            break;
        case IRTypeKind_Float:
            runtime->globals[index] = ExecValue_makeFloat(global->initFloat);
            break;
        case IRTypeKind_Bool:
            runtime->globals[index] = ExecValue_makeBool(global->initBool);
            break;
        default:
            return Runtime_error("unsupported global initializer type at runtime");
        }
    }

    return BackendStatus_ok();
}

const IRFunction* Runtime_findFunctionByEntry(const RuntimeContext* runtime, ByteSpan name)
{
    uint32_t index;

    for (index = 0; index < runtime->module->functionCount; ++index) {
        if (ByteSpan_equal(runtime->module->functions[index].name, name))
            return &runtime->module->functions[index];
    }

    return NULL;
}

const IRFunction* Runtime_findFunctionByHash(const RuntimeContext* runtime, uint32_t hashId)
{
    uint32_t index;

    for (index = 0; index < runtime->module->functionCount; ++index) {
        if (runtime->module->functions[index].syntheticId == hashId)
            return &runtime->module->functions[index];
    }

    return NULL;
}

BackendStatus Runtime_allocateCell(RuntimeContext* runtime, ExecValue initial, uint32_t* outIndex)
{
    RuntimeCell* cell;

    if (!Runtime_reserveCells(runtime, runtime->cellCount + 1))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for memory cell"));

    cell = &runtime->cells[runtime->cellCount];
    cell->occupied = 1;
    cell->value = initial;

    *outIndex = runtime->cellCount;
    runtime->cellCount += 1;
    return BackendStatus_ok();
}

BackendStatus Runtime_storeCell(RuntimeContext* runtime, uint32_t cellIndex, ExecValue value)
{
    if (cellIndex >= runtime->cellCount || !runtime->cells[cellIndex].occupied)
        return Runtime_error("invalid pointer cell for store");

    runtime->cells[cellIndex].value = value;
    return BackendStatus_ok();
}

BackendStatus Runtime_loadCell(RuntimeContext* runtime, uint32_t cellIndex, ExecValue* outValue)
{
    if (cellIndex >= runtime->cellCount || !runtime->cells[cellIndex].occupied)
        return Runtime_error("invalid pointer cell for load");

    *outValue = runtime->cells[cellIndex].value;
    return BackendStatus_ok();
}

BackendStatus Runtime_copyCell(RuntimeContext* runtime, uint32_t destIndex, uint32_t srcIndex)
{
    ExecValue source;
    BackendStatus status;

    status = Runtime_loadCell(runtime, srcIndex, &source);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    return Runtime_storeCell(runtime, destIndex, source);
}

BackendStatus Runtime_allocateStruct(RuntimeContext* runtime, const ExecValue* fields, uint32_t fieldCount, uint32_t* outIndex)
{
    RuntimeStructObject* object;
    uint32_t fieldIndex;

    if (!Runtime_reserveStructs(runtime, runtime->structCount + 1))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for struct object"));

    object = &runtime->structs[runtime->structCount];
    object->fieldCount = fieldCount;
    object->fields = NULL;

    if (fieldCount > 0) {
        object->fields = (ExecValue*)Arena_alloc(runtime->arena, fieldCount * sizeof(ExecValue), _Alignof(ExecValue));
        if (!object->fields)
            return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for struct fields"));
        for (fieldIndex = 0; fieldIndex < fieldCount; ++fieldIndex)
            object->fields[fieldIndex] = fields[fieldIndex];
    }

    *outIndex = runtime->structCount;
    runtime->structCount += 1;
    return BackendStatus_ok();
}

BackendStatus Runtime_readStructField(RuntimeContext* runtime, uint32_t structIndex, uint32_t fieldIndex, ExecValue* outValue)
{
    RuntimeStructObject* object;

    if (structIndex >= runtime->structCount)
        return Runtime_error("struct reference out of bounds");

    object = &runtime->structs[structIndex];
    if (fieldIndex >= object->fieldCount)
        return Runtime_error("struct field index out of bounds");

    *outValue = object->fields[fieldIndex];
    return BackendStatus_ok();
}

BackendStatus Runtime_allocateEnum(RuntimeContext* runtime, uint32_t tag, uint8_t hasData, ExecValue data, uint32_t* outIndex)
{
    RuntimeEnumObject* object;

    if (!Runtime_reserveEnums(runtime, runtime->enumCount + 1))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for enum object"));

    object = &runtime->enums[runtime->enumCount];
    object->tag = tag;
    object->hasData = hasData;
    object->data = data;

    *outIndex = runtime->enumCount;
    runtime->enumCount += 1;
    return BackendStatus_ok();
}

BackendStatus Runtime_readEnumTag(RuntimeContext* runtime, uint32_t enumIndex, uint32_t* outTag)
{
    if (enumIndex >= runtime->enumCount)
        return Runtime_error("enum reference out of bounds");

    *outTag = runtime->enums[enumIndex].tag;
    return BackendStatus_ok();
}

BackendStatus Runtime_readEnumData(RuntimeContext* runtime, uint32_t enumIndex, uint32_t expectedTag, ExecValue* outData)
{
    RuntimeEnumObject* object;

    if (enumIndex >= runtime->enumCount)
        return Runtime_error("enum reference out of bounds");

    object = &runtime->enums[enumIndex];
    if (object->tag != expectedTag)
        return Runtime_error("enum tag mismatch while reading payload");
    if (!object->hasData)
        return Runtime_error("enum payload requested but missing");

    *outData = object->data;
    return BackendStatus_ok();
}

bool Runtime_traceLiteral(RuntimeContext* runtime, const char* literal)
{
    return TraceBuffer_appendLiteral(runtime->trace, literal);
}

bool Runtime_traceU32(RuntimeContext* runtime, uint32_t value)
{
    return TraceBuffer_appendU32(runtime->trace, value);
}

bool Runtime_traceI64(RuntimeContext* runtime, int64_t value)
{
    return TraceBuffer_appendI64(runtime->trace, value);
}

bool Runtime_traceNewline(RuntimeContext* runtime)
{
    return TraceBuffer_appendNewline(runtime->trace);
}

