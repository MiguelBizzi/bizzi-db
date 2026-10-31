use db_core::{Adapter, ConnectConfig, FilterOperator, Session, TableFilter};
use db_postgres::PostgresAdapter;

fn pg_config() -> ConnectConfig {
    let port = std::env::var("TEST_PG_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(5433);
    ConnectConfig {
        dialect: db_core::DatabaseDialect::PostgreSQL,
        host: std::env::var("TEST_PG_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port,
        database: std::env::var("TEST_PG_DB").unwrap_or_else(|_| "postgres".into()),
        user: std::env::var("TEST_PG_USER").unwrap_or_else(|_| "postgres".into()),
        password: std::env::var("TEST_PG_PASSWORD").unwrap_or_else(|_| "postgres".into()),
        ssl_mode: db_core::SslMode::Disabled,
        pool_size: 2,
    }
}

static FINGERPRINT_DDL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

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
    let _guard = FINGERPRINT_DDL.lock().await;
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
async fn not_null_violation_is_a_constraint_error() {
    let session = connect().await;
    // Seeded table, no DDL: catalog changes would race the schema fingerprint test.
    let results = session
        .execute(
            "SELECT 1; INSERT INTO shop.users (organization_id, email, full_name) VALUES (1, NULL, 'x');",
            None,
        )
        .await
        .expect("execute");
    assert_eq!(results.len(), 2);
    assert!(results[0].error_info.is_none());
    let info = results[1].error_info.as_ref().expect("error_info");
    assert_eq!(info.category, db_core::QueryErrorCategory::Constraint);
    assert_eq!(info.code.as_deref(), Some("23502"));
    assert_eq!(info.table.as_deref(), Some("users"));
    assert_eq!(info.column.as_deref(), Some("email"));
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

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn failed_transaction_does_not_poison_the_pool() {
    let session = connect().await;
    for _ in 0..3 {
        let results = session
            .execute("BEGIN; SELECT 1/0; COMMIT;", None)
            .await
            .expect("execute");
        assert!(results.iter().any(|r| r.error.is_some()));
    }
    // Pool size is 2: every client has been through a failed BEGIN by now.
    for _ in 0..4 {
        let results = session.execute("SELECT 1 AS n", None).await.expect("next");
        let first = results.into_iter().next().expect("one result");
        assert!(first.error.is_none(), "{:?}", first.error);
    }
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn introspect_index_details() {
    use db_core::IndexConstraintKind;
    let session = connect().await;
    let schema = session.introspect().await.expect("introspect");
    let table = |name: &str| {
        schema
            .tables
            .iter()
            .find(|t| t.schema == "shop" && t.name == name)
            .unwrap_or_else(|| panic!("shop.{name}"))
            .clone()
    };
    let users = table("users");
    let index = |t: &db_core::TableSchema, name: &str| {
        t.indexes
            .iter()
            .find(|i| i.name == name)
            .unwrap_or_else(|| panic!("{name}"))
            .clone()
    };

    let pkey = index(&users, "users_pkey");
    assert!(pkey.is_primary);
    assert_eq!(
        pkey.constraint.as_ref().map(|c| c.kind),
        Some(IndexConstraintKind::Primary)
    );
    let email_key = index(&users, "users_email_key");
    assert_eq!(
        email_key.constraint.as_ref().map(|c| c.kind),
        Some(IndexConstraintKind::Unique)
    );

    let lower = index(&users, "idx_users_email_lower");
    assert!(lower.columns.is_empty());
    assert_eq!(lower.keys.len(), 1);
    assert!(lower.keys[0].is_expression);
    assert_eq!(lower.keys[0].expression, "lower(email)");
    assert!(lower
        .definition
        .as_deref()
        .unwrap()
        .starts_with("CREATE INDEX"));

    let partial = index(&users, "idx_users_role");
    assert_eq!(partial.predicate.as_deref(), Some("is_active"));
    assert!(partial.constraint.is_none());

    let orders = table("orders");
    let placed = index(&orders, "idx_orders_placed");
    assert!(placed.keys[0].descending);
    assert_eq!(placed.keys[0].nulls_first, None);

    let covering = index(&orders, "idx_orders_user_status");
    assert_eq!(covering.columns, vec!["user_id", "status"]);
    assert_eq!(covering.include_columns, vec!["total"]);
    assert_eq!(covering.storage_params.len(), 1);
    assert_eq!(covering.storage_params[0].name, "fillfactor");
    assert!(covering.size_bytes.unwrap_or(0) > 0);
    assert!(covering.scans.is_some());

    let products = table("products");
    assert_eq!(index(&products, "idx_products_tags").index_type, "GIN");
    // Unique-column flags still only come from single plain-column indexes.
    let email = users.columns.iter().find(|c| c.name == "email").unwrap();
    assert_eq!(email.is_unique, Some(true));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn introspect_routines_and_fetch_source() {
    use db_core::{ParameterMode, RoutineKind};
    let session = connect().await;
    let schema = session.introspect().await.expect("introspect");
    assert!(schema.languages.contains(&"plpgsql".to_string()));
    assert!(schema.languages.contains(&"sql".to_string()));
    assert!(schema.server_version_num.unwrap_or(0) >= 110_000);
    let routine = |id: &str| {
        schema
            .routines
            .iter()
            .find(|r| r.id == id)
            .unwrap_or_else(|| panic!("{id}"))
            .clone()
    };

    let total = routine("shop.order_total(p_subtotal numeric, p_tax numeric, p_shipping numeric)");
    assert_eq!(total.kind, RoutineKind::Function);
    assert_eq!(total.language, "sql");
    assert_eq!(total.volatility, "immutable");
    assert_eq!(total.parallel.as_deref(), Some("safe"));
    assert_eq!(total.return_type.as_deref(), Some("numeric"));
    assert_eq!(total.comment.as_deref(), Some("Grand total of an order."));
    assert_eq!(total.parameters.len(), 3);
    assert_eq!(total.parameters[0].default, None);
    assert_eq!(total.parameters[1].default.as_deref(), Some("0"));

    let stats = routine("shop.user_order_stats(p_user_id bigint, OUT order_count bigint, OUT lifetime_value numeric)");
    assert_eq!(stats.parameters.len(), 3);
    assert_eq!(stats.parameters[1].mode, ParameterMode::Out);
    assert_eq!(stats.parameters[1].name, "order_count");

    let by_status = routine("shop.orders_by_status(p_status shop.order_status)");
    assert!(by_status.returns_set);
    assert_eq!(by_status.rows, Some(50.0));
    assert_eq!(by_status.parameters[1].mode, ParameterMode::Table);

    let purge = routine("ops.purge_audit_log(IN p_older_than interval)");
    assert_eq!(purge.kind, RoutineKind::Procedure);
    assert_eq!(purge.return_type, None);

    let source = session
        .routine_source(&stats.schema, &stats.oid)
        .await
        .expect("routine source");
    assert!(source
        .definition
        .starts_with("CREATE OR REPLACE FUNCTION shop.user_order_stats"));
    assert!(source.body.contains("INTO order_count, lifetime_value"));
    assert!(session.routine_source("public", &stats.oid).await.is_err());
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn schema_fingerprint_detects_routine_and_index_ddl() {
    let _guard = FINGERPRINT_DDL.lock().await;
    let session = connect().await;
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let func = format!("shop.fp_fn_{suffix}");
    let create = format!("CREATE FUNCTION {func}() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$");
    session.execute(&create, None).await.expect("create fn");
    let before = session.schema_fingerprint().await.expect("fp");

    let replace =
        format!("CREATE OR REPLACE FUNCTION {func}() RETURNS int LANGUAGE sql AS $$ SELECT 2 $$");
    session.execute(&replace, None).await.expect("replace fn");
    let after_body = session.schema_fingerprint().await.expect("fp");
    assert_ne!(before, after_body);

    let index = format!("fp_idx_{suffix}");
    let create_index =
        format!("CREATE INDEX {index} ON shop.orders (notes) WHERE notes IS NOT NULL");
    session
        .execute(&create_index, None)
        .await
        .expect("create index");
    let after_index = session.schema_fingerprint().await.expect("fp");
    assert_ne!(after_body, after_index);

    let cleanup = format!("DROP INDEX shop.{index}; DROP FUNCTION {func}();");
    let results = session.execute(&cleanup, None).await.expect("cleanup");
    assert!(results.iter().all(|r| r.error.is_none()));
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn introspect_seed_index_and_routine_variety() {
    use db_core::IndexConstraintKind;
    let session = connect().await;
    let schema = session.introspect().await.expect("introspect");
    let index = |table: &str, name: &str| {
        let (schema_name, table_name) = table.split_once('.').unwrap();
        schema
            .tables
            .iter()
            .find(|t| t.schema == schema_name && t.name == table_name)
            .unwrap_or_else(|| panic!("{table}"))
            .indexes
            .iter()
            .find(|i| i.name == name)
            .unwrap_or_else(|| panic!("{name}"))
            .clone()
    };

    let exclusion = index("ops.maintenance_windows", "maintenance_windows_no_overlap");
    assert_eq!(exclusion.index_type, "GIST");
    assert_eq!(
        exclusion.constraint.map(|c| c.kind),
        Some(IndexConstraintKind::Exclusion)
    );
    let nnd = index("ops.api_keys", "uq_api_keys_owner_label");
    assert!(nnd.is_unique && nnd.nulls_not_distinct);
    assert!(nnd.keys[1].is_expression);
    let last_login = index("shop.users", "idx_users_last_login");
    assert!(last_login.keys[0].descending);
    assert_eq!(last_login.keys[0].nulls_first, Some(false));
    let finished = index("ops.background_jobs", "idx_jobs_finished");
    assert_eq!(finished.keys[0].nulls_first, Some(true));
    let pattern = index("shop.products", "idx_products_name_pattern");
    assert_eq!(pattern.keys[0].opclass.as_deref(), Some("text_pattern_ops"));
    let collated = index("shop.categories", "idx_categories_name_c");
    assert_eq!(collated.keys[0].collation.as_deref(), Some("\"C\""));
    let brin = index("analytics.page_views", "idx_page_views_viewed_brin");
    assert_eq!(brin.index_type, "BRIN");
    assert_eq!(brin.storage_params.len(), 2);
    assert_eq!(
        index("shop.payments", "idx_payments_provider_hash").index_type,
        "HASH"
    );
    assert_eq!(
        index("analytics.sessions", "idx_sessions_ip").index_type,
        "SPGIST"
    );
    assert_eq!(
        index("shop.mv_revenue_by_day", "idx_mv_revenue_day").index_type,
        "BTREE"
    );

    let routine = |id: &str| {
        schema
            .routines
            .iter()
            .find(|r| r.id == id)
            .unwrap_or_else(|| panic!("{id}"))
            .clone()
    };
    assert!(
        routine("shop.order_item_total(p_quantity integer, p_unit_price numeric)").has_sql_body
    );
    assert_eq!(
        schema
            .routines
            .iter()
            .filter(|r| r.schema == "shop" && r.name == "format_price")
            .count(),
        2
    );
    let variadic = routine("ops.join_nonempty(p_separator text, VARIADIC p_parts text[])");
    assert_eq!(
        variadic.parameters[1].mode,
        db_core::ParameterMode::Variadic
    );
    assert!(
        routine("ops.record_audit(p_action text, p_entity text, p_entity_id text)")
            .security_definer
    );
    assert_eq!(
        routine("shop.is_valid_email(p_email text)").leakproof,
        Some(true)
    );
    assert!(schema.routines.iter().any(|r| r.name == "DailyActiveUsers"));
    let requeue = routine("ops.requeue_failed_jobs(INOUT p_requeued integer)");
    assert_eq!(requeue.parameters[0].mode, db_core::ParameterMode::InOut);

    for sql in [
        "DROP FUNCTION analytics.session_duration(timestamptz, timestamptz)",
        "DROP FUNCTION ops.touch_updated_at()",
    ] {
        let results = session.execute(sql, None).await.expect("execute");
        let error = results[0].error.as_deref().unwrap_or_default();
        assert!(error.contains("depend"), "{sql}: {error}");
    }
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn introspect_view_definitions() {
    let session = connect().await;
    let schema = session.introspect().await.expect("introspect");
    let table = |name: &str| {
        schema
            .tables
            .iter()
            .find(|t| t.schema == "shop" && t.name == name)
            .unwrap_or_else(|| panic!("shop.{name}"))
            .clone()
    };
    let view = table("v_order_summary");
    assert_eq!(view.is_view, Some(true));
    assert_eq!(view.is_materialized, None);
    assert!(view
        .view_sql
        .as_deref()
        .unwrap()
        .contains("FROM shop.orders o"));
    let matview = table("mv_revenue_by_day");
    assert_eq!(matview.is_materialized, Some(true));
    assert!(matview.view_sql.is_some());
    let plain = table("orders");
    assert_eq!(plain.view_sql, None);
}

#[tokio::test]
#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]
async fn session_matches_the_shared_conformance_suite() {
    // Same catalog as the fingerprint tests; a parallel CREATE changes the hash.
    let _guard = FINGERPRINT_DDL.lock().await;
    let session = connect().await;
    db_core::conformance::assert_session(
        session.as_ref(),
        &db_core::conformance::ConformanceSeed {
            schema: "shop",
            table: "users",
            text_column: "email",
            text_like: "user",
            min_rows: 1_200,
            syntax_sql: "SELEC 1",
            reference_sql: "SELECT * FROM shop.table_that_does_not_exist_zz",
            constraint_sql: "INSERT INTO shop.organizations (id, name, slug) VALUES (1, 'x', 'x')",
            dml_sql: "UPDATE shop.users SET full_name = full_name WHERE id = (SELECT MIN(id) FROM shop.users)",
        },
    )
    .await
    .expect("postgres conformance");
}
