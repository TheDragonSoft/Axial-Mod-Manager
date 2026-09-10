use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::sync::Semaphore;

use crate::error::AppError;
use crate::models::{IndexHealth, ModDetails, SearchResult};

/// Identifies our client to every server we talk to (politeness + diagnostics).
pub const USER_AGENT: &str = "Axial/0.1 (personal use)";

/// Official mod portal read API (search + metadata). Public, no auth for reads.
pub const PORTAL_API_BASE: &str = "https://mods.factorio.com/api";


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
}

impl CachedHttp {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            permits: Semaphore::new(MAX_CONCURRENT_REQUESTS),
            cache: Mutex::new(HashMap::new()),
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
            .map_err(|e| AppError::Http(format!("request failed: {e}")))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| AppError::Http(format!("could not read response body: {e}")))?;

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
        if map.len() >= CACHE_MAX_ENTRIES {
            map.retain(|_, (at, _)| at.elapsed() < CACHE_TTL);
        }
        if map.len() >= CACHE_MAX_ENTRIES {
            if let Some(oldest) = map.keys().next().cloned() {
                map.remove(&oldest);
            }
        }
        map.insert(key, (Instant::now(), body));
    }
}
