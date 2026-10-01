## 2026-03-31 - Pack ID Path Traversal Protection
**Vulnerability:** `save_pack` accepted unvalidated pack IDs, allowing file creation/overwriting outside `profiles_dir` via path traversal sequences in `pack.id`.
**Learning:** Service functions accepting struct instances with ID fields (e.g. `Pack.id`) must apply the same `valid_id` validation as functions taking ID arguments directly (`load_pack`, `delete_pack`).
**Prevention:** Always validate ID fields with `valid_id` before constructing file paths with `PathBuf::join`.
