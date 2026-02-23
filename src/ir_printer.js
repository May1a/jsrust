/** @typedef {import('./ir').IRType} IRType */
/** @typedef {import('./ir').IRInst} IRInst */
/** @typedef {import('./ir').IRTerm} IRTerm */
/** @typedef {import('./ir').IRBlock} IRBlock */
/** @typedef {import('./ir').IRFunction} IRFunction */
/** @typedef {import('./ir').IRModule} IRModule */
/** @typedef {import('./ir').ValueId} ValueId */
/** @typedef {import('./ir').BlockId} BlockId */
/** @typedef {import('./ir').LocalId} LocalId */
/** @typedef {import('./ir').IcmpOpValue} IcmpOpValue */
/** @typedef {import('./ir').FcmpOpValue} FcmpOpValue */

import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    IcmpOp,
    FcmpOp,
    irTypeToString,
    intWidthToString,
    floatWidthToString,
} from "./ir";

// ============================================================================
// Value Naming Context
// ============================================================================

/**
 * Context for tracking value names during printing
 */
class PrintContext {
    constructor() {
        /** @type {Map<ValueId, string>} */
        this.valueNames = new Map();
        /** @type {Map<BlockId, string>} */
        this.blockNames = new Map();
        /** @type {Map<LocalId, string>} */
        this.localNames = new Map();
        this.valueCounter = 0;
        this.blockCounter = 0;
        this.localCounter = 0;
    }

    /**
     * Get or create a name for a value
     * @param {ValueId} id
     * @returns {string}
     */
    getValueName(id) {
        if (!this.valueNames.has(id)) {
            this.valueNames.set(id, `v${this.valueCounter++}`);
        }
        return /** @type {string} */ (this.valueNames.get(id));
    }

    /**
     * Check if a value has a name
     * @param {ValueId} id
     * @returns {boolean}
     */
    hasValueName(id) {
        return this.valueNames.has(id);
    }

    /**
     * Get or create a name for a block
     * @param {BlockId} id
     * @returns {string}
     */
    getBlockName(id) {
        if (!this.blockNames.has(id)) {
            this.blockNames.set(id, `block${this.blockCounter++}`);
        }
        return /** @type {string} */ (this.blockNames.get(id));
    }

    /**
     * Get or create a name for a local
     * @param {LocalId} id
     * @returns {string}
     */
    getLocalName(id) {
        if (!this.localNames.has(id)) {
            this.localNames.set(id, `loc${this.localCounter++}`);
        }
        return /** @type {string} */ (this.localNames.get(id));
    }
}

// ============================================================================
// Task 14.1: Type Printing
// ============================================================================

/**
 * Print an IR type to a string
 * @param {IRType} type
 * @returns {string}
 */
function printType(type) {
    return irTypeToString(type);
}

// ============================================================================
// Task 14.2: Instruction Printing
// ============================================================================

/**
 * Get the string representation of an IcmpOp
 * @param {IcmpOpValue} op
 * @returns {string}
 */
function icmpOpToString(op) {
    switch (op) {
        case IcmpOp.Eq:
            return "eq";
        case IcmpOp.Ne:
            return "ne";
        case IcmpOp.Slt:
            return "slt";
        case IcmpOp.Sle:
            return "sle";
        case IcmpOp.Sgt:
            return "sgt";
        case IcmpOp.Sge:
            return "sge";
        case IcmpOp.Ult:
            return "ult";
        case IcmpOp.Ule:
            return "ule";
        case IcmpOp.Ugt:
            return "ugt";
        case IcmpOp.Uge:
            return "uge";
        default:
            return "<unknown>";
    }
}

/**
 * Get the string representation of an FcmpOp
 * @param {FcmpOpValue} op
 * @returns {string}
 */
function fcmpOpToString(op) {
    switch (op) {
        case FcmpOp.Oeq:
            return "oeq";
        case FcmpOp.One:
            return "one";
        case FcmpOp.Olt:
            return "olt";
        case FcmpOp.Ole:
            return "ole";
        case FcmpOp.Ogt:
            return "ogt";
        case FcmpOp.Oge:
            return "oge";
        default:
            return "<unknown>";
    }
}

/**
 * Print an instruction to a string
 * @param {IRInst} inst
 * @param {PrintContext} [ctx]
 * @returns {string}
 */
function printInstruction(inst, ctx) {
    ctx = ctx ?? new PrintContext();

    const resultPrefix =
        inst.id !== null ? `${ctx.getValueName(inst.id)} = ` : "";

    switch (inst.kind) {
        case IRInstKind.Iconst:
            return `${resultPrefix}iconst ${intWidthToString(/** @type {number} */ (inst.ty.width))} ${inst.value}`;

        case IRInstKind.Fconst:
            return `${resultPrefix}fconst ${floatWidthToString(/** @type {number} */ (inst.ty.width))} ${inst.value}`;

        case IRInstKind.Bconst:
            return `${resultPrefix}bconst ${inst.value}`;

        case IRInstKind.Null:
            return `${resultPrefix}null`;

        case IRInstKind.Iadd:
            return `${resultPrefix}iadd ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Isub:
            return `${resultPrefix}isub ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Imul:
            return `${resultPrefix}imul ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Idiv:
            return `${resultPrefix}idiv ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Imod:
            return `${resultPrefix}imod ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Fadd:
            return `${resultPrefix}fadd ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Fsub:
            return `${resultPrefix}fsub ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Fmul:
            return `${resultPrefix}fmul ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Fdiv:
            return `${resultPrefix}fdiv ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Ineg:
            return `${resultPrefix}ineg ${ctx.getValueName(inst.a)}`;

        case IRInstKind.Fneg:
            return `${resultPrefix}fneg ${ctx.getValueName(inst.a)}`;

        case IRInstKind.Iand:
            return `${resultPrefix}iand ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Ior:
            return `${resultPrefix}ior ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Ixor:
            return `${resultPrefix}ixor ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Ishl:
            return `${resultPrefix}ishl ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Ishr:
            return `${resultPrefix}ishr ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Icmp:
            return `${resultPrefix}icmp ${icmpOpToString(inst.op)} ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Fcmp:
            return `${resultPrefix}fcmp ${fcmpOpToString(inst.op)} ${ctx.getValueName(inst.a)}, ${ctx.getValueName(inst.b)}`;

        case IRInstKind.Alloca:
            return `${resultPrefix}alloca ${printType(/** @type {import('./ir').IRType} */ (inst.ty.inner))} ; ${ctx.getLocalName(inst.localId)}`;

        case IRInstKind.Load:
            return `${resultPrefix}load ${printType(inst.ty)}, ${ctx.getValueName(inst.ptr)}`;

        case IRInstKind.Store:
            return `store ${printType(inst.valueType)}, ${ctx.getValueName(inst.ptr)}, ${ctx.getValueName(inst.value)}`;

        case IRInstKind.Memcpy:
            return `memcpy ${ctx.getValueName(inst.dest)}, ${ctx.getValueName(inst.src)}, ${inst.size}`;

        case IRInstKind.Gep: {
            const indices = inst.indices
                .map((/** @type {any} */ i) => ctx.getValueName(i))
                .join(", ");
            return `${resultPrefix}gep ${ctx.getValueName(inst.ptr)}, [${indices}]`;
        }

        case IRInstKind.Ptradd:
            return `${resultPrefix}ptradd ${ctx.getValueName(inst.ptr)}, ${inst.offset}`;

        case IRInstKind.Trunc:
            return `${resultPrefix}trunc ${printType(inst.fromTy)} -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Sext:
            return `${resultPrefix}sext ${printType(inst.fromTy)} -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Zext:
            return `${resultPrefix}zext ${printType(inst.fromTy)} -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Fptoui:
            return `${resultPrefix}fptoui -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Fptosi:
            return `${resultPrefix}fptosi -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Uitofp:
            return `${resultPrefix}uitofp -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Sitofp:
            return `${resultPrefix}sitofp -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Bitcast:
            return `${resultPrefix}bitcast -> ${printType(inst.ty)}, ${ctx.getValueName(inst.val)}`;

        case IRInstKind.Call: {
            const args = inst.args
                .map((/**@type{any}*/ a) => ctx.getValueName(a))
                .join(", ");
            return `${resultPrefix}call ${inst.fn}(${args})`;
        }

        case IRInstKind.CallDyn: {
            const args = inst.args
                .map((/**@type{any}*/ a) => ctx.getValueName(a))
                .join(", ");
            return `${resultPrefix}call_dyn ${ctx.getValueName(inst.fn)}(${args})`;
        }

        case IRInstKind.StructCreate: {
            const fields = inst.fields
                .map((/** @type {any} */ f) => ctx.getValueName(f))
                .join(", ");
            return `${resultPrefix}struct_create ${printType(inst.ty)} { ${fields} }`;
        }

        case IRInstKind.StructGet:
            return `${resultPrefix}struct_get ${ctx.getValueName(inst.struct)}, ${inst.fieldIndex}`;

        case IRInstKind.EnumCreate: {
            const data =
                inst.data !== null ? ` [${ctx.getValueName(inst.data)}]` : "";
            return `${resultPrefix}enum_create ${printType(inst.ty)}, variant ${inst.variant}${data}`;
        }

        case IRInstKind.EnumGetTag:
            return `${resultPrefix}enum_get_tag ${ctx.getValueName(inst.enum)}`;

        case IRInstKind.EnumGetData:
            return `${resultPrefix}enum_get_data ${ctx.getValueName(inst.enum)}, variant ${inst.variant}, index ${inst.index}`;

        case IRInstKind.Sconst:
            return `${resultPrefix}sconst lit${inst.literalId}`;

        default:
            return `<unknown instruction: ${inst.kind}>`;
    }
}

// ============================================================================
// Task 14.3: Terminator Printing
// ============================================================================

/**
 * Print a terminator to a string
 * @param {IRTerm} term
 * @param {PrintContext} [ctx]
 * @returns {string}
 */
function printTerminator(term, ctx) {
    ctx = ctx ?? new PrintContext();

    switch (term.kind) {
        case IRTermKind.Ret:
            if (term.value === null || term.value === undefined) {
                return "ret";
            }
            return `ret ${ctx.getValueName(term.value)}`;

        case IRTermKind.Br: {
            const args = term.args
                .map((/**@type{any}*/ a) => ctx.getValueName(a))
                .join(", ");
            return `br ${ctx.getBlockName(term.target)}${args ? `(${args})` : ""}`;
        }

        case IRTermKind.BrIf: {
            const thenArgs = term.thenArgs
                .map((/**@type{any}*/ a) => ctx.getValueName(a))
                .join(", ");
            const elseArgs = term.elseArgs
                .map((/**@type{any}*/ a) => ctx.getValueName(a))
                .join(", ");
            return `br_if ${ctx.getValueName(term.cond)}, then: ${ctx.getBlockName(term.thenBlock)}(${thenArgs}), else: ${ctx.getBlockName(term.elseBlock)}(${elseArgs})`;
        }

        case IRTermKind.Switch: {
            const cases = term.cases
                .map((/**@type{any}*/ c) => {
                    const args = c.args
                        .map((/**@type{any}*/ a) => ctx.getValueName(a))
                        .join(", ");
                    return `${ctx.getValueName(c.value)} => ${ctx.getBlockName(c.target)}(${args})`;
                })
                .join(", ");
            const defaultArgs = term.defaultArgs
                .map((/**@type{any}*/ a) => ctx.getValueName(a))
                .join(", ");
            return `switch ${ctx.getValueName(term.value)} { ${cases}, default: ${ctx.getBlockName(term.defaultBlock)}(${defaultArgs}) }`;
        }

        case IRTermKind.Unreachable:
            return "unreachable";

        default:
            return `<unknown terminator: ${term.kind}>`;
    }
}

// ============================================================================
// Task 14.4: Block Printing
// ============================================================================

/**
 * Print a block to a string
 * @param {IRBlock} block
 * @param {PrintContext} [ctx]
 * @returns {string}
 */
function printBlock(block, ctx) {
    ctx = ctx ?? new PrintContext();

    const lines = [];

    // Block label with parameters
    const blockName = ctx.getBlockName(block.id);
    if (block.params.length > 0) {
        const params = block.params
            .map((p) => {
                ctx.getValueName(p.id); // Register the param value name
                return `${ctx.getValueName(p.id)}: ${printType(p.ty)}`;
            })
            .join(", ");
        lines.push(`${blockName}(${params}):`);
    } else {
        lines.push(`${blockName}:`);
    }

    // Instructions
    for (const inst of block.instructions) {
        // Register value name first
        if (inst.id !== null) {
            ctx.getValueName(inst.id);
        }
        lines.push(`    ${printInstruction(inst, ctx)}`);
    }

    // Terminator
    if (block.terminator) {
        lines.push(`    ${printTerminator(block.terminator, ctx)}`);
    }

    return lines.join("\n");
}

// ============================================================================
// Task 14.5: Function Printing
// ============================================================================

/**
 * Print a function to a string
 * @param {IRFunction} fn
 * @param {PrintContext} [ctx]
 * @returns {string}
 */
function printFunction(fn, ctx) {
    ctx = ctx ?? new PrintContext();

    const lines = [];

    // Function signature
    const params = fn.params
        .map((p) => {
            ctx.getValueName(p.id); // Register param name
            return `${p.name}: ${printType(p.ty)}`;
        })
        .join(", ");
    const ret = fn.returnType ? ` -> ${printType(fn.returnType)}` : "";
    lines.push(`fn ${fn.name}(${params})${ret} {`);

    // Locals (stack slots)
    if (fn.locals.length > 0) {
        lines.push("    ; locals:");
        for (const local of fn.locals) {
            lines.push(
                `    ;   ${ctx.getLocalName(local.id)}: ${printType(local.ty)}`,
            );
        }
    }

    lines.push("");

    // Blocks
    for (const block of fn.blocks) {
        // Register block name
        ctx.getBlockName(block.id);
    }

    for (const block of fn.blocks) {
        const blockStr = printBlock(block, ctx);
        for (const line of blockStr.split("\n")) {
            lines.push(`    ${line}`);
        }
        lines.push("");
    }

    lines.push("}");

    return lines.join("\n");
}

// ============================================================================
// Task 14.6: Module Printing
// ============================================================================

/**
 * Print a module to a string
 * @param {IRModule} module
 * @returns {string}
 */
function printModule(module) {
    const ctx = new PrintContext();
    const lines = [];
    const literals = module.stringLiterals || [];

    lines.push(`; Module: ${module.name}`);
    lines.push("");

    if (literals.length > 0) {
        lines.push("; String literals:");
        for (let i = 0; i < literals.length; i++) {
            lines.push(`;   lit${i} = ${JSON.stringify(literals[i])}`);
        }
        lines.push("");
    }

    // Type declarations
    if (module.structs.size > 0) {
        lines.push("; Structs:");
        for (const [name, struct] of module.structs) {
            const fields = struct.fields
                .map(
                    (/**@type{any}*/ f, /**@type{number}*/ i) =>
                        `${i}: ${printType(f)}`,
                )
                .join(", ");
            lines.push(`;   struct ${name} { ${fields} }`);
        }
        lines.push("");
    }

    if (module.enums.size > 0) {
        lines.push("; Enums:");
        for (const [name, enum_] of module.enums) {
            const variants = enum_.variants
                .map((/**@type{any}*/ v, /**@type{number}*/ i) => {
                    if (v.length === 0) {
                        return `${i}`;
                    }
                    const fields = v
                        .map((/**@type{any}*/ t) => printType(t))
                        .join(", ");
                    return `${i}(${fields})`;
                })
                .join(", ");
            lines.push(`;   enum ${name} { ${variants} }`);
        }
        lines.push("");
    }

    // Globals
    if (module.globals.length > 0) {
        lines.push("; Globals:");
        for (const global of module.globals) {
            const init = global.init !== undefined ? ` = ${global.init}` : "";
            lines.push(`;   ${global.name}: ${printType(global.ty)}${init}`);
        }
        lines.push("");
    }

    // Functions
    for (const fn of module.functions) {
        lines.push(printFunction(fn, ctx));
        lines.push("");
    }

    return lines.join("\n");
}

// ============================================================================
// Task 14.7: Value Naming (helper functions)
// ============================================================================

/**
 * Create a new print context
 * @returns {PrintContext}
 */
function createPrintContext() {
    return new PrintContext();
}

export {
    PrintContext,
    createPrintContext,
    printType,
    printInstruction,
    printTerminator,
    printBlock,
    printFunction,
    printModule,
    icmpOpToString,
    fcmpOpToString,
};
