## 2025-05-18 - Cap Decompressed Zip Entry Reads
**Vulnerability:** Reading decompressed archive entries into strings (`read_to_string()`) without a maximum byte limit allows malicious mod zip files (zip bombs) to expand exponentially in memory, causing an Out-Of-Memory (OOM) Denial of Service crash.
**Learning:** Even when reading specific metadata files (`info.json`) inside zip files, stream decompression can allocate excessive memory if the decompressed size is untrusted and uncapped.
**Prevention:** Always cap decompressed stream reads from untrusted zip archive entries using `.take(MAX_BYTES)` (e.g., 2 MiB) prior to calling `read_to_string()`.
