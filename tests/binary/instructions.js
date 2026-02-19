import { serializeModule } from "../../ir_serialize.js";
import { deserializeModule } from "../../ir_deserialize.js";
import {
    IRTypeKind,
    IRInstKind,
    IRTermKind,
    resetIRIds,
    makeIRModule,
    makeIRIntType,
    makeIRFloatType,
    makeIRBoolType,
    makeIRPtrType,
    makeIRUnitType,
    makeIRStructType,
    makeIREnumType,
} from "../../ir.js";
import { IntWidth, FloatWidth } from "../../types.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

// Helper to create a minimal function with instructions
function createModuleWithInstructions(instructions, returnType = null) {
    resetIRIds();
    const module = makeIRModule("test");
    const fn = {
        id: 0,
        name: "test_fn",
        params: [],
        returnType: returnType || makeIRUnitType(),
        blocks: [
            {
                id: 0,
                params: [],
                instructions: instructions,
                terminator: { kind: IRTermKind.Ret, value: null },
                predecessors: [],
                successors: [],
            },
        ],
        locals: [],
        entry: null,
    };
    module.functions.push(fn);
    return module;
}

test("Serialize and deserialize Iconst instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Iconst,
            id: 0,
            ty: makeIRIntType(IntWidth.I32),
            value: BigInt(42),
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Iconst);
    assertEqual(inst.value, BigInt(42));
});

test("Serialize and deserialize Iconst with negative value", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Iconst,
            id: 0,
            ty: makeIRIntType(IntWidth.I64),
            value: BigInt(-123456789),
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.value, BigInt(-123456789));
});

test("Serialize and deserialize Fconst instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Fconst,
            id: 0,
            ty: makeIRFloatType(FloatWidth.F64),
            value: 3.141592653589793,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Fconst);
    assertEqual(inst.value, 3.141592653589793);
});

test("Serialize and deserialize Bconst instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Bconst,
            id: 0,
            ty: makeIRBoolType(),
            value: true,
        },
        {
            kind: IRInstKind.Bconst,
            id: 1,
            ty: makeIRBoolType(),
            value: false,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const insts = result.value.functions[0].blocks[0].instructions;
    assertEqual(insts[0].value, true);
    assertEqual(insts[1].value, false);
});

test("Serialize and deserialize Null instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Null,
            id: 0,
            ty: makeIRPtrType(null),
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Null);
});

test("Serialize and deserialize binary arithmetic instructions", () => {
    const binaryOps = [
        IRInstKind.Iadd,
        IRInstKind.Isub,
        IRInstKind.Imul,
        IRInstKind.Idiv,
        IRInstKind.Imod,
        IRInstKind.Fadd,
        IRInstKind.Fsub,
        IRInstKind.Fmul,
        IRInstKind.Fdiv,
        IRInstKind.Iand,
        IRInstKind.Ior,
        IRInstKind.Ixor,
        IRInstKind.Ishl,
        IRInstKind.Ishr,
    ];

    for (const op of binaryOps) {
        const module = createModuleWithInstructions([
            {
                kind: op,
                id: 0,
                ty: makeIRIntType(IntWidth.I32),
                a: 1,
                b: 2,
            },
        ]);

        const data = serializeModule(module);
        const result = deserializeModule(data);

        assertTrue(result.ok, `Failed for op ${op}`);
        const inst = result.value.functions[0].blocks[0].instructions[0];
        assertEqual(inst.kind, op, `Wrong opcode for op ${op}`);
        assertEqual(inst.a, 1, `Wrong operand a for op ${op}`);
        assertEqual(inst.b, 2, `Wrong operand b for op ${op}`);
    }
});

test("Serialize and deserialize unary instructions", () => {
    const unaryOps = [IRInstKind.Ineg, IRInstKind.Fneg];

    for (const op of unaryOps) {
        const module = createModuleWithInstructions([
            {
                kind: op,
                id: 0,
                ty:
                    op === IRInstKind.Ineg
                        ? makeIRIntType(IntWidth.I32)
                        : makeIRFloatType(FloatWidth.F64),
                a: 1,
            },
        ]);

        const data = serializeModule(module);
        const result = deserializeModule(data);

        assertTrue(result.ok, `Failed for op ${op}`);
        const inst = result.value.functions[0].blocks[0].instructions[0];
        assertEqual(inst.kind, op);
        assertEqual(inst.a, 1);
    }
});

test("Serialize and deserialize Icmp instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Icmp,
            id: 0,
            ty: makeIRBoolType(),
            op: 0, // Eq
            a: 1,
            b: 2,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Icmp);
    assertEqual(inst.op, 0);
    assertEqual(inst.a, 1);
    assertEqual(inst.b, 2);
});

test("Serialize and deserialize Fcmp instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Fcmp,
            id: 0,
            ty: makeIRBoolType(),
            op: 2, // Olt
            a: 1,
            b: 2,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Fcmp);
    assertEqual(inst.op, 2);
});

test("Serialize and deserialize Alloca instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Alloca,
            id: 0,
            ty: makeIRPtrType(makeIRIntType(IntWidth.I32)),
            localId: 0,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Alloca);
    assertEqual(inst.localId, 0);
});

test("Serialize and deserialize Load instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Load,
            id: 0,
            ty: makeIRIntType(IntWidth.I32),
            ptr: 1,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Load);
    assertEqual(inst.ptr, 1);
});

test("Serialize and deserialize Store instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Store,
            id: null,
            ty: makeIRUnitType(),
            ptr: 0,
            value: 1,
            valueType: makeIRIntType(IntWidth.I32),
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Store);
    assertEqual(inst.ptr, 0);
    assertEqual(inst.value, 1);
    assertEqual(inst.valueType.kind, IRTypeKind.Int);
});

test("Serialize and deserialize Gep instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Gep,
            id: 0,
            ty: makeIRPtrType(makeIRIntType(IntWidth.I32)),
            ptr: 1,
            indices: [0, 1, 2],
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Gep);
    assertEqual(inst.indices.length, 3);
    assertEqual(inst.indices[0], 0);
    assertEqual(inst.indices[1], 1);
    assertEqual(inst.indices[2], 2);
});

test("Serialize and deserialize Call instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.Call,
            id: 0,
            ty: makeIRIntType(IntWidth.I32),
            fn: 0,
            args: [1, 2, 3],
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.Call);
    assertEqual(inst.fn, 0);
    assertEqual(inst.args.length, 3);
});

test("Serialize and deserialize StructCreate instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.StructCreate,
            id: 0,
            ty: makeIRStructType("Point", []),
            fields: [1, 2],
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.StructCreate);
    assertEqual(inst.fields.length, 2);
});

test("Serialize and deserialize StructGet instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.StructGet,
            id: 0,
            ty: makeIRIntType(IntWidth.I32),
            struct: 1,
            fieldIndex: 0,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.StructGet);
    assertEqual(inst.struct, 1);
    assertEqual(inst.fieldIndex, 0);
});

test("Serialize and deserialize EnumCreate instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.EnumCreate,
            id: 0,
            ty: makeIREnumType("Option", []),
            variant: 1,
            data: 5,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.EnumCreate);
    assertEqual(inst.variant, 1);
    assertEqual(inst.data, 5);
});

test("Serialize and deserialize EnumCreate without data", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.EnumCreate,
            id: 0,
            ty: makeIREnumType("Option", []),
            variant: 0,
            data: null,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.EnumCreate);
    assertEqual(inst.variant, 0);
    assertEqual(inst.data, null);
});

test("Serialize and deserialize EnumGetTag instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.EnumGetTag,
            id: 0,
            ty: makeIRIntType(IntWidth.U8),
            enum: 1,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.EnumGetTag);
    assertEqual(inst.enum, 1);
});

test("Serialize and deserialize EnumGetData instruction", () => {
    const module = createModuleWithInstructions([
        {
            kind: IRInstKind.EnumGetData,
            id: 0,
            ty: makeIRIntType(IntWidth.I32),
            enum: 1,
            variant: 1,
            index: 0,
        },
    ]);

    const data = serializeModule(module);
    const result = deserializeModule(data);

    assertTrue(result.ok);
    const inst = result.value.functions[0].blocks[0].instructions[0];
    assertEqual(inst.kind, IRInstKind.EnumGetData);
    assertEqual(inst.enum, 1);
    assertEqual(inst.variant, 1);
    assertEqual(inst.index, 0);
});

test("Serialize and deserialize conversion instructions", () => {
    const convOps = [
        IRInstKind.Trunc,
        IRInstKind.Sext,
        IRInstKind.Zext,
        IRInstKind.Fptoui,
        IRInstKind.Fptosi,
        IRInstKind.Uitofp,
        IRInstKind.Sitofp,
        IRInstKind.Bitcast,
    ];

    for (const op of convOps) {
        const needsFromTy = [
            IRInstKind.Trunc,
            IRInstKind.Sext,
            IRInstKind.Zext,
        ].includes(op);
        const inst = {
            kind: op,
            id: 0,
            ty: makeIRIntType(IntWidth.I32),
            val: 1,
        };
        if (needsFromTy) {
            inst.fromTy = makeIRIntType(IntWidth.I64);
        }

        const module = createModuleWithInstructions([inst]);
        const data = serializeModule(module);
        const result = deserializeModule(data);

        assertTrue(result.ok, `Failed for op ${op}`);
        const deserializedInst =
            result.value.functions[0].blocks[0].instructions[0];
        assertEqual(deserializedInst.kind, op, `Wrong opcode for op ${op}`);
        assertEqual(deserializedInst.val, 1, `Wrong val for op ${op}`);
    }
});

export function runInstructionsTests() {
    const result = getResults();
    clearErrors();
    return 20;
}
