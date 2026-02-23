const fs = require('fs');
let code = fs.readFileSync('src/lowering.ts', 'utf8');

code = code.replace(/function lowerRange\(_ctx: LoweringCtx, rangeExpr: Node, _typeCtx: TypeContext\): HExpr \{/, 'function lowerRange(ctx: LoweringCtx, rangeExpr: Node, typeCtx: TypeContext): HExpr {');
code = code.replace(/makeUnitType\(defaultSpan\)/g, 'makeUnitType(_defaultSpan)');

fs.writeFileSync('src/lowering.ts', code);
