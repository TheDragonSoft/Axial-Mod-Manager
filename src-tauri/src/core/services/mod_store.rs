use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde_json::json;

use crate::config::Config;
use crate::core::services::game_detect;
use crate::core::services::resolver;
use crate::error::AppError;
use crate::models::{
    CleanOrphansResult, DetectedDir, DetectedGame, DetectionStatus, InstalledMod, InstalledSnapshot,
    ModStorageEntry, ModsDirStatus, OrphanFile, OrphanKind, StorageReport,
};

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
    let probe = dir.join(".axial_write_probe");
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

/// Pure resolution logic over candidate directory probes.
///
/// Order of precedence:
/// 1. Explicitly configured path in `config.mods_dir` (if non-empty).
/// 2. Auto-detected platform mods directory if it actually exists.
/// 3. Detected game install's portable mods directory if present and existing.
/// 4. Detected game install's standard platform mods directory (game exists on machine,
///    so default mods path is valid even if empty/uncreated yet).
/// 5. NotFound error if none of the above match.
pub fn decide_mods_dir(
    configured: Option<&str>,
    platform_dir: Option<&DetectedDir>,
    game: Option<&DetectedGame>,
) -> Result<PathBuf, AppError> {
    if let Some(p) = configured {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    if let Some(d) = platform_dir {
        if d.exists {
            return Ok(PathBuf::from(&d.path));
        }
    }
    if let Some(g) = game {
        if let Some(p) = &g.portable_mods_dir {
            return Ok(PathBuf::from(p));
        }
        if let Some(d) = platform_dir {
            return Ok(PathBuf::from(&d.path));
        }
    }
    Err(AppError::NotFound(
        "Factorio not found — set your mods folder in Settings".into(),
    ))
}

/// Effective mods directory: configured path, else platform detect or game-hinted path.
pub fn resolve_dir(config: &Config) -> Result<PathBuf, AppError> {
    let platform = detect();
    let game = if let Some(p) = config.game_dir.as_deref() {
        if !p.trim().is_empty() {
            game_detect::inspect_install(Path::new(p), "custom")
        } else {
            game_detect::detect()
        }
    } else {
        game_detect::detect()
    };
    decide_mods_dir(config.mods_dir.as_deref(), platform.as_ref(), game.as_ref())
}

/// Complete detection state: whether Factorio was found, the detected game,
/// and the effective mods directory.
pub fn resolve_detection_status(config: &Config) -> DetectionStatus {
    let game = if let Some(p) = config.game_dir.as_deref() {
        if !p.trim().is_empty() {
            game_detect::inspect_install(Path::new(p), "custom")
        } else {
            game_detect::detect()
        }
    } else {
        game_detect::detect()
    };
    let platform = detect();
    let effective = decide_mods_dir(config.mods_dir.as_deref(), platform.as_ref(), game.as_ref()).ok();
    let is_detected = effective.is_some() || game.is_some();
    DetectionStatus {
        is_detected,
        game,
        effective_mods_dir: effective.map(|p| p.to_string_lossy().into_owned()),
    }
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
// Zip info cache
// ---------------------------------------------------------------------------

/// info.json payload for one zip, as cached between scans.
#[derive(Debug, Clone)]
struct CachedZipInfo {
    name: String,
    version: String,
    factorio_version: String,
    dependencies: Vec<String>,
    /// Set when the zip could not be read (corrupt or locked): the scan falls
    /// back to the filename and surfaces this as the mod's problem.
    problem: Option<String>,
}

impl CachedZipInfo {
    fn from_read(file_name: &str, read: Result<InfoJson, AppError>) -> Self {
        match read {
            Ok(i) => Self {
                name: i.name,
                version: i.version,
                factorio_version: i.factorio_version,
                dependencies: i.dependencies,
                problem: None,
            },
            Err(e) => {
                let (n, v) = fallback_name_version(file_name);
                Self {
                    name: n,
                    version: v,
                    factorio_version: "?".into(),
                    dependencies: vec![],
                    problem: Some(e.to_string()),
                }
            }
        }
    }
}

/// In-memory cache of per-zip info.json reads. A full scan opens every zip
/// (central directory + info.json decompress), which on Windows is
/// AV-amplified; this makes repeat scans (every installed-changed event, tab
/// visit, pack operation) cost one metadata check per zip instead. Entries
/// are keyed per mods directory and validated by (mtime, len), so a replaced
/// or re-downloaded zip is re-read; each scan prunes deleted zips.
#[derive(Default)]
pub struct ZipInfoCache {
    dirs: Mutex<HashMap<PathBuf, HashMap<String, (SystemTime, u64, CachedZipInfo)>>>,
}

/// Upper bound on cached directories (changing the setting creates new keys).
const CACHE_MAX_DIRS: usize = 8;

impl ZipInfoCache {
    pub fn new() -> Self {
        Self::default()
    }

    fn lookup(
        &self,
        dir: &Path,
        file_name: &str,
        mtime: SystemTime,
        len: u64,
    ) -> Option<CachedZipInfo> {
        let dirs = self.dirs.lock().ok()?;
        let (cached_at, cached_len, info) = dirs.get(dir)?.get(file_name)?;
        (*cached_at == mtime && *cached_len == len).then(|| info.clone())
    }

    fn store(&self, dir: &Path, file_name: &str, mtime: SystemTime, len: u64, info: CachedZipInfo) {
        let mut dirs = match self.dirs.lock() {
            Ok(d) => d,
            Err(_) => return, // poisoned: scans still work, just uncached
        };
        if !dirs.contains_key(dir) {
            if dirs.len() >= CACHE_MAX_DIRS {
                dirs.clear();
            }
            dirs.insert(dir.to_path_buf(), HashMap::new());
        }
        if let Some(per_dir) = dirs.get_mut(dir) {
            per_dir.insert(file_name.to_string(), (mtime, len, info));
        }
    }

    /// Drop entries for zips no longer on disk (called after each scan).
    fn prune(&self, dir: &Path, live: &HashSet<String>) {
        if let Ok(mut dirs) = self.dirs.lock() {
            if let Some(per_dir) = dirs.get_mut(dir) {
                per_dir.retain(|name, _| live.contains(name));
            }
        }
    }
}

/// Open one zip and extract its info.json, falling back to the filename.
fn read_zip_info(path: &Path, file_name: &str) -> CachedZipInfo {
    CachedZipInfo::from_read(file_name, read_info_json(path))
}

/// Cached info for one zip: lookup by current metadata, else read and store.
fn zip_info_cached(dir: &Path, cache: &ZipInfoCache, path: &Path, file_name: &str) -> CachedZipInfo {
    if let Ok(meta) = fs::metadata(path) {
        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if let Some(info) = cache.lookup(dir, file_name, mtime, meta.len()) {
            return info;
        }
        let info = read_zip_info(path, file_name);
        cache.store(dir, file_name, mtime, meta.len(), info.clone());
        return info;
    }
    read_zip_info(path, file_name)
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
/// A present-but-malformed shape (top level not an object, or `mods` missing /
/// not an array) is rejected the same way: Factorio never writes such a file,
/// so silently "fixing" it would clobber user data it can't understand.
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
    if v.get("mods").map(|m| !m.is_array()).unwrap_or(true) {
        return Err(AppError::Parse(
            "mod-list.json has no 'mods' array — fix or delete it before changing mods".into(),
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
/// Zip reads are served from `cache` when the file's (mtime, len) is
/// unchanged; cache misses are read on parallel worker threads.
pub fn scan_installed(dir: &Path, cache: &ZipInfoCache) -> InstalledSnapshot {
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

    // (path, file_name, mtime, len) — DirEntry metadata avoids a stat per file.
    let mut zip_paths: Vec<(PathBuf, String, SystemTime, u64)> = entries
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let path = e.path();
            let is_zip = path
                .extension()
                .map(|x| x.eq_ignore_ascii_case("zip"))
                .unwrap_or(false);
            if !is_zip {
                return None;
            }
            let file_name = e.file_name().to_string_lossy().into_owned();
            let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            Some((path, file_name, mtime, meta.len()))
        })
        .collect();
    zip_paths.sort_by(|a, b| a.0.cmp(&b.0));

    let disabled = disabled_names(dir);

    // Serve hits from the cache; read misses (in parallel when numerous).
    let mut infos: Vec<Option<CachedZipInfo>> = Vec::with_capacity(zip_paths.len());
    let mut misses: Vec<usize> = Vec::new();
    for (i, (_, file_name, mtime, len)) in zip_paths.iter().enumerate() {
        match cache.lookup(dir, file_name, *mtime, *len) {
            Some(info) => infos.push(Some(info)),
            None => {
                infos.push(None);
                misses.push(i);
            }
        }
    }
    for (i, info) in read_misses(dir, cache, &zip_paths, &misses) {
        infos[i] = Some(info);
    }

    let mut live_names: HashSet<String> = HashSet::new();
    for ((path, file_name, _, _), info) in zip_paths.iter().zip(infos.into_iter()) {
        live_names.insert(file_name.clone());
        let info = info.unwrap_or_else(|| read_zip_info(path, file_name));
        let enabled = !disabled.contains(&info.name);
        mods.push(InstalledMod {
            file_name: file_name.clone(),
            name: info.name,
            version: info.version,
            factorio_version: info.factorio_version,
            enabled,
            dependencies: info.dependencies,
            problem: info.problem,
        });
    }
    cache.prune(dir, &live_names);

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

/// Read cache-miss zips — on worker threads when there are several, since each
/// is an independent file open (the first scan of a big library is otherwise N
/// sequential opens, each potentially AV-amplified). Results are stored into
/// the cache and returned in `misses` order.
fn read_misses(
    dir: &Path,
    cache: &ZipInfoCache,
    zip_paths: &[(PathBuf, String, SystemTime, u64)],
    misses: &[usize],
) -> Vec<(usize, CachedZipInfo)> {
    if misses.is_empty() {
        return Vec::new();
    }
    let read_one = |i: usize| {
        let (path, file_name, mtime, len) = &zip_paths[i];
        let info = read_zip_info(path, file_name);
        cache.store(dir, file_name, *mtime, *len, info.clone());
        (i, info)
    };

    if misses.len() < 4 {
        return misses.iter().copied().map(read_one).collect();
    }

    let workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(8)
        .min(misses.len());
    let chunk_size = misses.len().div_ceil(workers);
    std::thread::scope(|s| {
        let handles: Vec<_> = misses
            .chunks(chunk_size)
            .map(|chunk| {
                let read_one = &read_one;
                s.spawn(move || chunk.iter().copied().map(|i| read_one(i)).collect::<Vec<_>>())
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().expect("zip info reader panicked"))
            .collect()
    })
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
pub fn mod_name_of(dir: &Path, file_name: &str, cache: &ZipInfoCache) -> Result<String, AppError> {
    let path = validated_zip_path(dir, file_name)?;
    let info = zip_info_cached(dir, cache, &path, file_name);
    if !info.name.is_empty() && info.problem.is_none() {
        return Ok(info.name);
    }
    Ok(fallback_name_version(file_name).0)
}

/// Delete a mod zip; clean its mod-list.json entry if it was the last copy.
pub fn uninstall(dir: &Path, file_name: &str, cache: &ZipInfoCache) -> Result<String, AppError> {
    let path = validated_zip_path(dir, file_name)?;
    let name = mod_name_of(dir, file_name, cache)?;
    fs::remove_file(&path)?;
    // With a warm cache this re-scan is metadata-only; it also prunes the
    // deleted zip's cache entry.
    let still_present = scan_installed(dir, cache).mods.iter().any(|m| m.name == name);
    if !still_present {
        remove_mod_entry(dir, &name)?;
    }
    Ok(name)
}

/// Installed mods that would be left broken by removing `file_name` (A2):
/// every other installed mod declaring a required dependency on it. Must be
/// called BEFORE `uninstall` deletes the zip — the impact is computed from a
/// scan that still contains the mod. With a warm cache the scan is
/// metadata-only.
pub fn uninstall_impact(
    dir: &Path,
    file_name: &str,
    cache: &ZipInfoCache,
) -> Result<Vec<String>, AppError> {
    let name = mod_name_of(dir, file_name, cache)?;
    let snapshot = scan_installed(dir, cache);
    Ok(resolver::reverse_dependents(&snapshot.mods, &name))
}

/// Atomically replace mod-list.json's `mods` array with `entries`.
/// A canonical enabled `base` entry is always kept first; other top-level
/// keys in the file are preserved. Corrupt files refuse to load (same policy
/// as set_enabled) rather than being silently clobbered.
pub fn replace_mod_list(dir: &Path, entries: &[(String, bool)]) -> Result<(), AppError> {
    let mut root = load_mod_list_for_write(dir)?;
    let mut arr: Vec<serde_json::Value> = vec![json!({ "name": "base", "enabled": true })];
    for (name, enabled) in entries {
        if name == "base" {
            continue;
        }
        arr.push(json!({ "name": name, "enabled": enabled }));
    }
    root["mods"] = serde_json::Value::Array(arr);
    save_mod_list(dir, &root)
}

// ---------------------------------------------------------------------------
// Storage report + orphans (A4) — additive; the installed scan above is
// deliberately untouched.
// ---------------------------------------------------------------------------

fn is_zip_file_name(file_name: &str) -> bool {
    Path::new(file_name)
        .extension()
        .map(|ext| ext.eq_ignore_ascii_case("zip"))
        .unwrap_or(false)
}

/// Every mod name referenced by mod-list.json, enabled or disabled.
/// `None` when the file is missing, unreadable, corrupt or malformed — with no
/// trustworthy reference list it is impossible to *prove* a zip is unused, and
/// deletion is forever, so the caller must classify nothing as orphan.
fn referenced_names(dir: &Path) -> Option<HashSet<String>> {
    let path = mod_list_path(dir);
    if !path.is_file() {
        return None;
    }
    let raw = fs::read_to_string(&path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let arr = v.get("mods")?.as_array()?;
    Some(
        arr.iter()
            .filter_map(|e| e.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect(),
    )
}

/// Scan the mods directory for storage facts: total size, per-mod aggregates
/// and provably-orphaned files. Runs its own read_dir pass (does not re-use
/// `scan_installed`, which only sees zips and would miss `.part` debris and
/// mod-list entries whose zip vanished). Zip names come from the shared
/// `ZipInfoCache`, so a report right after a scan costs metadata checks only.
pub fn storage_report(dir: &Path, cache: &ZipInfoCache) -> StorageReport {
    let mods_dir = dir.to_string_lossy().into_owned();
    let mut total_size_bytes = 0u64;
    struct DiskZip {
        file_name: String,
        mod_name: String,
        size: u64,
        /// False when the zip could not be read (corrupt/locked): its name is
        /// then only a filename guess, never grounds for orphan classification.
        readable: bool,
    }
    let mut zips: Vec<DiskZip> = Vec::new();
    let mut parts: Vec<(String, u64)> = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().into_owned();
            let size = meta.len();
            total_size_bytes += size;
            if file_name.to_lowercase().ends_with(".part") {
                parts.push((file_name, size));
            } else if is_zip_file_name(&file_name) {
                let path = dir.join(&file_name);
                let info = zip_info_cached(dir, cache, &path, &file_name);
                zips.push(DiskZip {
                    readable: info.problem.is_none(),
                    mod_name: info.name,
                    file_name,
                    size,
                });
            }
        }
    }

    let mut orphans: Vec<OrphanFile> = Vec::new();
    if let Some(referenced) = referenced_names(dir) {
        let disk_names: HashSet<&str> = zips.iter().map(|z| z.mod_name.as_str()).collect();
        for z in &zips {
            // `base` ships inside the game data dir — it is never a mods-dir
            // zip, so it can neither be an unreferenced zip nor go "missing".
            if z.readable && z.mod_name != "base" && !referenced.contains(&z.mod_name) {
                orphans.push(OrphanFile {
                    file_name: Some(z.file_name.clone()),
                    kind: OrphanKind::UnreferencedZip,
                    mod_name: Some(z.mod_name.clone()),
                    size_bytes: z.size,
                });
            }
        }
        for name in &referenced {
            if name != "base" && !disk_names.contains(name.as_str()) {
                orphans.push(OrphanFile {
                    file_name: None,
                    kind: OrphanKind::MissingEntry,
                    mod_name: Some(name.clone()),
                    size_bytes: 0,
                });
            }
        }
    }
    for (file_name, size) in &parts {
        orphans.push(OrphanFile {
            file_name: Some(file_name.clone()),
            kind: OrphanKind::PartDebris,
            mod_name: None,
            size_bytes: *size,
        });
    }
    orphans.sort_by(|a, b| {
        (a.kind, a.file_name.as_deref().unwrap_or(""), a.mod_name.as_deref().unwrap_or(""))
            .cmp(&(
                b.kind,
                b.file_name.as_deref().unwrap_or(""),
                b.mod_name.as_deref().unwrap_or(""),
            ))
    });

    let mut per_mod: HashMap<String, ModStorageEntry> = HashMap::new();
    for z in &zips {
        let entry = per_mod
            .entry(z.mod_name.clone())
            .or_insert_with(|| ModStorageEntry {
                name: z.mod_name.clone(),
                file_count: 0,
                size_bytes: 0,
            });
        entry.file_count += 1;
        entry.size_bytes += z.size;
    }
    let mut per_mod: Vec<ModStorageEntry> = per_mod.into_values().collect();
    per_mod.sort_by(|a, b| {
        b.size_bytes
            .cmp(&a.size_bytes)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let orphan_size_bytes = orphans.iter().map(|o| o.size_bytes).sum();
    let zip_count = zips.len() as u32;

    StorageReport {
        mods_dir,
        total_size_bytes,
        zip_count,
        orphans,
        orphan_size_bytes,
        per_mod,
    }
}

/// Delete only provably-orphaned files: unreferenced zips and `.part` debris.
/// The classification is redone from a fresh scan (nothing is accepted from
/// the caller), and the directory must pass the same validation as any write
/// path — the writable-probe `dir_status` — because deletion is forever.
/// Missing mod-list entries are reported but never touched here: cleaning
/// them would mean editing Factorio's mod-list.json, which no orphan proves.
pub fn clean_orphans(dir: &Path, cache: &ZipInfoCache) -> Result<CleanOrphansResult, AppError> {
    let status = dir_status(&dir.to_string_lossy());
    if !status.is_dir {
        return Err(AppError::NotFound(format!(
            "mods directory {} does not exist",
            status.path
        )));
    }
    if !status.writable {
        return Err(AppError::Config(format!(
            "mods directory {} is not writable",
            status.path
        )));
    }

    let report = storage_report(dir, cache);
    let mut deleted_count = 0u32;
    let mut freed_bytes = 0u64;
    let mut errors = Vec::new();
    for orphan in &report.orphans {
        let Some(file_name) = &orphan.file_name else {
            continue;
        };
        // Defense in depth: names come from read_dir, but deletion is forever —
        // refuse anything that isn't a plain top-level file name.
        if file_name.contains('/')
            || file_name.contains('\\')
            || file_name.contains("..")
        {
            continue;
        }
        match fs::remove_file(dir.join(file_name)) {
            Ok(_) => {
                deleted_count += 1;
                freed_bytes += orphan.size_bytes;
            }
            Err(e) => errors.push(format!("{file_name}: {e}")),
        }
    }

    // Drop cache entries of deleted zips — one metadata-only read_dir pass.
    let live: HashSet<String> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    cache.prune(dir, &live);

    Ok(CleanOrphansResult {
        deleted_count,
        freed_bytes,
        errors,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

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

    fn unique_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("axial-modstore-{tag}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_zip(path: &Path, info_json: &str) {
        let file = fs::File::create(path).unwrap();
        let mut w = zip::ZipWriter::new(file);
        w.start_file("ModDir/info.json", zip::write::SimpleFileOptions::default())
            .unwrap();
        w.write_all(info_json.as_bytes()).unwrap();
        w.finish().unwrap();
    }

    /// Pin mtime far into the past so a rewritten zip is guaranteed to have a
    /// fresh, distinct timestamp (rewrites within the same clock tick would
    /// otherwise keep the old one).
    fn set_mtime(path: &Path, secs: u64) {
        let f = fs::OpenOptions::new().write(true).open(path).unwrap();
        f.set_modified(UNIX_EPOCH + Duration::from_secs(secs))
            .unwrap();
    }

    fn cached_len(cache: &ZipInfoCache, dir: &Path) -> usize {
        cache
            .dirs
            .lock()
            .unwrap()
            .get(dir)
            .map(|m| m.len())
            .unwrap_or(0)
    }

    #[test]
    fn scan_serves_from_cache_and_revalidates_replaced_zip() {
        let dir = unique_dir("revalidate");
        let zip = dir.join("ModA_1.0.0.zip");
        write_zip(&zip, r#"{"name":"ModA","version":"1.0.0","factorio_version":"2.0"}"#);
        set_mtime(&zip, 1_700_000_000);
        let cache = ZipInfoCache::new();

        let s1 = scan_installed(&dir, &cache);
        assert_eq!(s1.mods.len(), 1);
        assert_eq!(s1.mods[0].version, "1.0.0");
        assert_eq!(cached_len(&cache, &dir), 1, "first scan populates the cache");

        // Warm cache: same file, nothing changed.
        let s2 = scan_installed(&dir, &cache);
        assert_eq!(s2.mods[0].version, "1.0.0");

        // Replace the zip (same name, different content) with a bumped mtime:
        // the (mtime, len) key must invalidate the entry.
        write_zip(&zip, r#"{"name":"ModA","version":"9.9.9","factorio_version":"2.0"}"#);
        set_mtime(&zip, 1_700_000_100);
        let s3 = scan_installed(&dir, &cache);
        assert_eq!(s3.mods[0].version, "9.9.9", "replaced zip must be re-read");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_prunes_entries_of_deleted_zips() {
        let dir = unique_dir("prune");
        let a = dir.join("ModA_1.0.0.zip");
        let b = dir.join("ModB_1.0.0.zip");
        write_zip(&a, r#"{"name":"ModA","version":"1.0.0","factorio_version":"2.0"}"#);
        write_zip(&b, r#"{"name":"ModB","version":"1.0.0","factorio_version":"2.0"}"#);
        let cache = ZipInfoCache::new();

        assert_eq!(scan_installed(&dir, &cache).mods.len(), 2);
        fs::remove_file(&a).unwrap();
        let s = scan_installed(&dir, &cache);
        assert_eq!(s.mods.len(), 1);
        assert_eq!(s.mods[0].name, "ModB");
        assert_eq!(cached_len(&cache, &dir), 1, "deleted zip's entry pruned");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_falls_back_for_corrupt_zip_and_caches_the_problem() {
        let dir = unique_dir("corrupt");
        let zip = dir.join("BrokenMod_1.2.3.zip");
        fs::write(&zip, b"this is not a zip file").unwrap();
        let cache = ZipInfoCache::new();

        for _ in 0..2 {
            let s = scan_installed(&dir, &cache);
            assert_eq!(s.mods[0].name, "BrokenMod");
            assert_eq!(s.mods[0].version, "1.2.3");
            let problem = s.mods[0].problem.as_deref().unwrap_or_default();
            assert!(problem.contains("not a valid zip"), "problem surfaced: {problem}");
        }

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn parallel_scan_matches_expected_mods() {
        let dir = unique_dir("parallel");
        for i in 0..12 {
            let zip = dir.join(format!("Mod{i:02}_1.0.{i}.zip"));
            write_zip(
                &zip,
                &format!(
                    r#"{{"name":"Mod{i:02}","version":"1.0.{i}","factorio_version":"2.0"}}"#
                ),
            );
        }
        let cache = ZipInfoCache::new();

        // 12 misses ⇒ takes the threaded path; results stay deterministic.
        let s1 = scan_installed(&dir, &cache);
        assert_eq!(s1.mods.len(), 12);
        let names: Vec<&str> = s1.mods.iter().map(|m| m.name.as_str()).collect();
        assert_eq!(names, (0..12).map(|i| format!("Mod{i:02}")).collect::<Vec<_>>());
        for (i, m) in s1.mods.iter().enumerate() {
            assert_eq!(m.version, format!("1.0.{i}"));
        }

        // Second scan (warm cache) must agree exactly (Debug for field-wise
        // equality; InstalledMod deliberately doesn't derive PartialEq).
        let s2 = scan_installed(&dir, &cache);
        let debug = |s: &super::InstalledSnapshot| {
            s.mods.iter().map(|m| format!("{m:?}")).collect::<Vec<_>>()
        };
        assert_eq!(debug(&s1), debug(&s2));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn mod_list_without_mods_array_is_rejected_for_write_and_left_untouched() {
        let dir = unique_dir("bad-shape");

        // `mods` present but not an array.
        let ml = dir.join("mod-list.json");
        let bad_array = r#"{"mods": {"name": "base", "enabled": true}}"#;
        fs::write(&ml, bad_array).unwrap();
        let err = set_enabled(&dir, "ModA", true).unwrap_err();
        assert_eq!(err.kind(), "parse");
        assert!(err.to_string().contains("no 'mods' array"));
        assert_eq!(
            fs::read_to_string(&ml).unwrap(),
            bad_array,
            "malformed mod-list must not be rewritten"
        );

        // `mods` key missing entirely.
        let bad_missing = r#"{"version": 3}"#;
        fs::write(&ml, bad_missing).unwrap();
        let err = set_enabled(&dir, "ModA", true).unwrap_err();
        assert_eq!(err.kind(), "parse");
        assert_eq!(
            fs::read_to_string(&ml).unwrap(),
            bad_missing,
            "malformed mod-list must not be rewritten"
        );

        // The same policy applies to the full-replacement write path.
        fs::write(&ml, bad_array).unwrap();
        assert!(replace_mod_list(&dir, &[("ModA".into(), true)]).is_err());
        assert_eq!(fs::read_to_string(&ml).unwrap(), bad_array);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn decide_mods_dir_respects_configured_directory() {
        let res = decide_mods_dir(Some("  /custom/mods/dir  "), None, None).unwrap();
        assert_eq!(res, PathBuf::from("/custom/mods/dir"));

        let platform = DetectedDir {
            path: "/platform/mods".into(),
            exists: true,
        };
        let res2 = decide_mods_dir(Some("/custom/mods/dir"), Some(&platform), None).unwrap();
        assert_eq!(res2, PathBuf::from("/custom/mods/dir"));
    }

    #[test]
    fn decide_mods_dir_uses_existing_platform_dir_when_unconfigured() {
        let platform = DetectedDir {
            path: "/platform/mods".into(),
            exists: true,
        };
        let res = decide_mods_dir(None, Some(&platform), None).unwrap();
        assert_eq!(res, PathBuf::from("/platform/mods"));
    }

    #[test]
    fn decide_mods_dir_uses_portable_mods_dir_from_detected_game() {
        let platform = DetectedDir {
            path: "/platform/mods".into(),
            exists: false,
        };
        let game = DetectedGame {
            install_dir: "/game".into(),
            exe_path: Some("/game/bin/factorio".into()),
            version: Some("2.0.0".into()),
            target_version: Some("2.0".into()),
            portable_mods_dir: Some("/game/mods".into()),
            source: "standalone".into(),
        };
        let res = decide_mods_dir(None, Some(&platform), Some(&game)).unwrap();
        assert_eq!(res, PathBuf::from("/game/mods"));
    }

    #[test]
    fn decide_mods_dir_uses_platform_dir_when_game_detected_even_if_dir_missing() {
        let platform = DetectedDir {
            path: "/platform/mods".into(),
            exists: false,
        };
        let game = DetectedGame {
            install_dir: "/game".into(),
            exe_path: Some("/game/bin/factorio".into()),
            version: Some("2.0.0".into()),
            target_version: Some("2.0".into()),
            portable_mods_dir: None,
            source: "steam".into(),
        };
        let res = decide_mods_dir(None, Some(&platform), Some(&game)).unwrap();
        assert_eq!(res, PathBuf::from("/platform/mods"));
    }

    #[test]
    fn decide_mods_dir_returns_not_found_when_detection_fails() {
        let platform = DetectedDir {
            path: "/platform/mods".into(),
            exists: false,
        };
        let err = decide_mods_dir(None, Some(&platform), None).unwrap_err();
        assert_eq!(err.kind(), "not_found");
        assert!(err.to_string().contains("Factorio not found"));

        let err2 = decide_mods_dir(None, None, None).unwrap_err();
        assert_eq!(err2.kind(), "not_found");
    }

    #[test]
    fn uninstall_impact_lists_required_dependents_from_zip_info() {
        let dir = unique_dir("uninstall-impact");
        write_zip(
            &dir.join("Lib_1.0.0.zip"),
            r#"{"name":"Lib","version":"1.0.0","factorio_version":"2.0","dependencies":["base"]}"#,
        );
        write_zip(
            &dir.join("Hard_1.0.0.zip"),
            r#"{"name":"Hard","version":"1.0.0","factorio_version":"2.0","dependencies":["Lib >= 1.0.0"]}"#,
        );
        // Optional dependency: survives the removal, must not be listed.
        write_zip(
            &dir.join("Soft_1.0.0.zip"),
            r#"{"name":"Soft","version":"1.0.0","factorio_version":"2.0","dependencies":["? Lib"]}"#,
        );
        let cache = ZipInfoCache::new();

        let impact = uninstall_impact(&dir, "Lib_1.0.0.zip", &cache).unwrap();
        assert_eq!(impact, vec!["Hard".to_string()]);

        // Missing zip still errors like the uninstall path would.
        assert!(uninstall_impact(&dir, "Nope_1.0.0.zip", &cache).is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    // ---- Storage report + orphans (A4) ----

    fn write_mod_list(dir: &Path, entries: &[(&str, bool)]) {
        let arr: Vec<serde_json::Value> = entries
            .iter()
            .map(|(n, en)| json!({ "name": n, "enabled": en }))
            .collect();
        fs::write(
            dir.join(MOD_LIST_FILE),
            serde_json::to_string(&json!({ "mods": arr })).unwrap(),
        )
        .unwrap();
    }

    fn orphan_kinds(report: &StorageReport) -> Vec<(OrphanKind, String)> {
        report
            .orphans
            .iter()
            .map(|o| {
                (
                    o.kind,
                    o.file_name.clone().or(o.mod_name.clone()).unwrap_or_default(),
                )
            })
            .collect()
    }

    /// Fixture: base+ModA enabled, ModB disabled (zip present), GhostMod zip
    /// not referenced, "Vanished" referenced but zip missing, one .part file.
    fn orphan_fixture(tag: &str) -> (PathBuf, Vec<(String, PathBuf)>) {
        let dir = unique_dir(tag);
        let files = [
            ("ModA_1.0.0.zip", r#"{"name":"ModA","version":"1.0.0","factorio_version":"2.0"}"#),
            ("ModB_2.0.0.zip", r#"{"name":"ModB","version":"2.0.0","factorio_version":"2.0"}"#),
            ("GhostMod_1.0.0.zip", r#"{"name":"GhostMod","version":"1.0.0","factorio_version":"2.0"}"#),
        ];
        let mut all: Vec<(String, PathBuf)> = Vec::new();
        for (name, info) in &files {
            let path = dir.join(name);
            write_zip(&path, info);
            all.push((name.to_string(), path));
        }
        let part = dir.join("ModC_1.0.0.zip.part");
        fs::write(&part, b"partial download bytes").unwrap();
        all.push(("ModC_1.0.0.zip.part".to_string(), part));
        write_mod_list(
            &dir,
            &[("base", true), ("ModA", true), ("ModB", false), ("Vanished", true)],
        );
        (dir, all)
    }

    #[test]
    fn storage_report_classifies_all_three_orphan_kinds() {
        let (dir, files) = orphan_fixture("report");
        let cache = ZipInfoCache::new();

        let report = storage_report(&dir, &cache);

        assert_eq!(report.zip_count, 3);
        // Total covers every top-level file: 3 zips + .part + mod-list.json.
        let expected_total: u64 = files
            .iter()
            .map(|(_, p)| fs::metadata(p).unwrap().len())
            .sum::<u64>()
            + fs::metadata(dir.join(MOD_LIST_FILE)).unwrap().len();
        assert_eq!(report.total_size_bytes, expected_total);

        let kinds = orphan_kinds(&report);
        assert_eq!(
            kinds,
            vec![
                (OrphanKind::UnreferencedZip, "GhostMod_1.0.0.zip".to_string()),
                (OrphanKind::MissingEntry, "Vanished".to_string()),
                (OrphanKind::PartDebris, "ModC_1.0.0.zip.part".to_string()),
            ],
            "exactly one orphan of each kind; ModA/ModB zips (enabled and disabled entries) are referenced, base is never missing"
        );

        let orphan_zip_size = fs::metadata(dir.join("GhostMod_1.0.0.zip")).unwrap().len();
        let part_size = fs::metadata(dir.join("ModC_1.0.0.zip.part")).unwrap().len();
        assert_eq!(report.orphan_size_bytes, orphan_zip_size + part_size);

        // Per-mod aggregates include referenced and orphaned zips alike.
        let per_mod: HashMap<String, (u32, u64)> = report
            .per_mod
            .iter()
            .map(|m| (m.name.clone(), (m.file_count, m.size_bytes)))
            .collect();
        assert_eq!(per_mod.get("ModA"), Some(&(1, fs::metadata(dir.join("ModA_1.0.0.zip")).unwrap().len())));
        assert_eq!(per_mod.get("GhostMod"), Some(&(1, orphan_zip_size)));
        assert!(!per_mod.contains_key("base"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clean_orphans_deletes_only_orphans_and_survivors_stay() {
        let (dir, _) = orphan_fixture("clean");
        let cache = ZipInfoCache::new();

        // Sizes must be captured before the clean — the files are gone after.
        let expected_freed = fs::metadata(dir.join("GhostMod_1.0.0.zip")).unwrap().len()
            + fs::metadata(dir.join("ModC_1.0.0.zip.part")).unwrap().len();

        let result = clean_orphans(&dir, &cache).unwrap();
        assert_eq!(result.deleted_count, 2, "orphan zip + .part debris");
        assert_eq!(result.errors.len(), 0);
        assert!(dir.join("ModA_1.0.0.zip").exists(), "referenced (enabled) zip survives");
        assert!(dir.join("ModB_2.0.0.zip").exists(), "zip referenced by a disabled entry survives");
        assert!(dir.join(MOD_LIST_FILE).exists(), "mod-list.json is never touched");
        assert!(!dir.join("GhostMod_1.0.0.zip").exists());
        assert!(!dir.join("ModC_1.0.0.zip.part").exists());
        assert_eq!(result.freed_bytes, expected_freed);
        // mod-list.json content (incl. base) unchanged.
        let raw = fs::read_to_string(dir.join(MOD_LIST_FILE)).unwrap();
        assert!(raw.contains("\"base\""));

        // Second pass: only the missing entry remains reported, nothing deleted.
        let report = storage_report(&dir, &cache);
        assert_eq!(
            orphan_kinds(&report),
            vec![(OrphanKind::MissingEntry, "Vanished".to_string())],
            "missing entries are reported but never deleted"
        );
        let result2 = clean_orphans(&dir, &cache).unwrap();
        assert_eq!(result2.deleted_count, 0);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn storage_report_classifies_nothing_without_a_trustworthy_mod_list() {
        let dir = unique_dir("no-list");
        let zip = dir.join("ModA_1.0.0.zip");
        write_zip(&zip, r#"{"name":"ModA","version":"1.0.0","factorio_version":"2.0"}"#);
        let cache = ZipInfoCache::new();

        // No mod-list.json at all: Factorio defaults to everything enabled, so
        // the zip is in use — nothing is provably orphaned.
        let report = storage_report(&dir, &cache);
        assert!(report.orphans.is_empty());
        assert_eq!(clean_orphans(&dir, &cache).unwrap().deleted_count, 0);
        assert!(zip.exists(), "zip must survive a clean with no reference list");

        // Corrupt JSON: equally untrustworthy.
        fs::write(dir.join(MOD_LIST_FILE), "{not json").unwrap();
        assert!(storage_report(&dir, &cache).orphans.is_empty());

        // Malformed shape (no mods array): same policy as the write paths.
        fs::write(dir.join(MOD_LIST_FILE), r#"{"version": 3}"#).unwrap();
        assert!(storage_report(&dir, &cache).orphans.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unreadable_zip_is_never_classified_orphan() {
        let dir = unique_dir("unreadable");
        write_mod_list(&dir, &[("base", true)]);
        let broken = dir.join("BrokenMod_1.2.3.zip");
        fs::write(&broken, b"this is not a zip file").unwrap();
        let cache = ZipInfoCache::new();

        let report = storage_report(&dir, &cache);
        assert!(
            report.orphans.is_empty(),
            "a corrupt zip's name is only a filename guess — never deletion grounds"
        );
        assert_eq!(clean_orphans(&dir, &cache).unwrap().deleted_count, 0);
        assert!(broken.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicate_versions_aggregate_per_mod_but_are_never_orphans() {
        let dir = unique_dir("dupes");
        let old = dir.join("ModA_1.0.0.zip");
        let new = dir.join("ModA_2.0.0.zip");
        write_zip(&old, r#"{"name":"ModA","version":"1.0.0","factorio_version":"2.0"}"#);
        write_zip(&new, r#"{"name":"ModA","version":"2.0.0","factorio_version":"2.0"}"#);
        write_mod_list(&dir, &[("base", true), ("ModA", true)]);
        let cache = ZipInfoCache::new();

        let report = storage_report(&dir, &cache);
        assert!(report.orphans.is_empty(), "both zips belong to a referenced mod");
        let moda = report.per_mod.iter().find(|m| m.name == "ModA").unwrap();
        assert_eq!(moda.file_count, 2, "duplicate versions surface via the aggregate");
        assert_eq!(
            moda.size_bytes,
            fs::metadata(&old).unwrap().len() + fs::metadata(&new).unwrap().len()
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
