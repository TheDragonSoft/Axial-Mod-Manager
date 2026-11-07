## 2025-05-18 - Capped Decompression Reads for Zip Archive Entries

**Vulnerability:** Unbounded decompression stream reads (`entry.read_to_string(&mut s)`) when parsing `info.json` from mod zip archives in `mod_store.rs` and `downloader.rs`. A crafted zip bomb disguised as `info.json` could decompress gigabytes of repetitive bytes into RAM, leading to memory exhaustion and denial-of-service (OOM crash).
**Learning:** Even though `ZipArchive` safely unpacks individual entries without extracting to the filesystem, reading decompressed entry streams into memory directly via `read_to_string()` expands the full payload into memory unless explicitly bounded.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` to mitigate potential Zip Bomb / OOM Denial of Service vulnerabilities.
