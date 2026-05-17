import { Result } from "better-result";
import { compileToLlvm, type CompileError } from "../src/compile";

export function compileToLlvmText(
    source: string,
): Result<string, CompileError> {
    const result = compileToLlvm(source, { validate: true });
    if (result.isErr()) {
        return result;
    }

    return Result.ok(result.value.ll);
}
