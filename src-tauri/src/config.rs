use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

fn default_true() -> bool {
    true
}

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
    /// Whether to check for application updates on startup.
    #[serde(default = "default_true")]
    pub check_for_updates: bool,
    /// Last dismissed update version (e.g. "0.3.0"). When set, updates to this
    /// specific version are suppressed in the UI until a newer version appears.
    #[serde(default)]
    pub dismissed_update_version: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            mods_dir: None,
            game_dir: None,
            target_factorio_version: "2.0".to_string(),
            log_level: "info".to_string(),
            active_pack_id: None,
            check_for_updates: true,
            dismissed_update_version: None,
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

    #[test]
    fn default_config_has_updater_enabled() {
        let config = Config::default();
        assert!(config.check_for_updates);
        assert_eq!(config.dismissed_update_version, None);
    }

    #[test]
    fn deserializes_missing_updater_fields_with_defaults() {
        let json = r#"{"targetFactorioVersion": "2.0", "logLevel": "info"}"#;
        let config: Config = serde_json::from_str(json).expect("parse config");
        assert!(config.check_for_updates);
        assert_eq!(config.dismissed_update_version, None);
    }

    #[test]
    fn deserializes_and_preserves_updater_fields() {
        let json = r#"{
            "targetFactorioVersion": "2.0",
            "logLevel": "info",
            "checkForUpdates": false,
            "dismissedUpdateVersion": "0.3.0"
        }"#;
        let config: Config = serde_json::from_str(json).expect("parse config");
        assert!(!config.check_for_updates);
        assert_eq!(config.dismissed_update_version.as_deref(), Some("0.3.0"));
    }

    #[test]
    fn updater_public_key_and_signature_verification() {
        use base64::Engine;
        let pubkey_base64 = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4MEY4MUFCQkM5ODFENkUKUldSdUhaaThxNEVQYUMzWnBsUXhIOTlrZ1JiblJsaWhoMXJkZVhtR1k3bXlCWTdzTzBlTm5mK2IK";
        let pubkey_bytes = base64::engine::general_purpose::STANDARD
            .decode(pubkey_base64)
            .expect("decode pubkey base64");
        let pubkey_str = std::str::from_utf8(&pubkey_bytes).expect("valid utf8");
        let public_key = minisign_verify::PublicKey::decode(pubkey_str).expect("valid minisign public key");

        let signature_base64 = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSdUhaaThxNEVQYUFoMWxMemZFUTZKbkF5M3RhRTFIUTEwcy9kblp5MG9PK2ExRUovQldZY0p0a1pyUkMxZm5iS3Uvc05sMkJKTEw4K2xiUXJlaFNsendVN1lVNVpQY0FFPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg5MjA5MDU1CWZpbGU6YXhpYWwtdGVzdC11cGRhdGUuZXhlCnBKN3NvaFc4ckhxZDNEYXgvdkR6dUVIRTRwVm5Ja2NvbGVCYkRHRGkwUVZ4K0prbWUwSUFvYzluekRvdmtVbjNZTUFWZEV5ZlY3SkVCcDc2d0d4OUFBPT0K";
        let signature_bytes = base64::engine::general_purpose::STANDARD
            .decode(signature_base64)
            .expect("decode signature base64");
        let signature_str = std::str::from_utf8(&signature_bytes).expect("valid utf8");
        let signature = minisign_verify::Signature::decode(signature_str).expect("valid minisign signature");

        let data = b"dummy-update-payload-content\r\n";
        public_key.verify(data, &signature, false).expect("signature verified successfully");

        // Tampered payload fails verification
        let tampered = b"tampered-update-payload-content";
        assert!(public_key.verify(tampered, &signature, false).is_err());
    }
}

