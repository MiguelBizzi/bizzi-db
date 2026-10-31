use std::collections::HashMap;

use chrono::Utc;
use db_core::{
    AdapterError, ColumnDefinition, ConnectionStatus, DatabaseDialect, DatabaseSchema,
    ForeignKeyRef, IndexConstraint, IndexConstraintKind, IndexDefinition, IndexKey, ParameterMode,
    RoutineDefinition, RoutineKind, RoutineParameter, RoutineSource, TableSchema,
};
use mysql_async::prelude::*;
use mysql_async::{Conn, Row, Value};

use crate::values::cell_string;

const SKIP: &str = "'mysql', 'sys', 'information_schema', 'performance_schema'";

pub async fn introspect(
    conn: &mut Conn,
    host: &str,
    port: u16,
) -> Result<DatabaseSchema, AdapterError> {
    let _ = conn
        .query_drop("SET SESSION information_schema_stats_expiry = 0")
        .await;
    let version = scalar(conn, "SELECT VERSION()")
        .await
        .unwrap_or_else(|_| "MySQL".into());
    let server_version_num = parse_version(&version);
    let db_name = scalar(conn, "SELECT IFNULL(DATABASE(), '')")
        .await
        .unwrap_or_default();
    let name = if db_name.is_empty() {
        host.to_string()
    } else {
        db_name
    };
    let active_connections = fetch(conn, "SHOW GLOBAL STATUS LIKE 'Threads_connected'")
        .await
        .ok()
        .and_then(|rows| rows.first().and_then(|row| cell(row, 1)))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let total_size = scalar(
        conn,
        &format!(
            "SELECT IFNULL(SUM(DATA_LENGTH + INDEX_LENGTH), 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA NOT IN ({SKIP})"
        ),
    )
    .await
    .ok()
    .and_then(|v| v.parse::<f64>().ok())
    .unwrap_or(0.0);

    let tables_rows = fetch(
        conn,
        &format!(
            "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, IFNULL(TABLE_ROWS, 0), IFNULL(DATA_LENGTH, 0) + IFNULL(INDEX_LENGTH, 0), IFNULL(TABLE_COMMENT, '')
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA NOT IN ({SKIP}) AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
             ORDER BY TABLE_SCHEMA, TABLE_NAME"
        ),
    )
    .await?;
    let views = fetch(
        conn,
        &format!(
            "SELECT TABLE_SCHEMA, TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA NOT IN ({SKIP})"
        ),
    )
    .await?;
    let columns = fetch(
        conn,
        &format!(
            "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT, EXTRA, COLUMN_KEY
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA NOT IN ({SKIP})
             ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION"
        ),
    )
    .await?;
    let foreign_keys = fetch(
        conn,
        &format!(
            "SELECT k.TABLE_SCHEMA, k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
             FROM information_schema.KEY_COLUMN_USAGE k
             JOIN information_schema.REFERENTIAL_CONSTRAINTS r
               ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
             WHERE k.REFERENCED_TABLE_NAME IS NOT NULL AND k.TABLE_SCHEMA NOT IN ({SKIP})"
        ),
    )
    .await?;
    let indexes = fetch(
        conn,
        &format!(
            "SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, COLLATION, EXPRESSION, IFNULL(IS_VISIBLE, 'YES')
             FROM information_schema.STATISTICS WHERE TABLE_SCHEMA NOT IN ({SKIP})
             ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX"
        ),
    )
    .await?;
    let routines = fetch(
        conn,
        &format!(
            "SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE, DTD_IDENTIFIER, IS_DETERMINISTIC, SQL_DATA_ACCESS, SECURITY_TYPE, ROUTINE_COMMENT
             FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA NOT IN ({SKIP})"
        ),
    )
    .await?;
    let parameters = fetch(
        conn,
        &format!(
            "SELECT SPECIFIC_SCHEMA, SPECIFIC_NAME, ORDINAL_POSITION, PARAMETER_NAME, PARAMETER_MODE, DTD_IDENTIFIER
             FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA NOT IN ({SKIP})
             ORDER BY SPECIFIC_SCHEMA, SPECIFIC_NAME, ORDINAL_POSITION"
        ),
    )
    .await?;
    let scans = fetch(
        conn,
        &format!(
            "SELECT OBJECT_SCHEMA, OBJECT_NAME, INDEX_NAME, COUNT_STAR
             FROM performance_schema.table_io_waits_summary_by_index_usage
             WHERE OBJECT_SCHEMA NOT IN ({SKIP}) AND INDEX_NAME IS NOT NULL"
        ),
    )
    .await
    .unwrap_or_default();

    let view_sql = keyed(&views, |row| (key2(row), cell(row, 2).unwrap_or_default()));
    let mut columns_by: HashMap<String, Vec<ColumnDefinition>> = HashMap::new();
    for row in &columns {
        columns_by
            .entry(key2(row))
            .or_default()
            .push(column_from(row));
    }
    for row in &foreign_keys {
        let Some(cols) = columns_by.get_mut(&key2(row)) else {
            continue;
        };
        let name = cell(row, 2).unwrap_or_default();
        if let Some(column) = cols.iter_mut().find(|c| c.name == name) {
            column.foreign_key = Some(ForeignKeyRef {
                target_schema: cell(row, 3),
                target_table: cell(row, 4).unwrap_or_default(),
                target_column: cell(row, 5).unwrap_or_default(),
                on_delete: cell(row, 6),
            });
        }
    }
    let mut indexes_by: HashMap<String, Vec<IndexDefinition>> = HashMap::new();
    for row in &indexes {
        let table_key = key2(row);
        let index_name = cell(row, 2).unwrap_or_default();
        let list = indexes_by.entry(table_key).or_default();
        if list.last().map(|i| i.name.as_str()) != Some(index_name.as_str()) {
            let primary = index_name.eq_ignore_ascii_case("PRIMARY");
            let unique = cell(row, 3).as_deref() == Some("0") || primary;
            list.push(IndexDefinition {
                name: index_name.clone(),
                columns: Vec::new(),
                is_unique: unique,
                index_type: cell(row, 4).unwrap_or_else(|| "BTREE".into()),
                keys: Vec::new(),
                is_primary: primary,
                constraint: if primary {
                    Some(IndexConstraint {
                        name: index_name,
                        kind: IndexConstraintKind::Primary,
                    })
                } else if unique {
                    Some(IndexConstraint {
                        name: cell(row, 2).unwrap_or_default(),
                        kind: IndexConstraintKind::Unique,
                    })
                } else {
                    None
                },
                is_valid: true,
                ..IndexDefinition::default()
            });
        }
        let index = list.last_mut().expect("index just pushed");
        let expression = index_expression(row);
        let is_expression = cell(row, 9).is_some();
        if !is_expression {
            if let Some(name) = cell(row, 6) {
                index.columns.push(name);
            }
        }
        index.keys.push(IndexKey {
            expression,
            is_expression,
            descending: cell(row, 8).as_deref() == Some("D"),
            nulls_first: None,
            opclass: None,
            collation: None,
        });
        if cell(row, 10).as_deref() == Some("NO") {
            index.definition = Some("INVISIBLE".into());
        }
    }
    let scan_map: HashMap<(String, String, String), i64> = scans
        .iter()
        .filter_map(|row| {
            Some((
                (cell(row, 0)?, cell(row, 1)?, cell(row, 2)?),
                cell(row, 3)?.parse().ok()?,
            ))
        })
        .collect();
    for (table_key, list) in indexes_by.iter_mut() {
        let (schema, table) = table_key.split_once('\u{1}').unwrap_or(("", ""));
        for index in list {
            index.scans = scan_map
                .get(&(schema.to_string(), table.to_string(), index.name.clone()))
                .copied();
        }
    }

    let mut params_by: HashMap<String, Vec<RoutineParameter>> = HashMap::new();
    for row in &parameters {
        let ordinal: i32 = cell(row, 2).and_then(|v| v.parse().ok()).unwrap_or(0);
        if ordinal == 0 {
            continue;
        }
        params_by
            .entry(key2(row))
            .or_default()
            .push(RoutineParameter {
                name: cell(row, 3).unwrap_or_default(),
                data_type: cell(row, 5).unwrap_or_default(),
                mode: match cell(row, 4)
                    .unwrap_or_default()
                    .to_ascii_uppercase()
                    .as_str()
                {
                    "OUT" => ParameterMode::Out,
                    "INOUT" => ParameterMode::InOut,
                    _ => ParameterMode::In,
                },
                default: None,
            });
    }

    let now = Utc::now().to_rfc3339();
    let mut tables = Vec::new();
    for row in &tables_rows {
        let schema = cell(row, 0).unwrap_or_default();
        let table = cell(row, 1).unwrap_or_default();
        let id = format!("{schema}.{table}");
        let map_key = format!("{schema}\u{1}{table}");
        let is_view = cell(row, 2).as_deref() == Some("VIEW");
        let bytes: f64 = cell(row, 4).and_then(|v| v.parse().ok()).unwrap_or(0.0);
        let comment = cell(row, 5).filter(|c| !c.is_empty());
        tables.push(TableSchema {
            id: id.clone(),
            name: table,
            schema,
            description: comment,
            row_count: cell(row, 3).and_then(|v| v.parse().ok()).unwrap_or(0),
            size_mb: bytes / (1024.0 * 1024.0),
            tags: Vec::new(),
            columns: columns_by.remove(&map_key).unwrap_or_default(),
            indexes: indexes_by.remove(&map_key).unwrap_or_default(),
            created_at: now.clone(),
            updated_at: now.clone(),
            is_view: if is_view { Some(true) } else { None },
            view_sql: view_sql.get(&map_key).cloned(),
            is_materialized: None,
        });
    }

    let mut routine_defs = Vec::new();
    for row in &routines {
        let schema = cell(row, 0).unwrap_or_default();
        let name = cell(row, 1).unwrap_or_default();
        let kind = if cell(row, 2).as_deref() == Some("PROCEDURE") {
            RoutineKind::Procedure
        } else {
            RoutineKind::Function
        };
        let kind_name = match kind {
            RoutineKind::Procedure => "procedure",
            RoutineKind::Function => "function",
        };
        let oid = format!("{schema}.{kind_name}.{name}");
        let params = params_by
            .remove(&format!("{schema}\u{1}{name}"))
            .unwrap_or_default();
        let identity = params
            .iter()
            .map(|p| p.data_type.clone())
            .collect::<Vec<_>>()
            .join(", ");
        routine_defs.push(RoutineDefinition {
            id: oid.clone(),
            oid,
            schema,
            name,
            kind,
            identity_arguments: identity,
            parameters: params,
            return_type: cell(row, 3).filter(|v| !v.is_empty()),
            returns_set: false,
            language: "SQL".into(),
            volatility: if cell(row, 4).as_deref() == Some("YES") {
                "immutable".into()
            } else {
                "volatile".into()
            },
            is_strict: false,
            security_definer: cell(row, 6).as_deref() == Some("DEFINER"),
            parallel: None,
            leakproof: None,
            cost: None,
            rows: None,
            has_sql_body: true,
            comment: cell(row, 7).filter(|c| !c.is_empty()),
            owner: None,
        });
    }

    Ok(DatabaseSchema {
        id: name.clone(),
        name,
        dialect: DatabaseDialect::MySQL,
        version,
        connection_host: host.into(),
        connection_port: port,
        environment: db_core::Environment::Development,
        status: ConnectionStatus::Connected,
        tables,
        routines: routine_defs,
        languages: vec!["SQL".into()],
        server_version_num,
        total_size_mb: total_size / (1024.0 * 1024.0),
        active_connections,
        queries_per_second: 0.0,
    })
}

pub async fn schema_fingerprint(conn: &mut Conn) -> Result<String, AdapterError> {
    let _ = conn
        .query_drop("SET SESSION group_concat_max_len = 1048576")
        .await;
    let _ = conn
        .query_drop("SET SESSION information_schema_stats_expiry = 0")
        .await;
    scalar(
        conn,
        &format!(
            "SELECT SHA2(IFNULL(GROUP_CONCAT(part ORDER BY part SEPARATOR '\n'), ''), 256) FROM (
               SELECT CONCAT_WS('|', 't', TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, IFNULL(TABLE_COMMENT, '')) AS part
               FROM information_schema.TABLES WHERE TABLE_SCHEMA NOT IN ({SKIP})
               UNION ALL
               SELECT CONCAT_WS('|', 'c', TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, IFNULL(COLUMN_DEFAULT, ''), EXTRA)
               FROM information_schema.COLUMNS WHERE TABLE_SCHEMA NOT IN ({SKIP})
               UNION ALL
               SELECT CONCAT_WS('|', 'i', TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, IFNULL(COLUMN_NAME, ''), IFNULL(EXPRESSION, ''), NON_UNIQUE, INDEX_TYPE)
               FROM information_schema.STATISTICS WHERE TABLE_SCHEMA NOT IN ({SKIP})
               UNION ALL
               SELECT CONCAT_WS('|', 'r', ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE, IFNULL(ROUTINE_DEFINITION, ''))
               FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA NOT IN ({SKIP})
               UNION ALL
               SELECT CONCAT_WS('|', 'g', TRIGGER_SCHEMA, TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT)
               FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA NOT IN ({SKIP})
             ) parts"
        ),
    )
    .await
}

pub async fn routine_source(conn: &mut Conn, oid: &str) -> Result<RoutineSource, AdapterError> {
    let (schema, kind, name) = parse_routine_key(oid)
        .ok_or_else(|| AdapterError::msg("This routine no longer exists. Refresh the schema."))?;
    let statement = if kind == "procedure" {
        "PROCEDURE"
    } else {
        "FUNCTION"
    };
    let sql = format!(
        "SHOW CREATE {statement} {}.{}",
        quote(&schema),
        quote(&name)
    );
    let rows = fetch(conn, &sql).await?;
    let row = rows
        .first()
        .ok_or_else(|| AdapterError::msg("This routine no longer exists. Refresh the schema."))?;
    let definition = row
        .iter()
        .flatten()
        .find(|cell| cell.to_ascii_uppercase().starts_with("CREATE"))
        .cloned()
        .unwrap_or_default();
    let body = routine_body(&definition);
    Ok(RoutineSource { definition, body })
}

pub fn parse_routine_key(oid: &str) -> Option<(String, String, String)> {
    let mut parts = oid.splitn(3, '.');
    let schema = parts.next()?.to_string();
    let kind = parts.next()?.to_string();
    let name = parts.next()?.to_string();
    if schema.is_empty() || name.is_empty() {
        return None;
    }
    if kind != "function" && kind != "procedure" {
        return None;
    }
    Some((schema, kind, name))
}

fn routine_body(definition: &str) -> String {
    let upper = definition.to_ascii_uppercase();
    if let Some(begin) = upper.find("BEGIN") {
        return definition[begin..].trim().to_string();
    }
    if let Some(ret) = upper.rfind("RETURN") {
        return definition[ret..].trim().trim_end_matches(';').to_string();
    }
    definition.to_string()
}

fn quote(name: &str) -> String {
    format!("`{}`", name.replace('`', "``"))
}

fn column_from(row: &[Option<String>]) -> ColumnDefinition {
    let column_type = cell(row, 3).unwrap_or_default();
    let extra = cell(row, 7).unwrap_or_default();
    let key = cell(row, 8).unwrap_or_default();
    ColumnDefinition {
        name: cell(row, 2).unwrap_or_default(),
        data_type: column_type.clone(),
        is_primary: (key == "PRI").then_some(true),
        is_nullable: Some(cell(row, 4).as_deref() == Some("YES")),
        is_unique: (key == "UNI" || key == "PRI").then_some(true),
        default_value: cell(row, 5),
        comment: cell(row, 6).filter(|c| !c.is_empty()),
        enum_values: enum_values(&column_type),
        foreign_key: None,
    }
    .with_generated(&extra)
}

trait WithGenerated {
    fn with_generated(self, extra: &str) -> Self;
}

impl WithGenerated for ColumnDefinition {
    fn with_generated(mut self, extra: &str) -> Self {
        if extra.to_ascii_lowercase().contains("auto_increment") {
            self.default_value = self.default_value.or(Some("AUTO_INCREMENT".into()));
        }
        self
    }
}

fn enum_values(column_type: &str) -> Option<Vec<String>> {
    let lower = column_type.to_ascii_lowercase();
    if !lower.starts_with("enum(") && !lower.starts_with("set(") {
        return None;
    }
    let start = column_type.find('(')? + 1;
    let end = column_type.rfind(')')?;
    let inner = &column_type[start..end];
    let mut values = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for c in inner.chars() {
        if c == '\'' {
            quoted = !quoted;
            continue;
        }
        if c == ',' && !quoted {
            if !current.is_empty() {
                values.push(std::mem::take(&mut current));
            }
            continue;
        }
        if quoted {
            current.push(c);
        }
    }
    if !current.is_empty() {
        values.push(current);
    }
    Some(values).filter(|v| !v.is_empty())
}

fn index_expression(row: &[Option<String>]) -> String {
    if let Some(expression) = cell(row, 9) {
        return expression;
    }
    let name = cell(row, 6).unwrap_or_default();
    match cell(row, 7) {
        Some(prefix) => format!("{name}({prefix})"),
        None => name,
    }
}

fn key2(row: &[Option<String>]) -> String {
    format!(
        "{}\u{1}{}",
        cell(row, 0).unwrap_or_default(),
        cell(row, 1).unwrap_or_default()
    )
}

fn keyed(
    rows: &[Vec<Option<String>>],
    f: impl Fn(&[Option<String>]) -> (String, String),
) -> HashMap<String, String> {
    rows.iter().map(|row| f(row)).collect()
}

fn cell(row: &[Option<String>], index: usize) -> Option<String> {
    row.get(index).and_then(|value| value.clone())
}

fn parse_version(version: &str) -> Option<i32> {
    let mut parts = version
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty());
    let major: i32 = parts.next()?.parse().ok()?;
    let minor: i32 = parts.next().unwrap_or("0").parse().ok()?;
    let patch: i32 = parts.next().unwrap_or("0").parse().ok()?;
    Some(major * 10_000 + minor * 100 + patch)
}

async fn scalar(conn: &mut Conn, sql: &str) -> Result<String, AdapterError> {
    let rows = fetch(conn, sql).await?;
    rows.first()
        .and_then(|row| row.iter().flatten().next().cloned())
        .ok_or_else(|| AdapterError::msg(format!("no result for {sql}")))
}

async fn fetch(conn: &mut Conn, sql: &str) -> Result<Vec<Vec<Option<String>>>, AdapterError> {
    let rows: Vec<Row> = conn
        .query(sql)
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    Ok(rows
        .iter()
        .map(|row| {
            (0..row.columns_ref().len())
                .map(|i| row.get::<Value, _>(i).as_ref().and_then(cell_string))
                .collect()
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_and_routine_key_and_enum() {
        assert_eq!(parse_version("8.4.7"), Some(80407));
        assert_eq!(
            parse_routine_key("shop.function.role_rank").unwrap().2,
            "role_rank"
        );
        assert!(parse_routine_key("shop.role_rank").is_none());
        assert_eq!(
            enum_values("enum('admin','staff')").unwrap(),
            vec!["admin", "staff"]
        );
    }

    #[test]
    fn body_keeps_begin_and_return() {
        assert!(routine_body("CREATE FUNCTION f() RETURNS INT RETURN 1").starts_with("RETURN"));
        assert!(routine_body("CREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\nEND").starts_with("BEGIN"));
    }
}
