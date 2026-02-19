#include "backend_api.h"
#include "cli.h"
#include "errors.h"
#include "log.h"

#include <stdio.h>

int main(int argc, char** argv)
{
    CLIOptions options;
    jsrust_backend_exec_result result;

    options = CLI_parse(argc, (const char**)argv);
    if (!options.ok) {
        if (options.status.code != JSRUST_BACKEND_OK)
            Log_writeStatusLine(stderr, options.status);
        if (options.showUsage)
            Log_writeUsage(stderr);
        if (options.status.code == JSRUST_BACKEND_OK)
            return 0;
        return BackendError_exitCode(options.status.code);
    }

    result = jsrust_backend_run_file(
        options.inputPath,
        (const char*)options.entryName.data,
        options.traceEnabled ? 1 : 0,
        options.traceOutPath);

    if (result.code != JSRUST_BACKEND_OK) {
        BackendStatus status;

        status.code = result.code;
        status.message = ByteSpan_fromCString(result.message ? result.message : "error");
        Log_writeStatusLine(stderr, status);
        return BackendError_exitCode(result.code);
    }

    if (result.has_exit_value)
        fprintf(stdout, "ok exit=%lld\n", (long long)result.exit_value);
    else
        fprintf(stdout, "ok\n");

    return 0;
}

