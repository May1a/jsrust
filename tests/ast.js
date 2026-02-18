import * as ast from "../ast.js";
import * as lib from "./lib.js";

const { test, assertEqual, assertTrue } = lib;

const {
    NodeKind,
    LiteralKind,
    BinaryOp,
    UnaryOp,
    Mutability,
    makeSpan,
    makeLiteralExpr,
    makeIdentifierExpr,
    makeBinaryExpr,
    makeUnaryExpr,
    makeCallExpr,
    makeFieldExpr,
    makeIndexExpr,
    makeAssignExpr,
    makeIfExpr,
    makeBlockExpr,
    makeReturnExpr,
    makeBreakExpr,
    makeContinueExpr,
    makeLoopExpr,
    makeWhileExpr,
    makeForExpr,
    makePathExpr,
    makeStructExpr,
    makeRangeExpr,
    makeRefExpr,
    makeDerefExpr,
    makeLetStmt,
    makeExprStmt,
    makeItemStmt,
    makeFnItem,
    makeStructItem,
    makeEnumItem,
    makeModItem,
    makeUseItem,
    makeIdentPat,
    makeWildcardPat,
    makeLiteralPat,
    makeRangePat,
    makeTuplePat,
    makeOrPat,
    makeBindingPat,
    makeMatchArm,
    makeMatchExpr,
    makeNamedType,
    makeTupleType,
    makeArrayType,
    makeRefType,
    makePtrType,
    makeFnType,
    makeGenericArgs,
    makeModule,
    isExpr,
    isStmt,
    isItem,
    isPat,
    isType,
} = ast;

export function runAstTests() {
    const span = makeSpan(1, 1, 0, 5);

    test("Span creation", () => {
        assertEqual(span.line, 1);
        assertEqual(span.column, 1);
        assertEqual(span.start, 0);
        assertEqual(span.end, 5);
    });

    test("LiteralExpr - integer", () => {
        const node = makeLiteralExpr(span, LiteralKind.Int, 42, "42");
        assertEqual(node.kind, NodeKind.LiteralExpr);
        assertEqual(node.literalKind, LiteralKind.Int);
        assertEqual(node.value, 42);
        assertEqual(node.raw, "42");
    });

    test("LiteralExpr - float", () => {
        const node = makeLiteralExpr(span, LiteralKind.Float, 3.14, "3.14");
        assertEqual(node.kind, NodeKind.LiteralExpr);
        assertEqual(node.literalKind, LiteralKind.Float);
        assertEqual(node.value, 3.14);
    });

    test("LiteralExpr - string", () => {
        const node = makeLiteralExpr(span, LiteralKind.String, "hello", '"hello"');
        assertEqual(node.kind, NodeKind.LiteralExpr);
        assertEqual(node.literalKind, LiteralKind.String);
        assertEqual(node.value, "hello");
    });

    test("LiteralExpr - bool", () => {
        const node = makeLiteralExpr(span, LiteralKind.Bool, true, "true");
        assertEqual(node.kind, NodeKind.LiteralExpr);
        assertEqual(node.literalKind, LiteralKind.Bool);
        assertEqual(node.value, true);
    });

    test("LiteralExpr - char", () => {
        const node = makeLiteralExpr(span, LiteralKind.Char, "a", "'a'");
        assertEqual(node.kind, NodeKind.LiteralExpr);
        assertEqual(node.literalKind, LiteralKind.Char);
        assertEqual(node.value, "a");
    });

    test("IdentifierExpr", () => {
        const node = makeIdentifierExpr(span, "foo");
        assertEqual(node.kind, NodeKind.IdentifierExpr);
        assertEqual(node.name, "foo");
    });

    test("BinaryExpr", () => {
        const left = makeLiteralExpr(span, LiteralKind.Int, 1, "1");
        const right = makeLiteralExpr(span, LiteralKind.Int, 2, "2");
        const node = makeBinaryExpr(span, BinaryOp.Add, left, right);
        assertEqual(node.kind, NodeKind.BinaryExpr);
        assertEqual(node.op, BinaryOp.Add);
        assertEqual(node.left, left);
        assertEqual(node.right, right);
    });

    test("UnaryExpr - not", () => {
        const operand = makeIdentifierExpr(span, "x");
        const node = makeUnaryExpr(span, UnaryOp.Not, operand);
        assertEqual(node.kind, NodeKind.UnaryExpr);
        assertEqual(node.op, UnaryOp.Not);
        assertEqual(node.operand, operand);
    });

    test("UnaryExpr - neg", () => {
        const operand = makeLiteralExpr(span, LiteralKind.Int, 5, "5");
        const node = makeUnaryExpr(span, UnaryOp.Neg, operand);
        assertEqual(node.kind, NodeKind.UnaryExpr);
        assertEqual(node.op, UnaryOp.Neg);
    });

    test("CallExpr", () => {
        const callee = makeIdentifierExpr(span, "foo");
        const args = [
            makeLiteralExpr(span, LiteralKind.Int, 1, "1"),
            makeLiteralExpr(span, LiteralKind.Int, 2, "2"),
        ];
        const node = makeCallExpr(span, callee, args);
        assertEqual(node.kind, NodeKind.CallExpr);
        assertEqual(node.callee, callee);
        assertEqual(node.args.length, 2);
    });

    test("FieldExpr", () => {
        const receiver = makeIdentifierExpr(span, "obj");
        const node = makeFieldExpr(span, receiver, "field");
        assertEqual(node.kind, NodeKind.FieldExpr);
        assertEqual(node.receiver, receiver);
        assertEqual(node.field, "field");
    });

    test("IndexExpr", () => {
        const receiver = makeIdentifierExpr(span, "arr");
        const index = makeLiteralExpr(span, LiteralKind.Int, 0, "0");
        const node = makeIndexExpr(span, receiver, index);
        assertEqual(node.kind, NodeKind.IndexExpr);
        assertEqual(node.receiver, receiver);
        assertEqual(node.index, index);
    });

    test("AssignExpr", () => {
        const target = makeIdentifierExpr(span, "x");
        const value = makeLiteralExpr(span, LiteralKind.Int, 42, "42");
        const node = makeAssignExpr(span, target, value);
        assertEqual(node.kind, NodeKind.AssignExpr);
        assertEqual(node.target, target);
        assertEqual(node.value, value);
    });

    test("IfExpr", () => {
        const cond = makeIdentifierExpr(span, "x");
        const thenBranch = makeBlockExpr(span, [], null);
        const elseBranch = makeBlockExpr(span, [], null);
        const node = makeIfExpr(span, cond, thenBranch, elseBranch);
        assertEqual(node.kind, NodeKind.IfExpr);
        assertEqual(node.condition, cond);
        assertEqual(node.thenBranch, thenBranch);
        assertEqual(node.elseBranch, elseBranch);
    });

    test("IfExpr without else", () => {
        const cond = makeIdentifierExpr(span, "x");
        const thenBranch = makeBlockExpr(span, [], null);
        const node = makeIfExpr(span, cond, thenBranch, null);
        assertEqual(node.kind, NodeKind.IfExpr);
        assertEqual(node.elseBranch, null);
    });

    test("BlockExpr", () => {
        const stmt = makeLetStmt(span, makeIdentPat(span, "x", Mutability.Immutable, false, null), null, null);
        const expr = makeIdentifierExpr(span, "x");
        const node = makeBlockExpr(span, [stmt], expr);
        assertEqual(node.kind, NodeKind.BlockExpr);
        assertEqual(node.stmts.length, 1);
        assertEqual(node.expr, expr);
    });

    test("BlockExpr without trailing expr", () => {
        const node = makeBlockExpr(span, [], null);
        assertEqual(node.kind, NodeKind.BlockExpr);
        assertEqual(node.stmts.length, 0);
        assertEqual(node.expr, null);
    });

    test("ReturnExpr", () => {
        const value = makeLiteralExpr(span, LiteralKind.Int, 42, "42");
        const node = makeReturnExpr(span, value);
        assertEqual(node.kind, NodeKind.ReturnExpr);
        assertEqual(node.value, value);
    });

    test("ReturnExpr without value", () => {
        const node = makeReturnExpr(span, null);
        assertEqual(node.kind, NodeKind.ReturnExpr);
        assertEqual(node.value, null);
    });

    test("BreakExpr", () => {
        const node = makeBreakExpr(span, null);
        assertEqual(node.kind, NodeKind.BreakExpr);
        assertEqual(node.value, null);
    });

    test("ContinueExpr", () => {
        const node = makeContinueExpr(span);
        assertEqual(node.kind, NodeKind.ContinueExpr);
    });

    test("LoopExpr", () => {
        const body = makeBlockExpr(span, [], null);
        const node = makeLoopExpr(span, null, body);
        assertEqual(node.kind, NodeKind.LoopExpr);
        assertEqual(node.label, null);
        assertEqual(node.body, body);
    });

    test("LoopExpr with label", () => {
        const body = makeBlockExpr(span, [], null);
        const node = makeLoopExpr(span, "outer", body);
        assertEqual(node.kind, NodeKind.LoopExpr);
        assertEqual(node.label, "outer");
    });

    test("WhileExpr", () => {
        const cond = makeIdentifierExpr(span, "x");
        const body = makeBlockExpr(span, [], null);
        const node = makeWhileExpr(span, null, cond, body);
        assertEqual(node.kind, NodeKind.WhileExpr);
        assertEqual(node.condition, cond);
        assertEqual(node.body, body);
    });

    test("ForExpr", () => {
        const pat = makeIdentPat(span, "i", Mutability.Immutable, false, null);
        const iter = makeIdentifierExpr(span, "items");
        const body = makeBlockExpr(span, [], null);
        const node = makeForExpr(span, null, pat, iter, body);
        assertEqual(node.kind, NodeKind.ForExpr);
        assertEqual(node.pat, pat);
        assertEqual(node.iter, iter);
    });

    test("PathExpr", () => {
        const node = makePathExpr(span, ["std", "collections", "HashMap"]);
        assertEqual(node.kind, NodeKind.PathExpr);
        assertEqual(node.segments.length, 3);
        assertEqual(node.segments[0], "std");
    });

    test("StructExpr", () => {
        const path = makePathExpr(span, ["Point"]);
        const fields = [
            { name: "x", value: makeLiteralExpr(span, LiteralKind.Int, 1, "1") },
            { name: "y", value: makeLiteralExpr(span, LiteralKind.Int, 2, "2") },
        ];
        const node = makeStructExpr(span, path, fields, null);
        assertEqual(node.kind, NodeKind.StructExpr);
        assertEqual(node.path, path);
        assertEqual(node.fields.length, 2);
    });

    test("RangeExpr", () => {
        const start = makeLiteralExpr(span, LiteralKind.Int, 0, "0");
        const end = makeLiteralExpr(span, LiteralKind.Int, 10, "10");
        const node = makeRangeExpr(span, start, end, false);
        assertEqual(node.kind, NodeKind.RangeExpr);
        assertEqual(node.start, start);
        assertEqual(node.end, end);
        assertEqual(node.inclusive, false);
    });

    test("RangeExpr inclusive", () => {
        const start = makeLiteralExpr(span, LiteralKind.Int, 0, "0");
        const end = makeLiteralExpr(span, LiteralKind.Int, 10, "10");
        const node = makeRangeExpr(span, start, end, true);
        assertEqual(node.inclusive, true);
    });

    test("RefExpr", () => {
        const operand = makeIdentifierExpr(span, "x");
        const node = makeRefExpr(span, Mutability.Immutable, operand);
        assertEqual(node.kind, NodeKind.RefExpr);
        assertEqual(node.mutability, Mutability.Immutable);
        assertEqual(node.operand, operand);
    });

    test("RefExpr mutable", () => {
        const operand = makeIdentifierExpr(span, "x");
        const node = makeRefExpr(span, Mutability.Mutable, operand);
        assertEqual(node.mutability, Mutability.Mutable);
    });

    test("DerefExpr", () => {
        const operand = makeIdentifierExpr(span, "ptr");
        const node = makeDerefExpr(span, operand);
        assertEqual(node.kind, NodeKind.DerefExpr);
        assertEqual(node.operand, operand);
    });

    test("LetStmt", () => {
        const pat = makeIdentPat(span, "x", Mutability.Immutable, false, null);
        const init = makeLiteralExpr(span, LiteralKind.Int, 42, "42");
        const node = makeLetStmt(span, pat, null, init);
        assertEqual(node.kind, NodeKind.LetStmt);
        assertEqual(node.pat, pat);
        assertEqual(node.ty, null);
        assertEqual(node.init, init);
    });

    test("ExprStmt", () => {
        const expr = makeCallExpr(span, makeIdentifierExpr(span, "foo"), []);
        const node = makeExprStmt(span, expr, true);
        assertEqual(node.kind, NodeKind.ExprStmt);
        assertEqual(node.expr, expr);
        assertEqual(node.hasSemicolon, true);
    });

    test("ItemStmt", () => {
        const item = makeFnItem(span, "foo", [], [], null, null, false, false);
        const node = makeItemStmt(span, item);
        assertEqual(node.kind, NodeKind.ItemStmt);
        assertEqual(node.item, item);
    });

    test("FnItem", () => {
        const body = makeBlockExpr(span, [], null);
        const params = [ast.makeParam(span, "x", null, null)];
        const node = makeFnItem(span, "add", [], params, null, body, false, false);
        assertEqual(node.kind, NodeKind.FnItem);
        assertEqual(node.name, "add");
        assertEqual(node.params.length, 1);
        assertEqual(node.body, body);
        assertEqual(node.isAsync, false);
        assertEqual(node.isUnsafe, false);
    });

    test("FnItem async unsafe", () => {
        const body = makeBlockExpr(span, [], null);
        const node = makeFnItem(span, "foo", [], [], null, body, true, true);
        assertEqual(node.isAsync, true);
        assertEqual(node.isUnsafe, true);
    });

    test("StructItem", () => {
        const fields = [
            ast.makeStructField(span, "x", null, null),
            ast.makeStructField(span, "y", null, null),
        ];
        const node = makeStructItem(span, "Point", [], fields, false);
        assertEqual(node.kind, NodeKind.StructItem);
        assertEqual(node.name, "Point");
        assertEqual(node.fields.length, 2);
        assertEqual(node.isTuple, false);
    });

    test("EnumItem", () => {
        const variants = [
            ast.makeEnumVariant(span, "A", [], null),
            ast.makeEnumVariant(span, "B", [], null),
        ];
        const node = makeEnumItem(span, "Option", [], variants);
        assertEqual(node.kind, NodeKind.EnumItem);
        assertEqual(node.name, "Option");
        assertEqual(node.variants.length, 2);
    });

    test("ModItem", () => {
        const items = [makeFnItem(span, "foo", [], [], null, null, false, false)];
        const node = makeModItem(span, "utils", items, true);
        assertEqual(node.kind, NodeKind.ModItem);
        assertEqual(node.name, "utils");
        assertEqual(node.items.length, 1);
        assertEqual(node.isInline, true);
    });

    test("UseItem", () => {
        const tree = ast.makeUseTree(span, ["std", "collections"], null, null);
        const node = makeUseItem(span, tree, true);
        assertEqual(node.kind, NodeKind.UseItem);
        assertEqual(node.tree, tree);
        assertEqual(node.isPub, true);
    });

    test("IdentPat", () => {
        const node = makeIdentPat(span, "x", Mutability.Immutable, false, null);
        assertEqual(node.kind, NodeKind.IdentPat);
        assertEqual(node.name, "x");
        assertEqual(node.mutability, Mutability.Immutable);
        assertEqual(node.isRef, false);
    });

    test("IdentPat mutable ref", () => {
        const node = makeIdentPat(span, "x", Mutability.Mutable, true, null);
        assertEqual(node.mutability, Mutability.Mutable);
        assertEqual(node.isRef, true);
    });

    test("WildcardPat", () => {
        const node = makeWildcardPat(span);
        assertEqual(node.kind, NodeKind.WildcardPat);
    });

    test("LiteralPat", () => {
        const node = makeLiteralPat(span, LiteralKind.Int, 42);
        assertEqual(node.kind, NodeKind.LiteralPat);
        assertEqual(node.literalKind, LiteralKind.Int);
        assertEqual(node.value, 42);
    });

    test("RangePat", () => {
        const start = makeLiteralPat(span, LiteralKind.Int, 1);
        const end = makeLiteralPat(span, LiteralKind.Int, 10);
        const node = makeRangePat(span, start, end, false);
        assertEqual(node.kind, NodeKind.RangePat);
        assertEqual(node.start, start);
        assertEqual(node.end, end);
        assertEqual(node.inclusive, false);
    });

    test("TuplePat", () => {
        const elements = [
            makeIdentPat(span, "a", Mutability.Immutable, false, null),
            makeIdentPat(span, "b", Mutability.Immutable, false, null),
        ];
        const node = makeTuplePat(span, elements);
        assertEqual(node.kind, NodeKind.TuplePat);
        assertEqual(node.elements.length, 2);
    });

    test("OrPat", () => {
        const alternatives = [
            makeLiteralPat(span, LiteralKind.Int, 1),
            makeLiteralPat(span, LiteralKind.Int, 2),
        ];
        const node = makeOrPat(span, alternatives);
        assertEqual(node.kind, NodeKind.OrPat);
        assertEqual(node.alternatives.length, 2);
    });

    test("BindingPat", () => {
        const inner = makeLiteralPat(span, LiteralKind.Int, 42);
        const node = makeBindingPat(span, "n", inner);
        assertEqual(node.kind, NodeKind.BindingPat);
        assertEqual(node.name, "n");
        assertEqual(node.pat, inner);
    });

    test("MatchArm", () => {
        const pat = makeIdentPat(span, "x", Mutability.Immutable, false, null);
        const body = makeIdentifierExpr(span, "x");
        const node = makeMatchArm(span, pat, null, body);
        assertEqual(node.kind, NodeKind.MatchArm);
        assertEqual(node.pat, pat);
        assertEqual(node.guard, null);
        assertEqual(node.body, body);
    });

    test("MatchExpr", () => {
        const scrutinee = makeIdentifierExpr(span, "value");
        const arms = [
            makeMatchArm(span, makeWildcardPat(span), null, makeLiteralExpr(span, LiteralKind.Int, 0, "0")),
        ];
        const node = makeMatchExpr(span, scrutinee, arms);
        assertEqual(node.kind, NodeKind.MatchExpr);
        assertEqual(node.scrutinee, scrutinee);
        assertEqual(node.arms.length, 1);
    });

    test("NamedType", () => {
        const node = makeNamedType(span, "i32", null);
        assertEqual(node.kind, NodeKind.NamedType);
        assertEqual(node.name, "i32");
        assertEqual(node.args, null);
    });

    test("NamedType with generics", () => {
        const args = makeGenericArgs(span, [makeNamedType(span, "T", null)]);
        const node = makeNamedType(span, "Vec", args);
        assertEqual(node.kind, NodeKind.NamedType);
        assertEqual(node.name, "Vec");
        assertEqual(node.args, args);
    });

    test("TupleType", () => {
        const elements = [
            makeNamedType(span, "i32", null),
            makeNamedType(span, "f64", null),
        ];
        const node = makeTupleType(span, elements);
        assertEqual(node.kind, NodeKind.TupleType);
        assertEqual(node.elements.length, 2);
    });

    test("ArrayType", () => {
        const element = makeNamedType(span, "u8", null);
        const length = makeLiteralExpr(span, LiteralKind.Int, 10, "10");
        const node = makeArrayType(span, element, length);
        assertEqual(node.kind, NodeKind.ArrayType);
        assertEqual(node.element, element);
        assertEqual(node.length, length);
    });

    test("RefType", () => {
        const inner = makeNamedType(span, "str", null);
        const node = makeRefType(span, Mutability.Immutable, inner);
        assertEqual(node.kind, NodeKind.RefType);
        assertEqual(node.mutability, Mutability.Immutable);
        assertEqual(node.inner, inner);
    });

    test("PtrType", () => {
        const inner = makeNamedType(span, "i32", null);
        const node = makePtrType(span, Mutability.Mutable, inner);
        assertEqual(node.kind, NodeKind.PtrType);
        assertEqual(node.mutability, Mutability.Mutable);
        assertEqual(node.inner, inner);
    });

    test("FnType", () => {
        const params = [makeNamedType(span, "i32", null)];
        const returnType = makeNamedType(span, "i32", null);
        const node = makeFnType(span, params, returnType, false);
        assertEqual(node.kind, NodeKind.FnType);
        assertEqual(node.params.length, 1);
        assertEqual(node.returnType, returnType);
        assertEqual(node.isUnsafe, false);
    });

    test("GenericArgs", () => {
        const args = [
            makeNamedType(span, "T", null),
            makeNamedType(span, "U", null),
        ];
        const node = makeGenericArgs(span, args);
        assertEqual(node.kind, NodeKind.GenericArgs);
        assertEqual(node.args.length, 2);
    });

    test("Module", () => {
        const items = [makeFnItem(span, "main", [], [], null, null, false, false)];
        const node = makeModule(span, "main", items);
        assertEqual(node.kind, NodeKind.Module);
        assertEqual(node.name, "main");
        assertEqual(node.items.length, 1);
    });

    test("isExpr helper", () => {
        assertTrue(isExpr(makeLiteralExpr(span, LiteralKind.Int, 1, "1")));
        assertTrue(isExpr(makeBinaryExpr(span, BinaryOp.Add, null, null)));
        assertTrue(isExpr(makeDerefExpr(span, null)));
        assertTrue(!isExpr(makeLetStmt(span, null, null, null)));
    });

    test("isStmt helper", () => {
        assertTrue(isStmt(makeLetStmt(span, null, null, null)));
        assertTrue(isStmt(makeExprStmt(span, null, false)));
        assertTrue(isStmt(makeItemStmt(span, null)));
        assertTrue(!isStmt(makeLiteralExpr(span, LiteralKind.Int, 1, "1")));
    });

    test("isItem helper", () => {
        assertTrue(isItem(makeFnItem(span, "f", [], [], null, null, false, false)));
        assertTrue(isItem(makeStructItem(span, "S", [], [], false)));
        assertTrue(isItem(makeEnumItem(span, "E", [], [])));
        assertTrue(!isItem(makeLetStmt(span, null, null, null)));
    });

    test("isPat helper", () => {
        assertTrue(isPat(makeIdentPat(span, "x", Mutability.Immutable, false, null)));
        assertTrue(isPat(makeWildcardPat(span)));
        assertTrue(isPat(makeTuplePat(span, [])));
        assertTrue(!isPat(makeLiteralExpr(span, LiteralKind.Int, 1, "1")));
    });

    test("isType helper", () => {
        assertTrue(isType(makeNamedType(span, "i32", null)));
        assertTrue(isType(makeTupleType(span, [])));
        assertTrue(isType(makeRefType(span, Mutability.Immutable, null)));
        assertTrue(!isType(makeLiteralExpr(span, LiteralKind.Int, 1, "1")));
    });

    test("BinaryOp enum values", () => {
        assertEqual(BinaryOp.Add, 0);
        assertEqual(BinaryOp.Sub, 1);
        assertEqual(BinaryOp.Mul, 2);
        assertEqual(BinaryOp.Eq, 5);
    });

    test("UnaryOp enum values", () => {
        assertEqual(UnaryOp.Not, 0);
        assertEqual(UnaryOp.Neg, 1);
        assertEqual(UnaryOp.Deref, 2);
        assertEqual(UnaryOp.Ref, 3);
    });

    test("Mutability enum values", () => {
        assertEqual(Mutability.Immutable, 0);
        assertEqual(Mutability.Mutable, 1);
    });

    test("LiteralKind enum values", () => {
        assertEqual(LiteralKind.Int, 0);
        assertEqual(LiteralKind.Float, 1);
        assertEqual(LiteralKind.Bool, 2);
        assertEqual(LiteralKind.String, 3);
        assertEqual(LiteralKind.Char, 4);
    });

    return 80;
}
