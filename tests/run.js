import * as lib from "./lib.js";
import { runKeywordsTests } from "./keywords.js";
import { runLiteralsTests } from "./literals.js";
import { runOperatorsTests } from "./operators.js";
import { runDelimitersTests } from "./delimiters.js";
import { runCommentsTests } from "./comments.js";
import { runErrorsTests } from "./errors.js";
import { runPositionTests } from "./position.js";
import { runAstTests } from "./ast.js";

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

const success = printSummary(totalTests);
process.exit(success ? 0 : 1);
