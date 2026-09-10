use crate::core::services::mod_store;
use crate::error::AppError;
use crate::models::ModsDirStatus;

/// Thin wrapper — all logic lives in core/services/mod_store.rs.
#[tauri::command]
pub async fn validate_mods_dir(path: String) -> Result<ModsDirStatus, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Config("mods directory path is empty".into()));
    }
    Ok(mod_store::dir_status(trimmed))
}
