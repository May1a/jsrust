import { ModItem, ModuleNode, type Span } from "./ast";

export type { ModuleNode } from "./ast";

export interface ResolveError {
    message: string;
    span?: Span;
}

export interface ResolveOptions {
    sourcePath?: string;
}

export interface ResolveResult {
    ok: boolean;
    module?: ModuleNode;
    errors: ResolveError[];
}

function flattenInlineModules(moduleNode: ModuleNode): ModuleNode {
    const flattenedItems = [];

    for (const item of moduleNode.items) {
        if (item instanceof ModItem) {
            const nested = flattenInlineModules(
                new ModuleNode(item.span, item.name, item.items),
            );
            flattenedItems.push(new ModItem(item.span, item.name, nested.items));
            continue;
        }
        flattenedItems.push(item);
    }

    return new ModuleNode(moduleNode.span, moduleNode.name, flattenedItems);
}

export function resolveModuleTree(
    moduleNode: ModuleNode,
    _options: ResolveOptions = {},
): ResolveResult {
    const resolved = flattenInlineModules(moduleNode);
    return {
        ok: true,
        module: resolved,
        errors: [],
    };
}
