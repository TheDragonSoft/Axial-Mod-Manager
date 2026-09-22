## 2026-03-31 - Limit Zip Entry Decompression Size for info.json Reads
**Vulnerability:** Unbounded memory allocation via `entry.read_to_string()` when parsing `info.json` from untrusted mod ZIP archives (Zip Bomb / DoS vulnerability).
**Learning:** `zip::ZipFile` implements `std::io::Read`, but reading directly into a string with `read_to_string` decompresses without upper bounds on uncompressed size.
**Prevention:** Always wrap `ZipFile` entries in `entry.take(MAX_SIZE + 1)` when reading JSON or metadata files from user/third-party archives to enforce strict limits.
