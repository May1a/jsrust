import * as lib from "./lib.js";
import { runKeywordsTests } from "./keywords.js";
import { runLiteralsTests } from "./literals.js";
import { runOperatorsTests } from "./operators.js";
import { runDelimitersTests } from "./delimiters.js";
import { runCommentsTests } from "./comments.js";
import { runErrorsTests } from "./errors.js";
import { runPositionTests } from "./position.js";
import { runAstTests } from "./ast.js";
import { runParserExpressionTests } from "./parser/expressions.js";
import { runParserStatementTests } from "./parser/statements.js";
import { runParserItemTests } from "./parser/items.js";
import { runParserPatternTests } from "./parser/patterns.js";
import { runParserTypeTests } from "./parser/types.js";
import { runParserErrorTests } from "./parser/errors.js";
import { runTypeRepresentationTests } from "./types/representation.js";
import { runTypeContextTests } from "./types/context.js";
import { runTypeUtilitiesTests } from "./types/utilities.js";

const { printSummary, clearErrors } = lib;

clearErrors();

let totalTests = 0;

totalTests += runKeywordsTests();
totalTests += runLiteralsTests();
totalTests += runOperatorsTests();
totalTests += runDelimitersTests();
totalTests += runCommentsTests();
totalTests += runErrorsTests();
totalTests += runPositionTests();
totalTests += runAstTests();
totalTests += runParserExpressionTests();
totalTests += runParserStatementTests();
totalTests += runParserItemTests();
totalTests += runParserPatternTests();
totalTests += runParserTypeTests();
totalTests += runParserErrorTests();
totalTests += runTypeRepresentationTests();
totalTests += runTypeContextTests();
totalTests += runTypeUtilitiesTests();

const success = printSummary(totalTests);
process.exit(success ? 0 : 1);
