import {
    BlockExpr,
    BinaryExpr,
    CallExpr,
    FieldExpr,
    FnItem,
    type GenericFnItem,
    type GenericStructItem,
    IdentifierExpr,
    IfExpr,
    LetStmt,
    LiteralExpr,
    MatchExpr,
    NamedTypeNode,
    type ParamNode,
    RefExpr,
    RefTypeNode,
    ReturnExpr,
    StructExpr,
    StructItem,
    type StructFieldNode,
    type TypeNode,
    UnaryExpr,
    type Expression,
    type Statement,
    ExprStmt,
    LoopExpr,
    WhileExpr,
    ForExpr,
    BreakExpr,
    ContinueExpr,
    AssignExpr,
    ClosureExpr,
    RangeExpr,
    DerefExpr,
    MacroExpr,
    IndexExpr,
    MatchArmNode,
    ArrayTypeNode,
    TupleTypeNode,
    FnTypeNode,
    PtrTypeNode,
    GenericArgsNode,
    ItemStmt,
} from "../parse/ast";

/** Map from generic param name (e.g. "T") to concrete type. */
export type SubstitutionMap = Map<string, TypeNode>;

/**
 * Build the mangled name for a monomorphized specialization.
 * e.g. ("id", {T → i32}) → "id_i32"
 */
export function mangledName(
    baseName: string,
    substitutions: SubstitutionMap,
): string {
    const parts: string[] = [baseName];
    for (const [, ty] of substitutions) {
        parts.push(typeToMangledString(ty));
    }
    return parts.join("_");
}

function typeToMangledString(ty: TypeNode): string {
    if (ty instanceof NamedTypeNode) {
        return ty.name;
    }
    if (ty instanceof RefTypeNode) {
        return `ref_${typeToMangledString(ty.inner)}`;
    }
    if (ty instanceof TupleTypeNode) {
        if (ty.elements.length === 0) return "unit";
        return `tup_${ty.elements.map(typeToMangledString).join("_")}`;
    }
    if (ty instanceof ArrayTypeNode) {
        return `arr_${typeToMangledString(ty.element)}`;
    }
    if (ty instanceof PtrTypeNode) {
        return `ptr_${typeToMangledString(ty.inner)}`;
    }
    return "unknown";
}

// --- Type substitution ---

function substituteType(ty: TypeNode, subs: SubstitutionMap): TypeNode {
    if (ty instanceof NamedTypeNode) {
        const replacement = subs.get(ty.name);
        if (replacement) {
            return replacement;
        }
        if (ty.args !== undefined) {
            const newArgs = ty.args.args.map((arg) =>
                substituteType(arg, subs),
            );
            return new NamedTypeNode(
                ty.span,
                ty.name,
                new GenericArgsNode(ty.args.span, newArgs),
            );
        }
        return ty;
    }
    if (ty instanceof RefTypeNode) {
        return new RefTypeNode(
            ty.span,
            ty.mutability,
            substituteType(ty.inner, subs),
        );
    }
    if (ty instanceof TupleTypeNode) {
        return new TupleTypeNode(
            ty.span,
            ty.elements.map((el) => substituteType(el, subs)),
        );
    }
    if (ty instanceof ArrayTypeNode) {
        return new ArrayTypeNode(
            ty.span,
            substituteType(ty.element, subs),
            ty.length,
        );
    }
    if (ty instanceof PtrTypeNode) {
        return new PtrTypeNode(
            ty.span,
            ty.mutability,
            substituteType(ty.inner, subs),
        );
    }
    if (ty instanceof FnTypeNode) {
        return new FnTypeNode(
            ty.span,
            ty.params.map((p) => substituteType(p, subs)),
            substituteType(ty.returnType, subs),
        );
    }
    return ty;
}

// --- Expression substitution (split into groups to control complexity) ---

function substituteCallExpr(expr: CallExpr, subs: SubstitutionMap): CallExpr {
    const newCallee = substituteExpr(expr.callee, subs);
    const newArgs = expr.args.map((arg) => substituteExpr(arg, subs));
    let newTypeArgs: TypeNode[] | undefined;
    if (expr.genericArgs !== undefined) {
        newTypeArgs = expr.genericArgs.map((ta) => substituteType(ta, subs));
    }
    return new CallExpr(expr.span, newCallee, newArgs, newTypeArgs);
}

function substituteStructExpr(
    expr: StructExpr,
    subs: SubstitutionMap,
): StructExpr {
    const newFields = new Map<string, Expression>();
    for (const [name, fieldExpr] of expr.fields) {
        newFields.set(name, substituteExpr(fieldExpr, subs));
    }
    return new StructExpr(
        expr.span,
        substituteExpr(expr.path, subs),
        newFields,
    );
}

function substituteMatchExpr(
    expr: MatchExpr,
    subs: SubstitutionMap,
): MatchExpr {
    const newArms = expr.arms.map((arm) => {
        let guard: Expression | undefined;
        if (arm.guard !== undefined) {
            guard = substituteExpr(arm.guard, subs);
        }
        return new MatchArmNode(
            arm.span,
            arm.pattern,
            substituteExpr(arm.body, subs),
            guard,
        );
    });
    return new MatchExpr(
        expr.span,
        substituteExpr(expr.matchOn, subs),
        newArms,
    );
}

function substituteControlFlow(
    expr: Expression,
    subs: SubstitutionMap,
): Expression | undefined {
    if (expr instanceof LoopExpr) {
        return new LoopExpr(
            expr.span,
            substituteBlock(expr.body, subs),
            expr.label,
        );
    }
    if (expr instanceof WhileExpr) {
        return new WhileExpr(
            expr.span,
            substituteExpr(expr.condition, subs),
            substituteBlock(expr.body, subs),
            expr.label,
        );
    }
    if (expr instanceof ForExpr) {
        return new ForExpr(
            expr.span,
            expr.pattern,
            substituteExpr(expr.iter, subs),
            substituteBlock(expr.body, subs),
            expr.label,
        );
    }
    if (expr instanceof BreakExpr) {
        return expr;
    }
    if (expr instanceof ContinueExpr) {
        return expr;
    }
    return undefined;
}

function substituteSecondary(
    expr: Expression,
    subs: SubstitutionMap,
): Expression | undefined {
    if (expr instanceof AssignExpr) {
        return new AssignExpr(
            expr.span,
            substituteExpr(expr.target, subs),
            substituteExpr(expr.value, subs),
        );
    }
    if (expr instanceof ClosureExpr) {
        const newParams: ParamNode[] = expr.params.map((p) => ({
            ...p,
            ty: substituteType(p.ty, subs),
        }));
        return new ClosureExpr(
            expr.span,
            newParams,
            substituteType(expr.returnType, subs),
            substituteExpr(expr.body, subs),
        );
    }
    if (expr instanceof RangeExpr) {
        let start: Expression | undefined;
        if (expr.start !== undefined) {
            start = substituteExpr(expr.start, subs);
        }
        let end: Expression | undefined;
        if (expr.end !== undefined) {
            end = substituteExpr(expr.end, subs);
        }
        return new RangeExpr(expr.span, start, end, expr.inclusive);
    }
    if (expr instanceof DerefExpr) {
        return new DerefExpr(expr.span, substituteExpr(expr.target, subs));
    }
    if (expr instanceof MacroExpr) {
        return new MacroExpr(
            expr.span,
            expr.name,
            expr.args.map((arg) => substituteExpr(arg, subs)),
        );
    }
    if (expr instanceof IndexExpr) {
        return new IndexExpr(
            expr.span,
            substituteExpr(expr.receiver, subs),
            substituteExpr(expr.index, subs),
        );
    }
    return undefined;
}

function substitutePrimary(
    expr: Expression,
    subs: SubstitutionMap,
): Expression | undefined {
    if (expr instanceof LiteralExpr || expr instanceof IdentifierExpr) {
        return expr;
    }
    if (expr instanceof BinaryExpr) {
        return new BinaryExpr(
            expr.span,
            expr.op,
            substituteExpr(expr.left, subs),
            substituteExpr(expr.right, subs),
        );
    }
    if (expr instanceof UnaryExpr) {
        return new UnaryExpr(
            expr.span,
            expr.op,
            substituteExpr(expr.operand, subs),
        );
    }
    if (expr instanceof CallExpr) {
        return substituteCallExpr(expr, subs);
    }
    if (expr instanceof FieldExpr) {
        return new FieldExpr(
            expr.span,
            substituteExpr(expr.receiver, subs),
            expr.field,
        );
    }
    if (expr instanceof BlockExpr) {
        return substituteBlock(expr, subs);
    }
    return undefined;
}

function substituteStructuredExpr(
    expr: Expression,
    subs: SubstitutionMap,
): Expression | undefined {
    if (expr instanceof IfExpr) {
        let elseBranch: Expression | undefined;
        if (expr.elseBranch !== undefined) {
            elseBranch = substituteExpr(expr.elseBranch, subs);
        }
        return new IfExpr(
            expr.span,
            substituteExpr(expr.condition, subs),
            substituteBlock(expr.thenBranch, subs),
            elseBranch,
        );
    }
    if (expr instanceof ReturnExpr) {
        let value: Expression | undefined;
        if (expr.value !== undefined) {
            value = substituteExpr(expr.value, subs);
        }
        return new ReturnExpr(expr.span, value);
    }
    if (expr instanceof RefExpr) {
        return new RefExpr(
            expr.span,
            expr.mutability,
            substituteExpr(expr.target, subs),
        );
    }
    if (expr instanceof StructExpr) {
        return substituteStructExpr(expr, subs);
    }
    if (expr instanceof MatchExpr) {
        return substituteMatchExpr(expr, subs);
    }
    return undefined;
}

function substituteExpr(expr: Expression, subs: SubstitutionMap): Expression {
    const primary = substitutePrimary(expr, subs);
    if (primary) {
        return primary;
    }

    const structured = substituteStructuredExpr(expr, subs);
    if (structured) {
        return structured;
    }

    const controlFlow = substituteControlFlow(expr, subs);
    if (controlFlow) return controlFlow;

    const secondary = substituteSecondary(expr, subs);
    if (secondary) return secondary;

    return expr;
}

// --- Statement & block substitution ---

function substituteStmt(stmt: Statement, subs: SubstitutionMap): Statement {
    if (stmt instanceof LetStmt) {
        return new LetStmt(
            stmt.span,
            stmt.pattern,
            substituteType(stmt.type, subs),
            substituteExpr(stmt.init, subs),
        );
    }
    if (stmt instanceof ExprStmt) {
        return new ExprStmt(
            stmt.span,
            substituteExpr(stmt.expr, subs),
            stmt.isReturn,
        );
    }
    if (stmt instanceof ItemStmt) {
        return stmt;
    }
    return stmt;
}

function substituteBlock(block: BlockExpr, subs: SubstitutionMap): BlockExpr {
    const newStmts = block.stmts.map((s) => substituteStmt(s, subs));
    let newExpr: Expression | undefined;
    if (block.expr !== undefined) {
        newExpr = substituteExpr(block.expr, subs);
    }
    return new BlockExpr(block.span, newStmts, newExpr);
}

// --- Monomorphization ---

export function monomorphizeFn(
    generic: GenericFnItem,
    subs: SubstitutionMap,
): FnItem {
    const specializedName = mangledName(generic.name, subs);

    const newParams: ParamNode[] = generic.params.map((p) => ({
        span: p.span,
        name: p.name,
        ty: substituteType(p.ty, subs),
        defaultValue: p.defaultValue,
        isReceiver: p.isReceiver,
        receiverKind: p.receiverKind,
    }));

    const newReturnType = substituteType(generic.returnType, subs);
    let newBody: BlockExpr | undefined;
    if (generic.body !== undefined) {
        newBody = substituteBlock(generic.body, subs);
    }

    return new FnItem(
        generic.span,
        specializedName,
        newParams,
        newReturnType,
        newBody,
        generic.derives,
    );
}

export function monomorphizeStruct(
    generic: GenericStructItem,
    subs: SubstitutionMap,
): StructItem {
    const specializedName = mangledName(generic.name, subs);

    const newFields: StructFieldNode[] = generic.fields.map((f) => ({
        span: f.span,
        name: f.name,
        ty: substituteType(f.ty, subs),
        defaultValue: f.defaultValue,
    }));

    return new StructItem(
        generic.span,
        specializedName,
        newFields,
        generic.derives,
    );
}

// --- Type argument inference ---

export function inferTypeArgs(
    generic: GenericFnItem,
    argTypes: (TypeNode | undefined)[],
    explicitTypeArgs?: TypeNode[],
): SubstitutionMap | undefined {
    const subs: SubstitutionMap = new Map();

    if (explicitTypeArgs && explicitTypeArgs.length > 0) {
        for (
            let i = 0;
            i < generic.genericParams.length && i < explicitTypeArgs.length;
            i++
        ) {
            subs.set(generic.genericParams[i].name, explicitTypeArgs[i]);
        }
        return subs;
    }

    const params = generic.params.filter((p) => !p.isReceiver);
    for (let i = 0; i < params.length && i < argTypes.length; i++) {
        const paramTy = params[i].ty;
        const argTy = argTypes[i];
        if (!argTy) continue;

        unifyTypes(paramTy, argTy, subs);
    }

    for (const gp of generic.genericParams) {
        if (!subs.has(gp.name)) {
            return undefined;
        }
    }

    return subs;
}

function unifyTypes(
    paramTy: TypeNode,
    argTy: TypeNode,
    subs: SubstitutionMap,
): void {
    if (paramTy instanceof NamedTypeNode) {
        if (!subs.has(paramTy.name)) {
            subs.set(paramTy.name, argTy);
        }
        return;
    }
    if (paramTy instanceof RefTypeNode && argTy instanceof RefTypeNode) {
        unifyTypes(paramTy.inner, argTy.inner, subs);
        return;
    }
    if (paramTy instanceof TupleTypeNode && argTy instanceof TupleTypeNode) {
        for (
            let i = 0;
            i < paramTy.elements.length && i < argTy.elements.length;
            i++
        ) {
            unifyTypes(paramTy.elements[i], argTy.elements[i], subs);
        }
        return;
    }
    if (paramTy instanceof ArrayTypeNode && argTy instanceof ArrayTypeNode) {
        unifyTypes(paramTy.element, argTy.element, subs);
    }
}

// --- Registry ---

export class MonomorphizationRegistry {
    private readonly fnSpecializations = new Map<string, FnItem>();
    private readonly structSpecializations = new Map<string, StructItem>();
    private readonly genericFns = new Map<string, GenericFnItem>();
    private readonly genericStructs = new Map<string, GenericStructItem>();

    registerGenericFn(item: GenericFnItem): void {
        this.genericFns.set(item.name, item);
    }

    registerGenericStruct(item: GenericStructItem): void {
        this.genericStructs.set(item.name, item);
    }

    lookupGenericFn(name: string): GenericFnItem | undefined {
        return this.genericFns.get(name);
    }

    lookupGenericStruct(name: string): GenericStructItem | undefined {
        return this.genericStructs.get(name);
    }

    getOrCreateFn(
        generic: GenericFnItem,
        subs: SubstitutionMap,
    ): { item: FnItem; isNew: boolean } {
        const name = mangledName(generic.name, subs);
        const existing = this.fnSpecializations.get(name);
        if (existing) {
            return { item: existing, isNew: false };
        }
        const specialized = monomorphizeFn(generic, subs);
        this.fnSpecializations.set(name, specialized);
        return { item: specialized, isNew: true };
    }

    getOrCreateStruct(
        generic: GenericStructItem,
        subs: SubstitutionMap,
    ): { item: StructItem; isNew: boolean } {
        const name = mangledName(generic.name, subs);
        const existing = this.structSpecializations.get(name);
        if (existing) {
            return { item: existing, isNew: false };
        }
        const specialized = monomorphizeStruct(generic, subs);
        this.structSpecializations.set(name, specialized);
        return { item: specialized, isNew: true };
    }

    allFnSpecializations(): FnItem[] {
        return [...this.fnSpecializations.values()];
    }

    allStructSpecializations(): StructItem[] {
        return [...this.structSpecializations.values()];
    }
}
