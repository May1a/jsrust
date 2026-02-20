#include "ir_validate_min.h"

static BackendStatus IRValidate_error(const char* message)
{
    return BackendStatus_make(JSRUST_BACKEND_ERR_VALIDATE, ByteSpan_fromCString(message));
}

static const IRBlock* IRFunction_findBlockById(const IRFunction* function, uint32_t blockId)
{
    uint32_t index;

    for (index = 0; index < function->blockCount; ++index) {
        if (function->blocks[index].id == blockId)
            return &function->blocks[index];
    }

    return NULL;
}

static bool IRFunction_hasValueId(const IRFunction* function, uint32_t valueId)
{
    uint32_t index;

    for (index = 0; index < function->paramCount; ++index) {
        if (function->params[index].id == valueId)
            return true;
    }

    for (index = 0; index < function->blockCount; ++index) {
        const IRBlock* block;
        uint32_t inner;

        block = &function->blocks[index];
        for (inner = 0; inner < block->paramCount; ++inner) {
            if (block->params[inner].id == valueId)
                return true;
        }

        for (inner = 0; inner < block->instructionCount; ++inner) {
            if (block->instructions[inner].hasResult && block->instructions[inner].id == valueId)
                return true;
        }
    }

    return false;
}

static BackendStatus IRValidate_operandExists(const IRFunction* function, uint32_t valueId)
{
    if (!IRFunction_hasValueId(function, valueId))
        return IRValidate_error("undefined value reference in instruction or terminator");

    return BackendStatus_ok();
}

static BackendStatus IRValidate_instruction(const IRFunction* function, const IRInstruction* inst)
{
    uint32_t index;

    switch (inst->kind) {
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
    case IRInstKind_Icmp:
    case IRInstKind_Fcmp:
        if (IRValidate_operandExists(function, inst->a).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined lhs value");
        if (IRValidate_operandExists(function, inst->b).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined rhs value");
        break;
    case IRInstKind_Ineg:
    case IRInstKind_Fneg:
        if (IRValidate_operandExists(function, inst->a).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined unary operand");
        break;
    case IRInstKind_Load:
        if (IRValidate_operandExists(function, inst->ptr).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined load pointer");
        break;
    case IRInstKind_Store:
        if (IRValidate_operandExists(function, inst->ptr).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined store pointer");
        if (IRValidate_operandExists(function, inst->value).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined store value");
        break;
    case IRInstKind_Memcpy:
        if (IRValidate_operandExists(function, inst->dest).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined memcpy destination");
        if (IRValidate_operandExists(function, inst->src).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined memcpy source");
        break;
    case IRInstKind_Gep:
        if (IRValidate_operandExists(function, inst->ptr).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined gep base pointer");
        for (index = 0; index < inst->indices.count; ++index) {
            if (IRValidate_operandExists(function, inst->indices.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("undefined gep index value");
        }
        break;
    case IRInstKind_Ptradd:
        if (IRValidate_operandExists(function, inst->ptr).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined ptradd base pointer");
        if (IRValidate_operandExists(function, inst->offset).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined ptradd offset value");
        break;
    case IRInstKind_Trunc:
    case IRInstKind_Sext:
    case IRInstKind_Zext:
    case IRInstKind_Fptoui:
    case IRInstKind_Fptosi:
    case IRInstKind_Uitofp:
    case IRInstKind_Sitofp:
    case IRInstKind_Bitcast:
        if (IRValidate_operandExists(function, inst->val).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined cast operand");
        break;
    case IRInstKind_Call:
        for (index = 0; index < inst->callArgs.count; ++index) {
            if (IRValidate_operandExists(function, inst->callArgs.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("undefined call argument");
        }
        break;
    case IRInstKind_CallDyn:
        if (IRValidate_operandExists(function, inst->fn).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined dynamic call callee");
        for (index = 0; index < inst->callArgs.count; ++index) {
            if (IRValidate_operandExists(function, inst->callArgs.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("undefined dynamic call argument");
        }
        break;
    case IRInstKind_StructCreate:
        for (index = 0; index < inst->fields.count; ++index) {
            if (IRValidate_operandExists(function, inst->fields.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("undefined struct field operand");
        }
        break;
    case IRInstKind_StructGet:
        if (IRValidate_operandExists(function, inst->structValue).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined struct source value");
        break;
    case IRInstKind_EnumCreate:
        if (inst->hasData && IRValidate_operandExists(function, inst->data).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined enum payload operand");
        break;
    case IRInstKind_EnumGetTag:
    case IRInstKind_EnumGetData:
        if (IRValidate_operandExists(function, inst->enumValue).code != JSRUST_BACKEND_OK)
            return IRValidate_error("undefined enum source value");
        break;
    case IRInstKind_Iconst:
    case IRInstKind_Fconst:
    case IRInstKind_Bconst:
    case IRInstKind_Null:
    case IRInstKind_Alloca:
    case IRInstKind_Sconst:
        break;
    default:
        return IRValidate_error("unknown instruction opcode during validation");
    }

    return BackendStatus_ok();
}

static BackendStatus IRValidate_terminator(const IRFunction* function, const IRTerminator* term)
{
    uint32_t index;
    const IRBlock* target;

    switch (term->kind) {
    case IRTermKind_Ret:
        if (term->hasValue)
            return IRValidate_operandExists(function, term->value);
        return BackendStatus_ok();
    case IRTermKind_Br:
        target = IRFunction_findBlockById(function, term->target);
        if (!target)
            return IRValidate_error("branch target block does not exist");
        if (target->paramCount != term->args.count)
            return IRValidate_error("branch argument arity mismatch");
        for (index = 0; index < term->args.count; ++index) {
            if (IRValidate_operandExists(function, term->args.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("branch argument references undefined value");
        }
        return BackendStatus_ok();
    case IRTermKind_BrIf:
        if (IRValidate_operandExists(function, term->cond).code != JSRUST_BACKEND_OK)
            return IRValidate_error("br_if condition references undefined value");
        target = IRFunction_findBlockById(function, term->thenBlock);
        if (!target)
            return IRValidate_error("br_if then block does not exist");
        if (target->paramCount != term->thenArgs.count)
            return IRValidate_error("br_if then argument arity mismatch");
        for (index = 0; index < term->thenArgs.count; ++index) {
            if (IRValidate_operandExists(function, term->thenArgs.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("br_if then argument undefined");
        }
        target = IRFunction_findBlockById(function, term->elseBlock);
        if (!target)
            return IRValidate_error("br_if else block does not exist");
        if (target->paramCount != term->elseArgs.count)
            return IRValidate_error("br_if else argument arity mismatch");
        for (index = 0; index < term->elseArgs.count; ++index) {
            if (IRValidate_operandExists(function, term->elseArgs.items[index]).code != JSRUST_BACKEND_OK)
                return IRValidate_error("br_if else argument undefined");
        }
        return BackendStatus_ok();
    case IRTermKind_Switch:
        if (IRValidate_operandExists(function, term->switchValue).code != JSRUST_BACKEND_OK)
            return IRValidate_error("switch value undefined");
        for (index = 0; index < term->switchCaseCount; ++index) {
            target = IRFunction_findBlockById(function, term->switchCases[index].target);
            if (!target)
                return IRValidate_error("switch case target block missing");
            if (target->paramCount != term->switchCases[index].args.count)
                return IRValidate_error("switch case argument arity mismatch");
        }
        target = IRFunction_findBlockById(function, term->defaultBlock);
        if (!target)
            return IRValidate_error("switch default target block missing");
        if (target->paramCount != term->defaultArgs.count)
            return IRValidate_error("switch default argument arity mismatch");
        return BackendStatus_ok();
    case IRTermKind_Unreachable:
        return BackendStatus_ok();
    default:
        return IRValidate_error("unknown terminator kind");
    }
}

BackendStatus IRValidate_minimal(const IRModule* module)
{
    uint32_t fnIndex;

    for (fnIndex = 0; fnIndex < module->functionCount; ++fnIndex) {
        const IRFunction* function;
        uint32_t blockIndex;

        function = &module->functions[fnIndex];
        if (function->blockCount == 0)
            return IRValidate_error("function has no blocks");

        for (blockIndex = 0; blockIndex < function->blockCount; ++blockIndex) {
            uint32_t other;
            const IRBlock* block;
            uint32_t instIndex;
            BackendStatus status;

            block = &function->blocks[blockIndex];
            for (other = blockIndex + 1; other < function->blockCount; ++other) {
                if (function->blocks[other].id == block->id)
                    return IRValidate_error("duplicate block id in function");
            }

            for (instIndex = 0; instIndex < block->instructionCount; ++instIndex) {
                status = IRValidate_instruction(function, &block->instructions[instIndex]);
                if (status.code != JSRUST_BACKEND_OK)
                    return status;
            }

            status = IRValidate_terminator(function, &block->terminator);
            if (status.code != JSRUST_BACKEND_OK)
                return status;
        }
    }

    return BackendStatus_ok();
}
