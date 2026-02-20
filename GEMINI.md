# JSRust Project Overview

JSRust is a Rust compiler project implemented in JavaScript/TypeScript. It translates Rust source code into a custom Static Single Assignment (SSA) Intermediate Representation (IR), which is then serialized into a binary format and executed by a C-based backend engine.

**For AI Agents and contributors:** Please refer to [AGENTS.md](AGENTS.md) for detailed coding conventions, mandatory C backend policies, and current plan status updates.

## Core Architecture

- **Frontend (JavaScript/TypeScript):**
    - `parser.js`: Parses Rust source into an AST.
    - `hir.js` & `lowering.js`: Lowers AST into High-level Intermediate Representation (HIR).
    - `inference.js`: Handles type inference and checking on the HIR.
    - `hir_to_ssa.js` & `ir.js`: Converts HIR into a custom SSA IR.
    - `ir_serialize.js`: Serializes the SSA IR into a binary format (`.bin` / `.jsrbin`).
- **Backend (C):**
    - A standalone execution engine located in the `backend/` directory.
    - Interprets binary IR directly.
    - Can be compiled as a native CLI tool or as a WASM module for integration with the JS frontend.
- **Runner (JavaScript):**
    - `backend_runner.js`: Manages the loading and execution of the C backend (via WASM) from the JS environment.

## Project Planning and Roadmap

The `plans/` directory is the source of truth for the project's evolution and is organized into three tracks:

- `plans/active/`: Currently relevant implementation tracks (e.g., compiler progress, C backend initiative).
- `plans/future/`: Long-term initiatives (e.g., Node addon availability).
- `plans/old/`: Archived historical plans.

The **Backend Workspace** also maintains its own implementation plans in `backend/plans/`.

## Getting Started

### Prerequisites

- **Node.js**: (v18+ recommended)
- **Clang**: For building the C backend.
- **LLVM/WASM target**: For building the WASM backend.

### Building the Project

The JS frontend does not require a build step but benefits from type checking. The C backend requires compilation.

```bash
# Type check the JS/TS frontend
npm run typecheck

# Build the C backend native CLI
make -C backend build

# Build the C backend as WASM (required for 'node main.js run')
make -C backend wasm
```

### Running the Compiler

The `main.js` file serves as the primary entry point.

```bash
# Compile Rust source to SSA IR (textual output)
node main.js examples/03_arithmetic.rs

# Compile and run a Rust file through the backend
node main.js run examples/03_arithmetic.rs

# Additional options for 'run'
# --entry <name>  : Set the entry function (default: main)
# --trace         : Enable execution tracing
# --out-bin <file>: Save the binary IR to a file
node main.js run --trace --out-bin out.bin examples/03_arithmetic.rs
```

### Running Tests

```bash
# Run all JS-based tests (E2E, binary conformance, etc.)
npm test

# Run C backend unit tests
make -C backend test

# Generate backend test fixtures (binary IR files)
npm run fixtures:backend
```

## Development Conventions

- **Module System**: The JS frontend uses ES Modules (`type: module` in `package.json`).
- **Code Style**: 4-space indentation is preferred (configured via Prettier). Use `npm run format` to format the codebase.
- **Backend Constraints**: The C backend is written in strict C11, avoiding external dependencies for maximum portability and ease of WASM compilation. **Mandatory C coding policies are detailed in [AGENTS.md](AGENTS.md).**
- **Testing**: New features should be accompanied by examples in the `examples/` directory and corresponding tests in `tests/`.

## Directory Structure

- `backend/`: C backend implementation, headers, and build scripts.
- `docs/`: Technical documentation (IR format, validation semantics, WASM interface).
- `examples/`: Sample Rust programs and their expected IR/output.
- `plans/`: Project roadmap and implementation status.
- `scripts/`: Utility scripts for development (e.g., fixture generation).
- `tests/`: Comprehensive test suite for frontend, backend, and integration.
- `*.js`: Frontend compiler components.
