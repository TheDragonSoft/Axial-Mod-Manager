# Axial 1.0 — Manual QA Checklist & Flow Matrix

**Target Release**: Axial v1.0.0  
**Phase**: Phase 6b (Bug Hunt & QA Matrix) → Feeds Phase 7 (Cross-Platform Verification)  
**Execution Target**: Real hardware (Windows, macOS, Linux) on release binaries (`pnpm tauri build`).  

---

## Instructions for Testers

This document defines the complete manual verification matrix for Axial 1.0. Because automated unit tests (`cargo test`) and frontend compilation (`pnpm build`) cannot fully drive desktop GUI interactions, window lifecycles, and OS-level file system hooks, execute every flow on real hardware before signing off on release candidates.

### Log Audit Requirement
Every manual test session must run with **debug logging enabled**. Audit `logs/axial.log` continuously during execution. Any unexpected `WARN` or `ERROR` trace is grounds for a bug report. See [Section 9: logs/axial.log Audit Guide](#9-logsaxiallog-audit-guide) for exact locations and log signatures.

---

## 1. Dashboard & Initial Launch

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D1** | Clean First Launch (Factorio detected) | No prior `settings.json` or config directory. Steam/standalone Factorio installed. | 1. Launch Axial executable.<br>2. Observe initial dashboard. | App opens cleanly (< 2s). Shows detected Factorio version `Factorio 2.0.x (detected)`. Mod count matches installed zips. System status shows "Bridge Online". | [ ] PASS<br>[ ] FAIL |
| **D2** | Degraded First Launch (Factorio not found) | No Factorio installed or configured in default directories. | 1. Launch Axial executable.<br>2. Observe dashboard and sidebar. | Top banner: "Factorio not found — set your mods folder in Settings" with button to Settings. Launch button in Sidebar is disabled with explanatory tooltip. No crash or raw error. | [ ] PASS<br>[ ] FAIL |
| **D3** | Launch Factorio Button | Game is detected or configured in Settings. | 1. Click "Launch Factorio" button in Sidebar header. | Factorio launches detached. Axial remains responsive. Dashboard Activity Feed logs "Launched Factorio". | [ ] PASS<br>[ ] FAIL |
| **D4** | Quick Access Navigation | At least one custom pack created + built-in Vanilla packs. | 1. Click pack items in Sidebar Quick Access.<br>2. Click "Vanilla" or "Vanilla: Space Age". | Opens `PackModal` directly. Green StatusDot highlights the currently active pack. | [ ] PASS<br>[ ] FAIL |
| **D5** | Session Activity Log | Any user actions (installs, toggles, pack switches). | 1. Perform a few actions across Axial.<br>2. Return to Dashboard. | Activity log records session events in reverse chronological order with timestamp, icon, title, and descriptive detail. | [ ] PASS<br>[ ] FAIL |

---

## 2. Browse & Search Matrix

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B1** | Search & Remote Portal Query | Internet connected. | 1. Navigate to **Browse**.<br>2. Type query in search bar (e.g. `flib`). | Results render with mod titles, authors, downloads, and summary. Loading skeleton appears briefly during network round-trip. | [ ] PASS<br>[ ] FAIL |
| **B2** | Search with Multi-Word & Spaces | Internet connected. | 1. Search for `Flow Control` or `Space Exploration`. | Portal results return relevant mods without encoding errors or HTTP 400. | [ ] PASS<br>[ ] FAIL |
| **B3** | Sort & Pagination | Internet connected. | 1. Change sort order (Top, Trending, Name, Recently Updated).<br>2. Navigate between pages using next/previous. | List updates matching sort order. Page counters reflect current offset. Cached pages re-render instantly (< 5 ms). | [ ] PASS<br>[ ] FAIL |
| **B4** | Favorites Persistence | Any mod in Browse. | 1. Click Heart icon on a mod tile.<br>2. Switch to "Favorites" tab filter.<br>3. Restart Axial. | Mod appears in Favorites tab. State persists across app restart (localStorage). Unfavoriting removes it immediately. | [ ] PASS<br>[ ] FAIL |
| **B5** | Portal Changelog Preview | Internet connected. | 1. Click a mod card in Browse.<br>2. Click "Changelog" or version dropdown with changelog icon. | Parses upstream HTML changelog into structured release notes. Markdown bullets, version headers, and dates render cleanly. | [ ] PASS<br>[ ] FAIL |
| **B6** | Offline / Portal Down Degraded State | Network disabled / disconnected. | 1. Navigate to **Browse**.<br>2. Try searching. | Clear inline banner: "Cannot reach Factorio mod portal — check your network connection". No unhandled alert dialogs or raw IPC error dumps. | [ ] PASS<br>[ ] FAIL |

---

## 3. Install & Dependency Plan Matrix

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **I1** | Standalone Mod Install | Mod has no dependencies (e.g. `Clockwork`). | 1. Click "Install" on Browse card.<br>2. Click "Install" in Install modal. | `QueueDrawer` opens automatically. Progress bar updates during download. SHA1 hash is verified against portal metadata. File lands in mods directory as `<name>_<version>.zip`. | [ ] PASS<br>[ ] FAIL |
| **I2** | Transitive Required Dependency Tree | Mod with deep required dependencies (e.g. `Krastorio2`). | 1. Open Install modal for the mod.<br>2. Observe Dependency Checklist. | All transitive required dependencies appear checked and locked. Install button queues all items in the tree. | [ ] PASS<br>[ ] FAIL |
| **I3** | Optional & Recommended Dependencies | Mod with optional dependencies. | 1. Open Install modal.<br>2. Toggle optional dependencies on/off.<br>3. Proceed with install. | Only selected optional dependencies are enqueued for download. Unselected items are omitted. | [ ] PASS<br>[ ] FAIL |
| **I4** | Incompatible Mod Conflict Detection | Mod A is installed. Mod B declares `! Mod A`. | 1. Try installing Mod B from Browse. | Resolver flags conflict in red: incompatible with installed mod. Prevents accidental destructive installation. | [ ] PASS<br>[ ] FAIL |
| **I5** | SHA1 Integrity Check Failure Handling | Intercept or simulate wrong checksum. | 1. Queue a download where SHA1 does not match. | Download terminates permanently without retry loop. `.part` file is deleted. Queue item shows badge: "integrity check failed". | [ ] PASS<br>[ ] FAIL |
| **I6** | Duplicate Enqueue Protection | Any mod currently downloading. | 1. Rapidly click Install or re-enqueue the same mod while in flight. | Rejected gracefully with notification: `<name> <version> is already in the download queue`. No duplicate download jobs spawned. | [ ] PASS<br>[ ] FAIL |

---

## 4. Installed Mods Management Matrix

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M1** | Expandable Installed Rows (Phase 2a) | At least one mod installed. | 1. Navigate to **Installed** page.<br>2. Click on a mod row (not on buttons).<br>3. Click again or press Escape. | Row smoothly expands showing mod description (lazy-fetched from portal/cache), secondary facts (file size, Factorio version, dependencies). Second click or Escape collapses the row. | [ ] PASS<br>[ ] FAIL |
| **M2** | Enable / Disable Toggle | Installed mod present. | 1. Click toggle switch on mod row.<br>2. Observe `mod-list.json` and UI. | Toggle flips state immediately. `mod-list.json` updates atomically. Disabled mods move to the bottom of the list and render with muted text style. | [ ] PASS<br>[ ] FAIL |
| **M3** | Version Switch | Installed mod has older version. | 1. Click Version icon / button on mod row.<br>2. Select a different compatible version.<br>3. Confirm download. | Downloads new version zip. Deletes old version zip on completion (no duplicates). `mod-list.json` preserves enabled state. | [ ] PASS<br>[ ] FAIL |
| **M4** | Uninstall with Dependency Impact Warning | Mod has other installed mods depending on it (e.g. `flib`). | 1. Click Delete (trash icon) on the dependency mod.<br>2. Observe Confirm dialog. | Modal displays impact warning listing all installed mods that will be broken if this mod is deleted. User must confirm twice. | [ ] PASS<br>[ ] FAIL |
| **M5** | Uninstall Standalone Mod | Mod has no dependents. | 1. Click Delete (trash icon).<br>2. Confirm deletion. | Zip is deleted from disk. Entry removed from `mod-list.json`. Installed count decrements. Activity feed logs uninstall. | [ ] PASS<br>[ ] FAIL |
| **M6** | Duplicate Install Detection | Two versions of the same mod placed in `mods/` manually. | 1. Drop `flib_0.13.0.zip` and `flib_0.14.0.zip` into mods dir.<br>2. Refresh Installed page. | Both entries display amber problem badge: `duplicate install — multiple versions of this mod are present`. | [ ] PASS<br>[ ] FAIL |
| **M7** | Corrupted Zip Detection | Invalid / zero-byte zip file in `mods/`. | 1. Place a corrupt file `corrupted_1.0.0.zip` into mods dir.<br>2. View Installed tab. | App does not crash. Row shows warning badge indicating unreadable zip and problem details. | [ ] PASS<br>[ ] FAIL |

---

## 5. Packs & Presets Flow Matrix

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P1** | Create Pack from Installed Mods | Several mods enabled/disabled on Installed page. | 1. Go to **Packs** page.<br>2. Click "New Pack".<br>3. Select "Create from current mods". Enter name. | Creates new pack JSON profile in `profiles/`. Captures exact mod names, versions, and enabled states. Pack card appears in list. | [ ] PASS<br>[ ] FAIL |
| **P2** | Pack Activation (All Mods Present) | Pack created from installed mods. | 1. Toggle switch on Pack card. | Switch flips immediately to active. Active pack state persists to `settings.json`. `mod-list.json` reconciles: pack mods set to target states, other disk mods disabled. StatusDot updates in Quick Access. | [ ] PASS<br>[ ] FAIL |
| **P3** | Pack Activation (Missing Downloads) | Pack manifest references mods not yet in `mods/`. | 1. Toggle switch on Pack card. | Switch shows in-progress pulse/spinner. Missing mods are queued and downloaded in `QueueDrawer`. Once all downloads finish, `pack-activated` lands, switch settles to active, activity feed reports result. | [ ] PASS<br>[ ] FAIL |
| **P4** | Pack Activation with Download Failure | Pack requires a download that fails (404/network error). | 1. Activate pack with failing download. | Download fails; `maybe_finalize` completes remaining downloads. Pack activates with available mods; missing mods stay disabled. Activity feed reports `X download(s) failed`. Switch does NOT hang forever. | [ ] PASS<br>[ ] FAIL |
| **P5** | Vanilla Activation (Built-in Pseudo-Pack) | Custom pack currently active with mods enabled. | 1. Click toggle on "Vanilla" built-in pack. | Reconciles `mod-list.json`: all mods disabled except `base`. Active pack ID becomes `"vanilla"`. | [ ] PASS<br>[ ] FAIL |
| **P6** | Vanilla: Space Age Activation | Official Space Age expansion zips present in `mods/`. | 1. Click toggle on "Vanilla: Space Age". | All mods disabled except `base`, `space-age`, `quality`, and `elevated-rails`. Active pack ID becomes `"vanilla-space-age"`. | [ ] PASS<br>[ ] FAIL |
| **P7** | Export Pack to Base64 Code | Pack exists. | 1. Open pack details modal.<br>2. Click "Copy Code". | Manifest copied to clipboard as raw Base64 string (no custom header or wrapping). | [ ] PASS<br>[ ] FAIL |
| **P8** | Import Pack from Base64 Code | Valid Base64 code in clipboard. | 1. Click "New Pack" → "Import from Code".<br>2. Paste Base64 string.<br>3. Confirm. | Pack manifest imported into `profiles/`. Appears in Packs list with correct mod list and versions. | [ ] PASS<br>[ ] FAIL |
| **P9** | Delete Custom Pack | Custom pack exists. | 1. Open pack modal.<br>2. Click "Delete Pack" and confirm. | Profile file deleted from disk. Pack removed from UI and Quick Access. Built-in Vanilla packs do not show delete affordance. | [ ] PASS<br>[ ] FAIL |

---

## 6. Updates & Bulk Operations Matrix

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **U1** | Update Detection Check | An installed mod has a newer release compatible with target Factorio version. | 1. Open Installed page.<br>2. Click "Check for Updates" (or observe auto-check). | Update pill badge displays number of available updates in sidebar and header. Mod row shows "Update Available" affordance. | [ ] PASS<br>[ ] FAIL |
| **U2** | Single Mod Update | Update available for Mod A. | 1. Click "Update to vX.X" on Mod A. | Enqueues download for new version. On completion, older zip is deleted (isolated to Mod A only), new zip is enabled. Update badge count decrements by 1. | [ ] PASS<br>[ ] FAIL |
| **U3** | Bulk "Update All" | Multiple updates available. | 1. Click "Update All" in Installed header. | Enqueues all available updates into download queue sequentially. `QueueDrawer` processes downloads up to 3 concurrent permits. Older versions removed cleanly. | [ ] PASS<br>[ ] FAIL |
| **U4** | Release Notes / Changelog Popover | Update available. | 1. Click update tag / release notes popover on update pill. | Displays changelog bullets and version diff directly in the popover before updating. | [ ] PASS<br>[ ] FAIL |

---

## 7. Settings & Storage Maintenance Matrix

| ID | Test Scenario | Preconditions | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S1** | Auto-Detected Target Factorio Version (Phase 2d) | Game directory configured or detected. | 1. Open Settings page.<br>2. Check Game Install panel. | Auto-detected version is displayed with a green "Auto-detected" badge (e.g. `2.0.28`). No manual version selector dropdown is present. | [ ] PASS<br>[ ] FAIL |
| **S2** | Custom Game Directory Override | Valid alternate Factorio directory path. | 1. Change Game Folder to custom path.<br>2. Click Save. | Directory validated with checkmark. Factorio target version re-detected immediately from `data/base/info.json`. Settings saved atomically to `settings.json`. | [ ] PASS<br>[ ] FAIL |
| **S3** | Custom Mods Directory Override | Valid alternate mods directory path. | 1. Change Mods Folder path in Settings.<br>2. Click Save. | Path validated (writability probe `.axial_write_probe`). File watcher re-arms on new directory. Installed tab immediately scans new folder. | [ ] PASS<br>[ ] FAIL |
| **S4** | Storage Facts & Breakdown | Several mods and old zip versions on disk. | 1. Open Settings → Storage panel.<br>2. Observe breakdown numbers. | Displays Total Disk Usage, Mod Zip count, Per-Mod size breakdown table, and Orphan File count/size. | [ ] PASS<br>[ ] FAIL |
| **S5** | Clean Orphans (Storage Cleanup) | Stale `.part` files or unreferenced zips on disk. | 1. Click "Clean Storage" in Settings.<br>2. Confirm dialog. | Deletes verified orphan files. Reports freed bytes and deleted count. Live mods stay intact. | [ ] PASS<br>[ ] FAIL |
| **S6** | Clean Orphans Blocked While Downloading | A download is currently downloading in queue. | 1. Start downloading a mod.<br>2. Quickly open Settings and click "Clean Storage". | Rejected with error: `cannot clean storage while downloads are in progress`. Prevents corrupting the in-flight `.part` file. | [ ] PASS<br>[ ] FAIL |
| **S7** | Auto-Updater Setting Toggle | Default settings. | 1. Toggle "Check for updates automatically" off/on. | Setting persists to `settings.json`. When disabled, startup updater check is skipped. | [ ] PASS<br>[ ] FAIL |

---

## 8. Edge Cases & Concurrency Torture Matrix

| ID | Test Scenario | Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | Kill Mid-Download (Crash Recovery) | 1. Start downloading a large mod (e.g. `Space Exploration Assets`, >100 MB).<br>2. Force-kill the Axial process (`taskkill /F /IM axial.exe` or SIGKILL).<br>3. Restart Axial. | Leftover `.zip.part` is detected on startup. Crash recovery automatically re-enqueues the download. On completion, file renames to `.zip` cleanly. | [ ] PASS<br>[ ] FAIL |
| **T2** | Prefix Name Isolation (`remove_other_versions`) | 1. Ensure `flib_legacy_1.0.0.zip` and `flib_0.13.0.zip` exist in `mods/`.<br>2. Install `flib` version `0.14.0`. | `flib_0.13.0.zip` is removed. `flib_legacy_1.0.0.zip` MUST NOT be deleted. | [ ] PASS<br>[ ] FAIL |
| **T3** | Activation Lock Torture (Vanilla vs Pack Race) | 1. Activate a pack requiring large downloads.<br>2. While downloads are in flight, immediately click "Vanilla" toggle. | Activation lock ensures atomic handoff: Vanilla takes precedence, clears pending activation, and writes Vanilla `mod-list.json`. When background downloads land, they do NOT overwrite Vanilla. | [ ] PASS<br>[ ] FAIL |
| **T4** | Mods with Spaces in Names | 1. Install `Flow Control`.<br>2. Toggle it, expand row, and update it.<br>3. Add to a Pack and export Base64. | Handled identically to hyphenated names. Dependencies parse correctly (`Flow Control >= 1.0.0`). Portal API requests percent-encode spaces as `%20`. | [ ] PASS<br>[ ] FAIL |
| **T5** | 500+ Mod Archive Scalability | 1. Load a directory containing 500+ mod zips.<br>2. Navigate to Installed page. | Scans in < 200 ms. UI renders without freezing. Searching and sorting remain smooth. | [ ] PASS<br>[ ] FAIL |
| **T6** | External Directory Modification (Watcher) | 1. With Axial open, copy a new mod zip into `mods/` using File Explorer / terminal.<br>2. Observe Axial UI. | File watcher detects change, debounces events, and triggers an `installed-changed` event. Installed tab automatically updates without manual refresh. | [ ] PASS<br>[ ] FAIL |

---

## 9. `logs/axial.log` Audit Guide

The log file is the single source of truth for backend health. Axial uses Rust `tracing` with structured span keys.

### Log File Locations
- **Windows**: `%APPDATA%\com.thedragonsoft.axial\logs\axial.log`  
  (Usually `C:\Users\<User>\AppData\Roaming\com.thedragonsoft.axial\logs\axial.log`)
- **macOS**: `~/Library/Application Support/com.thedragonsoft.axial/logs/axial.log`
- **Linux**: `~/.config/com.thedragonsoft.axial/logs/axial.log`

### Configuring Debug Log Level
1. Open Axial → **Settings** page.
2. Scroll to the **General** section.
3. In the **Log Level** dropdown, select **`Debug`** (default is `Info`).
4. Settings persist immediately; new trace entries write to `axial.log` at debug fidelity.

### Expected Log Patterns During Key Flows

#### 1. Startup
```text
INFO axial_lib: backend setup finished elapsed_ms=...
INFO axial_lib::core::services::watcher: watching mods dir for external changes: ...
INFO axial_lib::core::services::mod_store: scan_installed completed total=... hits=... misses=... elapsed_ms=...
```

#### 2. Download & Hash Verification
```text
INFO axial_lib::core::services::downloader: download enqueued id=1 mod="flib" version="0.14.0"
INFO axial_lib::core::services::downloader: download completed id=1 mod="flib" version="0.14.0" bytes=... duration_ms=... mbps=...
INFO axial_lib::core::services::packs: pack fully finalized pack_id="vanilla"
```

#### 3. Pack Activation
```text
INFO axial_lib::core::services::packs: pack activation applied pack="MyPack" enabled=12 disabled=4 downloads=0 errors=0
```

#### 4. External Modification
```text
INFO axial_lib::core::services::watcher: mods dir changed outside Axial; requesting rescan
```

### Red Flags to Report Immediately
- Any line starting with `ERROR` that was not intentionally triggered by a test scenario.
- Any line containing `lock poisoned` or `panic`.
- Download retry loops exceeding 3 attempts (`transient download failure, retrying...`).
- Any `mod-list.json is corrupt` error when the file was not manually corrupted.
- Unhandled IPC errors or WebSocket transport disconnections.

---

## Sign-Off Checklist

| Platform | Tester Name | Build Version | Date | Status (PASS/FAIL) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Windows 11 (x64)** | | | | | |
| **Windows 10 (x64)** | | | | | |
| **macOS (Apple Silicon)**| | | | | |
| **macOS (Intel x64)** | | | | | |
| **Linux (Ubuntu / Debian)** | | | | | |
| **Linux (Arch / Fedora)** | | | | | |
