import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    irTypeEquals,
    irTypeToString,
    type ValueId,
    type BlockId,
    type IRType,
    type IRInst,
    type IRTerm,
    type IRBlock,
    type IRFunction,
    type IRModule,
} from "./ir";

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
} as const;

type ValidationErrorKindValue =
    (typeof ValidationErrorKind)[keyof typeof ValidationErrorKind];

type ValidationErrorLoc = {
    blockId?: BlockId;
    valueId?: ValueId;
    fnId?: number;
};

type ValidationError = {
    kind: ValidationErrorKindValue;
    message: string;
    loc?: ValidationErrorLoc;
};

function makeValidationError(
    kind: ValidationErrorKindValue,
    message: string,
    loc: ValidationErrorLoc,
): ValidationError {
    return { kind, message, loc };
}

function errUndefinedValue(valueId: ValueId, context: string): ValidationError {
    return makeValidationError(
        ValidationErrorKind.UndefinedValue,
        `Undefined value %${valueId} in ${context}`,
        { valueId },
    );
}

function errTypeMismatch(
    expected: string,
    actual: string,
    context: string,
): ValidationError {
    return makeValidationError(
        ValidationErrorKind.TypeMismatch,
        `Type mismatch in ${context}: expected ${expected}, got ${actual}`,
        {},
    );
}

function errMissingTerminator(blockId: BlockId): ValidationError {
    return makeValidationError(
        ValidationErrorKind.MissingTerminator,
        `Block %${blockId} has no terminator`,
        { blockId },
    );
}

function errInvalidBlockArg(
    blockId: BlockId,
    expected: number,
    actual: number,
): ValidationError {
    return makeValidationError(
        ValidationErrorKind.InvalidBlockArg,
        `Block %${blockId} expects ${expected} args, got ${actual}`,
        { blockId },
    );
}

function errUndefinedBlock(blockId: BlockId): ValidationError {
    return makeValidationError(
        ValidationErrorKind.UndefinedBlock,
        `Undefined block %${blockId}`,
        { blockId },
    );
}

function errUndefinedFunction(name: string): ValidationError {
    return makeValidationError(
        ValidationErrorKind.UndefinedFunction,
        `Undefined function ${name}`,
        {},
    );
}

function errDuplicateDefinition(name: string, kind: string): ValidationError {
    return makeValidationError(
        ValidationErrorKind.DuplicateDefinition,
        `Duplicate ${kind} definition: ${name}`,
        {},
    );
}

function errUnreachableBlock(blockId: BlockId): ValidationError {
    return makeValidationError(
        ValidationErrorKind.UnreachableBlock,
        `Block %${blockId} is unreachable from entry`,
        { blockId },
    );
}

function errDominanceViolation(
    valueId: ValueId,
    useBlock: BlockId,
    defBlock: BlockId,
): ValidationError {
    return makeValidationError(
        ValidationErrorKind.DominanceViolation,
        `Value %${valueId} used in block %${useBlock} but defined in block %${defBlock} which does not dominate`,
        { valueId, blockId: useBlock },
    );
}

function errInvalidOperand(message: string): ValidationError {
    return makeValidationError(ValidationErrorKind.InvalidOperand, message, {});
}

function errMissingReturn(fnName: string): ValidationError {
    return makeValidationError(
        ValidationErrorKind.MissingReturn,
        `Function ${fnName} is missing return statement`,
        {},
    );
}

// ============================================================================
// Task 12.2: Validation Context
// ============================================================================

type ValidationCtx = {
    fn: IRFunction | null;
    definedValues: Set<ValueId>;
    valueTypes: Map<ValueId, IRType>;
    blocks: Map<BlockId, IRBlock>;
    valueDefBlock: Map<ValueId, BlockId>;
    errors: ValidationError[];
};

function makeValidationCtx(): ValidationCtx {
    return {
        fn: null,
        definedValues: new Set(),
        valueTypes: new Map(),
        blocks: new Map(),
        valueDefBlock: new Map(),
        errors: [],
    };
}

function setFunction(ctx: ValidationCtx, fn: IRFunction): void {
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

function defineValue(
    ctx: ValidationCtx,
    id: ValueId,
    ty: IRType,
    blockId: BlockId,
): void {
    ctx.definedValues.add(id);
    ctx.valueTypes.set(id, ty);
    ctx.valueDefBlock.set(id, blockId);
}

function isValueDefined(ctx: ValidationCtx, id: ValueId): boolean {
    return ctx.definedValues.has(id);
}

function getValueType(ctx: ValidationCtx, id: ValueId): IRType | undefined {
    return ctx.valueTypes.get(id);
}

function getBlock(ctx: ValidationCtx, id: BlockId): IRBlock | undefined {
    return ctx.blocks.get(id);
}

function addError(ctx: ValidationCtx, error: ValidationError): void {
    ctx.errors.push(error);
}

// ============================================================================
// Task 12.3: Module Validation
// ============================================================================

type ValidationResult = {
    ok: boolean;
    errors: ValidationError[];
};

function validateModule(module: IRModule): ValidationResult {
    const ctx = makeValidationCtx();

    // Check for duplicate function names
    const fnNames = new Set<string>();
    for (const fn of module.functions) {
        if (fnNames.has(fn.name)) {
            addError(ctx, errDuplicateDefinition(fn.name, "function"));
        }
        fnNames.add(fn.name);
    }

    // Check for duplicate global names
    const globalNames = new Set<string>();
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

function validateFunction(
    fn: IRFunction,
    ctx: ValidationCtx = makeValidationCtx(),
): ValidationResult {
    const startErrorCount = ctx.errors.length;
    setFunction(ctx, fn);

    // Check function has at least one block
    if (fn.blocks.length === 0) {
        addError(ctx, errMissingReturn(fn.name));
        return { ok: false, errors: [] };
    }

    // Register function parameters
    if (fn.entry) {
        for (const param of fn.params) {
            defineValue(ctx, param.id, param.ty, fn.entry.id);
        }
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

function validateBlock(block: IRBlock, ctx: ValidationCtx): void {
    // Register block parameters
    for (const param of block.params) {
        defineValue(ctx, param.id, param.ty, block.id);
    }

    // Validate each instruction
    for (const inst of block.instructions) {
        validateInstruction(inst, ctx);
        // Register the defined value
        if (inst.id !== null) {
            defineValue(ctx, inst.id, inst.ty, block.id);
        }
    }

    // Validate terminator exists
    if (!block.terminator) {
        addError(ctx, errMissingTerminator(block.id));
    } else {
        validateTerminator(block.terminator, ctx);
    }
}

// ============================================================================
// Task 12.6: Instruction Validation
// ============================================================================

function validateInstruction(inst: IRInst, ctx: ValidationCtx): void {
    switch (inst.kind) {
        case IRInstKind.Iconst:
        case IRInstKind.Fconst:
        case IRInstKind.Bconst:
        case IRInstKind.Null:
        case IRInstKind.Alloca:
        case IRInstKind.Sconst:
            // Constants and alloca have no operands to validate
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
            validateBinaryOp(inst, ctx);
            break;

        case IRInstKind.Ineg:
        case IRInstKind.Fneg:
            validateUnaryOp(inst, ctx);
            break;

        case IRInstKind.Icmp:
        case IRInstKind.Fcmp:
            validateComparison(inst, ctx);
            break;

        case IRInstKind.Load:
            validateLoad(inst, ctx);
            break;

        case IRInstKind.Store:
            validateStore(inst, ctx);
            break;

        case IRInstKind.Memcpy:
            validateMemcpy(inst, ctx);
            break;

        case IRInstKind.Gep:
            validateGep(inst, ctx);
            break;

        case IRInstKind.Ptradd:
            validatePtradd(inst, ctx);
            break;

        case IRInstKind.Trunc:
        case IRInstKind.Sext:
        case IRInstKind.Zext:
        case IRInstKind.Fptoui:
        case IRInstKind.Fptosi:
        case IRInstKind.Uitofp:
        case IRInstKind.Sitofp:
        case IRInstKind.Bitcast:
            validateConversion(inst, ctx);
            break;

        case IRInstKind.Call:
            validateCall(inst, ctx);
            break;

        case IRInstKind.CallDyn:
            validateCallDyn(inst, ctx);
            break;

        case IRInstKind.StructCreate:
            validateStructCreate(inst, ctx);
            break;

        case IRInstKind.StructGet:
            validateStructGet(inst, ctx);
            break;

        case IRInstKind.EnumCreate:
            validateEnumCreate(inst, ctx);
            break;

        case IRInstKind.EnumGetTag:
            validateEnumGetTag(inst, ctx);
            break;

        case IRInstKind.EnumGetData:
            validateEnumGetData(inst, ctx);
            break;

        default:
            addError(
                ctx,
                errInvalidOperand(`Unknown instruction kind: ${inst.kind}`),
            );
    }
}

function validateBinaryOp(inst: IRInst, ctx: ValidationCtx): void {
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

function validateUnaryOp(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.a)) {
        addError(ctx, errUndefinedValue(inst.a, "unary operation"));
    }
}

function validateComparison(inst: IRInst, ctx: ValidationCtx): void {
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

function validateLoad(inst: IRInst, ctx: ValidationCtx): void {
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

function validateStore(inst: IRInst, ctx: ValidationCtx): void {
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

function validateMemcpy(inst: IRInst, ctx: ValidationCtx): void {
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

function validateGep(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.ptr)) {
        addError(ctx, errUndefinedValue(inst.ptr, "gep"));
    }

    for (const index of inst.indices) {
        if (!isValueDefined(ctx, index)) {
            addError(ctx, errUndefinedValue(index, "gep index"));
        }
    }
}

function validatePtradd(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.ptr)) {
        addError(ctx, errUndefinedValue(inst.ptr, "ptradd"));
    }
    if (!isValueDefined(ctx, inst.offset)) {
        addError(ctx, errUndefinedValue(inst.offset, "ptradd offset"));
    }
}

function validateConversion(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.val)) {
        addError(ctx, errUndefinedValue(inst.val, "conversion"));
    }
}

function validateCall(inst: IRInst, ctx: ValidationCtx): void {
    for (const arg of inst.args) {
        if (!isValueDefined(ctx, arg)) {
            addError(ctx, errUndefinedValue(arg, "call argument"));
        }
    }
}

function validateCallDyn(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.fn)) {
        addError(ctx, errUndefinedValue(inst.fn, "call_dyn callee"));
    }
    for (const arg of inst.args) {
        if (!isValueDefined(ctx, arg)) {
            addError(ctx, errUndefinedValue(arg, "call_dyn argument"));
        }
    }
}

function validateStructCreate(inst: IRInst, ctx: ValidationCtx): void {
    for (const field of inst.fields) {
        if (!isValueDefined(ctx, field)) {
            addError(ctx, errUndefinedValue(field, "struct field"));
        }
    }
}

function validateStructGet(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.struct)) {
        addError(ctx, errUndefinedValue(inst.struct, "struct_get"));
    }
}

function validateEnumCreate(inst: IRInst, ctx: ValidationCtx): void {
    if (inst.data !== null && !isValueDefined(ctx, inst.data)) {
        addError(ctx, errUndefinedValue(inst.data, "enum_create data"));
    }
}

function validateEnumGetTag(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.enum)) {
        addError(ctx, errUndefinedValue(inst.enum, "enum_get_tag"));
    }
}

function validateEnumGetData(inst: IRInst, ctx: ValidationCtx): void {
    if (!isValueDefined(ctx, inst.enum)) {
        addError(ctx, errUndefinedValue(inst.enum, "enum_get_data"));
    }
}

// ============================================================================
// Task 12.7: Terminator Validation
// ============================================================================

function validateTerminator(term: IRTerm, ctx: ValidationCtx): void {
    switch (term.kind) {
        case IRTermKind.Ret:
            validateRet(term, ctx);
            break;

        case IRTermKind.Br:
            validateBr(term, ctx);
            break;

        case IRTermKind.BrIf:
            validateBrIf(term, ctx);
            break;

        case IRTermKind.Switch:
            validateSwitch(term, ctx);
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

function validateRet(term: IRTerm, ctx: ValidationCtx): void {
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

function validateBr(term: IRTerm, ctx: ValidationCtx): void {
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

function validateBrIf(term: IRTerm, ctx: ValidationCtx): void {
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

function validateSwitch(term: IRTerm, ctx: ValidationCtx): void {
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
                errTypeMismatch(
                    "integer literal",
                    typeof c.value,
                    "switch case value",
                ),
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

function computeDominators(fn: IRFunction): Map<BlockId, Set<BlockId>> {
    const dominators = new Map<BlockId, Set<BlockId>>();
    const blockIds = fn.blocks.map((b) => b.id);

    // Initialize: entry block dominates only itself
    // All other blocks are dominated by all blocks initially
    const allBlocks = new Set<BlockId>(blockIds);

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
            if (!dom) continue;
            const oldSize = dom.size;

            // Intersect with dominators of all predecessors
            for (const predId of block.predecessors) {
                const predDom = dominators.get(predId);
                if (predDom) {
                    for (const d of dom) {
                        if (!predDom.has(d) && d !== block.id) {
                            dom.delete(d);
                        }
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

function dominates(
    a: BlockId,
    b: BlockId,
    dominators: Map<BlockId, Set<BlockId>>,
): boolean {
    const bDom = dominators.get(b);
    return bDom ? bDom.has(a) : false;
}

function validateDominance(fn: IRFunction, ctx: ValidationCtx): void {
    const dominators = computeDominators(fn);

    // For each use of a value, check that the definition dominates the use
    for (const block of fn.blocks) {
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

function getInstructionOperands(inst: IRInst): ValueId[] {
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

function getTerminatorOperands(term: IRTerm): ValueId[] {
    switch (term.kind) {
        case IRTermKind.Ret:
            return term.value !== null ? [term.value] : [];

        case IRTermKind.Br:
            return [...term.args];

        case IRTermKind.BrIf:
            return [term.cond, ...term.thenArgs, ...term.elseArgs];

        case IRTermKind.Switch: {
            const ops: ValueId[] = [term.value];
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

function validateReachability(entry: IRBlock, ctx: ValidationCtx): void {
    const visited = new Set<BlockId>();
    const worklist: BlockId[] = [entry.id];

    while (worklist.length > 0) {
        const blockId = worklist.pop();
        if (blockId === undefined || visited.has(blockId)) continue;
        visited.add(blockId);

        const block = getBlock(ctx, blockId);
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
    for (const blockId of ctx.blocks.keys()) {
        if (!visited.has(blockId)) {
            addError(ctx, errUnreachableBlock(blockId));
        }
    }
}

function getSuccessorBlocks(term: IRTerm): BlockId[] {
    switch (term.kind) {
        case IRTermKind.Ret:
        case IRTermKind.Unreachable:
            return [];

        case IRTermKind.Br:
            return [term.target];

        case IRTermKind.BrIf:
            return [term.thenBlock, term.elseBlock];

        case IRTermKind.Switch: {
            const blocks: BlockId[] = [term.defaultBlock];
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

function validateSSAForm(fn: IRFunction, ctx: ValidationCtx): void {
    const defined = new Set<ValueId>();

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

export type {
    ValidationErrorKindValue,
    ValidationErrorLoc,
    ValidationError,
    ValidationCtx,
    ValidationResult,
};
