use db_core::conformance::{assert_document_session, DocumentSeed};
use db_core::{
    CollectionKind, CollectionSchema, ConnectConfig, DatabaseDialect, DatabaseSchema, DocValue,
    DocumentAdapter, DocumentExportFormat, DocumentExportRequest, DocumentSession, ExtJsonMode,
    FindRequest, IndexDraft, Namespace, Paradigm, QueryErrorCategory, SslMode,
};
use db_mongo::values::format_editable;
use db_mongo::{client_options, query_error, MongoAdapter};
use futures_util::TryStreamExt;
use mongodb::bson::oid::ObjectId;
use mongodb::bson::{doc, Document};
use mongodb::Client;

fn config(user: &str, password: &str, database: &str) -> ConnectConfig {
    let port = std::env::var("TEST_MONGO_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(27018);
    ConnectConfig {
        dialect: DatabaseDialect::MongoDB,
        host: std::env::var("TEST_MONGO_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port,
        database: database.into(),
        user: user.into(),
        password: password.into(),
        ssl_mode: SslMode::Disabled,
        pool_size: 2,
        params: [("authSource".to_string(), "admin".to_string())].into(),
    }
}

fn root(database: &str) -> ConnectConfig {
    config(
        &std::env::var("TEST_MONGO_USER").unwrap_or_else(|_| "root".into()),
        &std::env::var("TEST_MONGO_PASSWORD").unwrap_or_else(|_| "mongo".into()),
        database,
    )
}

fn reader() -> ConnectConfig {
    config("reader", "reader", "")
}

async fn connect(cfg: &ConnectConfig) -> Box<dyn DocumentSession> {
    MongoAdapter
        .connect(cfg)
        .await
        .expect("connect to local MongoDB (docker compose up -d --wait mongo)")
}

fn find<'a>(schema: &'a DatabaseSchema, database: &str, name: &str) -> &'a CollectionSchema {
    schema
        .collections
        .iter()
        .find(|c| c.database == database && c.name == name)
        .unwrap_or_else(|| panic!("{database}.{name} not listed"))
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn conformance() {
    // A private copy: the conformance insert and fingerprint would otherwise
    // race the tests below that count shop.users or create scratch collections.
    let _scratch = SCRATCH.read().await;
    let client = raw_client();
    let copy = client
        .database("conformance")
        .collection::<Document>("users");
    copy.drop().await.unwrap();
    let users: Vec<Document> = client
        .database("shop")
        .collection::<Document>("users")
        .find(doc! {})
        .await
        .unwrap()
        .try_collect()
        .await
        .unwrap();
    copy.insert_many(users).await.unwrap();

    let session = connect(&root("conformance")).await;
    assert_document_session(
        session.as_ref(),
        &DocumentSeed {
            database: "conformance",
            collection: "users",
            text_field: "name",
            text_like: "LOVELACE",
            min_documents: 20,
            bad_filter: "{ $nope: 1 }",
        },
    )
    .await
    .expect("conformance");
    client.database("conformance").drop().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn test_connection_reports_the_version() {
    let (_, version) = MongoAdapter
        .test_connection(&root(""))
        .await
        .expect("test connection");
    assert!(version.starts_with("8."), "{version}");
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn introspect_survives_a_view_and_an_unreadable_count() {
    let _exclusive = SCRATCH.write().await;
    let schema = connect(&root(""))
        .await
        .introspect()
        .await
        .expect("introspect");
    assert_eq!(schema.paradigm, Paradigm::Document);
    assert!(schema.tables.is_empty());
    assert!(schema.routines.is_empty());
    assert!(schema.server_version_num.unwrap_or(0) >= 80_000);

    let view = find(&schema, "shop", "active_users");
    assert_eq!(view.kind, CollectionKind::View);
    assert_eq!(view.view_on.as_deref(), Some("users"));
    assert_eq!(view.document_count, None);
    assert!(view.indexes.is_empty());

    let metrics = find(&schema, "analytics", "metrics");
    assert_eq!(metrics.kind, CollectionKind::Timeseries);

    let users = find(&schema, "shop", "users");
    assert_eq!(users.kind, CollectionKind::Collection);
    assert!(users.document_count.unwrap_or(0) >= 20);
    assert!(users.size_mb.is_some());
    let email = users.indexes.iter().find(|i| i.name == "email_1").unwrap();
    assert!(email.unique);
    assert!(email.partial_filter.is_some());

    let events = find(&schema, "shop", "events");
    assert!(events.capped);
    let at = events.indexes.iter().find(|i| i.name == "at_1").unwrap();
    assert_eq!(at.ttl_seconds, Some(3600));

    let orders = find(&schema, "shop", "orders");
    let compound = orders
        .indexes
        .iter()
        .find(|i| i.name == "userId_1_createdAt_-1")
        .unwrap();
    assert_eq!(
        compound.keys,
        vec![
            ("userId".to_string(), "1".to_string()),
            ("createdAt".to_string(), "-1".to_string())
        ]
    );
    assert!(orders
        .indexes
        .iter()
        .any(|i| i.name == "status_1" && i.hidden));

    assert!(schema
        .collections
        .iter()
        .all(|c| !c.name.starts_with("system.")));
    assert!(schema
        .collections
        .iter()
        .all(|c| !["admin", "local", "config"].contains(&c.database.as_str())));
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn lists_only_profile_database_when_set() {
    let schema = connect(&root("analytics"))
        .await
        .introspect()
        .await
        .expect("introspect");
    assert!(!schema.collections.is_empty());
    assert!(schema.collections.iter().all(|c| c.database == "analytics"));
    find(&schema, "analytics", "metrics");
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn wrong_password_is_permission() {
    let cfg = config("root", "wrong", "");
    assert!(MongoAdapter.connect(&cfg).await.is_err());

    let client = Client::with_options(client_options(&cfg, None).unwrap()).unwrap();
    let err = client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await
        .expect_err("wrong password must fail");
    assert_eq!(query_error(&err).category, QueryErrorCategory::Permission);
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn introspect_works_without_list_databases() {
    let schema = connect(&reader())
        .await
        .introspect()
        .await
        .expect("introspect as reader");
    for name in ["users", "orders", "events", "odd_keys", "active_users"] {
        find(&schema, "shop", name);
    }
    assert!(schema.collections.iter().all(|c| c.database != "analytics"));
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn reader_sees_unknown_counts_not_errors() {
    let cfg = reader();
    let schema = connect(&cfg).await.introspect().await.expect("introspect");
    let client = Client::with_options(client_options(&cfg, None).unwrap()).unwrap();
    for collection in &schema.collections {
        let stats = client
            .database(&collection.database)
            .collection::<Document>(&collection.name)
            .aggregate(vec![
                doc! { "$collStats": { "count": {}, "storageStats": {} } },
            ])
            .await;
        let refused = match stats {
            Ok(cursor) => cursor.try_collect::<Vec<_>>().await.is_err(),
            Err(_) => true,
        };
        if refused || collection.kind != CollectionKind::Collection {
            assert_eq!(collection.document_count, None, "{}", collection.id);
        } else {
            assert!(collection.document_count.is_some(), "{}", collection.id);
        }
    }
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn introspect_survives_refused_stats_and_indexes() {
    let session = connect(&config("limited", "limited", "")).await;
    let schema = session.introspect().await.expect("introspect as limited");
    let users = find(&schema, "shop", "users");
    assert_eq!(users.kind, CollectionKind::Collection);
    assert_eq!(users.document_count, None);
    assert_eq!(users.size_mb, None);
    assert!(users.indexes.is_empty());
    assert!(schema.collections.iter().all(|c| c.database == "shop"));

    let first = session.schema_fingerprint().await.expect("fingerprint");
    let second = session.schema_fingerprint().await.expect("fingerprint");
    assert_eq!(first, second);
}

/// Tests that create or drop scratch collections hold this shared; a test
/// that introspects every database holds it exclusively, because a collection
/// dropped between listCollections and listIndexes fails introspection.
static SCRATCH: tokio::sync::RwLock<()> = tokio::sync::RwLock::const_new(());

const SCRATCH_DB: &str = "t9_scratch";
const ADA: &str = "65a000000000000000000001";

fn raw_client() -> Client {
    Client::with_options(client_options(&root(""), None).unwrap()).unwrap()
}

fn ns(database: &str, collection: &str) -> Namespace {
    Namespace {
        database: database.into(),
        collection: collection.into(),
    }
}

fn find_request(ns: Namespace, filter: &str) -> FindRequest {
    FindRequest {
        connection_id: String::new(),
        ns,
        filter: filter.into(),
        projection: String::new(),
        sort: "{ _id: 1 }".into(),
        limit: 50,
        skip: 0,
    }
}

/// Copies seed documents into a fresh scratch collection so tests that edit
/// documents never touch the seed and can run again.
async fn scratch_copy(collection: &str, from: (&str, &str), filter: Document) -> Namespace {
    let client = raw_client();
    let target = client
        .database(SCRATCH_DB)
        .collection::<Document>(collection);
    target.drop().await.unwrap();
    let docs: Vec<Document> = client
        .database(from.0)
        .collection::<Document>(from.1)
        .find(filter)
        .await
        .unwrap()
        .try_collect()
        .await
        .unwrap();
    assert!(!docs.is_empty());
    target.insert_many(docs).await.unwrap();
    ns(SCRATCH_DB, collection)
}

async fn drop_scratch(collection: &str) {
    raw_client()
        .database(SCRATCH_DB)
        .collection::<Document>(collection)
        .drop()
        .await
        .unwrap();
}

async fn load_one(session: &dyn DocumentSession, ns: &Namespace) -> DocValue {
    let page = session
        .find(&find_request(ns.clone(), ""))
        .await
        .expect("find");
    assert_eq!(page.error, None);
    assert_eq!(page.documents.len(), 1);
    page.documents.into_iter().next().unwrap()
}

fn entry<'a>(value: &'a DocValue, key: &str) -> &'a DocValue {
    let DocValue::Object { entries } = value else {
        panic!("not an object: {value:?}");
    };
    &entries
        .iter()
        .find(|(k, _)| k == key)
        .unwrap_or_else(|| panic!("{key} missing"))
        .1
}

fn keys(value: &DocValue) -> Vec<&str> {
    let DocValue::Object { entries } = value else {
        panic!("not an object: {value:?}");
    };
    entries.iter().map(|(k, _)| k.as_str()).collect()
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn find_filters_with_shell_syntax() {
    let session = connect(&root("")).await;
    let mut req = find_request(
        ns("shop", "users"),
        r#"{ credits: { $gte: NumberLong(20000) }, createdAt: { $gte: ISODate("2024-01-01T00:00:00Z") } }"#,
    );
    req.projection = "{ name: 1, credits: 1 }".into();
    req.sort = "{ credits: 1 }".into();
    let page = session.find(&req).await.expect("find");
    assert_eq!(page.error, None);
    assert_eq!(page.documents.len(), 4);
    assert_eq!(page.total, Some(4));
    let first = &page.documents[0];
    assert_eq!(keys(first), ["_id", "name", "credits"]);
    assert_eq!(
        entry(first, "credits"),
        &DocValue::Int64 { v: "20000".into() }
    );

    req.limit = 0;
    req.filter = String::new();
    let page = session.find(&req).await.expect("find");
    assert_eq!(page.documents.len(), 1, "limit is clamped to at least 1");
    assert_eq!(page.total, Some(24));

    let view = session
        .find(&find_request(ns("shop", "active_users"), ""))
        .await
        .expect("find view");
    assert_eq!(view.error, None);
    assert_eq!(view.total, Some(view.documents.len() as u64));
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn find_bad_filter_reports_syntax() {
    let session = connect(&root("")).await;
    let page = session
        .find(&find_request(ns("shop", "users"), "{\n  name: ]\n}"))
        .await
        .expect("a parse error is a page, not Err");
    assert!(page.documents.is_empty());
    assert!(page.error.is_some());
    let info = page.error_info.expect("error info");
    assert_eq!(info.category, QueryErrorCategory::Syntax);
    assert_eq!(info.position.expect("position").line, 2);

    let mut req = find_request(ns("shop", "users"), "");
    req.sort = "[1]".into();
    let page = session.find(&req).await.expect("find");
    assert_eq!(
        page.error_info.map(|e| e.category),
        Some(QueryErrorCategory::Syntax)
    );
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn insert_then_delete_round_trip() {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let target = ns(SCRATCH_DB, "insert_delete");
    drop_scratch(&target.collection).await;

    let id = session
        .insert(&target, r#"{ name: "tmp", n: NumberLong(5) }"#)
        .await
        .expect("insert");
    let DocValue::ObjectId { v } = &id else {
        panic!("expected an ObjectId, got {id:?}");
    };
    let explicit = session
        .insert(&target, r#"{ "_id": 42, "name": "explicit" }"#)
        .await
        .expect("insert with _id");
    assert_eq!(explicit, DocValue::Int32 { v: "42".into() });
    let dup = session
        .insert(&target, r#"{ "_id": 42 }"#)
        .await
        .expect_err("duplicate _id");
    assert!(dup.to_string().contains("duplicate key"), "{dup}");

    let found = session
        .find(&find_request(
            target.clone(),
            &format!("{{ _id: ObjectId(\"{v}\") }}"),
        ))
        .await
        .expect("find");
    assert_eq!(
        entry(&found.documents[0], "n"),
        &DocValue::Int64 { v: "5".into() }
    );

    let deleted = session
        .delete(
            &target,
            &[format!("{{ \"$oid\": \"{v}\" }}"), "42".into(), "43".into()],
        )
        .await
        .expect("delete");
    assert_eq!(deleted, 2);
    let rest = session
        .find(&find_request(target.clone(), ""))
        .await
        .expect("find");
    assert!(rest.documents.is_empty());
    assert!(session.insert(&target, "[1]").await.is_err());
    drop_scratch(&target.collection).await;
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn replace_keeps_untouched_field_types() {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let target = scratch_copy(
        "replace_types",
        ("shop", "users"),
        doc! { "_id": ObjectId::parse_str(ADA).unwrap() },
    )
    .await;
    let loaded = load_one(session.as_ref(), &target).await;
    let original = format_editable(&loaded);
    let edited = original.replacen("\"Ada Lovelace\"", "\"Ada King\"", 1);
    assert_ne!(original, edited);
    session
        .replace(&target, &original, &edited)
        .await
        .expect("replace");

    let reloaded = load_one(session.as_ref(), &target).await;
    assert_eq!(
        entry(&reloaded, "name"),
        &DocValue::String {
            v: "Ada King".into()
        }
    );
    assert!(matches!(
        entry(&reloaded, "credits"),
        DocValue::Int64 { .. }
    ));
    assert!(matches!(
        entry(&reloaded, "balance"),
        DocValue::Decimal128 { .. }
    ));
    assert!(matches!(
        entry(&reloaded, "createdAt"),
        DocValue::Date { .. }
    ));
    assert_eq!(keys(&reloaded), keys(&loaded));

    let without_id = format_editable(&reloaded)
        .replacen(&format!("\"_id\": {{\"$oid\": \"{ADA}\"}},"), "", 1)
        .replacen("\"Ada King\"", "\"Ada Byron\"", 1);
    assert!(!without_id.contains("_id"));
    session
        .replace(&target, &format_editable(&reloaded), &without_id)
        .await
        .expect("a replacement without _id keeps the original _id");
    let again = load_one(session.as_ref(), &target).await;
    assert_eq!(keys(&again)[0], "_id");
    assert_eq!(entry(&again, "_id"), entry(&reloaded, "_id"));

    let moved = format_editable(&again).replacen(ADA, "65a0000000000000000000ff", 1);
    let err = session
        .replace(&target, &format_editable(&again), &moved)
        .await
        .expect_err("changed _id");
    assert_eq!(
        err.to_string(),
        "_id cannot be changed. Insert a copy and delete the original instead."
    );
    drop_scratch(&target.collection).await;
}

async fn assert_stale_replace_refused(collection: &str, update: &str) {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let target = scratch_copy(
        collection,
        ("shop", "users"),
        doc! { "_id": ObjectId::parse_str(ADA).unwrap() },
    )
    .await;
    let loaded = load_one(session.as_ref(), &target).await;
    let original = format_editable(&loaded);

    let script = format!("db.{collection}.updateOne({{ _id: ObjectId(\"{ADA}\") }}, {update})");
    let results = session.run(SCRATCH_DB, &script, 50).await.expect("run");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].error, None);
    assert_eq!(results[0].affected, Some(1));
    let changed = load_one(session.as_ref(), &target).await;

    let edited = original.replacen("\"Ada Lovelace\"", "\"Ada King\"", 1);
    let err = session
        .replace(&target, &original, &edited)
        .await
        .expect_err("stale original");
    assert_eq!(
        err.to_string(),
        "The document changed on the server after it was loaded. Reload it and apply your edit again."
    );
    assert_eq!(load_one(session.as_ref(), &target).await, changed);
    drop_scratch(collection).await;
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn replace_refuses_when_the_document_changed() {
    assert_stale_replace_refused("replace_changed", "{ $set: { name: \"Other\" } }").await;
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn replace_refuses_when_a_field_was_added() {
    assert_stale_replace_refused("replace_added", "{ $set: { extra: 1 } }").await;
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn replace_handles_dotted_and_dollar_keys() {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let target = scratch_copy("replace_odd", ("shop", "odd_keys"), doc! { "_id": 1 }).await;
    let loaded = load_one(session.as_ref(), &target).await;
    let original = format_editable(&loaded);
    let edited = original.replacen("\"edit me\"", "\"edited\"", 1);
    assert_ne!(original, edited);
    session
        .replace(&target, &original, &edited)
        .await
        .expect("replace");

    let reloaded = load_one(session.as_ref(), &target).await;
    assert_eq!(
        keys(&reloaded),
        ["_id", "10", "2", "a.b", "", "meta", "note"]
    );
    let text = |v: &str| DocValue::String { v: v.into() };
    assert_eq!(entry(&reloaded, "10"), &text("ten"));
    assert_eq!(entry(&reloaded, "2"), &text("two"));
    assert_eq!(entry(&reloaded, "a.b"), &text("dotted"));
    assert_eq!(entry(&reloaded, ""), &text("empty"));
    assert_eq!(entry(&reloaded, "note"), &text("edited"));
    assert_eq!(
        entry(&reloaded, "meta"),
        &DocValue::Object {
            entries: vec![
                ("$x".into(), DocValue::Int32 { v: "1".into() }),
                ("c.d".into(), DocValue::Int32 { v: "2".into() }),
            ]
        }
    );
    drop_scratch(&target.collection).await;
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn replace_with_a_top_level_dollar_key_reports_the_server_error() {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let target = scratch_copy("replace_dollar", ("shop", "odd_keys"), doc! { "_id": 1 }).await;
    let loaded = load_one(session.as_ref(), &target).await;
    let original = format_editable(&loaded);
    let edited = format!(
        "{},\n  \"$y\": 1\n}}",
        original.strip_suffix("\n}").expect("pretty object")
    );
    let err = session
        .replace(&target, &original, &edited)
        .await
        .expect_err("top-level $y");
    eprintln!("top-level $ replacement error: {err}");
    assert!(err.to_string().contains("$y"), "{err}");
    assert_eq!(load_one(session.as_ref(), &target).await, loaded);
    drop_scratch(&target.collection).await;
}

fn draft(keys: &[(&str, &str)]) -> IndexDraft {
    IndexDraft {
        name: None,
        keys: keys
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        unique: false,
        sparse: false,
        hidden: false,
        ttl_seconds: None,
        partial_filter: String::new(),
    }
}

async fn list_indexes(collection: &str) -> Vec<Document> {
    raw_client()
        .database(SCRATCH_DB)
        .run_cursor_command(doc! { "listIndexes": collection })
        .await
        .unwrap()
        .try_collect()
        .await
        .unwrap()
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn create_and_drop_ttl_index() {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let target = ns(SCRATCH_DB, "indexes");
    drop_scratch(&target.collection).await;
    session
        .create_collection(&target)
        .await
        .expect("create collection");
    let ttl = IndexDraft {
        ttl_seconds: Some(60),
        ..draft(&[("at", "1")])
    };
    assert_eq!(
        session.create_index(&target, &ttl).await.expect("ttl"),
        "at_1"
    );
    let compound = IndexDraft {
        name: Some("custom".into()),
        unique: true,
        hidden: true,
        partial_filter: "{ a: { $exists: true } }".into(),
        ..draft(&[("b", "-1"), ("a", "1")])
    };
    assert_eq!(
        session
            .create_index(&target, &compound)
            .await
            .expect("compound"),
        "custom"
    );

    let indexes = list_indexes("indexes").await;
    let spec = |name: &str| {
        indexes
            .iter()
            .find(|i| i.get_str("name") == Ok(name))
            .unwrap_or_else(|| panic!("{name} missing"))
            .clone()
    };
    assert_eq!(spec("at_1").get_i32("expireAfterSeconds"), Ok(60));
    let custom = spec("custom");
    assert_eq!(
        custom.get_document("key").unwrap(),
        &doc! { "b": -1, "a": 1 }
    );
    assert_eq!(custom.get_bool("unique"), Ok(true));
    assert_eq!(custom.get_bool("hidden"), Ok(true));
    assert_eq!(
        custom.get_document("partialFilterExpression").unwrap(),
        &doc! { "a": { "$exists": true } }
    );

    let bad = IndexDraft {
        partial_filter: "{ a: ".into(),
        ..draft(&[("c", "1")])
    };
    assert!(session.create_index(&target, &bad).await.is_err());

    session.drop_index(&target, "at_1").await.expect("drop ttl");
    session.drop_index(&target, "custom").await.expect("drop");
    assert_eq!(list_indexes("indexes").await.len(), 1);
    session
        .drop_collection(&target)
        .await
        .expect("drop collection");
    let names = raw_client()
        .database(SCRATCH_DB)
        .list_collection_names()
        .await
        .unwrap();
    assert!(!names.contains(&"indexes".to_string()));
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn drop_id_index_is_refused() {
    let session = connect(&root("")).await;
    let err = session
        .drop_index(&ns("shop", "users"), "_id_")
        .await
        .expect_err("_id_");
    assert_eq!(err.to_string(), "The _id index cannot be dropped.");
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn run_find_chain_and_insert_many() {
    let _scratch = SCRATCH.read().await;
    let session = connect(&root("")).await;
    let script = "use t9_run\n\
        db.chain.drop()\n\
        db.chain.insertMany([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }])\n\
        db.chain.find({ n: { $gte: 2 } }, { _id: 0 }).sort({ n: -1 }).limit(10)\n\
        db.chain.countDocuments({})\n\
        db.chain.aggregate([{ $sort: { n: 1 } }])\n\
        show collections\n\
        db.chain.bogus()\n\
        db.chain.find()";
    let results = session.run("shop", script, 2).await.expect("run");
    assert_eq!(results.len(), 8, "{results:#?}");
    for result in &results[..7] {
        assert_eq!(result.error, None, "{}", result.command);
        assert!(result.id.starts_with("res_"));
        assert!(!result.timestamp.is_empty());
    }
    assert_eq!(results[0].command, "use t9_run");
    assert_eq!(results[2].affected, Some(4));
    let n = |v: i32| DocValue::Object {
        entries: vec![("n".into(), DocValue::Int32 { v: v.to_string() })],
    };
    assert_eq!(results[3].documents, Some(vec![n(4), n(3)]));
    assert_eq!(results[4].value, Some(DocValue::Int64 { v: "4".into() }));
    assert_eq!(results[5].documents.as_ref().map(Vec::len), Some(2));
    assert_eq!(
        results[6].value,
        Some(DocValue::Array {
            items: vec![DocValue::String { v: "chain".into() }]
        })
    );
    let failed = &results[7];
    assert!(failed.error.is_some());
    let info = failed.error_info.as_ref().unwrap();
    assert_eq!(info.category, QueryErrorCategory::Syntax);
    let position = info.position.as_ref().unwrap();
    assert_eq!((position.line, position.column), (8, Some(10)));

    let stored = raw_client()
        .database("t9_run")
        .collection::<Document>("chain")
        .count_documents(doc! {})
        .await
        .unwrap();
    assert_eq!(stored, 4);
    let in_shop = raw_client()
        .database("shop")
        .list_collection_names()
        .await
        .unwrap();
    assert!(!in_shop.contains(&"chain".to_string()));

    let results = session
        .run(
            "shop",
            "db.adminCommand({ ping: 1 })\n\
             db.users.insertOne({ _id: ObjectId(\"65a000000000000000000001\") })\n\
             db.users.find()",
            5,
        )
        .await
        .expect("run");
    assert_eq!(results.len(), 2);
    assert!(matches!(results[0].value, Some(DocValue::Object { .. })));
    let dup = results[1].error_info.as_ref().expect("duplicate key");
    assert_eq!(dup.category, QueryErrorCategory::Constraint);

    raw_client().database("t9_run").drop().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn export_ndjson_counts_documents() {
    let session = connect(&root("")).await;
    let request = |filter: &str, format| DocumentExportRequest {
        connection_id: String::new(),
        ns: ns("shop", "users"),
        filter: filter.into(),
        projection: String::new(),
        sort: "{ _id: 1 }".into(),
        format,
        mode: ExtJsonMode::Canonical,
        file_name: "users.json".into(),
    };
    let bytes = session
        .export(&request("", DocumentExportFormat::Ndjson))
        .await
        .expect("export");
    let text = String::from_utf8(bytes).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 24);
    let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
    assert_eq!(first["credits"], serde_json::json!({ "$numberLong": "0" }));

    let active = raw_client()
        .database("shop")
        .collection::<Document>("users")
        .count_documents(doc! { "active": true })
        .await
        .unwrap();
    let csv = session
        .export(&request("{ active: true }", DocumentExportFormat::Csv))
        .await
        .expect("csv");
    let csv = String::from_utf8(csv).unwrap();
    assert!(csv.starts_with("_id,name,email,age,address,"), "{csv}");
    let array = session
        .export(&request(
            "{ active: true }",
            DocumentExportFormat::JsonArray,
        ))
        .await
        .expect("json");
    let parsed: Vec<serde_json::Value> = serde_json::from_slice(&array).unwrap();
    assert_eq!(parsed.len() as u64, active);

    assert!(session
        .export(&request("{ active: ", DocumentExportFormat::Ndjson))
        .await
        .is_err());
}

#[tokio::test]
#[ignore = "requires local MongoDB (docker compose up -d --wait mongo)"]
async fn sample_fields_summarizes_users() {
    let session = connect(&root("")).await;
    let sample = session
        .sample_fields(&ns("shop", "users"), 100)
        .await
        .expect("sample");
    assert_eq!(sample.sampled, 24);
    let age = sample.fields.iter().find(|f| f.path == "age").unwrap();
    assert_eq!(
        age.types,
        vec![("int".to_string(), 23), ("string".to_string(), 1)]
    );
    let city = sample
        .fields
        .iter()
        .find(|f| f.path == "address.city")
        .unwrap();
    assert_eq!(city.present_in, 24);
    assert!(sample.fields.iter().any(|f| f.path == "tags[]"));
}
