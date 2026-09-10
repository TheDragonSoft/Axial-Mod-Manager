use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::config::Config;
use crate::error::AppError;
use crate::models::{DetectedDir, InstalledMod, InstalledSnapshot, ModsDirStatus};

const MOD_LIST_FILE: &str = "mod-list.json";

// ---------------------------------------------------------------------------
// Directory auto-detection (Phase 3)
// ---------------------------------------------------------------------------

/// Platform-specific default Factorio mods directory. `None` if the OS
/// location can't be resolved (e.g. no home dir).
pub fn detect() -> Option<DetectedDir> {
    let path = platform_mods_dir()?;
    Some(DetectedDir {
        path: path.to_string_lossy().into_owned(),
        exists: path.is_dir(),
    })
}

#[cfg(target_os = "windows")]
fn platform_mods_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("Factorio").join("mods"))
}

#[cfg(target_os = "macos")]
fn platform_mods_dir() -> Option<PathBuf> {
    // lowercase "factorio" is the game's own convention on macOS
    dirs::home_dir().map(|h| {
        h.join("Library")
            .join("Application Support")
            .join("factorio")
            .join("mods")
    })
}

#[cfg(target_os = "linux")]
fn platform_mods_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".factorio").join("mods"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_mods_dir() -> Option<PathBuf> {
    None
}

// ---------------------------------------------------------------------------
// Directory validation (Phase 3)
// ---------------------------------------------------------------------------

pub fn dir_status(path: &str) -> ModsDirStatus {
    let path = Path::new(path);
    let exists = path.exists();
    let is_dir = exists && path.is_dir();
    let writable = is_dir && probe_writable(path);
    let creatable = if exists {
        writable
    } else {
        nearest_existing_ancestor_writable(path)
    };
    let (zip_count, has_mod_list) = if is_dir {
        (count_zips(path), path.join(MOD_LIST_FILE).is_file())
    } else {
        (0, false)
    };

    ModsDirStatus {
        path: path.to_string_lossy().into_owned(),
        exists,
        is_dir,
        writable,
        creatable,
        zip_count,
        has_mod_list,
    }
}

fn probe_writable(dir: &Path) -> bool {
    let probe = dir.join(".fmm_write_probe");
    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn nearest_existing_ancestor_writable(path: &Path) -> bool {
    let mut cur = path.to_path_buf();
    loop {
        if cur.exists() {
            return probe_writable(&cur);
        }
        match cur.parent() {
            Some(p) if p != cur => cur = p.to_path_buf(),
            _ => return false,
        }
    }
}

fn count_zips(dir: &Path) -> u32 {
    let mut count = 0u32;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let is_zip = p
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("zip"))
                .unwrap_or(false);
            if p.is_file() && is_zip {
                count += 1;
            }
        }
    }
    count
}

// ---------------------------------------------------------------------------
// Path resolution (Phase 5)
// ---------------------------------------------------------------------------

/// Effective mods directory: configured path, else platform detect.
pub fn resolve_dir(config: &Config) -> Result<PathBuf, AppError> {
    if let Some(p) = &config.mods_dir {
        if !p.trim().is_empty() {
            return Ok(PathBuf::from(p));
        }
    }
    detect()
        .map(|d| PathBuf::from(d.path))
        .ok_or_else(|| {
            AppError::Config(
                "could not determine the Factorio mods directory — set it in Settings".into(),
            )
        })
}

// ---------------------------------------------------------------------------
// info.json reading (Phase 6)
// ---------------------------------------------------------------------------

pub struct InfoJson {
    pub name: String,
    pub version: String,
    pub factorio_version: String,
    pub dependencies: Vec<String>,
}

/// Read info.json from inside a mod zip without extracting it.
/// Prefers root-level info.json; falls back to the first nested one.
pub fn read_info_json(path: &Path) -> Result<InfoJson, AppError> {
    let file = fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Parse(format!("not a valid zip: {e}")))?;

    let mut raw: Option<String> = None;
    let mut nested: Option<String> = None;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Parse(format!("zip read error: {e}")))?;
        if entry.is_dir() {
            continue;
        }
        let entry_name = entry.name().to_string();
        if entry_name == "info.json" || entry_name == "./info.json" {
            let mut s = String::new();
            entry.read_to_string(&mut s)?;
            raw = Some(s);
            break;
        } else if nested.is_none() && entry_name.ends_with("/info.json") {
            let mut s = String::new();
            entry.read_to_string(&mut s)?;
            nested = Some(s);
        }
    }
    let raw = raw
        .or(nested)
        .ok_or_else(|| AppError::Parse("info.json not found inside zip".into()))?;

    let v: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Parse(format!("info.json is not valid JSON: {e}")))?;
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .ok_or_else(|| AppError::Parse("info.json has no 'name' field".into()))?
        .to_string();
    let version = v
        .get("version")
        .and_then(|x| x.as_str())
        .unwrap_or("?")
        .to_string();
    let factorio_version = v
        .get("factorio_version")
        .and_then(|x| x.as_str())
        .unwrap_or("?")
        .to_string();
    let dependencies = v
        .get("dependencies")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|d| d.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(InfoJson {
        name,
        version,
        factorio_version,
        dependencies,
    })
}

/// Best-effort (name, version) from a `{name}_{version}.zip` filename.
/// Only used when info.json is unreadable.
fn fallback_name_version(file_name: &str) -> (String, String) {
    let stem = file_name.strip_suffix(".zip").unwrap_or(file_name);
    match stem.rsplit_once('_') {
        Some((n, v)) if !n.is_empty() && !v.is_empty() => (n.to_string(), v.to_string()),
        _ => (stem.to_string(), "?".to_string()),
    }
}

// ---------------------------------------------------------------------------
// mod-list.json (Phase 6)
// ---------------------------------------------------------------------------

fn mod_list_path(dir: &Path) -> PathBuf {
    dir.join(MOD_LIST_FILE)
}

pub fn mod_list_exists(dir: &Path) -> bool {
    mod_list_path(dir).is_file()
}

/// Names currently disabled according to mod-list.json.
/// Missing or unreadable file ⇒ empty set (Factorio default: everything enabled).
fn disabled_names(dir: &Path) -> HashSet<String> {
    let path = mod_list_path(dir);
    if !path.is_file() {
        return HashSet::new();
    }
    let Ok(raw) = fs::read_to_string(&path) else {
        return HashSet::new();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return HashSet::new();
    };
    v.get("mods")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|e| e.get("enabled").and_then(|b| b.as_bool()) == Some(false))
                .filter_map(|e| e.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Load mod-list.json for mutation. Missing ⇒ fresh document with the
/// mandatory `base` entry. Corrupt ⇒ hard error (never clobber a user file).
fn load_mod_list_for_write(dir: &Path) -> Result<serde_json::Value, AppError> {
    let path = mod_list_path(dir);
    if !path.exists() {
        return Ok(json!({ "mods": [ { "name": "base", "enabled": true } ] }));
    }
    let raw = fs::read_to_string(&path)?;
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        AppError::Parse(format!(
            "mod-list.json is corrupt ({e}) — fix or delete it before changing mods"
        ))
    })?;
    if !v.is_object() {
        return Err(AppError::Parse(
            "mod-list.json has an unexpected top-level shape".into(),
        ));
    }
    Ok(v)
}

fn save_mod_list(dir: &Path, root: &serde_json::Value) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    let path = mod_list_path(dir);
    let json = serde_json::to_string_pretty(root)
        .map_err(|e| AppError::Parse(format!("serialize mod-list: {e}")))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Enable/disable a mod. Creates the file (with `base`) on first write;
/// only ever touches the named entry, so `base` and unknown fields survive.
pub fn set_enabled(dir: &Path, name: &str, enabled: bool) -> Result<(), AppError> {
    let mut root = load_mod_list_for_write(dir)?;
    if root.get("mods").and_then(|m| m.as_array()).is_none() {
        root["mods"] = json!([]);
    }
    let mods = root
        .get_mut("mods")
        .and_then(|m| m.as_array_mut())
        .expect("mods array was just normalized");

    if let Some(entry) = mods
        .iter_mut()
        .find(|e| e.get("name").and_then(|n| n.as_str()) == Some(name))
    {
        entry["enabled"] = json!(enabled);
    } else {
        mods.push(json!({ "name": name, "enabled": enabled }));
    }
    save_mod_list(dir, &root)
}

/// Remove a mod's entry (only when its last zip is gone). `base` is untouched.
pub fn remove_mod_entry(dir: &Path, name: &str) -> Result<(), AppError> {
    if !mod_list_exists(dir) {
        return Ok(());
    }
    let mut root = load_mod_list_for_write(dir)?;
    if let Some(mods) = root.get_mut("mods").and_then(|m| m.as_array_mut()) {
        mods.retain(|e| e.get("name").and_then(|n| n.as_str()) != Some(name));
    }
    save_mod_list(dir, &root)
}

// ---------------------------------------------------------------------------
// Installed scan + uninstall (Phase 6)
// ---------------------------------------------------------------------------

/// Scan the mods folder: every *.zip becomes an InstalledMod with metadata
/// read in-memory from its info.json, merged with mod-list.json enable flags.
pub fn scan_installed(dir: &Path) -> InstalledSnapshot {
    let mods_dir = dir.to_string_lossy().into_owned();
    let mut mods = Vec::new();
    let mod_list_exists = mod_list_exists(dir);

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => {
            return InstalledSnapshot {
                mods_dir,
                mod_list_exists,
                mods,
            }
        }
    };

    let mut zip_paths: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .map(|x| x.eq_ignore_ascii_case("zip"))
                    .unwrap_or(false)
        })
        .collect();
    zip_paths.sort();

    let disabled = disabled_names(dir);

    for path in zip_paths {
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        let (info, problem) = match read_info_json(&path) {
            Ok(i) => (i, None),
            Err(e) => {
                let (n, v) = fallback_name_version(&file_name);
                (
                    InfoJson {
                        name: n,
                        version: v,
                        factorio_version: "?".into(),
                        dependencies: vec![],
                    },
                    Some(e.to_string()),
                )
            }
        };

        let enabled = !disabled.contains(&info.name);
        mods.push(InstalledMod {
            file_name,
            name: info.name,
            version: info.version,
            factorio_version: info.factorio_version,
            enabled,
            dependencies: info.dependencies,
            problem,
        });
    }

    // Factorio refuses to load when two zips share a mod name — flag them all.
    let mut counts: HashMap<String, usize> = HashMap::new();
    for m in &mods {
        *counts.entry(m.name.clone()).or_default() += 1;
    }
    for m in &mut mods {
        if counts[&m.name] > 1 {
            m.problem = Some(match m.problem.take() {
                Some(p) => format!("{p}; duplicate install — multiple versions of this mod are present"),
                None => "duplicate install — multiple versions of this mod are present".into(),
            });
        }
    }

    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    InstalledSnapshot {
        mods_dir,
        mod_list_exists,
        mods,
    }
}

fn validated_zip_path(dir: &Path, file_name: &str) -> Result<PathBuf, AppError> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
        || !file_name.to_lowercase().ends_with(".zip")
    {
        return Err(AppError::Config(format!(
            "invalid mod file name: {file_name:?}"
        )));
    }
    let path = dir.join(file_name);
    if !path.is_file() {
        return Err(AppError::NotFound(format!(
            "{file_name} not found in the mods directory"
        )));
    }
    Ok(path)
}

/// Authoritative mod name for a zip (info.json, filename fallback).
pub fn mod_name_of(dir: &Path, file_name: &str) -> Result<String, AppError> {
    let path = validated_zip_path(dir, file_name)?;
    if let Ok(info) = read_info_json(&path) {
        if !info.name.is_empty() {
            return Ok(info.name);
        }
    }
    Ok(fallback_name_version(file_name).0)
}

/// Delete a mod zip; clean its mod-list.json entry if it was the last copy.
pub fn uninstall(dir: &Path, file_name: &str) -> Result<String, AppError> {
    let path = validated_zip_path(dir, file_name)?;
    let name = mod_name_of(dir, file_name)?;
    fs::remove_file(&path)?;
    let still_present = scan_installed(dir).mods.iter().any(|m| m.name == name);
    if !still_present {
        remove_mod_entry(dir, &name)?;
    }
    Ok(name)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::fallback_name_version;

    #[test]
    fn parses_standard_zip_names() {
        assert_eq!(
            fallback_name_version("Krastorio2_2.1.2.zip"),
            ("Krastorio2".into(), "2.1.2".into())
        );
        assert_eq!(
            fallback_name_version("some_mod_1.0.0.zip"),
            ("some_mod".into(), "1.0.0".into())
        );
        assert_eq!(
            fallback_name_version("weird.zip"),
            ("weird".into(), "?".into())
        );
    }
}
