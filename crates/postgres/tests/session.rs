use db_core::{Adapter, ConnectConfig, FilterOperator, Session, TableFilter};
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
async fn execute_returns_every_row_and_pages_on_request() {
    let session = connect().await;
    let result = session
        .execute("SELECT 1 AS n", None)
        .await
        .expect("execute");
    let result = result.into_iter().next().expect("one result");
    assert!(result.error.is_none(), "{:?}", result.error);
    assert_eq!(result.columns.as_deref(), Some(&["n".to_string()][..]));
    assert_eq!(result.rows.as_ref().map(|rows| rows.len()), Some(1));
    assert_eq!(result.total_rows, None);

    let all = session
        .execute("SELECT * FROM generate_series(1, 2500) AS n", None)
        .await
        .expect("uncapped execute");
    let all = all.into_iter().next().expect("one result");
    assert_eq!(all.rows.as_ref().map(|rows| rows.len()), Some(2500));
    assert_eq!(all.page_size, None);

    let paged = session
        .execute("SELECT * FROM generate_series(1, 2500) AS n;", Some(100))
        .await
        .expect("paged execute");
    let paged = paged.into_iter().next().expect("one result");
    assert!(paged.error.is_none(), "{:?}", paged.error);
    assert_eq!(paged.rows.as_ref().map(|rows| rows.len()), Some(100));
    assert_eq!(paged.total_rows, Some(2500));
    assert_eq!(paged.page_size, Some(100));
    assert_eq!(paged.page_offset, Some(0));

    let last = session
        .query_page(
            "SELECT * FROM generate_series(1, 2500) AS n",
            100,
            2450,
            false,
        )
        .await
        .expect("query_page");
    assert_eq!(last.rows.as_ref().map(|rows| rows.len()), Some(50));
    assert_eq!(last.total_rows, None);
    assert_eq!(last.page_offset, Some(2450));

    let unpageable = session
        .query_page("SHOW server_version", 100, 0, true)
        .await
        .expect("unpageable query_page");
    assert!(unpageable.error.is_none(), "{:?}", unpageable.error);
    assert_eq!(unpageable.page_size, None);
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn preview_accepts_the_largest_limit_the_ui_sends() {
    let session = connect().await;
    let result = session
        .preview("shop", "users", 9_007_199_254_740_991, 0, &[])
        .await
        .expect("preview");
    assert!(result.error.is_none(), "{:?}", result.error);
    assert!(!result.rows.unwrap_or_default().is_empty());
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn preview_quotes_schema_and_table() {
    let session = connect().await;
    let result = session
        .preview("shop", "users", 5, 0, &[])
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
        .execute("SELECT * FROM definitely_missing_table_xyz", None)
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
        .execute("SELECT 1 AS n; SELECT 2 AS n", None)
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
    session.execute(&create, None).await.expect("create");
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
    session.execute(&insert, None).await.expect("insert");
    assert_eq!(
        before,
        session
            .schema_fingerprint()
            .await
            .expect("fingerprint after insert")
    );

    let alter = format!("ALTER TABLE shop.{table} ADD COLUMN note text");
    session.execute(&alter, None).await.expect("alter");
    let after_ddl = session
        .schema_fingerprint()
        .await
        .expect("fingerprint after ddl");
    assert_ne!(before, after_ddl);

    let drop = format!("DROP TABLE shop.{table}");
    session.execute(&drop, None).await.expect("drop");
}

fn filter(column: &str, operator: FilterOperator, value: &str) -> TableFilter {
    TableFilter {
        column: column.into(),
        operator,
        value: value.into(),
    }
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn preview_filters_find_rows_far_beyond_the_first_page() {
    let session = connect().await;
    let first_page = session
        .preview("shop", "users", 50, 0, &[])
        .await
        .expect("first page");
    let loaded_ids: Vec<String> = first_page
        .rows
        .unwrap_or_default()
        .iter()
        .map(|row| row["id"].to_string())
        .collect();
    assert!(!loaded_ids.contains(&"1100".to_string()));

    let found = session
        .preview(
            "shop",
            "users",
            50,
            0,
            &[filter("id", FilterOperator::Eq, "1100")],
        )
        .await
        .expect("filtered preview");
    assert!(found.error.is_none(), "{:?}", found.error);
    assert_eq!(found.total_rows, Some(1));
    assert_eq!(found.rows.as_ref().map(|rows| rows.len()), Some(1));

    let range = [filter("id", FilterOperator::Gte, "1000")];
    let page = session
        .preview("shop", "users", 150, 100, &range)
        .await
        .expect("paged filtered preview");
    assert_eq!(page.total_rows, Some(201));
    assert_eq!(page.rows.as_ref().map(|rows| rows.len()), Some(101));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn preview_filter_on_a_numeric_column_behaves_like_a_query() {
    let session = connect().await;
    let sample = session
        .preview("shop", "users", 1, 0, &[])
        .await
        .expect("sample");
    let id = sample
        .rows
        .as_ref()
        .and_then(|rows| rows.first())
        .map(|row| row["id"].clone());
    let id = id
        .expect("a user row")
        .to_string()
        .trim_matches('"')
        .to_string();

    let filtered = session
        .preview(
            "shop",
            "users",
            50,
            0,
            &[filter("id", FilterOperator::Eq, &id)],
        )
        .await
        .expect("filtered preview");
    assert!(filtered.error.is_none(), "{:?}", filtered.error);
    assert_eq!(filtered.total_rows, Some(1));
    assert_eq!(filtered.rows.as_ref().map(|rows| rows.len()), Some(1));

    let by_query = session
        .execute(&format!("SELECT * FROM shop.users WHERE id = {id}"), None)
        .await
        .expect("query");
    assert_eq!(by_query[0].rows, filtered.rows);

    let none = session
        .preview(
            "shop",
            "users",
            50,
            0,
            &[filter("id", FilterOperator::Eq, "-1")],
        )
        .await
        .expect("empty preview");
    assert_eq!(none.total_rows, Some(0));
    assert_eq!(none.rows.as_ref().map(|rows| rows.len()), Some(0));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn preview_filter_errors_are_reported_not_swallowed() {
    let session = connect().await;
    let result = session
        .preview(
            "shop",
            "users",
            5,
            0,
            &[filter("id", FilterOperator::Eq, "not a number")],
        )
        .await
        .expect("preview returns an error result");
    assert!(result.error.is_some());
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn syntax_error_is_structured() {
    let session = connect().await;
    let results = session.execute("SELEC 1", None).await.expect("execute");
    assert_eq!(results.len(), 1);
    let info = results[0].error_info.as_ref().expect("error_info");
    assert_eq!(info.category, db_core::QueryErrorCategory::Syntax);
    assert_eq!(info.code.as_deref(), Some("42601"));
    assert!(info.position.is_some(), "{info:?}");
    assert_eq!(results[0].error.as_deref(), Some(info.message.as_str()));
    assert!(!info.message.starts_with("db error"), "{}", info.message);
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn missing_table_is_a_reference_error() {
    let session = connect().await;
    let results = session
        .execute("SELECT * FROM no_such_table_xyz", None)
        .await
        .expect("execute");
    let info = results[0].error_info.as_ref().expect("error_info");
    assert_eq!(info.category, db_core::QueryErrorCategory::Reference);
    assert_eq!(info.code.as_deref(), Some("42P01"));
    let position = info.position.as_ref().expect("position");
    assert_eq!((position.line, position.column), (1, 15));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn unique_violation_is_a_constraint_error() {
    let session = connect().await;
    let results = session
        .execute(
            "CREATE TEMP TABLE qe_t (id int PRIMARY KEY); INSERT INTO qe_t VALUES (1); INSERT INTO qe_t VALUES (1);",
            None,
        )
        .await
        .expect("execute");
    assert_eq!(results.len(), 3);
    assert!(results[0].error_info.is_none() && results[1].error_info.is_none());
    let info = results[2].error_info.as_ref().expect("error_info");
    assert_eq!(info.category, db_core::QueryErrorCategory::Constraint);
    assert_eq!(info.code.as_deref(), Some("23505"));
    assert_eq!(info.constraint.as_deref(), Some("qe_t_pkey"));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn failing_second_statement_position_is_statement_relative() {
    let session = connect().await;
    let results = session
        .execute("SELECT 1; SELEC 2;", None)
        .await
        .expect("execute");
    assert_eq!(results.len(), 2);
    assert!(results[0].error.is_none());
    let position = results[1]
        .error_info
        .as_ref()
        .and_then(|info| info.position.as_ref())
        .expect("position");
    assert_eq!((position.line, position.column), (1, 1));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn success_has_no_error_info() {
    let session = connect().await;
    let results = session.execute("SELECT 1", None).await.expect("execute");
    assert!(results[0].error.is_none());
    assert!(results[0].error_info.is_none());
}
