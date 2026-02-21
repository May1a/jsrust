#include "exec_core.h"

#include "bytes.h"

static const char* g_builtinPrintlnName = "__jsrust_builtin_println_bytes";
static const char* g_builtinPrintName = "__jsrust_builtin_print_bytes";
static const char* g_builtinPrintlnFmtName = "__jsrust_builtin_println_fmt";
static const char* g_builtinPrintFmtName = "__jsrust_builtin_print_fmt";
static const char* g_builtinAssertFailName = "__jsrust_builtin_assert_fail";
static const char* g_builtinAllocName = "__jsrust_alloc";
static const char* g_builtinReallocName = "__jsrust_realloc";
static const char* g_builtinDeallocName = "__jsrust_dealloc";
static const char* g_builtinCopyNonOverlappingName = "__jsrust_copy_nonoverlapping";
static const char* g_builtinPanicBoundsName = "__jsrust_panic_bounds_check";

enum {
    FormatTag_String = 0,
    FormatTag_Int = 1,
    FormatTag_Float = 2,
    FormatTag_Bool = 3,
    FormatTag_Char = 4
};

typedef struct {
    uint32_t id;
    ExecValue value;
} FrameValue;

typedef struct {
    FrameValue* items;
    uint32_t len;
    uint32_t cap;
} FrameValueTable;

typedef struct {
    uint32_t localId;
    IRType* localType;
    uint32_t cellIndex;
} FrameLocal;

typedef struct {
    FrameLocal* items;
    uint32_t len;
    uint32_t cap;
} FrameLocalTable;

typedef struct {
    const IRFunction* function;
    FrameValueTable values;
    FrameLocalTable locals;
} ExecFrame;

typedef struct {
    RuntimeContext* runtime;
} ExecEngine;

static BackendStatus Exec_error(const char* message)
{
    return BackendStatus_make(JSRUST_BACKEND_ERR_EXECUTE, ByteSpan_fromCString(message));
}

static uint32_t Exec_hashNameToFunctionId(const char* name)
{
    int32_t hash;
    size_t index;
    int64_t nonNegative;

    hash = 0;
    index = 0;
    while (name[index] != '\0') {
        hash = (int32_t)(((hash << 5) - hash) + (int32_t)(unsigned char)name[index]);
        ++index;
    }

    nonNegative = (int64_t)hash;
    if (nonNegative < 0)
        nonNegative = -nonNegative;

    return (uint32_t)(nonNegative % 1000000);
}

static uint32_t Exec_builtinPrintlnId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinPrintlnName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinPrintId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinPrintName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinPrintlnFmtId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinPrintlnFmtName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinPrintFmtId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinPrintFmtName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinAssertFailId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinAssertFailName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinAllocId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinAllocName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinReallocId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinReallocName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinDeallocId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinDeallocName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinCopyNonOverlappingId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinCopyNonOverlappingName);
        initialized = true;
    }

    return cached;
}

static uint32_t Exec_builtinPanicBoundsId(void)
{
    static uint32_t cached;
    static bool initialized;

    if (!initialized) {
        cached = Exec_hashNameToFunctionId(g_builtinPanicBoundsName);
        initialized = true;
    }

    return cached;
}

static bool FrameValueTable_reserve(FrameValueTable* table, Arena* arena, uint32_t required)
{
    FrameValue* next;
    uint32_t nextCap;
    uint32_t index;

    if (required <= table->cap)
        return true;

    nextCap = table->cap ? table->cap : 16;
    while (nextCap < required)
        nextCap *= 2;

    next = (FrameValue*)Arena_alloc(arena, nextCap * sizeof(FrameValue), _Alignof(FrameValue));
    if (!next)
        return false;

    for (index = 0; index < table->len; ++index)
        next[index] = table->items[index];

    table->items = next;
    table->cap = nextCap;
    return true;
}

static BackendStatus FrameValueTable_set(ExecEngine* engine, FrameValueTable* table, uint32_t id, ExecValue value)
{
    uint32_t index;

    for (index = 0; index < table->len; ++index) {
        if (table->items[index].id == id) {
            table->items[index].value = value;
            return BackendStatus_ok();
        }
    }

    if (!FrameValueTable_reserve(table, engine->runtime->arena, table->len + 1))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for frame values"));

    table->items[table->len].id = id;
    table->items[table->len].value = value;
    table->len += 1;
    return BackendStatus_ok();
}

static bool FrameValueTable_get(const FrameValueTable* table, uint32_t id, ExecValue* outValue)
{
    uint32_t index;

    for (index = 0; index < table->len; ++index) {
        if (table->items[index].id == id) {
            *outValue = table->items[index].value;
            return true;
        }
    }

    return false;
}

static bool FrameLocalTable_reserve(FrameLocalTable* table, Arena* arena, uint32_t required)
{
    FrameLocal* next;
    uint32_t nextCap;
    uint32_t index;

    if (required <= table->cap)
        return true;

    nextCap = table->cap ? table->cap : 8;
    while (nextCap < required)
        nextCap *= 2;

    next = (FrameLocal*)Arena_alloc(arena, nextCap * sizeof(FrameLocal), _Alignof(FrameLocal));
    if (!next)
        return false;

    for (index = 0; index < table->len; ++index)
        next[index] = table->items[index];

    table->items = next;
    table->cap = nextCap;
    return true;
}

static FrameLocal* FrameLocalTable_find(FrameLocalTable* table, uint32_t localId)
{
    uint32_t index;

    for (index = 0; index < table->len; ++index) {
        if (table->items[index].localId == localId)
            return &table->items[index];
    }

    return NULL;
}

static BackendStatus FrameLocalTable_add(ExecEngine* engine, FrameLocalTable* table, uint32_t localId, IRType* localType)
{
    if (!FrameLocalTable_reserve(table, engine->runtime->arena, table->len + 1))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for frame locals"));

    table->items[table->len].localId = localId;
    table->items[table->len].localType = localType;
    table->items[table->len].cellIndex = UINT32_MAX;
    table->len += 1;
    return BackendStatus_ok();
}

static ExecValue Exec_defaultValueForType(IRType* type)
{
    if (!type)
        return ExecValue_makeUnit();

    switch (type->kind) {
    case IRTypeKind_Int:
        return ExecValue_makeInt(0);
    case IRTypeKind_Float:
        return ExecValue_makeFloat(0.0);
    case IRTypeKind_Bool:
        return ExecValue_makeBool(0);
    case IRTypeKind_Ptr:
        return ExecValue_makePtr(UINT32_MAX);
    default:
        return ExecValue_makeUnit();
    }
}

static BackendStatus ExecFrame_init(ExecEngine* engine, ExecFrame* frame, const IRFunction* function)
{
    uint32_t index;
    BackendStatus status;

    frame->function = function;
    frame->values.items = NULL;
    frame->values.len = 0;
    frame->values.cap = 0;
    frame->locals.items = NULL;
    frame->locals.len = 0;
    frame->locals.cap = 0;

    for (index = 0; index < function->localCount; ++index) {
        status = FrameLocalTable_add(engine, &frame->locals, function->locals[index].id, function->locals[index].ty);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    return BackendStatus_ok();
}

static BackendStatus ExecFrame_readValue(const ExecFrame* frame, uint32_t valueId, ExecValue* outValue)
{
    if (!FrameValueTable_get(&frame->values, valueId, outValue))
        return Exec_error("value id not found in frame");

    return BackendStatus_ok();
}

static bool Exec_intBinary(uint8_t op, int64_t a, int64_t b, int64_t* out)
{
    switch (op) {
    case IRInstKind_Iadd:
        *out = a + b;
        return true;
    case IRInstKind_Isub:
        *out = a - b;
        return true;
    case IRInstKind_Imul:
        *out = a * b;
        return true;
    case IRInstKind_Idiv:
        if (b == 0)
            return false;
        *out = a / b;
        return true;
    case IRInstKind_Imod:
        if (b == 0)
            return false;
        *out = a % b;
        return true;
    case IRInstKind_Iand:
        *out = a & b;
        return true;
    case IRInstKind_Ior:
        *out = a | b;
        return true;
    case IRInstKind_Ixor:
        *out = a ^ b;
        return true;
    case IRInstKind_Ishl:
        *out = a << b;
        return true;
    case IRInstKind_Ishr:
        *out = a >> b;
        return true;
    default:
        return false;
    }
}

static ExecValue Exec_compareInt(uint8_t op, int64_t left, int64_t right)
{
    switch (op) {
    case 0:
        return ExecValue_makeBool(left == right);
    case 1:
        return ExecValue_makeBool(left != right);
    case 2:
        return ExecValue_makeBool(left < right);
    case 3:
        return ExecValue_makeBool(left <= right);
    case 4:
        return ExecValue_makeBool(left > right);
    case 5:
        return ExecValue_makeBool(left >= right);
    case 6:
        return ExecValue_makeBool((uint64_t)left < (uint64_t)right);
    case 7:
        return ExecValue_makeBool((uint64_t)left <= (uint64_t)right);
    case 8:
        return ExecValue_makeBool((uint64_t)left > (uint64_t)right);
    case 9:
        return ExecValue_makeBool((uint64_t)left >= (uint64_t)right);
    }

    return ExecValue_makeBool(0);
}

static ExecValue Exec_compareFloat(uint8_t op, double left, double right)
{
    switch (op) {
    case 0:
        return ExecValue_makeBool(left == right);
    case 1:
        return ExecValue_makeBool(left != right);
    case 2:
        return ExecValue_makeBool(left < right);
    case 3:
        return ExecValue_makeBool(left <= right);
    case 4:
        return ExecValue_makeBool(left > right);
    case 5:
        return ExecValue_makeBool(left >= right);
    }

    return ExecValue_makeBool(0);
}

static BackendStatus Exec_traceInstruction(ExecEngine* engine, const IRInstruction* inst)
{
    if (!Runtime_traceLiteral(engine->runtime, "inst "))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    if (!Runtime_traceU32(engine->runtime, inst->kind))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    if (inst->hasResult) {
        if (!Runtime_traceLiteral(engine->runtime, " -> v"))
            return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
        if (!Runtime_traceU32(engine->runtime, inst->id))
            return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    }
    if (!Runtime_traceNewline(engine->runtime))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    return BackendStatus_ok();
}

static BackendStatus Exec_traceBlock(ExecEngine* engine, uint32_t blockId)
{
    if (!Runtime_traceLiteral(engine->runtime, "block "))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    if (!Runtime_traceU32(engine->runtime, blockId))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    if (!Runtime_traceNewline(engine->runtime))
        return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("trace append failed"));
    return BackendStatus_ok();
}

static const IRBlock* Exec_findBlock(const IRFunction* function, uint32_t blockId)
{
    uint32_t index;

    for (index = 0; index < function->blockCount; ++index) {
        if (function->blocks[index].id == blockId)
            return &function->blocks[index];
    }

    return NULL;
}

static BackendStatus Exec_jumpToBlock(ExecEngine* engine, ExecFrame* frame, const IRBlock** currentBlock, uint32_t targetBlockId, const IRU32List* args)
{
    const IRBlock* target;
    uint32_t index;

    target = Exec_findBlock(frame->function, targetBlockId);
    if (!target)
        return Exec_error("jump target block not found");

    if (target->paramCount != args->count)
        return Exec_error("jump argument count does not match block params");

    for (index = 0; index < target->paramCount; ++index) {
        ExecValue argValue;
        BackendStatus status;

        status = ExecFrame_readValue(frame, args->items[index], &argValue);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        status = FrameValueTable_set(engine, &frame->values, target->params[index].id, argValue);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    *currentBlock = target;
    return Exec_traceBlock(engine, target->id);
}

static BackendStatus Exec_executeInstruction(ExecEngine* engine, ExecFrame* frame, const IRInstruction* inst, ExecValue* outValue);

static BackendStatus Exec_executeFunction(ExecEngine* engine, const IRFunction* function, const ExecValue* args, uint32_t argCount, uint8_t* hasReturn, ExecValue* returnValue)
{
    ExecFrame frame;
    const IRBlock* currentBlock;
    uint32_t index;
    BackendStatus status;

    if (engine->runtime->recursionDepth >= engine->runtime->recursionLimit)
        return Exec_error("recursion limit exceeded");

    if (argCount != function->paramCount)
        return Exec_error("function argument count mismatch");

    engine->runtime->recursionDepth += 1;

    status = ExecFrame_init(engine, &frame, function);
    if (status.code != JSRUST_BACKEND_OK) {
        engine->runtime->recursionDepth -= 1;
        return status;
    }

    for (index = 0; index < argCount; ++index) {
        status = FrameValueTable_set(engine, &frame.values, function->params[index].id, args[index]);
        if (status.code != JSRUST_BACKEND_OK) {
            engine->runtime->recursionDepth -= 1;
            return status;
        }
    }

    currentBlock = &function->blocks[0];
    status = Exec_traceBlock(engine, currentBlock->id);
    if (status.code != JSRUST_BACKEND_OK) {
        engine->runtime->recursionDepth -= 1;
        return status;
    }

    while (true) {
        for (index = 0; index < currentBlock->instructionCount; ++index) {
            ExecValue value;

            status = Exec_traceInstruction(engine, &currentBlock->instructions[index]);
            if (status.code != JSRUST_BACKEND_OK) {
                engine->runtime->recursionDepth -= 1;
                return status;
            }

            status = Exec_executeInstruction(engine, &frame, &currentBlock->instructions[index], &value);
            if (status.code != JSRUST_BACKEND_OK) {
                engine->runtime->recursionDepth -= 1;
                return status;
            }

            if (currentBlock->instructions[index].hasResult) {
                status = FrameValueTable_set(engine, &frame.values, currentBlock->instructions[index].id, value);
                if (status.code != JSRUST_BACKEND_OK) {
                    engine->runtime->recursionDepth -= 1;
                    return status;
                }
            }
        }

        switch (currentBlock->terminator.kind) {
        case IRTermKind_Ret:
            if (currentBlock->terminator.hasValue) {
                status = ExecFrame_readValue(&frame, currentBlock->terminator.value, returnValue);
                if (status.code != JSRUST_BACKEND_OK) {
                    engine->runtime->recursionDepth -= 1;
                    return status;
                }
                *hasReturn = 1;
            } else {
                *hasReturn = 0;
                *returnValue = ExecValue_makeUnit();
            }
            engine->runtime->recursionDepth -= 1;
            return BackendStatus_ok();
        case IRTermKind_Br:
            status = Exec_jumpToBlock(engine, &frame, &currentBlock, currentBlock->terminator.target, &currentBlock->terminator.args);
            if (status.code != JSRUST_BACKEND_OK) {
                engine->runtime->recursionDepth -= 1;
                return status;
            }
            break;
        case IRTermKind_BrIf: {
            ExecValue cond;
            uint32_t target;
            const IRU32List* argsList;

            status = ExecFrame_readValue(&frame, currentBlock->terminator.cond, &cond);
            if (status.code != JSRUST_BACKEND_OK) {
                engine->runtime->recursionDepth -= 1;
                return status;
            }
            if (cond.kind != ExecValueKind_Bool) {
                engine->runtime->recursionDepth -= 1;
                return Exec_error("br_if condition is not bool");
            }

            if (cond.b) {
                target = currentBlock->terminator.thenBlock;
                argsList = &currentBlock->terminator.thenArgs;
            } else {
                target = currentBlock->terminator.elseBlock;
                argsList = &currentBlock->terminator.elseArgs;
            }

            status = Exec_jumpToBlock(engine, &frame, &currentBlock, target, argsList);
            if (status.code != JSRUST_BACKEND_OK) {
                engine->runtime->recursionDepth -= 1;
                return status;
            }
            break;
        }
        case IRTermKind_Switch: {
            ExecValue selector;
            uint32_t caseIndex;
            uint8_t matched;

            status = ExecFrame_readValue(&frame, currentBlock->terminator.switchValue, &selector);
            if (status.code != JSRUST_BACKEND_OK) {
                engine->runtime->recursionDepth -= 1;
                return status;
            }
            if (selector.kind != ExecValueKind_Int) {
                engine->runtime->recursionDepth -= 1;
                return Exec_error("switch selector is not integer");
            }

            matched = 0;
            for (caseIndex = 0; caseIndex < currentBlock->terminator.switchCaseCount; ++caseIndex) {
                if (currentBlock->terminator.switchCases[caseIndex].value == selector.i64) {
                    status = Exec_jumpToBlock(engine, &frame, &currentBlock, currentBlock->terminator.switchCases[caseIndex].target,
                        &currentBlock->terminator.switchCases[caseIndex].args);
                    if (status.code != JSRUST_BACKEND_OK) {
                        engine->runtime->recursionDepth -= 1;
                        return status;
                    }
                    matched = 1;
                    break;
                }
            }

            if (!matched) {
                status = Exec_jumpToBlock(engine, &frame, &currentBlock, currentBlock->terminator.defaultBlock, &currentBlock->terminator.defaultArgs);
                if (status.code != JSRUST_BACKEND_OK) {
                    engine->runtime->recursionDepth -= 1;
                    return status;
                }
            }
            break;
        }
        case IRTermKind_Unreachable:
            engine->runtime->recursionDepth -= 1;
            return Exec_error("entered unreachable terminator");
        default:
            engine->runtime->recursionDepth -= 1;
            return Exec_error("unknown terminator kind");
        }
    }
}

static BackendStatus Exec_readOperand(ExecFrame* frame, uint32_t valueId, ExecValue* outValue)
{
    return ExecFrame_readValue(frame, valueId, outValue);
}

static bool Exec_isZeroValue(ExecValue value)
{
    if (value.kind != ExecValueKind_Int)
        return false;
    return value.i64 == 0;
}

static BackendStatus Exec_readU32FromInt(ExecValue value, const char* message, uint32_t* outValue)
{
    if (value.kind != ExecValueKind_Int)
        return Exec_error(message);
    if (value.i64 < 0 || (uint64_t)value.i64 > UINT32_MAX)
        return Exec_error(message);
    *outValue = (uint32_t)value.i64;
    return BackendStatus_ok();
}

static BackendStatus Exec_pointerAddCells(
    RuntimeContext* runtime,
    ExecValue base,
    uint32_t offset,
    ExecValue* outPointer)
{
    uint64_t nextAux;
    uint64_t absolute;
    uint8_t ptrKind;

    if (base.kind != ExecValueKind_Ptr)
        return Exec_error("pointer arithmetic base is not pointer");
    if (base.index == UINT32_MAX) {
        if (offset != 0)
            return Exec_error("pointer arithmetic on null pointer");
        *outPointer = base;
        return BackendStatus_ok();
    }
    if (base.index >= runtime->cellCount)
        return Exec_error("pointer base out of bounds");

    ptrKind = Runtime_cellPtrKind(runtime, base.index);
    if (ptrKind == RuntimePtrKind_Invalid)
        return Exec_error("pointer base is invalid");

    nextAux = (uint64_t)base.aux + (uint64_t)offset;
    if (nextAux > UINT32_MAX)
        return Exec_error("pointer offset overflow");

    if (ptrKind == RuntimePtrKind_Heap) {
        absolute = (uint64_t)base.index + nextAux;
        if (absolute >= runtime->cellCount)
            return Exec_error("pointer offset out of bounds");
    }

    *outPointer = base;
    outPointer->b = 0;
    outPointer->aux = (uint32_t)nextAux;
    return BackendStatus_ok();
}

static BackendStatus Exec_loadPointerValue(
    RuntimeContext* runtime,
    ExecValue pointer,
    ExecValue* outValue)
{
    uint32_t absoluteIndex;
    ExecValue baseValue;
    uint8_t ptrKind;
    uint64_t absolute;

    if (pointer.kind != ExecValueKind_Ptr || pointer.index == UINT32_MAX)
        return Exec_error("load operand is not a valid pointer");
    if (pointer.index >= runtime->cellCount)
        return Exec_error("load pointer base out of bounds");

    ptrKind = Runtime_cellPtrKind(runtime, pointer.index);
    if (ptrKind == RuntimePtrKind_Invalid)
        return Exec_error("load pointer base is invalid");

    if (pointer.b != 0) {
        BackendStatus status;
        status = Runtime_loadCell(runtime, pointer.index, &baseValue);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (baseValue.kind != ExecValueKind_StructRef)
            return Exec_error("stack field pointer base is not struct reference");
        return Runtime_readStructField(runtime, baseValue.index, pointer.aux, outValue);
    }

    absolute = (uint64_t)pointer.index + (uint64_t)pointer.aux;
    if (absolute >= runtime->cellCount)
        return Exec_error("load pointer out of bounds");
    absoluteIndex = (uint32_t)absolute;
    return Runtime_loadCell(runtime, absoluteIndex, outValue);
}

static BackendStatus Exec_storePointerValue(
    RuntimeContext* runtime,
    ExecValue pointer,
    ExecValue value)
{
    uint32_t absoluteIndex;
    ExecValue baseValue;
    uint8_t ptrKind;
    uint64_t absolute;

    if (pointer.kind != ExecValueKind_Ptr || pointer.index == UINT32_MAX)
        return Exec_error("store operand is not a valid pointer");
    if (pointer.index >= runtime->cellCount)
        return Exec_error("store pointer base out of bounds");

    ptrKind = Runtime_cellPtrKind(runtime, pointer.index);
    if (ptrKind == RuntimePtrKind_Invalid)
        return Exec_error("store pointer base is invalid");

    if (pointer.b != 0) {
        BackendStatus status;
        status = Runtime_loadCell(runtime, pointer.index, &baseValue);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (baseValue.kind != ExecValueKind_StructRef)
            return Exec_error("stack field pointer base is not struct reference");
        return Runtime_writeStructField(runtime, baseValue.index, pointer.aux, value);
    }

    absolute = (uint64_t)pointer.index + (uint64_t)pointer.aux;
    if (absolute >= runtime->cellCount)
        return Exec_error("store pointer out of bounds");
    absoluteIndex = (uint32_t)absolute;
    return Runtime_storeCell(runtime, absoluteIndex, value);
}

static BackendStatus Exec_heapPointerToCellIndex(
    RuntimeContext* runtime,
    ExecValue pointer,
    const char* errorPrefix,
    uint32_t* outCellIndex)
{
    uint8_t ptrKind;
    uint64_t absolute;

    if (pointer.kind != ExecValueKind_Ptr)
        return Exec_error(errorPrefix);
    if (pointer.index == UINT32_MAX)
        return Exec_error(errorPrefix);
    if (pointer.b != 0)
        return Exec_error(errorPrefix);
    if (pointer.index >= runtime->cellCount)
        return Exec_error(errorPrefix);

    ptrKind = Runtime_cellPtrKind(runtime, pointer.index);
    if (ptrKind != RuntimePtrKind_Heap)
        return Exec_error(errorPrefix);

    absolute = (uint64_t)pointer.index + (uint64_t)pointer.aux;
    if (absolute >= runtime->cellCount)
        return Exec_error(errorPrefix);
    *outCellIndex = (uint32_t)absolute;
    return BackendStatus_ok();
}

static BackendStatus Exec_executeBuiltinPrint(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    bool appendNewline,
    ExecValue* outValue)
{
    uint32_t index;

    for (index = 0; index < inst->callArgs.count; ++index) {
        ExecValue value;
        BackendStatus status;

        status = Exec_readOperand(frame, inst->callArgs.items[index], &value);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (value.kind != ExecValueKind_Int)
            return Exec_error("print builtin argument must be integer byte");
        if (value.i64 < 0 || value.i64 > 255)
            return Exec_error("print builtin byte out of range");

        if (!Runtime_writeOutputByte(engine->runtime, (uint8_t)value.i64))
            return Exec_error("failed to write print builtin output");
    }

    if (appendNewline) {
        if (!Runtime_writeOutputByte(engine->runtime, (uint8_t)'\n'))
            return Exec_error("failed to write print builtin newline");
    }

    if (!Runtime_flushOutput(engine->runtime))
        return Exec_error("failed to flush print builtin output");

    *outValue = ExecValue_makeUnit();
    return BackendStatus_ok();
}

static BackendStatus Exec_writeByte(RuntimeContext* runtime, uint8_t byte)
{
    if (!Runtime_writeOutputByte(runtime, byte))
        return Exec_error("failed to write formatted output");
    return BackendStatus_ok();
}

static BackendStatus Exec_writeSpan(RuntimeContext* runtime, ByteSpan span)
{
    size_t index;
    BackendStatus status;

    for (index = 0; index < span.len; ++index) {
        status = Exec_writeByte(runtime, span.data[index]);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    return BackendStatus_ok();
}

static BackendStatus Exec_writeUnsignedDecimal(RuntimeContext* runtime, uint64_t value)
{
    uint8_t digits[32];
    size_t count;
    BackendStatus status;

    count = 0;
    do {
        digits[count] = (uint8_t)('0' + (value % 10u));
        value /= 10u;
        ++count;
    } while (value > 0u);

    while (count > 0) {
        --count;
        status = Exec_writeByte(runtime, digits[count]);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    return BackendStatus_ok();
}

static BackendStatus Exec_writeSignedDecimal(RuntimeContext* runtime, int64_t value)
{
    BackendStatus status;
    uint64_t magnitude;

    if (value < 0) {
        status = Exec_writeByte(runtime, (uint8_t)'-');
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        magnitude = (uint64_t)(-(value + 1)) + 1u;
    } else {
        magnitude = (uint64_t)value;
    }

    return Exec_writeUnsignedDecimal(runtime, magnitude);
}

static BackendStatus Exec_writeFloatDecimal(RuntimeContext* runtime, double value)
{
    BackendStatus status;
    uint64_t intPart;
    double fraction;
    uint8_t fractionDigits[6];
    size_t fractionCount;
    size_t index;

    if (value != value)
        return Exec_writeSpan(runtime, ByteSpan_fromCString("NaN"));

    if (value < 0.0) {
        status = Exec_writeByte(runtime, (uint8_t)'-');
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        value = -value;
    }

    intPart = (uint64_t)value;
    status = Exec_writeUnsignedDecimal(runtime, intPart);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    fraction = value - (double)intPart;
    if (fraction <= 0.0)
        return BackendStatus_ok();

    for (index = 0; index < 6; ++index) {
        uint32_t digit;

        fraction *= 10.0;
        digit = (uint32_t)fraction;
        if (digit > 9u)
            digit = 9u;
        fractionDigits[index] = (uint8_t)('0' + digit);
        fraction -= (double)digit;
    }

    fractionCount = 6;
    while (fractionCount > 0 && fractionDigits[fractionCount - 1] == (uint8_t)'0')
        --fractionCount;

    if (fractionCount == 0)
        return BackendStatus_ok();

    status = Exec_writeByte(runtime, (uint8_t)'.');
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    for (index = 0; index < fractionCount; ++index) {
        status = Exec_writeByte(runtime, fractionDigits[index]);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    return BackendStatus_ok();
}

static BackendStatus Exec_writeCodePointUtf8(RuntimeContext* runtime, uint32_t codePoint)
{
    if (codePoint <= 0x7Fu)
        return Exec_writeByte(runtime, (uint8_t)codePoint);

    if (codePoint <= 0x7FFu) {
        BackendStatus status;
        status = Exec_writeByte(runtime, (uint8_t)(0xC0u | (codePoint >> 6)));
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        return Exec_writeByte(runtime, (uint8_t)(0x80u | (codePoint & 0x3Fu)));
    }

    if (codePoint >= 0xD800u && codePoint <= 0xDFFFu)
        return Exec_error("invalid char code point (surrogate)");

    if (codePoint <= 0xFFFFu) {
        BackendStatus status;
        status = Exec_writeByte(runtime, (uint8_t)(0xE0u | (codePoint >> 12)));
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_writeByte(runtime, (uint8_t)(0x80u | ((codePoint >> 6) & 0x3Fu)));
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        return Exec_writeByte(runtime, (uint8_t)(0x80u | (codePoint & 0x3Fu)));
    }

    if (codePoint <= 0x10FFFFu) {
        BackendStatus status;
        status = Exec_writeByte(runtime, (uint8_t)(0xF0u | (codePoint >> 18)));
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_writeByte(runtime, (uint8_t)(0x80u | ((codePoint >> 12) & 0x3Fu)));
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_writeByte(runtime, (uint8_t)(0x80u | ((codePoint >> 6) & 0x3Fu)));
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        return Exec_writeByte(runtime, (uint8_t)(0x80u | (codePoint & 0x3Fu)));
    }

    return Exec_error("invalid char code point");
}

static BackendStatus Exec_writeFormattedValue(RuntimeContext* runtime, int64_t tag, ExecValue value)
{
    BackendStatus status;

    switch (tag) {
    case FormatTag_String: {
        ByteSpan literal;
        if (value.kind != ExecValueKind_StringRef)
            return Exec_error("format value for string tag is not string");
        status = Runtime_getStringLiteral(runtime, value.index, &literal);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        return Exec_writeSpan(runtime, literal);
    }
    case FormatTag_Int: {
        if (value.kind != ExecValueKind_Int)
            return Exec_error("format value for int tag is not integer");
        return Exec_writeSignedDecimal(runtime, value.i64);
    }
    case FormatTag_Float: {
        if (value.kind != ExecValueKind_Float)
            return Exec_error("format value for float tag is not float");
        return Exec_writeFloatDecimal(runtime, value.f64);
    }
    case FormatTag_Bool:
        if (value.kind != ExecValueKind_Bool)
            return Exec_error("format value for bool tag is not bool");
        if (value.b)
            return Exec_writeSpan(runtime, ByteSpan_fromCString("true"));
        return Exec_writeSpan(runtime, ByteSpan_fromCString("false"));
    case FormatTag_Char:
        if (value.kind != ExecValueKind_Int)
            return Exec_error("format value for char tag is not integer");
        if (value.i64 < 0 || value.i64 > 0x10FFFF)
            return Exec_error("char value out of Unicode range");
        return Exec_writeCodePointUtf8(runtime, (uint32_t)value.i64);
    default:
        return Exec_error("unknown format tag");
    }
}

static BackendStatus Exec_executeBuiltinPrintFmt(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    bool appendNewline,
    ExecValue* outValue)
{
    BackendStatus status;
    ExecValue formatValue;
    ByteSpan format;
    uint32_t argIndex;
    size_t index;

    if (inst->callArgs.count == 0)
        return Exec_error("format print builtin requires at least format string");

    status = Exec_readOperand(frame, inst->callArgs.items[0], &formatValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    if (formatValue.kind != ExecValueKind_StringRef)
        return Exec_error("format print first argument must be string literal");

    status = Runtime_getStringLiteral(engine->runtime, formatValue.index, &format);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    argIndex = 1;
    index = 0;
    while (index < format.len) {
        uint8_t byte;

        byte = format.data[index];
        if (byte == (uint8_t)'{') {
            if (index + 1 < format.len && format.data[index + 1] == (uint8_t)'{') {
                status = Exec_writeByte(engine->runtime, (uint8_t)'{');
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                index += 2;
                continue;
            }
            if (index + 1 < format.len && format.data[index + 1] == (uint8_t)'}') {
                ExecValue tagValue;
                ExecValue value;

                if (argIndex + 1 >= inst->callArgs.count)
                    return Exec_error("missing format argument for placeholder");

                status = Exec_readOperand(frame, inst->callArgs.items[argIndex], &tagValue);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                status = Exec_readOperand(frame, inst->callArgs.items[argIndex + 1], &value);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                if (tagValue.kind != ExecValueKind_Int)
                    return Exec_error("format tag argument must be integer");

                status = Exec_writeFormattedValue(engine->runtime, tagValue.i64, value);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;

                argIndex += 2;
                index += 2;
                continue;
            }
            return Exec_error("unsupported format token after '{'");
        }

        if (byte == (uint8_t)'}') {
            if (index + 1 < format.len && format.data[index + 1] == (uint8_t)'}') {
                status = Exec_writeByte(engine->runtime, (uint8_t)'}');
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                index += 2;
                continue;
            }
            return Exec_error("unescaped } in format string");
        }

        status = Exec_writeByte(engine->runtime, byte);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        ++index;
    }

    if (argIndex != inst->callArgs.count)
        return Exec_error("unused format arguments provided");

    if (appendNewline) {
        status = Exec_writeByte(engine->runtime, (uint8_t)'\n');
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    if (!Runtime_flushOutput(engine->runtime))
        return Exec_error("failed to flush format output");

    *outValue = ExecValue_makeUnit();
    return BackendStatus_ok();
}

static BackendStatus Exec_executeBuiltinAlloc(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    ExecValue* outValue)
{
    BackendStatus status;
    ExecValue countValue;
    uint32_t count;
    uint32_t startCell;

    if (inst->callArgs.count != 1)
        return Exec_error("alloc builtin expects one argument");

    status = Exec_readOperand(frame, inst->callArgs.items[0], &countValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readU32FromInt(countValue, "alloc count must be non-negative integer", &count);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    status = Runtime_allocateCells(
        engine->runtime,
        count,
        ExecValue_makeUnit(),
        RuntimePtrKind_Heap,
        &startCell);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    *outValue = ExecValue_makePtr(startCell);
    return BackendStatus_ok();
}

static BackendStatus Exec_executeBuiltinRealloc(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    ExecValue* outValue)
{
    BackendStatus status;
    ExecValue ptrValue;
    ExecValue oldCountValue;
    ExecValue newCountValue;
    uint32_t oldCount;
    uint32_t newCount;
    uint32_t newStart;

    if (inst->callArgs.count != 3)
        return Exec_error("realloc builtin expects three arguments");

    status = Exec_readOperand(frame, inst->callArgs.items[0], &ptrValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readOperand(frame, inst->callArgs.items[1], &oldCountValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readOperand(frame, inst->callArgs.items[2], &newCountValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    status = Exec_readU32FromInt(oldCountValue, "realloc old_count must be non-negative integer", &oldCount);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readU32FromInt(newCountValue, "realloc new_count must be non-negative integer", &newCount);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    if (newCount == 0) {
        if (oldCount > 0 && ptrValue.kind == ExecValueKind_Ptr && ptrValue.index != UINT32_MAX) {
            uint32_t oldStart;
            status = Exec_heapPointerToCellIndex(
                engine->runtime,
                ptrValue,
                "realloc pointer must be a valid heap pointer",
                &oldStart);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            status = Runtime_deallocateCells(engine->runtime, oldStart, oldCount, 1);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }
        *outValue = ExecValue_makePtr(UINT32_MAX);
        return BackendStatus_ok();
    }

    status = Runtime_allocateCells(
        engine->runtime,
        newCount,
        ExecValue_makeUnit(),
        RuntimePtrKind_Heap,
        &newStart);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    if (oldCount > 0 && ptrValue.kind == ExecValueKind_Ptr && ptrValue.index != UINT32_MAX) {
        uint32_t oldStart;
        uint32_t copyCount;
        status = Exec_heapPointerToCellIndex(
            engine->runtime,
            ptrValue,
            "realloc pointer must be a valid heap pointer",
            &oldStart);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        copyCount = oldCount < newCount ? oldCount : newCount;
        if (copyCount > 0) {
            status = Runtime_copyCells(engine->runtime, newStart, oldStart, copyCount);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }
        status = Runtime_deallocateCells(engine->runtime, oldStart, oldCount, 1);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    *outValue = ExecValue_makePtr(newStart);
    return BackendStatus_ok();
}

static BackendStatus Exec_executeBuiltinDealloc(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    ExecValue* outValue)
{
    BackendStatus status;
    ExecValue ptrValue;
    ExecValue countValue;
    uint32_t count;
    uint32_t startCell;

    if (inst->callArgs.count != 2)
        return Exec_error("dealloc builtin expects two arguments");

    status = Exec_readOperand(frame, inst->callArgs.items[0], &ptrValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readOperand(frame, inst->callArgs.items[1], &countValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readU32FromInt(countValue, "dealloc count must be non-negative integer", &count);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    if (count == 0 || ptrValue.index == UINT32_MAX) {
        *outValue = ExecValue_makeUnit();
        return BackendStatus_ok();
    }

    status = Exec_heapPointerToCellIndex(
        engine->runtime,
        ptrValue,
        "dealloc pointer must be a valid heap pointer",
        &startCell);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    status = Runtime_deallocateCells(engine->runtime, startCell, count, 1);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    *outValue = ExecValue_makeUnit();
    return BackendStatus_ok();
}

static BackendStatus Exec_executeBuiltinCopyNonOverlapping(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    ExecValue* outValue)
{
    BackendStatus status;
    ExecValue srcValue;
    ExecValue dstValue;
    ExecValue countValue;
    uint32_t count;
    uint32_t srcStart;
    uint32_t dstStart;

    if (inst->callArgs.count != 3)
        return Exec_error("copy_nonoverlapping builtin expects three arguments");

    status = Exec_readOperand(frame, inst->callArgs.items[0], &srcValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readOperand(frame, inst->callArgs.items[1], &dstValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readOperand(frame, inst->callArgs.items[2], &countValue);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_readU32FromInt(
        countValue,
        "copy_nonoverlapping count must be non-negative integer",
        &count);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    if (count == 0) {
        *outValue = ExecValue_makeUnit();
        return BackendStatus_ok();
    }

    status = Exec_heapPointerToCellIndex(
        engine->runtime,
        srcValue,
        "copy_nonoverlapping src must be a valid heap pointer",
        &srcStart);
    if (status.code != JSRUST_BACKEND_OK)
        return status;
    status = Exec_heapPointerToCellIndex(
        engine->runtime,
        dstValue,
        "copy_nonoverlapping dst must be a valid heap pointer",
        &dstStart);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    status = Runtime_copyCells(engine->runtime, dstStart, srcStart, count);
    if (status.code != JSRUST_BACKEND_OK)
        return status;

    *outValue = ExecValue_makeUnit();
    return BackendStatus_ok();
}

static BackendStatus Exec_executeBuiltinPanicBoundsCheck(
    ExecEngine* engine,
    ExecFrame* frame,
    const IRInstruction* inst,
    ExecValue* outValue)
{
    ExecValue ignored;
    BackendStatus status;

    if (inst->callArgs.count > 0) {
        status = Exec_readOperand(frame, inst->callArgs.items[0], &ignored);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }
    if (inst->callArgs.count > 1) {
        status = Exec_readOperand(frame, inst->callArgs.items[1], &ignored);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
    }

    (void)engine;
    (void)outValue;
    return Exec_error("index out of bounds");
}

static BackendStatus Exec_executeInstruction(ExecEngine* engine, ExecFrame* frame, const IRInstruction* inst, ExecValue* outValue)
{
    ExecValue left;
    ExecValue right;
    BackendStatus status;

    *outValue = ExecValue_makeUnit();

    switch (inst->kind) {
    case IRInstKind_Iconst:
        *outValue = ExecValue_makeInt(inst->intValue);
        return BackendStatus_ok();
    case IRInstKind_Fconst:
        *outValue = ExecValue_makeFloat(inst->floatValue);
        return BackendStatus_ok();
    case IRInstKind_Bconst:
        *outValue = ExecValue_makeBool(inst->boolValue);
        return BackendStatus_ok();
    case IRInstKind_Null:
        *outValue = ExecValue_makePtr(UINT32_MAX);
        return BackendStatus_ok();
    case IRInstKind_Sconst:
        *outValue = ExecValue_makeStringRef(inst->literalId);
        return BackendStatus_ok();
    case IRInstKind_Iadd:
    case IRInstKind_Isub:
    case IRInstKind_Imul:
    case IRInstKind_Idiv:
    case IRInstKind_Imod:
    case IRInstKind_Iand:
    case IRInstKind_Ior:
    case IRInstKind_Ixor:
    case IRInstKind_Ishl:
    case IRInstKind_Ishr: {
        int64_t result;

        status = Exec_readOperand(frame, inst->a, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->b, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Int || right.kind != ExecValueKind_Int)
            return Exec_error("integer operation on non-integer value");

        if (!Exec_intBinary(inst->kind, left.i64, right.i64, &result))
            return Exec_error("invalid integer binary operation (likely divide by zero)");

        *outValue = ExecValue_makeInt(result);
        return BackendStatus_ok();
    }
    case IRInstKind_Fadd:
    case IRInstKind_Fsub:
    case IRInstKind_Fmul:
    case IRInstKind_Fdiv:
        status = Exec_readOperand(frame, inst->a, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->b, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Float || right.kind != ExecValueKind_Float)
            return Exec_error("float operation on non-float value");

        if (inst->kind == IRInstKind_Fadd)
            *outValue = ExecValue_makeFloat(left.f64 + right.f64);
        else if (inst->kind == IRInstKind_Fsub)
            *outValue = ExecValue_makeFloat(left.f64 - right.f64);
        else if (inst->kind == IRInstKind_Fmul)
            *outValue = ExecValue_makeFloat(left.f64 * right.f64);
        else {
            if (right.f64 == 0.0)
                return Exec_error("float divide by zero");
            *outValue = ExecValue_makeFloat(left.f64 / right.f64);
        }
        return BackendStatus_ok();
    case IRInstKind_Icmp:
        status = Exec_readOperand(frame, inst->a, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->b, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Int || right.kind != ExecValueKind_Int)
            return Exec_error("icmp on non-integer values");
        *outValue = Exec_compareInt(inst->compareOp, left.i64, right.i64);
        return BackendStatus_ok();
    case IRInstKind_Fcmp:
        status = Exec_readOperand(frame, inst->a, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->b, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Float || right.kind != ExecValueKind_Float)
            return Exec_error("fcmp on non-float values");
        *outValue = Exec_compareFloat(inst->compareOp, left.f64, right.f64);
        return BackendStatus_ok();
    case IRInstKind_Ineg:
        status = Exec_readOperand(frame, inst->a, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Int)
            return Exec_error("ineg operand is not integer");
        *outValue = ExecValue_makeInt(-left.i64);
        return BackendStatus_ok();
    case IRInstKind_Fneg:
        status = Exec_readOperand(frame, inst->a, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Float)
            return Exec_error("fneg operand is not float");
        *outValue = ExecValue_makeFloat(-left.f64);
        return BackendStatus_ok();
    case IRInstKind_Alloca: {
        FrameLocal* local;

        local = FrameLocalTable_find(&frame->locals, inst->localId);
        if (!local) {
            status = FrameLocalTable_add(engine, &frame->locals, inst->localId, NULL);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            local = FrameLocalTable_find(&frame->locals, inst->localId);
            if (!local)
                return Exec_error("failed to create local slot for alloca");
        }

        if (local->cellIndex == UINT32_MAX) {
            uint32_t newCell;
            status = Runtime_allocateCell(engine->runtime, Exec_defaultValueForType(local->localType), &newCell);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            local->cellIndex = newCell;
        }

        *outValue = ExecValue_makePtr(local->cellIndex);
        return BackendStatus_ok();
    }
    case IRInstKind_Load:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        return Exec_loadPointerValue(engine->runtime, left, outValue);
    case IRInstKind_Store:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->value, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        return Exec_storePointerValue(engine->runtime, left, right);
    case IRInstKind_Memcpy:
        status = Exec_readOperand(frame, inst->dest, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->src, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Ptr || right.kind != ExecValueKind_Ptr)
            return Exec_error("memcpy operands must be pointers");
        if (left.index == UINT32_MAX || right.index == UINT32_MAX)
            return Exec_error("memcpy pointer is null");
        {
            ExecValue copied;
            status = Exec_loadPointerValue(engine->runtime, right, &copied);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            return Exec_storePointerValue(engine->runtime, left, copied);
        }
    case IRInstKind_Gep:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Ptr)
            return Exec_error("gep base is not a pointer");
        if (left.b != 0 && inst->indices.count == 1) {
            ExecValue indexValue;
            ExecValue pointeePointer;
            uint32_t offset;

            status = Exec_readOperand(frame, inst->indices.items[0], &indexValue);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            status = Exec_readU32FromInt(indexValue, "gep index must be non-negative integer", &offset);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            status = Exec_loadPointerValue(engine->runtime, left, &pointeePointer);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            if (pointeePointer.kind != ExecValueKind_Ptr)
                return Exec_error("gep field pointer does not reference pointer value");
            return Exec_pointerAddCells(engine->runtime, pointeePointer, offset, outValue);
        }
        if (
            inst->indices.count >= 2 &&
            left.index != UINT32_MAX &&
            Runtime_cellPtrKind(engine->runtime, left.index) == RuntimePtrKind_Stack
        ) {
            ExecValue firstIndex;
            ExecValue fieldIndex;
            uint32_t fieldOffset;

            status = Exec_readOperand(frame, inst->indices.items[0], &firstIndex);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            if (!Exec_isZeroValue(firstIndex))
                return Exec_error("stack field gep requires zero first index");
            status = Exec_readOperand(frame, inst->indices.items[1], &fieldIndex);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            status = Exec_readU32FromInt(
                fieldIndex,
                "stack field gep index must be non-negative integer",
                &fieldOffset);
            if (status.code != JSRUST_BACKEND_OK)
                return status;

            *outValue = left;
            outValue->b = 1;
            outValue->aux = fieldOffset;
            return BackendStatus_ok();
        }
        {
            uint32_t totalOffset;
            uint32_t i;
            totalOffset = 0;
            for (i = 0; i < inst->indices.count; ++i) {
                ExecValue idx;
                uint32_t offset;
                uint64_t sum;
                status = Exec_readOperand(frame, inst->indices.items[i], &idx);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                status = Exec_readU32FromInt(idx, "gep index must be non-negative integer", &offset);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                sum = (uint64_t)totalOffset + (uint64_t)offset;
                if (sum > UINT32_MAX)
                    return Exec_error("gep offset overflow");
                totalOffset = (uint32_t)sum;
            }
            return Exec_pointerAddCells(engine->runtime, left, totalOffset, outValue);
        }
    case IRInstKind_Ptradd:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->offset, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Ptr)
            return Exec_error("ptradd base is not a pointer");
        {
            uint32_t offset;
            status = Exec_readU32FromInt(right, "ptradd offset must be non-negative integer", &offset);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            return Exec_pointerAddCells(engine->runtime, left, offset, outValue);
        }
    case IRInstKind_Trunc:
    case IRInstKind_Sext:
    case IRInstKind_Zext:
        status = Exec_readOperand(frame, inst->val, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Int)
            return Exec_error("integer cast operand is not integer");
        *outValue = ExecValue_makeInt(left.i64);
        return BackendStatus_ok();
    case IRInstKind_Fptoui:
    case IRInstKind_Fptosi:
        status = Exec_readOperand(frame, inst->val, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Float)
            return Exec_error("float-to-int cast operand is not float");
        *outValue = ExecValue_makeInt((int64_t)left.f64);
        return BackendStatus_ok();
    case IRInstKind_Uitofp:
    case IRInstKind_Sitofp:
        status = Exec_readOperand(frame, inst->val, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Int)
            return Exec_error("int-to-float cast operand is not integer");
        *outValue = ExecValue_makeFloat((double)left.i64);
        return BackendStatus_ok();
    case IRInstKind_Bitcast:
        status = Exec_readOperand(frame, inst->val, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        *outValue = left;
        return BackendStatus_ok();
    case IRInstKind_Call:
    case IRInstKind_CallDyn: {
        const IRFunction* callee;
        ExecValue* callArgs;
        uint8_t hasReturn;
        ExecValue callReturn;
        uint32_t calleeHash;

        calleeHash = inst->fn;
        if (inst->kind == IRInstKind_CallDyn) {
            ExecValue calleeValue;
            status = Exec_readOperand(frame, inst->fn, &calleeValue);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            if (calleeValue.kind != ExecValueKind_Int)
                return Exec_error("dynamic call callee is not integer function id");
            calleeHash = (uint32_t)calleeValue.i64;
        }

        callee = Runtime_findFunctionByHash(engine->runtime, calleeHash);
        if (!callee) {
            if (calleeHash == Exec_builtinPrintlnId())
                return Exec_executeBuiltinPrint(engine, frame, inst, true, outValue);
            if (calleeHash == Exec_builtinPrintId())
                return Exec_executeBuiltinPrint(engine, frame, inst, false, outValue);
            if (calleeHash == Exec_builtinPrintlnFmtId())
                return Exec_executeBuiltinPrintFmt(engine, frame, inst, true, outValue);
            if (calleeHash == Exec_builtinPrintFmtId())
                return Exec_executeBuiltinPrintFmt(engine, frame, inst, false, outValue);
            if (calleeHash == Exec_builtinAssertFailId())
                return Exec_error("assertion failed: assert_eq!");
            if (calleeHash == Exec_builtinAllocId())
                return Exec_executeBuiltinAlloc(engine, frame, inst, outValue);
            if (calleeHash == Exec_builtinReallocId())
                return Exec_executeBuiltinRealloc(engine, frame, inst, outValue);
            if (calleeHash == Exec_builtinDeallocId())
                return Exec_executeBuiltinDealloc(engine, frame, inst, outValue);
            if (calleeHash == Exec_builtinCopyNonOverlappingId())
                return Exec_executeBuiltinCopyNonOverlapping(engine, frame, inst, outValue);
            if (calleeHash == Exec_builtinPanicBoundsId())
                return Exec_executeBuiltinPanicBoundsCheck(engine, frame, inst, outValue);
            return Exec_error("call target function id not found");
        }

        callArgs = NULL;
        if (inst->callArgs.count > 0) {
            callArgs = (ExecValue*)Arena_alloc(engine->runtime->arena, inst->callArgs.count * sizeof(ExecValue), _Alignof(ExecValue));
            if (!callArgs)
                return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for call args"));
        }

        for (uint32_t i = 0; i < inst->callArgs.count; ++i) {
            status = Exec_readOperand(frame, inst->callArgs.items[i], &callArgs[i]);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }

        status = Exec_executeFunction(engine, callee, callArgs, inst->callArgs.count, &hasReturn, &callReturn);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        if (hasReturn)
            *outValue = callReturn;
        else
            *outValue = ExecValue_makeUnit();

        return BackendStatus_ok();
    }
    case IRInstKind_StructCreate: {
        ExecValue* fields;
        uint32_t structIndex;

        fields = NULL;
        if (inst->fields.count > 0) {
            fields = (ExecValue*)Arena_alloc(engine->runtime->arena, inst->fields.count * sizeof(ExecValue), _Alignof(ExecValue));
            if (!fields)
                return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString("arena allocation failed for struct create"));
        }

        for (uint32_t i = 0; i < inst->fields.count; ++i) {
            status = Exec_readOperand(frame, inst->fields.items[i], &fields[i]);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }

        status = Runtime_allocateStruct(engine->runtime, fields, inst->fields.count, &structIndex);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        *outValue = ExecValue_makeStructRef(structIndex);
        return BackendStatus_ok();
    }
    case IRInstKind_StructGet:
        status = Exec_readOperand(frame, inst->structValue, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_StructRef)
            return Exec_error("struct_get source is not a struct reference");
        return Runtime_readStructField(engine->runtime, left.index, inst->fieldIndex, outValue);
    case IRInstKind_EnumCreate: {
        ExecValue payload;
        uint32_t enumIndex;

        payload = ExecValue_makeUnit();
        if (inst->hasData) {
            status = Exec_readOperand(frame, inst->data, &payload);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }

        status = Runtime_allocateEnum(engine->runtime, inst->variant, inst->hasData, payload, &enumIndex);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        *outValue = ExecValue_makeEnumRef(enumIndex);
        return BackendStatus_ok();
    }
    case IRInstKind_EnumGetTag: {
        uint32_t tag;

        status = Exec_readOperand(frame, inst->enumValue, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_EnumRef)
            return Exec_error("enum_get_tag source is not enum reference");

        status = Runtime_readEnumTag(engine->runtime, left.index, &tag);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        *outValue = ExecValue_makeInt((int64_t)tag);
        return BackendStatus_ok();
    }
    case IRInstKind_EnumGetData:
        status = Exec_readOperand(frame, inst->enumValue, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_EnumRef)
            return Exec_error("enum_get_data source is not enum reference");
        return Runtime_readEnumData(engine->runtime, left.index, inst->variant, outValue);
    default:
        return Exec_error("unsupported opcode in interpreter");
    }
}

ExecCoreResult ExecCore_run(RuntimeContext* runtime, ByteSpan entryName)
{
    ExecEngine engine;
    const IRFunction* entry;
    uint8_t hasReturn;
    ExecValue returnValue;
    BackendStatus status;
    ExecCoreResult result;

    engine.runtime = runtime;

    result.status = BackendStatus_ok();
    result.exitValue = 0;
    result.hasExitValue = false;

    entry = Runtime_findFunctionByEntry(runtime, entryName);
    if (!entry) {
        result.status = Exec_error("entry function not found");
        return result;
    }

    status = Exec_executeFunction(&engine, entry, NULL, 0, &hasReturn, &returnValue);
    if (status.code != JSRUST_BACKEND_OK) {
        result.status = status;
        return result;
    }

    if (hasReturn && returnValue.kind == ExecValueKind_Int) {
        result.hasExitValue = true;
        result.exitValue = returnValue.i64;
    }

    return result;
}
