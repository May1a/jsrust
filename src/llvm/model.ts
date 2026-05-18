export type LlvmType =
    | { kind: "void" }
    | { kind: "integer"; bits: number }
    | { kind: "float" }
    | { kind: "double" }
    | { kind: "ptr" }
    | { kind: "array"; length: number; element: LlvmType }
    | { kind: "named"; name: string }
    | { kind: "struct"; fields: LlvmType[] }
    | { kind: "function"; params: LlvmType[]; returnType: LlvmType };

export type LlvmGlobal = {
    name: string;
    type: LlvmType;
    initializer: string;
    linkage?: string;
    unnamedAddr?: boolean;
};

export type LlvmDeclaration = {
    name: string;
    returnType: LlvmType;
    params: LlvmType[];
    varargs?: boolean;
};

export type LlvmNamedType = {
    name: string;
    type: LlvmType;
};

export type LlvmFunctionParam = {
    name: string;
    type: LlvmType;
};

export type LlvmBlock = {
    name: string;
    lines: string[];
    terminator: string;
};

export type LlvmFunction = {
    name: string;
    returnType: LlvmType;
    params: LlvmFunctionParam[];
    blocks: LlvmBlock[];
};

export type LlvmModule = {
    sourceName: string;
    targetVersion: string;
    namedTypes: LlvmNamedType[];
    globals: LlvmGlobal[];
    declarations: LlvmDeclaration[];
    functions: LlvmFunction[];
};

export const LLVM_VOID: LlvmType = { kind: "void" };
export const LLVM_PTR: LlvmType = { kind: "ptr" };
export const LLVM_I1: LlvmType = { kind: "integer", bits: 1 };
export const LLVM_I8: LlvmType = { kind: "integer", bits: 8 };
export const LLVM_I32: LlvmType = { kind: "integer", bits: 32 };
export const LLVM_I64: LlvmType = { kind: "integer", bits: 64 };
export const LLVM_FLOAT: LlvmType = { kind: "float" };
export const LLVM_DOUBLE: LlvmType = { kind: "double" };

export function llvmInteger(bits: number): LlvmType {
    return { kind: "integer", bits };
}

export function llvmArray(length: number, element: LlvmType): LlvmType {
    return { kind: "array", length, element };
}

export function llvmNamed(name: string): LlvmType {
    return { kind: "named", name };
}

export function llvmStruct(fields: LlvmType[]): LlvmType {
    return { kind: "struct", fields };
}
