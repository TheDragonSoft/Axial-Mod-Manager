# Axial 1.0 — Performance Report (Phase 6a)

**Date**: September 18, 2026  
**Target Release**: Axial v1.0.0  
**Environment**: Windows 11 (x64), Release build (`axial.exe` with `--release` profile), WebView2 runtime  
**Test Hardware**: Intel/AMD x64 dev workstation, NVMe SSD, broadband connection  

---

## Executive Summary

Phase 6a performance profiling measured Axial against all defined release budgets on production release binaries (`pnpm tauri build` / `cargo build --release`). All key metrics met or exceeded performance budgets:

- **Startup to Interactive**: Backend setup in **3 ms**, full app interactive in **~480–650 ms** (budget: < 2.0 s).
- **Installed Scan at Scale**: Cold scan of **500 mod archives** in **97.96 ms**; warm scan in **9.15 ms** (budget: sub-second).
- **Portal Search**: Remote round-trip in **~780–1780 ms** (upstream network bound), cached repeat queries in **< 1 ms**, UI render instantaneous (< 5 ms).
- **Download Throughput**: Saturates third-party mirror bandwidth across 3 concurrent permits (**~2.73 MB/s** aggregate across concurrent downloads) with negligible CPU overhead (< 1%).
- **Memory Footprint**: Working set of **29.01 MB** and private memory of **7.58 MB** at settled idle after large downloads.

Targeted optimizations were applied to eliminate unnecessary background React re-renders during active downloads, code-split the initial JavaScript bundle (22% reduction in initial chunk size), and remove worker mutex lock contention during parallel archive scanning.

---

## 1. Budgets & Empirical Measurements

| Metric | Target Budget | Measured Baseline | Measured Post-Fix | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Startup to Interactive** | < 2.0 s | ~550 ms | ~480–650 ms | **PASS** |
| **Cold Scan (500 dummy zips)** | < 1.0 s | 115 ms | **97.96 ms** | **PASS** |
| **Warm Scan (500 dummy zips)** | < 50 ms | 9.8 ms | **9.15 ms** | **PASS** |
| **Search Round-Trip (New Query)**| Responsive | 975–1780 ms | 780–1780 ms (net bound) | **PASS** |
| **Search Round-Trip (Cache Hit)**| < 50 ms | < 1 ms | < 1 ms | **PASS** |
| **Download Concurrency Throughput**| Saturate link | ~2.73 MB/s (3 jobs) | ~2.73 MB/s (3 jobs) | **PASS** |
| **Idle Memory (Working Set)** | < 150 MB | 46.08 MB (launch) | **29.01 MB** (settled idle)| **PASS** |
| **Idle Memory (Private Bytes)** | < 80 MB | 10.48 MB (launch) | **7.58 MB** (settled idle) | **PASS** |
| **Initial JS Bundle Size** | Minimal | 337.18 kB (97.9 kB gzip) | **262.86 kB** (81.6 kB gzip)| **PASS (-22%)** |

### Detailed Breakdown

### 1.1. Startup to Interactive
- Measured from binary invocation to `ping("world")` resolution, settings retrieval, and full dashboard rendering.
- Tracing log: `INFO axial_lib: backend setup finished elapsed_ms=3`.
- Backend initialization (reading configuration, detecting target Factorio version from `data/base/info.json`, initializing logging, starting watcher, checking crash recovery) finishes in ~3 ms.
- Frontend React mount + WebView2 IPC ping bridge reaches `"online"` within 500 ms of window launch.
- **Verdict**: Far below the 2.0 s threshold. No optimization required.

### 1.2. Cold & Warm Installed Scan (Scale Test: 500 Mod Zips)
- Generated a test repository of 500 valid Factorio mod archives (`dummy-mod-0001_1.0.0.zip` through `dummy-mod-0500_1.0.0.zip`) containing valid `info.json` manifests and `mod-list.json`.
- Tested in release mode via `scan_installed`:
  - **Cold Scan** (empty in-memory cache, 500 archives read from disk in parallel via `thread::scope`): **97.96 ms** total elapsed time (~0.19 ms per zip).
  - **Warm Scan** (mtime + size unchanged, served from memory cache): **9.15 ms** total elapsed time (~0.018 ms per zip).
- Pruning and duplicate version aggregation add < 2 ms across the entire 500-mod collection.

### 1.3. Portal Search
- Evaluated against official Factorio mod portal API (`https://mods.factorio.com/api/mods`).
- Raw network requests:
  - First search ("space"): ~1781 ms.
  - Subsequent distinct queries: ~780–1200 ms.
  - Cached queries (`CachedHttp`, 5-min TTL): < 1 ms.
- UI rendering of 20 results with skeleton transition took < 5 ms in React.
- **Verdict**: Portal search responsiveness is governed strictly by upstream latency. Local processing and client caching are optimal.

### 1.4. Download Throughput vs Raw Bandwidth
- Evaluated against the community mirror (`https://mods-storage.re146.dev`).
- Baseline single-connection raw bandwidth: ~0.83 MB/s.
- Concurrent downloads via `DownloadQueue` (semaphore concurrency limit = 3):
  - Concurrently downloaded `bobassembly` (15.8 MB), `angelssmeltinggraphics` (43.6 MB), and `angelsrefininggraphics` (85.6 MB) — totaling 145 MB — in ~53 s.
  - Combined throughput reached ~2.73 MB/s, fully utilizing multi-connection bandwidth.
  - Progress updates throttled at 120 ms intervals prevented UI starvation or event channel flooding.
  - Post-download SHA1 verification and zip sanity checks executed in `spawn_blocking` without stalling tokio worker threads.

### 1.5. Memory Consumption
- Measured using Windows process diagnostics (`WorkingSet64` and `PrivateMemorySize64`):
  - Fresh launch: 46.08 MB working set / 10.48 MB private bytes.
  - Peak download load (3 concurrent decompression / write streams): 74.99 MB working set / 49.64 MB private bytes.
  - Settled idle (post-transfers, garbage collected): **29.01 MB working set / 7.58 MB private bytes**.
- Memory efficiency is attributable to Tauri's lightweight WebView2 architecture compared to multi-process Electron alternatives.

---

## 2. Suspects Investigated & Fixes Applied

### 2.1. QueueDrawer Background Re-renders on Progress Ticks
- **Suspect**: `useQueueStore` selector usage causing wide component re-renders during high-frequency download events.
- **Finding**: In `src/components/QueueDrawer.tsx`, `useQueueStore((s) => s.items)` was subscribed unconditionally at the top of the component. Because `QueueDrawer` is mounted persistently in `App.tsx`, every progress event (every 120 ms per active download) executed:
  1. `items.filter(...)` for active downloads.
  2. `items.filter(...).sort(...)` for finished downloads.
  3. Re-rendering of `QueueRow` instances in the hidden DOM (drawer translated off-screen with `translate-x-full`).
- **Fix**:
  - Extracted `<QueueItemList />` as an isolated subcomponent.
  - `QueueDrawer` now only subscribes to primitive counters (`activeCount`, `finishedCount`, and `isOpen`).
  - `<QueueItemList />` is only mounted when `isOpen === true`.
  - When the drawer is closed, background download progress produces **zero** re-renders and executes no sorting or filtering logic.

### 2.2. Frontend Bundle Size & Code Splitting
- **Suspect**: Monolithic production JavaScript bundle.
- **Finding**: Production build emitted a single large chunk (`337.18 kB`, `97.94 kB` gzip) containing all tabs, modals, and portal view logic.
- **Fix**:
  - Code-split route components in `src/App.tsx` (`BrowsePage`, `InstalledPage`, `PacksPage`, `SettingsPage`) using `React.lazy` and `<Suspense>` with a lightweight `Spinner` fallback.
  - Production build breakdown after splitting:
    - Main entry chunk (`index.js`): **262.86 kB** (81.56 kB gzip) — **74.32 kB / 22% reduction**.
    - `BrowsePage.js`: 27.15 kB (7.91 kB gzip).
    - `InstalledPage.js`: 16.85 kB (5.28 kB gzip).
    - `PacksPage.js`: 16.53 kB (5.03 kB gzip).
    - `SettingsPage.js`: 16.48 kB (4.89 kB gzip).
  - First-paint payload is significantly leaner for startup.

### 2.3. Lock Contention During Parallel Cold Scan
- **Suspect**: `ZipInfoCache` mutex contention under `thread::scope` during cold scans of 500+ archives.
- **Finding**: In `src-tauri/src/core/services/mod_store.rs`, worker threads reading cache misses previously invoked `cache.store(...)` individually for each file, repeatedly contending on `self.dirs.lock()`.
- **Fix**:
  - Added `ZipInfoCache::store_many` for bulk insertion.
  - Worker threads now parse zip metadata in pure parallel isolation with zero mutex acquisition during file IO.
  - The main thread collects results and updates the directory cache in a single locked batch.
  - Cold scan time for 500 dummy zips dropped to **97.96 ms**.

### 2.4. Tracing Spans & Performance Observability
- Added diagnostic telemetry to standard log streams:
  - Startup elapsed time in `src-tauri/src/lib.rs`.
  - Cold/warm scan metrics, miss counts, and elapsed ms in `mod_store.rs`.
  - Search query duration and result counts in `commands/index.rs`.
  - Per-download elapsed time and effective MB/s throughput in `downloader.rs`.

---

## 3. Deliberately Left Alone (and Why)

1. **120 ms Download Progress Interval (`downloader.rs`)**:
   - The 120 ms interval (~8 Hz) strikes the ideal balance between UI smoothness and IPC efficiency. With the `QueueDrawer` re-render isolation applied, these updates are lightweight and non-disruptive. Throttling further (e.g. to 500 ms) would make progress bars visibly jumpy without providing measurable performance gains.
2. **5-minute In-Memory HTTP Cache (`CachedHttp`)**:
   - The 200-entry LRU / 5-minute TTL cache in `index_client.rs` was left unchanged. Factorio mod portal data updates at human time scales; 5 minutes avoids redundant API calls and protects against HTTP 429 rate limiting while ensuring sub-millisecond responses on back/forward browsing.
3. **List Virtualization for Installed Mods**:
   - 500 installed mod rows render in < 25 ms in modern browsers. Introducing virtualized windowing (e.g., `tanstack-virtual`) would add layout reflow constraints, keyboard navigation edge cases, and focus-management complexities for marginal benefit on typical Factorio mod counts (10–200 mods).
4. **Official Portal Download Path**:
   - Kept the community mirror (`mods-storage.re146.dev`) + SHA1 verification design. Official portal downloads require Factorio login token management and do not offer higher bandwidth than the mirror.

---

## 4. Verification & Validation Checklist

- [x] All 115 Rust unit tests passing: `cargo test --manifest-path src-tauri/Cargo.toml`
- [x] Frontend TypeScript type check and production build passing: `pnpm build` (built in 2.81s)
- [x] Verified on release build binary (`src-tauri/target/release/axial.exe`)
- [x] Scale test executed with 500 mock Factorio archives
- [x] Verified memory stability under active network and IO load
- [x] Conventional commit ready: `perf: 1.0 check-up fixes (+ report)`
