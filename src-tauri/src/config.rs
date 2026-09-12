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
    /// Acts as a cache of the last detection; updated on startup and whenever
    /// game_dir changes.
    pub target_factorio_version: String,
    /// File-log level: debug | info | warn | error.
    pub log_level: String,
    /// ID of the currently active pack (`"vanilla"` for the built-in Vanilla
    /// pseudo-pack). `None` means no pack has been explicitly activated yet.
    pub active_pack_id: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            mods_dir: None,
            game_dir: None,
            target_factorio_version: "2.0".to_string(),
            log_level: "info".to_string(),
            active_pack_id: None,
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

    /// Update `target_factorio_version` from an optional detected version.
    ///
    /// If `detected` is `Some`, `target_factorio_version` is updated.
    /// If `detected` is `None` (detection failed), the current cached value is preserved
    /// (the "2.0" default applies only on a true first run).
    ///
    /// Returns `true` if `target_factorio_version` changed to a new value.
    pub fn apply_detected_version(&mut self, detected: Option<String>) -> bool {
        if let Some(d) = detected {
            if self.target_factorio_version != d {
                self.target_factorio_version = d;
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_cached_version_when_detection_fails() {
        let mut config = Config {
            target_factorio_version: "1.1".to_string(),
            ..Config::default()
        };
        let changed = config.apply_detected_version(None);
        assert!(!changed);
        assert_eq!(config.target_factorio_version, "1.1");
    }

    #[test]
    fn updates_cached_version_when_detection_succeeds() {
        let mut config = Config::default();
        assert_eq!(config.target_factorio_version, "2.0");
        let changed = config.apply_detected_version(Some("1.1".to_string()));
        assert!(changed);
        assert_eq!(config.target_factorio_version, "1.1");
    }

    #[test]
    fn ignores_identical_detected_version() {
        let mut config = Config::default();
        let changed = config.apply_detected_version(Some("2.0".to_string()));
        assert!(!changed);
        assert_eq!(config.target_factorio_version, "2.0");
    }

    #[test]
    fn default_target_version_is_2_0() {
        let config = Config::default();
        assert_eq!(config.target_factorio_version, "2.0");
    }
}

