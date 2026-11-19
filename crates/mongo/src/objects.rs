use db_core::{
    CollectionKind, CollectionSchema, ConnectionStatus, DatabaseDialect, DatabaseSchema,
    DocumentIndex, Environment, Paradigm,
};
use futures_util::{stream, StreamExt, TryStreamExt};
use mongodb::bson::{doc, Bson, Document};
use mongodb::error::{ErrorKind, Result};
use mongodb::{Client, Database};
use sha2::{Digest, Sha256};

const SYSTEM_DATABASES: &[&str] = &["admin", "local", "config"];
const STATS_CONCURRENCY: usize = 8;

/// A collection with what `listCollections` and `listIndexes` returned for it,
/// kept for the fingerprint.
pub struct Listed {
    pub schema: CollectionSchema,
    pub options: Document,
    pub index_specs: Vec<Document>,
}

pub struct CollectionFingerprint {
    pub database: String,
    pub collection: String,
    pub kind: CollectionKind,
    pub options: Document,
    pub indexes: Vec<Document>,
}

impl From<&Listed> for CollectionFingerprint {
    fn from(listed: &Listed) -> Self {
        CollectionFingerprint {
            database: listed.schema.database.clone(),
            collection: listed.schema.name.clone(),
            kind: listed.schema.kind,
            options: listed.options.clone(),
            indexes: listed.index_specs.clone(),
        }
    }
}

/// Counts and sizes are left out, so inserts and deletes do not look like DDL.
pub fn fingerprint(lines: &[CollectionFingerprint]) -> String {
    let mut rendered: Vec<String> = lines
        .iter()
        .map(|line| {
            let indexes = Bson::Array(line.indexes.iter().cloned().map(Bson::Document).collect());
            format!(
                "{}\t{}\t{}\t{}\t{}",
                line.database,
                line.collection,
                kind_name(line.kind),
                Bson::Document(line.options.clone()).into_canonical_extjson(),
                indexes.into_canonical_extjson(),
            )
        })
        .collect();
    rendered.sort();
    Sha256::digest(rendered.join("\n").as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn kind_name(kind: CollectionKind) -> &'static str {
    match kind {
        CollectionKind::Collection => "collection",
        CollectionKind::View => "view",
        CollectionKind::Timeseries => "timeseries",
    }
}

pub fn user_databases(names: Vec<String>) -> Vec<String> {
    let mut names: Vec<String> = names
        .into_iter()
        .filter(|name| !SYSTEM_DATABASES.contains(&name.as_str()))
        .collect();
    names.sort();
    names
}

/// `None` for `system.*` namespaces (`system.views`, `system.buckets.*`).
pub fn listed(database: &str, listing: &Document, index_specs: Vec<Document>) -> Option<Listed> {
    let name = listing.get_str("name").ok()?;
    if name.starts_with("system.") {
        return None;
    }
    let options = listing.get_document("options").cloned().unwrap_or_default();
    let kind = match listing.get_str("type").unwrap_or("collection") {
        "view" => CollectionKind::View,
        "timeseries" => CollectionKind::Timeseries,
        _ => CollectionKind::Collection,
    };
    Some(Listed {
        schema: CollectionSchema {
            id: format!("{database}.{name}"),
            database: database.into(),
            name: name.into(),
            kind,
            view_on: options.get_str("viewOn").ok().map(str::to_string),
            capped: options.get_bool("capped").unwrap_or(false),
            document_count: None,
            size_mb: None,
            indexes: index_specs.iter().map(index_from_spec).collect(),
        },
        options,
        index_specs,
    })
}

fn index_from_spec(spec: &Document) -> DocumentIndex {
    let keys = spec
        .get_document("key")
        .map(|key| {
            key.iter()
                .map(|(field, value)| {
                    let direction = match value {
                        Bson::String(s) => s.clone(),
                        other => {
                            integer(other).map_or_else(|| other.to_string(), |n| n.to_string())
                        }
                    };
                    (field.clone(), direction)
                })
                .collect()
        })
        .unwrap_or_default();
    DocumentIndex {
        name: spec.get_str("name").unwrap_or_default().into(),
        keys,
        unique: spec.get_bool("unique").unwrap_or(false),
        sparse: spec.get_bool("sparse").unwrap_or(false),
        hidden: spec.get_bool("hidden").unwrap_or(false),
        ttl_seconds: spec.get("expireAfterSeconds").and_then(integer),
        partial_filter: spec
            .get_document("partialFilterExpression")
            .ok()
            .map(|filter| {
                Bson::Document(filter.clone())
                    .into_relaxed_extjson()
                    .to_string()
            }),
    }
}

fn integer(value: &Bson) -> Option<i64> {
    match value {
        Bson::Int32(n) => Some(i64::from(*n)),
        Bson::Int64(n) => Some(*n),
        Bson::Double(n) if n.fract() == 0.0 => Some(*n as i64),
        _ => None,
    }
}

fn number(value: &Bson) -> Option<f64> {
    match value {
        Bson::Double(n) => Some(*n),
        other => integer(other).map(|n| n as f64),
    }
}

/// Reads the first document of `$collStats: { count: {}, storageStats: {} }`.
pub fn apply_stats(schema: &mut CollectionSchema, stats: &Document) {
    schema.document_count = stats.get("count").and_then(integer);
    schema.size_mb = stats
        .get_document("storageStats")
        .ok()
        .and_then(|storage| storage.get("size"))
        .and_then(number)
        .map(|bytes| bytes / (1024.0 * 1024.0));
}

pub fn version_num(array: &[Bson]) -> Option<i32> {
    let part = |i: usize| array.get(i).and_then(integer);
    let major = part(0)?;
    i32::try_from(major * 10_000 + part(1).unwrap_or(0) * 100 + part(2).unwrap_or(0)).ok()
}

/// `authorizedDatabases` lets a user without the `listDatabases` privilege
/// (a least-privilege Atlas user) still see the databases it can read.
async fn database_names(client: &Client, default_db: Option<&str>) -> Result<Vec<String>> {
    if let Some(db) = default_db {
        return Ok(vec![db.to_string()]);
    }
    let names = client
        .list_database_names()
        .authorized_databases(true)
        .await?;
    Ok(user_databases(names))
}

const UNAUTHORIZED: i32 = 13;
const NAMESPACE_NOT_FOUND: i32 = 26;

fn is_unauthorized(err: &mongodb::error::Error) -> bool {
    matches!(err.kind.as_ref(), ErrorKind::Command(c) if c.code == UNAUTHORIZED)
}

/// A privilege the user lacks hides that part of the schema; network and
/// server failures still fail introspection.
fn unless_unauthorized<T: Default>(result: Result<T>) -> Result<T> {
    match result {
        Err(err) if is_unauthorized(&err) => Ok(T::default()),
        other => other,
    }
}

/// `None` when the collection was dropped after `listCollections` named it
/// (servers running `$out` create and drop `tmp.agg_out.*` all the time), so
/// it is left out instead of failing the whole schema.
fn index_listing(result: Result<Vec<Document>>) -> Result<Option<Vec<Document>>> {
    match result {
        Err(err) if matches!(err.kind.as_ref(), ErrorKind::Command(c) if c.code == NAMESPACE_NOT_FOUND) => {
            Ok(None)
        }
        other => unless_unauthorized(other).map(Some),
    }
}

async fn cursor(db: &Database, command: Document) -> Result<Vec<Document>> {
    db.run_cursor_command(command).await?.try_collect().await
}

/// The full listing comes first because it carries kinds and options. A user
/// with only collection-level privileges is refused it and gets names alone
/// (`authorizedCollections` needs `nameOnly`), listed as plain collections.
async fn list_collections(db: &Database) -> Result<Vec<Document>> {
    match cursor(db, doc! { "listCollections": 1 }).await {
        Err(err) if is_unauthorized(&err) => {
            cursor(
                db,
                doc! { "listCollections": 1, "authorizedCollections": true, "nameOnly": true },
            )
            .await
        }
        other => other,
    }
}

async fn list(client: &Client, default_db: Option<&str>) -> Result<Vec<Listed>> {
    let mut listings = Vec::new();
    for database in database_names(client, default_db).await? {
        let db = client.database(&database);
        for listing in list_collections(&db).await? {
            listings.push((database.clone(), listing));
        }
    }
    let results: Vec<Result<Option<Listed>>> = stream::iter(listings)
        .map(|(database, listing)| async move {
            let Ok(name) = listing.get_str("name") else {
                return Ok(None);
            };
            // Views have no indexes of their own; listIndexes refuses them.
            // A refused listIndexes leaves the collection with none, which the
            // fingerprint sees the same way on every call for that user.
            let specs = if listing.get_str("type") == Ok("view") || name.starts_with("system.") {
                Vec::new()
            } else {
                let db = client.database(&database);
                match index_listing(cursor(&db, doc! { "listIndexes": name }).await)? {
                    Some(specs) => specs,
                    None => return Ok(None),
                }
            };
            Ok(listed(&database, &listing, specs))
        })
        .buffer_unordered(STATS_CONCURRENCY)
        .collect()
        .await;
    let mut all = results
        .into_iter()
        .filter_map(Result::transpose)
        .collect::<Result<Vec<Listed>>>()?;
    all.sort_by(|a, b| a.schema.id.cmp(&b.schema.id));
    Ok(all)
}

/// A refused or failing `$collStats` (missing `collStats` privilege, a
/// sharded or in-memory quirk) leaves the counts unknown rather than failing
/// the whole schema. Views cannot run it, and on a time-series collection it
/// counts buckets, not documents, so both stay unknown.
async fn attach_stats(client: &Client, listed: &mut [Listed]) {
    let targets: Vec<(usize, String, String)> = listed
        .iter()
        .enumerate()
        .filter(|(_, l)| l.schema.kind == CollectionKind::Collection)
        .map(|(i, l)| (i, l.schema.database.clone(), l.schema.name.clone()))
        .collect();
    let results: Vec<(usize, Option<Document>)> = stream::iter(targets)
        .map(|(i, database, name)| async move {
            let stats = async {
                client
                    .database(&database)
                    .collection::<Document>(&name)
                    .aggregate(vec![
                        doc! { "$collStats": { "count": {}, "storageStats": {} } },
                    ])
                    .await?
                    .try_next()
                    .await
            }
            .await;
            (i, stats.ok().flatten())
        })
        .buffer_unordered(STATS_CONCURRENCY)
        .collect()
        .await;
    for (i, stats) in results {
        if let Some(stats) = stats {
            apply_stats(&mut listed[i].schema, &stats);
        }
    }
}

pub async fn introspect(client: &Client, default_db: Option<&str>) -> Result<DatabaseSchema> {
    let build = client
        .database("admin")
        .run_command(doc! { "buildInfo": 1 })
        .await?;
    let version = build.get_str("version").unwrap_or_default().to_string();
    let server_version_num = build
        .get_array("versionArray")
        .ok()
        .and_then(|array| version_num(array));
    let mut listed = list(client, default_db).await?;
    attach_stats(client, &mut listed).await;
    let collections: Vec<CollectionSchema> = listed.into_iter().map(|l| l.schema).collect();
    let name = default_db.unwrap_or("MongoDB").to_string();
    Ok(DatabaseSchema {
        id: name.clone(),
        name,
        dialect: DatabaseDialect::MongoDB,
        version,
        connection_host: String::new(),
        connection_port: 0,
        environment: Environment::Development,
        status: ConnectionStatus::Connected,
        tables: vec![],
        routines: vec![],
        languages: vec![],
        server_version_num,
        total_size_mb: collections.iter().filter_map(|c| c.size_mb).sum(),
        active_connections: 0,
        queries_per_second: 0.0,
        paradigm: Paradigm::Document,
        collections,
    })
}

pub async fn schema_fingerprint(client: &Client, default_db: Option<&str>) -> Result<String> {
    let lines: Vec<CollectionFingerprint> = list(client, default_db)
        .await?
        .iter()
        .map(CollectionFingerprint::from)
        .collect();
    Ok(fingerprint(&lines))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{bson, doc};

    fn users() -> Listed {
        listed(
            "shop",
            &doc! { "name": "users", "type": "collection", "options": {}, "info": { "readOnly": false } },
            vec![
                doc! { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
                doc! { "v": 2, "key": { "email": 1 }, "name": "email_1", "unique": true,
                       "partialFilterExpression": { "email": { "$exists": true } } },
            ],
        )
        .unwrap()
    }

    #[test]
    fn fingerprint_ignores_counts() {
        let mut a = users();
        let mut b = users();
        a.schema.document_count = Some(24);
        a.schema.size_mb = Some(0.01);
        b.schema.document_count = Some(25);
        b.schema.size_mb = None;
        let events = listed(
            "shop",
            &doc! { "name": "events", "type": "collection", "options": { "capped": true, "size": 1_048_576 } },
            vec![],
        )
        .unwrap();
        let one = fingerprint(&[(&a).into(), (&events).into()]);
        let two = fingerprint(&[(&events).into(), (&b).into()]);
        assert_eq!(one, two);
        assert_eq!(one.len(), 64);
        assert!(one.chars().all(|c| c.is_ascii_hexdigit()));

        b.index_specs
            .push(doc! { "v": 2, "key": { "name": 1 }, "name": "name_1" });
        assert_ne!(one, fingerprint(&[(&events).into(), (&b).into()]));
    }

    fn command_error(code: i32, code_name: &str) -> mongodb::error::Error {
        let command: mongodb::error::CommandError = mongodb::bson::from_document(doc! {
            "code": code, "codeName": code_name, "errmsg": "x",
        })
        .unwrap();
        mongodb::error::ErrorKind::Command(command).into()
    }

    #[test]
    fn only_unauthorized_is_tolerated() {
        assert!(is_unauthorized(&command_error(13, "Unauthorized")));
        assert!(!is_unauthorized(&command_error(26, "NamespaceNotFound")));
        let io = std::io::Error::new(std::io::ErrorKind::ConnectionReset, "reset");
        let io: mongodb::error::Error =
            mongodb::error::ErrorKind::Io(std::sync::Arc::new(io)).into();
        assert!(!is_unauthorized(&io));

        let refused: Result<Vec<Document>> = Err(command_error(13, "Unauthorized"));
        assert_eq!(
            unless_unauthorized(refused).unwrap(),
            Vec::<Document>::new()
        );
        let failed: Result<Vec<Document>> = Err(io);
        assert!(unless_unauthorized(failed).is_err());
    }

    #[test]
    fn collection_dropped_before_list_indexes_is_skipped() {
        let gone: Result<Vec<Document>> = Err(command_error(26, "NamespaceNotFound"));
        assert_eq!(index_listing(gone).unwrap(), None);

        let refused: Result<Vec<Document>> = Err(command_error(13, "Unauthorized"));
        assert_eq!(index_listing(refused).unwrap(), Some(vec![]));

        let specs = vec![doc! { "key": { "_id": 1 }, "name": "_id_" }];
        assert_eq!(index_listing(Ok(specs.clone())).unwrap(), Some(specs));

        let other: Result<Vec<Document>> = Err(command_error(8000, "AtlasError"));
        assert!(index_listing(other).is_err());
    }

    #[test]
    fn name_only_listing_is_a_plain_collection() {
        let schema = listed("shop", &doc! { "name": "users" }, vec![])
            .unwrap()
            .schema;
        assert_eq!(schema.kind, CollectionKind::Collection);
        assert!(!schema.capped);
        assert_eq!(schema.view_on, None);
    }

    #[test]
    fn system_databases_skipped() {
        let names = ["shop", "admin", "local", "config", "analytics"]
            .map(String::from)
            .to_vec();
        assert_eq!(user_databases(names), vec!["analytics", "shop"]);
    }

    #[test]
    fn listing_maps_kinds_and_indexes() {
        let users = users().schema;
        assert_eq!(users.id, "shop.users");
        assert_eq!(users.kind, CollectionKind::Collection);
        assert_eq!(users.document_count, None);
        let email = &users.indexes[1];
        assert_eq!(email.keys, vec![("email".to_string(), "1".to_string())]);
        assert!(email.unique);
        assert!(email.partial_filter.as_deref().unwrap().contains("$exists"));

        let view = listed(
            "shop",
            &doc! { "name": "active_users", "type": "view",
            "options": { "viewOn": "users", "pipeline": [] } },
            vec![],
        )
        .unwrap()
        .schema;
        assert_eq!(view.kind, CollectionKind::View);
        assert_eq!(view.view_on.as_deref(), Some("users"));

        let metrics = listed(
            "analytics",
            &doc! { "name": "metrics", "type": "timeseries",
            "options": { "timeseries": { "timeField": "ts" } } },
            vec![],
        )
        .unwrap()
        .schema;
        assert_eq!(metrics.kind, CollectionKind::Timeseries);

        let events = listed(
            "shop",
            &doc! { "name": "events", "type": "collection", "options": { "capped": true } },
            vec![
                doc! { "key": { "at": 1 }, "name": "at_1", "expireAfterSeconds": 3600 },
                doc! { "key": { "bio": "text", "n": -1.0 }, "name": "t", "hidden": true, "sparse": true },
            ],
        )
        .unwrap()
        .schema;
        assert!(events.capped);
        assert_eq!(events.indexes[0].ttl_seconds, Some(3600));
        assert_eq!(
            events.indexes[1].keys,
            vec![
                ("bio".to_string(), "text".to_string()),
                ("n".to_string(), "-1".to_string())
            ]
        );
        assert!(events.indexes[1].hidden);
        assert!(events.indexes[1].sparse);

        assert!(listed(
            "shop",
            &doc! { "name": "system.views", "type": "collection" },
            vec![]
        )
        .is_none());
    }

    #[test]
    fn stats_fill_count_and_size() {
        let mut schema = users().schema;
        apply_stats(
            &mut schema,
            &doc! { "count": 24_i64, "storageStats": { "size": 2_097_152 } },
        );
        assert_eq!(schema.document_count, Some(24));
        assert_eq!(schema.size_mb, Some(2.0));
    }

    #[test]
    fn version_array_becomes_a_number() {
        let array = [bson!(8), bson!(0), bson!(15), bson!(0)];
        assert_eq!(version_num(&array), Some(80_015));
        assert_eq!(version_num(&[]), None);
    }
}
