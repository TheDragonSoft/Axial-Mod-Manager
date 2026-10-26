# Sentinel Security Journal

## 2025-05-18 - Zip Bomb / OOM DoS Mitigation via Stream Truncation
**Vulnerability:** Untrusted ZIP files read during mod scanning (`mod_store.rs`) or mod verification (`downloader.rs`) used `entry.read_to_string(&mut s)` without length limits, risking Out-Of-Memory (OOM) Denial of Service from Zip Bombs.
**Learning:** `zip::ZipArchive` entries decompress streams on the fly during `read_to_string`. Without explicit length limits on the reader, compressed archives with extreme compression ratios allocate untracked memory up to OOM crash limits.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` (e.g., `entry.by_ref().take(MAX_INFO_JSON_BYTES).read_to_string(&mut s)`) prior to calling `read_to_string()`.
