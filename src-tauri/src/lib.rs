mod commands;
mod config;
mod core;
mod error;
mod models;
mod state;

use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

use tauri::Manager;

use core::services::downloader::DownloadQueue;
use core::services::index_client::USER_AGENT;
use core::services::mirror_client::{MirrorClient, PortalWithMirrorDeps};
use core::services::portal_client::PortalClient;
use state::AppState;

/// File logging to <app-data>/logs/axial.log with a single 5 MB rotation.
fn init_logging(data_dir: &Path, level: &str) {
    let dir = data_dir.join("logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return; // no usable data dir — run without file logging
    }
    let log_path = dir.join("axial.log");
    if let Ok(meta) = std::fs::metadata(&log_path) {
        if meta.len() > 5 * 1024 * 1024 {
            let _ = std::fs::rename(&log_path, dir.join("axial.log.1"));
        }
    }
    let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    else {
        return;
    };
    let max_level = match level.to_lowercase().as_str() {
        "debug" => tracing::Level::DEBUG,
        "warn" => tracing::Level::WARN,
        "error" => tracing::Level::ERROR,
        _ => tracing::Level::INFO,
    };
    let _ = tracing_subscriber::fmt()
        .with_ansi(false)
        .with_max_level(max_level)
        .with_writer(Mutex::new(file))
        .try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let config_path = data_dir.join("settings.json");
            let is_first_run = !config_path.exists();
            let mut config = config::Config::load(&config_path).unwrap_or_default();

            init_logging(&data_dir, &config.log_level);

            // Auto-detect target Factorio version from data/base/info.json.
            // On detection success: update and persist cache.
            // On detection failure: keep cached value (or "2.0" default on true first run).
            let detected = core::services::game_detect::detect_target_version(config.game_dir.as_deref());
            let version_changed = config.apply_detected_version(detected);
            if version_changed || (is_first_run && config_path.parent().is_some()) {
                if let Err(e) = config.save(&config_path) {
                    tracing::warn!("failed to persist settings on startup: {e}");
                }
            }

            tracing::info!(
                "starting — target game {}, mods dir {:?}, log level {}",
                config.target_factorio_version,
                config.mods_dir,
                config.log_level
            );

            let profiles_dir = data_dir.join("profiles");
            std::fs::create_dir_all(&profiles_dir)?;

            let http = reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .build()?;
            let index = PortalWithMirrorDeps::new(
                Box::new(PortalClient::new(http.clone())),
                MirrorClient::new(http.clone()),
            );

            app.manage(AppState {
                config: RwLock::new(config),
                config_path,
                profiles_dir,
                index: Box::new(index),
                queue: Arc::new(DownloadQueue::new(http)),
                zip_cache: Arc::new(core::services::mod_store::ZipInfoCache::new()),
                pending_activation: std::sync::Mutex::new(None),
            });

            // Crash recovery: re-enqueue downloads interrupted by a previous
            // session (*.part leftovers — cancelled jobs clean up after
            // themselves, so only genuinely interrupted files remain).
            let handle = app.handle().clone();
            let queue = handle.state::<AppState>().queue.clone();
            let startup_config = handle
                .state::<AppState>()
                .config
                .read()
                .expect("config lock poisoned")
                .clone();
            tauri::async_runtime::spawn(async move {
                let Ok(mods_dir) = core::services::mod_store::resolve_dir(&startup_config) else {
                    return;
                };
                let Ok(entries) = std::fs::read_dir(&mods_dir) else { return };
                for entry in entries.flatten() {
                    let fname = entry.file_name().to_string_lossy().into_owned();
                    let Some(stem) = fname.strip_suffix(".zip.part") else { continue };
                    let Some((name, version)) = stem.rsplit_once('_') else { continue };
                    if name.is_empty() || version.is_empty() {
                        continue;
                    }
                    // No release details at recovery time — the re-downloaded
                    // file gets the zip-structure check only.
                    match queue
                        .clone()
                        .enqueue(handle.clone(), mods_dir.clone(), name.to_string(), version.to_string(), None)
                        .await
                    {
                        Ok(_) => tracing::info!("re-enqueued interrupted download: {name} {version}"),
                        Err(e) => tracing::warn!("could not re-enqueue {name} {version}: {e}"),
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::ping,
            commands::system::launch_game,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::settings::detect_mods_dir,
            commands::settings::detect_game,
            commands::settings::validate_game_dir,
            commands::installed::validate_mods_dir,
            commands::installed::list_installed,
            commands::installed::toggle_mod,
            commands::installed::uninstall_mod,
            commands::installed::check_updates,
            commands::index::search_mods,
            commands::index::get_mod_details,
            commands::index::index_health_check,
            commands::downloads::enqueue_download,
            commands::downloads::cancel_download,
            commands::deps::resolve_install_plan,
            commands::packs::list_packs,
            commands::packs::get_pack,
            commands::packs::create_pack_from_installed,
            commands::packs::create_pack_from_mods,
            commands::packs::delete_pack,
            commands::packs::import_pack,
            commands::packs::export_pack,
            commands::packs::activate_pack,
            commands::packs::activate_vanilla,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
