//! Factorio process launcher.
//!
//! Spawns the game binary detached directly from the configured or auto-detected
//! installation directory. Factorio runs standalone without requiring the Steam
//! client even for Steam installations.

use std::fs;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::core::services::game_detect;
use crate::error::AppError;

/// Supported target operating systems for executable resolution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetOs {
    Windows,
    Linux,
    MacOs,
}

impl TargetOs {
    /// The target operating system compiled for.
    pub const CURRENT: TargetOs = if cfg!(target_os = "windows") {
        TargetOs::Windows
    } else if cfg!(target_os = "macos") {
        TargetOs::MacOs
    } else {
        TargetOs::Linux
    };
}

/// Pure executable path resolution per OS given an installation directory.
///
/// - Windows: `<install>/bin/x64/factorio.exe`
/// - Linux: `<install>/bin/x64/factorio`
/// - macOS: `<install>/Factorio.app/Contents/MacOS/factorio`
///   (also accommodates paths already pointing into `.app` or `Contents`).
pub fn resolve_executable_for_os(install: &Path, os: TargetOs) -> PathBuf {
    match os {
        TargetOs::Windows => install.join("bin").join("x64").join("factorio.exe"),
        TargetOs::Linux => install.join("bin").join("x64").join("factorio"),
        TargetOs::MacOs => {
            let s = install.to_string_lossy();
            if s.ends_with("Contents") || s.ends_with("Contents/") || s.ends_with("Contents\\") {
                install.join("MacOS").join("factorio")
            } else if s.ends_with(".app") || s.ends_with(".app/") || s.ends_with(".app\\") {
                install.join("Contents").join("MacOS").join("factorio")
            } else {
                install
                    .join("Factorio.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("factorio")
            }
        }
    }
}

/// Resolve the Factorio executable path for the current platform.
pub fn resolve_executable(install: &Path) -> PathBuf {
    resolve_executable_for_os(install, TargetOs::CURRENT)
}

/// Find the active Factorio install directory: `config.game_dir` if set,
/// otherwise auto-detected via `game_detect`.
pub fn find_game_install(config: &Config) -> Option<PathBuf> {
    if let Some(p) = config.game_dir.as_deref() {
        if !p.trim().is_empty() {
            return game_detect::inspect_install(Path::new(p), "custom")
                .map(|g| PathBuf::from(g.install_dir));
        }
    }
    game_detect::detect().map(|g| PathBuf::from(g.install_dir))
}

/// Validate that an executable path is safe to launch:
/// 1. The binary file name must strictly be `factorio` or `factorio.exe`.
/// 2. The executable path must exist and be a regular file (`is_file`).
/// 3. The canonicalized executable path must reside inside the canonicalized installation directory.
pub fn validate_executable_path(exe: &Path, install_dir: &Path) -> Result<(), AppError> {
    let file_name = exe
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::NotFound("Invalid executable path name".to_string()))?;

    if file_name != "factorio" && file_name != "factorio.exe" {
        return Err(AppError::NotFound(format!(
            "Invalid Factorio executable name: {file_name}"
        )));
    }

    if !exe.is_file() {
        return Err(AppError::NotFound(format!(
            "Factorio executable not found at {}",
            exe.display()
        )));
    }

    let canonical_exe = fs::canonicalize(exe).map_err(AppError::Io)?;
    let canonical_install = fs::canonicalize(install_dir).map_err(AppError::Io)?;

    if !canonical_exe.starts_with(&canonical_install) {
        return Err(AppError::NotFound(format!(
            "Factorio executable {} is outside install directory {}",
            canonical_exe.display(),
            canonical_install.display()
        )));
    }

    let canonical_file_name = canonical_exe
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::NotFound("Invalid canonical executable path name".to_string()))?;

    if canonical_file_name != "factorio" && canonical_file_name != "factorio.exe" {
        return Err(AppError::NotFound(format!(
            "Invalid canonical Factorio executable name: {canonical_file_name}"
        )));
    }

    Ok(())
}

/// Launch Factorio detached from the detected or configured installation.
///
/// Spawns the executable directly via `std::process::Command::spawn` and returns
/// immediately without waiting on the child process.
pub fn launch(config: &Config) -> Result<(), AppError> {
    let install_dir = find_game_install(config)
        .ok_or_else(|| AppError::NotFound("Factorio installation not found".to_string()))?;

    let exe = resolve_executable(&install_dir);
    validate_executable_path(&exe, &install_dir)?;

    let mut cmd = std::process::Command::new(&exe);
    if let Some(parent) = exe.parent() {
        cmd.current_dir(parent);
    }

    tracing::info!("launching Factorio from {}", exe.display());
    cmd.spawn().map_err(AppError::Io)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn resolves_windows_executable_path() {
        let install = Path::new(r"C:\Program Files\Factorio");
        let exe = resolve_executable_for_os(install, TargetOs::Windows);
        assert_eq!(
            exe,
            Path::new(r"C:\Program Files\Factorio")
                .join("bin")
                .join("x64")
                .join("factorio.exe")
        );
    }

    #[test]
    fn resolves_linux_executable_path() {
        let install = Path::new("/opt/factorio");
        let exe = resolve_executable_for_os(install, TargetOs::Linux);
        assert_eq!(
            exe,
            Path::new("/opt/factorio")
                .join("bin")
                .join("x64")
                .join("factorio")
        );
    }

    #[test]
    fn resolves_macos_executable_path_from_root() {
        let install = Path::new("/Applications");
        let exe = resolve_executable_for_os(install, TargetOs::MacOs);
        assert_eq!(
            exe,
            Path::new("/Applications")
                .join("Factorio.app")
                .join("Contents")
                .join("MacOS")
                .join("factorio")
        );
    }

    #[test]
    fn resolves_macos_executable_path_from_app_bundle() {
        let install = Path::new("/Applications/Factorio.app");
        let exe = resolve_executable_for_os(install, TargetOs::MacOs);
        assert_eq!(
            exe,
            Path::new("/Applications/Factorio.app")
                .join("Contents")
                .join("MacOS")
                .join("factorio")
        );
    }

    #[test]
    fn resolves_macos_executable_path_from_contents() {
        let install = Path::new("/Applications/Factorio.app/Contents");
        let exe = resolve_executable_for_os(install, TargetOs::MacOs);
        assert_eq!(
            exe,
            Path::new("/Applications/Factorio.app/Contents")
                .join("MacOS")
                .join("factorio")
        );
    }

    #[test]
    fn validates_valid_executable_in_install_dir() {
        let temp_dir = std::env::temp_dir().join(format!(
            "axial-launcher-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let bin_dir = temp_dir.join("bin").join("x64");
        fs::create_dir_all(&bin_dir).unwrap();

        let exe_name = if cfg!(target_os = "windows") {
            "factorio.exe"
        } else {
            "factorio"
        };
        let exe_path = bin_dir.join(exe_name);
        fs::write(&exe_path, "dummy binary").unwrap();

        assert!(validate_executable_path(&exe_path, &temp_dir).is_ok());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_invalid_executable_name() {
        let temp_dir = std::env::temp_dir().join(format!(
            "axial-launcher-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let bin_dir = temp_dir.join("bin").join("x64");
        fs::create_dir_all(&bin_dir).unwrap();
        let exe_path = bin_dir.join("malicious.sh");
        fs::write(&exe_path, "echo evil").unwrap();

        let err = validate_executable_path(&exe_path, &temp_dir).unwrap_err();
        assert!(err.to_string().contains("Invalid Factorio executable name"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_nonexistent_executable() {
        let temp_dir = std::env::temp_dir().join(format!(
            "axial-launcher-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let exe_path = temp_dir.join("bin").join("x64").join("factorio");

        let err = validate_executable_path(&exe_path, &temp_dir).unwrap_err();
        assert!(err.to_string().contains("Factorio executable not found"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_executable_outside_install_dir() {
        let temp_root = std::env::temp_dir().join(format!(
            "axial-launcher-test-outside-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let install_dir = temp_root.join("install");
        let outside_dir = temp_root.join("outside");
        fs::create_dir_all(&install_dir).unwrap();
        fs::create_dir_all(&outside_dir).unwrap();

        let exe_name = if cfg!(target_os = "windows") {
            "factorio.exe"
        } else {
            "factorio"
        };
        let exe_path = outside_dir.join(exe_name);
        fs::write(&exe_path, "dummy binary").unwrap();

        let err = validate_executable_path(&exe_path, &install_dir).unwrap_err();
        assert!(err.to_string().contains("outside install directory"));

        let _ = fs::remove_dir_all(temp_root);
    }
}
