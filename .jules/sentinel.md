## 2025-02-21 - Capped Decompressed Archive Reads for Zip Bomb Mitigation
**Vulnerability:** Reading decompressed `info.json` entries directly from untrusted Factorio mod ZIP archives using `read_to_string()` without length bounds exposes the application to Zip Bomb / OOM Denial of Service attacks.
**Learning:** `zip::ZipArchive` entries decompress on-the-fly; unbounded reads (`read_to_string`) allocate until stream EOF, allowing a small crafted file to crash the process.
**Prevention:** Always cap stream reads from untrusted archive entries using `.take(MAX_BYTES)` (e.g. `MAX_INFO_JSON_BYTES = 1_048_576`) prior to `read_to_string()`.
