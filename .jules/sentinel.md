## 2025-05-18 - Capped Zip Stream Decompression to Prevent OOM
**Vulnerability:** Uncapped `.read_to_string()` on `ZipArchive` entries (`info.json`) when scanning installed mods or verifying downloaded zip files could allow a Zip Bomb or specially crafted archive entry to exhaust heap memory (OOM Denial of Service).
**Learning:** `ZipArchive` entry decompressed streams implement `std::io::Read`. Reading directly into a String without a byte bound trusts the decompressed payload size.
**Prevention:** Always cap decompressed stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` or `read_to_end()`.
