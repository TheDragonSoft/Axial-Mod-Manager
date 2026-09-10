use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::core::services::index_client::{CachedHttp, IndexClient, SortKey, PORTAL_API_BASE};
use crate::error::AppError;
use crate::models::{IndexHealth, ModDetails, ModRelease, ModSummary, SearchResult};

const PAGE_SIZE: u32 = 25;
/// How long the locally-held full mod listing stays fresh.
const DUMP_TTL: Duration = Duration::from_secs(30 * 60);
/// Safety valve: if the server ignores our page size we'd face hundreds of
/// tiny pages — abort rather than hammer the API.
const MAX_PAGES: u32 = 2000;

// ---------------------------------------------------------------------------
// Raw API DTOs — lenient by design; unknown fields are ignored.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct PortalPagination {
    #[serde(default)]
    pub page: u32,
    #[serde(default)]
    pub page_count: u32,
    #[serde(default)]
    pub count: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PortalRelease {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub factorio_version: String,
    #[serde(default)]
    pub released_at: Option<String>,
    #[serde(default, alias = "downloads")]
    pub downloads_count: Option<u64>,
    #[serde(default)]
    pub file_size: Option<u64>,
    #[serde(default)]
    #[allow(dead_code)]
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PortalModListItem {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default, alias = "downloads")]
    pub downloads_count: Option<u64>,
    #[serde(default)]
    pub latest_release: Option<PortalRelease>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PortalSearchResponse {
    #[serde(default)]
    pub pagination: Option<PortalPagination>,
    #[serde(default)]
    pub results: Vec<PortalModListItem>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PortalModDetails {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default, alias = "downloads")]
    pub downloads_count: Option<u64>,
    #[serde(default)]
    pub releases: Vec<PortalRelease>,
}

// ---------------------------------------------------------------------------
// Parsing (pure, unit-tested)
// ---------------------------------------------------------------------------

pub(crate) fn parse_search(raw: &str) -> Result<SearchResult, AppError> {
    let dto: PortalSearchResponse = serde_json::from_str(raw)
        .map_err(|e| AppError::Parse(format!("portal search response: {e}")))?;
    let results: Vec<ModSummary> = dto.results.into_iter().map(map_summary).collect();
    let (page, page_count, total_count) = match dto.pagination {
        Some(p) => (p.page.max(1), p.page_count.max(1), p.count),
        None => (1, 1, results.len() as u64),
    };
    Ok(SearchResult { results, page, page_count, total_count })
}

fn map_summary(item: PortalModListItem) -> ModSummary {
    ModSummary {
        name: item.name,
        title: item.title,
        downloads: item.downloads_count.unwrap_or(0),
        latest_version: item.latest_release.as_ref().map(|r| r.version.clone()).unwrap_or_else(|| "?".into()),
        factorio_version: item.latest_release.as_ref().map(|r| r.factorio_version.clone()).unwrap_or_else(|| "?".into()),
        summary: item.summary,
    }
}

pub(crate) fn parse_details(raw: &str) -> Result<ModDetails, AppError> {
    let dto: PortalModDetails = serde_json::from_str(raw)
        .map_err(|e| AppError::Parse(format!("portal details response: {e}")))?;
    Ok(ModDetails {
        name: dto.name,
        title: dto.title,
        owner: dto.owner,
        summary: dto.summary,
        downloads: dto.downloads_count,
        releases: dto.releases.into_iter().map(map_release).collect(),
    })
}

fn map_release(r: PortalRelease) -> ModRelease {
    ModRelease {
        version: r.version,
        factorio_version: r.factorio_version,
        released_at: r.released_at,
        downloads_count: r.downloads_count,
        file_size: r.file_size,
    }
}

/// Portal names are [A-Za-z0-9 _.-] in practice.
pub fn plausible_name(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
}

/// Percent-encode anything outside the URL-safe set (names may contain spaces).
pub(crate) fn encode_path_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Local search over a cached full listing — replaces server-side q/sort params,
// which do not behave as documented.
// ---------------------------------------------------------------------------

fn filter_sort_page(
    items: &[ModSummary],
    query: &str,
    page: u32,
    sort: SortKey,
    page_size: usize,
) -> (Vec<ModSummary>, u64) {
    let q = query.trim().to_lowercase();
    let mut matched: Vec<&ModSummary> = items
        .iter()
        .filter(|m| {
            q.is_empty()
                || m.name.to_lowercase().contains(&q)
                || m.title.to_lowercase().contains(&q)
                || m.summary.to_lowercase().contains(&q)
        })
        .collect();
    match sort {
        SortKey::Downloads => matched.sort_by(|a, b| {
            b.downloads
                .cmp(&a.downloads)
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        }),
        SortKey::Name => {
            matched.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        }
    }
    let total = matched.len() as u64;
    let page_size = page_size.max(1);
    let start = (page.max(1) as usize - 1) * page_size;
    let slice = if start >= matched.len() {
        Vec::new()
    } else {
        matched[start..(start + page_size).min(matched.len())]
            .iter()
            .map(|m| (*m).clone())
            .collect()
    };
    (slice, total)
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

struct Dump {
    fetched_at: Instant,
    bytes: u64,
    items: Arc<Vec<ModSummary>>,
}

pub struct PortalClient {
    http: CachedHttp,
    dump: Mutex<Option<Arc<Dump>>>,
}

impl PortalClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http: CachedHttp::new(http),
            dump: Mutex::new(None),
        }
    }

    async fn fetch_page(&self, page: u32, size: &str) -> Result<(String, u64), AppError> {
        let url = format!("{PORTAL_API_BASE}/mods");
        let request = self
            .http
            .get(&url)
            .query(&vec![
                ("page", page.to_string()),
                ("page_size", size.to_string()),
            ]);
        let raw = self
            .http
            .fetch_text(&format!("dump|{size}|{page}"), request)
            .await?;
        let len = raw.len() as u64;
        Ok((raw, len))
    }

    /// Download the complete listing. `max` is the documented "everything"
    /// page size; fall back to a large fixed size if it is rejected.
    async fn fetch_dump(&self) -> Result<Dump, AppError> {
        let mut size_str = "max";
        let (first_raw, mut bytes) = loop {
            match self.fetch_page(1, size_str).await {
                Ok(r) => break r,
                Err(e) => {
                    if size_str == "max" {
                        size_str = "25000";
                    } else {
                        return Err(e);
                    }
                }
            }
        };
        let parsed = parse_search(&first_raw)?;
        let page_count = parsed.page_count.min(MAX_PAGES).max(1);
        let mut items = parsed.results;
        let mut page = 1u32;
        while page < page_count {
            page += 1;
            let (raw, size) = self.fetch_page(page, size_str).await?;
            bytes += size;
            let mut p = parse_search(&raw)?;
            items.append(&mut p.results);
        }
        Ok(Dump { fetched_at: Instant::now(), bytes, items: Arc::new(items) })
    }

    /// Fresh dump, or stale dump if refresh fails, or the error.
    async fn load_dump(&self) -> Result<Arc<Dump>, AppError> {
        {
            let cached = self.dump.lock().await;
            if let Some(d) = cached.as_ref() {
                if d.fetched_at.elapsed() < DUMP_TTL {
                    return Ok(Arc::clone(d));
                }
            }
        }
        match self.fetch_dump().await {
            Ok(d) => {
                let arc = Arc::new(d);
                *self.dump.lock().await = Some(Arc::clone(&arc));
                Ok(arc)
            }
            Err(e) => {
                let guard = self.dump.lock().await;
                if let Some(d) = guard.as_ref() {
                    return Ok(Arc::clone(d)); // stale is better than nothing
                }
                Err(e)
            }
        }
    }
}

#[async_trait]
impl IndexClient for PortalClient {
    async fn search(
        &self,
        query: &str,
        page: u32,
        sort: SortKey,
    ) -> Result<SearchResult, AppError> {
        let dump = self.load_dump().await?;
        let (results, total) = filter_sort_page(&dump.items, query, page, sort, PAGE_SIZE as usize);
        let page_count = ((total as usize + PAGE_SIZE as usize - 1) / PAGE_SIZE as usize).max(1) as u32;
        Ok(SearchResult {
            results,
            page: page.max(1),
            page_count,
            total_count: total,
        })
    }

    async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError> {
        let name = name.trim();
        if !plausible_name(name) {
            return Err(AppError::NotFound(format!("invalid mod name: {name:?}")));
        }
        let url = format!("{PORTAL_API_BASE}/mods/{}", encode_path_component(name));
        let request = self.http.get(&url);
        let raw = self.http.fetch_text(&format!("details|{name}"), request).await?;
        parse_details(&raw)
    }

    async fn health_check(&self) -> Result<IndexHealth, AppError> {
        let dump = self.load_dump().await?;
        Ok(IndexHealth {
            url: format!("{PORTAL_API_BASE}/mods?page_size=max"),
            ok: true,
            http_status: Some(200),
            byte_length: dump.bytes as usize,
            excerpt: format!(
                "full mod listing loaded — {} mods parsed ({} KB)",
                dump.items.len(),
                dump.bytes / 1024
            ),
        })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn m(name: &str, title: &str, dl: u64) -> ModSummary {
        ModSummary {
            name: name.into(),
            title: title.into(),
            downloads: dl,
            latest_version: "1.0.0".into(),
            factorio_version: "2.0".into(),
            summary: format!("summary of {name}"),
        }
    }

    const SEARCH_FIXTURE: &str = r#"{
        "pagination": { "page": 2, "page_count": 84, "count": 2081 },
        "results": [
            { "name": "krastorio2", "title": "Krastorio 2", "summary": "A major overhaul.",
              "downloads_count": 1842000,
              "latest_release": { "version": "1.8.1", "factorio_version": "2.0", "file_size": 12345678 } },
            { "name": "old-mod", "title": "Old Mod", "summary": "Legacy field name.", "downloads": 42 }
        ]
    }"#;

    const DETAILS_FIXTURE: &str = r#"{
        "name": "krastorio2", "title": "Krastorio 2", "owner": "Krastor and Darkfrei",
        "summary": "A major overhaul.", "downloads_count": 1842000,
        "category": "overhaul",
        "releases": [
            { "version": "1.8.1", "factorio_version": "2.0", "file_size": 12345678 },
            { "version": "1.3.0", "factorio_version": "1.1", "downloads": 90000 }
        ]
    }"#;

    #[test]
    fn search_parses_pagination_and_results() {
        let r = parse_search(SEARCH_FIXTURE).expect("fixture must parse");
        assert_eq!(r.page, 2);
        assert_eq!(r.page_count, 84);
        assert_eq!(r.total_count, 2081);
        assert_eq!(r.results[0].latest_version, "1.8.1");
        assert_eq!(r.results[0].downloads, 1_842_000);
    }

    #[test]
    fn search_tolerates_legacy_field_names() {
        let r = parse_search(SEARCH_FIXTURE).expect("fixture must parse");
        assert_eq!(r.results[1].downloads, 42);
        assert_eq!(r.results[1].latest_version, "?");
    }

    #[test]
    fn details_parses_releases_and_ignores_unknown_fields() {
        let d = parse_details(DETAILS_FIXTURE).expect("fixture must parse");
        assert_eq!(d.releases.len(), 2);
        assert_eq!(d.releases[0].file_size, Some(12_345_678));
        assert_eq!(d.releases[1].downloads_count, Some(90_000));
    }

    #[test]
    fn name_validation() {
        assert!(!plausible_name(""));
        assert!(!plausible_name("../etc"));
        assert!(plausible_name("even-distribution"));
        assert!(plausible_name("has space"));
        assert!(plausible_name("some_mod_2.5"));
    }

    #[test]
    fn local_search_filters_sorts_paginates() {
        let items = vec![
            m("waterfill", "Waterfill", 100),
            m("krastorio2", "Krastorio 2", 500),
            m("even-distribution", "Even Distribution", 300),
            m("pycoalprocessing", "Pyanodons Coal Processing", 200),
        ];
        let (page1, total) = filter_sort_page(&items, "", 1, SortKey::Downloads, 2);
        assert_eq!(total, 4);
        assert_eq!(page1[0].name, "krastorio2");
        assert_eq!(page1[1].name, "even-distribution");
        let (page2, _) = filter_sort_page(&items, "", 2, SortKey::Downloads, 2);
        assert_eq!(page2[0].name, "pycoalprocessing");
        assert_eq!(page2[1].name, "waterfill");
    }

    #[test]
    fn local_search_is_case_insensitive_across_fields() {
        let items = vec![m("krastorio2", "Krastorio 2", 1)];
        let (r, total) = filter_sort_page(&items, "KRAS", 1, SortKey::Name, 25);
        assert_eq!(total, 1);
        assert_eq!(r.len(), 1);
        let (_, none) = filter_sort_page(&items, "zzz", 1, SortKey::Name, 25);
        assert_eq!(none, 0);
    }
}
