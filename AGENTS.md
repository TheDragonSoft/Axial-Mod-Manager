# AGENTS.md

Context for AI agents (and humans) working on this repo. Read this before starting any task; it tells you what the project is, where things live, and the conventions that keep changes consistent.

## What this is

**Axial** — a desktop mod manager for Factorio. Tauri 2 app: Rust backend + React/TypeScript webview frontend. It talks to the official Factorio mod portal (read-only), downloads mod zips into the game's mods directory, manages enable/disable state through Factorio's `mod-list.json`, resolves dependency trees, detects updates, and manages portable mod "packs".

Naming facts (keep consistent):

- Package/crate name: `axial` (`package.json`, `src-tauri/Cargo.toml`)
- Product name: `Axial`; identifier: `com.thedragonsoft.axial` (`src-tauri/tauri.conf.json`)
- Log file: `axial.log`. Pack sharing is plain Base64 of the pack JSON manifest (no header/tag) — `export_pack_base64`/`import_pack_base64`.

⚠️ The identifier defines the app-data directory (`settings.json`, `profiles/`, `logs/`). Changing it or `productName` changes where user data lives and what the bundles are called — don't do it casually.

## Commands

```sh
pnpm install                                    # deps
pnpm tauri dev                                  # run the full app (vite + Rust debug build)
pnpm dev                                        # frontend only (vite, no backend)
pnpm build                                      # tsc type-check + vite build (also produces dist/)
pnpm tauri build                                # release bundles
cargo test --manifest-path src-tauri/Cargo.toml # backend unit tests (~80+)
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
| `portal_client.rs` | Official portal API (`https://mods.factorio.com/api`). Tolerant DTOs; validates mod names/versions with `plausible_name`/`plausible_version` before using them in file paths. Parses the details response's `thumbnail` into an absolute URL (`ModDetails.thumbnail`) for the UI. |
| `downloader.rs`   | Download queue: 3 concurrent, progress events, cancel flags, 3 retries with backoff on transient failures. Writes `<name>_<version>.zip.part`, renames on completion. **Downloads are verified against the portal-published SHA1** (`enqueue` takes `expected_sha1`; mismatch is a permanent failure; missing/invalid hash degrades to the zip-structure check only). **Zips come from the community mirror `mods-storage.re146.dev`** (official downloads need portal auth) — deliberate, documented in the README. |
| `deps.rs`         | Factorio dependency-string parser + version math. Handles all prefixes: `?` optional, `!` incompatible, `~` hidden-required, `+` recommended, `(?)`/`(!)` hidden variants. Mod names can contain spaces — parsing is prefix-aware, not split-on-space. |
| `resolver.rs`     | BFS install planning over the dep graph (cycle-guarded). Produces `InstallPlan` tiers: to_install / satisfied / optional / conflicts / warnings. Shown in `DependencyPlanModal.tsx`. |
| `mod_store.rs`    | Per-OS mods-dir detection (pure `decide_mods_dir` precedence: configured → existing platform dir → game portable dir → platform dir; `resolve_detection_status` feeds the UI's "Factorio not found" degraded states), zip `info.json` scanning, `mod-list.json` editing (`replace_mod_list` target-state writes), uninstall, directory validation (writable probe `.axial_write_probe`). |
| `game_detect.rs`  | Per-OS Factorio install detection (Steam libraries via `libraryfolders.vdf`, GOG, standalone paths, game-log `Read data path` hint) + game version read from `data/base/info.json` (`detect_target_version` — `Config.target_factorio_version` is now an auto-detected cache, refreshed at startup and on `game_dir` change; there is no manual selector). Read-only probing, no process spawn. `Config.game_dir` overrides detection when set. |
| `packs.rs`        | Pack manifests stored as `profiles/<id>.json`. Import is tolerant (`format` accepted, not enforced). Sharing is Base64 text (`export_pack_base64`/`import_pack_base64` of the manifest JSON; the only import/export path). **Activation is target-state reconciliation**: diff target vs installed, download missing, finalize via `PendingActivation` state when downloads land, emit `pack-activated` and persist `Config.active_pack_id`. Built-in pseudo-packs `vanilla` and `vanilla-space-age` = `activate_vanilla(expansion)` — `vanilla_entries` reconciles every disk mod off (except `base`, plus the bundled expansion mods in the Space Age flavor), so unlisted expansion zips can't stay enabled. |
| `updates.rs`      | Newest release compatible with the configured target game version vs installed version. |
| `mirror_client.rs` | Community mirror client (`re146.dev/factorio/mods`). Enriches `ModDetails` with per-release dependencies from embedded `info.json` (official API omits them). `PortalWithMirrorDeps` wraps `IndexClient` with mirror fallback. |
| `launcher.rs`     | Pure per-OS executable path resolution and detached process spawning for launching Factorio directly. |

`AppState` (`state.rs`) holds: `RwLock<Config>`, config path, profiles dir, boxed `IndexClient`, `Arc<DownloadQueue>`, `pending_activation`. `Config` (`config.rs`) additionally carries `active_pack_id`, `check_for_updates` (default true), `dismissed_update_version`, and the auto-detected `target_factorio_version` cache. Long-running work (activation finalize, crash recovery) is spawned via `tauri::async_runtime`. `lib.rs` also registers `tauri-plugin-updater` + `tauri-plugin-process` (in-app auto-updater, minisign-signed `latest.json` from GitHub releases; startup check in `App.tsx` with a dismissible banner and a Settings toggle).

### Frontend (`src/`)

- `pages/` — DashboardPage (home: stats, system status, session activity, detection status), BrowsePage (search + favorites view), InstalledPage (expandable rows; disabled mods sorted to the bottom, muted), PacksPage, SettingsPage (Storage / Game Install / General sections — there is no manual target-version selector). Sidebar tab switching via `useAppStore`; the sidebar also carries the "Launch Factorio" button and Quick Access.
- `components/ui/` — the shared design system: `Button`, `Badge`, `Card`, `Panel`, `PageHeader`, `Input`, `Select`, `Modal` (portal + focus trap + Escape with topmost-stack handling), `StatCard`, `SegmentedTabs`, `SettingRow`, `EmptyState`, `Spinner`, `StatusDot`, `ProgressBar`, `Toggle`, `ModTile` (portal thumbnail w/ letter-tile fallback), `useConfirm` (two-step destructive confirm). **Build new UI from these instead of re-inlining class strings.**
- `components/packs/` — `PackCard`, `NewPackModal` (share/import via Base64 code strings, not files), `PackModal` (pack details opened from Quick Access; activation Toggle, Copy Code, delete). Other components: `InstallModal` (Modrinth-style install dialog — version picker, dependency checklist, file facts; auto-closes and opens the queue on a clean enqueue), `VersionsModal` (switch version of an installed mod), `ModCard`, `QueueDrawer` (stable in-progress order, "Finished" section, Clear all), `Sidebar`.
- `lib/summaries.ts` — `useSummary(name)` lazy-fetches portal mod descriptions on first row expand, cached in `useSummaryStore` (same pattern as `lib/thumbnails.ts`).
- `store/` — Zustand: `useAppStore` (active tab, update count, `activePackId`/`activatingPackId` for pack switches, Factorio detection status: `isFactorioDetected`/`detectedGame`/`effectiveModsDir`), `useQueueStore` (mirror of the backend download queue, fed by events; timestamp-stable order + `selectActiveCount`/`selectFailedCount`/`selectFinishedCount` selectors, `openQueue()` hand-off), `useFavoritesStore` (frontend-only favorites, persisted to localStorage), `useActivityStore` (session-only activity log for the Dashboard), `useThumbnailStore` (portal thumbnail cache), `useSummaryStore` (resolved mod descriptions).
- `lib/events.ts` — all backend event listeners in one place: `settings-changed` (also triggers a detection-status refetch), `download-updated`, `installed-changed`, `pack-activated` (payload includes the `vanilla` pseudo-pack). Registered once in `App.tsx` (which also feeds the activity store, runs the delayed updater check, and syncs detection status on startup).
- `lib/thumbnails.ts` — `useThumbnails(names)` resolves portal thumbnails (via the details command; backend caches) into `useThumbnailStore`.
- Styling: Tailwind 4, CSS-first tokens in `src/index.css` (`@theme`) — palette pixel-sampled from the reference design: warm stone scale (`app` #0C0A09 page/modals, `surface` #1C1917 cards, `surface-2` #292524 hovers/active nav, `input` #161514 fields+secondary buttons, `line` borders) and a single swappable `accent` #00CC46 (status green). Icon tiles come in the reference hues blue `#0285EE` / green / violet `#BB3FF2` / orange `#F97316` (`ICON_TILE_TONES` in `Panel.tsx`). Primary buttons are warm off-white (stone-200); green is reserved for status/success. Don't introduce cool grays (zinc/slate) or new accent hues — match the sampled palette. Icons: `lucide-react`. Font: Inter (bundled via `@fontsource-variable/inter`).

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

- v0.2.0 on `main`. The 1.0 push is tracked in `docs/1.0-release-plan.md` (per-phase handoff prompts in `docs/1.0-agent-prompts.md`): Phases 0 (repo hygiene), 1 (SHA1 download verification), 2 (UX round: expandable installed rows, pack activation switches + built-in Vanilla pack, Launch Factorio button, auto-detected target version, real app icon), 4 (signing decision — no-purchase path, dormant CI wiring, `docs/signing.md`) and 5 (first-run / offline degraded states via `AppError::Network` + `get_detection_status`) are done in code. Phase 3 (auto-updater via `tauri-plugin-updater`, minisign pubkey in `tauri.conf.json`, `scripts/generate-updater-manifest.mjs`) is implemented but the updater has not yet been proven end-to-end with a real signed build. Remaining: Phase 6 (quality pass), 7 (cross-platform testing), 8 (pipeline dry runs / RC), 9 (release).
- Pack switching and Vanilla activation are immediate (no confirmation dialog — deliberately removed); Delete still confirms.
- The full UI redesign (DashboardPage, warm-stone dark theme with green accent, thumbnails, favorites, Quick Access) landed on `main` in `e446ad2` (v0.2.0). The old `experiment/new-ui` / `experimental/perf-improvements` branches and their worktrees were deleted after content-verification against `main`.
- No frontend tests; CI runs `cargo test` + `tsc` only. Backend tests grew to ~80+ with the 1.0 phases.
- Dependency info comes from community mirror enrichment (`mirror_client.rs`) because the official portal API omits per-release dependencies. If the mirror lacks info or is unreachable, the resolver degrades gracefully with a badge warning instead of failing.
- Download mirror is third-party (see `downloader.rs`); downloads are verified against portal-published SHA1. Official authenticated portal downloads are a possible future feature (would need user token handling in Settings).
- Code signing / notarization is unconfigured by design (Phase 4 no-purchase path); `build.yml` carries dormant macOS notarization, Azure Trusted Signing, and PFX wiring activated by secrets, plus `docs/signing.md` and first-launch instructions in the README / `.github/RELEASE_NOTES_TEMPLATE.md`.
- CSP is configured in `tauri.conf.json` (allows `https:` images for portal thumbnails, `ipc:` for Tauri IPC). If you add remote resources the frontend loads, extend `img-src`/`connect-src` there.
