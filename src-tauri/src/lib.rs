mod commands;
mod config;
mod core;
mod error;
mod models;
mod state;

use std::sync::RwLock;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let config_path = data_dir.join("settings.json");
            let config = config::Config::load(&config_path).unwrap_or_default();

            app.manage(AppState {
                config: RwLock::new(config),
                config_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::ping,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::settings::detect_mods_dir,
            commands::installed::validate_mods_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
