## 2025-05-18 - Cap Decompressed Stream Reads on Zip Archive Entries
**Vulnerability:** Unbounded `Read::read_to_string` on zip archive entries (such as `info.json` when scanning local mods or verifying downloaded mod archives) allows zip bombs or decompression bombs to exhaust process memory and CPU, leading to denial-of-service crashes.
**Learning:** Even though the outer zip file size might be modest and downloaded files are verified, local mod archives or mirror assets could contain heavily compressed text payloads that expand to gigabytes in memory if read without bounds.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` to mitigate potential Zip Bomb / OOM Denial of Service vulnerabilities.
