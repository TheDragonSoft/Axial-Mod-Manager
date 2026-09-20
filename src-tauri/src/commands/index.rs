use tauri::State;

use crate::core::services::index_client::SortKey;
use crate::error::AppError;
use crate::models::{ChangelogEntry, IndexHealth, ModDetails, SearchResult};
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
    let start = std::time::Instant::now();
    let res = state.index.search(query.trim(), page, sort).await;
    let elapsed_ms = start.elapsed().as_millis();
    if let Ok(ref search_res) = res {
        tracing::info!(
            query = %query,
            page,
            results = search_res.results.len(),
            total = search_res.total_count,
            elapsed_ms,
            "search_mods completed"
        );
    }
    res
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

#[tauri::command]
pub async fn get_bulk_mod_details(
    state: State<'_, AppState>,
    names: Vec<String>,
) -> Result<Vec<ModDetails>, AppError> {
    let valid_names: Vec<String> = names
        .into_iter()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .collect();
    Ok(state.index.bulk_mod_details(&valid_names).await)
}

/// Diagnostics: proves the network layer works end-to-end from the UI.
#[tauri::command]
pub async fn index_health_check(state: State<'_, AppState>) -> Result<IndexHealth, AppError> {
    state.index.health_check().await
}

/// Changelog entries for a mod (portal HTML page, newest first). The UI
/// degrades to a muted "changelog unavailable" on error — no toast.
#[tauri::command]
pub async fn get_mod_changelog(
    state: State<'_, AppState>,
    name: String,
) -> Result<Vec<ChangelogEntry>, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::NotFound("mod name is empty".into()));
    }
    state.index.mod_changelog(name).await
}
