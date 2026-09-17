use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use crate::config::Config;
use crate::core::services::downloader::DownloadQueue;
use crate::core::services::index_client::IndexClient;
use crate::core::services::mod_store;
use crate::core::services::packs::PendingActivation;

/// Shared application state, managed by Tauri and injected into commands.
pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    /// Directory holding pack manifests (profiles/*.json).
    pub profiles_dir: PathBuf,
    pub index: Box<dyn IndexClient>,
    pub queue: Arc<DownloadQueue>,
    /// In-memory zip info.json cache for installed scans (mtime/len-validated).
    pub zip_cache: Arc<mod_store::ZipInfoCache>,
    /// In-flight pack activation awaiting its downloads (not persisted).
    pub pending_activation: Mutex<Option<PendingActivation>>,
    /// Serializes every path that rewrites mod-list.json as part of an
    /// activation: pack `activate`, `activate_vanilla`, and the deferred
    /// `finalize_now` (called from `maybe_finalize` when downloads land).
    ///
    /// Why: without it, a finalize running on `tauri::async_runtime` can
    /// overwrite a just-activated Vanilla state and re-persist the pack's
    /// `active_pack_id` over `"vanilla"`, and two rapid toggles can interleave
    /// their mod-list writes. This is a tokio (async) mutex because the
    /// finalize path is async and must wait without blocking a runtime
    /// worker. Invariant: Vanilla must *wait* for an in-flight finalize;
    /// clearing `pending_activation` is only correct for *queued* (not yet
    /// finalizing) activations, and only while holding this lock. Verified on
    /// the Phase 7 torture list ("pack switch and Vanilla clicked
    /// back-to-back").
    pub activation_lock: tokio::sync::Mutex<()>,
}
