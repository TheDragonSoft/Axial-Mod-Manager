# Sentinel's Security Journal

## 2026-09-20 - Unbounded stream decompression of info.json in zip archives
**Vulnerability:** Reading `info.json` from untrusted mod zip files in `read_info_json` and `verify_mod_zip_sync` decompressed entries directly using `read_to_string` without an upper bound on bytes read, exposing the app to decompression bombs (zip bombs) and OOM Denial of Service.
**Learning:** Archive decompression streams can expand small compressed inputs into gigabytes of data. Standard library `read_to_string` will keep reallocating the destination buffer until exhaustion.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()`. If the read content exceeds the expected maximum size, reject the entry with an error.
