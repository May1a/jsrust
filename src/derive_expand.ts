import {
    NodeKind,
    Mutability,
    makeNamedType,
    makeRefType,
    makeParam,
    makeFnItem,
    makeTraitItem,
    makeIdentifierExpr,
    makeFieldExpr,
    makeStructExpr,
    makeBlockExpr,
    makeImplItem,
} from "./ast";
import type { Node, Span } from "./ast";

export type DeriveError = {
    message: string;
    span?: Span;
    kind?: string;
};

function spanOf(node: Node | null | undefined): Span {
    return node?.span || { line: 1, column: 1, start: 1, end: 1 };
}

function makeBuiltinTraitDecl(traitName: string, span: Span): Node {
    if (traitName === "Clone") {
        const selfTy = makeNamedType(span, "Self", null);
        const selfRefTy = makeRefType(span, Mutability.Immutable, selfTy);
        const selfParam = makeParam(span, "self", selfRefTy, null, true, "ref");
        const cloneSig = makeFnItem(
            span,
            "clone",
            null,
            [selfParam],
            selfTy,
            null,
            false,
            false,
            false,
        );
        return makeTraitItem(span, "Clone", [cloneSig], false, false);
    }
    if (traitName === "Copy") {
        return makeTraitItem(span, "Copy", [], false, false);
    }
    return makeTraitItem(span, "Debug", [], false, false);
}

function makeCloneImpl(structItem: Node, span: Span): Node {
    const selfTy = makeNamedType(span, "Self", null);
    const selfRefTy = makeRefType(span, Mutability.Immutable, selfTy);
    const selfParam = makeParam(span, "self", selfRefTy, null, true, "ref");

    const selfIdent = makeIdentifierExpr(span, "self");
    const fields = (structItem.fields || []).map((field: Node) => ({
        name: field.name as string,
        value: makeFieldExpr(span, selfIdent, field.name as string),
    }));
    const structPath = makeIdentifierExpr(span, structItem.name as string);
    const bodyExpr = makeStructExpr(span, structPath, fields, null);
    const body = makeBlockExpr(span, [], bodyExpr);
    const cloneMethod = makeFnItem(
        span,
        "clone",
        null,
        [selfParam],
        selfTy,
        body,
        false,
        false,
        false,
    );
    return makeImplItem(
        span,
        makeNamedType(span, structItem.name as string, null),
        makeNamedType(span, "Clone", null),
        [cloneMethod],
        false,
        null,
    );
}

function makeMarkerImpl(structItem: Node, traitName: string, span: Span): Node {
    return makeImplItem(
        span,
        makeNamedType(span, structItem.name as string, null),
        makeNamedType(span, traitName, null),
        [],
        false,
        null,
    );
}

export function expandDerives(module: Node): {
    ok: boolean;
    module?: Node;
    errors?: DeriveError[];
} {
    const errors: DeriveError[] = [];
    const items: Node[] = module.items || [];
    const span = spanOf(module);
    const builtinTraits = ["Clone", "Copy", "Debug"];
    const traitNames = new Set<string>(
        items
            .filter((item: Node) => item.kind === NodeKind.TraitItem)
            .map((item: Node) => item.name as string),
    );
    const synthesized: Node[] = [];

    for (const traitName of builtinTraits) {
        if (!traitNames.has(traitName)) {
            synthesized.push(makeBuiltinTraitDecl(traitName, span));
            traitNames.add(traitName);
        }
    }

    for (const item of items) {
        const derives: string[] = item.derives || [];
        if (!Array.isArray(derives) || derives.length === 0) continue;
        if (item.kind !== NodeKind.StructItem) {
            errors.push({
                message:
                    "derive is supported only on structs in this compiler model",
                span: spanOf(item),
                kind: "derive",
            });
            continue;
        }
        if (item.isTuple) {
            errors.push({
                message: "derive is not supported for tuple structs yet",
                span: spanOf(item),
                kind: "derive",
            });
            continue;
        }

        const seen = new Set<string>();
        for (const deriveName of derives) {
            if (seen.has(deriveName)) {
                errors.push({
                    message: `Duplicate derive entry: ${deriveName}`,
                    span: spanOf(item),
                    kind: "derive",
                });
                continue;
            }
            seen.add(deriveName);

            if (!builtinTraits.includes(deriveName)) {
                errors.push({
                    message: `Unknown builtin derive in this compiler model: ${deriveName}`,
                    span: spanOf(item),
                    kind: "derive",
                });
                continue;
            }

            if (deriveName === "Clone") {
                synthesized.push(makeCloneImpl(item, spanOf(item)));
            } else {
                synthesized.push(
                    makeMarkerImpl(item, deriveName, spanOf(item)),
                );
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    module.items = [...items, ...synthesized];
    return { ok: true, module };
}
