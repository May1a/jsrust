import {
    ArrayTypeNode,
    BuiltinType,
    FnTypeNode,
    LiteralExpr,
    LiteralKind,
    NamedTypeNode,
    OptionTypeNode,
    PtrTypeNode,
    RefTypeNode,
    ResultTypeNode,
    TupleTypeNode,
    type TypeNode,
} from "../../parse/ast";
import {
    ArrayType,
    FloatType,
    FloatWidth,
    IntType,
    IntWidth,
    IRTypeKind,
    PtrType,
    StructType,
    makeIRArrayType,
    makeIRBoolType,
    makeIREnumType,
    makeIRFloatType,
    makeIRIntType,
    makeIRPtrType,
    makeIRStructType,
    makeIRUnitType,
    type IRType,
} from "../../ir/ir";
import { internalBug } from "../../utils/internal_bug";

export function translateArrayTypeNode(typeNode: ArrayTypeNode): IRType {
    const elemTy = translateTypeNode(typeNode.element);
    if (
        !(typeNode.length instanceof LiteralExpr) ||
        typeNode.length.literalKind !== LiteralKind.Int
    ) {
        internalBug(
            "Array type requires a literal integer length; non-const lengths are not supported",
        );
    }
    const len = Number(typeNode.length.value);
    return makeIRArrayType(elemTy, len);
}

export function translateTupleTypeNode(typeNode: TupleTypeNode): IRType {
    if (typeNode.elements.length === 0) {
        return makeIRUnitType();
    }
    const elementTypes = typeNode.elements.map((element) =>
        translateTypeNode(element),
    );
    const name = tupleStructName(elementTypes);
    return makeIRStructType(name, elementTypes);
}

export function translateTypeNode(typeNode: TypeNode): IRType {
    if (typeNode instanceof OptionTypeNode) {
        const innerIrType = translateTypeNode(typeNode.inner);
        return makeIREnumType("Option", [[], [innerIrType]]);
    }
    if (typeNode instanceof ResultTypeNode) {
        const okType = translateTypeNode(typeNode.okType);
        const errType = translateTypeNode(typeNode.errType);
        return makeIREnumType("Result", [[okType], [errType]]);
    }
    if (typeNode instanceof NamedTypeNode) {
        const builtin = namedBuiltin(typeNode.name);
        if (builtin) {
            return builtinToIrType(builtin);
        }
        return makeIRStructType(typeNode.name, []);
    }
    if (typeNode instanceof RefTypeNode) {
        return makeIRPtrType(translateTypeNode(typeNode.inner));
    }
    if (typeNode instanceof PtrTypeNode) {
        return makeIRPtrType(translateTypeNode(typeNode.inner));
    }
    if (typeNode instanceof FnTypeNode) {
        return makeIRIntType(IntWidth.I64);
    }
    if (typeNode instanceof ArrayTypeNode) {
        return translateArrayTypeNode(typeNode);
    }
    if (typeNode instanceof TupleTypeNode) {
        return translateTupleTypeNode(typeNode);
    }
    return makeIRUnitType();
}

export function irTypeName(ty: IRType): string {
    if (ty instanceof IntType) return `i${String(ty.width)}`;
    if (ty instanceof FloatType) return `f${String(ty.width)}`;
    if (ty.kind === IRTypeKind.Bool) return "bool";
    if (ty instanceof PtrType) {
        return `ptr_${irTypeName(ty.inner)}`;
    }
    if (ty instanceof StructType) return ty.name;
    if (ty instanceof ArrayType) {
        return `arr${String(ty.length)}_${irTypeName(ty.element)}`;
    }
    if (ty.kind === IRTypeKind.Unit) return "unit";
    return `k${String(ty.kind)}`;
}

export function tupleStructName(elementTypes: IRType[]): string {
    const parts = elementTypes.map((ty) => irTypeName(ty));
    return `__tuple${elementTypes.length}_${parts.join("_")}`;
}

export function namedBuiltin(name: string): BuiltinType | undefined {
    const n = name.toLowerCase();
    switch (n) {
        case "i8": {
            return BuiltinType.I8;
        }
        case "i16": {
            return BuiltinType.I16;
        }
        case "i32": {
            return BuiltinType.I32;
        }
        case "i64": {
            return BuiltinType.I64;
        }
        case "i128": {
            return BuiltinType.I128;
        }
        case "isize": {
            return BuiltinType.Isize;
        }
        case "u8": {
            return BuiltinType.U8;
        }
        case "u16": {
            return BuiltinType.U16;
        }
        case "u32": {
            return BuiltinType.U32;
        }
        case "u64": {
            return BuiltinType.U64;
        }
        case "u128": {
            return BuiltinType.U128;
        }
        case "usize": {
            return BuiltinType.Usize;
        }
        case "f32": {
            return BuiltinType.F32;
        }
        case "f64": {
            return BuiltinType.F64;
        }
        case "bool": {
            return BuiltinType.Bool;
        }
        case "char": {
            return BuiltinType.Char;
        }
        case "str": {
            return BuiltinType.Str;
        }
        case "unit": {
            return BuiltinType.Unit;
        }
        case "never": {
            return BuiltinType.Never;
        }
        default: {
            return undefined;
        }
    }
}

export function builtinToIrType(ty: BuiltinType): IRType {
    switch (ty) {
        case BuiltinType.I8: {
            return makeIRIntType(IntWidth.I8);
        }
        case BuiltinType.I16: {
            return makeIRIntType(IntWidth.I16);
        }
        case BuiltinType.I32: {
            return makeIRIntType(IntWidth.I32);
        }
        case BuiltinType.I64: {
            return makeIRIntType(IntWidth.I64);
        }
        case BuiltinType.I128: {
            return makeIRIntType(IntWidth.I128);
        }
        case BuiltinType.Isize: {
            return makeIRIntType(IntWidth.Isize);
        }
        case BuiltinType.U8: {
            return makeIRIntType(IntWidth.U8);
        }
        case BuiltinType.U16: {
            return makeIRIntType(IntWidth.U16);
        }
        case BuiltinType.U32: {
            return makeIRIntType(IntWidth.U32);
        }
        case BuiltinType.U64: {
            return makeIRIntType(IntWidth.U64);
        }
        case BuiltinType.U128: {
            return makeIRIntType(IntWidth.U128);
        }
        case BuiltinType.Usize: {
            return makeIRIntType(IntWidth.Usize);
        }
        case BuiltinType.F32: {
            return makeIRFloatType(FloatWidth.F32);
        }
        case BuiltinType.F64: {
            return makeIRFloatType(FloatWidth.F64);
        }
        case BuiltinType.Bool: {
            return makeIRBoolType();
        }
        case BuiltinType.Char: {
            return makeIRIntType(IntWidth.U32);
        }
        case BuiltinType.Str: {
            return makeIRPtrType(makeIRIntType(IntWidth.U8));
        }
        case BuiltinType.Unit:
        case BuiltinType.Never: {
            return makeIRUnitType();
        }
        default: {
            const unreachable: never = ty;
            return unreachable;
        }
    }
}
