## 2026-09-18 - Zip Bomb Protection on Info.json Streams
**Vulnerability:** Unbounded `read_to_string` on uncompressed zip entry streams when parsing `info.json` from untrusted mod zips.
**Learning:** Zip archives decompress entry streams into memory on demand; without bounding entry reads, a compressed file expanding to gigabytes can cause Out-Of-Memory (OOM) Denial of Service during scan or download verification.
**Prevention:** Always wrap zip entry streams with `.take(MAX_SIZE)` (e.g., `10 * 1024 * 1024`) before calling `read_to_string` or decoding uncompressed archive contents.
