use std::path::PathBuf;
use std::sync::RwLock;

use crate::config::Config;
use crate::core::services::index_client::IndexClient;

/// Shared application state, managed by Tauri and injected into commands.
pub struct AppState {
    /// In-memory settings, kept in sync with settings.json on disk.
    pub config: RwLock<Config>,
    /// Absolute path to settings.json inside the OS app-data directory.
    pub config_path: PathBuf,
    /// Index backend (trait object — swappable without touching commands).
    pub index: Box<dyn IndexClient>,
}
