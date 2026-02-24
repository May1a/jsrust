import {
    Level,
    error,
    warning,
    note,
    help,
    withCode,
    withHint,
    withRelated,
    renderDiagnostic,
    renderSnippet,
    createSourceContext,
    makeSourceSpanFromLC,
} from "../../src/diagnostics";

import { test, assertEqual, assertTrue, getResults, clearErrors } from "../lib";

// ============================================================================
// Source Location Tests
// ============================================================================

test("makeSourceSpanFromLC creates correct span", () => {
    const span = makeSourceSpanFromLC(1, 5, 1, 10, "test.rs");
    assertEqual(span.start.line, 1);
    assertEqual(span.start.column, 5);
    assertEqual(span.end.line, 1);
    assertEqual(span.end.column, 10);
    assertEqual(span.start.file, "test.rs");
});

test("makeSourceSpanFromLC without file", () => {
    const span = makeSourceSpanFromLC(10, 1, 15, 20);
    assertEqual(span.start.line, 10);
    assertEqual(span.start.file, undefined);
});

// ============================================================================
// Diagnostic Structure Tests
// ============================================================================

test("error creates error diagnostic", () => {
    const diag = error("test error");
    assertEqual(diag.level, Level.Error);
    assertEqual(diag.message, "test error");
    assertTrue(diag.span === undefined);
});

test("warning creates warning diagnostic", () => {
    const diag = warning("test warning");
    assertEqual(diag.level, Level.Warning);
    assertEqual(diag.message, "test warning");
});

test("note creates note diagnostic", () => {
    const diag = note("test note");
    assertEqual(diag.level, Level.Note);
});

test("help creates help diagnostic", () => {
    const diag = help("test help");
    assertEqual(diag.level, Level.Help);
});

test("withCode adds error code", () => {
    const diag = withCode(error("test"), "E0001");
    assertEqual(diag.code, "E0001");
});

test("withHint adds hint", () => {
    const diag = withHint(error("test"), "try this");
    assertEqual(diag.hint, "try this");
});

test("withRelated adds related info", () => {
    const span = makeSourceSpanFromLC(1, 1, 1, 5);
    const diag = withRelated(error("test"), span, "see here");
    assertTrue(Array.isArray(diag.related));
    assertEqual(diag.related.length, 1);
    assertEqual(diag.related[0].message, "see here");
});

// ============================================================================
// Source Context Tests
// ============================================================================

test("SourceContext getLine returns correct line", () => {
    const source = "line1\nline2\nline3";
    const ctx = createSourceContext(source);
    assertEqual(ctx.getLine(1), "line1");
    assertEqual(ctx.getLine(2), "line2");
    assertEqual(ctx.getLine(3), "line3");
});

test("SourceContext getLine returns null for invalid line", () => {
    const ctx = createSourceContext("single line");
    assertEqual(ctx.getLine(0), null);
    assertEqual(ctx.getLine(2), null);
});

test("SourceContext lineCount is correct", () => {
    const ctx = createSourceContext("a\nb\nc");
    assertEqual(ctx.lineCount, 3);
});

test("SourceContext getText for single line span", () => {
    const source = "hello world";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(1, 1, 1, 6);
    assertEqual(ctx.getText(span), "hello");
});

test("SourceContext getText for multi-line span", () => {
    const source = "line1\nline2\nline3";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(1, 3, 3, 5);
    const text = ctx.getText(span);
    // From line 1 col 3 to line 3 col 5: "ne1\nline2\nline"
    assertEqual(text, "ne1\nline2\nline");
});

// ============================================================================
// Diagnostic Rendering Tests
// ============================================================================

test("renderDiagnostic shows error message", () => {
    const diag = error("something went wrong");
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(rendered.includes("error"));
    assertTrue(rendered.includes("something went wrong"));
});

test("renderDiagnostic shows warning message", () => {
    const diag = warning("be careful");
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(rendered.includes("warning"));
    assertTrue(rendered.includes("be careful"));
});

test("renderDiagnostic shows error code", () => {
    const diag = withCode(error("test"), "E0425");
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(rendered.includes("[E0425]"));
});

test("renderDiagnostic shows location", () => {
    const span = makeSourceSpanFromLC(10, 5, 10, 10, "test.rs");
    const diag = error("test", span);
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(rendered.includes("test.rs:10:5"));
});

test("renderDiagnostic shows hint", () => {
    const diag = withHint(error("test"), "try this instead");
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(rendered.includes("hint:"));
    assertTrue(rendered.includes("try this instead"));
});

test("renderDiagnostic shows related info", () => {
    const span1 = makeSourceSpanFromLC(1, 1, 1, 5);
    const span2 = makeSourceSpanFromLC(5, 10, 5, 15, "other.rs");
    const diag = withRelated(error("test", span1), span2, "defined here");
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(rendered.includes("note:"));
    assertTrue(rendered.includes("defined here"));
    assertTrue(rendered.includes("other.rs:5:10"));
});

test("renderDiagnostic with source context shows snippet", () => {
    const source = "fn main() {\n    let x = 1;\n}";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(2, 5, 2, 13);
    const diag = error("unused variable", span);
    const rendered = renderDiagnostic(diag, ctx, { color: false });
    assertTrue(rendered.includes("let x = 1;"));
});

// ============================================================================
// Snippet Rendering Tests
// ============================================================================

test("renderSnippet shows line numbers", () => {
    const source = "line one\nline two\nline three";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(2, 1, 2, 9);
    const snippet = renderSnippet(span, ctx, false);
    assertTrue(snippet.includes("2 |"));
    assertTrue(snippet.includes("line two"));
});

test("renderSnippet shows context lines", () => {
    const source = "line one\nline two\nline three";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(2, 1, 2, 9);
    const snippet = renderSnippet(span, ctx, false);
    // Should show line 1 (context before) and line 2 (the span)
    assertTrue(snippet.includes("line one"));
    assertTrue(snippet.includes("line two"));
});

test("renderSnippet shows underline", () => {
    const source = "hello world";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(1, 1, 1, 6);
    const snippet = renderSnippet(span, ctx, false);
    assertTrue(snippet.includes("^"));
});

test("renderSnippet handles multi-line span", () => {
    const source = "line1\nline2\nline3";
    const ctx = createSourceContext(source);
    const span = makeSourceSpanFromLC(1, 1, 3, 5);
    const snippet = renderSnippet(span, ctx, false);
    assertTrue(snippet.includes("line1"));
    assertTrue(snippet.includes("line2"));
    assertTrue(snippet.includes("line3"));
});

// ============================================================================
// Color Output Tests
// ============================================================================

test("renderDiagnostic with color includes ANSI codes", () => {
    const diag = error("test error");
    const rendered = renderDiagnostic(diag, undefined, { color: true });
    assertTrue(rendered.includes("\x1b[31m")); // Red color for error
    assertTrue(rendered.includes("\x1b[0m")); // Reset
});

test("renderDiagnostic without color has no ANSI codes", () => {
    const diag = error("test error");
    const rendered = renderDiagnostic(diag, undefined, { color: false });
    assertTrue(!rendered.includes("\x1b["));
});

export function runDiagnosticsRenderingTests() {
    const result = getResults();
    const count = result.passed + result.failed;
    clearErrors();
    return count;
}
