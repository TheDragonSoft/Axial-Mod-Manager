## 2026-03-31 - Unbounded Zip Entry Decompression (Zip Bomb DoS)
**Vulnerability:** In `read_info_json` (`mod_store.rs`) and `verify_mod_zip_sync` (`downloader.rs`), `entry.read_to_string(&mut s)` decompressed `info.json` zip entries into memory without a size limit, leaving the application vulnerable to Zip Bomb / DoS memory exhaustion crashes.
**Learning:** Reading entry streams directly from zip archives (`ZipFile`) into `String` or `Vec` buffers without upper bounds can consume unbounded memory if a file contains huge uncompressed content.
**Prevention:** Always bound zip entry stream reads using `.take(MAX_BYTES)` before calling `read_to_string` or `read_to_end`.
