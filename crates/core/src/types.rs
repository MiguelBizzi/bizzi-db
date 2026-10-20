use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::query_error::QueryError;

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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub keychain_enabled: bool,
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
pub struct IndexKey {
    pub expression: String,
    #[serde(default)]
    pub is_expression: bool,
    #[serde(default)]
    pub descending: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nulls_first: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opclass: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collation: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IndexConstraintKind {
    Primary,
    Unique,
    Exclusion,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexConstraint {
    pub name: String,
    pub kind: IndexConstraintKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexStorageParam {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexDefinition {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    #[serde(rename = "type")]
    pub index_type: String,
    #[serde(default)]
    pub keys: Vec<IndexKey>,
    #[serde(default)]
    pub include_columns: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predicate: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definition: Option<String>,
    #[serde(default)]
    pub is_primary: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraint: Option<IndexConstraint>,
    #[serde(default = "default_true")]
    pub is_valid: bool,
    #[serde(default)]
    pub nulls_not_distinct: bool,
    #[serde(default)]
    pub storage_params: Vec<IndexStorageParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tablespace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scans: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoutineKind {
    Function,
    Procedure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ParameterMode {
    In,
    Out,
    InOut,
    Variadic,
    Table,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoutineParameter {
    #[serde(default)]
    pub name: String,
    pub data_type: String,
    pub mode: ParameterMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoutineDefinition {
    pub id: String,
    pub oid: String,
    pub schema: String,
    pub name: String,
    pub kind: RoutineKind,
    pub identity_arguments: String,
    pub parameters: Vec<RoutineParameter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,
    #[serde(default)]
    pub returns_set: bool,
    pub language: String,
    pub volatility: String,
    #[serde(default)]
    pub is_strict: bool,
    #[serde(default)]
    pub security_definer: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parallel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leakproof: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows: Option<f64>,
    #[serde(default)]
    pub has_sql_body: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoutineSource {
    pub definition: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoutineSourceRequest {
    pub connection_id: String,
    pub schema: String,
    pub oid: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_materialized: Option<bool>,
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
    #[serde(default)]
    pub routines: Vec<RoutineDefinition>,
    /// Languages routines can be written in.
    #[serde(default)]
    pub languages: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_version_num: Option<i32>,
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
    FunctionDesigner,
    ViewDesigner,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routine_id: Option<String>,
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
    /// Structured form of `error`; set whenever `error` comes from the database.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_info: Option<QueryError>,
    /// Set when `rows` is one page of a larger result: the page's size and
    /// offset, and, when it was counted, how many rows the query returns in all.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_rows: Option<u64>,
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
    /// Row conditions, ANDed together and evaluated by the database.
    #[serde(default)]
    pub filters: Vec<TableFilter>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FilterOperator {
    #[serde(rename = "=")]
    Eq,
    #[serde(rename = "!=")]
    NotEq,
    #[serde(rename = ">")]
    Gt,
    #[serde(rename = "<")]
    Lt,
    #[serde(rename = ">=")]
    Gte,
    #[serde(rename = "<=")]
    Lte,
    #[serde(rename = "LIKE")]
    Like,
    #[serde(rename = "ILIKE")]
    ILike,
    #[serde(rename = "IS NULL")]
    IsNull,
    #[serde(rename = "IS NOT NULL")]
    IsNotNull,
    #[serde(rename = "IN")]
    In,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableFilter {
    pub column: String,
    pub operator: FilterOperator,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteQueryRequest {
    pub connection_id: String,
    pub sql: String,
    #[serde(default = "default_true")]
    pub record_history: bool,
    /// Page the rows of single read-only statements; omitted returns every row.
    #[serde(default)]
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryPageRequest {
    pub connection_id: String,
    pub sql: String,
    pub limit: i64,
    pub offset: i64,
    /// Also count the rows the query returns in all (one extra scan).
    #[serde(default)]
    pub with_count: bool,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub tabs: Vec<WorkspaceTab>,
    pub active_tab_id: Option<String>,
    pub current_connection_id: Option<String>,
    /// Last active tab of each connection, keyed by connection id.
    #[serde(default)]
    pub active_tab_by_connection: std::collections::HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_state_loads_without_active_tab_by_connection() {
        let legacy = r#"{"tabs":[],"activeTabId":null,"currentConnectionId":"c1"}"#;
        let ws: WorkspaceState = serde_json::from_str(legacy).unwrap();
        assert!(ws.active_tab_by_connection.is_empty());

        let json = r#"{"tabs":[],"activeTabId":null,"currentConnectionId":null,
            "activeTabByConnection":{"c1":"t1"}}"#;
        let ws: WorkspaceState = serde_json::from_str(json).unwrap();
        assert_eq!(
            ws.active_tab_by_connection.get("c1").map(String::as_str),
            Some("t1")
        );
    }

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
        assert_eq!(req.page_size, None);
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
    fn legacy_index_payload_loads_with_defaults() {
        let json = r#"{"name":"i","columns":["a"],"isUnique":false,"type":"BTREE"}"#;
        let index: IndexDefinition = serde_json::from_str(json).unwrap();
        assert!(index.keys.is_empty());
        assert!(index.is_valid);
        assert!(index.constraint.is_none());
    }

    #[test]
    fn function_designer_tab_round_trips() {
        let json = r#"{"id":"t1","type":"function_designer","title":"f","routineId":"public.f()"}"#;
        let tab: WorkspaceTab = serde_json::from_str(json).unwrap();
        assert_eq!(tab.tab_type, TabType::FunctionDesigner);
        assert_eq!(tab.routine_id.as_deref(), Some("public.f()"));
        let encoded = serde_json::to_value(&tab).unwrap();
        assert_eq!(encoded["type"], "function_designer");
    }

    #[test]
    fn app_settings_default_disables_keychain() {
        let settings: AppSettings = serde_json::from_str("{}").unwrap();
        assert!(!settings.keychain_enabled);
        let encoded = serde_json::to_value(AppSettings::default()).unwrap();
        assert_eq!(encoded["keychainEnabled"], false);
    }
}
