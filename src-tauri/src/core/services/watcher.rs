//! Mods-directory watcher (A1): Factorio itself edits `mod-list.json`
//! (in-game mod toggles, savegame "missing mods" prompts) and users drag zips
//! into the mods dir by hand — without this, Axial's Installed view can
//! silently disagree with disk.
//!
//! Design: `notify` watches the resolved mods directory (non-recursive). FS
//! events are filtered to the two things that matter — `mod-list.json` edits
//! and zip create/delete — debounced until quiescence, then diffed against a
//! cheap fingerprint (mtime + size of `mod-list.json`, zip name set). Only a
//! real fingerprint change triggers a rescan and an `installed-changed` emit
//! with `reason: "external"`.
//!
//! Axial's own writes also produce FS events; they are suppressed by
//! listening to the Axial-side `installed-changed` emits on the same Tauri
//! event bus (Rust listeners receive backend `emit`s) and refreshing the
//! baseline without re-reporting inside a small suppression window. That way
//! the emit sites stay payload-only and all watcher logic lives here.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use notify::{Event as NotifyEvent, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::core::services::mod_store;
use crate::models::{InstalledChangedPayload, InstalledChangedReason};
use crate::state::AppState;

/// Quiescence window before a rescan: file writes and file managers arrive in
/// bursts, and the frontend coalesces rescans at a similar cadence.
const DEBOUNCE: Duration = Duration::from_millis(500);

/// After Axial emits `installed-changed` (reason "axial"), the watcher's own
/// FS events for that same write land within `DEBOUNCE`; ignore external
/// evaluation a little longer than that so Axial's writes are never
/// re-reported as external. A genuine external change landing inside the
/// window still refreshes the baseline and surfaces on the next change.
const AXIAL_SUPPRESS: Duration = Duration::from_millis(2000);

/// Cheap, order-free summary of the mods dir. Fingerprinting is deliberately
/// shallow (no zip reads, no hashing): it runs on every debounced FS burst.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ModsFingerprint {
    /// (mtime, size) of `mod-list.json`; None when it doesn't exist.
    mod_list: Option<(std::time::SystemTime, u64)>,
    /// Bare file names of every `*.zip` in the directory.
    zip_names: BTreeSet<String>,
}

/// Pure diff: whether the two fingerprints describe a different mods-dir
/// state. Unit-tested — the watcher's emit discipline hinges on it.
fn fingerprints_differ(a: &ModsFingerprint, b: &ModsFingerprint) -> bool {
    a != b
}

/// Tolerant by design: a missing or unreadable directory fingerprints as
/// empty, so e.g. the dir being deleted shows up as a (real) change instead
/// of killing the watcher.
fn fingerprint_dir(dir: &Path) -> ModsFingerprint {
    let mut fp = ModsFingerprint::default();
    if let Ok(meta) = std::fs::metadata(dir.join("mod-list.json")) {
        if meta.is_file() {
            fp.mod_list = Some((
                meta.modified().unwrap_or(std::time::UNIX_EPOCH),
                meta.len(),
            ));
        }
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".zip") && entry.path().is_file() {
                fp.zip_names.insert(name);
            }
        }
    }
    fp
}

/// Only `mod-list.json` edits and zip create/delete matter for the installed
/// view. The downloader's `.zip.part` churn is filtered out naturally: the
/// completing rename is reported against the final `.zip` name.
fn is_relevant(event: &NotifyEvent) -> bool {
    event.paths.iter().any(|p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n == "mod-list.json" || n.ends_with(".zip"))
    })
}

struct WatchHandle {
    /// Holding the watcher keeps the watch alive; dropping it (on re-arm)
    /// closes the event channel, which ends the loop task.
    _watcher: notify::RecommendedWatcher,
    mods_dir: PathBuf,
}

static WATCH: OnceLock<Mutex<Option<WatchHandle>>> = OnceLock::new();
static LAST_AXIAL_WRITE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static LISTENERS: OnceLock<()> = OnceLock::new();

fn watch_slot() -> &'static Mutex<Option<WatchHandle>> {
    WATCH.get_or_init(|| Mutex::new(None))
}

fn last_axial_slot() -> &'static Mutex<Option<Instant>> {
    LAST_AXIAL_WRITE.get_or_init(|| Mutex::new(None))
}

/// (Re-)arm the watcher on the currently resolved mods directory. Idempotent:
/// watching the same dir again is a no-op; a different (or unresolvable) dir
/// drops the previous watch first. Called once at startup and after every
/// settings save (via the listener below), since a save can change the
/// resolved mods dir.
pub fn start(app: &AppHandle) {
    // Registered on the first start() and kept for the app's lifetime. Two
    // jobs: every Axial-side `installed-changed` emit records a suppression
    // timestamp (see `evaluate`), and every settings save re-arms the watch —
    // keeping the re-arm here means emit sites and command code stay
    // untouched, and all watcher logic lives in this file.
    if LISTENERS.set(()).is_ok() {
        app.listen("installed-changed", |event| {
            if let Ok(p) = serde_json::from_str::<InstalledChangedPayload>(event.payload()) {
                if p.reason == InstalledChangedReason::Axial {
                    *last_axial_slot().lock().unwrap_or_else(|p| p.into_inner()) = Some(Instant::now());
                }
            }
        });
        let rearm_app = app.clone();
        app.listen("settings-changed", move |_| start(&rearm_app));
    }

    let config = app
        .state::<AppState>()
        .config
        .read()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    let dir = match mod_store::resolve_dir(&config) {
        Ok(d) => d,
        Err(e) => {
            tracing::info!("mods-dir watcher not armed: no mods directory to watch: {e}");
            // Nothing to watch: also drop any watch a previous config armed.
            *watch_slot().lock().unwrap_or_else(|p| p.into_inner()) = None;
            return;
        }
    };

    {
        let slot = watch_slot().lock().unwrap_or_else(|p| p.into_inner());
        if slot.as_ref().is_some_and(|h| h.mods_dir == dir) {
            return;
        }
    }

    // Capture the baseline *before* the watch starts so a change in the gap
    // is reported, not silently absorbed into the baseline.
    let baseline = Arc::new(Mutex::new(fingerprint_dir(&dir)));

    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<NotifyEvent>();
    let mut watcher = match notify::recommended_watcher(move |res: Result<NotifyEvent, notify::Error>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            tracing::error!("could not create mods-dir watcher: {e}");
            return;
        }
    };
    if let Err(e) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
        tracing::error!("could not watch mods dir {:?}: {e}", dir);
        return;
    }

    *watch_slot().lock().unwrap_or_else(|p| p.into_inner()) = Some(WatchHandle {
        _watcher: watcher,
        mods_dir: dir.clone(),
    });

    tauri::async_runtime::spawn(watch_loop(app.clone(), dir, rx, baseline));
}

async fn watch_loop(
    app: AppHandle,
    dir: PathBuf,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<NotifyEvent>,
    baseline: Arc<Mutex<ModsFingerprint>>,
) {
    tracing::info!("watching mods dir for external changes: {:?}", dir);
    loop {
        match rx.recv().await {
            Some(event) => {
                if !is_relevant(&event) {
                    continue;
                }
                // Debounce: keep draining until a full DEBOUNCE passes with
                // no further event (or the channel closes).
                while let Ok(Some(_)) = tokio::time::timeout(DEBOUNCE, rx.recv()).await {}
                evaluate(&app, &dir, &baseline);
            }
            // Channel closed: the watcher was dropped by a re-arm on another
            // directory — this loop's job is done.
            None => {
                tracing::info!("mods-dir watcher stopped ({:?})", dir);
                return;
            }
        }
    }
}

fn evaluate(app: &AppHandle, dir: &Path, baseline: &Mutex<ModsFingerprint>) {
    let current = fingerprint_dir(dir);
    let mut guard = baseline.lock().unwrap_or_else(|p| p.into_inner());
    if !fingerprints_differ(&guard, &current) {
        // The burst never actually changed the state (e.g. metadata churn).
        return;
    }
    *guard = current;

    let suppressed = last_axial_slot()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .is_some_and(|t| t.elapsed() < AXIAL_SUPPRESS);
    if suppressed {
        // Axial's emit site already told the frontend; just acknowledge the
        // new state so the next real change diffs against it.
        tracing::debug!("mods-dir change matches a recent Axial write; not re-reporting");
        return;
    }
    tracing::info!("mods dir changed outside Axial; requesting rescan");
    let _ = app.emit(
        "installed-changed",
        InstalledChangedPayload {
            reason: InstalledChangedReason::External,
        },
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fp(mod_list: Option<(SystemTime, u64)>, zips: &[&str]) -> ModsFingerprint {
        ModsFingerprint {
            mod_list,
            zip_names: zips.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn identical_fingerprints_do_not_differ() {
        let a = fp(Some((UNIX_EPOCH, 128)), &["a_1.0.0.zip", "b_2.0.0.zip"]);
        assert!(!fingerprints_differ(&a, &a.clone()));
    }

    #[test]
    fn mod_list_mtime_change_differs_even_at_same_size() {
        // The in-game toggle flow rewrites mod-list.json in place: mtime is
        // the only signal when the size is unchanged.
        let a = fp(Some((UNIX_EPOCH, 128)), &["a_1.0.0.zip"]);
        let b = fp(Some((UNIX_EPOCH + Duration::from_secs(1), 128)), &["a_1.0.0.zip"]);
        assert!(fingerprints_differ(&a, &b));
    }

    #[test]
    fn mod_list_size_change_differs() {
        let a = fp(Some((UNIX_EPOCH, 128)), &[]);
        let b = fp(Some((UNIX_EPOCH, 256)), &[]);
        assert!(fingerprints_differ(&a, &b));
    }

    #[test]
    fn mod_list_appearing_or_vanishing_differs() {
        let without = fp(None, &[]);
        let with = fp(Some((UNIX_EPOCH, 10)), &[]);
        assert!(fingerprints_differ(&without, &with));
    }

    #[test]
    fn zip_set_changes_differ() {
        let a = fp(Some((UNIX_EPOCH, 10)), &["a_1.0.0.zip"]);
        let added = fp(Some((UNIX_EPOCH, 10)), &["a_1.0.0.zip", "b_2.0.0.zip"]);
        let removed = fp(Some((UNIX_EPOCH, 10)), &[]);
        let renamed = fp(Some((UNIX_EPOCH, 10)), &["a_1.0.1.zip"]);
        assert!(fingerprints_differ(&a, &added));
        assert!(fingerprints_differ(&a, &removed));
        // Version switch = one name swapped for another (same count).
        assert!(fingerprints_differ(&a, &renamed));
    }

    fn unique_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("axial-watcher-test-{tag}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn fingerprint_dir_reads_mod_list_and_zip_names_only() {
        let dir = unique_dir("scan");
        assert_eq!(fingerprint_dir(&dir), ModsFingerprint::default());

        fs::write(dir.join("mod-list.json"), "{\"mods\":[]}").unwrap();
        fs::write(dir.join("a_1.0.0.zip"), b"zip").unwrap();
        // Non-zip clutter must be ignored, including download debris.
        fs::write(dir.join("notes.txt"), b"ignore me").unwrap();
        fs::write(dir.join("b_2.0.0.zip.part"), b"partial").unwrap();

        let fp = fingerprint_dir(&dir);
        assert!(fp.mod_list.is_some());
        assert_eq!(
            fp.zip_names,
            ["a_1.0.0.zip"].iter().map(|s| s.to_string()).collect()
        );

        // A metadata-only rewrite of mod-list.json changes the fingerprint.
        let before = fp;
        fs::write(dir.join("mod-list.json"), "{\"mods\":[],\"x\":1}").unwrap();
        assert!(fingerprints_differ(&before, &fingerprint_dir(&dir)));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn fingerprint_dir_tolerates_missing_directory() {
        let dir = unique_dir("missing");
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(fingerprint_dir(&dir), ModsFingerprint::default());
    }

    #[test]
    fn relevant_events_match_only_mod_list_and_zips() {
        let ev = |paths: Vec<&str>| NotifyEvent {
            kind: notify::event::EventKind::Create(notify::event::CreateKind::File),
            paths: paths.into_iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        };
        assert!(is_relevant(&ev(vec!["mods/mod-list.json"])));
        assert!(is_relevant(&ev(vec!["mods/a_1.0.0.zip"])));
        // The completing rename names both sides; the .zip target matches.
        assert!(is_relevant(&ev(vec![
            "mods/a_1.0.0.zip.part",
            "mods/a_1.0.0.zip"
        ])));
        assert!(!is_relevant(&ev(vec!["mods/a_1.0.0.zip.part"])));
        assert!(!is_relevant(&ev(vec!["mods/notes.txt"])));
        assert!(!is_relevant(&ev(vec![])));
    }
}
