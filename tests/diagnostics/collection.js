import {
    Level,
    error,
    warning,
    note,
    help,
    createCollector,
    ok,
    err,
    isOk,
    isErr,
    unwrap,
    unwrapOr,
    map,
    mapErr,
    andThen,
    combineResults,
    formatTypeMismatch,
    formatUndefinedVar,
    formatDuplicateDef,
    formatArityMismatch,
    formatMissingField,
    formatUnknownField,
    formatUnusedVar,
    makeSourceSpanFromLC,
} from "../../diagnostics.js";

import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

// ============================================================================
// DiagnosticCollector Tests
// ============================================================================

test("createCollector creates empty collector", () => {
    const collector = createCollector();
    assertEqual(collector.diagnostics.length, 0);
    assertTrue(!collector.hasErrors());
});

test("addError adds error diagnostic", () => {
    const collector = createCollector();
    collector.addError("test error");
    assertEqual(collector.diagnostics.length, 1);
    assertEqual(collector.diagnostics[0].level, Level.Error);
    assertEqual(collector.diagnostics[0].message, "test error");
    assertTrue(collector.hasErrors());
});

test("addWarning adds warning diagnostic", () => {
    const collector = createCollector();
    collector.addWarning("test warning");
    assertEqual(collector.diagnostics.length, 1);
    assertEqual(collector.diagnostics[0].level, Level.Warning);
    assertTrue(!collector.hasErrors());
    assertTrue(collector.hasWarnings());
});

test("addNote adds note diagnostic", () => {
    const collector = createCollector();
    collector.addNote("test note");
    assertEqual(collector.diagnostics.length, 1);
    assertEqual(collector.diagnostics[0].level, Level.Note);
});

test("add adds diagnostic directly", () => {
    const collector = createCollector();
    collector.add(error("direct error"));
    assertEqual(collector.diagnostics.length, 1);
    assertTrue(collector.hasErrors());
});

test("getErrors returns only errors", () => {
    const collector = createCollector();
    collector.addError("error1");
    collector.addWarning("warning1");
    collector.addError("error2");
    const errors = collector.getErrors();
    assertEqual(errors.length, 2);
    assertTrue(errors.every((d) => d.level === Level.Error));
});

test("getWarnings returns only warnings", () => {
    const collector = createCollector();
    collector.addError("error1");
    collector.addWarning("warning1");
    collector.addWarning("warning2");
    const warnings = collector.getWarnings();
    assertEqual(warnings.length, 2);
    assertTrue(warnings.every((d) => d.level === Level.Warning));
});

test("clear removes all diagnostics", () => {
    const collector = createCollector();
    collector.addError("error1");
    collector.addWarning("warning1");
    collector.clear();
    assertEqual(collector.diagnostics.length, 0);
    assertTrue(!collector.hasErrors());
});

test("countByLevel counts correctly", () => {
    const collector = createCollector();
    collector.addError("e1");
    collector.addError("e2");
    collector.addWarning("w1");
    assertEqual(collector.countByLevel(Level.Error), 2);
    assertEqual(collector.countByLevel(Level.Warning), 1);
    assertEqual(collector.countByLevel(Level.Note), 0);
});

test("merge combines collectors", () => {
    const c1 = createCollector();
    const c2 = createCollector();
    c1.addError("error1");
    c2.addWarning("warning1");
    c1.merge(c2);
    assertEqual(c1.diagnostics.length, 2);
    assertTrue(c1.hasErrors());
    assertTrue(c1.hasWarnings());
});

test("diagnostics with span", () => {
    const collector = createCollector();
    const span = makeSourceSpanFromLC(1, 1, 1, 10, "test.rs");
    collector.addError("test error", span);
    assertTrue(collector.diagnostics[0].span !== undefined);
    assertEqual(collector.diagnostics[0].span.start.line, 1);
});

// ============================================================================
// Result Type Tests
// ============================================================================

test("ok creates successful result", () => {
    const result = ok(42);
    assertTrue(result.ok);
    assertEqual(result.value, 42);
});

test("err creates error result", () => {
    const result = err("failed");
    assertTrue(!result.ok);
    assertEqual(result.error, "failed");
});

test("isOk returns true for ok", () => {
    assertTrue(isOk(ok(1)));
    assertTrue(!isOk(err("error")));
});

test("isErr returns true for err", () => {
    assertTrue(isErr(err("error")));
    assertTrue(!isErr(ok(1)));
});

test("unwrap returns value for ok", () => {
    const result = ok("value");
    assertEqual(unwrap(result), "value");
});

test("unwrap throws for err", () => {
    const result = err("something went wrong");
    let threw = false;
    try {
        unwrap(result);
    } catch (e) {
        threw = true;
        assertTrue(e instanceof Error);
    }
    assertTrue(threw);
});

test("unwrapOr returns value for ok", () => {
    const result = ok(42);
    assertEqual(unwrapOr(result, 0), 42);
});

test("unwrapOr returns default for err", () => {
    const result = err("error");
    assertEqual(unwrapOr(result, "default"), "default");
});

test("map transforms ok value", () => {
    const result = ok(5);
    const mapped = map(result, (x) => x * 2);
    assertTrue(isOk(mapped));
    assertEqual(mapped.value, 10);
});

test("map does not affect err", () => {
    const result = err("error");
    const mapped = map(result, (x) => x * 2);
    assertTrue(isErr(mapped));
    assertEqual(mapped.error, "error");
});

test("mapErr transforms err value", () => {
    const result = err(5);
    const mapped = mapErr(result, (e) => `error: ${e}`);
    assertTrue(isErr(mapped));
    assertEqual(mapped.error, "error: 5");
});

test("mapErr does not affect ok", () => {
    const result = ok(42);
    const mapped = mapErr(result, (e) => `error: ${e}`);
    assertTrue(isOk(mapped));
    assertEqual(mapped.value, 42);
});

test("andThen chains ok results", () => {
    const result = ok(5);
    const chained = andThen(result, (x) => ok(x * 2));
    assertTrue(isOk(chained));
    assertEqual(chained.value, 10);
});

test("andThen can convert ok to err", () => {
    const result = ok(5);
    const chained = andThen(result, (x) => (x > 10 ? ok(x) : err("too small")));
    assertTrue(isErr(chained));
    assertEqual(chained.error, "too small");
});

test("andThen propagates err", () => {
    const result = err("initial error");
    const chained = andThen(result, (x) => ok(x * 2));
    assertTrue(isErr(chained));
    assertEqual(chained.error, "initial error");
});

test("combineResults with all ok", () => {
    const results = [ok(1), ok(2), ok(3)];
    const combined = combineResults(results);
    assertTrue(isOk(combined));
    assertEqual(combined.value.length, 3);
    assertEqual(combined.value[0], 1);
    assertEqual(combined.value[1], 2);
    assertEqual(combined.value[2], 3);
});

test("combineResults with some err", () => {
    const results = [ok(1), err("e1"), ok(2), err("e2")];
    const combined = combineResults(results);
    assertTrue(isErr(combined));
    assertEqual(combined.error.length, 2);
    assertEqual(combined.error[0], "e1");
    assertEqual(combined.error[1], "e2");
});

test("combineResults with all err", () => {
    const results = [err("e1"), err("e2")];
    const combined = combineResults(results);
    assertTrue(isErr(combined));
    assertEqual(combined.error.length, 2);
});

test("combineResults with empty array", () => {
    const results = [];
    const combined = combineResults(results);
    assertTrue(isOk(combined));
    assertEqual(combined.value.length, 0);
});

// ============================================================================
// Error Formatting Tests
// ============================================================================

test("formatTypeMismatch creates correct error", () => {
    const diag = formatTypeMismatch("i32", "String");
    assertEqual(diag.level, Level.Error);
    assertTrue(diag.message.includes("i32"));
    assertTrue(diag.message.includes("String"));
});

test("formatUndefinedVar creates correct error with code", () => {
    const diag = formatUndefinedVar("x");
    assertEqual(diag.level, Level.Error);
    assertTrue(diag.message.includes("x"));
    assertEqual(diag.code, "E0425");
});

test("formatDuplicateDef creates correct error", () => {
    const span1 = makeSourceSpanFromLC(1, 1, 1, 5);
    const span2 = makeSourceSpanFromLC(5, 1, 5, 5);
    const diag = formatDuplicateDef("foo", span1, span2);
    assertEqual(diag.level, Level.Error);
    assertTrue(diag.message.includes("foo"));
    assertTrue(diag.related !== undefined);
    assertEqual(diag.related.length, 1);
});

test("formatArityMismatch creates correct error", () => {
    const diag = formatArityMismatch(2, 3);
    assertEqual(diag.level, Level.Error);
    assertTrue(diag.message.includes("2 arguments"));
    assertTrue(diag.message.includes("3 arguments"));
});

test("formatArityMismatch handles singular", () => {
    const diag = formatArityMismatch(1, 0);
    assertTrue(diag.message.includes("1 argument"));
    assertTrue(diag.message.includes("0 arguments"));
});

test("formatMissingField creates correct error", () => {
    const diag = formatMissingField("MyStruct", "field1");
    assertEqual(diag.level, Level.Error);
    assertTrue(diag.message.includes("MyStruct"));
    assertTrue(diag.message.includes("field1"));
});

test("formatUnknownField creates correct error", () => {
    const diag = formatUnknownField("MyStruct", "unknown_field");
    assertEqual(diag.level, Level.Error);
    assertTrue(diag.message.includes("unknown_field"));
});

test("formatUnusedVar creates warning with hint", () => {
    const diag = formatUnusedVar("unused_var");
    assertEqual(diag.level, Level.Warning);
    assertTrue(diag.message.includes("unused_var"));
    assertTrue(diag.hint !== undefined);
    assertTrue(diag.hint.includes("_unused_var"));
});

export function runDiagnosticsCollectionTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
