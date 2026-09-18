use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::core::services::deps::cmp_versions;
use crate::core::services::index_client::{
    CachedHttp, IndexClient, SortKey, PORTAL_API_BASE, PORTAL_ASSETS_BASE,
};
use crate::error::AppError;
use crate::models::{ChangelogEntry, ChangelogSection, IndexHealth, ModDetails, ModRelease, ModSummary, SearchResult};

const PAGE_SIZE: u32 = 25;
/// How long the locally-held full mod listing stays fresh.
const DUMP_TTL: Duration = Duration::from_secs(30 * 60);
/// Safety valve against a server ignoring our page size.
const MAX_PAGES: u32 = 2000;

/// Site root the human-facing pages live under (the API is under `/api`).
pub const PORTAL_SITE_BASE: &str = "https://mods.factorio.com";

// ---------------------------------------------------------------------------
// Raw API DTOs — lenient by design; unknown fields are ignored.
// IMPORTANT: the portal keeps each release's factorio_version and
// dependencies inside an embedded `info_json` (object OR JSON string),
// not at the top level. Extraction lives in `info_json_fields`.
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
    /// ASSUMPTION (verified against the live portal API, 2026-09-12): every
    /// object in `releases` of `GET /api/mods/<name>` carries `sha1` — the
    /// 40-char lowercase hex digest of the release zip (checked on Bottleneck:
    /// all 70+ releases back to 2016 have it, e.g. 0.12.1 →
    /// "01a5bc5083079905137cd943363c4b3c9bc04b27"). Note the `<name>` path
    /// segment is case-sensitive ("bottleneck" → "Mod not found"; the portal's
    /// own mixed-case name works). We never fall back to the mirror's copy of
    /// this hash — verification must stay anchored to the official portal.
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub download_url: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub info_json: Option<serde_json::Value>,
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
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub releases: Vec<PortalRelease>,
    #[serde(default)]
    pub thumbnail: Option<String>,
}

// ---------------------------------------------------------------------------
// info_json extraction
// ---------------------------------------------------------------------------

/// Extract (factorio_version, dependencies) from a release's embedded
/// info.json. The API has shipped it both as an object and as a JSON-encoded
/// string; both are handled, as is absence.
pub(crate) fn info_json_fields(raw: Option<&serde_json::Value>) -> (Option<String>, Vec<String>) {
    let Some(raw) = raw else { return (None, Vec::new()) };
    let owned;
    let obj = match raw {
        serde_json::Value::String(s) => {
            owned = serde_json::from_str::<serde_json::Value>(s)
                .unwrap_or(serde_json::Value::Null);
            &owned
        }
        other => other,
    };
    let factorio_version = obj
        .get("factorio_version")
        .and_then(|x| x.as_str())
        .map(String::from)
        .filter(|s| !s.is_empty());
    let dependencies = obj
        .get("dependencies")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|d| d.as_str().map(String::from)).collect())
        .unwrap_or_default();
    (factorio_version, dependencies)
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
    let fv_top = item
        .latest_release
        .as_ref()
        .map(|r| r.factorio_version.clone())
        .unwrap_or_default();
    let (fv_info, _) = item
        .latest_release
        .as_ref()
        .map(|r| info_json_fields(r.info_json.as_ref()))
        .unwrap_or((None, Vec::new()));

    ModSummary {
        name: item.name,
        title: item.title,
        downloads: item.downloads_count.unwrap_or(0),
        latest_version: item
            .latest_release
            .as_ref()
            .map(|r| r.version.clone())
            .unwrap_or_else(|| "?".into()),
        factorio_version: if fv_top.is_empty() {
            fv_info.unwrap_or_default()
        } else {
            fv_top
        },
        summary: item.summary,
    }
}

/// The portal serves thumbnails as site-relative paths ("/assets/<hash>.thumb.png")
/// from the assets host (see PORTAL_ASSETS_BASE); make them absolute so the
/// webview can load them directly. Absent/empty -> None.
fn absolutize_thumbnail(raw: Option<String>) -> Option<String> {
    let t = raw?.trim().to_string();
    if t.is_empty() {
        return None;
    }
    if t.starts_with("http://") || t.starts_with("https://") {
        Some(t)
    } else if t.starts_with('/') {
        Some(format!("{PORTAL_ASSETS_BASE}{t}"))
    } else {
        None
    }
}

pub(crate) fn parse_details(raw: &str) -> Result<ModDetails, AppError> {
    let dto: PortalModDetails = serde_json::from_str(raw)
        .map_err(|e| AppError::Parse(format!("portal details response: {e}")))?;

    // Dependency source priority: top-level field, else the newest release's
    // embedded info_json, else that release's top-level deps (if any).
    let newest = dto
        .releases
        .iter()
        .max_by(|a, b| cmp_versions(&a.version, &b.version));
    let dependencies = if !dto.dependencies.is_empty() {
        dto.dependencies
    } else {
        match newest {
            Some(r) => {
                let (_, mut deps) = info_json_fields(r.info_json.as_ref());
                if deps.is_empty() {
                    deps = r.dependencies.clone();
                }
                deps
            }
            None => Vec::new(),
        }
    };

    Ok(ModDetails {
        name: dto.name,
        title: dto.title,
        owner: dto.owner,
        summary: dto.summary,
        downloads: dto.downloads_count,
        dependencies,
        releases: dto.releases.into_iter().map(map_release).collect(),
        thumbnail: absolutize_thumbnail(dto.thumbnail),
    })
}

fn map_release(r: PortalRelease) -> ModRelease {
    let (fv_info, _) = info_json_fields(r.info_json.as_ref());
    ModRelease {
        version: r.version,
        factorio_version: if r.factorio_version.is_empty() {
            fv_info.unwrap_or_default()
        } else {
            r.factorio_version
        },
        released_at: r.released_at,
        downloads_count: r.downloads_count,
        file_size: r.file_size,
        sha1: r.sha1,
        // The official API no longer publishes per-release dependencies;
        // mirror_client fills these in from the community mirror.
        dependencies: Vec::new(),
    }
}

/// Portal names are [A-Za-z0-9 _.-] in practice (spaces occur, e.g. "Flow Control").
pub fn plausible_name(s: &str) -> bool {
    !s.trim().is_empty()
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
// Changelog page parsing (pure, unit-tested)
// ---------------------------------------------------------------------------

/// ASSUMPTION (verified against the live portal, 2026-09-18, Krastorio2 +
/// several small mods): there is NO JSON changelog API —
/// `GET /api/mods/<name>/changelog` is a 404 and the details response has no
/// changelog field. The portal exposes changelogs ONLY as the HTML page
/// `https://mods.factorio.com/mod/<name>/changelog`, where each version is a
/// `<pre class="panel-hole-combined">` block of plain text:
///
/// ```text
/// Version: 2.1.2
/// Date: 2026-06-28
///   Bugfixes:
///     - Fixed that most crushing recipes were craftable in the assembler.
/// ```
///
/// Category headings are any indented `Heading:` line; bullets are lines
/// starting with `-` (deeper-indented sub-bullets are flattened to sibling
/// bullets — the info is kept, the nesting is not). A mod without a
/// changelog still serves the page with zero `<pre>` blocks; a missing page
/// is a plain 404. `parse_changelog` never panics on a malformed page — it
/// returns whatever it can extract, possibly an empty list.
pub(crate) fn parse_changelog(html: &str) -> Vec<ChangelogEntry> {
    const PRE_OPEN: &str = "<pre";
    const CLASS_MARK: &str = "panel-hole-combined";
    const PRE_CLOSE: &str = "</pre>";

    let mut entries = Vec::new();
    let mut cursor = 0usize;
    while let Some(tag_start) = html[cursor..].find(PRE_OPEN) {
        let tag_start = cursor + tag_start;
        let Some(tag_end) = html[tag_start..].find('>') else { break };
        let tag = &html[tag_start..=tag_start + tag_end];
        let body_start = tag_start + tag_end + 1;
        // Only the portal's changelog blocks carry this class — the page also
        // contains unrelated markup, so matching on the class keeps stray
        // <pre>s out.
        if !tag.contains(CLASS_MARK) {
            cursor = body_start;
            continue;
        }
        // Truncated page: no closing tag — parse what is there instead of
        // dropping the block.
        match html[body_start..].find(PRE_CLOSE) {
            Some(i) => {
                let body_end = body_start + i;
                if let Some(entry) = parse_changelog_block(&html[body_start..body_end]) {
                    entries.push(entry);
                }
                cursor = body_end + PRE_CLOSE.len();
            }
            None => {
                // Nothing left to scan — the rest of the page is this block.
                if let Some(entry) = parse_changelog_block(&html[body_start..]) {
                    entries.push(entry);
                }
                break;
            }
        }
    }
    entries
}

/// Parse one `<pre>` body: `Version:`/`Date:` headers plus indented
/// `Heading:` groups and `-` bullets. Blocks without a version line are
/// ignored (they are not a version entry).
fn parse_changelog_block(block: &str) -> Option<ChangelogEntry> {
    let mut version: Option<String> = None;
    let mut date: Option<String> = None;
    let mut sections: Vec<ChangelogSection> = Vec::new();

    for raw_line in block.lines() {
        let line = decode_entities(raw_line.trim());
        if line.is_empty() {
            continue;
        }
        if let Some(v) = line.strip_prefix("Version:") {
            // A second `Version:` in one block means the page changed shape —
            // keep the first so an entry never silently merges two releases.
            if version.is_none() {
                version = Some(v.trim().to_string());
            }
        } else if let Some(d) = line.strip_prefix("Date:") {
            if date.is_none() {
                date = Some(d.trim().to_string());
            }
        } else if let Some(bullet) = line.strip_prefix('-') {
            if version.is_none() {
                continue;
            }
            let bullet = bullet.trim();
            if bullet.is_empty() {
                continue;
            }
            match sections.last_mut() {
                Some(s) => s.bullets.push(bullet.to_string()),
                // Bullet before any heading — keep it under a synthetic group
                // so the text is never lost.
                None => sections.push(ChangelogSection {
                    heading: "Changes".into(),
                    bullets: vec![bullet.to_string()],
                }),
            };
        } else if line.ends_with(':') {
            let heading = line.trim_end_matches(':').trim();
            if !heading.is_empty() {
                sections.push(ChangelogSection {
                    heading: heading.to_string(),
                    bullets: Vec::new(),
                });
            }
        }
        // Anything else (rare stray markup text) is dropped.
    }

    version.map(|v| ChangelogEntry {
        version: v,
        date,
        sections: sections
            .into_iter()
            .filter(|s| !s.bullets.is_empty())
            .collect(),
    })
}

/// Decode the handful of entities the portal emits inside `<pre>` blocks:
/// the named five plus decimal/hex numeric references (apostrophes and
/// quotes arrive as `&#39;`/`&#34;`). Unknown entities pass through as text.
fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        // Bounded entity name via chars, not bytes: a byte window could end
        // mid-UTF-8 character and panic.
        let window: String = rest.chars().take(12).collect();
        let Some(semi) = window.find(';') else {
            // Not an entity (or truncated) — keep the raw '&'.
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let name = &rest[1..semi];
        let decoded = match name {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some('\u{00a0}'),
            _ => name
                .strip_prefix("#x")
                .or_else(|| name.strip_prefix("#X"))
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| name.strip_prefix('#').and_then(|d| d.parse::<u32>().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &rest[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

// ---------------------------------------------------------------------------
// Local search over a cached full listing
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
    /// Held across dump refreshes (single-flight): concurrent callers share
    /// one fetch of the multi-MB listing instead of each downloading it.
    dump_refresh: Mutex<()>,
}

impl PortalClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http: CachedHttp::new(http),
            dump: Mutex::new(None),
            dump_refresh: Mutex::new(()),
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
    /// Refreshes are single-flight: one caller downloads while the rest wait
    /// on `dump_refresh`, then re-check and pick up the fresh (or stale) dump.
    async fn load_dump(&self) -> Result<Arc<Dump>, AppError> {
        if let Some(d) = self.fresh_dump().await {
            return Ok(d);
        }
        let _guard = self.dump_refresh.lock().await;
        if let Some(d) = self.fresh_dump().await {
            return Ok(d); // someone else refreshed while we waited
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

    async fn fresh_dump(&self) -> Option<Arc<Dump>> {
        let cached = self.dump.lock().await;
        cached
            .as_ref()
            .filter(|d| d.fetched_at.elapsed() < DUMP_TTL)
            .map(Arc::clone)
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

    async fn mod_changelog(&self, name: &str) -> Result<Vec<ChangelogEntry>, AppError> {
        let name = name.trim();
        if !plausible_name(name) {
            return Err(AppError::NotFound(format!("invalid mod name: {name:?}")));
        }
        // HTML page, not an API route — CachedHttp::fetch_text is
        // content-agnostic (raw String), so the changelog inherits the same
        // 5-min TTL cache and rate limit as the JSON endpoints.
        let url = format!(
            "{PORTAL_SITE_BASE}/mod/{}/changelog",
            encode_path_component(name)
        );
        let request = self.http.get(&url);
        let html = self
            .http
            .fetch_text(&format!("changelog|{name}"), request)
            .await?;
        Ok(parse_changelog(&html))
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
            {
                "version": "2.1.2", "file_size": 99,
                "sha1": "3f2a9c1d0e8b7a65544333221100ffeeddccbbaa",
                "info_json": { "factorio_version": "2.1",
                               "dependencies": ["base", "+ ChangeInserterDropLane", "? aircraft"] }
            },
            { "version": "1.3.0", "factorio_version": "1.1", "downloads": 90000 }
        ]
    }"#;

    const STRING_INFO_FIXTURE: &str = r#"{
        "name": "x", "title": "X", "summary": "",
        "releases": [
            { "version": "3.0.0", "info_json": "{\"factorio_version\":\"2.0\",\"dependencies\":[\"base\"]}" }
        ]
    }"#;

    const THUMBNAIL_FIXTURE: &str = r#"{
        "name": "krastorio2", "title": "Krastorio 2", "summary": "",
        "thumbnail": "/assets/0bbd7809fe9151ac3f7cd1c3c604e13d4c8598d9.thumb.png",
        "releases": []
    }"#;

    const THUMBNAIL_LESS_FIXTURE: &str =
        r#"{ "name": "x", "title": "X", "summary": "", "releases": [] }"#;

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
    fn details_pulls_factorio_version_from_info_json() {
        let d = parse_details(DETAILS_FIXTURE).expect("fixture must parse");
        assert_eq!(d.releases[0].factorio_version, "2.1", "embedded info_json wins");
        assert_eq!(d.releases[1].factorio_version, "1.1", "top-level still honored");
    }

    #[test]
    fn details_parses_release_sha1_and_tolerates_absence() {
        let d = parse_details(DETAILS_FIXTURE).expect("fixture must parse");
        assert_eq!(
            d.releases[0].sha1.as_deref(),
            Some("3f2a9c1d0e8b7a65544333221100ffeeddccbbaa")
        );
        assert_eq!(d.releases[1].sha1, None, "release without sha1 degrades to None");
    }

    #[test]
    fn details_pulls_dependencies_from_newest_release_info_json() {
        let d = parse_details(DETAILS_FIXTURE).expect("fixture must parse");
        assert_eq!(d.dependencies.len(), 3);
        assert!(d.dependencies.contains(&"+ ChangeInserterDropLane".to_string()));
    }

    #[test]
    fn info_json_as_json_string_is_parsed() {
        let d = parse_details(STRING_INFO_FIXTURE).expect("fixture must parse");
        assert_eq!(d.releases[0].factorio_version, "2.0");
        assert_eq!(d.dependencies.len(), 1);
    }

    #[test]
    fn thumbnail_relative_url_becomes_absolute() {
        let d = parse_details(THUMBNAIL_FIXTURE).expect("fixture must parse");
        assert_eq!(
            d.thumbnail.as_deref(),
            Some("https://assets-mod.factorio.com/assets/0bbd7809fe9151ac3f7cd1c3c604e13d4c8598d9.thumb.png")
        );
    }

    #[test]
    fn thumbnail_absent_or_empty_is_none() {
        let d = parse_details(THUMBNAIL_LESS_FIXTURE).expect("fixture must parse");
        assert_eq!(d.thumbnail, None);
        let empty = r#"{ "name": "x", "title": "X", "summary": "", "thumbnail": "", "releases": [] }"#;
        assert_eq!(parse_details(empty).expect("fixture must parse").thumbnail, None);
    }

    #[test]
    fn name_validation() {
        assert!(!plausible_name(""));
        assert!(!plausible_name("   "));
        assert!(!plausible_name("../etc"));
        assert!(!plausible_name("+ ChangeInserterDropLane"));
        assert!(plausible_name("even-distribution"));
        assert!(plausible_name("Flow Control"));
        assert!(plausible_name("some_mod_2.5"));
        assert_eq!(encode_path_component("Flow Control"), "Flow%20Control");
    }

    // -- changelog parsing (A3) --

    /// Realistic excerpt in the exact shape the live portal serves
    /// (2026-09-18, Krastorio2): two `<pre class="panel-hole-combined">`
    /// blocks inside surrounding page markup, entities in bullets,
    /// deep-indented sub-bullets.
    const CHANGELOG_FIXTURE: &str = r#"<div class="panel-lighter mb0">
  <h2>Changelog</h2>
  <pre class="panel-hole-combined">Version: 2.1.2
Date: 2026-06-28
  Bugfixes:
    - Fixed that most crushing recipes were craftable in the assembler. (#735)
    - Fixed that steel pumps couldn&#39;t connect to fluid wagons.</pre>

  <pre class="panel-hole-combined">Version: 2.0.6
Date: 2025-06-22
  Balancing:
    - BREAKING CHANGE: Fixed early-game recipes:
      - Replaced electronic circuit with automation core.
  Compatibility:
    - Added compatibility with AAI Industry. (#531)
  Bugfixes:
    - Fixed the electrolysis plant fluid boxes.</pre>

  <p>No further markup matters.</p>
</div>"#;

    #[test]
    fn changelog_parses_versions_sections_and_entities() {
        let entries = parse_changelog(CHANGELOG_FIXTURE);
        assert_eq!(entries.len(), 2, "portal order (newest first) is kept");
        assert_eq!(entries[0].version, "2.1.2");
        assert_eq!(entries[0].date.as_deref(), Some("2026-06-28"));
        assert_eq!(entries[0].sections.len(), 1);
        assert_eq!(entries[0].sections[0].heading, "Bugfixes");
        assert_eq!(entries[0].sections[0].bullets.len(), 2);
        assert_eq!(
            entries[0].sections[0].bullets[1],
            "Fixed that steel pumps couldn't connect to fluid wagons."
        );
        // Sub-bullets flatten into their group; headings stay separate.
        assert_eq!(entries[1].version, "2.0.6");
        assert_eq!(entries[1].sections.len(), 3);
        assert_eq!(entries[1].sections[0].bullets.len(), 2);
        assert_eq!(
            entries[1].sections[0].bullets[1],
            "Replaced electronic circuit with automation core."
        );
        assert_eq!(entries[1].sections[2].bullets.len(), 1);
    }

    #[test]
    fn changelog_truncated_page_still_yields_what_it_can() {
        // Live page cut mid-bullet, no closing </pre> at all.
        let truncated = r#"<pre class="panel-hole-combined">Version: 1.4.0
Date: 2024-01-05
  Bugfixes:
    - Fixed a crash when"#;
        let entries = parse_changelog(truncated);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].version, "1.4.0");
        assert_eq!(entries[0].sections[0].bullets, vec!["Fixed a crash when"]);
    }

    #[test]
    fn changelog_empty_or_no_block_page_is_empty_list() {
        // A mod without a changelog serves the page with no <pre> blocks.
        assert!(parse_changelog("<html><h2>Changelog</h2></html>").is_empty());
        assert!(parse_changelog("").is_empty());
    }

    #[test]
    fn changelog_malformed_blocks_are_skipped_not_panics() {
        // Blocks without a Version line, a stray <pre> of another class, and
        // a block with only a heading — none may panic or produce junk.
        let malformed = r#"<pre class="panel-hole-combined">just some text</pre>
<pre class="something-else">Version: 9.9.9</pre>
<pre class="panel-hole-combined">Version: 1.0.0
  Bugfixes:</pre>"#;
        let entries = parse_changelog(malformed);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].version, "1.0.0");
        assert!(entries[0].sections.is_empty(), "empty groups are dropped");
        assert_eq!(entries[0].date, None);
    }

    #[test]
    fn changelog_bullet_before_heading_keeps_a_synthetic_group() {
        let html = "<pre class=\"panel-hole-combined\">Version: 0.1.0\n- initial release</pre>";
        let entries = parse_changelog(html);
        assert_eq!(entries[0].sections[0].heading, "Changes");
        assert_eq!(entries[0].sections[0].bullets, vec!["initial release"]);
    }

    #[test]
    fn changelog_entities_decode_named_numeric_and_pass_unknown() {
        assert_eq!(decode_entities("a &amp; b &lt;c&gt; &#34;q&#39; &#x27;"), "a & b <c> \"q' '");
        assert_eq!(decode_entities("100% &tu; &#xZZ;"), "100% &tu; &#xZZ;");
    }

    #[test]
    fn local_search_filters_sorts_paginates() {
        let mk = |name: &str, title: &str, dl: u64| ModSummary {
            name: name.into(),
            title: title.into(),
            downloads: dl,
            latest_version: "1.0.0".into(),
            factorio_version: "2.0".into(),
            summary: format!("summary of {name}"),
        };
        let items = vec![
            mk("waterfill", "Waterfill", 100),
            mk("krastorio2", "Krastorio 2", 500),
            mk("even-distribution", "Even Distribution", 300),
            mk("pycoalprocessing", "Pyanodons Coal Processing", 200),
        ];
        let (page1, total) = filter_sort_page(&items, "", 1, SortKey::Downloads, 2);
        assert_eq!(total, 4);
        assert_eq!(page1[0].name, "krastorio2");
        let (page2, _) = filter_sort_page(&items, "", 2, SortKey::Downloads, 2);
        assert_eq!(page2[0].name, "pycoalprocessing");
    }
}
