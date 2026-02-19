import { assertEqual, assertTrue } from "../lib.js";
import { lowerHirToSsa } from "../../hir_to_ssa.js";
import {
    makeHFnDecl,
    makeHParam,
    makeHBlock,
    makeHLetStmt,
    makeHExprStmt,
    makeHReturnStmt,
    makeHBreakStmt,
    makeHContinueStmt,
    makeHUnitExpr,
    makeHLiteralExpr,
    makeHVarExpr,
    makeHBinaryExpr,
    makeHUnaryExpr,
    makeHCallExpr,
    makeHFieldExpr,
    makeHIndexExpr,
    makeHRefExpr,
    makeHDerefExpr,
    makeHStructExpr,
    makeHEnumExpr,
    makeHIfExpr,
    makeHMatchExpr,
    makeHLoopExpr,
    makeHWhileExpr,
    makeHIdentPat,
    makeHWildcardPat,
    makeHLiteralPat,
    makeHMatchArm,
    HStmtKind,
    HExprKind,
    HLiteralKind,
} from "../../hir.js";
import { IntWidth, FloatWidth, TypeKind } from "../../types.js";
import { BinaryOp, UnaryOp } from "../../ast.js";
import { IRInstKind } from "../../ir.js";

// Helper: create a span
function span(line = 1, column = 1) {
    return { line, column, start: 0, end: 0 };
}

// Helper: create a simple function with a body block
function createSimpleFn(
    name,
    bodyExpr,
    returnType = { kind: TypeKind.Int, width: IntWidth.I32 },
) {
    const block = makeHBlock(span(), [], bodyExpr, returnType);
    return makeHFnDecl(
        span(),
        name,
        null, // generics
        [], // params
        returnType,
        block,
        false, // isAsync
        false, // isUnsafe
    );
}

// Helper: create an integer type
function intType(width = IntWidth.I32) {
    return { kind: TypeKind.Int, width };
}

// Helper: create a float type
function floatType(width = FloatWidth.F64) {
    return { kind: TypeKind.Float, width };
}

// Helper: create a bool type
function boolType() {
    return { kind: TypeKind.Bool };
}

// Helper: create a unit type
function unitType() {
    return { kind: TypeKind.Unit };
}

export function testLowerLiteral() {
    const lit = makeHLiteralExpr(span(), HLiteralKind.Int, 42, intType());
    const fn = createSimpleFn("test_literal", lit);

    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null, "IR function should not be null");
    assertEqual(irFn.blocks.length, 1, "Should have one block");
    // There should be at least one instruction (iconst) plus terminator
    assertTrue(
        irFn.blocks[0].instructions.length >= 1,
        "Should have at least one instruction",
    );
}

export function testLowerBinaryAdd() {
    const left = makeHLiteralExpr(span(), HLiteralKind.Int, 2, intType());
    const right = makeHLiteralExpr(span(), HLiteralKind.Int, 3, intType());
    const add = makeHBinaryExpr(span(), BinaryOp.Add, left, right, intType());

    const fn = createSimpleFn("test_add", add);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null, "IR function should not be null");
    // Should have instructions for both literals and the iadd
    assertEqual(
        irFn.blocks[0].instructions.length,
        3,
        "Should have 3 instructions (2 iconst + 1 iadd)",
    );
}

export function testLowerBinarySub() {
    const left = makeHLiteralExpr(span(), HLiteralKind.Int, 10, intType());
    const right = makeHLiteralExpr(span(), HLiteralKind.Int, 3, intType());
    const sub = makeHBinaryExpr(span(), BinaryOp.Sub, left, right, intType());

    const fn = createSimpleFn("test_sub", sub);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Check for isub instruction
    const hasIsub = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Isub,
    );
    assertTrue(hasIsub, "Should have isub instruction");
}

export function testLowerBinaryMul() {
    const left = makeHLiteralExpr(span(), HLiteralKind.Int, 4, intType());
    const right = makeHLiteralExpr(span(), HLiteralKind.Int, 5, intType());
    const mul = makeHBinaryExpr(span(), BinaryOp.Mul, left, right, intType());

    const fn = createSimpleFn("test_mul", mul);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasImul = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Imul,
    );
    assertTrue(hasImul, "Should have imul instruction");
}

export function testLowerBinaryDiv() {
    const left = makeHLiteralExpr(span(), HLiteralKind.Int, 20, intType());
    const right = makeHLiteralExpr(span(), HLiteralKind.Int, 4, intType());
    const div = makeHBinaryExpr(span(), BinaryOp.Div, left, right, intType());

    const fn = createSimpleFn("test_div", div);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasIdiv = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Idiv,
    );
    assertTrue(hasIdiv, "Should have idiv instruction");
}

export function testLowerBinaryComparison() {
    const left = makeHLiteralExpr(span(), HLiteralKind.Int, 5, intType());
    const right = makeHLiteralExpr(span(), HLiteralKind.Int, 3, intType());
    const lt = makeHBinaryExpr(span(), BinaryOp.Lt, left, right, boolType());

    const fn = createSimpleFn("test_lt", lt, boolType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasIcmp = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Icmp,
    );
    assertTrue(hasIcmp, "Should have icmp instruction");
}

export function testLowerVar() {
    // fn test_var(x: i32) -> i32 { x }
    const paramPat = makeHIdentPat(span(), "x", 0, intType(), false, false);
    const param = makeHParam(span(), "x", intType(), paramPat);

    const varExpr = makeHVarExpr(span(), "x", 0, intType());
    const block = makeHBlock(span(), [], varExpr, intType());

    const fn = makeHFnDecl(
        span(),
        "test_var",
        null,
        [param],
        intType(),
        block,
        false,
        false,
    );

    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Variable use should work
}

export function testLowerIf() {
    // if true { 1 } else { 0 }
    const cond = makeHLiteralExpr(span(), HLiteralKind.Bool, true, boolType());
    const thenBlock = makeHBlock(
        span(),
        [],
        makeHLiteralExpr(span(), HLiteralKind.Int, 1, intType()),
        intType(),
    );
    const elseBlock = makeHBlock(
        span(),
        [],
        makeHLiteralExpr(span(), HLiteralKind.Int, 0, intType()),
        intType(),
    );
    const ifExpr = makeHIfExpr(span(), cond, thenBlock, elseBlock, intType());

    const fn = createSimpleFn("test_if", ifExpr);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have created then, else, and merge blocks
    assertTrue(
        irFn.blocks.length >= 3,
        "Should have at least 3 blocks (then, else, merge)",
    );
}

export function testLowerIfWithoutElse() {
    // if true { 1 }
    const cond = makeHLiteralExpr(span(), HLiteralKind.Bool, true, boolType());
    const thenBlock = makeHBlock(
        span(),
        [],
        makeHLiteralExpr(span(), HLiteralKind.Int, 1, intType()),
        intType(),
    );
    const ifExpr = makeHIfExpr(span(), cond, thenBlock, null, unitType());

    const fn = createSimpleFn("test_if_no_else", ifExpr, unitType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have created then and merge blocks
    assertTrue(irFn.blocks.length >= 2, "Should have at least 2 blocks");
}

export function testLowerWhile() {
    // while true { break; }
    const cond = makeHLiteralExpr(span(), HLiteralKind.Bool, true, boolType());
    const body = makeHBlock(
        span(),
        [makeHBreakStmt(span(), null, null)],
        null,
        unitType(),
    );
    const whileExpr = makeHWhileExpr(span(), null, cond, body, unitType());

    const fn = createSimpleFn("test_while", whileExpr, unitType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    assertTrue(
        irFn.blocks.length >= 3,
        "Should have at least 3 blocks (header, body, exit)",
    );
}

export function testLowerLoop() {
    // loop { break; }
    const body = makeHBlock(
        span(),
        [makeHBreakStmt(span(), null, null)],
        null,
        unitType(),
    );
    const loopExpr = makeHLoopExpr(span(), null, body, unitType());

    const fn = createSimpleFn("test_loop", loopExpr, unitType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    assertTrue(
        irFn.blocks.length >= 2,
        "Should have at least 2 blocks (header, exit)",
    );
}

export function testLowerCall() {
    // foo()
    const callee = makeHVarExpr(span(), "foo", -1, {
        kind: TypeKind.Fn,
        params: [],
        returnType: intType(),
    });
    const callExpr = makeHCallExpr(span(), callee, [], intType());

    const fn = createSimpleFn("test_call", callExpr);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have a call instruction
    let hasCall = false;
    for (const block of irFn.blocks) {
        for (const inst of block.instructions) {
            if (inst.kind === IRInstKind.Call) {
                hasCall = true;
                break;
            }
        }
    }
    assertTrue(hasCall, "Should have call instruction");
}

export function testLowerCallWithArgs() {
    // foo(1, 2)
    const callee = makeHVarExpr(span(), "foo", -1, {
        kind: TypeKind.Fn,
        params: [intType(), intType()],
        returnType: intType(),
    });
    const arg1 = makeHLiteralExpr(span(), HLiteralKind.Int, 1, intType());
    const arg2 = makeHLiteralExpr(span(), HLiteralKind.Int, 2, intType());
    const callExpr = makeHCallExpr(span(), callee, [arg1, arg2], intType());

    const fn = createSimpleFn("test_call_args", callExpr);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasCall = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Call,
    );
    assertTrue(hasCall, "Should have call instruction");
}

export function testLowerStruct() {
    // Point { x: 1, y: 2 }
    const fields = [
        {
            name: "x",
            value: makeHLiteralExpr(span(), HLiteralKind.Int, 1, intType()),
        },
        {
            name: "y",
            value: makeHLiteralExpr(span(), HLiteralKind.Int, 2, intType()),
        },
    ];
    const structTy = {
        kind: TypeKind.Struct,
        name: "Point",
        fields: [
            { name: "x", type: intType() },
            { name: "y", type: intType() },
        ],
    };
    const structExpr = makeHStructExpr(span(), "Point", fields, null, structTy);

    const fn = createSimpleFn("test_struct", structExpr, structTy);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have structCreate
    const hasStructCreate = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.StructCreate,
    );
    assertTrue(hasStructCreate, "Should have structCreate instruction");
}

export function testLowerEnum() {
    // Option::Some(42)
    const data = makeHLiteralExpr(span(), HLiteralKind.Int, 42, intType());
    const enumTy = {
        kind: TypeKind.Enum,
        name: "Option",
        variants: [
            { name: "Some", fields: [intType()] },
            { name: "None", fields: [] },
        ],
    };
    const enumExpr = makeHEnumExpr(span(), "Option", "Some", 0, [data], enumTy);

    const fn = createSimpleFn("test_enum", enumExpr, enumTy);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have enumCreate
    const hasEnumCreate = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.EnumCreate,
    );
    assertTrue(hasEnumCreate, "Should have enumCreate instruction");
}

export function testLowerUnaryNeg() {
    const operand = makeHLiteralExpr(span(), HLiteralKind.Int, 42, intType());
    const negExpr = makeHUnaryExpr(span(), UnaryOp.Neg, operand, intType());

    const fn = createSimpleFn("test_neg", negExpr);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have ineg instruction
    const hasIneg = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Ineg,
    );
    assertTrue(hasIneg, "Should have ineg instruction");
}

export function testLowerUnaryNot() {
    const operand = makeHLiteralExpr(
        span(),
        HLiteralKind.Bool,
        true,
        boolType(),
    );
    const notExpr = makeHUnaryExpr(span(), UnaryOp.Not, operand, boolType());

    const fn = createSimpleFn("test_not", notExpr, boolType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Not is implemented as xor with true
    const hasXor = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Ixor,
    );
    assertTrue(hasXor, "Should have ixor instruction for not");
}

export function testLowerFloatLiteral() {
    const lit = makeHLiteralExpr(span(), HLiteralKind.Float, 3.14, floatType());
    const fn = createSimpleFn("test_float", lit, floatType());

    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasFconst = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Fconst,
    );
    assertTrue(hasFconst, "Should have fconst instruction");
}

export function testLowerFloatAdd() {
    const left = makeHLiteralExpr(span(), HLiteralKind.Float, 1.5, floatType());
    const right = makeHLiteralExpr(
        span(),
        HLiteralKind.Float,
        2.5,
        floatType(),
    );
    const add = makeHBinaryExpr(span(), BinaryOp.Add, left, right, floatType());

    const fn = createSimpleFn("test_fadd", add, floatType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasFadd = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Fadd,
    );
    assertTrue(hasFadd, "Should have fadd instruction");
}

export function testLowerLetStmt() {
    // fn test() { let x = 5; x }
    const init = makeHLiteralExpr(span(), HLiteralKind.Int, 5, intType());
    const pat = makeHIdentPat(span(), "x", 0, intType(), false, false);
    const letStmt = makeHLetStmt(span(), pat, intType(), init);

    const varExpr = makeHVarExpr(span(), "x", 0, intType());
    const block = makeHBlock(span(), [letStmt], varExpr, intType());

    const fn = makeHFnDecl(
        span(),
        "test_let",
        null,
        [],
        intType(),
        block,
        false,
        false,
    );

    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Should have iconst for the literal
    const hasIconst = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Iconst,
    );
    assertTrue(hasIconst, "Should have iconst instruction");
}

export function testLowerReturnStmt() {
    // fn test() { return 42; }
    const retVal = makeHLiteralExpr(span(), HLiteralKind.Int, 42, intType());
    const retStmt = makeHReturnStmt(span(), retVal);
    const block = makeHBlock(span(), [retStmt], null, intType());

    const fn = makeHFnDecl(
        span(),
        "test_return",
        null,
        [],
        intType(),
        block,
        false,
        false,
    );

    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    assertTrue(irFn.blocks[0].terminator !== null, "Should have terminator");
}

export function testLowerBitwiseOps() {
    // Test bitwise and
    const left = makeHLiteralExpr(span(), HLiteralKind.Int, 0xff, intType());
    const right = makeHLiteralExpr(span(), HLiteralKind.Int, 0x0f, intType());
    const andExpr = makeHBinaryExpr(
        span(),
        BinaryOp.BitAnd,
        left,
        right,
        intType(),
    );

    const fn = createSimpleFn("test_bitand", andExpr);
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    const hasIand = irFn.blocks[0].instructions.some(
        (i) => i.kind === IRInstKind.Iand,
    );
    assertTrue(hasIand, "Should have iand instruction");
}

export function testLowerMatchLiteral() {
    // match 1 { 1 => true, _ => false }
    const scrutinee = makeHLiteralExpr(span(), HLiteralKind.Int, 1, intType());
    const arm1Pat = makeHLiteralPat(span(), HLiteralKind.Int, 1, intType());
    const arm1Body = makeHBlock(
        span(),
        [],
        makeHLiteralExpr(span(), HLiteralKind.Bool, true, boolType()),
        boolType(),
    );
    const arm1 = makeHMatchArm(span(), arm1Pat, null, arm1Body);

    const arm2Pat = makeHWildcardPat(span(), intType());
    const arm2Body = makeHBlock(
        span(),
        [],
        makeHLiteralExpr(span(), HLiteralKind.Bool, false, boolType()),
        boolType(),
    );
    const arm2 = makeHMatchArm(span(), arm2Pat, null, arm2Body);

    const matchExpr = makeHMatchExpr(
        span(),
        scrutinee,
        [arm1, arm2],
        boolType(),
    );

    const fn = createSimpleFn("test_match", matchExpr, boolType());
    const irFn = lowerHirToSsa(fn);
    assertTrue(irFn !== null);
    // Match should create multiple blocks
    assertTrue(irFn.blocks.length >= 2, "Match should create multiple blocks");
}

export function runTests() {
    const tests = [
        ["Lower literal", testLowerLiteral],
        ["Lower binary add", testLowerBinaryAdd],
        ["Lower binary sub", testLowerBinarySub],
        ["Lower binary mul", testLowerBinaryMul],
        ["Lower binary div", testLowerBinaryDiv],
        ["Lower binary comparison", testLowerBinaryComparison],
        ["Lower var", testLowerVar],
        ["Lower if", testLowerIf],
        ["Lower if without else", testLowerIfWithoutElse],
        ["Lower while", testLowerWhile],
        ["Lower loop", testLowerLoop],
        ["Lower call", testLowerCall],
        ["Lower call with args", testLowerCallWithArgs],
        ["Lower struct", testLowerStruct],
        ["Lower enum", testLowerEnum],
        ["Lower unary neg", testLowerUnaryNeg],
        ["Lower unary not", testLowerUnaryNot],
        ["Lower float literal", testLowerFloatLiteral],
        ["Lower float add", testLowerFloatAdd],
        ["Lower let stmt", testLowerLetStmt],
        ["Lower return stmt", testLowerReturnStmt],
        ["Lower bitwise ops", testLowerBitwiseOps],
        ["Lower match literal", testLowerMatchLiteral],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, test] of tests) {
        try {
            test();
            passed++;
        } catch (e) {
            console.error(`  ✗ ${name}: ${e.message}`);
            failed++;
        }
    }

    return passed + failed;
}
