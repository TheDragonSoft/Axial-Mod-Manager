//! Mod packs: portable manifests + activation (target-state reconciliation).

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::core::services::downloader::plausible_version;
use crate::core::services::mod_store;
use crate::core::services::portal_client::plausible_name;
use crate::error::AppError;
use crate::models::{
    ActivationDiff, DownloadPlanItem, Pack, PackActivatedPayload, PackMeta, PackMod,
};
use crate::state::AppState;

#[allow(dead_code)]
pub const EXPORT_FORMAT: &str = "axial-pack/1";

/// Set while a pack activation is waiting for its downloads to land.
#[derive(Debug)]
pub struct PendingActivation {
    pub pack_id: String,
    /// Pack mod names whose download is still in flight.
    pub remaining: HashSet<String>,
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        && !id.contains("..")
}

fn pack_path(profiles_dir: &Path, id: &str) -> PathBuf {
    profiles_dir.join(format!("{id}.json"))
}

fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("pack-{nanos:032x}")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn sanitize_name(name: &str) -> Result<String, AppError> {
    let t = name.trim();
    if t.is_empty() || t.len() > 100 {
        return Err(AppError::Config(
            "pack name must be 1–100 characters".into(),
        ));
    }
    Ok(t.to_string())
}

/// Validate + normalize the mod list of a new pack: plausible names/versions,
/// no duplicates, `base` filtered out.
pub fn validate_mods(mods: Vec<PackMod>) -> Result<Vec<PackMod>, AppError> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for mut m in mods {
        if m.name == "base" {
            continue;
        }
        m.name = m.name.trim().to_string();
        m.version = m.version.trim().to_string();
        if !plausible_name(&m.name) {
            return Err(AppError::Config(format!("invalid mod name: {:?}", m.name)));
        }
        if !plausible_version(&m.version) {
            return Err(AppError::Config(format!(
                "invalid version {:?} for mod {}",
                m.version, m.name
            )));
        }
        if !seen.insert(m.name.clone()) {
            return Err(AppError::Config(format!(
                "duplicate mod {} in pack",
                m.name
            )));
        }
        out.push(m);
    }
    if out.is_empty() {
        return Err(AppError::Config("pack has no mods".into()));
    }
    Ok(out)
}

pub fn load_pack(profiles_dir: &Path, id: &str) -> Result<Pack, AppError> {
    if !valid_id(id) {
        return Err(AppError::NotFound(format!("invalid pack id {id:?}")));
    }
    let raw = fs::read_to_string(pack_path(profiles_dir, id))
        .map_err(|_| AppError::NotFound(format!("pack {id} not found")))?;
    serde_json::from_str(&raw).map_err(|e| AppError::Parse(format!("pack file {id}: {e}")))
}

pub fn save_pack(profiles_dir: &Path, pack: &Pack) -> Result<(), AppError> {
    fs::create_dir_all(profiles_dir)?;
    let json = serde_json::to_string_pretty(pack)
        .map_err(|e| AppError::Parse(format!("serialize pack: {e}")))?;
    let target = pack_path(profiles_dir, &pack.id);
    let tmp = target.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

pub fn list_packs(profiles_dir: &Path) -> Vec<PackMeta> {
    let mut packs: Vec<PackMeta> = Vec::new();
    let Ok(entries) = fs::read_dir(profiles_dir) else {
        return packs;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_json = path
            .extension()
            .map(|x| x.eq_ignore_ascii_case("json"))
            .unwrap_or(false);
        if !is_json || !path.is_file() {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(p) = serde_json::from_str::<Pack>(&raw) {
            packs.push(PackMeta {
                mod_count: p.mods.len() as u32,
                id: p.id,
                name: p.name,
                created_at: p.created_at,
            });
        }
    }
    packs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    packs
}

pub fn delete_pack(profiles_dir: &Path, id: &str) -> Result<(), AppError> {
    if !valid_id(id) {
        return Err(AppError::NotFound(format!("invalid pack id {id:?}")));
    }
    let path = pack_path(profiles_dir, id);
    if !path.is_file() {
        return Err(AppError::NotFound(format!("pack {id} not found")));
    }
    fs::remove_file(&path)?;
    Ok(())
}

pub fn create_pack(profiles_dir: &Path, name: &str, mods: Vec<PackMod>) -> Result<Pack, AppError> {
    let name = sanitize_name(name)?;
    let mods = validate_mods(mods)?;
    let pack = Pack {
        id: new_id(),
        name,
        created_at: now_secs(),
        mods,
    };
    save_pack(profiles_dir, &pack)?;
    Ok(pack)
}

/// Import a shared/exported manifest. `format` and `createdAt` are accepted
/// for compatibility; a fresh id/timestamp is always generated.
pub fn import_pack(profiles_dir: &Path, json: &str) -> Result<Pack, AppError> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Imported {
        name: String,
        #[serde(default)]
        mods: Vec<PackMod>,
        #[allow(dead_code)]
        format: Option<String>,
        #[allow(dead_code)]
        created_at: Option<u64>,
    }
    let imp: Imported = serde_json::from_str(json)
        .map_err(|e| AppError::Parse(format!("pack manifest: {e}")))?;
    create_pack(profiles_dir, &imp.name, imp.mods)
}

pub fn export_pack(profiles_dir: &Path, id: &str) -> Result<String, AppError> {
    let pack = load_pack(profiles_dir, id)?;
    serde_json::to_string_pretty(&pack)
        .map_err(|e| AppError::Parse(format!("serialize pack: {e}")))
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/// Pure: the desired mod-list entries for a pack against the mod names
/// currently on disk. `base` first and always enabled; pack mods enabled only
/// if marked enabled AND present; everything else on disk disabled (never
/// deleted).
pub fn compose_entries(
    pack_mods: &[PackMod],
    disk_names: &HashSet<String>,
) -> Vec<(String, bool)> {
    let mut entries: Vec<(String, bool)> = vec![("base".to_string(), true)];
    let mut pack_names: HashSet<String> = HashSet::new();
    for m in pack_mods {
        if m.name == "base" {
            continue;
        }
        pack_names.insert(m.name.clone());
        entries.push((m.name.clone(), m.enabled && disk_names.contains(&m.name)));
    }
    let mut extras: Vec<&String> = disk_names
        .iter()
        .filter(|n| **n != "base" && !pack_names.contains(*n))
        .collect();
    extras.sort();
    for n in extras {
        entries.push((n.clone(), false));
    }
    entries
}

/// Activate a pack: download what's missing, rewrite mod-list.json to the
/// pack's target state, and finalize (enable everything + emit
/// `pack-activated`) once all downloads complete.
pub async fn activate(app: &AppHandle, pack_id: &str) -> Result<ActivationDiff, AppError> {
    let state = app.state::<AppState>();
    let (config, profiles_dir) = {
        let s = state.inner();
        (
            s.config.read().expect("config lock poisoned").clone(),
            s.profiles_dir.clone(),
        )
    };
    let pack = load_pack(&profiles_dir, pack_id)?;
    let mods_dir = mod_store::resolve_dir(&config)?;

    let scan_dir = mods_dir.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&scan_dir))
        .await
        .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;

    let disk_names: HashSet<String> = snapshot.mods.iter().map(|m| m.name.clone()).collect();
    let disk_versions: HashMap<String, String> = snapshot
        .mods
        .iter()
        .map(|m| (m.name.clone(), m.version.clone()))
        .collect();

    let mut diff = ActivationDiff {
        pack_id: pack.id.clone(),
        pack_name: pack.name.clone(),
        to_enable: vec![],
        to_disable: vec![],
        to_download: vec![],
        errors: vec![],
    };
    let mut remaining: HashSet<String> = HashSet::new();

    for m in &pack.mods {
        if m.name == "base" {
            continue;
        }
        if !m.enabled {
            diff.to_disable.push(m.name.clone());
            continue;
        }
        match disk_versions.get(&m.name) {
            Some(v) if v == &m.version => diff.to_enable.push(m.name.clone()),
            _ => {
                if state.queue.is_busy(&m.name) {
                    diff.errors.push(format!(
                        "{} is already downloading — wait for it to finish, then activate again",
                        m.name
                    ));
                    continue;
                }
                match state
                    .queue
                    .clone()
                    .enqueue(app.clone(), mods_dir.clone(), m.name.clone(), m.version.clone())
                    .await
                {
                    Ok(_) => {
                        remaining.insert(m.name.clone());
                        diff.to_download.push(DownloadPlanItem {
                            name: m.name.clone(),
                            version: m.version.clone(),
                        });
                    }
                    Err(e) => diff.errors.push(format!("{}: {}", m.name, e)),
                }
            }
        }
    }

    // Immediate target-state write: present pack mods on, everything else off.
    mod_store::replace_mod_list(&mods_dir, &compose_entries(&pack.mods, &disk_names))?;

    if remaining.is_empty() {
        let missing = pack
            .mods
            .iter()
            .filter(|m| m.enabled && m.name != "base" && !disk_names.contains(&m.name))
            .map(|m| m.name.clone())
            .collect();
        let _ = app.emit(
            "pack-activated",
            &PackActivatedPayload {
                pack_id: pack.id.clone(),
                pack_name: pack.name.clone(),
                missing,
            },
        );
    } else {
        *state.pending_activation.lock().expect("pack lock poisoned") = Some(PendingActivation {
            pack_id: pack.id,
            remaining,
        });
    }

    tracing::info!(
        pack = %diff.pack_name,
        enabled = diff.to_enable.len(),
        disabled = diff.to_disable.len(),
        downloads = diff.to_download.len(),
        errors = diff.errors.len(),
        "pack activation applied"
    );

    let _ = app.emit("installed-changed", ());
    Ok(diff)
}

/// Called by the downloader when a zip lands. If it was the last outstanding
/// download of a pending activation, rewrite mod-list.json fully enabled and
/// announce the pack. Best-effort: errors are swallowed (the user can always
/// re-activate).
pub async fn maybe_finalize(app: &AppHandle, downloaded_mod: &str) {
    let state = app.state::<AppState>();
    let pack_id = {
        let mut guard = match state.pending_activation.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        match guard.as_mut() {
            Some(p) => {
                p.remaining.remove(downloaded_mod);
                if p.remaining.is_empty() {
                    Some(p.pack_id.clone())
                } else {
                    None
                }
            }
            None => None,
        }
    };
    let Some(pack_id) = pack_id else { return };

    let result = finalize_now(app, &pack_id).await;

    // Clear pending only if it's still this pack (a newer activation may
    // have replaced it while we were working).
    let state = app.state::<AppState>();
    let mut guard = match state.pending_activation.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    if guard.as_ref().map(|p| p.pack_id.as_str()) == Some(pack_id.as_str()) {
        *guard = None;
    }

    match result {
        Ok(()) => tracing::info!(%pack_id, "pack fully finalized"),
        Err(e) => {
            tracing::error!(%pack_id, "pack finalize failed: {e}");
            let _ = app.emit(
                "pack-activated",
                &PackActivatedPayload {
                    pack_id,
                    pack_name: format!("<finalize failed: {e}>"),
                    missing: vec![],
                },
            );
        }
    }
}

async fn finalize_now(app: &AppHandle, pack_id: &str) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let (config, profiles_dir) = {
        let s = state.inner();
        (
            s.config.read().expect("config lock poisoned").clone(),
            s.profiles_dir.clone(),
        )
    };
    let pack = load_pack(&profiles_dir, pack_id)?;
    let scan_dir = mod_store::resolve_dir(&config)?;
    let snapshot =
        tauri::async_runtime::spawn_blocking(move || mod_store::scan_installed(&scan_dir))
            .await
            .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;
    let disk_names: HashSet<String> = snapshot.mods.iter().map(|m| m.name.clone()).collect();

    mod_store::replace_mod_list(
        mod_store::resolve_dir(&config)?.as_path(),
        &compose_entries(&pack.mods, &disk_names),
    )?;

    let missing = pack
        .mods
        .iter()
        .filter(|m| m.enabled && m.name != "base" && !disk_names.contains(&m.name))
        .map(|m| m.name.clone())
        .collect();
    let _ = app.emit(
        "pack-activated",
        &PackActivatedPayload {
            pack_id: pack.id,
            pack_name: pack.name,
            missing,
        },
    );
    let _ = app.emit("installed-changed", ());
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn pm(name: &str, version: &str, enabled: bool) -> PackMod {
        PackMod {
            name: name.into(),
            version: version.into(),
            enabled,
        }
    }

    fn set(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn compose_disables_extras_and_absent_mods() {
        let pack = vec![pm("a", "1.0.0", true), pm("b", "2.0.0", false)];
        let disk = set(&["a", "b", "c", "base"]);
        let entries = compose_entries(&pack, &disk);
        assert_eq!(entries[0], ("base".to_string(), true));
        assert!(entries.contains(&("a".to_string(), true)));
        assert!(entries.contains(&("b".to_string(), false)), "pack-disabled stays off");
        assert!(entries.contains(&("c".to_string(), false)), "extras get disabled");
    }

    #[test]
    fn compose_enables_only_present_pack_mods() {
        let pack = vec![pm("a", "1.0.0", true), pm("x", "1.0.0", true)];
        let disk = set(&["a"]);
        let entries = compose_entries(&pack, &disk);
        assert!(entries.contains(&("a".to_string(), true)));
        assert!(entries.contains(&("x".to_string(), false)), "absent pack mod disabled until download lands");
    }

    #[test]
    fn validate_filters_base_and_rejects_duplicates_and_garbage() {
        let ok = validate_mods(vec![
            pm("base", "2.0", true),
            pm("a", "1.0.0", true),
            pm("b", "0.1", false),
        ])
        .expect("valid");
        assert_eq!(ok.len(), 2);

        assert!(validate_mods(vec![pm("a", "1.0", true), pm("a", "2.0", true)]).is_err());
        assert!(validate_mods(vec![pm("a", "1.0", true), pm("base", "2.0", true)]).is_ok());
        assert!(validate_mods(vec![pm("bad name!", "1.0", true)]).is_err());
        assert!(validate_mods(vec![pm("a", "not a version!", true)]).is_err());
        assert!(validate_mods(vec![pm("base", "2.0", true)]).is_err(), "base-only pack is empty");
    }
}
