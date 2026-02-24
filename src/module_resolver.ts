import * as fs from "fs";
import * as path from "path";
import { parseModule } from "./parser";
import { NodeKind } from "./ast";

// ============================================================================
// Types and Interfaces
// ============================================================================

/** Source code position information */
type Span = {
    line: number;
    column: number;
    start: number;
    end: number;
};

/** Kinds of items that can be declared (fn, struct, enum, trait) */
type DeclItemKind = "fn" | "struct" | "enum" | "trait";

/** Error produced during module resolution */
type ResolverError = {
    message: string;
    span?: Span;
    kind?: string;
};

/** Information about a declared item (fn, struct, enum, trait) */
type ItemDecl = {
    qualifiedName: string;
    modulePath: string[];
    isPub: boolean;
    node: AstNode;
    kind: DeclItemKind;
};

/** Information about a declared module */
type ModuleDecl = {
    qualifiedName: string;
    modulePath: string[];
    isPub: boolean;
    node: ModItemNode;
};

/** Alias entry in a module scope */
type AliasEntry = {
    kind: "item" | "module";
    qualifiedName: string;
    isPub: boolean;
};

/** Scope for a single module containing its local names */
type ModuleScope = {
    path: string[];
    items: Map<string, string>;
    modules: Map<string, string>;
    aliases: Map<string, AliasEntry>;
    uses: UseItemNode[];
};

/** Result of resolving a name to a target */
type ResolvedTarget = {
    kind: "item" | "module";
    qualifiedName: string;
    viaAlias?: {
        modulePath: string[];
        isPub: boolean;
    };
};

/** State for module expansion phase */
type ExpansionState = {
    errors: ResolverError[];
    sourcePath: string | null;
    loadingStack: string[];
};

/** State for the full resolution process */
type ResolverState = {
    moduleScopes: Map<string, ModuleScope>;
    itemDecls: Map<string, ItemDecl>;
    moduleDecls: Map<string, ModuleDecl>;
    errors: ResolverError[];
};

// ============================================================================
// AST Node Types (subset used by resolver)
// These are typed as minimally as needed for the resolver's operations.
// ============================================================================

type AstNode = BaseNode & Record<string, unknown>;

/** Helper to cast AstNode to a specific node type */
function asNode<T extends BaseNode>(node: AstNode): T {
    return node as unknown as T;
}

type BaseNode = {
    kind: NodeKind;
    span: Span;
    modulePath?: string[];
    sourcePath?: string | null;
    qualifiedName?: string;
    unqualifiedName?: string;
    name?: string;
    isPub?: boolean;
};

interface FnItemNode extends BaseNode {
    kind: NodeKind.FnItem;
    name: string;
    params: ParamNode[];
    body: BlockExprNode | null;
    isPub: boolean;
}

interface ModItemNode extends BaseNode {
    kind: NodeKind.ModItem;
    name: string;
    items: AstNode[];
    isInline: boolean;
    isPub: boolean;
}

interface UseItemNode extends BaseNode {
    kind: NodeKind.UseItem;
    tree: UseTreeNode;
    isPub: boolean;
}

interface ImplItemNode extends BaseNode {
    kind: NodeKind.ImplItem;
    targetType: TypeNode;
    traitType: TypeNode | null;
    methods: FnItemNode[];
}

interface UseTreeNode extends BaseNode {
    kind: NodeKind.UseTree;
    path: string[];
    alias: string | null;
    children: UseTreeNode[] | null;
}

interface ParamNode extends Omit<BaseNode, "name"> {
    kind: NodeKind.Param;
    name: string | null;
}

interface TypeNode extends BaseNode {
    kind: NodeKind.NamedType;
    name: string;
}

interface BlockExprNode extends BaseNode {
    kind: NodeKind.BlockExpr;
    stmts: StmtNode[];
    expr: ExprNode | null;
}

interface LetStmtNode extends BaseNode {
    kind: NodeKind.LetStmt;
    pat: PatNode;
    init: ExprNode | null;
}

interface ExprStmtNode extends BaseNode {
    kind: NodeKind.ExprStmt;
    expr: ExprNode;
}

type StmtNode = LetStmtNode | ExprStmtNode | BaseNode;

interface IdentifierExprNode extends BaseNode {
    kind: NodeKind.IdentifierExpr;
    name: string;
    resolvedItemName?: string;
}

interface PathExprNode extends BaseNode {
    kind: NodeKind.PathExpr;
    segments: string[];
    resolvedItemName?: string;
}

interface BinaryExprNode extends BaseNode {
    kind: NodeKind.BinaryExpr;
    left: ExprNode;
    right: ExprNode;
}

interface UnaryExprNode extends BaseNode {
    kind: NodeKind.UnaryExpr;
    operand: ExprNode;
}

interface CallExprNode extends BaseNode {
    kind: NodeKind.CallExpr;
    callee: ExprNode;
    args: ExprNode[];
}

interface FieldExprNode extends BaseNode {
    kind: NodeKind.FieldExpr;
    receiver: ExprNode;
    field: string | ExprNode;
}

interface IndexExprNode extends BaseNode {
    kind: NodeKind.IndexExpr;
    receiver: ExprNode;
    index: ExprNode;
}

interface AssignExprNode extends BaseNode {
    kind: NodeKind.AssignExpr;
    target: ExprNode;
    value: ExprNode;
}

interface IfExprNode extends BaseNode {
    kind: NodeKind.IfExpr;
    condition: ExprNode;
    thenBranch: BlockExprNode;
    elseBranch: ExprNode | BlockExprNode | null;
}

interface MatchExprNode extends BaseNode {
    kind: NodeKind.MatchExpr;
    scrutinee: ExprNode;
    arms: MatchArmNode[];
}

interface MatchArmNode extends BaseNode {
    kind: NodeKind.MatchArm;
    pat: PatNode;
    guard: ExprNode | null;
    body: BlockExprNode;
}

interface LoopExprNode extends BaseNode {
    kind: NodeKind.LoopExpr;
    body: BlockExprNode;
}

interface WhileExprNode extends BaseNode {
    kind: NodeKind.WhileExpr;
    condition: ExprNode;
    body: BlockExprNode;
}

interface ForExprNode extends BaseNode {
    kind: NodeKind.ForExpr;
    pat: PatNode;
    iter: ExprNode;
    body: BlockExprNode;
}

interface StructExprNode extends BaseNode {
    kind: NodeKind.StructExpr;
    path: ExprNode;
    fields: { name: string; value: ExprNode }[];
    spread: ExprNode | null;
}

interface RangeExprNode extends BaseNode {
    kind: NodeKind.RangeExpr;
    start: ExprNode | null;
    end: ExprNode | null;
}

interface RefExprNode extends BaseNode {
    kind: NodeKind.RefExpr;
    operand: ExprNode;
}

interface DerefExprNode extends BaseNode {
    kind: NodeKind.DerefExpr;
    operand: ExprNode;
}

interface MacroExprNode extends BaseNode {
    kind: NodeKind.MacroExpr;
    args: ExprNode[];
}

interface ClosureExprNode extends BaseNode {
    kind: NodeKind.ClosureExpr;
    params: ParamNode[];
    body: ExprNode | BlockExprNode;
}

interface ReturnExprNode extends BaseNode {
    kind: NodeKind.ReturnExpr;
    value: ExprNode | null;
}

interface BreakExprNode extends BaseNode {
    kind: NodeKind.BreakExpr;
    value: ExprNode | null;
}

type ExprNode =
    | IdentifierExprNode
    | PathExprNode
    | BinaryExprNode
    | UnaryExprNode
    | CallExprNode
    | FieldExprNode
    | IndexExprNode
    | AssignExprNode
    | IfExprNode
    | MatchExprNode
    | BlockExprNode
    | LoopExprNode
    | WhileExprNode
    | ForExprNode
    | StructExprNode
    | RangeExprNode
    | RefExprNode
    | DerefExprNode
    | MacroExprNode
    | ClosureExprNode
    | ReturnExprNode
    | BreakExprNode
    | BaseNode;

interface IdentPatNode extends BaseNode {
    kind: NodeKind.IdentPat;
    name: string;
}

interface BindingPatNode extends BaseNode {
    kind: NodeKind.BindingPat;
    name: string;
    pat: PatNode;
}

interface TuplePatNode extends BaseNode {
    kind: NodeKind.TuplePat;
    elements: PatNode[];
}

interface StructPatNode extends BaseNode {
    kind: NodeKind.StructPat;
    fields: { name: string; pat: PatNode }[];
}

interface OrPatNode extends BaseNode {
    kind: NodeKind.OrPat;
    alternatives: PatNode[];
}

interface SlicePatNode extends BaseNode {
    kind: NodeKind.SlicePat;
    elements: PatNode[];
    rest: PatNode | null;
}

type PatNode =
    | IdentPatNode
    | BindingPatNode
    | TuplePatNode
    | StructPatNode
    | OrPatNode
    | SlicePatNode
    | BaseNode;

export interface ModuleNode extends BaseNode {
    kind: NodeKind.Module;
    name: string;
    items: AstNode[];
}

/** Result of parseModule call */
type ParseResult = {
    ok: boolean;
    value: ModuleNode | null;
    errors: { message: string; span?: Span }[];
};

/** Options for resolveModuleTree */
type ResolveOptions = {
    sourcePath?: string;
};

/** Result of resolveModuleTree */
type ResolveResult = {
    ok: boolean;
    module?: ModuleNode;
    errors?: ResolverError[];
};

// ============================================================================
// Utility Functions
// ============================================================================

/** Convert module path array to qualified name string */
function modulePathKey(modulePath: string[]): string {
    return modulePath.join("::");
}

/** Build a qualified name from module path and item name */
function qualifiedName(modulePath: string[], name: string): string {
    if (modulePath.length === 0) return name;
    return `${modulePath.join("::")}::${name}`;
}

/** Check if two string arrays are equal */
function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/** Check if prefix is a prefix of value */
function isPrefix(prefix: string[], value: string[]): boolean {
    if (prefix.length > value.length) return false;
    for (let i = 0; i < prefix.length; i++) {
        if (prefix[i] !== value[i]) return false;
    }
    return true;
}

/** Check if two module paths are ancestor/descendant of each other */
function isAncestorOrDescendant(a: string[], b: string[]): boolean {
    return isPrefix(a, b) || isPrefix(b, a);
}

// ============================================================================
// Scope Management
// ============================================================================

/** Get or create a module scope for the given path */
function ensureScope(state: ResolverState, modulePath: string[]): ModuleScope {
    const key = modulePathKey(modulePath);
    const existing = state.moduleScopes.get(key);
    if (existing) return existing;

    const scope: ModuleScope = {
        path: [...modulePath],
        items: new Map(),
        modules: new Map(),
        aliases: new Map(),
        uses: [],
    };
    state.moduleScopes.set(key, scope);
    return scope;
}

/** Get a scope if it exists, otherwise create it */
function getScope(state: ResolverState, modulePath: string[]): ModuleScope {
    return ensureScope(state, modulePath);
}

/** Add an error to the error list */
function pushError(
    errors: ResolverError[],
    message: string,
    span?: Span,
): void {
    errors.push({ message, span, kind: "resolve" });
}

// ============================================================================
// Module File Resolution
// ============================================================================

/** Resolve the file path for a module declaration */
function resolveModuleFilePath(
    state: ExpansionState,
    parentFilePath: string | null,
    modItem: ModItemNode,
): { ok: true; filePath: string } | { ok: false } {
    if (!parentFilePath) {
        pushError(
            state.errors,
            `File module \`${modItem.name}\` requires compile option \`sourcePath\``,
            modItem.span,
        );
        return { ok: false };
    }

    const parentDir = path.dirname(parentFilePath);
    const fileNextToParent = path.join(parentDir, `${modItem.name}.rs`);
    const fileInSubdir = path.join(parentDir, modItem.name, "mod.rs");

    const hasFileNextToParent = fs.existsSync(fileNextToParent);
    const hasFileInSubdir = fs.existsSync(fileInSubdir);

    if (hasFileNextToParent && hasFileInSubdir) {
        pushError(
            state.errors,
            `Ambiguous module file for \`${modItem.name}\`: both ${fileNextToParent} and ${fileInSubdir} exist`,
            modItem.span,
        );
        return { ok: false };
    }

    if (!hasFileNextToParent && !hasFileInSubdir) {
        pushError(
            state.errors,
            `Module file not found for \`${modItem.name}\`: expected ${fileNextToParent} or ${fileInSubdir}`,
            modItem.span,
        );
        return { ok: false };
    }

    const filePath = hasFileNextToParent ? fileNextToParent : fileInSubdir;

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

// ============================================================================
// AST Node Classification
// ============================================================================

/** Check if a node is a declaration item (fn, struct, enum, trait) */
function isDeclItem(node: AstNode): boolean {
    return (
        node.kind === NodeKind.FnItem ||
        node.kind === NodeKind.StructItem ||
        node.kind === NodeKind.EnumItem ||
        node.kind === NodeKind.TraitItem
    );
}

// ============================================================================
// Module Expansion
// ============================================================================

/** Recursively expand module items, loading file modules and setting paths */
function expandModuleItems(
    state: ExpansionState,
    items: AstNode[],
    modulePath: string[],
    filePath: string | null,
): void {
    for (const item of items || []) {
        // Set module path and source path on each item
        item.modulePath = [...modulePath];
        item.sourcePath = filePath;

        // Set qualified name for declaration items and modules
        if (isDeclItem(item) || item.kind === NodeKind.ModItem) {
            item.qualifiedName = qualifiedName(modulePath, item.name || "");
        }

        // Handle inline module items
        if (item.kind !== NodeKind.ModItem) {
            // Set module path on impl methods
            if (item.kind === NodeKind.ImplItem) {
                const impl = asNode<ImplItemNode>(item);
                for (const method of impl.methods || []) {
                    method.modulePath = [...modulePath];
                    method.sourcePath = filePath;
                }
            }
            continue;
        }

        const modItem = asNode<ModItemNode>(item);
        const childModulePath = [...modulePath, modItem.name];

        // Handle inline modules
        if (modItem.isInline) {
            expandModuleItems(
                state,
                modItem.items || [],
                childModulePath,
                filePath,
            );
            continue;
        }

        // Resolve and load file-based module
        const resolved = resolveModuleFilePath(state, filePath, modItem);
        if (!resolved.ok) {
            modItem.items = modItem.items || [];
            continue;
        }

        // Read the module file
        let source = "";
        try {
            source = fs.readFileSync(resolved.filePath, "utf-8");
        } catch (e) {
            pushError(
                state.errors,
                `Failed to read module file ${resolved.filePath}: ${e instanceof Error ? e.message : String(e)}`,
                modItem.span,
            );
            modItem.items = modItem.items || [];
            continue;
        }

        // Parse the module file
        state.loadingStack.push(resolved.filePath);
        const parseResult = parseModule(source) as ParseResult;

        if (!parseResult.ok || !parseResult.value) {
            for (const err of parseResult.errors || []) {
                state.errors.push({
                    message: `In module file ${resolved.filePath}: ${err.message}`,
                    span: err.span,
                    kind: "resolve",
                });
            }
            modItem.items = modItem.items || [];
            state.loadingStack.pop();
            continue;
        }

        // Recursively expand the loaded module
        modItem.items = parseResult.value.items || [];
        modItem.isInline = true;
        modItem.sourcePath = resolved.filePath;
        expandModuleItems(
            state,
            modItem.items,
            childModulePath,
            resolved.filePath,
        );
        state.loadingStack.pop();
    }
}

// ============================================================================
// Item Registration
// ============================================================================

/** Register all items in a module into the resolver state */
function registerModuleItems(
    state: ResolverState,
    items: AstNode[],
    modulePath: string[],
): void {
    const scope = ensureScope(state, modulePath);

    for (const item of items || []) {
        // Collect use items for later resolution
        if (item.kind === NodeKind.UseItem) {
            scope.uses.push(asNode<UseItemNode>(item));
            continue;
        }

        // Register declaration items
        if (isDeclItem(item)) {
            const qname =
                item.qualifiedName ||
                qualifiedName(modulePath, item.name || "");

            if (state.itemDecls.has(qname)) {
                pushError(
                    state.errors,
                    `Duplicate item declaration: ${qname}`,
                    item.span,
                );
                continue;
            }

            const kind: DeclItemKind =
                item.kind === NodeKind.FnItem
                    ? "fn"
                    : item.kind === NodeKind.StructItem
                      ? "struct"
                      : item.kind === NodeKind.EnumItem
                        ? "enum"
                        : "trait";

            state.itemDecls.set(qname, {
                qualifiedName: qname,
                modulePath: [...modulePath],
                isPub: item.isPub === true,
                node: item,
                kind,
            });
            scope.items.set(item.name || "", qname);
            continue;
        }

        // Register module items
        if (item.kind === NodeKind.ModItem) {
            const modItem = asNode<ModItemNode>(item);
            const childPath = [...modulePath, modItem.name];
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
                isPub: modItem.isPub === true,
                node: modItem,
            });
            scope.modules.set(modItem.name, qname);
            ensureScope(state, childPath);
            registerModuleItems(state, modItem.items || [], childPath);
        }
    }
}

// ============================================================================
// Name Resolution
// ============================================================================

/** Create a resolved target from an alias entry */
function targetFromAlias(
    alias: AliasEntry,
    aliasModulePath: string[],
): ResolvedTarget {
    return {
        kind: alias.kind,
        qualifiedName: alias.qualifiedName,
        viaAlias: {
            modulePath: [...aliasModulePath],
            isPub: alias.isPub === true,
        },
    };
}

/** Resolve a name in the context of a module scope */
function resolveNameInScope(
    state: ResolverState,
    modulePath: string[],
    name: string,
): ResolvedTarget | null {
    const scope = getScope(state, modulePath);

    // Check aliases first
    const alias = scope.aliases.get(name);
    if (alias) return targetFromAlias(alias, scope.path);

    // Check local items
    const itemQName = scope.items.get(name);
    if (itemQName) {
        return { kind: "item", qualifiedName: itemQName };
    }

    // Check local modules
    const moduleQName = scope.modules.get(name);
    if (moduleQName) {
        return { kind: "module", qualifiedName: moduleQName };
    }

    // Check root scope for implicit imports
    const rootScope = getScope(state, []);
    const rootAlias = rootScope.aliases.get(name);
    if (rootAlias) return targetFromAlias(rootAlias, rootScope.path);

    const rootItemQName = rootScope.items.get(name);
    if (rootItemQName) {
        return { kind: "item", qualifiedName: rootItemQName };
    }

    const rootModuleQName = rootScope.modules.get(name);
    if (rootModuleQName) {
        return { kind: "module", qualifiedName: rootModuleQName };
    }

    return null;
}

/** Convert a qualified module name to a path array */
function moduleNameToPath(
    state: ResolverState,
    qualifiedModuleName: string,
): string[] {
    const scope = state.moduleScopes.get(qualifiedModuleName);
    if (scope) return [...scope.path];
    if (!qualifiedModuleName) return [];
    return qualifiedModuleName.split("::");
}

/** Resolve an absolute path (starting from crate root) */
function resolveAbsolutePath(
    state: ResolverState,
    segments: string[],
): ResolvedTarget | null {
    if (!segments || segments.length === 0) return null;

    const root = getScope(state, []);

    // Single segment: check root scope directly
    if (segments.length === 1) {
        const rootAlias = root.aliases.get(segments[0]);
        if (rootAlias) return targetFromAlias(rootAlias, root.path);

        const itemQName = root.items.get(segments[0]);
        if (itemQName) return { kind: "item", qualifiedName: itemQName };

        const moduleQName = root.modules.get(segments[0]);
        if (moduleQName) return { kind: "module", qualifiedName: moduleQName };

        return null;
    }

    // Multiple segments: traverse module hierarchy
    let moduleQName = root.modules.get(segments[0]);
    if (!moduleQName) {
        const alias = root.aliases.get(segments[0]);
        if (!alias || alias.kind !== "module") return null;
        moduleQName = alias.qualifiedName;
    }

    let modulePath = moduleNameToPath(state, moduleQName);

    // Traverse intermediate modules
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

    // Resolve final segment
    const finalScope = getScope(state, modulePath);
    const last = segments[segments.length - 1];

    const finalAlias = finalScope.aliases.get(last);
    if (finalAlias) return targetFromAlias(finalAlias, finalScope.path);

    const itemQName = finalScope.items.get(last);
    if (itemQName) return { kind: "item", qualifiedName: itemQName };

    const moduleQNameFinal = finalScope.modules.get(last);
    if (moduleQNameFinal)
        return { kind: "module", qualifiedName: moduleQNameFinal };

    return null;
}

/** Resolve a path relative to a module */
function resolvePathFromModule(
    state: ResolverState,
    currentModulePath: string[],
    segments: string[],
): ResolvedTarget | null {
    if (!segments || segments.length === 0) return null;

    // Single segment: resolve in current scope
    if (segments.length === 1) {
        return resolveNameInScope(state, currentModulePath, segments[0]);
    }

    // Resolve first segment
    const first = resolveNameInScope(state, currentModulePath, segments[0]);
    if (!first || first.kind === "item") return null;

    // Traverse modules
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

    // Resolve final segment
    const finalScope = getScope(state, modulePath);
    const last = segments[segments.length - 1];

    const finalAlias = finalScope.aliases.get(last);
    if (finalAlias) return targetFromAlias(finalAlias, finalScope.path);

    const itemQName = finalScope.items.get(last);
    if (itemQName) return { kind: "item", qualifiedName: itemQName };

    const moduleQName = finalScope.modules.get(last);
    if (moduleQName) return { kind: "module", qualifiedName: moduleQName };

    return null;
}

// ============================================================================
// Visibility Checking
// ============================================================================

/** Check if a module path can be traversed from the current module */
function canTraverseModules(
    state: ResolverState,
    currentModulePath: string[],
    targetModulePath: string[],
): boolean {
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

/** Check if a target is accessible from the current module */
function canAccessTarget(
    state: ResolverState,
    currentModulePath: string[],
    target: ResolvedTarget,
): boolean {
    // Handle access through an alias
    const viaAlias = target.viaAlias;
    if (viaAlias) {
        if (arraysEqual(currentModulePath, viaAlias.modulePath)) {
            return canAccessTarget(state, viaAlias.modulePath, {
                kind: target.kind,
                qualifiedName: target.qualifiedName,
            });
        }

        if (
            !canTraverseModules(state, currentModulePath, viaAlias.modulePath)
        ) {
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

    // Check module visibility
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

    // Check item visibility
    const itemDecl = state.itemDecls.get(target.qualifiedName);
    if (!itemDecl) return false;

    if (arraysEqual(currentModulePath, itemDecl.modulePath)) return true;

    if (!canTraverseModules(state, currentModulePath, itemDecl.modulePath)) {
        return false;
    }

    return itemDecl.isPub === true;
}

// ============================================================================
// Use Item Resolution
// ============================================================================

/** Resolve a use tree and add aliases to the scope */
function resolveUseTree(
    state: ResolverState,
    tree: UseTreeNode,
    parentPath: string[],
    parentTarget: ResolvedTarget | null,
    scope: ModuleScope,
    useItem: UseItemNode,
): void {
    if (!tree || !Array.isArray(tree.path)) {
        pushError(state.errors, "Malformed use item", useItem.span);
        return;
    }

    // Build the full path for this tree node
    const fullPath =
        parentPath.length > 0 && tree.path.length > 0
            ? [...parentPath, ...tree.path]
            : tree.path.length > 0
              ? tree.path
              : parentPath;

    // Resolve the target for this path
    let target: ResolvedTarget | null = null;
    if (fullPath.length > 0) {
        target =
            resolvePathFromModule(state, scope.path, fullPath) ||
            resolveAbsolutePath(state, fullPath);
    } else if (parentTarget) {
        target = parentTarget;
    }

    // Handle grouped imports with children
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

        if (!canAccessTarget(state, scope.path, target)) {
            pushError(
                state.errors,
                `Import path is not visible here: ${fullPath.join("::")}`,
                useItem.span,
            );
            return;
        }

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

    // Check for duplicate aliases
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
        isPub: useItem.isPub === true,
    });
}

/** Resolve all use items in all module scopes */
function resolveUseItems(state: ResolverState): void {
    const scopes = Array.from(state.moduleScopes.values());
    for (const scope of scopes) {
        for (const useItem of scope.uses) {
            resolveUseTree(state, useItem.tree, [], null, scope, useItem);
        }
    }
}

// ============================================================================
// Expression Resolution
// ============================================================================

/** Check if a name is bound in any local scope */
function isLocalBinding(name: string, localScopes: Set<string>[]): boolean {
    for (let i = localScopes.length - 1; i >= 0; i--) {
        if (localScopes[i].has(name)) return true;
    }
    return false;
}

/** Add names bound by a pattern to a scope */
function bindPatternNames(pat: PatNode, scope: Set<string>): void {
    if (!pat) return;

    switch (pat.kind) {
        case NodeKind.IdentPat:
            if ((pat as IdentPatNode).name)
                scope.add((pat as IdentPatNode).name);
            return;

        case NodeKind.BindingPat: {
            const binding = pat as BindingPatNode;
            if (binding.name) scope.add(binding.name);
            bindPatternNames(binding.pat, scope);
            return;
        }

        case NodeKind.TuplePat: {
            for (const elem of (pat as TuplePatNode).elements || []) {
                bindPatternNames(elem, scope);
            }
            return;
        }

        case NodeKind.StructPat: {
            for (const field of (pat as StructPatNode).fields || []) {
                bindPatternNames(field.pat, scope);
            }
            return;
        }

        case NodeKind.OrPat: {
            const alternatives = (pat as OrPatNode).alternatives;
            if (alternatives && alternatives.length > 0) {
                bindPatternNames(alternatives[0], scope);
            }
            return;
        }

        case NodeKind.SlicePat: {
            const slice = pat as SlicePatNode;
            for (const elem of slice.elements || []) {
                bindPatternNames(elem, scope);
            }
            if (slice.rest) bindPatternNames(slice.rest, scope);
            return;
        }

        default:
            return;
    }
}

/** Resolve names in an expression */
function resolveExpr(
    state: ResolverState,
    modulePath: string[],
    expr: ExprNode,
    localScopes: Set<string>[],
): void {
    if (!expr) return;

    switch (expr.kind) {
        case NodeKind.IdentifierExpr: {
            const ident = expr as IdentifierExprNode;
            if (isLocalBinding(ident.name, localScopes)) return;

            const target = resolveNameInScope(state, modulePath, ident.name);
            if (!target || target.kind !== "item") return;

            if (!canAccessTarget(state, modulePath, target)) {
                pushError(
                    state.errors,
                    `Path is not visible here: ${ident.name}`,
                    expr.span,
                );
                return;
            }
            ident.resolvedItemName = target.qualifiedName;
            return;
        }

        case NodeKind.PathExpr: {
            const pathExpr = expr as PathExprNode;
            if (!pathExpr.segments || pathExpr.segments.length === 0) return;

            // Check if it's a local binding
            if (
                pathExpr.segments.length === 1 &&
                isLocalBinding(pathExpr.segments[0], localScopes)
            ) {
                return;
            }

            const target = resolvePathFromModule(
                state,
                modulePath,
                pathExpr.segments,
            );

            if (!target || target.kind !== "item") {
                const first = resolveNameInScope(
                    state,
                    modulePath,
                    pathExpr.segments[0],
                );
                if (first && first.kind === "module") {
                    pushError(
                        state.errors,
                        `Unresolved path: ${pathExpr.segments.join("::")}`,
                        expr.span,
                    );
                }
                return;
            }

            if (!canAccessTarget(state, modulePath, target)) {
                pushError(
                    state.errors,
                    `Path is not visible here: ${pathExpr.segments.join("::")}`,
                    expr.span,
                );
                return;
            }
            pathExpr.resolvedItemName = target.qualifiedName;
            return;
        }

        case NodeKind.BinaryExpr: {
            const binary = expr as BinaryExprNode;
            resolveExpr(state, modulePath, binary.left, localScopes);
            resolveExpr(state, modulePath, binary.right, localScopes);
            return;
        }

        case NodeKind.UnaryExpr: {
            resolveExpr(
                state,
                modulePath,
                (expr as UnaryExprNode).operand,
                localScopes,
            );
            return;
        }

        case NodeKind.CallExpr: {
            const call = expr as CallExprNode;
            resolveExpr(state, modulePath, call.callee, localScopes);
            for (const arg of call.args || []) {
                resolveExpr(state, modulePath, arg, localScopes);
            }
            return;
        }

        case NodeKind.FieldExpr: {
            const field = expr as FieldExprNode;
            resolveExpr(state, modulePath, field.receiver, localScopes);
            if (typeof field.field !== "string") {
                resolveExpr(state, modulePath, field.field, localScopes);
            }
            return;
        }

        case NodeKind.IndexExpr: {
            const index = expr as IndexExprNode;
            resolveExpr(state, modulePath, index.receiver, localScopes);
            resolveExpr(state, modulePath, index.index, localScopes);
            return;
        }

        case NodeKind.AssignExpr: {
            const assign = expr as AssignExprNode;
            resolveExpr(state, modulePath, assign.target, localScopes);
            resolveExpr(state, modulePath, assign.value, localScopes);
            return;
        }

        case NodeKind.IfExpr: {
            const ifExpr = expr as IfExprNode;
            resolveExpr(state, modulePath, ifExpr.condition, localScopes);
            resolveBlock(state, modulePath, ifExpr.thenBranch, localScopes);
            if (ifExpr.elseBranch) {
                if (ifExpr.elseBranch.kind === NodeKind.BlockExpr) {
                    resolveBlock(
                        state,
                        modulePath,
                        ifExpr.elseBranch as BlockExprNode,
                        localScopes,
                    );
                } else {
                    resolveExpr(
                        state,
                        modulePath,
                        ifExpr.elseBranch,
                        localScopes,
                    );
                }
            }
            return;
        }

        case NodeKind.MatchExpr: {
            const match = expr as MatchExprNode;
            resolveExpr(state, modulePath, match.scrutinee, localScopes);
            for (const arm of match.arms || []) {
                localScopes.push(new Set());
                bindPatternNames(arm.pat, localScopes[localScopes.length - 1]);
                if (arm.guard) {
                    resolveExpr(state, modulePath, arm.guard, localScopes);
                }
                resolveBlock(state, modulePath, arm.body, localScopes);
                localScopes.pop();
            }
            return;
        }

        case NodeKind.BlockExpr:
            resolveBlock(state, modulePath, expr as BlockExprNode, localScopes);
            return;

        case NodeKind.ReturnExpr:
        case NodeKind.BreakExpr: {
            const ret = expr as ReturnExprNode | BreakExprNode;
            if (ret.value)
                resolveExpr(state, modulePath, ret.value, localScopes);
            return;
        }

        case NodeKind.LoopExpr:
        case NodeKind.WhileExpr: {
            const loop = expr as LoopExprNode | WhileExprNode;
            if ("condition" in loop && loop.condition) {
                resolveExpr(state, modulePath, loop.condition, localScopes);
            }
            resolveBlock(state, modulePath, loop.body, localScopes);
            return;
        }

        case NodeKind.ForExpr: {
            const forExpr = expr as ForExprNode;
            resolveExpr(state, modulePath, forExpr.iter, localScopes);
            localScopes.push(new Set());
            bindPatternNames(forExpr.pat, localScopes[localScopes.length - 1]);
            resolveBlock(state, modulePath, forExpr.body, localScopes);
            localScopes.pop();
            return;
        }

        case NodeKind.StructExpr: {
            const struct = expr as StructExprNode;
            resolveExpr(state, modulePath, struct.path, localScopes);
            for (const field of struct.fields || []) {
                resolveExpr(state, modulePath, field.value, localScopes);
            }
            if (struct.spread) {
                resolveExpr(state, modulePath, struct.spread, localScopes);
            }
            return;
        }

        case NodeKind.RangeExpr: {
            const range = expr as RangeExprNode;
            resolveExpr(
                state,
                modulePath,
                range.start as ExprNode,
                localScopes,
            );
            if (range.end) {
                resolveExpr(state, modulePath, range.end, localScopes);
            }
            return;
        }

        case NodeKind.RefExpr:
        case NodeKind.DerefExpr:
            resolveExpr(
                state,
                modulePath,
                (expr as RefExprNode | DerefExprNode).operand,
                localScopes,
            );
            return;

        case NodeKind.MacroExpr:
            for (const arg of (expr as MacroExprNode).args || []) {
                resolveExpr(state, modulePath, arg, localScopes);
            }
            return;

        case NodeKind.ClosureExpr: {
            const closure = expr as ClosureExprNode;
            localScopes.push(new Set());
            for (const param of closure.params || []) {
                if (param.name && param.name !== "_") {
                    localScopes[localScopes.length - 1].add(param.name);
                }
            }
            if (closure.body.kind === NodeKind.BlockExpr) {
                resolveBlock(
                    state,
                    modulePath,
                    closure.body as BlockExprNode,
                    localScopes,
                );
            } else {
                resolveExpr(
                    state,
                    modulePath,
                    closure.body as ExprNode,
                    localScopes,
                );
            }
            localScopes.pop();
            return;
        }

        default:
            return;
    }
}

/** Resolve names in a statement */
function resolveStmt(
    state: ResolverState,
    modulePath: string[],
    stmt: StmtNode,
    localScopes: Set<string>[],
): void {
    if (!stmt) return;

    switch (stmt.kind) {
        case NodeKind.LetStmt: {
            const letStmt = stmt as LetStmtNode;
            if (letStmt.init) {
                resolveExpr(state, modulePath, letStmt.init, localScopes);
            }
            bindPatternNames(letStmt.pat, localScopes[localScopes.length - 1]);
            return;
        }

        case NodeKind.ExprStmt:
            resolveExpr(
                state,
                modulePath,
                (stmt as ExprStmtNode).expr,
                localScopes,
            );
            return;

        default:
            return;
    }
}

/** Resolve names in a block */
function resolveBlock(
    state: ResolverState,
    modulePath: string[],
    block: BlockExprNode,
    localScopes: Set<string>[],
): void {
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

/** Resolve all expressions in a module's items */
function resolveModuleExprs(
    state: ResolverState,
    items: AstNode[],
    modulePath: string[],
): void {
    for (const item of items || []) {
        if (item.kind === NodeKind.FnItem) {
            const fn = item as unknown as FnItemNode;
            if (!fn.body) continue;

            const localScopes: Set<string>[] = [new Set()];
            for (const param of fn.params || []) {
                if (param.name) localScopes[0].add(param.name);
            }
            resolveBlock(state, modulePath, fn.body, localScopes);
            continue;
        }

        if (item.kind === NodeKind.ModItem) {
            const mod = item as unknown as ModItemNode;
            resolveModuleExprs(state, mod.items || [], [
                ...modulePath,
                mod.name,
            ]);
            continue;
        }

        if (item.kind === NodeKind.ImplItem) {
            const impl = item as unknown as ImplItemNode;
            for (const method of impl.methods || []) {
                if (!method.body) continue;

                const localScopes: Set<string>[] = [new Set()];
                for (const param of method.params || []) {
                    if (param.name) localScopes[0].add(param.name);
                }
                resolveBlock(state, modulePath, method.body, localScopes);
            }
        }
    }
}

// ============================================================================
// Module Flattening
// ============================================================================

/** Flatten nested module items into a single list of declarations */
function flattenItems(items: AstNode[], out: AstNode[]): void {
    for (const item of items || []) {
        if (item.kind === NodeKind.ModItem) {
            flattenItems(asNode<ModItemNode>(item).items || [], out);
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

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Expand modules (inline + file), resolve imports, and bind path expressions.
 * The output module is flattened to top-level declaration items to fit the
 * current lowering pipeline.
 *
 * @param ast - The parsed AST module
 * @param options - Resolution options
 * @returns Resolution result with flattened module or errors
 */
function resolveModuleTree(
    ast: ModuleNode,
    options: ResolveOptions = {},
): ResolveResult {
    const sourcePath = options.sourcePath
        ? path.resolve(options.sourcePath)
        : null;

    const errors: ResolverError[] = [];

    // Phase 1: Expand modules (load file modules, set paths)
    const expansionState: ExpansionState = {
        errors,
        sourcePath,
        loadingStack: sourcePath ? [sourcePath] : [],
    };
    expandModuleItems(expansionState, ast.items || [], [], sourcePath);

    // Phase 2: Register items and modules
    const state: ResolverState = {
        moduleScopes: new Map(),
        itemDecls: new Map(),
        moduleDecls: new Map(),
        errors,
    };
    ensureScope(state, []);
    registerModuleItems(state, ast.items || [], []);

    // Phase 3: Resolve use items
    resolveUseItems(state);

    // Phase 4: Resolve expressions
    resolveModuleExprs(state, ast.items || [], []);

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // Phase 5: Flatten for lowering pipeline
    const flattened: AstNode[] = [];
    flattenItems(ast.items || [], flattened);
    ast.items = flattened;

    return { ok: true, module: ast };
}

export { resolveModuleTree };
