## 2025-05-18 - Cap Decompressed Archive Reads for Zip Bomb Mitigation
**Vulnerability:** Unbounded `read_to_string()` decompressing untrusted `info.json` entries in mod zip archives posed a potential Zip Bomb / OOM Denial of Service risk.
**Learning:** Even small metadata files inside user/third-party archives can be crafted into decompressed zip bombs if stream reads are not bounded.
**Prevention:** Always cap decompressed archive entry reads with `.take(MAX_BYTES)` before calling `read_to_string()`.
