use std::cmp::Ordering;
use std::fmt;

/// Kind of a Factorio dependency declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DepKind {
    Required,
    Optional,
    HiddenOptional,
    Incompatible,
    HiddenIncompatible,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionOp {
    Gte,
    Lte,
    Gt,
    Lt,
    Eq,
}

impl fmt::Display for VersionOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            VersionOp::Gte => ">=",
            VersionOp::Lte => "<=",
            VersionOp::Gt => ">",
            VersionOp::Lt => "<",
            VersionOp::Eq => "=",
        };
        f.write_str(s)
    }
}

/// One parsed dependency string, e.g. `"? boblibrary >= 1.2.0"`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dependency {
    pub name: String,
    pub kind: DepKind,
    pub constraint: Option<(VersionOp, String)>,
}

/// Parse a raw info.json dependency string. Tolerant: handles prefixes with
/// or without a following space, and operators with or without spaces
/// (`"a>=1.0"` and `"a >= 1.0"` both parse).
pub fn parse_dependency(raw: &str) -> Dependency {
    let mut kind = DepKind::Required;
    let mut rest = raw.trim();

    for (marker, k) in [
        ("(?)", DepKind::HiddenOptional),
        ("(!)", DepKind::HiddenIncompatible),
        ("?", DepKind::Optional),
        ("!", DepKind::Incompatible),
    ] {
        if let Some(r) = rest.strip_prefix(marker) {
            kind = k;
            rest = r.trim_start();
            break;
        }
    }

    let (name, constraint) = split_name_constraint(rest);
    Dependency { name, kind, constraint }
}

/// Split `"name >= 1.0"` (any spacing) into name + parsed constraint.
fn split_name_constraint(rest: &str) -> (String, Option<(VersionOp, String)>) {
    let bytes = rest.as_bytes();
    let mut op_start = None;
    for (i, b) in bytes.iter().enumerate() {
        if matches!(b, b'>' | b'<' | b'=') {
            op_start = Some(i);
            break;
        }
    }
    match op_start {
        Some(idx) => {
            let name = rest[..idx].trim().to_string();
            (name, parse_constraint(rest[idx..].trim()))
        }
        None => {
            let mut parts = rest.split_whitespace();
            let name = parts.next().unwrap_or("").to_string();
            let constraint_str = parts.collect::<Vec<_>>().join(" ");
            (name, parse_constraint(&constraint_str))
        }
    }
}

fn parse_constraint(s: &str) -> Option<(VersionOp, String)> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    for (op_str, op) in [
        (">=", VersionOp::Gte),
        ("<=", VersionOp::Lte),
        ("==", VersionOp::Eq),
        ("=", VersionOp::Eq),
        (">", VersionOp::Gt),
        ("<", VersionOp::Lt),
    ] {
        if let Some(v) = s.strip_prefix(op_str) {
            let v = v.trim();
            if !v.is_empty() {
                return Some((op, v.to_string()));
            }
        }
    }
    // No recognized operator: treat a bare version as an exact pin (best effort).
    Some((VersionOp::Eq, s.to_string()))
}

/// "1.1" -> [1, 1]; non-numeric segments count as 0.
pub fn parse_version(s: &str) -> Vec<u64> {
    s.split('.').map(|p| p.trim().parse::<u64>().unwrap_or(0)).collect()
}

/// Numeric, length-padding comparison: "1.1" == "1.1.0", "0.6.128" > "0.6.9".
pub fn cmp_versions(a: &str, b: &str) -> Ordering {
    let mut va = parse_version(a);
    let mut vb = parse_version(b);
    let len = va.len().max(vb.len());
    va.resize(len, 0);
    vb.resize(len, 0);
    va.cmp(&vb)
}

pub fn satisfies(version: &str, constraint: &(VersionOp, String)) -> bool {
    let ord = cmp_versions(version, &constraint.1);
    match constraint.0 {
        VersionOp::Gte => ord != Ordering::Less,
        VersionOp::Lte => ord != Ordering::Greater,
        VersionOp::Gt => ord == Ordering::Greater,
        VersionOp::Lt => ord == Ordering::Less,
        VersionOp::Eq => ord == Ordering::Equal,
    }
}

pub fn constraint_string(c: &Option<(VersionOp, String)>) -> String {
    match c {
        Some((op, v)) => format!("{op}{v}"),
        None => "any".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_all_prefix_forms() {
        assert_eq!(parse_dependency("base").name, "base");
        assert_eq!(parse_dependency("base").kind, DepKind::Required);

        let d = parse_dependency("? some-opt >= 1.0");
        assert_eq!(d.kind, DepKind::Optional);
        assert_eq!(d.name, "some-opt");
        assert_eq!(d.constraint, Some((VersionOp::Gte, "1.0".into())));

        let d = parse_dependency("(?) hidden-opt");
        assert_eq!(d.kind, DepKind::HiddenOptional);
        assert_eq!(d.name, "hidden-opt");

        let d = parse_dependency("! rival-mod");
        assert_eq!(d.kind, DepKind::Incompatible);

        let d = parse_dependency("(!) rival-mod");
        assert_eq!(d.kind, DepKind::HiddenIncompatible);
    }

    #[test]
    fn parses_operators_with_and_without_spaces() {
        assert_eq!(
            parse_dependency("a >= 1.2").constraint,
            Some((VersionOp::Gte, "1.2".into()))
        );
        assert_eq!(
            parse_dependency("a>=1.2").constraint,
            Some((VersionOp::Gte, "1.2".into()))
        );
        assert_eq!(
            parse_dependency("a == 2.0").constraint,
            Some((VersionOp::Eq, "2.0".into()))
        );
        assert_eq!(parse_dependency("a").constraint, None);
    }

    #[test]
    fn version_comparison_pads_and_compares_numerically() {
        assert_eq!(cmp_versions("1.1", "1.1.0"), Ordering::Equal);
        assert_eq!(cmp_versions("0.6.128", "0.6.9"), Ordering::Greater);
        assert_eq!(cmp_versions("2.0", "2.1"), Ordering::Less);
        assert!(satisfies("1.5.0", &(VersionOp::Gte, "1.2.0".into())));
        assert!(!satisfies("1.1.0", &(VersionOp::Gte, "1.2.0".into())));
        assert!(satisfies("2.0", &(VersionOp::Eq, "2.0.0".into())));
    }
}
