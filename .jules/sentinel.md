## 2026-09-18 - Capping Zip Entry Decompression Sizes
**Vulnerability:** Zip bomb / OOM DoS when extracting `info.json` from untrusted mod zip files using `read_to_string` without size bounds.
**Learning:** In Rust `zip::ZipArchive` entries, calling `entry.read_to_string(&mut s)` directly streams all decompressed bytes into memory, allowing a small compressed zip with a huge uncompressed file to exhaust memory.
**Prevention:** Capped decompression using `entry.by_ref().take(MAX_INFO_JSON_SIZE + 1)` and validated uncompressed length before string processing.
