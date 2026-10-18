# Sentinel Journal

## 2025-05-18 - Cap Decompressed Archive Reads
**Vulnerability:** Reading decompressed entries (`info.json`) from untrusted zip files into Strings via `read_to_string()` without byte caps could lead to Zip Bomb / Memory Exhaustion DoS attacks.
**Learning:** `zip::ZipFile` implements `std::io::Read`, so calling `.take(MAX_BYTES)` before `read_to_string()` prevents unbounded memory allocation when scanning installed mod zips or verifying downloaded releases.
**Prevention:** Always cap stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()`.
