use db_core::conformance::{assert_session, ConformanceSeed};
use db_core::{Adapter, ConnectConfig, DatabaseDialect, Session, SqlDialect, SslMode};
use db_mysql::MysqlAdapter;

/// Live tests share one server. Schema changes must not overlap a fingerprint
/// comparison, and `cargo test` runs them in parallel.
async fn schema_lock() -> tokio::sync::MutexGuard<'static, ()> {
    static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    LOCK.lock().await
}

fn mysql_config(ssl: SslMode) -> ConnectConfig {
    let port = std::env::var("TEST_MYSQL_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(3307);
    ConnectConfig {
        dialect: DatabaseDialect::MySQL,
        host: std::env::var("TEST_MYSQL_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port,
        database: std::env::var("TEST_MYSQL_DB").unwrap_or_else(|_| "shop".into()),
        user: std::env::var("TEST_MYSQL_USER").unwrap_or_else(|_| "root".into()),
        password: std::env::var("TEST_MYSQL_PASSWORD").unwrap_or_else(|_| "mysql".into()),
        ssl_mode: ssl,
        pool_size: 2,
    }
}

async fn connect() -> Box<dyn Session> {
    MysqlAdapter
        .connect(&mysql_config(SslMode::Disabled))
        .await
        .expect("connect to local MySQL (bun run db:up)")
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn session_matches_the_shared_conformance_suite() {
    let _guard = schema_lock().await;
    let session = connect().await;
    assert_session(
        session.as_ref(),
        &ConformanceSeed {
            schema: "shop",
            table: "users",
            text_column: "email",
            text_like: "user",
            min_rows: 1200,
            syntax_sql: "SELEC 1",
            reference_sql: "SELECT * FROM shop.table_that_does_not_exist_zz",
            constraint_sql: "INSERT INTO shop.organizations (id, name, slug) VALUES (1, 'x', 'x')",
            // MySQL rejects a subquery that names the table being updated (error 1093).
            dml_sql: "UPDATE shop.users SET full_name = full_name WHERE id = 1",
        },
    )
    .await
    .expect("conformance");
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn caching_sha2_connects_without_tls_and_with_unverified_tls() {
    let plain = MysqlAdapter
        .test_connection(&mysql_config(SslMode::Disabled))
        .await
        .expect("plain caching_sha2_password");
    assert!(plain.1.to_lowercase().contains("8."));

    let tls = MysqlAdapter
        .test_connection(&mysql_config(SslMode::Require))
        .await
        .expect("TLS with invalid certs accepted");
    assert!(tls.1.to_lowercase().contains("8."));

    let verified = MysqlAdapter
        .test_connection(&mysql_config(SslMode::Enabled))
        .await;
    assert!(
        verified.is_err(),
        "the image certificate is not a public CA"
    );
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn duplicate_column_page_falls_back_to_streaming() {
    let session = connect().await;
    let page = session
        .query_page("SELECT 1 AS n, 1 AS n", 1, 0, true)
        .await
        .expect("page");
    assert!(page.error.is_none(), "{:?}", page.error);
    assert_eq!(page.rows.map(|rows| rows.len()), Some(1));
    assert_eq!(page.total_rows, Some(1));
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn routine_source_uses_show_create() {
    let session = connect().await;
    let source = session
        .routine_source("shop", "shop.function.role_rank")
        .await
        .expect("source");
    assert!(source.definition.to_ascii_uppercase().contains("FUNCTION"));
    assert!(source.definition.contains("role_rank"));
    assert!(source.body.to_ascii_uppercase().contains("RETURN"));
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn introspection_keeps_constraint_names_generated_columns_and_view_options() {
    let session = connect().await;
    let schema = session.introspect().await.expect("introspect");

    let users = schema
        .tables
        .iter()
        .find(|table| table.schema == "shop" && table.name == "users")
        .expect("shop.users");
    let organization = users
        .columns
        .iter()
        .find(|column| column.name == "organization_id")
        .expect("organization_id");
    assert_eq!(
        organization
            .foreign_key
            .as_ref()
            .and_then(|fk| fk.name.as_deref()),
        Some("users_organization_id_fkey")
    );
    let generated = users
        .columns
        .iter()
        .find(|column| column.name == "full_name_upper")
        .expect("full_name_upper");
    assert!(
        generated
            .generated
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase()
            .contains("full_name"),
        "{:?}",
        generated.generated
    );
    let created = users
        .columns
        .iter()
        .find(|column| column.name == "created_at")
        .expect("created_at");
    assert!(created
        .data_type
        .to_ascii_lowercase()
        .contains("datetime(6)"));
    assert_eq!(created.comment.as_deref(), Some("When the row was created"));
    assert!(created.generated.is_none(), "{:?}", created.generated);

    let notes = schema
        .tables
        .iter()
        .find(|table| table.schema == "shop" && table.name == "audit_notes")
        .expect("audit_notes");
    let user_id = notes
        .columns
        .iter()
        .find(|column| column.name == "user_id")
        .expect("user_id");
    let fk_name = user_id
        .foreign_key
        .as_ref()
        .and_then(|fk| fk.name.as_deref())
        .unwrap_or("");
    assert!(
        fk_name.ends_with("ibfk_1"),
        "auto-named foreign key was {fk_name}"
    );
    let touched = notes
        .columns
        .iter()
        .find(|column| column.name == "touched_at")
        .expect("touched_at");
    assert_eq!(touched.on_update.as_deref(), Some("CURRENT_TIMESTAMP(6)"));
    assert_eq!(touched.comment.as_deref(), Some("last write"));

    let customers = schema
        .tables
        .iter()
        .find(|table| table.name == "active_customers")
        .expect("active_customers");
    assert!(customers
        .view_sql
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase()
        .contains("check option"));
    let invoker = schema
        .tables
        .iter()
        .find(|table| table.name == "invoker_users")
        .expect("invoker_users");
    assert_eq!(invoker.sql_security.as_deref(), Some("INVOKER"));

    let function = schema
        .routines
        .iter()
        .find(|routine| {
            routine.schema == "shop"
                && routine.name == "user_label"
                && routine.kind == db_core::RoutineKind::Function
        })
        .expect("function user_label");
    let procedure = schema
        .routines
        .iter()
        .find(|routine| {
            routine.schema == "shop"
                && routine.name == "user_label"
                && routine.kind == db_core::RoutineKind::Procedure
        })
        .expect("procedure user_label");
    assert_eq!(function.data_access.as_deref(), Some("READS SQL DATA"));
    assert!(
        function
            .parameters
            .iter()
            .any(|param| param.data_type.to_ascii_lowercase().contains("bigint")),
        "{:?}",
        function.parameters
    );
    assert!(
        procedure
            .parameters
            .iter()
            .any(|param| param.data_type.to_ascii_lowercase().contains("varchar")),
        "{:?}",
        procedure.parameters
    );
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn fingerprint_changes_when_a_view_or_foreign_key_changes() {
    let _guard = schema_lock().await;
    let session = connect().await;
    let before = session.schema_fingerprint().await.expect("fingerprint");
    let created = session
        .execute(
            "CREATE OR REPLACE VIEW shop.fingerprint_probe AS SELECT 1 AS n",
            None,
        )
        .await
        .expect("create view");
    assert!(
        created.iter().all(|result| result.error.is_none()),
        "{created:?}"
    );
    let after_view = session.schema_fingerprint().await.expect("fingerprint");
    assert_ne!(before, after_view);
    let dropped = session
        .execute("DROP VIEW shop.fingerprint_probe", None)
        .await
        .expect("drop view");
    assert!(
        dropped.iter().all(|result| result.error.is_none()),
        "{dropped:?}"
    );

    let before_fk = session.schema_fingerprint().await.expect("fingerprint");
    let child = session
        .execute(
            "CREATE TABLE shop.fingerprint_child (id BIGINT PRIMARY KEY, user_id BIGINT, FOREIGN KEY (user_id) REFERENCES shop.users (id))",
            None,
        )
        .await
        .expect("create child");
    assert!(
        child.iter().all(|result| result.error.is_none()),
        "{child:?}"
    );
    let after_fk = session.schema_fingerprint().await.expect("fingerprint");
    assert_ne!(before_fk, after_fk);
    let cleanup = session
        .execute("DROP TABLE shop.fingerprint_child", None)
        .await
        .expect("drop child");
    assert!(
        cleanup.iter().all(|result| result.error.is_none()),
        "{cleanup:?}"
    );
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn backslash_literal_round_trips() {
    let session = connect().await;
    let literal = db_mysql::MySqlSql.quote_literal("C:\\temp");
    let script = format!(
        "CREATE TEMPORARY TABLE slash_probe (v VARCHAR(64)); INSERT INTO slash_probe VALUES ({literal}); SELECT v FROM slash_probe"
    );
    let results = session.execute(&script, None).await.expect("script");
    let selected = results.last().expect("select");
    assert!(selected.error.is_none(), "{:?}", selected.error);
    let value = selected
        .rows
        .as_ref()
        .and_then(|rows| rows.first())
        .and_then(|row| row.get("v"))
        .and_then(|value| value.as_str());
    assert_eq!(value, Some("C:\\temp"));
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn join_with_duplicate_column_names_pages_without_loading_a_wrapper_error() {
    let session = connect().await;
    let page = session
        .query_page(
            "SELECT u.id, o.id FROM shop.users u JOIN shop.organizations o ON o.id = u.organization_id",
            5,
            0,
            true,
        )
        .await
        .expect("page");
    assert!(page.error.is_none(), "{:?}", page.error);
    assert_eq!(page.rows.as_ref().map(|rows| rows.len()), Some(5));
    assert!(page.total_rows.unwrap_or(0) > 5);
}

#[tokio::test]
#[ignore = "requires local MySQL (bun run db:up / TEST_MYSQL=1)"]
async fn ordered_select_keeps_its_order_across_pages() {
    let session = connect().await;
    let first = session
        .query_page("SELECT id FROM shop.users ORDER BY id", 3, 0, true)
        .await
        .expect("first page");
    let second = session
        .query_page("SELECT id FROM shop.users ORDER BY id", 3, 3, false)
        .await
        .expect("second page");
    assert!(first.error.is_none(), "{:?}", first.error);
    assert!(second.error.is_none(), "{:?}", second.error);
    let first_ids = number_column(&first, "id");
    let second_ids = number_column(&second, "id");
    assert_eq!(first_ids.len(), 3);
    assert!(
        first_ids.windows(2).all(|pair| pair[0] <= pair[1]),
        "{first_ids:?}"
    );
    assert!(
        second_ids.first().copied().unwrap_or(0) >= *first_ids.last().unwrap_or(&0),
        "page 1 {first_ids:?} page 2 {second_ids:?}"
    );
}

fn number_column(result: &db_core::QueryExecutionResult, column: &str) -> Vec<i64> {
    result
        .rows
        .as_ref()
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get(column).and_then(serde_json::Value::as_i64))
                .collect()
        })
        .unwrap_or_default()
}
