/** @typedef {import('./ir.js').ValueId} ValueId */
/** @typedef {import('./ir.js').BlockId} BlockId */
/** @typedef {import('./ir.js').FunctionId} FunctionId */
/** @typedef {import('./ir.js').IRType} IRType */
/** @typedef {import('./ir.js').IRModule} IRModule */
/** @typedef {import('./ir.js').IRFunction} IRFunction */
/** @typedef {import('./ir.js').IRBlock} IRBlock */
/** @typedef {import('./ir.js').IRInst} IRInst */
/** @typedef {import('./ir.js').IRTerm} IRTerminator */

import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    irTypeEquals,
    irTypeToString,
} from "./ir.js";

// ============================================================================
// Task 12.1: Validation Error Types
// ============================================================================

const ValidationErrorKind = {
    UndefinedValue: 0,
    TypeMismatch: 1,
    MissingTerminator: 2,
    InvalidBlockArg: 3,
    UndefinedBlock: 4,
    UndefinedFunction: 5,
    DuplicateDefinition: 6,
    UnreachableBlock: 7,
    DominanceViolation: 8,
    InvalidOperand: 9,
    MissingReturn: 10,
};

/**
 * @param {number} kind
 * @param {string} message
 * @param {object} [loc]
 * @param {number} [loc.blockId]
 * @param {number} [loc.valueId]
 * @param {number} [loc.fnId]
 * @returns {{ kind: number, message: string, loc?: object }}
 */
function makeValidationError(kind, message, loc) {
    return { kind, message, loc };
}

/** @param {ValueId} valueId @param {string} context @returns {{ kind: number, message: string, loc?: object }} */
function errUndefinedValue(valueId, context) {
    return makeValidationError(
        ValidationErrorKind.UndefinedValue,
        `Undefined value %${valueId} in ${context}`,
        { valueId },
    );
}

/** @param {string} expected @param {string} actual @param {string} context @returns {{ kind: number, message: string, loc?: object }} */
function errTypeMismatch(expected, actual, context) {
    return makeValidationError(
        ValidationErrorKind.TypeMismatch,
        `Type mismatch in ${context}: expected ${expected}, got ${actual}`,
        {},
    );
}

/** @param {BlockId} blockId @returns {{ kind: number, message: string, loc?: object }} */
function errMissingTerminator(blockId) {
    return makeValidationError(
        ValidationErrorKind.MissingTerminator,
        `Block %${blockId} has no terminator`,
        { blockId },
    );
}

/** @param {BlockId} blockId @param {number} expected @param {number} actual @returns {{ kind: number, message: string, loc?: object }} */
function errInvalidBlockArg(blockId, expected, actual) {
    return makeValidationError(
        ValidationErrorKind.InvalidBlockArg,
        `Block %${blockId} expects ${expected} args, got ${actual}`,
        { blockId },
    );
}

/** @param {BlockId} blockId @returns {{ kind: number, message: string, loc?: object }} */
function errUndefinedBlock(blockId) {
    return makeValidationError(
        ValidationErrorKind.UndefinedBlock,
        `Undefined block %${blockId}`,
        { blockId },
    );
}

/** @param {string} name @returns {{ kind: number, message: string, loc?: object }} */
function errUndefinedFunction(name) {
    return makeValidationError(
        ValidationErrorKind.UndefinedFunction,
        `Undefined function ${name}`,
        {},
    );
}

/** @param {string} name @param {string} kind @returns {{ kind: number, message: string, loc?: object }} */
function errDuplicateDefinition(name, kind) {
    return makeValidationError(
        ValidationErrorKind.DuplicateDefinition,
        `Duplicate ${kind} definition: ${name}`,
        {},
    );
}

/** @param {BlockId} blockId @returns {{ kind: number, message: string, loc?: object }} */
function errUnreachableBlock(blockId) {
    return makeValidationError(
        ValidationErrorKind.UnreachableBlock,
        `Block %${blockId} is unreachable from entry`,
        { blockId },
    );
}

/** @param {ValueId} valueId @param {BlockId} useBlock @param {BlockId} defBlock @returns {{ kind: number, message: string, loc?: object }} */
function errDominanceViolation(valueId, useBlock, defBlock) {
    return makeValidationError(
        ValidationErrorKind.DominanceViolation,
        `Value %${valueId} used in block %${useBlock} but defined in block %${defBlock} which does not dominate`,
        { valueId, blockId: useBlock },
    );
}

/** @param {string} message @returns {{ kind: number, message: string, loc?: object }} */
function errInvalidOperand(message) {
    return makeValidationError(ValidationErrorKind.InvalidOperand, message, {});
}

/**
 * @param {string} fnName
 * @returns {{ kind: number, message: string, loc?: object }}
 */
function errMissingReturn(fnName) {
    return makeValidationError(
        ValidationErrorKind.MissingReturn,
        `Function ${fnName} is missing return statement`,
        {},
    );
}

// ============================================================================
// Task 12.2: Validation Context
// ============================================================================

/**
 * @typedef {object} ValidationCtx
 * @property {IRFunction|null} fn
 * @property {Set<ValueId>} definedValues
 * @property {Map<ValueId, IRType>} valueTypes
 * @property {Map<BlockId, IRBlock>} blocks
 * @property {Map<ValueId, BlockId>} valueDefBlock
 * @property {{ kind: number, message: string, loc?: object }[]} errors
 */

/** @returns {ValidationCtx} */
function makeValidationCtx() {
    return {
        fn: null,
        definedValues: new Set(),
        valueTypes: new Map(),
        blocks: new Map(),
        valueDefBlock: new Map(),
        errors: [],
    };
}

/** @param {IRFunction} fn @param {ValidationCtx} ctx */
function setFunction(ctx, fn) {
    ctx.fn = fn;
    ctx.definedValues.clear();
    ctx.valueTypes.clear();
    ctx.blocks.clear();
    ctx.valueDefBlock.clear();

    // Register all blocks
    for (const block of fn.blocks) {
        ctx.blocks.set(block.id, block);
    }
}

/** @param {ValueId} id @param {IRType} ty @param {BlockId} blockId @param {ValidationCtx} ctx */
function defineValue(ctx, id, ty, blockId) {
    ctx.definedValues.add(id);
    ctx.valueTypes.set(id, ty);
    ctx.valueDefBlock.set(id, blockId);
}

/** @param {ValueId} id @param {ValidationCtx} ctx @returns {boolean} */
function isValueDefined(ctx, id) {
    return ctx.definedValues.has(id);
}

/** @param {ValueId} id @param {ValidationCtx} ctx @returns {IRType|undefined} */
function getValueType(ctx, id) {
    return ctx.valueTypes.get(id);
}

/** @param {BlockId} id @param {ValidationCtx} ctx @returns {IRBlock|undefined} */
function getBlock(ctx, id) {
    return ctx.blocks.get(id);
}

/** @param {{ kind: number, message: string, loc?: object }} error @param {ValidationCtx} ctx */
function addError(ctx, error) {
    ctx.errors.push(error);
}

// ============================================================================
// Task 12.3: Module Validation
// ============================================================================

/**
 * @param {IRModule} module
 * @returns {{ ok: boolean, errors: { kind: number, message: string, loc?: object }[] }}
 */
function validateModule(module) {
    const ctx = makeValidationCtx();

    // Check for duplicate function names
    const fnNames = new Set();
    for (const fn of module.functions) {
        if (fnNames.has(fn.name)) {
            addError(ctx, errDuplicateDefinition(fn.name, "function"));
        }
        fnNames.add(fn.name);
    }

    // Check for duplicate global names
    const globalNames = new Set();
    for (const global of module.globals) {
        if (globalNames.has(global.name)) {
            addError(ctx, errDuplicateDefinition(global.name, "global"));
        }
        globalNames.add(global.name);
    }

    // Validate all functions
    for (const fn of module.functions) {
        validateFunction(fn, ctx);
    }

    return {
        ok: ctx.errors.length === 0,
        errors: ctx.errors,
    };
}

// ============================================================================
// Task 12.4: Function Validation
// ============================================================================

/**
 * Validate a single function.
 * Supports both internal shared-context use and standalone calls.
 * @param {IRFunction} fn
 * @param {ValidationCtx} [ctx]
 * @returns {{ ok: boolean, errors: { kind: number, message: string, loc?: object }[] }}
 */
function validateFunction(fn, ctx = makeValidationCtx()) {
    const startErrorCount = ctx.errors.length;
    setFunction(ctx, fn);

    // Check function has at least one block
    if (fn.blocks.length === 0) {
        addError(ctx, errMissingReturn(fn.name));
        return { ok: false, errors: [] };
    }

    // Register function parameters
    for (const param of fn.params) {
        defineValue(ctx, param.id, param.ty, /** @type {import('./ir.js').IRBlock} */(fn.entry).id);
    }

    // Validate all blocks
    for (const block of fn.blocks) {
        validateBlock(block, ctx);
    }

    // Check reachability from entry
    if (fn.entry) {
        validateReachability(fn.entry, ctx);
    }

    // Validate dominance
    validateDominance(fn, ctx);

    const newErrors = ctx.errors.slice(startErrorCount);
    return {
        ok: newErrors.length === 0,
        errors: newErrors,
    };
}

// ============================================================================
// Task 12.5: Block Validation
// ============================================================================

/**
 * @param {IRBlock} block
 * @param {ValidationCtx} ctx
 */
function validateBlock(block, ctx) {
    // Register block parameters
    for (const param of block.params) {
        defineValue(ctx, param.id, param.ty, block.id);
    }

    // Validate each instruction
    for (const inst of block.instructions) {
        validateInstruction(inst, block.id, ctx);
        // Register the defined value
        if (inst.id !== null) {
            defineValue(ctx, inst.id, inst.ty, block.id);
        }
    }

    // Validate terminator exists
    if (!block.terminator) {
        addError(ctx, errMissingTerminator(block.id));
    } else {
        validateTerminator(block.terminator, block.id, ctx);
    }
}

// ============================================================================
// Task 12.6: Instruction Validation
// ============================================================================

/**
 * @param {IRInst} inst
 * @param {BlockId} blockId
 * @param {ValidationCtx} ctx
 */
function validateInstruction(inst, blockId, ctx) {
    switch (inst.kind) {
        case IRInstKind.Iconst:
        case IRInstKind.Fconst:
        case IRInstKind.Bconst:
        case IRInstKind.Null:
            // Constants have no operands to validate
            break;

        case IRInstKind.Iadd:
        case IRInstKind.Isub:
        case IRInstKind.Imul:
        case IRInstKind.Idiv:
        case IRInstKind.Imod:
        case IRInstKind.Fadd:
        case IRInstKind.Fsub:
        case IRInstKind.Fmul:
        case IRInstKind.Fdiv:
        case IRInstKind.Iand:
        case IRInstKind.Ior:
        case IRInstKind.Ixor:
        case IRInstKind.Ishl:
        case IRInstKind.Ishr:
            validateBinaryOp(inst, blockId, ctx);
            break;

        case IRInstKind.Ineg:
        case IRInstKind.Fneg:
            validateUnaryOp(inst, blockId, ctx);
            break;

        case IRInstKind.Icmp:
        case IRInstKind.Fcmp:
            validateComparison(inst, blockId, ctx);
            break;

        case IRInstKind.Alloca:
        case IRInstKind.Sconst:
            // Alloca has no value operands
            break;

        case IRInstKind.Load:
            validateLoad(inst, blockId, ctx);
            break;

        case IRInstKind.Store:
            validateStore(inst, blockId, ctx);
            break;

        case IRInstKind.Memcpy:
            validateMemcpy(inst, blockId, ctx);
            break;

        case IRInstKind.Gep:
            validateGep(inst, blockId, ctx);
            break;

        case IRInstKind.Ptradd:
            validatePtradd(inst, blockId, ctx);
            break;

        case IRInstKind.Trunc:
        case IRInstKind.Sext:
        case IRInstKind.Zext:
        case IRInstKind.Fptoui:
        case IRInstKind.Fptosi:
        case IRInstKind.Uitofp:
        case IRInstKind.Sitofp:
        case IRInstKind.Bitcast:
            validateConversion(inst, blockId, ctx);
            break;

        case IRInstKind.Call:
            validateCall(inst, blockId, ctx);
            break;

        case IRInstKind.CallDyn:
            validateCallDyn(inst, blockId, ctx);
            break;

        case IRInstKind.StructCreate:
            validateStructCreate(inst, blockId, ctx);
            break;

        case IRInstKind.StructGet:
            validateStructGet(inst, blockId, ctx);
            break;

        case IRInstKind.EnumCreate:
            validateEnumCreate(inst, blockId, ctx);
            break;

        case IRInstKind.EnumGetTag:
            validateEnumGetTag(inst, blockId, ctx);
            break;

        case IRInstKind.EnumGetData:
            validateEnumGetData(inst, blockId, ctx);
            break;

        default:
            addError(
                ctx,
                errInvalidOperand(`Unknown instruction kind: ${inst.kind}`),
            );
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateBinaryOp(inst, blockId, ctx) {
    // Check operands are defined
    if (!isValueDefined(ctx, inst.a)) {
        addError(ctx, errUndefinedValue(inst.a, "binary operation"));
    }
    if (!isValueDefined(ctx, inst.b)) {
        addError(ctx, errUndefinedValue(inst.b, "binary operation"));
    }

    // Check operand types match
    const tyA = getValueType(ctx, inst.a);
    const tyB = getValueType(ctx, inst.b);
    if (tyA && tyB && !irTypeEquals(tyA, tyB)) {
        addError(
            ctx,
            errTypeMismatch(
                irTypeToString(tyA),
                irTypeToString(tyB),
                "binary operation operands",
            ),
        );
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateUnaryOp(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.a)) {
        addError(ctx, errUndefinedValue(inst.a, "unary operation"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateComparison(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.a)) {
        addError(ctx, errUndefinedValue(inst.a, "comparison"));
    }
    if (!isValueDefined(ctx, inst.b)) {
        addError(ctx, errUndefinedValue(inst.b, "comparison"));
    }

    // Check operand types match
    const tyA = getValueType(ctx, inst.a);
    const tyB = getValueType(ctx, inst.b);
    if (tyA && tyB && !irTypeEquals(tyA, tyB)) {
        addError(
            ctx,
            errTypeMismatch(
                irTypeToString(tyA),
                irTypeToString(tyB),
                "comparison operands",
            ),
        );
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateLoad(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.ptr)) {
        addError(ctx, errUndefinedValue(inst.ptr, "load"));
    }

    // Check ptr is a pointer type
    const ptrTy = getValueType(ctx, inst.ptr);
    if (ptrTy && ptrTy.kind !== IRTypeKind.Ptr) {
        addError(
            ctx,
            errTypeMismatch("pointer", irTypeToString(ptrTy), "load operand"),
        );
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateStore(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.ptr)) {
        addError(ctx, errUndefinedValue(inst.ptr, "store"));
    }
    if (!isValueDefined(ctx, inst.value)) {
        addError(ctx, errUndefinedValue(inst.value, "store"));
    }

    // Check ptr is a pointer type
    const ptrTy = getValueType(ctx, inst.ptr);
    if (ptrTy && ptrTy.kind !== IRTypeKind.Ptr) {
        addError(
            ctx,
            errTypeMismatch("pointer", irTypeToString(ptrTy), "store operand"),
        );
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateMemcpy(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.dest)) {
        addError(ctx, errUndefinedValue(inst.dest, "memcpy dest"));
    }
    if (!isValueDefined(ctx, inst.src)) {
        addError(ctx, errUndefinedValue(inst.src, "memcpy src"));
    }
    if (!isValueDefined(ctx, inst.size)) {
        addError(ctx, errUndefinedValue(inst.size, "memcpy size"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateGep(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.ptr)) {
        addError(ctx, errUndefinedValue(inst.ptr, "gep"));
    }

    for (let i = 0; i < inst.indices.length; i++) {
        if (!isValueDefined(ctx, inst.indices[i])) {
            addError(ctx, errUndefinedValue(inst.indices[i], "gep index"));
        }
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validatePtradd(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.ptr)) {
        addError(ctx, errUndefinedValue(inst.ptr, "ptradd"));
    }
    if (!isValueDefined(ctx, inst.offset)) {
        addError(ctx, errUndefinedValue(inst.offset, "ptradd offset"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateConversion(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.val)) {
        addError(ctx, errUndefinedValue(inst.val, "conversion"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateCall(inst, blockId, ctx) {
    for (let i = 0; i < inst.args.length; i++) {
        if (!isValueDefined(ctx, inst.args[i])) {
            addError(ctx, errUndefinedValue(inst.args[i], "call argument"));
        }
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateCallDyn(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.fn)) {
        addError(ctx, errUndefinedValue(inst.fn, "call_dyn callee"));
    }
    for (let i = 0; i < inst.args.length; i++) {
        if (!isValueDefined(ctx, inst.args[i])) {
            addError(ctx, errUndefinedValue(inst.args[i], "call_dyn argument"));
        }
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateStructCreate(inst, blockId, ctx) {
    for (let i = 0; i < inst.fields.length; i++) {
        if (!isValueDefined(ctx, inst.fields[i])) {
            addError(ctx, errUndefinedValue(inst.fields[i], "struct field"));
        }
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateStructGet(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.struct)) {
        addError(ctx, errUndefinedValue(inst.struct, "struct_get"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateEnumCreate(inst, blockId, ctx) {
    if (inst.data !== null && !isValueDefined(ctx, inst.data)) {
        addError(ctx, errUndefinedValue(inst.data, "enum_create data"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateEnumGetTag(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.enum)) {
        addError(ctx, errUndefinedValue(inst.enum, "enum_get_tag"));
    }
}

/** @param {IRInst} inst @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateEnumGetData(inst, blockId, ctx) {
    if (!isValueDefined(ctx, inst.enum)) {
        addError(ctx, errUndefinedValue(inst.enum, "enum_get_data"));
    }
}

// ============================================================================
// Task 12.7: Terminator Validation
// ============================================================================

/**
 * @param {IRTerminator} term
 * @param {BlockId} blockId
 * @param {ValidationCtx} ctx
 */
function validateTerminator(term, blockId, ctx) {
    switch (term.kind) {
        case IRTermKind.Ret:
            validateRet(term, blockId, ctx);
            break;

        case IRTermKind.Br:
            validateBr(term, blockId, ctx);
            break;

        case IRTermKind.BrIf:
            validateBrIf(term, blockId, ctx);
            break;

        case IRTermKind.Switch:
            validateSwitch(term, blockId, ctx);
            break;

        case IRTermKind.Unreachable:
            // No validation needed
            break;

        default:
            addError(
                ctx,
                errInvalidOperand(`Unknown terminator kind: ${term.kind}`),
            );
    }
}

/** @param {IRTerminator} term @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateRet(term, blockId, ctx) {
    if (term.value !== null && !isValueDefined(ctx, term.value)) {
        addError(ctx, errUndefinedValue(term.value, "return"));
    }

    // Check return type matches function return type
    if (ctx.fn && term.value !== null) {
        const retTy = getValueType(ctx, term.value);
        if (retTy && !irTypeEquals(retTy, ctx.fn.returnType)) {
            addError(
                ctx,
                errTypeMismatch(
                    irTypeToString(ctx.fn.returnType),
                    irTypeToString(retTy),
                    "return type",
                ),
            );
        }
    }
}

/** @param {IRTerminator} term @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateBr(term, blockId, ctx) {
    const target = getBlock(ctx, term.target);
    if (!target) {
        addError(ctx, errUndefinedBlock(term.target));
        return;
    }

    // Check argument count
    if (term.args.length !== target.params.length) {
        addError(
            ctx,
            errInvalidBlockArg(
                term.target,
                target.params.length,
                term.args.length,
            ),
        );
    }

    // Check arguments are defined
    for (const arg of term.args) {
        if (!isValueDefined(ctx, arg)) {
            addError(ctx, errUndefinedValue(arg, "branch argument"));
        }
    }
}

/** @param {IRTerminator} term @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateBrIf(term, blockId, ctx) {
    // Check condition
    if (!isValueDefined(ctx, term.cond)) {
        addError(ctx, errUndefinedValue(term.cond, "br_if condition"));
    }

    // Check condition is bool
    const condTy = getValueType(ctx, term.cond);
    if (condTy && condTy.kind !== IRTypeKind.Bool) {
        addError(
            ctx,
            errTypeMismatch("bool", irTypeToString(condTy), "br_if condition"),
        );
    }

    // Check then block
    const thenBlock = getBlock(ctx, term.thenBlock);
    if (!thenBlock) {
        addError(ctx, errUndefinedBlock(term.thenBlock));
    } else {
        if (term.thenArgs.length !== thenBlock.params.length) {
            addError(
                ctx,
                errInvalidBlockArg(
                    term.thenBlock,
                    thenBlock.params.length,
                    term.thenArgs.length,
                ),
            );
        }
        for (const arg of term.thenArgs) {
            if (!isValueDefined(ctx, arg)) {
                addError(ctx, errUndefinedValue(arg, "then branch argument"));
            }
        }
    }

    // Check else block
    const elseBlock = getBlock(ctx, term.elseBlock);
    if (!elseBlock) {
        addError(ctx, errUndefinedBlock(term.elseBlock));
    } else {
        if (term.elseArgs.length !== elseBlock.params.length) {
            addError(
                ctx,
                errInvalidBlockArg(
                    term.elseBlock,
                    elseBlock.params.length,
                    term.elseArgs.length,
                ),
            );
        }
        for (const arg of term.elseArgs) {
            if (!isValueDefined(ctx, arg)) {
                addError(ctx, errUndefinedValue(arg, "else branch argument"));
            }
        }
    }
}

/** @param {IRTerminator} term @param {BlockId} blockId @param {ValidationCtx} ctx */
function validateSwitch(term, blockId, ctx) {
    // Check switch value
    if (!isValueDefined(ctx, term.value)) {
        addError(ctx, errUndefinedValue(term.value, "switch value"));
    }

    // Check switch value is integer
    const valTy = getValueType(ctx, term.value);
    if (valTy && valTy.kind !== IRTypeKind.Int) {
        addError(
            ctx,
            errTypeMismatch("integer", irTypeToString(valTy), "switch value"),
        );
    }

    // Check each case
    for (const c of term.cases) {
        const isIntLiteral =
            typeof c.value === "bigint" ||
            (typeof c.value === "number" && Number.isInteger(c.value));
        if (!isIntLiteral) {
            addError(
                ctx,
                errTypeMismatch("integer literal", typeof c.value, "switch case value"),
            );
        }

        const target = getBlock(ctx, c.target);
        if (!target) {
            addError(ctx, errUndefinedBlock(c.target));
        } else {
            if (c.args.length !== target.params.length) {
                addError(
                    ctx,
                    errInvalidBlockArg(
                        c.target,
                        target.params.length,
                        c.args.length,
                    ),
                );
            }
            for (let i = 0; i < c.args.length; i++) {
                const arg = c.args[i];
                if (!isValueDefined(ctx, arg)) {
                    addError(
                        ctx,
                        errUndefinedValue(arg, "switch case argument"),
                    );
                    continue;
                }
                const argTy = getValueType(ctx, arg);
                const param = target.params[i];
                if (argTy && param?.ty && !irTypeEquals(argTy, param.ty)) {
                    addError(
                        ctx,
                        errTypeMismatch(
                            irTypeToString(param.ty),
                            irTypeToString(argTy),
                            "switch case argument",
                        ),
                    );
                }
            }
        }
    }

    // Check default block
    const defaultBlock = getBlock(ctx, term.defaultBlock);
    if (!defaultBlock) {
        addError(ctx, errUndefinedBlock(term.defaultBlock));
    } else {
        if (term.defaultArgs.length !== defaultBlock.params.length) {
            addError(
                ctx,
                errInvalidBlockArg(
                    term.defaultBlock,
                    defaultBlock.params.length,
                    term.defaultArgs.length,
                ),
            );
        }
        for (let i = 0; i < term.defaultArgs.length; i++) {
            const arg = term.defaultArgs[i];
            if (!isValueDefined(ctx, arg)) {
                addError(
                    ctx,
                    errUndefinedValue(arg, "switch default argument"),
                );
                continue;
            }
            const argTy = getValueType(ctx, arg);
            const param = defaultBlock.params[i];
            if (argTy && param?.ty && !irTypeEquals(argTy, param.ty)) {
                addError(
                    ctx,
                    errTypeMismatch(
                        irTypeToString(param.ty),
                        irTypeToString(argTy),
                        "switch default argument",
                    ),
                );
            }
        }
    }
}

// ============================================================================
// Task 12.8: Dominance Check
// ============================================================================

/**
 * Compute dominators for each block
 * @param {IRFunction} fn
 * @returns {Map<BlockId, Set<BlockId>>}
 */
function computeDominators(fn) {
    const dominators = new Map();
    const blockIds = fn.blocks.map((b) => b.id);

    // Initialize: entry block dominates only itself
    // All other blocks are dominated by all blocks initially
    const allBlocks = new Set(blockIds);

    for (const block of fn.blocks) {
        if (fn.entry && block.id === fn.entry.id) {
            dominators.set(block.id, new Set([block.id]));
        } else {
            dominators.set(block.id, new Set(allBlocks));
        }
    }

    // Iterate until fixed point
    let changed = true;
    while (changed) {
        changed = false;

        for (const block of fn.blocks) {
            if (fn.entry && block.id === fn.entry.id) continue;

            const dom = dominators.get(block.id);
            const oldSize = dom.size;

            // Intersect with dominators of all predecessors
            for (const predId of block.predecessors) {
                const predDom = dominators.get(predId);
                for (const d of dom) {
                    if (!predDom.has(d) && d !== block.id) {
                        dom.delete(d);
                    }
                }
            }

            // Block always dominates itself
            dom.add(block.id);

            if (dom.size !== oldSize) {
                changed = true;
            }
        }
    }

    return dominators;
}

/**
 * Check if block a dominates block b
 * @param {BlockId} a
 * @param {BlockId} b
 * @param {Map<BlockId, Set<BlockId>>} dominators
 * @returns {boolean}
 */
function dominates(a, b, dominators) {
    const bDom = dominators.get(b);
    return bDom ? bDom.has(a) : false;
}

/**
 * @param {IRFunction} fn
 * @param {ValidationCtx} ctx
 */
function validateDominance(fn, ctx) {
    const dominators = computeDominators(fn);

    // For each use of a value, check that the definition dominates the use
    for (const block of fn.blocks) {
        // Check block arguments are dominated by their defining blocks (predecessors)
        // Block arguments are defined by predecessor branches, so they're valid

        // Check instruction operands
        for (const inst of block.instructions) {
            const operands = getInstructionOperands(inst);
            for (const opId of operands) {
                const defBlock = ctx.valueDefBlock.get(opId);
                if (
                    defBlock !== undefined &&
                    !dominates(defBlock, block.id, dominators)
                ) {
                    addError(
                        ctx,
                        errDominanceViolation(opId, block.id, defBlock),
                    );
                }
            }
        }

        // Check terminator operands
        if (block.terminator) {
            const termOperands = getTerminatorOperands(block.terminator);
            for (const opId of termOperands) {
                const defBlock = ctx.valueDefBlock.get(opId);
                if (
                    defBlock !== undefined &&
                    !dominates(defBlock, block.id, dominators)
                ) {
                    addError(
                        ctx,
                        errDominanceViolation(opId, block.id, defBlock),
                    );
                }
            }
        }
    }
}

/**
 * Get all value operands from an instruction
 * @param {IRInst} inst
 * @returns {ValueId[]}
 */
function getInstructionOperands(inst) {
    switch (inst.kind) {
        case IRInstKind.Iconst:
        case IRInstKind.Fconst:
        case IRInstKind.Bconst:
        case IRInstKind.Null:
        case IRInstKind.Alloca:
        case IRInstKind.Sconst:
            return [];

        case IRInstKind.Iadd:
        case IRInstKind.Isub:
        case IRInstKind.Imul:
        case IRInstKind.Idiv:
        case IRInstKind.Imod:
        case IRInstKind.Fadd:
        case IRInstKind.Fsub:
        case IRInstKind.Fmul:
        case IRInstKind.Fdiv:
        case IRInstKind.Iand:
        case IRInstKind.Ior:
        case IRInstKind.Ixor:
        case IRInstKind.Ishl:
        case IRInstKind.Ishr:
        case IRInstKind.Icmp:
        case IRInstKind.Fcmp:
            return [inst.a, inst.b];

        case IRInstKind.Ineg:
        case IRInstKind.Fneg:
            return [inst.a];

        case IRInstKind.Load:
            return [inst.ptr];

        case IRInstKind.Store:
            return [inst.ptr, inst.value];

        case IRInstKind.Memcpy:
            return [inst.dest, inst.src, inst.size];

        case IRInstKind.Gep:
            return [inst.ptr, ...inst.indices];

        case IRInstKind.Ptradd:
            return [inst.ptr, inst.offset];

        case IRInstKind.Trunc:
        case IRInstKind.Sext:
        case IRInstKind.Zext:
        case IRInstKind.Fptoui:
        case IRInstKind.Fptosi:
        case IRInstKind.Uitofp:
        case IRInstKind.Sitofp:
        case IRInstKind.Bitcast:
            return [inst.val];

        case IRInstKind.Call:
            return [...inst.args];

        case IRInstKind.CallDyn:
            return [inst.fn, ...inst.args];

        case IRInstKind.StructCreate:
            return [...inst.fields];

        case IRInstKind.StructGet:
            return [inst.struct];

        case IRInstKind.EnumCreate:
            return inst.data !== null ? [inst.data] : [];

        case IRInstKind.EnumGetTag:
            return [inst.enum];

        case IRInstKind.EnumGetData:
            return [inst.enum];

        default:
            return [];
    }
}

/**
 * Get all value operands from a terminator
 * @param {IRTerminator} term
 * @returns {ValueId[]}
 */
function getTerminatorOperands(term) {
    switch (term.kind) {
        case IRTermKind.Ret:
            return term.value !== null ? [term.value] : [];

        case IRTermKind.Br:
            return [...term.args];

        case IRTermKind.BrIf:
            return [term.cond, ...term.thenArgs, ...term.elseArgs];

        case IRTermKind.Switch: {
            const ops = [term.value];
            for (const c of term.cases) {
                ops.push(c.value, ...c.args);
            }
            ops.push(...term.defaultArgs);
            return ops;
        }

        case IRTermKind.Unreachable:
            return [];

        default:
            return [];
    }
}

// ============================================================================
// Task 12.10: Control Flow Check
// ============================================================================

/**
 * Validate that all blocks are reachable from entry
 * @param {IRBlock} entry
 * @param {ValidationCtx} ctx
 */
function validateReachability(entry, ctx) {
    const visited = new Set();
    const worklist = [entry.id];

    while (worklist.length > 0) {
        const blockId = worklist.pop();
        if (visited.has(blockId)) continue;
        visited.add(blockId);

        const block = getBlock(ctx, /** @type {BlockId} */(blockId));
        if (!block || !block.terminator) continue;

        // Add successors to worklist
        const successors = getSuccessorBlocks(block.terminator);
        for (const succ of successors) {
            if (!visited.has(succ)) {
                worklist.push(succ);
            }
        }
    }

    // Check for unreachable blocks
    for (const [blockId] of ctx.blocks) {
        if (!visited.has(blockId)) {
            addError(ctx, errUnreachableBlock(blockId));
        }
    }
}

/**
 * Get successor block IDs from a terminator
 * @param {IRTerminator} term
 * @returns {BlockId[]}
 */
function getSuccessorBlocks(term) {
    switch (term.kind) {
        case IRTermKind.Ret:
        case IRTermKind.Unreachable:
            return [];

        case IRTermKind.Br:
            return [term.target];

        case IRTermKind.BrIf:
            return [term.thenBlock, term.elseBlock];

        case IRTermKind.Switch: {
            const blocks = [term.defaultBlock];
            for (const c of term.cases) {
                blocks.push(c.target);
            }
            return blocks;
        }

        default:
            return [];
    }
}

// ============================================================================
// Task 12.11: SSA Form Check
// ============================================================================

/**
 * Validate SSA form
 * @param {IRFunction} fn
 * @param {ValidationCtx} ctx
 */
function validateSSAForm(fn, ctx) {
    const defined = new Set();

    // Check each value is defined exactly once
    for (const param of fn.params) {
        if (defined.has(param.id)) {
            addError(ctx, errDuplicateDefinition(`%${param.id}`, "value"));
        }
        defined.add(param.id);
    }

    for (const block of fn.blocks) {
        for (const param of block.params) {
            if (defined.has(param.id)) {
                addError(ctx, errDuplicateDefinition(`%${param.id}`, "value"));
            }
            defined.add(param.id);
        }

        for (const inst of block.instructions) {
            if (inst.id !== null) {
                if (defined.has(inst.id)) {
                    addError(
                        ctx,
                        errDuplicateDefinition(`%${inst.id}`, "value"),
                    );
                }
                defined.add(inst.id);
            }
        }
    }
}

export {
    ValidationErrorKind,
    makeValidationError,
    errUndefinedValue,
    errTypeMismatch,
    errMissingTerminator,
    errInvalidBlockArg,
    errUndefinedBlock,
    errUndefinedFunction,
    errDuplicateDefinition,
    errUnreachableBlock,
    errDominanceViolation,
    errInvalidOperand,
    errMissingReturn,
    makeValidationCtx,
    setFunction,
    defineValue,
    isValueDefined,
    getValueType,
    getBlock,
    addError,
    validateModule,
    validateFunction,
    validateBlock,
    validateInstruction,
    validateTerminator,
    computeDominators,
    dominates,
    validateDominance,
    validateReachability,
    validateSSAForm,
    getInstructionOperands,
    getTerminatorOperands,
    getSuccessorBlocks,
};
