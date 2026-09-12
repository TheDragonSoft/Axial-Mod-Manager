# Task: Phase 1 — SHA1 verification of mod downloads (Axial)

## Context

Repo: **Axial**, a Tauri 2 desktop mod manager for Factorio (Rust backend, React/TypeScript frontend). Work in the repo root on `main`.

Read `AGENTS.md` first — it defines the architecture, conventions, and recipes. The overall roadmap is `docs/1.0-release-plan.md`; this task is **Phase 1** of that plan.

Background: mod metadata comes from the official portal API (`mods.factorio.com/api`), but mod archives are downloaded from a third-party mirror (`mods-storage.re146.dev`) because official downloads require portal auth. Today the only integrity check is `verify_mod_zip_sync` in `downloader.rs`, which opens the downloaded zip and compares its internal `info.json` name/version against what was requested — a tampered file passes trivially. The official portal publishes a SHA1 hash per release; your job is to verify every download against it.

## Environment notes

- Windows dev machine. Shell is **cmd.exe** — no `grep`/`head`/`ls`; use `git grep`, `dir`.
- Gates: `cargo test --manifest-path src-tauri/Cargo.toml` (existing ~22 tests must stay green) and `pnpm build` (tsc type-check — run it if you touch `src/`). `dist/` is gitignored; if cargo complains about a missing `frontendDist`, run `pnpm build` first.

## Design decisions — already made, do not relitigate

1. Hash = SHA1 of the downloaded file, compared to the portal release's `sha1` field.
2. Hex comparison is case-insensitive (normalize both sides to lowercase).
3. Mismatch = **permanent** failure — no retry (the bytes won't change), delete the `.part` file, and the user-visible error string must contain "integrity check failed".
4. Missing or empty portal hash → log a `tracing::warn!` and proceed with the existing checks only. Never fail a download merely because metadata lacks the hash.
5. Hashing happens on the `.part` file after the download completes, **before** the final rename; blocking work goes through `tauri::async_runtime::spawn_blocking` (existing repo pattern).
6. Wire format stays camelCase; `sha1` is `Option<String>` end to end.

## Steps

### 0. Verify the upstream assumption FIRST

Fetch a real mod and confirm the field exists:

```
curl -s https://mods.factorio.com/api/mods/bottleneck
```

Confirm each object in `releases` carries a `sha1` (40-char lowercase hex). Record the finding in a code comment next to the new DTO field using the repo's `ASSUMPTION (...)` convention (see `index_client.rs` for examples). If no sha1-like field exists under any plausible name, **STOP and report** — do not build verification with no source of truth.

### 1. Types

- `src-tauri/src/models.rs` (~line 85): add `pub sha1: Option<String>` to `ModRelease` (struct already uses camelCase serde).
- `src-tauri/src/core/services/portal_client.rs`: add `#[serde(default)] pub sha1: Option<String>` to `PortalRelease` (~line 39) and carry it through `map_release` (~line 231).
- Check the mirror enrichment path (`mirror_client.rs`, `PortalWithMirrorDeps`): confirm the portal's per-release `sha1` survives the mirror dependency-enrichment of `ModDetails`. If that path rebuilds releases, carry the portal value through.
- `src/types.ts` (~line 76): add `sha1?: string | null` to the `ModRelease` interface so the frontend mirror of the wire types stays in sync. No UI display is required.

### 2. Queue plumbing

`DownloadQueue::enqueue` (`src-tauri/src/core/services/downloader.rs:79`) currently takes `(app, mods_dir, mod_name, version)`. Add `expected_sha1: Option<String>` and update **all three** call sites:

1. `src-tauri/src/commands/downloads.rs:19` — the install command. Preferred: accept the hash as an optional command argument from the frontend (the caller — `InstallModal` — already holds the picked release's `ModDetails`, so no extra fetch is needed). If you change the command's IPC surface, follow the five-step recipe in AGENTS.md: `models.rs` → service → thin command → `lib.rs` registration → typed wrapper in `src/lib/api.ts`.
2. `src-tauri/src/core/services/packs.rs:297` — pack activation downloads; pass the release's hash when the plan holds release info, `None` otherwise.
3. `src-tauri/src/lib.rs:115` — crash-recovery re-enqueue; pass `None` (existing checks still apply — this is the documented degradation path).

Keep each call site's churn minimal; commands stay thin per AGENTS.md.

### 3. Verification

In `downloader.rs`, add `fn verify_sha1_sync(path: &Path, expected: &str) -> Result<(), AppError>`: stream the file in chunks (mods can be tens of MB), hash with the `sha1` crate (add it to `src-tauri/Cargo.toml`), compare lowercase against `expected`. Call it immediately after `verify_mod_zip` succeeds (~line 340, inside `download_and_verify`), dispatched via `spawn_blocking` like its neighbor. Mismatch → `JobFail::Error("integrity check failed: sha1 mismatch for <mod> <version>", false)` — double-check `run_job`'s retry loop treats the second tuple field as the transient flag so this path does NOT retry, and that the failure branch deletes the `.part` file.

### 4. UI feedback

Failure text reaches `QueueDrawer` through the existing `download-updated` event — no new event, no new store. Just confirm the drawer renders the error string readably; adjust only if it truncates or genericizes errors.

### 5. Tests

Repo convention: `#[test]`s in the same file. `downloader.rs` has no tests module yet — create one.

- `verify_sha1_sync`: matching content passes; tampered content fails with "integrity check failed"; comparison is case-insensitive; an empty/absent expectation is a no-op (extract a small decision helper if that makes it testable).
- Prefer extracting pure, testable functions over heavy mocks. A live-server end-to-end test is explicitly not required.

### 6. Docs

- README, "A note on downloads": add one sentence stating archives are verified against the portal-published SHA1.
- `docs/1.0-release-plan.md`: tick the Phase 1 checkboxes you completed.

## Out of scope

Portal authentication or official downloads, mirror behavior changes, pack-format changes, any JavaScript test infrastructure, version bumps, CI changes, `productName`/identifier changes.

## Deliverable

- `cargo test` and `pnpm build` both green (report the actual results).
- A summary listing: files changed and why, the step-0 live-API finding (quote the relevant JSON fragment), test names added, and any deviation from this brief with your reasoning.
- Suggested commit message: `feat(downloader): verify downloads against portal-published sha1`.
