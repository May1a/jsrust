import {
    ArrayTypeNode,
    type CallExpr,
    ConstItem,
    EnumItem,
    type Expression,
    FnTypeNode,
    FnItem,
    GenericArgsNode,
    GenericFnItem,
    GenericStructItem,
    ImplItem,
    ModItem,
    type ModuleNode,
    NamedTypeNode,
    OptionTypeNode,
    PtrTypeNode,
    RefTypeNode,
    ResultTypeNode,
    type Span,
    StructItem,
    TraitImplItem,
    TupleTypeNode,
    type TypeNode,
    UseItem,
} from "../parse/ast";
import type { TypeContext } from "../utils/type_context";
import { BUILTIN_SYMBOLS } from "../utils/builtin_symbols";
import type { SubstitutionMap } from "./monomorphize";
import { match } from "ts-pattern";

const HASH_FACTOR = 31;
const HASH_MODULUS = 1_000_000;

export interface ModuleStructFieldInfo {
    name: string;
    type: TypeNode;
}

export interface ModuleFnSignature {
    params: { name: string; type: TypeNode }[];
    returnType: TypeNode;
}

export interface ModuleConstBinding {
    key: string;
    typeNode: TypeNode;
    value?: Expression;
    span: Span;
    selfTypeName?: string;
}

export interface ModuleMetadata {
    structFields: Map<string, ModuleStructFieldInfo[]>;
    fnSignatures: Map<string, ModuleFnSignature>;
    fnIds: Map<string, number>;
    variantOwners: Map<string, string>;
    variantTags: Map<string, number>;
    namedConsts: Map<string, ModuleConstBinding>;
    implConsts: Map<string, Map<string, ModuleConstBinding>>;
    genericFns: Map<string, GenericFnItem>;
    getCallSubstitution: (call: CallExpr) => SubstitutionMap | undefined;
}

interface ExtractionMaps {
    structFields: Map<string, ModuleStructFieldInfo[]>;
    fnSignatures: Map<string, ModuleFnSignature>;
    fnIds: Map<string, number>;
    variantOwners: Map<string, string>;
    variantTags: Map<string, number>;
    namedConsts: Map<string, ModuleConstBinding>;
    implConsts: Map<string, Map<string, ModuleConstBinding>>;
    genericFns: Map<string, GenericFnItem>;
    typeContext: TypeContext;
}

function substituteTypeNode(
    ty: TypeNode,
    subs: Map<string, TypeNode>,
): TypeNode {
    if (ty instanceof NamedTypeNode) {
        const replacement = subs.get(ty.name);
        if (replacement) return replacement;
        if (!ty.args) return ty;
        return new NamedTypeNode(
            ty.span,
            ty.name,
            new GenericArgsNode(
                ty.args.span,
                ty.args.args.map((arg) => substituteTypeNode(arg, subs)),
            ),
        );
    }
    if (ty instanceof TupleTypeNode) {
        return new TupleTypeNode(
            ty.span,
            ty.elements.map((element) => substituteTypeNode(element, subs)),
        );
    }
    if (ty instanceof ArrayTypeNode) {
        return new ArrayTypeNode(ty.span, substituteTypeNode(ty.element, subs), ty.length);
    }
    if (ty instanceof RefTypeNode) {
        return new RefTypeNode(ty.span, ty.mutability, substituteTypeNode(ty.inner, subs));
    }
    if (ty instanceof PtrTypeNode) {
        return new PtrTypeNode(ty.span, ty.mutability, substituteTypeNode(ty.inner, subs));
    }
    if (ty instanceof FnTypeNode) {
        return new FnTypeNode(
            ty.span,
            ty.params.map((param) => substituteTypeNode(param, subs)),
            substituteTypeNode(ty.returnType, subs),
        );
    }
    if (ty instanceof OptionTypeNode) {
        return new OptionTypeNode(ty.span, substituteTypeNode(ty.inner, subs));
    }
    if (ty instanceof ResultTypeNode) {
        return new ResultTypeNode(
            ty.span,
            substituteTypeNode(ty.okType, subs),
            substituteTypeNode(ty.errType, subs),
        );
    }
    return ty;
}

function resolveAliasesInType(
    typeContext: TypeContext,
    ty: TypeNode,
    seen = new Set<string>(),
): TypeNode {
    if (ty instanceof NamedTypeNode) {
        const alias = typeContext.lookupTypeAlias(ty.name);
        if (!alias || seen.has(ty.name)) return ty;
        const subs = new Map<string, TypeNode>();
        if (ty.args) {
            for (let i = 0; i < alias.genericParamNames.length; i++) {
                const arg = ty.args.args[i];
                subs.set(
                    alias.genericParamNames[i],
                    resolveAliasesInType(typeContext, arg, new Set(seen)),
                );
            }
        }
        seen.add(ty.name);
        return resolveAliasesInType(typeContext, substituteTypeNode(alias.aliasedType, subs), seen);
    }
    if (ty instanceof TupleTypeNode) {
        return new TupleTypeNode(
            ty.span,
            ty.elements.map((element) =>
                resolveAliasesInType(typeContext, element, new Set(seen)),
            ),
        );
    }
    if (ty instanceof ArrayTypeNode) {
        return new ArrayTypeNode(
            ty.span,
            resolveAliasesInType(typeContext, ty.element, seen),
            ty.length,
        );
    }
    if (ty instanceof RefTypeNode) {
        return new RefTypeNode(
            ty.span,
            ty.mutability,
            resolveAliasesInType(typeContext, ty.inner, seen),
        );
    }
    if (ty instanceof PtrTypeNode) {
        return new PtrTypeNode(
            ty.span,
            ty.mutability,
            resolveAliasesInType(typeContext, ty.inner, seen),
        );
    }
    if (ty instanceof FnTypeNode) {
        return new FnTypeNode(
            ty.span,
            ty.params.map((param) =>
                resolveAliasesInType(typeContext, param, new Set(seen)),
            ),
            resolveAliasesInType(typeContext, ty.returnType, seen),
        );
    }
    if (ty instanceof OptionTypeNode) {
        return new OptionTypeNode(
            ty.span,
            resolveAliasesInType(typeContext, ty.inner, seen),
        );
    }
    if (ty instanceof ResultTypeNode) {
        return new ResultTypeNode(
            ty.span,
            resolveAliasesInType(typeContext, ty.okType, seen),
            resolveAliasesInType(typeContext, ty.errType, seen),
        );
    }
    return ty;
}

export function hashName(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (Math.imul(hash, HASH_FACTOR) + name.charCodeAt(i)) | 0;
        hash |= 0;
    }
    if (hash < 0) {
        hash = -hash;
    }
    return hash % HASH_MODULUS;
}

function qualifyName(prefix: string, name: string): string {
    if (prefix === "") {
        return name;
    }
    return `${prefix}::${name}`;
}

function resolveSelfInType(ty: TypeNode, selfName: string): TypeNode {
    if (ty instanceof NamedTypeNode) {
        let args: GenericArgsNode | undefined;
        if (ty.args) {
            args = new GenericArgsNode(
                ty.span,
                ty.args.args.map((arg) => resolveSelfInType(arg, selfName)),
            );
        }
        const name = match(ty.name)
            .with("Self", () => selfName)
            .otherwise(() => ty.name);
        return new NamedTypeNode(ty.span, name, args);
    }
    if (ty instanceof TupleTypeNode) {
        return new TupleTypeNode(
            ty.span,
            ty.elements.map((e) => resolveSelfInType(e, selfName)),
        );
    }
    if (ty instanceof ArrayTypeNode) {
        return new ArrayTypeNode(
            ty.span,
            resolveSelfInType(ty.element, selfName),
            ty.length,
        );
    }
    if (ty instanceof RefTypeNode) {
        return new RefTypeNode(
            ty.span,
            ty.mutability,
            resolveSelfInType(ty.inner, selfName),
        );
    }
    if (ty instanceof PtrTypeNode) {
        return new PtrTypeNode(
            ty.span,
            ty.mutability,
            resolveSelfInType(ty.inner, selfName),
        );
    }
    if (ty instanceof FnTypeNode) {
        return new FnTypeNode(
            ty.span,
            ty.params.map((p) => resolveSelfInType(p, selfName)),
            resolveSelfInType(ty.returnType, selfName),
        );
    }
    if (ty instanceof OptionTypeNode) {
        return new OptionTypeNode(ty.span, resolveSelfInType(ty.inner, selfName));
    }
    if (ty instanceof ResultTypeNode) {
        return new ResultTypeNode(
            ty.span,
            resolveSelfInType(ty.okType, selfName),
            resolveSelfInType(ty.errType, selfName),
        );
    }
    return ty;
}

function seedBuiltinEnumMetadata(
    variantTags: Map<string, number>,
    variantOwners: Map<string, string>,
): void {
    variantTags.set("None", 0);
    variantTags.set("Option::None", 0);
    variantTags.set("Some", 1);
    variantTags.set("Option::Some", 1);
    variantOwners.set("None", "Option");
    variantOwners.set("Option::None", "Option");
    variantOwners.set("Some", "Option");
    variantOwners.set("Option::Some", "Option");

    variantTags.set("Ok", 0);
    variantTags.set("Result::Ok", 0);
    variantTags.set("Err", 1);
    variantTags.set("Result::Err", 1);
    variantOwners.set("Ok", "Result");
    variantOwners.set("Result::Ok", "Result");
    variantOwners.set("Err", "Result");
    variantOwners.set("Result::Err", "Result");
}

function createConstBinding(
    item: ConstItem,
    key: string,
    selfTypeName?: string,
): ModuleConstBinding {
    return {
        key,
        typeNode: item.typeNode,
        value: item.value,
        span: item.span,
        selfTypeName,
    };
}

function extractStructItem(
    item: StructItem | GenericStructItem,
    maps: ExtractionMaps,
    prefix: string,
): void {
    const qual = qualifyName(prefix, item.name);
    const fields: ModuleStructFieldInfo[] = item.fields.map((f) => ({
        name: f.name,
        type: f.typeNode,
    }));
    maps.structFields.set(qual, fields);
    if (prefix) {
        maps.structFields.set(item.name, fields);
    }
}

function extractEnumItem(item: EnumItem, maps: ExtractionMaps): void {
    for (let i = 0; i < item.variants.length; i++) {
        const variant = item.variants[i];
        maps.variantTags.set(variant.name, i);
        maps.variantTags.set(`${item.name}::${variant.name}`, i);
        maps.variantOwners.set(variant.name, item.name);
        maps.variantOwners.set(`${item.name}::${variant.name}`, item.name);
    }
}

function extractFnItem(
    item: FnItem,
    maps: ExtractionMaps,
    prefix: string,
    selfName?: string,
): void {
    if (!item.body) return;
    const qual = qualifyName(prefix, item.name);
    const id = hashName(item.name);
    maps.fnIds.set(item.name, id);
    if (prefix) {
        maps.fnIds.set(qual, id);
    }
        const returnType = match(selfName)
            .with(undefined, () => item.returnType)
            .otherwise((name) =>
                resolveSelfInType(item.returnType, name),
            );
    const sig: ModuleFnSignature = {
        params: item.params.map((p) => ({
            name: p.name,
            type: resolveAliasesInType(maps.typeContext, p.ty),
        })),
        returnType: resolveAliasesInType(maps.typeContext, returnType),
    };
    maps.fnSignatures.set(item.name, sig);
    if (prefix) {
        maps.fnSignatures.set(qual, sig);
    }
}

function extractGenericFnItem(
    item: GenericFnItem,
    maps: ExtractionMaps,
    prefix: string,
): void {
    if (!item.body) return;
    const qual = qualifyName(prefix, item.name);
    const id = hashName(item.name);
    maps.fnIds.set(item.name, id);
    if (prefix) {
        maps.fnIds.set(qual, id);
    }
    maps.genericFns.set(qual, item);
    if (prefix) {
        maps.genericFns.set(item.name, item);
    }
}

function extractImplConstBindings(
    constItems: ConstItem[],
    targetName: string,
    qualifiedTarget: string,
    maps: ExtractionMaps,
): void {
    for (const constItem of constItems) {
        if (!constItem.value) continue;
        const key = `${qualifiedTarget}::${constItem.name}`;
        const binding = createConstBinding(constItem, key, targetName);
        maps.namedConsts.set(key, binding);
        if (qualifiedTarget !== targetName) {
            maps.namedConsts.set(`${targetName}::${constItem.name}`, binding);
        }
    }
}

function extractTraitImplConstBindings(
    constItems: ConstItem[],
    traitConstItems: ConstItem[],
    targetName: string,
    qualifiedTarget: string,
    maps: ExtractionMaps,
): void {
    extractImplConstBindings(constItems, targetName, qualifiedTarget, maps);
    const overridden = new Set(constItems.map((c) => c.name));
    const defaults: ConstItem[] = [];
    for (const traitConst of traitConstItems) {
        if (overridden.has(traitConst.name) || !traitConst.value) continue;
        defaults.push(traitConst);
    }
    extractImplConstBindings(defaults, targetName, qualifiedTarget, maps);
}

function collectSelfConstBindings(
    selfTypeName: string,
    constItems: ConstItem[],
    maps: ExtractionMaps,
    traitConstItems: ConstItem[] = [],
): Map<string, ModuleConstBinding> {
    const bindings = new Map<string, ModuleConstBinding>();
    const overridden = new Set(constItems.map((c) => c.name));
    for (const constItem of constItems) {
        const binding = maps.namedConsts.get(`${selfTypeName}::${constItem.name}`);
        if (binding) {
            bindings.set(`Self::${constItem.name}`, binding);
        }
    }
    for (const traitConst of traitConstItems) {
        if (overridden.has(traitConst.name)) continue;
        const binding = maps.namedConsts.get(`${selfTypeName}::${traitConst.name}`);
        if (binding) {
            bindings.set(`Self::${traitConst.name}`, binding);
        }
    }
    return bindings;
}

function mergeImplConsts(
    maps: ExtractionMaps,
    targetName: string,
    selfConsts: Map<string, ModuleConstBinding>,
): void {
    if (selfConsts.size === 0) return;
    const existing = maps.implConsts.get(targetName);
    if (existing) {
        for (const [key, binding] of selfConsts) {
            existing.set(key, binding);
        }
    } else {
        maps.implConsts.set(targetName, selfConsts);
    }
}

function extractImplItem(
    item: ImplItem,
    maps: ExtractionMaps,
    prefix: string,
): void {
    const targetName = item.target.name;
    const qualTarget = qualifyName(prefix, targetName);

    for (const method of item.methods) {
        if (method instanceof GenericFnItem) continue;
        if (!method.body) continue;
        const id = hashName(method.name);
        maps.fnIds.set(method.name, id);
        maps.fnIds.set(`${targetName}::${method.name}`, id);
        if (qualTarget !== targetName) {
            maps.fnIds.set(`${qualTarget}::${method.name}`, id);
        }
        const returnType = resolveSelfInType(method.returnType, targetName);
        const sig: ModuleFnSignature = {
            params: method.params.map((p) => ({
                name: p.name,
                type: resolveAliasesInType(
                    maps.typeContext,
                    resolveSelfInType(p.ty, targetName),
                ),
            })),
            returnType: resolveAliasesInType(maps.typeContext, returnType),
        };
        maps.fnSignatures.set(method.name, sig);
        maps.fnSignatures.set(`${targetName}::${method.name}`, sig);
        if (qualTarget !== targetName) {
            maps.fnSignatures.set(`${qualTarget}::${method.name}`, sig);
        }
    }

    extractImplConstBindings(item.constItems, targetName, qualTarget, maps);

    const selfConsts = collectSelfConstBindings(
        targetName,
        item.constItems,
        maps,
    );
    mergeImplConsts(maps, targetName, selfConsts);
}

function extractTraitImplItem(
    item: TraitImplItem,
    maps: ExtractionMaps,
    prefix: string,
): void {
    const targetName = item.target.name;
    const qualTarget = qualifyName(prefix, targetName);

    for (const method of item.fnImpls) {
        if (!method.body) continue;
        const id = hashName(method.name);
        maps.fnIds.set(method.name, id);
        if (targetName) {
            maps.fnIds.set(`${targetName}::${method.name}`, id);
        }
        const returnType = resolveSelfInType(method.returnType, targetName);
        const sig: ModuleFnSignature = {
            params: method.params.map((p) => ({
                name: p.name,
                type: resolveAliasesInType(
                    maps.typeContext,
                    resolveSelfInType(p.ty, targetName),
                ),
            })),
            returnType: resolveAliasesInType(maps.typeContext, returnType),
        };
        maps.fnSignatures.set(method.name, sig);
        maps.fnSignatures.set(`${targetName}::${method.name}`, sig);
    }

    extractTraitImplConstBindings(
        item.constItems,
        item.trait.constItems,
        targetName,
        qualTarget,
        maps,
    );

    const selfConsts = collectSelfConstBindings(
        targetName,
        item.constItems,
        maps,
        item.trait.constItems,
    );
    mergeImplConsts(maps, targetName, selfConsts);
}

function extractConstItem(
    item: ConstItem,
    maps: ExtractionMaps,
    prefix: string,
): void {
    if (!item.value) return;
    const key = qualifyName(prefix, item.name);
    const binding = createConstBinding(item, key);
    maps.namedConsts.set(key, binding);
    if (prefix) {
        maps.namedConsts.set(item.name, binding);
    }
}

function useLookupPaths(item: UseItem): string[] {
    const fullPath = item.path.join("::");
    const paths = [fullPath];
    if (item.path[0] === "self" && item.path.length > 1) {
        paths.push(item.path.slice(1).join("::"));
    }
    return paths;
}

function extractUseItem(item: UseItem, maps: ExtractionMaps): void {
    const localName = item.alias ?? item.path[item.path.length - 1];
    const targetName = item.path[item.path.length - 1];

    const targetId = maps.fnIds.get(targetName) ?? hashName(targetName);
    maps.fnIds.set(targetName, targetId);
    maps.fnIds.set(localName, targetId);

    const fullPath = item.path.join("::");
    const sig =
        maps.fnSignatures.get(fullPath) ?? maps.fnSignatures.get(targetName);
    if (sig) {
        maps.fnSignatures.set(localName, sig);
    }

    for (const path of useLookupPaths(item)) {
        const binding = maps.namedConsts.get(path);
        if (binding) {
            maps.namedConsts.set(localName, binding);
            break;
        }
    }
}

function extractItems(
    items: ModuleNode["items"],
    maps: ExtractionMaps,
    prefix: string,
): void {
    for (const item of items) {
        if (item instanceof StructItem || item instanceof GenericStructItem) {
            extractStructItem(item, maps, prefix);
            continue;
        }
        if (item instanceof EnumItem) {
            extractEnumItem(item, maps);
            continue;
        }
        if (item instanceof FnItem) {
            extractFnItem(item, maps, prefix);
            continue;
        }
        if (item instanceof GenericFnItem) {
            extractGenericFnItem(item, maps, prefix);
            continue;
        }
        if (item instanceof ImplItem) {
            extractImplItem(item, maps, prefix);
            continue;
        }
        if (item instanceof TraitImplItem) {
            extractTraitImplItem(item, maps, prefix);
            continue;
        }
        if (item instanceof ConstItem) {
            extractConstItem(item, maps, prefix);
            continue;
        }
        if (item instanceof ModItem) {
            extractItems(item.items, maps, qualifyName(prefix, item.name));
            continue;
        }
        if (item instanceof UseItem) {
            extractUseItem(item, maps);
            continue;
        }
    }
}

export function extractModuleMetadata(
    typeContext: TypeContext,
    moduleNode: ModuleNode,
): ModuleMetadata {
    const structFields = new Map<string, ModuleStructFieldInfo[]>();
    const fnSignatures = new Map<string, ModuleFnSignature>();
    const fnIds = new Map<string, number>();
    const variantOwners = new Map<string, string>();
    const variantTags = new Map<string, number>();
    const namedConsts = new Map<string, ModuleConstBinding>();
    const implConsts = new Map<string, Map<string, ModuleConstBinding>>();
    const genericFns = new Map<string, GenericFnItem>();

    seedBuiltinEnumMetadata(variantTags, variantOwners);

    extractItems(moduleNode.items, {
        structFields,
        fnSignatures,
        fnIds,
        variantOwners,
        variantTags,
        namedConsts,
        implConsts,
        genericFns,
        typeContext,
    }, "");

    for (const name of Object.values(BUILTIN_SYMBOLS)) {
        fnIds.set(name, hashName(name));
    }

    return {
        structFields,
        fnSignatures,
        fnIds,
        variantOwners,
        variantTags,
        namedConsts,
        implConsts,
        genericFns,
        getCallSubstitution: (call) => typeContext.getCallSubstitution(call),
    };
}
