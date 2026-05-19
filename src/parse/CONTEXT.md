# Parse

Lexing and parsing Rust source text into an abstract syntax tree (`ModuleNode`).

## Language

**Tokenize**:
Convert raw source text into a stream of tokens (keywords, identifiers, literals, operators, delimiters). Produces a `TokenType` stream consumed by the parser.
_Avoid_: Lex, scanning, lexer phase

**Parser**:
Constructs a `ModuleNode` AST from a token stream using recursive descent. Handles items (functions, structs, enums, impls, traits, modules, constants), statements, expressions, patterns, and types. Emits diagnostics on failure; never throws.
_Avoid_: AST builder, syntax analysis

**ModuleNode**:
The root AST node. Contains a list of top-level items and a module name. Produced by the parser, consumed by all downstream passes.
_Avoid_: AST root, compilation unit

**AST visitor**:
A TypeScript interface (`AstVisitor`) with a visit method per AST node kind. Used by inference, borrow check, and lowering to walk the tree without a giant switch statement. Leverages the `walkAst` helper which does generic traversal. Each pass supplies only the methods it needs.
_Avoid_: Tree walker, node visitor

## Relationships

- **Source text** → tokenize → token stream → **Parser** → **ModuleNode**
- **ModuleNode** feeds into **Inference** (see Passes context)
- **ModuleNode** feeds into **Lowering** (see Lowering context)

## Flagged ambiguities

- "token" previously meant both the stream and individual elements — now individual elements are `TokenTypeValue`, the function is `tokenize`

## Example dialogue

> **Dev:** "When the parser hits a syntax error, does it abort or keep going?"
> **Domain expert:** "It keeps going — produces a `RecoveryExpr` or `RecoveryItem` in the AST, accumulates diagnostics, and tries to resynchronize at the next item boundary. The caller sees diagnostics through the Result."
