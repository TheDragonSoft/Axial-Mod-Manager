## 2026-09-18 - Path Traversal Prevention in Pack Persistence
**Vulnerability:** `save_pack` in `packs.rs` accepted arbitrary pack IDs without validating against path traversal sequences, risking file writes outside `profiles_dir`.
**Learning:** `load_pack` and `delete_pack` validated pack IDs using `valid_id`, but `save_pack` omitted this check.
**Prevention:** Always validate all path component parameters with `valid_id` across all persistence operations (load, save, delete) in Rust services.
