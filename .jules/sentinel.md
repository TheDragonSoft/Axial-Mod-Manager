## 2026-09-20 - Unbounded Decompression in Zip Inspection

**Vulnerability:** Reading untrusted archive entries via `read_to_string` without capping decompressed bytes in `mod_store::read_info_json` and `downloader::verify_mod_zip_sync` allowed zip bomb / OOM denial-of-service vulnerabilities (CWE-409).
**Learning:** Archive readers operate on streaming decompressed bytes where the compressed payload on disk or over the network can be tiny (< few KB) while the decompressed stream expands to gigabytes, exhausting memory during routine mod indexing or verification.
**Prevention:** Always bound decompressed archive stream reads using `.take(MAX_BYTES + 1)` before `read_to_string()` and enforce strict file-size limits on extracted metadata.
