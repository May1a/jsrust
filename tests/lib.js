/**
 * @typedef {{ name: string, fn: () => void | Promise<void> }} Test
 * @typedef {{ passed: number, failed: number, errors: { test: string, message: string }[] }} TestResult
 */

/** @type {{ test: string, message: string }[]} */
const errors = [];
let totalTestsRun = 0;

/**
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
export function test(name, fn) {
    totalTestsRun++;
    try {
        fn();
    } catch (e) {
        if (e instanceof Error && e.stack) {
            console.error(e.stack);
        }
        errors.push({
            test: name,
            message: e instanceof Error ? e.message : String(e),
        });
    }
}

/**
 * @param {string} name
 * @param {() => void} fn
 */
export function testGroup(name, fn) {
    console.log(`\n=== ${name} ===`);
    fn();
}

/**
 * @param {string} msg
 * @param {() => void} fn
 */
export function assert(msg, fn) {
    test(msg, fn);
}

/**
 * @param {any} actual
 * @param {any} expected
 * @param {string} [msg]
 */
export function assertEq(actual, expected, msg) {
    assertEqual(actual, expected, msg);
}

/**
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 * @returns {Promise<void>}
 */
export function testAsync(name, fn) {
    const result = fn();
    if (result instanceof Promise) {
        return result.catch(
            /** @param {unknown} e */(e) => {
                errors.push({
                    test: name,
                    message: e instanceof Error ? e.message : String(e),
                });
            },
        );
    }
    return Promise.resolve();
}

/**
 * @param {any} actual
 * @param {any} expected
 * @param {string} [msg]
 */
export function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(
            msg ||
            `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
    }
}

/**
 * @param {any} value
 * @param {string} [msg]
 */
export function assertTrue(value, msg) {
    if (!value) {
        throw new Error(
            msg || `Expected truthy value, got ${JSON.stringify(value)}`,
        );
    }
}

/**
 * @param {any} actual
 * @param {any[]} expected
 * @param {string} [msg]
 */
export function assertArrayEqual(actual, expected, msg) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
        throw new Error(msg || "Both values must be arrays");
    }
    if (actual.length !== expected.length) {
        throw new Error(
            msg ||
            `Array length mismatch: expected ${expected.length}, got ${actual.length}`,
        );
    }
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
            throw new Error(
                msg ||
                `Array mismatch at index ${i}: expected ${JSON.stringify(expected[i])}, got ${JSON.stringify(actual[i])}`,
            );
        }
    }
}

/**
 * @param {{ type: number, value: string, line: number, column: number }[]} tokens
 * @param {{ type: number, value: string }[]} expected
 */
export function assertTokensMatch(tokens, expected) {
    if (tokens.length !== expected.length + 1) {
        const actualStr = tokens
            .slice(0, -1)
            .map((t) => t.value)
            .join(" ");
        const expectedStr = expected.map((t) => t.value).join(" ");
        throw new Error(
            `Token count mismatch.\n  Got: [${actualStr}]\n  Expected: [${expectedStr}]`,
        );
    }
    for (let i = 0; i < expected.length; i++) {
        if (tokens[i].type !== expected[i].type) {
            throw new Error(
                `Token type mismatch at index ${i} (${JSON.stringify(tokens[i].value)}): expected type ${expected[i].type}, got ${tokens[i].type}`,
            );
        }
        if (tokens[i].value !== expected[i].value) {
            throw new Error(
                `Token value mismatch at index ${i}: expected ${JSON.stringify(expected[i].value)}, got ${JSON.stringify(tokens[i].value)}`,
            );
        }
    }
}

/**
 * @returns {TestResult}
 */
export function getResults() {
    return {
        passed: 0,
        failed: errors.length,
        errors: [...errors],
    };
}

/**
 * @param {string} name
 * @param {TestResult} result
 */
export function mergeResult(name, result) {
    for (const e of result.errors) {
        errors.push({ test: `${name} > ${e.test}`, message: e.message });
    }
}

/**
 * @returns {boolean}
 */
export function printSummary() {
    const failed = errors.length;
    const passed = totalTestsRun - failed;

    console.log("==================================================");
    if (failed === 0) {
        console.log(`All ${totalTestsRun} tests passed!`);
    } else {
        console.log(`Tests: ${passed} passed, ${failed} failed, ${totalTestsRun} total`);
        console.log(`\nFailures:`);
        for (const e of errors) {
            console.log(`  - ${e.test}: ${e.message}`);
        }
    }
    console.log("==================================================");

    return failed === 0;
}

export function clearErrors() {
    errors.length = 0;
    totalTestsRun = 0;
}

export { errors };
