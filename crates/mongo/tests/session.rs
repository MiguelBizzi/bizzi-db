use db_core::conformance::{assert_document_session, DocumentSeed};
use db_core::{
    CollectionKind, CollectionSchema, ConnectConfig, DatabaseDialect, DatabaseSchema,
    DocumentAdapter, DocumentSession, Paradigm, QueryErrorCategory, SslMode,
};
use db_mongo::{client_options, query_error, MongoAdapter};
use futures_util::TryStreamExt;
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
    let session = connect(&root("")).await;
    assert_document_session(
        session.as_ref(),
        &DocumentSeed {
            database: "shop",
            collection: "users",
            text_field: "name",
            text_like: "LOVELACE",
            min_documents: 20,
            bad_filter: "{ $nope: 1 }",
        },
    )
    .await
    .expect("conformance");
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
            .aggregate(vec![doc! { "$collStats": { "count": {} } }])
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
