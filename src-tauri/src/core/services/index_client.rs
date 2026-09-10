use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::sync::Semaphore;

use crate::error::AppError;
use crate::models::{IndexHealth, ModDetails, SearchResult};

/// Politeness: identify ourselves to the mirror we're scraping.
pub const USER_AGENT: &str = "FactorioModManager/0.1 (personal use)";

/// The one URL we know for certain (given in the project spec).
const BASE_URL: &str = "https://re146.dev/factorio/mods/en";

/// Cache entries older than this are re-fetched.
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
/// Hard cap on cached raw responses (memory guard).
const CACHE_MAX_ENTRIES: usize = 200;
/// Never more than this many requests in flight against the index.
const MAX_CONCURRENT_REQUESTS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortKey {
    Downloads,
    Name,
}

impl SortKey {
    /// Parse the frontend's string arg; unknown values fall back to downloads.
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim) {
            Some("name") => Self::Name,
            _ => Self::Downloads,
        }
    }
}

/// Source-agnostic index backend. Implemented today by [`Re146Client`];
/// swappable later (official portal API, offline cache…) without touching
/// commands or UI.
#[async_trait]
pub trait IndexClient: Send + Sync {
    async fn search(
        &self,
        query: &str,
        page: u32,
        sort: SortKey,
    ) -> Result<SearchResult, AppError>;

    async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError>;

    /// Network-layer diagnostics: fetch the base page and report shape only.
    async fn health_check(&self) -> Result<IndexHealth, AppError>;
}

pub struct Re146Client {
    http: reqwest::Client,
    permits: Semaphore,
    cache: Mutex<HashMap<String, (Instant, String)>>,
}

impl Re146Client {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            permits: Semaphore::new(MAX_CONCURRENT_REQUESTS),
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// The single network entry point: TTL cache + global rate limit.
    /// Every upstream request in the app flows through here.
    async fn fetch_text(&self, url: &str) -> Result<String, AppError> {
        // 1. Cache lookup (lock is never held across an .await).
        if let Some(hit) = self.cache_get(url) {
            return Ok(hit);
        }

        // 2. Rate limit.
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| AppError::Http("request limiter is closed".into()))?;

        // 3. Fetch.
        let body = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::Http(format!("GET {url} failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Http(format!("GET {url} failed: {e}")))?
            .text()
            .await
            .map_err(|e| AppError::Http(format!("GET {url}: could not read body: {e}")))?;

        self.cache_put(url.to_string(), body.clone());
        Ok(body)
    }

    fn cache_get(&self, url: &str) -> Option<String> {
        let mut map = self.cache.lock().ok()?;
        let (at, body) = map.get(url)?;
        if at.elapsed() < CACHE_TTL {
            Some(body.clone())
        } else {
            map.remove(url);
            None
        }
    }

    fn cache_put(&self, url: String, body: String) {
        let Ok(mut map) = self.cache.lock() else { return };
        if map.len() >= CACHE_MAX_ENTRIES {
            map.retain(|_, (at, _)| at.elapsed() < CACHE_TTL);
        }
        if map.len() >= CACHE_MAX_ENTRIES {
            if let Some(oldest) = map.keys().next().cloned() {
                map.remove(&oldest);
            }
        }
        map.insert(url, (Instant::now(), body));
    }
}

#[async_trait]
impl IndexClient for Re146Client {
    // -----------------------------------------------------------------
    // DISCOVERY-GATED (Phase 4B): only these two bodies change next round.
    // -----------------------------------------------------------------
    async fn search(
        &self,
        _query: &str,
        _page: u32,
        _sort: SortKey,
    ) -> Result<SearchResult, AppError> {
        Err(AppError::NotImplemented(
            "index adapter pending — waiting on Phase 4B discovery data (re146.dev request structure)".into(),
        ))
    }

    async fn mod_details(&self, _name: &str) -> Result<ModDetails, AppError> {
        Err(AppError::NotImplemented(
            "index adapter pending — waiting on Phase 4B discovery data (re146.dev request structure)".into(),
        ))
    }

    // Fully live in 4A: proves reqwest + rustls + UA + rate limit + cache.
    async fn health_check(&self) -> Result<IndexHealth, AppError> {
        let body = self.fetch_text(BASE_URL).await?;
        Ok(IndexHealth {
            url: BASE_URL.to_string(),
            ok: true,
            http_status: Some(200),
            byte_length: body.len(),
            excerpt: body.chars().take(400).collect(),
        })
    }
}
