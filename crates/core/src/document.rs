use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::adapter::{AdapterError, ConnectConfig};
use crate::query_error::QueryError;
use crate::sql::SqlRange;
use crate::types::{DatabaseSchema, HistoryQueryType};

/// Numbers are strings so JavaScript never rounds them; object entries are
/// pairs so key order survives.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum DocValue {
    Null,
    Bool {
        v: bool,
    },
    Int32 {
        v: String,
    },
    Int64 {
        v: String,
    },
    Double {
        v: String,
    },
    Decimal128 {
        v: String,
    },
    String {
        v: String,
    },
    ObjectId {
        v: String,
    },
    /// ISO-8601 UTC, millisecond precision, `Z` suffix.
    Date {
        v: String,
    },
    Binary {
        subtype: u8,
        base64: String,
    },
    /// Fields are not `t`/`i`: `t` is the enum tag.
    Timestamp {
        seconds: u32,
        increment: u32,
    },
    Regex {
        pattern: String,
        options: String,
    },
    Object {
        entries: Vec<(String, DocValue)>,
    },
    Array {
        items: Vec<DocValue>,
    },
    MinKey,
    MaxKey,
    Undefined,
    /// Code, symbol and DBPointer, as canonical EJSON text.
    Other {
        ejson: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Namespace {
    pub database: String,
    pub collection: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CollectionKind {
    Collection,
    View,
    Timeseries,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSchema {
    /// `"<db>.<coll>"`.
    pub id: String,
    pub database: String,
    pub name: String,
    pub kind: CollectionKind,
    pub view_on: Option<String>,
    pub capped: bool,
    pub document_count: Option<i64>,
    pub size_mb: Option<f64>,
    pub indexes: Vec<DocumentIndex>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentIndex {
    pub name: String,
    /// Field and direction or type: `"1"`, `"-1"`, `"text"`, `"2dsphere"`, `"hashed"`.
    pub keys: Vec<(String, String)>,
    pub unique: bool,
    pub sparse: bool,
    pub hidden: bool,
    pub ttl_seconds: Option<i64>,
    pub partial_filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexDraft {
    pub name: Option<String>,
    pub keys: Vec<(String, String)>,
    pub unique: bool,
    pub sparse: bool,
    pub hidden: bool,
    pub ttl_seconds: Option<i64>,
    /// Empty means no partial filter.
    pub partial_filter: String,
}

/// `filter`, `projection` and `sort` are shell-syntax documents; empty means `{}`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FindRequest {
    pub connection_id: String,
    pub ns: Namespace,
    pub filter: String,
    pub projection: String,
    pub sort: String,
    pub limit: i64,
    pub skip: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPage {
    pub documents: Vec<DocValue>,
    /// `None` when the count did not finish in time.
    pub total: Option<u64>,
    pub execution_time_ms: u64,
    pub error: Option<String>,
    pub error_info: Option<QueryError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCommandResult {
    pub id: String,
    pub command: String,
    pub timestamp: String,
    pub execution_time_ms: u64,
    pub documents: Option<Vec<DocValue>>,
    pub value: Option<DocValue>,
    pub affected: Option<u64>,
    pub error: Option<String>,
    pub error_info: Option<QueryError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldSummary {
    pub path: String,
    /// BSON type name and how many sampled documents had it.
    pub types: Vec<(String, u64)>,
    pub present_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldSample {
    pub sampled: u64,
    pub fields: Vec<FieldSummary>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DocumentExportFormat {
    JsonArray,
    Ndjson,
    Csv,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExtJsonMode {
    Relaxed,
    Canonical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentExportRequest {
    pub connection_id: String,
    pub ns: Namespace,
    pub filter: String,
    pub projection: String,
    pub sort: String,
    pub format: DocumentExportFormat,
    pub mode: ExtJsonMode,
    pub file_name: String,
}

/// `document`, `original`, `replacement` and `ids` are editable text.
#[async_trait]
// async-trait 0.1.83 puts #[must_use] on methods whose futures are already must_use; clippy 1.99 flags that expansion.
#[allow(clippy::double_must_use)]
pub trait DocumentSession: Send + Sync {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError>;
    async fn schema_fingerprint(&self) -> Result<String, AdapterError>;
    async fn find(&self, req: &FindRequest) -> Result<DocumentPage, AdapterError>;
    async fn sample_fields(&self, ns: &Namespace, size: u32) -> Result<FieldSample, AdapterError>;
    async fn run(
        &self,
        database: &str,
        text: &str,
        page_size: i64,
    ) -> Result<Vec<DocumentCommandResult>, AdapterError>;
    /// Returns the inserted `_id`.
    async fn insert(&self, ns: &Namespace, document: &str) -> Result<DocValue, AdapterError>;
    async fn replace(
        &self,
        ns: &Namespace,
        original: &str,
        replacement: &str,
    ) -> Result<(), AdapterError>;
    async fn delete(&self, ns: &Namespace, ids: &[String]) -> Result<u64, AdapterError>;
    async fn create_collection(&self, ns: &Namespace) -> Result<(), AdapterError>;
    async fn drop_collection(&self, ns: &Namespace) -> Result<(), AdapterError>;
    async fn create_index(
        &self,
        ns: &Namespace,
        draft: &IndexDraft,
    ) -> Result<String, AdapterError>;
    async fn drop_index(&self, ns: &Namespace, name: &str) -> Result<(), AdapterError>;
    async fn export(&self, req: &DocumentExportRequest) -> Result<Vec<u8>, AdapterError>;
}

#[async_trait]
// async-trait 0.1.83 puts #[must_use] on methods whose futures are already must_use; clippy 1.99 flags that expansion.
#[allow(clippy::double_must_use)]
pub trait DocumentAdapter: Send + Sync {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError>;
    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn DocumentSession>, AdapterError>;
    /// UTF-16 offsets, like `SqlDialect`.
    fn statement_ranges(&self, text: &str) -> Vec<SqlRange>;
    fn classify(&self, text: &str) -> HistoryQueryType;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ConnectionStatus, DatabaseDialect, Environment, Paradigm, TabType};
    use serde_json::json;

    #[test]
    fn doc_value_serializes_tagged() {
        assert_eq!(
            serde_json::to_value(DocValue::Int64 { v: "5".into() }).unwrap(),
            json!({"t":"int64","v":"5"})
        );
        let obj = DocValue::Object {
            entries: vec![("b".into(), DocValue::Null), ("a".into(), DocValue::Null)],
        };
        assert_eq!(
            serde_json::to_value(obj).unwrap(),
            json!({"t":"object","entries":[["b",{"t":"null"}],["a",{"t":"null"}]]})
        );
        assert_eq!(
            serde_json::to_value(DocValue::ObjectId { v: "x".into() }).unwrap(),
            json!({"t":"objectId","v":"x"})
        );
        assert_eq!(
            serde_json::to_value(DocValue::MinKey).unwrap(),
            json!({"t":"minKey"})
        );
    }

    #[test]
    fn old_schema_json_defaults_to_relational() {
        let schema = DatabaseSchema {
            id: "d".into(),
            name: "d".into(),
            dialect: DatabaseDialect::PostgreSQL,
            version: "16".into(),
            connection_host: String::new(),
            connection_port: 0,
            environment: Environment::Development,
            status: ConnectionStatus::Connected,
            tables: vec![],
            routines: vec![],
            languages: vec![],
            server_version_num: None,
            total_size_mb: 0.0,
            active_connections: 0,
            queries_per_second: 0.0,
            paradigm: Paradigm::Relational,
            collections: vec![],
        };
        let mut v = serde_json::to_value(&schema).unwrap();
        let o = v.as_object_mut().unwrap();
        o.remove("paradigm");
        o.remove("collections");
        let back: DatabaseSchema = serde_json::from_value(v).unwrap();
        assert_eq!(back.paradigm, Paradigm::Relational);
        assert!(back.collections.is_empty());
    }

    #[test]
    fn tab_type_document_variants_round_trip() {
        for (t, s) in [
            (TabType::CollectionDocuments, "collection_documents"),
            (TabType::DocumentQuery, "document_query"),
        ] {
            assert_eq!(serde_json::to_value(&t).unwrap(), json!(s));
            assert_eq!(serde_json::from_value::<TabType>(json!(s)).unwrap(), t);
        }
    }
}
