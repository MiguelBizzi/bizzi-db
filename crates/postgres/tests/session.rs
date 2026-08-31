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
        ssl: false,
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
    assert!(result.error.is_none(), "{:?}", result.error);
    assert_eq!(result.columns.as_deref(), Some(&["n".to_string()][..]));
    assert_eq!(result.rows.as_ref().map(|rows| rows.len()), Some(1));

    let capped = session
        .execute("SELECT * FROM shop.users", 2)
        .await
        .expect("capped execute");
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
    assert!(result.error.is_some());
    assert!(result.rows.is_none() || result.rows.as_ref().unwrap().is_empty());
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
}
