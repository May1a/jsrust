#include "ir_model.h"

bool IRInstruction_hasResult(uint8_t kind)
{
    switch (kind) {
    case IRInstKind_Store:
    case IRInstKind_Memcpy:
        return false;
    default:
        return true;
    }
}
