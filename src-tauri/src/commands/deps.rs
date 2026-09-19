use std::collections::HashMap;

use tauri::State;

use crate::core::services::{mod_store, portal_client::plausible_name, resolver};
use crate::error::AppError;
use crate::models::{InstalledMod, ResolutionPlan};
use crate::state::AppState;

#[tauri::command]
pub async fn resolve_install_plan(
    state: State<'_, AppState>,
    name: String,
    version: Option<String>,
) -> Result<ResolutionPlan, AppError> {
    let name = name.trim();
    if !plausible_name(name) {
        return Err(AppError::NotFound(format!("invalid mod name: {name:?}")));
    }

    let config = state.config.read().unwrap_or_else(|p| p.into_inner()).clone();
    let target = config.target_factorio_version.clone();
    let dir = mod_store::resolve_dir(&config)?;

    let cache = state.zip_cache.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&dir, &cache))
        .await
        .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;
    let installed: HashMap<String, InstalledMod> = snapshot
        .mods
        .into_iter()
        .map(|m| (m.name.clone(), m))
        .collect();

    let ctx = resolver::ResolveContext {
        index: &*state.index,
        installed: &installed,
        target: &target,
    };
    resolver::resolve(&ctx, name, version).await
}
