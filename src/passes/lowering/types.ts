import type { Result } from "better-result";
import type { Span, Expression, TypeNode } from "../../parse/ast";
import type { BlockId, IRModule, IRType, ValueId } from "../../ir/ir";

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

export interface BuilderSnapshot {
    fn: unknown;
    block: unknown;
    sealed: Set<BlockId>;
    varDefs: Map<string, Map<BlockId, ValueId>>;
    incompletePhis: Map<string, Map<BlockId, ValueId[]>>;
    varTypes: Map<string, IRType>;
    nextBlockId: number;
    locals: Map<string, LocalBinding>;
    constScopes: Map<string, LoweringConstBinding>[];
    constResolutionStack: LoweringConstBinding[];
    loopStack: LoopFrame[];
    returnType: IRType;
    expectedValueTypes: IRType[];
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
