use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::types::DatabaseDialect;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Paradigm {
    #[default]
    Relational,
    Document,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParamKind {
    Text,
    OneOf(&'static [&'static str]),
    /// Comma-separated `host:port` pairs.
    HostList,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParamRule {
    pub key: &'static str,
    pub kind: ParamKind,
}

const MAX_PARAM_LEN: usize = 256;

/// One row per `DatabaseDialect` variant. Supported engines are the ones with
/// an adapter; the rest stay in the enum so an old profile still loads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EngineSpec {
    pub dialect: DatabaseDialect,
    pub label: &'static str,
    pub supported: bool,
    /// MySQL treats the database field as an optional default schema and lists
    /// every user database. Other engines need a database name.
    pub database_required: bool,
    pub default_port: u16,
    pub paradigm: Paradigm,
    /// Non-secret per-engine connection options. Keys outside this list are rejected.
    pub params: &'static [ParamRule],
}

const BOOL: ParamKind = ParamKind::OneOf(&["true", "false"]);

const MONGO_PARAMS: &[ParamRule] = &[
    ParamRule {
        key: "srv",
        kind: BOOL,
    },
    ParamRule {
        key: "directConnection",
        kind: BOOL,
    },
    ParamRule {
        key: "authSource",
        kind: ParamKind::Text,
    },
    ParamRule {
        key: "authMechanism",
        kind: ParamKind::OneOf(&["", "SCRAM-SHA-1", "SCRAM-SHA-256"]),
    },
    ParamRule {
        key: "replicaSet",
        kind: ParamKind::Text,
    },
    ParamRule {
        key: "readPreference",
        kind: ParamKind::OneOf(&[
            "primary",
            "primaryPreferred",
            "secondary",
            "secondaryPreferred",
            "nearest",
        ]),
    },
    ParamRule {
        key: "hosts",
        kind: ParamKind::HostList,
    },
];

const ENGINES: &[EngineSpec] = &[
    EngineSpec {
        dialect: DatabaseDialect::PostgreSQL,
        label: "PostgreSQL",
        supported: true,
        database_required: true,
        default_port: 5432,
        paradigm: Paradigm::Relational,
        params: &[],
    },
    EngineSpec {
        dialect: DatabaseDialect::MySQL,
        label: "MySQL",
        supported: true,
        database_required: false,
        default_port: 3306,
        paradigm: Paradigm::Relational,
        params: &[],
    },
    EngineSpec {
        dialect: DatabaseDialect::SQLServer,
        label: "SQL Server",
        supported: true,
        database_required: true,
        default_port: 1433,
        paradigm: Paradigm::Relational,
        params: &[],
    },
    EngineSpec {
        dialect: DatabaseDialect::SQLite,
        label: "SQLite",
        supported: false,
        database_required: true,
        default_port: 0,
        paradigm: Paradigm::Relational,
        params: &[],
    },
    EngineSpec {
        dialect: DatabaseDialect::ClickHouse,
        label: "ClickHouse",
        supported: false,
        database_required: true,
        default_port: 0,
        paradigm: Paradigm::Relational,
        params: &[],
    },
    EngineSpec {
        dialect: DatabaseDialect::DuckDB,
        label: "DuckDB",
        supported: false,
        database_required: true,
        default_port: 0,
        paradigm: Paradigm::Relational,
        params: &[],
    },
    EngineSpec {
        dialect: DatabaseDialect::MongoDB,
        label: "MongoDB",
        supported: true,
        database_required: false,
        default_port: 27017,
        paradigm: Paradigm::Document,
        params: MONGO_PARAMS,
    },
];

pub fn engine_specs() -> &'static [EngineSpec] {
    ENGINES
}

pub fn engine_spec(dialect: DatabaseDialect) -> Option<&'static EngineSpec> {
    ENGINES.iter().find(|spec| spec.dialect == dialect)
}

pub fn dialect_label(dialect: DatabaseDialect) -> &'static str {
    engine_spec(dialect)
        .map(|spec| spec.label)
        .unwrap_or("Unknown")
}

pub fn dialect_is_supported(dialect: DatabaseDialect) -> bool {
    engine_spec(dialect).is_some_and(|spec| spec.supported)
}

/// An unknown dialect requires a database name, so a typo cannot skip the check.
pub fn database_required(dialect: DatabaseDialect) -> bool {
    engine_spec(dialect).is_none_or(|spec| spec.database_required)
}

/// An unknown dialect is treated as relational, matching `database_required`.
pub fn paradigm_of(dialect: DatabaseDialect) -> Paradigm {
    engine_spec(dialect).map_or(Paradigm::Relational, |spec| spec.paradigm)
}

pub fn validate_params(
    dialect: DatabaseDialect,
    params: &BTreeMap<String, String>,
    ssh_enabled: bool,
) -> Result<(), String> {
    let rules = engine_spec(dialect).map_or(&[][..], |spec| spec.params);
    for (key, value) in params {
        let rule = rules
            .iter()
            .find(|rule| rule.key == key)
            .ok_or_else(|| format!("Unknown connection option {key}"))?;
        if value.chars().count() > MAX_PARAM_LEN || value.chars().any(char::is_control) {
            return Err(format!("Connection option {key} is not valid"));
        }
        let valid = match rule.kind {
            ParamKind::Text => true,
            ParamKind::OneOf(allowed) => allowed.contains(&value.as_str()),
            ParamKind::HostList => value.is_empty() || value.split(',').all(is_host_port),
        };
        if !valid {
            return Err(format!("Connection option {key} is not valid"));
        }
    }
    if ssh_enabled {
        let srv = params.get("srv").is_some_and(|v| v == "true");
        let extra_hosts = params.get("hosts").is_some_and(|v| !v.trim().is_empty());
        if srv || extra_hosts {
            return Err(
                "SSH tunnels reach a single host. Turn off SRV and remove extra hosts, or turn off SSH."
                    .into(),
            );
        }
    }
    Ok(())
}

fn is_host_port(entry: &str) -> bool {
    match entry.trim().rsplit_once(':') {
        Some((host, port)) => !host.is_empty() && port.parse::<u16>().is_ok_and(|p| p > 0),
        None => false,
    }
}

pub fn dialect_from_label(label: &str) -> Result<DatabaseDialect, String> {
    // Stored profiles use "SQL Server". The IPC enum name is "SQLServer".
    if label.eq_ignore_ascii_case("SQLServer") {
        return Ok(DatabaseDialect::SQLServer);
    }
    ENGINES
        .iter()
        .find(|spec| spec.label == label)
        .map(|spec| spec.dialect)
        .ok_or_else(|| format!("unknown dialect {label}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn mongodb_spec_is_document_and_database_optional() {
        let s = engine_spec(DatabaseDialect::MongoDB).unwrap();
        assert_eq!(s.paradigm, Paradigm::Document);
        assert!(!s.database_required);
        assert_eq!(s.default_port, 27017);
        assert_eq!(paradigm_of(DatabaseDialect::MySQL), Paradigm::Relational);
    }

    #[test]
    fn mongodb_is_supported() {
        assert!(engine_spec(DatabaseDialect::MongoDB).unwrap().supported);
    }

    #[test]
    fn relational_engines_reject_params() {
        let p = BTreeMap::from([("srv".into(), "true".into())]);
        assert!(validate_params(DatabaseDialect::PostgreSQL, &p, false).is_err());
        assert!(validate_params(DatabaseDialect::PostgreSQL, &BTreeMap::new(), false).is_ok());
    }

    #[test]
    fn mongodb_params_are_checked() {
        let ok = BTreeMap::from([
            ("authSource".into(), "admin".into()),
            ("readPreference".into(), "nearest".into()),
            ("authMechanism".into(), String::new()),
            ("hosts".into(), "a:27017,b:27018".into()),
        ]);
        assert!(validate_params(DatabaseDialect::MongoDB, &ok, false).is_ok());
        let bad = BTreeMap::from([("readPreference".into(), "fastest".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &bad, false).is_err());
        let unknown = BTreeMap::from([("tlsCAFile".into(), "/x".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &unknown, false).is_err());
        let long = BTreeMap::from([("replicaSet".into(), "x".repeat(257))]);
        assert!(validate_params(DatabaseDialect::MongoDB, &long, false).is_err());
        let control = BTreeMap::from([("authSource".into(), "ad\nmin".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &control, false).is_err());
        let bad_host = BTreeMap::from([("hosts".into(), "nohostport".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &bad_host, false).is_err());
    }

    #[test]
    fn ssh_rejects_srv_and_extra_hosts() {
        let srv = BTreeMap::from([("srv".into(), "true".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &srv, true)
            .unwrap_err()
            .contains("SSH"));
        let hosts = BTreeMap::from([("hosts".into(), "b:27017".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &hosts, true).is_err());
        let srv_off = BTreeMap::from([("srv".into(), "false".into())]);
        assert!(validate_params(DatabaseDialect::MongoDB, &srv_off, true).is_ok());
    }

    #[test]
    fn every_dialect_variant_round_trips_through_its_label() {
        let variants = [
            DatabaseDialect::PostgreSQL,
            DatabaseDialect::MySQL,
            DatabaseDialect::SQLServer,
            DatabaseDialect::SQLite,
            DatabaseDialect::ClickHouse,
            DatabaseDialect::DuckDB,
            DatabaseDialect::MongoDB,
        ];
        assert_eq!(engine_specs().len(), variants.len());
        for dialect in variants {
            let label = dialect_label(dialect);
            assert_ne!(label, "Unknown");
            assert_eq!(dialect_from_label(label).unwrap(), dialect);
        }
        assert_eq!(
            dialect_from_label("SQLServer").unwrap(),
            DatabaseDialect::SQLServer
        );
        assert_eq!(
            dialect_from_label("sqlserver").unwrap(),
            DatabaseDialect::SQLServer
        );
        assert!(dialect_from_label("Oracle").is_err());
        assert!(dialect_is_supported(DatabaseDialect::PostgreSQL));
        assert!(dialect_is_supported(DatabaseDialect::MySQL));
        assert!(dialect_is_supported(DatabaseDialect::SQLServer));
        assert!(!dialect_is_supported(DatabaseDialect::SQLite));
        assert!(database_required(DatabaseDialect::SQLServer));
        assert!(database_required(DatabaseDialect::PostgreSQL));
        assert!(!database_required(DatabaseDialect::MySQL));
        assert!(database_required(DatabaseDialect::SQLite));
        assert!(!database_required(DatabaseDialect::MongoDB));
        assert!(dialect_is_supported(DatabaseDialect::MongoDB));
    }
}
