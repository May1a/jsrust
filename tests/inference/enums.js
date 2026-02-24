import { TypeContext } from "../../src/type_context";
import { inferModule, inferMatch, checkPattern } from "../../src/inference";
import { NodeKind, LiteralKind, Mutability } from "../../src/ast";
import { TypeKind, IntWidth, makeIntType, makeEnumType } from "../../src/types";
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

function makeEnumItem(name, variants) {
  return {
    kind: NodeKind.EnumItem,
    span: makeSpan(),
    name,
    generics: null,
    variants,
  };
}

function makeEnumVariant(name, fields = null, discriminant = null) {
  return {
    kind: NodeKind.EnumVariant,
    span: makeSpan(),
    name,
    fields,
    discriminant,
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

function makeIdentPat(name, mutable = false) {
  return {
    kind: NodeKind.IdentPat,
    span: makeSpan(),
    name,
    mutability: mutable ? Mutability.Mutable : Mutability.Immutable,
    isRef: false,
    ty: null,
  };
}

function makeMatchExpr(scrutinee, arms) {
  return {
    kind: NodeKind.MatchExpr,
    span: makeSpan(),
    scrutinee,
    arms,
  };
}

function makeMatchArm(pat, body, guard = null) {
  return {
    kind: NodeKind.MatchArm,
    span: makeSpan(),
    pat,
    guard,
    body,
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

// Test enum definition
testGroup("Enum Definition", () => {
  assert("register enum", () => {
    const ctx = new TypeContext();
    const variants = [makeEnumVariant("A"), makeEnumVariant("B")];
    const enumItem = makeEnumItem("MyEnum", variants);
    const result = ctx.registerEnum("MyEnum", enumItem);
    assert(result.ok);

    const item = ctx.lookupItem("MyEnum");
    assert(item !== null);
    assertEq(item.kind, "enum");
  });

  assert("duplicate enum fails", () => {
    const ctx = new TypeContext();
    const variants = [makeEnumVariant("A")];
    const enumItem = makeEnumItem("MyEnum", variants);
    ctx.registerEnum("MyEnum", enumItem);
    const result = ctx.registerEnum("MyEnum", enumItem);
    assert(!result.ok);
  });
});

// Test match expression
testGroup("Match Expression Inference", () => {
  assert("simple match on enum", () => {
    const ctx = new TypeContext();

    // Register enum
    const variants = [makeEnumVariant("A"), makeEnumVariant("B")];
    const enumItem = makeEnumItem("MyEnum", variants);
    ctx.registerEnum("MyEnum", enumItem);

    // Bind variable of enum type
    const enumType = makeEnumType("MyEnum", [{ name: "A" }, { name: "B" }]);
    ctx.defineVar("e", enumType);

    // Create match expression
    const scrutinee = makeIdentifierExpr("e");
    const arms = [
      makeMatchArm(
        makeIdentPat("_"),
        makeLiteralExpr(LiteralKind.Int, 1, "1"),
      ),
      makeMatchArm(
        makeIdentPat("_"),
        makeLiteralExpr(LiteralKind.Int, 2, "2"),
      ),
    ];
    const matchExpr = makeMatchExpr(scrutinee, arms);

    const result = inferMatch(ctx, matchExpr);
    assert(result.ok);
    assertEq(result.type.kind, TypeKind.Int);
  });

  assert("match with mismatched arm types fails", () => {
    const ctx = new TypeContext();

    const enumType = makeEnumType("MyEnum", [{ name: "A" }, { name: "B" }]);
    ctx.defineVar("e", enumType);

    const scrutinee = makeIdentifierExpr("e");
    const arms = [
      makeMatchArm(
        makeIdentPat("_"),
        makeLiteralExpr(LiteralKind.Int, 1, "1"),
      ),
      makeMatchArm(
        makeIdentPat("_"),
        makeLiteralExpr(LiteralKind.Bool, true, "true"),
      ),
    ];
    const matchExpr = makeMatchExpr(scrutinee, arms);

    const result = inferMatch(ctx, matchExpr);
    assert(!result.ok);
  });
});

console.log("Enum inference tests complete");

export function runInferenceEnumsTests() {
  // Tests are run via testGroup/assert
  return 6; // Number of tests
}
