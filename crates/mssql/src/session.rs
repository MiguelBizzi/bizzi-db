#![allow(clippy::result_large_err)]

use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use db_core::{
    clamp_preview_page, Adapter, AdapterError, ConnectConfig, DatabaseSchema, QueryError,
    QueryErrorCategory, QueryExecutionResult, QueryKind, RoutineSource, Session, SqlDialect,
    SslMode, TableFilter,
};
use futures_util::TryStreamExt;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel, QueryItem};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};
use tokio_util::compat::TokioAsyncWriteCompatExt;
use uuid::Uuid;

use crate::driver::SqlClient;
use crate::error::{query_error_from_server, ServerError};
use crate::filter::where_clause;
use crate::objects::{self, introspect, schema_fingerprint};
use crate::sql::TSqlSql;
use crate::values::row_object;

/// A derived table cannot repeat a column name.
const DUPLICATE_COLUMN: i32 = 8156;

pub struct MssqlAdapter;

pub struct MssqlSession {
    pool: Arc<Pool>,
    host: String,
    port: u16,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TlsChoice {
    pub encryption: EncryptionLevel,
    pub trust_server_certificate: bool,
}

/// `Require` is TLS that accepts any certificate, matching the other engines.
pub fn tls_choice(mode: SslMode) -> TlsChoice {
    match mode {
        SslMode::Disabled => TlsChoice {
            encryption: EncryptionLevel::NotSupported,
            trust_server_certificate: false,
        },
        SslMode::Require => TlsChoice {
            encryption: EncryptionLevel::Required,
            trust_server_certificate: true,
        },
        SslMode::Enabled => TlsChoice {
            encryption: EncryptionLevel::Required,
            trust_server_certificate: false,
        },
    }
}

fn apply_tls(config: &mut Config, mode: SslMode) {
    let choice = tls_choice(mode);
    config.encryption(choice.encryption);
    if choice.trust_server_certificate {
        config.trust_cert();
    }
}

struct Pool {
    config: Config,
    reset_sql: String,
    idle: Mutex<Vec<SqlClient>>,
    permits: Arc<Semaphore>,
}

struct CheckedOut {
    client: Option<SqlClient>,
    #[allow(dead_code)]
    permit: Option<OwnedSemaphorePermit>,
    pool: Arc<Pool>,
}

impl CheckedOut {
    fn client(&mut self) -> &mut SqlClient {
        self.client.as_mut().expect("connection")
    }

    /// A pooled connection must not keep an open transaction, a `USE`, or a
    /// `SET` option from the script that just ran.
    async fn release(mut self) {
        let Some(mut client) = self.client.take() else {
            return;
        };
        if reset(&mut client, &self.pool.reset_sql).await {
            self.pool.idle.lock().await.push(client);
        }
    }
}

impl Pool {
    async fn checkout(self: &Arc<Self>) -> Result<CheckedOut, AdapterError> {
        let permit = self
            .permits
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| AdapterError::msg("connection pool is closed"))?;
        if let Some(client) = self.idle.lock().await.pop() {
            return Ok(CheckedOut {
                client: Some(client),
                permit: Some(permit),
                pool: Arc::clone(self),
            });
        }
        let client = open_client(&self.config).await?;
        Ok(CheckedOut {
            client: Some(client),
            permit: Some(permit),
            pool: Arc::clone(self),
        })
    }
}

fn config_from(cfg: &ConnectConfig) -> Config {
    let mut config = Config::new();
    config.host(cfg.host.clone());
    config.port(cfg.port);
    config.authentication(AuthMethod::sql_server(
        cfg.user.clone(),
        cfg.password.clone(),
    ));
    if !cfg.database.is_empty() {
        config.database(cfg.database.clone());
    }
    config.application_name("Bizzi DB");
    apply_tls(&mut config, cfg.ssl_mode);
    config
}

fn reset_sql(database: &str) -> String {
    let mut sql = String::from("IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;\n");
    if !database.is_empty() {
        sql.push_str(&format!("USE {};\n", TSqlSql.quote_ident(database)));
    }
    sql.push_str(
        "SET ANSI_NULLS ON;\nSET QUOTED_IDENTIFIER ON;\nSET ANSI_PADDING ON;\nSET ANSI_WARNINGS ON;\nSET CONCAT_NULL_YIELDS_NULL ON;\nSET ARITHABORT ON;\nSET NUMERIC_ROUNDABORT OFF;",
    );
    sql
}

async fn open_client(config: &Config) -> Result<SqlClient, AdapterError> {
    let config = config.clone();
    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    tcp.set_nodelay(true)
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    Client::connect(config, tcp.compat_write())
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))
}

async fn reset(client: &mut SqlClient, sql: &str) -> bool {
    match client.simple_query(sql).await {
        Ok(stream) => stream.into_results().await.is_ok(),
        Err(_) => false,
    }
}

#[async_trait::async_trait]
impl Adapter for MssqlAdapter {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError> {
        let started = Instant::now();
        let session = self.connect(cfg).await?;
        let result = session
            .execute("SELECT CAST(@@VERSION AS nvarchar(256))", None)
            .await?;
        let first = result
            .into_iter()
            .next()
            .ok_or_else(|| AdapterError::msg("empty result"))?;
        if let Some(err) = first.error {
            return Err(AdapterError::msg(err));
        }
        let version = first
            .rows
            .as_ref()
            .and_then(|rows| rows.first())
            .and_then(|row| row.as_object())
            .and_then(|obj| obj.values().next())
            .map(|value| match value {
                serde_json::Value::String(text) => text.clone(),
                other => other.to_string(),
            })
            .unwrap_or_else(|| "SQL Server".into());
        Ok((started.elapsed().as_millis() as u64, version))
    }

    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn Session>, AdapterError> {
        let size = usize::try_from(cfg.pool_size.max(1))
            .unwrap_or(1)
            .clamp(1, 32);
        let pool = Arc::new(Pool {
            config: config_from(cfg),
            reset_sql: reset_sql(&cfg.database),
            idle: Mutex::new(Vec::new()),
            permits: Arc::new(Semaphore::new(size)),
        });
        Ok(Box::new(MssqlSession {
            pool,
            host: cfg.host.clone(),
            port: cfg.port,
        }))
    }
}

#[async_trait::async_trait]
impl Session for MssqlSession {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError> {
        let mut conn = self.pool.checkout().await?;
        let result = introspect(conn.client(), &self.host, self.port).await;
        conn.release().await;
        result
    }

    async fn schema_fingerprint(&self) -> Result<String, AdapterError> {
        let mut conn = self.pool.checkout().await?;
        let result = schema_fingerprint(conn.client()).await;
        conn.release().await;
        result
    }

    async fn execute(
        &self,
        sql: &str,
        page_size: Option<i64>,
    ) -> Result<Vec<QueryExecutionResult>, AdapterError> {
        let statements = TSqlSql.split_statements(sql);
        if statements.is_empty() {
            return Ok(Vec::new());
        }
        let mut conn = match self.pool.checkout().await {
            Ok(conn) => conn,
            Err(err) => {
                return Ok(vec![error_result(
                    sql,
                    Utc::now().to_rfc3339(),
                    Instant::now(),
                    QueryError::new(QueryErrorCategory::Connection, err.to_string()),
                )]);
            }
        };
        let mut results = Vec::with_capacity(statements.len());
        for stmt in statements {
            let page = page_size.map(|limit| PageRequest {
                limit,
                offset: 0,
                with_count: true,
            });
            let result = run_statement(conn.client(), &stmt, page).await;
            let failed = result.error.is_some();
            results.push(result);
            if failed {
                let _ = rollback(conn.client()).await;
                break;
            }
        }
        conn.release().await;
        Ok(results)
    }

    async fn query_page(
        &self,
        sql: &str,
        limit: i64,
        offset: i64,
        with_count: bool,
    ) -> Result<QueryExecutionResult, AdapterError> {
        let mut conn = self.pool.checkout().await?;
        let stmt = sql.trim().trim_end_matches(';');
        let result = run_statement(
            conn.client(),
            stmt,
            Some(PageRequest {
                limit,
                offset,
                with_count,
            }),
        )
        .await;
        conn.release().await;
        Ok(result)
    }

    async fn preview(
        &self,
        schema: &str,
        table: &str,
        limit: i64,
        offset: i64,
        filters: &[TableFilter],
    ) -> Result<QueryExecutionResult, AdapterError> {
        let (limit, offset) = clamp_preview_page(limit, offset);
        let limit = limit.max(1);
        let filter = where_clause(filters);
        let qualified = format!(
            "{}.{}",
            TSqlSql.quote_ident(schema),
            TSqlSql.quote_ident(table)
        );
        let mut conn = self.pool.checkout().await?;
        let order = match primary_key(conn.client(), schema, table).await {
            Ok(columns) if !columns.is_empty() => format!("ORDER BY {}", columns.join(", ")),
            _ => "ORDER BY (SELECT NULL)".into(),
        };
        let sql = format!(
            "SELECT * FROM {qualified}{} {order} OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY",
            filter.clause
        );
        let started = Instant::now();
        let timestamp = Utc::now().to_rfc3339();
        let result = match fetch_bound(conn.client(), &sql, &filter.params).await {
            Ok(rows) => {
                let mut result = success_result(&sql, timestamp, started, &rows);
                if !filter.clause.is_empty() {
                    let count_sql = format!("SELECT COUNT(*) FROM {qualified}{}", filter.clause);
                    if let Ok(count_rows) =
                        fetch_bound(conn.client(), &count_sql, &filter.params).await
                    {
                        result.total_rows = count_rows.first().and_then(first_number);
                    }
                }
                result
            }
            Err(err) => error_result(&sql, timestamp, started, err),
        };
        conn.release().await;
        Ok(result)
    }

    async fn routine_source(
        &self,
        _schema: &str,
        oid: &str,
    ) -> Result<RoutineSource, AdapterError> {
        let mut conn = self.pool.checkout().await?;
        let result = objects::routine_source(conn.client(), oid).await;
        conn.release().await;
        result
    }
}

struct PageRequest {
    limit: i64,
    offset: i64,
    with_count: bool,
}

async fn primary_key(
    client: &mut SqlClient,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, QueryError> {
    let sql = "SELECT c.name FROM sys.indexes i \
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id \
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id \
        JOIN sys.tables t ON t.object_id = i.object_id \
        JOIN sys.schemas s ON s.schema_id = t.schema_id \
        WHERE i.is_primary_key = 1 AND ic.is_included_column = 0 AND s.name = @P1 AND t.name = @P2 \
        ORDER BY ic.key_ordinal";
    let rows = fetch_bound(client, sql, &[schema.to_string(), table.to_string()]).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            row.as_object()
                .and_then(|obj| obj.values().next())
                .and_then(|value| value.as_str())
                .map(|name| TSqlSql.quote_ident(name))
        })
        .collect())
}

async fn run_statement(
    client: &mut SqlClient,
    stmt: &str,
    page: Option<PageRequest>,
) -> QueryExecutionResult {
    let started = Instant::now();
    let timestamp = Utc::now().to_rfc3339();
    if let Some(page) = page {
        if TSqlSql.classify(stmt) == QueryKind::Select {
            let limit = page.limit.max(1);
            let offset = page.offset.max(0);
            if let Some(paged) = TSqlSql.paged_select(stmt, limit, offset) {
                match fetch_rows(client, &paged).await {
                    Ok(rows) => {
                        let mut result = success_result(stmt, timestamp, started, &rows);
                        result.page_size = Some(limit);
                        result.page_offset = Some(offset);
                        result.affected_rows = None;
                        if page.with_count {
                            if let Some(count_sql) = TSqlSql.count_select(stmt) {
                                if let Ok(count_rows) = fetch_rows(client, &count_sql).await {
                                    result.total_rows = count_rows.first().and_then(first_number);
                                    result.affected_rows = result.total_rows;
                                }
                            }
                        }
                        return result;
                    }
                    Err(err) if err.vendor_code == Some(DUPLICATE_COLUMN) => {
                        return stream_page(
                            client,
                            stmt,
                            limit,
                            offset,
                            page.with_count,
                            timestamp,
                            started,
                        )
                        .await;
                    }
                    Err(_) => {}
                }
            } else {
                return stream_page(
                    client,
                    stmt,
                    limit,
                    offset,
                    page.with_count,
                    timestamp,
                    started,
                )
                .await;
            }
        }
    }
    match TSqlSql.classify(stmt) {
        QueryKind::Insert | QueryKind::Update | QueryKind::Delete => {
            match execute_rows(client, stmt).await {
                Ok(affected) => dml_result(stmt, timestamp, started, affected),
                Err(err) => error_result(stmt, timestamp, started, err),
            }
        }
        _ => match fetch_rows(client, stmt).await {
            Ok(rows) => success_result(stmt, timestamp, started, &rows),
            Err(err) => error_result(stmt, timestamp, started, err),
        },
    }
}

async fn stream_page(
    client: &mut SqlClient,
    stmt: &str,
    limit: i64,
    offset: i64,
    with_count: bool,
    timestamp: String,
    started: Instant,
) -> QueryExecutionResult {
    match collect_page(client, stmt, offset, limit).await {
        Ok((rows, total)) => {
            let mut result = success_result(stmt, timestamp, started, &rows);
            result.page_size = Some(limit);
            result.page_offset = Some(offset);
            if with_count {
                result.total_rows = Some(total);
                result.affected_rows = Some(total);
            }
            result
        }
        Err(err) => error_result(stmt, timestamp, started, err),
    }
}

async fn collect_page(
    client: &mut SqlClient,
    sql: &str,
    offset: i64,
    limit: i64,
) -> Result<(Vec<serde_json::Value>, u64), QueryError> {
    let mut stream = client
        .query(sql, &[])
        .await
        .map_err(|err| map_error(&err, sql))?;
    let start = offset.max(0) as u64;
    let end = start.saturating_add(limit.max(1) as u64);
    let mut kept = Vec::new();
    let mut index = 0u64;
    while let Some(item) = stream
        .try_next()
        .await
        .map_err(|err| map_error(&err, sql))?
    {
        if let QueryItem::Row(row) = item {
            if index >= start && index < end {
                kept.push(row_object(&row));
            }
            index += 1;
        }
    }
    Ok((kept, index))
}

async fn fetch_rows(
    client: &mut SqlClient,
    sql: &str,
) -> Result<Vec<serde_json::Value>, QueryError> {
    // A language batch, not sp_executesql. SET IDENTITY_INSERT and SET XACT_ABORT
    // made through sp_executesql are undone when that call returns, so the next
    // statement in the script would not see them.
    let stream = client
        .simple_query(sql)
        .await
        .map_err(|err| map_error(&err, sql))?;
    let sets = stream
        .into_results()
        .await
        .map_err(|err| map_error(&err, sql))?;
    let mut rows = Vec::new();
    for set in sets {
        for row in set {
            rows.push(row_object(&row));
        }
    }
    Ok(rows)
}

async fn fetch_bound(
    client: &mut SqlClient,
    sql: &str,
    params: &[String],
) -> Result<Vec<serde_json::Value>, QueryError> {
    let mut query = tiberius::Query::new(sql);
    for param in params {
        query.bind(param.as_str());
    }
    let stream = query
        .query(client)
        .await
        .map_err(|err| map_error(&err, sql))?;
    let sets = stream
        .into_results()
        .await
        .map_err(|err| map_error(&err, sql))?;
    let mut rows = Vec::new();
    for set in sets {
        for row in set {
            rows.push(row_object(&row));
        }
    }
    Ok(rows)
}

async fn execute_rows(client: &mut SqlClient, sql: &str) -> Result<u64, QueryError> {
    let result = client
        .execute(sql, &[])
        .await
        .map_err(|err| map_error(&err, sql))?;
    Ok(result.total())
}

async fn rollback(client: &mut SqlClient) -> bool {
    reset(client, "IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION").await
}

fn map_error(err: &tiberius::error::Error, sql: &str) -> QueryError {
    if let tiberius::error::Error::Server(token) = err {
        return query_error_from_server(
            ServerError {
                number: i32::try_from(token.code()).unwrap_or(i32::MAX),
                class: token.class(),
                message: token.message().to_string(),
                procedure: token.procedure().to_string(),
                line: token.line(),
            },
            sql,
        );
    }
    let category = match err {
        tiberius::error::Error::Io { kind, .. } if *kind == std::io::ErrorKind::TimedOut => {
            QueryErrorCategory::Timeout
        }
        tiberius::error::Error::Io { .. } | tiberius::error::Error::Tls(_) => {
            QueryErrorCategory::Connection
        }
        _ => QueryErrorCategory::Other,
    };
    QueryError::new(category, err.to_string())
}

fn success_result(
    sql: &str,
    timestamp: String,
    started: Instant,
    rows: &[serde_json::Value],
) -> QueryExecutionResult {
    let columns = rows
        .first()
        .and_then(|row| row.as_object())
        .map(|obj| obj.keys().cloned().collect());
    QueryExecutionResult {
        id: format!("res_{}", Uuid::new_v4()),
        query: sql.to_string(),
        timestamp,
        execution_time_ms: started.elapsed().as_millis() as u64,
        affected_rows: Some(rows.len() as u64),
        columns,
        rows: Some(rows.to_vec()),
        error: None,
        error_info: None,
        page_size: None,
        page_offset: None,
        total_rows: None,
    }
}

fn dml_result(
    sql: &str,
    timestamp: String,
    started: Instant,
    affected: u64,
) -> QueryExecutionResult {
    QueryExecutionResult {
        id: format!("res_{}", Uuid::new_v4()),
        query: sql.to_string(),
        timestamp,
        execution_time_ms: started.elapsed().as_millis() as u64,
        affected_rows: Some(affected),
        columns: None,
        rows: None,
        error: None,
        error_info: None,
        page_size: None,
        page_offset: None,
        total_rows: None,
    }
}

fn error_result(
    sql: &str,
    timestamp: String,
    started: Instant,
    error: QueryError,
) -> QueryExecutionResult {
    QueryExecutionResult {
        id: format!("res_{}", Uuid::new_v4()),
        query: sql.to_string(),
        timestamp,
        execution_time_ms: started.elapsed().as_millis() as u64,
        affected_rows: None,
        columns: None,
        rows: None,
        error: Some(error.message.clone()),
        error_info: Some(error),
        page_size: None,
        page_offset: None,
        total_rows: None,
    }
}

fn first_number(row: &serde_json::Value) -> Option<u64> {
    let value = row.as_object()?.values().next()?;
    match value {
        serde_json::Value::Number(number) => number
            .as_u64()
            .or_else(|| number.as_i64().map(|value| value as u64)),
        serde_json::Value::String(text) => text.parse().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_trusts_the_certificate_and_disabled_skips_tls() {
        assert_eq!(
            tls_choice(SslMode::Disabled),
            TlsChoice {
                encryption: EncryptionLevel::NotSupported,
                trust_server_certificate: false,
            }
        );
        assert_eq!(
            tls_choice(SslMode::Require),
            TlsChoice {
                encryption: EncryptionLevel::Required,
                trust_server_certificate: true,
            }
        );
        assert_eq!(
            tls_choice(SslMode::Enabled),
            TlsChoice {
                encryption: EncryptionLevel::Required,
                trust_server_certificate: false,
            }
        );
    }

    #[test]
    fn reset_returns_to_the_connection_database() {
        let sql = reset_sql("shop");
        assert!(sql.contains("IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION"));
        assert!(sql.contains("USE [shop]"));
        assert!(reset_sql("a]b").contains("USE [a]]b]"));
    }
}
