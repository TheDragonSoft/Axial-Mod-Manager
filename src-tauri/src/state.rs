use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use crate::config::Config;
use crate::core::services::downloader::DownloadQueue;
use crate::core::services::index_client::IndexClient;
use crate::core::services::packs::PendingActivation;

/// Shared application state, managed by Tauri and injected into commands.
pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    /// Directory holding pack manifests (profiles/*.json).
    pub profiles_dir: PathBuf,
    pub index: Box<dyn IndexClient>,
    pub queue: Arc<DownloadQueue>,
    /// In-flight pack activation awaiting its downloads (not persisted).
    pub pending_activation: Mutex<Option<PendingActivation>>,
}
