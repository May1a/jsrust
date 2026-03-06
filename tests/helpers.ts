import { Result } from "better-result";
import { compile, type CompileError } from "../src/compile";

export function compileToIR(source: string): Result<string, CompileError> {
    const result = compile(source);
    if (result.isErr()) {
        return result;
    }

    const { ir } = result.value;
    if (ir === undefined) {
        return Result.ok("");
    }

    return Result.ok(`${ir}\n`);
}
