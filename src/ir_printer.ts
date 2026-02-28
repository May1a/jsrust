import {
    ArrayType,
    BoolType,
    BrIfTerm,
    BrTerm,
    CallDynInst,
    CallInst,
    EnumType,
    FloatType,
    FnType,
    IRTermKind,
    IntType,
    PtrType,
    RetTerm,
    StructType,
    SwitchTerm,
    UnitType,
    type IRBlock,
    type IRFunction,
    type IRInst,
    type IRModule,
    type IRTerm,
} from "./ir";

function printType(type: unknown): string {
    if (type instanceof IntType) {
        return `int(${type.width})`;
    }
    if (type instanceof FloatType) {
        return `float(${type.width})`;
    }
    if (type instanceof BoolType) {
        return "bool";
    }
    if (type instanceof PtrType) {
        return `ptr<${printType(type.inner)}>`;
    }
    if (type instanceof UnitType) {
        return "unit";
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
        const params = type.params.map((param) => printType(param)).join(", ");
        return `fn(${params}) -> ${printType(type.returnType)}`;
    }
    return "<unknown-type>";
}

function printTerminator(term: IRTerm): string {
    if (term instanceof RetTerm) {
        return typeof term.value === "number" ? `ret v${term.value}` : "ret";
    }
    if (term instanceof BrTerm) {
        const args = term.args.map((arg) => `v${arg}`).join(", ");
        return args.length > 0 ? `br b${term.target}(${args})` : `br b${term.target}`;
    }
    if (term instanceof BrIfTerm) {
        return `br_if v${term.condition} then b${term.thenBranch} else b${term.elseBranch}`;
    }
    if (term instanceof SwitchTerm) {
        const cases = term.cases
            .map((entry) => `${entry.value} => b${entry.target}`)
            .join(", ");
        return `switch v${term.value} [${cases}] default b${term.defaultBranch}`;
    }
    if (term.kind === IRTermKind.Unreachable) {
        return "unreachable";
    }
    return "<unknown-term>";
}

function printInst(inst: IRInst): string {
    if (inst instanceof CallInst) {
        const args = inst.args.map((arg) => `v${arg}`).join(", ");
        return `v${inst.id} = call f${inst.callee}(${args})`;
    }
    if (inst instanceof CallDynInst) {
        const args = inst.args.map((arg) => `v${arg}`).join(", ");
        return `v${inst.id} = call_dyn v${inst.callee}(${args})`;
    }

    const op = `${inst.kind}`;
    return `v${inst.id} = ${op} : ${printType(inst.irType)}`;
}

function printBlock(block: IRBlock): string {
    const lines: string[] = [];
    lines.push(`  b${block.id} (${block.name}):`);

    for (const inst of block.instructions) {
        lines.push(`    ${printInst(inst)}`);
    }

    if (block.terminator) {
        lines.push(`    ${printTerminator(block.terminator)}`);
    } else {
        lines.push("    <missing-terminator>");
    }

    return lines.join("\n");
}

function printFunction(fn: IRFunction): string {
    const params = fn.params
        .map((param) => `${param.name}: ${printType(param.ty)}`)
        .join(", ");

    const lines: string[] = [];
    lines.push(`fn ${fn.name}(${params}) -> ${printType(fn.returnType)} {`);

    for (const block of fn.blocks) {
        lines.push(printBlock(block));
    }

    lines.push("}");
    return lines.join("\n");
}

export function printModule(module: IRModule): string {
    const lines: string[] = [];
    lines.push(`module ${module.name} {`);

    for (const fn of module.functions) {
        lines.push(printFunction(fn));
    }

    lines.push("}");
    return lines.join("\n\n");
}
