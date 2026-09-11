use std::collections::HashMap;

use async_trait::async_trait;

use crate::core::services::deps::cmp_versions;
use crate::core::services::index_client::{CachedHttp, IndexClient, SortKey};
use crate::core::services::portal_client::{
    encode_path_component, info_json_fields, plausible_name, PortalModDetails, PortalRelease,
};
use crate::error::AppError;
use crate::models::{IndexHealth, ModDetails, SearchResult};

/// The community mirror's info site (same operator as the download mirror in
/// downloader.rs). ASSUMPTION (verified against the live service, 2026-09):
/// `GET /factorio/mods/modinfo?id=<name>` mirrors the portal details response
/// and — unlike the official API, which trims info_json to factorio_version —
/// keeps each release's full info_json including `dependencies`. Used only to
/// enrich ModDetails with per-release dependency info; search and metadata
/// stay on the official API.
const MIRROR_INFO_BASE: &str = "https://re146.dev/factorio/mods";

pub struct MirrorClient {
    http: CachedHttp,
}

impl MirrorClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http: CachedHttp::new(http) }
    }

    /// Mirror details for one mod, in the portal DTO shape.
    pub async fn mod_info(&self, name: &str) -> Result<PortalModDetails, AppError> {
        let name = name.trim();
        if !plausible_name(name) {
            return Err(AppError::NotFound(format!("invalid mod name: {name:?}")));
        }
        let url = format!("{MIRROR_INFO_BASE}/modinfo?id={}", encode_path_component(name));
        let request = self.http.get(&url);
        let raw = self
            .http
            .fetch_text(&format!("mirror|{name}"), request)
            .await?;
        parse_modinfo(&raw)
    }
}

pub(crate) fn parse_modinfo(raw: &str) -> Result<PortalModDetails, AppError> {
    let dto: PortalModDetails = serde_json::from_str(raw)
        .map_err(|e| AppError::Parse(format!("mirror modinfo response: {e}")))?;
    if dto.name.is_empty() {
        return Err(AppError::NotFound("mod not on mirror".into()));
    }
    Ok(dto)
}

/// Layer the mirror's per-release info.json onto official details: exact
/// dependency strings where the mirror knows the version, plus the
/// details-level list from the mirror's newest release when the official
/// response has none. Existing official data is never overwritten. Returns
/// true when the mirror knows the mod at all.
pub(crate) fn enrich_with_mirror(details: &mut ModDetails, mirror: &PortalModDetails) -> bool {
    if !details.name.eq_ignore_ascii_case(&mirror.name) {
        return false;
    }
    let by_version: HashMap<&str, &PortalRelease> = mirror
        .releases
        .iter()
        .map(|r| (r.version.as_str(), r))
        .collect();
    for rel in &mut details.releases {
        let Some(m) = by_version.get(rel.version.as_str()) else {
            continue;
        };
        let (fv, deps) = info_json_fields(m.info_json.as_ref());
        if rel.dependencies.is_empty() {
            rel.dependencies = deps;
        }
        if rel.factorio_version.is_empty() {
            rel.factorio_version = fv.unwrap_or_default();
        }
    }
    if details.dependencies.is_empty() {
        if let Some(newest) = mirror
            .releases
            .iter()
            .max_by(|a, b| cmp_versions(&a.version, &b.version))
        {
            let (_, deps) = info_json_fields(newest.info_json.as_ref());
            details.dependencies = deps;
        }
    }
    !mirror.releases.is_empty()
}

/// Official portal index with per-release dependency enrichment from the
/// mirror. Search and diagnostics stay fully official; when the mirror is
/// unavailable the details keep their (usually empty) dependency info, which
/// the resolver already treats as "unknown" — the same graceful degradation
/// the official API forced before the mirror existed.
pub struct PortalWithMirrorDeps {
    portal: Box<dyn IndexClient>,
    mirror: MirrorClient,
}

impl PortalWithMirrorDeps {
    pub fn new(portal: Box<dyn IndexClient>, mirror: MirrorClient) -> Self {
        Self { portal, mirror }
    }
}

#[async_trait]
impl IndexClient for PortalWithMirrorDeps {
    async fn search(
        &self,
        query: &str,
        page: u32,
        sort: SortKey,
    ) -> Result<SearchResult, AppError> {
        self.portal.search(query, page, sort).await
    }

    async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError> {
        let (details, mirror) =
            tokio::join!(self.portal.mod_details(name), self.mirror.mod_info(name));
        let mut details = details?;
        match mirror {
            Ok(info) => {
                enrich_with_mirror(&mut details, &info);
            }
            Err(e) => {
                tracing::debug!(%name, "mirror dependency enrichment unavailable: {e}");
            }
        }
        Ok(details)
    }

    async fn health_check(&self) -> Result<IndexHealth, AppError> {
        self.portal.health_check().await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ModRelease;

    fn mirror_release(version: &str, info_json: serde_json::Value) -> PortalRelease {
        PortalRelease {
            version: version.into(),
            factorio_version: String::new(),
            released_at: None,
            downloads_count: None,
            file_size: None,
            download_url: None,
            dependencies: vec![],
            info_json: Some(info_json),
        }
    }

    fn official(name: &str, releases: Vec<(&str, &str)>) -> ModDetails {
        ModDetails {
            name: name.into(),
            title: "T".into(),
            owner: None,
            summary: String::new(),
            downloads: None,
            dependencies: vec![],
            releases: releases
                .into_iter()
                .map(|(v, fv)| ModRelease {
                    version: v.into(),
                    factorio_version: fv.into(),
                    released_at: None,
                    downloads_count: None,
                    file_size: None,
                    dependencies: vec![],
                })
                .collect(),
            thumbnail: None,
        }
    }

    fn mirror(name: &str, releases: Vec<PortalRelease>) -> PortalModDetails {
        PortalModDetails {
            name: name.into(),
            title: "T".into(),
            owner: None,
            summary: String::new(),
            downloads_count: None,
            dependencies: vec![],
            releases,
            thumbnail: None,
        }
    }

    #[test]
    fn modinfo_parses_portal_dto_and_rejects_empty_name() {
        // Real-shape excerpt of the mirror's modinfo response.
        let raw = r#"{
            "name": "alien-biomes", "title": "Alien Biomes", "owner": "Earendel",
            "summary": "s", "downloads_count": 706210,
            "releases": [
                { "version": "0.8.0", "sha1": "2d28", "file_name": "alien-biomes_0.8.0.zip",
                  "info_json": { "factorio_version": "2.1",
                                 "dependencies": ["base >= 2.1.7", "alien-biomes-graphics >= 0.8.0"] } }
            ]
        }"#;
        let d = parse_modinfo(raw).expect("fixture must parse");
        assert_eq!(d.releases[0].version, "0.8.0");
        assert_eq!(
            d.releases[0].info_json.as_ref().unwrap().get("dependencies").is_some(),
            true
        );
        assert!(parse_modinfo(r#"{"message": "not found"}"#).is_err());
    }

    #[test]
    fn fills_per_release_deps_from_info_json() {
        let mut d = official("a", vec![("1.0.0", "2.0"), ("2.0.0", "2.1")]);
        let m = mirror(
            "a",
            vec![
                mirror_release("1.0.0", serde_json::json!({"factorio_version": "2.0"})),
                mirror_release(
                    "2.0.0",
                    serde_json::json!({"factorio_version": "2.1", "dependencies": ["base >= 2.1.0", "? opt"]}),
                ),
            ],
        );
        assert!(enrich_with_mirror(&mut d, &m));
        assert!(d.releases[0].dependencies.is_empty(), "version absent from mirror stays untouched");
        assert_eq!(d.releases[1].dependencies, vec!["base >= 2.1.0", "? opt"]);
        assert_eq!(
            d.dependencies,
            vec!["base >= 2.1.0", "? opt"],
            "details-level list falls back to the newest mirror release"
        );
    }

    #[test]
    fn string_info_json_and_missing_factorio_version_fill_in() {
        let mut d = official("a", vec![("1.0.0", "")]);
        let m = mirror(
            "a",
            vec![mirror_release(
                "1.0.0",
                serde_json::json!({"factorio_version": "2.0", "dependencies": ["base"]}),
            )],
        );
        assert!(enrich_with_mirror(&mut d, &m));
        assert_eq!(d.releases[0].dependencies, vec!["base"]);
        assert_eq!(d.releases[0].factorio_version, "2.0");
    }

    #[test]
    fn name_mismatch_or_mirror_gap_is_noop() {
        let mut d = official("a", vec![("1.0.0", "2.0")]);
        let other = mirror("b", vec![mirror_release("1.0.0", serde_json::json!({"dependencies": ["x"]}))]);
        assert!(!enrich_with_mirror(&mut d, &other));
        assert!(d.releases[0].dependencies.is_empty());

        let empty = mirror("a", vec![]);
        assert!(!enrich_with_mirror(&mut d, &empty));
        assert!(d.dependencies.is_empty());
    }

    #[test]
    fn official_data_is_never_overwritten() {
        let mut d = official("a", vec![("1.0.0", "2.0")]);
        d.dependencies = vec!["official".into()];
        d.releases[0].dependencies = vec!["official-rel".into()];
        d.releases[0].factorio_version = "2.0".into();
        let m = mirror(
            "a",
            vec![mirror_release(
                "1.0.0",
                serde_json::json!({"factorio_version": "9.9", "dependencies": ["mirror"]}),
            )],
        );
        assert!(enrich_with_mirror(&mut d, &m));
        assert_eq!(d.releases[0].dependencies, vec!["official-rel"]);
        assert_eq!(d.releases[0].factorio_version, "2.0");
        assert_eq!(d.dependencies, vec!["official"]);
    }
}
