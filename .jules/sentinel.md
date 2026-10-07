## 2026-03-31 - Path Traversal Prevention in Mod Name and Version Validation
**Vulnerability:** `plausible_name` and `plausible_version` permitted `.` and `..` or strings containing `..` (such as `.._foo` or `1.0..0`), posing path traversal risks when used in file paths or API endpoints.
**Learning:** Relying solely on character whitelist matching (`is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ')`) without checking path traversal sequences allows relative directory navigation tokens like `..`.
**Prevention:** Explicitly check `trimmed == "." || trimmed == ".." || trimmed.contains("..")` when validating strings that will be composed into file paths or system identifiers.
