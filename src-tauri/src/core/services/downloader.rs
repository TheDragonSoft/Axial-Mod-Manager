use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use crate::core::services::portal_client::{encode_path_component, plausible_name};
use crate::error::AppError;

/// Third-party mirror serving mod zips (per user's discovery report).
const STORAGE_BASE: &str = "https://mods-storage.re146.dev";
const MAX_CONCURRENT_DOWNLOADS: usize = 3;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(120);

/// Event payload for "download-updated" — mirrors the frontend QueueItem.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadUpdate {
    pub id: u64,
    pub mod_name: String,
    pub version: String,
    pub status: &'static str, // queued | downloading | completed | failed | cancelled
    pub received: u64,
    pub total: u64,
    pub error: Option<String>,
}

enum JobFail {
    Cancelled,
    Error(String),
}

pub struct DownloadQueue {
    next_id: AtomicU64,
    handles: Mutex<HashMap<u64, Arc<AtomicBool>>>,
    in_flight: Mutex<HashSet<String>>,
    permits: Arc<Semaphore>,
    http: reqwest::Client,
}

impl DownloadQueue {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            next_id: AtomicU64::new(1),
            handles: Mutex::new(HashMap::new()),
            in_flight: Mutex::new(HashSet::new()),
            permits: Arc::new(Semaphore::new(MAX_CONCURRENT_DOWNLOADS)),
            http,
        }
    }

    /// Flag a running/queued job for cancellation. No-op if already finished.
    pub fn cancel(&self, id: u64) {
        if let Some(flag) = self.handles.lock().expect("queue lock poisoned").get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    /// True if any queued or active job targets this mod name (any version).
    pub fn is_busy(&self, mod_name: &str) -> bool {
        self.in_flight
            .lock()
            .expect("queue lock poisoned")
            .iter()
            .any(|key| key.split('|').next() == Some(mod_name))
    }

    /// Register a download and return immediately with its queued item.
    /// Progress/completion is delivered via "download-updated" events.
    pub async fn enqueue(
        self: Arc<Self>,
        app: AppHandle,
        mods_dir: PathBuf,
        mod_name: String,
        version: String,
    ) -> Result<DownloadUpdate, AppError> {
        let mod_name = mod_name.trim().to_string();
        let version = version.trim().to_string();
        if !plausible_name(&mod_name) {
            return Err(AppError::Config(format!("invalid mod name: {mod_name:?}")));
        }
        if !plausible_version(&version) {
            return Err(AppError::Config(format!("invalid version: {version:?}")));
        }

        std::fs::create_dir_all(&mods_dir)?;

        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let base = DownloadUpdate {
            id,
            mod_name: mod_name.clone(),
            version: version.clone(),
            status: "queued",
            received: 0,
            total: 0,
            error: None,
        };

        let dest = mods_dir.join(format!("{mod_name}_{version}.zip"));
        if dest.exists() {
            // Exact version already installed — nothing to do.
            let done = DownloadUpdate { status: "completed", ..base.clone() };
            let _ = app.emit("download-updated", &done);
            return Ok(done);
        }

        let key = format!("{mod_name}|{version}");
        if !self.in_flight.lock().expect("queue lock poisoned").insert(key) {
            return Err(AppError::Config(format!(
                "{mod_name} {version} is already in the download queue"
            )));
        }

        let flag = Arc::new(AtomicBool::new(false));
        self.handles
            .lock()
            .expect("queue lock poisoned")
            .insert(id, flag.clone());

        let _ = app.emit("download-updated", &base);

        tauri::async_runtime::spawn(async move {
            let done = run_job(&self, &app, &flag, mods_dir, mod_name, version, id).await;
            self.handles.lock().expect("queue lock poisoned").remove(&id);
            self.in_flight.lock().expect("queue lock poisoned").remove(&format!("{}|{}", done.mod_name, done.version));
            let _ = app.emit("download-updated", &done);
        });

        Ok(base)
    }
}

async fn run_job(
    queue: &DownloadQueue,
    app: &AppHandle,
    cancel: &AtomicBool,
    mods_dir: PathBuf,
    mod_name: String,
    version: String,
    id: u64,
) -> DownloadUpdate {
    let mut item = DownloadUpdate {
        id,
        mod_name,
        version,
        status: "downloading",
        received: 0,
        total: 0,
        error: None,
    };

    let _permit = match queue.permits.acquire().await {
        Ok(p) => p,
        Err(_) => {
            item.status = "failed";
            item.error = Some("downloader is shutting down".into());
            return item;
        }
    };
    if cancel.load(Ordering::SeqCst) {
        item.status = "cancelled";
        return item;
    }
    let _ = app.emit("download-updated", &item); // now "downloading"

    let url = format!(
        "{STORAGE_BASE}/{}/{}.zip?anticache={}",
        encode_path_component(&item.mod_name),
        encode_path_component(&item.version),
        anticache_token()
    );
    let part = mods_dir.join(format!("{}_{}.zip.part", item.mod_name, item.version));

    match download_and_verify(&queue.http, cancel, &url, &part, app, &item).await {
        Ok(total) => {
            // One zip per mod name: remove other versions before the rename.
            let dest_name = format!("{}_{}.zip", item.mod_name, item.version);
            let _ = remove_other_versions(&mods_dir, &dest_name, &item.mod_name);
            let dest = mods_dir.join(dest_name);
            match tokio::fs::rename(&part, &dest).await {
                Ok(()) => {
                    item.status = "completed";
                    item.received = total;
                    item.total = total;
                    let _ = app.emit("installed-changed", ());
                    crate::core::services::packs::maybe_finalize(app, &item.mod_name).await;
                }
                Err(e) => {
                    item.status = "failed";
                    item.error = Some(format!("could not finalize install: {e}"));
                }
            }
        }
        Err(JobFail::Cancelled) => {
            let _ = tokio::fs::remove_file(&part).await;
            item.status = "cancelled";
        }
        Err(JobFail::Error(e)) => {
            let _ = tokio::fs::remove_file(&part).await;
            item.status = "failed";
            item.error = Some(e);
        }
    }
    item
}

async fn download_and_verify(
    http: &reqwest::Client,
    cancel: &AtomicBool,
    url: &str,
    part: &Path,
    app: &AppHandle,
    item: &DownloadUpdate,
) -> Result<u64, JobFail> {
    if cancel.load(Ordering::SeqCst) {
        return Err(JobFail::Cancelled);
    }

    let response = match http.get(url).send().await {
        Ok(r) => r,
        Err(e) => return Err(JobFail::Error(format!("request failed: {e}"))),
    };
    let status = response.status();
    if !status.is_success() {
        return Err(JobFail::Error(format!(
            "HTTP {} — download server rejected the request (check mod name/version)",
            status.as_u16()
        )));
    }
    let total = response.content_length().unwrap_or(0);

    let mut file = match tokio::fs::File::create(part).await {
        Ok(f) => f,
        Err(e) => return Err(JobFail::Error(format!("could not create part file: {e}"))),
    };

    let mut stream = response.bytes_stream();
    let mut received: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;

    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(JobFail::Cancelled);
        }
        let chunk = match stream.next().await {
            Some(Ok(c)) => c,
            Some(Err(e)) => return Err(JobFail::Error(format!("transfer failed: {e}"))),
            None => break,
        };
        if let Err(e) = file.write_all(&chunk).await {
            return Err(JobFail::Error(format!("write failed: {e}")));
        }
        received += chunk.len() as u64;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            let _ = app.emit(
                "download-updated",
                &DownloadUpdate { received, total, ..item.clone() },
            );
            last_emit = Instant::now();
        }
    }
    if let Err(e) = file.flush().await {
        return Err(JobFail::Error(format!("write failed: {e}")));
    }
    drop(file);

    if let Err(e) = verify_mod_zip(part, &item.mod_name, &item.version) {
        return Err(JobFail::Error(e.to_string()));
    }

    Ok(if total == 0 { received } else { total })
}

/// Open the downloaded zip in-memory and confirm info.json matches what we
/// asked for. Catches truncation, HTML error pages, and wrong-file responses.
fn verify_mod_zip(path: &Path, expected_name: &str, expected_version: &str) -> Result<(), AppError> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Parse(format!("downloaded file is not a valid zip: {e}")))?;

    let mut info_json: Option<(String, String)> = None; // (entry name, contents)
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Parse(format!("zip read error: {e}")))?;
        if !entry.is_dir() && entry.name().ends_with("info.json") {
            let name = entry.name().to_string();
            let mut s = String::new();
            std::io::Read::read_to_string(&mut entry, &mut s)
                .map_err(|e| AppError::Parse(format!("could not read info.json: {e}")))?;
            let is_root = name == "info.json";
            info_json = Some((name, s));
            if is_root {
                break; // prefer root-level info.json
            }
        }
    }
    let (_, raw) = info_json
        .ok_or_else(|| AppError::Parse("info.json not found inside zip".into()))?;
    let v: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Parse(format!("info.json is not valid JSON: {e}")))?;

    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .ok_or_else(|| AppError::Parse("info.json has no 'name' field".into()))?;
    if !name.eq_ignore_ascii_case(expected_name) {
        return Err(AppError::Parse(format!(
            "zip is for mod {name:?}, expected {expected_name:?}"
        )));
    }
    if let Some(ver) = v.get("version").and_then(|x| x.as_str()) {
        if ver != expected_version {
            return Err(AppError::Parse(format!(
                "zip is version {ver}, expected {expected_version}"
            )));
        }
    }
    Ok(())
}

/// Delete `{name}_*.zip` files whose filename differs from `keep`.
/// Best-effort: a locked file (game running) is skipped silently.
fn remove_other_versions(dir: &Path, keep: &str, mod_name: &str) -> std::io::Result<()> {
    let prefix = format!("{mod_name}_");
    for entry in std::fs::read_dir(dir)?.flatten() {
        let fname = entry.file_name();
        let fname = fname.to_string_lossy();
        if fname != keep && fname.starts_with(&prefix) && fname.to_lowercase().ends_with(".zip") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

pub(crate) fn plausible_version(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

#[allow(dead_code)]
fn encode_component(s: &str) -> String {
    encode_path_component(s)
}

fn anticache_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("0.{nanos:09}")
}
