import {
    FnItem,
    ModItem,
    ModuleNode,
    NamedTypeNode,
    StructItem,
    EnumItem,
    TraitItem,
    TupleTypeNode,
    walkAst,
    type Node,
    type Span,
    type TypeNode,
} from "./ast";
import { type Result, err, okVoid } from "./diagnostics";
import type { TypeContext } from "./type_context";

export interface TypeError {
    message: string;
    span?: Span;
}

const BUILTIN_TYPE_NAMES = new Set([
    "()",
    "unit",
    "i8",
    "i16",
    "i32",
    "i64",
    "i128",
    "isize",
    "u8",
    "u16",
    "u32",
    "u64",
    "u128",
    "usize",
    "f32",
    "f64",
    "bool",
    "char",
    "str",
    "Self",
]);

function isBuiltinTypeName(name: string): boolean {
    return BUILTIN_TYPE_NAMES.has(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function registerItemTypes(typeCtx: TypeContext, node: Node): void {
    if (node instanceof StructItem || node instanceof EnumItem) {
        typeCtx.registerNamedType(
            node.name,
            new TupleTypeNode(node.span, []),
        );
    }
}

function checkDuplicateFns(module: ModuleNode): TypeError[] {
    const names = new Map<string, Span>();
    const errors: TypeError[] = [];

    for (const item of module.items) {
        if (!(item instanceof FnItem)) {
            continue;
        }
        const prior = names.get(item.name);
        if (prior) {
            errors.push({
                message: `Duplicate function definition: \`${item.name}\``,
                span: item.span,
            });
            continue;
        }
        names.set(item.name, item.span);
    }

    return errors;
}

function validateFnTypes(typeCtx: TypeContext, fnItem: FnItem): TypeError[] {
    const errors: TypeError[] = [];
    const genericNames = new Set<string>();
    const genericParams = Reflect.get(fnItem, "genericParams");
    if (Array.isArray(genericParams)) {
        for (const param of genericParams) {
            if (isRecord(param)) {
                const { name } = param;
                if (typeof name === "string") {
                    genericNames.add(name);
                }
            }
        }
    }

    for (const param of fnItem.params.filter(p => !p.isReceiver)) {
        const name = param.name ?? "_";
        const { ty } = param;
        if (ty instanceof NamedTypeNode) {
            const builtIn = isBuiltinTypeName(ty.name);
            const known = typeCtx.lookupNamedType(ty.name);
            const generic = genericNames.has(ty.name);
            if (!known && !builtIn && !generic) {
                errors.push({
                    message: `Unknown parameter type \`${ty.name}\` for parameter \`${name}\``,
                    span: ty.span,
                });
            }
        }
    }

    const { returnType }: { returnType: TypeNode } = fnItem;
    if (returnType instanceof NamedTypeNode) {
        const builtIn = isBuiltinTypeName(returnType.name);
        const known = typeCtx.lookupNamedType(returnType.name);
        const generic = genericNames.has(returnType.name);
        if (!known && !builtIn && !generic) {
            errors.push({
                message: `Unknown return type \`${returnType.name}\` in function \`${fnItem.name}\``,
                span: returnType.span,
            });
        }
    }

    return errors;
}

export function inferModule(
    typeCtx: TypeContext,
    moduleNode: ModuleNode,
): Result<void, TypeError[]> {
    walkAst(moduleNode, (node) => {
        registerItemTypes(typeCtx, node);
    });

    const errors: TypeError[] = [];
    errors.push(...checkDuplicateFns(moduleNode));

    for (const item of moduleNode.items) {
        if (item instanceof FnItem) {
            errors.push(...validateFnTypes(typeCtx, item));
        }
        if (item instanceof ModItem) {
            const nested = inferModule(typeCtx, new ModuleNode(item.span, item.name, item.items));
            if (!nested.ok) {
                errors.push(...nested.error);
            }
        }
        if (item instanceof TraitItem) {
            for (const method of item.methods) {
                if (method instanceof FnItem) {
                    errors.push(...validateFnTypes(typeCtx, method));
                }
            }
        }
    }

    if (errors.length > 0) {
        return err(errors);
    }
    return okVoid();
}
