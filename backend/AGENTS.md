## Backend C Coding Policy (Mandatory)

The backend workspace in `/Users/may/jsrust/backend` must follow these rules:

- Use WebKit-style C formatting.
- Function names must use `TypeName_action` form (example: `Arena_alloc`).
- Internal strings must be length-prefixed byte spans (`ptr + len`), not NUL-terminated strings.
- NUL-terminated strings are allowed only in short-lived host boundary adapters (CLI argv and filesystem calls).
- Reimplement required string/byte helpers locally for backend core code paths.
- Minimize allocations: use arena-first allocation with a single top-level backend context allocation and bounded arena growth.
- Use arena-backed dynamic arrays for variable-length data instead of per-object heap allocations.

Progress and status discipline:

- Update backend milestone state in `backend/plans/STATUS.md` at each milestone boundary.
- Keep this file updated when backend coding policy or plan status changes.