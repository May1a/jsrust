import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";
import { TypeContext } from "../../type_context.js";
import {
    makeIntType,
    makeBoolType,
    makeUnitType,
    makeFnType,
    TypeKind,
} from "../../types.js";

// ============================================================================
// Task 3.6: Type Context
// ============================================================================

test("TypeContext creates with root scope", () => {
    const ctx = new TypeContext();
    assertTrue(ctx.currentScope !== null);
    assertTrue(ctx.currentScope.parent === null);
});

test("TypeContext initializes empty items map", () => {
    const ctx = new TypeContext();
    assertEqual(ctx.items.size, 0);
});

test("TypeContext initializes empty type aliases map", () => {
    const ctx = new TypeContext();
    assertEqual(ctx.typeAliases.size, 0);
});

// ============================================================================
// Task 3.7: Scope Management
// ============================================================================

test("pushScope creates new nested scope", () => {
    const ctx = new TypeContext();
    const rootScope = ctx.currentScope;
    ctx.pushScope();
    assertTrue(ctx.currentScope !== rootScope);
    assertTrue(ctx.currentScope.parent === rootScope);
});

test("popScope returns to parent scope", () => {
    const ctx = new TypeContext();
    const rootScope = ctx.currentScope;
    ctx.pushScope();
    ctx.popScope();
    assertTrue(ctx.currentScope === rootScope);
});

test("popScope fails on root scope", () => {
    const ctx = new TypeContext();
    const result = ctx.popScope();
    assertTrue(!result.ok);
    assertTrue(result.error !== undefined);
});

test("defineVar adds binding to current scope", () => {
    const ctx = new TypeContext();
    const type = makeIntType(2); // I32
    const result = ctx.defineVar("x", type);
    assertTrue(result.ok);
    const binding = ctx.lookupVar("x");
    assertTrue(binding !== null);
    assertEqual(binding.name, "x");
    assertTrue(binding.type === type);
});

test("defineVar rejects duplicate in same scope", () => {
    const ctx = new TypeContext();
    ctx.defineVar("x", makeIntType(2));
    const result = ctx.defineVar("x", makeBoolType());
    assertTrue(!result.ok);
});

test("defineVar allows shadowing in nested scope", () => {
    const ctx = new TypeContext();
    ctx.defineVar("x", makeIntType(2));
    ctx.pushScope();
    const result = ctx.defineVar("x", makeBoolType());
    assertTrue(result.ok);
});

test("lookupVar finds variable in parent scope", () => {
    const ctx = new TypeContext();
    ctx.defineVar("x", makeIntType(2));
    ctx.pushScope();
    const binding = ctx.lookupVar("x");
    assertTrue(binding !== null);
    assertEqual(
        binding.kind === undefined ? binding.type.kind : binding.kind,
        TypeKind.Int,
    );
});

test("lookupVar returns null for undefined variable", () => {
    const ctx = new TypeContext();
    const binding = ctx.lookupVar("unknown");
    assertTrue(binding === null);
});

test("varInCurrentScope checks only current scope", () => {
    const ctx = new TypeContext();
    ctx.defineVar("x", makeIntType(2));
    ctx.pushScope();
    assertTrue(!ctx.varInCurrentScope("x"));
    ctx.defineVar("y", makeBoolType());
    assertTrue(ctx.varInCurrentScope("y"));
});

test("getCurrentScopeBindings returns all bindings", () => {
    const ctx = new TypeContext();
    ctx.defineVar("x", makeIntType(2));
    ctx.defineVar("y", makeBoolType());
    const bindings = ctx.getCurrentScopeBindings();
    assertEqual(bindings.length, 2);
});

// ============================================================================
// Task 3.8: Item Registry
// ============================================================================

test("registerStruct adds struct item", () => {
    const ctx = new TypeContext();
    const result = ctx.registerStruct("Point", { kind: 26, name: "Point" });
    assertTrue(result.ok);
    const item = ctx.lookupItem("Point");
    assertTrue(item !== null);
    assertEqual(item.kind, "struct");
    assertEqual(item.name, "Point");
});

test("registerEnum adds enum item", () => {
    const ctx = new TypeContext();
    const result = ctx.registerEnum("Option", { kind: 27, name: "Option" });
    assertTrue(result.ok);
    const item = ctx.lookupItem("Option");
    assertTrue(item !== null);
    assertEqual(item.kind, "enum");
});

test("registerFn adds function item", () => {
    const ctx = new TypeContext();
    const fnType = makeFnType([], makeUnitType(), false);
    const result = ctx.registerFn("main", { kind: 25, name: "main" }, fnType);
    assertTrue(result.ok);
    const item = ctx.lookupItem("main");
    assertTrue(item !== null);
    assertEqual(item.kind, "fn");
    assertTrue(item.type === fnType);
});

test("registerMod adds module item", () => {
    const ctx = new TypeContext();
    const result = ctx.registerMod("utils", { kind: 28, name: "utils" });
    assertTrue(result.ok);
    const item = ctx.lookupItem("utils");
    assertTrue(item !== null);
    assertEqual(item.kind, "mod");
});

test("registerTypeAlias adds type alias", () => {
    const ctx = new TypeContext();
    const aliasType = makeIntType(2);
    const result = ctx.registerTypeAlias(
        "MyInt",
        { kind: 39, name: "MyInt" },
        aliasType,
    );
    assertTrue(result.ok);
    const resolved = ctx.lookupTypeAlias("MyInt");
    assertTrue(resolved === aliasType);
});

test("registerStruct rejects duplicate items", () => {
    const ctx = new TypeContext();
    ctx.registerStruct("Point", { kind: 26, name: "Point" });
    const result = ctx.registerStruct("Point", { kind: 26, name: "Point" });
    assertTrue(!result.ok);
});

test("hasItem checks item existence", () => {
    const ctx = new TypeContext();
    assertTrue(!ctx.hasItem("Point"));
    ctx.registerStruct("Point", { kind: 26, name: "Point" });
    assertTrue(ctx.hasItem("Point"));
});

test("getAllItems returns all registered items", () => {
    const ctx = new TypeContext();
    ctx.registerStruct("Point", { kind: 26, name: "Point" });
    ctx.registerEnum("Option", { kind: 27, name: "Option" });
    const items = ctx.getAllItems();
    assertEqual(items.length, 2);
});

// ============================================================================
// Function Tracking
// ============================================================================

test("setCurrentFn sets function context", () => {
    const ctx = new TypeContext();
    const fnType = makeFnType([], makeUnitType(), false);
    const retType = makeUnitType();
    ctx.setCurrentFn(fnType, retType);
    assertTrue(ctx.currentFn === fnType);
    assertTrue(ctx.currentReturnType === retType);
});

test("clearCurrentFn clears function context", () => {
    const ctx = new TypeContext();
    const fnType = makeFnType([], makeUnitType(), false);
    ctx.setCurrentFn(fnType, makeUnitType());
    ctx.clearCurrentFn();
    assertTrue(ctx.currentFn === null);
    assertTrue(ctx.currentReturnType === null);
});

test("getCurrentReturnType returns current return type", () => {
    const ctx = new TypeContext();
    const retType = makeIntType(2);
    ctx.setCurrentFn(null, retType);
    assertTrue(ctx.getCurrentReturnType() === retType);
});

test("loop tracking enters and exits loop context", () => {
    const ctx = new TypeContext();
    assertTrue(ctx.currentLoop() === null);

    const breakType = makeIntType(2);
    ctx.enterLoop(true, breakType);
    const loop = ctx.currentLoop();
    assertTrue(loop !== null);
    assertTrue(loop.allowsBreakValue);
    assertTrue(loop.breakType === breakType);
    assertTrue(!loop.hasBreak);

    const exited = ctx.exitLoop();
    assertTrue(exited !== null);
    assertTrue(ctx.currentLoop() === null);
});

// ============================================================================
// Type Variable Management
// ============================================================================

test("freshTypeVar creates unique type variables", () => {
    const ctx = new TypeContext();
    const tv1 = ctx.freshTypeVar();
    const tv2 = ctx.freshTypeVar();
    assertEqual(tv1.kind, TypeKind.TypeVar);
    assertEqual(tv2.kind, TypeKind.TypeVar);
    assertTrue(tv1.id !== tv2.id);
});

test("bindTypeVar binds type variable to type", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    const boundType = makeIntType(2);
    const result = ctx.bindTypeVar(tv.id, boundType);
    assertTrue(result.ok);
    assertTrue(tv.bound === boundType);
});

test("bindTypeVar rejects already bound variable", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    ctx.bindTypeVar(tv.id, makeIntType(2));
    const result = ctx.bindTypeVar(tv.id, makeBoolType());
    assertTrue(!result.ok);
});

test("bindTypeVar rejects occurs check failure", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    // Try to bind tv to a type containing tv (e.g., &tv)
    const refType = { kind: TypeKind.Ref, inner: tv, mutable: false };
    const result = ctx.bindTypeVar(tv.id, refType);
    assertTrue(!result.ok);
    assertTrue(result.error?.includes("Occurs check"));
});

test("occursIn detects self-reference", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    assertTrue(ctx.occursIn(tv.id, tv));
});

test("occursIn detects nested reference", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    const refType = { kind: TypeKind.Ref, inner: tv, mutable: false };
    assertTrue(ctx.occursIn(tv.id, refType));
});

test("occursIn returns false for unrelated types", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    const otherType = makeIntType(2);
    assertTrue(!ctx.occursIn(tv.id, otherType));
});

test("resolveType follows type variable bindings", () => {
    const ctx = new TypeContext();
    const tv = ctx.freshTypeVar();
    const boundType = makeIntType(2);
    ctx.bindTypeVar(tv.id, boundType);
    const resolved = ctx.resolveType(tv);
    assertTrue(resolved === boundType);
});

test("resolveType returns unchanged non-type-var", () => {
    const ctx = new TypeContext();
    const t = makeIntType(2);
    const resolved = ctx.resolveType(t);
    assertTrue(resolved === t);
});

// ============================================================================
// Type Interning
// ============================================================================

test("internType returns same type for equal types", () => {
    const ctx = new TypeContext();
    const t1 = makeIntType(2);
    const t2 = makeIntType(2);
    const i1 = ctx.internType(t1);
    const i2 = ctx.internType(t2);
    assertTrue(i1 === i2);
});

test("internType returns different types for different types", () => {
    const ctx = new TypeContext();
    const t1 = makeIntType(2);
    const t2 = makeBoolType();
    const i1 = ctx.internType(t1);
    const i2 = ctx.internType(t2);
    assertTrue(i1 !== i2);
});

test("typeToKey generates unique keys", () => {
    const ctx = new TypeContext();
    const k1 = ctx.typeToKey(makeIntType(2));
    const k2 = ctx.typeToKey(makeIntType(3));
    const k3 = ctx.typeToKey(makeBoolType());
    assertTrue(k1 !== k2);
    assertTrue(k1 !== k3);
    assertTrue(k2 !== k3);
});

export function runTypeContextTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
