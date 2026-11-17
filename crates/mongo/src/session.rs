use std::time::{Duration, Instant};

use async_trait::async_trait;
use db_core::{
    AdapterError, ConnectConfig, DatabaseSchema, DocValue, DocumentAdapter, DocumentCommandResult,
    DocumentExportRequest, DocumentPage, DocumentSession, FieldSample, FindRequest,
    HistoryQueryType, IndexDraft, Namespace, QueryError, QueryErrorCategory, SqlRange,
};
use futures_util::TryStreamExt;
use mongodb::bson::{doc, Bson, Document};
use mongodb::{Client, Collection};

use crate::client::resolve_options;
use crate::error::{query_error, shell_query_error};
use crate::objects;
use crate::shell::parse_value;
use crate::values::{parse_editable, parse_editable_value, to_doc_value};

const MAX_FIND_LIMIT: i64 = 1000;
const COUNT_TIMEOUT: Duration = Duration::from_secs(5);

pub struct MongoAdapter;

pub struct MongoSession {
    client: Client,
    default_db: Option<String>,
}

fn adapter_error(err: mongodb::error::Error) -> AdapterError {
    AdapterError::msg(query_error(&err).message)
}

fn not_implemented<T>() -> Result<T, AdapterError> {
    Err(AdapterError::msg("not implemented"))
}

/// The client connects lazily, so a ping makes a wrong host or password fail
/// here instead of on the first query.
async fn open(cfg: &ConnectConfig) -> Result<Client, AdapterError> {
    let options = resolve_options(cfg, None)
        .await
        .map_err(AdapterError::msg)?;
    let client = Client::with_options(options).map_err(adapter_error)?;
    client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await
        .map_err(adapter_error)?;
    Ok(client)
}

#[async_trait]
impl DocumentAdapter for MongoAdapter {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError> {
        let started = Instant::now();
        let client = open(cfg).await?;
        let latency = started.elapsed().as_millis() as u64;
        let build = client
            .database("admin")
            .run_command(doc! { "buildInfo": 1 })
            .await
            .map_err(adapter_error)?;
        let version = build.get_str("version").unwrap_or_default().to_string();
        client.shutdown().await;
        Ok((latency, version))
    }

    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn DocumentSession>, AdapterError> {
        let client = open(cfg).await?;
        let default_db = Some(cfg.database.trim().to_string()).filter(|db| !db.is_empty());
        Ok(Box::new(MongoSession { client, default_db }))
    }

    fn statement_ranges(&self, text: &str) -> Vec<SqlRange> {
        crate::split::split_ranges(text)
    }

    fn classify(&self, text: &str) -> HistoryQueryType {
        crate::split::classify(text)
    }
}

/// Empty text means `{}`.
fn document_arg(text: &str) -> Result<Document, Box<QueryError>> {
    if text.trim().is_empty() {
        return Ok(Document::new());
    }
    match parse_value(text) {
        Ok(Bson::Document(doc)) => Ok(doc),
        Ok(_) => Err(Box::new(QueryError::new(
            QueryErrorCategory::Syntax,
            "expected a document such as { field: value }",
        ))),
        Err(err) => Err(Box::new(shell_query_error(&err, text))),
    }
}

fn failed_page(error: QueryError, started: Instant) -> DocumentPage {
    DocumentPage {
        documents: vec![],
        total: None,
        execution_time_ms: started.elapsed().as_millis() as u64,
        error: Some(error.message.clone()),
        error_info: Some(error),
    }
}

impl MongoSession {
    fn collection(&self, ns: &Namespace) -> Collection<Document> {
        self.client
            .database(&ns.database)
            .collection(&ns.collection)
    }

    /// `None` when counting failed or timed out (`COUNT_TIMEOUT`).
    async fn total(&self, coll: &Collection<Document>, filter: &Document) -> Option<u64> {
        if filter.is_empty() {
            if let Ok(n) = coll.estimated_document_count().await {
                return Some(n);
            }
        }
        coll.count_documents(filter.clone())
            .max_time(COUNT_TIMEOUT)
            .await
            .ok()
    }
}

#[async_trait]
impl DocumentSession for MongoSession {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError> {
        objects::introspect(&self.client, self.default_db.as_deref())
            .await
            .map_err(adapter_error)
    }

    async fn schema_fingerprint(&self) -> Result<String, AdapterError> {
        objects::schema_fingerprint(&self.client, self.default_db.as_deref())
            .await
            .map_err(adapter_error)
    }

    async fn find(&self, req: &FindRequest) -> Result<DocumentPage, AdapterError> {
        let started = Instant::now();
        let args = (|| {
            Ok::<_, Box<QueryError>>((
                document_arg(&req.filter)?,
                document_arg(&req.projection)?,
                document_arg(&req.sort)?,
            ))
        })();
        let (filter, projection, sort) = match args {
            Ok(args) => args,
            Err(error) => return Ok(failed_page(*error, started)),
        };
        let coll = self.collection(&req.ns);
        let mut find = coll
            .find(filter.clone())
            .limit(req.limit.clamp(1, MAX_FIND_LIMIT))
            .skip(req.skip.max(0) as u64);
        if !projection.is_empty() {
            find = find.projection(projection);
        }
        if !sort.is_empty() {
            find = find.sort(sort);
        }
        let documents: Vec<Document> = match find.await {
            Ok(cursor) => match cursor.try_collect().await {
                Ok(documents) => documents,
                Err(err) => return Ok(failed_page(query_error(&err), started)),
            },
            Err(err) => return Ok(failed_page(query_error(&err), started)),
        };
        let total = self.total(&coll, &filter).await;
        Ok(DocumentPage {
            documents: documents
                .into_iter()
                .map(|d| to_doc_value(&Bson::Document(d)))
                .collect(),
            total,
            execution_time_ms: started.elapsed().as_millis() as u64,
            error: None,
            error_info: None,
        })
    }

    async fn sample_fields(
        &self,
        _ns: &Namespace,
        _size: u32,
    ) -> Result<FieldSample, AdapterError> {
        not_implemented()
    }

    async fn run(
        &self,
        _database: &str,
        _text: &str,
        _page_size: i64,
    ) -> Result<Vec<DocumentCommandResult>, AdapterError> {
        not_implemented()
    }

    async fn insert(&self, ns: &Namespace, document: &str) -> Result<DocValue, AdapterError> {
        let document = parse_editable(document).map_err(AdapterError::msg)?;
        let result = self
            .collection(ns)
            .insert_one(document)
            .await
            .map_err(adapter_error)?;
        Ok(to_doc_value(&result.inserted_id))
    }

    async fn replace(
        &self,
        _ns: &Namespace,
        _original: &str,
        _replacement: &str,
    ) -> Result<(), AdapterError> {
        not_implemented()
    }

    async fn delete(&self, ns: &Namespace, ids: &[String]) -> Result<u64, AdapterError> {
        let ids = ids
            .iter()
            .map(|id| parse_editable_value(id))
            .collect::<Result<Vec<Bson>, String>>()
            .map_err(AdapterError::msg)?;
        let result = self
            .collection(ns)
            .delete_many(doc! { "_id": { "$in": ids } })
            .await
            .map_err(adapter_error)?;
        Ok(result.deleted_count)
    }

    async fn create_collection(&self, _ns: &Namespace) -> Result<(), AdapterError> {
        not_implemented()
    }

    async fn drop_collection(&self, _ns: &Namespace) -> Result<(), AdapterError> {
        not_implemented()
    }

    async fn create_index(
        &self,
        _ns: &Namespace,
        _draft: &IndexDraft,
    ) -> Result<String, AdapterError> {
        not_implemented()
    }

    async fn drop_index(&self, _ns: &Namespace, _name: &str) -> Result<(), AdapterError> {
        not_implemented()
    }

    async fn export(&self, _req: &DocumentExportRequest) -> Result<Vec<u8>, AdapterError> {
        not_implemented()
    }
}
