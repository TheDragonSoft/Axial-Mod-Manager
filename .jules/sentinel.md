# Sentinel's Security Journal

## 2026-04-19 - Bound Stream Reads from Untrusted Zip Archive Entries Against Zip Bombs
**Vulnerability:** In `mod_store::read_info_json` and `downloader::verify_mod_zip_sync`, mod zip entries (`info.json`) were decompressed and read into memory with unbounded `read_to_string` calls. An adversary crafting a malicious mod archive containing a highly compressed zip bomb `info.json` could cause unbounded memory expansion, leading to out-of-memory (OOM) crashes and Denial of Service.
**Learning:** Even though `ZipArchive` safely traverses central directory headers without extracting files to disk, individual entry streams decompress untrusted payloads on the fly. Calling `.read_to_string()` without length constraints delegates memory allocation entirely to the untrusted stream size.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` to mitigate potential Zip Bomb / OOM Denial of Service vulnerabilities.
