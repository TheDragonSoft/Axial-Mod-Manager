use tauri::State;

use crate::core::services::index_client::SortKey;
use crate::error::AppError;
use crate::models::{IndexHealth, ModDetails, SearchResult};
use crate::state::AppState;

#[tauri::command]
pub async fn search_mods(
    state: State<'_, AppState>,
    query: String,
    page: Option<u32>,
    sort: Option<String>,
) -> Result<SearchResult, AppError> {
    let page = page.unwrap_or(1).max(1);
    let sort = SortKey::parse(sort.as_deref());
    state.index.search(query.trim(), page, sort).await
}

#[tauri::command]
pub async fn get_mod_details(
    state: State<'_, AppState>,
    name: String,
) -> Result<ModDetails, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::NotFound("mod name is empty".into()));
    }
    state.index.mod_details(name).await
}

/// Diagnostics: proves the network layer works end-to-end from the UI.
#[tauri::command]
pub async fn index_health_check(state: State<'_, AppState>) -> Result<IndexHealth, AppError> {
    state.index.health_check().await
}
