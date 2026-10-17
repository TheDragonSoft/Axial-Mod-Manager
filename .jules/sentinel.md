## 2025-05-18 - Cap Decompressed Stream Reads for Mod Archive Entries
**Vulnerability:** Uncapped `read_to_string()` on `ZipFile` entries (`info.json`) allowed potential Zip Bomb / OOM Denial of Service attacks when processing untrusted mod archives.
**Learning:** In Rust's `zip` crate, `ZipFile` implements `Read` without implicit decompressed size limits. Calling `read_to_string` directly on an entry decompresses the entire payload into RAM.
**Prevention:** Use `.take(MAX_INFO_JSON_BYTES)` (e.g. 10 MB limit) on `by_ref()` streams prior to `read_to_string()` to cap decompressed memory usage.
