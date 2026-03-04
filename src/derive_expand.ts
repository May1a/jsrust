import { ModItem, ModuleNode, type Item, type Span } from "./ast";

export interface DeriveError {
    message: string;
    span?: Span;
}

export interface DeriveResult {
    ok: boolean;
    module?: ModuleNode;
    errors: DeriveError[];
}

function cloneItem(item: Item): Item {
    if (item instanceof ModItem) {
        const clonedChildren = item.items.map(cloneItem);
        return new ModItem(item.span, item.name, clonedChildren);
    }
    return item;
}

export function expandDerives(moduleNode: ModuleNode): DeriveResult {
    const items = moduleNode.items.map(cloneItem);
    const expanded = new ModuleNode(moduleNode.span, moduleNode.name, items);

    return {
        ok: true,
        module: expanded,
        errors: [],
    };
}
