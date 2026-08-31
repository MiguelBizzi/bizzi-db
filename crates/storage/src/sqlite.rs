use std::path::Path;

use db_core::{
    ActivityLogItem, ConnectionProfile, ConnectionStatus, DatabaseDialect, Environment,
    HistoryQueryType, HistoryStatus, SavedQuery, WorkspaceState,
};
use rusqlite::{params, Connection, OptionalExtension};

use crate::secrets::StorageError;

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| StorageError::msg(e.to_string()))?;
        }
        let conn = Connection::open(path).map_err(|e| StorageError::msg(e.to_string()))?;
        let storage = Self { conn };
        storage.migrate()?;
        Ok(storage)
    }

    pub fn open_in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory().map_err(|e| StorageError::msg(e.to_string()))?;
        let storage = Self { conn };
        storage.migrate()?;
        Ok(storage)
    }

    fn migrate(&self) -> Result<(), StorageError> {
        self.conn
            .execute_batch(
                r#"
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS connections (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  dialect TEXT NOT NULL,
                  host TEXT NOT NULL,
                  port INTEGER NOT NULL,
                  database_name TEXT NOT NULL,
                  user_name TEXT NOT NULL,
                  ssl INTEGER NOT NULL,
                  pool_size INTEGER NOT NULL,
                  environment TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS query_history (
                  id TEXT PRIMARY KEY,
                  timestamp TEXT NOT NULL,
                  database_name TEXT NOT NULL,
                  query TEXT NOT NULL,
                  query_type TEXT NOT NULL,
                  execution_time_ms INTEGER NOT NULL,
                  rows_affected INTEGER NOT NULL,
                  status TEXT NOT NULL,
                  error_message TEXT,
                  user_name TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS saved_queries (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  description TEXT,
                  sql TEXT NOT NULL,
                  database_id TEXT NOT NULL,
                  tags_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  is_bookmarked INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS kv (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );
                "#,
            )
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn list_connections(&self) -> Result<Vec<ConnectionProfile>, StorageError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, dialect, host, port, database_name, user_name, ssl, pool_size, environment
                 FROM connections ORDER BY name",
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ConnectionProfile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    dialect: parse_dialect(&row.get::<_, String>(2)?),
                    host: row.get(3)?,
                    port: row.get::<_, i64>(4)? as u16,
                    database: row.get(5)?,
                    user: row.get(6)?,
                    ssl: row.get::<_, i64>(7)? != 0,
                    pool_size: row.get::<_, i64>(8)? as u32,
                    environment: parse_env(&row.get::<_, String>(9)?),
                    status: ConnectionStatus::Disconnected,
                })
            })
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn upsert_connection(&self, profile: &ConnectionProfile) -> Result<(), StorageError> {
        self.conn
            .execute(
                "INSERT INTO connections (id, name, dialect, host, port, database_name, user_name, ssl, pool_size, environment)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name,
                   dialect=excluded.dialect,
                   host=excluded.host,
                   port=excluded.port,
                   database_name=excluded.database_name,
                   user_name=excluded.user_name,
                   ssl=excluded.ssl,
                   pool_size=excluded.pool_size,
                   environment=excluded.environment",
                params![
                    profile.id,
                    profile.name,
                    dialect_str(profile.dialect),
                    profile.host,
                    profile.port as i64,
                    profile.database,
                    profile.user,
                    if profile.ssl { 1 } else { 0 },
                    profile.pool_size as i64,
                    env_str(profile.environment),
                ],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn get_connection(&self, id: &str) -> Result<Option<ConnectionProfile>, StorageError> {
        self.conn
            .query_row(
                "SELECT id, name, dialect, host, port, database_name, user_name, ssl, pool_size, environment
                 FROM connections WHERE id = ?1",
                [id],
                |row| {
                    Ok(ConnectionProfile {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        dialect: parse_dialect(&row.get::<_, String>(2)?),
                        host: row.get(3)?,
                        port: row.get::<_, i64>(4)? as u16,
                        database: row.get(5)?,
                        user: row.get(6)?,
                        ssl: row.get::<_, i64>(7)? != 0,
                        pool_size: row.get::<_, i64>(8)? as u32,
                        environment: parse_env(&row.get::<_, String>(9)?),
                        status: ConnectionStatus::Disconnected,
                    })
                },
            )
            .optional()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn delete_connection(&self, id: &str) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM connections WHERE id = ?1", [id])
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn insert_history(&self, item: &ActivityLogItem) -> Result<(), StorageError> {
        self.conn
            .execute(
                "INSERT INTO query_history
                 (id, timestamp, database_name, query, query_type, execution_time_ms, rows_affected, status, error_message, user_name)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    item.id,
                    item.timestamp,
                    item.database_name,
                    item.query,
                    history_type_str(item.query_type),
                    item.execution_time_ms as i64,
                    item.rows_affected as i64,
                    history_status_str(item.status),
                    item.error_message,
                    item.user,
                ],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        self.conn
            .execute(
                "DELETE FROM query_history WHERE id NOT IN (
                   SELECT id FROM query_history ORDER BY timestamp DESC LIMIT 500
                 )",
                [],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn list_history(&self) -> Result<Vec<ActivityLogItem>, StorageError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, timestamp, database_name, query, query_type, execution_time_ms,
                        rows_affected, status, error_message, user_name
                 FROM query_history ORDER BY timestamp DESC LIMIT 200",
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ActivityLogItem {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    database_name: row.get(2)?,
                    query: row.get(3)?,
                    query_type: parse_history_type(&row.get::<_, String>(4)?),
                    execution_time_ms: row.get::<_, i64>(5)? as u64,
                    rows_affected: row.get::<_, i64>(6)? as u64,
                    status: parse_history_status(&row.get::<_, String>(7)?),
                    error_message: row.get(8)?,
                    user: row.get(9)?,
                })
            })
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn list_saved_queries(&self) -> Result<Vec<SavedQuery>, StorageError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, title, description, sql, database_id, tags_json, created_at, is_bookmarked
                 FROM saved_queries ORDER BY created_at DESC",
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(5)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
                Ok(SavedQuery {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    sql: row.get(3)?,
                    database_id: row.get(4)?,
                    tags,
                    created_at: row.get(6)?,
                    is_bookmarked: row.get::<_, i64>(7)? != 0,
                })
            })
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn upsert_saved_query(&self, query: &SavedQuery) -> Result<(), StorageError> {
        let tags = serde_json::to_string(&query.tags).unwrap_or_else(|_| "[]".into());
        self.conn
            .execute(
                "INSERT INTO saved_queries (id, title, description, sql, database_id, tags_json, created_at, is_bookmarked)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                   title=excluded.title,
                   description=excluded.description,
                   sql=excluded.sql,
                   database_id=excluded.database_id,
                   tags_json=excluded.tags_json,
                   is_bookmarked=excluded.is_bookmarked",
                params![
                    query.id,
                    query.title,
                    query.description,
                    query.sql,
                    query.database_id,
                    tags,
                    query.created_at,
                    if query.is_bookmarked { 1 } else { 0 },
                ],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn delete_saved_query(&self, id: &str) -> Result<(), StorageError> {
        self.conn
            .execute("DELETE FROM saved_queries WHERE id = ?1", [id])
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn update_saved_query_tags(&self, id: &str, tags: &[String]) -> Result<(), StorageError> {
        let tags = serde_json::to_string(tags).unwrap_or_else(|_| "[]".into());
        self.conn
            .execute(
                "UPDATE saved_queries SET tags_json = ?1 WHERE id = ?2",
                params![tags, id],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn load_workspace(&self) -> Result<WorkspaceState, StorageError> {
        let value: Option<String> = self
            .conn
            .query_row("SELECT value FROM kv WHERE key = 'workspace'", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|e| StorageError::msg(e.to_string()))?;
        match value {
            Some(json) => serde_json::from_str(&json).map_err(|e| StorageError::msg(e.to_string())),
            None => Ok(WorkspaceState::default()),
        }
    }

    pub fn save_workspace(&self, state: &WorkspaceState) -> Result<(), StorageError> {
        let json = serde_json::to_string(state).map_err(|e| StorageError::msg(e.to_string()))?;
        self.conn
            .execute(
                "INSERT INTO kv (key, value) VALUES ('workspace', ?1)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [json],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }
}

fn dialect_str(d: DatabaseDialect) -> &'static str {
    match d {
        DatabaseDialect::PostgreSQL => "PostgreSQL",
        DatabaseDialect::MySQL => "MySQL",
        DatabaseDialect::SQLite => "SQLite",
        DatabaseDialect::ClickHouse => "ClickHouse",
        DatabaseDialect::DuckDB => "DuckDB",
    }
}

fn parse_dialect(s: &str) -> DatabaseDialect {
    match s {
        "MySQL" => DatabaseDialect::MySQL,
        "SQLite" => DatabaseDialect::SQLite,
        "ClickHouse" => DatabaseDialect::ClickHouse,
        "DuckDB" => DatabaseDialect::DuckDB,
        _ => DatabaseDialect::PostgreSQL,
    }
}

fn env_str(e: Environment) -> &'static str {
    match e {
        Environment::Production => "production",
        Environment::Staging => "staging",
        Environment::Development => "development",
    }
}

fn parse_env(s: &str) -> Environment {
    match s {
        "production" => Environment::Production,
        "staging" => Environment::Staging,
        _ => Environment::Development,
    }
}

fn history_type_str(t: HistoryQueryType) -> &'static str {
    match t {
        HistoryQueryType::Select => "SELECT",
        HistoryQueryType::Insert => "INSERT",
        HistoryQueryType::Update => "UPDATE",
        HistoryQueryType::Delete => "DELETE",
        HistoryQueryType::Ddl => "DDL",
        HistoryQueryType::Explain => "EXPLAIN",
        HistoryQueryType::System => "SYSTEM",
    }
}

fn parse_history_type(s: &str) -> HistoryQueryType {
    match s {
        "INSERT" => HistoryQueryType::Insert,
        "UPDATE" => HistoryQueryType::Update,
        "DELETE" => HistoryQueryType::Delete,
        "DDL" => HistoryQueryType::Ddl,
        "EXPLAIN" => HistoryQueryType::Explain,
        "SYSTEM" => HistoryQueryType::System,
        _ => HistoryQueryType::Select,
    }
}

fn history_status_str(s: HistoryStatus) -> &'static str {
    match s {
        HistoryStatus::Success => "SUCCESS",
        HistoryStatus::Error => "ERROR",
    }
}

fn parse_history_status(s: &str) -> HistoryStatus {
    if s == "ERROR" {
        HistoryStatus::Error
    } else {
        HistoryStatus::Success
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use db_core::ConnectionStatus;

    #[test]
    fn connection_and_history_round_trip() {
        let db = Storage::open_in_memory().unwrap();
        let profile = ConnectionProfile {
            id: "c1".into(),
            name: "Local".into(),
            dialect: DatabaseDialect::PostgreSQL,
            host: "127.0.0.1".into(),
            port: 5432,
            database: "app".into(),
            user: "postgres".into(),
            ssl: false,
            pool_size: 4,
            environment: Environment::Development,
            status: ConnectionStatus::Disconnected,
        };
        db.upsert_connection(&profile).unwrap();
        let listed = db.list_connections().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Local");
        assert_eq!(listed[0].database, "app");
        assert_eq!(listed[0].user, "postgres");

        let history = ActivityLogItem {
            id: "h1".into(),
            timestamp: "2026-01-01T00:00:00Z".into(),
            database_name: "Local".into(),
            query: "SELECT 1".into(),
            query_type: HistoryQueryType::Select,
            execution_time_ms: 3,
            rows_affected: 1,
            status: HistoryStatus::Success,
            error_message: None,
            user: "postgres".into(),
        };
        db.insert_history(&history).unwrap();
        let logs = db.list_history().unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].query, "SELECT 1");

        let saved = SavedQuery {
            id: "q1".into(),
            title: "One".into(),
            description: None,
            sql: "SELECT 1".into(),
            database_id: "c1".into(),
            tags: vec!["Core".into()],
            created_at: "2026-01-01T00:00:00Z".into(),
            is_bookmarked: true,
        };
        db.upsert_saved_query(&saved).unwrap();
        db.update_saved_query_tags("q1", &["Analytics".into()]).unwrap();
        let queries = db.list_saved_queries().unwrap();
        assert_eq!(queries[0].tags, vec!["Analytics".to_string()]);

        let ws = WorkspaceState {
            tabs: vec![],
            active_tab_id: Some("tab1".into()),
            current_connection_id: Some("c1".into()),
        };
        db.save_workspace(&ws).unwrap();
        let loaded = db.load_workspace().unwrap();
        assert_eq!(loaded.current_connection_id.as_deref(), Some("c1"));
        assert_eq!(loaded.active_tab_id.as_deref(), Some("tab1"));
    }
}
