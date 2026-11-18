use std::time::{Duration, Instant};

use async_trait::async_trait;
use db_core::{
    AdapterError, ConnectConfig, DatabaseSchema, DocValue, DocumentAdapter, DocumentCommandResult,
    DocumentExportRequest, DocumentPage, DocumentSession, FieldSample, FindRequest,
    HistoryQueryType, IndexDraft, Namespace, QueryError, QueryErrorCategory, SqlRange,
};
use futures_util::TryStreamExt;
use mongodb::bson::{doc, Bson, Document};
use mongodb::options::{Collation, FindOptions, IndexOptions};
use mongodb::results::CollectionType;
use mongodb::{Client, Collection, IndexModel};

use crate::client::resolve_options;
use crate::error::{query_error, shell_query_error};
use crate::export::Writer;
use crate::objects;
use crate::run::{self, MAX_DOCUMENTS};
use crate::sample;
use crate::shell::parse_value;
use crate::values::{parse_editable, parse_editable_value, to_doc_value};

const COUNT_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SAMPLE: u32 = 1000;
const CHANGED_ON_SERVER: &str =
    "The document changed on the server after it was loaded. Reload it and apply your edit again.";
const ID_CHANGED: &str = "_id cannot be changed. Insert a copy and delete the original instead.";

pub struct MongoAdapter;

pub struct MongoSession {
    client: Client,
    default_db: Option<String>,
}

fn adapter_error(err: mongodb::error::Error) -> AdapterError {
    AdapterError::msg(query_error(&err).message)
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

/// Filter, projection and sort of a find or an export.
fn find_args(
    filter: &str,
    projection: &str,
    sort: &str,
) -> Result<(Document, FindOptions), Box<QueryError>> {
    let filter = document_arg(filter)?;
    let projection = document_arg(projection)?;
    let sort = document_arg(sort)?;
    let mut options = FindOptions::default();
    options.projection = Some(projection).filter(|p| !p.is_empty());
    options.sort = Some(sort).filter(|s| !s.is_empty());
    Ok((filter, options))
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

/// `"1"` and `"-1"` are directions; anything else (`"text"`, `"2dsphere"`,
/// `"hashed"`) is an index type and stays a string.
fn index_keys(keys: &[(String, String)]) -> Document {
    keys.iter()
        .map(|(field, kind)| {
            let value = kind
                .trim()
                .parse::<i32>()
                .map_or_else(|_| Bson::String(kind.clone()), Bson::Int32);
            (field.clone(), value)
        })
        .collect()
}

fn index_options(draft: &IndexDraft) -> Result<IndexOptions, AdapterError> {
    let mut options = IndexOptions::default();
    options.name = draft.name.clone().filter(|name| !name.trim().is_empty());
    options.unique = draft.unique.then_some(true);
    options.sparse = draft.sparse.then_some(true);
    options.hidden = draft.hidden.then_some(true);
    if let Some(seconds) = draft.ttl_seconds {
        let seconds = u64::try_from(seconds)
            .map_err(|_| AdapterError::msg("The TTL must be zero or more seconds."))?;
        options.expire_after = Some(Duration::from_secs(seconds));
    }
    if !draft.partial_filter.trim().is_empty() {
        options.partial_filter_expression = Some(
            document_arg(&draft.partial_filter)
                .map_err(|err| AdapterError::msg(err.message.clone()))?,
        );
    }
    Ok(options)
}

/// Matches the stored document only while it is still exactly `original`.
///
/// Comparing `$$ROOT` with the whole document is the only check that covers
/// field order, fields added by someone else, and keys like `"a.b"` or
/// `"$x"`: a top-level filter on those keys reads `"a.b"` as a path and
/// rejects `"$x"` as an unknown operator. `$literal` keeps the server from
/// evaluating `$`-prefixed keys or `"$…"` strings inside the original.
fn unchanged_filter(id: Bson, original: Document) -> Document {
    doc! {
        "_id": id,
        "$expr": { "$eq": ["$$ROOT", { "$literal": original }] },
    }
}

/// The replacement keeps the original `_id`, first, when it has none.
fn replacement_with_id(id: &Bson, replacement: Document) -> Result<Document, AdapterError> {
    match replacement.get("_id") {
        None => {
            let mut with_id = doc! { "_id": id.clone() };
            with_id.extend(replacement);
            Ok(with_id)
        }
        Some(new_id) if new_id == id => Ok(replacement),
        Some(_) => Err(AdapterError::msg(ID_CHANGED)),
    }
}

impl MongoSession {
    fn collection(&self, ns: &Namespace) -> Collection<Document> {
        self.client
            .database(&ns.database)
            .collection(&ns.collection)
    }

    /// Unknown counts as a view, which only costs the slower exact count.
    async fn is_view(&self, ns: &Namespace) -> bool {
        let listed = self
            .client
            .database(&ns.database)
            .list_collections()
            .filter(doc! { "name": &ns.collection })
            .await;
        match listed {
            Ok(cursor) => cursor.try_collect::<Vec<_>>().await.map_or(true, |specs| {
                specs
                    .iter()
                    .any(|spec| spec.collection_type == CollectionType::View)
            }),
            Err(_) => true,
        }
    }

    /// `None` when counting failed or ran past `COUNT_TIMEOUT`. The estimate
    /// reads collection metadata, which a view does not have.
    async fn total(&self, ns: &Namespace, filter: &Document) -> Option<u64> {
        let coll = self.collection(ns);
        if filter.is_empty() && !self.is_view(ns).await {
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
        let (filter, mut options) = match find_args(&req.filter, &req.projection, &req.sort) {
            Ok(args) => args,
            Err(error) => return Ok(failed_page(*error, started)),
        };
        options.limit = Some(req.limit.clamp(1, MAX_DOCUMENTS));
        options.skip = Some(req.skip.max(0) as u64);
        let found = self
            .collection(&req.ns)
            .find(filter.clone())
            .with_options(options)
            .await;
        let documents: Vec<Document> = match found {
            Ok(cursor) => match cursor.try_collect().await {
                Ok(documents) => documents,
                Err(err) => return Ok(failed_page(query_error(&err), started)),
            },
            Err(err) => return Ok(failed_page(query_error(&err), started)),
        };
        let total = self.total(&req.ns, &filter).await;
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

    async fn sample_fields(&self, ns: &Namespace, size: u32) -> Result<FieldSample, AdapterError> {
        let size = size.clamp(1, MAX_SAMPLE);
        let docs: Vec<Document> = self
            .collection(ns)
            .aggregate(vec![doc! { "$sample": { "size": size as i32 } }])
            .await
            .map_err(adapter_error)?
            .try_collect()
            .await
            .map_err(adapter_error)?;
        Ok(sample::summarize(&docs))
    }

    async fn run(
        &self,
        database: &str,
        text: &str,
        page_size: i64,
    ) -> Result<Vec<DocumentCommandResult>, AdapterError> {
        Ok(run::execute(&self.client, database, text, page_size).await)
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
        ns: &Namespace,
        original: &str,
        replacement: &str,
    ) -> Result<(), AdapterError> {
        let original = parse_editable(original).map_err(AdapterError::msg)?;
        let replacement = parse_editable(replacement).map_err(AdapterError::msg)?;
        let Some(id) = original.get("_id").cloned() else {
            return Err(AdapterError::msg(
                "The loaded document has no _id, so it cannot be replaced.",
            ));
        };
        let replacement = replacement_with_id(&id, replacement)?;
        let result = self
            .collection(ns)
            .replace_one(unchanged_filter(id, original), replacement)
            // A collection's default collation can make "ada" equal "Ada" in $expr.
            .collation(Collation::builder().locale("simple").build())
            .await
            .map_err(adapter_error)?;
        if result.matched_count == 0 {
            return Err(AdapterError::msg(CHANGED_ON_SERVER));
        }
        Ok(())
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

    async fn create_collection(&self, ns: &Namespace) -> Result<(), AdapterError> {
        self.client
            .database(&ns.database)
            .create_collection(&ns.collection)
            .await
            .map_err(adapter_error)
    }

    async fn drop_collection(&self, ns: &Namespace) -> Result<(), AdapterError> {
        self.collection(ns).drop().await.map_err(adapter_error)
    }

    async fn create_index(
        &self,
        ns: &Namespace,
        draft: &IndexDraft,
    ) -> Result<String, AdapterError> {
        let model = IndexModel::builder()
            .keys(index_keys(&draft.keys))
            .options(index_options(draft)?)
            .build();
        let result = self
            .collection(ns)
            .create_index(model)
            .await
            .map_err(adapter_error)?;
        Ok(result.index_name)
    }

    async fn drop_index(&self, ns: &Namespace, name: &str) -> Result<(), AdapterError> {
        if name == "_id_" {
            return Err(AdapterError::msg("The _id index cannot be dropped."));
        }
        self.collection(ns)
            .drop_index(name)
            .await
            .map_err(adapter_error)
    }

    async fn export(&self, req: &DocumentExportRequest) -> Result<Vec<u8>, AdapterError> {
        let (filter, options) = find_args(&req.filter, &req.projection, &req.sort)
            .map_err(|err| AdapterError::msg(err.message.clone()))?;
        let mut cursor = self
            .collection(&req.ns)
            .find(filter)
            .with_options(options)
            .await
            .map_err(adapter_error)?;
        let mut writer = Writer::new(req.format, req.mode);
        while let Some(doc) = cursor.try_next().await.map_err(adapter_error)? {
            writer.push(doc);
        }
        Ok(writer.finish())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unchanged_filter_compares_the_whole_document() {
        let original = doc! { "_id": 1, "a.b": 1, "meta": { "$x": 1 } };
        assert_eq!(
            unchanged_filter(Bson::Int32(1), original.clone()),
            doc! {
                "_id": 1,
                "$expr": { "$eq": ["$$ROOT", { "$literal": original }] },
            }
        );
    }

    #[test]
    fn replacement_keeps_or_refuses_the_id() {
        let id = Bson::Int32(7);
        assert_eq!(
            replacement_with_id(&id, doc! { "a": 1 }).unwrap(),
            doc! { "_id": 7, "a": 1 }
        );
        assert_eq!(
            replacement_with_id(&id, doc! { "a": 1, "_id": 7 }).unwrap(),
            doc! { "a": 1, "_id": 7 }
        );
        assert_eq!(
            replacement_with_id(&id, doc! { "_id": 7_i64 })
                .unwrap_err()
                .to_string(),
            ID_CHANGED
        );
    }

    #[test]
    fn index_keys_keep_order_and_types() {
        let keys = [("b", "-1"), ("a", "1"), ("t", "text"), ("g", "2dsphere")]
            .map(|(k, v)| (k.to_string(), v.to_string()));
        assert_eq!(
            index_keys(&keys),
            doc! { "b": -1, "a": 1, "t": "text", "g": "2dsphere" }
        );
    }
}
