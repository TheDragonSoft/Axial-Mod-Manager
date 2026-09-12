//! Auto-detection of a local Factorio installation and its game version.
//!
//! Detection is pure read-only filesystem probing over per-OS candidate
//! directories (Steam libraries via `libraryfolders.vdf`, GOG, standalone).
//! A directory is accepted as an install only when `data/base/info.json`
//! exists — that file is also the version source: the bundled base mod's
//! `version` always matches the running game, so no process spawn is needed.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::core::services::downloader::plausible_version;
use crate::models::{DetectedGame, GameDirStatus};

/// Version source: `<install>/data/base/info.json` — also the "is this an
/// install" gate, so a random folder named "Factorio" can't match.
const BASE_INFO_JSON: &str = "data/base/info.json";

/// Scan the platform's candidate install locations in likelihood order and
/// return the first one that looks like a real Factorio install.
pub fn detect() -> Option<DetectedGame> {
    for (dir, source) in install_candidates() {
        if let Some(game) = inspect_install(&dir, source) {
            return Some(game);
        }
    }
    // Custom locations (e.g. D:\Games\Factorio): the game's own log records
    // the paths it loaded from, so use it to point at the install directly.
    for dir in log_hinted_candidates() {
        if let Some(game) = inspect_install(&dir, "game-log") {
            return Some(game);
        }
    }
    None
}

/// Target Factorio version ("2.0", "1.1", ...) extracted from a base-mod
/// info.json string.
///
/// Parses `version` (falling back to `factorio_version`) and reduces it to
/// the major.minor target shape.
pub fn target_version_from_info_json(raw: &str) -> Option<String> {
    version_from_info_json(raw).as_deref().and_then(target_version_of)
}

/// Detect the target Factorio version ("2.0", "1.1", ...) using the configured
/// install directory if provided, or by probing candidate locations.
pub fn detect_target_version(configured_game_dir: Option<&str>) -> Option<String> {
    if let Some(p) = configured_game_dir {
        if !p.trim().is_empty() {
            return inspect_install(Path::new(p), "custom").and_then(|g| g.target_version);
        }
    }
    detect().and_then(|g| g.target_version)
}

/// Status of a candidate game directory for the Settings UI: plain
/// exists/is-dir facts plus the install summary when the directory passes
/// the data/base/info.json gate.
pub fn dir_status(path: &Path) -> GameDirStatus {
    let exists = path.exists();
    let is_dir = exists && path.is_dir();
    let game = if is_dir { inspect_install(path, "custom") } else { None };
    GameDirStatus {
        path: path.to_string_lossy().into_owned(),
        exists,
        is_dir,
        game,
    }
}

pub fn inspect_install(dir: &Path, source: &'static str) -> Option<DetectedGame> {
    let info_path = dir.join(BASE_INFO_JSON);
    if !info_path.is_file() {
        return None;
    }
    let raw = fs::read_to_string(&info_path).ok();
    let version = raw.as_deref().and_then(version_from_info_json);
    let target_version = raw.as_deref().and_then(target_version_from_info_json);
    let exe = exe_candidates(dir).into_iter().find(|p| p.is_file());
    // Portable (zip) installs keep their mods inside the game directory;
    // flag it when present so Settings can offer it as the mods dir.
    let portable_mods = dir.join("mods");
    Some(DetectedGame {
        install_dir: dir.to_string_lossy().into_owned(),
        exe_path: exe.map(|p| p.to_string_lossy().into_owned()),
        target_version,
        version,
        portable_mods_dir: portable_mods
            .is_dir()
            .then(|| portable_mods.to_string_lossy().into_owned()),
        source: source.to_string(),
    })
}

// ---------------------------------------------------------------------------
// Candidate locations per OS
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn install_candidates() -> Vec<(PathBuf, &'static str)> {
    let pf64: Option<PathBuf> = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let pf32: Option<PathBuf> = std::env::var_os("ProgramFiles(x86)")
        .map(PathBuf::from)
        .or_else(|| pf64.clone());

    let mut out: Vec<(PathBuf, &'static str)> = Vec::new();

    // Steam: fixed roots plus every extra library listed in libraryfolders.vdf
    // (the vdf also lists the root itself; dedup folds the repeat away).
    for root in [pf32.clone(), pf64.clone()].into_iter().flatten().map(|p| p.join("Steam")) {
        for lib in steam_library_dirs(&root) {
            out.push((lib.join("steamapps").join("common").join("Factorio"), "steam"));
        }
        out.push((
            root.join("steamapps").join("common").join("Factorio"),
            "steam",
        ));
    }

    // GOG: Galaxy's library layout plus the classic C:\GOG Games root.
    if let Some(dir) = pf32
        .as_ref()
        .map(|p| p.join("GOG Galaxy").join("Games").join("Factorio"))
    {
        out.push((dir, "gog"));
    }
    out.push((PathBuf::from(r"C:\GOG Games\Factorio"), "gog"));

    // Standalone (direct download / zip extract).
    if let Some(dir) = pf64.as_ref().map(|p| p.join("Factorio")) {
        out.push((dir, "standalone"));
    }
    if let Some(dir) = pf32.as_ref().map(|p| p.join("Factorio")) {
        out.push((dir, "standalone"));
    }

    dedup(out)
}

#[cfg(target_os = "macos")]
fn install_candidates() -> Vec<(PathBuf, &'static str)> {
    let mut out: Vec<(PathBuf, &'static str)> = Vec::new();
    // Standalone .app: data/ and MacOS/factorio live inside Contents/.
    // Lowercase "factorio" is the game's own bundle convention on macOS
    // (same note as mod_store.rs); the FS is case-insensitive anyway.
    if let Some(home) = dirs::home_dir() {
        out.push((
            home.join("Applications").join("factorio.app").join("Contents"),
            "standalone",
        ));
    }
    out.push((
        PathBuf::from("/Applications/factorio.app/Contents"),
        "standalone",
    ));
    // Steam on macOS keeps the same bundle layout inside the library.
    if let Some(home) = dirs::home_dir() {
        let root = home.join("Library").join("Application Support").join("Steam");
        for lib in steam_library_dirs(&root) {
            out.push((
                lib.join("steamapps")
                    .join("common")
                    .join("Factorio")
                    .join("factorio.app")
                    .join("Contents"),
                "steam",
            ));
        }
        out.push((
            root.join("steamapps")
                .join("common")
                .join("Factorio")
                .join("factorio.app")
                .join("Contents"),
            "steam",
        ));
    }
    dedup(out)
}

#[cfg(target_os = "linux")]
fn install_candidates() -> Vec<(PathBuf, &'static str)> {
    let mut out: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        // Steam: native, deck-style flatpak, plus every vdf-listed library.
        for root in [
            home.join(".steam").join("steam"),
            home.join(".local").join("share").join("Steam"),
            home.join(".var")
                .join("app")
                .join("com.valvesoftware.Steam")
                .join(".local")
                .join("share")
                .join("Steam"),
        ] {
            for lib in steam_library_dirs(&root) {
                out.push((
                    lib.join("steamapps").join("common").join("Factorio"),
                    "steam",
                ));
            }
            out.push((root.join("steamapps").join("common").join("Factorio"), "steam"));
        }
        // GOG mojosetup layout: the game itself sits under <game>/game.
        out.push((home.join("GOG Games").join("factorio").join("game"), "gog"));
        // Zip install extracted into the home dir.
        out.push((home.join("factorio"), "standalone"));
    }
    out.push((PathBuf::from("/opt/factorio"), "standalone"));
    dedup(out)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn install_candidates() -> Vec<(PathBuf, &'static str)> {
    Vec::new()
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn exe_candidates(dir: &Path) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        vec![
            dir.join("bin").join("x64").join("factorio.exe"),
            dir.join("bin").join("Win32").join("factorio.exe"),
        ]
    }
    #[cfg(target_os = "macos")]
    {
        vec![dir.join("MacOS").join("factorio")]
    }
    #[cfg(target_os = "linux")]
    {
        vec![dir.join("bin").join("x64").join("factorio")]
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn exe_candidates(_dir: &Path) -> Vec<PathBuf> {
    Vec::new()
}

// ---------------------------------------------------------------------------
// Install location from the game's own log
// ---------------------------------------------------------------------------

/// Factorio's user config dir — the same root that holds the `mods/` folder
/// (see mod_store.rs) plus `factorio-current.log`.
#[cfg(target_os = "windows")]
fn factorio_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("Factorio"))
}

#[cfg(target_os = "macos")]
fn factorio_config_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| {
        h.join("Library")
            .join("Application Support")
            .join("factorio")
    })
}

#[cfg(target_os = "linux")]
fn factorio_config_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".factorio"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn factorio_config_dir() -> Option<PathBuf> {
    None
}

/// Install dirs the game itself reported. `factorio-current.log` (rewritten
/// on every launch) lists `Read data path: <install>/data` and
/// `Binaries path: <install>/bin` — the only reliable trace for installs
/// outside the standard roots.
fn log_hinted_candidates() -> Vec<PathBuf> {
    let Some(cfg) = factorio_config_dir() else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(cfg.join("factorio-current.log")) else {
        return Vec::new();
    };
    parse_log_install_dirs(&raw)
}

/// Extract install dirs from `Read data path:` / `Binaries path:` log lines
/// by stripping the trailing `/data` / `/bin` leaf. "data"/"bin" only count
/// as a path component, so `.../mydata` is not mangled into `.../my`.
fn parse_log_install_dirs(raw: &str) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for line in raw.lines() {
        for (marker, leaf) in [("Read data path:", "data"), ("Binaries path:", "bin")] {
            let Some(idx) = line.find(marker) else {
                continue;
            };
            let Some(stripped) = line[idx + marker.len()..].trim().strip_suffix(leaf) else {
                continue;
            };
            // The character before the leaf must be a separator, else the
            // "leaf" was just the tail of a longer component name.
            if !stripped.ends_with(['/', '\\']) {
                continue;
            }
            let dir = stripped.trim_end_matches(['/', '\\']);
            if !dir.is_empty() && seen.insert(dir.to_string()) {
                out.push(PathBuf::from(dir));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Steam libraryfolders.vdf
// ---------------------------------------------------------------------------

/// Library roots listed by a Steam install's `steamapps/libraryfolders.vdf`.
fn steam_library_dirs(steam_root: &Path) -> Vec<PathBuf> {
    let Ok(raw) = fs::read_to_string(steam_root.join("steamapps").join("libraryfolders.vdf")) else {
        return Vec::new();
    };
    parse_library_folders_vdf(&raw)
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

/// Tolerant line scanner: a `"path"` key followed by a quoted value anywhere
/// in the file counts as a library; the rest of the VDF grammar is ignored.
/// Windows VDFs escape backslashes (`\\`), which are unfolded here.
fn parse_library_folders_vdf(raw: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in raw.lines() {
        let tokens: Vec<&str> = line.split('"').collect();
        let Some(i) = tokens.iter().position(|t| *t == "path") else {
            continue;
        };
        // Normal layout: "path" <gap> "value" ⇒ value at i+2. A missing gap
        // ("path""value") shifts it to i+1; accept the first usable one.
        let value = tokens
            .get(i + 2)
            .filter(|v| !v.trim().is_empty())
            .or_else(|| tokens.get(i + 1))
            .filter(|v| !v.trim().is_empty());
        if let Some(v) = value {
            let unescaped = v.replace("\\\\", "\\");
            if !unescaped.is_empty() {
                paths.push(unescaped);
            }
        }
    }
    paths
}

// ---------------------------------------------------------------------------
// Version parsing
// ---------------------------------------------------------------------------

/// Game version from a base-mod info.json. `version` is authoritative (it
/// always matches the running game); `factorio_version` is the tolerant
/// fallback and already has the target (major.minor) shape.
fn version_from_info_json(raw: &str) -> Option<String> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let take = |key: &str| {
        v.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| plausible_version(s))
            .map(String::from)
    };
    take("version").or_else(|| take("factorio_version"))
}

/// "2.0.28" → "2.0": the portal's factorio_version shape used for compat
/// filtering. Requires two leading numeric components.
fn target_version_of(full: &str) -> Option<String> {
    let mut parts = full.split('.');
    let major = parts.next()?;
    let minor = parts.next()?;
    if major.is_empty()
        || minor.is_empty()
        || !major.chars().all(|c| c.is_ascii_digit())
        || !minor.chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    Some(format!("{major}.{minor}"))
}

fn dedup(cands: Vec<(PathBuf, &'static str)>) -> Vec<(PathBuf, &'static str)> {
    let mut seen = HashSet::new();
    cands.into_iter()
        .filter(|(p, _)| seen.insert(p.to_string_lossy().into_owned()))
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{
        parse_library_folders_vdf, parse_log_install_dirs, target_version_from_info_json,
        target_version_of, version_from_info_json,
    };

    #[test]
    fn extracts_target_version_from_info_json_fixture() {
        let raw = r#"{
            "name": "base",
            "version": "2.0.28",
            "title": "Base game",
            "factorio_version": "2.0"
        }"#;
        assert_eq!(target_version_from_info_json(raw).as_deref(), Some("2.0"));
    }

    #[test]
    fn extracts_target_version_from_legacy_fixture() {
        let raw = r#"{
            "name": "base",
            "version": "1.1.110",
            "title": "Base game"
        }"#;
        assert_eq!(target_version_from_info_json(raw).as_deref(), Some("1.1"));
    }

    #[test]
    fn extracts_target_version_fallback_to_factorio_version() {
        let raw = r#"{
            "name": "base",
            "factorio_version": "1.1"
        }"#;
        assert_eq!(target_version_from_info_json(raw).as_deref(), Some("1.1"));
    }

    #[test]
    fn target_version_rejects_malformed_fixture() {
        assert_eq!(target_version_from_info_json("invalid json"), None);
        assert_eq!(target_version_from_info_json(r#"{"name": "base"}"#), None);
        assert_eq!(target_version_from_info_json(r#"{"version": "invalid"}"#), None);
    }

    #[test]
    fn reads_game_version_from_base_info_json() {
        let raw = r#"{
            "name": "base",
            "version": "2.0.28",
            "title": "Base game",
            "factorio_version": "2.0"
        }"#;
        assert_eq!(version_from_info_json(raw).as_deref(), Some("2.0.28"));
    }

    #[test]
    fn falls_back_to_factorio_version_field() {
        let raw = r#"{ "name": "base", "factorio_version": "1.1" }"#;
        assert_eq!(version_from_info_json(raw).as_deref(), Some("1.1"));
    }

    #[test]
    fn rejects_broken_info_json() {
        assert_eq!(version_from_info_json("not json"), None);
        assert_eq!(version_from_info_json(r#"{ "version": 3 }"#), None);
        assert_eq!(version_from_info_json(r#"{ "name": "base" }"#), None);
        assert_eq!(version_from_info_json(r#"{ "version": "../evil" }"#), None);
    }

    #[test]
    fn extracts_major_minor_target() {
        assert_eq!(target_version_of("2.0.28").as_deref(), Some("2.0"));
        assert_eq!(target_version_of("1.1.110").as_deref(), Some("1.1"));
        assert_eq!(target_version_of("0.18.47").as_deref(), Some("0.18"));
        assert_eq!(target_version_of("2.0").as_deref(), Some("2.0"));
        assert_eq!(target_version_of("2"), None);
        assert_eq!(target_version_of("x.y.z"), None);
        assert_eq!(target_version_of(""), None);
    }

    #[test]
    fn parses_library_folders_vdf() {
        let raw = "
\"libraryfolders\"
{
\t\"0\"
\t{
\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"
\t}
\t\"1\"
\t{
\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"
\t}
}
";
        assert_eq!(
            parse_library_folders_vdf(raw),
            vec![
                "C:\\Program Files (x86)\\Steam".to_string(),
                "D:\\SteamLibrary".to_string(),
            ]
        );
    }

    #[test]
    fn vdf_scanner_tolerates_unrelated_keys() {
        let raw = "{\"contentid\" \"1\"\n\"path\" \"/home/user/.local/share/Steam\"\n";
        assert_eq!(
            parse_library_folders_vdf(raw),
            vec!["/home/user/.local/share/Steam".to_string()]
        );
    }

    #[test]
    fn extracts_install_dirs_from_game_log() {
        let raw = "\
0.010 2026-09-10 12:00:00; Factorio 2.0.72 (build 68123, win64, steam)
0.010 Operating system: Windows 11
0.010 Config path: C:/Users/me/AppData/Roaming/Factorio/config/config.ini
0.010 Read data path: D:/Games/Factorio/data
0.010 Write data path: C:/Users/me/AppData/Roaming/Factorio [124892/350381MB]
0.010 Binaries path: D:/Games/Factorio/bin
3.174 Loading mod core 0.0.0 (data.lua)
";
        assert_eq!(
            parse_log_install_dirs(raw),
            vec![PathBuf::from("D:/Games/Factorio")]
        );
    }

    #[test]
    fn log_scanner_requires_separator_before_leaf() {
        // "mydata" is a full component, not the `data` leaf — such a line
        // yields nothing rather than a mangled install dir.
        let raw = "\
0.010 Read data path: D:/Games/Factorio/data
0.010 Binaries path: D:/Games/Factorio/bin
0.010 Read data path: /opt/factorio2/mydata
";
        assert_eq!(
            parse_log_install_dirs(raw),
            vec![PathBuf::from("D:/Games/Factorio")]
        );
    }
}
