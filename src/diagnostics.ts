// ============================================================================
// Diagnostics and Error Reporting
// ============================================================================

import type { Span } from "./types";

// ============================================================================
// Task 13.1: Source Location
// ============================================================================

/**
 * Represents a position in source code
 */
type SourceLocation = {
    file?: string;
    line: number;
    column: number;
};

/**
 * Represents a range in source code
 */
type SourceSpan = {
    start: SourceLocation;
    end: SourceLocation;
};

/**
 * Create a source location
 * @param {number} line - 1-based line number
 * @param {number} column - 1-based column number
 * @param {string} [file] - Optional file path
 * @returns {SourceLocation}
 */
function makeSourceLocation(
    line: number,
    column: number,
    file: string,
): SourceLocation {
    return { line, column, file };
}

/**
 * Create a source span
 */
function makeSourceSpan(
    start: SourceLocation,
    end: SourceLocation,
): SourceSpan {
    return { start, end };
}

/**
 * Convert a Span (from types.js) to a SourceSpan
 */
function spanToSourceSpan(span: Span, file: string): SourceSpan {
    return {
        start: { line: span.line, column: span.column, file },
        end: {
            line: span.line,
            column: span.column + (span.end - span.start),
            file,
        },
    };
}

/**
 * Create a SourceSpan from line/column info
 */
function makeSourceSpanFromLC(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number,
    file: string,
): SourceSpan {
    return {
        start: { line: startLine, column: startColumn, file },
        end: { line: endLine, column: endColumn, file },
    };
}

// ============================================================================
// Task 13.2: Diagnostic Structure
// ============================================================================

/**
 * Diagnostic severity level
 * @enum {number}
 */
enum Level {
    Error,
    Warning,
    Note,
    Help,
}

type RelatedInfo = {
    span: SourceSpan;
    message: string;
};

type Diagnostic = {
    level: number;
    message: string;
    span?: SourceSpan;
    code?: string;
    related?: RelatedInfo[];
    hint?: string;
};

/**
 * Create a diagnostic
 */
function makeDiagnostic(
    level: number,
    message: string,
    span: SourceSpan,
): Diagnostic {
    return { level, message, span };
}

/**
 * Create an error diagnostic
 */
function error(message: string, span: SourceSpan): Diagnostic {
    return makeDiagnostic(Level.Error, message, span);
}

/**
 * Create a warning diagnostic
 */
function warning(message: string, span: SourceSpan): Diagnostic {
    return makeDiagnostic(Level.Warning, message, span);
}

/**
 * Create a note diagnostic
 */
function note(message: string, span: SourceSpan): Diagnostic {
    return makeDiagnostic(Level.Note, message, span);
}

/**
 * Create a help diagnostic
 */
function help(message: string, span: SourceSpan): Diagnostic {
    return makeDiagnostic(Level.Help, message, span);
}

/**
 * Add related information to a diagnostic
 */
function withRelated(
    diag: Diagnostic,
    span: SourceSpan,
    message: string,
): Diagnostic {
    const related = diag.related || [];
    related.push({ span, message });
    return { ...diag, related };
}
/**
 * Add an error code to a diagnostic
 */
function withCode(diag: Diagnostic, code: string): Diagnostic {
    return { ...diag, code };
}
/**
 * Add a hint to a diagnostic
 */
function withHint(diag: Diagnostic, hint: string): Diagnostic {
    return { ...diag, hint };
}
// ============================================================================
// Task 13.4: Error Collection
// ============================================================================

/**
 * Collects diagnostics during compilation
 */
class DiagnosticCollector {
    diagnostics: Diagnostic[];
    #hasErrors: boolean;
    constructor() {
        /** @type {Diagnostic[]} */
        this.diagnostics = [];
        this.#hasErrors = false;
    }
    /**
     * Add a diagnostic
     */
    add(diag: Diagnostic) {
        this.diagnostics.push(diag);
        if (diag.level === Level.Error) {
            this.#hasErrors = true;
        }
    }
    addError(message: string, span: SourceSpan) {
        this.add(error(message, span));
    }
    addWarning(message: string, span: SourceSpan) {
        this.add(warning(message, span));
    }
    addNote(message: string, span: SourceSpan) {
        this.add(note(message, span));
    }
    addHelp(message: string, span: SourceSpan) {
        this.add(help(message, span));
    }

    hasErrors(): boolean {
        return this.#hasErrors;
    }
    hasWarnings(): boolean {
        return this.diagnostics.some((d) => d.level === Level.Warning);
    }
    getDiagnostics(): Diagnostic[] {
        return [...this.diagnostics];
    }
    getErrors(): Diagnostic[] {
        return this.diagnostics.filter((d) => d.level === Level.Error);
    }
    getWarnings(): Diagnostic[] {
        return this.diagnostics.filter((d) => d.level === Level.Warning);
    }
    clear() {
        this.diagnostics = [];
        this.#hasErrors = false;
    }
    countByLevel(level: number): number {
        return this.diagnostics.filter((d) => d.level === level).length;
    }
    merge(other: DiagnosticCollector) {
        for (const diag of other.diagnostics) {
            this.add(diag);
        }
    }
}
/**
 * Create a new diagnostic collector
 */
function createCollector(): DiagnosticCollector {
    return new DiagnosticCollector();
}

// ============================================================================
// Task 13.5: Result Type
// ============================================================================

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a successful result
 */
function ok$1<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

/**
 * Create an error result
 */
function err$1<E>(error: E): Result<never, E> {
    return { ok: false, error };
}

/**
 * Check if a result is successful
 */
export function isOk<T, E>(
    result: Result<T, E>,
): result is Result<T, never> & { value: T } {
    return result.ok;
}

/**
 * Check if a result is an error
 */
export function isErr<T, E>(
    result: Result<T, E>,
): result is Result<never, E> & { error: E } {
    return !result.ok;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.ok) {
        return result.value;
    }
    throw new Error(
        result.error instanceof Error
            ? result.error.message
            : String(result.error),
    );
}

/**
 * Unwrap a result, returning a default value if it's an error
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.value : defaultValue;
}

/**
 * Map a result's value if successful
 */
export function map<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => U,
): Result<U, E> {
    if (result.ok) {
        return ok$1(fn(result.value));
    }
    return /** @type {Result<U, E>} */ result;
}

/**
 * Map a result's error if it's an error
 */
export function mapErr<T, E, F>(
    result: Result<T, E>,
    fn: (error: E) => F,
): Result<T, F> {
    if (!result.ok) {
        return err$1(fn(result.error));
    }
    return /** @type {Result<T, F>} */ result;
}

/**
 * Chain a result with another operation
 */
export function andThen<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>,
): Result<U, E> {
    if (result.ok) {
        return fn(result.value);
    }
    return /** @type {Result<U, E>} */ result;
}

/**
 * Combine multiple results, collecting all errors
 */
function combineResults$1<T, E>(results: Result<T, E>[]): Result<T[], E[]> {
    /** @type {T[]} */
    const values: T[] = [];
    /** @type {E[]} */
    const errors: E[] = [];
    for (const result of results) {
        if (result.ok) {
            values.push(result.value);
        } else {
            errors.push(result.error);
        }
    }
    if (errors.length > 0) {
        return err$1(errors);
    }
    return ok$1(values);
}

// ============================================================================
// Task 13.7: Source Context
// ============================================================================

/**
 * Provides source code context for rendering diagnostics
 */
class SourceContext {
    source: string;
    file?: string;
    #lines: string[] | null;
    constructor(source: string, file: string) {
        this.source = source;
        this.file = file;
        this.#lines = null;
    }
    /**
     * Get source lines (lazy initialization)
     */
    get lines(): string[] {
        if (this.#lines === null) {
            this.#lines = this.source.split("\n");
        }
        return this.#lines;
    }
    /**
     * Get a specific line (1-based)
     */
    getLine(lineNum: number): string | null {
        if (lineNum < 1 || lineNum > this.lines.length) {
            return null;
        }
        return this.lines[lineNum - 1];
    }
    /**
     * Get the total number of lines
     */
    get lineCount(): number {
        return this.lines.length;
    }
    /**
     * Get source text for a span
     */
    getText(span: SourceSpan): string | null {
        const startLine = this.getLine(span.start.line);
        const endLine = this.getLine(span.end.line);
        if (!startLine || !endLine) return null;
        if (span.start.line === span.end.line) {
            return startLine.substring(
                span.start.column - 1,
                span.end.column - 1,
            );
        }
        // Multi-line span
        const parts = [startLine.substring(span.start.column - 1)];
        for (let i = span.start.line + 1; i < span.end.line; i++) {
            const line = this.getLine(i);
            if (line) parts.push(line);
        }
        parts.push(endLine.substring(0, span.end.column - 1));
        return parts.join("\n");
    }

    /**
     * Get the line number width for formatting
     */
    get lineNumberWidth(): number {
        return String(this.lineCount).length;
    }
}

/**
 * Create a source context
 */
function createSourceContext(source: string, file: string): SourceContext {
    return new SourceContext(source, file);
}

// ============================================================================
// Task 13.3: Diagnostic Renderer
// ============================================================================

const LEVEL_NAMES: Record<number, string> = {
    [Level.Error]: "error",
    [Level.Warning]: "warning",
    [Level.Note]: "note",
    [Level.Help]: "help",
};
/**
 * Level ANSI colors
 */
const LEVEL_COLORS: Record<number, string> = {
    [Level.Error]: "\x1b[31m", // Red
    [Level.Warning]: "\x1b[33m", // Yellow
    [Level.Note]: "\x1b[36m", // Cyan
    [Level.Help]: "\x1b[32m", // Green
};

/** @type {string} */
const RESET: string = "\x1b[0m";
/** @type {string} */
const BOLD: string = "\x1b[1m";
/** @type {string} */
const DIM: string = "\x1b[2m";
/** @type {string} */
const BLUE: string = "\x1b[34m";

/**
 * Render a diagnostic to a string
 * @param {boolean} [options.color=true] - Whether to use ANSI colors
 */
function renderDiagnostic(
    diag: Diagnostic,
    ctx: SourceContext,
    options: { color?: boolean } = { color: true },
): string {
    const { color } = options;
    const lines = [];

    // Header: level and message
    const levelName = LEVEL_NAMES[diag.level] || "unknown";
    const levelColor = color ? LEVEL_COLORS[diag.level] || "" : "";
    const reset = color ? RESET : "";
    const bold = color ? BOLD : "";

    let header = `${levelColor}${bold}${levelName}${reset}`;
    if (diag.code) {
        header += `${bold}[${diag.code}]${reset}`;
    }
    header += `: ${diag.message}`;

    lines.push(header);
    // Location
    if (diag.span) {
        const loc = diag.span.start;
        let locStr = `  `;
        if (loc.file) {
            locStr += `${loc.file}:`;
        }
        locStr += `${loc.line}:${loc.column}`;
        lines.push(locStr);
    }
    // Source code snippet
    if (ctx && diag.span) {
        const snippet = renderSnippet(diag.span, ctx, color);
        if (snippet) {
            lines.push("");
            lines.push(snippet);
        }
    }
    // Hint
    if (diag.hint) {
        const helpColor = color ? LEVEL_COLORS[Level.Help] || "" : "";
        lines.push(`  ${helpColor}hint${reset}: ${diag.hint}`);
    }
    // Related information
    if (diag.related && diag.related.length > 0) {
        for (const rel of diag.related) {
            lines.push("");
            const noteColor = color ? LEVEL_COLORS[Level.Note] || "" : "";
            lines.push(`  ${noteColor}note${reset}: ${rel.message}`);
            if (rel.span.start.file) {
                lines.push(
                    `    --> ${rel.span.start.file}:${rel.span.start.line}:${rel.span.start.column}`,
                );
            } else {
                lines.push(
                    `    --> ${rel.span.start.line}:${rel.span.start.column}`,
                );
            }
        }
    }
    return lines.join("\n");
}

/**
 * Render a source code snippet with highlighting
 */
function renderSnippet(
    span: SourceSpan,
    ctx: SourceContext,
    color: boolean = true,
): string {
    const lines = [];
    const width = ctx.lineNumberWidth;
    const reset = color ? RESET : "";
    const dim = color ? DIM : "";
    const startLine = span.start.line;
    const endLine = span.end.line;
    // Calculate display range (show context around the span)
    const contextLines = 1;
    const displayStart = Math.max(1, startLine - contextLines);
    const displayEnd = Math.min(ctx.lineCount, endLine + contextLines);
    for (let lineNum = displayStart; lineNum <= displayEnd; lineNum++) {
        const line = ctx.getLine(lineNum);
        if (line === null) continue;
        const lineNumStr = String(lineNum).padStart(width);
        const gutter = `${dim}${lineNumStr} |${reset}`;
        if (lineNum >= startLine && lineNum <= endLine) {
            // This line is part of the span
            lines.push(`${gutter} ${line}`);
            // Add underline/caret
            let underlineStart = 0;
            let underlineEnd = line.length;
            if (lineNum === startLine) {
                underlineStart = span.start.column - 1;
            }
            if (lineNum === endLine) {
                underlineEnd = span.end.column - 1;
            }
            // Build the underline
            const underline = buildUnderline(
                underlineStart,
                underlineEnd,
                color,
            );
            lines.push(`${dim}${" ".repeat(width)} |${reset} ${underline}`);
        } else {
            // Context line
            lines.push(`${dim}${lineNumStr} |${reset} ${dim}${line}${reset}`);
        }
    }
    return lines.join("\n");
}

/**
 * Build an underline string
 */
function buildUnderline(
    start: number,
    end: number,
    color: boolean = true,
): string {
    const reset = color ? RESET : "";
    const bold = color ? BOLD : "";
    const blue = color ? BLUE : "";
    const spaces = " ".repeat(start);
    const carets = "^".repeat(Math.max(1, end - start));
    return `${spaces}${blue}${bold}${carets}${reset}`;
}
/**
 * Render all diagnostics from a collector
 */
function renderDiagnostics(
    collector: DiagnosticCollector,
    ctx: SourceContext,
    options: object = {},
): string {
    return collector
        .getDiagnostics()
        .map((d) => renderDiagnostic(d, ctx, options))
        .join("\n\n");
}

// ============================================================================
// Task 13.6: Error Formatting Utilities
// ============================================================================

/**
 * Format a type mismatch error
 */
function formatTypeMismatch(
    expected: string,
    found: string,
    span: SourceSpan,
): Diagnostic {
    return error(
        `Type mismatch: expected \`${expected}\`, found \`${found}\``,
        span,
    );
}
/**
 * Format an undefined variable error
 */
function formatUndefinedVar(name: string, span: SourceSpan): Diagnostic {
    const diag = error(`Cannot find value \`${name}\` in this scope`, span);
    return withCode(diag, "E0425");
}
/**
 * Format a duplicate definition error
 */
function formatDuplicateDef(
    name: string,
    span: SourceSpan,
    prevSpan: SourceSpan,
): Diagnostic {
    const diag = error(`Duplicate definition of \`${name}\``, span);
    if (prevSpan) {
        return withRelated(diag, prevSpan, "previous definition here");
    }
    return diag;
}
/**
 * Format an arity mismatch error
 */
function formatArityMismatch(
    expected: number,
    found: number,
    span: SourceSpan,
): Diagnostic {
    const expectedStr = expected === 1 ? "1 argument" : `${expected} arguments`;
    const foundStr = found === 1 ? "1 argument" : `${found} arguments`;
    return error(`Expected ${expectedStr}, found ${foundStr}`, span);
}
/**
 * Format a missing field error
 */
function formatMissingField(
    structName: string,
    fieldName: string,
    span: SourceSpan,
): Diagnostic {
    return error(
        `Missing field \`${fieldName}\` in struct \`${structName}\``,
        span,
    );
}
/**
 * Format an unknown field error
 */
function formatUnknownField(
    structName: string,
    fieldName: string,
    span: SourceSpan,
): Diagnostic {
    return error(
        `Unknown field \`${fieldName}\` in struct \`${structName}\``,
        span,
    );
}
/**
 * Format a missing return type error
 */
function formatMissingReturnType(span: SourceSpan): Diagnostic {
    return warning(
        "Function without return type annotation defaults to `()`",
        span,
    );
}
/**
 * Format an unreachable code warning
 */
function formatUnreachableCode(span: SourceSpan): Diagnostic {
    return warning("Unreachable code", span);
}
/**
 * Format an unused variable warning
 */
function formatUnusedVar(name: string, span: SourceSpan): Diagnostic {
    const diag = warning(`Unused variable: \`${name}\``, span);
    return withHint(diag, "Prefix with underscore to silence: `_" + name + "`");
}
/**
 * Format a dead code warning
 */
function formatDeadCode(name: string, span: SourceSpan): Diagnostic {
    return warning(`Dead code: \`${name}\` is never used`, span);
}
/**
 * Format a borrow checker error
 */
function formatBorrowError(
    message: string,
    span: SourceSpan,
    borrowSpan: SourceSpan,
): Diagnostic {
    const diag = error(message, span);
    if (borrowSpan) {
        return withRelated(diag, borrowSpan, "borrow occurs here");
    }
    return diag;
}
/**
 * Format a move error
 */
function formatMoveError(
    varName: string,
    span: SourceSpan,
    moveSpan: SourceSpan,
): Diagnostic {
    const diag = error(`Use of moved value: \`${varName}\``, span);
    if (moveSpan) {
        return withRelated(diag, moveSpan, "value moved here");
    }
    return diag;
}

export {
    // Source Location
    makeSourceLocation,
    makeSourceSpan,
    spanToSourceSpan,
    makeSourceSpanFromLC,
    // Diagnostic Structure
    Level,
    makeDiagnostic,
    error,
    warning,
    note,
    help,
    withRelated,
    withCode,
    withHint,
    // Diagnostic Collector
    DiagnosticCollector,
    createCollector,
    // Result Type
    ok$1 as ok,
    err$1 as err,
    combineResults$1 as combineResults,
    // Source Context
    SourceContext,
    createSourceContext,
    // Diagnostic Renderer
    renderDiagnostic,
    renderSnippet,
    renderDiagnostics,
    LEVEL_NAMES,
    // Error Formatting
    formatTypeMismatch,
    formatUndefinedVar,
    formatDuplicateDef,
    formatArityMismatch,
    formatMissingField,
    formatUnknownField,
    formatMissingReturnType,
    formatUnreachableCode,
    formatUnusedVar,
    formatDeadCode,
    formatBorrowError,
    formatMoveError,
};
