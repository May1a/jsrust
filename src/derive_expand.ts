import {
    BlockExpr,
    FieldExpr,
    FnItem,
    IdentifierExpr,
    ImplItem,
    ModItem,
    NamedTypeNode,
    ReceiverKind,
    StructExpr,
    StructItem,
    type Item,
    type Span,
    ModuleNode,
} from "./ast";

export interface DeriveError {
    message: string;
    span?: Span;
}

export interface DeriveResult {
    ok: boolean;
    module?: ModuleNode;
    errors: DeriveError[];
}

function syntheticSpan(ref: Span): Span {
    return ref;
}

function expandCloneForStruct(item: StructItem): ImplItem {
    const span = syntheticSpan(item.span);
    const structType = new NamedTypeNode(span, item.name);

    // Use NamedTypeNode("Self") as the parser does — rewriteSelfInMethod in
    // ast_to_ssa.ts will replace "Self" with the concrete type and wrap it in
    // RefTypeNode for ref receivers. Providing RefTypeNode here would cause it
    // to be double-wrapped and produce ptr<ptr<Struct>> in the IR.
    const selfParam = {
        span,
        name: "Self",
        ty: new NamedTypeNode(span, "Self"),
        isReceiver: true,
        receiverKind: ReceiverKind.ref,
    };

    // rewriteSelfInMethod normalizes the receiver name to "self" (lowercase).
    const selfExpr = new IdentifierExpr(span, "self");

    const fieldExprs = new Map<string, IdentifierExpr | FieldExpr>();
    for (const field of item.fields) {
        fieldExprs.set(field.name, new FieldExpr(span, selfExpr, field.name));
    }

    const pathExpr = new IdentifierExpr(span, item.name);
    const structExpr = new StructExpr(span, pathExpr, fieldExprs);
    const body = new BlockExpr(span, [], structExpr);

    const cloneFn = new FnItem(
        span,
        "clone",
        [selfParam],
        structType,
        body,
    );

    return new ImplItem(span, structType, [cloneFn]);
}

function expandDerivesForItem(item: Item): Item[] {
    if (item instanceof ModItem) {
        const expandedChildren = item.items.flatMap(expandDerivesForItem);
        return [new ModItem(item.span, item.name, expandedChildren)];
    }

    if (item instanceof StructItem && item.derives.includes("Clone")) {
        return [item, expandCloneForStruct(item)];
    }

    return [item];
}

export function expandDerives(moduleNode: ModuleNode): DeriveResult {
    const expandedItems = moduleNode.items.flatMap(expandDerivesForItem);
    const expanded = new ModuleNode(
        moduleNode.span,
        moduleNode.name,
        expandedItems,
    );

    return {
        ok: true,
        module: expanded,
        errors: [],
    };
}
