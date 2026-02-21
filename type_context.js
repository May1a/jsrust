import { TypeKind, makeTypeVar } from "./types.js";

/** @typedef {import("./types.js").Type} Type */
/** @typedef {import("./types.js").TypeVarType} TypeVarType */
/** @typedef {import("./types.js").FnType} FnType */
/** @typedef {import("./types.js").NamedType} NamedType */
/** @typedef {import("./ast.js").Node} Node */

/**
 * @typedef {object} VarBinding
 * @property {string} name
 * @property {Type} type
 * @property {boolean} mutable
 * @property {Span} [span]
 * @property {{ captures: Array<{ name: string, type: Type, mutable: boolean, byRef?: boolean }>, inferredType?: Type } | null} [closureInfo]
 */

/**
 * @typedef {object} ItemDecl
 * @property {string} name
 * @property {'fn' | 'struct' | 'enum' | 'mod' | 'type' | 'trait'} kind
 * @property {Node} node
 * @property {Type} [type]
 * @property {Map<string, Type>} [genericBindings]
 */

/**
 * @typedef {object} Scope
 * @property {Map<string, VarBinding>} bindings
 * @property {Scope | null} parent
 */

/**
 * @typedef {object} LoopContext
 * @property {boolean} allowsBreakValue
 * @property {Type | null} breakType
 * @property {boolean} hasBreak
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

        /** @type {Map<number, TypeVarType>} */
        this.typeVars = new Map();

        /** @type {Map<string, Type>} - Interned types for deduplication */
        this.internedTypes = new Map();

        /** @type {LoopContext[]} */
        this.loopStack = [];

        /** @type {Map<string, { structName: string, methodName: string, symbolName: string, decl: Node, type: Type, meta: any }>} */
        this.methods = new Map();
        /** @type {Map<string, { typeName: string, traitName: string, methodName: string, symbolName: string, decl: Node, type: Type, meta: any }[]>} */
        this.traitMethods = new Map();
        /** @type {Map<string, { name: string, node: Node }>} */
        this.traits = new Map();
        /** @type {Set<string>} */
        this.traitImpls = new Set();
        /** @type {Map<string, { symbolName: string, type: Type, decl: Node, meta: any }>} */
        this.methodsBySymbol = new Map();

        /** @type {Type[]} */
        this.implSelfTypeStack = [];
        /** @type {Map<string, Type>[]} */
        this.implGenericBindingStack = [];

        /** @type {{ closureDepth: number, captures: Map<string, { name: string, type: Type, mutable: boolean, span?: Span, closureInfo?: any }> }[]} */
        this.closureCaptureTrackers = [];

        /** @type {number} */
        this.allowCapturingClosureValueDepth = 0;
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
        const found = this.lookupVarWithDepth(name);
        return found ? found.binding : null;
    }

    /**
     * Look up a variable and include lexical depth.
     * @param {string} name
     * @returns {{ binding: VarBinding, depth: number } | null}
     */
    lookupVarWithDepth(name) {
        /** @type {Scope | null} */
        let scope = this.currentScope;
        let depth = this.currentScopeDepth();
        while (scope) {
            const binding = scope.bindings.get(name);
            if (binding) {
                return { binding, depth };
            }
            scope = scope.parent;
            depth -= 1;
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

    /**
     * Get lexical depth of the current scope (root is 0).
     * @returns {number}
     */
    currentScopeDepth() {
        let depth = 0;
        let scope = this.currentScope;
        while (scope.parent) {
            depth += 1;
            scope = scope.parent;
        }
        return depth;
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
        this.items.set(name, {
            name,
            kind: "fn",
            node: decl,
            type,
            genericBindings: new Map(),
        });
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

    /**
     * Register an inherent impl method
     * @param {string} structName
     * @param {string} methodName
     * @param {Node} decl
     * @param {Type} fnType
     * @param {any} [meta]
     * @returns {{ ok: boolean, error?: string }}
     */
    registerMethod(structName, methodName, decl, fnType, meta = null) {
        const key = `${structName}::${methodName}`;
        if (this.methods.has(key)) {
            return { ok: false, error: `Method '${key}' already defined` };
        }
        const entry = {
            structName,
            methodName,
            symbolName: key,
            decl,
            type: fnType,
            meta,
        };
        this.methods.set(key, entry);
        this.methodsBySymbol.set(key, {
            symbolName: key,
            type: fnType,
            decl,
            meta,
        });
        return { ok: true };
    }

    /**
     * Look up an inherent impl method by struct and method name.
     * @param {string} structName
     * @param {string} methodName
     * @returns {{ structName: string, methodName: string, symbolName: string, decl: Node, type: Type, meta: any } | null}
     */
    lookupMethod(structName, methodName) {
        return this.methods.get(`${structName}::${methodName}`) || null;
    }

    /**
     * Register a trait declaration.
     * @param {string} traitName
     * @param {Node} decl
     * @returns {{ ok: boolean, error?: string }}
     */
    registerTrait(traitName, decl) {
        if (this.traits.has(traitName)) {
            return { ok: false, error: `Trait '${traitName}' already defined` };
        }
        this.traits.set(traitName, { name: traitName, node: decl });
        return { ok: true };
    }

    /**
     * Look up a trait declaration.
     * @param {string} traitName
     * @returns {{ name: string, node: Node } | null}
     */
    lookupTrait(traitName) {
        return this.traits.get(traitName) || null;
    }

    /**
     * Register a (Trait, Type) impl pair and reject duplicates.
     * @param {string} traitName
     * @param {string} typeName
     * @returns {{ ok: boolean, error?: string }}
     */
    registerTraitImpl(traitName, typeName) {
        const key = `${traitName}::${typeName}`;
        if (this.traitImpls.has(key)) {
            return {
                ok: false,
                error: `Trait impl already defined for (${traitName}, ${typeName})`,
            };
        }
        this.traitImpls.add(key);
        return { ok: true };
    }

    /**
     * Register a trait-provided method for receiver lookup.
     * @param {string} typeName
     * @param {string} traitName
     * @param {string} methodName
     * @param {Node} decl
     * @param {Type} fnType
     * @param {any} [meta]
     * @returns {{ ok: boolean, error?: string, symbolName?: string }}
     */
    registerTraitMethod(typeName, traitName, methodName, decl, fnType, meta = null) {
        const symbolName = `${typeName}::<${traitName}>::${methodName}`;
        const key = `${typeName}::${methodName}`;
        const list = this.traitMethods.get(key) || [];
        if (list.some((entry) => entry.traitName === traitName)) {
            return {
                ok: false,
                error: `Trait method already defined for (${typeName}, ${traitName}, ${methodName})`,
            };
        }
        list.push({
            typeName,
            traitName,
            methodName,
            symbolName,
            decl,
            type: fnType,
            meta,
        });
        this.traitMethods.set(key, list);
        this.methodsBySymbol.set(symbolName, {
            symbolName,
            type: fnType,
            decl,
            meta,
        });
        return { ok: true, symbolName };
    }

    /**
     * Look up inherent+trait method candidates for a receiver type key.
     * Inherent methods always win over trait methods.
     * @param {string} typeName
     * @param {string} methodName
     * @returns {{ inherent: { structName: string, methodName: string, symbolName: string, decl: Node, type: Type, meta: any } | null, traits: { typeName: string, traitName: string, methodName: string, symbolName: string, decl: Node, type: Type, meta: any }[] }}
     */
    lookupMethodCandidates(typeName, methodName) {
        return {
            inherent: this.lookupMethod(typeName, methodName),
            traits: this.traitMethods.get(`${typeName}::${methodName}`) || [],
        };
    }

    /**
     * Look up method metadata by resolved symbol.
     * @param {string} symbolName
     * @returns {{ symbolName: string, type: Type, decl: Node, meta: any } | null}
     */
    lookupMethodBySymbol(symbolName) {
        return this.methodsBySymbol.get(symbolName) || null;
    }

    /**
     * Push impl Self context.
     * @param {Type} selfType
     * @returns {void}
     */
    pushImplSelfType(selfType) {
        this.implSelfTypeStack.push(selfType);
    }

    /**
     * Pop impl Self context.
     * @returns {Type | null}
     */
    popImplSelfType() {
        return this.implSelfTypeStack.pop() || null;
    }

    /**
     * Get current impl Self type, if any.
     * @returns {Type | null}
     */
    currentImplSelfType() {
        if (this.implSelfTypeStack.length === 0) return null;
        return this.implSelfTypeStack[this.implSelfTypeStack.length - 1];
    }

    /**
     * Push impl generic bindings.
     * @param {Map<string, Type>} bindings
     * @returns {void}
     */
    pushImplGenericBindings(bindings) {
        this.implGenericBindingStack.push(bindings);
    }

    /**
     * Pop impl generic bindings.
     * @returns {Map<string, Type> | null}
     */
    popImplGenericBindings() {
        return this.implGenericBindingStack.pop() || null;
    }

    /**
     * Get the current impl generic binding map.
     * @returns {Map<string, Type> | null}
     */
    currentImplGenericBindings() {
        if (this.implGenericBindingStack.length === 0) return null;
        return this.implGenericBindingStack[this.implGenericBindingStack.length - 1];
    }

    /**
     * Begin capture tracking for a closure body.
     * @param {number} closureDepth
     * @returns {void}
     */
    pushClosureCaptureTracker(closureDepth) {
        this.closureCaptureTrackers.push({
            closureDepth,
            captures: new Map(),
        });
    }

    /**
     * End capture tracking for a closure body.
     * @returns {Map<string, { name: string, type: Type, mutable: boolean, span?: Span, closureInfo?: any }> | null}
     */
    popClosureCaptureTracker() {
        const tracker = this.closureCaptureTrackers.pop();
        return tracker ? tracker.captures : null;
    }

    /**
     * @returns {{ closureDepth: number, captures: Map<string, { name: string, type: Type, mutable: boolean, span?: Span, closureInfo?: any }> }[]}
     */
    getClosureCaptureTrackers() {
        return this.closureCaptureTrackers;
    }

    /**
     * Allow capturing closures to be used as call callees for the current expression.
     * @returns {void}
     */
    enterAllowCapturingClosureValue() {
        this.allowCapturingClosureValueDepth += 1;
    }

    /**
     * @returns {void}
     */
    exitAllowCapturingClosureValue() {
        if (this.allowCapturingClosureValueDepth > 0) {
            this.allowCapturingClosureValueDepth -= 1;
        }
    }

    /**
     * @returns {boolean}
     */
    canUseCapturingClosureValue() {
        return this.allowCapturingClosureValueDepth > 0;
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
    // Loop Tracking
    // ========================================================================

    /**
     * Enter a loop context
     * @param {boolean} allowsBreakValue
     * @param {Type | null} [breakType=null]
     * @returns {void}
     */
    enterLoop(allowsBreakValue, breakType = null) {
        this.loopStack.push({
            allowsBreakValue,
            breakType,
            hasBreak: false,
        });
    }

    /**
     * Exit the current loop context
     * @returns {LoopContext | null}
     */
    exitLoop() {
        return this.loopStack.pop() || null;
    }

    /**
     * Get current loop context
     * @returns {LoopContext | null}
     */
    currentLoop() {
        if (this.loopStack.length === 0) {
            return null;
        }
        return this.loopStack[this.loopStack.length - 1];
    }

    // ========================================================================
    // Type Variable Management
    // ========================================================================

    /**
     * Create a fresh type variable
     * @returns {Type}
     */
    freshTypeVar() {
        const tv = /** @type {TypeVarType} */ (makeTypeVar());
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
                return `Unknown(${/** @type {any} */ (type).kind})`;
        }
    }
}

export { TypeContext };
