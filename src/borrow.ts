import { NodeKind } from "./ast";
import type { TypeContext } from "./type_context";

export type RefOrigin =
    | { kind: "param"; name?: string }
    | { kind: "local"; name?: string; depth: number }
    | { kind: "temporary" };

export type BindingInfo = {
    kind: "param" | "local";
    depth: number;
    refOrigin: RefOrigin | null;
};

export type BorrowLiteError = {
    message: string;
    span?: { line: number; column: number; start: number; end: number };
};

export type FnEnv = {
    scopeStack: string[][];
    bindings: Map<string, BindingInfo[]>;
    errors: BorrowLiteError[];
};

function makeBorrowError(
    message: string,
    span?: { line: number; column: number; start: number; end: number },
): BorrowLiteError {
    return { message, span };
}

function currentDepth(env: FnEnv): number {
    return env.scopeStack.length - 1;
}

function pushScope(env: FnEnv): void {
    env.scopeStack.push([]);
}

function popScope(env: FnEnv): void {
    const names = env.scopeStack.pop() || [];
    for (let i = names.length - 1; i >= 0; i--) {
        const name = names[i];
        const stack = env.bindings.get(name);
        if (!stack || stack.length === 0) continue;
        stack.pop();
        if (stack.length === 0) {
            env.bindings.delete(name);
        }
    }
}

function defineBinding(env: FnEnv, name: string, info: BindingInfo): void {
    const stack = env.bindings.get(name) || [];
    stack.push(info);
    env.bindings.set(name, stack);
    const scope = env.scopeStack[env.scopeStack.length - 1];
    if (scope) {
        scope.push(name);
    }
}

function lookupBinding(env: FnEnv, name: string): BindingInfo | null {
    const stack = env.bindings.get(name);
    if (!stack || stack.length === 0) return null;
    return stack[stack.length - 1];
}

function collectPatternBindings(pat: any, out: string[]): void {
    if (!pat) return;
    switch (pat.kind) {
        case NodeKind.IdentPat:
            out.push(pat.name);
            break;
        case NodeKind.TuplePat:
            for (const e of pat.elements || []) collectPatternBindings(e, out);
            break;
        case NodeKind.StructPat:
            for (const f of pat.fields || []) {
                if (f.pat) collectPatternBindings(f.pat, out);
            }
            break;
        case NodeKind.SlicePat:
            for (const e of pat.elements || []) collectPatternBindings(e, out);
            if (pat.rest) collectPatternBindings(pat.rest, out);
            break;
        case NodeKind.OrPat:
            if ((pat.alternatives || []).length > 0) {
                collectPatternBindings(pat.alternatives[0], out);
            }
            break;
        case NodeKind.BindingPat:
            out.push(pat.name);
            if (pat.pat) collectPatternBindings(pat.pat, out);
            break;
        default:
            break;
    }
}

function getRefOrigin(expr: any, env: FnEnv): RefOrigin | null {
    if (!expr) return null;
    switch (expr.kind) {
        case NodeKind.RefExpr: {
            const origin = getPlaceOrigin(expr.operand, env);
            return origin || { kind: "temporary" };
        }
        case NodeKind.IdentifierExpr: {
            const binding = lookupBinding(env, expr.name);
            return binding ? binding.refOrigin : null;
        }
        case NodeKind.PathExpr: {
            if (!expr.segments || expr.segments.length !== 1) return null;
            const binding = lookupBinding(env, expr.segments[0]);
            return binding ? binding.refOrigin : null;
        }
        case NodeKind.BlockExpr:
            return getRefOrigin(expr.expr, env);
        case NodeKind.IfExpr: {
            const thenOrigin = getRefOrigin(expr.thenBranch, env);
            const elseOrigin = getRefOrigin(expr.elseBranch, env);
            if (!thenOrigin || !elseOrigin) return null;
            if (thenOrigin.kind !== elseOrigin.kind) return null;
            if (
                thenOrigin.kind === "local" &&
                elseOrigin.kind === "local" &&
                thenOrigin.depth !== elseOrigin.depth
            ) {
                return null;
            }
            return thenOrigin;
        }
        default:
            return null;
    }
}

function getPlaceOrigin(place: any, env: FnEnv): RefOrigin | null {
    if (!place) return null;
    switch (place.kind) {
        case NodeKind.IdentifierExpr: {
            const binding = lookupBinding(env, place.name);
            if (!binding) return null;
            if (binding.refOrigin) return binding.refOrigin;
            if (binding.kind === "param")
                return { kind: "param", name: place.name };
            return {
                kind: "local",
                name: place.name,
                depth: binding.depth,
            };
        }
        case NodeKind.PathExpr: {
            if (!place.segments || place.segments.length !== 1) return null;
            const binding = lookupBinding(env, place.segments[0]);
            if (!binding) return null;
            if (binding.refOrigin) return binding.refOrigin;
            if (binding.kind === "param")
                return { kind: "param", name: place.segments[0] };
            return {
                kind: "local",
                name: place.segments[0],
                depth: binding.depth,
            };
        }
        case NodeKind.FieldExpr:
            return getPlaceOrigin(place.receiver, env);
        case NodeKind.IndexExpr:
            return getPlaceOrigin(place.receiver, env);
        case NodeKind.DerefExpr:
            return getRefOrigin(place.operand, env);
        default:
            return null;
    }
}

function isInvalidReturnOrigin(origin: RefOrigin | null): boolean {
    if (!origin) return false;
    return origin.kind === "local" || origin.kind === "temporary";
}

function isEscapingStore(
    origin: RefOrigin | null,
    target: BindingInfo | null,
): boolean {
    if (!origin || !target) return false;
    if (origin.kind === "temporary") return true;
    if (origin.kind !== "local") return false;
    const targetDepth = target.kind === "param" ? -1 : target.depth;
    return targetDepth < origin.depth;
}

function checkExpr(expr: any, env: FnEnv): void {
    if (!expr) return;
    switch (expr.kind) {
        case NodeKind.AssignExpr: {
            checkExpr(expr.value, env);
            const valueOrigin = getRefOrigin(expr.value, env);
            const targetOrigin = getPlaceOrigin(expr.target, env);
            let targetBinding: BindingInfo | null = null;
            if (expr.target.kind === NodeKind.IdentifierExpr) {
                targetBinding = lookupBinding(env, expr.target.name);
            } else if (
                expr.target.kind === NodeKind.PathExpr &&
                expr.target.segments &&
                expr.target.segments.length === 1
            ) {
                targetBinding = lookupBinding(env, expr.target.segments[0]);
            } else if (targetOrigin && targetOrigin.kind === "local") {
                targetBinding = {
                    kind: "local",
                    depth: targetOrigin.depth,
                    refOrigin: null,
                };
            } else if (targetOrigin && targetOrigin.kind === "param") {
                targetBinding = {
                    kind: "param",
                    depth: -1,
                    refOrigin: null,
                };
            }
            if (isEscapingStore(valueOrigin, targetBinding)) {
                env.errors.push(
                    makeBorrowError(
                        "Reference escapes the lifetime of its source in assignment",
                        expr.span,
                    ),
                );
            }
            if (
                targetBinding &&
                valueOrigin &&
                expr.target.kind === NodeKind.IdentifierExpr
            ) {
                const binding = lookupBinding(env, expr.target.name);
                if (binding) {
                    binding.refOrigin = valueOrigin;
                }
            }
            checkExpr(expr.target, env);
            return;
        }
        case NodeKind.ReturnExpr: {
            if (expr.value) {
                checkExpr(expr.value, env);
                const origin = getRefOrigin(expr.value, env);
                if (isInvalidReturnOrigin(origin)) {
                    env.errors.push(
                        makeBorrowError(
                            "Cannot return reference to local data or temporary",
                            expr.span,
                        ),
                    );
                }
            }
            return;
        }
        case NodeKind.BlockExpr:
            checkBlock(expr, env, false);
            return;
        case NodeKind.IfExpr:
            checkExpr(expr.condition, env);
            checkExpr(expr.thenBranch, env);
            if (expr.elseBranch) checkExpr(expr.elseBranch, env);
            return;
        case NodeKind.MatchExpr:
            checkExpr(expr.scrutinee, env);
            for (const arm of expr.arms || []) {
                pushScope(env);
                if (arm.guard) checkExpr(arm.guard, env);
                checkExpr(arm.body, env);
                popScope(env);
            }
            return;
        case NodeKind.WhileExpr:
            checkExpr(expr.condition, env);
            checkExpr(expr.body, env);
            return;
        case NodeKind.ForExpr:
            checkExpr(expr.iter, env);
            pushScope(env);
            const forNames: string[] = [];
            collectPatternBindings(expr.pat, forNames);
            for (const name of forNames) {
                const binding: BindingInfo = {
                    kind: "local",
                    depth: currentDepth(env),
                    refOrigin: null,
                };
                defineBinding(env, name, binding);
            }
            checkExpr(expr.body, env);
            popScope(env);
            return;
        case NodeKind.LoopExpr:
            checkExpr(expr.body, env);
            return;
        case NodeKind.CallExpr:
            checkExpr(expr.callee, env);
            for (const arg of expr.args || []) checkExpr(arg, env);
            return;
        case NodeKind.FieldExpr:
            checkExpr(expr.receiver, env);
            return;
        case NodeKind.IndexExpr:
            checkExpr(expr.receiver, env);
            checkExpr(expr.index, env);
            return;
        case NodeKind.BinaryExpr:
            checkExpr(expr.left, env);
            checkExpr(expr.right, env);
            return;
        case NodeKind.UnaryExpr:
            checkExpr(expr.operand, env);
            return;
        case NodeKind.StructExpr:
            for (const field of expr.fields || []) {
                checkExpr(field.value, env);
            }
            if (expr.spread) checkExpr(expr.spread, env);
            return;
        case NodeKind.RangeExpr:
            if (expr.start) checkExpr(expr.start, env);
            if (expr.end) checkExpr(expr.end, env);
            return;
        case NodeKind.RefExpr:
            checkExpr(expr.operand, env);
            return;
        case NodeKind.DerefExpr:
            checkExpr(expr.operand, env);
            return;
        case NodeKind.MacroExpr:
            for (const arg of expr.args || []) checkExpr(arg, env);
            return;
        case NodeKind.ClosureExpr:
            pushScope(env);
            for (const param of expr.params || []) {
                if (!param.name || param.name === "_") continue;
                defineBinding(env, param.name, {
                    kind: "local",
                    depth: currentDepth(env),
                    refOrigin: null,
                });
            }
            if (expr.body) {
                if (expr.body.kind === NodeKind.BlockExpr) {
                    checkBlock(expr.body, env, false);
                } else {
                    checkExpr(expr.body, env);
                }
            }
            popScope(env);
            return;
        default:
            return;
    }
}

function checkStmt(stmt: any, env: FnEnv): void {
    if (!stmt) return;
    switch (stmt.kind) {
        case NodeKind.LetStmt: {
            if (stmt.init) {
                checkExpr(stmt.init, env);
            }
            const initOrigin = stmt.init ? getRefOrigin(stmt.init, env) : null;
            const names: string[] = [];
            collectPatternBindings(stmt.pat, names);
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
        case NodeKind.ExprStmt:
            if (stmt.expr) checkExpr(stmt.expr, env);
            return;
        case NodeKind.ItemStmt:
            return;
        default:
            return;
    }
}

function checkBlock(block: any, env: FnEnv, checkTailAsReturn: boolean): void {
    pushScope(env);
    for (const stmt of block.stmts || []) {
        checkStmt(stmt, env);
    }
    if (block.expr) {
        checkExpr(block.expr, env);
        if (checkTailAsReturn) {
            const origin = getRefOrigin(block.expr, env);
            if (isInvalidReturnOrigin(origin)) {
                env.errors.push(
                    makeBorrowError(
                        "Cannot return reference to local data or temporary",
                        block.expr.span || block.span,
                    ),
                );
            }
        }
    }
    popScope(env);
}

function checkFnItem(fnItem: any): BorrowLiteError[] {
    if (!fnItem.body) return [];
    const env: FnEnv = {
        scopeStack: [],
        bindings: new Map(),
        errors: [],
    };
    pushScope(env);
    for (const param of fnItem.params || []) {
        if (!param.name) continue;
        defineBinding(env, param.name, {
            kind: "param",
            depth: -1,
            refOrigin: null,
        });
    }
    checkBlock(fnItem.body, env, true);
    popScope(env);
    return env.errors;
}

function checkItem(item: any, errors: BorrowLiteError[]): void {
    if (!item) return;
    switch (item.kind) {
        case NodeKind.FnItem:
            errors.push(...checkFnItem(item));
            break;
        case NodeKind.ModItem:
            for (const child of item.items || []) checkItem(child, errors);
            break;
        case NodeKind.ImplItem:
            for (const method of item.methods || []) {
                errors.push(...checkFnItem(method));
            }
            break;
        default:
            break;
    }
}

export function checkBorrowLite(
    moduleAst: any,
    _typeCtx: TypeContext,
): { ok: boolean; errors?: BorrowLiteError[] } {
    const errors: BorrowLiteError[] = [];
    for (const item of moduleAst.items || []) {
        checkItem(item, errors);
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true };
}
