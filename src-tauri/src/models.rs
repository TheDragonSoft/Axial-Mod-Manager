use serde::{Deserialize, Serialize};

// ---- Mods directory (Phase 3) ----

/// Result of platform auto-detection for the Factorio mods directory.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedDir {
    pub path: String,
    pub exists: bool,
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
pub struct ResolutionPlan {
    pub root_name: String,
    pub target: String,
    pub to_install: Vec<PlanEntry>,
    /// Already installed at suitable versions — will be left alone.
    pub satisfied: Vec<String>,
    /// Optional dependencies, informational; installable via checkboxes.
    pub optional: Vec<String>,
    /// Hard problems (incompatibilities, fetch failures) — confirm is blocked.
    pub conflicts: Vec<String>,
    /// Soft problems (constraint best-effort, unknown deps) — confirm allowed.
    pub warnings: Vec<String>,
}
