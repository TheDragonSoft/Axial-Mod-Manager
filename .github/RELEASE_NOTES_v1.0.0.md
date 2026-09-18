# Axial 1.0 — "Conveyor"

A desktop mod manager for [Factorio](https://www.factorio.com/).

## What is Axial?

Axial manages your Factorio mods from a clean desktop app: browse the official mod portal, install with full **dependency planning**, keep every download **SHA1-verified** against the portal, and switch entire mod setups ("packs") in one click — including built-in **Vanilla** and **Vanilla: Space Age** modes. It watches your mods folder, so changes made by the game or by hand show up instantly. No account needed.

## Highlights

- **Dependency planning** — review exactly what an install pulls in before anything touches your mods folder
- **Pack switching** — snapshot your current setup as a shareable pack, activate Vanilla or any pack instantly; crash recovery and an activation lock make switching safe and race-free
- **Verified downloads** — every zip is checked against the portal's published SHA1 before it lands
- **Knows your game** — auto-detects your Factorio install (Steam, GOG, standalone), launches the game, and syncs external mods-folder changes live
- **Built for power users** — command palette (Ctrl+K), changelog previews on updates, reverse-dependency warnings on uninstall, storage cleanup with orphan detection, and a signed in-app auto-updater

## What's Changed

- Dependency planning + SHA1-verified downloads from the official portal (community mirror used for the actual file transfer)
- Pack activation & switching with crash recovery and atomic mod-list writes
- Vanilla & Vanilla: Space Age built-ins — correct on Steam/GOG DLC installs (expansion detected in the game data dir as well as the mods dir)
- External mods-dir change sync (game-edited `mod-list.json`, hand-dropped zips)
- Reverse-dependency guard on uninstall ("Removing X leaves N mods broken")
- Changelog previews on version switching and updates
- Mods-dir storage report with one-click orphan cleanup
- Update pill + release-notes popover powered by the signed auto-updater
- Command palette (Ctrl+K)

**Full changelog**: https://github.com/TheDragonSoft/Axial-Mod-Manager/compare/v0.2.1...v1.0.0

---

## Downloads & Assets

| Operating System | Recommended Package | Alternative Package | Notes |
| :--- | :--- | :--- | :--- |
| **Windows** (64-bit) | `Axial_1.0.0_x64-setup.exe` (NSIS) | `Axial_1.0.0_x64_en-US.msi` (MSI) | Windows 10 / 11 |
| **macOS** (Apple Silicon) | `Axial_1.0.0_aarch64.dmg` | — | M1 / M2 / M3 / M4 |
| **Linux** (64-bit) | `Axial_1.0.0_amd64.AppImage` | `Axial_1.0.0_amd64.deb` | Ubuntu, Debian, Fedora, Arch |

*Automatic in-app updates (`latest.json`) are cryptographically signed with Axial's release key. In-app updates currently cover Windows; macOS and Linux users update by downloading the new bundle.*

---

## First-Launch Instructions by OS

Because Axial is distributed directly via GitHub Releases as a community open-source project, your operating system may ask for one-time confirmation on first launch. Follow the quick instructions below for your OS:

### Windows (Microsoft Defender SmartScreen)
1. Run the downloaded installer (`Axial_1.0.0_x64-setup.exe`).
2. If the blue **Windows protected your PC** dialog appears:
   - Click **More info**.
   - Click **Run anyway**.
3. Axial will install and create desktop and Start menu shortcuts.

### macOS (Apple Gatekeeper)
1. Open the downloaded `.dmg` disk image and drag **Axial** into your **Applications** folder.
2. In Finder, open your **Applications** folder.
3. **Right-click** (or hold <kbd>Control</kbd> and click) **Axial** and choose **Open** from the context menu.
4. When prompted that Apple cannot check the app for malicious software, click **Open**.
   *(Alternatively, open Terminal and run `xattr -cr /Applications/Axial.app` to clear the quarantine flag).*
5. macOS permanently records your approval; subsequent launches can be opened with a standard double-click.

### Linux
- **AppImage:** Make the file executable before launching:
  ```bash
  chmod +x Axial_1.0.0_amd64.AppImage
  ./Axial_1.0.0_amd64.AppImage
  ```
- **Debian / Ubuntu (.deb):** Install using your package manager:
  ```bash
  sudo dpkg -i Axial_1.0.0_amd64.deb
  # Or: sudo apt install ./Axial_1.0.0_amd64.deb
  ```

---

## Feedback & Issues

Found a bug or have a suggestion? Please open an issue on GitHub:
https://github.com/TheDragonSoft/Axial-Mod-Manager/issues
