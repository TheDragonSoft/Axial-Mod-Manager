//! Update detection: newest target-compatible release vs installed version.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use futures_util::StreamExt;

use crate::core::services::deps::cmp_versions;
use crate::core::services::index_client::IndexClient;
use crate::error::AppError;
use crate::models::{
    InstalledMod, InstalledSnapshot, ModDetails, ModRelease, UpdateInfo, UpdatesReport,
};

/// Details for up to this many mods are fetched concurrently. The global
/// 2-request limiter in CachedHttp still paces the actual upstream calls;
/// this only removes the sequential per-mod round-trip latency.
const CONCURRENT_DETAILS: usize = 8;

pub async fn check(
    index: &dyn IndexClient,
    snapshot: &InstalledSnapshot,
    target: &str,
) -> UpdatesReport {
    // One lookup per unique mod name (first occurrence, snapshot order);
    // `base` is part of the game, never checked.
    let mut mod_by_name: HashMap<&str, &InstalledMod> = HashMap::new();
    for m in &snapshot.mods {
        if m.name != "base" {
            mod_by_name.entry(m.name.as_str()).or_insert(m);
        }
    }

    // The fetches are independent — run them concurrently and key results by
    // name so the report can be assembled in deterministic snapshot order.
    // (Owned names: borrowed async blocks trip lifetime inference here.)
    let names: Vec<String> = mod_by_name.keys().map(|k| k.to_string()).collect();
    let fetched: HashMap<String, Result<ModDetails, AppError>> =
        futures_util::stream::iter(names.into_iter().map(|name| async move {
            let details = index.mod_details(&name).await;
            (name, details)
        }))
        .buffer_unordered(CONCURRENT_DETAILS)
        .collect()
        .await;

    let mut report = UpdatesReport {
        target: target.to_string(),
        updates: Vec::new(),
        up_to_date: Vec::new(),
        errors: Vec::new(),
    };
    let mut processed: HashSet<&str> = HashSet::new();

    for m in &snapshot.mods {
        if m.name == "base" || !processed.insert(&m.name) {
            continue;
        }
        let Some(details) = fetched.get(&m.name) else {
            continue; // unreachable: every non-base name was fetched
        };
        match details {
            Ok(details) => {
                let mut candidates: Vec<&ModRelease> = details
                    .releases
                    .iter()
                    .filter(|r| r.factorio_version == target)
                    .collect();
                candidates.sort_by(|a, b| cmp_versions(&b.version, &a.version));
                match candidates.first() {
                    Some(best) => {
                        if cmp_versions(&best.version, &m.version) == Ordering::Greater {
                            report.updates.push(UpdateInfo {
                                name: m.name.clone(),
                                installed_version: m.version.clone(),
                                available_version: best.version.clone(),
                                factorio_version: best.factorio_version.clone(),
                            });
                        } else {
                            report.up_to_date.push(m.name.clone());
                        }
                    }
                    None => report.errors.push((
                        m.name.clone(),
                        format!("no release targeting game {target}"),
                    )),
                }
            }
            Err(e) => report.errors.push((m.name.clone(), e.to_string())),
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::services::index_client::SortKey;
    use crate::models::{IndexHealth, SearchResult};
    use async_trait::async_trait;
    use std::sync::Mutex;

    /// Newest release version per mod name; mods missing from the map get
    /// a "1.0.0" release, mods mapped to an empty string get no releases.
    struct FakeIndex {
        newest: HashMap<String, String>,
        calls: Mutex<Vec<String>>,
    }

    impl FakeIndex {
        fn new(pairs: &[(&str, &str)]) -> Self {
            Self {
                newest: pairs
                    .iter()
                    .map(|(n, v)| (n.to_string(), v.to_string()))
                    .collect(),
                calls: Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait]
    impl IndexClient for FakeIndex {
        async fn search(&self, _: &str, _: u32, _: SortKey) -> Result<SearchResult, AppError> {
            unimplemented!()
        }

        async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError> {
            self.calls.lock().unwrap().push(name.to_string());
            let version = self
                .newest
                .get(name)
                .cloned()
                .unwrap_or_else(|| "1.0.0".into());
            let releases = if version.is_empty() {
                vec![]
            } else {
                vec![ModRelease {
                    version,
                    factorio_version: "2.0".into(),
                    released_at: None,
                    downloads_count: None,
                    file_size: None,
                }]
            };
            Ok(ModDetails {
                name: name.to_string(),
                title: name.to_string(),
                owner: None,
                summary: String::new(),
                downloads: None,
                dependencies: vec![],
                releases,
            })
        }

        async fn health_check(&self) -> Result<IndexHealth, AppError> {
            unimplemented!()
        }
    }

    fn installed(name: &str, version: &str) -> InstalledMod {
        InstalledMod {
            file_name: format!("{name}_{version}.zip"),
            name: name.to_string(),
            version: version.to_string(),
            factorio_version: "2.0".into(),
            enabled: true,
            dependencies: vec![],
            problem: None,
        }
    }

    fn snapshot(mods: Vec<InstalledMod>) -> InstalledSnapshot {
        InstalledSnapshot {
            mods_dir: "mods".into(),
            mod_list_exists: true,
            mods,
        }
    }

    #[tokio::test]
    async fn classifies_updates_up_to_date_and_errors_in_order() {
        let index = FakeIndex::new(&[
            ("Alpha", "1.5.0"), // newer → update
            ("Beta", "2.0.0"),  // same → up to date
            ("Gamma", ""),      // no compatible release → error
        ]);
        let snap = snapshot(vec![
            installed("base", "2.0.28"),
            installed("Alpha", "1.0.0"),
            installed("Beta", "2.0.0"),
            installed("Gamma", "1.0.0"),
        ]);

        let report = check(&index, &snap, "2.0").await;

        assert_eq!(report.updates.len(), 1);
        assert_eq!(report.updates[0].name, "Alpha");
        assert_eq!(report.updates[0].available_version, "1.5.0");
        assert_eq!(report.up_to_date, vec!["Beta".to_string()]);
        assert_eq!(report.errors.len(), 1);
        assert_eq!(report.errors[0].0, "Gamma");
        assert_eq!(report.target, "2.0");
    }

    #[tokio::test]
    async fn duplicate_names_fetch_once_and_report_once() {
        let index = FakeIndex::new(&[("Alpha", "1.5.0")]);
        let snap = snapshot(vec![
            installed("Alpha", "1.0.0"),
            installed("Alpha", "0.9.0"), // second version of the same mod
        ]);

        let report = check(&index, &snap, "2.0").await;

        assert_eq!(*index.calls.lock().unwrap(), vec!["Alpha".to_string()]);
        assert_eq!(report.updates.len(), 1, "duplicate names share one verdict");
    }

    #[tokio::test]
    async fn fetch_failures_become_per_mod_errors() {
        struct Failing;
        #[async_trait]
        impl IndexClient for Failing {
            async fn search(&self, _: &str, _: u32, _: SortKey) -> Result<SearchResult, AppError> {
                unimplemented!()
            }
            async fn mod_details(&self, _: &str) -> Result<ModDetails, AppError> {
                Err(AppError::Http("portal unreachable".into()))
            }
            async fn health_check(&self) -> Result<IndexHealth, AppError> {
                unimplemented!()
            }
        }
        let snap = snapshot(vec![installed("Alpha", "1.0.0"), installed("Beta", "1.0.0")]);

        let report = check(&Failing, &snap, "2.0").await;

        assert!(report.updates.is_empty());
        assert_eq!(report.errors.len(), 2);
        assert_eq!(report.errors[0].0, "Alpha");
        assert!(report.errors[0].1.contains("portal unreachable"));
    }
}
