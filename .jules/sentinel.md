## 2025-05-18 - Cap Decompressed Zip Entry Stream Reads
**Vulnerability:** Untrusted zip archives containing excessively large decompressed `info.json` entries could cause Out-Of-Memory (OOM) or Denial of Service (Zip Bomb) when using `read_to_string()`.
**Learning:** `ZipArchive::by_index` entries in Rust implement `Read`, but calling `read_to_string()` directly without `.take(MAX_BYTES)` reads until EOF regardless of decompressed length.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to calling `read_to_string()`.
