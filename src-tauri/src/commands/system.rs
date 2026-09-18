use tauri::State;

use crate::core::services::launcher;
use crate::error::AppError;
use crate::state::AppState;

/// Connectivity probe used by the frontend to verify the IPC bridge.
#[tauri::command]
pub fn ping(name: String) -> String {
    format!("pong, {name}")
}

/// Launch Factorio detached from the detected or configured installation.
#[tauri::command]
pub async fn launch_game(state: State<'_, AppState>) -> Result<(), AppError> {
    let config = state
        .config
        .read()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || launcher::launch(&config))
        .await
        .map_err(|e| AppError::Parse(format!("background task failed: {e}")))??;
    Ok(())
}
