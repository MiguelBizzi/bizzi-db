use std::time::Instant;

use chrono::Utc;
use db_core::{
    clamp_preview_page, Adapter, AdapterError, ConnectConfig, QueryError, QueryErrorCategory,
    QueryExecutionResult, RoutineSource, Session, SqlDialect, SslMode, TableFilter,
};
use mysql_async::prelude::*;
use mysql_async::{OptsBuilder, Params, Pool, PoolConstraints, PoolOpts, Row, SslOpts, Value};
use uuid::Uuid;

use crate::error::{query_error_from_parts, MysqlErrorParts};
use crate::filter::where_clause;
use crate::objects::{self, introspect, schema_fingerprint};
use crate::sql::MySqlSql;
use crate::values::row_object;

pub struct MysqlAdapter;

pub struct MysqlSession {
    pool: Pool,
    host: String,
    port: u16,
}

#[async_trait::async_trait]
impl Adapter for MysqlAdapter {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError> {
        let started = Instant::now();
        let session = self.connect(cfg).await?;
        let result = session.execute("SELECT VERSION()", None).await?;
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
            .map(|v| match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_else(|| "MySQL".into());
        Ok((started.elapsed().as_millis() as u64, version))
    }

    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn Session>, AdapterError> {
        Ok(Box::new(MysqlSession {
            pool: create_pool(cfg)?,
            host: cfg.host.clone(),
            port: cfg.port,
        }))
    }
}

#[async_trait::async_trait]
impl Session for MysqlSession {
    async fn introspect(&self) -> Result<db_core::DatabaseSchema, AdapterError> {
        let mut conn = self.conn().await?;
        introspect(&mut conn, &self.host, self.port).await
    }

    async fn schema_fingerprint(&self) -> Result<String, AdapterError> {
        let mut conn = self.conn().await?;
        schema_fingerprint(&mut conn).await
    }

    async fn execute(
        &self,
        sql: &str,
        page_size: Option<i64>,
    ) -> Result<Vec<QueryExecutionResult>, AdapterError> {
        run_script(&self.pool, sql, page_size).await
    }

    async fn query_page(
        &self,
        sql: &str,
        limit: i64,
        offset: i64,
        with_count: bool,
    ) -> Result<QueryExecutionResult, AdapterError> {
        let mut conn = self.conn().await?;
        let stmt = sql.trim().trim_end_matches(';');
        Ok(run_statement(
            &mut conn,
            stmt,
            Some(PageRequest {
                limit,
                offset,
                with_count,
            }),
        )
        .await)
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
        let filter = where_clause(filters);
        let qualified = format!(
            "{}.{}",
            MySqlSql.quote_ident(schema),
            MySqlSql.quote_ident(table)
        );
        let sql = format!(
            "SELECT * FROM {qualified}{} LIMIT {limit} OFFSET {offset}",
            filter.clause
        );
        let mut conn = self.conn().await?;
        let started = Instant::now();
        let timestamp = Utc::now().to_rfc3339();
        match exec_rows(&mut conn, &sql, filter.params.clone()).await {
            Ok(rows) => {
                let mut result = success_result(&sql, timestamp, started, &rows);
                if !filter.clause.is_empty() {
                    let count_sql = format!("SELECT COUNT(*) FROM {qualified}{}", filter.clause);
                    if let Ok(count_rows) = exec_rows(&mut conn, &count_sql, filter.params).await {
                        result.total_rows = count_rows.first().and_then(first_number);
                    }
                }
                Ok(result)
            }
            Err(err) => Ok(error_result(&sql, timestamp, started, err)),
        }
    }

    async fn routine_source(
        &self,
        _schema: &str,
        oid: &str,
    ) -> Result<RoutineSource, AdapterError> {
        let mut conn = self.conn().await?;
        objects::routine_source(&mut conn, oid).await
    }
}

struct PageRequest {
    limit: i64,
    offset: i64,
    with_count: bool,
}

fn create_pool(cfg: &ConnectConfig) -> Result<Pool, AdapterError> {
    let max = usize::try_from(cfg.pool_size.max(1)).unwrap_or(1);
    let constraints =
        PoolConstraints::new(1, max).ok_or_else(|| AdapterError::msg("invalid pool size"))?;
    let opts = OptsBuilder::default()
        .ip_or_hostname(cfg.host.clone())
        .tcp_port(cfg.port)
        .user(Some(cfg.user.clone()))
        .pass(Some(cfg.password.clone()))
        .db_name(if cfg.database.is_empty() {
            None
        } else {
            Some(cfg.database.clone())
        })
        .ssl_opts(ssl_opts(cfg.ssl_mode))
        .pool_opts(PoolOpts::default().with_constraints(constraints));
    Ok(Pool::new(opts))
}

pub fn ssl_opts(mode: SslMode) -> Option<SslOpts> {
    match mode {
        SslMode::Disabled => None,
        // Require means TLS without verifying the certificate, matching Postgres.
        SslMode::Require => Some(
            SslOpts::default()
                .with_danger_accept_invalid_certs(true)
                .with_danger_skip_domain_validation(true),
        ),
        SslMode::Enabled => Some(SslOpts::default()),
    }
}

impl MysqlSession {
    async fn conn(&self) -> Result<mysql_async::Conn, AdapterError> {
        self.pool
            .get_conn()
            .await
            .map_err(|err| AdapterError::msg(err.to_string()))
    }
}

async fn run_script(
    pool: &Pool,
    sql: &str,
    page_size: Option<i64>,
) -> Result<Vec<QueryExecutionResult>, AdapterError> {
    let statements = MySqlSql.split_statements(sql);
    if statements.is_empty() {
        return Ok(Vec::new());
    }
    let mut conn = match pool.get_conn().await {
        Ok(conn) => conn,
        Err(err) => {
            let error = QueryError::new(QueryErrorCategory::Connection, err.to_string());
            return Ok(vec![error_result(
                sql,
                Utc::now().to_rfc3339(),
                Instant::now(),
                error,
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
        let result = run_statement(&mut conn, &stmt, page).await;
        let failed = result.error.is_some();
        results.push(result);
        if failed {
            let _ = conn.query_drop("ROLLBACK").await;
            break;
        }
    }
    Ok(results)
}

async fn run_statement(
    conn: &mut mysql_async::Conn,
    stmt: &str,
    page: Option<PageRequest>,
) -> QueryExecutionResult {
    let started = Instant::now();
    let timestamp = Utc::now().to_rfc3339();
    if let Some(page) = page {
        if let Some(paged) = MySqlSql.paged_select(stmt, page.limit.max(1), page.offset.max(0)) {
            match exec_rows(conn, &paged, Vec::new()).await {
                Ok(rows) => {
                    let mut result = success_result(stmt, timestamp, started, &rows);
                    result.page_size = Some(page.limit.max(1));
                    result.page_offset = Some(page.offset.max(0));
                    result.affected_rows = None;
                    if page.with_count {
                        if let Some(count_sql) = MySqlSql.count_select(stmt) {
                            if let Ok(count_rows) = exec_rows(conn, &count_sql, Vec::new()).await {
                                result.total_rows = count_rows.first().and_then(first_number);
                                result.affected_rows = result.total_rows;
                            }
                        }
                    }
                    return result;
                }
                Err(err) if vendor_code(&err) == Some(1060) => {
                    return stream_page(conn, stmt, page, timestamp, started).await;
                }
                Err(_) => {}
            }
        }
    }
    match exec_rows(conn, stmt, Vec::new()).await {
        Ok(rows) => success_result(stmt, timestamp.clone(), started, &rows),
        Err(err) => error_result(stmt, timestamp, started, err),
    }
}

/// Derived tables cannot repeat a column name (errno 1060). Read the statement
/// and keep the requested slice.
async fn stream_page(
    conn: &mut mysql_async::Conn,
    stmt: &str,
    page: PageRequest,
    timestamp: String,
    started: Instant,
) -> QueryExecutionResult {
    match exec_rows(conn, stmt, Vec::new()).await {
        Ok(rows) => {
            let total = rows.len() as u64;
            let start = page.offset.max(0) as usize;
            let end = start
                .saturating_add(page.limit.max(1) as usize)
                .min(rows.len());
            let page_rows = if start >= rows.len() {
                Vec::new()
            } else {
                rows[start..end].to_vec()
            };
            let mut result = success_result(stmt, timestamp, started, &page_rows);
            result.page_size = Some(page.limit.max(1));
            result.page_offset = Some(page.offset.max(0));
            if page.with_count {
                result.total_rows = Some(total);
                result.affected_rows = Some(total);
            }
            result
        }
        Err(err) => error_result(stmt, timestamp, started, err),
    }
}

#[allow(clippy::result_large_err)]
async fn exec_rows(
    conn: &mut mysql_async::Conn,
    sql: &str,
    params: Vec<Value>,
) -> Result<Vec<serde_json::Value>, QueryError> {
    if params.is_empty() {
        let mut result = conn
            .query_iter(sql)
            .await
            .map_err(|err| map_error(&err, sql))?;
        return drain(&mut result, sql).await;
    }
    let mut result = conn
        .exec_iter(sql, Params::Positional(params))
        .await
        .map_err(|err| map_error(&err, sql))?;
    drain(&mut result, sql).await
}

#[allow(clippy::result_large_err)]
async fn drain<P>(
    result: &mut mysql_async::QueryResult<'_, '_, P>,
    sql: &str,
) -> Result<Vec<serde_json::Value>, QueryError>
where
    P: mysql_async::prelude::Protocol,
{
    let mut rows = Vec::new();
    while let Some(row) = result.next().await.map_err(|err| map_error(&err, sql))? {
        rows.push(row_object(&row));
    }
    Ok(rows)
}

fn vendor_code(err: &QueryError) -> Option<i32> {
    err.vendor_code
}

fn map_error(err: &mysql_async::Error, sql: &str) -> QueryError {
    if let mysql_async::Error::Server(server) = err {
        return query_error_from_parts(
            MysqlErrorParts {
                code: server.code,
                state: server.state.clone(),
                message: server.message.clone(),
            },
            sql,
        );
    }
    let category = if err.is_fatal() {
        QueryErrorCategory::Connection
    } else {
        QueryErrorCategory::Other
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
        serde_json::Value::Number(n) => n.as_u64().or_else(|| n.as_i64().map(|v| v as u64)),
        serde_json::Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

#[allow(dead_code)]
fn _row_type_anchor(_row: Row) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_accepts_invalid_certs_and_disabled_skips_tls() {
        assert!(ssl_opts(SslMode::Disabled).is_none());
        let require = ssl_opts(SslMode::Require).unwrap();
        assert!(require.accept_invalid_certs());
        assert!(require.skip_domain_validation());
        let enabled = ssl_opts(SslMode::Enabled).unwrap();
        assert!(!enabled.accept_invalid_certs());
    }
}
