# Sentinel Journal

## 2026-11-06 - Bounded Decompression for Mod Archive Metadata
**Vulnerability:** Unbounded decompression of archive entries (`info.json`) using `read_to_string` directly on `zip::read::ZipFile` in `mod_store.rs` and `downloader.rs`. A maliciously crafted zip bomb could decompress gigabytes of data from a tiny archive into process memory, resulting in host memory exhaustion and an OOM crash (Denial of Service).
**Learning:** Archive readers using `read_to_string()` without pre-read length guards rely implicitly on the compression format headers or complete EOF. In desktop mod managers handling community-submitted or downloaded mod archives, metadata files like `info.json` are expected to be small (~a few KB). Unbounded streaming decompressors process arbitrary payloads before JSON parsing happens.
**Prevention:** Always cap stream reads from untrusted archive entries using `.take(MAX_BYTES + 1)` and verify that the decompressed length does not exceed `MAX_BYTES` before converting or parsing the payload.
