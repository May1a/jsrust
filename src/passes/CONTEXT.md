# Passes

Type inference, derive expansion, module resolution, borrow checking, and monomorphization. These passes run after parsing and before lowering.

## Language

**Inference**:
The type-checking pass. Walks the AST with a `TypeContext`, assigns types to every expression and item, resolves overloaded identifiers, checks arity and field access correctness, and reports type mismatches. Produces `TypeError` on failure.
_Avoid_: Type checking, type resolution

**Derive expansion**:
Transforms `#[derive(Debug, Clone, ...)]` attributes into synthesized trait impls. Runs before inference so the synthesized bodies are type-checked.
_Avoid_: Macro expansion, attribute processing

**Module resolution**:
Walks the AST to resolve `mod` declarations, `use` imports, and cross-module name references. Expands public/private visibility into accessible scopes. Produces a resolved module tree.
_Avoid_: Import resolution, name resolution

**Partial borrow check**:
Rejects dangling references (references to locals or temporaries that escape their scope). Does not enforce full Rust aliasing rules. Runs after inference, before lowering.
_Avoid_: Borrow-lite, borrow checking, reference analysis

**Monomorphization**:
The strategy of substituting generic type parameters with concrete types before lowering. Produces a separate instantiation per unique concrete type (e.g., `id_i32`, `id_bool`). The `MonomorphizationRegistry` collects generic items, records call sites, and generates specialized `FnItem` instances.
_Avoid_: Specialization, devirtualization

**ModuleMetadata**:
A data structure produced by walking the typed AST. Contains struct field names and types, function signatures and IDs, enum variant tags and ownership, named constants, impl constants, generic function registrations, and call-site substitutions. Consumed by lowering.
_Avoid_: Metadata map, module info

**TypeContext**:
The mutable type environment used during inference. Records struct/enum definitions, variable scopes, trait impls, and const bindings. Shared across the inference walk.
_Avoid_: Type table, symbol table

## Relationships

- **ModuleNode** → module resolution → derive expansion → **Inference** → **TypedModule** (type-annotated AST)
- **TypedModule** → **Partial borrow check** → borrow-correct TypedModule
- **ModuleMetadata** extracted from the typed AST → feeds into **Lowering**
- **Monomorphization** runs alongside lowering: generic items are collected pre-lowering, call sites are monomorphized during lowering

## Example dialogue

> **Dev:** "Does inference run on `impl` blocks or just free functions?"
> **Domain expert:** "On everything. Inference walks the entire module tree — functions, impls, trait impls, constants, and nested modules. Each gets a scope. Impl methods have their `Self` type resolved to the impl target before inference."

## Flagged ambiguities

- "type" previously meant both `TypeNode` (AST) and `IRType` (SSA) — always qualify: "type node" for AST, "IR type" for SSA
