## 2026-03-31 - Cap Decompressed Stream Reads on Zip Entries
**Vulnerability:** Unbounded decompressed stream reads (`read_to_string`) on `info.json` entries inside untrusted mod zip archives could cause OOM / Zip Bomb Denial of Service vulnerabilities.
**Learning:** `zip::ZipFile` entries implement `std::io::Read` and will decompress up to EOF unless explicitly limited with `.take(MAX_BYTES)`.
**Prevention:** Always use `.take(MAX_INFO_JSON_BYTES)` (2 MiB) before calling `read_to_string()` when processing untrusted zip archive entries.
