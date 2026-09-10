use std::path::Path;

use tauri::{AppHandle, Emitter, State};

use crate::config::Config;
use crate::core::services::{game_detect, mod_store};
use crate::error::AppError;
use crate::models::{DetectedDir, DetectedGame, GameDirStatus};
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

/// The game Axial is using: the configured game_dir when set — even if it
/// went missing, so a broken setting surfaces instead of silently falling
/// back — otherwise the auto-detect chain.
#[tauri::command]
pub fn detect_game(state: State<AppState>) -> Option<DetectedGame> {
    let config = state.config.read().expect("config lock poisoned");
    if let Some(p) = config.game_dir.as_deref() {
        if !p.trim().is_empty() {
            return game_detect::inspect_install(Path::new(p), "custom");
        }
    }
    game_detect::detect()
}

/// Validate a candidate game directory for the Settings UI.
#[tauri::command]
pub fn validate_game_dir(path: String) -> GameDirStatus {
    game_detect::dir_status(Path::new(&path))
}
