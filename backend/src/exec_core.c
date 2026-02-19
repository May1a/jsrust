#include "exec_core.h"

#include "bytes.h"

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
        if (left.kind != ExecValueKind_Ptr || left.index == UINT32_MAX)
            return Exec_error("load operand is not a valid pointer");
        return Runtime_loadCell(engine->runtime, left.index, outValue);
    case IRInstKind_Store:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->value, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Ptr || left.index == UINT32_MAX)
            return Exec_error("store operand is not a valid pointer");
        return Runtime_storeCell(engine->runtime, left.index, right);
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
        return Runtime_copyCell(engine->runtime, left.index, right.index);
    case IRInstKind_Gep:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Ptr)
            return Exec_error("gep base is not a pointer");
        for (uint32_t i = 0; i < inst->indices.count; ++i) {
            ExecValue idx;
            status = Exec_readOperand(frame, inst->indices.items[i], &idx);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            if (!Exec_isZeroValue(idx))
                return Exec_error("gep currently supports only zero offsets");
        }
        *outValue = left;
        return BackendStatus_ok();
    case IRInstKind_Ptradd:
        status = Exec_readOperand(frame, inst->ptr, &left);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = Exec_readOperand(frame, inst->offset, &right);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (left.kind != ExecValueKind_Ptr)
            return Exec_error("ptradd base is not a pointer");
        if (!Exec_isZeroValue(right))
            return Exec_error("ptradd currently supports only zero offset");
        *outValue = left;
        return BackendStatus_ok();
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
    case IRInstKind_Call: {
        const IRFunction* callee;
        ExecValue* callArgs;
        uint8_t hasReturn;
        ExecValue callReturn;

        callee = Runtime_findFunctionByHash(engine->runtime, inst->fn);
        if (!callee)
            return Exec_error("call target function id not found");

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
