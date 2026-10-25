## 2025-02-18 - Cap Decompressed Stream Reads for Archive Entries
**Vulnerability:** Reading decompressed files (e.g., `info.json`) from untrusted zip archives into `String` using `read_to_string` without length limits creates potential Zip Bomb / OOM Denial of Service risks.
**Learning:** Zip entries can have high compression ratios where a small zip file expands to gigabytes of text in memory during decompression.
**Prevention:** Always cap decompressed stream reads from archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` or `read_to_end()`.
