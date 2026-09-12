# Axial v${VERSION}

A desktop mod manager for [Factorio](https://www.factorio.com/).

## Highlights

<!-- Add 2-4 key highlights or summary bullet points of this release -->
- 
- 

## What's Changed

<!-- Full changelog bullets or generated commit list -->
- 

---

## Downloads & Assets

| Operating System | Recommended Package | Alternative Package | Notes |
| :--- | :--- | :--- | :--- |
| **Windows** (64-bit) | `Axial_${VERSION}_x64-setup.exe` (NSIS) | `Axial_${VERSION}_en-US.msi` (MSI) | Windows 10 / 11 |
| **macOS** (Apple Silicon) | `Axial_${VERSION}_aarch64.dmg` | — | M1 / M2 / M3 / M4 |
| **macOS** (Intel) | `Axial_${VERSION}_x64.dmg` | — | Intel Macs |
| **Linux** (64-bit) | `Axial_${VERSION}_amd64.AppImage` | `Axial_${VERSION}_amd64.deb` | Ubuntu, Debian, Fedora, Arch |

*Automatic in-app updates (`latest.json`) are cryptographically signed with Axial's release key.*

---

## First-Launch Instructions by OS

Because Axial is distributed directly via GitHub Releases as a community open-source project, your operating system may ask for one-time confirmation on first launch. Follow the quick instructions below for your OS:

### Windows (Microsoft Defender SmartScreen)
1. Run the downloaded installer (`Axial_${VERSION}_x64-setup.exe`).
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
  chmod +x Axial_${VERSION}_amd64.AppImage
  ./Axial_${VERSION}_amd64.AppImage
  ```
- **Debian / Ubuntu (.deb):** Install using your package manager:
  ```bash
  sudo dpkg -i Axial_${VERSION}_amd64.deb
  # Or: sudo apt install ./Axial_${VERSION}_amd64.deb
  ```

---

## Feedback & Issues

Found a bug or have a suggestion? Please open an issue on GitHub:
https://github.com/TheDragonSoft/Axial-Mod-Manager/issues
