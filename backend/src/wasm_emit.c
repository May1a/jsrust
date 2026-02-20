#include "wasm_emit.h"

#include "bytes.h"
#include "vec.h"
#include "wasm_encode.h"

#include <stdio.h>
#include <stdint.h>

enum {
    WasmValType_I32 = 0x7F,
    WasmValType_I64 = 0x7E,
    WasmValType_F64 = 0x7C,
    WasmBlockType_Void = 0x40
};

enum {
    WasmSection_Type = 1,
    WasmSection_Import = 2,
    WasmSection_Function = 3,
    WasmSection_Export = 7,
    WasmSection_Code = 10
};

enum {
    WasmOp_Unreachable = 0x00,
    WasmOp_Block = 0x02,
    WasmOp_Loop = 0x03,
    WasmOp_If = 0x04,
    WasmOp_Else = 0x05,
    WasmOp_End = 0x0B,
    WasmOp_Br = 0x0C,
    WasmOp_Return = 0x0F,
    WasmOp_Call = 0x10,
    WasmOp_Drop = 0x1A,
    WasmOp_LocalGet = 0x20,
    WasmOp_LocalSet = 0x21,
    WasmOp_I32Const = 0x41,
    WasmOp_I64Const = 0x42,
    WasmOp_F64Const = 0x44,
    WasmOp_I32Eqz = 0x45,
    WasmOp_I32Eq = 0x46,
    WasmOp_I64Eq = 0x51,
    WasmOp_I64Ne = 0x52,
    WasmOp_I64LtS = 0x53,
    WasmOp_I64LeS = 0x54,
    WasmOp_I64GtS = 0x55,
    WasmOp_I64GeS = 0x56,
    WasmOp_F64Eq = 0x61,
    WasmOp_F64Ne = 0x62,
    WasmOp_F64Lt = 0x63,
    WasmOp_F64Le = 0x64,
    WasmOp_F64Gt = 0x65,
    WasmOp_F64Ge = 0x66,
    WasmOp_I32And = 0x71,
    WasmOp_I64Add = 0x7C,
    WasmOp_I64Sub = 0x7D,
    WasmOp_I64Mul = 0x7E,
    WasmOp_I64DivS = 0x7F,
    WasmOp_I64RemS = 0x81,
    WasmOp_I64And = 0x83,
    WasmOp_I64Or = 0x84,
    WasmOp_I64Xor = 0x85,
    WasmOp_I64Shl = 0x86,
    WasmOp_I64ShrS = 0x87,
    WasmOp_F64Add = 0xA0,
    WasmOp_F64Sub = 0xA1,
    WasmOp_F64Mul = 0xA2,
    WasmOp_F64Div = 0xA3,
    WasmOp_I32WrapI64 = 0xA7,
    WasmOp_I64TruncF64S = 0xB0,
    WasmOp_F64ConvertI64S = 0xB9
};

enum {
    WasmConst_None = 0,
    WasmConst_Int = 1,
    WasmConst_Float = 2,
    WasmConst_Bool = 3,
    WasmConst_String = 4
};

enum {
    WasmFormatTag_String = 0,
    WasmFormatTag_Int = 1,
    WasmFormatTag_Float = 2,
    WasmFormatTag_Bool = 3,
    WasmFormatTag_Char = 4
};

typedef struct {
    uint32_t id;
    uint32_t localIndex;
    uint8_t wasmType;
    uint8_t constKind;
    int64_t constInt;
    double constFloat;
    uint32_t constStringId;
} WasmValueMap;

typedef struct {
    uint32_t blockId;
    uint32_t ordinal;
    const IRBlock* block;
} WasmBlockMap;

ARENA_VEC_DECLARE(WasmValueMapVec, WasmValueMap)
ARENA_VEC_DECLARE(WasmBlockMapVec, WasmBlockMap)

typedef struct {
    Arena* arena;
    const IRModule* module;
    ByteSpan entryName;
    const IRFunction* entryFunction;
    uint32_t importWriteByteIndex;
    uint32_t importFlushIndex;
} WasmEmitContext;

typedef struct {
    WasmEmitContext* context;
    const IRFunction* function;
    uint32_t functionOrdinal;
    uint32_t functionIndex;
    uint8_t returnType;
    uint32_t currentBlockLocal;
    uint32_t localCount;
    uint8_t* localTypes;
    WasmValueMapVec values;
    WasmBlockMapVec blocks;
} WasmFunctionLowering;

static const char* g_builtinPrintlnName = "__jsrust_builtin_println_bytes";
static const char* g_builtinPrintName = "__jsrust_builtin_print_bytes";
static const char* g_builtinPrintlnFmtName = "__jsrust_builtin_println_fmt";
static const char* g_builtinPrintFmtName = "__jsrust_builtin_print_fmt";

static BackendStatus WasmEmit_validateError(const char* message)
{
    return BackendStatus_make(JSRUST_BACKEND_ERR_VALIDATE, ByteSpan_fromCString(message));
}

static BackendStatus WasmEmit_internalError(const char* message)
{
    return BackendStatus_make(JSRUST_BACKEND_ERR_INTERNAL, ByteSpan_fromCString(message));
}

static uint8_t WasmEmit_typeFromIR(const IRType* type, bool* isVoid)
{
    if (isVoid)
        *isVoid = false;

    if (!type) {
        if (isVoid)
            *isVoid = true;
        return WasmBlockType_Void;
    }

    switch (type->kind) {
    case IRTypeKind_Int:
        return WasmValType_I64;
    case IRTypeKind_Bool:
        return WasmValType_I32;
    case IRTypeKind_Float:
        return WasmValType_F64;
    case IRTypeKind_Unit:
        if (isVoid)
            *isVoid = true;
        return WasmBlockType_Void;
    default:
        return 0;
    }
}

static const IRFunction* WasmEmit_findFunctionByName(const IRModule* module, ByteSpan name)
{
    uint32_t index;

    for (index = 0; index < module->functionCount; ++index) {
        if (ByteSpan_equal(module->functions[index].name, name))
            return &module->functions[index];
    }

    return NULL;
}

static const IRFunction* WasmEmit_findFunctionByHash(const IRModule* module, uint32_t hashId, uint32_t* outOrdinal)
{
    uint32_t index;

    for (index = 0; index < module->functionCount; ++index) {
        if (module->functions[index].syntheticId == hashId) {
            if (outOrdinal)
                *outOrdinal = index;
            return &module->functions[index];
        }
    }

    return NULL;
}

static WasmValueMap* WasmFunctionLowering_findValue(WasmFunctionLowering* lowering, uint32_t id)
{
    size_t index;

    for (index = 0; index < lowering->values.len; ++index) {
        if (lowering->values.items[index].id == id)
            return &lowering->values.items[index];
    }

    return NULL;
}

static const WasmValueMap* WasmFunctionLowering_findValueConst(const WasmFunctionLowering* lowering, uint32_t id)
{
    size_t index;

    for (index = 0; index < lowering->values.len; ++index) {
        if (lowering->values.items[index].id == id)
            return &lowering->values.items[index];
    }

    return NULL;
}

static const WasmBlockMap* WasmFunctionLowering_findBlock(const WasmFunctionLowering* lowering, uint32_t blockId)
{
    size_t index;

    for (index = 0; index < lowering->blocks.len; ++index) {
        if (lowering->blocks.items[index].blockId == blockId)
            return &lowering->blocks.items[index];
    }

    return NULL;
}

static bool WasmFunctionLowering_emitOp(WasmEncodeBuffer* code, uint8_t op)
{
    return WasmEncodeBuffer_appendByte(code, op);
}

static bool WasmFunctionLowering_emitLocalGet(WasmEncodeBuffer* code, uint32_t localIndex)
{
    if (!WasmFunctionLowering_emitOp(code, WasmOp_LocalGet))
        return false;
    return WasmEncode_writeU32Leb(code, localIndex);
}

static bool WasmFunctionLowering_emitLocalSet(WasmEncodeBuffer* code, uint32_t localIndex)
{
    if (!WasmFunctionLowering_emitOp(code, WasmOp_LocalSet))
        return false;
    return WasmEncode_writeU32Leb(code, localIndex);
}

static bool WasmFunctionLowering_emitI32Const(WasmEncodeBuffer* code, int32_t value)
{
    if (!WasmFunctionLowering_emitOp(code, WasmOp_I32Const))
        return false;
    return WasmEncode_writeI32Leb(code, value);
}

static bool WasmFunctionLowering_emitI64Const(WasmEncodeBuffer* code, int64_t value)
{
    if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Const))
        return false;
    return WasmEncode_writeI64Leb(code, value);
}

static bool WasmFunctionLowering_emitF64Const(WasmEncodeBuffer* code, double value)
{
    if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Const))
        return false;
    return WasmEncode_writeF64(code, value);
}

static bool WasmFunctionLowering_emitCall(WasmEncodeBuffer* code, uint32_t functionIndex)
{
    if (!WasmFunctionLowering_emitOp(code, WasmOp_Call))
        return false;
    return WasmEncode_writeU32Leb(code, functionIndex);
}

static BackendStatus WasmFunctionLowering_emitGetValue(WasmFunctionLowering* lowering, WasmEncodeBuffer* code, uint32_t valueId, uint8_t* outType)
{
    WasmValueMap* map;

    map = WasmFunctionLowering_findValue(lowering, valueId);
    if (!map)
        return WasmEmit_validateError("wasm codegen: unknown value id");

    if (!WasmFunctionLowering_emitLocalGet(code, map->localIndex))
        return WasmEmit_internalError("wasm codegen: failed to emit local.get");

    if (outType)
        *outType = map->wasmType;
    return BackendStatus_ok();
}

static bool WasmFunctionLowering_emitWriteByteChecked(WasmFunctionLowering* lowering, WasmEncodeBuffer* code)
{
    if (!WasmFunctionLowering_emitCall(code, lowering->context->importWriteByteIndex))
        return false;
    if (!WasmFunctionLowering_emitOp(code, WasmOp_I32Eqz))
        return false;
    if (!WasmFunctionLowering_emitOp(code, WasmOp_If))
        return false;
    if (!WasmEncodeBuffer_appendByte(code, WasmBlockType_Void))
        return false;
    if (!WasmFunctionLowering_emitOp(code, WasmOp_Unreachable))
        return false;
    return WasmFunctionLowering_emitOp(code, WasmOp_End);
}

static bool WasmFunctionLowering_emitFlushChecked(WasmFunctionLowering* lowering, WasmEncodeBuffer* code)
{
    if (!WasmFunctionLowering_emitCall(code, lowering->context->importFlushIndex))
        return false;
    if (!WasmFunctionLowering_emitOp(code, WasmOp_I32Eqz))
        return false;
    if (!WasmFunctionLowering_emitOp(code, WasmOp_If))
        return false;
    if (!WasmEncodeBuffer_appendByte(code, WasmBlockType_Void))
        return false;
    if (!WasmFunctionLowering_emitOp(code, WasmOp_Unreachable))
        return false;
    return WasmFunctionLowering_emitOp(code, WasmOp_End);
}

static bool WasmFunctionLowering_emitWriteLiteralBytes(WasmFunctionLowering* lowering, WasmEncodeBuffer* code, ByteSpan text)
{
    size_t index;

    for (index = 0; index < text.len; ++index) {
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)text.data[index]))
            return false;
        if (!WasmFunctionLowering_emitWriteByteChecked(lowering, code))
            return false;
    }

    return true;
}

static size_t WasmEmit_unsignedDecimal(uint64_t value, uint8_t* outDigits, size_t cap)
{
    uint8_t scratch[32];
    size_t count;
    size_t index;

    count = 0;
    do {
        scratch[count] = (uint8_t)('0' + (value % 10u));
        value /= 10u;
        count += 1;
    } while (value > 0u && count < sizeof(scratch));

    if (count > cap)
        count = cap;

    for (index = 0; index < count; ++index)
        outDigits[index] = scratch[count - index - 1];

    return count;
}

static size_t WasmEmit_signedDecimal(int64_t value, uint8_t* outDigits, size_t cap)
{
    size_t offset;
    uint64_t magnitude;

    offset = 0;
    if (value < 0) {
        if (cap == 0)
            return 0;
        outDigits[offset] = (uint8_t)'-';
        offset += 1;
        magnitude = (uint64_t)(-(value + 1)) + 1u;
    } else {
        magnitude = (uint64_t)value;
    }

    return offset + WasmEmit_unsignedDecimal(magnitude, outDigits + offset, cap - offset);
}

static size_t WasmEmit_floatDecimal(double value, uint8_t* outDigits, size_t cap)
{
    int printCount;
    size_t index;
    char scratch[64];

    if (cap == 0)
        return 0;

    printCount = snprintf(scratch, sizeof(scratch), "%.6g", value);
    if (printCount < 0)
        return 0;

    if ((size_t)printCount > cap)
        printCount = (int)cap;

    for (index = 0; index < (size_t)printCount; ++index)
        outDigits[index] = (uint8_t)scratch[index];

    return (size_t)printCount;
}

static size_t WasmEmit_encodeUtf8(uint32_t codePoint, uint8_t out[4])
{
    if (codePoint <= 0x7Fu) {
        out[0] = (uint8_t)codePoint;
        return 1;
    }
    if (codePoint <= 0x7FFu) {
        out[0] = (uint8_t)(0xC0u | (codePoint >> 6));
        out[1] = (uint8_t)(0x80u | (codePoint & 0x3Fu));
        return 2;
    }
    if (codePoint >= 0xD800u && codePoint <= 0xDFFFu)
        return 0;
    if (codePoint <= 0xFFFFu) {
        out[0] = (uint8_t)(0xE0u | (codePoint >> 12));
        out[1] = (uint8_t)(0x80u | ((codePoint >> 6) & 0x3Fu));
        out[2] = (uint8_t)(0x80u | (codePoint & 0x3Fu));
        return 3;
    }
    if (codePoint <= 0x10FFFFu) {
        out[0] = (uint8_t)(0xF0u | (codePoint >> 18));
        out[1] = (uint8_t)(0x80u | ((codePoint >> 12) & 0x3Fu));
        out[2] = (uint8_t)(0x80u | ((codePoint >> 6) & 0x3Fu));
        out[3] = (uint8_t)(0x80u | (codePoint & 0x3Fu));
        return 4;
    }
    return 0;
}

static BackendStatus WasmFunctionLowering_getConstInt(const WasmFunctionLowering* lowering, uint32_t valueId, int64_t* out)
{
    const WasmValueMap* map;

    map = WasmFunctionLowering_findValueConst(lowering, valueId);
    if (!map)
        return WasmEmit_validateError("wasm codegen: missing constant value");

    if (map->constKind == WasmConst_Int || map->constKind == WasmConst_Bool) {
        *out = map->constInt;
        return BackendStatus_ok();
    }

    return WasmEmit_validateError("wasm codegen: expected integer constant");
}

static BackendStatus WasmFunctionLowering_getConstFloat(const WasmFunctionLowering* lowering, uint32_t valueId, double* out)
{
    const WasmValueMap* map;

    map = WasmFunctionLowering_findValueConst(lowering, valueId);
    if (!map)
        return WasmEmit_validateError("wasm codegen: missing constant value");
    if (map->constKind != WasmConst_Float)
        return WasmEmit_validateError("wasm codegen: expected float constant");

    *out = map->constFloat;
    return BackendStatus_ok();
}

static BackendStatus WasmFunctionLowering_getConstString(const WasmFunctionLowering* lowering, uint32_t valueId, uint32_t* outLiteralId)
{
    const WasmValueMap* map;

    map = WasmFunctionLowering_findValueConst(lowering, valueId);
    if (!map)
        return WasmEmit_validateError("wasm codegen: missing constant value");
    if (map->constKind != WasmConst_String)
        return WasmEmit_validateError("wasm codegen: expected string literal constant");

    *outLiteralId = map->constStringId;
    return BackendStatus_ok();
}

static BackendStatus WasmFunctionLowering_emitPrintBuiltin(
    WasmFunctionLowering* lowering,
    WasmEncodeBuffer* code,
    const IRInstruction* inst,
    bool appendNewline)
{
    uint32_t index;

    for (index = 0; index < inst->callArgs.count; ++index) {
        uint8_t valueType;

        if (WasmFunctionLowering_emitGetValue(lowering, code, inst->callArgs.items[index], &valueType).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: print builtin argument lookup failed");
        if (valueType != WasmValType_I64)
            return WasmEmit_validateError("wasm codegen: print builtin argument must be integer");

        if (!WasmFunctionLowering_emitI64Const(code, 0))
            return WasmEmit_internalError("wasm codegen: failed to emit print lower bound");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_I64LtS))
            return WasmEmit_internalError("wasm codegen: failed to emit i64.lt_s");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_If))
            return WasmEmit_internalError("wasm codegen: failed to emit if");
        if (!WasmEncodeBuffer_appendByte(code, WasmBlockType_Void))
            return WasmEmit_internalError("wasm codegen: failed to emit block type");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_Unreachable))
            return WasmEmit_internalError("wasm codegen: failed to emit unreachable");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_End))
            return WasmEmit_internalError("wasm codegen: failed to emit end");

        if (WasmFunctionLowering_emitGetValue(lowering, code, inst->callArgs.items[index], NULL).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: print builtin argument lookup failed");
        if (!WasmFunctionLowering_emitI64Const(code, 255))
            return WasmEmit_internalError("wasm codegen: failed to emit print upper bound");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_I64GtS))
            return WasmEmit_internalError("wasm codegen: failed to emit i64.gt_s");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_If))
            return WasmEmit_internalError("wasm codegen: failed to emit if");
        if (!WasmEncodeBuffer_appendByte(code, WasmBlockType_Void))
            return WasmEmit_internalError("wasm codegen: failed to emit block type");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_Unreachable))
            return WasmEmit_internalError("wasm codegen: failed to emit unreachable");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_End))
            return WasmEmit_internalError("wasm codegen: failed to emit end");

        if (WasmFunctionLowering_emitGetValue(lowering, code, inst->callArgs.items[index], NULL).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: print builtin argument lookup failed");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_I32WrapI64))
            return WasmEmit_internalError("wasm codegen: failed to emit i32.wrap_i64");
        if (!WasmFunctionLowering_emitWriteByteChecked(lowering, code))
            return WasmEmit_internalError("wasm codegen: failed to emit write byte call");
    }

    if (appendNewline) {
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)'\n'))
            return WasmEmit_internalError("wasm codegen: failed to emit newline");
        if (!WasmFunctionLowering_emitWriteByteChecked(lowering, code))
            return WasmEmit_internalError("wasm codegen: failed to emit newline write");
    }

    if (!WasmFunctionLowering_emitFlushChecked(lowering, code))
        return WasmEmit_internalError("wasm codegen: failed to emit flush");

    return BackendStatus_ok();
}

static BackendStatus WasmFunctionLowering_emitFormatValueConst(
    WasmFunctionLowering* lowering,
    WasmEncodeBuffer* code,
    int64_t tag,
    uint32_t valueId)
{
    uint8_t bytes[64];
    size_t count;

    switch (tag) {
    case WasmFormatTag_String: {
        uint32_t literalId;
        ByteSpan literal;

        if (WasmFunctionLowering_getConstString(lowering, valueId, &literalId).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: format string value must be const sconst");
        if (literalId >= lowering->context->module->stringLiteralCount)
            return WasmEmit_validateError("wasm codegen: format string literal id out of bounds");
        literal = lowering->context->module->stringLiterals[literalId];
        if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, literal))
            return WasmEmit_internalError("wasm codegen: failed to emit literal bytes");
        return BackendStatus_ok();
    }
    case WasmFormatTag_Int: {
        int64_t value;
        if (WasmFunctionLowering_getConstInt(lowering, valueId, &value).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: format int value must be const");
        count = WasmEmit_signedDecimal(value, bytes, sizeof(bytes));
        if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromParts(bytes, count)))
            return WasmEmit_internalError("wasm codegen: failed to emit int literal bytes");
        return BackendStatus_ok();
    }
    case WasmFormatTag_Float: {
        double value;
        if (WasmFunctionLowering_getConstFloat(lowering, valueId, &value).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: format float value must be const");
        count = WasmEmit_floatDecimal(value, bytes, sizeof(bytes));
        if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromParts(bytes, count)))
            return WasmEmit_internalError("wasm codegen: failed to emit float literal bytes");
        return BackendStatus_ok();
    }
    case WasmFormatTag_Bool: {
        int64_t value;
        if (WasmFunctionLowering_getConstInt(lowering, valueId, &value).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: format bool value must be const");
        if (value)
            return WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromCString("true")) ? BackendStatus_ok()
                                                                                                             : WasmEmit_internalError("wasm codegen: failed to emit bool true");
        return WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromCString("false")) ? BackendStatus_ok()
                                                                                                           : WasmEmit_internalError("wasm codegen: failed to emit bool false");
    }
    case WasmFormatTag_Char: {
        int64_t value;
        uint8_t utf8[4];
        size_t utf8Len;

        if (WasmFunctionLowering_getConstInt(lowering, valueId, &value).code != JSRUST_BACKEND_OK)
            return WasmEmit_validateError("wasm codegen: format char value must be const");
        if (value < 0 || value > 0x10FFFF)
            return WasmEmit_validateError("wasm codegen: format char value out of Unicode range");
        utf8Len = WasmEmit_encodeUtf8((uint32_t)value, utf8);
        if (utf8Len == 0)
            return WasmEmit_validateError("wasm codegen: invalid Unicode scalar for char");
        if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromParts(utf8, utf8Len)))
            return WasmEmit_internalError("wasm codegen: failed to emit char utf8 bytes");
        return BackendStatus_ok();
    }
    default:
        return WasmEmit_validateError("wasm codegen: unsupported format tag");
    }
}

static BackendStatus WasmFunctionLowering_emitFormatBuiltin(
    WasmFunctionLowering* lowering,
    WasmEncodeBuffer* code,
    const IRInstruction* inst,
    bool appendNewline)
{
    uint32_t formatLiteralId;
    ByteSpan formatText;
    size_t cursor;
    uint32_t argIndex;
    BackendStatus status;

    if (inst->callArgs.count == 0)
        return WasmEmit_validateError("wasm codegen: format builtin requires format string");

    status = WasmFunctionLowering_getConstString(lowering, inst->callArgs.items[0], &formatLiteralId);
    if (status.code != JSRUST_BACKEND_OK)
        return WasmEmit_validateError("wasm codegen: format argument must be const string");
    if (formatLiteralId >= lowering->context->module->stringLiteralCount)
        return WasmEmit_validateError("wasm codegen: format literal id out of bounds");

    formatText = lowering->context->module->stringLiterals[formatLiteralId];
    cursor = 0;
    argIndex = 1;
    while (cursor < formatText.len) {
        uint8_t ch;

        ch = formatText.data[cursor];
        if (ch == (uint8_t)'{') {
            if (cursor + 1 < formatText.len && formatText.data[cursor + 1] == (uint8_t)'{') {
                if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromCString("{")))
                    return WasmEmit_internalError("wasm codegen: failed to emit escaped {");
                cursor += 2;
                continue;
            }

            if (cursor + 1 < formatText.len && formatText.data[cursor + 1] == (uint8_t)'}') {
                int64_t tag;
                if (argIndex + 1 >= inst->callArgs.count)
                    return WasmEmit_validateError("wasm codegen: missing format args");
                status = WasmFunctionLowering_getConstInt(lowering, inst->callArgs.items[argIndex], &tag);
                if (status.code != JSRUST_BACKEND_OK)
                    return WasmEmit_validateError("wasm codegen: format tag must be const int");
                status = WasmFunctionLowering_emitFormatValueConst(lowering, code, tag, inst->callArgs.items[argIndex + 1]);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
                argIndex += 2;
                cursor += 2;
                continue;
            }

            return WasmEmit_validateError("wasm codegen: unsupported token after '{'");
        }

        if (ch == (uint8_t)'}') {
            if (cursor + 1 < formatText.len && formatText.data[cursor + 1] == (uint8_t)'}') {
                if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromCString("}")))
                    return WasmEmit_internalError("wasm codegen: failed to emit escaped }");
                cursor += 2;
                continue;
            }
            return WasmEmit_validateError("wasm codegen: unescaped } in format string");
        }

        if (!WasmFunctionLowering_emitWriteLiteralBytes(lowering, code, ByteSpan_fromParts(&formatText.data[cursor], 1)))
            return WasmEmit_internalError("wasm codegen: failed to emit format literal byte");
        cursor += 1;
    }

    if (argIndex != inst->callArgs.count)
        return WasmEmit_validateError("wasm codegen: unused format args");

    if (appendNewline) {
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)'\n'))
            return WasmEmit_internalError("wasm codegen: failed to emit newline");
        if (!WasmFunctionLowering_emitWriteByteChecked(lowering, code))
            return WasmEmit_internalError("wasm codegen: failed to emit newline write");
    }

    if (!WasmFunctionLowering_emitFlushChecked(lowering, code))
        return WasmEmit_internalError("wasm codegen: failed to emit flush");

    return BackendStatus_ok();
}

static BackendStatus WasmFunctionLowering_emitAssignArgs(
    WasmFunctionLowering* lowering,
    WasmEncodeBuffer* code,
    const IRBlock* targetBlock,
    const IRU32List* args)
{
    uint32_t index;

    if (targetBlock->paramCount != args->count)
        return WasmEmit_validateError("wasm codegen: branch argument count mismatch");

    for (index = 0; index < args->count; ++index) {
        WasmValueMap* paramValue;
        uint8_t argType;
        BackendStatus status;

        paramValue = WasmFunctionLowering_findValue(lowering, targetBlock->params[index].id);
        if (!paramValue)
            return WasmEmit_validateError("wasm codegen: branch target param id not found");

        status = WasmFunctionLowering_emitGetValue(lowering, code, args->items[index], &argType);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (argType != paramValue->wasmType)
            return WasmEmit_validateError("wasm codegen: branch arg type mismatch");

        if (!WasmFunctionLowering_emitLocalSet(code, paramValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to emit branch arg store");
    }

    return BackendStatus_ok();
}

static BackendStatus WasmFunctionLowering_emitInstruction(
    WasmFunctionLowering* lowering,
    WasmEncodeBuffer* code,
    const IRInstruction* inst)
{
    WasmValueMap* outValue;
    BackendStatus status;

    outValue = inst->hasResult ? WasmFunctionLowering_findValue(lowering, inst->id) : NULL;
    if (inst->hasResult && !outValue)
        return WasmEmit_validateError("wasm codegen: instruction result id missing");

    switch (inst->kind) {
    case IRInstKind_Iconst:
        if (!WasmFunctionLowering_emitI64Const(code, inst->intValue))
            return WasmEmit_internalError("wasm codegen: failed to emit iconst");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store iconst");
        return BackendStatus_ok();
    case IRInstKind_Fconst:
        if (!WasmFunctionLowering_emitF64Const(code, inst->floatValue))
            return WasmEmit_internalError("wasm codegen: failed to emit fconst");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store fconst");
        return BackendStatus_ok();
    case IRInstKind_Bconst:
        if (!WasmFunctionLowering_emitI32Const(code, inst->boolValue ? 1 : 0))
            return WasmEmit_internalError("wasm codegen: failed to emit bconst");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store bconst");
        return BackendStatus_ok();
    case IRInstKind_Sconst:
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)inst->literalId))
            return WasmEmit_internalError("wasm codegen: failed to emit sconst");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store sconst");
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
    case IRInstKind_Ishr:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->a, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->b, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        switch (inst->kind) {
        case IRInstKind_Iadd:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Add))
                return WasmEmit_internalError("wasm codegen: i64.add failed");
            break;
        case IRInstKind_Isub:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Sub))
                return WasmEmit_internalError("wasm codegen: i64.sub failed");
            break;
        case IRInstKind_Imul:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Mul))
                return WasmEmit_internalError("wasm codegen: i64.mul failed");
            break;
        case IRInstKind_Idiv:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64DivS))
                return WasmEmit_internalError("wasm codegen: i64.div_s failed");
            break;
        case IRInstKind_Imod:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64RemS))
                return WasmEmit_internalError("wasm codegen: i64.rem_s failed");
            break;
        case IRInstKind_Iand:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64And))
                return WasmEmit_internalError("wasm codegen: i64.and failed");
            break;
        case IRInstKind_Ior:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Or))
                return WasmEmit_internalError("wasm codegen: i64.or failed");
            break;
        case IRInstKind_Ixor:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Xor))
                return WasmEmit_internalError("wasm codegen: i64.xor failed");
            break;
        case IRInstKind_Ishl:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Shl))
                return WasmEmit_internalError("wasm codegen: i64.shl failed");
            break;
        case IRInstKind_Ishr:
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64ShrS))
                return WasmEmit_internalError("wasm codegen: i64.shr_s failed");
            break;
        default:
            break;
        }
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store integer op result");
        return BackendStatus_ok();
    case IRInstKind_Fadd:
    case IRInstKind_Fsub:
    case IRInstKind_Fmul:
    case IRInstKind_Fdiv:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->a, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->b, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (inst->kind == IRInstKind_Fadd) {
            if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Add))
                return WasmEmit_internalError("wasm codegen: f64.add failed");
        } else if (inst->kind == IRInstKind_Fsub) {
            if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Sub))
                return WasmEmit_internalError("wasm codegen: f64.sub failed");
        } else if (inst->kind == IRInstKind_Fmul) {
            if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Mul))
                return WasmEmit_internalError("wasm codegen: f64.mul failed");
        } else {
            if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Div))
                return WasmEmit_internalError("wasm codegen: f64.div failed");
        }
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store float op result");
        return BackendStatus_ok();
    case IRInstKind_Icmp:
    case IRInstKind_Fcmp:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->a, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->b, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (inst->kind == IRInstKind_Icmp) {
            if (inst->compareOp == 0) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Eq))
                    return WasmEmit_internalError("wasm codegen: i64.eq failed");
            } else if (inst->compareOp == 1) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Ne))
                    return WasmEmit_internalError("wasm codegen: i64.ne failed");
            } else if (inst->compareOp == 2) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_I64LtS))
                    return WasmEmit_internalError("wasm codegen: i64.lt_s failed");
            } else if (inst->compareOp == 3) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_I64LeS))
                    return WasmEmit_internalError("wasm codegen: i64.le_s failed");
            } else if (inst->compareOp == 4) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_I64GtS))
                    return WasmEmit_internalError("wasm codegen: i64.gt_s failed");
            } else if (inst->compareOp == 5) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_I64GeS))
                    return WasmEmit_internalError("wasm codegen: i64.ge_s failed");
            } else {
                return WasmEmit_validateError("wasm codegen: unsupported icmp compare op");
            }
        } else {
            if (inst->compareOp == 0) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Eq))
                    return WasmEmit_internalError("wasm codegen: f64.eq failed");
            } else if (inst->compareOp == 1) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Ne))
                    return WasmEmit_internalError("wasm codegen: f64.ne failed");
            } else if (inst->compareOp == 2) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Lt))
                    return WasmEmit_internalError("wasm codegen: f64.lt failed");
            } else if (inst->compareOp == 3) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Le))
                    return WasmEmit_internalError("wasm codegen: f64.le failed");
            } else if (inst->compareOp == 4) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Gt))
                    return WasmEmit_internalError("wasm codegen: f64.gt failed");
            } else if (inst->compareOp == 5) {
                if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Ge))
                    return WasmEmit_internalError("wasm codegen: f64.ge failed");
            } else {
                return WasmEmit_validateError("wasm codegen: unsupported fcmp compare op");
            }
        }
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store cmp result");
        return BackendStatus_ok();
    case IRInstKind_Ineg:
        if (!WasmFunctionLowering_emitI64Const(code, 0))
            return WasmEmit_internalError("wasm codegen: failed to emit ineg lhs");
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->a, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Sub))
            return WasmEmit_internalError("wasm codegen: failed to emit ineg");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store ineg");
        return BackendStatus_ok();
    case IRInstKind_Fneg:
        if (!WasmFunctionLowering_emitF64Const(code, 0.0))
            return WasmEmit_internalError("wasm codegen: failed to emit fneg lhs");
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->a, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitOp(code, WasmOp_F64Sub))
            return WasmEmit_internalError("wasm codegen: failed to emit fneg");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store fneg");
        return BackendStatus_ok();
    case IRInstKind_Trunc:
    case IRInstKind_Sext:
    case IRInstKind_Zext:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->val, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store int cast");
        return BackendStatus_ok();
    case IRInstKind_Fptoui:
    case IRInstKind_Fptosi:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->val, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitOp(code, WasmOp_I64TruncF64S))
            return WasmEmit_internalError("wasm codegen: failed to emit i64.trunc_f64_s");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store float->int cast");
        return BackendStatus_ok();
    case IRInstKind_Uitofp:
    case IRInstKind_Sitofp:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->val, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitOp(code, WasmOp_F64ConvertI64S))
            return WasmEmit_internalError("wasm codegen: failed to emit f64.convert_i64_s");
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store int->float cast");
        return BackendStatus_ok();
    case IRInstKind_Bitcast:
        status = WasmFunctionLowering_emitGetValue(lowering, code, inst->val, NULL);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store bitcast");
        return BackendStatus_ok();
    case IRInstKind_Call: {
        uint32_t calleeOrdinal;
        const IRFunction* callee;
        uint32_t index;
        uint32_t builtinPrintlnId;
        uint32_t builtinPrintId;
        uint32_t builtinPrintlnFmtId;
        uint32_t builtinPrintFmtId;

        builtinPrintlnId = ByteSpan_hashFunctionId(ByteSpan_fromCString(g_builtinPrintlnName));
        builtinPrintId = ByteSpan_hashFunctionId(ByteSpan_fromCString(g_builtinPrintName));
        builtinPrintlnFmtId = ByteSpan_hashFunctionId(ByteSpan_fromCString(g_builtinPrintlnFmtName));
        builtinPrintFmtId = ByteSpan_hashFunctionId(ByteSpan_fromCString(g_builtinPrintFmtName));

        if (inst->fn == builtinPrintlnId)
            return WasmFunctionLowering_emitPrintBuiltin(lowering, code, inst, true);
        if (inst->fn == builtinPrintId)
            return WasmFunctionLowering_emitPrintBuiltin(lowering, code, inst, false);
        if (inst->fn == builtinPrintlnFmtId)
            return WasmFunctionLowering_emitFormatBuiltin(lowering, code, inst, true);
        if (inst->fn == builtinPrintFmtId)
            return WasmFunctionLowering_emitFormatBuiltin(lowering, code, inst, false);

        callee = WasmEmit_findFunctionByHash(lowering->context->module, inst->fn, &calleeOrdinal);
        if (!callee)
            return WasmEmit_validateError("wasm codegen: call target function id not found");

        for (index = 0; index < inst->callArgs.count; ++index) {
            status = WasmFunctionLowering_emitGetValue(lowering, code, inst->callArgs.items[index], NULL);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }

        if (!WasmFunctionLowering_emitCall(code, 2 + calleeOrdinal))
            return WasmEmit_internalError("wasm codegen: failed to emit call");

        if (inst->hasResult && !WasmFunctionLowering_emitLocalSet(code, outValue->localIndex))
            return WasmEmit_internalError("wasm codegen: failed to store call result");
        return BackendStatus_ok();
    }
    case IRInstKind_Alloca:
    case IRInstKind_Load:
    case IRInstKind_Store:
    case IRInstKind_Memcpy:
    case IRInstKind_Gep:
    case IRInstKind_Ptradd:
    case IRInstKind_Null:
    case IRInstKind_StructCreate:
    case IRInstKind_StructGet:
    case IRInstKind_EnumCreate:
    case IRInstKind_EnumGetTag:
    case IRInstKind_EnumGetData:
        return WasmEmit_validateError("wasm codegen: unsupported instruction in MVP");
    default:
        return WasmEmit_validateError("wasm codegen: unsupported instruction opcode");
    }
}

static BackendStatus WasmFunctionLowering_emitTerminator(
    WasmFunctionLowering* lowering,
    WasmEncodeBuffer* code,
    const IRBlock* block,
    bool* outContinueLoop)
{
    BackendStatus status;

    *outContinueLoop = false;

    switch (block->terminator.kind) {
    case IRTermKind_Ret:
        if (block->terminator.hasValue) {
            status = WasmFunctionLowering_emitGetValue(lowering, code, block->terminator.value, NULL);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }
        if (!WasmFunctionLowering_emitOp(code, WasmOp_Return))
            return WasmEmit_internalError("wasm codegen: failed to emit return");
        return BackendStatus_ok();
    case IRTermKind_Br: {
        const WasmBlockMap* target;
        target = WasmFunctionLowering_findBlock(lowering, block->terminator.target);
        if (!target)
            return WasmEmit_validateError("wasm codegen: br target block missing");
        status = WasmFunctionLowering_emitAssignArgs(lowering, code, target->block, &block->terminator.args);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)target->ordinal))
            return WasmEmit_internalError("wasm codegen: failed to emit br target ordinal");
        if (!WasmFunctionLowering_emitLocalSet(code, lowering->currentBlockLocal))
            return WasmEmit_internalError("wasm codegen: failed to set current block local");
        *outContinueLoop = true;
        return BackendStatus_ok();
    }
    case IRTermKind_BrIf: {
        const WasmBlockMap* thenTarget;
        const WasmBlockMap* elseTarget;
        uint8_t condType;

        thenTarget = WasmFunctionLowering_findBlock(lowering, block->terminator.thenBlock);
        elseTarget = WasmFunctionLowering_findBlock(lowering, block->terminator.elseBlock);
        if (!thenTarget || !elseTarget)
            return WasmEmit_validateError("wasm codegen: br_if target block missing");

        status = WasmFunctionLowering_emitGetValue(lowering, code, block->terminator.cond, &condType);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (condType != WasmValType_I32)
            return WasmEmit_validateError("wasm codegen: br_if condition must be bool/i32");

        if (!WasmFunctionLowering_emitOp(code, WasmOp_If))
            return WasmEmit_internalError("wasm codegen: failed to emit br_if if");
        if (!WasmEncodeBuffer_appendByte(code, WasmBlockType_Void))
            return WasmEmit_internalError("wasm codegen: failed to emit br_if block type");

        status = WasmFunctionLowering_emitAssignArgs(lowering, code, thenTarget->block, &block->terminator.thenArgs);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)thenTarget->ordinal))
            return WasmEmit_internalError("wasm codegen: failed to emit then ordinal");
        if (!WasmFunctionLowering_emitLocalSet(code, lowering->currentBlockLocal))
            return WasmEmit_internalError("wasm codegen: failed to set then block");

        if (!WasmFunctionLowering_emitOp(code, WasmOp_Else))
            return WasmEmit_internalError("wasm codegen: failed to emit else");
        status = WasmFunctionLowering_emitAssignArgs(lowering, code, elseTarget->block, &block->terminator.elseArgs);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)elseTarget->ordinal))
            return WasmEmit_internalError("wasm codegen: failed to emit else ordinal");
        if (!WasmFunctionLowering_emitLocalSet(code, lowering->currentBlockLocal))
            return WasmEmit_internalError("wasm codegen: failed to set else block");

        if (!WasmFunctionLowering_emitOp(code, WasmOp_End))
            return WasmEmit_internalError("wasm codegen: failed to end br_if");
        *outContinueLoop = true;
        return BackendStatus_ok();
    }
    case IRTermKind_Switch: {
        const WasmBlockMap* defaultTarget;
        uint32_t caseIndex;
        uint8_t switchType;

        defaultTarget = WasmFunctionLowering_findBlock(lowering, block->terminator.defaultBlock);
        if (!defaultTarget)
            return WasmEmit_validateError("wasm codegen: switch default block missing");

        status = WasmFunctionLowering_emitGetValue(lowering, code, block->terminator.switchValue, &switchType);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (switchType != WasmValType_I64)
            return WasmEmit_validateError("wasm codegen: switch selector must be integer");
        if (!WasmFunctionLowering_emitOp(code, WasmOp_Drop))
            return WasmEmit_internalError("wasm codegen: failed to drop switch selector temp");

        status = WasmFunctionLowering_emitAssignArgs(lowering, code, defaultTarget->block, &block->terminator.defaultArgs);
        if (status.code != JSRUST_BACKEND_OK)
            return status;
        if (!WasmFunctionLowering_emitI32Const(code, (int32_t)defaultTarget->ordinal))
            return WasmEmit_internalError("wasm codegen: failed to emit switch default ordinal");
        if (!WasmFunctionLowering_emitLocalSet(code, lowering->currentBlockLocal))
            return WasmEmit_internalError("wasm codegen: failed to set switch default");

        for (caseIndex = 0; caseIndex < block->terminator.switchCaseCount; ++caseIndex) {
            const IRTermSwitchCase* switchCase;
            const WasmBlockMap* caseTarget;

            switchCase = &block->terminator.switchCases[caseIndex];
            caseTarget = WasmFunctionLowering_findBlock(lowering, switchCase->target);
            if (!caseTarget)
                return WasmEmit_validateError("wasm codegen: switch case target block missing");

            status = WasmFunctionLowering_emitGetValue(lowering, code, block->terminator.switchValue, NULL);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            if (!WasmFunctionLowering_emitI64Const(code, switchCase->value))
                return WasmEmit_internalError("wasm codegen: failed to emit switch case value");
            if (!WasmFunctionLowering_emitOp(code, WasmOp_I64Eq))
                return WasmEmit_internalError("wasm codegen: failed to emit switch compare");
            if (!WasmFunctionLowering_emitOp(code, WasmOp_If))
                return WasmEmit_internalError("wasm codegen: failed to emit switch case if");
            if (!WasmEncodeBuffer_appendByte(code, WasmBlockType_Void))
                return WasmEmit_internalError("wasm codegen: failed to emit switch case block type");

            status = WasmFunctionLowering_emitAssignArgs(lowering, code, caseTarget->block, &switchCase->args);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
            if (!WasmFunctionLowering_emitI32Const(code, (int32_t)caseTarget->ordinal))
                return WasmEmit_internalError("wasm codegen: failed to emit switch case ordinal");
            if (!WasmFunctionLowering_emitLocalSet(code, lowering->currentBlockLocal))
                return WasmEmit_internalError("wasm codegen: failed to set switch case");

            if (!WasmFunctionLowering_emitOp(code, WasmOp_End))
                return WasmEmit_internalError("wasm codegen: failed to end switch case if");
        }

        *outContinueLoop = true;
        return BackendStatus_ok();
    }
    case IRTermKind_Unreachable:
        if (!WasmFunctionLowering_emitOp(code, WasmOp_Unreachable))
            return WasmEmit_internalError("wasm codegen: failed to emit unreachable");
        return BackendStatus_ok();
    default:
        return WasmEmit_validateError("wasm codegen: unknown terminator kind");
    }
}

static BackendStatus WasmFunctionLowering_buildMaps(WasmFunctionLowering* lowering)
{
    uint32_t nextLocalIndex;
    uint32_t blockIndex;
    uint32_t instructionIndex;

    WasmValueMapVec_init(&lowering->values);
    WasmBlockMapVec_init(&lowering->blocks);

    nextLocalIndex = 0;

    for (blockIndex = 0; blockIndex < lowering->function->paramCount; ++blockIndex) {
        const IRValueParam* param;
        bool isVoid;
        uint8_t wasmType;
        WasmValueMap map;

        param = &lowering->function->params[blockIndex];
        wasmType = WasmEmit_typeFromIR(param->ty, &isVoid);
        if (wasmType == 0 || isVoid)
            return WasmEmit_validateError("wasm codegen: unsupported function param type");

        map.id = param->id;
        map.localIndex = nextLocalIndex;
        map.wasmType = wasmType;
        map.constKind = WasmConst_None;
        map.constInt = 0;
        map.constFloat = 0.0;
        map.constStringId = 0;
        if (!WasmValueMapVec_append(&lowering->values, lowering->context->arena, map))
            return WasmEmit_internalError("wasm codegen: failed to reserve param map");
        nextLocalIndex += 1;
    }

    for (blockIndex = 0; blockIndex < lowering->function->blockCount; ++blockIndex) {
        const IRBlock* block;
        WasmBlockMap blockMap;
        uint32_t paramIndex;

        block = &lowering->function->blocks[blockIndex];
        blockMap.blockId = block->id;
        blockMap.ordinal = blockIndex;
        blockMap.block = block;
        if (!WasmBlockMapVec_append(&lowering->blocks, lowering->context->arena, blockMap))
            return WasmEmit_internalError("wasm codegen: failed to reserve block map");

        for (paramIndex = 0; paramIndex < block->paramCount; ++paramIndex) {
            const IRValueParam* param;
            bool isVoid;
            uint8_t wasmType;
            WasmValueMap map;

            param = &block->params[paramIndex];
            wasmType = WasmEmit_typeFromIR(param->ty, &isVoid);
            if (wasmType == 0 || isVoid)
                return WasmEmit_validateError("wasm codegen: unsupported block param type");

            map.id = param->id;
            map.localIndex = nextLocalIndex;
            map.wasmType = wasmType;
            map.constKind = WasmConst_None;
            map.constInt = 0;
            map.constFloat = 0.0;
            map.constStringId = 0;
            if (!WasmValueMapVec_append(&lowering->values, lowering->context->arena, map))
                return WasmEmit_internalError("wasm codegen: failed to reserve block param map");
            nextLocalIndex += 1;
        }

        for (instructionIndex = 0; instructionIndex < block->instructionCount; ++instructionIndex) {
            const IRInstruction* inst;
            WasmValueMap map;
            bool isVoid;
            uint8_t wasmType;

            inst = &block->instructions[instructionIndex];
            if (!inst->hasResult)
                continue;

            if (inst->kind == IRInstKind_Sconst) {
                wasmType = WasmValType_I32;
                isVoid = false;
            } else {
                wasmType = WasmEmit_typeFromIR(inst->ty, &isVoid);
            }
            if (wasmType == 0 || isVoid)
                return WasmEmit_validateError("wasm codegen: unsupported instruction result type");

            map.id = inst->id;
            map.localIndex = nextLocalIndex;
            map.wasmType = wasmType;
            map.constKind = WasmConst_None;
            map.constInt = 0;
            map.constFloat = 0.0;
            map.constStringId = 0;
            if (inst->kind == IRInstKind_Iconst) {
                map.constKind = WasmConst_Int;
                map.constInt = inst->intValue;
            } else if (inst->kind == IRInstKind_Bconst) {
                map.constKind = WasmConst_Bool;
                map.constInt = inst->boolValue ? 1 : 0;
            } else if (inst->kind == IRInstKind_Fconst) {
                map.constKind = WasmConst_Float;
                map.constFloat = inst->floatValue;
            } else if (inst->kind == IRInstKind_Sconst) {
                map.constKind = WasmConst_String;
                map.constStringId = inst->literalId;
            }

            if (!WasmValueMapVec_append(&lowering->values, lowering->context->arena, map))
                return WasmEmit_internalError("wasm codegen: failed to reserve instruction value map");
            nextLocalIndex += 1;
        }
    }

    lowering->currentBlockLocal = nextLocalIndex;
    lowering->localCount = nextLocalIndex + 1;
    lowering->localTypes = (uint8_t*)Arena_alloc(lowering->context->arena, lowering->localCount, _Alignof(uint8_t));
    if (!lowering->localTypes)
        return WasmEmit_internalError("wasm codegen: failed to allocate local type table");
    ByteOps_set(lowering->localTypes, WasmValType_I32, lowering->localCount);

    for (blockIndex = 0; blockIndex < lowering->values.len; ++blockIndex) {
        const WasmValueMap* map;
        map = &lowering->values.items[blockIndex];
        lowering->localTypes[map->localIndex] = map->wasmType;
    }
    lowering->localTypes[lowering->currentBlockLocal] = WasmValType_I32;

    return BackendStatus_ok();
}

static BackendStatus WasmFunctionLowering_emitBody(WasmFunctionLowering* lowering, WasmEncodeBuffer* functionBody)
{
    WasmEncodeBuffer code;
    uint32_t localDeclCount;
    uint32_t localIndex;
    BackendStatus status;
    uint32_t blockIndex;

    if (!WasmEncodeBuffer_init(&code, lowering->context->arena, 256))
        return WasmEmit_internalError("wasm codegen: failed to init function code buffer");

    if (!WasmFunctionLowering_emitI32Const(&code, 0))
        return WasmEmit_internalError("wasm codegen: failed to init entry block ordinal");
    if (!WasmFunctionLowering_emitLocalSet(&code, lowering->currentBlockLocal))
        return WasmEmit_internalError("wasm codegen: failed to set entry block ordinal");

    if (!WasmFunctionLowering_emitOp(&code, WasmOp_Loop))
        return WasmEmit_internalError("wasm codegen: failed to emit dispatch loop");
    if (!WasmEncodeBuffer_appendByte(&code, WasmBlockType_Void))
        return WasmEmit_internalError("wasm codegen: failed to emit loop block type");

    for (blockIndex = 0; blockIndex < lowering->function->blockCount; ++blockIndex) {
        const IRBlock* block;
        uint32_t instructionIndex;
        bool continueLoop;

        block = &lowering->function->blocks[blockIndex];

        if (!WasmFunctionLowering_emitLocalGet(&code, lowering->currentBlockLocal))
            return WasmEmit_internalError("wasm codegen: failed to emit current block local.get");
        if (!WasmFunctionLowering_emitI32Const(&code, (int32_t)blockIndex))
            return WasmEmit_internalError("wasm codegen: failed to emit block ordinal const");
        if (!WasmFunctionLowering_emitOp(&code, WasmOp_I32Eq))
            return WasmEmit_internalError("wasm codegen: failed to emit i32.eq");
        if (!WasmFunctionLowering_emitOp(&code, WasmOp_If))
            return WasmEmit_internalError("wasm codegen: failed to emit block if");
        if (!WasmEncodeBuffer_appendByte(&code, WasmBlockType_Void))
            return WasmEmit_internalError("wasm codegen: failed to emit block if type");

        for (instructionIndex = 0; instructionIndex < block->instructionCount; ++instructionIndex) {
            status = WasmFunctionLowering_emitInstruction(lowering, &code, &block->instructions[instructionIndex]);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }

        status = WasmFunctionLowering_emitTerminator(lowering, &code, block, &continueLoop);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        if (continueLoop) {
            if (!WasmFunctionLowering_emitOp(&code, WasmOp_Br))
                return WasmEmit_internalError("wasm codegen: failed to emit loop continue br");
            if (!WasmEncode_writeU32Leb(&code, 1))
                return WasmEmit_internalError("wasm codegen: failed to emit loop continue depth");
        }

        if (!WasmFunctionLowering_emitOp(&code, WasmOp_End))
            return WasmEmit_internalError("wasm codegen: failed to close block if");
    }

    if (!WasmFunctionLowering_emitOp(&code, WasmOp_Unreachable))
        return WasmEmit_internalError("wasm codegen: failed to emit dispatch fallback unreachable");
    if (!WasmFunctionLowering_emitOp(&code, WasmOp_End))
        return WasmEmit_internalError("wasm codegen: failed to close loop");
    if (!WasmFunctionLowering_emitOp(&code, WasmOp_End))
        return WasmEmit_internalError("wasm codegen: failed to close function body");

    localDeclCount = 0;
    for (localIndex = lowering->function->paramCount; localIndex < lowering->localCount; ++localIndex) {
        if (localIndex == lowering->function->paramCount || lowering->localTypes[localIndex] != lowering->localTypes[localIndex - 1])
            localDeclCount += 1;
    }

    if (!WasmEncode_writeU32Leb(functionBody, localDeclCount))
        return WasmEmit_internalError("wasm codegen: failed to emit local decl count");
    if (localDeclCount > 0) {
        uint32_t runStart;
        uint32_t runCount;

        runStart = lowering->function->paramCount;
        runCount = 0;
        for (localIndex = lowering->function->paramCount; localIndex < lowering->localCount; ++localIndex) {
            if (runCount == 0) {
                runStart = localIndex;
                runCount = 1;
                continue;
            }
            if (lowering->localTypes[localIndex] == lowering->localTypes[runStart]) {
                runCount += 1;
                continue;
            }

            if (!WasmEncode_writeU32Leb(functionBody, runCount))
                return WasmEmit_internalError("wasm codegen: failed to emit local run count");
            if (!WasmEncodeBuffer_appendByte(functionBody, lowering->localTypes[runStart]))
                return WasmEmit_internalError("wasm codegen: failed to emit local run type");

            runStart = localIndex;
            runCount = 1;
        }

        if (runCount > 0) {
            if (!WasmEncode_writeU32Leb(functionBody, runCount))
                return WasmEmit_internalError("wasm codegen: failed to emit final local run count");
            if (!WasmEncodeBuffer_appendByte(functionBody, lowering->localTypes[runStart]))
                return WasmEmit_internalError("wasm codegen: failed to emit final local run type");
        }
    }

    if (!WasmEncodeBuffer_appendSpan(functionBody, ByteSpan_fromParts(code.data, code.len)))
        return WasmEmit_internalError("wasm codegen: failed to append function code bytes");
    return BackendStatus_ok();
}

static BackendStatus WasmEmit_writeTypeSection(WasmEmitContext* context, WasmEncodeBuffer* module)
{
    WasmEncodeBuffer payload;
    uint32_t functionIndex;

    if (!WasmEncodeBuffer_init(&payload, context->arena, 128))
        return WasmEmit_internalError("wasm codegen: failed to init type section");

    if (!WasmEncode_writeU32Leb(&payload, 2 + context->module->functionCount))
        return WasmEmit_internalError("wasm codegen: failed to write type count");

    if (!WasmEncodeBuffer_appendByte(&payload, 0x60) || !WasmEncode_writeU32Leb(&payload, 1) || !WasmEncodeBuffer_appendByte(&payload, WasmValType_I32) || !WasmEncode_writeU32Leb(&payload, 1) || !WasmEncodeBuffer_appendByte(&payload, WasmValType_I32))
        return WasmEmit_internalError("wasm codegen: failed to write write-byte import type");
    if (!WasmEncodeBuffer_appendByte(&payload, 0x60) || !WasmEncode_writeU32Leb(&payload, 0) || !WasmEncode_writeU32Leb(&payload, 1) || !WasmEncodeBuffer_appendByte(&payload, WasmValType_I32))
        return WasmEmit_internalError("wasm codegen: failed to write flush import type");

    for (functionIndex = 0; functionIndex < context->module->functionCount; ++functionIndex) {
        const IRFunction* function;
        uint32_t paramIndex;
        bool returnIsVoid;
        uint8_t returnType;

        function = &context->module->functions[functionIndex];
        if (!WasmEncodeBuffer_appendByte(&payload, 0x60))
            return WasmEmit_internalError("wasm codegen: failed to write function type marker");
        if (!WasmEncode_writeU32Leb(&payload, function->paramCount))
            return WasmEmit_internalError("wasm codegen: failed to write function param count");
        for (paramIndex = 0; paramIndex < function->paramCount; ++paramIndex) {
            bool isVoid;
            uint8_t paramType;

            paramType = WasmEmit_typeFromIR(function->params[paramIndex].ty, &isVoid);
            if (paramType == 0 || isVoid)
                return WasmEmit_validateError("wasm codegen: unsupported function param type");
            if (!WasmEncodeBuffer_appendByte(&payload, paramType))
                return WasmEmit_internalError("wasm codegen: failed to write function param type");
        }

        returnType = WasmEmit_typeFromIR(function->returnType, &returnIsVoid);
        if (returnType == 0)
            return WasmEmit_validateError("wasm codegen: unsupported function return type");
        if (returnIsVoid) {
            if (!WasmEncode_writeU32Leb(&payload, 0))
                return WasmEmit_internalError("wasm codegen: failed to write void return count");
        } else {
            if (!WasmEncode_writeU32Leb(&payload, 1))
                return WasmEmit_internalError("wasm codegen: failed to write return count");
            if (!WasmEncodeBuffer_appendByte(&payload, returnType))
                return WasmEmit_internalError("wasm codegen: failed to write return type");
        }
    }

    if (!WasmEncode_writeSection(module, WasmSection_Type, &payload))
        return WasmEmit_internalError("wasm codegen: failed to append type section");
    return BackendStatus_ok();
}

static BackendStatus WasmEmit_writeImportSection(WasmEmitContext* context, WasmEncodeBuffer* module)
{
    WasmEncodeBuffer payload;

    if (!WasmEncodeBuffer_init(&payload, context->arena, 64))
        return WasmEmit_internalError("wasm codegen: failed to init import section");

    if (!WasmEncode_writeU32Leb(&payload, 2))
        return WasmEmit_internalError("wasm codegen: failed to write import count");

    if (!WasmEncode_writeName(&payload, ByteSpan_fromCString("env")))
        return WasmEmit_internalError("wasm codegen: failed to write import module");
    if (!WasmEncode_writeName(&payload, ByteSpan_fromCString("jsrust_write_byte")))
        return WasmEmit_internalError("wasm codegen: failed to write write-byte import name");
    if (!WasmEncodeBuffer_appendByte(&payload, 0x00))
        return WasmEmit_internalError("wasm codegen: failed to write import kind");
    if (!WasmEncode_writeU32Leb(&payload, 0))
        return WasmEmit_internalError("wasm codegen: failed to write write-byte type index");

    if (!WasmEncode_writeName(&payload, ByteSpan_fromCString("env")))
        return WasmEmit_internalError("wasm codegen: failed to write import module");
    if (!WasmEncode_writeName(&payload, ByteSpan_fromCString("jsrust_flush")))
        return WasmEmit_internalError("wasm codegen: failed to write flush import name");
    if (!WasmEncodeBuffer_appendByte(&payload, 0x00))
        return WasmEmit_internalError("wasm codegen: failed to write import kind");
    if (!WasmEncode_writeU32Leb(&payload, 1))
        return WasmEmit_internalError("wasm codegen: failed to write flush type index");

    if (!WasmEncode_writeSection(module, WasmSection_Import, &payload))
        return WasmEmit_internalError("wasm codegen: failed to append import section");
    return BackendStatus_ok();
}

static BackendStatus WasmEmit_writeFunctionSection(WasmEmitContext* context, WasmEncodeBuffer* module)
{
    WasmEncodeBuffer payload;
    uint32_t index;

    if (!WasmEncodeBuffer_init(&payload, context->arena, 64))
        return WasmEmit_internalError("wasm codegen: failed to init function section");

    if (!WasmEncode_writeU32Leb(&payload, context->module->functionCount))
        return WasmEmit_internalError("wasm codegen: failed to write function count");
    for (index = 0; index < context->module->functionCount; ++index) {
        if (!WasmEncode_writeU32Leb(&payload, 2 + index))
            return WasmEmit_internalError("wasm codegen: failed to write function type index");
    }

    if (!WasmEncode_writeSection(module, WasmSection_Function, &payload))
        return WasmEmit_internalError("wasm codegen: failed to append function section");
    return BackendStatus_ok();
}

static BackendStatus WasmEmit_writeExportSection(WasmEmitContext* context, WasmEncodeBuffer* module)
{
    WasmEncodeBuffer payload;
    uint32_t index;
    uint8_t hasMain;

    if (!WasmEncodeBuffer_init(&payload, context->arena, 32))
        return WasmEmit_internalError("wasm codegen: failed to init export section");

    hasMain = 0;
    for (index = 0; index < context->module->functionCount; ++index) {
        if (&context->module->functions[index] == context->entryFunction) {
            hasMain = 1;
            break;
        }
    }
    if (!hasMain)
        return WasmEmit_validateError("wasm codegen: entry function for export not found");

    if (!WasmEncode_writeU32Leb(&payload, 1))
        return WasmEmit_internalError("wasm codegen: failed to write export count");
    if (!WasmEncode_writeName(&payload, ByteSpan_fromCString("main")))
        return WasmEmit_internalError("wasm codegen: failed to write export name");
    if (!WasmEncodeBuffer_appendByte(&payload, 0x00))
        return WasmEmit_internalError("wasm codegen: failed to write export kind");
    if (!WasmEncode_writeU32Leb(&payload, 2 + index))
        return WasmEmit_internalError("wasm codegen: failed to write export function index");

    if (!WasmEncode_writeSection(module, WasmSection_Export, &payload))
        return WasmEmit_internalError("wasm codegen: failed to append export section");
    return BackendStatus_ok();
}

static BackendStatus WasmEmit_writeCodeSection(WasmEmitContext* context, WasmEncodeBuffer* module)
{
    WasmEncodeBuffer payload;
    uint32_t functionIndex;

    if (!WasmEncodeBuffer_init(&payload, context->arena, 256))
        return WasmEmit_internalError("wasm codegen: failed to init code section");

    if (!WasmEncode_writeU32Leb(&payload, context->module->functionCount))
        return WasmEmit_internalError("wasm codegen: failed to write code function count");

    for (functionIndex = 0; functionIndex < context->module->functionCount; ++functionIndex) {
        WasmFunctionLowering lowering;
        WasmEncodeBuffer body;
        BackendStatus status;

        lowering.context = context;
        lowering.function = &context->module->functions[functionIndex];
        lowering.functionOrdinal = functionIndex;
        lowering.functionIndex = 2 + functionIndex;
        lowering.returnType = WasmValType_I32;
        lowering.currentBlockLocal = 0;
        lowering.localCount = 0;
        lowering.localTypes = NULL;

        status = WasmFunctionLowering_buildMaps(&lowering);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        if (!WasmEncodeBuffer_init(&body, context->arena, 256))
            return WasmEmit_internalError("wasm codegen: failed to init function body buffer");
        status = WasmFunctionLowering_emitBody(&lowering, &body);
        if (status.code != JSRUST_BACKEND_OK)
            return status;

        if (!WasmEncode_writeU32Leb(&payload, (uint32_t)body.len))
            return WasmEmit_internalError("wasm codegen: failed to write function body size");
        if (!WasmEncodeBuffer_appendSpan(&payload, ByteSpan_fromParts(body.data, body.len)))
            return WasmEmit_internalError("wasm codegen: failed to append function body");
    }

    if (!WasmEncode_writeSection(module, WasmSection_Code, &payload))
        return WasmEmit_internalError("wasm codegen: failed to append code section");
    return BackendStatus_ok();
}

WasmEmitResult WasmEmit_emitModule(Arena* arena, const IRModule* module, ByteSpan entryName)
{
    WasmEmitResult result;
    WasmEmitContext context;
    WasmEncodeBuffer out;
    BackendStatus status;

    result.status = BackendStatus_ok();
    result.wasmBytes = ByteSpan_fromParts(NULL, 0);

    context.arena = arena;
    context.module = module;
    context.entryName = entryName;
    context.entryFunction = WasmEmit_findFunctionByName(module, entryName);
    context.importWriteByteIndex = 0;
    context.importFlushIndex = 1;

    if (!context.entryFunction) {
        result.status = WasmEmit_validateError("wasm codegen: entry function not found");
        return result;
    }

    if (!WasmEncodeBuffer_init(&out, arena, 1024)) {
        result.status = WasmEmit_internalError("wasm codegen: failed to init module output buffer");
        return result;
    }

    if (!WasmEncodeBuffer_appendByte(&out, 0x00) || !WasmEncodeBuffer_appendByte(&out, 0x61) || !WasmEncodeBuffer_appendByte(&out, 0x73) || !WasmEncodeBuffer_appendByte(&out, 0x6D) || !WasmEncodeBuffer_appendByte(&out, 0x01) || !WasmEncodeBuffer_appendByte(&out, 0x00) || !WasmEncodeBuffer_appendByte(&out, 0x00) || !WasmEncodeBuffer_appendByte(&out, 0x00)) {
        result.status = WasmEmit_internalError("wasm codegen: failed to write wasm magic/version");
        return result;
    }

    status = WasmEmit_writeTypeSection(&context, &out);
    if (status.code != JSRUST_BACKEND_OK) {
        result.status = status;
        return result;
    }

    status = WasmEmit_writeImportSection(&context, &out);
    if (status.code != JSRUST_BACKEND_OK) {
        result.status = status;
        return result;
    }

    status = WasmEmit_writeFunctionSection(&context, &out);
    if (status.code != JSRUST_BACKEND_OK) {
        result.status = status;
        return result;
    }

    status = WasmEmit_writeExportSection(&context, &out);
    if (status.code != JSRUST_BACKEND_OK) {
        result.status = status;
        return result;
    }

    status = WasmEmit_writeCodeSection(&context, &out);
    if (status.code != JSRUST_BACKEND_OK) {
        result.status = status;
        return result;
    }

    result.wasmBytes = ByteSpan_fromParts(out.data, out.len);
    return result;
}
