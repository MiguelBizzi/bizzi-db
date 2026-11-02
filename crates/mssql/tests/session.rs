use db_core::conformance::{assert_session, ConformanceSeed};
use db_core::{Adapter, ConnectConfig, DatabaseDialect, Session, SslMode};
use db_mssql::MssqlAdapter;

async fn schema_lock() -> tokio::sync::MutexGuard<'static, ()> {
    static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    LOCK.lock().await
}

fn config(database: Option<&str>) -> ConnectConfig {
    let port = std::env::var("TEST_MSSQL_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(1434);
    let database = database
        .map(str::to_string)
        .or_else(|| std::env::var("TEST_MSSQL_DB").ok())
        .unwrap_or_else(|| "shop".into());
    ConnectConfig {
        dialect: DatabaseDialect::SQLServer,
        host: std::env::var("TEST_MSSQL_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port,
        database,
        user: std::env::var("TEST_MSSQL_USER").unwrap_or_else(|_| "sa".into()),
        password: std::env::var("TEST_MSSQL_PASSWORD").unwrap_or_else(|_| "Mssql_dev_1".into()),
        ssl_mode: SslMode::Disabled,
        pool_size: 2,
    }
}

async fn connect(database: Option<&str>) -> Box<dyn Session> {
    MssqlAdapter
        .connect(&config(database))
        .await
        .expect("connect to local SQL Server (bun run db:up)")
}

fn row_count(result: &db_core::QueryExecutionResult) -> usize {
    result.rows.as_ref().map(|rows| rows.len()).unwrap_or(0)
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn session_matches_the_shared_conformance_suite() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    assert_session(
        session.as_ref(),
        &ConformanceSeed {
            schema: "dbo",
            table: "users",
            text_column: "email",
            text_like: "user",
            min_rows: 1200,
            syntax_sql: "SELECT 1 FROM",
            reference_sql: "SELECT * FROM dbo.table_that_does_not_exist_zz",
            constraint_sql:
                "INSERT INTO dbo.users (organization_id, email, full_name) VALUES (1, NULL, N'x')",
            dml_sql: "UPDATE dbo.users SET full_name = full_name WHERE id = 1",
        },
    )
    .await
    .expect("conformance");
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn go_runs_each_batch() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let results = session
        .execute("SELECT 1 AS n\nGO\nSELECT 2 AS n", None)
        .await
        .expect("execute");
    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|result| result.error.is_none()));
    assert_eq!(row_count(&results[0]), 1);
    assert_eq!(row_count(&results[1]), 1);
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn xact_abort_rolls_the_batch_back() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let _ = session
        .execute(
            "DELETE FROM dbo.organizations WHERE slug = N'rollback-seed'",
            None,
        )
        .await;
    let results = session
        .execute(
            "SET XACT_ABORT ON; BEGIN TRANSACTION; INSERT INTO dbo.organizations (name, slug) VALUES (N'rollback', N'rollback-seed'); SELECT 1/0; COMMIT TRANSACTION;",
            None,
        )
        .await
        .expect("execute");
    assert!(results.iter().any(|result| result.error.is_some()));
    let left = session
        .execute(
            "SELECT slug FROM dbo.organizations WHERE slug = N'rollback-seed'",
            None,
        )
        .await
        .expect("select");
    assert!(left[0].error.is_none());
    assert_eq!(row_count(&left[0]), 0);
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn identity_insert_accepts_an_explicit_value() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let _ = session
        .execute(
            "DELETE FROM sales.shipments WHERE id = 4242; SET IDENTITY_INSERT sales.shipments ON; DELETE FROM sales.shipments WHERE id = 4242; SET IDENTITY_INSERT sales.shipments OFF;",
            None,
        )
        .await;
    let inserted = session
        .execute(
            "SET IDENTITY_INSERT sales.shipments ON; INSERT INTO sales.shipments (id, order_id, line_no) VALUES (4242, 1, 1); SET IDENTITY_INSERT sales.shipments OFF;",
            None,
        )
        .await
        .expect("insert");
    assert!(
        inserted.iter().all(|result| result.error.is_none()),
        "{inserted:?}"
    );
    let found = session
        .execute("SELECT id FROM sales.shipments WHERE id = 4242", None)
        .await
        .expect("select");
    assert_eq!(row_count(&found[0]), 1);
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn pages_order_by_cte_and_duplicate_columns() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let ordered = session
        .query_page("SELECT email FROM dbo.users ORDER BY id", 2, 0, true)
        .await
        .expect("order by");
    assert!(ordered.error.is_none(), "{:?}", ordered.error);
    assert_eq!(row_count(&ordered), 2);

    let cte = session
        .query_page(
            "WITH people AS (SELECT email FROM dbo.users) SELECT email FROM people",
            3,
            0,
            false,
        )
        .await
        .expect("cte");
    assert!(cte.error.is_none(), "{:?}", cte.error);
    assert_eq!(row_count(&cte), 3);

    let duplicated = session
        .query_page("SELECT id, id FROM dbo.users", 4, 0, false)
        .await
        .expect("duplicate columns");
    assert!(duplicated.error.is_none(), "{:?}", duplicated.error);
    assert_eq!(row_count(&duplicated), 4);
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn pages_the_large_events_table() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let page = session
        .query_page("SELECT n FROM dbo.events ORDER BY n", 10, 199990, true)
        .await
        .expect("page");
    assert!(page.error.is_none(), "{:?}", page.error);
    assert_eq!(row_count(&page), 10);
    assert!(page.total_rows.unwrap_or(0) >= 200_000);
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn a_paging_wrapper_error_still_returns_one_page() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let page = session
        .query_page(
            "SELECT n FROM (VALUES (1),(2),(3),(4),(5)) AS v(n) OPTION (FAST 1)",
            2,
            0,
            false,
        )
        .await
        .expect("page");
    assert!(page.error.is_none(), "{:?}", page.error);
    assert_eq!(page.page_size, Some(2));
    assert_eq!(row_count(&page), 2);
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn introspection_sees_the_seed_and_not_the_other_database() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let schema = session.introspect().await.expect("introspect");
    let names: Vec<_> = schema
        .tables
        .iter()
        .map(|table| format!("{}.{}", table.schema, table.name))
        .collect();
    for expected in [
        "dbo.users",
        "dbo.active_users",
        "sales.orders",
        "dbo.events",
        "hr.employees",
    ] {
        assert!(
            names.iter().any(|name| name == expected),
            "missing {expected}"
        );
    }
    assert!(!names.iter().any(|name| name.contains("reports")));

    let users = schema
        .tables
        .iter()
        .find(|table| table.schema == "dbo" && table.name == "users")
        .expect("users");
    assert!(users
        .columns
        .iter()
        .any(|column| column.name == "id" && column.identity.is_some()));
    assert!(users
        .columns
        .iter()
        .any(|column| column.name == "row_version"));
    assert!(users
        .indexes
        .iter()
        .any(|index| index.name == "ix_users_active"));
    let shipments = schema
        .tables
        .iter()
        .find(|table| table.schema == "sales" && table.name == "shipments")
        .expect("shipments");
    let order_id = shipments
        .columns
        .iter()
        .find(|column| column.name == "order_id")
        .expect("order_id");
    assert_eq!(
        order_id
            .foreign_key
            .as_ref()
            .and_then(|fk| fk.on_update.as_deref()),
        Some("CASCADE")
    );

    let kinds: Vec<_> = schema
        .routines
        .iter()
        .map(|routine| routine.name.clone())
        .collect();
    assert!(kinds.iter().any(|name| name == "touch_user"));
    assert!(kinds.iter().any(|name| name == "twice"));
    assert!(kinds.iter().any(|name| name == "order_ids"));
    assert!(kinds.iter().any(|name| name == "order_list"));

    let proc = schema
        .routines
        .iter()
        .find(|routine| routine.name == "touch_user")
        .expect("proc");
    let source = session
        .routine_source("dbo", &proc.oid)
        .await
        .expect("source");
    assert!(source.definition.to_lowercase().contains("procedure"));

    let other = connect(Some("analytics")).await;
    let analytics = other.introspect().await.expect("analytics");
    assert!(analytics.tables.iter().any(|table| table.name == "reports"));
    assert!(!analytics.tables.iter().any(|table| table.name == "users"));
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn a_failed_script_does_not_leave_identity_insert_on_the_pool() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    let failed = session
        .execute(
            "SET IDENTITY_INSERT dbo.users ON; INSERT INTO dbo.users (id, organization_id, email, full_name) VALUES (1, 1, N'not-an-email', N'x');",
            None,
        )
        .await
        .expect("execute");
    assert!(failed.iter().any(|result| result.error.is_some()));

    let next = session
        .execute(
            "SET IDENTITY_INSERT sales.shipments ON; SET IDENTITY_INSERT sales.shipments OFF; SELECT 1 AS ok;",
            None,
        )
        .await
        .expect("next");
    assert!(next.iter().all(|result| result.error.is_none()), "{next:?}");
}

#[tokio::test]
#[ignore = "requires local SQL Server (bun run db:up)"]
async fn reset_clears_xact_abort() {
    let _guard = schema_lock().await;
    let session = connect(None).await;
    session
        .execute("SET XACT_ABORT ON; SELECT 1 AS n;", None)
        .await
        .expect("set");
    let options = session
        .execute(
            "SELECT CASE WHEN (16384 & @@OPTIONS) = 16384 THEN 1 ELSE 0 END AS xact_abort",
            None,
        )
        .await
        .expect("options");
    assert!(options[0].error.is_none(), "{:?}", options[0].error);
    let value = options[0]
        .rows
        .as_ref()
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("xact_abort"))
        .and_then(|value| value.as_i64());
    assert_eq!(value, Some(0));
}
