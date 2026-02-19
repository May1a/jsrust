#include "../src/backend_api.h"
#include "../src/bytes.h"

#include <stdio.h>
#include <stdlib.h>

static int g_failures = 0;

static void Test_fail(const char* message)
{
    fprintf(stderr, "FAIL: %s\n", message);
    g_failures += 1;
}

static void Test_expectCode(jsrust_backend_exec_result result, jsrust_backend_error_code expected, const char* message)
{
    if (result.code != expected) {
        fprintf(stderr, "FAIL: %s (expected code %d, got %d)\n", message, (int)expected, (int)result.code);
        g_failures += 1;
    }
}

static int Test_readFile(const char* path, uint8_t** outData, size_t* outLen)
{
    FILE* file;
    long len;
    size_t got;
    uint8_t* data;

    file = fopen(path, "rb");
    if (!file)
        return 0;

    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return 0;
    }

    len = ftell(file);
    if (len < 0) {
        fclose(file);
        return 0;
    }

    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return 0;
    }

    data = NULL;
    if (len > 0) {
        data = (uint8_t*)malloc((size_t)len);
        if (!data) {
            fclose(file);
            return 0;
        }

        got = fread(data, 1, (size_t)len, file);
        if (got != (size_t)len) {
            free(data);
            fclose(file);
            return 0;
        }
    }

    fclose(file);
    *outData = data;
    *outLen = (size_t)len;
    return 1;
}

static int Test_writeFile(const char* path, const uint8_t* data, size_t len)
{
    FILE* file;
    size_t wrote;

    file = fopen(path, "wb");
    if (!file)
        return 0;

    wrote = fwrite(data, 1, len, file);
    fclose(file);
    return wrote == len;
}

static void Test_positiveFixtures(void)
{
    const char* fixtures[] = {
        "../tests/fixtures/backend_ir_v1/01_empty_main.bin",
        "../tests/fixtures/backend_ir_v1/02_literals.bin",
        "../tests/fixtures/backend_ir_v1/03_arithmetic.bin",
        "../tests/fixtures/backend_ir_v1/04_functions.bin",
        "../tests/fixtures/backend_ir_v1/07_structs.bin",
        "../tests/fixtures/backend_ir_v1/09_references.bin"
    };
    size_t count;
    size_t index;

    count = sizeof(fixtures) / sizeof(fixtures[0]);
    for (index = 0; index < count; ++index) {
        jsrust_backend_exec_result result;

        result = jsrust_backend_run_file(fixtures[index], "main", 0, NULL);
        if (result.code != JSRUST_BACKEND_OK) {
            fprintf(stderr, "FAIL: fixture %s expected success, got code=%d message=%s\n", fixtures[index], (int)result.code, result.message);
            g_failures += 1;
        }
    }
}

static void Test_negativeMagic(void)
{
    uint8_t* data;
    size_t len;

    if (!Test_readFile("../tests/fixtures/backend_ir_v1/01_empty_main.bin", &data, &len)) {
        Test_fail("failed to read fixture for magic mutation");
        return;
    }

    if (len >= 4) {
        data[0] = 0;
        data[1] = 0;
        data[2] = 0;
        data[3] = 0;
    }

    if (!Test_writeFile("tests/tmp_bad_magic.bin", data, len)) {
        Test_fail("failed to write mutated bad magic fixture");
        free(data);
        return;
    }

    free(data);

    Test_expectCode(
        jsrust_backend_run_file("tests/tmp_bad_magic.bin", "main", 0, NULL),
        JSRUST_BACKEND_ERR_DESERIALIZE,
        "bad magic should fail with deserialize error");
}

static void Test_negativeVersion(void)
{
    uint8_t* data;
    size_t len;

    if (!Test_readFile("../tests/fixtures/backend_ir_v1/01_empty_main.bin", &data, &len)) {
        Test_fail("failed to read fixture for version mutation");
        return;
    }

    if (len >= 8) {
        data[4] = 2;
        data[5] = 0;
        data[6] = 0;
        data[7] = 0;
    }

    if (!Test_writeFile("tests/tmp_bad_version.bin", data, len)) {
        Test_fail("failed to write mutated bad version fixture");
        free(data);
        return;
    }

    free(data);

    Test_expectCode(
        jsrust_backend_run_file("tests/tmp_bad_version.bin", "main", 0, NULL),
        JSRUST_BACKEND_ERR_UNSUPPORTED_VERSION,
        "bad version should fail with unsupported version");
}

static void Test_truncated(void)
{
    uint8_t* data;
    size_t len;

    if (!Test_readFile("../tests/fixtures/backend_ir_v1/03_arithmetic.bin", &data, &len)) {
        Test_fail("failed to read fixture for truncation");
        return;
    }

    if (len > 20)
        len = 20;

    if (!Test_writeFile("tests/tmp_truncated.bin", data, len)) {
        Test_fail("failed to write truncated fixture");
        free(data);
        return;
    }

    free(data);

    Test_expectCode(
        jsrust_backend_run_file("tests/tmp_truncated.bin", "main", 0, NULL),
        JSRUST_BACKEND_ERR_DESERIALIZE,
        "truncated binary should fail with deserialize");
}

static void Test_runtimeMissingFunction(void)
{
    uint8_t* data;
    size_t len;
    size_t index;
    int found;

    if (!Test_readFile("../tests/fixtures/backend_ir_v1/04_functions.bin", &data, &len)) {
        Test_fail("failed to read fixture for call mutation");
        return;
    }

    found = 0;
    for (index = 0; index + 4 <= len; ++index) {
        if (data[index + 0] == 0xA1 && data[index + 1] == 0x78 && data[index + 2] == 0x01 && data[index + 3] == 0x00) {
            data[index + 0] = 0xFF;
            data[index + 1] = 0xFF;
            data[index + 2] = 0xFF;
            data[index + 3] = 0xFF;
            found = 1;
            break;
        }
    }

    if (!found)
        Test_fail("failed to locate call target hash in fixture");

    if (!Test_writeFile("tests/tmp_bad_call.bin", data, len)) {
        Test_fail("failed to write bad call fixture");
        free(data);
        return;
    }

    free(data);

    Test_expectCode(
        jsrust_backend_run_file("tests/tmp_bad_call.bin", "main", 0, NULL),
        JSRUST_BACKEND_ERR_EXECUTE,
        "missing callee should fail with execute error");
}

static void Test_traceDeterminism(void)
{
    uint8_t* first;
    uint8_t* second;
    size_t firstLen;
    size_t secondLen;
    size_t index;

    Test_expectCode(
        jsrust_backend_run_file("../tests/fixtures/backend_ir_v1/03_arithmetic.bin", "main", 1, "tests/tmp_trace_one.txt"),
        JSRUST_BACKEND_OK,
        "trace run one should succeed");

    Test_expectCode(
        jsrust_backend_run_file("../tests/fixtures/backend_ir_v1/03_arithmetic.bin", "main", 1, "tests/tmp_trace_two.txt"),
        JSRUST_BACKEND_OK,
        "trace run two should succeed");

    if (!Test_readFile("tests/tmp_trace_one.txt", &first, &firstLen)) {
        Test_fail("failed to read trace one");
        return;
    }
    if (!Test_readFile("tests/tmp_trace_two.txt", &second, &secondLen)) {
        Test_fail("failed to read trace two");
        free(first);
        return;
    }

    if (firstLen != secondLen) {
        Test_fail("trace outputs differ in length");
    } else {
        for (index = 0; index < firstLen; ++index) {
            if (first[index] != second[index]) {
                Test_fail("trace outputs differ in bytes");
                break;
            }
        }
    }

    free(first);
    free(second);
}

int main(void)
{
    Test_positiveFixtures();
    Test_expectCode(
        jsrust_backend_run_file("tests/does_not_exist.bin", "main", 0, NULL),
        JSRUST_BACKEND_ERR_IO,
        "missing file should return io error");

    Test_negativeMagic();
    Test_negativeVersion();
    Test_truncated();
    Test_runtimeMissingFunction();
    Test_traceDeterminism();

    if (g_failures > 0) {
        fprintf(stderr, "Backend tests failed: %d\n", g_failures);
        return 1;
    }

    fprintf(stdout, "Backend tests passed\n");
    return 0;
}

