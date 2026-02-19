import { TypeKind, makeTypeVar } from "./types.js";

/** @typedef {import("./types.js").Type} Type */
/** @typedef {import("./ast.js").Node} Node */

/**
 * @typedef {object} VarBinding
 * @property {string} name
 * @property {Type} type
 * @property {boolean} mutable
 * @property {Span} [span]
 */

/**
 * @typedef {object} ItemDecl
 * @property {string} name
 * @property {'fn' | 'struct' | 'enum' | 'mod' | 'type'} kind
 * @property {Node} node
 * @property {Type} [type]
 */

/**
 * @typedef {object} Scope
 * @property {Map<string, VarBinding>} bindings
 * @property {Scope | null} parent
 */

/**
 * @typedef {{ line: number, column: number, start: number, end: number }} Span
 */

// ============================================================================
// Task 3.6: Type Context
// ============================================================================

/**
 * Type context for tracking scopes, bindings, and item declarations
 */
class TypeContext {
    constructor() {
        /** @type {Scope} */
        this.currentScope = { bindings: new Map(), parent: null };

        /** @type {Map<string, ItemDecl>} */
        this.items = new Map();

        /** @type {Map<string, Type>} */
        this.typeAliases = new Map();

        /** @type {Type | null} */
        this.currentFn = null;

        /** @type {Type | null} */
        this.currentReturnType = null;

        /** @type {Map<number, Type>} */
        this.typeVars = new Map();

        /** @type {Map<string, Type>} - Interned types for deduplication */
        this.internedTypes = new Map();
    }

    // ========================================================================
    // Task 3.7: Scope Management
    // ========================================================================

    /**
     * Enter a new scope
     * @returns {void}
     */
    pushScope() {
        this.currentScope = {
            bindings: new Map(),
            parent: this.currentScope,
        };
    }

    /**
     * Exit current scope
     * @returns {{ ok: boolean, error?: string }}
     */
    popScope() {
        if (!this.currentScope.parent) {
            return { ok: false, error: "Cannot pop root scope" };
        }
        this.currentScope = this.currentScope.parent;
        return { ok: true };
    }

    /**
     * Define a variable in current scope
     * @param {string} name
     * @param {Type} type
     * @param {boolean} [mutable=false]
     * @param {Span} [span]
     * @returns {{ ok: boolean, error?: string }}
     */
    defineVar(name, type, mutable = false, span) {
        if (this.currentScope.bindings.has(name)) {
            return {
                ok: false,
                error: `Variable '${name}' already defined in this scope`,
            };
        }
        this.currentScope.bindings.set(name, { name, type, mutable, span });
        return { ok: true };
    }

    /**
     * Look up a variable in the scope chain
     * @param {string} name
     * @returns {VarBinding | null}
     */
    lookupVar(name) {
        let scope = this.currentScope;
        while (scope) {
            const binding = scope.bindings.get(name);
            if (binding) {
                return binding;
            }
            scope = scope.parent;
        }
        return null;
    }

    /**
     * Check if a variable exists in current scope only
     * @param {string} name
     * @returns {boolean}
     */
    varInCurrentScope(name) {
        return this.currentScope.bindings.has(name);
    }

    /**
     * Get all variable bindings in current scope
     * @returns {VarBinding[]}
     */
    getCurrentScopeBindings() {
        return Array.from(this.currentScope.bindings.values());
    }

    // ========================================================================
    // Task 3.8: Item Registry
    // ========================================================================

    /**
     * Register a struct declaration
     * @param {string} name
     * @param {Node} decl
     * @returns {{ ok: boolean, error?: string }}
     */
    registerStruct(name, decl) {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "struct", node: decl });
        return { ok: true };
    }

    /**
     * Register an enum declaration
     * @param {string} name
     * @param {Node} decl
     * @returns {{ ok: boolean, error?: string }}
     */
    registerEnum(name, decl) {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "enum", node: decl });
        return { ok: true };
    }

    /**
     * Register a function declaration
     * @param {string} name
     * @param {Node} decl
     * @param {Type} [type]
     * @returns {{ ok: boolean, error?: string }}
     */
    registerFn(name, decl, type) {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "fn", node: decl, type });
        return { ok: true };
    }

    /**
     * Register a module declaration
     * @param {string} name
     * @param {Node} decl
     * @returns {{ ok: boolean, error?: string }}
     */
    registerMod(name, decl) {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "mod", node: decl });
        return { ok: true };
    }

    /**
     * Register a type alias
     * @param {string} name
     * @param {Node} decl
     * @param {Type} type
     * @returns {{ ok: boolean, error?: string }}
     */
    registerTypeAlias(name, decl, type) {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "type", node: decl });
        this.typeAliases.set(name, type);
        return { ok: true };
    }

    /**
     * Look up an item by name
     * @param {string} name
     * @returns {ItemDecl | null}
     */
    lookupItem(name) {
        return this.items.get(name) || null;
    }

    /**
     * Look up a type alias by name
     * @param {string} name
     * @returns {Type | null}
     */
    lookupTypeAlias(name) {
        return this.typeAliases.get(name) || null;
    }

    /**
     * Check if an item exists
     * @param {string} name
     * @returns {boolean}
     */
    hasItem(name) {
        return this.items.has(name);
    }

    /**
     * Get all registered items
     * @returns {ItemDecl[]}
     */
    getAllItems() {
        return Array.from(this.items.values());
    }

    // ========================================================================
    // Function Tracking
    // ========================================================================

    /**
     * Set the current function context
     * @param {Type | null} fnType
     * @param {Type | null} returnType
     */
    setCurrentFn(fnType, returnType) {
        this.currentFn = fnType;
        this.currentReturnType = returnType;
    }

    /**
     * Clear the current function context
     */
    clearCurrentFn() {
        this.currentFn = null;
        this.currentReturnType = null;
    }

    /**
     * Get the current function's return type
     * @returns {Type | null}
     */
    getCurrentReturnType() {
        return this.currentReturnType;
    }

    // ========================================================================
    // Type Variable Management
    // ========================================================================

    /**
     * Create a fresh type variable
     * @returns {Type}
     */
    freshTypeVar() {
        const tv = makeTypeVar();
        this.typeVars.set(tv.id, tv);
        return tv;
    }

    /**
     * Bind a type variable to a type
     * @param {number} id
     * @param {Type} type
     * @returns {{ ok: boolean, error?: string }}
     */
    bindTypeVar(id, type) {
        const tv = this.typeVars.get(id);
        if (!tv) {
            return { ok: false, error: `Type variable ${id} not found` };
        }
        if (tv.bound !== null) {
            return { ok: false, error: `Type variable ${id} is already bound` };
        }
        // Check for occurs check (prevent infinite types)
        if (this.occursIn(id, type)) {
            return {
                ok: false,
                error: `Occurs check failed: type variable ${id} occurs in type`,
            };
        }
        tv.bound = type;
        return { ok: true };
    }

    /**
     * Check if a type variable occurs in a type (occurs check)
     * @param {number} id
     * @param {Type} type
     * @returns {boolean}
     */
    occursIn(id, type) {
        if (type.kind === TypeKind.TypeVar) {
            if (type.id === id) return true;
            if (type.bound) return this.occursIn(id, type.bound);
            return false;
        }
        // Recursively check composite types
        switch (type.kind) {
            case TypeKind.Tuple:
                return type.elements.some((t) => this.occursIn(id, t));
            case TypeKind.Array:
            case TypeKind.Slice:
                return this.occursIn(id, type.element);
            case TypeKind.Ref:
            case TypeKind.Ptr:
                return this.occursIn(id, type.inner);
            case TypeKind.Fn:
                return (
                    type.params.some((t) => this.occursIn(id, t)) ||
                    this.occursIn(id, type.returnType)
                );
            case TypeKind.Named:
                return type.args
                    ? type.args.some((t) => this.occursIn(id, t))
                    : false;
            default:
                return false;
        }
    }

    /**
     * Get the resolved type (follow type variable bindings)
     * @param {Type} type
     * @returns {Type}
     */
    resolveType(type) {
        if (type.kind === TypeKind.TypeVar && type.bound) {
            return this.resolveType(type.bound);
        }
        return type;
    }

    // ========================================================================
    // Type Interning
    // ========================================================================

    /**
     * Get or create an interned type
     * @param {Type} type
     * @returns {Type}
     */
    internType(type) {
        const key = this.typeToKey(type);
        const existing = this.internedTypes.get(key);
        if (existing) {
            return existing;
        }
        this.internedTypes.set(key, type);
        return type;
    }

    /**
     * Convert a type to a string key for interning
     * @param {Type} type
     * @returns {string}
     */
    typeToKey(type) {
        switch (type.kind) {
            case TypeKind.Int:
                return `Int(${type.width})`;
            case TypeKind.Float:
                return `Float(${type.width})`;
            case TypeKind.Bool:
                return "Bool";
            case TypeKind.Char:
                return "Char";
            case TypeKind.String:
                return "String";
            case TypeKind.Unit:
                return "Unit";
            case TypeKind.Never:
                return "Never";
            case TypeKind.Tuple:
                return `Tuple(${type.elements.map((t) => this.typeToKey(t)).join(",")})`;
            case TypeKind.Array:
                return `Array(${this.typeToKey(type.element)},${type.length})`;
            case TypeKind.Slice:
                return `Slice(${this.typeToKey(type.element)})`;
            case TypeKind.Struct:
                return `Struct(${type.name})`;
            case TypeKind.Enum:
                return `Enum(${type.name})`;
            case TypeKind.Ref:
                return `Ref(${type.mutable ? "mut" : "imm"},${this.typeToKey(type.inner)})`;
            case TypeKind.Ptr:
                return `Ptr(${type.mutable ? "mut" : "const"},${this.typeToKey(type.inner)})`;
            case TypeKind.Fn:
                return `Fn(${type.params.map((t) => this.typeToKey(t)).join(",")})->${this.typeToKey(type.returnType)}`;
            case TypeKind.TypeVar:
                return `TypeVar(${type.id})`;
            case TypeKind.Named:
                return `Named(${type.name}${type.args ? `<${type.args.map((t) => this.typeToKey(t)).join(",")}>` : ""})`;
            default:
                return `Unknown(${type.kind})`;
        }
    }
}

export { TypeContext };
