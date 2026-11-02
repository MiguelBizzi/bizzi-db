use std::collections::HashMap;

use crate::driver::SqlClient;
use crate::values::cell_string;
use chrono::Utc;
use db_core::{
    AdapterError, ColumnDefinition, ColumnIdentity, ConnectionStatus, DatabaseDialect,
    DatabaseSchema, ForeignKeyRef, IndexConstraint, IndexConstraintKind, IndexDefinition, IndexKey,
    IndexStorageParam, ParameterMode, RoutineDefinition, RoutineKind, RoutineParameter,
    RoutineSource, TableSchema,
};

/// Schemas that are the engine's, not the user's. `db_*` names are the fixed
/// database roles; they are not places a user table lives.
const USER_SCHEMA: &str =
    "s.name NOT IN (N'sys', N'INFORMATION_SCHEMA', N'guest') AND s.name NOT LIKE N'db[_]%'";

pub async fn introspect(
    client: &mut SqlClient,
    host: &str,
    port: u16,
) -> Result<DatabaseSchema, AdapterError> {
    let version = scalar(
        client,
        "SELECT CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion'))",
    )
    .await
    .unwrap_or_else(|_| "SQL Server".into());
    let name = scalar(client, "SELECT DB_NAME()").await.unwrap_or_default();
    let name = if name.is_empty() {
        host.to_string()
    } else {
        name
    };
    let active_connections = scalar(
        client,
        "BEGIN TRY SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE database_id = DB_ID(); END TRY BEGIN CATCH SELECT 0; END CATCH",
    )
    .await
    .ok()
    .and_then(|value| value.parse().ok())
    .unwrap_or(0);
    let total_size = scalar(
        client,
        "SELECT COALESCE(SUM(CAST(used_page_count AS bigint)) * 8.0 / 1024.0, 0) FROM sys.dm_db_partition_stats",
    )
    .await
    .ok()
    .and_then(|value| value.parse().ok())
    .unwrap_or(0.0);

    let mut tables = tables_from(client).await?;
    let stats = fetch(
        client,
        "SELECT object_id, SUM(CASE WHEN index_id IN (0, 1) THEN CAST(row_count AS bigint) ELSE 0 END), SUM(CAST(used_page_count AS bigint)) * 8192 FROM sys.dm_db_partition_stats GROUP BY object_id",
    )
    .await
    .unwrap_or_default();
    let mut stat_map: HashMap<i64, (i64, i64)> = HashMap::new();
    for row in stats {
        stat_map.insert(number(&row, 0), (number(&row, 1), number(&row, 2)));
    }
    for table in tables.values_mut() {
        if let Some((rows, bytes)) = stat_map.get(&table.object_id) {
            table.row_count = *rows;
            table.size_bytes = *bytes;
        }
    }

    attach_columns(client, &mut tables).await?;
    attach_indexes(client, &mut tables).await?;
    attach_foreign_keys(client, &mut tables).await?;
    let routines = routines_from(client).await?;

    let mut listed: Vec<TableSchema> = tables
        .into_values()
        .map(|table| TableSchema {
            id: format!("{}.{}", table.schema, table.name),
            name: table.name,
            schema: table.schema,
            description: table.description,
            row_count: table.row_count,
            size_mb: table.size_bytes as f64 / (1024.0 * 1024.0),
            tags: Vec::new(),
            columns: table.columns,
            indexes: table.indexes,
            created_at: table.created_at,
            updated_at: table.updated_at,
            is_view: table.is_view.then_some(true),
            view_sql: table.view_sql,
            is_materialized: None,
            sql_security: None,
        })
        .collect();
    listed.sort_by(|a, b| (&a.schema, &a.name).cmp(&(&b.schema, &b.name)));

    Ok(DatabaseSchema {
        id: name.clone(),
        name,
        dialect: DatabaseDialect::SQLServer,
        version: version.clone(),
        connection_host: host.into(),
        connection_port: port,
        environment: db_core::Environment::Development,
        status: ConnectionStatus::Connected,
        tables: listed,
        routines,
        languages: vec!["T-SQL".into()],
        server_version_num: version_num(&version),
        total_size_mb: total_size,
        active_connections,
        queries_per_second: 0.0,
    })
}

pub async fn schema_fingerprint(client: &mut SqlClient) -> Result<String, AdapterError> {
    // Row counts and page sizes are left out, so inserts do not look like DDL.
    scalar(client, &format!(
        "SELECT CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varchar(max), COALESCE(STRING_AGG(CONVERT(varchar(max), h), '') WITHIN GROUP (ORDER BY h), ''))), 2)
         FROM (
           SELECT CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(nvarchar(max), part)), 2) AS h
           FROM (
             SELECT CONCAT(N't|', s.name, N'|', o.name, N'|', o.type) AS part
             FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
             WHERE o.type IN ('U', 'V') AND {USER_SCHEMA}
             UNION ALL
             SELECT CONCAT(N'c|', s.name, N'|', o.name, N'|', c.name, N'|', ty.name, N'|', c.max_length, N'|', c.precision, N'|', c.scale, N'|', c.is_nullable, N'|', c.is_identity, N'|', ISNULL(CONVERT(nvarchar(40), ic.seed_value), N''), N'|', ISNULL(CONVERT(nvarchar(40), ic.increment_value), N''), N'|', ISNULL(dc.definition, N''), N'|', ISNULL(cc.definition, N''), N'|', ISNULL(CONVERT(nchar(1), cc.is_persisted), N''), N'|', ISNULL(c.collation_name, N''))
             FROM sys.columns c
             JOIN sys.objects o ON o.object_id = c.object_id
             JOIN sys.schemas s ON s.schema_id = o.schema_id
             JOIN sys.types ty ON ty.user_type_id = c.user_type_id
             LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
             LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
             LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
             WHERE o.type IN ('U', 'V') AND {USER_SCHEMA}
             UNION ALL
             SELECT CONCAT(N'i|', s.name, N'|', o.name, N'|', i.name, N'|', i.type_desc, N'|', i.is_unique, N'|', i.filter_definition, N'|', col.name, N'|', ic.key_ordinal, N'|', ic.is_descending_key, N'|', ic.is_included_column)
             FROM sys.indexes i
             JOIN sys.objects o ON o.object_id = i.object_id
             JOIN sys.schemas s ON s.schema_id = o.schema_id
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
             JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
             WHERE i.type > 0 AND o.type IN ('U', 'V') AND {USER_SCHEMA}
             UNION ALL
             SELECT CONCAT(N'f|', fk.name, N'|', OBJECT_SCHEMA_NAME(fk.parent_object_id), N'|', OBJECT_NAME(fk.parent_object_id), N'|', COL_NAME(fkc.parent_object_id, fkc.parent_column_id), N'|', OBJECT_SCHEMA_NAME(fk.referenced_object_id), N'|', OBJECT_NAME(fk.referenced_object_id), N'|', COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id), N'|', fk.delete_referential_action_desc)
             FROM sys.foreign_keys fk
             JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
             UNION ALL
             SELECT CONCAT(N'k|', OBJECT_SCHEMA_NAME(cc.parent_object_id), N'|', cc.name, N'|', cc.definition)
             FROM sys.check_constraints cc
             UNION ALL
             SELECT CONCAT(N'r|', s.name, N'|', o.name, N'|', o.type, N'|', ISNULL(m.definition, N''))
             FROM sys.objects o
             JOIN sys.schemas s ON s.schema_id = o.schema_id
             LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
             WHERE o.type IN ('P', 'FN', 'IF', 'TF', 'TR') AND {USER_SCHEMA}
             UNION ALL
             SELECT CONCAT(N'p|', OBJECT_SCHEMA_NAME(p.object_id), N'|', OBJECT_NAME(p.object_id), N'|', p.parameter_id, N'|', p.name, N'|', ty.name, N'|', p.is_output, N'|', p.is_readonly)
             FROM sys.parameters p
             JOIN sys.types ty ON ty.user_type_id = p.user_type_id
             UNION ALL
             SELECT CONCAT(N'y|', SCHEMA_NAME(schema_id), N'|', name, N'|', base_object_name) FROM sys.synonyms
             UNION ALL
             SELECT CONCAT(N'q|', SCHEMA_NAME(schema_id), N'|', name, N'|', CONVERT(nvarchar(40), start_value), N'|', CONVERT(nvarchar(40), increment)) FROM sys.sequences
           ) parts
         ) hashed"
    )).await
}

pub async fn routine_source(
    client: &mut SqlClient,
    oid: &str,
) -> Result<RoutineSource, AdapterError> {
    let object_id: i32 = oid
        .parse()
        .map_err(|_| AdapterError::msg("This routine no longer exists. Refresh the schema."))?;
    let mut query = tiberius::Query::new("SELECT OBJECT_DEFINITION(@P1)");
    query.bind(object_id);
    let stream = query
        .query(client)
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    let rows = stream
        .into_first_result()
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    let definition = rows
        .into_iter()
        .next()
        .and_then(|row| row.into_iter().next())
        .and_then(|data| cell_string(&data))
        .filter(|text| !text.is_empty())
        .ok_or_else(|| AdapterError::msg("This routine no longer exists. Refresh the schema."))?;
    Ok(RoutineSource {
        definition: definition.clone(),
        body: definition,
    })
}

struct TableBuild {
    object_id: i64,
    schema: String,
    name: String,
    is_view: bool,
    description: Option<String>,
    row_count: i64,
    size_bytes: i64,
    created_at: String,
    updated_at: String,
    view_sql: Option<String>,
    columns: Vec<ColumnDefinition>,
    indexes: Vec<IndexDefinition>,
}

async fn tables_from(client: &mut SqlClient) -> Result<HashMap<i64, TableBuild>, AdapterError> {
    let rows = fetch(client, &format!(
        "SELECT o.object_id, s.name, o.name, o.type, CONVERT(varchar(33), o.create_date, 127), CONVERT(varchar(33), o.modify_date, 127), CAST(ep.value AS nvarchar(4000)), m.definition
         FROM sys.objects o
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
         LEFT JOIN sys.extended_properties ep ON ep.class = 1 AND ep.major_id = o.object_id AND ep.minor_id = 0 AND ep.name = N'MS_Description'
         WHERE o.type IN ('U', 'V') AND {USER_SCHEMA}
         ORDER BY s.name, o.name"
    )).await?;
    let mut tables = HashMap::new();
    for row in rows {
        let object_id = number(&row, 0);
        let is_view = text(&row, 3) == "V";
        tables.insert(
            object_id,
            TableBuild {
                object_id,
                schema: text(&row, 1),
                name: text(&row, 2),
                is_view,
                description: cell(&row, 6).map(str::to_string),
                row_count: 0,
                size_bytes: 0,
                created_at: cell(&row, 4)
                    .map(str::to_string)
                    .unwrap_or_else(|| Utc::now().to_rfc3339()),
                updated_at: cell(&row, 5)
                    .map(str::to_string)
                    .unwrap_or_else(|| Utc::now().to_rfc3339()),
                view_sql: is_view.then(|| text(&row, 7)).filter(|sql| !sql.is_empty()),
                columns: Vec::new(),
                indexes: Vec::new(),
            },
        );
    }
    Ok(tables)
}

async fn attach_columns(
    client: &mut SqlClient,
    tables: &mut HashMap<i64, TableBuild>,
) -> Result<(), AdapterError> {
    let rows = fetch(client, &format!(
        "SELECT c.object_id, c.name, ty.name, c.max_length, c.precision, c.scale, CAST(c.is_nullable AS int), CAST(c.is_identity AS int), CONVERT(nvarchar(40), ic.seed_value), CONVERT(nvarchar(40), ic.increment_value), dc.name, dc.definition, cc.definition, CAST(cc.is_persisted AS int), c.collation_name, CAST(ep.value AS nvarchar(4000))
         FROM sys.columns c
         JOIN sys.objects o ON o.object_id = c.object_id
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         JOIN sys.types ty ON ty.user_type_id = c.user_type_id
         LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
         LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
         LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
         LEFT JOIN sys.extended_properties ep ON ep.class = 1 AND ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = N'MS_Description'
         WHERE o.type IN ('U', 'V') AND {USER_SCHEMA}
         ORDER BY c.object_id, c.column_id"
    )).await?;
    for row in rows {
        let Some(table) = tables.get_mut(&number(&row, 0)) else {
            continue;
        };
        let type_name = text(&row, 2);
        let generated = cell(&row, 12).map(str::to_string);
        let persisted = generated
            .as_ref()
            .and(cell(&row, 13))
            .map(|flag| flag == "1");
        table.columns.push(ColumnDefinition {
            name: text(&row, 1),
            data_type: column_type(
                &type_name,
                number(&row, 3),
                number(&row, 4),
                number(&row, 5),
            ),
            is_primary: None,
            is_nullable: Some(flag(&row, 6)),
            is_unique: None,
            default_value: cell(&row, 11).map(unwrap_default),
            comment: cell(&row, 15).map(str::to_string),
            enum_values: None,
            foreign_key: None,
            generated,
            on_update: None,
            identity: flag(&row, 7).then(|| ColumnIdentity {
                seed: integer(cell(&row, 8).unwrap_or("1")),
                increment: integer(cell(&row, 9).unwrap_or("1")),
            }),
            default_constraint: cell(&row, 10).map(str::to_string),
            persisted,
            collation: cell(&row, 14).map(str::to_string),
        });
    }
    Ok(())
}

async fn attach_indexes(
    client: &mut SqlClient,
    tables: &mut HashMap<i64, TableBuild>,
) -> Result<(), AdapterError> {
    let rows = fetch(client, &format!(
        "SELECT i.object_id, i.index_id, i.name, i.type_desc, CAST(i.is_unique AS int), CAST(i.is_primary_key AS int), CAST(i.is_unique_constraint AS int), i.filter_definition, i.fill_factor, CAST(i.is_padded AS int), CAST(i.ignore_dup_key AS int), p.data_compression_desc, col.name, CAST(ic.is_included_column AS int), CAST(ic.is_descending_key AS int)
         FROM sys.indexes i
         JOIN sys.objects o ON o.object_id = i.object_id
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
         LEFT JOIN sys.partitions p ON p.object_id = i.object_id AND p.index_id = i.index_id AND p.partition_number = 1
         WHERE i.type > 0 AND o.type IN ('U', 'V') AND {USER_SCHEMA}
         ORDER BY i.object_id, i.index_id, ic.is_included_column, ic.key_ordinal, ic.index_column_id"
    )).await?;
    let mut current: Option<(i64, i64, IndexDefinition)> = None;
    let flush = |tables: &mut HashMap<i64, TableBuild>,
                 built: Option<(i64, i64, IndexDefinition)>| {
        if let Some((object_id, _, index)) = built {
            if let Some(table) = tables.get_mut(&object_id) {
                if index.is_primary {
                    for column in &mut table.columns {
                        if index.columns.iter().any(|name| name == &column.name) {
                            column.is_primary = Some(true);
                        }
                    }
                }
                if index.is_unique && index.columns.len() == 1 {
                    let only = &index.columns[0];
                    for column in &mut table.columns {
                        if &column.name == only {
                            column.is_unique = Some(true);
                        }
                    }
                }
                table.indexes.push(index);
            }
        }
    };
    for row in rows {
        let object_id = number(&row, 0);
        let index_id = number(&row, 1);
        if current
            .as_ref()
            .is_none_or(|(id, idx, _)| *id != object_id || *idx != index_id)
        {
            flush(tables, current.take());
            current = Some((object_id, index_id, index_shell(&row)));
        }
        let column = text(&row, 12);
        let included = flag(&row, 13);
        let Some((_, _, index)) = current.as_mut() else {
            continue;
        };
        if included {
            index.include_columns.push(column);
        } else {
            index.columns.push(column.clone());
            index.keys.push(IndexKey {
                expression: column,
                is_expression: false,
                descending: flag(&row, 14),
                nulls_first: None,
                opclass: None,
                collation: None,
            });
        }
    }
    flush(tables, current);
    Ok(())
}

fn index_shell(row: &[Option<String>]) -> IndexDefinition {
    let is_primary = flag(row, 5);
    let is_unique = flag(row, 4);
    let name = text(row, 2);
    let mut storage = Vec::new();
    let fill = number(row, 8);
    if fill > 0 {
        storage.push(param("fillfactor", &fill.to_string()));
    }
    if flag(row, 9) {
        storage.push(param("pad_index", "ON"));
    }
    if let Some(compression) = cell(row, 11) {
        if !compression.eq_ignore_ascii_case("NONE") {
            storage.push(param("data_compression", compression));
        }
    }
    if flag(row, 10) {
        storage.push(param("ignore_dup_key", "ON"));
    }
    let constraint = if is_primary {
        Some(IndexConstraint {
            name: name.clone(),
            kind: IndexConstraintKind::Primary,
        })
    } else if flag(row, 6) {
        Some(IndexConstraint {
            name: name.clone(),
            kind: IndexConstraintKind::Unique,
        })
    } else {
        None
    };
    IndexDefinition {
        name,
        columns: Vec::new(),
        is_unique,
        index_type: text(row, 3).to_ascii_lowercase(),
        keys: Vec::new(),
        include_columns: Vec::new(),
        predicate: cell(row, 7).map(str::to_string),
        definition: None,
        is_primary,
        constraint,
        is_valid: true,
        nulls_not_distinct: false,
        storage_params: storage,
        tablespace: None,
        size_bytes: None,
        scans: None,
    }
}

fn param(name: &str, value: &str) -> IndexStorageParam {
    IndexStorageParam {
        name: name.into(),
        value: value.into(),
    }
}

async fn attach_foreign_keys(
    client: &mut SqlClient,
    tables: &mut HashMap<i64, TableBuild>,
) -> Result<(), AdapterError> {
    let rows = fetch(
        client,
        "SELECT fk.parent_object_id, COL_NAME(fkc.parent_object_id, fkc.parent_column_id), OBJECT_SCHEMA_NAME(fk.referenced_object_id), OBJECT_NAME(fk.referenced_object_id), COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id), fk.delete_referential_action_desc, fk.name
         FROM sys.foreign_keys fk
         JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
         ORDER BY fk.object_id, fkc.constraint_column_id",
    )
    .await?;
    for row in rows {
        let Some(table) = tables.get_mut(&number(&row, 0)) else {
            continue;
        };
        let column = text(&row, 1);
        let reference = ForeignKeyRef {
            target_table: text(&row, 3),
            target_column: text(&row, 4),
            target_schema: cell(&row, 2).map(str::to_string),
            on_delete: cell(&row, 5).map(referential_action),
            name: cell(&row, 6).map(str::to_string),
        };
        for definition in &mut table.columns {
            if definition.name == column && definition.foreign_key.is_none() {
                definition.foreign_key = Some(reference);
                break;
            }
        }
    }
    Ok(())
}

async fn routines_from(client: &mut SqlClient) -> Result<Vec<RoutineDefinition>, AdapterError> {
    let params = fetch(client, &format!(
        "SELECT p.object_id, p.parameter_id, p.name, ty.name, p.max_length, p.precision, p.scale, CAST(p.is_output AS int), CAST(p.is_readonly AS int), CONVERT(nvarchar(4000), p.default_value)
         FROM sys.parameters p
         JOIN sys.objects o ON o.object_id = p.object_id
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         JOIN sys.types ty ON ty.user_type_id = p.user_type_id
         WHERE o.type IN ('P', 'FN', 'IF', 'TF') AND {USER_SCHEMA}
         ORDER BY p.object_id, p.parameter_id"
    )).await?;
    let mut by_object: HashMap<i64, Vec<RoutineParameter>> = HashMap::new();
    let mut returns: HashMap<i64, String> = HashMap::new();
    for row in params {
        let object_id = number(&row, 0);
        let data_type = column_type(
            &text(&row, 3),
            number(&row, 4),
            number(&row, 5),
            number(&row, 6),
        );
        if number(&row, 1) == 0 {
            returns.insert(object_id, data_type);
            continue;
        }
        let mode = if flag(&row, 8) {
            ParameterMode::Table
        } else if flag(&row, 7) {
            ParameterMode::Out
        } else {
            ParameterMode::In
        };
        by_object
            .entry(object_id)
            .or_default()
            .push(RoutineParameter {
                name: text(&row, 2),
                data_type,
                mode,
                default: cell(&row, 9).map(str::to_string),
            });
    }
    let rows = fetch(client, &format!(
        "SELECT o.object_id, s.name, o.name, o.type, USER_NAME(m.execute_as_principal_id), CAST(ep.value AS nvarchar(4000)), CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END
         FROM sys.objects o
         JOIN sys.schemas s ON s.schema_id = o.schema_id
         LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
         LEFT JOIN sys.extended_properties ep ON ep.class = 1 AND ep.major_id = o.object_id AND ep.minor_id = 0 AND ep.name = N'MS_Description'
         WHERE o.type IN ('P', 'FN', 'IF', 'TF') AND {USER_SCHEMA}
         ORDER BY s.name, o.name"
    )).await?;
    let mut routines = Vec::new();
    for row in rows {
        let object_id = number(&row, 0);
        let kind_code = text(&row, 3);
        let parameters = by_object.remove(&object_id).unwrap_or_default();
        let identity = parameters
            .iter()
            .map(|param| param.data_type.clone())
            .collect::<Vec<_>>()
            .join(", ");
        let execute_as = cell(&row, 4).map(str::to_string);
        let oid = object_id.to_string();
        routines.push(RoutineDefinition {
            id: format!("{}.{}", text(&row, 1), text(&row, 2)),
            oid: oid.clone(),
            schema: text(&row, 1),
            name: text(&row, 2),
            kind: if kind_code == "P" {
                RoutineKind::Procedure
            } else {
                RoutineKind::Function
            },
            identity_arguments: identity,
            parameters,
            return_type: returns.remove(&object_id),
            returns_set: kind_code == "IF" || kind_code == "TF",
            language: "T-SQL".into(),
            volatility: "volatile".into(),
            is_strict: false,
            security_definer: execute_as.is_some(),
            parallel: None,
            leakproof: None,
            cost: None,
            rows: None,
            has_sql_body: flag(&row, 6),
            comment: cell(&row, 5).map(str::to_string),
            owner: None,
            data_access: None,
            execute_as,
        });
    }
    Ok(routines)
}

fn column_type(name: &str, max_length: i64, precision: i64, scale: i64) -> String {
    let lower = name.to_ascii_lowercase();
    match lower.as_str() {
        "varchar" | "char" | "varbinary" | "binary" => sized(&lower, max_length, 1),
        "nvarchar" | "nchar" => sized(&lower, max_length, 2),
        "decimal" | "numeric" => format!("{lower}({precision},{scale})"),
        "datetime2" | "datetimeoffset" | "time" => format!("{lower}({scale})"),
        "float" if precision > 0 && precision < 53 => format!("float({precision})"),
        "timestamp" => "rowversion".into(),
        _ => lower,
    }
}

fn sized(name: &str, max_length: i64, bytes_per_char: i64) -> String {
    if max_length < 0 {
        format!("{name}(max)")
    } else {
        format!("{name}({})", max_length / bytes_per_char)
    }
}

/// The catalog stores a default already wrapped in parentheses, sometimes twice.
fn unwrap_default(definition: &str) -> String {
    let mut value = definition.trim();
    while let Some(inner) = strip_outer_parens(value) {
        value = inner.trim();
    }
    value.to_string()
}

fn strip_outer_parens(value: &str) -> Option<&str> {
    let mut chars = value.chars();
    if chars.next() != Some('(') || chars.next_back() != Some(')') {
        return None;
    }
    let mut depth = 0i32;
    for (index, ch) in value.chars().enumerate() {
        if ch == '(' {
            depth += 1;
        } else if ch == ')' {
            depth -= 1;
            if depth == 0 && index != value.len() - 1 {
                return None;
            }
        }
    }
    Some(&value[1..value.len() - 1])
}

fn referential_action(value: &str) -> String {
    match value {
        "NO_ACTION" => "NO ACTION".into(),
        "SET_NULL" => "SET NULL".into(),
        "SET_DEFAULT" => "SET DEFAULT".into(),
        "CASCADE" => "CASCADE".into(),
        other => other.replace('_', " "),
    }
}

fn version_num(version: &str) -> Option<i32> {
    version.split('.').next()?.parse().ok()
}

fn cell(row: &[Option<String>], index: usize) -> Option<&str> {
    row.get(index)
        .and_then(|value| value.as_deref())
        .filter(|value| !value.is_empty())
}

fn text(row: &[Option<String>], index: usize) -> String {
    cell(row, index).unwrap_or("").to_string()
}

fn number(row: &[Option<String>], index: usize) -> i64 {
    integer(cell(row, index).unwrap_or("0"))
}

fn integer(value: &str) -> i64 {
    value
        .split('.')
        .next()
        .and_then(|head| head.parse().ok())
        .unwrap_or(0)
}

fn flag(row: &[Option<String>], index: usize) -> bool {
    matches!(cell(row, index), Some("1") | Some("true"))
}

async fn scalar(client: &mut SqlClient, sql: &str) -> Result<String, AdapterError> {
    let rows = fetch(client, sql).await?;
    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.into_iter().flatten().next())
        .unwrap_or_default())
}

async fn fetch(
    client: &mut SqlClient,
    sql: &str,
) -> Result<Vec<Vec<Option<String>>>, AdapterError> {
    let stream = client
        .query(sql, &[])
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    let sets = stream
        .into_results()
        .await
        .map_err(|err| AdapterError::msg(err.to_string()))?;
    let mut rows = Vec::new();
    for set in sets {
        for row in set {
            rows.push(row.into_iter().map(|data| cell_string(&data)).collect());
        }
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn types_use_characters_and_max() {
        assert_eq!(column_type("nvarchar", -1, 0, 0), "nvarchar(max)");
        assert_eq!(column_type("nvarchar", 100, 0, 0), "nvarchar(50)");
        assert_eq!(column_type("varchar", 40, 0, 0), "varchar(40)");
        assert_eq!(column_type("decimal", 0, 10, 2), "decimal(10,2)");
        assert_eq!(column_type("timestamp", 8, 0, 0), "rowversion");
        assert_eq!(column_type("int", 4, 10, 0), "int");
    }

    #[test]
    fn defaults_lose_the_catalog_parentheses() {
        assert_eq!(unwrap_default("((0))"), "0");
        assert_eq!(unwrap_default("(getdate())"), "getdate()");
        assert_eq!(unwrap_default("(N'a(b)')"), "N'a(b)'");
    }

    #[test]
    fn foreign_key_actions_are_words() {
        assert_eq!(referential_action("SET_NULL"), "SET NULL");
        assert_eq!(referential_action("NO_ACTION"), "NO ACTION");
        assert_eq!(referential_action("CASCADE"), "CASCADE");
    }
}
