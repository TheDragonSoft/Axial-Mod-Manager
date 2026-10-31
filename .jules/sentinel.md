# Sentinel's Journal - Critical Learnings

## 2025-05-20 - Bounded Decompression for Untrusted Zip Archives
**Vulnerability:** Unbounded decompression (`read_to_string`) on entry streams from untrusted mod zip files in `mod_store::read_info_json` and `downloader::verify_mod_zip_sync`. A crafted zip bomb with an oversized `info.json` could exhaust host memory and cause Denial of Service (OOM crash).
**Learning:** Even though `ZipArchive` safely traverses the central directory, individual entry decompression streams will decode indefinitely if read via `Read::read_to_string` directly on an unconstrained reader.
**Prevention:** Always wrap decompressed entry readers in `.take(MAX_BYTES)` before calling `read_to_string` or parsing JSON to ensure memory allocation is strictly bounded regardless of entry contents.
