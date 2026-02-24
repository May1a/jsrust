import { TypeContext } from "../../src/type_context";
import { inferModule, inferStructExpr, inferField } from "../../src/inference";
import { NodeKind, LiteralKind, Mutability } from "../../src/ast";
import {
  TypeKind,
  IntWidth,
  makeIntType,
  makeStructType,
} from "../../src/types";
import { assert, assertEq, testGroup } from "../lib";

function makeSpan(line = 1, column = 1, start = 0, end = 0) {
  return { line, column, start, end };
}

function makeLiteralExpr(kind, value, raw) {
  return {
    kind: NodeKind.LiteralExpr,
    span: makeSpan(),
    literalKind: kind,
    value,
    raw,
  };
}

function makeIdentifierExpr(name) {
  return {
    kind: NodeKind.IdentifierExpr,
    span: makeSpan(),
    name,
  };
}

function makeStructItem(name, fields, isTuple = false) {
  return {
    kind: NodeKind.StructItem,
    span: makeSpan(),
    name,
    generics: null,
    fields,
    isTuple,
  };
}

function makeStructField(name, ty, defaultValue = null) {
  return {
    kind: NodeKind.StructField,
    span: makeSpan(),
    name,
    ty,
    defaultValue,
  };
}

function makeNamedType(name) {
  return {
    kind: NodeKind.NamedType,
    span: makeSpan(),
    name,
    args: null,
  };
}

function makeStructExpr(path, fields, spread = null) {
  return {
    kind: NodeKind.StructExpr,
    span: makeSpan(),
    path,
    fields,
    spread,
  };
}

function makeFieldExpr(receiver, field) {
  return {
    kind: NodeKind.FieldExpr,
    span: makeSpan(),
    receiver,
    field,
  };
}

function makeModule(name, items) {
  return {
    kind: NodeKind.Module,
    span: makeSpan(),
    name,
    items,
  };
}

// Test struct definition
testGroup("Struct Definition", () => {
  assert("register struct", () => {
    const ctx = new TypeContext();
    const fields = [
      makeStructField("x", makeNamedType("i32")),
      makeStructField("y", makeNamedType("i32")),
    ];
    const struct = makeStructItem("Point", fields);
    const result = ctx.registerStruct("Point", struct);
    assert(result.ok);

    const item = ctx.lookupItem("Point");
    assert(item !== null);
    assertEq(item.kind, "struct");
  });

  assert("duplicate struct fails", () => {
    const ctx = new TypeContext();
    const fields = [makeStructField("x", makeNamedType("i32"))];
    const struct = makeStructItem("Point", fields);
    ctx.registerStruct("Point", struct);
    const result = ctx.registerStruct("Point", struct);
    assert(!result.ok);
  });
});

// Test struct expression inference
testGroup("Struct Expression Inference", () => {
  assert("struct instantiation", () => {
    const ctx = new TypeContext();

    // Register struct
    const fields = [
      makeStructField("x", makeNamedType("i32")),
      makeStructField("y", makeNamedType("i32")),
    ];
    const struct = makeStructItem("Point", fields);
    ctx.registerStruct("Point", struct);

    // Create struct expression
    const path = makeIdentifierExpr("Point");
    const structExpr = makeStructExpr(path, [
      {
        name: "x",
        value: makeLiteralExpr(LiteralKind.Int, 1, "1"),
        span: makeSpan(),
      },
      {
        name: "y",
        value: makeLiteralExpr(LiteralKind.Int, 2, "2"),
        span: makeSpan(),
      },
    ]);

    const result = inferStructExpr(ctx, structExpr);
    assert(result.ok);
    assertEq(result.type.kind, TypeKind.Struct);
    assertEq(result.type.name, "Point");
  });

  assert("missing field fails", () => {
    const ctx = new TypeContext();

    const fields = [
      makeStructField("x", makeNamedType("i32")),
      makeStructField("y", makeNamedType("i32")),
    ];
    const struct = makeStructItem("Point", fields);
    ctx.registerStruct("Point", struct);

    const path = makeIdentifierExpr("Point");
    const structExpr = makeStructExpr(path, [
      {
        name: "x",
        value: makeLiteralExpr(LiteralKind.Int, 1, "1"),
        span: makeSpan(),
      },
    ]);

    const result = inferStructExpr(ctx, structExpr);
    assert(!result.ok);
  });
});

// Test field access
testGroup("Field Access Inference", () => {
  assert("field access on struct", () => {
    const ctx = new TypeContext();

    const fields = [
      makeStructField("x", makeNamedType("i32")),
      makeStructField("y", makeNamedType("i32")),
    ];
    const struct = makeStructItem("Point", fields);
    ctx.registerStruct("Point", struct);

    // Bind a variable of struct type
    const pointType = makeStructType("Point", [
      { name: "x", type: { kind: TypeKind.Int, width: IntWidth.I32 } },
      { name: "y", type: { kind: TypeKind.Int, width: IntWidth.I32 } },
    ]);
    ctx.defineVar("p", pointType);

    const receiver = makeIdentifierExpr("p");
    const fieldExpr = makeFieldExpr(receiver, "x");

    const result = inferField(ctx, fieldExpr);
    assert(result.ok);
    assertEq(result.type.kind, TypeKind.Int);
  });
});

console.log("Struct inference tests complete");

export function runInferenceStructsTests() {
  return 5; // Number of tests
}
