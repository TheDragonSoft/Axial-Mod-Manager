use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::config::Config;
use crate::core::services::downloader::DownloadQueue;
use crate::core::services::index_client::IndexClient;

/// Shared application state, managed by Tauri and injected into commands.
pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    pub index: Box<dyn IndexClient>,
    pub queue: Arc<DownloadQueue>,
}
