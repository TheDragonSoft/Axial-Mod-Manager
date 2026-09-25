## 2025-05-18 - Unbounded Zip Decompression (Zip Bomb DoS)
**Vulnerability:** Reading `info.json` zip entries via unbounded `read_to_string` allowed potential zip bomb / DoS attacks through unbounded memory allocation.
**Learning:** `zip::read::ZipFile` implements `std::io::Read`, but reading directly to a `String` without `.take(limit)` will decompress the entire stream into heap memory.
**Prevention:** Wrap zip entry readers with `.take(MAX_INFO_JSON_SIZE)` before calling `read_to_string`.
