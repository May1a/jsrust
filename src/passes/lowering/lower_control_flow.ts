import type { Result } from "better-result";
import type { Expression } from "../../parse/ast";
import type { IRBuilder } from "../../ir/ir_builder";
import type { IRModule, IRType } from "../../ir/ir";
import type {
    LocalBinding,
    LoopFrame,
    LoweredValue,
    LoweringError,
} from "./types";

export interface LoweringCfgCtx {
    loopStack: LoopFrame[];
    currentReturnType: IRType;
    locals: Map<string, LocalBinding>;
    enumVariantTags: Map<string, number>;
    enumVariantOwners: Map<string, string>;
    structFieldNames: Map<string, string[]>;
    irModule: IRModule;
    lowerExpression: (expr: Expression) => Result<LoweredValue, LoweringError>;
}

export type LowerControlFlow = (
    expr: Expression,
    builder: IRBuilder,
    ctx: LoweringCfgCtx,
) => Result<LoweredValue, LoweringError>;
