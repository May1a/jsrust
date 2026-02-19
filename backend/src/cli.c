#include "cli.h"

#include "bytes.h"

static CLIOptions CLI_error(const char* message)
{
    CLIOptions options;

    options.ok = false;
    options.showUsage = true;
    options.inputPath = NULL;
    options.entryName = ByteSpan_fromCString("main");
    options.traceEnabled = false;
    options.traceOutPath = NULL;
    options.status = BackendStatus_make(JSRUST_BACKEND_ERR_INVALID_ARGS, ByteSpan_fromCString(message));
    return options;
}

CLIOptions CLI_parse(int argc, const char** argv)
{
    CLIOptions options;
    int index;

    options.ok = true;
    options.showUsage = false;
    options.inputPath = NULL;
    options.entryName = ByteSpan_fromCString("main");
    options.traceEnabled = false;
    options.traceOutPath = NULL;
    options.status = BackendStatus_ok();

    if (argc < 2)
        return CLI_error("missing command");

    if (!ByteSpan_equalLiteral(ByteSpan_fromCString(argv[1]), "run"))
        return CLI_error("expected command: run");

    index = 2;
    while (index < argc) {
        ByteSpan arg;

        arg = ByteSpan_fromCString(argv[index]);
        if (ByteSpan_equalLiteral(arg, "--input")) {
            ++index;
            if (index >= argc)
                return CLI_error("missing value for --input");
            options.inputPath = argv[index];
        } else if (ByteSpan_equalLiteral(arg, "--entry")) {
            ++index;
            if (index >= argc)
                return CLI_error("missing value for --entry");
            options.entryName = ByteSpan_fromCString(argv[index]);
        } else if (ByteSpan_equalLiteral(arg, "--trace")) {
            options.traceEnabled = true;
        } else if (ByteSpan_equalLiteral(arg, "--trace-out")) {
            ++index;
            if (index >= argc)
                return CLI_error("missing value for --trace-out");
            options.traceOutPath = argv[index];
        } else if (ByteSpan_equalLiteral(arg, "--help") || ByteSpan_equalLiteral(arg, "-h")) {
            options.ok = false;
            options.showUsage = true;
            options.status = BackendStatus_ok();
            return options;
        } else {
            return CLI_error("unknown argument");
        }
        ++index;
    }

    if (!options.inputPath)
        return CLI_error("--input is required");

    if (options.traceOutPath && !options.traceEnabled)
        return CLI_error("--trace-out requires --trace");

    return options;
}

