# Sentinel Security Journal

## 2026-09-18 - Path Traversal Prevention in Mod File Operations
**Vulnerability:** Substring checks (`/`, `\`, `..`) in `validated_zip_path` were insufficient on Windows/cross-platform file paths when resolving zip files in the mods directory before deletion/reading.
**Learning:** String matching on path separators can miss platform-specific path structures (e.g. drive relative paths or symlink escapes).
**Prevention:** Always combine single-component path checks (`p.file_name() == Some(...)`) with canonical path prefix checks (`fs::canonicalize(path).starts_with(fs::canonicalize(dir))`).
