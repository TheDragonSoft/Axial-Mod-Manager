## 2025-05-18 - Cap Decompressed Zip Entry Stream Reads
**Vulnerability:** Reading untrusted archive entries directly into string memory via `read_to_string()` without length bounds exposes the app to Zip Bomb / Memory Exhaustion Denial of Service attacks.
**Learning:** `zip::ZipFile` entries implement `std::io::Read`, but decompressing directly into a buffer/string without limiting bytes can consume arbitrary RAM if an archive entry expands massively.
**Prevention:** Always cap stream reads from untrusted zip entries using `.take(MAX_BYTES)` before calling `read_to_string()`.
