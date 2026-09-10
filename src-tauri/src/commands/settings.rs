use tauri::{AppHandle, Emitter, State};

use crate::config::Config;
use crate::core::services::mod_store;
use crate::error::AppError;
use crate::models::DetectedDir;
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Config, AppError> {
    Ok(state.config.read().expect("config lock poisoned").clone())
}

/// Persist first, then commit to memory, then notify the frontend.
/// The two stores can never diverge: if save fails, memory is untouched.
#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    new_config: Config,
    state: State<AppState>,
) -> Result<Config, AppError> {
    new_config.save(&state.config_path)?;
    *state.config.write().expect("config lock poisoned") = new_config.clone();
    // Fire-and-forget: a dead/unreachable listener must not fail the save.
    let _ = app.emit("settings-changed", &new_config);
    Ok(new_config)
}

#[tauri::command]
pub fn detect_mods_dir() -> Option<DetectedDir> {
    mod_store::detect()
}
