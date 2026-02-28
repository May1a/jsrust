import type { Expression, TypeNode } from "./ast";

export class TypeContext {
    private readonly expressionTypes: WeakMap<Expression, TypeNode>;
    private readonly namedTypes: Map<string, TypeNode>;

    constructor() {
        this.expressionTypes = new WeakMap();
        this.namedTypes = new Map();
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
}
