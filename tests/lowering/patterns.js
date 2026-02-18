/**
 * Tests for AST to HIR pattern lowering
 */

import { assertEqual, assertTrue } from '../lib.js';
import {
    NodeKind,
    LiteralKind,
    Mutability,
    makeSpan,
    makeIdentPat,
    makeWildcardPat,
    makeLiteralPat,
    makeTuplePat,
    makeOrPat,
    makeStructPat,
    makeIdentifierExpr,
    makePathExpr,
} from '../../ast.js';
import {
    lowerPattern,
    LoweringCtx,
} from '../../lowering.js';
import {
    HPatKind,
} from '../../hir.js';
import {
    TypeKind,
    IntWidth,
    FloatWidth,
    makeUnitType,
    makeIntType,
    makeTupleType,
} from '../../types.js';
import { TypeContext } from '../../type_context.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestTypeContext() {
    return new TypeContext();
}

function createTestLoweringCtx() {
    return new LoweringCtx();
}

// ============================================================================
// Identifier Pattern Tests
// ============================================================================

function testLowerIdentPat() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeIdentPat(makeSpan(0, 0, 0, 1), 'x', Mutability.Immutable, false, null);
    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Ident, 'Should be an ident pattern');
    assertEquals(hir.name, 'x', 'Should have name "x"');
    assertEquals(hir.mutable, false, 'Should be immutable');
    assertEquals(hir.isRef, false, 'Should not be ref');
}

function testLowerIdentPatMutable() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeIdentPat(makeSpan(0, 0, 0, 4), 'mut_x', Mutability.Mutable, false, null);
    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Ident, 'Should be an ident pattern');
    assertEquals(hir.name, 'mut_x', 'Should have name "mut_x"');
    assertEquals(hir.mutable, true, 'Should be mutable');
}

function testLowerIdentPatRef() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeIdentPat(makeSpan(0, 0, 0, 5), 'ref_x', Mutability.Immutable, true, null);
    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Ident, 'Should be an ident pattern');
    assertEquals(hir.isRef, true, 'Should be ref');
}

function testLowerIdentPatDefinesVar() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeIdentPat(makeSpan(0, 0, 0, 1), 'y', Mutability.Immutable, false, null);
    lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    const varInfo = ctx.lookupVar('y');
    assertEquals(varInfo !== null, true, 'Should define variable');
    assertEquals(varInfo.name, 'y', 'Should have correct name');
}

// ============================================================================
// Wildcard Pattern Tests
// ============================================================================

function testLowerWildcardPat() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeWildcardPat(makeSpan(0, 0, 0, 1));
    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Wildcard, 'Should be a wildcard pattern');
}

function testLowerWildcardPatNoVar() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeWildcardPat(makeSpan(0, 0, 0, 1));
    lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    // Wildcard should not define a variable
    const varInfo = ctx.lookupVar('_');
    assertEquals(varInfo, null, 'Wildcard should not define variable');
}

// ============================================================================
// Literal Pattern Tests
// ============================================================================

function testLowerLiteralPatInt() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeLiteralPat(makeSpan(0, 0, 0, 1), LiteralKind.Int, 42);
    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Literal, 'Should be a literal pattern');
    assertEquals(hir.value, 42, 'Should have value 42');
}

function testLowerLiteralPatBool() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const ast = makeLiteralPat(makeSpan(0, 0, 0, 4), LiteralKind.Bool, true);
    const hir = lowerPattern(ctx, ast, { kind: TypeKind.Bool }, typeCtx);

    assertEquals(hir.kind, HPatKind.Literal, 'Should be a literal pattern');
    assertEquals(hir.value, true, 'Should have value true');
}

// ============================================================================
// Tuple Pattern Tests
// ============================================================================

function testLowerTuplePat() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const elem1 = makeIdentPat(makeSpan(0, 0, 1, 1), 'a', Mutability.Immutable, false, null);
    const elem2 = makeIdentPat(makeSpan(0, 0, 3, 1), 'b', Mutability.Immutable, false, null);
    const ast = makeTuplePat(makeSpan(0, 0, 0, 5), [elem1, elem2]);

    const expectedType = makeTupleType([makeIntType(IntWidth.I32), makeIntType(IntWidth.I32)]);
    const hir = lowerPattern(ctx, ast, expectedType, typeCtx);

    assertEquals(hir.kind, HPatKind.Tuple, 'Should be a tuple pattern');
    assertEquals(hir.elements.length, 2, 'Should have two elements');
}

function testLowerTuplePatNested() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const innerTuple = makeTuplePat(makeSpan(0, 0, 1, 3), [
        makeIdentPat(makeSpan(0, 0, 2, 1), 'x', Mutability.Immutable, false, null),
        makeIdentPat(makeSpan(0, 0, 4, 1), 'y', Mutability.Immutable, false, null),
    ]);
    const ast = makeTuplePat(makeSpan(0, 0, 0, 7), [
        innerTuple,
        makeIdentPat(makeSpan(0, 0, 6, 1), 'z', Mutability.Immutable, false, null),
    ]);

    const innerType = makeTupleType([makeIntType(IntWidth.I32), makeIntType(IntWidth.I32)]);
    const expectedType = makeTupleType([innerType, makeIntType(IntWidth.I32)]);
    const hir = lowerPattern(ctx, ast, expectedType, typeCtx);

    assertEquals(hir.kind, HPatKind.Tuple, 'Should be a tuple pattern');
    assertEquals(hir.elements.length, 2, 'Should have two elements');
    assertEquals(hir.elements[0].kind, HPatKind.Tuple, 'First element should be tuple');
}

// ============================================================================
// Or Pattern Tests
// ============================================================================

function testLowerOrPat() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const alt1 = makeLiteralPat(makeSpan(0, 0, 0, 1), LiteralKind.Int, 1);
    const alt2 = makeLiteralPat(makeSpan(0, 0, 4, 1), LiteralKind.Int, 2);
    const ast = makeOrPat(makeSpan(0, 0, 0, 6), [alt1, alt2]);

    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Or, 'Should be an or pattern');
    assertEquals(hir.alternatives.length, 2, 'Should have two alternatives');
}

function testLowerOrPatMultiple() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const alt1 = makeLiteralPat(makeSpan(0, 0, 0, 1), LiteralKind.Int, 1);
    const alt2 = makeLiteralPat(makeSpan(0, 0, 4, 1), LiteralKind.Int, 2);
    const alt3 = makeLiteralPat(makeSpan(0, 0, 8, 1), LiteralKind.Int, 3);
    const ast = makeOrPat(makeSpan(0, 0, 0, 10), [alt1, alt2, alt3]);

    const hir = lowerPattern(ctx, ast, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir.kind, HPatKind.Or, 'Should be an or pattern');
    assertEquals(hir.alternatives.length, 3, 'Should have three alternatives');
}

// ============================================================================
// Struct Pattern Tests
// ============================================================================

function testLowerStructPat() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    // Register struct
    ctx.registerItem('Point', 'struct', {
        kind: NodeKind.StructItem,
        name: 'Point',
        fields: [
            { name: 'x', ty: { kind: NodeKind.NamedType, name: 'i32' } },
            { name: 'y', ty: { kind: NodeKind.NamedType, name: 'i32' } },
        ],
    });

    const path = makeIdentifierExpr(makeSpan(0, 0, 0, 5), 'Point');
    const fields = [
        { name: 'x', pat: makeIdentPat(makeSpan(0, 0, 8, 1), 'a', Mutability.Immutable, false, null) },
        { name: 'y', pat: makeIdentPat(makeSpan(0, 0, 12, 1), 'b', Mutability.Immutable, false, null) },
    ];
    const ast = makeStructPat(makeSpan(0, 0, 0, 15), path, fields, false);

    const structType = { kind: TypeKind.Struct, name: 'Point', fields: [] };
    const hir = lowerPattern(ctx, ast, structType, typeCtx);

    assertEquals(hir.kind, HPatKind.Struct, 'Should be a struct pattern');
    assertEquals(hir.name, 'Point', 'Should have struct name');
    assertEquals(hir.fields.length, 2, 'Should have two fields');
}

function testLowerStructPatWithRest() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    // Register struct
    ctx.registerItem('Point', 'struct', {
        kind: NodeKind.StructItem,
        name: 'Point',
        fields: [
            { name: 'x', ty: { kind: NodeKind.NamedType, name: 'i32' } },
            { name: 'y', ty: { kind: NodeKind.NamedType, name: 'i32' } },
        ],
    });

    const path = makeIdentifierExpr(makeSpan(0, 0, 0, 5), 'Point');
    const fields = [
        { name: 'x', pat: makeIdentPat(makeSpan(0, 0, 8, 1), 'a', Mutability.Immutable, false, null) },
    ];
    const ast = makeStructPat(makeSpan(0, 0, 0, 15), path, fields, true);

    const structType = { kind: TypeKind.Struct, name: 'Point', fields: [] };
    const hir = lowerPattern(ctx, ast, structType, typeCtx);

    assertEquals(hir.kind, HPatKind.Struct, 'Should be a struct pattern');
    assertEquals(hir.rest, true, 'Should have rest pattern');
}

// ============================================================================
// Variable ID Tests
// ============================================================================

function testPatternVarIds() {
    const ctx = createTestLoweringCtx();
    const typeCtx = createTestTypeContext();

    const pat1 = makeIdentPat(makeSpan(0, 0, 0, 1), 'a', Mutability.Immutable, false, null);
    const hir1 = lowerPattern(ctx, pat1, makeIntType(IntWidth.I32), typeCtx);

    const pat2 = makeIdentPat(makeSpan(0, 0, 0, 1), 'b', Mutability.Immutable, false, null);
    const hir2 = lowerPattern(ctx, pat2, makeIntType(IntWidth.I32), typeCtx);

    assertEquals(hir1.id !== hir2.id, true, 'Different patterns should have different IDs');
}

// ============================================================================
// Run Tests
// ============================================================================

export function runTests() {
    const tests = [
        ['Lower ident pattern', testLowerIdentPat],
        ['Lower ident pattern mutable', testLowerIdentPatMutable],
        ['Lower ident pattern ref', testLowerIdentPatRef],
        ['Lower ident pattern defines var', testLowerIdentPatDefinesVar],
        ['Lower wildcard pattern', testLowerWildcardPat],
        ['Lower wildcard pattern no var', testLowerWildcardPatNoVar],
        ['Lower literal pattern int', testLowerLiteralPatInt],
        ['Lower literal pattern bool', testLowerLiteralPatBool],
        ['Lower tuple pattern', testLowerTuplePat],
        ['Lower tuple pattern nested', testLowerTuplePatNested],
        ['Lower or pattern', testLowerOrPat],
        ['Lower or pattern multiple', testLowerOrPatMultiple],
        ['Lower struct pattern', testLowerStructPat],
        ['Lower struct pattern with rest', testLowerStructPatWithRest],
        ['Pattern var IDs', testPatternVarIds],
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

    return { passed, failed };
}