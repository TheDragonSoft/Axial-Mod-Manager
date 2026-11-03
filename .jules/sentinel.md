## 2026-11-03 - Mitigate Zip Bomb and Memory Exhaustion via Capped Archive Stream Reads

**Vulnerability:** Untrusted mod zip archives were decompressed directly via `read_to_string` on archive entries (`info.json`) without size bounds in `mod_store::read_info_json` and `downloader::verify_mod_zip_sync`. A malicious zip bomb or heavily compressed file could decompress to gigabytes in memory, triggering an out-of-memory crash (Denial of Service).
**Learning:** Even though `ZipArchive` safely unpacks entries, calling unbounded read methods such as `Read::read_to_string` directly on an entry stream allows decompressed data amplification attacks.
**Prevention:** Always bound decompressing readers from untrusted archive entries using `.by_ref().take(MAX_BYTES + 1)` before reading into an in-memory buffer, and reject entries that exceed the domain-appropriate limit.
