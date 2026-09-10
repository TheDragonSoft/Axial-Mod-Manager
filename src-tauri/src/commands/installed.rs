use tauri::{AppHandle, Emitter, State};

use crate::core::services::mod_store;
use crate::error::AppError;
use crate::models::{InstalledSnapshot, ModsDirStatus};
use crate::state::AppState;

#[tauri::command]
pub async fn validate_mods_dir(path: String) -> Result<ModsDirStatus, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Config("mods directory path is empty".into()));
    }
    Ok(mod_store::dir_status(trimmed))
}

/// Heavy work (zip reads) runs on the blocking thread pool.
#[tauri::command]
pub async fn list_installed(state: State<'_, AppState>) -> Result<InstalledSnapshot, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    let snapshot = tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&dir))
        .await
        .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn toggle_mod(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<(), AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Config("mod name is empty".into()));
    }
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    mod_store::set_enabled(&dir, name, enabled)?;
    let _ = app.emit("installed-changed", ());
    Ok(())
}

/// Returns the removed mod's name on success.
#[tauri::command]
pub async fn uninstall_mod(
    app: AppHandle,
    state: State<'_, AppState>,
    file_name: String,
) -> Result<String, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;

    let name = mod_store::mod_name_of(&dir, &file_name)?;
    if state.queue.is_busy(&name) {
        return Err(AppError::Config(format!(
            "{name} is currently downloading — cancel that download first"
        )));
    }
    mod_store::uninstall(&dir, &file_name)?;
    let _ = app.emit("installed-changed", ());
    Ok(name)
}
