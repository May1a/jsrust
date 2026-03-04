import { Result, type Result as BetterResult } from "better-result";
import { compile, type CompileError } from "../src/compile";

export function compileToIR(source: string): BetterResult<string, CompileError> {
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
