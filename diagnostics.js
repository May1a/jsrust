// ============================================================================
// Diagnostics and Error Reporting
// ============================================================================

/** @typedef {import("./types.js").Span} Span */

// ============================================================================
// Task 13.1: Source Location
// ============================================================================

/**
 * Represents a position in source code
 * @typedef {object} SourceLocation
 * @property {string} [file] - Optional file path
 * @property {number} line - 1-based line number
 * @property {number} column - 1-based column number
 */

/**
 * Represents a range in source code
 * @typedef {object} SourceSpan
 * @property {SourceLocation} start - Start location
 * @property {SourceLocation} end - End location
 */

/**
 * Create a source location
 * @param {number} line - 1-based line number
 * @param {number} column - 1-based column number
 * @param {string} [file] - Optional file path
 * @returns {SourceLocation}
 */
function makeSourceLocation(line, column, file) {
    return { line, column, file };
}

/**
 * Create a source span
 * @param {SourceLocation} start - Start location
 * @param {SourceLocation} end - End location
 * @returns {SourceSpan}
 */
function makeSourceSpan(start, end) {
    return { start, end };
}

/**
 * Convert a Span (from types.js) to a SourceSpan
 * @param {Span} span
 * @param {string} [file] - Optional file path
 * @returns {SourceSpan}
 */
function spanToSourceSpan(span, file) {
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
 * @param {number} startLine
 * @param {number} startColumn
 * @param {number} endLine
 * @param {number} endColumn
 * @param {string} [file]
 * @returns {SourceSpan}
 */
function makeSourceSpanFromLC(
    startLine,
    startColumn,
    endLine,
    endColumn,
    file,
) {
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
const Level = {
    Error: 0,
    Warning: 1,
    Note: 2,
    Help: 3,
};

/**
 * @typedef {object} RelatedInfo
 * @property {SourceSpan} span
 * @property {string} message
 */

/**
 * @typedef {object} Diagnostic
 * @property {number} level - Diagnostic level (from Level enum)
 * @property {string} message - Main diagnostic message
 * @property {SourceSpan} [span] - Source location
 * @property {string} [code] - Optional error code (e.g., "E0001")
 * @property {RelatedInfo[]} [related] - Related information
 * @property {string} [hint] - Optional hint for fixing the issue
 */

/**
 * Create a diagnostic
 * @param {number} level - Diagnostic level
 * @param {string} message - Main message
 * @param {SourceSpan} [span] - Source location
 * @returns {Diagnostic}
 */
function makeDiagnostic(level, message, span) {
    return { level, message, span };
}

/**
 * Create an error diagnostic
 * @param {string} message
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function error(message, span) {
    return makeDiagnostic(Level.Error, message, span);
}

/**
 * Create a warning diagnostic
 * @param {string} message
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function warning(message, span) {
    return makeDiagnostic(Level.Warning, message, span);
}

/**
 * Create a note diagnostic
 * @param {string} message
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function note(message, span) {
    return makeDiagnostic(Level.Note, message, span);
}

/**
 * Create a help diagnostic
 * @param {string} message
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function help(message, span) {
    return makeDiagnostic(Level.Help, message, span);
}

/**
 * Add related information to a diagnostic
 * @param {Diagnostic} diag
 * @param {SourceSpan} span
 * @param {string} message
 * @returns {Diagnostic}
 */
function withRelated(diag, span, message) {
    const related = diag.related || [];
    related.push({ span, message });
    return { ...diag, related };
}

/**
 * Add an error code to a diagnostic
 * @param {Diagnostic} diag
 * @param {string} code
 * @returns {Diagnostic}
 */
function withCode(diag, code) {
    return { ...diag, code };
}

/**
 * Add a hint to a diagnostic
 * @param {Diagnostic} diag
 * @param {string} hint
 * @returns {Diagnostic}
 */
function withHint(diag, hint) {
    return { ...diag, hint };
}

// ============================================================================
// Task 13.4: Error Collection
// ============================================================================

/**
 * Collects diagnostics during compilation
 */
class DiagnosticCollector {
    constructor() {
        /** @type {Diagnostic[]} */
        this.diagnostics = [];
        this._hasErrors = false;
    }

    /**
     * Add a diagnostic
     * @param {Diagnostic} diag
     */
    add(diag) {
        this.diagnostics.push(diag);
        if (diag.level === Level.Error) {
            this._hasErrors = true;
        }
    }

    /**
     * Add an error
     * @param {string} message
     * @param {SourceSpan} [span]
     */
    addError(message, span) {
        this.add(error(message, span));
    }

    /**
     * Add a warning
     * @param {string} message
     * @param {SourceSpan} [span]
     */
    addWarning(message, span) {
        this.add(warning(message, span));
    }

    /**
     * Add a note
     * @param {string} message
     * @param {SourceSpan} [span]
     */
    addNote(message, span) {
        this.add(note(message, span));
    }

    /**
     * Add a help message
     * @param {string} message
     * @param {SourceSpan} [span]
     */
    addHelp(message, span) {
        this.add(help(message, span));
    }

    /**
     * Check if any errors have been added
     * @returns {boolean}
     */
    hasErrors() {
        return this._hasErrors;
    }

    /**
     * Check if any warnings have been added
     * @returns {boolean}
     */
    hasWarnings() {
        return this.diagnostics.some((d) => d.level === Level.Warning);
    }

    /**
     * Get all diagnostics
     * @returns {Diagnostic[]}
     */
    getDiagnostics() {
        return [...this.diagnostics];
    }

    /**
     * Get only errors
     * @returns {Diagnostic[]}
     */
    getErrors() {
        return this.diagnostics.filter((d) => d.level === Level.Error);
    }

    /**
     * Get only warnings
     * @returns {Diagnostic[]}
     */
    getWarnings() {
        return this.diagnostics.filter((d) => d.level === Level.Warning);
    }

    /**
     * Clear all diagnostics
     */
    clear() {
        this.diagnostics = [];
        this._hasErrors = false;
    }

    /**
     * Get count of diagnostics by level
     * @param {number} level
     * @returns {number}
     */
    countByLevel(level) {
        return this.diagnostics.filter((d) => d.level === level).length;
    }

    /**
     * Merge diagnostics from another collector
     * @param {DiagnosticCollector} other
     */
    merge(other) {
        for (const diag of other.diagnostics) {
            this.add(diag);
        }
    }
}

/**
 * Create a new diagnostic collector
 * @returns {DiagnosticCollector}
 */
function createCollector() {
    return new DiagnosticCollector();
}

// ============================================================================
// Task 13.5: Result Type
// ============================================================================

/**
 * @template T
 * @template E
 * @typedef {object} Result
 * @property {boolean} ok - True if successful
 * @property {T} [value] - The success value
 * @property {E} [error] - The error value
 */

/**
 * Create a successful result
 * @template T
 * @param {T} value
 * @returns {Result<T, never>}
 */
function ok$1(value) {
    return { ok: true, value };
}

/**
 * Create an error result
 * @template E
 * @param {E} error
 * @returns {Result<never, E>}
 */
function err$1(error) {
    return { ok: false, error };
}

/**
 * Check if a result is successful
 * @template T
 * @template E
 * @param {Result<T, E>} result
 * @returns {result is Result<T, never> & { value: T }}
 */
function isOk(result) {
    return result.ok;
}

/**
 * Check if a result is an error
 * @template T
 * @template E
 * @param {Result<T, E>} result
 * @returns {result is Result<never, E> & { error: E }}
 */
function isErr(result) {
    return !result.ok;
}

/**
 * Unwrap a result, throwing if it's an error
 * @template T
 * @template E
 * @param {Result<T, E>} result
 * @returns {T}
 * @throws {Error} If the result is an error
 */
function unwrap(result) {
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
 * @template T
 * @template E
 * @param {Result<T, E>} result
 * @param {T} defaultValue
 * @returns {T}
 */
function unwrapOr(result, defaultValue) {
    return result.ok ? result.value : defaultValue;
}

/**
 * Map a result's value if successful
 * @template T
 * @template U
 * @template E
 * @param {Result<T, E>} result
 * @param {(value: T) => U} fn
 * @returns {Result<U, E>}
 */
function map(result, fn) {
    if (result.ok) {
        return ok$1(fn(result.value));
    }
    return result;
}

/**
 * Map a result's error if it's an error
 * @template T
 * @template E
 * @template F
 * @param {Result<T, E>} result
 * @param {(error: E) => F} fn
 * @returns {Result<T, F>}
 */
function mapErr(result, fn) {
    if (!result.ok) {
        return err$1(fn(result.error));
    }
    return result;
}

/**
 * Chain a result with another operation
 * @template T
 * @template U
 * @template E
 * @param {Result<T, E>} result
 * @param {(value: T) => Result<U, E>} fn
 * @returns {Result<U, E>}
 */
function andThen(result, fn) {
    if (result.ok) {
        return fn(result.value);
    }
    return result;
}

/**
 * Combine multiple results, collecting all errors
 * @template T
 * @template E
 * @param {Result<T, E>[]} results
 * @returns {Result<T[], E[]>}
 */
function combineResults$1(results) {
    const values = [];
    const errors = [];

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
    /**
     * @param {string} source - The full source code
     * @param {string} [file] - Optional file path
     */
    constructor(source, file) {
        this.source = source;
        this.file = file;
        /** @type {string[]} */
        this._lines = null;
    }

    /**
     * Get source lines (lazy initialization)
     * @returns {string[]}
     */
    get lines() {
        if (this._lines === null) {
            this._lines = this.source.split("\n");
        }
        return this._lines;
    }

    /**
     * Get a specific line (1-based)
     * @param {number} lineNum - 1-based line number
     * @returns {string | null}
     */
    getLine(lineNum) {
        if (lineNum < 1 || lineNum > this.lines.length) {
            return null;
        }
        return this.lines[lineNum - 1];
    }

    /**
     * Get the total number of lines
     * @returns {number}
     */
    get lineCount() {
        return this.lines.length;
    }

    /**
     * Get source text for a span
     * @param {SourceSpan} span
     * @returns {string | null}
     */
    getText(span) {
        const startLine = this.getLine(span.start.line);
        const endLine = this.getLine(span.end.line);

        if (!startLine || !endLine) {
            return null;
        }

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
     * @returns {number}
     */
    get lineNumberWidth() {
        return String(this.lineCount).length;
    }
}

/**
 * Create a source context
 * @param {string} source
 * @param {string} [file]
 * @returns {SourceContext}
 */
function createSourceContext(source, file) {
    return new SourceContext(source, file);
}

// ============================================================================
// Task 13.3: Diagnostic Renderer
// ============================================================================

/**
 * Level names for display
 * @type {Record<number, string>}
 */
const LEVEL_NAMES = {
    [Level.Error]: "error",
    [Level.Warning]: "warning",
    [Level.Note]: "note",
    [Level.Help]: "help",
};

/**
 * Level ANSI colors
 * @type {Record<number, string>}
 */
const LEVEL_COLORS = {
    [Level.Error]: "\x1b[31m", // Red
    [Level.Warning]: "\x1b[33m", // Yellow
    [Level.Note]: "\x1b[36m", // Cyan
    [Level.Help]: "\x1b[32m", // Green
};

/** @type {string} */
const RESET = "\x1b[0m";
/** @type {string} */
const BOLD = "\x1b[1m";
/** @type {string} */
const DIM = "\x1b[2m";
/** @type {string} */
const BLUE = "\x1b[34m";

/**
 * Render a diagnostic to a string
 * @param {Diagnostic} diag
 * @param {SourceContext} [ctx]
 * @param {object} [options]
 * @param {boolean} [options.color=true] - Whether to use ANSI colors
 * @returns {string}
 */
function renderDiagnostic(diag, ctx, options = {}) {
    const { color = true } = options;
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
 * @param {SourceSpan} span
 * @param {SourceContext} ctx
 * @param {boolean} [color=true]
 * @returns {string}
 */
function renderSnippet(span, ctx, color = true) {
    const lines = [];
    const width = ctx.lineNumberWidth;
    const reset = color ? RESET : "";
    const dim = color ? DIM : "";
    const blue = color ? BLUE : "";
    const bold = color ? BOLD : "";

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
 * @param {number} start
 * @param {number} end
 * @param {boolean} [color=true]
 * @returns {string}
 */
function buildUnderline(start, end, color = true) {
    const reset = color ? RESET : "";
    const bold = color ? BOLD : "";
    const blue = color ? BLUE : "";

    const spaces = " ".repeat(start);
    const carets = "^".repeat(Math.max(1, end - start));

    return `${spaces}${blue}${bold}${carets}${reset}`;
}

/**
 * Render all diagnostics from a collector
 * @param {DiagnosticCollector} collector
 * @param {SourceContext} [ctx]
 * @param {object} [options]
 * @returns {string}
 */
function renderDiagnostics(collector, ctx, options = {}) {
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
 * @param {string} expected
 * @param {string} found
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatTypeMismatch(expected, found, span) {
    return error(
        `Type mismatch: expected \`${expected}\`, found \`${found}\``,
        span,
    );
}

/**
 * Format an undefined variable error
 * @param {string} name
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatUndefinedVar(name, span) {
    const diag = error(`Cannot find value \`${name}\` in this scope`, span);
    return withCode(diag, "E0425");
}

/**
 * Format a duplicate definition error
 * @param {string} name
 * @param {SourceSpan} span
 * @param {SourceSpan} [prevSpan]
 * @returns {Diagnostic}
 */
function formatDuplicateDef(name, span, prevSpan) {
    const diag = error(`Duplicate definition of \`${name}\``, span);
    if (prevSpan) {
        return withRelated(diag, prevSpan, "previous definition here");
    }
    return diag;
}

/**
 * Format an arity mismatch error
 * @param {number} expected
 * @param {number} found
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatArityMismatch(expected, found, span) {
    const expectedStr = expected === 1 ? "1 argument" : `${expected} arguments`;
    const foundStr = found === 1 ? "1 argument" : `${found} arguments`;
    return error(`Expected ${expectedStr}, found ${foundStr}`, span);
}

/**
 * Format a missing field error
 * @param {string} structName
 * @param {string} fieldName
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatMissingField(structName, fieldName, span) {
    return error(
        `Missing field \`${fieldName}\` in struct \`${structName}\``,
        span,
    );
}

/**
 * Format an unknown field error
 * @param {string} structName
 * @param {string} fieldName
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatUnknownField(structName, fieldName, span) {
    return error(
        `Unknown field \`${fieldName}\` in struct \`${structName}\``,
        span,
    );
}

/**
 * Format a missing return type error
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatMissingReturnType(span) {
    return warning(
        "Function without return type annotation defaults to `()`",
        span,
    );
}

/**
 * Format an unreachable code warning
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatUnreachableCode(span) {
    return warning("Unreachable code", span);
}

/**
 * Format an unused variable warning
 * @param {string} name
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatUnusedVar(name, span) {
    const diag = warning(`Unused variable: \`${name}\``, span);
    return withHint(diag, "Prefix with underscore to silence: `_" + name + "`");
}

/**
 * Format a dead code warning
 * @param {string} name
 * @param {SourceSpan} [span]
 * @returns {Diagnostic}
 */
function formatDeadCode(name, span) {
    return warning(`Dead code: \`${name}\` is never used`, span);
}

/**
 * Format a borrow checker error
 * @param {string} message
 * @param {SourceSpan} [span]
 * @param {SourceSpan} [borrowSpan]
 * @returns {Diagnostic}
 */
function formatBorrowError(message, span, borrowSpan) {
    const diag = error(message, span);
    if (borrowSpan) {
        return withRelated(diag, borrowSpan, "borrow occurs here");
    }
    return diag;
}

/**
 * Format a move error
 * @param {string} varName
 * @param {SourceSpan} [span]
 * @param {SourceSpan} [moveSpan]
 * @returns {Diagnostic}
 */
function formatMoveError(varName, span, moveSpan) {
    const diag = error(`Use of moved value: \`${varName}\``, span);
    if (moveSpan) {
        return withRelated(diag, moveSpan, "value moved here");
    }
    return diag;
}

// ============================================================================
// Exports
// ============================================================================

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
    isOk,
    isErr,
    unwrap,
    unwrapOr,
    map,
    mapErr,
    andThen,
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
