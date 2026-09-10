use std::fs;
use std::path::{Path, PathBuf};

use crate::models::{DetectedDir, ModsDirStatus};

// ---------------------------------------------------------------------------
// Directory auto-detection
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
    // %APPDATA%\Factorio\mods
    dirs::config_dir().map(|d| d.join("Factorio").join("mods"))
}

#[cfg(target_os = "macos")]
fn platform_mods_dir() -> Option<PathBuf> {
    // ~/Library/Application Support/factorio/mods  (lowercase "factorio" is
    // the game's own convention on macOS)
    dirs::home_dir().map(|h| {
        h.join("Library")
            .join("Application Support")
            .join("factorio")
            .join("mods")
    })
}

#[cfg(target_os = "linux")]
fn platform_mods_dir() -> Option<PathBuf> {
    // ~/.factorio/mods
    dirs::home_dir().map(|h| h.join(".factorio").join("mods"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_mods_dir() -> Option<PathBuf> {
    None
}

// ---------------------------------------------------------------------------
// Directory validation
// ---------------------------------------------------------------------------

/// Inspect a candidate mods directory. Read-only: never creates or modifies
/// anything — the downloader will `create_dir_all` on demand (Phase 5).
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
        (count_zips(path), path.join("mod-list.json").is_file())
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

/// Write-probe: can we create (and clean up) a temp file inside this dir?
/// Cross-platform permission checks via metadata are unreliable; this is not.
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

/// Walk up until we find an existing ancestor and test it for writability.
/// If every ancestor up to the root is missing, we can't create anything.
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
                .map(|ext| ext.eq_ignore_ascii_case("zip")) // Windows is case-insensitive
                .unwrap_or(false);
            if p.is_file() && is_zip {
                count += 1;
            }
        }
    }
    count
}
