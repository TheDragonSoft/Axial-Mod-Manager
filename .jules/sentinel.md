## 2025-05-20 - Cap Decompression Stream Reads to Prevent Zip Bomb DoS
**Vulnerability:** In archive inspection routines (`read_info_json` and `verify_mod_zip_sync`), reading `info.json` directly with `read_to_string` on untrusted zip entries decompressed the entire stream into memory without bound, creating a Zip Bomb / OOM Denial of Service vulnerability.
**Learning:** Archive formats can have very high compression ratios where small compressed archives expand into gigabytes in memory. Even metadata files like `info.json` cannot be assumed to be small when reading from untrusted archives.
**Prevention:** Cap decompressed entry stream reads using `entry.take(MAX_BYTES + 1).read_to_string(...)` and verify the read length does not exceed `MAX_BYTES` before parsing.
