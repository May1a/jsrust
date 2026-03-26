import { Result } from "better-result";
import { compile, type CompileError } from "../src/compile";

export function compileToIR(source: string): Result<string, CompileError> {
    const result = compile(source);
    if (result.isErr()) {
        return result;
    }

    return Result.ok(`${result.value.ir}\n`);
}
