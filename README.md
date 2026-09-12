# Axial

A desktop mod manager for [Factorio](https://www.factorio.com/), built with Tauri 2 (Rust backend, React + TypeScript frontend).

Axial lets you browse the official Factorio mod portal, install and update mods directly into your game's mods directory, resolve full dependency trees before installing, and organize mod sets into portable "packs" you can export, import, and activate in one click.

## Features

- **Browse & search** the official mod portal (`mods.factorio.com`) with sorting, pagination, and a details view
- **Dependency resolution** — parses every Factorio dependency prefix (`?` optional, `!` incompatible, `~` hidden-required, `+` recommended) and builds a reviewable install plan (install / satisfied / optional / conflicts / warnings) before anything is touched
- **Download queue** with live progress, cancel, retry with backoff for transient failures, and crash recovery (interrupted downloads are re-enqueued on the next launch)
- **Installed-mod management** — enable/disable via Factorio's `mod-list.json`, uninstall, and per-OS auto-detection of the mods directory
- **Updates** — checks installed mods against the newest release compatible with your target game version, with bulk update and per-mod version picking
- **Mod packs** — snapshot your installed set or hand-pick mods into a manifest, export/import it, and activate it: Axial diffs the target state against what's installed and downloads whatever is missing
- **Operational polish** — file logging with rotation, atomic settings persistence, and mods-directory validation before any writes

## Tech stack

| Layer    | Tools                                                            |
| -------- | ---------------------------------------------------------------- |
| Shell    | Tauri 2                                                          |
| Backend  | Rust (reqwest, tokio, serde, zip, tracing)                       |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Zustand 5          |
| CI       | GitHub Actions — tests on every push/PR, multi-platform builds on `v*` tags |

## Getting started

Prerequisites: [pnpm](https://pnpm.io/) 9+, Rust (stable), and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install
pnpm tauri dev      # run the app in development
```

Other commands:

```sh
pnpm build          # type-check + build the frontend only
pnpm tauri build    # produce release bundles (NSIS/MSI/DMG/AppImage/deb)
cargo test --manifest-path src-tauri/Cargo.toml   # backend unit tests
```

## Project layout

```
src/                  React frontend
  pages/              Browse, Installed, Packs, Settings
  components/         Mod cards, modals, queue drawer, etc.
  lib/api.ts          Typed invoke() wrappers — the frontend half of the IPC contract
  lib/events.ts       Listeners for backend events
  store/              Zustand stores (UI state, download-queue mirror)
src-tauri/
  src/commands/       Thin IPC command handlers
  src/core/services/  The real logic (see below)
  src/models.rs       Wire types — single source of truth for the IPC contract
  src/config.rs       settings.json persistence (atomic writes)
  src/state.rs        AppState
```

Key backend services: `portal_client` (portal API), `index_client` (caching + rate limiting), `downloader` (download queue), `deps` + `resolver` (dependency parsing and planning), `mod_store` (mods directory and `mod-list.json`), `packs` (pack manifests and activation), `updates` (update detection).

## Data & logs

App data lives under the OS app-data directory for the identifier `com.thedragonsoft.axial`:

| OS      | Path                                                        |
| ------- | ----------------------------------------------------------- |
| Windows | `%APPDATA%\com.thedragonsoft.axial`                          |
| macOS   | `~/Library/Application Support/com.thedragonsoft.axial`      |
| Linux   | `~/.config/com.thedragonsoft.axial`                          |

It contains `settings.json`, your pack manifests (`profiles/`), and logs (`logs/axial.log`, rotated at 5 MB).

## A note on downloads

Mod metadata comes from the official portal API (read-only, no authentication). Mod archives are downloaded from a community mirror (`mods-storage.re146.dev`) because official downloads require portal authentication. Every archive is verified against the SHA1 hash published for that release by the official portal before it reaches your mods directory. As with any third-party source, exercise normal caution with the mods you install.

## License

[MIT](LICENSE)
