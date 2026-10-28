## 2025-05-18 - Capping Decompressed Reads from Zip Archive Entries
**Vulnerability:** Untrusted Factorio mod zip archives (scanned from disk or downloaded from mirrors) had `info.json` entry streams decompressed into memory via `read_to_string` without size limits, creating potential Zip Bomb / OOM Denial of Service vulnerabilities.
**Learning:** Archive readers using `std::io::Read::read_to_string` directly on decompressed entries allocate memory dynamically based on stream size, which untrusted archives can exploit.
**Prevention:** Always bound decompressed entry stream reads using `.take(MAX_BYTES)` (e.g. 1 MiB for JSON manifests) before calling `read_to_string()`.
