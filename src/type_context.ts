import { Span, Type, TypeKind, TypeVarType, makeTypeVar } from "./types";

export type VarBinding = {
    name: string;
    type: Type;
    mutable: boolean;
    span: Span;
    closureInfo?: {
        captures: Array<{
            name: string;
            type: Type;
            mutable: boolean;
            byRef?: boolean;
        }>;
        inferredType?: Type;
    } | null;
};

export type Result<T, E> =
    | {
          ok: true;
          result: T;
      }
    | {
          ok: false;
          err: E;
      };

export type ItemDecl = {
    name: string;
    kind: "fn" | "struct" | "enum" | "mod" | "type" | "trait";
    node: unknown; // Node type from ast.js
    type?: Type;
    genericBindings?: Map<string, Type>;
};

type Scope = {
    bindings: Map<string, VarBinding>;
    parent: Scope | null;
};

type LoopContext = {
    allowsBreakValue: boolean;
    breakType: Type | null;
    hasBreak: boolean;
};

// ============================================================================
// Task 3.6: Type Context
// ============================================================================

type Method = {
    structName: string;
    methodName: string;
    symbolName: string;
    decl: unknown;
    type: Type;
    meta: unknown;
};

type TraitMethod = {
    typeName: string;
    traitName: string;
    methodName: string;
    symbolName: string;
    decl: unknown;
    type: Type;
    meta: unknown;
};
/**
 * Type context for tracking scopes, bindings, and item declarations
 */
export class TypeContext {
    currentScope: Scope;
    items: Map<string, ItemDecl>;
    typeAliases: Map<string, Type>;
    currentFn: Type | null;
    currentReturnType: Type | null;
    typeVars: Map<number, TypeVarType>;
    internedTypes: Map<string, Type>;
    loopStack: LoopContext[];
    methods: Map<string, Method>;
    traitMethods: Map<string, TraitMethod[]>;
    traits: Map<string, { name: string; node: unknown }>;
    traitImpls: Set<string>;
    methodsBySymbol: Map<
        string,
        { symbolName: string; type: Type; decl: unknown; meta: unknown }
    >;
    implSelfTypeStack: Type[];
    implGenericBindingStack: Map<string, Type>[];
    closureCaptureTrackers: {
        closureDepth: number;
        captures: Map<
            string,
            {
                name: string;
                type: Type;
                mutable: boolean;
                span?: Span;
                closureInfo?: unknown;
            }
        >;
    }[];
    allowCapturingClosureValueDepth: number;

    constructor() {
        this.currentScope = { bindings: new Map(), parent: null };
        this.items = new Map();
        this.typeAliases = new Map();
        this.currentFn = null;
        this.currentReturnType = null;
        this.typeVars = new Map();
        this.internedTypes = new Map();
        this.loopStack = [];
        this.methods = new Map();
        this.traitMethods = new Map();
        this.traits = new Map();
        this.traitImpls = new Set();
        this.methodsBySymbol = new Map();
        this.implSelfTypeStack = [];
        this.implGenericBindingStack = [];
        this.closureCaptureTrackers = [];
        this.allowCapturingClosureValueDepth = 0;
    }

    // ========================================================================
    // Task 3.7: Scope Management
    // ========================================================================

    pushScope(): void {
        this.currentScope = {
            bindings: new Map(),
            parent: this.currentScope,
        };
    }

    popScope(): { ok: boolean; error?: string } {
        if (!this.currentScope.parent) {
            return { ok: false, error: "Cannot pop root scope" };
        }
        this.currentScope = this.currentScope.parent;
        return { ok: true };
    }

    defineVar(
        name: string,
        type: Type,
        mutable: boolean = false,
        span: Span,
    ): { ok: boolean; error?: string } {
        if (this.currentScope.bindings.has(name)) {
            return {
                ok: false,
                error: `Variable '${name}' already defined in this scope`,
            };
        }
        this.currentScope.bindings.set(name, {
            name,
            type,
            mutable,
            span: span,
        });
        return { ok: true };
    }

    lookupVar(name: string): VarBinding | null {
        const found = this.lookupVarWithDepth(name);
        return found ? found.binding : null;
    }

    lookupVarWithDepth(
        name: string,
    ): { binding: VarBinding; depth: number } | null {
        let scope: Scope | null = this.currentScope;
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

    varInCurrentScope(name: string): boolean {
        return this.currentScope.bindings.has(name);
    }

    getCurrentScopeBindings(): VarBinding[] {
        return Array.from(this.currentScope.bindings.values());
    }

    currentScopeDepth(): number {
        let depth = 0;
        let scope: Scope = this.currentScope;
        while (scope.parent) {
            depth += 1;
            scope = scope.parent;
        }
        return depth;
    }

    // ========================================================================
    // Task 3.8: Item Registry
    // ========================================================================

    registerStruct(
        name: string,
        decl: unknown,
    ): { ok: boolean; error?: string } {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "struct", node: decl });
        return { ok: true };
    }

    registerEnum(name: string, decl: unknown): { ok: boolean; error?: string } {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "enum", node: decl });
        return { ok: true };
    }

    registerFn(
        name: string,
        decl: unknown,
        type?: Type,
    ): { ok: boolean; error?: string } {
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

    registerMod(name: string, decl: unknown): { ok: boolean; error?: string } {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "mod", node: decl });
        return { ok: true };
    }

    registerTypeAlias(
        name: string,
        decl: unknown,
        type: Type,
    ): { ok: boolean; error?: string } {
        if (this.items.has(name)) {
            return { ok: false, error: `Item '${name}' already defined` };
        }
        this.items.set(name, { name, kind: "type", node: decl });
        this.typeAliases.set(name, type);
        return { ok: true };
    }

    lookupItem(name: string): ItemDecl | null {
        return this.items.get(name) || null;
    }

    lookupTypeAlias(name: string): Type | null {
        return this.typeAliases.get(name) || null;
    }

    hasItem(name: string): boolean {
        return this.items.has(name);
    }

    getAllItems(): ItemDecl[] {
        return Array.from(this.items.values());
    }

    registerMethod(
        structName: string,
        methodName: string,
        decl: unknown,
        fnType: Type,
        meta: unknown = null,
    ): Result<undefined, string> {
        const key = `${structName}::${methodName}`;
        if (this.methods.has(key)) {
            return { ok: false, err: `Method '${key}' already defined` };
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
        return { ok: true, result: undefined };
    }

    lookupMethod(structName: string, methodName: string): Method | null {
        return this.methods.get(`${structName}::${methodName}`) || null;
    }

    registerTrait(traitName: string, decl: unknown): Result<undefined, string> {
        if (this.traits.has(traitName)) {
            return { ok: false, err: `Trait '${traitName}' already defined` };
        }
        this.traits.set(traitName, { name: traitName, node: decl });
        return { ok: true, result: undefined };
    }

    lookupTrait(traitName: string): { name: string; node: unknown } | null {
        return this.traits.get(traitName) || null;
    }

    registerTraitImpl(
        traitName: string,
        typeName: string,
    ): Result<undefined, string> {
        const key = `${traitName}::${typeName}`;
        if (this.traitImpls.has(key)) {
            return {
                ok: false,
                err: `Trait impl already defined for (${traitName}, ${typeName})`,
            };
        }
        this.traitImpls.add(key);
        return { ok: true, result: undefined };
    }

    registerTraitMethod(
        typeName: string,
        traitName: string,
        methodName: string,
        decl: unknown,
        fnType: Type,
        meta: unknown = null,
    ): Result<string, string> {
        const symbolName = `${typeName}::<${traitName}>::${methodName}`;
        const key = `${typeName}::${methodName}`;
        const list = this.traitMethods.get(key) || [];
        if (list.some((entry) => entry.traitName === traitName)) {
            return {
                ok: false,
                err: `Trait method already defined for (${typeName}, ${traitName}, ${methodName})`,
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
        return { ok: true, result: symbolName };
    }

    lookupMethodCandidates(
        typeName: string,
        methodName: string,
    ): {
        inherent: {
            structName: string;
            methodName: string;
            symbolName: string;
            decl: unknown;
            type: Type;
            meta: unknown;
        } | null;
        traits: {
            typeName: string;
            traitName: string;
            methodName: string;
            symbolName: string;
            decl: unknown;
            type: Type;
            meta: unknown;
        }[];
    } {
        return {
            inherent: this.lookupMethod(typeName, methodName),
            traits: this.traitMethods.get(`${typeName}::${methodName}`) || [],
        };
    }

    lookupMethodBySymbol(
        symbolName: string,
    ): { symbolName: string; type: Type; decl: unknown; meta: unknown } | null {
        return this.methodsBySymbol.get(symbolName) || null;
    }

    pushImplSelfType(selfType: Type): void {
        this.implSelfTypeStack.push(selfType);
    }

    popImplSelfType(): Type | null {
        return this.implSelfTypeStack.pop() || null;
    }

    currentImplSelfType(): Type | null {
        if (this.implSelfTypeStack.length === 0) return null;
        return this.implSelfTypeStack[this.implSelfTypeStack.length - 1];
    }

    pushImplGenericBindings(bindings: Map<string, Type>): void {
        this.implGenericBindingStack.push(bindings);
    }

    popImplGenericBindings(): Map<string, Type> | null {
        return this.implGenericBindingStack.pop() || null;
    }

    currentImplGenericBindings(): Map<string, Type> | null {
        if (this.implGenericBindingStack.length === 0) return null;
        return this.implGenericBindingStack[
            this.implGenericBindingStack.length - 1
        ];
    }

    pushClosureCaptureTracker(closureDepth: number): void {
        this.closureCaptureTrackers.push({
            closureDepth,
            captures: new Map(),
        });
    }

    popClosureCaptureTracker(): Map<
        string,
        {
            name: string;
            type: Type;
            mutable: boolean;
            span?: Span;
            closureInfo?: unknown;
        }
    > | null {
        const tracker = this.closureCaptureTrackers.pop();
        return tracker ? tracker.captures : null;
    }

    getClosureCaptureTrackers(): {
        closureDepth: number;
        captures: Map<
            string,
            {
                name: string;
                type: Type;
                mutable: boolean;
                span?: Span;
                closureInfo?: unknown;
            }
        >;
    }[] {
        return this.closureCaptureTrackers;
    }

    enterAllowCapturingClosureValue(): void {
        this.allowCapturingClosureValueDepth += 1;
    }

    exitAllowCapturingClosureValue(): void {
        if (this.allowCapturingClosureValueDepth > 0) {
            this.allowCapturingClosureValueDepth -= 1;
        }
    }

    canUseCapturingClosureValue(): boolean {
        return this.allowCapturingClosureValueDepth > 0;
    }

    // ========================================================================
    // Function Tracking
    // ========================================================================

    setCurrentFn(fnType: Type | null, returnType: Type | null): void {
        this.currentFn = fnType;
        this.currentReturnType = returnType;
    }

    clearCurrentFn(): void {
        this.currentFn = null;
        this.currentReturnType = null;
    }

    getCurrentReturnType(): Type | null {
        return this.currentReturnType;
    }

    // ========================================================================
    // Loop Tracking
    // ========================================================================

    enterLoop(allowsBreakValue: boolean, breakType: Type | null = null): void {
        this.loopStack.push({
            allowsBreakValue,
            breakType,
            hasBreak: false,
        });
    }

    exitLoop(): LoopContext | null {
        return this.loopStack.pop() || null;
    }

    currentLoop(): LoopContext | null {
        if (this.loopStack.length === 0) {
            return null;
        }
        return this.loopStack[this.loopStack.length - 1];
    }

    // ========================================================================
    // Type Variable Management
    // ========================================================================

    freshTypeVar(span: Span): Type {
        const tv = makeTypeVar(span);
        if (tv.kind !== TypeKind.TypeVar) throw "unreachable";
        this.typeVars.set(tv.id, tv);
        return tv;
    }

    bindTypeVar(id: number, type: Type): Result<undefined, string> {
        const tv = this.typeVars.get(id);
        if (!tv) {
            return { ok: false, err: `Type variable ${id} not found` };
        }
        if (tv.bound !== null) {
            return { ok: false, err: `Type variable ${id} is already bound` };
        }
        // Check for occurs check (prevent infinite types)
        if (this.occursIn(id, type)) {
            return {
                ok: false,
                err: `Occurs check failed: type variable ${id} occurs in type`,
            };
        }
        tv.bound = type;
        return { ok: true, result: undefined };
    }

    occursIn(id: number, type: Type): boolean {
        if (type.kind === TypeKind.TypeVar) {
            if ((type as TypeVarType).id === id) return true;
            if ((type as TypeVarType).bound)
                return this.occursIn(id, (type as TypeVarType).bound!);
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

    resolveType(type: Type): Type {
        if (type.kind === TypeKind.TypeVar && (type as TypeVarType).bound) {
            return this.resolveType((type as TypeVarType).bound!);
        }
        return type;
    }

    // ========================================================================
    // Type Interning
    // ========================================================================

    internType(type: Type): Type {
        const key = this.typeToKey(type);
        const existing = this.internedTypes.get(key);
        if (existing) {
            return existing;
        }
        this.internedTypes.set(key, type);
        return type;
    }

    typeToKey(type: Type): string {
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
                return `TypeVar(${(type as TypeVarType).id})`;
            case TypeKind.Named:
                return `Named(${type.name}${type.args ? `<${type.args.map((t) => this.typeToKey(t)).join(",")}>` : ""})`;
            default:
                return `Unknown(${(type as { kind: number }).kind})`;
        }
    }
}
