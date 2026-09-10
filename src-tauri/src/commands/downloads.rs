use tauri::{AppHandle, State};

use crate::core::services::downloader::DownloadUpdate;
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
pub async fn enqueue_download(
    app: AppHandle,
    state: State<'_, AppState>,
    mod_name: String,
    version: String,
) -> Result<DownloadUpdate, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let mods_dir = crate::core::services::mod_store::resolve_dir(&config)?;
    state
        .queue
        .clone()
        .enqueue(app, mods_dir, mod_name, version)
        .await
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, id: u64) -> Result<(), AppError> {
    state.queue.cancel(id);
    Ok(())
}
