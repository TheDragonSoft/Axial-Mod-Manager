## 2025-05-18 - Cap Zip Archive Reads
**Vulnerability:** Unbounded decompressed stream reads when reading `info.json` entries from mod zip archives could allow zip bombs to cause OOM Denial of Service.
**Learning:** `zip::ZipArchive` entry decompressed reads via `read_to_string()` will read until EOF unless explicitly capped with `.take(MAX_BYTES)`.
**Prevention:** Always cap decompressed archive entry reads with `.take(MAX_BYTES)` prior to `read_to_string()` when processing untrusted zip entries.
