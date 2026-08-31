use crate::sql::classify_sql;
use crate::types::{
    ActivityLogItem, ConnectionProfile, ConnectionStatus, DatabaseSchema, HistoryStatus,
    QueryExecutionResult, SaveConnectionInput,
};

pub fn new_connection_requires_password(input: &SaveConnectionInput) -> bool {
    input.password.is_empty() && input.id.is_none()
}

pub fn profile_from_save_input(input: SaveConnectionInput, id: String) -> ConnectionProfile {
    ConnectionProfile {
        id,
        name: input.name,
        dialect: input.dialect,
        host: input.host,
        port: input.port,
        database: input.database,
        user: input.user,
        ssl: input.ssl,
        pool_size: input.pool_size.max(1),
        environment: input.environment,
        status: ConnectionStatus::Disconnected,
    }
}

pub fn overlay_schema(mut schema: DatabaseSchema, profile: &ConnectionProfile) -> DatabaseSchema {
    schema.id = profile.id.clone();
    schema.name = profile.name.clone();
    schema.connection_host = profile.host.clone();
    schema.connection_port = profile.port;
    schema.environment = profile.environment;
    schema.status = ConnectionStatus::Connected;
    schema
}

pub fn history_item_from_result(
    id: String,
    profile: &ConnectionProfile,
    result: &QueryExecutionResult,
) -> ActivityLogItem {
    ActivityLogItem {
        id,
        timestamp: result.timestamp.clone(),
        database_name: profile.name.clone(),
        query: result.query.clone(),
        query_type: classify_sql(&result.query).into(),
        execution_time_ms: result.execution_time_ms,
        rows_affected: result.affected_rows.unwrap_or(0),
        status: if result.error.is_some() {
            HistoryStatus::Error
        } else {
            HistoryStatus::Success
        },
        error_message: result.error.clone(),
        user: profile.user.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DatabaseDialect, Environment, HistoryQueryType};

    fn save_input(password: &str, id: Option<&str>, pool_size: u32) -> SaveConnectionInput {
        SaveConnectionInput {
            id: id.map(str::to_string),
            name: "Local".into(),
            dialect: DatabaseDialect::PostgreSQL,
            host: "127.0.0.1".into(),
            port: 5432,
            database: "app".into(),
            user: "postgres".into(),
            password: password.into(),
            ssl: false,
            pool_size,
            environment: Environment::Development,
        }
    }

    fn profile() -> ConnectionProfile {
        profile_from_save_input(save_input("secret", Some("c1"), 8), "c1".into())
    }

    #[test]
    fn new_connection_requires_password_unless_updating() {
        assert!(new_connection_requires_password(&save_input("", None, 4)));
        assert!(!new_connection_requires_password(&save_input("x", None, 4)));
        assert!(!new_connection_requires_password(&save_input(
            "",
            Some("c1"),
            4
        )));
    }

    #[test]
    fn profile_from_save_input_clamps_pool_size() {
        let profile = profile_from_save_input(save_input("secret", None, 0), "conn_1".into());
        assert_eq!(profile.pool_size, 1);
        assert_eq!(profile.status, ConnectionStatus::Disconnected);
        assert_eq!(profile.id, "conn_1");
    }

    #[test]
    fn overlay_schema_copies_connection_identity() {
        let schema = overlay_schema(
            DatabaseSchema {
                id: "db".into(),
                name: "db".into(),
                dialect: DatabaseDialect::PostgreSQL,
                version: "16".into(),
                connection_host: String::new(),
                connection_port: 0,
                environment: Environment::Staging,
                status: ConnectionStatus::Disconnected,
                tables: vec![],
                total_size_mb: 0.0,
                active_connections: 0,
                queries_per_second: 0.0,
            },
            &profile(),
        );
        assert_eq!(schema.id, "c1");
        assert_eq!(schema.name, "Local");
        assert_eq!(schema.connection_host, "127.0.0.1");
        assert_eq!(schema.connection_port, 5432);
        assert_eq!(schema.environment, Environment::Development);
        assert_eq!(schema.status, ConnectionStatus::Connected);
    }

    #[test]
    fn history_item_classifies_sql_and_errors() {
        let ok = history_item_from_result(
            "log_1".into(),
            &profile(),
            &QueryExecutionResult {
                id: "r1".into(),
                query: "INSERT INTO t VALUES (1)".into(),
                timestamp: "2026-01-01T00:00:00Z".into(),
                execution_time_ms: 4,
                affected_rows: Some(1),
                columns: None,
                rows: None,
                error: None,
                truncated: None,
            },
        );
        assert_eq!(ok.query_type, HistoryQueryType::Insert);
        assert_eq!(ok.status, HistoryStatus::Success);

        let err = history_item_from_result(
            "log_2".into(),
            &profile(),
            &QueryExecutionResult {
                id: "r2".into(),
                query: "SELECT 1".into(),
                timestamp: "2026-01-01T00:00:00Z".into(),
                execution_time_ms: 1,
                affected_rows: None,
                columns: None,
                rows: None,
                error: Some("boom".into()),
                truncated: None,
            },
        );
        assert_eq!(err.status, HistoryStatus::Error);
        assert_eq!(err.error_message.as_deref(), Some("boom"));
        assert_eq!(err.rows_affected, 0);
    }
}
