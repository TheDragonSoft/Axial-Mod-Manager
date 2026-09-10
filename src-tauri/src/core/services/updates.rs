//! Update detection: newest target-compatible release vs installed version.

use std::cmp::Ordering;
use std::collections::HashSet;

use crate::core::services::deps::cmp_versions;
use crate::core::services::index_client::IndexClient;
use crate::models::{InstalledSnapshot, ModRelease, UpdateInfo, UpdatesReport};

pub async fn check(
    index: &dyn IndexClient,
    snapshot: &InstalledSnapshot,
    target: &str,
) -> UpdatesReport {
    let mut report = UpdatesReport {
        target: target.to_string(),
        updates: Vec::new(),
        up_to_date: Vec::new(),
        errors: Vec::new(),
    };
    let mut seen: HashSet<String> = HashSet::new();

    for m in &snapshot.mods {
        if m.name == "base" || !seen.insert(m.name.clone()) {
            continue;
        }
        match index.mod_details(&m.name).await {
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
