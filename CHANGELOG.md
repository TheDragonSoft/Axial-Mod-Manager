# Changelog

All notable changes to Axial are documented here.

## Unreleased

### Fixed

- The game-bundled Space Age expansion mods (`space-age`, `quality`, `elevated-rails`) no longer show as "listed but zip missing" orphans in the storage report — they ship inside the game's data dir (Steam/GOG DLC layout), not the mods dir
- Vanilla / Vanilla: Space Age activation now reconciles `elevated-rails` alongside `space-age` and `quality` (it is a hard dependency of `space-age` and part of the bundled expansion set)

## 1.0.0 — "Conveyor" (2026-09-18)

First stable release.

### Added

- **Dashboard** — live stats (installed mods, updates, packs, storage), system status, session activity, and a storage card that deep-links into Settings
- **Dependency planning** — every install is diffed into a reviewable plan (install / satisfied / optional / conflicts / warnings) before anything is touched; full support for all Factorio dependency prefixes (`?`, `!`, `~`, `+`, hidden variants)
- **Mod packs** — snapshot your installed set or hand-pick mods into a shareable Base64 pack code; activation diffs target state vs. disk, downloads what's missing, and finalizes atomically. Built-in **Vanilla** and **Vanilla: Space Age** modes reconcile the mods directory against disk and the game's own data dir (Steam/GOG DLC layouts included)
- **Integrity** — every download is verified against the portal-published SHA1; a wrong-version leftover after a failed download is disabled and reported instead of silently enabled
- **External change sync** — a watcher notices when the game (or you) edits `mod-list.json` or drops zips into the mods dir and refreshes the Installed view, with a hint when the change happened while a pack was active
- **Reverse-dependency guard** — uninstalling a mod others require tells you exactly what would break, without blocking you
- **Changelog previews** — "What's new" for the newest release in the version switcher, and the installed→latest delta on expandable installed rows
- **Storage report** — per-mod and total mods-directory size, orphan detection (unreferenced zips, missing files, `.part` debris) with a guarded one-click cleanup
- **Auto-updater** — signed (minisign) in-app updates with an update pill and release-notes popover; startup check with dismissible skip
- **Command palette** — Ctrl+K for navigation, mod toggles, pack activation, launching the game, and portal search
- **Launch Factorio** button and auto-detected target game version (no manual selector)
- Portal thumbnails with letter-tile fallback, favorites, and lazy mod summaries
- Crash recovery for interrupted downloads; mods-directory validation (writable probe) before any write

### Changed

- Full UI redesign: warm-stone dark theme, dashboard-first navigation, expandable installed rows with disabled mods sorted last
- Vanilla/pack activation is immediate (no confirmation dialog); destructive actions still confirm
- Pack downloads resolve the portal's SHA1 before enqueueing instead of degrading silently

### Fixed

- Vanilla activation no longer leaves disk-present but unlisted mods (notably the bundled Space Age/Quality expansion zips, and data-dir DLC installs) enabled
- A failed/cancelled pack download can no longer cause finalize to enable the wrong version
- Activation paths (pack switch / Vanilla / download finalize) are serialized under an activation lock so rapid clicks and in-flight finalizes can't overwrite each other
- Malformed `mod-list.json` (non-array `mods`) is rejected on write instead of being silently ignored
