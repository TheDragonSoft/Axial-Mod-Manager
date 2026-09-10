use serde::Serialize;

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
