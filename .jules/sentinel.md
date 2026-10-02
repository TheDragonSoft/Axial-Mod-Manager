# Sentinel Journal - Critical Security Learnings

## 2026-03-29 - Unbounded Zip Entry Read (Zip Bomb DoS Protection)
**Vulnerability:** Reading `info.json` from untrusted mod ZIP files directly using `entry.read_to_string(&mut s)` without a size boundary allowed Zip Bomb / Memory Exhaustion DoS attacks.
**Learning:** `zip::read::ZipFile` implements `std::io::Read` but does not enforce a maximum read size when calling `read_to_string`, which can cause huge allocations if a compressed entry inflates to gigabytes.
**Prevention:** Always bound file entry reads from untrusted archives with `.take(MAX_ALLOWED_SIZE)` before reading into memory.
