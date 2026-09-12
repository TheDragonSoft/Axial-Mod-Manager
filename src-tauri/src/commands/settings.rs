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
///
/// Async commands + spawn_blocking: sync Tauri commands run on the main
/// thread, and the settings save touches the disk.
#[tauri::command]
pub async fn set_settings(
    app: AppHandle,
    mut new_config: Config,
    state: State<'_, AppState>,
) -> Result<Config, AppError> {
    let (old_game_dir, cached_target_version) = {
        let cfg = state.config.read().expect("config lock poisoned");
        (cfg.game_dir.clone(), cfg.target_factorio_version.clone())
    };

    // Keep the cached target version; target_factorio_version is auto-detected.
    new_config.target_factorio_version = cached_target_version;

    // Whenever game_dir changes, detect version from data/base/info.json and persist.
    // Detection failure -> keep cached value.
    if new_config.game_dir != old_game_dir {
        let game_dir = new_config.game_dir.clone();
        let detected = tauri::async_runtime::spawn_blocking(move || {
            game_detect::detect_target_version(game_dir.as_deref())
        })
        .await
        .map_err(|e| AppError::Parse(format!("background task failed: {e}")))?;

        new_config.apply_detected_version(detected);
    }

    let to_save = new_config.clone();
    let path = state.config_path.clone();
    tauri::async_runtime::spawn_blocking(move || to_save.save(&path))
        .await
        .map_err(|e| AppError::Parse(format!("background task failed: {e}")))??;
    *state.config.write().expect("config lock poisoned") = new_config.clone();
    // Fire-and-forget: a dead/unreachable listener must not fail the save.
    let _ = app.emit("settings-changed", &new_config);
    Ok(new_config)
}

#[tauri::command]
pub async fn detect_mods_dir() -> Option<DetectedDir> {
    tauri::async_runtime::spawn_blocking(mod_store::detect)
        .await
        .unwrap_or(None)
}

/// The game Axial is using: the configured game_dir when set — even if it
/// went missing, so a broken setting surfaces instead of silently falling
/// back — otherwise the auto-detect chain.
///
/// Game detection walks Steam libraries / the registry / the game log, which
/// must not run on the main thread (it froze the Settings UI).
#[tauri::command]
pub async fn detect_game(state: State<'_, AppState>) -> Result<Option<DetectedGame>, AppError> {
    let configured = state
        .config
        .read()
        .expect("config lock poisoned")
        .game_dir
        .clone();
    let detected = tauri::async_runtime::spawn_blocking(move || {
        if let Some(p) = configured.as_deref() {
            if !p.trim().is_empty() {
                return game_detect::inspect_install(Path::new(p), "custom");
            }
        }
        game_detect::detect()
    })
    .await
    .map_err(|e| AppError::Parse(format!("background task failed: {e}")))?;
    Ok(detected)
}

/// Validate a candidate game directory for the Settings UI.
#[tauri::command]
pub async fn validate_game_dir(path: String) -> GameDirStatus {
    let fallback_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || game_detect::dir_status(Path::new(&path)))
        .await
        .unwrap_or_else(|_| {
            // Only reachable if the probe task panicked; re-run inline rather
            // than fabricating a status.
            game_detect::dir_status(Path::new(&fallback_path))
        })
}
