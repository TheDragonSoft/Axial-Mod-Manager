# Sentinel Security Journal

## 2026-03-31 - Mod Name Input Validation Pattern across IPC Boundary
**Vulnerability:** Unvalidated mod names in IPC commands (like `toggle_mod`) could write arbitrary or malformed strings into `mod-list.json`.
**Learning:** Mod names across Axial must be validated with `plausible_name` (alphanumeric, `-`, `_`, `.`, ` `) at both the IPC handler layer and the service layer (`mod_store::set_enabled`).
**Prevention:** Always validate mod name parameters against `plausible_name` before performing file system or configuration operations.
