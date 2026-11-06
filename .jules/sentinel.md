# Sentinel's Journal - Critical Security Learnings

## 2026-03-31 - Cap Decompressed Stream Reads from Untrusted Mod Archives to Prevent Zip Bombs
**Vulnerability:** In `mod_store.rs` and `downloader.rs`, `entry.read_to_string(&mut s)` decompressed `info.json` from untrusted mod ZIP files (both scanned locally and downloaded from mirror storage) directly into memory without bounding the read stream size. A malicious or malformed mod archive containing an inflated `info.json` could cause unbounded memory allocation and an Out-Of-Memory (OOM) Denial of Service crash.
**Learning:** Even though Factorio `info.json` files are typically just a few kilobytes of JSON metadata, reading decompressed archive streams directly via `read_to_string` delegates allocation to the uncompressed payload size specified in the zip entry stream.
**Prevention:** Always wrap decompressed archive streams with `(&mut entry).take(MAX_BYTES + 1).read_to_string(...)` and verify that the read length does not exceed `MAX_BYTES` before parsing.
