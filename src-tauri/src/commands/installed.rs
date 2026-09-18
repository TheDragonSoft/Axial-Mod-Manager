use tauri::{AppHandle, Emitter, State};

use crate::core::services::{mod_store, updates};
use crate::error::AppError;
use crate::models::{
    InstalledChangedPayload, InstalledChangedReason, InstalledSnapshot, ModsDirStatus,
    UninstallResult, UpdatesReport,
};
use crate::state::AppState;

#[tauri::command]
pub async fn validate_mods_dir(path: String) -> Result<ModsDirStatus, AppError> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::Config("mods directory path is empty".into()));
    }
    // dir_status probes writability with a scratch file — blocking IO.
    tauri::async_runtime::spawn_blocking(move || Ok(mod_store::dir_status(&trimmed)))
        .await
        .map_err(|e| AppError::Parse(format!("background task failed: {e}")))?
}

/// Heavy work (zip reads) runs on the blocking thread pool, served from the
/// zip info cache when nothing on disk changed.
#[tauri::command]
pub async fn list_installed(state: State<'_, AppState>) -> Result<InstalledSnapshot, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    let cache = state.zip_cache.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&dir, &cache))
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
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Config("mod name is empty".into()));
    }
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    // mod-list.json writes are blocking IO — keep them off the async runtime.
    tauri::async_runtime::spawn_blocking(move || mod_store::set_enabled(&dir, &name, enabled))
        .await
        .map_err(|e| AppError::Parse(format!("background task failed: {e}")))??;
    let _ = app.emit(
        "installed-changed",
        InstalledChangedPayload {
            reason: InstalledChangedReason::Axial,
        },
    );
    Ok(())
}

/// Returns the removed mod's name plus the installed dependents its removal
/// leaves broken (A2 impact — informational; the UI already showed it in the
/// confirm step and does not block).
#[tauri::command]
pub async fn uninstall_mod(
    app: AppHandle,
    state: State<'_, AppState>,
    file_name: String,
) -> Result<UninstallResult, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;

    // Zip reads/deletes are blocking IO — keep them off the async runtime.
    let name = {
        let dir = dir.clone();
        let file_name = file_name.clone();
        let cache = state.zip_cache.clone();
        tauri::async_runtime::spawn_blocking(move || mod_store::mod_name_of(&dir, &file_name, &cache))
            .await
            .map_err(|e| AppError::Parse(format!("background task failed: {e}")))?
    }?;
    if state.queue.is_busy(&name) {
        return Err(AppError::Config(format!(
            "{name} is currently downloading — cancel that download first"
        )));
    }

    let cache = state.zip_cache.clone();
    let result = tauri::async_runtime::spawn_blocking(
        move || -> Result<UninstallResult, AppError> {
            // Impact first: it needs a scan that still contains the mod.
            let dependents = mod_store::uninstall_impact(&dir, &file_name, &cache)?;
            let name = mod_store::uninstall(&dir, &file_name, &cache)?;
            Ok(UninstallResult { name, dependents })
        },
    )
    .await
    .map_err(|e| AppError::Parse(format!("background task failed: {e}")))??;

    let _ = app.emit(
        "installed-changed",
        InstalledChangedPayload {
            reason: InstalledChangedReason::Axial,
        },
    );
    Ok(result)
}

/// Dependents that would be left broken by removing `file_name`, for the
/// uninstall confirm step (fetched when the user first clicks Remove).
#[tauri::command]
pub async fn uninstall_impact(
    state: State<'_, AppState>,
    file_name: String,
) -> Result<Vec<String>, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    let cache = state.zip_cache.clone();
    tauri::async_runtime::spawn_blocking(move || mod_store::uninstall_impact(&dir, &file_name, &cache))
        .await
        .map_err(|e| AppError::Parse(format!("background task failed: {e}")))
}

/// Compare every installed mod against the newest target-compatible release.
#[tauri::command]
pub async fn check_updates(state: State<'_, AppState>) -> Result<UpdatesReport, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    let cache = state.zip_cache.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&dir, &cache))
        .await
        .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;
    Ok(updates::check(&*state.index, &snapshot, &config.target_factorio_version).await)
}
