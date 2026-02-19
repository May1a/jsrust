#pragma once

#include "bytes.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum {
    IRTypeKind_Int = 0,
    IRTypeKind_Float = 1,
    IRTypeKind_Bool = 2,
    IRTypeKind_Ptr = 3,
    IRTypeKind_Unit = 4,
    IRTypeKind_Struct = 5,
    IRTypeKind_Enum = 6,
    IRTypeKind_Array = 7,
    IRTypeKind_Fn = 8
} IRTypeKind;

typedef enum {
    IRInstKind_Iconst = 0,
    IRInstKind_Fconst = 1,
    IRInstKind_Bconst = 2,
    IRInstKind_Null = 3,
    IRInstKind_Iadd = 4,
    IRInstKind_Isub = 5,
    IRInstKind_Imul = 6,
    IRInstKind_Idiv = 7,
    IRInstKind_Imod = 8,
    IRInstKind_Fadd = 9,
    IRInstKind_Fsub = 10,
    IRInstKind_Fmul = 11,
    IRInstKind_Fdiv = 12,
    IRInstKind_Ineg = 13,
    IRInstKind_Fneg = 14,
    IRInstKind_Iand = 15,
    IRInstKind_Ior = 16,
    IRInstKind_Ixor = 17,
    IRInstKind_Ishl = 18,
    IRInstKind_Ishr = 19,
    IRInstKind_Icmp = 20,
    IRInstKind_Fcmp = 21,
    IRInstKind_Alloca = 22,
    IRInstKind_Load = 23,
    IRInstKind_Store = 24,
    IRInstKind_Memcpy = 25,
    IRInstKind_Gep = 26,
    IRInstKind_Ptradd = 27,
    IRInstKind_Trunc = 28,
    IRInstKind_Sext = 29,
    IRInstKind_Zext = 30,
    IRInstKind_Fptoui = 31,
    IRInstKind_Fptosi = 32,
    IRInstKind_Uitofp = 33,
    IRInstKind_Sitofp = 34,
    IRInstKind_Bitcast = 35,
    IRInstKind_Call = 36,
    IRInstKind_StructCreate = 37,
    IRInstKind_StructGet = 38,
    IRInstKind_EnumCreate = 39,
    IRInstKind_EnumGetTag = 40,
    IRInstKind_EnumGetData = 41
} IRInstKind;

typedef enum {
    IRTermKind_Ret = 0,
    IRTermKind_Br = 1,
    IRTermKind_BrIf = 2,
    IRTermKind_Switch = 3,
    IRTermKind_Unreachable = 4
} IRTermKind;

typedef struct IRType IRType;

typedef struct {
    uint32_t id;
    IRType* ty;
} IRValueParam;

typedef struct {
    uint32_t count;
    uint32_t* items;
} IRU32List;

typedef struct {
    uint32_t target;
    int64_t value;
    IRU32List args;
} IRTermSwitchCase;

typedef struct {
    uint8_t kind;
    uint8_t hasValue;
    uint32_t value;
    uint32_t target;
    IRU32List args;
    uint32_t cond;
    uint32_t thenBlock;
    IRU32List thenArgs;
    uint32_t elseBlock;
    IRU32List elseArgs;
    uint32_t switchValue;
    uint32_t switchCaseCount;
    IRTermSwitchCase* switchCases;
    uint32_t defaultBlock;
    IRU32List defaultArgs;
} IRTerminator;

typedef struct {
    uint8_t kind;
    uint8_t hasResult;
    uint32_t id;
    IRType* ty;
    int64_t intValue;
    double floatValue;
    uint8_t boolValue;
    uint32_t a;
    uint32_t b;
    uint8_t compareOp;
    uint32_t localId;
    uint32_t ptr;
    uint32_t value;
    IRType* valueType;
    uint32_t dest;
    uint32_t src;
    uint32_t size;
    IRU32List indices;
    uint32_t offset;
    uint32_t val;
    IRType* fromTy;
    uint32_t fn;
    IRU32List callArgs;
    IRU32List fields;
    uint32_t structValue;
    uint32_t fieldIndex;
    uint32_t variant;
    uint8_t hasData;
    uint32_t data;
    uint32_t enumValue;
    uint32_t index;
} IRInstruction;

typedef struct {
    uint32_t id;
    uint32_t paramCount;
    IRValueParam* params;
    uint32_t instructionCount;
    IRInstruction* instructions;
    IRTerminator terminator;
} IRBlock;

typedef struct {
    uint32_t syntheticId;
    ByteSpan name;
    uint32_t nameStringId;
    uint32_t paramCount;
    IRValueParam* params;
    IRType* returnType;
    uint32_t localCount;
    IRValueParam* locals;
    uint32_t blockCount;
    IRBlock* blocks;
} IRFunction;

typedef struct {
    ByteSpan name;
    uint32_t nameStringId;
    IRType* ty;
    uint8_t hasInit;
    int64_t initInt;
    double initFloat;
    uint8_t initBool;
} IRGlobal;

typedef struct {
    ByteSpan name;
    uint32_t nameStringId;
    uint32_t fieldCount;
    IRType** fields;
} IRStructDef;

typedef struct {
    uint32_t fieldCount;
    IRType** fields;
} IREnumVariant;

typedef struct {
    ByteSpan name;
    uint32_t nameStringId;
    uint32_t variantCount;
    IREnumVariant* variants;
} IREnumDef;

struct IRType {
    uint8_t kind;
    uint8_t width;
    ByteSpan name;
    uint32_t nameStringId;
    uint32_t arrayLength;
    IRType* elementType;
    uint32_t fnParamCount;
    IRType** fnParamTypes;
    IRType* fnReturnType;
};

typedef struct {
    uint32_t count;
    ByteSpan* items;
} IRStringTable;

typedef struct {
    IRStringTable strings;
    uint32_t structCount;
    IRStructDef* structs;
    uint32_t enumCount;
    IREnumDef* enums;
    uint32_t globalCount;
    IRGlobal* globals;
    uint32_t functionCount;
    IRFunction* functions;
} IRModule;

bool IRInstruction_hasResult(uint8_t kind);

