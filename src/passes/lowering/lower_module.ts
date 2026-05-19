import {
    FnItem,
    GenericFnItem,
    GenericStructItem,
    ImplItem,
    ModItem,
    type ModuleNode,
    NamedTypeNode,
    type ParamNode,
    PtrTypeNode,
    RefTypeNode,
    TraitImplItem,
    type TypeNode,
    Mutability,
    walkAst,
    ReceiverKind,
    EnumItem,
    CallExpr,
    IdentifierExpr,
} from "../../parse/ast";
import {
    MonomorphizationRegistry,
    type SubstitutionMap,
} from "../monomorphize";
import {
    type ModuleConstBinding,
    type ModuleMetadata,
    hashName as hashNameInternal,
} from "../module_metadata";
import { Result } from "better-result";
import {
    addIREnum,
    addIRFunction,
    getIREnumTypeKey,
    type IRFunction,
    type IRModule,
    type IRType,
    IRTypeKind,
    makeIREnumType,
    makeIRStructType,
} from "../../ir/ir";
import type {
    LoweringConstBinding,
    LoweringError,
    LoweringInput,
} from "./types";
import { AstToSsaCtx, inferCallSiteTypeArgs } from "./lower_expr";


export function lowerAstToSsa(
    fnDecl: FnItem,
    options: { irModule?: IRModule } = {},
): Result<IRFunction, LoweringError> {
    const ctx = new AstToSsaCtx(options);
    return ctx.lowerFunction(fnDecl);
}

function lowerOwnedFunction(
    fnItem: FnItem,
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    initialConsts?: Map<string, LoweringConstBinding>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    const ctx = new AstToSsaCtx({
        irModule,
        functionReturnTypes,
        structFieldNames,
        enumVariantTags,
        enumVariantOwners,
        namedConsts,
        initialConsts,
        monoRegistry,
    });
    ctx.seedFunctionIds(fnIdMap);
    const lowered = ctx.lowerFunction(fnItem);
    if (!lowered.isOk()) {
        return lowered;
    }
    addIRFunction(irModule, lowered.value);
    return Result.ok();
}

function ensureImplStructMetadata(
    irModule: IRModule,
    structFieldNames: Map<string, string[]>,
    implTarget: string,
): void {
    if (!structFieldNames.has(implTarget) && structFieldNames.has("Self")) {
        structFieldNames.set(implTarget, [
            ...(structFieldNames.get("Self") ?? []),
        ]);
    }
    const selfStruct = irModule.structs.get("Self");
    if (!selfStruct) {
        return;
    }
    const targetStruct = irModule.structs.get(implTarget);
    const targetNeedsUpgrade =
        !targetStruct ||
        targetStruct.fields.every((field) => field.kind === IRTypeKind.Unit);
    if (targetNeedsUpgrade) {
        irModule.structs.set(
            implTarget,
            makeIRStructType(implTarget, [...selfStruct.fields]),
        );
    }
}

function rewriteSelfInMethod(method: FnItem, implTarget: string): FnItem {
    const rewriteType = (ty: TypeNode): TypeNode => {
        if (ty instanceof NamedTypeNode && ty.name === "Self") {
            return new NamedTypeNode(ty.span, implTarget);
        }
        if (ty instanceof RefTypeNode) {
            return new RefTypeNode(
                ty.span,
                ty.mutability,
                rewriteType(ty.inner),
            );
        }
        if (ty instanceof PtrTypeNode) {
            return new PtrTypeNode(
                ty.span,
                ty.mutability,
                rewriteType(ty.inner),
            );
        }
        return ty;
    };

    const newParams: ParamNode[] = method.params.map((p) => {
        let ty = rewriteType(p.ty);
        if (p.isReceiver) {
            // Parser stores &self/&mut self with ty=NamedTypeNode("Self"), losing the &.
            // Restore the reference so the IR param type matches the pointer the call site passes.
            if (
                p.receiverKind === ReceiverKind.ref ||
                p.receiverKind === ReceiverKind.refMut
            ) {
                let mut = Mutability.Immutable;
                if (p.receiverKind === ReceiverKind.refMut) {
                    mut = Mutability.Mutable;
                }
                ty = new RefTypeNode(p.span, mut, ty);
            }
        }
        const { name: originalName } = p;
        let name = originalName;
        if (p.isReceiver) {
            name = "self";
        }
        return {
            ...p,
            // Normalize receiver name: parser produces "Self" (capital) but the body uses "self".
            name,
            ty,
        };
    });

    const newReturnType = rewriteType(method.returnType);

    return new FnItem(
        method.span,
        method.name,
        newParams,
        newReturnType,
        method.body,
        method.derives,
        method.builtinName,
    );
}

function convertToInitialConsts<T extends ModuleConstBinding | LoweringConstBinding>(
    implConsts: Map<string, T> | undefined,
): Map<string, LoweringConstBinding> {
    const result = new Map<string, LoweringConstBinding>();
    if (implConsts === undefined) {
        return result;
    }
    for (const [key, binding] of implConsts) {
        if (binding.value === undefined) continue;
        result.set(key, {
            key: binding.key,
            typeNode: binding.typeNode,
            value: binding.value,
            span: binding.span,
            selfTypeName: binding.selfTypeName,
        });
    }
    return result;
}

function lowerTraitImplMethods(
    item: TraitImplItem,
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    implConsts: Map<string, Map<string, LoweringConstBinding>>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    const implTarget = item.target.name;
    const initialConsts = convertToInitialConsts(
        implConsts.get(implTarget),
    );
    for (const method of item.fnImpls) {
        if (!method.body) continue;
        ensureImplStructMetadata(irModule, structFieldNames, implTarget);
        const result = lowerOwnedFunction(
            rewriteSelfInMethod(method, implTarget),
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            initialConsts,
            monoRegistry,
        );
        if (result.isErr()) {
            return result;
        }
    }
    return Result.ok(undefined);
}

function lowerImplMethods(
    item: ImplItem,
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    implConsts: Map<string, Map<string, LoweringConstBinding>>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    const implTarget = item.target.name;
    const initialConsts = convertToInitialConsts(
        implConsts.get(implTarget),
    );
    for (const method of item.methods) {
        if (method instanceof GenericFnItem) {
            continue;
        }
        if (!method.body) {
            continue;
        }
        ensureImplStructMetadata(irModule, structFieldNames, implTarget);
        const result = lowerOwnedFunction(
            rewriteSelfInMethod(method, implTarget),
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            initialConsts,
            monoRegistry,
        );
        if (result.isErr()) {
            return result;
        }
    }
    return Result.ok(undefined);
}

function lowerModuleItem(
    item: ModuleNode["items"][number],
    irModule: IRModule,
    functionReturnTypes: Map<string, IRType>,
    structFieldNames: Map<string, string[]>,
    enumVariantTags: Map<string, number>,
    enumVariantOwners: Map<string, string>,
    namedConsts: Map<string, LoweringConstBinding>,
    fnIdMap: Map<string, number>,
    implConsts: Map<string, Map<string, LoweringConstBinding>>,
    monoRegistry?: MonomorphizationRegistry,
): Result<void, LoweringError> {
    if (item instanceof GenericFnItem || item instanceof GenericStructItem) {
        return Result.ok(undefined);
    }
    if (item instanceof FnItem && item.body) {
        return lowerOwnedFunction(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            undefined,
            monoRegistry,
        );
    }
    if (item instanceof ImplItem) {
        return lowerImplMethods(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            implConsts,
            monoRegistry,
        );
    }
    if (item instanceof TraitImplItem) {
        return lowerTraitImplMethods(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            implConsts,
            monoRegistry,
        );
    }
    if (item instanceof ModItem) {
        for (const modItem of item.items) {
            const result = lowerModuleItem(
                modItem,
                irModule,
                functionReturnTypes,
                structFieldNames,
                enumVariantTags,
                enumVariantOwners,
                namedConsts,
                fnIdMap,
                implConsts,
                monoRegistry,
            );
            if (result.isErr()) {
                return result;
            }
        }
    }
    return Result.ok(undefined);
}

function toLoweringBinding(binding: ModuleConstBinding): LoweringConstBinding | undefined {
    if (binding.value === undefined) return undefined;
    return {
        key: binding.key,
        typeNode: binding.typeNode,
        value: binding.value,
        span: binding.span,
        selfTypeName: binding.selfTypeName,
    };
}

export function deriveLoweringMaps(
    metadata: ModuleMetadata,
    moduleNode: ModuleNode,
    irModule: IRModule,
): LoweringInput {
    const structFieldNames = new Map<string, string[]>();
    for (const [name, fields] of metadata.structFields) {
        structFieldNames.set(name, fields.map((f) => f.name));
        if (!irModule.structs.has(name)) {
            const fieldTypes = fields.map((f) =>
                AstToSsaCtx.translateTypeNode(f.type),
            );
            irModule.structs.set(name, makeIRStructType(name, fieldTypes));
        }
    }

    const collectEnums = (items: ModuleNode["items"]): void => {
        for (const item of items) {
            if (item instanceof EnumItem) {
                const variantTypes: IRType[][] = item.variants.map(() => []);
                const enumType = makeIREnumType(item.name, variantTypes);
                const enumKey = getIREnumTypeKey(enumType);
                if (!irModule.enums.has(enumKey)) {
                    addIREnum(irModule, enumKey, enumType);
                }
            }
            if (item instanceof ModItem) {
                collectEnums(item.items);
            }
        }
    };
    collectEnums(moduleNode.items);

    const fnIdMap = new Map(metadata.fnIds);

    const functionReturnTypes = new Map<string, IRType>();
    for (const [name, sig] of metadata.fnSignatures) {
        functionReturnTypes.set(
            name,
            AstToSsaCtx.translateTypeNode(sig.returnType),
        );
    }

    const namedConsts = new Map<string, LoweringConstBinding>();
    for (const [name, binding] of metadata.namedConsts) {
        const lowering = toLoweringBinding(binding);
        if (lowering) namedConsts.set(name, lowering);
    }

    const implConsts = new Map<string, Map<string, LoweringConstBinding>>();
    for (const [implTarget, consts] of metadata.implConsts) {
        implConsts.set(implTarget, convertToInitialConsts(consts));
    }

    return {
        irModule,
        structFieldNames,
        fnIdMap,
        functionReturnTypes,
        enumVariantTags: metadata.variantTags,
        enumVariantOwners: metadata.variantOwners,
        namedConsts,
        implConsts,
        getCallSubstitution: (expr) => metadata.getCallSubstitution(expr),
    };
}

export function lowerAstModuleToSsa(
    moduleNode: ModuleNode,
    loweringInput: LoweringInput,
): Result<IRModule, LoweringError> {
    const {
        irModule,
        structFieldNames,
        enumVariantTags,
        enumVariantOwners,
        namedConsts,
        implConsts,
        getCallSubstitution,
    } = loweringInput;
    const fnIdMap = new Map(loweringInput.fnIdMap);
    const functionReturnTypes = new Map(loweringInput.functionReturnTypes);

    const registry = new MonomorphizationRegistry();
    collectGenericItems(moduleNode, registry);
    const specializations = collectAndMonomorphize(
        moduleNode,
        registry,
        getCallSubstitution,
    );

    for (const spec of specializations) {
        fnIdMap.set(spec.name, hashNameInternal(spec.name));
        functionReturnTypes.set(
            spec.name,
            AstToSsaCtx.translateTypeNode(spec.returnType),
        );
    }

    for (const item of moduleNode.items) {
        const result = lowerModuleItem(
            item,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            implConsts,
            registry,
        );
        if (result.isErr()) {
            return result;
        }
    }

    for (const spec of specializations) {
        const result = lowerOwnedFunction(
            spec,
            irModule,
            functionReturnTypes,
            structFieldNames,
            enumVariantTags,
            enumVariantOwners,
            namedConsts,
            fnIdMap,
            undefined,
            registry,
        );
        if (result.isErr()) {
            return result;
        }
    }

    return Result.ok(irModule);
}

function collectGenericItems(
    moduleNode: ModuleNode,
    registry: MonomorphizationRegistry,
): void {
    const visitItem = (item: ModuleNode["items"][number]): void => {
        if (item instanceof GenericFnItem) {
            registry.registerGenericFn(item);
            return;
        }
        if (item instanceof GenericStructItem) {
            registry.registerGenericStruct(item);
            return;
        }
        if (item instanceof ModItem) {
            for (const nested of item.items) {
                visitItem(nested);
            }
        }
    };
    for (const item of moduleNode.items) {
        visitItem(item);
    }
}

function collectAndMonomorphize(
    moduleNode: ModuleNode,
    registry: MonomorphizationRegistry,
    getCallSubstitution: (expr: CallExpr) => SubstitutionMap | undefined,
): FnItem[] {
    walkAst(moduleNode, (node) => {
        if (!(node instanceof CallExpr)) return;
        if (!(node.callee instanceof IdentifierExpr)) return;

        const generic = registry.lookupGenericFn(node.callee.name);
        if (generic === undefined) return;

        const inferredSubs = getCallSubstitution(node);
        const subs =
            inferredSubs ?? inferCallSiteTypeArgs(generic, node);
        if (subs === undefined) return;

        registry.getOrCreateFn(generic, subs);
    });

    return registry.allFnSpecializations();
}
