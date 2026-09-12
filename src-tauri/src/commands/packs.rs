use tauri::{AppHandle, State};

use crate::core::services::{mod_store, packs};
use crate::error::AppError;
use crate::models::{ActivationDiff, Pack, PackMeta, PackMod};
use crate::state::AppState;

#[tauri::command]
pub async fn list_packs(state: State<'_, AppState>) -> Result<Vec<PackMeta>, AppError> {
    Ok(packs::list_packs(&state.profiles_dir))
}

#[tauri::command]
pub async fn get_pack(state: State<'_, AppState>, id: String) -> Result<Pack, AppError> {
    packs::load_pack(&state.profiles_dir, &id)
}

#[tauri::command]
pub async fn create_pack_from_installed(
    state: State<'_, AppState>,
    name: String,
) -> Result<Pack, AppError> {
    let config = state.config.read().expect("config lock poisoned").clone();
    let dir = mod_store::resolve_dir(&config)?;
    let cache = state.zip_cache.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&dir, &cache))
        .await
        .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;
    let mods = snapshot
        .mods
        .into_iter()
        .filter(|m| m.name != "base")
        .map(|m| PackMod {
            name: m.name,
            version: m.version,
            enabled: m.enabled,
        })
        .collect();
    packs::create_pack(&state.profiles_dir, &name, mods)
}

#[tauri::command]
pub async fn create_pack_from_mods(
    state: State<'_, AppState>,
    name: String,
    mods: Vec<PackMod>,
) -> Result<Pack, AppError> {
    packs::create_pack(&state.profiles_dir, &name, mods)
}

#[tauri::command]
pub async fn delete_pack(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    packs::delete_pack(&state.profiles_dir, &id)
}

#[tauri::command]
pub async fn import_pack(state: State<'_, AppState>, json: String) -> Result<Pack, AppError> {
    packs::import_pack(&state.profiles_dir, &json)
}

#[tauri::command]
pub async fn export_pack(state: State<'_, AppState>, id: String) -> Result<String, AppError> {
    packs::export_pack(&state.profiles_dir, &id)
}

#[tauri::command]
pub async fn activate_pack(app: AppHandle, id: String) -> Result<ActivationDiff, AppError> {
    packs::activate(&app, &id).await
}

#[tauri::command]
pub async fn activate_vanilla(app: AppHandle) -> Result<(), AppError> {
    packs::activate_vanilla(&app).await
}
