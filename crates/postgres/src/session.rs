use std::time::Instant;

use async_trait::async_trait;
use chrono::Utc;
use db_core::{
    clamp_pool_size, clamp_preview_page, split_sql_statements, Adapter, AdapterError,
    ConnectConfig, ConnectionStatus, DatabaseDialect, DatabaseSchema, QueryExecutionResult,
    Session, DEFAULT_ROW_CAP,
};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod, Runtime};
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio_postgres::{config::SslMode, NoTls};
use uuid::Uuid;

use crate::ident::qualify_table;
use crate::values::collect_simple;

pub struct PostgresAdapter;

pub struct PostgresSession {
    pool: Pool,
}

#[async_trait]
impl Adapter for PostgresAdapter {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError> {
        let started = Instant::now();
        let session = self.connect(cfg).await?;
        let result = session.execute("SELECT version()", 1).await?;
        let first = result
            .into_iter()
            .next()
            .unwrap_or_else(|| QueryExecutionResult {
                id: format!("res_{}", Uuid::new_v4()),
                query: "SELECT version()".into(),
                timestamp: Utc::now().to_rfc3339(),
                execution_time_ms: 0,
                affected_rows: None,
                columns: None,
                rows: None,
                error: Some("empty result".into()),
                truncated: None,
            });
        let latency = started.elapsed().as_millis() as u64;
        if let Some(err) = first.error {
            return Err(AdapterError::msg(err));
        }
        let version = first
            .rows
            .as_ref()
            .and_then(|rows| rows.first())
            .and_then(|row| row.as_object())
            .and_then(|obj| obj.values().next())
            .map(|v| v.as_str().unwrap_or("PostgreSQL").to_string())
            .unwrap_or_else(|| "PostgreSQL".to_string());
        Ok((latency, version))
    }

    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn Session>, AdapterError> {
        Ok(Box::new(PostgresSession {
            pool: create_pool(cfg)?,
        }))
    }
}

#[async_trait]
impl Session for PostgresSession {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError> {
        introspect(self).await
    }

    async fn execute(
        &self,
        sql: &str,
        row_cap: usize,
    ) -> Result<Vec<QueryExecutionResult>, AdapterError> {
        run_script(self, sql, row_cap).await
    }

    async fn preview(
        &self,
        schema: &str,
        table: &str,
        limit: i64,
        offset: i64,
    ) -> Result<QueryExecutionResult, AdapterError> {
        let (limit, offset) = clamp_preview_page(limit, offset);
        let sql = format!(
            "SELECT * FROM {} LIMIT {} OFFSET {}",
            qualify_table(schema, table),
            limit,
            offset
        );
        run_sql(self, &sql, DEFAULT_ROW_CAP).await
    }
}

fn pg_config(cfg: &ConnectConfig) -> tokio_postgres::Config {
    let mut tokio_cfg = tokio_postgres::Config::new();
    tokio_cfg.host(&cfg.host);
    tokio_cfg.port(cfg.port);
    tokio_cfg.user(&cfg.user);
    tokio_cfg.password(&cfg.password);
    tokio_cfg.dbname(&cfg.database);
    tokio_cfg.ssl_mode(tokio_ssl_mode(cfg.ssl_mode));
    tokio_cfg
}

fn tokio_ssl_mode(mode: db_core::SslMode) -> SslMode {
    if mode.uses_tls() {
        SslMode::Require
    } else {
        SslMode::Disable
    }
}

fn create_pool(cfg: &ConnectConfig) -> Result<Pool, AdapterError> {
    let manager_cfg = ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    };
    let size = clamp_pool_size(cfg.pool_size) as usize;
    let manager = if cfg.ssl_mode.uses_tls() {
        let mut builder = TlsConnector::builder();
        if cfg.ssl_mode.danger_accept_invalid_certs() {
            builder.danger_accept_invalid_certs(true);
            builder.danger_accept_invalid_hostnames(true);
        }
        let tls = MakeTlsConnector::new(
            builder
                .build()
                .map_err(|e| AdapterError::msg(e.to_string()))?,
        );
        deadpool_postgres::Manager::from_config(pg_config(cfg), tls, manager_cfg)
    } else {
        deadpool_postgres::Manager::from_config(pg_config(cfg), NoTls, manager_cfg)
    };
    Pool::builder(manager)
        .max_size(size)
        .runtime(Runtime::Tokio1)
        .build()
        .map_err(|e| AdapterError::msg(e.to_string()))
}

impl PostgresSession {
    async fn client(&self) -> Result<deadpool_postgres::Client, AdapterError> {
        self.pool
            .get()
            .await
            .map_err(|e| AdapterError::msg(e.to_string()))
    }

    async fn simple_query(
        &self,
        sql: &str,
    ) -> Result<Vec<tokio_postgres::SimpleQueryMessage>, AdapterError> {
        self.client()
            .await?
            .simple_query(sql)
            .await
            .map_err(|e| AdapterError::msg(e.to_string()))
    }

    async fn query_one_i64(&self, sql: &str) -> Result<i64, AdapterError> {
        let client = self.client().await?;
        let row = client
            .query_one(sql, &[])
            .await
            .map_err(|e| AdapterError::msg(e.to_string()))?;
        row.try_get::<_, i64>(0)
            .or_else(|_| row.try_get::<_, i32>(0).map(|v| v as i64))
            .map_err(|e| AdapterError::msg(e.to_string()))
    }

    async fn query_one_string(&self, sql: &str) -> Result<String, AdapterError> {
        let client = self.client().await?;
        let row = client
            .query_one(sql, &[])
            .await
            .map_err(|e| AdapterError::msg(e.to_string()))?;
        row.try_get(0).map_err(|e| AdapterError::msg(e.to_string()))
    }

    async fn query_rows(&self, sql: &str) -> Result<Vec<tokio_postgres::Row>, AdapterError> {
        self.client()
            .await?
            .query(sql, &[])
            .await
            .map_err(|e| AdapterError::msg(e.to_string()))
    }
}
async fn run_sql(
    session: &PostgresSession,
    sql: &str,
    row_cap: usize,
) -> Result<QueryExecutionResult, AdapterError> {
    let started = Instant::now();
    let timestamp = Utc::now().to_rfc3339();
    match session.simple_query(sql).await {
        Ok(messages) => Ok(success_result(sql, timestamp, started, messages, row_cap)),
        Err(err) => Ok(error_result(sql, timestamp, started, err.to_string())),
    }
}

async fn run_script(
    session: &PostgresSession,
    sql: &str,
    row_cap: usize,
) -> Result<Vec<QueryExecutionResult>, AdapterError> {
    let statements = split_sql_statements(sql);
    if statements.is_empty() {
        return Ok(Vec::new());
    }
    let client = session.client().await?;
    let mut results = Vec::with_capacity(statements.len());
    for stmt in statements {
        let started = Instant::now();
        let timestamp = Utc::now().to_rfc3339();
        match client.simple_query(&stmt).await {
            Ok(messages) => {
                results.push(success_result(&stmt, timestamp, started, messages, row_cap));
            }
            Err(err) => {
                results.push(error_result(&stmt, timestamp, started, err.to_string()));
                break;
            }
        }
    }
    Ok(results)
}

fn success_result(
    sql: &str,
    timestamp: String,
    started: Instant,
    messages: Vec<tokio_postgres::SimpleQueryMessage>,
    row_cap: usize,
) -> QueryExecutionResult {
    let collected = collect_simple(messages, row_cap);
    QueryExecutionResult {
        id: format!("res_{}", Uuid::new_v4()),
        query: sql.to_string(),
        timestamp,
        execution_time_ms: started.elapsed().as_millis() as u64,
        affected_rows: Some(collected.affected_rows),
        columns: if collected.columns.is_empty() {
            None
        } else {
            Some(collected.columns)
        },
        rows: Some(collected.rows),
        error: None,
        truncated: if collected.truncated {
            Some(true)
        } else {
            None
        },
    }
}

fn error_result(
    sql: &str,
    timestamp: String,
    started: Instant,
    error: String,
) -> QueryExecutionResult {
    QueryExecutionResult {
        id: format!("res_{}", Uuid::new_v4()),
        query: sql.to_string(),
        timestamp,
        execution_time_ms: started.elapsed().as_millis() as u64,
        affected_rows: None,
        columns: None,
        rows: None,
        error: Some(error),
        truncated: None,
    }
}

fn on_delete_from_confdeltype(code: &str) -> Option<String> {
    match code {
        "a" => Some("NO ACTION".into()),
        "r" => Some("RESTRICT".into()),
        "c" => Some("CASCADE".into()),
        "n" => Some("SET NULL".into()),
        "d" => Some("SET DEFAULT".into()),
        _ => None,
    }
}

async fn introspect(session: &PostgresSession) -> Result<DatabaseSchema, AdapterError> {
    let version = session
        .query_one_string("SELECT version()")
        .await
        .unwrap_or_else(|_| "PostgreSQL".to_string());
    let db_name = session
        .query_one_string("SELECT current_database()")
        .await
        .unwrap_or_else(|_| "postgres".to_string());
    let active_connections = session
        .query_one_i64("SELECT COUNT(*)::bigint FROM pg_stat_activity")
        .await
        .unwrap_or(0);
    let total_size = session
        .query_one_i64("SELECT pg_database_size(current_database())::bigint")
        .await
        .unwrap_or(0);

    let table_rows = session
        .query_rows(
            r#"
            SELECT
              n.nspname::text AS schema_name,
              c.relname::text AS table_name,
              c.relkind::text AS kind,
              COALESCE(c.reltuples, 0)::bigint AS est_rows,
              COALESCE(pg_total_relation_size(c.oid), 0)::bigint AS size_bytes,
              COALESCE(obj_description(c.oid, 'pg_class'), '')::text AS comment
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
              AND c.relkind IN ('r', 'p', 'v', 'm')
            ORDER BY n.nspname, c.relname
            "#,
        )
        .await?;

    let column_rows = session
        .query_rows(
            r#"
            SELECT
              n.nspname::text,
              c.relname::text,
              a.attname::text,
              pg_catalog.format_type(a.atttypid, a.atttypmod)::text,
              NOT a.attnotnull AS is_nullable,
              COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '')::text AS default_value,
              COALESCE(col_description(c.oid, a.attnum), '')::text AS comment,
              COALESCE((
                SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
                FROM pg_enum e
                WHERE e.enumtypid = CASE
                  WHEN t.typtype = 'e' THEN t.oid
                  WHEN et.typtype = 'e' THEN et.oid
                  ELSE NULL
                END
              ), ARRAY[]::text[]) AS enum_values
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_type t ON t.oid = a.atttypid
            LEFT JOIN pg_type et ON et.oid = t.typelem
            LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
            WHERE a.attnum > 0
              AND NOT a.attisdropped
              AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
              AND c.relkind IN ('r', 'p', 'v', 'm')
            ORDER BY n.nspname, c.relname, a.attnum
            "#,
        )
        .await?;

    let pk_rows = session
        .query_rows(
            r#"
            SELECT
              n.nspname::text,
              c.relname::text,
              a.attname::text
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
            WHERE i.indisprimary
              AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            "#,
        )
        .await?;

    let fk_rows = session
        .query_rows(
            r#"
            SELECT
              n.nspname::text,
              src.relname::text,
              src_att.attname::text,
              tn.nspname::text,
              tgt.relname::text,
              tgt_att.attname::text,
              COALESCE(confdeltype::text, '') 
            FROM pg_constraint con
            JOIN pg_class src ON src.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = src.relnamespace
            JOIN pg_class tgt ON tgt.oid = con.confrelid
            JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
            JOIN unnest(con.conkey) WITH ORDINALITY AS src_cols(attnum, ord) ON true
            JOIN unnest(con.confkey) WITH ORDINALITY AS tgt_cols(attnum, ord) ON src_cols.ord = tgt_cols.ord
            JOIN pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = src_cols.attnum
            JOIN pg_attribute tgt_att ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = tgt_cols.attnum
            WHERE con.contype = 'f'
              AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            "#,
        )
        .await?;

    let index_rows = session
        .query_rows(
            r#"
            SELECT
              n.nspname::text,
              t.relname::text,
              i.relname::text,
              ix.indisunique,
              COALESCE(am.amname::text, 'BTREE'),
              array_to_string(ARRAY(
                SELECT a.attname
                FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                ORDER BY k.ord
              ), ',')
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            LEFT JOIN pg_am am ON am.oid = i.relam
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
              AND t.relkind IN ('r', 'p', 'm')
            "#,
        )
        .await?;

    use db_core::{ColumnDefinition, ForeignKeyRef, IndexDefinition, TableSchema};
    use std::collections::HashMap;

    let mut pk_set: HashMap<(String, String, String), ()> = HashMap::new();
    for row in &pk_rows {
        let schema: String = row.get(0);
        let table: String = row.get(1);
        let col: String = row.get(2);
        pk_set.insert((schema, table, col), ());
    }

    let mut fks: HashMap<(String, String, String), ForeignKeyRef> = HashMap::new();
    for row in &fk_rows {
        let schema: String = row.get(0);
        let table: String = row.get(1);
        let col: String = row.get(2);
        let target_schema: String = row.get(3);
        let target_table: String = row.get(4);
        let target_column: String = row.get(5);
        let confdeltype: String = row.get(6);
        fks.insert(
            (schema, table, col),
            ForeignKeyRef {
                target_table,
                target_column,
                target_schema: if target_schema.is_empty() {
                    None
                } else {
                    Some(target_schema)
                },
                on_delete: on_delete_from_confdeltype(confdeltype.trim()),
            },
        );
    }

    let mut indexes: HashMap<(String, String), Vec<IndexDefinition>> = HashMap::new();
    let mut unique_cols: HashMap<(String, String, String), ()> = HashMap::new();
    for row in &index_rows {
        let schema: String = row.get(0);
        let table: String = row.get(1);
        let name: String = row.get(2);
        let is_unique: bool = row.get(3);
        let index_type: String = row.get(4);
        let cols_csv: String = row.get(5);
        let columns: Vec<String> = if cols_csv.is_empty() {
            Vec::new()
        } else {
            cols_csv.split(',').map(|s| s.to_string()).collect()
        };
        if is_unique && columns.len() == 1 {
            unique_cols.insert((schema.clone(), table.clone(), columns[0].clone()), ());
        }
        indexes
            .entry((schema, table))
            .or_default()
            .push(IndexDefinition {
                name,
                columns,
                is_unique,
                index_type: index_type.to_uppercase(),
            });
    }

    let mut columns: HashMap<(String, String), Vec<ColumnDefinition>> = HashMap::new();
    for row in &column_rows {
        let schema: String = row.get(0);
        let table: String = row.get(1);
        let name: String = row.get(2);
        let data_type: String = row.get(3);
        let is_nullable: bool = row.get(4);
        let default_value: String = row.get(5);
        let comment: String = row.get(6);
        let enum_values: Vec<String> = row.try_get(7).unwrap_or_default();
        let key = (schema.clone(), table.clone(), name.clone());
        columns
            .entry((schema.clone(), table.clone()))
            .or_default()
            .push(ColumnDefinition {
                name: name.clone(),
                data_type,
                is_primary: Some(pk_set.contains_key(&key)),
                is_nullable: Some(is_nullable),
                is_unique: Some(unique_cols.contains_key(&key) && !pk_set.contains_key(&key)),
                default_value: if default_value.is_empty() {
                    None
                } else {
                    Some(default_value)
                },
                comment: if comment.is_empty() {
                    None
                } else {
                    Some(comment)
                },
                enum_values: if enum_values.is_empty() {
                    None
                } else {
                    Some(enum_values)
                },
                foreign_key: fks.get(&key).cloned(),
            });
    }

    let now = Utc::now().to_rfc3339();
    let mut tables = Vec::new();
    for row in &table_rows {
        let schema: String = row.get(0);
        let name: String = row.get(1);
        let kind: String = row.get(2);
        let est_rows: i64 = row.get(3);
        let size_bytes: i64 = row.get(4);
        let comment: String = row.get(5);
        let id = format!("{schema}.{name}");
        tables.push(TableSchema {
            id: id.clone(),
            name: name.clone(),
            schema: schema.clone(),
            description: if comment.is_empty() {
                None
            } else {
                Some(comment)
            },
            row_count: est_rows,
            size_mb: (size_bytes as f64) / (1024.0 * 1024.0),
            tags: Vec::new(),
            columns: columns
                .remove(&(schema.clone(), name.clone()))
                .unwrap_or_default(),
            indexes: indexes.remove(&(schema, name)).unwrap_or_default(),
            created_at: now.clone(),
            updated_at: now.clone(),
            is_view: Some(kind == "v" || kind == "m"),
            view_sql: None,
        });
    }

    Ok(DatabaseSchema {
        id: db_name.clone(),
        name: db_name,
        dialect: DatabaseDialect::PostgreSQL,
        version,
        connection_host: String::new(),
        connection_port: 0,
        environment: db_core::Environment::Development,
        status: ConnectionStatus::Connected,
        tables,
        total_size_mb: (total_size as f64) / (1024.0 * 1024.0),
        active_connections,
        queries_per_second: 0.0,
    })
}

#[cfg(test)]
mod tests {
    use super::{on_delete_from_confdeltype, tokio_ssl_mode};
    use db_core::SslMode as AppSslMode;
    use tokio_postgres::config::SslMode;

    #[test]
    fn maps_confdeltype_codes() {
        assert_eq!(
            on_delete_from_confdeltype("a").as_deref(),
            Some("NO ACTION")
        );
        assert_eq!(on_delete_from_confdeltype("r").as_deref(), Some("RESTRICT"));
        assert_eq!(on_delete_from_confdeltype("c").as_deref(), Some("CASCADE"));
        assert_eq!(on_delete_from_confdeltype("n").as_deref(), Some("SET NULL"));
        assert_eq!(
            on_delete_from_confdeltype("d").as_deref(),
            Some("SET DEFAULT")
        );
        assert_eq!(on_delete_from_confdeltype(""), None);
        assert_eq!(on_delete_from_confdeltype("x"), None);
    }

    #[test]
    fn maps_app_ssl_mode_to_tokio() {
        assert_eq!(tokio_ssl_mode(AppSslMode::Disabled), SslMode::Disable);
        assert_eq!(tokio_ssl_mode(AppSslMode::Require), SslMode::Require);
        assert_eq!(tokio_ssl_mode(AppSslMode::Enabled), SslMode::Require);
        assert!(AppSslMode::Require.danger_accept_invalid_certs());
        assert!(!AppSslMode::Enabled.danger_accept_invalid_certs());
    }
}
