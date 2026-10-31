use db_core::conformance::{assert_session, ConformanceSeed};
use db_core::{Adapter, ConnectConfig, DatabaseDialect, Session, SslMode};
use db_mysql::MysqlAdapter;

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
