## 2025-05-18 - Cap Decompressed Stream Reads from Archive Entries
**Vulnerability:** Reading decompressed entry streams into string memory via `read_to_string` without size limits enables Zip Bomb / OOM Denial of Service vulnerabilities when processing untrusted mod archives.
**Learning:** `ZipArchive` entry handles implement `Read`, which will attempt to read the full decompressed stream into memory if not explicitly bounded.
**Prevention:** Always bound entry stream reads using `.take(MAX_BYTES)` before calling `read_to_string()`.
