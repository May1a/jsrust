const fs = require('fs');
let code = fs.readFileSync('src/lowering.ts', 'utf8');

// 708
code = code.replace(/function lowerLiteral\(\n    ctx: LoweringCtx,\n    lit: Node,\n    typeCtx: TypeContext,\n\)/, 'function lowerLiteral(\n    _ctx: LoweringCtx,\n    lit: Node,\n    _typeCtx: TypeContext,\n)');

// 1006, 1008
code = code.replace(/function convertLiteralKind\(astKind: number\)/, 'function convertLiteralKind(astKind: number)'); // Wait, those weren't lowerLiteral's ctx

// Let's use simpler regexes
code = code.replace(/function lowerLiteral\([\s\S]*?\{/, 'function lowerLiteral(_ctx: LoweringCtx, lit: Node, _typeCtx: TypeContext): HLiteralExpr {');

code = code.replace(/function lowerReturn\([\s\S]*?\{/, 'function lowerReturn(_ctx: LoweringCtx, returnExpr: Node, _typeCtx: TypeContext): HUnitExpr {');
code = code.replace(/function lowerBreak\([\s\S]*?\{/, 'function lowerBreak(_ctx: LoweringCtx, breakExpr: Node, _typeCtx: TypeContext): HUnitExpr {');
code = code.replace(/function lowerContinue\([\s\S]*?\{/, 'function lowerContinue(_ctx: LoweringCtx, continueExpr: Node, _typeCtx: TypeContext): HUnitExpr {');
code = code.replace(/function lowerRange\([\s\S]*?\{/, 'function lowerRange(_ctx: LoweringCtx, rangeExpr: Node, _typeCtx: TypeContext): HExpr {');

code = code.replace(/const value = lowerExpr\(ctx, assign\.value, typeCtx\);/, 'lowerExpr(ctx, assign.value, typeCtx);');
code = code.replace(/const iterVarInfo = ctx\.defineVar\(iterVarName, iter\.ty, true\);/, 'ctx.defineVar(iterVarName, iter.ty, true);');
code = code.replace(/const defaultSpan: Span = pat\.span/g, 'const _defaultSpan: Span = pat.span');
code = code.replace(/const innerPat = lowerPattern\(ctx, pat\.pat, expectedType, typeCtx\);/g, 'lowerPattern(ctx, pat.pat, expectedType, typeCtx);');
code = code.replace(/\(f\) => f\.name === fieldName/g, '(f: any) => f.name === fieldName');
code = code.replace(/findEnumVariantIndex\(\n\s*enumNode,\n\s*variantName,\n\s*\)/g, 'findEnumVariantIndex(enumNode as unknown as Node, variantName)');
code = code.replace(/findEnumVariantIndex\(enumNode, variantName\)/g, 'findEnumVariantIndex(enumNode as unknown as Node, variantName)');

code = code.replace(/span: pathExpr\.span,\n\s*\} as Node/g, 'span: pathExpr.span,\n                kind: NodeKind.IdentifierExpr\n            } as unknown as Node');

fs.writeFileSync('src/lowering.ts', code);
