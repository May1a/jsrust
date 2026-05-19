import type { Result } from "better-result";
import type { ClosureExpr } from "../../parse/ast";
import type { IRBuilder } from "../../ir/ir_builder";
import type { IRModule, IRType } from "../../ir/ir";
import type {
    LocalBinding,
    LoweredValue,
    LoweringError,
} from "./types";

export interface LoweringClosureCtx {
    locals: Map<string, LocalBinding>;
    functionIds: Map<string, number>;
    functionReturnTypes: Map<string, IRType>;
    irModule: IRModule;
}

export type LowerClosure = (
    expr: ClosureExpr,
    builder: IRBuilder,
    ctx: LoweringClosureCtx,
) => Result<LoweredValue, LoweringError>;
