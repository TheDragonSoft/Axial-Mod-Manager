use std::path::PathBuf;
use std::sync::RwLock;

use crate::config::Config;

/// Shared application state, managed by Tauri and injected into commands.
pub struct AppState {
    /// In-memory settings, kept in sync with settings.json on disk.
    pub config: RwLock<Config>,
    /// Absolute path to settings.json inside the OS app-data directory.
    pub config_path: PathBuf,
}
