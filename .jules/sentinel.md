## 2025-05-18 - Cap Decompressed Archive Stream Reads
**Vulnerability:** Unbounded `.read_to_string()` calls on decompressed zip archive entries (e.g. `info.json`) allowed potential Zip Bomb / Denial of Service memory exhaustion attacks.
**Learning:** Even small metadata files inside user-provided or mirror-hosted zip files can be compressed recursively or maliciously expanded to gigabytes in memory if read directly without stream bounds.
**Prevention:** Always bound entry reads with `.take(MAX_BYTES)` (e.g., 1 MB) before invoking `.read_to_string()`.
