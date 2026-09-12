//! Factorio process launcher.
//!
//! Spawns the game binary detached directly from the configured or auto-detected
//! installation directory. Factorio runs standalone without requiring the Steam
//! client even for Steam installations.

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

/// Launch Factorio detached from the detected or configured installation.
///
/// Spawns the executable directly via `std::process::Command::spawn` and returns
/// immediately without waiting on the child process.
pub fn launch(config: &Config) -> Result<(), AppError> {
    let install_dir = find_game_install(config)
        .ok_or_else(|| AppError::NotFound("Factorio installation not found".to_string()))?;

    let exe = resolve_executable(&install_dir);
    if !exe.is_file() {
        return Err(AppError::NotFound(format!(
            "Factorio executable not found at {}",
            exe.display()
        )));
    }

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
    use std::path::{Path, PathBuf};

    use super::*;

    #[test]
    fn resolves_windows_executable_path() {
        let install = Path::new(r"C:\Program Files\Factorio");
        let exe = resolve_executable_for_os(install, TargetOs::Windows);
        assert_eq!(
            exe,
            PathBuf::from(r"C:\Program Files\Factorio\bin\x64\factorio.exe")
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
}
