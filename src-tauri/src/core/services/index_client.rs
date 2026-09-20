use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use futures_util::StreamExt;
use tokio::sync::Semaphore;

use crate::error::AppError;
use crate::models::{ChangelogEntry, IndexHealth, ModDetails, SearchResult};

/// Identifies our client to every server we talk to (politeness + diagnostics).
pub const USER_AGENT: &str = "Axial/0.1 (personal use)";

/// Official mod portal read API (search + metadata). Public, no auth for reads.
pub const PORTAL_API_BASE: &str = "https://mods.factorio.com/api";

/// Site root the API lives under. ASSUMPTION (verified against the live
/// portal): the details endpoint's `thumbnail` is a site-relative path, but
/// the asset itself is served from the dedicated assets host —
/// `https://mods.factorio.com/assets/x.thumb.png` is a 404 while the same
/// path on `assets-mod.factorio.com` returns the image.
pub const PORTAL_ASSETS_BASE: &str = "https://assets-mod.factorio.com";


/// Cache entries older than this are re-fetched.
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
/// Hard cap on cached raw responses (memory guard).
const CACHE_MAX_ENTRIES: usize = 200;
/// Never more than this many upstream requests in flight.
const MAX_CONCURRENT_REQUESTS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortKey {
    Downloads,
    Name,
}

impl SortKey {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim) {
            Some("name") => Self::Name,
            _ => Self::Downloads,
        }
    }

    /// Portal API query params for this sort order.
    /// ASSUMPTION (verified via the Phase 4B checklist / diagnostics probe):
    /// the API accepts `sort` = downloads|title and `order` = asc|desc.
    #[allow(dead_code)]
    pub fn query_params(self) -> [(&'static str, &'static str); 2] {
        match self {
            SortKey::Downloads => [("sort", "downloads"), ("order", "desc")],
            SortKey::Name => [("sort", "title"), ("order", "asc")],
        }
    }
}

#[async_trait]
pub trait IndexClient: Send + Sync {
    async fn search(
        &self,
        query: &str,
        page: u32,
        sort: SortKey,
    ) -> Result<SearchResult, AppError>;

    async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError>;

    /// Fetch details for multiple mods concurrently.
    /// Runs up to 8 fetches in parallel and filters out errors,
    /// returning successful `ModDetails` in requested order.
    async fn bulk_mod_details(&self, names: &[String]) -> Vec<ModDetails> {
        if names.is_empty() {
            return Vec::new();
        }
        let owned_names = names.to_vec();
        let stream = futures_util::stream::iter(owned_names.into_iter().map(|name| async move {
            self.mod_details(&name).await
        }));
        let results: Vec<Result<ModDetails, AppError>> = stream.buffered(8).collect().await;
        results.into_iter().filter_map(|r| r.ok()).collect()
    }

    /// Per-version changelog entries for a mod, newest first. Default impl:
    /// changelog is a portal-HTML-only feature, so index clients that don't
    /// source it (and the test fakes) degrade to an error the UI shows as
    /// "changelog unavailable" instead of forcing every implementor to stub it.
    async fn mod_changelog(&self, _name: &str) -> Result<Vec<ChangelogEntry>, AppError> {
        Err(AppError::NotImplemented(
            "changelog not available for this index client".into(),
        ))
    }

    /// Network + schema diagnostics probe.
    async fn health_check(&self) -> Result<IndexHealth, AppError>;
}

/// Shared HTTP plumbing for all upstream clients: global rate limit + TTL
/// response cache. Cache keys are logical (caller-supplied), decoupled from
/// the URL, since query params are attached via the RequestBuilder.
pub struct CachedHttp {
    http: reqwest::Client,
    permits: Semaphore,
    cache: Mutex<HashMap<String, (Instant, String)>>,
    /// Insertion order side-list: HashMap iteration is arbitrary, so eviction
    /// needs this to remove the oldest entry (FIFO) rather than a random one.
    order: Mutex<VecDeque<String>>,
}

impl CachedHttp {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            permits: Semaphore::new(MAX_CONCURRENT_REQUESTS),
            cache: Mutex::new(HashMap::new()),
            order: Mutex::new(VecDeque::new()),
        }
    }

    /// Start building a GET request.
    pub fn get(&self, url: impl reqwest::IntoUrl) -> reqwest::RequestBuilder {
        self.http.get(url)
    }

    /// The single network entry point: TTL cache + global rate limit +
    /// uniform error mapping (404 -> NotFound, other non-success -> Http).
    pub async fn fetch_text(
        &self,
        cache_key: &str,
        request: reqwest::RequestBuilder,
    ) -> Result<String, AppError> {
        if let Some(hit) = self.cache_get(cache_key) {
            return Ok(hit);
        }

        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| AppError::Http("request limiter is closed".into()))?;

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Network(format!("request failed: {e}")))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| AppError::Network(format!("could not read response body: {e}")))?;

        if !status.is_success() {
            let excerpt: String = body.chars().take(200).collect();
            if status == reqwest::StatusCode::NOT_FOUND {
                return Err(AppError::NotFound(format!("HTTP 404: {excerpt}")));
            }
            return Err(AppError::Http(format!("HTTP {}: {excerpt}", status.as_u16())));
        }

        self.cache_put(cache_key.to_string(), body.clone());
        Ok(body)
    }

    fn cache_get(&self, key: &str) -> Option<String> {
        let mut map = self.cache.lock().ok()?;
        let (at, body) = map.get(key)?;
        if at.elapsed() < CACHE_TTL {
            Some(body.clone())
        } else {
            map.remove(key);
            None
        }
    }

    fn cache_put(&self, key: String, body: String) {
        let Ok(mut map) = self.cache.lock() else { return };
        let Ok(mut order) = self.order.lock() else { return };
        if map.len() >= CACHE_MAX_ENTRIES {
            // Drop expired entries first; their order slots become dangling
            // and are skipped during eviction below.
            map.retain(|_, (at, _)| at.elapsed() < CACHE_TTL);
        }
        if map.len() >= CACHE_MAX_ENTRIES {
            while let Some(oldest) = order.pop_front() {
                if map.remove(&oldest).is_some() {
                    break;
                }
            }
        }
        order.retain(|k| k != &key); // re-inserting refreshes the position
        order.push_back(key.clone());
        map.insert(key, (Instant::now(), body));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    struct MockIndexClient {
        active_requests: Arc<AtomicUsize>,
        max_concurrent: Arc<AtomicUsize>,
        delay: Duration,
    }

    impl MockIndexClient {
        fn new(delay_ms: u64) -> Self {
            Self {
                active_requests: Arc::new(AtomicUsize::new(0)),
                max_concurrent: Arc::new(AtomicUsize::new(0)),
                delay: Duration::from_millis(delay_ms),
            }
        }
    }

    #[async_trait]
    impl IndexClient for MockIndexClient {
        async fn search(&self, _: &str, _: u32, _: SortKey) -> Result<SearchResult, AppError> {
            unimplemented!()
        }

        async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError> {
            if name == "fail" {
                return Err(AppError::NotFound("mod not found".into()));
            }

            let current = self.active_requests.fetch_add(1, Ordering::SeqCst) + 1;
            let mut max = self.max_concurrent.load(Ordering::SeqCst);
            while current > max {
                match self.max_concurrent.compare_exchange_weak(
                    max,
                    current,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                ) {
                    Ok(_) => break,
                    Err(actual) => max = actual,
                }
            }

            if self.delay.as_millis() > 0 {
                tokio::time::sleep(self.delay).await;
            }

            self.active_requests.fetch_sub(1, Ordering::SeqCst);

            Ok(ModDetails {
                name: name.to_string(),
                title: format!("Title {}", name),
                owner: None,
                summary: "summary".into(),
                downloads: Some(100),
                dependencies: vec![],
                releases: vec![],
                thumbnail: None,
            })
        }

        async fn health_check(&self) -> Result<IndexHealth, AppError> {
            unimplemented!()
        }
    }

    #[tokio::test]
    async fn bulk_mod_details_returns_empty_on_empty_input() {
        let client = MockIndexClient::new(0);
        let res = client.bulk_mod_details(&[]).await;
        assert!(res.is_empty());
    }

    #[tokio::test]
    async fn bulk_mod_details_preserves_order_and_filters_failures() {
        let client = MockIndexClient::new(0);
        let names = vec![
            "mod_a".to_string(),
            "fail".to_string(),
            "mod_b".to_string(),
            "mod_c".to_string(),
        ];
        let res = client.bulk_mod_details(&names).await;
        assert_eq!(res.len(), 3);
        assert_eq!(res[0].name, "mod_a");
        assert_eq!(res[1].name, "mod_b");
        assert_eq!(res[2].name, "mod_c");
    }

    #[tokio::test]
    async fn bulk_mod_details_runs_concurrently() {
        let client = MockIndexClient::new(20);
        let names: Vec<String> = (0..10).map(|i| format!("mod_{i}")).collect();

        let start = Instant::now();
        let res = client.bulk_mod_details(&names).await;
        let elapsed = start.elapsed();

        assert_eq!(res.len(), 10);
        // With concurrency 8 and 20ms delay per request, 10 requests finish in ~40ms (2 batches),
        // whereas sequential execution would take 200ms.
        assert!(
            elapsed < Duration::from_millis(150),
            "bulk_mod_details took {:?}, expected < 150ms due to concurrency",
            elapsed
        );
        assert!(
            client.max_concurrent.load(Ordering::SeqCst) > 1,
            "max concurrent requests should be > 1"
        );
    }
}
