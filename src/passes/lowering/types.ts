import type { Result } from "better-result";
import type { CallExpr, Span, Expression, TypeNode } from "../../parse/ast";
import type { BlockId, IRModule, IRType, ValueId } from "../../ir/ir";
import type { SubstitutionMap } from "../monomorphize";

export enum LoweringErrorKind {
    UnsupportedNode,
    UnknownVariable,
    InvalidAssignmentTarget,
    BreakOutsideLoop,
    ContinueOutsideLoop,
}

export interface LoweringError {
    kind: LoweringErrorKind;
    message: string;
    span: Span;
}

export interface LoweringInput {
    irModule: IRModule;
    structFieldNames: Map<string, string[]>;
    fnIdMap: Map<string, number>;
    functionReturnTypes: Map<string, IRType>;
    enumVariantTags: Map<string, number>;
    enumVariantOwners: Map<string, string>;
    namedConsts: Map<string, LoweringConstBinding>;
    implConsts: Map<string, Map<string, LoweringConstBinding>>;
    getCallSubstitution: (expr: CallExpr) => SubstitutionMap | undefined;
}

export interface LoweredValue {
    id: ValueId;
    ty: IRType;
}

export interface LocalBinding {
    ptr: ValueId;
    ty: IRType;
    formatTag?: FormatTag;
    typeNode?: TypeNode;
}

export interface LoopFrame {
    breakBlock: BlockId;
    continueBlock: BlockId;
}

export interface LoweringConstBinding {
    key: string;
    typeNode: TypeNode;
    value: Expression;
    span: Span;
    selfTypeName?: string;
}

export enum FormatTag {
    String = 0,
    Int = 1,
    Float = 2,
    Bool = 3,
    Char = 4,
}

export interface FormatTemplate {
    literal: string;
    placeholderCount: number;
}

export type LoweringResult<T> = Result<T, LoweringError>;
