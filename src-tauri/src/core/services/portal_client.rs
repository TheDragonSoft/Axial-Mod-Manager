use async_trait::async_trait;
use serde::Deserialize;

use crate::core::services::index_client::{CachedHttp, IndexClient, SortKey, PORTAL_API_BASE};
use crate::error::AppError;
use crate::models::{IndexHealth, ModDetails, ModRelease, ModSummary, SearchResult};

/// Results per page requested from the portal API.
const PAGE_SIZE: u32 = 25;

// ---------------------------------------------------------------------------
// Raw API DTOs — the wire format of mods.factorio.com.
// Lenient by design: defaults everywhere, alias for the downloads field.
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
    /// Relative portal path (e.g. "/download/krastorio2/1.8.1"). Kept for
    /// Phase 5 diagnostics; downloads themselves go through re146.dev.
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
// Parsing (pure functions — unit-tested below against saved fixtures)
// ---------------------------------------------------------------------------

pub(crate) fn parse_search(raw: &str) -> Result<SearchResult, AppError> {
    let dto: PortalSearchResponse = serde_json::from_str(raw)
        .map_err(|e| AppError::Parse(format!("portal search response: {e}")))?;

    let results: Vec<ModSummary> = dto.results.into_iter().map(map_summary).collect();

    let (page, page_count, total_count) = match dto.pagination {
        Some(p) => (p.page.max(1), p.page_count.max(1), p.count),
        // Defensive fallback: API shape drifted and omitted pagination.
        None => (1, 1, results.len() as u64),
    };

    Ok(SearchResult {
        results,
        page,
        page_count,
        total_count,
    })
}

fn map_summary(item: PortalModListItem) -> ModSummary {
    ModSummary {
        name: item.name,
        title: item.title,
        downloads: item.downloads_count.unwrap_or(0),
        latest_version: item
            .latest_release
            .as_ref()
            .map(|r| r.version.clone())
            .unwrap_or_else(|| "?".into()),
        factorio_version: item
            .latest_release
            .as_ref()
            .map(|r| r.factorio_version.clone())
            .unwrap_or_else(|| "?".into()),
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

/// Portal mod names are restricted to ascii word chars and hyphens.
/// Validating before interpolation into the URL keeps requests sane.
fn valid_mod_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

pub struct PortalClient {
    http: CachedHttp,
}

impl PortalClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http: CachedHttp::new(http),
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
        let query = query.trim();
        let page = page.max(1);

        let mut params: Vec<(&str, String)> = vec![
            ("page", page.to_string()),
            ("page_size", PAGE_SIZE.to_string()),
        ];
        if !query.is_empty() {
            params.push(("q", query.to_string()));
        }
        for (k, v) in sort.query_params() {
            params.push((k, v.to_string()));
        }

        let url = format!("{PORTAL_API_BASE}/mods");
        let request = self.http.get(&url).query(&params);

        let raw = self
            .http
            .fetch_text(&format!("search|{query}|{page}|{sort:?}"), request)
            .await?;
        parse_search(&raw)
    }

    async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError> {
        let name = name.trim();
        if !valid_mod_name(name) {
            return Err(AppError::NotFound(format!("invalid mod name: {name:?}")));
        }
        let url = format!("{PORTAL_API_BASE}/mods/{name}");
        let request = self.http.get(&url);
        let raw = self
            .http
            .fetch_text(&format!("details|{name}"), request)
            .await?;
        parse_details(&raw)
    }

    async fn health_check(&self) -> Result<IndexHealth, AppError> {
        let url = format!("{PORTAL_API_BASE}/mods");
        let request = self.http.get(&url).query(&[("page_size", "1")]);
        let raw = self.http.fetch_text("health|mods-list", request).await?;
        let parsed = parse_search(&raw)?;

        let excerpt = match parsed.results.first() {
            Some(m) => format!(
                "parsed OK — first result: {} ({}) · {} downloads · page {}/{}",
                m.title, m.name, m.downloads, parsed.page, parsed.page_count
            ),
            None => "parsed OK — but response contained no results".to_string(),
        };

        Ok(IndexHealth {
            url: format!("{PORTAL_API_BASE}/mods?page_size=1"),
            ok: true,
            http_status: Some(200),
            byte_length: raw.len(),
            excerpt,
        })
    }
}

// ---------------------------------------------------------------------------
// Tests — fixtures based on the documented portal API shape. If the live
// API drifts from these, the diagnostics probe will surface it in the UI.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SEARCH_FIXTURE: &str = r#"{
        "pagination": { "page": 2, "page_count": 84, "count": 2081 },
        "results": [
            {
                "id": 10918,
                "name": "krastorio2",
                "title": "Krastorio 2",
                "owner": "Krastor and Darkfrei",
                "summary": "A major overhaul.",
                "downloads_count": 1842000,
                "latest_release": {
                    "version": "1.8.1",
                    "factorio_version": "2.0",
                    "released_at": "2024-10-30T18:00:00Z",
                    "downloads_count": 501234,
                    "file_size": 12345678,
                    "download_url": "/download/krastorio2/1.8.1"
                }
            },
            {
                "id": 42,
                "name": "old-mod",
                "title": "Old Mod",
                "summary": "Uses the legacy downloads field name.",
                "downloads": 42
            }
        ]
    }"#;

    #[test]
    fn search_parses_pagination_and_results() {
        let r = parse_search(SEARCH_FIXTURE).expect("fixture must parse");
        assert_eq!(r.page, 2);
        assert_eq!(r.page_count, 84);
        assert_eq!(r.total_count, 2081);
        assert_eq!(r.results.len(), 2);

        let first = &r.results[0];
        assert_eq!(first.name, "krastorio2");
        assert_eq!(first.latest_version, "1.8.1");
        assert_eq!(first.factorio_version, "2.0");
        assert_eq!(first.downloads, 1_842_000);
    }

    #[test]
    fn search_tolerates_legacy_field_names_and_missing_fields() {
        let r = parse_search(SEARCH_FIXTURE).expect("fixture must parse");
        let second = &r.results[1];
        assert_eq!(second.downloads, 42, "alias 'downloads' must map");
        assert_eq!(second.latest_version, "?");
        assert_eq!(second.factorio_version, "?");
    }

    const DETAILS_FIXTURE: &str = r#"{
        "id": 10918,
        "name": "krastorio2",
        "title": "Krastorio 2",
        "owner": "Krastor and Darkfrei",
        "summary": "A major overhaul.",
        "downloads_count": 1842000,
        "releases": [
            {
                "version": "1.8.1",
                "factorio_version": "2.0",
                "released_at": "2024-10-30T18:00:00Z",
                "downloads_count": 501234,
                "file_size": 12345678,
                "download_url": "/download/krastorio2/1.8.1"
            },
            {
                "version": "1.3.0",
                "factorio_version": "1.1",
                "downloads": 90000
            }
        ]
    }"#;

    #[test]
    fn details_parses_releases() {
        let d = parse_details(DETAILS_FIXTURE).expect("fixture must parse");
        assert_eq!(d.name, "krastorio2");
        assert_eq!(d.releases.len(), 2);
        assert_eq!(d.releases[0].version, "1.8.1");
        assert_eq!(d.releases[0].file_size, Some(12_345_678));
        assert_eq!(d.releases[1].downloads_count, Some(90_000), "alias in release too");
    }

    #[test]
    fn invalid_names_are_rejected() {
        assert!(!valid_mod_name(""));
        assert!(!valid_mod_name("../etc"));
        assert!(!valid_mod_name("has space"));
        assert!(valid_mod_name("even-distribution"));
        assert!(valid_mod_name("some_mod_2"));
    }
}
