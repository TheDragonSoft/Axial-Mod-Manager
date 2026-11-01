# Sentinel's Journal

Critical security learnings and codebase-specific vulnerability patterns.

## 2026-11-01 - Zip Bomb / Unconstrained Decompression OOM DoS in Mod Archive Scanning
**Vulnerability:** Untrusted zip files in the Factorio mods folder and newly downloaded mod zips were decompressed via `entry.read_to_string(&mut s)` without limiting read length. A maliciously crafted zip bomb entry named `info.json` could cause excessive memory consumption and crash Axial via Out-Of-Memory (OOM) denial of service.
**Learning:** `zip::read::ZipFile` implements `std::io::Read`. Using unbounded `read_to_string()` on untrusted compressed entries is unsafe even if only metadata files (`info.json`) are targeted.
**Prevention:** Always cap decompression stream reads from untrusted archive entries using `.take(MAX_BYTES)` prior to `read_to_string()` (e.g. `MAX_INFO_JSON_BYTES = 10 * 1024 * 1024`).
