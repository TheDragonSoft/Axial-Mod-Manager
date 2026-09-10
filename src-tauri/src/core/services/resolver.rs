use std::collections::{HashMap, HashSet, VecDeque};

use crate::core::services::deps::{
    cmp_versions, constraint_string, parse_dependency, satisfies, VersionOp,
};
use crate::core::services::index_client::IndexClient;
use crate::error::AppError;
use crate::models::{InstalledMod, ModDetails, ModRelease, PlanEntry, PlanSatisfied, ResolutionPlan};

/// Everything the resolver needs to know about the world.
pub struct ResolveContext<'a> {
    pub index: &'a dyn IndexClient,
    /// name -> installed entry (from a fresh mods-folder scan)
    pub installed: &'a HashMap<String, InstalledMod>,
    /// Target Factorio version from settings ("2.0", "2.1", ...).
    pub target: &'a str,
}

/// What pick_version decided for one mod.
struct Pick {
    version: String,
    factorio_version: String,
    game_ok: bool,
    constraint_ok: bool,
}

/// Choose a release for a mod: pinned if given, else the newest release
/// matching the target game version that satisfies the incoming constraint.
/// Falls back to newest game-matching (constraint violated → caller warns),
/// then to newest overall (game version mismatch → caller warns).
fn pick_version(
    details: &ModDetails,
    target: &str,
    pinned: Option<&str>,
    constraint: Option<&(VersionOp, String)>,
) -> Option<Pick> {
    if let Some(p) = pinned {
        let r = details.releases.iter().find(|r| r.version == p)?;
        return Some(Pick {
            version: r.version.clone(),
            factorio_version: r.factorio_version.clone(),
            game_ok: r.factorio_version == target,
            constraint_ok: constraint.map_or(true, |c| satisfies(&r.version, c)),
        });
    }

    let mut candidates: Vec<&ModRelease> = details
        .releases
        .iter()
        .filter(|r| r.factorio_version == target)
        .collect();
    let game_ok = !candidates.is_empty();
    if !game_ok {
        candidates = details.releases.iter().collect();
    }
    candidates.sort_by(|x, y| cmp_versions(&y.version, &x.version));

    let chosen: &ModRelease = match constraint {
        None => candidates.first()?,
        Some(c) => match candidates.iter().copied().find(|r| satisfies(&r.version, c)) {
            Some(r) => r,
            None => candidates.first()?,
        },
    };

    Some(Pick {
        version: chosen.version.clone(),
        factorio_version: chosen.factorio_version.clone(),
        game_ok,
        constraint_ok: constraint.map_or(true, |c| satisfies(&chosen.version, c)),
    })
}

type QueueItem = (String, Option<String>, Option<(VersionOp, String)>, String);

/// Resolve the full install plan for `root` (and optional pinned version).
pub async fn resolve(
    ctx: &ResolveContext<'_>,
    root: &str,
    root_version: Option<String>,
) -> Result<ResolutionPlan, AppError> {
    let mut plan = ResolutionPlan {
        root_name: root.to_string(),
        target: ctx.target.to_string(),
        to_install: vec![],
        satisfied: vec![],
        optional: vec![],
        conflicts: vec![],
        warnings: vec![],
    };

    // name -> chosen version (satisfied AND to-install) — also the cycle guard.
    let mut chosen: HashMap<String, String> = HashMap::new();
    // (declared_by, incompatible_with) — checked after traversal in both orders.
    let mut incompat: Vec<(String, String)> = vec![];
    let mut optional_seen: HashSet<String> = HashSet::new();

    let mut queue: VecDeque<QueueItem> = VecDeque::new();
    queue.push_back((root.to_string(), root_version, None, String::new()));

    while let Some((name, pinned, constraint, required_by)) = queue.pop_front() {
        if name == "base" {
            continue; // the game itself — never installed by us
        }

        // Revisit guard (cycles + multi-parent). First visit wins; a later
        // constraint that the chosen version violates becomes a warning.
        if let Some(prev) = chosen.get(&name) {
            if let Some(c) = &constraint {
                if !satisfies(prev, c) {
                    plan.warnings.push(format!(
                        "{name} is already planned at v{prev}, which does not satisfy \
                         '{name} {}' requested by {}",
                        constraint_string(&Some(c.clone())),
                        if required_by.is_empty() { "you" } else { &required_by }
                    ));
                }
            }
            continue;
        }

        let details = match ctx.index.mod_details(&name).await {
            Ok(d) => d,
            Err(e) => {
                if name == root {
                    return Err(e); // nothing to resolve at all
                }
                plan.conflicts
                    .push(format!("could not fetch info for {name}: {e}"));
                continue;
            }
        };

        let installed_entry = ctx.installed.get(&name);

        // Dependency source, tiered: API -> installed info.json -> unknown.
        let (raw_deps, deps_known) = if !details.dependencies.is_empty() {
            (details.dependencies.clone(), true)
        } else if let Some(inst) = installed_entry {
            let known = !inst.dependencies.is_empty();
            (inst.dependencies.clone(), known)
        } else {
            (vec![], false)
        };

        // Satisfied = installed at a version matching game target + constraint.
        let installed_ok = match installed_entry {
            Some(inst) => {
                inst.factorio_version == ctx.target
                    && constraint.as_ref().map_or(true, |c| satisfies(&inst.version, c))
            }
            None => false,
        };

        if installed_ok {
            let v = installed_entry
                .map(|i| i.version.clone())
                .unwrap_or_default();
            chosen.insert(name.clone(), v.clone());
            plan.satisfied.push(PlanSatisfied {
                name: name.clone(),
                version: v,
            });
        } else {
            if let Some(inst) = installed_entry {
                if inst.factorio_version != ctx.target {
                    plan.warnings.push(format!(
                        "{name} v{} is installed for game {}, planning an install for {}",
                        inst.version, inst.factorio_version, ctx.target
                    ));
                }
            }
            let pick = match pick_version(&details, ctx.target, pinned.as_deref(), constraint.as_ref())
            {
                Some(p) => p,
                None => {
                    plan.conflicts.push(format!("{name}: no releases available"));
                    continue;
                }
            };
            if !pick.game_ok {
                plan.warnings.push(format!(
                    "{name} v{} targets game {} — no release matching {} was found",
                    pick.version, pick.factorio_version, ctx.target
                ));
            }
            if !pick.constraint_ok {
                plan.warnings.push(format!(
                    "could not satisfy '{name} {}' — using v{} instead",
                    constraint_string(&constraint),
                    pick.version
                ));
            }
            plan.to_install.push(PlanEntry {
                name: name.clone(),
                title: details.title.clone(),
                version: pick.version.clone(),
                factorio_version: pick.factorio_version.clone(),
                required_by: required_by.clone(),
                deps_known,
            });
            chosen.insert(name.clone(), pick.version);
        }

        // Traverse this mod's dependencies regardless of install/satisfied.
        if !deps_known {
            plan.warnings.push(format!(
                "dependency information for {name} was not available — its own \
                 dependencies will not be installed automatically"
            ));
        }
        for raw in &raw_deps {
            let dep = parse_dependency(raw);
            if dep.name.is_empty() || dep.name == "base" || dep.name == name {
                continue;
            }
            use crate::core::services::deps::DepKind as DK;
            match dep.kind {
                DK::Required | DK::HiddenRequired => {
                    queue.push_back((dep.name, None, dep.constraint, name.clone()));
                }
                DK::Optional | DK::HiddenOptional | DK::Recommended => {
                    let already = chosen.contains_key(&dep.name)
                        || ctx.installed.contains_key(&dep.name)
                        || optional_seen.contains(&dep.name);
                    if !already && optional_seen.insert(dep.name.clone()) {
                        plan.optional.push(dep.name);
                    }
                }
                DK::Incompatible | DK::HiddenIncompatible => {
                    incompat.push((name.clone(), dep.name));
                }
            }
        }
    }

    // Incompatibility checks run against the FINAL plan + installed set,
    // so declaration order never matters.
    for (declared_by, target_name) in &incompat {
        if target_name == &plan.root_name || chosen.contains_key(target_name) || ctx.installed.contains_key(target_name) {
            let where_ = if ctx.installed.contains_key(target_name) {
                "installed"
            } else {
                "in this install plan"
            };
            plan.conflicts.push(format!(
                "{declared_by} declares incompatibility with {target_name} ({where_})"
            ));
        }
    }

    Ok(plan)
}

// ---------------------------------------------------------------------------
// Tests against a mock index
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use crate::core::services::index_client::SortKey;
    use crate::models::{IndexHealth, ModDetails, ModRelease, SearchResult};

    fn details(name: &str, title: &str, releases: Vec<(&str, &str)>, deps: Vec<&str>) -> ModDetails {
        ModDetails {
            name: name.into(),
            title: title.into(),
            owner: None,
            summary: String::new(),
            downloads: Some(0),
            dependencies: deps.into_iter().map(String::from).collect(),
            releases: releases
                .into_iter()
                .map(|(v, fv)| ModRelease {
                    version: v.into(),
                    factorio_version: fv.into(),
                    released_at: None,
                    downloads_count: None,
                    file_size: None,
                })
                .collect(),
            thumbnail: None,
        }
    }

    fn make_installed(name: &str, version: &str, fv: &str) -> InstalledMod {
        InstalledMod {
            file_name: format!("{name}_{version}.zip"),
            name: name.into(),
            version: version.into(),
            factorio_version: fv.into(),
            enabled: true,
            dependencies: vec![],
            problem: None,
        }
    }

    struct Mock {
        mods: HashMap<String, ModDetails>,
    }

    #[async_trait]
    impl IndexClient for Mock {
        async fn search(&self, _q: &str, _p: u32, _s: SortKey) -> Result<SearchResult, AppError> {
            Err(AppError::NotImplemented("n/a".into()))
        }
        async fn mod_details(&self, name: &str) -> Result<ModDetails, AppError> {
            self.mods
                .get(name)
                .cloned()
                .ok_or_else(|| AppError::NotFound(format!("{name}")))
        }
        async fn health_check(&self) -> Result<IndexHealth, AppError> {
            Err(AppError::NotImplemented("n/a".into()))
        }
    }

    #[tokio::test]
    async fn resolves_transitive_chain_with_constraints() {
        let mut mods = HashMap::new();
        mods.insert(
            "a".into(),
            details("a", "Mod A", vec![("1.1.0", "2.0"), ("1.0.0", "2.0")], vec!["b >= 1.2.0"]),
        );
        mods.insert(
            "b".into(),
            details("b", "Mod B", vec![("1.5.0", "2.0"), ("1.1.0", "2.0")], vec!["c"]),
        );
        mods.insert("c".into(), details("c", "Mod C", vec![("2.0.0", "2.0")], vec!["base"]));
        let mock = Mock { mods };
        let installed = HashMap::new();
        let ctx = ResolveContext { index: &mock, installed: &installed, target: "2.0" };

        let plan = resolve(&ctx, "a", None).await.unwrap();
        let names: Vec<&str> = plan.to_install.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b", "c"]);
        let b = plan.to_install.iter().find(|e| e.name == "b").unwrap();
        assert_eq!(b.version, "1.5.0", "constraint >= 1.2.0 must pick 1.5.0");
        assert!(b.deps_known);
        assert!(plan.conflicts.is_empty());
        assert!(plan.warnings.is_empty());
    }

    #[tokio::test]
    async fn cycle_terminates() {
        let mut mods = HashMap::new();
        mods.insert("a".into(), details("a", "A", vec![("1.0.0", "2.0")], vec!["b"]));
        mods.insert("b".into(), details("b", "B", vec![("1.0.0", "2.0")], vec!["a"]));
        let mock = Mock { mods };
        let installed = HashMap::new();
        let ctx = ResolveContext { index: &mock, installed: &installed, target: "2.0" };

        let plan = resolve(&ctx, "a", None).await.unwrap();
        assert_eq!(plan.to_install.len(), 2);
    }

    #[tokio::test]
    async fn installed_satisfying_version_is_not_reinstalled() {
        let mut mods = HashMap::new();
        mods.insert(
            "a".into(),
            details("a", "Mod A", vec![("1.0.0", "2.0")], vec!["b >= 1.2.0"]),
        );
        mods.insert("b".into(), details("b", "Mod B", vec![("1.5.0", "2.0")], vec![]));
        let mock = Mock { mods };

        let mut installed = HashMap::new();
        installed.insert("b".into(), make_installed("b", "1.5.0", "2.0"));
        let ctx = ResolveContext { index: &mock, installed: &installed, target: "2.0" };

        let plan = resolve(&ctx, "a", None).await.unwrap();
        assert_eq!(plan.to_install.len(), 1);
        assert_eq!(plan.to_install[0].name, "a");
        assert!(plan.satisfied.iter().any(|s| s.name == "b"));
    }

    #[tokio::test]
    async fn incompatibility_with_installed_is_conflict() {
        let mut mods = HashMap::new();
        mods.insert(
            "a".into(),
            details("a", "Mod A", vec![("1.0.0", "2.0")], vec!["! z"]),
        );
        let mock = Mock { mods };

        let mut installed = HashMap::new();
        installed.insert("z".into(), make_installed("z", "1.0.0", "2.0"));
        let ctx = ResolveContext { index: &mock, installed: &installed, target: "2.0" };

        let plan = resolve(&ctx, "a", None).await.unwrap();
        assert!(!plan.conflicts.is_empty());
        assert_eq!(plan.to_install.len(), 1, "the plan still forms; the UI blocks confirm");
    }

    #[tokio::test]
    async fn unknown_deps_are_flagged() {
        let mut mods = HashMap::new();
        mods.insert("a".into(), details("a", "Mod A", vec![("1.0.0", "2.0")], vec![]));
        let mock = Mock { mods };
        let installed = HashMap::new();
        let ctx = ResolveContext { index: &mock, installed: &installed, target: "2.0" };

        let plan = resolve(&ctx, "a", None).await.unwrap();
        assert!(!plan.to_install[0].deps_known);
        assert!(plan.warnings.iter().any(|w| w.contains("dependency information")));
    }

    #[tokio::test]
    async fn resolves_hidden_required_and_recommended() {
        let mut mods = HashMap::new();
        mods.insert(
            "a".into(),
            details("a", "Mod A", vec![("1.0.0", "2.0")], vec!["~ lib", "+ opt"]),
        );
        mods.insert("lib".into(), details("lib", "Lib", vec![("1.0.0", "2.0")], vec!["base"]));
        mods.insert("opt".into(), details("opt", "Opt", vec![("1.0.0", "2.0")], vec!["base"]));
        let mock = Mock { mods };
        let installed = HashMap::new();
        let ctx = ResolveContext { index: &mock, installed: &installed, target: "2.0" };

        let plan = resolve(&ctx, "a", None).await.unwrap();
        let names: Vec<&str> = plan.to_install.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["a", "lib"], "~ lib must be queued as required");
        assert_eq!(plan.optional, vec!["opt"], "+ opt must be treated as optional");
    }
}
