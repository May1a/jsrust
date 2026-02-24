import * as lib from "./lib";
import { runKeywordsTests } from "./keywords";
import { runLiteralsTests } from "./literals";
import { runOperatorsTests } from "./operators";
import { runDelimitersTests } from "./delimiters";
import { runCommentsTests } from "./comments";
import { runErrorsTests } from "./errors";
import { runPositionTests } from "./position";
import { runAstTests } from "./ast";
import { runParserExpressionTests } from "./parser/expressions";
import { runParserStatementTests } from "./parser/statements";
import { runParserItemTests } from "./parser/items";
import { runParserPatternTests } from "./parser/patterns";
import { runParserTypeTests } from "./parser/types";
import { runParserErrorTests } from "./parser/errors";
import { runTypeRepresentationTests } from "./types/representation";
import { runTypeContextTests } from "./types/context";
import { runTypeUtilitiesTests } from "./types/utilities";
import { runHirConstructionTests } from "./hir/construction";
import { runHirUtilitiesTests } from "./hir/utilities";
import { runIRTypesTests } from "./ir/types";
import { runIRInstructionsTests } from "./ir/instructions";
import { runIRBlocksTests } from "./ir/blocks";
import { runIRFunctionsTests } from "./ir/functions";
import { runMemoryPrimitivesTests } from "./memory/primitives";
import { runMemoryStructsTests } from "./memory/structs";
import { runMemoryEnumsTests } from "./memory/enums";
import { runMemoryArraysTests } from "./memory/arrays";
import { runMemoryStackAllocTests } from "./memory/stack_alloc";
import { runPrimitivesTests } from "./binary/primitives";
import { runTypesTests } from "./binary/types";
import { runInstructionsTests } from "./binary/instructions";
import { runRoundtripTests } from "./binary/roundtrip";
import { runBinaryConformanceTests } from "./binary/conformance";
import { runOutputTypesTests } from "./output/types";
import { runOutputInstructionsTests } from "./output/instructions";
import { runOutputFunctionsTests } from "./output/functions";
import { runValidationBasicTests } from "./validation/basic";
import { runValidationTypesTests } from "./validation/types";
import { runValidationControlFlowTests } from "./validation/control_flow";
import { runValidationDominanceTests } from "./validation/dominance";
import { runInferenceExpressionsTests } from "./inference/expressions";
import { runInferenceStatementsTests } from "./inference/statements";
import { runInferenceFunctionsTests } from "./inference/functions";
import { runInferenceErrorsTests } from "./inference/errors";
import { runInferenceStructsTests } from "./inference/structs";
import { runInferenceEnumsTests } from "./inference/enums";
import { runInferenceReferencesTests } from "./inference/references";
import { runInferenceImplsTests } from "./inference/impls";
import { runInferenceBorrowLiteTests } from "./inference/borrow_lite";
import { runTests as runLoweringExpressionsTests } from "./lowering/expressions";
import { runTests as runLoweringStatementsTests } from "./lowering/statements";
import { runTests as runLoweringControlFlowTests } from "./lowering/control_flow";
import { runTests as runLoweringPatternsTests } from "./lowering/patterns";
import { runTests as runIRBuilderConstantsTests } from "./ir_builder/constants";
import { runTests as runIRBuilderArithmeticTests } from "./ir_builder/arithmetic";
import { runTests as runIRBuilderControlFlowTests } from "./ir_builder/control_flow";
import { runTests as runIRBuilderVariablesTests } from "./ir_builder/variables";
import { runTests as runIRBuilderMemoryTests } from "./ir_builder/memory";
import { runTests as runHirToSsaExpressionsTests } from "./hir_to_ssa/expressions";
import { runDiagnosticsCollectionTests } from "./diagnostics/collection";
import { runDiagnosticsRenderingTests } from "./diagnostics/rendering";
import { runE2ETests } from "./e2e";
import { runModuleTests } from "./modules";
import { runExamplesTests } from "./examples";
import {
    canRunBackendIntegrationGate,
    runBackendIntegrationTests,
} from "./backend/integration";

const { printSummary, clearErrors, beginRun, endRun } = lib;
const argv = process.argv.slice(2);
const updateExamples = argv.includes("--update-examples");

clearErrors();
beginRun();

if (updateExamples) {
    console.log("Examples snapshot update mode enabled (--update-examples).");
}

runKeywordsTests();
runLiteralsTests();
runOperatorsTests();
runDelimitersTests();
runCommentsTests();
runErrorsTests();
runPositionTests();
runAstTests();
runParserExpressionTests();
runParserStatementTests();
runParserItemTests();
runParserPatternTests();
runParserTypeTests();
runParserErrorTests();
runTypeRepresentationTests();
runTypeContextTests();
runTypeUtilitiesTests();
runHirConstructionTests();
runHirUtilitiesTests();
runIRTypesTests();
runIRInstructionsTests();
runIRBlocksTests();
runIRFunctionsTests();
runMemoryPrimitivesTests();
runMemoryStructsTests();
runMemoryEnumsTests();
runMemoryArraysTests();
runMemoryStackAllocTests();
runPrimitivesTests();
runTypesTests();
runInstructionsTests();
runRoundtripTests();
runBinaryConformanceTests();
runOutputTypesTests();
runOutputInstructionsTests();
runOutputFunctionsTests();
runValidationBasicTests();
runValidationTypesTests();
runValidationControlFlowTests();
runValidationDominanceTests();
runInferenceExpressionsTests();
runInferenceStatementsTests();
runInferenceFunctionsTests();
runInferenceErrorsTests();
runInferenceStructsTests();
runInferenceEnumsTests();
runInferenceReferencesTests();
runInferenceImplsTests();
runInferenceBorrowLiteTests();
runLoweringExpressionsTests();
runLoweringStatementsTests();
runLoweringControlFlowTests();
runLoweringPatternsTests();
runIRBuilderConstantsTests();
runIRBuilderArithmeticTests();
runIRBuilderControlFlowTests();
runIRBuilderVariablesTests();
runIRBuilderMemoryTests();
runHirToSsaExpressionsTests();
runDiagnosticsCollectionTests();
runDiagnosticsRenderingTests();
runE2ETests();
runModuleTests();
runExamplesTests({ updateExamples });

const backendIntegrationGate = canRunBackendIntegrationGate();
if (backendIntegrationGate.ok) {
    runBackendIntegrationTests();
} else {
    console.log(
        `Skipping backend integration tests: ${backendIntegrationGate.reason}`,
    );
}

endRun();
const success = printSummary();
process.exit(success ? 0 : 1);
