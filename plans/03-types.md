# Type System

**File**: `types.js`

**Dependencies**: `ast.js`

## Task 3.1: Type Representation

- [ ] Define `Type` base structure with kind and span
- [ ] `IntType` - i8, i16, i32, i64, i128, isize
- [ ] `FloatType` - f32, f64
- [ ] `BoolType` - boolean
- [ ] `CharType` - character
- [ ] `StringType` - string slice (&str)
- [ ] `UnitType` - ()
- [ ] `NeverType` - !

## Task 3.2: Composite Types

- [ ] `TupleType` - (A, B, C)
- [ ] `ArrayType` - [T; N]
- [ ] `SliceType` - [T]
- [ ] `StructType` - named struct with fields
- [ ] `EnumType` - named enum with variants

## Task 3.3: Reference Types

- [ ] `RefType` - &T, &mut T (with mutable flag)
- [ ] `PtrType` - *const T, *mut T
- [ ] `RawPtrType` - raw pointers

## Task 3.4: Function Types

- [ ] `FnType` - fn(A, B) -> C
- [ ] Support for parameter names (optional)
- [ ] Support for return type (can be unit)

## Task 3.5: Type Variables (for inference)

- [ ] `TypeVar` - unification variable
- [ ] `TypeVarId` - unique identifier
- [ ] Track bound/unbound state

## Task 3.6: Type Context

**File**: `type_context.js`

- [ ] `TypeContext` class
- [ ] Scope stack for variable bindings
- [ ] Type storage (interned types)
- [ ] Item declarations registry
- [ ] Current function tracking

## Task 3.7: Scope Management

- [ ] `pushScope()` - enter new scope
- [ ] `popScope()` - exit scope
- [ ] `defineVar(name, type)` - add binding
- [ ] `lookupVar(name)` - find binding in scope chain

## Task 3.8: Item Registry

- [ ] `registerStruct(name, decl)`
- [ ] `registerEnum(name, decl)`
- [ ] `registerFn(name, decl)`
- [ ] `lookupItem(name)`

## Task 3.9: Type Utilities

- [ ] `typeEquals(a, b)` - structural equality
- [ ] `typeToString(type)` - human readable
- [ ] `isIntegerType(type)`
- [ ] `isFloatType(type)`
- [ ] `isNumericType(type)`
- [ ] `isReferenceType(type)`

## Testing

- [ ] Test file: `tests/types/representation.js`
- [ ] Test file: `tests/types/context.js`
- [ ] Test file: `tests/types/utilities.js`
