import { match } from "ts-pattern";
import type {
    LlvmDeclaration,
    LlvmFunction,
    LlvmGlobal,
    LlvmModule,
    LlvmNamedType,
    LlvmType,
} from "./model";

function escapeQuoted(value: string): string {
    return value
        .replace(/\\/g, String.raw`\5C`)
        .replace(/"/g, String.raw`\22`);
}

function isBareIdentifier(value: string): boolean {
    return /^[-A-Za-z$._][-A-Za-z$._0-9]*$/.test(value);
}

export function llvmGlobalName(name: string): string {
    if (isBareIdentifier(name)) {
        return `@${name}`;
    }
    return `@"${escapeQuoted(name)}"`;
}

export function llvmLocalName(name: string): string {
    return `%${name}`;
}

export function llvmTypeName(type: LlvmType): string {
    return match(type)
        .with({ kind: "void" }, () => "void")
        .with({ kind: "integer" }, (value) => `i${String(value.bits)}`)
        .with({ kind: "float" }, () => "float")
        .with({ kind: "double" }, () => "double")
        .with({ kind: "ptr" }, () => "ptr")
        .with(
            { kind: "array" },
            (value) =>
                `[${String(value.length)} x ${llvmTypeName(value.element)}]`,
        )
        .with({ kind: "named" }, (value) => `%${value.name}`)
        .with(
            { kind: "struct" },
            (value) => `{ ${value.fields.map(llvmTypeName).join(", ")} }`,
        )
        .with(
            { kind: "function" },
            (value) =>
                `${llvmTypeName(value.returnType)} (${value.params
                    .map(llvmTypeName)
                    .join(", ")})`,
        )
        .exhaustive();
}

function printNamedType(namedType: LlvmNamedType): string {
    return `%${namedType.name} = type ${llvmTypeName(namedType.type)}`;
}

function printGlobal(global: LlvmGlobal): string {
    const parts: string[] = [llvmGlobalName(global.name), "="];
    if (global.linkage !== undefined) {
        parts.push(global.linkage);
    }
    if (global.unnamedAddr === true) {
        parts.push("unnamed_addr");
    }
    parts.push("constant", llvmTypeName(global.type), global.initializer);
    return parts.join(" ");
}

function printDeclaration(declaration: LlvmDeclaration): string {
    const params = declaration.params.map(llvmTypeName);
    if (declaration.varargs === true) {
        params.push("...");
    }
    return `declare ${llvmTypeName(declaration.returnType)} ${llvmGlobalName(
        declaration.name,
    )}(${params.join(", ")})`;
}

function printFunction(fn: LlvmFunction): string {
    const params = fn.params
        .map((param) => `${llvmTypeName(param.type)} ${llvmLocalName(param.name)}`)
        .join(", ");
    const lines = [
        `define ${llvmTypeName(fn.returnType)} ${llvmGlobalName(
            fn.name,
        )}(${params}) {`,
    ];
    for (const block of fn.blocks) {
        lines.push(`${block.name}:`);
        for (const line of block.lines) {
            lines.push(`  ${line}`);
        }
        lines.push(`  ${block.terminator}`);
    }
    lines.push("}");
    return lines.join("\n");
}

export function printLlvmModule(module: LlvmModule): string {
    const sections: string[] = [
        `; ModuleID = '${module.sourceName}'`,
        `; JSRust LLVM target = ${module.targetVersion}`,
    ];

    if (module.namedTypes.length > 0) {
        sections.push(module.namedTypes.map(printNamedType).join("\n"));
    }
    if (module.globals.length > 0) {
        sections.push(module.globals.map(printGlobal).join("\n"));
    }
    if (module.declarations.length > 0) {
        sections.push(module.declarations.map(printDeclaration).join("\n"));
    }
    if (module.functions.length > 0) {
        sections.push(module.functions.map(printFunction).join("\n\n"));
    }

    return `${sections.join("\n\n")}\n`;
}
