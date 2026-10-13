## 2026-03-31 - Enforce Bounded Reads on Zip Archive Metadata
**Vulnerability:** Reading zip archive entries into String/Vec via `read_to_string` without size limits exposes the application to Zip Bomb DoS attacks (memory exhaustion from highly compressed, oversized entries).
**Learning:** Even when reading expected small metadata files like `info.json`, reading directly from stream without `.take(limit)` allows malicious archives to trigger OOM panics/crashes.
**Prevention:** Always cap stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` or `read_to_end()`.
