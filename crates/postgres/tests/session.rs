use db_core::{Adapter, ConnectConfig, Session};
use db_postgres::PostgresAdapter;

fn pg_config() -> ConnectConfig {
    let port = std::env::var("TEST_PG_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(5433);
    ConnectConfig {
        host: std::env::var("TEST_PG_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port,
        database: std::env::var("TEST_PG_DB").unwrap_or_else(|_| "postgres".into()),
        user: std::env::var("TEST_PG_USER").unwrap_or_else(|_| "postgres".into()),
        password: std::env::var("TEST_PG_PASSWORD").unwrap_or_else(|_| "postgres".into()),
        ssl_mode: db_core::SslMode::Disabled,
        pool_size: 2,
    }
}

async fn connect() -> Box<dyn Session> {
    PostgresAdapter
        .connect(&pg_config())
        .await
        .expect("connect to local Postgres (bun run db:up)")
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn test_connection_reports_version() {
    let (latency, version) = PostgresAdapter
        .test_connection(&pg_config())
        .await
        .expect("test_connection");
    assert!(latency < 60_000);
    assert!(
        version.to_lowercase().contains("postgres"),
        "unexpected version: {version}"
    );
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn execute_select_and_row_cap() {
    let session = connect().await;
    let result = session.execute("SELECT 1 AS n", 10).await.expect("execute");
    let result = result.into_iter().next().expect("one result");
    assert!(result.error.is_none(), "{:?}", result.error);
    assert_eq!(result.columns.as_deref(), Some(&["n".to_string()][..]));
    assert_eq!(result.rows.as_ref().map(|rows| rows.len()), Some(1));

    let capped = session
        .execute("SELECT * FROM shop.users", 2)
        .await
        .expect("capped execute");
    let capped = capped.into_iter().next().expect("one result");
    assert!(capped.error.is_none(), "{:?}", capped.error);
    assert_eq!(capped.rows.as_ref().map(|rows| rows.len()), Some(2));
    assert_eq!(capped.truncated, Some(true));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn preview_quotes_schema_and_table() {
    let session = connect().await;
    let result = session
        .preview("shop", "users", 5, 0)
        .await
        .expect("preview");
    assert!(result.error.is_none(), "{:?}", result.error);
    assert!(result.query.contains("\"shop\".\"users\""));
    assert_eq!(result.rows.as_ref().map(|rows| rows.len()), Some(5));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn execute_error_is_returned_not_panic() {
    let session = connect().await;
    let result = session
        .execute("SELECT * FROM definitely_missing_table_xyz", 10)
        .await
        .expect("execute should not fail the adapter");
    let result = result.into_iter().next().expect("one result");
    assert!(result.error.is_some());
    assert!(result.rows.is_none() || result.rows.as_ref().unwrap().is_empty());
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn execute_multiple_statements_returns_separate_results() {
    let session = connect().await;
    let results = session
        .execute("SELECT 1 AS n; SELECT 2 AS n", 10)
        .await
        .expect("execute batch");
    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|r| r.error.is_none()), "{results:?}");
    let first = results[0]
        .rows
        .as_ref()
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("n"))
        .and_then(|v| v.as_i64());
    let second = results[1]
        .rows
        .as_ref()
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("n"))
        .and_then(|v| v.as_i64());
    assert_eq!(first, Some(1));
    assert_eq!(second, Some(2));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn introspect_seed_tables_pks_fks_and_enums() {
    let session = connect().await;
    let schema = session.introspect().await.expect("introspect");
    let users = schema
        .tables
        .iter()
        .find(|table| table.schema == "shop" && table.name == "users")
        .expect("shop.users");
    assert_eq!(users.id, "shop.users");
    let id = users
        .columns
        .iter()
        .find(|column| column.name == "id")
        .expect("id column");
    assert_eq!(id.is_primary, Some(true));
    let role = users
        .columns
        .iter()
        .find(|column| column.name == "role")
        .expect("role column");
    let enums = role.enum_values.as_ref().expect("enum values");
    assert!(enums.contains(&"admin".to_string()));
    let org = users
        .columns
        .iter()
        .find(|column| column.name == "organization_id")
        .expect("organization_id");
    let fk = org.foreign_key.as_ref().expect("fk");
    assert_eq!(fk.target_table, "organizations");
    assert_eq!(fk.target_column, "id");
    assert_eq!(fk.on_delete.as_deref(), Some("NO ACTION"));
    let email = users
        .columns
        .iter()
        .find(|column| column.name == "email")
        .expect("email");
    assert_eq!(email.is_unique, Some(true));
    assert_eq!(id.is_unique, Some(false));
    let addresses = schema
        .tables
        .iter()
        .find(|table| table.schema == "shop" && table.name == "addresses")
        .expect("shop.addresses");
    let user_id = addresses
        .columns
        .iter()
        .find(|column| column.name == "user_id")
        .expect("user_id");
    assert_eq!(
        user_id
            .foreign_key
            .as_ref()
            .and_then(|fk| fk.on_delete.as_deref()),
        Some("CASCADE")
    );
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn schema_fingerprint_ignores_row_changes_and_detects_ddl() {
    let session = connect().await;
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let table = format!("fp_{suffix}");
    let create = format!("CREATE TABLE shop.{table} (id int PRIMARY KEY)");
    session.execute(&create, 1).await.expect("create");
    let before = session
        .schema_fingerprint()
        .await
        .expect("fingerprint before");
    assert!(!before.is_empty());
    assert_eq!(
        before,
        session
            .schema_fingerprint()
            .await
            .expect("fingerprint again")
    );

    let insert = format!("INSERT INTO shop.{table} (id) VALUES (1)");
    session.execute(&insert, 1).await.expect("insert");
    assert_eq!(
        before,
        session
            .schema_fingerprint()
            .await
            .expect("fingerprint after insert")
    );

    let alter = format!("ALTER TABLE shop.{table} ADD COLUMN note text");
    session.execute(&alter, 1).await.expect("alter");
    let after_ddl = session
        .schema_fingerprint()
        .await
        .expect("fingerprint after ddl");
    assert_ne!(before, after_ddl);

    let drop = format!("DROP TABLE shop.{table}");
    session.execute(&drop, 1).await.expect("drop");
}
