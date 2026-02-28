import {
    AllocaInst,
    BconstInst,
    BitcastInst,
    CallDynInst,
    CallInst,
    EnumCreateInst,
    EnumGetDataInst,
    EnumGetTagInst,
    FaddInst,
    FcmpInst,
    FconstInst,
    FdivInst,
    FmulInst,
    FnegInst,
    FptosiInst,
    FptouiInst,
    FsubInst,
    GepInst,
    IaddInst,
    IandInst,
    IcmpInst,
    IconstInst,
    IdivInst,
    ImodInst,
    ImulInst,
    InegInst,
    IorInst,
    IshlInst,
    IshrInst,
    IsubInst,
    IxorInst,
    LoadInst,
    MemcpyInst,
    NullInst,
    PtraddInst,
    SconstInst,
    SextInst,
    SitofpInst,
    StoreInst,
    StructCreateInst,
    StructGetInst,
    TruncInst,
    UitofpInst,
    ZextInst,
    FloatWidth,
    FloatType,
    IntType,
    IntWidth,
    makeIRFloatType,
    type FcmpOp,
    type FnType,
    type IcmpOp,
    type IRInst,
    type IRType,
    StructType,
    freshValueId,
    makeIREnumType,
    makeIRFnType,
    makeIRIntType,
    makeIRPtrType,
    makeIRStructType,
    makeIRUnitType,
} from "./ir";

function asIntType(type: IRType): IntType {
    if (type instanceof IntType) {
        return type;
    }
    return makeIRIntType(IntWidth.I32);
}

function asFloatType(type: IRType): FloatType {
    if (type instanceof FloatType) {
        return type;
    }
    return makeIRFloatType(FloatWidth.F64);
}

function asStructType(type: IRType): StructType {
    if (type instanceof StructType) {
        return type;
    }
    return makeIRStructType("__anon_struct", []);
}

function unknownEnumType(): ReturnType<typeof makeIREnumType> {
    return makeIREnumType("__anon_enum", []);
}

function callType(returnType: IRType): FnType {
    return makeIRFnType([], returnType);
}

export function makeIconst(value: number, width: IntWidth): IRInst {
    return new IconstInst(freshValueId(), makeIRIntType(width), value);
}

export function makeFconst(value: number, width: FloatWidth): IRInst {
    return new FconstInst(freshValueId(), makeIRFloatType(width), value);
}

export function makeBconst(value: boolean): IRInst {
    return new BconstInst(freshValueId(), value);
}

export function makeNull(type: IRType): IRInst {
    return new NullInst(freshValueId(), makeIRPtrType(type));
}

export function makeSconst(literalId: number): IRInst {
    return new SconstInst(freshValueId(), literalId);
}

export function makeIadd(a: number, b: number, width: IntWidth): IRInst {
    return new IaddInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIsub(a: number, b: number, width: IntWidth): IRInst {
    return new IsubInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeImul(a: number, b: number, width: IntWidth): IRInst {
    return new ImulInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIdiv(a: number, b: number, width: IntWidth): IRInst {
    return new IdivInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeImod(a: number, b: number, width: IntWidth): IRInst {
    return new ImodInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeFadd(a: number, b: number, width: FloatWidth): IRInst {
    return new FaddInst(freshValueId(), makeIRFloatType(width), a, b);
}

export function makeFsub(a: number, b: number, width: FloatWidth): IRInst {
    return new FsubInst(freshValueId(), makeIRFloatType(width), a, b);
}

export function makeFmul(a: number, b: number, width: FloatWidth): IRInst {
    return new FmulInst(freshValueId(), makeIRFloatType(width), a, b);
}

export function makeFdiv(a: number, b: number, width: FloatWidth): IRInst {
    return new FdivInst(freshValueId(), makeIRFloatType(width), a, b);
}

export function makeIneg(a: number, width: IntWidth): IRInst {
    return new InegInst(freshValueId(), makeIRIntType(width), a);
}

export function makeFneg(a: number, width: FloatWidth): IRInst {
    return new FnegInst(freshValueId(), makeIRFloatType(width), a);
}

export function makeIand(a: number, b: number, width: IntWidth): IRInst {
    return new IandInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIor(a: number, b: number, width: IntWidth): IRInst {
    return new IorInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIxor(a: number, b: number, width: IntWidth): IRInst {
    return new IxorInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIshl(a: number, b: number, width: IntWidth): IRInst {
    return new IshlInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIshr(a: number, b: number, width: IntWidth): IRInst {
    return new IshrInst(freshValueId(), makeIRIntType(width), a, b);
}

export function makeIcmp(op: IcmpOp, a: number, b: number): IRInst {
    return new IcmpInst(freshValueId(), op, a, b);
}

export function makeFcmp(op: FcmpOp, a: number, b: number): IRInst {
    return new FcmpInst(freshValueId(), op, a, b);
}

export function makeAlloca(type: IRType, _localId?: number): IRInst {
    return new AllocaInst(freshValueId(), type);
}

export function makeLoad(ptr: number, type: IRType): IRInst {
    return new LoadInst(freshValueId(), ptr, type);
}

export function makeStore(ptr: number, value: number, _type: IRType): IRInst {
    return new StoreInst(freshValueId(), value, ptr);
}

export function makeMemcpy(dest: number, src: number, size: number): IRInst {
    return new MemcpyInst(freshValueId(), dest, src, size);
}

export function makeGep(ptr: number, indices: number[], resultType: IRType): IRInst {
    return new GepInst(freshValueId(), ptr, indices, resultType);
}

export function makePtradd(ptr: number, offset: number): IRInst {
    return new PtraddInst(freshValueId(), ptr, offset);
}

export function makeTrunc(value: number, toType: IRType): IRInst {
    const target = asIntType(toType);
    return new TruncInst(freshValueId(), value, target, target);
}

export function makeSext(value: number, toType: IRType): IRInst {
    const target = asIntType(toType);
    return new SextInst(freshValueId(), value, target, target);
}

export function makeZext(value: number, toType: IRType): IRInst {
    const target = asIntType(toType);
    return new ZextInst(freshValueId(), value, target, target);
}

export function makeFptoui(value: number, toType: IRType): IRInst {
    const target = asIntType(toType);
    return new FptouiInst(freshValueId(), value, asFloatType(toType), target);
}

export function makeFptosi(value: number, toType: IRType): IRInst {
    const target = asIntType(toType);
    return new FptosiInst(freshValueId(), value, asFloatType(toType), target);
}

export function makeUitofp(value: number, toType: IRType): IRInst {
    const source = asIntType(toType);
    return new UitofpInst(freshValueId(), value, source, asFloatType(toType));
}

export function makeSitofp(value: number, toType: IRType): IRInst {
    const source = asIntType(toType);
    return new SitofpInst(freshValueId(), value, source, asFloatType(toType));
}

export function makeBitcast(value: number, toType: IRType): IRInst {
    return new BitcastInst(freshValueId(), value, makeIRIntType(IntWidth.I64), toType);
}

export function makeCall(
    fn: number,
    args: number[],
    returnType?: IRType,
): IRInst {
    const effectiveReturn = returnType ?? makeIRUnitType();
    return new CallInst(
        freshValueId(),
        fn,
        args,
        callType(effectiveReturn),
        effectiveReturn,
    );
}

export function makeCallDyn(
    fn: number,
    args: number[],
    returnType?: IRType,
): IRInst {
    const effectiveReturn = returnType ?? makeIRUnitType();
    return new CallDynInst(
        freshValueId(),
        fn,
        args,
        callType(effectiveReturn),
        effectiveReturn,
    );
}

export function makeStructCreate(fields: number[], type: IRType): IRInst {
    return new StructCreateInst(freshValueId(), fields, asStructType(type));
}

export function makeStructGet(
    struct: number,
    fieldIndex: number,
    fieldType: IRType,
): IRInst {
    return new StructGetInst(
        freshValueId(),
        struct,
        fieldIndex,
        makeIRStructType("__anon_struct", []),
        fieldType,
    );
}

export function makeEnumCreate(
    variant: number,
    data: number | null,
    type: IRType,
): IRInst {
    const enumType = type instanceof StructType ? unknownEnumType() : unknownEnumType();
    return new EnumCreateInst(freshValueId(), variant, data, enumType);
}

export function makeEnumGetTag(enumValue: number): IRInst {
    return new EnumGetTagInst(freshValueId(), enumValue, unknownEnumType());
}

export function makeEnumGetData(
    enumValue: number,
    _variant: number,
    _index: number,
    dataType: IRType,
): IRInst {
    return new EnumGetDataInst(
        freshValueId(),
        enumValue,
        unknownEnumType(),
        dataType,
    );
}
