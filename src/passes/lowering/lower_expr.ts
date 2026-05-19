import type { Result } from "better-result";
import type { Expression } from "../../parse/ast";
import type { IRBuilder } from "../../ir/ir_builder";
import type { IRModule, IRType } from "../../ir/ir";
import type {
    LocalBinding,
    LoweredValue,
    LoweringConstBinding,
    LoweringError,
} from "./types";

export interface LoweringExprCtx {
    locals: Map<string, LocalBinding>;
    constScopes: Map<string, LoweringConstBinding>[];
    constResolutionStack: LoweringConstBinding[];
    functionIds: Map<string, number>;
    functionReturnTypes: Map<string, IRType>;
    structFieldNames: Map<string, string[]>;
    enumVariantTags: Map<string, number>;
    enumVariantOwners: Map<string, string>;
    namedConsts: Map<string, LoweringConstBinding>;
    irModule: IRModule;
    currentReturnType: IRType;
    expectedValueTypes: IRType[];
}

export type LowerExpression = (
    expr: Expression,
    builder: IRBuilder,
    ctx: LoweringExprCtx,
) => Result<LoweredValue, LoweringError>;
