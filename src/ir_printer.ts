import {
    ArrayType,
    BoolType,
    BrIfTerm,
    BrTerm,
    EnumType,
    FcmpOp,
    FloatType,
    FloatWidth,
    FnType,
    IcmpOp,
    IntType,
    IntWidth,
    OpaquePtrType,
    PtrType,
    RetTerm,
    StructType,
    SwitchTerm,
    UnreachableTerm,
    UnitType,
    type AllocaInst,
    type BconstInst,
    type BitcastInst,
    type CallDynInst,
    type CallInst,
    type EnumCreateInst,
    type EnumGetDataInst,
    type EnumGetTagInst,
    type FaddInst,
    type FcmpInst,
    type FconstInst,
    type FdivInst,
    type FmulInst,
    type FnegInst,
    type FptosiInst,
    type FptouiInst,
    type FsubInst,
    type GepInst,
    type IaddInst,
    type IandInst,
    type IcmpInst,
    type IconstInst,
    type IdivInst,
    type ImodInst,
    type ImulInst,
    type InegInst,
    type IorInst,
    type IshlInst,
    type IshrInst,
    type IsubInst,
    type IxorInst,
    type LoadInst,
    type MemcpyInst,
    type NullInst,
    type PtraddInst,
    type SconstInst,
    type SextInst,
    type SitofpInst,
    type StoreInst,
    type StructCreateInst,
    type StructGetInst,
    type TruncInst,
    type UitofpInst,
    type ZextInst,
    type IRBlock,
    type IRFunction,
    type IRInst,
    type IRInstVisitor,
    type IRModule,
    type IRTerm,
    type IRType,
} from "./ir";

// ============================================================================
// Helpers
// ============================================================================

function val(id: number): string {
    return `v${id}`;
}

function blockRef(target: number, args: number[]): string {
    if (args.length === 0) {
        return `b${target}`;
    }
    return `b${target}(${args.map(val).join(", ")})`;
}

// Rhs-only helpers used by the visitor methods.

function binRhs(name: string, left: number, right: number): string {
    return `${name} ${val(left)}, ${val(right)}`;
}

function unaryRhs(name: string, operand: number): string {
    return `${name} ${val(operand)}`;
}

function castRhs(
    name: string,
    operand: number,
    from: IRType,
    to: IRType,
): string {
    return `${name} ${val(operand)} : ${printType(from)} -> ${printType(to)}`;
}

// ============================================================================
// Types
// ============================================================================

function printType(type: IRType): string {
    if (type instanceof IntType) {
        // Numeric enums expose reverse mappings; find the string key matching this width.
        const entry = Object.entries(IntWidth).find(
            ([, v]) => v === type.width,
        );
        return entry !== undefined ? entry[0].toLowerCase() : "i?";
    }
    if (type instanceof FloatType) {
        return type.width === FloatWidth.F32 ? "f32" : "f64";
    }
    if (type instanceof BoolType) {
        return "bool";
    }
    if (type instanceof OpaquePtrType) {
        return "ptr";
    }
    if (type instanceof PtrType) {
        return `ptr<${printType(type.inner)}>`;
    }
    if (type instanceof UnitType) {
        return "()";
    }
    if (type instanceof StructType) {
        return `struct ${type.name}`;
    }
    if (type instanceof EnumType) {
        return `enum ${type.name}`;
    }
    if (type instanceof ArrayType) {
        return `[${printType(type.element)}; ${type.length}]`;
    }
    if (type instanceof FnType) {
        const params = type.params.map(printType).join(", ");
        return `fn(${params}) -> ${printType(type.returnType)}`;
    }
    return "<unknown-type>";
}

// ============================================================================
// Comparison operators
// ============================================================================

function printIcmpOp(op: IcmpOp): string {
    const names: Record<IcmpOp, string> = {
        [IcmpOp.Eq]: "eq",
        [IcmpOp.Ne]: "ne",
        [IcmpOp.Slt]: "slt",
        [IcmpOp.Sle]: "sle",
        [IcmpOp.Sgt]: "sgt",
        [IcmpOp.Sge]: "sge",
        [IcmpOp.Ult]: "ult",
        [IcmpOp.Ule]: "ule",
        [IcmpOp.Ugt]: "ugt",
        [IcmpOp.Uge]: "uge",
    };
    return names[op] ?? "<unknown-icmp-op>";
}

function printFcmpOp(op: FcmpOp): string {
    const names: Record<FcmpOp, string> = {
        [FcmpOp.Oeq]: "oeq",
        [FcmpOp.One]: "one",
        [FcmpOp.Olt]: "olt",
        [FcmpOp.Ole]: "ole",
        [FcmpOp.Ogt]: "ogt",
        [FcmpOp.Oge]: "oge",
    };
    return names[op] ?? "<unknown-fcmp-op>";
}

// ============================================================================
// Instruction visitor
// ============================================================================

// An instruction prints as either:
//   - an assignment: "v{id}: {type}" = "{rhs}"   (lhs is a string)
//   - a pure effect: "{rhs}"                       (lhs is null, unit return)
interface InstLine {
    lhs: string | undefined;
    rhs: string;
}

// The visitor context is the IRModule, used to resolve callee names.
class InstPrinterVisitor implements IRInstVisitor<InstLine, IRModule> {
    private mkDef(inst: IRInst, rhs: string): InstLine {
        return { lhs: `${val(inst.id)}: ${printType(inst.irType)}`, rhs };
    }

    private mkEffect(rhs: string): InstLine {
        return { lhs: undefined, rhs };
    }

    private resolveCallee(id: number, module: IRModule): string {
        const fn = module.functions.find((f) => f.id === id);
        return fn !== undefined ? fn.name : `f${id}`;
    }

    // --- Constants ---

    visitIconstInst(inst: IconstInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, `iconst ${inst.value}`);
    }

    visitFconstInst(inst: FconstInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, `fconst ${inst.value}`);
    }

    visitBconstInst(inst: BconstInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, `bconst ${String(inst.value)}`);
    }

    visitNullInst(inst: NullInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, "null");
    }

    visitSconstInst(inst: SconstInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, `sconst s${inst.stringId}`);
    }

    // --- Integer arithmetic ---

    visitIaddInst(inst: IaddInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("iadd", inst.left, inst.right));
    }

    visitIsubInst(inst: IsubInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("isub", inst.left, inst.right));
    }

    visitImulInst(inst: ImulInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("imul", inst.left, inst.right));
    }

    visitIdivInst(inst: IdivInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("idiv", inst.left, inst.right));
    }

    visitImodInst(inst: ImodInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("imod", inst.left, inst.right));
    }

    // --- Float arithmetic ---

    visitFaddInst(inst: FaddInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("fadd", inst.left, inst.right));
    }

    visitFsubInst(inst: FsubInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("fsub", inst.left, inst.right));
    }

    visitFmulInst(inst: FmulInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("fmul", inst.left, inst.right));
    }

    visitFdivInst(inst: FdivInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("fdiv", inst.left, inst.right));
    }

    // --- Negation ---

    visitInegInst(inst: InegInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, unaryRhs("ineg", inst.operand));
    }

    visitFnegInst(inst: FnegInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, unaryRhs("fneg", inst.operand));
    }

    // --- Bitwise ---

    visitIandInst(inst: IandInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("iand", inst.left, inst.right));
    }

    visitIorInst(inst: IorInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("ior", inst.left, inst.right));
    }

    visitIxorInst(inst: IxorInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("ixor", inst.left, inst.right));
    }

    visitIshlInst(inst: IshlInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("ishl", inst.left, inst.right));
    }

    visitIshrInst(inst: IshrInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, binRhs("ishr", inst.left, inst.right));
    }

    // --- Comparisons ---

    visitIcmpInst(inst: IcmpInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            binRhs(`icmp.${printIcmpOp(inst.op)}`, inst.left, inst.right),
        );
    }

    visitFcmpInst(inst: FcmpInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            binRhs(`fcmp.${printFcmpOp(inst.op)}`, inst.left, inst.right),
        );
    }

    // --- Memory ---

    visitAllocaInst(inst: AllocaInst, _mod: IRModule): InstLine {
        const align =
            inst.alignment !== undefined ? `, align ${inst.alignment}` : "";
        return this.mkDef(inst, `alloca ${printType(inst.allocType)}${align}`);
    }

    visitLoadInst(inst: LoadInst, _mod: IRModule): InstLine {
        const align =
            inst.alignment !== undefined ? `, align ${inst.alignment}` : "";
        return this.mkDef(inst, `load ${val(inst.ptr)}${align}`);
    }

    // Store always returns () and its result is never used — emit as a pure effect.
    visitStoreInst(inst: StoreInst, _mod: IRModule): InstLine {
        const align =
            inst.alignment !== undefined ? `, align ${inst.alignment}` : "";
        return this.mkEffect(
            `store ${val(inst.value)} -> ${val(inst.ptr)}${align}`,
        );
    }

    // Memcpy always returns () — emit as a pure effect.
    visitMemcpyInst(inst: MemcpyInst, _mod: IRModule): InstLine {
        return this.mkEffect(
            `memcpy ${val(inst.dest)} <- ${val(inst.src)}, size: ${val(inst.size)}`,
        );
    }

    visitGepInst(inst: GepInst, _mod: IRModule): InstLine {
        const indices = inst.indices.map(val).join(", ");
        return this.mkDef(
            inst,
            `gep ${val(inst.ptr)}[${indices}] -> ${printType(inst.resultType)}`,
        );
    }

    visitPtraddInst(inst: PtraddInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            `ptradd ${val(inst.ptr)} + ${val(inst.offset)}`,
        );
    }

    // --- Type conversions ---

    visitTruncInst(inst: TruncInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("trunc", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitSextInst(inst: SextInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("sext", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitZextInst(inst: ZextInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("zext", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitFptouiInst(inst: FptouiInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("fptoui", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitFptosiInst(inst: FptosiInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("fptosi", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitUitofpInst(inst: UitofpInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("uitofp", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitSitofpInst(inst: SitofpInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("sitofp", inst.operand, inst.fromType, inst.toType),
        );
    }

    visitBitcastInst(inst: BitcastInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            castRhs("bitcast", inst.operand, inst.fromType, inst.toType),
        );
    }

    // --- Calls ---

    visitCallInst(inst: CallInst, mod: IRModule): InstLine {
        const args = inst.args.map(val).join(", ");
        const callee = this.resolveCallee(inst.callee, mod);
        const rhs = `call ${callee}(${args})`;
        // Unit-returning calls are pure effects; non-unit calls produce a value.
        if (inst.irType instanceof UnitType) {
            return this.mkEffect(rhs);
        }
        return this.mkDef(inst, rhs);
    }

    visitCallDynInst(inst: CallDynInst, mod: IRModule): InstLine {
        const args = inst.args.map(val).join(", ");
        const callee = this.resolveCallee(inst.callee, mod);
        const rhs = `call_dyn ${callee}(${args})`;
        if (inst.irType instanceof UnitType) {
            return this.mkEffect(rhs);
        }
        return this.mkDef(inst, rhs);
    }

    // --- Aggregates ---

    visitStructCreateInst(inst: StructCreateInst, _mod: IRModule): InstLine {
        const fields = inst.fields.map(val).join(", ");
        return this.mkDef(
            inst,
            `struct_create ${inst.structType.name} { ${fields} }`,
        );
    }

    visitStructGetInst(inst: StructGetInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, `struct_get ${val(inst.struct)}.${inst.index}`);
    }

    visitEnumCreateInst(inst: EnumCreateInst, _mod: IRModule): InstLine {
        const data = inst.data !== null ? `, data: ${val(inst.data)}` : "";
        return this.mkDef(
            inst,
            `enum_create ${inst.enumType.name} tag=${inst.tag}${data}`,
        );
    }

    visitEnumGetTagInst(inst: EnumGetTagInst, _mod: IRModule): InstLine {
        return this.mkDef(inst, `enum_get_tag ${val(inst.enum_)}`);
    }

    visitEnumGetDataInst(inst: EnumGetDataInst, _mod: IRModule): InstLine {
        return this.mkDef(
            inst,
            `enum_get_data ${val(inst.enum_)} as ${printType(inst.dataType)}`,
        );
    }
}

const instPrinterVisitor = new InstPrinterVisitor();

// ============================================================================
// Terminators
// ============================================================================

function printTerminator(term: IRTerm): string {
    if (term instanceof RetTerm) {
        return typeof term.value === "number"
            ? `ret ${val(term.value)}`
            : "ret";
    }
    if (term instanceof BrTerm) {
        return `br ${blockRef(term.target, term.args)}`;
    }
    if (term instanceof BrIfTerm) {
        const thenRef = blockRef(term.thenBranch, term.thenArgs);
        const elseRef = blockRef(term.elseBranch, term.elseArgs);
        return `br_if ${val(term.condition)}, then: ${thenRef}, else: ${elseRef}`;
    }
    if (term instanceof SwitchTerm) {
        const cases = term.cases
            .map(
                (entry) =>
                    `${entry.value} => ${blockRef(entry.target, entry.args)}`,
            )
            .join(", ");
        const defaultRef = blockRef(term.defaultBranch, term.defaultArgs);
        return `switch ${val(term.value)} [ ${cases} ] default: ${defaultRef}`;
    }
    if (term instanceof UnreachableTerm) {
        return "unreachable";
    }
    return "<unknown-term>";
}

// ============================================================================
// Blocks
// ============================================================================

function printBlock(block: IRBlock, module: IRModule): string {
    const lines: string[] = [];

    // Block header: "b{id}[(params)] (name):"
    const paramList =
        block.params.length > 0
            ? `(${block.params.map((p) => `${val(p.id)}: ${printType(p.ty)}`).join(", ")})`
            : "";
    lines.push(`  b${block.id}${paramList} (${block.name}):`);

    // Collect all instruction outputs.
    const instLines = block.instructions.map((inst) =>
        inst.accept(instPrinterVisitor, module),
    );

    // Compute the max lhs width among assignment instructions so the `=` signs
    // All line up in a column.
    let maxLhs = 0;
    for (const line of instLines) {
        if (line.lhs !== undefined) {
            maxLhs = Math.max(maxLhs, line.lhs.length);
        }
    }

    for (const line of instLines) {
        if (line.lhs !== undefined) {
            lines.push(`    ${line.lhs.padEnd(maxLhs)} = ${line.rhs}`);
        } else {
            lines.push(`    ${line.rhs}`);
        }
    }

    if (block.terminator !== undefined) {
        lines.push(`    ${printTerminator(block.terminator)}`);
    } else {
        lines.push("    <missing-terminator>");
    }

    return lines.join("\n");
}

// ============================================================================
// Functions
// ============================================================================

function printFunction(fn: IRFunction, module: IRModule): string {
    const params = fn.params
        .map((p) => `${val(p.id)} ${p.name}: ${printType(p.ty)}`)
        .join(", ");

    const lines: string[] = [];
    lines.push(
        `fn f${fn.id} ${fn.name}(${params}) -> ${printType(fn.returnType)} {`,
    );

    for (let i = 0; i < fn.blocks.length; i++) {
        lines.push(printBlock(fn.blocks[i], module));
        // Blank line between blocks to visually separate control-flow regions.
        if (i < fn.blocks.length - 1) {
            lines.push("");
        }
    }

    lines.push("}");
    return lines.join("\n");
}

// ============================================================================
// Module
// ============================================================================

export function printModule(module: IRModule): string {
    const sections: string[] = [];

    // String literals
    if (module.stringLiterals.length > 0) {
        const litLines: string[] = ["  strings {"];
        for (let i = 0; i < module.stringLiterals.length; i++) {
            litLines.push(
                `    s${i} = ${JSON.stringify(module.stringLiterals[i])}`,
            );
        }
        litLines.push("  }");
        sections.push(litLines.join("\n"));
    }

    // Struct type definitions
    for (const [, st] of module.structs) {
        const fields = st.fields.map(printType).join(", ");
        sections.push(`  struct ${st.name} { ${fields} }`);
    }

    // Enum type definitions
    for (const [, et] of module.enums) {
        const variants = et.variants
            .map((v) => `[${v.map(printType).join(", ")}]`)
            .join(", ");
        sections.push(`  enum ${et.name} { ${variants} }`);
    }

    // Global variables
    for (const g of module.globals) {
        sections.push(`  global ${g.name}: ${printType(g.ty)}`);
    }

    // Functions — each indented inside the module braces.
    for (const fn of module.functions) {
        const fnText = printFunction(fn, module)
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n");
        sections.push(fnText);
    }

    if (sections.length === 0) {
        return `module ${module.name} {}`;
    }

    return `module ${module.name} {\n\n${sections.join("\n\n")}\n\n}`;
}
