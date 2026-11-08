# Sentinel's Journal - Critical Learnings

## 2026-11-08 - Unbounded Decompression Bomb Protection in Untrusted Zip Readers
**Vulnerability:** Untrusted mod zip files (from third-party download mirrors or user-supplied mods folders) had their `info.json` archive entries decompressed directly into memory using `read_to_string` without size bounds. A malicious zip archive containing an entry that inflates to gigabytes of data could induce an Out-Of-Memory (OOM) denial-of-service condition and crash the desktop application.
**Learning:** `zip::ZipArchive` streaming entry readers decompress on the fly until EOF when read into a string or buffer. Even if the outer zip file has a small disk size or valid hash, the decompressed contents must be actively bounded.
**Prevention:** Wrap archive entry readers with `.take(MAX_INFO_JSON_BYTES + 1)` before invoking `read_to_string()` and verify that decompressed size does not exceed the limit (`MAX_INFO_JSON_BYTES`), failing gracefully if exceeded.
