use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DatabaseDialect {
    PostgreSQL,
    MySQL,
    SQLite,
    ClickHouse,
    DuckDB,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Production,
    Staging,
    Development,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Connected,
    Connecting,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SslMode {
    #[default]
    Disabled,
    Require,
    Enabled,
}

impl SslMode {
    pub fn uses_tls(self) -> bool {
        !matches!(self, Self::Disabled)
    }

    pub fn danger_accept_invalid_certs(self) -> bool {
        matches!(self, Self::Require)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SshAuthMethod {
    #[default]
    Password,
    PrivateKey,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub keychain_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            keychain_enabled: false,
        }
    }
}

fn default_ssh_port() -> u16 {
    22
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyRef {
    pub target_table: String,
    pub target_column: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_schema: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_delete: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDefinition {
    pub name: String,
    #[serde(rename = "type")]
    pub data_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_nullable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_unique: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreign_key: Option<ForeignKeyRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexDefinition {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    #[serde(rename = "type")]
    pub index_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub id: String,
    pub name: String,
    pub schema: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub row_count: i64,
    pub size_mb: f64,
    pub tags: Vec<String>,
    pub columns: Vec<ColumnDefinition>,
    pub indexes: Vec<IndexDefinition>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_view: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_sql: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSchema {
    pub id: String,
    pub name: String,
    pub dialect: DatabaseDialect,
    pub version: String,
    pub connection_host: String,
    pub connection_port: u16,
    pub environment: Environment,
    pub status: ConnectionStatus,
    pub tables: Vec<TableSchema>,
    pub total_size_mb: f64,
    pub active_connections: i64,
    pub queries_per_second: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TabType {
    TableData,
    SqlEditor,
    ErdSchema,
    Metrics,
    ActivityLog,
    SchemaDesigner,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTab {
    pub id: String,
    #[serde(rename = "type")]
    pub tab_type: TabType,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_uncommitted_changes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_query_running: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryExecutionResult {
    pub id: String,
    pub query: String,
    pub timestamp: String,
    pub execution_time_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_rows: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryExecuteResponse {
    pub results: Vec<QueryExecutionResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedQuery {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub sql: String,
    pub database_id: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub is_bookmarked: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HistoryQueryType {
    Select,
    Insert,
    Update,
    Delete,
    Ddl,
    Explain,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HistoryStatus {
    Success,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLogItem {
    pub id: String,
    pub timestamp: String,
    pub database_name: String,
    pub query: String,
    #[serde(rename = "type")]
    pub query_type: HistoryQueryType,
    pub execution_time_ms: u64,
    pub rows_affected: u64,
    pub status: HistoryStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    pub user: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFolder {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveFolderInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub dialect: DatabaseDialect,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    #[serde(default)]
    pub ssl_mode: SslMode,
    pub pool_size: u32,
    pub environment: Environment,
    pub status: ConnectionStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default)]
    pub ssh_enabled: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default = "default_ssh_port")]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_user: String,
    #[serde(default)]
    pub ssh_auth: SshAuthMethod,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub dialect: DatabaseDialect,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    #[serde(default)]
    pub ssl_mode: SslMode,
    pub pool_size: u32,
    pub environment: Environment,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub ssh_enabled: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default = "default_ssh_port")]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_user: String,
    #[serde(default)]
    pub ssh_auth: SshAuthMethod,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_key_path: Option<String>,
    #[serde(default)]
    pub ssh_password: String,
    #[serde(default)]
    pub ssh_passphrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TablePreviewRequest {
    pub connection_id: String,
    pub schema: String,
    pub table: String,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteQueryRequest {
    pub connection_id: String,
    pub sql: String,
    #[serde(default = "default_true")]
    pub record_history: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSyncRequest {
    pub connection_id: String,
    pub last_fingerprint: Option<String>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSyncResponse {
    pub fingerprint: String,
    pub schema: Option<DatabaseSchema>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub tabs: Vec<WorkspaceTab>,
    pub active_tab_id: Option<String>,
    pub current_connection_id: Option<String>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            tabs: Vec::new(),
            active_tab_id: None,
            current_connection_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_profile_camel_case() {
        let json = r#"{
            "id":"c1","name":"Local","dialect":"PostgreSQL","host":"127.0.0.1","port":5432,
            "database":"app","user":"postgres","sslMode":"disabled","poolSize":8,
            "environment":"development","status":"disconnected"
        }"#;
        let profile: ConnectionProfile = serde_json::from_str(json).unwrap();
        assert_eq!(profile.pool_size, 8);
        assert_eq!(profile.database, "app");
        assert_eq!(profile.ssl_mode, SslMode::Disabled);
        let encoded = serde_json::to_value(&profile).unwrap();
        assert_eq!(encoded["poolSize"], 8);
        assert_eq!(encoded["dialect"], "PostgreSQL");
        assert_eq!(encoded["sslMode"], "disabled");
        assert!(encoded.get("folderId").is_none());
    }

    #[test]
    fn connection_folder_id_camel_case() {
        let json = r#"{
            "id":"c1","name":"Local","dialect":"PostgreSQL","host":"127.0.0.1","port":5432,
            "database":"app","user":"postgres","sslMode":"require","poolSize":8,
            "environment":"development","status":"disconnected","folderId":"folder_1"
        }"#;
        let profile: ConnectionProfile = serde_json::from_str(json).unwrap();
        assert_eq!(profile.folder_id.as_deref(), Some("folder_1"));
        let encoded = serde_json::to_value(&profile).unwrap();
        assert_eq!(encoded["folderId"], "folder_1");

        let folder: ConnectionFolder =
            serde_json::from_str(r#"{"id":"folder_1","name":"Prod"}"#).unwrap();
        assert_eq!(folder.name, "Prod");
        let input: SaveFolderInput = serde_json::from_str(r#"{"name":" Staging "}"#).unwrap();
        assert!(input.id.is_none());
        assert_eq!(input.name, " Staging ");
    }

    #[test]
    fn workspace_tab_type_snake_case() {
        let json = r#"{"id":"t1","type":"sql_editor","title":"Query 1"}"#;
        let tab: WorkspaceTab = serde_json::from_str(json).unwrap();
        assert_eq!(tab.tab_type, TabType::SqlEditor);
        let encoded = serde_json::to_value(&tab).unwrap();
        assert_eq!(encoded["type"], "sql_editor");
    }

    #[test]
    fn save_connection_and_execute_request_camel_case() {
        let json = r#"{
            "name":"Local","dialect":"PostgreSQL","host":"127.0.0.1","port":5432,
            "database":"app","user":"postgres","password":"secret","sslMode":"enabled",
            "poolSize":8,"environment":"development"
        }"#;
        let input: SaveConnectionInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.pool_size, 8);
        assert_eq!(input.ssl_mode, SslMode::Enabled);
        assert!(input.id.is_none());
        let encoded = serde_json::to_value(&input).unwrap();
        assert_eq!(encoded["poolSize"], 8);
        assert_eq!(encoded["sslMode"], "enabled");

        let req: ExecuteQueryRequest =
            serde_json::from_str(r#"{"connectionId":"c1","sql":"SELECT 1"}"#).unwrap();
        assert!(req.record_history);
        assert_eq!(req.connection_id, "c1");

        let sync: SchemaSyncRequest =
            serde_json::from_str(r#"{"connectionId":"c1","lastFingerprint":"abc"}"#).unwrap();
        assert!(!sync.force);
        assert_eq!(sync.last_fingerprint.as_deref(), Some("abc"));
        let encoded = serde_json::to_value(&SchemaSyncResponse {
            fingerprint: "abc".into(),
            schema: None,
        })
        .unwrap();
        assert_eq!(encoded["fingerprint"], "abc");
        assert!(encoded["schema"].is_null());
    }

    #[test]
    fn ssl_mode_tls_strategy() {
        assert!(!SslMode::Disabled.uses_tls());
        assert!(SslMode::Require.uses_tls());
        assert!(SslMode::Enabled.uses_tls());
        assert!(SslMode::Require.danger_accept_invalid_certs());
        assert!(!SslMode::Enabled.danger_accept_invalid_certs());
        assert!(!SslMode::Disabled.danger_accept_invalid_certs());
    }

    #[test]
    fn app_settings_default_disables_keychain() {
        let settings: AppSettings = serde_json::from_str("{}").unwrap();
        assert!(!settings.keychain_enabled);
        let encoded = serde_json::to_value(&AppSettings::default()).unwrap();
        assert_eq!(encoded["keychainEnabled"], false);
    }
}
