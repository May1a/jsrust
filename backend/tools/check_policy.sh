#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if rg -n '\$' src tests include/libc.h >/dev/null; then
  echo "Policy failure: found disallowed '$' identifier usage"
  rg -n '\$' src tests include/libc.h
  exit 1
fi

if rg -n '\b(strlen|strcpy|strncpy|strcmp|strncmp|strcat|strncat|strstr|memcpy|memcmp|memset)\s*\(' src >/dev/null; then
  echo "Policy failure: found disallowed libc string/byte helpers in src/"
  rg -n '\b(strlen|strcpy|strncpy|strcmp|strncmp|strcat|strncat|strstr|memcpy|memcmp|memset)\s*\(' src
  exit 1
fi

if rg -n '^\w[\w\s\*]*\s+\w+\(' src/*.c | rg -v '(main\(|malloc\(|realloc\(|free\(|jsrust_backend_run_file\(|jsrust_backend_run_bytes\(|jsrust_wasm_|WasmAllocator_|ByteOps_|ByteSpan_|ByteBuffer_|Arena_|Backend|CLI_|Log_|FS_|IR|Runtime_|Exec|Trace|FrameValueTable_|FrameLocalTable_)' >/dev/null; then
  echo "Policy warning: function name without expected TypeName_action prefix"
  rg -n '^\w[\w\s\*]*\s+\w+\(' src/*.c | rg -v '(main\(|malloc\(|realloc\(|free\(|jsrust_backend_run_file\(|jsrust_backend_run_bytes\(|jsrust_wasm_|WasmAllocator_|ByteOps_|ByteSpan_|ByteBuffer_|Arena_|Backend|CLI_|Log_|FS_|IR|Runtime_|Exec|Trace|FrameValueTable_|FrameLocalTable_)'
  exit 1
fi

echo "Policy checks passed"
