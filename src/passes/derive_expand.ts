import { Result } from "better-result";
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
    TraitImplItem,
    TraitItem,
    type Item,
    type Span,
    ModuleNode,
} from "../parse/ast";

export interface DeriveError {
    message: string;
    span?: Span;
}

function syntheticSpan(ref: Span): Span {
    return ref;
}

function expandCloneForStruct(item: StructItem): ImplItem {
    const span = syntheticSpan(item.span);
    const structType = new NamedTypeNode(span, item.name);

    // Use NamedTypeNode("Self") as the parser does — rewriteSelfInMethod in
    // Lowering will replace "Self" with the concrete type and wrap it in
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

function expandCopyForStruct(item: StructItem): TraitImplItem {
    const span = syntheticSpan(item.span);
    const copyTrait = new TraitItem(span, "Copy", []);
    const structType = new NamedTypeNode(span, item.name);
    return new TraitImplItem(span, "Copy", copyTrait, structType, []);
}

function expandDerivesForItem(item: Item): Item[] {
    if (item instanceof ModItem) {
        const expandedChildren = item.items.flatMap(expandDerivesForItem);
        return [new ModItem(item.span, item.name, expandedChildren)];
    }

    if (item instanceof StructItem) {
        const expanded: Item[] = [item];
        if (item.derives.includes("Clone")) {
            expanded.push(expandCloneForStruct(item));
        }
        if (item.derives.includes("Copy")) {
            expanded.push(expandCopyForStruct(item));
        }
        return expanded;
    }

    return [item];
}

export function expandDerives(moduleNode: ModuleNode): Result<ModuleNode, DeriveError[]> {
    const expandedItems = moduleNode.items.flatMap(expandDerivesForItem);
    const expanded = new ModuleNode(
        moduleNode.span,
        moduleNode.name,
        expandedItems,
    );
    return Result.ok(expanded);
}
