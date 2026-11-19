use std::time::Instant;

use chrono::Utc;
use db_core::{DocValue, DocumentCommandResult, QueryError, QueryErrorCategory};
use futures_util::TryStreamExt;
use mongodb::bson::{doc, from_document, Bson, Document};
use mongodb::options::{
    AggregateOptions, CountOptions, DeleteOptions, DistinctOptions, DropCollectionOptions,
    EstimatedDocumentCountOptions, FindOneOptions, FindOptions, IndexOptions, InsertManyOptions,
    InsertOneOptions, ReplaceOptions, UpdateModifications, UpdateOptions,
};
use mongodb::results::{DeleteResult, UpdateResult};
use mongodb::{Client, Collection, Cursor, Database, IndexModel};
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::error::{query_error, shell_query_error};
use crate::shell::{parse_command, ChainOp, Method, ShellCommand, ShellError};
use crate::split::split_ranges;
use crate::values::to_doc_value;

/// Upper bound on documents one cursor result keeps, whatever page size the
/// caller asks for.
pub const MAX_DOCUMENTS: i64 = 1000;

/// One statement of a script, with the database it runs against.
#[derive(Debug, Clone, PartialEq)]
pub struct Statement<'a> {
    pub text: &'a str,
    pub database: String,
    pub command: Result<ShellCommand, QueryError>,
}

/// Splits and parses `script`. `use` changes the database of the statements
/// after it; planning stops after the first statement that does not parse.
pub fn plan<'a>(database: &str, script: &'a str) -> Vec<Statement<'a>> {
    let mut bytes = Utf16ToBytes::new(script);
    let mut current = database.to_string();
    let mut statements = Vec::new();
    for range in split_ranges(script) {
        let (start, end) = (bytes.at(range.start), bytes.at(range.end));
        let text = &script[start..end];
        let command = parse_command(text).map_err(|err| {
            // Positions are reported against the whole script, where the editor puts the caret.
            let shifted = ShellError {
                message: err.message,
                offset: err.offset + range.start,
            };
            shell_query_error(&shifted, script)
        });
        if let Ok(ShellCommand::Use(db)) = &command {
            current = db.clone();
        }
        let failed = command.is_err();
        statements.push(Statement {
            text,
            database: current.clone(),
            command,
        });
        if failed {
            break;
        }
    }
    statements
}

/// Maps increasing UTF-16 offsets to byte offsets in one pass.
struct Utf16ToBytes<'a> {
    chars: std::str::CharIndices<'a>,
    len: usize,
    units: usize,
    byte: usize,
}

impl<'a> Utf16ToBytes<'a> {
    fn new(text: &'a str) -> Self {
        Utf16ToBytes {
            chars: text.char_indices(),
            len: text.len(),
            units: 0,
            byte: 0,
        }
    }

    fn at(&mut self, units: usize) -> usize {
        while self.units < units {
            match self.chars.next() {
                Some((_, c)) => {
                    self.units += c.len_utf16();
                    self.byte += c.len_utf8();
                }
                None => return self.len,
            }
        }
        self.byte
    }
}

#[derive(Default)]
struct Outcome {
    documents: Option<Vec<DocValue>>,
    value: Option<DocValue>,
    affected: Option<u64>,
}

impl Outcome {
    fn documents(documents: Vec<DocValue>) -> Self {
        Outcome {
            documents: Some(documents),
            ..Default::default()
        }
    }

    fn value(value: Bson) -> Self {
        Outcome {
            value: Some(to_doc_value(&value)),
            ..Default::default()
        }
    }

    fn write(value: Document, affected: u64) -> Self {
        Outcome {
            value: Some(to_doc_value(&Bson::Document(value))),
            affected: Some(affected),
            ..Default::default()
        }
    }
}

/// Runs each statement in order and stops after the first failure, which is
/// the last result.
pub async fn execute(
    client: &Client,
    database: &str,
    script: &str,
    page_size: i64,
) -> Vec<DocumentCommandResult> {
    let cap = page_size.clamp(1, MAX_DOCUMENTS) as usize;
    let mut results = Vec::new();
    for statement in plan(database, script) {
        let started = Instant::now();
        let timestamp = Utc::now().to_rfc3339();
        let outcome = match statement.command {
            Ok(command) => run_one(client, &statement.database, command, cap).await,
            Err(err) => Err(Box::new(err)),
        };
        let mut result = DocumentCommandResult {
            id: format!("res_{}", Uuid::new_v4()),
            command: statement.text.to_string(),
            timestamp,
            execution_time_ms: 0,
            documents: None,
            value: None,
            affected: None,
            error: None,
            error_info: None,
        };
        let failed = match outcome {
            Ok(outcome) => {
                result.documents = outcome.documents;
                result.value = outcome.value;
                result.affected = outcome.affected;
                false
            }
            Err(err) => {
                result.error = Some(err.message.clone());
                result.error_info = Some(*err);
                true
            }
        };
        result.execution_time_ms = started.elapsed().as_millis() as u64;
        results.push(result);
        if failed {
            break;
        }
    }
    results
}

type Run<T> = Result<T, Box<QueryError>>;

fn driver(err: mongodb::error::Error) -> Box<QueryError> {
    Box::new(query_error(&err))
}

fn argument_error(message: String) -> Box<QueryError> {
    Box::new(QueryError::new(QueryErrorCategory::Syntax, message))
}

fn database(client: &Client, name: &str) -> Run<Database> {
    if name.is_empty() {
        return Err(Box::new(QueryError::new(
            QueryErrorCategory::Other,
            "No database is selected. Run use <database> first.",
        )));
    }
    Ok(client.database(name))
}

async fn run_one(client: &Client, db: &str, command: ShellCommand, cap: usize) -> Run<Outcome> {
    match command {
        ShellCommand::Use(name) => Ok(Outcome::value(Bson::String(format!(
            "switched to db {name}"
        )))),
        ShellCommand::ShowDatabases => {
            let names = client.list_database_names().await.map_err(driver)?;
            Ok(Outcome::value(strings(names)))
        }
        ShellCommand::ShowCollections | ShellCommand::GetCollectionNames => {
            let mut names = database(client, db)?
                .list_collection_names()
                .await
                .map_err(driver)?;
            names.sort();
            Ok(Outcome::value(strings(names)))
        }
        ShellCommand::RunCommand { admin, command } => {
            let target = if admin {
                client.database("admin")
            } else {
                database(client, db)?
            };
            let reply = target.run_command(command).await.map_err(driver)?;
            Ok(Outcome::value(Bson::Document(reply)))
        }
        ShellCommand::Collection {
            collection,
            method,
            args,
            chain,
        } => {
            let db = database(client, db)?;
            let call = Call {
                coll: db.collection(&collection),
                db,
                collection,
                method,
                args,
                cap,
            };
            call.run(chain).await
        }
    }
}

fn strings(names: Vec<String>) -> Bson {
    Bson::Array(names.into_iter().map(Bson::String).collect())
}

struct Call {
    db: Database,
    coll: Collection<Document>,
    collection: String,
    method: Method,
    args: Vec<Bson>,
    cap: usize,
}

impl Call {
    fn arg(&self, index: usize) -> Option<&Bson> {
        self.args.get(index)
    }

    fn document(&self, index: usize) -> Run<Option<Document>> {
        match self.arg(index) {
            None => Ok(None),
            Some(Bson::Document(doc)) => Ok(Some(doc.clone())),
            Some(_) => Err(argument_error(format!(
                "{}() expects a document as argument {}",
                self.method.name(),
                index + 1
            ))),
        }
    }

    fn filter(&self, index: usize) -> Run<Document> {
        Ok(self.document(index)?.unwrap_or_default())
    }

    fn required_document(&self, index: usize) -> Run<Document> {
        self.document(index)?.ok_or_else(|| {
            argument_error(format!(
                "{}() needs a document as argument {}",
                self.method.name(),
                index + 1
            ))
        })
    }

    fn documents(&self, index: usize) -> Run<Vec<Document>> {
        let expected = || {
            argument_error(format!(
                "{}() expects an array of documents as argument {}",
                self.method.name(),
                index + 1
            ))
        };
        let Some(Bson::Array(items)) = self.arg(index) else {
            return Err(expected());
        };
        items
            .iter()
            .map(|item| match item {
                Bson::Document(doc) => Ok(doc.clone()),
                _ => Err(expected()),
            })
            .collect()
    }

    /// Driver option structs deserialize from the shell's camelCase option names.
    fn options<T: DeserializeOwned + Default>(&self, index: usize) -> Run<T> {
        match self.document(index)? {
            None => Ok(T::default()),
            Some(doc) => from_document(doc).map_err(|err| {
                argument_error(format!(
                    "invalid options for {}(): {err}",
                    self.method.name()
                ))
            }),
        }
    }

    async fn take(&self, mut cursor: Cursor<Document>) -> Run<Vec<DocValue>> {
        let mut documents = Vec::new();
        while documents.len() < self.cap {
            match cursor.try_next().await.map_err(driver)? {
                Some(doc) => documents.push(to_doc_value(&Bson::Document(doc))),
                None => break,
            }
        }
        Ok(documents)
    }

    async fn run(self, chain: Vec<(ChainOp, Bson)>) -> Run<Outcome> {
        let coll = &self.coll;
        match self.method {
            Method::Find => {
                let filter = self.filter(0)?;
                let mut options: FindOptions = self.options(2)?;
                if let Some(projection) = self.document(1)? {
                    options.projection = Some(projection);
                }
                for (op, value) in chain {
                    apply_chain(&mut options, op, value)?;
                }
                // A negative limit means one batch in mongosh; either way it bounds the count.
                let cap = self.cap as i64;
                let limit = match options.limit.map(i64::abs) {
                    Some(n) if n > 0 => n.min(cap),
                    _ => cap,
                };
                options.limit = Some(limit);
                options.batch_size = Some(limit as u32);
                let cursor = coll
                    .find(filter)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::documents(self.take(cursor).await?))
            }
            Method::FindOne => {
                let filter = self.filter(0)?;
                let mut options: FindOneOptions = self.options(2)?;
                if let Some(projection) = self.document(1)? {
                    options.projection = Some(projection);
                }
                let found = coll
                    .find_one(filter)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::documents(
                    found
                        .map(|doc| to_doc_value(&Bson::Document(doc)))
                        .into_iter()
                        .collect(),
                ))
            }
            Method::Aggregate => {
                let pipeline = self.documents(0)?;
                let mut options: AggregateOptions = self.options(1)?;
                // No $limit is appended: it would change what $out or $merge write.
                options.batch_size = Some(self.cap as u32);
                let cursor = coll
                    .aggregate(pipeline)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::documents(self.take(cursor).await?))
            }
            Method::CountDocuments => {
                let options: CountOptions = self.options(1)?;
                let n = coll
                    .count_documents(self.filter(0)?)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::value(Bson::Int64(n as i64)))
            }
            Method::EstimatedDocumentCount => {
                let options: EstimatedDocumentCountOptions = self.options(0)?;
                let n = coll
                    .estimated_document_count()
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::value(Bson::Int64(n as i64)))
            }
            Method::Distinct => {
                let Some(Bson::String(field)) = self.arg(0) else {
                    return Err(argument_error(
                        "distinct() expects a field name as argument 1".into(),
                    ));
                };
                let options: DistinctOptions = self.options(2)?;
                let values = coll
                    .distinct(field, self.filter(1)?)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::value(Bson::Array(values)))
            }
            Method::InsertOne => {
                let options: InsertOneOptions = self.options(1)?;
                let result = coll
                    .insert_one(self.required_document(0)?)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(Outcome::write(
                    doc! { "acknowledged": true, "insertedId": result.inserted_id },
                    1,
                ))
            }
            Method::InsertMany => {
                let options: InsertManyOptions = self.options(1)?;
                let result = coll
                    .insert_many(self.documents(0)?)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                let mut ids: Vec<(usize, Bson)> = result.inserted_ids.into_iter().collect();
                ids.sort_by_key(|(index, _)| *index);
                let count = ids.len() as u64;
                let ids: Vec<Bson> = ids.into_iter().map(|(_, id)| id).collect();
                Ok(Outcome::write(
                    doc! { "acknowledged": true, "insertedIds": ids },
                    count,
                ))
            }
            Method::UpdateOne | Method::UpdateMany => {
                let filter = self.required_document(0)?;
                let update = match self.arg(1) {
                    Some(Bson::Document(doc)) => UpdateModifications::Document(doc.clone()),
                    Some(Bson::Array(_)) => UpdateModifications::Pipeline(self.documents(1)?),
                    _ => {
                        return Err(argument_error(format!(
                            "{}() expects an update document or pipeline as argument 2",
                            self.method.name()
                        )))
                    }
                };
                let options: UpdateOptions = self.options(2)?;
                let result = if self.method == Method::UpdateOne {
                    coll.update_one(filter, update).with_options(options).await
                } else {
                    coll.update_many(filter, update).with_options(options).await
                }
                .map_err(driver)?;
                Ok(update_outcome(result))
            }
            Method::ReplaceOne => {
                let options: ReplaceOptions = self.options(2)?;
                let result = coll
                    .replace_one(self.required_document(0)?, self.required_document(1)?)
                    .with_options(options)
                    .await
                    .map_err(driver)?;
                Ok(update_outcome(result))
            }
            Method::DeleteOne | Method::DeleteMany => {
                let filter = self.required_document(0)?;
                let options: DeleteOptions = self.options(1)?;
                let DeleteResult { deleted_count, .. } = if self.method == Method::DeleteOne {
                    coll.delete_one(filter).with_options(options).await
                } else {
                    coll.delete_many(filter).with_options(options).await
                }
                .map_err(driver)?;
                Ok(Outcome::write(
                    doc! { "acknowledged": true, "deletedCount": deleted_count as i64 },
                    deleted_count,
                ))
            }
            Method::CreateIndex => {
                let options: IndexOptions = self.options(1)?;
                let model = IndexModel::builder()
                    .keys(self.required_document(0)?)
                    .options(options)
                    .build();
                let result = coll.create_index(model).await.map_err(driver)?;
                Ok(Outcome::value(Bson::String(result.index_name)))
            }
            Method::DropIndex => {
                let index = match self.arg(0) {
                    Some(value @ (Bson::String(_) | Bson::Document(_))) => value.clone(),
                    _ => {
                        return Err(argument_error(
                            "dropIndex() expects an index name or key document".into(),
                        ))
                    }
                };
                let reply = self
                    .db
                    .run_command(doc! { "dropIndexes": &self.collection, "index": index })
                    .await
                    .map_err(driver)?;
                Ok(Outcome::value(Bson::Document(reply)))
            }
            Method::GetIndexes => {
                let cursor = self
                    .db
                    .run_cursor_command(doc! { "listIndexes": &self.collection })
                    .await
                    .map_err(driver)?;
                Ok(Outcome::documents(self.take(cursor).await?))
            }
            Method::Drop => {
                let options: DropCollectionOptions = self.options(0)?;
                coll.drop().with_options(options).await.map_err(driver)?;
                Ok(Outcome::value(Bson::Boolean(true)))
            }
        }
    }
}

fn apply_chain(options: &mut FindOptions, op: ChainOp, value: Bson) -> Run<()> {
    let integer = |value: &Bson| match value {
        Bson::Int32(n) => Some(i64::from(*n)),
        Bson::Int64(n) => Some(*n),
        Bson::Double(n) if n.fract() == 0.0 => Some(*n as i64),
        _ => None,
    };
    let document = |value: Bson| match value {
        Bson::Document(doc) => Ok(doc),
        _ => Err(argument_error(format!(
            ".{}() expects a document",
            op.name()
        ))),
    };
    match op {
        ChainOp::Sort => options.sort = Some(document(value)?),
        ChainOp::Project | ChainOp::Projection => options.projection = Some(document(value)?),
        ChainOp::Limit => {
            options.limit = Some(
                integer(&value)
                    .ok_or_else(|| argument_error(".limit() expects an integer".into()))?,
            )
        }
        ChainOp::Skip => {
            let skip = integer(&value)
                .filter(|n| *n >= 0)
                .ok_or_else(|| argument_error(".skip() expects a non-negative integer".into()))?;
            options.skip = Some(skip as u64);
        }
    }
    Ok(())
}

fn update_outcome(result: UpdateResult) -> Outcome {
    let mut reply = doc! {
        "acknowledged": true,
        "matchedCount": result.matched_count as i64,
        "modifiedCount": result.modified_count as i64,
    };
    let upserted = result.upserted_id.is_some();
    if let Some(id) = result.upserted_id {
        reply.insert("upsertedId", id);
    }
    Outcome::write(reply, result.modified_count + u64::from(upserted))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::Method;
    use db_core::QueryErrorCategory;

    fn databases(statements: &[Statement]) -> Vec<String> {
        statements.iter().map(|s| s.database.clone()).collect()
    }

    #[test]
    fn run_switches_database_with_use() {
        let script = "db.a.find()\nuse other\ndb.b.find({ x: 1 });\nuse  third ; db.c.drop()";
        let statements = plan("shop", script);
        assert_eq!(
            databases(&statements),
            ["shop", "other", "other", "third", "third"]
        );
        assert_eq!(statements[2].text, "db.b.find({ x: 1 })");
        assert_eq!(statements[1].command, Ok(ShellCommand::Use("other".into())));
        assert!(matches!(
            &statements[4].command,
            Ok(ShellCommand::Collection { collection, method: Method::Drop, .. }) if collection == "c"
        ));

        // A script starts from the caller's database every time.
        assert_eq!(databases(&plan("shop", "db.a.find()")), ["shop"]);
    }

    #[test]
    fn plan_stops_at_the_first_syntax_error_with_a_script_position() {
        let script = "db.a.find()\n// 😀\ndb.a.bogus()\ndb.a.find()";
        let statements = plan("shop", script);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].command.is_ok());
        let err = statements[1].command.clone().unwrap_err();
        assert_eq!(err.category, QueryErrorCategory::Syntax);
        let position = err.position.expect("position");
        assert_eq!(position.line, 3);
        assert_eq!(position.column, Some(6));
        let before = "db.a.find()\n// 😀\ndb.a.";
        assert_eq!(position.offset, before.encode_utf16().count() as u32 + 1);
    }
}
