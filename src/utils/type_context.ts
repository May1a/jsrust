import type { CallExpr, Expression, GenericFnItem, TypeNode } from "../parse/ast";
import type { SubstitutionMap } from "../passes/monomorphize";

interface StructFieldInfo {
    name: string;
    ty: TypeNode;
}

interface FnSignature {
    params: { name: string; ty: TypeNode }[];
    returnType: TypeNode;
}

/**
 * A single lexical scope mapping variable names to their resolved types.
 */
class Scope {
    private readonly variables = new Map<string, TypeNode>();

    setVariable(name: string, ty: TypeNode): void {
        this.variables.set(name, ty);
    }

    getVariable(name: string): TypeNode | undefined {
        return this.variables.get(name);
    }
}

export class TypeContext {
    private readonly expressionTypes: WeakMap<Expression, TypeNode>;
    private readonly namedTypes: Map<string, TypeNode>;
    private readonly scopes: Scope[];
    private readonly structFields: Map<string, StructFieldInfo[]>;
    private readonly fnSignatures: Map<string, FnSignature>;
    private readonly genericFnItems: Map<string, GenericFnItem>;
    private readonly callSubstitutions: WeakMap<CallExpr, SubstitutionMap>;
    private readonly variantOwners: Map<string, string>;

    constructor() {
        this.expressionTypes = new WeakMap();
        this.namedTypes = new Map();
        this.scopes = [];
        this.structFields = new Map();
        this.fnSignatures = new Map();
        this.genericFnItems = new Map();
        this.callSubstitutions = new WeakMap();
        this.variantOwners = new Map();
    }

    setExpressionType(expr: Expression, ty: TypeNode): void {
        this.expressionTypes.set(expr, ty);
    }

    getExpressionType(expr: Expression): TypeNode | undefined {
        return this.expressionTypes.get(expr);
    }

    registerNamedType(name: string, ty: TypeNode): void {
        this.namedTypes.set(name, ty);
    }

    lookupNamedType(name: string): TypeNode | undefined {
        return this.namedTypes.get(name);
    }

    // --- Scope tracking ---

    pushScope(): void {
        this.scopes.push(new Scope());
    }

    popScope(): void {
        this.scopes.pop();
    }

    setVariable(name: string, ty: TypeNode): void {
        const scope = this.scopes[this.scopes.length - 1] as Scope | undefined;
        if (scope) {
            scope.setVariable(name, ty);
        }
    }

    lookupVariable(name: string): TypeNode | undefined {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            const ty = this.scopes[i].getVariable(name);
            if (ty) {
                return ty;
            }
        }
        return undefined;
    }

    // --- Struct field registry ---

    registerStructFields(name: string, fields: StructFieldInfo[]): void {
        this.structFields.set(name, fields);
    }

    lookupStructFields(name: string): StructFieldInfo[] | undefined {
        return this.structFields.get(name);
    }

    lookupStructField(
        structName: string,
        fieldName: string,
    ): TypeNode | undefined {
        const fields = this.structFields.get(structName);
        if (!fields) return undefined;
        const field = fields.find((f) => f.name === fieldName);
        if (!field) return undefined;
        return field.ty;
    }

    // --- Function signature registry ---

    registerFnSignature(name: string, sig: FnSignature): void {
        this.fnSignatures.set(name, sig);
    }

    lookupFnSignature(name: string): FnSignature | undefined {
        return this.fnSignatures.get(name);
    }

    // --- Generic function tracking ---

    registerGenericFn(name: string, item: GenericFnItem): void {
        this.genericFnItems.set(name, item);
    }

    isGenericFn(name: string): boolean {
        return this.genericFnItems.has(name);
    }

    lookupGenericFn(name: string): GenericFnItem | undefined {
        return this.genericFnItems.get(name);
    }

    // --- Enum variant owner tracking ---

    registerVariantOwner(variantName: string, enumName: string): void {
        this.variantOwners.set(variantName, enumName);
    }

    lookupVariantOwner(variantName: string): string | undefined {
        return this.variantOwners.get(variantName);
    }

    // --- Call-site generic substitution tracking ---

    setCallSubstitution(call: CallExpr, subs: SubstitutionMap): void {
        this.callSubstitutions.set(call, subs);
    }

    getCallSubstitution(call: CallExpr): SubstitutionMap | undefined {
        return this.callSubstitutions.get(call);
    }
}
