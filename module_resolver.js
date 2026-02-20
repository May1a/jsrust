import * as fs from "fs";
import * as path from "path";
import { parseModule } from "./parser.js";
import { NodeKind } from "./ast.js";

/**
 * @typedef {{ message: string, span?: { line: number, column: number, start?: number, end?: number }, kind?: string }} ResolverError
 */

/**
 * @typedef {{
 *   path: string[],
 *   items: Map<string, string>,
 *   modules: Map<string, string>,
 *   aliases: Map<string, { kind: "item" | "module", qualifiedName: string, isPub: boolean }>,
 *   uses: any[]
 * }} ModuleScope
 */

/**
 * @param {string[]} modulePath
 * @returns {string}
 */
function modulePathKey(modulePath) {
    return modulePath.join("::");
}

/**
 * @param {string[]} modulePath
 * @param {string} name
 * @returns {string}
 */
function qualifiedName(modulePath, name) {
    if (modulePath.length === 0) return name;
    return `${modulePath.join("::")}::${name}`;
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * @param {string[]} prefix
 * @param {string[]} value
 * @returns {boolean}
 */
function isPrefix(prefix, value) {
    if (prefix.length > value.length) return false;
    for (let i = 0; i < prefix.length; i++) {
        if (prefix[i] !== value[i]) return false;
    }
    return true;
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function isAncestorOrDescendant(a, b) {
    return isPrefix(a, b) || isPrefix(b, a);
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {string[]} modulePath
 * @returns {ModuleScope}
 */
function ensureScope(state, modulePath) {
    const key = modulePathKey(modulePath);
    const existing = state.moduleScopes.get(key);
    if (existing) return existing;
    const scope = {
        path: [...modulePath],
        items: new Map(),
        modules: new Map(),
        aliases: new Map(),
        uses: [],
    };
    state.moduleScopes.set(key, scope);
    return scope;
}

/**
 * @param {ResolverError[]} errors
 * @param {string} message
 * @param {any} [span]
 */
function pushError(errors, message, span) {
    errors.push({ message, span, kind: "resolve" });
}

/**
 * @param {{ errors: ResolverError[], sourcePath: string | null, loadingStack: string[] }} state
 * @param {string | null} parentFilePath
 * @param {any} modItem
 * @returns {{ ok: true, filePath: string } | { ok: false }}
 */
function resolveModuleFilePath(state, parentFilePath, modItem) {
    if (!parentFilePath) {
        pushError(
            state.errors,
            `File module \`${modItem.name}\` requires compile option \`sourcePath\``,
            modItem.span,
        );
        return { ok: false };
    }
    const parentDir = path.dirname(parentFilePath);
    const first = path.join(parentDir, `${modItem.name}.rs`);
    const second = path.join(parentDir, modItem.name, "mod.rs");
    const hasFirst = fs.existsSync(first);
    const hasSecond = fs.existsSync(second);
    if (hasFirst && hasSecond) {
        pushError(
            state.errors,
            `Ambiguous module file for \`${modItem.name}\`: both ${first} and ${second} exist`,
            modItem.span,
        );
        return { ok: false };
    }
    if (!hasFirst && !hasSecond) {
        pushError(
            state.errors,
            `Module file not found for \`${modItem.name}\`: expected ${first} or ${second}`,
            modItem.span,
        );
        return { ok: false };
    }
    const filePath = hasFirst ? first : second;
    if (state.loadingStack.includes(filePath)) {
        pushError(
            state.errors,
            `Module include cycle detected for \`${modItem.name}\` at ${filePath}`,
            modItem.span,
        );
        return { ok: false };
    }
    return { ok: true, filePath };
}

/**
 * @param {any} item
 * @returns {boolean}
 */
function isDeclItem(item) {
    return (
        item.kind === NodeKind.FnItem ||
        item.kind === NodeKind.StructItem ||
        item.kind === NodeKind.EnumItem ||
        item.kind === NodeKind.TraitItem
    );
}

/**
 * @param {any} implItem
 * @returns {string | null}
 */
function implTargetName(implItem) {
    const target = implItem?.targetType;
    if (target && target.kind === NodeKind.NamedType && target.name) {
        return target.name;
    }
    return null;
}

/**
 * @param {{ errors: ResolverError[], sourcePath: string | null, loadingStack: string[] }} state
 * @param {any[]} items
 * @param {string[]} modulePath
 * @param {string | null} filePath
 * @returns {void}
 */
function expandModuleItems(state, items, modulePath, filePath) {
    for (const item of items || []) {
        item.modulePath = [...modulePath];
        item.sourcePath = filePath;
        if (isDeclItem(item) || item.kind === NodeKind.ModItem) {
            item.qualifiedName = qualifiedName(modulePath, item.name || "");
        }

        if (item.kind !== NodeKind.ModItem) {
            if (item.kind === NodeKind.ImplItem) {
                for (const method of item.methods || []) {
                    method.modulePath = [...modulePath];
                    method.sourcePath = filePath;
                }
            }
            continue;
        }

        const childModulePath = [...modulePath, item.name];
        if (item.isInline) {
            expandModuleItems(state, item.items || [], childModulePath, filePath);
            continue;
        }

        const resolved = resolveModuleFilePath(state, filePath, item);
        if (!resolved.ok) {
            item.items = item.items || [];
            continue;
        }

        let source = "";
        try {
            source = fs.readFileSync(resolved.filePath, "utf-8");
        } catch (e) {
            pushError(
                state.errors,
                `Failed to read module file ${resolved.filePath}: ${e instanceof Error ? e.message : String(e)}`,
                item.span,
            );
            item.items = item.items || [];
            continue;
        }

        state.loadingStack.push(resolved.filePath);
        const parseResult = parseModule(source);
        if (!parseResult.ok || !parseResult.value) {
            for (const err of parseResult.errors || []) {
                state.errors.push({
                    message: `In module file ${resolved.filePath}: ${err.message}`,
                    kind: "resolve",
                });
            }
            item.items = item.items || [];
            state.loadingStack.pop();
            continue;
        }

        item.items = parseResult.value.items || [];
        item.isInline = true;
        item.sourcePath = resolved.filePath;
        expandModuleItems(state, item.items, childModulePath, resolved.filePath);
        state.loadingStack.pop();
    }
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {any[]} items
 * @param {string[]} modulePath
 * @returns {void}
 */
function registerModuleItems(state, items, modulePath) {
    const scope = ensureScope(state, modulePath);
    for (const item of items || []) {
        if (item.kind === NodeKind.UseItem) {
            scope.uses.push(item);
            continue;
        }

        if (isDeclItem(item)) {
            const qname = item.qualifiedName || qualifiedName(modulePath, item.name);
            if (state.itemDecls.has(qname)) {
                pushError(
                    state.errors,
                    `Duplicate item declaration: ${qname}`,
                    item.span,
                );
                continue;
            }
            state.itemDecls.set(qname, {
                qualifiedName: qname,
                modulePath: [...modulePath],
                isPub: item.isPub === true,
                node: item,
                kind:
                    item.kind === NodeKind.FnItem
                        ? "fn"
                        : item.kind === NodeKind.StructItem
                            ? "struct"
                            : item.kind === NodeKind.EnumItem
                                ? "enum"
                                : "trait",
            });
            scope.items.set(item.name, qname);
            continue;
        }

        if (item.kind === NodeKind.ModItem) {
            const childPath = [...modulePath, item.name];
            const qname = modulePathKey(childPath);
            if (state.moduleDecls.has(qname)) {
                pushError(
                    state.errors,
                    `Duplicate module declaration: ${qname}`,
                    item.span,
                );
                continue;
            }
            state.moduleDecls.set(qname, {
                qualifiedName: qname,
                modulePath: childPath,
                isPub: item.isPub === true,
                node: item,
            });
            scope.modules.set(item.name, qname);
            ensureScope(state, childPath);
            registerModuleItems(state, item.items || [], childPath);
        }
    }
}

/**
 * @param {{ moduleScopes: Map<string, ModuleScope>, itemDecls: Map<string, any>, moduleDecls: Map<string, any> }} state
 * @param {string[]} modulePath
 * @returns {ModuleScope}
 */
function getScope(state, modulePath) {
    return ensureScope(/** @type {any} */(state), modulePath);
}

/**
 * @param {{ kind: "item" | "module", qualifiedName: string, isPub: boolean }} alias
 * @param {string[]} aliasModulePath
 * @returns {{ kind: "item" | "module", qualifiedName: string, viaAlias: { modulePath: string[], isPub: boolean } }}
 */
function targetFromAlias(alias, aliasModulePath) {
    return {
        kind: alias.kind,
        qualifiedName: alias.qualifiedName,
        viaAlias: {
            modulePath: [...aliasModulePath],
            isPub: alias.isPub === true,
        },
    };
}

/**
 * @param {{ moduleScopes: Map<string, ModuleScope>, itemDecls: Map<string, any>, moduleDecls: Map<string, any> }} state
 * @param {string[]} modulePath
 * @param {string} name
 * @returns {{ kind: "item" | "module", qualifiedName: string } | null}
 */
function resolveNameInScope(state, modulePath, name) {
    const scope = getScope(state, modulePath);
    const alias = scope.aliases.get(name);
    if (alias) return targetFromAlias(alias, scope.path);

    if (scope.items.has(name)) {
        return { kind: "item", qualifiedName: /** @type {string} */ (scope.items.get(name)) };
    }
    if (scope.modules.has(name)) {
        return { kind: "module", qualifiedName: /** @type {string} */ (scope.modules.get(name)) };
    }

    const rootScope = getScope(state, []);
    const rootAlias = rootScope.aliases.get(name);
    if (rootAlias) return targetFromAlias(rootAlias, rootScope.path);
    if (rootScope.items.has(name)) {
        return { kind: "item", qualifiedName: /** @type {string} */ (rootScope.items.get(name)) };
    }
    if (rootScope.modules.has(name)) {
        return { kind: "module", qualifiedName: /** @type {string} */ (rootScope.modules.get(name)) };
    }
    return null;
}

/**
 * @param {{ moduleScopes: Map<string, ModuleScope> }} state
 * @param {string} qualifiedModuleName
 * @returns {string[]}
 */
function moduleNameToPath(state, qualifiedModuleName) {
    const scope = state.moduleScopes.get(qualifiedModuleName);
    if (scope) return [...scope.path];
    if (!qualifiedModuleName) return [];
    return qualifiedModuleName.split("::");
}

/**
 * @param {{ moduleScopes: Map<string, ModuleScope>, itemDecls: Map<string, any>, moduleDecls: Map<string, any> }} state
 * @param {string[]} segments
 * @returns {{ kind: "item" | "module", qualifiedName: string } | null}
 */
function resolveAbsolutePath(state, segments) {
    if (!segments || segments.length === 0) return null;
    const root = getScope(state, []);
    if (segments.length === 1) {
        const rootAlias = root.aliases.get(segments[0]);
        if (rootAlias) {
            return targetFromAlias(rootAlias, root.path);
        }
        if (root.items.has(segments[0])) {
            return { kind: "item", qualifiedName: /** @type {string} */ (root.items.get(segments[0])) };
        }
        if (root.modules.has(segments[0])) {
            return {
                kind: "module",
                qualifiedName: /** @type {string} */ (root.modules.get(segments[0])),
            };
        }
        return null;
    }

    let moduleQName = root.modules.get(segments[0]);
    if (!moduleQName) {
        const alias = root.aliases.get(segments[0]);
        if (!alias || alias.kind !== "module") return null;
        moduleQName = alias.qualifiedName;
    }
    let modulePath = moduleNameToPath(state, moduleQName);

    for (let i = 1; i < segments.length - 1; i++) {
        const scope = getScope(state, modulePath);
        let nextModuleQName = scope.modules.get(segments[i]);
        if (!nextModuleQName) {
            const alias = scope.aliases.get(segments[i]);
            if (!alias || alias.kind !== "module") return null;
            nextModuleQName = alias.qualifiedName;
        }
        moduleQName = nextModuleQName;
        modulePath = moduleNameToPath(state, moduleQName);
    }

    const finalScope = getScope(state, modulePath);
    const last = segments[segments.length - 1];
    const finalAlias = finalScope.aliases.get(last);
    if (finalAlias) {
        return targetFromAlias(finalAlias, finalScope.path);
    }
    if (finalScope.items.has(last)) {
        return { kind: "item", qualifiedName: /** @type {string} */ (finalScope.items.get(last)) };
    }
    if (finalScope.modules.has(last)) {
        return { kind: "module", qualifiedName: /** @type {string} */ (finalScope.modules.get(last)) };
    }
    return null;
}

/**
 * @param {{ moduleScopes: Map<string, ModuleScope>, itemDecls: Map<string, any>, moduleDecls: Map<string, any> }} state
 * @param {string[]} currentModulePath
 * @param {string[]} segments
 * @returns {{ kind: "item" | "module", qualifiedName: string } | null}
 */
function resolvePathFromModule(state, currentModulePath, segments) {
    if (!segments || segments.length === 0) return null;
    if (segments.length === 1) {
        return resolveNameInScope(state, currentModulePath, segments[0]);
    }

    const first = resolveNameInScope(state, currentModulePath, segments[0]);
    if (!first) return null;
    if (first.kind === "item") {
        return null;
    }

    let modulePath = moduleNameToPath(state, first.qualifiedName);
    for (let i = 1; i < segments.length - 1; i++) {
        const scope = getScope(state, modulePath);
        let next = scope.modules.get(segments[i]);
        if (!next) {
            const alias = scope.aliases.get(segments[i]);
            if (!alias || alias.kind !== "module") return null;
            next = alias.qualifiedName;
        }
        if (!next) return null;
        modulePath = moduleNameToPath(state, next);
    }

    const finalScope = getScope(state, modulePath);
    const last = segments[segments.length - 1];
    const finalAlias = finalScope.aliases.get(last);
    if (finalAlias) {
        return targetFromAlias(finalAlias, finalScope.path);
    }
    if (finalScope.items.has(last)) {
        return { kind: "item", qualifiedName: /** @type {string} */ (finalScope.items.get(last)) };
    }
    if (finalScope.modules.has(last)) {
        return { kind: "module", qualifiedName: /** @type {string} */ (finalScope.modules.get(last)) };
    }
    return null;
}

/**
 * @param {{ moduleDecls: Map<string, any> }} state
 * @param {string[]} currentModulePath
 * @param {string[]} targetModulePath
 * @returns {boolean}
 */
function canTraverseModules(state, currentModulePath, targetModulePath) {
    for (let i = 1; i <= targetModulePath.length; i++) {
        const partial = targetModulePath.slice(0, i);
        const qname = modulePathKey(partial);
        const decl = state.moduleDecls.get(qname);
        if (!decl) continue;
        if (decl.isPub) continue;
        if (!isAncestorOrDescendant(currentModulePath, partial)) {
            return false;
        }
    }
    return true;
}

/**
 * @param {{
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>
 * }} state
 * @param {string[]} currentModulePath
 * @param {{ kind: "item" | "module", qualifiedName: string }} target
 * @returns {boolean}
 */
function canAccessTarget(state, currentModulePath, target) {
    const viaAlias = target?.viaAlias;
    if (viaAlias) {
        if (arraysEqual(currentModulePath, viaAlias.modulePath)) {
            return canAccessTarget(state, viaAlias.modulePath, {
                kind: target.kind,
                qualifiedName: target.qualifiedName,
            });
        }
        if (!canTraverseModules(state, currentModulePath, viaAlias.modulePath)) {
            return false;
        }
        if (!viaAlias.isPub) {
            return false;
        }
        return canAccessTarget(state, viaAlias.modulePath, {
            kind: target.kind,
            qualifiedName: target.qualifiedName,
        });
    }

    if (target.kind === "module") {
        const moduleDecl = state.moduleDecls.get(target.qualifiedName);
        if (!moduleDecl) return false;
        if (arraysEqual(currentModulePath, moduleDecl.modulePath)) return true;
        if (
            !canTraverseModules(state, currentModulePath, moduleDecl.modulePath)
        ) {
            return false;
        }
        if (moduleDecl.isPub) return true;
        return isAncestorOrDescendant(currentModulePath, moduleDecl.modulePath);
    }

    const itemDecl = state.itemDecls.get(target.qualifiedName);
    if (!itemDecl) return false;
    if (arraysEqual(currentModulePath, itemDecl.modulePath)) return true;
    if (!canTraverseModules(state, currentModulePath, itemDecl.modulePath)) {
        return false;
    }
    return itemDecl.isPub === true;
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {any} tree
 * @param {string[]} parentPath
 * @param {{ kind: "item" | "module", qualifiedName: string } | null} parentTarget
 * @param {ModuleScope} scope
 * @param {any} useItem
 */
function resolveUseTree(state, tree, parentPath, parentTarget, scope, useItem) {
    if (!tree || !Array.isArray(tree.path)) {
        pushError(state.errors, "Malformed use item", useItem.span);
        return;
    }

    // Build the full path for this tree node
    const fullPath = parentPath.length > 0 && tree.path.length > 0
        ? [...parentPath, ...tree.path]
        : tree.path.length > 0
            ? tree.path
            : parentPath;

    // Resolve the target for this path
    let target = null;
    if (fullPath.length > 0) {
        target =
            resolvePathFromModule(state, scope.path, fullPath) ||
            resolveAbsolutePath(state, fullPath);
    } else if (parentTarget) {
        target = parentTarget;
    }

    // If this tree has children, it's a grouped import - process each child
    if (tree.children && tree.children.length > 0) {
        if (!target && fullPath.length === 0 && !parentTarget) {
            for (const child of tree.children) {
                resolveUseTree(state, child, [], null, scope, useItem);
            }
            return;
        }
        if (!target) {
            pushError(
                state.errors,
                `Unresolved import path: ${fullPath.join("::")}`,
                useItem.span,
            );
            return;
        }
        if (target.kind !== "module" && target.kind !== "item") {
            pushError(
                state.errors,
                `Cannot use grouped imports on non-module/item: ${fullPath.join("::")}`,
                useItem.span,
            );
            return;
        }
        if (!canAccessTarget(state, scope.path, target)) {
            pushError(
                state.errors,
                `Import path is not visible here: ${fullPath.join("::")}`,
                useItem.span,
            );
            return;
        }

        // Process each child
        for (const child of tree.children) {
            resolveUseTree(state, child, fullPath, target, scope, useItem);
        }
        return;
    }

    // Simple import (no children)
    if (!target) {
        pushError(
            state.errors,
            `Unresolved import path: ${fullPath.join("::")}`,
            useItem.span,
        );
        return;
    }
    if (!canAccessTarget(state, scope.path, target)) {
        pushError(
            state.errors,
            `Import path is not visible here: ${fullPath.join("::")}`,
            useItem.span,
        );
        return;
    }

    const alias = tree.alias || fullPath[fullPath.length - 1];
    if (!alias) {
        pushError(state.errors, "Import alias is empty", useItem.span);
        return;
    }

    if (
        scope.aliases.has(alias) ||
        scope.items.has(alias) ||
        scope.modules.has(alias)
    ) {
        pushError(
            state.errors,
            `Duplicate import alias in module: ${alias}`,
            useItem.span,
        );
        return;
    }

    scope.aliases.set(alias, {
        kind: target.kind,
        qualifiedName: target.qualifiedName,
        isPub: useItem?.isPub === true,
    });
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 */
function resolveUseItems(state) {
    for (const scope of state.moduleScopes.values()) {
        for (const useItem of scope.uses) {
            const tree = useItem.tree;
            resolveUseTree(state, tree, [], null, scope, useItem);
        }
    }
}

/**
 * @param {string} name
 * @param {Set<string>[]} localScopes
 * @returns {boolean}
 */
function isLocalBinding(name, localScopes) {
    for (let i = localScopes.length - 1; i >= 0; i--) {
        if (localScopes[i].has(name)) return true;
    }
    return false;
}

/**
 * @param {any} pat
 * @param {Set<string>} scope
 */
function bindPatternNames(pat, scope) {
    if (!pat) return;
    switch (pat.kind) {
        case NodeKind.IdentPat:
            if (pat.name) scope.add(pat.name);
            return;
        case NodeKind.BindingPat:
            if (pat.name) scope.add(pat.name);
            bindPatternNames(pat.pat, scope);
            return;
        case NodeKind.TuplePat:
            for (const elem of pat.elements || []) {
                bindPatternNames(elem, scope);
            }
            return;
        case NodeKind.StructPat:
            for (const field of pat.fields || []) {
                bindPatternNames(field.pat, scope);
            }
            return;
        case NodeKind.OrPat:
            if (pat.alternatives && pat.alternatives.length > 0) {
                bindPatternNames(pat.alternatives[0], scope);
            }
            return;
        case NodeKind.SlicePat:
            for (const elem of pat.elements || []) {
                bindPatternNames(elem, scope);
            }
            if (pat.rest) bindPatternNames(pat.rest, scope);
            return;
        default:
            return;
    }
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {string[]} modulePath
 * @param {any} expr
 * @param {Set<string>[]} localScopes
 */
function resolveExpr(state, modulePath, expr, localScopes) {
    if (!expr) return;
    switch (expr.kind) {
        case NodeKind.IdentifierExpr: {
            if (isLocalBinding(expr.name, localScopes)) return;
            const target = resolveNameInScope(state, modulePath, expr.name);
            if (!target || target.kind !== "item") return;
            if (!canAccessTarget(state, modulePath, target)) {
                pushError(
                    state.errors,
                    `Path is not visible here: ${expr.name}`,
                    expr.span,
                );
                return;
            }
            expr.resolvedItemName = target.qualifiedName;
            return;
        }

        case NodeKind.PathExpr: {
            if (!expr.segments || expr.segments.length === 0) return;
            if (
                expr.segments.length === 1 &&
                isLocalBinding(expr.segments[0], localScopes)
            ) {
                return;
            }
            const target = resolvePathFromModule(state, modulePath, expr.segments);
            if (!target || target.kind !== "item") {
                const first = resolveNameInScope(
                    state,
                    modulePath,
                    expr.segments[0],
                );
                if (first && first.kind === "module") {
                    pushError(
                        state.errors,
                        `Unresolved path: ${expr.segments.join("::")}`,
                        expr.span,
                    );
                }
                return;
            }
            if (!canAccessTarget(state, modulePath, target)) {
                pushError(
                    state.errors,
                    `Path is not visible here: ${expr.segments.join("::")}`,
                    expr.span,
                );
                return;
            }
            expr.resolvedItemName = target.qualifiedName;
            return;
        }

        case NodeKind.BinaryExpr:
            resolveExpr(state, modulePath, expr.left, localScopes);
            resolveExpr(state, modulePath, expr.right, localScopes);
            return;
        case NodeKind.UnaryExpr:
            resolveExpr(state, modulePath, expr.operand, localScopes);
            return;
        case NodeKind.CallExpr:
            resolveExpr(state, modulePath, expr.callee, localScopes);
            for (const arg of expr.args || []) {
                resolveExpr(state, modulePath, arg, localScopes);
            }
            return;
        case NodeKind.FieldExpr:
            resolveExpr(state, modulePath, expr.receiver, localScopes);
            if (typeof expr.field !== "string") {
                resolveExpr(state, modulePath, expr.field, localScopes);
            }
            return;
        case NodeKind.IndexExpr:
            resolveExpr(state, modulePath, expr.receiver, localScopes);
            resolveExpr(state, modulePath, expr.index, localScopes);
            return;
        case NodeKind.AssignExpr:
            resolveExpr(state, modulePath, expr.target, localScopes);
            resolveExpr(state, modulePath, expr.value, localScopes);
            return;
        case NodeKind.IfExpr:
            resolveExpr(state, modulePath, expr.condition, localScopes);
            resolveBlock(state, modulePath, expr.thenBranch, localScopes);
            if (expr.elseBranch) {
                if (expr.elseBranch.kind === NodeKind.BlockExpr) {
                    resolveBlock(state, modulePath, expr.elseBranch, localScopes);
                } else {
                    resolveExpr(state, modulePath, expr.elseBranch, localScopes);
                }
            }
            return;
        case NodeKind.MatchExpr:
            resolveExpr(state, modulePath, expr.scrutinee, localScopes);
            for (const arm of expr.arms || []) {
                localScopes.push(new Set());
                bindPatternNames(arm.pat, localScopes[localScopes.length - 1]);
                if (arm.guard) {
                    resolveExpr(state, modulePath, arm.guard, localScopes);
                }
                resolveBlock(state, modulePath, arm.body, localScopes);
                localScopes.pop();
            }
            return;
        case NodeKind.BlockExpr:
            resolveBlock(state, modulePath, expr, localScopes);
            return;
        case NodeKind.ReturnExpr:
        case NodeKind.BreakExpr:
            if (expr.value) resolveExpr(state, modulePath, expr.value, localScopes);
            return;
        case NodeKind.LoopExpr:
        case NodeKind.WhileExpr:
            if (expr.condition) {
                resolveExpr(state, modulePath, expr.condition, localScopes);
            }
            resolveBlock(state, modulePath, expr.body, localScopes);
            return;
        case NodeKind.ForExpr:
            resolveExpr(state, modulePath, expr.iter, localScopes);
            localScopes.push(new Set());
            bindPatternNames(expr.pat, localScopes[localScopes.length - 1]);
            resolveBlock(state, modulePath, expr.body, localScopes);
            localScopes.pop();
            return;
        case NodeKind.StructExpr:
            resolveExpr(state, modulePath, expr.path, localScopes);
            for (const field of expr.fields || []) {
                resolveExpr(state, modulePath, field.value, localScopes);
            }
            if (expr.spread) resolveExpr(state, modulePath, expr.spread, localScopes);
            return;
        case NodeKind.RangeExpr:
            resolveExpr(state, modulePath, expr.start, localScopes);
            if (expr.end) resolveExpr(state, modulePath, expr.end, localScopes);
            return;
        case NodeKind.RefExpr:
        case NodeKind.DerefExpr:
            resolveExpr(state, modulePath, expr.operand, localScopes);
            return;
        case NodeKind.MacroExpr:
            for (const arg of expr.args || []) {
                resolveExpr(state, modulePath, arg, localScopes);
            }
            return;
        case NodeKind.ClosureExpr: {
            localScopes.push(new Set());
            for (const param of expr.params || []) {
                if (param.name && param.name !== "_") {
                    localScopes[localScopes.length - 1].add(param.name);
                }
            }
            if (expr.body?.kind === NodeKind.BlockExpr) {
                resolveBlock(state, modulePath, expr.body, localScopes);
            } else if (expr.body) {
                resolveExpr(state, modulePath, expr.body, localScopes);
            }
            localScopes.pop();
            return;
        }
        default:
            return;
    }
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {string[]} modulePath
 * @param {any} stmt
 * @param {Set<string>[]} localScopes
 */
function resolveStmt(state, modulePath, stmt, localScopes) {
    if (!stmt) return;
    switch (stmt.kind) {
        case NodeKind.LetStmt:
            if (stmt.init) resolveExpr(state, modulePath, stmt.init, localScopes);
            bindPatternNames(stmt.pat, localScopes[localScopes.length - 1]);
            return;
        case NodeKind.ExprStmt:
            resolveExpr(state, modulePath, stmt.expr, localScopes);
            return;
        default:
            return;
    }
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {string[]} modulePath
 * @param {any} block
 * @param {Set<string>[]} localScopes
 */
function resolveBlock(state, modulePath, block, localScopes) {
    if (!block) return;
    localScopes.push(new Set());
    for (const stmt of block.stmts || []) {
        resolveStmt(state, modulePath, stmt, localScopes);
    }
    if (block.expr) {
        resolveExpr(state, modulePath, block.expr, localScopes);
    }
    localScopes.pop();
}

/**
 * @param {{
 *   moduleScopes: Map<string, ModuleScope>,
 *   itemDecls: Map<string, any>,
 *   moduleDecls: Map<string, any>,
 *   errors: ResolverError[]
 * }} state
 * @param {any[]} items
 * @param {string[]} modulePath
 */
function resolveModuleExprs(state, items, modulePath) {
    for (const item of items || []) {
        if (item.kind === NodeKind.FnItem && item.body) {
            const localScopes = [new Set()];
            for (const param of item.params || []) {
                if (param.name) localScopes[0].add(param.name);
            }
            resolveBlock(state, modulePath, item.body, localScopes);
            continue;
        }
        if (item.kind === NodeKind.ModItem) {
            resolveModuleExprs(state, item.items || [], [...modulePath, item.name]);
            continue;
        }
        if (item.kind === NodeKind.ImplItem) {
            for (const method of item.methods || []) {
                if (!method.body) continue;
                const localScopes = [new Set()];
                for (const param of method.params || []) {
                    if (param.name) localScopes[0].add(param.name);
                }
                resolveBlock(state, modulePath, method.body, localScopes);
            }
        }
    }
}

/**
 * @param {any[]} items
 * @param {any[]} out
 */
function flattenItems(items, out) {
    for (const item of items || []) {
        if (item.kind === NodeKind.ModItem) {
            flattenItems(item.items || [], out);
            continue;
        }
        if (item.kind === NodeKind.ImplItem) {
            out.push(item);
            continue;
        }
        if (!isDeclItem(item)) {
            continue;
        }
        item.unqualifiedName = item.name;
        if (item.qualifiedName) {
            item.name = item.qualifiedName;
        }
        out.push(item);
    }
}

/**
 * Expand modules (inline + file), resolve simple imports, and bind path expressions.
 * The output module is flattened to top-level declaration items to fit the current
 * lowering pipeline.
 *
 * @param {any} ast
 * @param {{ sourcePath?: string }} [options]
 * @returns {{ ok: boolean, module?: any, errors?: ResolverError[] }}
 */
function resolveModuleTree(ast, options = {}) {
    const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : null;
    /** @type {ResolverError[]} */
    const errors = [];

    const expansionState = {
        errors,
        sourcePath,
        loadingStack: sourcePath ? [sourcePath] : [],
    };
    expandModuleItems(expansionState, ast.items || [], [], sourcePath);

    const state = {
        moduleScopes: new Map(),
        itemDecls: new Map(),
        moduleDecls: new Map(),
        errors,
    };
    ensureScope(state, []);
    registerModuleItems(state, ast.items || [], []);
    resolveUseItems(state);
    resolveModuleExprs(state, ast.items || [], []);

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    const /** @type {any[]} */ flattened = [];
    flattenItems(ast.items || [], flattened);
    ast.items = flattened;
    return { ok: true, module: ast };
}

export { resolveModuleTree };
