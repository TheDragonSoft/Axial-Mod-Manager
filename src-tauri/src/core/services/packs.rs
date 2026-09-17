//! Mod packs: portable manifests + activation (target-state reconciliation).

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::prelude::BASE64_STANDARD;
use base64::Engine;
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
        .map_err(|e| AppError::Parse(format!("malformed pack JSON: {e}")))?;
    create_pack(profiles_dir, &imp.name, imp.mods)
}

/// Export a pack as a standard Base64-encoded JSON manifest string.
pub fn export_pack_base64(profiles_dir: &Path, id: &str) -> Result<String, AppError> {
    let pack = load_pack(profiles_dir, id)?;
    let json = serde_json::to_string(&pack)
        .map_err(|e| AppError::Parse(format!("serialize pack: {e}")))?;
    Ok(BASE64_STANDARD.encode(json.as_bytes()))
}

/// Import a pack from a standard Base64-encoded JSON manifest string.
/// Decodes Base64, validates UTF-8, and verifies manifest contents.
pub fn import_pack_base64(profiles_dir: &Path, encoded: &str) -> Result<Pack, AppError> {
    let trimmed = encoded.trim();
    if trimmed.is_empty() {
        return Err(AppError::Parse("pack code cannot be empty".into()));
    }
    let bytes = BASE64_STANDARD
        .decode(trimmed)
        .map_err(|e| AppError::Parse(format!("invalid base64 encoding: {e}")))?;
    let json = std::str::from_utf8(&bytes)
        .map_err(|e| AppError::Parse(format!("invalid UTF-8 in decoded pack data: {e}")))?;
    import_pack(profiles_dir, json)
}

// ---------------------------------------------------------------------------
// Active pack persistence
// ---------------------------------------------------------------------------

/// Save the active pack id into Config, persist to disk, and emit
/// `settings-changed` so the frontend stays in sync. Follows the same
/// pattern as `set_settings` in commands/settings.rs.
fn persist_active_pack(app: &AppHandle, pack_id: Option<&str>) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let config_path = state.config_path.clone();
    let mut config = state.config.read().expect("config lock poisoned").clone();
    config.active_pack_id = pack_id.map(String::from);
    config.save(&config_path)?;
    *state.config.write().expect("config lock poisoned") = config.clone();
    let _ = app.emit("settings-changed", &config);
    Ok(())
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/// Output of `compose_entries`: the target mod-list entries plus the enabled
/// pack mods that are on disk at the wrong manifest version.
#[derive(Debug, Clone, Default)]
pub struct ComposedEntries {
    /// `base` first and always enabled; pack mods enabled only if marked
    /// enabled AND present at the manifest version; everything else on disk
    /// disabled (never deleted).
    pub entries: Vec<(String, bool)>,
    /// Enabled pack mods whose on-disk version differs from the manifest —
    /// written disabled so Factorio never boots a version the pack didn't
    /// vet, and reported so the UI can offer a retry.
    pub version_mismatch: Vec<PackMod>,
}

/// Pure: the desired mod-list entries for a pack against the mods currently
/// on disk (names + versions). `base` first and always enabled; pack mods
/// enabled only if marked enabled AND present at the manifest version;
/// everything else on disk disabled (never deleted).
pub fn compose_entries(
    pack_mods: &[PackMod],
    disk_names: &HashSet<String>,
    disk_versions: &HashMap<String, String>,
) -> ComposedEntries {
    let mut entries: Vec<(String, bool)> = vec![("base".to_string(), true)];
    let mut pack_names: HashSet<String> = HashSet::new();
    let mut version_mismatch: Vec<PackMod> = Vec::new();
    for m in pack_mods {
        if m.name == "base" {
            continue;
        }
        pack_names.insert(m.name.clone());
        // After a failed/cancelled download an older zip may still sit on
        // disk; enabling it would silently deviate from the manifest, so it
        // stays off until the matching version actually lands.
        let wrong_version = m.enabled
            && disk_names.contains(&m.name)
            && disk_versions
                .get(&m.name)
                .is_some_and(|v| v != &m.version);
        if wrong_version {
            version_mismatch.push(m.clone());
        }
        entries.push((
            m.name.clone(),
            m.enabled && disk_names.contains(&m.name) && !wrong_version,
        ));
    }
    let mut extras: Vec<&String> = disk_names
        .iter()
        .filter(|n| **n != "base" && !pack_names.contains(*n))
        .collect();
    extras.sort();
    for n in extras {
        entries.push((n.clone(), false));
    }
    ComposedEntries {
        entries,
        version_mismatch,
    }
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
    let zip_cache = state.zip_cache.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        mod_store::scan_installed(&scan_dir, &zip_cache)
    })
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
                // Pack manifests (axial-pack/1) carry no hash, so the expected
                // SHA1 is resolved from the portal's release metadata (cached
                // by the index client, so repeats are cheap). None only when
                // the portal publishes no hash for that release or the lookup
                // fails — verification then degrades to the downloader's
                // zip-structure check.
                let expected_sha1 = match state.index.mod_details(&m.name).await {
                    Ok(details) => details
                        .releases
                        .iter()
                        .find(|r| r.version == m.version)
                        .and_then(|r| r.sha1.clone()),
                    Err(e) => {
                        tracing::warn!(
                            mod = %m.name,
                            "portal sha1 lookup failed — download verifies zip structure only: {e}"
                        );
                        None
                    }
                };
                match state
                    .queue
                    .clone()
                    .enqueue(app.clone(), mods_dir.clone(), m.name.clone(), m.version.clone(), expected_sha1)
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

    // Immediate target-state write: present pack mods on (unless the on-disk
    // version deviates from the manifest), everything else off.
    let composed = compose_entries(&pack.mods, &disk_names, &disk_versions);
    mod_store::replace_mod_list(&mods_dir, &composed.entries)?;

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
                version_mismatch: composed.version_mismatch,
            },
        );
        persist_active_pack(app, Some(&pack.id))?;
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
                    version_mismatch: vec![],
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
    let zip_cache = state.zip_cache.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        mod_store::scan_installed(&scan_dir, &zip_cache)
    })
    .await
    .map_err(|e| AppError::Parse(format!("background scan failed: {e}")))?;
    let disk_names: HashSet<String> = snapshot.mods.iter().map(|m| m.name.clone()).collect();
    let disk_versions: HashMap<String, String> = snapshot
        .mods
        .iter()
        .map(|m| (m.name.clone(), m.version.clone()))
        .collect();

    let composed = compose_entries(&pack.mods, &disk_names, &disk_versions);
    mod_store::replace_mod_list(
        mod_store::resolve_dir(&config)?.as_path(),
        &composed.entries,
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
            pack_id: pack.id.clone(),
            pack_name: pack.name,
            missing,
            version_mismatch: composed.version_mismatch,
        },
    );
    persist_active_pack(app, Some(&pack.id))?;
    let _ = app.emit("installed-changed", ());
    Ok(())
}

// ---------------------------------------------------------------------------
// Vanilla activation
// ---------------------------------------------------------------------------

/// Activate the built-in Vanilla pseudo-pack: disable every mod except `base`,
/// clear any in-flight activation, and persist `"vanilla"` as the active pack.
pub async fn activate_vanilla(app: &AppHandle) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let config = state.config.read().expect("config lock poisoned").clone();
    let mods_dir = mod_store::resolve_dir(&config)?;

    mod_store::disable_all_mods(&mods_dir)?;

    // Clear any pending pack activation — Vanilla takes over immediately.
    {
        let mut guard = match state.pending_activation.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        *guard = None;
    }

    persist_active_pack(app, Some("vanilla"))?;

    let _ = app.emit(
        "pack-activated",
        &PackActivatedPayload {
            pack_id: "vanilla".into(),
            pack_name: "Vanilla".into(),
            missing: vec![],
            version_mismatch: vec![],
        },
    );
    let _ = app.emit("installed-changed", ());

    tracing::info!("vanilla pack activated — all mods disabled except base");
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

    fn versions(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(n, v)| (n.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn compose_disables_extras_and_absent_mods() {
        let pack = vec![pm("a", "1.0.0", true), pm("b", "2.0.0", false)];
        let disk = set(&["a", "b", "c", "base"]);
        let entries = compose_entries(&pack, &disk, &versions(&[("a", "1.0.0"), ("b", "2.0.0")]))
            .entries;
        assert_eq!(entries[0], ("base".to_string(), true));
        assert!(entries.contains(&("a".to_string(), true)));
        assert!(entries.contains(&("b".to_string(), false)), "pack-disabled stays off");
        assert!(entries.contains(&("c".to_string(), false)), "extras get disabled");
    }

    #[test]
    fn compose_enables_only_present_pack_mods() {
        let pack = vec![pm("a", "1.0.0", true), pm("x", "1.0.0", true)];
        let disk = set(&["a"]);
        let entries = compose_entries(&pack, &disk, &versions(&[("a", "1.0.0")])).entries;
        assert!(entries.contains(&("a".to_string(), true)));
        assert!(entries.contains(&("x".to_string(), false)), "absent pack mod disabled until download lands");
    }

    #[test]
    fn compose_enables_exact_version_match() {
        let pack = vec![pm("a", "1.0.0", true)];
        let disk = set(&["a"]);
        let composed = compose_entries(&pack, &disk, &versions(&[("a", "1.0.0")]));
        assert!(composed.entries.contains(&("a".to_string(), true)));
        assert!(composed.version_mismatch.is_empty());
    }

    #[test]
    fn compose_disables_and_reports_wrong_version() {
        let pack = vec![pm("a", "2.0.0", true)];
        let disk = set(&["a"]);
        let composed = compose_entries(&pack, &disk, &versions(&[("a", "1.0.0")]));
        assert!(
            composed.entries.contains(&("a".to_string(), false)),
            "wrong-version mod written disabled, not enabled"
        );
        assert_eq!(composed.version_mismatch.len(), 1);
        assert_eq!(composed.version_mismatch[0].name, "a");
        assert_eq!(composed.version_mismatch[0].version, "2.0.0", "mismatch carries the manifest version");
    }

    #[test]
    fn compose_absent_mod_stays_off_without_mismatch() {
        let pack = vec![pm("a", "1.0.0", true), pm("gone", "3.1.0", true)];
        let disk = set(&["a"]);
        let composed = compose_entries(&pack, &disk, &versions(&[("a", "1.0.0")]));
        assert!(
            composed.entries.contains(&("gone".to_string(), false)),
            "absent pack mod disabled until its download lands"
        );
        assert!(composed.version_mismatch.is_empty(), "absent is not a version mismatch");
    }

    #[test]
    fn compose_disabled_pack_mod_never_counts_as_mismatch() {
        let pack = vec![pm("a", "2.0.0", false)];
        let disk = set(&["a"]);
        let composed = compose_entries(&pack, &disk, &versions(&[("a", "1.0.0")]));
        assert!(composed.entries.contains(&("a".to_string(), false)));
        assert!(composed.version_mismatch.is_empty(), "pack-disabled mods are off regardless of version");
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

    fn unique_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("axial-packs-test-{tag}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn base64_roundtrip_exports_and_imports() {
        let dir = unique_dir("base64-roundtrip");
        let orig = create_pack(
            &dir,
            "Space Exploration Test",
            vec![
                pm("space-exploration", "0.6.120", true),
                pm("alien-biomes", "0.6.8", false),
            ],
        )
        .expect("create pack");

        let b64 = export_pack_base64(&dir, &orig.id).expect("export base64");
        assert!(!b64.is_empty());

        let imported = import_pack_base64(&dir, &b64).expect("import base64");
        assert_eq!(imported.name, "Space Exploration Test");
        assert_ne!(imported.id, orig.id, "fresh id generated on import");
        assert_eq!(imported.mods.len(), 2);
        assert_eq!(imported.mods[0].name, "space-exploration");
        assert_eq!(imported.mods[0].version, "0.6.120");
        assert!(imported.mods[0].enabled);
        assert_eq!(imported.mods[1].name, "alien-biomes");
        assert_eq!(imported.mods[1].version, "0.6.8");
        assert!(!imported.mods[1].enabled);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_import_tolerates_surrounding_whitespace() {
        let dir = unique_dir("base64-whitespace");
        let orig = create_pack(
            &dir,
            "Whitespace Pack",
            vec![pm("flib", "0.14.1", true)],
        )
        .expect("create pack");

        let b64 = export_pack_base64(&dir, &orig.id).expect("export base64");
        let padded = format!("\n  \t  {b64}  \r\n\n ");
        let imported = import_pack_base64(&dir, &padded).expect("import base64 with whitespace");
        assert_eq!(imported.name, "Whitespace Pack");
        assert_eq!(imported.mods.len(), 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_import_fails_on_empty_input() {
        let dir = unique_dir("base64-empty");
        let err = import_pack_base64(&dir, "   \n\t  ").unwrap_err();
        match err {
            AppError::Parse(msg) => assert!(msg.contains("pack code cannot be empty")),
            other => panic!("expected AppError::Parse, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_import_fails_on_invalid_base64() {
        let dir = unique_dir("base64-invalid-b64");
        let err = import_pack_base64(&dir, "this is definitely not valid base64!@#%^&*").unwrap_err();
        match err {
            AppError::Parse(msg) => assert!(msg.contains("invalid base64 encoding")),
            other => panic!("expected AppError::Parse, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_import_fails_on_malformed_json() {
        let dir = unique_dir("base64-malformed-json");
        let bad_json_b64 = BASE64_STANDARD.encode(b"{not valid json}");
        let err = import_pack_base64(&dir, &bad_json_b64).unwrap_err();
        match err {
            AppError::Parse(msg) => assert!(msg.contains("malformed pack JSON")),
            other => panic!("expected AppError::Parse, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_import_fails_on_invalid_manifest_content() {
        let dir = unique_dir("base64-invalid-manifest");
        // Valid JSON, but mods list has invalid mod name
        let json = r#"{"name":"Bad Mod Pack","mods":[{"name":"Invalid Name!","version":"1.0.0","enabled":true}]}"#;
        let b64 = BASE64_STANDARD.encode(json.as_bytes());
        let err = import_pack_base64(&dir, &b64).unwrap_err();
        match err {
            AppError::Config(msg) => assert!(msg.contains("invalid mod name")),
            other => panic!("expected AppError::Config, got {other:?}"),
        }

        // Valid JSON, but empty mods
        let json_empty = r#"{"name":"Empty Pack","mods":[]}"#;
        let b64_empty = BASE64_STANDARD.encode(json_empty.as_bytes());
        let err_empty = import_pack_base64(&dir, &b64_empty).unwrap_err();
        match err_empty {
            AppError::Config(msg) => assert!(msg.contains("pack has no mods")),
            other => panic!("expected AppError::Config, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
