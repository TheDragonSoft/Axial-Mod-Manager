## 2025-05-18 - Cap Decompressed Stream Reads for Archive Entries
**Vulnerability:** Unbounded decompressed `read_to_string()` on untrusted ZIP archive `info.json` entries presented a potential Zip Bomb / OOM Denial of Service vulnerability.
**Learning:** `zip::ZipArchive` entries implement `std::io::Read`, but reading directly to string without limiting decompression size can allow maliciously crafted tiny ZIPs to decompress into massive in-memory strings.
**Prevention:** Always wrap decompressed archive streams with `entry.take(MAX_BYTES)` prior to calling `read_to_string()`.
