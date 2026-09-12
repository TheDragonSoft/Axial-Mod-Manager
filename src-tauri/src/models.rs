use serde::{Deserialize, Serialize};

// ---- Mods directory (Phase 3) ----

/// Result of platform auto-detection for the Factorio mods directory.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedDir {
    pub path: String,
    pub exists: bool,
}

/// A detected local Factorio installation, consumed by the Settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    /// Directory containing data/ (on macOS the .app bundle's Contents/).
    pub install_dir: String,
    /// Game executable, when found under the install dir.
    pub exe_path: Option<String>,
    /// Full game version from data/base/info.json (e.g. "2.0.28").
    pub version: Option<String>,
    /// major.minor of `version` — the shape used for compat filtering.
    pub target_version: Option<String>,
    /// Portable installs keep their mods inside the game dir; set when it exists.
    pub portable_mods_dir: Option<String>,
    /// Where the install was found: steam | gog | standalone | game-log | custom.
    pub source: String,
}

/// Facts about a candidate game directory, consumed by the Settings UI.
/// `game` is present only when the directory is a real Factorio install.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDirStatus {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub game: Option<DetectedGame>,
}

/// Facts about a candidate mods directory, consumed by the Settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsDirStatus {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub writable: bool,
    /// If missing: can it be created? (i.e. nearest existing ancestor is writable)
    pub creatable: bool,
    /// Number of .zip files currently in the directory (0 if it doesn't exist yet).
    pub zip_count: u32,
    /// True if mod-list.json is present — strong signal this is a real Factorio mods dir.
    pub has_mod_list: bool,
}

// ---- Index (Phase 4) ----
// These shapes are the PUBLIC CONTRACT consumed by commands and the frontend.
// The re146 adapter (4B) parses raw HTML/JSON into them; nothing downstream
// ever sees upstream formats.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModSummary {
    pub name: String,
    pub title: String,
    pub downloads: u64,
    pub latest_version: String,
    pub factorio_version: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub results: Vec<ModSummary>,
    pub page: u32,
    pub page_count: u32,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModRelease {
    pub version: String,
    pub factorio_version: String,
    pub released_at: Option<String>,
    pub downloads_count: Option<u64>,
    pub file_size: Option<u64>,
    /// SHA1 of the release zip as published by the official portal; used by the
    /// downloader to verify mirror downloads. None = not published (verify
    /// degrades to the zip-structure check).
    #[serde(default)]
    pub sha1: Option<String>,
    /// Dependency strings from this release's own info.json (community-mirror
    /// enrichment; the official API no longer publishes them). Empty = unknown.
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetails {
    pub name: String,
    pub title: String,
    pub owner: Option<String>,
    pub summary: String,
    pub downloads: Option<u64>,
    pub dependencies: Vec<String>,
    pub releases: Vec<ModRelease>,
    /// Absolute URL of the portal thumbnail; None when the mod has none.
    pub thumbnail: Option<String>,
}

/// Result of the network-layer diagnostics probe (Phase 4A).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexHealth {
    pub url: String,
    pub ok: bool,
    pub http_status: Option<u16>,
    pub byte_length: usize,
    pub excerpt: String,
}

// ---- Installed mods (Phase 6) ----

/// One zip in the mods folder. `name`/`version` come from the zip's own
/// info.json (authoritative); `problem` flags unreadable or duplicate files.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub file_name: String,
    pub name: String,
    pub version: String,
    pub factorio_version: String,
    pub enabled: bool,
    /// Raw dependency strings ("mod >= 1.2.0", "? opt", "(!) bad") — parsed in Phase 7.
    pub dependencies: Vec<String>,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSnapshot {
    pub mods_dir: String,
    pub mod_list_exists: bool,
    pub mods: Vec<InstalledMod>,
}

// ---- Dependency resolution (Phase 7) ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntry {
    pub name: String,
    pub title: String,
    pub version: String,
    pub factorio_version: String,
    /// "" for the root mod (the one you asked for); parent mod name otherwise.
    pub required_by: String,
    /// False when no dependency info was available (⚠ in the UI).
    pub deps_known: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSatisfied {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolutionPlan {
    pub root_name: String,
    pub target: String,
    pub to_install: Vec<PlanEntry>,
    /// Already installed at suitable versions — will be left alone.
    pub satisfied: Vec<PlanSatisfied>,
    /// Optional dependencies, informational; installable via checkboxes.
    pub optional: Vec<String>,
    /// Hard problems (incompatibilities, fetch failures) — confirm is blocked.
    pub conflicts: Vec<String>,
    /// Soft problems (constraint best-effort, unknown deps) — confirm allowed.
    pub warnings: Vec<String>,
}

// ---- Mod packs (Phase 8) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackMod {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub mods: Vec<PackMod>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackMeta {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub mod_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPlanItem {
    pub name: String,
    pub version: String,
}

/// Result of activating a pack — consumed by the UI summary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationDiff {
    pub pack_id: String,
    pub pack_name: String,
    pub to_enable: Vec<String>,
    pub to_disable: Vec<String>,
    pub to_download: Vec<DownloadPlanItem>,
    pub errors: Vec<String>,
}

/// Payload of the "pack-activated" event (fired when every download landed).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackActivatedPayload {
    pub pack_id: String,
    pub pack_name: String,
    /// Enabled pack mods still absent from disk (failed downloads).
    pub missing: Vec<String>,
}

// ---- Update detection (Phase 9) ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub name: String,
    pub installed_version: String,
    pub available_version: String,
    pub factorio_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatesReport {
    pub target: String,
    pub updates: Vec<UpdateInfo>,
    pub up_to_date: Vec<String>,
    /// (mod name, reason) — details fetch failed or no target-compatible release.
    pub errors: Vec<(String, String)>,
}


