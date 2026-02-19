#include "ir_binary.h"

#include "bytes.h"

#define IR_MAGIC 0x52534A53u
#define IR_VERSION 1u
#define IR_HEADER_SIZE 28u
#define IR_MAX_TYPE_DEPTH 64u

typedef struct {
    Arena* arena;
    ByteSpan input;
    size_t pos;
    size_t sectionEnd;
    BackendStatus status;
    IRModule* module;
} IRReader;

static BackendStatus IRReader_error(jsrust_backend_error_code code, const char* message)
{
    return BackendStatus_make(code, ByteSpan_fromCString(message));
}

static bool IRReader_setError(IRReader* reader, jsrust_backend_error_code code, const char* message)
{
    if (reader->status.code == JSRUST_BACKEND_OK)
        reader->status = IRReader_error(code, message);
    return false;
}

static bool IRReader_canRead(IRReader* reader, size_t count)
{
    if (reader->pos + count < reader->pos)
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "integer overflow while reading input");

    if (reader->pos + count > reader->sectionEnd)
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "truncated binary input");

    return true;
}

static bool IRReader_readU8(IRReader* reader, uint8_t* out)
{
    if (!IRReader_canRead(reader, 1))
        return false;

    *out = reader->input.data[reader->pos];
    reader->pos += 1;
    return true;
}

static bool IRReader_readU32(IRReader* reader, uint32_t* out)
{
    uint32_t value;

    if (!IRReader_canRead(reader, 4))
        return false;

    value = (uint32_t)reader->input.data[reader->pos + 0];
    value |= (uint32_t)reader->input.data[reader->pos + 1] << 8;
    value |= (uint32_t)reader->input.data[reader->pos + 2] << 16;
    value |= (uint32_t)reader->input.data[reader->pos + 3] << 24;
    reader->pos += 4;
    *out = value;
    return true;
}

static bool IRReader_readU64(IRReader* reader, uint64_t* out)
{
    uint64_t value;
    size_t index;

    if (!IRReader_canRead(reader, 8))
        return false;

    value = 0;
    for (index = 0; index < 8; ++index)
        value |= (uint64_t)reader->input.data[reader->pos + index] << (8 * index);

    reader->pos += 8;
    *out = value;
    return true;
}

static bool IRReader_readI64(IRReader* reader, int64_t* out)
{
    uint64_t raw;

    if (!IRReader_readU64(reader, &raw))
        return false;

    *out = (int64_t)raw;
    return true;
}

static bool IRReader_readF64(IRReader* reader, double* out)
{
    union {
        uint64_t bits;
        double value;
    } cast;

    if (!IRReader_readU64(reader, &cast.bits))
        return false;

    *out = cast.value;
    return true;
}

static bool IRReader_readBytes(IRReader* reader, uint32_t count, const uint8_t** out)
{
    if (!IRReader_canRead(reader, count))
        return false;

    *out = reader->input.data + reader->pos;
    reader->pos += count;
    return true;
}

static bool IRReader_alloc(IRReader* reader, size_t size, size_t align, void** out)
{
    void* ptr;

    ptr = Arena_allocZero(reader->arena, size, align);
    if (!ptr)
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_INTERNAL, "arena allocation failed during parse");

    *out = ptr;
    return true;
}

static bool IRReader_getString(IRReader* reader, uint32_t id, ByteSpan* out)
{
    if (id >= reader->module->strings.count)
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "string id out of bounds");

    *out = reader->module->strings.items[id];
    return true;
}

static bool IRReader_readType(IRReader* reader, uint32_t depth, IRType** out);

static bool IRReader_readU32List(IRReader* reader, IRU32List* list)
{
    uint32_t count;
    uint32_t index;

    if (!IRReader_readU32(reader, &count))
        return false;

    list->count = count;
    if (count == 0) {
        list->items = NULL;
        return true;
    }

    if (!IRReader_alloc(reader, count * sizeof(uint32_t), _Alignof(uint32_t), (void**)&list->items))
        return false;

    for (index = 0; index < count; ++index) {
        if (!IRReader_readU32(reader, &list->items[index]))
            return false;
    }

    return true;
}

static bool IRReader_readType(IRReader* reader, uint32_t depth, IRType** out)
{
    IRType* type;
    uint8_t tag;
    uint32_t index;

    if (depth > IR_MAX_TYPE_DEPTH)
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "type nesting too deep");

    if (!IRReader_readU8(reader, &tag))
        return false;

    if (!IRReader_alloc(reader, sizeof(IRType), _Alignof(IRType), (void**)&type))
        return false;

    type->kind = tag;

    switch (tag) {
    case IRTypeKind_Int:
    case IRTypeKind_Float:
        if (!IRReader_readU8(reader, &type->width))
            return false;
        break;
    case IRTypeKind_Bool:
    case IRTypeKind_Ptr:
    case IRTypeKind_Unit:
        break;
    case IRTypeKind_Struct:
    case IRTypeKind_Enum: {
        if (!IRReader_readU32(reader, &type->nameStringId))
            return false;
        if (!IRReader_getString(reader, type->nameStringId, &type->name))
            return false;
        break;
    }
    case IRTypeKind_Array:
        if (!IRReader_readU32(reader, &type->arrayLength))
            return false;
        if (!IRReader_readType(reader, depth + 1, &type->elementType))
            return false;
        break;
    case IRTypeKind_Fn:
        if (!IRReader_readU32(reader, &type->fnParamCount))
            return false;

        if (type->fnParamCount > 0) {
            if (!IRReader_alloc(reader, type->fnParamCount * sizeof(IRType*), _Alignof(IRType*), (void**)&type->fnParamTypes))
                return false;

            for (index = 0; index < type->fnParamCount; ++index) {
                if (!IRReader_readType(reader, depth + 1, &type->fnParamTypes[index]))
                    return false;
            }
        }

        if (!IRReader_readType(reader, depth + 1, &type->fnReturnType))
            return false;
        break;
    default:
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "invalid type tag");
    }

    *out = type;
    return true;
}

static bool IRReader_readStrings(IRReader* reader, size_t start, size_t end)
{
    uint32_t count;
    uint32_t index;

    reader->pos = start;
    reader->sectionEnd = end;

    if (!IRReader_readU32(reader, &count))
        return false;

    reader->module->strings.count = count;
    if (count == 0) {
        reader->module->strings.items = NULL;
        return true;
    }

    if (!IRReader_alloc(reader, count * sizeof(ByteSpan), _Alignof(ByteSpan), (void**)&reader->module->strings.items))
        return false;

    for (index = 0; index < count; ++index) {
        const uint8_t* source;
        uint8_t* copy;
        uint32_t len;

        if (!IRReader_readU32(reader, &len))
            return false;

        if (!IRReader_readBytes(reader, len, &source))
            return false;

        if (len > 0) {
            if (!IRReader_alloc(reader, len, 1, (void**)&copy))
                return false;
            ByteOps_copy(copy, source, len);
            reader->module->strings.items[index] = ByteSpan_fromParts(copy, len);
        } else {
            reader->module->strings.items[index] = ByteSpan_fromParts(NULL, 0);
        }
    }

    return true;
}

static bool IRReader_readTypesSection(IRReader* reader, size_t start, size_t end)
{
    uint32_t structCount;
    uint32_t enumCount;
    uint32_t structIndex;
    uint32_t enumIndex;

    reader->pos = start;
    reader->sectionEnd = end;

    if (!IRReader_readU32(reader, &structCount))
        return false;

    reader->module->structCount = structCount;
    if (structCount > 0) {
        if (!IRReader_alloc(reader, structCount * sizeof(IRStructDef), _Alignof(IRStructDef), (void**)&reader->module->structs))
            return false;
    }

    for (structIndex = 0; structIndex < structCount; ++structIndex) {
        IRStructDef* def;
        uint32_t fieldIndex;

        def = &reader->module->structs[structIndex];
        if (!IRReader_readU32(reader, &def->nameStringId))
            return false;
        if (!IRReader_getString(reader, def->nameStringId, &def->name))
            return false;
        if (!IRReader_readU32(reader, &def->fieldCount))
            return false;

        if (def->fieldCount > 0) {
            if (!IRReader_alloc(reader, def->fieldCount * sizeof(IRType*), _Alignof(IRType*), (void**)&def->fields))
                return false;

            for (fieldIndex = 0; fieldIndex < def->fieldCount; ++fieldIndex) {
                if (!IRReader_readType(reader, 0, &def->fields[fieldIndex]))
                    return false;
            }
        }
    }

    if (!IRReader_readU32(reader, &enumCount))
        return false;

    reader->module->enumCount = enumCount;
    if (enumCount > 0) {
        if (!IRReader_alloc(reader, enumCount * sizeof(IREnumDef), _Alignof(IREnumDef), (void**)&reader->module->enums))
            return false;
    }

    for (enumIndex = 0; enumIndex < enumCount; ++enumIndex) {
        IREnumDef* def;
        uint32_t variantIndex;

        def = &reader->module->enums[enumIndex];
        if (!IRReader_readU32(reader, &def->nameStringId))
            return false;
        if (!IRReader_getString(reader, def->nameStringId, &def->name))
            return false;
        if (!IRReader_readU32(reader, &def->variantCount))
            return false;

        if (def->variantCount > 0) {
            if (!IRReader_alloc(reader, def->variantCount * sizeof(IREnumVariant), _Alignof(IREnumVariant), (void**)&def->variants))
                return false;

            for (variantIndex = 0; variantIndex < def->variantCount; ++variantIndex) {
                IREnumVariant* variant;
                uint32_t fieldIndex;

                variant = &def->variants[variantIndex];
                if (!IRReader_readU32(reader, &variant->fieldCount))
                    return false;

                if (variant->fieldCount > 0) {
                    if (!IRReader_alloc(reader, variant->fieldCount * sizeof(IRType*), _Alignof(IRType*), (void**)&variant->fields))
                        return false;

                    for (fieldIndex = 0; fieldIndex < variant->fieldCount; ++fieldIndex) {
                        if (!IRReader_readType(reader, 0, &variant->fields[fieldIndex]))
                            return false;
                    }
                }
            }
        }
    }

    return true;
}

static bool IRReader_readConstant(IRReader* reader, IRType* type, IRGlobal* global)
{
    switch (type->kind) {
    case IRTypeKind_Int:
        return IRReader_readI64(reader, &global->initInt);
    case IRTypeKind_Float:
        return IRReader_readF64(reader, &global->initFloat);
    case IRTypeKind_Bool:
        return IRReader_readU8(reader, &global->initBool);
    default:
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "unsupported global initializer type");
    }
}

static bool IRReader_readGlobals(IRReader* reader, size_t start, size_t end)
{
    uint32_t count;
    uint32_t index;

    reader->pos = start;
    reader->sectionEnd = end;

    if (!IRReader_readU32(reader, &count))
        return false;

    reader->module->globalCount = count;
    if (count > 0) {
        if (!IRReader_alloc(reader, count * sizeof(IRGlobal), _Alignof(IRGlobal), (void**)&reader->module->globals))
            return false;
    }

    for (index = 0; index < count; ++index) {
        IRGlobal* global;

        global = &reader->module->globals[index];
        if (!IRReader_readU32(reader, &global->nameStringId))
            return false;
        if (!IRReader_getString(reader, global->nameStringId, &global->name))
            return false;
        if (!IRReader_readType(reader, 0, &global->ty))
            return false;
        if (!IRReader_readU8(reader, &global->hasInit))
            return false;
        if (global->hasInit) {
            if (!IRReader_readConstant(reader, global->ty, global))
                return false;
        }
    }

    return true;
}

static bool IRReader_readInstruction(IRReader* reader, IRInstruction* inst)
{
    uint8_t opcode;

    if (!IRReader_readU8(reader, &opcode))
        return false;

    inst->kind = opcode;
    inst->hasResult = IRInstruction_hasResult(opcode);

    if (inst->hasResult) {
        if (!IRReader_readU32(reader, &inst->id))
            return false;
    }

    if (!IRReader_readType(reader, 0, &inst->ty))
        return false;

    switch (opcode) {
    case IRInstKind_Iconst:
        return IRReader_readI64(reader, &inst->intValue);
    case IRInstKind_Fconst:
        return IRReader_readF64(reader, &inst->floatValue);
    case IRInstKind_Bconst:
        return IRReader_readU8(reader, &inst->boolValue);
    case IRInstKind_Null:
        return true;
    case IRInstKind_Iadd:
    case IRInstKind_Isub:
    case IRInstKind_Imul:
    case IRInstKind_Idiv:
    case IRInstKind_Imod:
    case IRInstKind_Fadd:
    case IRInstKind_Fsub:
    case IRInstKind_Fmul:
    case IRInstKind_Fdiv:
    case IRInstKind_Iand:
    case IRInstKind_Ior:
    case IRInstKind_Ixor:
    case IRInstKind_Ishl:
    case IRInstKind_Ishr:
        return IRReader_readU32(reader, &inst->a) && IRReader_readU32(reader, &inst->b);
    case IRInstKind_Icmp:
    case IRInstKind_Fcmp:
        return IRReader_readU32(reader, &inst->a) && IRReader_readU32(reader, &inst->b) && IRReader_readU8(reader, &inst->compareOp);
    case IRInstKind_Ineg:
    case IRInstKind_Fneg:
        return IRReader_readU32(reader, &inst->a);
    case IRInstKind_Alloca:
        return IRReader_readU32(reader, &inst->localId);
    case IRInstKind_Load:
        return IRReader_readU32(reader, &inst->ptr);
    case IRInstKind_Store:
        return IRReader_readU32(reader, &inst->ptr) && IRReader_readU32(reader, &inst->value) && IRReader_readType(reader, 0, &inst->valueType);
    case IRInstKind_Memcpy:
        return IRReader_readU32(reader, &inst->dest) && IRReader_readU32(reader, &inst->src) && IRReader_readU32(reader, &inst->size);
    case IRInstKind_Gep:
        return IRReader_readU32(reader, &inst->ptr) && IRReader_readU32List(reader, &inst->indices);
    case IRInstKind_Ptradd:
        return IRReader_readU32(reader, &inst->ptr) && IRReader_readU32(reader, &inst->offset);
    case IRInstKind_Trunc:
    case IRInstKind_Sext:
    case IRInstKind_Zext:
        return IRReader_readU32(reader, &inst->val) && IRReader_readType(reader, 0, &inst->fromTy);
    case IRInstKind_Fptoui:
    case IRInstKind_Fptosi:
    case IRInstKind_Uitofp:
    case IRInstKind_Sitofp:
    case IRInstKind_Bitcast:
        return IRReader_readU32(reader, &inst->val);
    case IRInstKind_Call:
        return IRReader_readU32(reader, &inst->fn) && IRReader_readU32List(reader, &inst->callArgs);
    case IRInstKind_StructCreate:
        return IRReader_readU32List(reader, &inst->fields);
    case IRInstKind_StructGet:
        return IRReader_readU32(reader, &inst->structValue) && IRReader_readU32(reader, &inst->fieldIndex);
    case IRInstKind_EnumCreate:
        return IRReader_readU32(reader, &inst->variant) && IRReader_readU8(reader, &inst->hasData) && (!inst->hasData || IRReader_readU32(reader, &inst->data));
    case IRInstKind_EnumGetTag:
        return IRReader_readU32(reader, &inst->enumValue);
    case IRInstKind_EnumGetData:
        return IRReader_readU32(reader, &inst->enumValue) && IRReader_readU32(reader, &inst->variant) && IRReader_readU32(reader, &inst->index);
    default:
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "invalid instruction opcode");
    }
}

static bool IRReader_readTerminator(IRReader* reader, IRTerminator* term)
{
    uint8_t tag;

    if (!IRReader_readU8(reader, &tag))
        return false;

    term->kind = tag;

    switch (tag) {
    case IRTermKind_Ret:
        if (!IRReader_readU8(reader, &term->hasValue))
            return false;
        if (term->hasValue)
            return IRReader_readU32(reader, &term->value);
        return true;
    case IRTermKind_Br:
        return IRReader_readU32(reader, &term->target) && IRReader_readU32List(reader, &term->args);
    case IRTermKind_BrIf:
        return IRReader_readU32(reader, &term->cond) && IRReader_readU32(reader, &term->thenBlock) && IRReader_readU32List(reader, &term->thenArgs)
            && IRReader_readU32(reader, &term->elseBlock) && IRReader_readU32List(reader, &term->elseArgs);
    case IRTermKind_Switch: {
        uint32_t caseIndex;

        if (!IRReader_readU32(reader, &term->switchValue))
            return false;
        if (!IRReader_readU32(reader, &term->switchCaseCount))
            return false;

        if (term->switchCaseCount > 0) {
            if (!IRReader_alloc(reader, term->switchCaseCount * sizeof(IRTermSwitchCase), _Alignof(IRTermSwitchCase), (void**)&term->switchCases))
                return false;

            for (caseIndex = 0; caseIndex < term->switchCaseCount; ++caseIndex) {
                IRTermSwitchCase* item;

                item = &term->switchCases[caseIndex];
                if (!IRReader_readI64(reader, &item->value))
                    return false;
                if (!IRReader_readU32(reader, &item->target))
                    return false;
                if (!IRReader_readU32List(reader, &item->args))
                    return false;
            }
        }

        if (!IRReader_readU32(reader, &term->defaultBlock))
            return false;
        return IRReader_readU32List(reader, &term->defaultArgs);
    }
    case IRTermKind_Unreachable:
        return true;
    default:
        return IRReader_setError(reader, JSRUST_BACKEND_ERR_DESERIALIZE, "invalid terminator tag");
    }
}

static bool IRReader_readFunction(IRReader* reader, IRFunction* function)
{
    uint32_t index;

    if (!IRReader_readU32(reader, &function->nameStringId))
        return false;
    if (!IRReader_getString(reader, function->nameStringId, &function->name))
        return false;
    function->syntheticId = ByteSpan_hashFunctionId(function->name);

    if (!IRReader_readU32(reader, &function->paramCount))
        return false;
    if (function->paramCount > 0) {
        if (!IRReader_alloc(reader, function->paramCount * sizeof(IRValueParam), _Alignof(IRValueParam), (void**)&function->params))
            return false;
        for (index = 0; index < function->paramCount; ++index) {
            if (!IRReader_readType(reader, 0, &function->params[index].ty))
                return false;
            if (!IRReader_readU32(reader, &function->params[index].id))
                return false;
        }
    }

    if (!IRReader_readType(reader, 0, &function->returnType))
        return false;

    if (!IRReader_readU32(reader, &function->localCount))
        return false;
    if (function->localCount > 0) {
        if (!IRReader_alloc(reader, function->localCount * sizeof(IRValueParam), _Alignof(IRValueParam), (void**)&function->locals))
            return false;
        for (index = 0; index < function->localCount; ++index) {
            if (!IRReader_readType(reader, 0, &function->locals[index].ty))
                return false;
            if (!IRReader_readU32(reader, &function->locals[index].id))
                return false;
        }
    }

    if (!IRReader_readU32(reader, &function->blockCount))
        return false;
    if (function->blockCount > 0) {
        if (!IRReader_alloc(reader, function->blockCount * sizeof(IRBlock), _Alignof(IRBlock), (void**)&function->blocks))
            return false;
    }

    for (index = 0; index < function->blockCount; ++index) {
        IRBlock* block;
        uint32_t paramIndex;
        uint32_t instIndex;

        block = &function->blocks[index];
        if (!IRReader_readU32(reader, &block->id))
            return false;

        if (!IRReader_readU32(reader, &block->paramCount))
            return false;
        if (block->paramCount > 0) {
            if (!IRReader_alloc(reader, block->paramCount * sizeof(IRValueParam), _Alignof(IRValueParam), (void**)&block->params))
                return false;
            for (paramIndex = 0; paramIndex < block->paramCount; ++paramIndex) {
                if (!IRReader_readType(reader, 0, &block->params[paramIndex].ty))
                    return false;
                if (!IRReader_readU32(reader, &block->params[paramIndex].id))
                    return false;
            }
        }

        if (!IRReader_readU32(reader, &block->instructionCount))
            return false;
        if (block->instructionCount > 0) {
            if (!IRReader_alloc(reader, block->instructionCount * sizeof(IRInstruction), _Alignof(IRInstruction), (void**)&block->instructions))
                return false;
        }

        for (instIndex = 0; instIndex < block->instructionCount; ++instIndex) {
            if (!IRReader_readInstruction(reader, &block->instructions[instIndex]))
                return false;
        }

        if (!IRReader_readTerminator(reader, &block->terminator))
            return false;
    }

    return true;
}

static bool IRReader_readFunctions(IRReader* reader, size_t start, size_t end)
{
    uint32_t count;
    uint32_t index;

    reader->pos = start;
    reader->sectionEnd = end;

    if (!IRReader_readU32(reader, &count))
        return false;

    reader->module->functionCount = count;
    if (count > 0) {
        if (!IRReader_alloc(reader, count * sizeof(IRFunction), _Alignof(IRFunction), (void**)&reader->module->functions))
            return false;
    }

    for (index = 0; index < count; ++index) {
        if (!IRReader_readFunction(reader, &reader->module->functions[index]))
            return false;
    }

    return true;
}

IRReadResult IRBinary_readModule(Arena* arena, ByteSpan input)
{
    IRReadResult result;
    IRReader reader;
    uint32_t magic;
    uint32_t version;
    uint32_t flags;
    uint32_t stringOffset;
    uint32_t typesOffset;
    uint32_t globalsOffset;
    uint32_t functionsOffset;

    reader.arena = arena;
    reader.input = input;
    reader.pos = 0;
    reader.sectionEnd = input.len;
    reader.status = BackendStatus_ok();
    reader.module = NULL;

    result.status = BackendStatus_ok();
    result.module = NULL;

    if (!IRReader_alloc(&reader, sizeof(IRModule), _Alignof(IRModule), (void**)&reader.module)) {
        result.status = reader.status;
        return result;
    }

    if (input.len < IR_HEADER_SIZE) {
        result.status = IRReader_error(JSRUST_BACKEND_ERR_DESERIALIZE, "binary input shorter than 28-byte header");
        return result;
    }

    if (!IRReader_readU32(&reader, &magic) || !IRReader_readU32(&reader, &version) || !IRReader_readU32(&reader, &flags)
        || !IRReader_readU32(&reader, &stringOffset) || !IRReader_readU32(&reader, &typesOffset)
        || !IRReader_readU32(&reader, &globalsOffset) || !IRReader_readU32(&reader, &functionsOffset)) {
        result.status = reader.status;
        return result;
    }

    if (magic != IR_MAGIC) {
        result.status = IRReader_error(JSRUST_BACKEND_ERR_DESERIALIZE, "invalid binary magic");
        return result;
    }

    if (version != IR_VERSION) {
        result.status = IRReader_error(JSRUST_BACKEND_ERR_UNSUPPORTED_VERSION, "unsupported binary version");
        return result;
    }

    (void)flags;

    if (stringOffset < IR_HEADER_SIZE || stringOffset > typesOffset || typesOffset > globalsOffset || globalsOffset > functionsOffset
        || functionsOffset > input.len) {
        result.status = IRReader_error(JSRUST_BACKEND_ERR_DESERIALIZE, "invalid section offsets in header");
        return result;
    }

    if (!IRReader_readStrings(&reader, stringOffset, typesOffset)
        || !IRReader_readTypesSection(&reader, typesOffset, globalsOffset)
        || !IRReader_readGlobals(&reader, globalsOffset, functionsOffset)
        || !IRReader_readFunctions(&reader, functionsOffset, input.len)) {
        result.status = reader.status;
        return result;
    }

    result.module = reader.module;
    result.status = BackendStatus_ok();
    return result;
}
