/**
 * Intermediate Representation (IR) Module
 *
 * Type-safe IR design following the AST pattern with class-based inheritance,
 * discriminated unions, and visitor pattern support.
 */

// ============================================================================
// ID Types
// ============================================================================

export type ValueId = number;
export type BlockId = number;
export type FunctionId = number;
export type LocalId = number;

// ============================================================================
// Type System
// ============================================================================

export enum IRTypeKind {
    Int,
    Float,
    Bool,
    Ptr,
    Unit,
    Struct,
    Enum,
    Array,
    Fn,
}

export enum IntWidth {
    I8,
    I16,
    I32,
    I64,
    I128,
    Isize,
    U8,
    U16,
    U32,
    U64,
    U128,
    Usize,
}

export enum FloatWidth {
    F32,
    F64,
}

export abstract class IRType {
    readonly kind: IRTypeKind;

    constructor(kind: IRTypeKind) {
        this.kind = kind;
    }

    abstract accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R;

    abstract typeEq(cmpType: IRType): boolean;
}

export class IntType extends IRType {
    readonly width: IntWidth;

    constructor(width: IntWidth) {
        super(IRTypeKind.Int);
        this.width = width;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitIntType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof IntType) {
            if (this.width === cmpType.width) return true;
        }
        return false;
    }
}

export class FloatType extends IRType {
    readonly width: FloatWidth;

    constructor(width: FloatWidth) {
        super(IRTypeKind.Float);
        this.width = width;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitFloatType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof FloatType) {
            if (this.width === cmpType.width) return true;
        }
        return false;
    }
}

export class BoolType extends IRType {
    constructor() {
        super(IRTypeKind.Bool);
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitBoolType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof BoolType) return true;
        return false;
    }
}

export class PtrType extends IRType {
    readonly inner: IRType;

    constructor(inner: IRType) {
        super(IRTypeKind.Ptr);
        this.inner = inner;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitPtrType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof PtrType) {
            return cmpType.inner.typeEq(this.inner);
        }
        return false;
    }
}

export class OpaquePtrType extends PtrType {
    constructor() {
        super(new UnitType());
    }
}

export class UnitType extends IRType {
    constructor() {
        super(IRTypeKind.Unit);
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitUnitType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof UnitType) return true;
        return false;
    }
}

export class StructType extends IRType {
    readonly name: string;
    readonly fields: IRType[];

    constructor(name: string, fields: IRType[]) {
        super(IRTypeKind.Struct);
        this.name = name;
        this.fields = fields;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitStructType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof StructType) {
            if (cmpType.name !== this.name) return false;
            if (cmpType.fields.length !== this.fields.length) return false;
            for (let i = 0; i < this.fields.length; ++i) {
                if (!this.fields[i].typeEq(cmpType.fields[i])) return false;
            }
            return true;
        }
        return false;
    }
}

export class EnumType extends IRType {
    readonly name: string;
    readonly variants: IRType[][];

    constructor(name: string, variants: IRType[][]) {
        super(IRTypeKind.Enum);
        this.name = name;
        this.variants = variants;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitEnumType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (!(cmpType instanceof EnumType)) return false;
        if (this.name !== cmpType.name) return false;
        if (this.variants.length !== cmpType.variants.length) return false;
        for (let i = 0; i < this.variants.length; i++) {
            const av = this.variants[i];
            const bv = cmpType.variants[i];
            if (av.length !== bv.length) return false;
            for (let j = 0; j < av.length; j++) {
                if (av[j].typeEq(bv[j])) return false;
            }
        }
        return true;
    }
}

export class ArrayType extends IRType {
    readonly element: IRType;
    readonly length: number;

    constructor(element: IRType, length: number) {
        super(IRTypeKind.Array);
        this.element = element;
        this.length = length;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitArrayType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof ArrayType) {
            if (this.length !== cmpType.length) return false;
            return this.element.typeEq(cmpType.element);
        }
        return false;
    }
}

export class FnType extends IRType {
    readonly params: IRType[];
    readonly returnType: IRType;

    constructor(params: IRType[], returnType: IRType) {
        super(IRTypeKind.Fn);
        this.params = params;
        this.returnType = returnType;
    }

    accept<R, C>(visitor: IRTypeVisitor<R, C>, ctx: C): R {
        return visitor.visitFnType(this, ctx);
    }
    typeEq(cmpType: IRType): boolean {
        if (cmpType instanceof FnType) {
            if (this.params.length !== cmpType.params.length) return false;
            for (let i = 0; i < this.params.length; i++) {
                if (!this.params[i].typeEq(cmpType.params[i])) return false;
            }
            return this.returnType.typeEq(cmpType.returnType);
        }
        return false;
    }
}

export interface IRTypeVisitor<R, C> {
    visitIntType(type: IntType, ctx: C): R;
    visitFloatType(type: FloatType, ctx: C): R;
    visitBoolType(type: BoolType, ctx: C): R;
    visitPtrType(type: PtrType, ctx: C): R;
    visitUnitType(type: UnitType, ctx: C): R;
    visitStructType(type: StructType, ctx: C): R;
    visitEnumType(type: EnumType, ctx: C): R;
    visitArrayType(type: ArrayType, ctx: C): R;
    visitFnType(type: FnType, ctx: C): R;
}

// ============================================================================
// Instructions
// ============================================================================

export enum IRInstKind {
    // Constants
    Iconst,
    Fconst,
    Bconst,
    Null,
    Sconst,

    // Integer arithmetic
    Iadd,
    Isub,
    Imul,
    Idiv,
    Imod,

    // Float arithmetic
    Fadd,
    Fsub,
    Fmul,
    Fdiv,

    // Negation
    Ineg,
    Fneg,

    // Bitwise operations
    Iand,
    Ior,
    Ixor,
    Ishl,
    Ishr,

    // Comparisons
    Icmp,
    Fcmp,

    // Memory operations
    Alloca,
    Load,
    Store,
    Memcpy,
    Gep,
    Ptradd,

    // Type conversions
    Trunc,
    Sext,
    Zext,
    Fptoui,
    Fptosi,
    Uitofp,
    Sitofp,
    Bitcast,

    // Function calls
    Call,
    CallDyn,

    // Aggregate operations
    StructCreate,
    StructGet,
    EnumCreate,
    EnumGetTag,
    EnumGetData,
}

export enum IcmpOp {
    Eq,
    Ne,
    Slt,
    Sle,
    Sgt,
    Sge,
    Ult,
    Ule,
    Ugt,
    Uge,
}

export enum FcmpOp {
    Oeq,
    One,
    Olt,
    Ole,
    Ogt,
    Oge,
}

export abstract class IRInst {
    readonly kind: IRInstKind;
    readonly id: ValueId;
    readonly irType: IRType;

    constructor(kind: IRInstKind, id: ValueId, ty: IRType) {
        this.kind = kind;
        this.id = id;
        this.irType = ty;
    }

    abstract accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R;
}

// Constants
export class IconstInst extends IRInst {
    readonly value: number;

    constructor(id: ValueId, ty: IntType, value: number) {
        super(IRInstKind.Iconst, id, ty);
        this.value = value;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIconstInst(this, ctx);
    }
}

export class FconstInst extends IRInst {
    readonly value: number;

    constructor(id: ValueId, ty: FloatType, value: number) {
        super(IRInstKind.Fconst, id, ty);
        this.value = value;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFconstInst(this, ctx);
    }
}

export class BconstInst extends IRInst {
    readonly value: boolean;

    constructor(id: ValueId, value: boolean) {
        super(IRInstKind.Bconst, id, new BoolType());
        this.value = value;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitBconstInst(this, ctx);
    }
}

export class NullInst extends IRInst {
    readonly ptrType: PtrType;

    constructor(id: ValueId, ptrType: PtrType) {
        super(IRInstKind.Null, id, ptrType);
        this.ptrType = ptrType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitNullInst(this, ctx);
    }
}

export class SconstInst extends IRInst {
    readonly stringId: number;

    constructor(id: ValueId, stringId: number) {
        super(IRInstKind.Sconst, id, new OpaquePtrType());
        this.stringId = stringId;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitSconstInst(this, ctx);
    }
}

// Integer arithmetic
export class IaddInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Iadd, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIaddInst(this, ctx);
    }
}

export class IsubInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Isub, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIsubInst(this, ctx);
    }
}

export class ImulInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Imul, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitImulInst(this, ctx);
    }
}

export class IdivInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Idiv, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIdivInst(this, ctx);
    }
}

export class ImodInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Imod, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitImodInst(this, ctx);
    }
}

// Float arithmetic
export class FaddInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: FloatType, left: ValueId, right: ValueId) {
        super(IRInstKind.Fadd, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFaddInst(this, ctx);
    }
}

export class FsubInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: FloatType, left: ValueId, right: ValueId) {
        super(IRInstKind.Fsub, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFsubInst(this, ctx);
    }
}

export class FmulInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: FloatType, left: ValueId, right: ValueId) {
        super(IRInstKind.Fmul, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFmulInst(this, ctx);
    }
}

export class FdivInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: FloatType, left: ValueId, right: ValueId) {
        super(IRInstKind.Fdiv, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFdivInst(this, ctx);
    }
}

// Negation
export class InegInst extends IRInst {
    readonly operand: ValueId;

    constructor(id: ValueId, ty: IntType, operand: ValueId) {
        super(IRInstKind.Ineg, id, ty);
        this.operand = operand;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitInegInst(this, ctx);
    }
}

export class FnegInst extends IRInst {
    readonly operand: ValueId;

    constructor(id: ValueId, ty: FloatType, operand: ValueId) {
        super(IRInstKind.Fneg, id, ty);
        this.operand = operand;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFnegInst(this, ctx);
    }
}

// Bitwise operations
export class IandInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Iand, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIandInst(this, ctx);
    }
}

export class IorInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Ior, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIorInst(this, ctx);
    }
}

export class IxorInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Ixor, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIxorInst(this, ctx);
    }
}

export class IshlInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Ishl, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIshlInst(this, ctx);
    }
}

export class IshrInst extends IRInst {
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, ty: IntType, left: ValueId, right: ValueId) {
        super(IRInstKind.Ishr, id, ty);
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIshrInst(this, ctx);
    }
}

// Comparisons
export class IcmpInst extends IRInst {
    readonly op: IcmpOp;
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, op: IcmpOp, left: ValueId, right: ValueId) {
        super(IRInstKind.Icmp, id, new BoolType());
        this.op = op;
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitIcmpInst(this, ctx);
    }
}

export class FcmpInst extends IRInst {
    readonly op: FcmpOp;
    readonly left: ValueId;
    readonly right: ValueId;

    constructor(id: ValueId, op: FcmpOp, left: ValueId, right: ValueId) {
        super(IRInstKind.Fcmp, id, new BoolType());
        this.op = op;
        this.left = left;
        this.right = right;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFcmpInst(this, ctx);
    }
}

// Memory operations
export class AllocaInst extends IRInst {
    readonly allocType: IRType;
    readonly alignment?: number;

    constructor(id: ValueId, allocType: IRType, alignment?: number) {
        super(IRInstKind.Alloca, id, new PtrType(allocType));
        this.allocType = allocType;
        this.alignment = alignment;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitAllocaInst(this, ctx);
    }
}

export class LoadInst extends IRInst {
    readonly ptr: ValueId;
    readonly loadType: IRType;
    readonly alignment?: number;

    constructor(
        id: ValueId,
        ptr: ValueId,
        loadType: IRType,
        alignment?: number,
    ) {
        super(IRInstKind.Load, id, loadType);
        this.ptr = ptr;
        this.loadType = loadType;
        this.alignment = alignment;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitLoadInst(this, ctx);
    }
}

export class StoreInst extends IRInst {
    readonly value: ValueId;
    readonly ptr: ValueId;
    readonly alignment?: number;

    constructor(id: ValueId, value: ValueId, ptr: ValueId, alignment?: number) {
        super(IRInstKind.Store, id, new UnitType());
        this.value = value;
        this.ptr = ptr;
        this.alignment = alignment;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitStoreInst(this, ctx);
    }
}

export class MemcpyInst extends IRInst {
    readonly dest: ValueId;
    readonly src: ValueId;
    readonly size: ValueId;

    constructor(id: ValueId, dest: ValueId, src: ValueId, size: ValueId) {
        super(IRInstKind.Memcpy, id, new UnitType());
        this.dest = dest;
        this.src = src;
        this.size = size;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitMemcpyInst(this, ctx);
    }
}

export class GepInst extends IRInst {
    readonly ptr: ValueId;
    readonly indices: ValueId[];
    readonly resultType: IRType;

    constructor(
        id: ValueId,
        ptr: ValueId,
        indices: ValueId[],
        resultType: IRType,
    ) {
        super(IRInstKind.Gep, id, new PtrType(resultType));
        this.ptr = ptr;
        this.indices = indices;
        this.resultType = resultType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitGepInst(this, ctx);
    }
}

export class PtraddInst extends IRInst {
    readonly ptr: ValueId;
    readonly offset: ValueId;

    constructor(id: ValueId, ptr: ValueId, offset: ValueId) {
        super(IRInstKind.Ptradd, id, new OpaquePtrType());
        this.ptr = ptr;
        this.offset = offset;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitPtraddInst(this, ctx);
    }
}

// Type conversions
export class TruncInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: IntType;
    readonly toType: IntType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: IntType,
        toType: IntType,
    ) {
        super(IRInstKind.Trunc, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitTruncInst(this, ctx);
    }
}

export class SextInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: IntType;
    readonly toType: IntType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: IntType,
        toType: IntType,
    ) {
        super(IRInstKind.Sext, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitSextInst(this, ctx);
    }
}

export class ZextInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: IntType;
    readonly toType: IntType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: IntType,
        toType: IntType,
    ) {
        super(IRInstKind.Zext, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitZextInst(this, ctx);
    }
}

export class FptouiInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: FloatType;
    readonly toType: IntType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: FloatType,
        toType: IntType,
    ) {
        super(IRInstKind.Fptoui, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFptouiInst(this, ctx);
    }
}

export class FptosiInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: FloatType;
    readonly toType: IntType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: FloatType,
        toType: IntType,
    ) {
        super(IRInstKind.Fptosi, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitFptosiInst(this, ctx);
    }
}

export class UitofpInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: IntType;
    readonly toType: FloatType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: IntType,
        toType: FloatType,
    ) {
        super(IRInstKind.Uitofp, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitUitofpInst(this, ctx);
    }
}

export class SitofpInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: IntType;
    readonly toType: FloatType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: IntType,
        toType: FloatType,
    ) {
        super(IRInstKind.Sitofp, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitSitofpInst(this, ctx);
    }
}

export class BitcastInst extends IRInst {
    readonly operand: ValueId;
    readonly fromType: IRType;
    readonly toType: IRType;

    constructor(
        id: ValueId,
        operand: ValueId,
        fromType: IRType,
        toType: IRType,
    ) {
        super(IRInstKind.Bitcast, id, toType);
        this.operand = operand;
        this.fromType = fromType;
        this.toType = toType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitBitcastInst(this, ctx);
    }
}

// Function calls
export class CallInst extends IRInst {
    readonly callee: FunctionId;
    readonly args: ValueId[];
    readonly calleeType: FnType;

    constructor(
        id: ValueId,
        callee: FunctionId,
        args: ValueId[],
        calleeType: FnType,
        returnType: IRType,
    ) {
        super(IRInstKind.Call, id, returnType);
        this.callee = callee;
        this.args = args;
        this.calleeType = calleeType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitCallInst(this, ctx);
    }
}

export class CallDynInst extends IRInst {
    readonly callee: ValueId;
    readonly args: ValueId[];
    readonly calleeType: FnType;

    constructor(
        id: ValueId,
        callee: ValueId,
        args: ValueId[],
        calleeType: FnType,
        returnType: IRType,
    ) {
        super(IRInstKind.CallDyn, id, returnType);
        this.callee = callee;
        this.args = args;
        this.calleeType = calleeType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitCallDynInst(this, ctx);
    }
}

// Aggregate operations
export class StructCreateInst extends IRInst {
    readonly fields: ValueId[];
    readonly structType: StructType;

    constructor(id: ValueId, fields: ValueId[], structType: StructType) {
        super(IRInstKind.StructCreate, id, structType);
        this.fields = fields;
        this.structType = structType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitStructCreateInst(this, ctx);
    }
}

export class StructGetInst extends IRInst {
    readonly struct: ValueId;
    readonly index: number;
    readonly structType: StructType;
    readonly fieldType: IRType;

    constructor(
        id: ValueId,
        struct: ValueId,
        index: number,
        structType: StructType,
        fieldType: IRType,
    ) {
        super(IRInstKind.StructGet, id, fieldType);
        this.struct = struct;
        this.index = index;
        this.structType = structType;
        this.fieldType = fieldType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitStructGetInst(this, ctx);
    }
}

export class EnumCreateInst extends IRInst {
    readonly tag: number;
    readonly data: ValueId | null;
    readonly enumType: EnumType;

    constructor(
        id: ValueId,
        tag: number,
        data: ValueId | null,
        enumType: EnumType,
    ) {
        super(IRInstKind.EnumCreate, id, enumType);
        this.tag = tag;
        this.data = data;
        this.enumType = enumType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitEnumCreateInst(this, ctx);
    }
}

export class EnumGetTagInst extends IRInst {
    readonly enum_: ValueId;
    readonly enumType: EnumType;

    constructor(id: ValueId, enum_: ValueId, enumType: EnumType) {
        super(IRInstKind.EnumGetTag, id, new IntType(IntWidth.Usize));
        this.enum_ = enum_;
        this.enumType = enumType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitEnumGetTagInst(this, ctx);
    }
}

export class EnumGetDataInst extends IRInst {
    readonly enum_: ValueId;
    readonly enumType: EnumType;
    readonly dataType: IRType;

    constructor(
        id: ValueId,
        enum_: ValueId,
        enumType: EnumType,
        dataType: IRType,
    ) {
        super(IRInstKind.EnumGetData, id, new PtrType(dataType));
        this.enum_ = enum_;
        this.enumType = enumType;
        this.dataType = dataType;
    }

    accept<R, C>(visitor: IRInstVisitor<R, C>, ctx: C): R {
        return visitor.visitEnumGetDataInst(this, ctx);
    }
}

export interface IRInstVisitor<R, C> {
    visitIconstInst(inst: IconstInst, ctx: C): R;
    visitFconstInst(inst: FconstInst, ctx: C): R;
    visitBconstInst(inst: BconstInst, ctx: C): R;
    visitNullInst(inst: NullInst, ctx: C): R;
    visitSconstInst(inst: SconstInst, ctx: C): R;
    visitIaddInst(inst: IaddInst, ctx: C): R;
    visitIsubInst(inst: IsubInst, ctx: C): R;
    visitImulInst(inst: ImulInst, ctx: C): R;
    visitIdivInst(inst: IdivInst, ctx: C): R;
    visitImodInst(inst: ImodInst, ctx: C): R;
    visitFaddInst(inst: FaddInst, ctx: C): R;
    visitFsubInst(inst: FsubInst, ctx: C): R;
    visitFmulInst(inst: FmulInst, ctx: C): R;
    visitFdivInst(inst: FdivInst, ctx: C): R;
    visitInegInst(inst: InegInst, ctx: C): R;
    visitFnegInst(inst: FnegInst, ctx: C): R;
    visitIandInst(inst: IandInst, ctx: C): R;
    visitIorInst(inst: IorInst, ctx: C): R;
    visitIxorInst(inst: IxorInst, ctx: C): R;
    visitIshlInst(inst: IshlInst, ctx: C): R;
    visitIshrInst(inst: IshrInst, ctx: C): R;
    visitIcmpInst(inst: IcmpInst, ctx: C): R;
    visitFcmpInst(inst: FcmpInst, ctx: C): R;
    visitAllocaInst(inst: AllocaInst, ctx: C): R;
    visitLoadInst(inst: LoadInst, ctx: C): R;
    visitStoreInst(inst: StoreInst, ctx: C): R;
    visitMemcpyInst(inst: MemcpyInst, ctx: C): R;
    visitGepInst(inst: GepInst, ctx: C): R;
    visitPtraddInst(inst: PtraddInst, ctx: C): R;
    visitTruncInst(inst: TruncInst, ctx: C): R;
    visitSextInst(inst: SextInst, ctx: C): R;
    visitZextInst(inst: ZextInst, ctx: C): R;
    visitFptouiInst(inst: FptouiInst, ctx: C): R;
    visitFptosiInst(inst: FptosiInst, ctx: C): R;
    visitUitofpInst(inst: UitofpInst, ctx: C): R;
    visitSitofpInst(inst: SitofpInst, ctx: C): R;
    visitBitcastInst(inst: BitcastInst, ctx: C): R;
    visitCallInst(inst: CallInst, ctx: C): R;
    visitCallDynInst(inst: CallDynInst, ctx: C): R;
    visitStructCreateInst(inst: StructCreateInst, ctx: C): R;
    visitStructGetInst(inst: StructGetInst, ctx: C): R;
    visitEnumCreateInst(inst: EnumCreateInst, ctx: C): R;
    visitEnumGetTagInst(inst: EnumGetTagInst, ctx: C): R;
    visitEnumGetDataInst(inst: EnumGetDataInst, ctx: C): R;
}

// ============================================================================
// Terminators
// ============================================================================

export enum IRTermKind {
    Ret,
    Br,
    BrIf,
    Switch,
    Unreachable,
}

export abstract class IRTerm {
    readonly kind: IRTermKind;

    constructor(kind: IRTermKind) {
        this.kind = kind;
    }

    abstract accept<R, C>(visitor: IRTermVisitor<R, C>, ctx: C): R;
}

export class RetTerm extends IRTerm {
    readonly value: ValueId | undefined;

    constructor(value?: ValueId) {
        super(IRTermKind.Ret);
        this.value = value;
    }

    accept<R, C>(visitor: IRTermVisitor<R, C>, ctx: C): R {
        return visitor.visitRetTerm(this, ctx);
    }
}

export class BrTerm extends IRTerm {
    readonly target: BlockId;
    readonly args: ValueId[];

    constructor(target: BlockId, args: ValueId[]) {
        super(IRTermKind.Br);
        this.target = target;
        this.args = args;
    }

    accept<R, C>(visitor: IRTermVisitor<R, C>, ctx: C): R {
        return visitor.visitBrTerm(this, ctx);
    }
}

export class BrIfTerm extends IRTerm {
    readonly condition: ValueId;
    readonly thenBranch: BlockId;
    readonly elseBranch: BlockId;
    readonly thenArgs: ValueId[];
    readonly elseArgs: ValueId[];

    constructor(
        condition: ValueId,
        thenBranch: BlockId,
        elseBranch: BlockId,
        thenArgs: ValueId[],
        elseArgs: ValueId[],
    ) {
        super(IRTermKind.BrIf);
        this.condition = condition;
        this.thenBranch = thenBranch;
        this.elseBranch = elseBranch;
        this.thenArgs = thenArgs;
        this.elseArgs = elseArgs;
    }

    accept<R, C>(visitor: IRTermVisitor<R, C>, ctx: C): R {
        return visitor.visitBrIfTerm(this, ctx);
    }
}

export class SwitchTerm extends IRTerm {
    readonly value: ValueId;
    readonly defaultBranch: BlockId;
    readonly defaultArgs: ValueId[];
    readonly cases: { value: number; target: BlockId; args: ValueId[] }[];

    constructor(
        value: ValueId,
        defaultBranch: BlockId,
        defaultArgs: ValueId[],
        cases: { value: number; target: BlockId; args: ValueId[] }[],
    ) {
        super(IRTermKind.Switch);
        this.value = value;
        this.defaultBranch = defaultBranch;
        this.defaultArgs = defaultArgs;
        this.cases = cases;
    }

    accept<R, C>(visitor: IRTermVisitor<R, C>, ctx: C): R {
        return visitor.visitSwitchTerm(this, ctx);
    }
}

export class UnreachableTerm extends IRTerm {
    constructor() {
        super(IRTermKind.Unreachable);
    }

    accept<R, C>(visitor: IRTermVisitor<R, C>, ctx: C): R {
        return visitor.visitUnreachableTerm(this, ctx);
    }
}

export interface IRTermVisitor<R, C> {
    visitRetTerm(term: RetTerm, ctx: C): R;
    visitBrTerm(term: BrTerm, ctx: C): R;
    visitBrIfTerm(term: BrIfTerm, ctx: C): R;
    visitSwitchTerm(term: SwitchTerm, ctx: C): R;
    visitUnreachableTerm(term: UnreachableTerm, ctx: C): R;
}

// ============================================================================
// Blocks, Functions, and Modules
// ============================================================================

export interface IRBlockParam {
    id: ValueId;
    ty: IRType;
}

export interface IRFunctionParam {
    id: ValueId;
    name: string;
    ty: IRType;
}

export class IRBlock {
    readonly id: BlockId;
    readonly name: string;
    readonly params: IRBlockParam[];
    readonly instructions: IRInst[];
    terminator?: IRTerm;
    readonly predecessors: BlockId[];
    readonly successors: BlockId[];

    constructor(
        id: BlockId,
        name?: string,
        params: IRBlockParam[] = [],
        instructions: IRInst[] = [],
        predecessors: BlockId[] = [],
        successors: BlockId[] = [],
    ) {
        this.id = id;
        this.name = name ?? `block${id}`;
        this.params = params;
        this.instructions = instructions;
        this.predecessors = predecessors;
        this.successors = successors;
    }
}

export class IRLocal {
    readonly id: LocalId;
    readonly ty: IRType;
    readonly name: string;

    constructor(id: LocalId, ty: IRType, name: string) {
        this.id = id;
        this.ty = ty;
        this.name = name;
    }
}

export class IRFunction {
    readonly id: FunctionId;
    readonly name: string;
    readonly params: IRFunctionParam[];
    readonly returnType: IRType;
    readonly blocks: IRBlock[];
    readonly locals: IRLocal[];
    entry?: IRBlock;

    constructor(
        id: FunctionId,
        name: string,
        params: IRFunctionParam[],
        returnType: IRType,
    ) {
        this.id = id;
        this.name = name;
        this.params = params;
        this.returnType = returnType;
        this.blocks = [];
        this.locals = [];
    }
}

export interface IRGlobal {
    name: string;
    ty: IRType;
    init: unknown;
}

export class IRModule {
    readonly name: string;
    readonly functions: IRFunction[];
    readonly globals: IRGlobal[];
    readonly structs: Map<string, StructType>;
    readonly enums: Map<string, EnumType>;
    readonly stringLiterals: string[];
    readonly stringLiteralIds: Map<string, number>;

    constructor(name: string) {
        this.name = name;
        this.functions = [];
        this.globals = [];
        this.structs = new Map();
        this.enums = new Map();
        this.stringLiterals = [];
        this.stringLiteralIds = new Map();
    }
}

// ============================================================================
// ID Generation
// ============================================================================

const START_VALUE_ID = 0;

let nextValueId = 0;
let nextBlockId = 0;
let nextFunctionId = 0;
let nextLocalId = 0;

function resetIRIds(): void {
    nextValueId = START_VALUE_ID;
    nextBlockId = START_VALUE_ID;
    nextFunctionId = START_VALUE_ID;
    nextLocalId = START_VALUE_ID;
}

function freshValueId(): ValueId {
    return nextValueId++;
}

function freshBlockId(): BlockId {
    return nextBlockId++;
}

function freshFunctionId(): FunctionId {
    return nextFunctionId++;
}

function freshLocalId(): LocalId {
    return nextLocalId++;
}

// ============================================================================
// Type Constructors
// ============================================================================

function makeIRIntType(width: IntWidth): IntType {
    return new IntType(width);
}

function makeIRFloatType(width: FloatWidth): FloatType {
    return new FloatType(width);
}

function makeIRBoolType(): BoolType {
    return new BoolType();
}

function makeIRPtrType(inner: IRType): PtrType {
    return new PtrType(inner);
}

function makeIRUnitType(): UnitType {
    return new UnitType();
}

function makeIRStructType(name: string, fields: IRType[]): StructType {
    return new StructType(name, fields);
}

function makeIREnumType(name: string, variants: IRType[][]): EnumType {
    return new EnumType(name, variants);
}

function makeIRArrayType(element: IRType, length: number): ArrayType {
    return new ArrayType(element, length);
}

function makeIRFnType(params: IRType[], returnType: IRType): FnType {
    return new FnType(params, returnType);
}

// ============================================================================
// Type Predicates
// ============================================================================

function isIRIntType(type: IRType): type is IntType {
    return type.kind === IRTypeKind.Int;
}

function isIRFloatType(type: IRType): type is FloatType {
    return type.kind === IRTypeKind.Float;
}

function isIRBoolType(type: IRType): type is BoolType {
    return type.kind === IRTypeKind.Bool;
}

function isIRPtrType(type: IRType): type is PtrType {
    return type.kind === IRTypeKind.Ptr;
}

function isIRUnitType(type: IRType): type is UnitType {
    return type.kind === IRTypeKind.Unit;
}

function isIRStructType(type: IRType): type is StructType {
    return type.kind === IRTypeKind.Struct;
}

function isIREnumType(type: IRType): type is EnumType {
    return type.kind === IRTypeKind.Enum;
}

function isIRArrayType(type: IRType): type is ArrayType {
    return type.kind === IRTypeKind.Array;
}

function isIRFnType(type: IRType): type is FnType {
    return type.kind === IRTypeKind.Fn;
}

// ============================================================================
// Type Equality
// ============================================================================

function irTypeEquals(a: IRType, b: IRType): boolean {
    return a.typeEq(b);
}

// ============================================================================
// Module Operations
// ============================================================================

function makeIRGlobal(name: string, ty: IRType, init: unknown): IRGlobal {
    return { name, ty, init };
}

function makeIRModule(name: string): IRModule {
    return new IRModule(name);
}

function internIRStringLiteral(module: IRModule, value: string): number {
    const existing = module.stringLiteralIds.get(value);
    if (typeof existing === "number") {
        return existing;
    }
    const id = module.stringLiterals.length;
    module.stringLiterals.push(value);
    module.stringLiteralIds.set(value, id);
    return id;
}

function addIRFunction(module: IRModule, fn: IRFunction): void {
    module.functions.push(fn);
}

function addIRGlobal(module: IRModule, global: IRGlobal): void {
    module.globals.push(global);
}

function addIRStruct(module: IRModule, name: string, struct: StructType): void {
    module.structs.set(name, struct);
}

function addIREnum(module: IRModule, name: string, enum_: EnumType): void {
    module.enums.set(name, enum_);
}

// ============================================================================
// Function Building Operations
// ============================================================================

function makeIRFunction(
    id: FunctionId,
    name: string,
    params: IRFunctionParam[],
    returnType: IRType,
): IRFunction {
    return new IRFunction(id, name, params, returnType);
}

function makeIRParam(id: ValueId, name: string, ty: IRType): IRFunctionParam {
    return { id, name, ty };
}

function addIRBlock(fn: IRFunction, block: IRBlock): void {
    fn.blocks.push(block);
    fn.entry ??= block;
}

function addIRLocal(fn: IRFunction, local: IRLocal): void {
    fn.locals.push(local);
}

function makeIRBlock(id: BlockId, name?: string): IRBlock {
    return new IRBlock(id, name);
}

function addIRBlockParam(block: IRBlock, id: ValueId, ty: IRType): void {
    block.params.push({ id, ty });
}

function addIRInstruction(block: IRBlock, inst: IRInst): void {
    block.instructions.push(inst);
}

function setIRTerminator(block: IRBlock, term: IRTerm): void {
    block.terminator = term;
}

function addPredecessor(block: IRBlock, pred: BlockId): void {
    if (!block.predecessors.includes(pred)) {
        block.predecessors.push(pred);
    }
}

function addSuccessor(block: IRBlock, succ: BlockId): void {
    if (!block.successors.includes(succ)) {
        block.successors.push(succ);
    }
}

function makeIRLocal(id: LocalId, ty: IRType, name: string): IRLocal {
    return new IRLocal(id, ty, name);
}

// ============================================================================
// Visitor Helpers
// ============================================================================

function visitIRType<R = void, C = void>(
    type: IRType,
    visitor: IRTypeVisitor<R, C>,
    ctx: C,
): R {
    return type.accept(visitor, ctx);
}

function visitIRInst<R = void, C = void>(
    inst: IRInst,
    visitor: IRInstVisitor<R, C>,
    ctx: C,
): R {
    return inst.accept(visitor, ctx);
}

function visitIRTerm<R = void, C = void>(
    term: IRTerm,
    visitor: IRTermVisitor<R, C>,
    ctx: C,
): R {
    return term.accept(visitor, ctx);
}

// ============================================================================
// Exports
// ============================================================================

export {
    // ID generation
    resetIRIds,
    freshValueId,
    freshBlockId,
    freshFunctionId,
    freshLocalId,

    // Type constructors
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
    makeIRArrayType,
    makeIRFnType,

    // Type predicates
    isIRIntType,
    isIRFloatType,
    isIRBoolType,
    isIRPtrType,
    isIRUnitType,
    isIRStructType,
    isIREnumType,
    isIRArrayType,
    isIRFnType,

    // Type equality
    irTypeEquals,

    // Module operations
    makeIRGlobal,
    makeIRModule,
    internIRStringLiteral,
    addIRFunction,
    addIRGlobal,
    addIRStruct,
    addIREnum,

    // Function building
    makeIRFunction,
    makeIRParam,
    addIRBlock,
    addIRLocal,
    makeIRBlock,
    addIRBlockParam,
    addIRInstruction,
    setIRTerminator,
    addPredecessor,
    addSuccessor,
    makeIRLocal,

    // Visitor helpers
    visitIRType,
    visitIRInst,
    visitIRTerm,
};
