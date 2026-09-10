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
