## 2025-05-18 - Capped Decompression for Mod Archive Metadata
**Vulnerability:** Unbounded decompression stream when reading `info.json` from untrusted mod archives (`entry.read_to_string(&mut s)`) in `mod_store::read_info_json` and `downloader::verify_mod_zip_sync`. A malicious zip bomb or heavily padded entry could exhaust system memory during library scan or download verification.
**Learning:** `zip::ZipFile` implements `std::io::Read` over the decompressor stream, which continues inflating compressed bytes until EOF or buffer exhaustion unless bounded.
**Prevention:** Bound decompressed stream reads from untrusted archives by wrapping with `.take(MAX_BYTES)` before calling `read_to_string` or `read_to_end`.
