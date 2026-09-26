use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use crate::core::services::portal_client::{encode_path_component, plausible_name};
use crate::error::AppError;
use crate::models::{InstalledChangedPayload, InstalledChangedReason};

/// Third-party mirror serving mod zips (per user's discovery report).
const STORAGE_BASE: &str = "https://mods-storage.re146.dev";
const MAX_CONCURRENT_DOWNLOADS: usize = 3;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(120);
/// Automatic retries for transient failures (network blips, 429, 5xx).
const MAX_ATTEMPTS: u32 = 3;

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

#[derive(Debug)]
enum JobFail {
    Cancelled,
    /// (message, transient) — transient failures are retried with backoff.
    Error(String, bool),
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
        let guard = self.handles.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(flag) = guard.get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    /// True if any queued or active job targets this mod name (any version).
    pub fn is_busy(&self, mod_name: &str) -> bool {
        self.in_flight
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .iter()
            .any(|key| key.split('|').next() == Some(mod_name))
    }

    /// True if any downloads are queued or in flight.
    pub fn has_active_jobs(&self) -> bool {
        !self
            .in_flight
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .is_empty()
    }

    /// Register a download and return immediately with its queued item.
    /// Progress/completion is delivered via "download-updated" events.
    /// `expected_sha1` is the portal-published hash of the release zip;
    /// None (or an unusable value) degrades to the zip-structure check only.
    pub async fn enqueue(
        self: Arc<Self>,
        app: AppHandle,
        mods_dir: PathBuf,
        mod_name: String,
        version: String,
        expected_sha1: Option<String>,
    ) -> Result<DownloadUpdate, AppError> {
        let mod_name = mod_name.trim().to_string();
        let version = version.trim().to_string();
        if !plausible_name(&mod_name) {
            return Err(AppError::Config(format!("invalid mod name: {mod_name:?}")));
        }
        if !plausible_version(&version) {
            return Err(AppError::Config(format!("invalid version: {version:?}")));
        }
        let expected_sha1 = normalize_expected_sha1(expected_sha1);

        let ensure_dir = mods_dir.clone();
        tauri::async_runtime::spawn_blocking(move || std::fs::create_dir_all(&ensure_dir))
            .await
            .map_err(|e| AppError::Parse(format!("background task failed: {e}")))??;

        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        tracing::info!(id, mod = %mod_name, %version, "download enqueued");

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
            tracing::info!(id, mod = %mod_name, %version, "already installed — nothing to do");
            // If an orphan .part file was left on disk (e.g. from a previous crash right after rename), remove it.
            let part = mods_dir.join(format!("{mod_name}_{version}.zip.part"));
            let _ = std::fs::remove_file(part);
            let done = DownloadUpdate { status: "completed", ..base.clone() };
            let _ = app.emit("download-updated", &done);
            return Ok(done);
        }

        let key = format!("{mod_name}|{version}");
        {
            let mut in_flight = self.in_flight.lock().unwrap_or_else(|p| p.into_inner());
            if in_flight.contains(&key) {
                tracing::warn!(id, mod = %mod_name, %version, "rejected: already in queue");
                return Err(AppError::Config(format!(
                    "{mod_name} {version} is already in the download queue"
                )));
            }
            if in_flight.iter().any(|k| k.split('|').next() == Some(&mod_name)) {
                tracing::warn!(id, mod = %mod_name, %version, "rejected: another version is already downloading");
                return Err(AppError::Config(format!(
                    "{mod_name} is already in the download queue"
                )));
            }
            in_flight.insert(key);
        }

        let flag = Arc::new(AtomicBool::new(false));
        self.handles
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(id, flag.clone());

        let _ = app.emit("download-updated", &base);

        tauri::async_runtime::spawn(async move {
            let done = run_job(&self, &app, &flag, mods_dir, mod_name, version, expected_sha1, id).await;
            self.handles.lock().unwrap_or_else(|p| p.into_inner()).remove(&id);
            self.in_flight
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .remove(&format!("{}|{}", done.mod_name, done.version));
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
    expected_sha1: Option<String>,
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
    let job_start = Instant::now();
    let _ = app.emit("download-updated", &item); // now "downloading"

    let url = format!(
        "{STORAGE_BASE}/{}/{}.zip?anticache={}",
        encode_path_component(&item.mod_name),
        encode_path_component(&item.version),
        anticache_token()
    );
    let part = mods_dir.join(format!("{}_{}.zip.part", item.mod_name, item.version));

    // Attempt loop: transient failures retry with exponential backoff.
    let mut outcome: Result<u64, JobFail> = Err(JobFail::Error("no attempt made".into(), false));
    for attempt in 1..=MAX_ATTEMPTS {
        if cancel.load(Ordering::SeqCst) {
            outcome = Err(JobFail::Cancelled);
            break;
        }
        if attempt > 1 {
            // Reset the visible progress for the new attempt.
            let _ = app.emit(
                "download-updated",
                &DownloadUpdate { received: 0, total: 0, ..item.clone() },
            );
        }
        match download_and_verify(&queue.http, cancel, &url, &part, app, &item, expected_sha1.as_deref()).await {
            Ok(total) => {
                outcome = Ok(total);
                break;
            }
            Err(JobFail::Cancelled) => {
                outcome = Err(JobFail::Cancelled);
                break;
            }
            Err(JobFail::Error(e, false)) => {
                tracing::error!(id, mod = %item.mod_name, version = %item.version, "download failed (permanent): {e}");
                outcome = Err(JobFail::Error(e, false));
                break;
            }
            Err(JobFail::Error(e, true)) if attempt < MAX_ATTEMPTS => {
                let wait = Duration::from_secs(2u64.saturating_pow(attempt)); // 2s, 4s
                tracing::warn!(id, attempt, "transient download failure, retrying in {wait:?}: {e}");
                tokio::time::sleep(wait).await;
            }
            Err(JobFail::Error(e, true)) => {
                tracing::error!(id, attempts = MAX_ATTEMPTS, "download failed after {MAX_ATTEMPTS} attempts: {e}");
                outcome = Err(JobFail::Error(format!("{e} (after {MAX_ATTEMPTS} attempts)"), false));
                break;
            }
        }
    }

    match outcome {
        Ok(total) => {
            // One zip per mod name: remove other versions before the rename.
            let dest_name = format!("{}_{}.zip", item.mod_name, item.version);
            let rm = (
                mods_dir.clone(),
                dest_name.clone(),
                item.mod_name.clone(),
            );
            let _ = tauri::async_runtime::spawn_blocking(move || {
                remove_other_versions(&rm.0, &rm.1, &rm.2)
            })
            .await;
            let dest = mods_dir.join(dest_name);
            match tokio::fs::rename(&part, &dest).await {
                Ok(()) => {
                    let elapsed = job_start.elapsed();
                    let mbps = if elapsed.as_secs_f64() > 0.0 {
                        (total as f64 / 1_048_576.0) / elapsed.as_secs_f64()
                    } else {
                        0.0
                    };
                    tracing::info!(
                        id,
                        mod = %item.mod_name,
                        version = %item.version,
                        bytes = total,
                        duration_ms = elapsed.as_millis(),
                        mbps = format!("{mbps:.2}"),
                        "download completed"
                    );
                    item.status = "completed";
                    item.received = total;
                    item.total = total;
                    // Reference the landed zip in mod-list.json (enabled) so a
                    // fresh standalone install is not classified as an
                    // unreferenced orphan before the game next launches. Pack
                    // activations already wrote their target state, so their
                    // entries exist and this is a no-op. Best-effort: a corrupt
                    // mod-list.json must not fail a finished download.
                    {
                        let dir = mods_dir.clone();
                        let name = item.mod_name.clone();
                        match tauri::async_runtime::spawn_blocking(move || {
                            crate::core::services::mod_store::ensure_mod_entry(&dir, &name)
                        })
                        .await
                        {
                            Ok(Ok(())) => {}
                            Ok(Err(e)) => tracing::warn!(
                                mod = %item.mod_name,
                                "could not add mod-list.json entry after download: {e}"
                            ),
                            Err(e) => tracing::warn!(
                                mod = %item.mod_name,
                                "could not add mod-list.json entry after download: {e}"
                            ),
                        }
                    }
                    let _ = app.emit(
                        "installed-changed",
                        InstalledChangedPayload {
                            reason: InstalledChangedReason::Axial,
                        },
                    );
                    crate::core::services::packs::maybe_finalize(app, &item.mod_name).await;
                }
                Err(e) => {
                    tracing::error!(id, "could not finalize install: {e}");
                    item.status = "failed";
                    item.error = Some(format!("could not finalize install: {e}"));
                    crate::core::services::packs::maybe_finalize(app, &item.mod_name).await;
                }
            }
        }
        Err(JobFail::Cancelled) => {
            let _ = tokio::fs::remove_file(&part).await;
            tracing::info!(id, mod = %item.mod_name, "download cancelled");
            item.status = "cancelled";
            crate::core::services::packs::maybe_finalize(app, &item.mod_name).await;
        }
        Err(JobFail::Error(e, _)) => {
            let _ = tokio::fs::remove_file(&part).await;
            item.status = "failed";
            item.error = Some(e);
            crate::core::services::packs::maybe_finalize(app, &item.mod_name).await;
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
    expected_sha1: Option<&str>,
) -> Result<u64, JobFail> {
    if cancel.load(Ordering::SeqCst) {
        return Err(JobFail::Cancelled);
    }

    let response = match http.get(url).send().await {
        Ok(r) => r,
        Err(e) => return Err(JobFail::Error(format!("request failed: {e}"), true)),
    };
    let status = response.status();
    if !status.is_success() {
        // 429 / 5xx are worth retrying; 4xx means the request itself is wrong.
        let transient =
            status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
        return Err(JobFail::Error(
            format!(
                "HTTP {} — download server rejected the request (check mod name/version)",
                status.as_u16()
            ),
            transient,
        ));
    }
    let total = response.content_length().unwrap_or(0);

    let mut file = match tokio::fs::File::create(part).await {
        Ok(f) => f,
        Err(e) => return Err(JobFail::Error(format!("could not create part file: {e}"), false)),
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
            Some(Err(e)) => return Err(JobFail::Error(format!("transfer failed: {e}"), true)),
            None => break,
        };
        if let Err(e) = file.write_all(&chunk).await {
            return Err(JobFail::Error(format!("write failed: {e}"), false));
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
        return Err(JobFail::Error(format!("write failed: {e}"), false));
    }
    drop(file);

    verify_downloaded_file(part, &item.mod_name, &item.version, expected_sha1).await?;

    Ok(if total == 0 { received } else { total })
}

/// Sync zip verification moved off the async runtime (TOC parse of a large
/// zip stalls a tokio worker).
async fn verify_mod_zip(
    path: &Path,
    expected_name: &str,
    expected_version: &str,
) -> Result<(), AppError> {
    let path = path.to_path_buf();
    let expected_name = expected_name.to_string();
    let expected_version = expected_version.to_string();
    tauri::async_runtime::spawn_blocking(move || verify_mod_zip_sync(&path, &expected_name, &expected_version))
        .await
        .map_err(|e| AppError::Parse(format!("verification task failed: {e}")))?
}

/// Open the downloaded zip in-memory and confirm info.json matches what we
/// asked for. Catches truncation, HTML error pages, and wrong-file responses.
fn verify_mod_zip_sync(path: &Path, expected_name: &str, expected_version: &str) -> Result<(), AppError> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Parse(format!("downloaded file is not a valid zip: {e}")))?;

    let mut info_json: Option<(String, String)> = None;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| AppError::Parse(format!("zip read error: {e}")))?;
        let entry_name = entry.name();
        let is_info_json = entry_name == "info.json"
            || entry_name.ends_with("/info.json")
            || entry_name.ends_with("\\info.json");
        if !entry.is_dir() && is_info_json {
            let name = entry_name.to_string();
            let mut s = String::new();
            // Bound decompressed read to 1 MB to prevent Zip Bomb / OOM DoS
            std::io::Read::read_to_string(&mut entry.take(1_048_576), &mut s)
                .map_err(|e| AppError::Parse(format!("could not read info.json: {e}")))?;
            let is_root = name == "info.json";
            info_json = Some((name, s));
            if is_root {
                break;
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
    let ver = v
        .get("version")
        .and_then(|x| x.as_str())
        .ok_or_else(|| AppError::Parse("info.json has no 'version' field".into()))?;
    if ver != expected_version {
        return Err(AppError::Parse(format!(
            "zip is version {ver}, expected {expected_version}"
        )));
    }
    Ok(())
}

/// Post-download checks on the `.part` file: zip structure (name/version)
/// first, then — when the portal published a hash for this release — the
/// SHA1 comparison. A hash mismatch is a permanent failure: retrying cannot
/// change the bytes the mirror serves.
async fn verify_downloaded_file(
    part: &Path,
    mod_name: &str,
    version: &str,
    expected_sha1: Option<&str>,
) -> Result<(), JobFail> {
    if let Err(e) = verify_mod_zip(part, mod_name, version).await {
        return Err(JobFail::Error(e.to_string(), false));
    }
    let expected = match expected_sha1.map(str::trim).filter(|s| !s.is_empty()) {
        Some(e) => e,
        None => {
            tracing::warn!(mod = mod_name, %version, "no portal sha1 for this release — verifying zip structure only");
            return Ok(());
        }
    };
    match verify_sha1(part, expected).await {
        Ok(outcome) if outcome.matches => Ok(()),
        Ok(outcome) => Err(JobFail::Error(
            format!(
                "integrity check failed: expected SHA1 {expected}, downloaded file is {}",
                outcome.actual
            ),
            false,
        )),
        Err(e) => Err(JobFail::Error(format!("integrity check failed: {e}"), false)),
    }
}

/// Trim + shape-check the portal-published hash. A malformed expectation
/// means our upstream assumption broke — not that the file is tampered — so
/// degrade to "no expectation" instead of permanently failing every download
/// of the affected mod.
fn normalize_expected_sha1(raw: Option<String>) -> Option<String> {
    let t = raw?.trim().to_ascii_lowercase();
    if t.is_empty() {
        return None;
    }
    if t.len() != 40 || !t.chars().all(|c| c.is_ascii_hexdigit()) {
        tracing::warn!(expected = %t, "ignoring malformed expected sha1");
        return None;
    }
    Some(t)
}

/// Result of comparing a file's actual SHA1 against the expected digest.
struct Sha1Outcome {
    matches: bool,
    /// Lowercase hex of the file's digest — reported in failure messages.
    actual: String,
}

/// Sync hash check moved off the async runtime (same reason as verify_mod_zip).
async fn verify_sha1(path: &Path, expected: &str) -> Result<Sha1Outcome, AppError> {
    let path = path.to_path_buf();
    let expected = expected.to_string();
    tauri::async_runtime::spawn_blocking(move || verify_sha1_sync(&path, &expected))
        .await
        .map_err(|e| AppError::Parse(format!("hash task failed: {e}")))?
}

/// Stream-hash `path` (SHA1 over 64 KiB chunks — never loads the whole zip)
/// and compare against `expected`, case-insensitively.
fn verify_sha1_sync(path: &Path, expected: &str) -> Result<Sha1Outcome, AppError> {
    use std::io::Read as _;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha1::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = to_hex(&hasher.finalize());
    Ok(Sha1Outcome {
        matches: actual.eq_ignore_ascii_case(expected.trim()),
        actual,
    })
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut vec = vec![0u8; bytes.len() * 2];
    for (i, &b) in bytes.iter().enumerate() {
        vec[i * 2] = HEX[(b >> 4) as usize];
        vec[i * 2 + 1] = HEX[(b & 0x0f) as usize];
    }
    // SAFETY: HEX contains only ASCII bytes '0'-'9', 'a'-'f', which are valid UTF-8.
    unsafe { String::from_utf8_unchecked(vec) }
}

/// Delete `{name}_*.zip` files whose filename differs from `keep`.
/// Best-effort: a locked file (game running) is skipped silently.
fn remove_other_versions(dir: &Path, keep: &str, mod_name: &str) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)?.flatten() {
        let fname = entry.file_name();
        let fname_str = fname.to_string_lossy();
        if fname_str == keep || !fname_str.to_lowercase().ends_with(".zip") {
            continue;
        }
        let stem = fname_str.strip_suffix(".zip").unwrap_or(&fname_str);
        if let Some((name, _version)) = stem.rsplit_once('_') {
            if name == mod_name {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

pub(crate) fn plausible_version(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn anticache_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("0.{nanos:09}")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// SHA1("abc") — the canonical NIST test vector; pins our hex encoding.
    const ABC_SHA1: &str = "a9993e364706816aba3e25717850c26c9cd0d89d";
    const WRONG_SHA1: &str = "0000000000000000000000000000000000000000";

    /// Per-test scratch dir under the system temp dir, removed on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let path =
                std::env::temp_dir().join(format!("axial-dl-test-{tag}-{}", std::process::id()));
            std::fs::create_dir_all(&path).expect("create scratch dir");
            TempDir(path)
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn write_mod_zip(path: &Path, name: &str, version: &str) {
        use std::io::Write as _;
        let file = std::fs::File::create(path).expect("create zip file");
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("info.json", zip::write::SimpleFileOptions::default())
            .expect("start info.json entry");
        write!(zip, r#"{{"name":"{name}","version":"{version}"}}"#).expect("write info.json");
        zip.finish().expect("finish zip");
    }

    #[test]
    fn sha1_match_passes() {
        let dir = TempDir::new("match");
        let f = dir.path("mod.zip");
        std::fs::write(&f, b"abc").expect("write temp file");
        let out = verify_sha1_sync(&f, ABC_SHA1).expect("hash must compute");
        assert!(out.matches);
        assert_eq!(out.actual, ABC_SHA1);
    }

    #[test]
    fn sha1_comparison_is_case_insensitive() {
        let dir = TempDir::new("case");
        let f = dir.path("mod.zip");
        std::fs::write(&f, b"abc").expect("write temp file");
        let upper = ABC_SHA1.to_ascii_uppercase();
        assert!(verify_sha1_sync(&f, &upper).expect("hash must compute").matches);
    }

    #[test]
    fn sha1_mismatch_reports_actual_hash() {
        let dir = TempDir::new("mismatch");
        let f = dir.path("mod.zip");
        std::fs::write(&f, b"abc").expect("write temp file");
        let out = verify_sha1_sync(&f, WRONG_SHA1).expect("hash must compute");
        assert!(!out.matches);
        assert_eq!(out.actual, ABC_SHA1, "actual digest feeds the error message");
    }

    #[test]
    fn sha1_streams_multi_chunk_files() {
        let dir = TempDir::new("chunks");
        let f = dir.path("big.zip");
        let data = vec![0x5a_u8; 200_000]; // several 64 KiB read chunks
        std::fs::write(&f, &data).expect("write temp file");
        // Oracle value from the same crate; to_hex itself is pinned by the
        // known-vector tests above.
        let expected = to_hex(&Sha1::digest(&data));
        assert!(verify_sha1_sync(&f, &expected).expect("hash must compute").matches);
    }

    #[test]
    fn normalize_expected_sha1_filters_garbage() {
        assert_eq!(normalize_expected_sha1(None), None);
        assert_eq!(normalize_expected_sha1(Some(String::new())), None);
        assert_eq!(normalize_expected_sha1(Some("   ".into())), None);
        assert_eq!(normalize_expected_sha1(Some("not-a-hash".into())), None);
        assert_eq!(normalize_expected_sha1(Some(ABC_SHA1.into())), Some(ABC_SHA1.into()));
        assert_eq!(
            normalize_expected_sha1(Some(ABC_SHA1.to_ascii_uppercase())),
            Some(ABC_SHA1.into()),
            "uppercase input is accepted and folded to lowercase"
        );
    }

    #[tokio::test]
    async fn absent_or_empty_expectation_degrades_to_zip_check_only() {
        let dir = TempDir::new("absent");
        let f = dir.path("mod.zip");
        write_mod_zip(&f, "a-mod", "1.0.0");
        verify_downloaded_file(&f, "a-mod", "1.0.0", None)
            .await
            .expect("no expectation → zip-structure check only");
        verify_downloaded_file(&f, "a-mod", "1.0.0", Some(""))
            .await
            .expect("blank expectation is treated as absent");
    }

    #[tokio::test]
    async fn matching_expectation_passes_after_zip_check() {
        let dir = TempDir::new("pass");
        let f = dir.path("mod.zip");
        write_mod_zip(&f, "a-mod", "1.0.0");
        let actual = verify_sha1_sync(&f, WRONG_SHA1).expect("hash must compute").actual;
        verify_downloaded_file(&f, "a-mod", "1.0.0", Some(&actual))
            .await
            .expect("valid zip + matching hash passes");
    }

    #[tokio::test]
    async fn sha1_mismatch_is_a_permanent_failure() {
        let dir = TempDir::new("permanent");
        let f = dir.path("mod.zip");
        write_mod_zip(&f, "a-mod", "1.0.0");
        let err = verify_downloaded_file(&f, "a-mod", "1.0.0", Some(WRONG_SHA1))
            .await
            .expect_err("mismatched hash must fail");
        match err {
            JobFail::Error(msg, transient) => {
                assert!(!transient, "the mirror's bytes cannot change on retry");
                assert!(msg.contains("integrity check failed"), "message for the queue UI: {msg}");
            }
            JobFail::Cancelled => panic!("expected an error, got Cancelled"),
        }
    }

    #[test]
    fn remove_other_versions_deletes_only_same_mod_and_spares_prefix_matches() {
        let dir = TempDir::new("prefix-isolation");
        let f1 = dir.path("flib_0.14.0.zip");
        let f2 = dir.path("flib_0.13.0.zip");
        let f3 = dir.path("flib_legacy_1.0.0.zip");
        let f4 = dir.path("flib_util_2.0.0.zip");
        let f5 = dir.path("other_1.0.0.zip");

        std::fs::write(&f1, b"keep").unwrap();
        std::fs::write(&f2, b"old").unwrap();
        std::fs::write(&f3, b"legacy").unwrap();
        std::fs::write(&f4, b"util").unwrap();
        std::fs::write(&f5, b"other").unwrap();

        remove_other_versions(&dir.0, "flib_0.14.0.zip", "flib").unwrap();

        assert!(f1.exists(), "keep target must remain");
        assert!(!f2.exists(), "older version of same mod must be deleted");
        assert!(f3.exists(), "mod sharing prefix with underscore must NOT be deleted");
        assert!(f4.exists(), "mod sharing prefix with underscore must NOT be deleted");
        assert!(f5.exists(), "unrelated mod must NOT be deleted");
    }

    #[test]
    fn remove_other_versions_handles_spaces_in_mod_name() {
        let dir = TempDir::new("spaces-isolation");
        let f1 = dir.path("Flow Control_1.0.0.zip");
        let f2 = dir.path("Flow Control_0.9.0.zip");
        let f3 = dir.path("Flow Control Extra_1.0.0.zip");

        std::fs::write(&f1, b"keep").unwrap();
        std::fs::write(&f2, b"old").unwrap();
        std::fs::write(&f3, b"extra").unwrap();

        remove_other_versions(&dir.0, "Flow Control_1.0.0.zip", "Flow Control").unwrap();

        assert!(f1.exists(), "keep target must remain");
        assert!(!f2.exists(), "older version of same mod must be deleted");
        assert!(f3.exists(), "extended mod name with space must NOT be deleted");
    }

    #[test]
    fn verify_mod_zip_sync_ignores_auxiliary_info_json_files() {
        use std::io::Write as _;
        let dir = TempDir::new("aux-info");
        let f = dir.path("mod.zip");

        let file = std::fs::File::create(&f).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        // Write an auxiliary file that ends with "info.json" first
        zip.start_file("docs/extra_info.json", zip::write::SimpleFileOptions::default()).unwrap();
        write!(zip, r#"{{"name":"wrong_mod","version":"0.0.1"}}"#).unwrap();
        // Write the actual info.json
        zip.start_file("info.json", zip::write::SimpleFileOptions::default()).unwrap();
        write!(zip, r#"{{"name":"real_mod","version":"1.2.3"}}"#).unwrap();
        zip.finish().unwrap();

        verify_mod_zip_sync(&f, "real_mod", "1.2.3")
            .expect("should match actual info.json, ignoring docs/extra_info.json");
    }

    #[test]
    fn download_queue_tracks_in_flight_and_active_jobs() {
        let queue = DownloadQueue::new(reqwest::Client::new());
        assert!(!queue.has_active_jobs());
        assert!(!queue.is_busy("my-mod"));

        queue.in_flight.lock().unwrap().insert("my-mod|1.0.0".into());
        assert!(queue.has_active_jobs());
        assert!(queue.is_busy("my-mod"));
        assert!(!queue.is_busy("other-mod"));

        // Poison resilience check
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _g = queue.in_flight.lock().unwrap();
            panic!("simulate poison");
        }));
        // Subsequent calls must not panic
        assert!(queue.has_active_jobs());
        assert!(queue.is_busy("my-mod"));
    }
}
