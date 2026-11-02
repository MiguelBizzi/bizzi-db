use crate::types::DatabaseDialect;

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
}

const ENGINES: &[EngineSpec] = &[
    EngineSpec {
        dialect: DatabaseDialect::PostgreSQL,
        label: "PostgreSQL",
        supported: true,
        database_required: true,
        default_port: 5432,
    },
    EngineSpec {
        dialect: DatabaseDialect::MySQL,
        label: "MySQL",
        supported: true,
        database_required: false,
        default_port: 3306,
    },
    EngineSpec {
        dialect: DatabaseDialect::SQLServer,
        label: "SQL Server",
        supported: true,
        database_required: true,
        default_port: 1433,
    },
    EngineSpec {
        dialect: DatabaseDialect::SQLite,
        label: "SQLite",
        supported: false,
        database_required: true,
        default_port: 0,
    },
    EngineSpec {
        dialect: DatabaseDialect::ClickHouse,
        label: "ClickHouse",
        supported: false,
        database_required: true,
        default_port: 0,
    },
    EngineSpec {
        dialect: DatabaseDialect::DuckDB,
        label: "DuckDB",
        supported: false,
        database_required: true,
        default_port: 0,
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

pub fn dialect_from_label(label: &str) -> Result<DatabaseDialect, String> {
    ENGINES
        .iter()
        .find(|spec| spec.label == label)
        .map(|spec| spec.dialect)
        .ok_or_else(|| format!("unknown dialect {label}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_dialect_variant_round_trips_through_its_label() {
        let variants = [
            DatabaseDialect::PostgreSQL,
            DatabaseDialect::MySQL,
            DatabaseDialect::SQLServer,
            DatabaseDialect::SQLite,
            DatabaseDialect::ClickHouse,
            DatabaseDialect::DuckDB,
        ];
        assert_eq!(engine_specs().len(), variants.len());
        for dialect in variants {
            let label = dialect_label(dialect);
            assert_ne!(label, "Unknown");
            assert_eq!(dialect_from_label(label).unwrap(), dialect);
        }
        assert!(dialect_from_label("Oracle").is_err());
        assert!(dialect_is_supported(DatabaseDialect::PostgreSQL));
        assert!(dialect_is_supported(DatabaseDialect::MySQL));
        assert!(dialect_is_supported(DatabaseDialect::SQLServer));
        assert!(!dialect_is_supported(DatabaseDialect::SQLite));
        assert!(database_required(DatabaseDialect::SQLServer));
        assert!(database_required(DatabaseDialect::PostgreSQL));
        assert!(!database_required(DatabaseDialect::MySQL));
        assert!(database_required(DatabaseDialect::SQLite));
    }
}
