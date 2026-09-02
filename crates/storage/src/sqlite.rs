use std::path::Path;

use db_core::{
    ActivityLogItem, AppSettings, ConnectionFolder, ConnectionProfile, ConnectionStatus,
    DatabaseDialect, Environment, HistoryQueryType, HistoryStatus, SavedQuery, SshAuthMethod,
    SslMode, WorkspaceState,
};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::secrets::StorageError;

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| StorageError::msg(e.to_string()))?;
                #[cfg(unix)]
                restrict_unix_mode(parent, 0o700)?;
            }
        }
        let conn = Connection::open(path).map_err(|e| StorageError::msg(e.to_string()))?;
        #[cfg(unix)]
        restrict_unix_mode(path, 0o600)?;
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
                CREATE TABLE IF NOT EXISTS connection_folders (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL
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
            .map_err(|e| StorageError::msg(e.to_string()))?;
        self.ensure_connection_folder_id_column()?;
        self.ensure_connection_sort_order_column()?;
        self.ensure_ssl_mode_column()?;
        self.ensure_ssh_columns()
    }

    fn ensure_connection_folder_id_column(&self) -> Result<(), StorageError> {
        if self.has_column("connections", "folder_id")? {
            return Ok(());
        }
        self.conn
            .execute(
                "ALTER TABLE connections ADD COLUMN folder_id TEXT REFERENCES connection_folders(id) ON DELETE SET NULL",
                [],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    fn ensure_connection_sort_order_column(&self) -> Result<(), StorageError> {
        if self.has_column("connections", "sort_order")? {
            return Ok(());
        }
        self.conn
            .execute(
                "ALTER TABLE connections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        self.backfill_sort_order()
    }

    fn ensure_ssl_mode_column(&self) -> Result<(), StorageError> {
        if self.has_column("connections", "ssl_mode")? {
            return Ok(());
        }
        self.conn
            .execute(
                "ALTER TABLE connections ADD COLUMN ssl_mode TEXT NOT NULL DEFAULT 'disabled'",
                [],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        self.conn
            .execute(
                "UPDATE connections SET ssl_mode = CASE WHEN ssl = 1 THEN 'require' ELSE 'disabled' END",
                [],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    fn ensure_ssh_columns(&self) -> Result<(), StorageError> {
        self.ensure_column(
            "connections",
            "ssh_enabled",
            "ALTER TABLE connections ADD COLUMN ssh_enabled INTEGER NOT NULL DEFAULT 0",
        )?;
        self.ensure_column(
            "connections",
            "ssh_host",
            "ALTER TABLE connections ADD COLUMN ssh_host TEXT NOT NULL DEFAULT ''",
        )?;
        self.ensure_column(
            "connections",
            "ssh_port",
            "ALTER TABLE connections ADD COLUMN ssh_port INTEGER NOT NULL DEFAULT 22",
        )?;
        self.ensure_column(
            "connections",
            "ssh_user",
            "ALTER TABLE connections ADD COLUMN ssh_user TEXT NOT NULL DEFAULT ''",
        )?;
        self.ensure_column(
            "connections",
            "ssh_auth",
            "ALTER TABLE connections ADD COLUMN ssh_auth TEXT NOT NULL DEFAULT 'password'",
        )?;
        self.ensure_column(
            "connections",
            "ssh_key_path",
            "ALTER TABLE connections ADD COLUMN ssh_key_path TEXT",
        )
    }

    fn ensure_column(&self, table: &str, column: &str, sql: &str) -> Result<(), StorageError> {
        if self.has_column(table, column)? {
            return Ok(());
        }
        self.conn
            .execute(sql, [])
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    fn backfill_sort_order(&self) -> Result<(), StorageError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, folder_id FROM connections ORDER BY name, id",
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let mut groups: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        for row in rows {
            let (id, folder_id) = row.map_err(|e| StorageError::msg(e.to_string()))?;
            groups
                .entry(folder_id.unwrap_or_default())
                .or_default()
                .push(id);
        }
        for ids in groups.values() {
            for (index, id) in ids.iter().enumerate() {
                self.conn
                    .execute(
                        "UPDATE connections SET sort_order = ?1 WHERE id = ?2",
                        params![index as i64, id],
                    )
                    .map_err(|e| StorageError::msg(e.to_string()))?;
            }
        }
        Ok(())
    }

    fn has_column(&self, table: &str, column: &str) -> Result<bool, StorageError> {
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let names = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| StorageError::msg(e.to_string()))?;
        for name in names {
            if name.map_err(|e| StorageError::msg(e.to_string()))? == column {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn list_folders(&self) -> Result<Vec<ConnectionFolder>, StorageError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name FROM connection_folders ORDER BY name")
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ConnectionFolder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn get_folder(&self, id: &str) -> Result<Option<ConnectionFolder>, StorageError> {
        self.conn
            .query_row(
                "SELECT id, name FROM connection_folders WHERE id = ?1",
                [id],
                |row| {
                    Ok(ConnectionFolder {
                        id: row.get(0)?,
                        name: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn upsert_folder(&self, folder: &ConnectionFolder) -> Result<(), StorageError> {
        let name = folder.name.trim();
        if name.is_empty() {
            return Err(StorageError::msg("Folder name is required"));
        }
        self.conn
            .execute(
                "INSERT INTO connection_folders (id, name) VALUES (?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name",
                params![folder.id, name],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }

    pub fn list_connection_ids_in_folder(
        &self,
        folder_id: &str,
    ) -> Result<Vec<String>, StorageError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM connections WHERE folder_id = ?1")
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([folder_id], |row| row.get(0))
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn delete_folder(
        &self,
        id: &str,
        delete_connections: bool,
    ) -> Result<Vec<String>, StorageError> {
        let ids = self.list_connection_ids_in_folder(id)?;
        if delete_connections {
            for connection_id in &ids {
                self.delete_connection(connection_id)?;
            }
        } else {
            self.conn
                .execute(
                    "UPDATE connections SET folder_id = NULL WHERE folder_id = ?1",
                    [id],
                )
                .map_err(|e| StorageError::msg(e.to_string()))?;
        }
        self.conn
            .execute("DELETE FROM connection_folders WHERE id = ?1", [id])
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(ids)
    }

    pub fn list_ids_in_group(
        &self,
        folder_id: Option<&str>,
    ) -> Result<Vec<String>, StorageError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id FROM connections
                 WHERE ifnull(folder_id, '') = ifnull(?1, '')
                 ORDER BY sort_order, name, id",
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([folder_id], |row| row.get(0))
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    fn write_sort_order(&self, ids: &[String]) -> Result<(), StorageError> {
        for (index, id) in ids.iter().enumerate() {
            self.conn
                .execute(
                    "UPDATE connections SET sort_order = ?1 WHERE id = ?2",
                    params![index as i64, id],
                )
                .map_err(|e| StorageError::msg(e.to_string()))?;
        }
        Ok(())
    }

    pub fn place_connection(
        &self,
        id: &str,
        folder_id: Option<&str>,
        before_id: Option<&str>,
    ) -> Result<(), StorageError> {
        self.require_folder(folder_id)?;
        let previous = self
            .get_connection(id)?
            .ok_or_else(|| StorageError::msg("Connection not found"))?;
        let old_folder = previous.folder_id.clone();
        self.conn
            .execute(
                "UPDATE connections SET folder_id = ?1 WHERE id = ?2",
                params![folder_id, id],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        if old_folder.as_deref() != folder_id {
            self.write_sort_order(&self.list_ids_in_group(old_folder.as_deref())?)?;
        }
        let mut ids = self.list_ids_in_group(folder_id)?;
        ids.retain(|item| item != id);
        if let Some(before) = before_id {
            if let Some(index) = ids.iter().position(|item| item == before) {
                ids.insert(index, id.to_string());
            } else {
                ids.push(id.to_string());
            }
        } else {
            ids.push(id.to_string());
        }
        self.write_sort_order(&ids)
    }

    pub fn set_connection_folder(
        &self,
        id: &str,
        folder_id: Option<&str>,
    ) -> Result<(), StorageError> {
        self.place_connection(id, folder_id, None)
    }

    fn require_folder(&self, folder_id: Option<&str>) -> Result<(), StorageError> {
        let Some(folder_id) = folder_id else {
            return Ok(());
        };
        if self.get_folder(folder_id)?.is_none() {
            return Err(StorageError::msg("Folder not found"));
        }
        Ok(())
    }

    pub fn list_connections(&self) -> Result<Vec<ConnectionProfile>, StorageError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, dialect, host, port, database_name, user_name, ssl, pool_size, environment, folder_id, sort_order, ssl_mode, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path
                 FROM connections ORDER BY sort_order, name, id",
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let rows = stmt
            .query_map([], map_connection)
            .map_err(|e| StorageError::msg(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| StorageError::msg(e.to_string()))
    }

    pub fn upsert_connection(&self, profile: &ConnectionProfile) -> Result<(), StorageError> {
        self.require_folder(profile.folder_id.as_deref())?;
        let previous = self.get_connection(&profile.id)?;
        self.conn
            .execute(
                "INSERT INTO connections (id, name, dialect, host, port, database_name, user_name, ssl, pool_size, environment, folder_id, ssl_mode, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
                 ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name,
                   dialect=excluded.dialect,
                   host=excluded.host,
                   port=excluded.port,
                   database_name=excluded.database_name,
                   user_name=excluded.user_name,
                   ssl=excluded.ssl,
                   pool_size=excluded.pool_size,
                   environment=excluded.environment,
                   folder_id=excluded.folder_id,
                   ssl_mode=excluded.ssl_mode,
                   ssh_enabled=excluded.ssh_enabled,
                   ssh_host=excluded.ssh_host,
                   ssh_port=excluded.ssh_port,
                   ssh_user=excluded.ssh_user,
                   ssh_auth=excluded.ssh_auth,
                   ssh_key_path=excluded.ssh_key_path",
                params![
                    profile.id,
                    profile.name,
                    dialect_str(profile.dialect),
                    profile.host,
                    profile.port as i64,
                    profile.database,
                    profile.user,
                    if profile.ssl_mode.uses_tls() { 1 } else { 0 },
                    profile.pool_size as i64,
                    env_str(profile.environment),
                    profile.folder_id,
                    ssl_mode_str(profile.ssl_mode),
                    if profile.ssh_enabled { 1 } else { 0 },
                    profile.ssh_host,
                    profile.ssh_port as i64,
                    profile.ssh_user,
                    ssh_auth_str(profile.ssh_auth),
                    profile.ssh_key_path,
                ],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        let previous_folder = previous.as_ref().and_then(|item| item.folder_id.clone());
        if previous.is_none() || previous_folder != profile.folder_id {
            self.place_connection(&profile.id, profile.folder_id.as_deref(), None)?;
        }
        Ok(())
    }

    pub fn get_connection(&self, id: &str) -> Result<Option<ConnectionProfile>, StorageError> {
        self.conn
            .query_row(
                "SELECT id, name, dialect, host, port, database_name, user_name, ssl, pool_size, environment, folder_id, sort_order, ssl_mode, ssh_enabled, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_key_path
                 FROM connections WHERE id = ?1",
                [id],
                map_connection,
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

    pub fn load_app_settings(&self) -> Result<AppSettings, StorageError> {
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM kv WHERE key = 'appSettings'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| StorageError::msg(e.to_string()))?;
        match value {
            Some(json) => {
                serde_json::from_str(&json).map_err(|e| StorageError::msg(e.to_string()))
            }
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_app_settings(&self, settings: &AppSettings) -> Result<(), StorageError> {
        let json = serde_json::to_string(settings).map_err(|e| StorageError::msg(e.to_string()))?;
        self.conn
            .execute(
                "INSERT INTO kv (key, value) VALUES ('appSettings', ?1)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [json],
            )
            .map_err(|e| StorageError::msg(e.to_string()))?;
        Ok(())
    }
}

#[cfg(unix)]
fn restrict_unix_mode(path: &Path, mode: u32) -> Result<(), StorageError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
        .map_err(|e| StorageError::msg(e.to_string()))
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

fn ssl_mode_str(mode: SslMode) -> &'static str {
    match mode {
        SslMode::Disabled => "disabled",
        SslMode::Require => "require",
        SslMode::Enabled => "enabled",
    }
}

fn parse_ssl_mode(s: &str, ssl: bool) -> SslMode {
    match s {
        "require" => SslMode::Require,
        "enabled" => SslMode::Enabled,
        "disabled" => SslMode::Disabled,
        _ if ssl => SslMode::Require,
        _ => SslMode::Disabled,
    }
}

fn ssh_auth_str(auth: SshAuthMethod) -> &'static str {
    match auth {
        SshAuthMethod::Password => "password",
        SshAuthMethod::PrivateKey => "privateKey",
    }
}

fn parse_ssh_auth(s: &str) -> SshAuthMethod {
    if s == "privateKey" {
        SshAuthMethod::PrivateKey
    } else {
        SshAuthMethod::Password
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

fn map_connection(row: &Row<'_>) -> rusqlite::Result<ConnectionProfile> {
    let ssl = row.get::<_, i64>(7)? != 0;
    Ok(ConnectionProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        dialect: parse_dialect(&row.get::<_, String>(2)?),
        host: row.get(3)?,
        port: row.get::<_, i64>(4)? as u16,
        database: row.get(5)?,
        user: row.get(6)?,
        ssl_mode: parse_ssl_mode(&row.get::<_, String>(12)?, ssl),
        pool_size: row.get::<_, i64>(8)? as u32,
        environment: parse_env(&row.get::<_, String>(9)?),
        folder_id: row.get(10)?,
        sort_order: row.get(11)?,
        status: ConnectionStatus::Disconnected,
        ssh_enabled: row.get::<_, i64>(13)? != 0,
        ssh_host: row.get(14)?,
        ssh_port: row.get::<_, i64>(15)? as u16,
        ssh_user: row.get(16)?,
        ssh_auth: parse_ssh_auth(&row.get::<_, String>(17)?),
        ssh_key_path: row.get(18)?,
    })
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
            ssl_mode: SslMode::Disabled,
            pool_size: 4,
            environment: Environment::Development,
            status: ConnectionStatus::Disconnected,
            folder_id: None,
            sort_order: 0,
            ssh_enabled: false,
            ssh_host: String::new(),
            ssh_port: 22,
            ssh_user: String::new(),
            ssh_auth: SshAuthMethod::Password,
            ssh_key_path: None,
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
        db.update_saved_query_tags("q1", &["Analytics".into()])
            .unwrap();
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

    fn sample_profile(id: &str) -> ConnectionProfile {
        ConnectionProfile {
            id: id.into(),
            name: "Local".into(),
            dialect: DatabaseDialect::PostgreSQL,
            host: "127.0.0.1".into(),
            port: 5432,
            database: "app".into(),
            user: "postgres".into(),
            ssl_mode: SslMode::Disabled,
            pool_size: 4,
            environment: Environment::Development,
            status: ConnectionStatus::Disconnected,
            folder_id: None,
            sort_order: 0,
            ssh_enabled: false,
            ssh_host: String::new(),
            ssh_port: 22,
            ssh_user: String::new(),
            ssh_auth: SshAuthMethod::Password,
            ssh_key_path: None,
        }
    }

    fn sample_history(id: &str, timestamp: &str) -> ActivityLogItem {
        ActivityLogItem {
            id: id.into(),
            timestamp: timestamp.into(),
            database_name: "Local".into(),
            query: "SELECT 1".into(),
            query_type: HistoryQueryType::Select,
            execution_time_ms: 3,
            rows_affected: 1,
            status: HistoryStatus::Success,
            error_message: None,
            user: "postgres".into(),
        }
    }

    #[test]
    fn connections_schema_has_no_password_column() {
        let db = Storage::open_in_memory().unwrap();
        let mut stmt = db.conn.prepare("PRAGMA table_info(connections)").unwrap();
        let names: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(!names
            .iter()
            .any(|name| name.to_lowercase().contains("password")));
        assert!(!names
            .iter()
            .any(|name| name.to_lowercase().contains("passphrase")));
        db.upsert_connection(&sample_profile("c1")).unwrap();
        let listed = db.list_connections().unwrap();
        let encoded = serde_json::to_value(&listed[0]).unwrap();
        assert!(encoded.get("password").is_none());
        assert!(encoded.get("sshPassword").is_none());
        assert!(encoded.get("sshPassphrase").is_none());
    }

    #[test]
    fn migrate_backfills_ssl_mode_from_ssl_flag() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace.sqlite");
        {
            let conn = rusqlite::Connection::open(&path).unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE connections (
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
                INSERT INTO connections VALUES (
                  'c1','Remote','PostgreSQL','db.example.com',5432,'app','postgres',1,4,'production'
                );
                INSERT INTO connections VALUES (
                  'c2','Local','PostgreSQL','127.0.0.1',5432,'app','postgres',0,4,'development'
                );
                "#,
            )
            .unwrap();
        }
        let db = Storage::open(&path).unwrap();
        let remote = db.get_connection("c1").unwrap().unwrap();
        let local = db.get_connection("c2").unwrap().unwrap();
        assert_eq!(remote.ssl_mode, SslMode::Require);
        assert_eq!(local.ssl_mode, SslMode::Disabled);
        assert!(!remote.ssh_enabled);
        assert_eq!(remote.ssh_port, 22);
    }

    #[test]
    fn ssh_fields_and_ssl_mode_round_trip() {
        let db = Storage::open_in_memory().unwrap();
        let mut profile = sample_profile("c1");
        profile.ssl_mode = SslMode::Enabled;
        profile.ssh_enabled = true;
        profile.ssh_host = "bastion.example.com".into();
        profile.ssh_port = 2222;
        profile.ssh_user = "jump".into();
        profile.ssh_auth = SshAuthMethod::PrivateKey;
        profile.ssh_key_path = Some("/tmp/id_ed25519".into());
        db.upsert_connection(&profile).unwrap();
        let loaded = db.get_connection("c1").unwrap().unwrap();
        assert_eq!(loaded.ssl_mode, SslMode::Enabled);
        assert!(loaded.ssh_enabled);
        assert_eq!(loaded.ssh_host, "bastion.example.com");
        assert_eq!(loaded.ssh_port, 2222);
        assert_eq!(loaded.ssh_user, "jump");
        assert_eq!(loaded.ssh_auth, SshAuthMethod::PrivateKey);
        assert_eq!(loaded.ssh_key_path.as_deref(), Some("/tmp/id_ed25519"));
    }

    #[test]
    fn app_settings_default_and_round_trip() {
        let db = Storage::open_in_memory().unwrap();
        assert!(!db.load_app_settings().unwrap().keychain_enabled);
        db.save_app_settings(&AppSettings {
            keychain_enabled: true,
        })
        .unwrap();
        assert!(db.load_app_settings().unwrap().keychain_enabled);
    }

    #[test]
    fn get_delete_connection_and_saved_query() {
        let db = Storage::open_in_memory().unwrap();
        db.upsert_connection(&sample_profile("c1")).unwrap();
        assert!(db.get_connection("c1").unwrap().is_some());
        assert!(db.get_connection("missing").unwrap().is_none());
        db.delete_connection("c1").unwrap();
        assert!(db.get_connection("c1").unwrap().is_none());

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
        db.delete_saved_query("q1").unwrap();
        assert!(db.list_saved_queries().unwrap().is_empty());
    }

    #[test]
    fn open_persists_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace.sqlite");
        {
            let db = Storage::open(&path).unwrap();
            db.upsert_connection(&sample_profile("c1")).unwrap();
        }
        let db = Storage::open(&path).unwrap();
        assert_eq!(db.get_connection("c1").unwrap().unwrap().name, "Local");
    }

    #[cfg(unix)]
    #[test]
    fn open_sets_restrictive_unix_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("app-data");
        let path = nested.join("workspace.sqlite");
        Storage::open(&path).unwrap();
        let dir_mode = std::fs::metadata(&nested).unwrap().permissions().mode() & 0o777;
        let file_mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(dir_mode, 0o700, "app data dir should be owner-only");
        assert_eq!(
            file_mode, 0o600,
            "workspace db should not be group/world readable"
        );

        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        Storage::open(&path).unwrap();
        let tightened = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(tightened, 0o600);
    }

    #[test]
    fn history_trims_to_500_and_list_caps_at_200() {
        let db = Storage::open_in_memory().unwrap();
        for i in 0..501 {
            db.insert_history(&sample_history(
                &format!("h{i}"),
                &format!("2026-01-01T00:00:{:02}.{:03}Z", i / 1000, i % 1000),
            ))
            .unwrap();
        }
        let stored: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM query_history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 500);
        assert_eq!(db.list_history().unwrap().len(), 200);
    }

    fn sample_folder(id: &str, name: &str) -> ConnectionFolder {
        ConnectionFolder {
            id: id.into(),
            name: name.into(),
        }
    }

    #[test]
    fn migrate_adds_folder_id_to_existing_connections_table() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace.sqlite");
        {
            let conn = rusqlite::Connection::open(&path).unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE connections (
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
                INSERT INTO connections VALUES (
                  'c1','Local','PostgreSQL','127.0.0.1',5432,'app','postgres',0,4,'development'
                );
                "#,
            )
            .unwrap();
        }
        let db = Storage::open(&path).unwrap();
        let listed = db.list_connections().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "c1");
        assert!(listed[0].folder_id.is_none());
        assert!(db.list_folders().unwrap().is_empty());
    }

    #[test]
    fn folders_round_trip_and_assign_connections() {
        let db = Storage::open_in_memory().unwrap();
        db.upsert_folder(&sample_folder("folder_1", "  Prod  "))
            .unwrap();
        let folders = db.list_folders().unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "Prod");

        db.upsert_connection(&sample_profile("c1")).unwrap();
        db.set_connection_folder("c1", Some("folder_1")).unwrap();
        assert_eq!(
            db.get_connection("c1").unwrap().unwrap().folder_id.as_deref(),
            Some("folder_1")
        );

        db.set_connection_folder("c1", None).unwrap();
        assert!(db.get_connection("c1").unwrap().unwrap().folder_id.is_none());

        let mut assigned = sample_profile("c2");
        assigned.folder_id = Some("folder_1".into());
        db.upsert_connection(&assigned).unwrap();
        assert_eq!(
            db.list_connection_ids_in_folder("folder_1").unwrap(),
            vec!["c2".to_string()]
        );
    }

    #[test]
    fn folder_assignment_rejects_unknown_folder() {
        let db = Storage::open_in_memory().unwrap();
        db.upsert_connection(&sample_profile("c1")).unwrap();
        let err = db
            .set_connection_folder("c1", Some("missing"))
            .unwrap_err()
            .to_string();
        assert!(err.contains("Folder not found"));

        let mut profile = sample_profile("c2");
        profile.folder_id = Some("missing".into());
        let upsert_err = db.upsert_connection(&profile).unwrap_err().to_string();
        assert!(upsert_err.contains("Folder not found"));
    }

    #[test]
    fn delete_folder_ungroups_or_removes_connections() {
        let db = Storage::open_in_memory().unwrap();
        db.upsert_folder(&sample_folder("folder_1", "Prod")).unwrap();
        db.upsert_folder(&sample_folder("folder_2", "Staging"))
            .unwrap();
        let mut keep = sample_profile("c1");
        keep.folder_id = Some("folder_1".into());
        let mut drop = sample_profile("c2");
        drop.folder_id = Some("folder_2".into());
        db.upsert_connection(&keep).unwrap();
        db.upsert_connection(&drop).unwrap();

        let ungrouped = db.delete_folder("folder_1", false).unwrap();
        assert_eq!(ungrouped, vec!["c1".to_string()]);
        assert!(db.get_connection("c1").unwrap().unwrap().folder_id.is_none());
        assert!(db.get_folder("folder_1").unwrap().is_none());

        let removed = db.delete_folder("folder_2", true).unwrap();
        assert_eq!(removed, vec!["c2".to_string()]);
        assert!(db.get_connection("c2").unwrap().is_none());
        assert!(db.get_folder("folder_2").unwrap().is_none());
    }

    #[test]
    fn upsert_folder_rejects_blank_name() {
        let db = Storage::open_in_memory().unwrap();
        let err = db
            .upsert_folder(&sample_folder("folder_1", "  "))
            .unwrap_err()
            .to_string();
        assert!(err.contains("Folder name is required"));
    }

    #[test]
    fn place_connection_reorders_inside_and_across_folders() {
        let db = Storage::open_in_memory().unwrap();
        db.upsert_folder(&sample_folder("folder_1", "Prod")).unwrap();
        db.upsert_connection(&sample_profile("c1")).unwrap();
        db.upsert_connection(&sample_profile("c2")).unwrap();
        db.upsert_connection(&sample_profile("c3")).unwrap();

        db.place_connection("c3", None, Some("c1")).unwrap();
        assert_eq!(
            db.list_ids_in_group(None).unwrap(),
            vec!["c3".to_string(), "c1".to_string(), "c2".to_string()]
        );

        db.place_connection("c1", Some("folder_1"), None).unwrap();
        db.place_connection("c2", Some("folder_1"), Some("c1")).unwrap();
        assert!(db.list_ids_in_group(None).unwrap() == vec!["c3".to_string()]);
        assert_eq!(
            db.list_ids_in_group(Some("folder_1")).unwrap(),
            vec!["c2".to_string(), "c1".to_string()]
        );
    }
}
