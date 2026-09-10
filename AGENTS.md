# AGENTS.md

Context for AI agents (and humans) working on this repo. Read this before starting any task; it tells you what the project is, where things live, and the conventions that keep changes consistent.

## What this is

**Axial** — a desktop mod manager for Factorio. Tauri 2 app: Rust backend + React/TypeScript webview frontend. It talks to the official Factorio mod portal (read-only), downloads mod zips into the game's mods directory, manages enable/disable state through Factorio's `mod-list.json`, resolves dependency trees, detects updates, and manages portable mod "packs".

Naming facts (keep consistent):

- Package/crate name: `axial` (`package.json`, `src-tauri/Cargo.toml`)
- Product name: `Axial`; identifier: `com.thedragonsoft.axial` (`src-tauri/tauri.conf.json`)
- Log file: `axial.log`; pack export format tag: `axial-pack/1`

⚠️ The identifier defines the app-data directory (`settings.json`, `profiles/`, `logs/`). Changing it or `productName` changes where user data lives and what the bundles are called — don't do it casually.

## Commands

```sh
pnpm install                                    # deps
pnpm tauri dev                                  # run the full app (vite + Rust debug build)
pnpm dev                                        # frontend only (vite, no backend)
pnpm build                                      # tsc type-check + vite build (also produces dist/)
pnpm tauri build                                # release bundles
cargo test --manifest-path src-tauri/Cargo.toml # backend unit tests (~22)
```

- `dist/` is gitignored. If `cargo build`/`cargo test` complains about a missing `frontendDist`, run `pnpm build` first.
- There are no frontend tests yet — `pnpm build` (tsc) is the only frontend gate. Don't claim TS changes are verified without running it.
- CI: `.github/workflows/ci.yml` runs frontend build + `cargo test` on pushes/PRs. `.github/workflows/build.yml` builds NSIS/MSI/DMG/AppImage/deb on `v*` tags and manual dispatch, and publishes a GitHub release from those bundles on tags.

## Architecture

The IPC contract is the spine of the app. Data flows:

```
React UI ──invoke()──> src-tauri/src/commands/*  ──>  src-tauri/src/core/services/*
   ▲                       (thin, no logic)              (all the real logic)
   └──── events ────────  services emit via AppHandle
```

Rules:

- **`src-tauri/src/models.rs` is the single source of truth** for everything that crosses the IPC boundary. Wire format is camelCase serde. Frontend mirrors these types in `src/types.ts` and calls them through typed wrappers in `src/lib/api.ts`.
- **Errors**: backend returns `AppError` (`src-tauri/src/error.rs`), serialized as `{kind, message}`; frontend normalizes with `toAppError` in `api.ts`. Don't invent ad-hoc error shapes.
- **Commands** must stay thin: parse args, call a service, map errors. Logic belongs in `core/services/`.

### Backend services (`src-tauri/src/core/services/`)

| File            | Responsibility                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `index_client.rs` | `IndexClient` trait + `CachedHttp`: 5-min TTL response cache (200 entries), semaphore rate limit (2 concurrent). `PortalClient` implements the trait — anything upstream of it is testable with a fake. |
| `portal_client.rs` | Official portal API (`https://mods.factorio.com/api`). Tolerant DTOs; validates mod names/versions with `plausible_name`/`plausible_version` before using them in file paths. |
| `downloader.rs`   | Download queue: 3 concurrent, progress events, cancel flags, 3 retries with backoff on transient failures. Writes `<name>_<version>.zip.part`, renames on completion. **Zips come from the community mirror `mods-storage.re146.dev`** (official downloads need portal auth) — deliberate, documented in the README. |
| `deps.rs`         | Factorio dependency-string parser + version math. Handles all prefixes: `?` optional, `!` incompatible, `~` hidden-required, `+` recommended, `(?)`/`(!)` hidden variants. Mod names can contain spaces — parsing is prefix-aware, not split-on-space. |
| `resolver.rs`     | BFS install planning over the dep graph (cycle-guarded). Produces `InstallPlan` tiers: to_install / satisfied / optional / conflicts / warnings. Shown in `DependencyPlanModal.tsx`. |
| `mod_store.rs`    | Per-OS mods-dir detection, zip `info.json` scanning, `mod-list.json` editing, uninstall, directory validation (writable probe `.axial_write_probe`). |
| `packs.rs`        | Pack manifests stored as `profiles/<id>.json`. Import is tolerant (`format` accepted, not enforced). **Activation is target-state reconciliation**: diff target vs installed, download missing, finalize via `PendingActivation` state when downloads land, emit `pack-activated`. |
| `updates.rs`      | Newest release compatible with the configured target game version vs installed version. |

`AppState` (`state.rs`) holds: `RwLock<Config>`, config path, profiles dir, boxed `IndexClient`, `Arc<DownloadQueue>`, `pending_activation`. Long-running work (activation finalize, crash recovery) is spawned via `tauri::async_runtime`.

### Frontend (`src/`)

- `pages/` — BrowsePage, InstalledPage, PacksPage, SettingsPage (sidebar tab switching via `useAppStore`).
- `components/` — modals (`ModDetailsModal`, `DependencyPlanModal`, `VersionsModal`), `ModCard`, `QueueDrawer`, etc.
- `store/` — Zustand: `useAppStore` (active tab), `useQueueStore` (mirror of the backend download queue, fed by events).
- `lib/events.ts` — all backend event listeners in one place: `settings-changed`, `download-updated`, `installed-changed`, `pack-activated`. Registered once in `App.tsx`.
- Styling: Tailwind 4, dark zinc theme with amber accent.

## Recipes

**New backend command** (all five steps or the UI can't reach it):

1. Wire types in `src-tauri/src/models.rs`
2. Logic in the relevant `core/services/` module
3. Thin handler in `src-tauri/src/commands/<area>.rs`
4. Register in `lib.rs` → `invoke_handler`
5. Typed wrapper in `src/lib/api.ts`, then use it from a page/component

**New backend event**: emit from the service via `AppHandle::emit` → add the listener in `src/lib/events.ts` → update the affected store/state.

**New dependency-tree behavior**: it probably belongs in `deps.rs` (parsing/version math) or `resolver.rs` (planning). Both have unit tests — extend them (see below).

## Conventions

- **Comments explain why, not what.** Existing code carries explicit `ASSUMPTION (...)` notes where behavior was verified against the live portal API (e.g. sort params in `index_client.rs`) — keep that pattern for new upstream interactions, and update stale ones rather than leaving contradictions.
- **Never trust upstream data in file paths**: mod names/versions from the portal go through `plausible_name`/`plausible_version` before touching the filesystem.
- **Atomic writes**: settings and pack files are written to a temp file then renamed; downloads land as `.part` then rename. Follow this for any new persisted/downloaded file.
- **Factorio's files are load-bearing**: `mod-list.json` edits must preserve the format Factorio expects; the mods dir is validated before any write.
- **Tests are Rust-side** (`#[test]` with inline fixtures in `portal_client.rs`/`mod_store.rs`/`packs.rs`/`deps.rs`; `#[tokio::test]` in `resolver.rs`). New parser/resolver/pack logic ships with tests in the same file. There are no frontend tests — don't add JS test infra without a deliberate decision.
- Shell on this repo's dev machine is cmd.exe on Windows (no `grep`/`ls`; use `git grep`, `dir`, or Git Bash paths).

## Current state / known gaps

- Phases 1–9 complete (see git history): browse → download/install → deps resolver → packs → updates/ops polish. v0.1.0.
- No frontend tests; CI runs `cargo test` + `tsc` only.
- Download mirror is third-party (see `downloader.rs`); official authenticated portal downloads are a possible future feature (would need user token handling in Settings).
- CSP is configured in `tauri.conf.json` (allows `https:` images for portal thumbnails, `ipc:` for Tauri IPC). If you add remote resources the frontend loads, extend `img-src`/`connect-src` there.
