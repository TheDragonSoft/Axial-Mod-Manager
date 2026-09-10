use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Application settings, persisted as settings.json in the OS app-data dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    /// Explicit path to the Factorio mods directory. None = auto-detect.
    pub mods_dir: Option<String>,
    /// Explicit path to the Factorio installation (the folder containing
    /// data/). None = auto-detect. Used by game detection for the version.
    pub game_dir: Option<String>,
    /// Game version used for compatibility filtering ("2.0", "2.1", ...).
    pub target_factorio_version: String,
    /// File-log level: debug | info | warn | error.
    pub log_level: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            mods_dir: None,
            game_dir: None,
            target_factorio_version: "2.0".to_string(),
            log_level: "info".to_string(),
        }
    }
}

impl Config {
    /// Load config from disk. Missing file -> defaults (first launch).
    pub fn load(path: &Path) -> Result<Self, AppError> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(path).map_err(AppError::Io)?;
        serde_json::from_str(&raw).map_err(|e| AppError::Parse(format!("settings.json: {e}")))
    }

    /// Persist to disk atomically: write to a temp file, then rename over the target.
    pub fn save(&self, path: &Path) -> Result<(), AppError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(AppError::Io)?;
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Parse(format!("serialize settings: {e}")))?;
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, json).map_err(AppError::Io)?;
        fs::rename(&tmp, path).map_err(AppError::Io)?;
        Ok(())
    }
}
