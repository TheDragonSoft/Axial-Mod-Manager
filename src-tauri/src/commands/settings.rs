use tauri::State;

use crate::config::Config;
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Config, AppError> {
    Ok(state.config.read().expect("config lock poisoned").clone())
}

/// Persist first, then commit to memory — the two can never diverge.
#[tauri::command]
pub fn set_settings(new_config: Config, state: State<AppState>) -> Result<Config, AppError> {
    new_config.save(&state.config_path)?;
    *state.config.write().expect("config lock poisoned") = new_config;
    Ok(state.config.read().expect("config lock poisoned").clone())
}
