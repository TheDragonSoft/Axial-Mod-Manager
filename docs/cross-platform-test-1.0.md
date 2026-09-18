# Axial 1.0 — Cross-Platform Test Plan & Windows Verification Results

**Target Release**: Axial v1.0.0  
**Phase**: Phase 7 (Cross-Platform Verification & Release Candidate Preparation)  
**Document Purpose**: Record local Windows test results on real hardware, detail exact build and run commands for macOS and Linux, analyze the macOS ARM vs x64 architecture question, and provide actionable test matrices and torture test protocols with pass/fail checklists for testers on all three operating systems.

---

## 1. Local Windows Verification Results (Executed on Real Hardware)

**Execution Date**: September 18, 2026  
**Environment**: Windows 11 x64 (AMD64)  
**Binary Type**: Release build (`pnpm tauri build --no-sign`)  
**Product Identifier**: `com.thedragonsoft.axial`  
**Application Version**: `0.2.1` (1.0 release branch)

### 1.1 Artifact Generation & Integrity

| Artifact | Format | File Size | SHA256 Checksum |
| :--- | :--- | :--- | :--- |
| **`Axial_0.2.1_x64-setup.exe`** | NSIS Installer | 2,982,405 bytes (~2.98 MB) | `110B5793C8CDCB51F62D58E1D6A3E5CDE349804F2F8C2AACBAF210CA2F6A5153` |
| **`Axial_0.2.1_x64_en-US.msi`** | WiX MSI Package | 4,419,584 bytes (~4.42 MB) | `3269527083D56158DB5CE1A727780F8F7169F450F4546D9B91AE2918484B5D52` |
| **`axial.exe`** | Standalone Binary | 8,307,200 bytes (~8.31 MB) | Built in `src-tauri/target/release/axial.exe` |

- [x] **PASS**: Both NSIS and MSI bundles generated successfully without warnings or missing dependencies.

---

### 1.2 NSIS Installation & Uninstall Lifecycle

1. **Silent Installation (`/S`)**:
   - Command: `Start-Process -FilePath "Axial_0.2.1_x64-setup.exe" -ArgumentList "/S" -Wait`
   - Installed location: `C:\Users\ANXOMXR\AppData\Local\Axial\`
   - Binaries placed: `axial.exe` (8,307,200 bytes) and `uninstall.exe` (79,094 bytes).
   - Desktop shortcut: `C:\Users\ANXOMXR\Desktop\Axial.lnk` created (points to `AppData\Local\Axial\axial.exe`).
   - Start Menu shortcut: `C:\Users\ANXOMXR\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Axial.lnk` created.
   - Result: Clean, silent install without admin prompt elevation requirement (per-user installation).
2. **Silent Uninstallation (`/S`)**:
   - Command: `Start-Process -FilePath "C:\Users\ANXOMXR\AppData\Local\Axial\uninstall.exe" -ArgumentList "/S" -Wait`
   - Result: `axial.exe` and `Axial.lnk` shortcuts completely deleted from desktop and Start Menu.
   - User data (`settings.json`, `profiles/`, `logs/`) preserved in `%APPDATA%\com.thedragonsoft.axial\` as expected.
3. **Reinstallation**:
   - Re-executed installer. Re-established binaries and shortcuts cleanly.

- [x] **PASS**: Windows installer and uninstaller lifecycle verified.

---

### 1.3 Branding & Application Icon Verification (Phase 2e)

- **Executable Embedded Icon**: Inspected using `System.Drawing.Icon::ExtractAssociatedIcon` on `AppData\Local\Axial\axial.exe`.
  - Icon contains multiple standard resolutions (16×16, 32×32, 48×48, 256×256) embedded in PE header resource table.
  - Design verified: Warm stone dark tile (`#0C0A09` / `#1C1917`) with the `#00CC46` green accent mark.
- **Shortcuts**: Both Desktop and Start Menu `.lnk` shortcuts point to `IconLocation: ,0` (embedded icon).
- **Taskbar & Window**: Window header and taskbar grouping display the custom Axial branding mark instead of the default Tauri swirl.

- [x] **PASS**: Phase 2e branding verified on Windows desktop, taskbar, shortcuts, and installer.

---

### 1.4 Runtime, Log Location & Settings Persistence

- **App Data Directory**: `C:\Users\ANXOMXR\AppData\Roaming\com.thedragonsoft.axial\`
- **Settings File**: `settings.json` loaded and persisted atomically via temp-file rename.
- **Log File**: `logs\axial.log` created and active.
  - Rotation verified: Rotates to `axial.log.1` when exceeding 5 MB threshold.
  - Startup tracing verified:
    ```
    2026-09-18T14:19:51.675Z INFO axial_lib: starting — target game 2.0, mods dir Some("..."), log level info
    2026-09-18T14:19:51.677Z INFO axial_lib: backend setup finished elapsed_ms=4
    2026-09-18T14:19:51.677Z INFO axial_lib::core::services::watcher: watching mods dir for external changes
    ```
- **Runtime Metrics**:
  - Memory: ~48.7 MB working set on startup.
  - Handles: ~576 OS handles.
  - Startup to interactive: ~4 ms backend setup, UI loaded in < 1.8 s.

- [x] **PASS**: Runtime lifecycle, log rotation, and data paths verified.

---

### 1.5 Autodetection Matrix (Mods Directory & Game Installation)

| Test Case | System State | Actual Behavior | Result |
| :--- | :--- | :--- | :--- |
| **Configured Mods Dir** | `settings.json` specifies custom path (`.gui-test-mods`) | Axial monitors and scans custom folder. | **PASS** |
| **Unconfigured / Null Mods Dir** | `modsDir: null` in `settings.json` | Precedence triggers `existing platform dir`. Automatically detects `%APPDATA%\Factorio\mods` (24 mods present). Scans all 24 zips in 185 ms cold. | **PASS** |
| **Game Log Hint Detection** | Standalone Factorio at `D:\Games\Factorio` (no Steam) | `game_detect.rs` parses `%APPDATA%\Factorio\factorio-current.log`, finds `Read data path: D:/Games/Factorio/data`, resolves install root. | **PASS** |
| **Target Version Autodetection** | `D:\Games\Factorio\data\base\info.json` (`version: 2.0.72`) | Auto-detects `2.0` target version. Caches in `config.target_factorio_version`. Labels version on Dashboard as `(detected)`. | **PASS** |
| **Steam Libraries Probe** | `C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf` | Scanner successfully parses Valve VDF format; tolerates missing app ID 427520 gracefully and falls back to standalone detection. | **PASS** |

- [x] **PASS**: All Windows autodetection paths (Steam, standalone, game log, version probe) verified.

---

### 1.6 Launch Factorio Button Verification (Phase 2c)

- **Executable Resolution**: `resolve_executable_for_os(install, TargetOs::Windows)` resolves to `D:\Games\Factorio\bin\x64\factorio.exe`.
- **Validation**: Executable exists and is verified as a valid Windows PE binary.
- **Process Launch**: `launcher::launch(&config)` spawns detached process directly with current directory set to `bin\x64`. Does not hang or wait on the child process.
- **Sidebar Integration**: Header button is enabled when install is found; tooltips and disabled state activate if install path is invalid.

- [x] **PASS**: Phase 2c Launch Factorio integration verified on Windows.

---

### 1.7 Install → Enable → Uninstall Cycle

- **Download & SHA1 Check**: Verified against community mirror `mods-storage.re146.dev`. SHA1 verified against official portal metadata. Non-matching or corrupted zips fail permanently without retrying corrupt data.
- **Mod-List Synchronization**: `mod-list.json` edited atomically via temporary file rename. Preserves Factorio JSON formatting and comments structure.
- **Uninstall Impact**: Verified that removing a mod lists dependent mods (A2 impact analysis) and deletes the `.zip` cleanly from disk without leaving `.part` or unreferenced remnants.

- [x] **PASS**: Complete mod management cycle verified.

---

## 2. macOS Verification Plan & Runbook

### 2.1 Build Instructions (Run on macOS Hardware or GitHub Actions Runner)

To build release bundles locally on a Mac:

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Build Release DMG (Apple Silicon / ARM64 by default on modern macOS)
pnpm tauri build --bundles dmg --no-sign

# 3. Output Location
# src-tauri/target/release/bundle/dmg/Axial_0.2.1_aarch64.dmg
```

#### Universal Binary Build (ARM64 + x86_64)

If building a universal disk image for both Apple Silicon and Intel Macs:

```bash
# Add both Rust targets
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# Build universal DMG
pnpm tauri build --target universal-apple-darwin --bundles dmg --no-sign
```

---

### 2.2 The macOS Architecture Question: ARM-only vs x64 vs Universal

#### The Situation
- GitHub Actions `macos-latest` runners are now **M1/M2/M3 Apple Silicon (ARM64)** VMs.
- Compiling on `macos-latest` with standard `pnpm tauri build` produces an **`aarch64-apple-darwin`** binary.
- An ARM64 binary **will not run on Intel (x86_64) Macs**. (Rosetta 2 only translates x86_64 binaries on ARM machines, not the reverse).

#### Trade-Off Analysis

| Option | Implementation | User Experience | CI / Complexity Cost |
| :--- | :--- | :--- | :--- |
| **1. ARM64-Only** (Default) | Standard build on `macos-latest` | Fast, native on M1/M2/M3 Macs (vast majority of current macOS gaming base). Intel users cannot open it. | Zero CI cost; single small DMG (~12 MB). |
| **2. Universal Binary** (`universal-apple-darwin`) | Single job compiling dual targets via `lipo` | One single DMG works natively on all Macs (both Intel and Apple Silicon). | Slightly longer build time; DMG size ~22 MB. |
| **3. Dual Matrix Jobs** | `macos-latest` (ARM) + `macos-13` (Intel) | Users download either `Axial_x64.dmg` or `Axial_aarch64.dmg`. | Doubles macOS CI compute minutes; two release assets. |

#### Decision for 1.0
**Option 2 (Universal Binary) or Option 1 with clear release notes caveat**:
- If using GitHub Actions `macos-latest`, set target to `universal-apple-darwin` if dual toolchains are installed, OR ship native ARM64 with a clear note in the Release Notes: *"macOS build is compiled natively for Apple Silicon (M1/M2/M3/M4). Intel Mac users can compile from source via `cargo build --release`."*

---

### 2.3 macOS Gatekeeper Flow & Verification (Phase 4 Decision)

Under the **No-Purchase Path ($0)** recorded in `docs/signing.md`, Axial is distributed unsigned on macOS.

#### Gatekeeper First-Launch Checklist for Testers

| Step | Action | Expected Behavior | Pass/Fail |
| :--- | :--- | :--- | :--- |
| **M-G1** | Download `Axial_*.dmg` via browser | Browser sets quarantine flag `com.apple.quarantine`. | [ ] PASS / [ ] FAIL |
| **M-G2** | Open DMG and drag `Axial.app` to `/Applications` | Files copy cleanly. | [ ] PASS / [ ] FAIL |
| **M-G3** | Double-click `Axial.app` directly | Gatekeeper blocks launch: *"Axial cannot be opened because Apple cannot check it for malicious software."* | [ ] PASS / [ ] FAIL |
| **M-G4** | **Right-Click Bypass**: Right-click `Axial.app` → **Open** | Dialog displays with an explicit **Open** button alongside Cancel. | [ ] PASS / [ ] FAIL |
| **M-G5** | Click **Open** | Axial launches successfully. Subsequent launches open on standard double-click without warning. | [ ] PASS / [ ] FAIL |
| **M-G6** | **Terminal Bypass Alternative**: Run `xattr -cr /Applications/Axial.app` | Strips quarantine flag. App opens immediately on double-click. | [ ] PASS / [ ] FAIL |

---

### 2.4 macOS Functional Checklist

| ID | Test Scenario | Steps | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **M1** | App Data Directory | Check `~/Library/Application Support/com.thedragonsoft.axial/` | `settings.json`, `logs/axial.log`, and `profiles/` directory created. | [ ] PASS / [ ] FAIL |
| **M2** | Autodetect Factorio Paths | Clean launch on macOS with Factorio installed | Automatically detects `~/Library/Application Support/factorio/mods` and `/Applications/Factorio.app`. | [ ] PASS / [ ] FAIL |
| **M3** | Launch Factorio Button | Click "Launch Factorio" in Sidebar | Launches `/Applications/Factorio.app/Contents/MacOS/factorio` detached. | [ ] PASS / [ ] FAIL |
| **M4** | Dock & Menu Bar | Inspect Dock icon and top menu bar | Custom Axial icon rendered in Dock. Top application menu shows "Axial" with Quit (Cmd+Q) and Hide (Cmd+H). | [ ] PASS / [ ] FAIL |
| **M5** | Dark Mode Theme & Typography | Inspect app window styling | System fonts (Inter) and CSS custom dark palette render without font fallback issues or light-mode flashes. | [ ] PASS / [ ] FAIL |

---

## 3. Linux Verification Plan & Runbook

### 3.1 Build Instructions (Run on Ubuntu/Debian Hardware or CI)

To build AppImage and `.deb` packages locally on Linux:

```bash
# 1. Install Linux system build dependencies for Tauri 2
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# 2. Build bundles
pnpm install --frozen-lockfile
pnpm tauri build --bundles appimage,deb --no-sign

# 3. Output Locations:
# src-tauri/target/release/bundle/appimage/Axial_0.2.1_amd64.AppImage
# src-tauri/target/release/bundle/deb/axial_0.2.1_amd64.deb
```

---

### 3.2 Linux WebKit2GTK Rendering & Compatibility

Tauri on Linux relies on `webkit2gtk-4.1`. The following items must be verified:

1. **Hardware Acceleration / DMA-BUF Glitches**:
   - On certain Linux distributions with proprietary NVIDIA drivers, WebKitGTK may experience blank windows or flickering.
   - Known fix: Set environment variable `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
   - Tester must verify whether Axial renders cleanly out of the box on both Wayland and X11.
2. **Font Rendering**:
   - Verify bundled `@fontsource-variable/inter` font renders cleanly without pixelation or missing glyphs.
3. **Tray / AppIndicator**:
   - Verify window decorations, minimize, maximize, and close buttons follow the desktop environment (GNOME, KDE Plasma, XFCE).

---

### 3.3 Linux Functional Checklist

| ID | Test Scenario | Steps | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- |
| **L1** | AppImage Execution | 1. `chmod +x Axial_*.AppImage`<br>2. `./Axial_*.AppImage` | AppImage mounts and runs directly without package installation. | [ ] PASS / [ ] FAIL |
| **L2** | Debian Package Install | 1. `sudo dpkg -i axial_*.deb` or `sudo apt install ./axial_*.deb` | Installs cleanly to `/usr/bin/axial`. Creates desktop entry in application launcher. | [ ] PASS / [ ] FAIL |
| **L3** | App Data Directory | Check `~/.config/com.thedragonsoft.axial/` or `~/.local/share/` | `settings.json`, `logs/axial.log`, and `profiles/` created under XDG base directories. | [ ] PASS / [ ] FAIL |
| **L4** | Autodetect Factorio Paths | Clean launch on Linux with Factorio installed | Automatically detects `~/.factorio/mods` and Steam path `~/.local/share/Steam/steamapps/common/Factorio`. | [ ] PASS / [ ] FAIL |
| **L5** | Launch Factorio Button | Click "Launch Factorio" in Sidebar | Spawns `<install>/bin/x64/factorio` detached. | [ ] PASS / [ ] FAIL |
| **L6** | Deb Uninstallation | `sudo apt remove axial` | Binary and desktop entries removed cleanly. User configs in `~/.config` preserved. | [ ] PASS / [ ] FAIL |

---

## 4. Shared Torture Tests (Cross-Platform Stress Scenarios)

These tests exercise edge cases, file locks, network interruptions, and high-concurrency states. Can be executed on any host OS (Windows, macOS, Linux).

---

### Test T1: 500+ Zips Cold Scan at Scale

- **Objective**: Verify that scanning a realistic, large-scale mod library (over 500 zip archives) completes well within the 2.0s startup budget and does not block the UI or crash the file watcher.
- **Preconditions**: A directory containing 500+ valid Factorio mod `.zip` archives. Cache cleared.
- **Procedure**:
  1. Set `modsDir` in `settings.json` to the 500-mod folder.
  2. Launch Axial release build.
  3. Inspect `axial.log` for `scan_installed completed`.
- **Expected Results**:
  - Cold scan completes in **< 500 ms** (verified in Phase 6a benchmark at 97.96 ms).
  - Subsequent warm scans complete in **< 50 ms** (verified at 9.15 ms).
  - UI renders all rows with virtualization/pagination without lag or stutter.
- **Status**: [ ] PASS / [ ] FAIL

---

### Test T2: Factorio Running During Mod-List Writes

- **Objective**: Factorio holds locks or reads files while running. Ensure Axial's atomic replace (`mod-list.json.tmp` -> replace) does not crash or corrupt the mod list when Factorio is active.
- **Preconditions**: Factorio is open and idling on the main menu.
- **Procedure**:
  1. While Factorio is running, open Axial.
  2. Toggle 3 mods on/off in the Installed tab.
  3. Switch to a mod pack and activate it.
  4. Click "Vanilla" to disable all non-base mods.
  5. Close Factorio and inspect `mod-list.json`.
- **Expected Results**:
  - All atomic writes succeed with 0 file-locking errors (`PermissionDenied` or `SharingViolation`).
  - No temporary `.tmp` files are left behind.
  - When Factorio is reopened, it reads the updated mod list cleanly without warning of corrupted JSON.
- **Status**: [ ] PASS / [ ] FAIL

---

### Test T3: Cancel Mid-Download

- **Objective**: Verify that user-initiated cancellation cleanly aborts HTTP streaming and purges partial disk files.
- **Preconditions**: High-speed internet, queueing a large mod (> 20 MB, e.g. `angelspetrochemgraphics` or `space-exploration`).
- **Procedure**:
  1. Click Install on the large mod.
  2. Open the QueueDrawer.
  3. When download reaches ~30–50%, click the "Cancel" button on the queue item.
  4. Check the mods folder on disk.
- **Expected Results**:
  - Download stops immediately.
  - The in-progress `.part` file is deleted from disk.
  - Queue item shows "Cancelled" badge.
  - No corrupted `.zip` file remains in the directory.
  - No dangling background network threads remain active.
- **Status**: [ ] PASS / [ ] FAIL

---

### Test T4: Kill Process Mid-Download (Crash Recovery)

- **Objective**: Verify that an abrupt process crash, power loss, or OS kill (`SIGKILL` / `taskkill /F`) during download does not leave unusable debris and is recovered on next launch.
- **Preconditions**: Multiple downloads in progress.
- **Procedure**:
  1. Enqueue a batch of 5+ mods.
  2. While chunks are actively writing to disk, forcibly kill the Axial process (`taskkill /F /IM axial.exe` on Windows, `killall -9 axial` on Unix).
  3. Verify `.part` files exist in the mods folder.
  4. Re-launch Axial.
  5. Observe `axial.log` and QueueDrawer.
- **Expected Results**:
  - Startup crash recovery detects interrupted `.part` files.
  - Re-enqueues downloads automatically (verified in log: `re-enqueued interrupted download`).
  - Corrupt or incomplete zip files are never left in the final `.zip` state.
- **Status**: [ ] PASS / [ ] FAIL

---

### Test T5: 50-Mod Pack Activation

- **Objective**: Stress-test target-state reconciliation across a massive mod pack.
- **Preconditions**: Pack manifest created with 50 mods (20 already installed, 10 installed but disabled, 20 missing).
- **Procedure**:
  1. Click "Activate" on the 50-mod pack.
  2. Observe the download queue and progress.
  3. Wait for all downloads to finish.
- **Expected Results**:
  - Target-state diff correctly identifies the 20 missing mods and enqueues them.
  - Existing installed mods are preserved without re-downloading.
  - Once downloads land, finalizer applies atomic `mod-list.json` write.
  - `pack-activated` event fires and UI updates active pack badge to green.
- **Status**: [ ] PASS / [ ] FAIL

---

### Test T6: Activation-Lock Race Torture (P0-4 Bug Prevention)

- **Objective**: Prevent the race condition where a pack activation is in flight, but the user clicks "Vanilla" before the downloads complete.
- **Preconditions**: A pack activation is started that requires several mod downloads.
- **Procedure**:
  1. Click "Activate" on a pack that requires downloads.
  2. While downloads are actively progressing (status dot is pulsing amber), click "Vanilla" in the sidebar.
  3. Let the background downloads complete.
- **Expected Results**:
  - Vanilla activation immediately wins.
  - All mods except `base` are turned off in `mod-list.json`.
  - `active_pack_id` is set and persists as `"vanilla"`.
  - When the pending pack downloads finish, the pending activation state recognizes it was superseded and **does not** re-enable the pack or overwrite the `"vanilla"` state.
- **Status**: [ ] PASS / [ ] FAIL

---

## 5. Summary & Sign-Off Matrix

| Platform | Installer Package | Status | Sign-off Date | Verified By |
| :--- | :--- | :--- | :--- | :--- |
| **Windows 11 x64** | NSIS (`.exe`) + WiX (`.msi`) | **VERIFIED (PASS)** | September 18, 2026 | Local Hardware Run |
| **macOS (Apple Silicon)** | DMG (`.dmg`) | Ready for Hardware QA | Pending | — |
| **macOS (Intel x64)** | DMG (Universal / x64) | Ready for Hardware QA | Pending | — |
| **Linux (Ubuntu / Debian)** | AppImage + Debian (`.deb`) | Ready for Hardware QA | Pending | — |

---

*This document serves as the formal record of Windows verification and the test specification for Phase 8 release candidate validation.*
