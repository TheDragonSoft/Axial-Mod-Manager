## 2025-05-18 - Capped Decompressed Stream Reads for Untrusted Zip Entries
**Vulnerability:** Zip Bomb / OOM Denial of Service when reading `info.json` from untrusted mod zip files into a `String` via unbounded `read_to_string`.
**Learning:** `zip::read::ZipFile` decompresses entries on the fly. Reading directly with `read_to_string` without `.take(MAX_BYTES)` allows small compressed archives to decompress into gigabytes of data in memory, crashing the app.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()`, and verify the total decompressed string length against the maximum threshold.
