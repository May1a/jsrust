import {
    AssignExpr,
    BinaryExpr,
    BlockExpr,
    CallExpr,
    ClosureExpr,
    DerefExpr,
    ExprStmt,
    FieldExpr,
    FnItem,
    ForExpr,
    IdentifierExpr,
    IfExpr,
    ImplItem,
    IndexExpr,
    ItemStmt,
    LetStmt,
    LoopExpr,
    MacroExpr,
    MatchExpr,
    ModItem,
    ModuleNode,
    OrPattern,
    PathExpr,
    type Item,
    type Pattern,
    RangeExpr,
    RefExpr,
    ReturnExpr,
    type Span,
    SlicePattern,
    type Statement,
    StructExpr,
    StructPattern,
    TuplePattern,
    UnaryExpr,
    WhileExpr,
    BindingPattern,
    IdentPattern,
} from "./ast";
import type { TypeContext } from "./type_context";

const PARAM_DEPTH = -1;

export type RefOrigin =
    | { kind: "param"; name?: string }
    | { kind: "local"; name?: string; depth: number }
    | { kind: "temporary" };

export interface BindingInfo {
    kind: "param" | "local";
    depth: number;
    refOrigin?: RefOrigin;
}

export interface BorrowLiteError {
    message: string;
    span?: { line: number; column: number; start: number; end: number };
}

export interface FnEnv {
    scopeStack: string[][];
    bindings: Map<string, BindingInfo[]>;
    errors: BorrowLiteError[];
}

function makeBorrowError(message: string, span?: Span): BorrowLiteError {
    return { message, span };
}

function currentDepth(env: FnEnv): number {
    return env.scopeStack.length - 1;
}

function pushScope(env: FnEnv): void {
    env.scopeStack.push([]);
}

function popScope(env: FnEnv): void {
    const names = env.scopeStack.pop() ?? [];
    for (let i = names.length - 1; i >= 0; i--) {
        const name = names[i];
        const stack = env.bindings.get(name);
        if (!stack || stack.length === 0) {
            continue;
        }
        stack.pop();
        if (stack.length === 0) {
            env.bindings.delete(name);
        }
    }
}

function defineBinding(env: FnEnv, name: string, info: BindingInfo): void {
    const stack = env.bindings.get(name) ?? [];
    stack.push(info);
    env.bindings.set(name, stack);
    env.scopeStack[env.scopeStack.length - 1].push(name);
}

function lookupBinding(env: FnEnv, name: string): BindingInfo | undefined {
    const stack = env.bindings.get(name);
    return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
}

function collectPatternBindings(pattern: Pattern | undefined, out: string[]): void {
    if (!pattern) {
        return;
    }
    if (pattern instanceof IdentPattern) {
        out.push(pattern.name);
        return;
    }
    if (pattern instanceof TuplePattern || pattern instanceof SlicePattern) {
        for (const element of pattern.elements) {
            collectPatternBindings(element, out);
        }
        if (pattern instanceof SlicePattern) {
            collectPatternBindings(pattern.rest, out);
        }
        return;
    }
    if (pattern instanceof StructPattern) {
        for (const field of pattern.fields) {
            collectPatternBindings(field.pattern, out);
        }
        return;
    }
    if (pattern instanceof OrPattern) {
        collectPatternBindings(pattern.alternatives[0], out);
        return;
    }
    if (pattern instanceof BindingPattern) {
        out.push(pattern.name);
        collectPatternBindings(pattern.pattern, out);
    }
}

function getSingleSegmentPathName(expr: IdentifierExpr | PathExpr): string | undefined {
    if (expr instanceof PathExpr) {
        return expr.segments.length === 1 ? expr.segments[0] : undefined;
    }
    return expr.name;
}

function getBindingRefOrigin(
    env: FnEnv,
    expr: IdentifierExpr | PathExpr,
): RefOrigin | undefined {
    const name = getSingleSegmentPathName(expr);
    if (!name) {
        return undefined;
    }
    const binding = lookupBinding(env, name);
    return binding ? binding.refOrigin : undefined;
}

function getRefOrigin(expr: ExpressionLike, env: FnEnv): RefOrigin | undefined {
    if (!expr) {
        return undefined;
    }
    if (expr instanceof RefExpr) {
        return getPlaceOrigin(expr.target, env) ?? { kind: "temporary" };
    }
    if (expr instanceof IdentifierExpr) {
        return getBindingRefOrigin(env, expr);
    }
    if (expr instanceof BlockExpr) {
        return getRefOrigin(expr.expr, env);
    }
    if (expr instanceof IfExpr) {
        return getIfRefOrigin(expr, env);
    }
    return undefined;
}

function getIfRefOrigin(expr: IfExpr, env: FnEnv): RefOrigin | undefined {
    const thenOrigin = getRefOrigin(expr.thenBranch, env);
    const elseOrigin = getRefOrigin(expr.elseBranch, env);
    if (!thenOrigin || !elseOrigin) {
        return undefined;
    }
    if (thenOrigin.kind !== elseOrigin.kind) {
        return undefined;
    }
    if (
        thenOrigin.kind === "local" &&
        elseOrigin.kind === "local" &&
        thenOrigin.depth !== elseOrigin.depth
    ) {
        return undefined;
    }
    return thenOrigin;
}

function getPlaceOrigin(
    place: ExpressionLike,
    env: FnEnv,
): RefOrigin | undefined {
    if (!place) {
        return undefined;
    }
    if (place instanceof IdentifierExpr) {
        return getBindingPlaceOrigin(env, place.name);
    }
    if (place instanceof PathExpr) {
        const name = getSingleSegmentPathName(place);
        return name ? getBindingPlaceOrigin(env, name) : undefined;
    }
    if (place instanceof FieldExpr || place instanceof IndexExpr) {
        return getPlaceOrigin(place.receiver, env);
    }
    if (place instanceof DerefExpr) {
        return getRefOrigin(place.target, env);
    }
    return undefined;
}

function getBindingPlaceOrigin(env: FnEnv, name: string): RefOrigin | undefined {
    const binding = lookupBinding(env, name);
    if (!binding) {
        return undefined;
    }
    if (binding.refOrigin) {
        return binding.refOrigin;
    }
    return binding.kind === "param"
        ? { kind: "param", name }
        : { kind: "local", name, depth: binding.depth };
}

function isInvalidReturnOrigin(origin: RefOrigin | undefined): boolean {
    if (!origin) {
        return false;
    }
    return origin.kind === "local" || origin.kind === "temporary";
}

function isEscapingStore(
    origin: RefOrigin | undefined,
    target: BindingInfo | undefined,
): boolean {
    if (!origin || !target) {
        return false;
    }
    if (origin.kind === "temporary") {
        return true;
    }
    if (origin.kind !== "local") {
        return false;
    }
    const targetDepth = target.kind === "param" ? PARAM_DEPTH : target.depth;
    return targetDepth < origin.depth;
}

function createBinding(kind: "param" | "local", depth: number): BindingInfo {
    return { kind, depth };
}

function getTargetBinding(
    target: ExpressionLike,
    env: FnEnv,
): BindingInfo | undefined {
    if (!target) {
        return undefined;
    }
    if (target instanceof IdentifierExpr) {
        return lookupBinding(env, target.name);
    }
    if (target instanceof PathExpr) {
        const name = getSingleSegmentPathName(target);
        return name ? lookupBinding(env, name) : undefined;
    }
    const targetOrigin = getPlaceOrigin(target, env);
    if (!targetOrigin) {
        return undefined;
    }
    if (targetOrigin.kind === "local") {
        return createBinding("local", targetOrigin.depth);
    }
    if (targetOrigin.kind === "param") {
        return createBinding("param", PARAM_DEPTH);
    }
    return undefined;
}

function assignRefOriginToTarget(
    target: ExpressionLike,
    valueOrigin: RefOrigin | undefined,
    env: FnEnv,
): void {
    if (!valueOrigin || !(target instanceof IdentifierExpr)) {
        return;
    }
    const binding = lookupBinding(env, target.name);
    if (binding) {
        binding.refOrigin = valueOrigin;
    }
}

function checkAssignExpr(expr: AssignExpr, env: FnEnv): void {
    checkExpr(expr.value, env);
    const valueOrigin = getRefOrigin(expr.value, env);
    const targetBinding = getTargetBinding(expr.target, env);
    if (isEscapingStore(valueOrigin, targetBinding)) {
        env.errors.push(
            makeBorrowError(
                "Reference escapes the lifetime of its source in assignment",
                expr.span,
            ),
        );
    }
    assignRefOriginToTarget(expr.target, valueOrigin, env);
    checkExpr(expr.target, env);
}

function checkReturnExpr(expr: ReturnExpr, env: FnEnv): void {
    if (!expr.value) {
        return;
    }
    checkExpr(expr.value, env);
    if (isInvalidReturnOrigin(getRefOrigin(expr.value, env))) {
        env.errors.push(
            makeBorrowError(
                "Cannot return reference to local data or temporary",
                expr.span,
            ),
        );
    }
}

function withPatternScope(pattern: Pattern, env: FnEnv, fn: () => void): void {
    pushScope(env);
    const names: string[] = [];
    collectPatternBindings(pattern, names);
    for (const name of names) {
        defineBinding(env, name, createBinding("local", currentDepth(env)));
    }
    fn();
    popScope(env);
}

function checkMatchExpr(expr: MatchExpr, env: FnEnv): void {
    checkExpr(expr.scrutinee, env);
    for (const arm of expr.arms) {
        withPatternScope(arm.pattern, env, () => {
            checkExpr(arm.guard, env);
            checkExpr(arm.body, env);
        });
    }
}

function checkForExpr(expr: ForExpr, env: FnEnv): void {
    checkExpr(expr.iter, env);
    withPatternScope(expr.pattern, env, () => {
        checkExpr(expr.body, env);
    });
}

function checkClosureExpr(expr: ClosureExpr, env: FnEnv): void {
    pushScope(env);
    for (const param of expr.params) {
        if (!param.name || param.name === "_") {
            continue;
        }
        defineBinding(env, param.name, createBinding("local", currentDepth(env)));
    }
    if (expr.body instanceof BlockExpr) {
        checkBlock(expr.body, env, false);
    } else {
        checkExpr(expr.body, env);
    }
    popScope(env);
}

function checkStructExpr(expr: StructExpr, env: FnEnv): void {
    checkExpr(expr.path, env);
    for (const value of expr.fields.values()) {
        checkExpr(value, env);
    }
    checkExpr(expr.spread, env);
}

function checkBranchingExpr(expr: ExpressionLike, env: FnEnv): boolean {
    if (!expr) {
        return true;
    }
    if (expr instanceof IfExpr) {
        checkExpr(expr.condition, env);
        checkExpr(expr.thenBranch, env);
        checkExpr(expr.elseBranch, env);
        return true;
    }
    if (expr instanceof WhileExpr) {
        checkExpr(expr.condition, env);
        checkExpr(expr.body, env);
        return true;
    }
    if (expr instanceof LoopExpr) {
        checkExpr(expr.body, env);
        return true;
    }
    return false;
}

function checkAccessExpr(expr: ExpressionLike, env: FnEnv): boolean {
    if (!expr) {
        return true;
    }
    if (expr instanceof CallExpr) {
        checkExpr(expr.callee, env);
        for (const arg of expr.args) {
            checkExpr(arg, env);
        }
        return true;
    }
    if (expr instanceof FieldExpr) {
        checkExpr(expr.receiver, env);
        return true;
    }
    if (expr instanceof IndexExpr) {
        checkExpr(expr.receiver, env);
        checkExpr(expr.index, env);
        return true;
    }
    if (expr instanceof BinaryExpr) {
        checkExpr(expr.left, env);
        checkExpr(expr.right, env);
        return true;
    }
    if (expr instanceof UnaryExpr) {
        checkExpr(expr.operand, env);
        return true;
    }
    return false;
}

function checkLeafExpr(expr: ExpressionLike, env: FnEnv): boolean {
    if (!expr) {
        return true;
    }
    if (expr instanceof RangeExpr) {
        checkExpr(expr.start, env);
        checkExpr(expr.end, env);
        return true;
    }
    if (expr instanceof RefExpr) {
        checkExpr(expr.target, env);
        return true;
    }
    if (expr instanceof DerefExpr) {
        checkExpr(expr.target, env);
        return true;
    }
    if (expr instanceof MacroExpr) {
        for (const arg of expr.args) {
            checkExpr(arg, env);
        }
        return true;
    }
    return false;
}

type ExpressionLike = AssignExpr | BinaryExpr | BlockExpr | CallExpr | ClosureExpr | DerefExpr | FieldExpr | ForExpr | IdentifierExpr | IfExpr | IndexExpr | LoopExpr | MacroExpr | MatchExpr | PathExpr | RangeExpr | RefExpr | ReturnExpr | StructExpr | UnaryExpr | WhileExpr | undefined;

function checkExpr(expr: ExpressionLike, env: FnEnv): void {
    if (!expr) {
        return;
    }
    if (expr instanceof AssignExpr) {
        checkAssignExpr(expr, env);
        return;
    }
    if (expr instanceof ReturnExpr) {
        checkReturnExpr(expr, env);
        return;
    }
    if (expr instanceof BlockExpr) {
        checkBlock(expr, env, false);
        return;
    }
    if (expr instanceof MatchExpr) {
        checkMatchExpr(expr, env);
        return;
    }
    if (expr instanceof ForExpr) {
        checkForExpr(expr, env);
        return;
    }
    if (expr instanceof ClosureExpr) {
        checkClosureExpr(expr, env);
        return;
    }
    if (expr instanceof StructExpr) {
        checkStructExpr(expr, env);
        return;
    }
    if (checkBranchingExpr(expr, env) || checkAccessExpr(expr, env)) {
        return;
    }
    if (checkLeafExpr(expr, env)) {
        return;
    }
}

function checkStmt(stmt: Statement | undefined, env: FnEnv): void {
    if (!stmt) {
        return;
    }
    if (stmt instanceof LetStmt) {
        checkExpr(stmt.init, env);
        const initOrigin = getRefOrigin(stmt.init, env);
        const names: string[] = [];
        collectPatternBindings(stmt.pattern, names);
        for (const name of names) {
            const binding: BindingInfo = {
                kind: "local",
                depth: currentDepth(env),
                refOrigin: initOrigin,
            };
            if (isEscapingStore(initOrigin, binding)) {
                env.errors.push(
                    makeBorrowError(
                        "Reference escapes the lifetime of its source in let-binding",
                        stmt.span,
                    ),
                );
            }
            defineBinding(env, name, binding);
        }
        return;
    }
    if (stmt instanceof ExprStmt) {
        checkExpr(stmt.expr, env);
        return;
    }
    if (stmt instanceof ItemStmt) {
        return;
    }
}

function checkBlock(
    block: BlockExpr,
    env: FnEnv,
    checkTailAsReturn: boolean,
): void {
    pushScope(env);
    for (const stmt of block.stmts) {
        checkStmt(stmt, env);
    }
    if (block.expr) {
        checkExpr(block.expr, env);
        if (checkTailAsReturn && isInvalidReturnOrigin(getRefOrigin(block.expr, env))) {
            env.errors.push(
                makeBorrowError(
                    "Cannot return reference to local data or temporary",
                    block.expr.span,
                ),
            );
        }
    }
    popScope(env);
}

function checkFnItem(fnItem: FnItem): BorrowLiteError[] {
    if (!fnItem.body) {
        return [];
    }
    const env: FnEnv = {
        scopeStack: [],
        bindings: new Map(),
        errors: [],
    };
    pushScope(env);
    for (const param of fnItem.params) {
        if (!param.name) {
            continue;
        }
        defineBinding(env, param.name, createBinding("param", PARAM_DEPTH));
    }
    checkBlock(fnItem.body, env, true);
    popScope(env);
    return env.errors;
}

function checkItem(item: Item | undefined, errors: BorrowLiteError[]): void {
    if (!item) {
        return;
    }
    if (item instanceof FnItem) {
        errors.push(...checkFnItem(item));
        return;
    }
    if (item instanceof ModItem) {
        for (const child of item.items) {
            checkItem(child, errors);
        }
        return;
    }
    if (item instanceof ImplItem) {
        for (const method of item.methods) {
            errors.push(...checkFnItem(method));
        }
    }
}

export function checkBorrowLite(
    moduleAst: unknown,
    _typeCtx: TypeContext,
): { ok: boolean; errors?: BorrowLiteError[] } {
    if (!(moduleAst instanceof ModuleNode)) {
        return { ok: true };
    }
    const errors: BorrowLiteError[] = [];
    for (const item of moduleAst.items) {
        checkItem(item, errors);
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
