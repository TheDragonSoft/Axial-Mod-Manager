## 2026-10-05 - Bounded Zip Entry Decompression and Import Validation
**Vulnerability:** Unbounded decompression of zip entries (`info.json`) during mod scanning/verification could allow zip bombs to consume arbitrary memory and crash the app via OOM (DoS). Unbounded Base64 pack import strings could also lead to memory exhaustion.
**Learning:** `zip::read::ZipFile` implements `std::io::Read`, so wrapping reads with `take(MAX_SIZE)` (e.g. 2 MB) bounds memory consumption safely.
**Prevention:** Always wrap uncompressed reads from untrusted archives or untrusted encoded payloads with `std::io::Read::take(MAX_SIZE)` or explicit string length checks before decompressing or decoding.
