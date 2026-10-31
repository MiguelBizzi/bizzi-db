//! Catalog queries for indexes and routines, and the mapping of their rows.

use db_core::{
    IndexConstraint, IndexConstraintKind, IndexDefinition, IndexKey, IndexStorageParam,
    ParameterMode, RoutineDefinition, RoutineKind, RoutineParameter,
};

/// `indnullsnotdistinct` exists from PostgreSQL 15.
const PG15: i32 = 150_000;
/// `prosqlbody` (SQL-standard bodies) exists from PostgreSQL 14.
const PG14: i32 = 140_000;

/// One row per index on a user table, partitioned table or materialized view.
/// Arrays are indexed by key position; `indkey`/`indoption` are 0-based vectors.
pub(crate) fn index_query(server_version_num: i32) -> String {
    let nulls_not_distinct = if server_version_num >= PG15 {
        "ix.indnullsnotdistinct"
    } else {
        "false"
    };
    format!(
        r#"
        SELECT
          n.nspname::text,
          t.relname::text,
          i.relname::text,
          ix.indisunique,
          ix.indisprimary,
          ix.indisvalid,
          COALESCE(am.amname::text, 'btree'),
          pg_get_indexdef(ix.indexrelid)::text,
          ix.indnkeyatts::int,
          ARRAY(
            SELECT CASE WHEN ix.indkey[k] = 0 THEN NULL ELSE a.attname::text END
            FROM generate_series(0, ix.indnatts - 1) AS k
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[k]
            ORDER BY k
          ) AS key_columns,
          ARRAY(
            SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)::text
            FROM generate_series(0, ix.indnatts - 1) AS k
            ORDER BY k
          ) AS key_exprs,
          ARRAY(
            SELECT ix.indoption[k]::int
            FROM generate_series(0, ix.indnkeyatts - 1) AS k
            ORDER BY k
          ) AS key_options,
          ARRAY(
            SELECT CASE WHEN opc.opcdefault THEN NULL ELSE opc.opcname::text END
            FROM generate_series(0, ix.indnkeyatts - 1) AS k
            LEFT JOIN pg_opclass opc ON opc.oid = ix.indclass[k]
            ORDER BY k
          ) AS key_opclasses,
          ARRAY(
            SELECT CASE
              WHEN ix.indcollation[k] = 0 THEN NULL
              WHEN ix.indkey[k] <> 0 AND ix.indcollation[k] = a.attcollation THEN NULL
              WHEN ix.indkey[k] = 0 AND ix.indcollation[k] = 100 THEN NULL
              ELSE quote_ident(coll.collname)
            END
            FROM generate_series(0, ix.indnkeyatts - 1) AS k
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[k]
            LEFT JOIN pg_collation coll ON coll.oid = ix.indcollation[k]
            ORDER BY k
          ) AS key_collations,
          pg_get_expr(ix.indpred, ix.indrelid)::text,
          con.conname::text,
          con.contype::text,
          COALESCE(i.reloptions::text[], ARRAY[]::text[]),
          ts.spcname::text,
          pg_relation_size(i.oid)::bigint,
          st.idx_scan::bigint,
          {nulls_not_distinct}
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        LEFT JOIN pg_am am ON am.oid = i.relam
        LEFT JOIN pg_constraint con
          ON con.conindid = ix.indexrelid
          AND con.conrelid = ix.indrelid
          AND con.contype IN ('p', 'u', 'x')
        LEFT JOIN pg_tablespace ts ON ts.oid = i.reltablespace
        LEFT JOIN pg_stat_all_indexes st ON st.indexrelid = ix.indexrelid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND t.relkind IN ('r', 'p', 'm')
        ORDER BY n.nspname, t.relname, ix.indisprimary DESC, i.relname
        "#
    )
}

/// Functions and procedures outside system schemas, minus extension members.
pub(crate) fn routine_query(server_version_num: i32) -> String {
    let has_sql_body = if server_version_num >= PG14 {
        "p.prosqlbody IS NOT NULL"
    } else {
        "false"
    };
    format!(
        r#"
        SELECT
          p.oid::text,
          n.nspname::text,
          p.proname::text,
          p.prokind::text,
          pg_get_function_identity_arguments(p.oid)::text,
          CASE WHEN p.prokind = 'p' THEN NULL ELSE pg_get_function_result(p.oid)::text END,
          p.proretset,
          l.lanname::text,
          p.provolatile::text,
          p.proisstrict,
          p.prosecdef,
          p.proparallel::text,
          p.proleakproof,
          p.procost::float8,
          p.prorows::float8,
          {has_sql_body},
          obj_description(p.oid, 'pg_proc')::text,
          pg_get_userbyid(p.proowner)::text,
          COALESCE(p.proargnames, ARRAY[]::text[]),
          COALESCE(p.proargmodes::text[], ARRAY[]::text[]),
          ARRAY(
            SELECT format_type(u.t, NULL)::text
            FROM unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[]))
              WITH ORDINALITY AS u(t, o)
            ORDER BY u.o
          ),
          ARRAY(
            SELECT pg_get_function_arg_default(p.oid, o::int)::text
            FROM generate_series(1, COALESCE(array_length(p.proallargtypes, 1), p.pronargs)) AS o
            ORDER BY o
          )
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND n.nspname NOT LIKE 'pg_temp%'
          AND n.nspname NOT LIKE 'pg_toast_temp%'
          AND p.prokind IN ('f', 'p')
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
          )
        ORDER BY n.nspname, p.proname, 5
        "#
    )
}

pub(crate) const LANGUAGE_QUERY: &str = r#"
SELECT lanname::text FROM pg_language
WHERE lanispl OR lanname = 'sql'
ORDER BY lanname
"#;

pub(crate) const ROUTINE_SOURCE_QUERY: &str = r#"
SELECT pg_get_functiondef(p.oid)::text, COALESCE(p.prosrc, '')::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.oid = $1::text::oid AND n.nspname = $2::text
"#;

/// `indoption` bit 0 is DESC, bit 1 is NULLS FIRST. Null order is only
/// reported when it differs from the default (LAST for ASC, FIRST for DESC).
pub(crate) fn key_order(option: i32) -> (bool, Option<bool>) {
    let descending = option & 1 != 0;
    let nulls_first = option & 2 != 0;
    (
        descending,
        if nulls_first == descending {
            None
        } else {
            Some(nulls_first)
        },
    )
}

pub(crate) fn constraint_kind(code: &str) -> Option<IndexConstraintKind> {
    match code {
        "p" => Some(IndexConstraintKind::Primary),
        "u" => Some(IndexConstraintKind::Unique),
        "x" => Some(IndexConstraintKind::Exclusion),
        _ => None,
    }
}

/// `{fillfactor=70}` → name/value pairs. A value may itself contain `=`.
pub(crate) fn storage_params(reloptions: &[String]) -> Vec<IndexStorageParam> {
    reloptions
        .iter()
        .filter_map(|option| {
            let (name, value) = option.split_once('=')?;
            Some(IndexStorageParam {
                name: name.to_string(),
                value: value.to_string(),
            })
        })
        .collect()
}

pub(crate) struct IndexRow {
    pub schema: String,
    pub table: String,
    pub index: IndexDefinition,
}

/// `None` for an index dropped while the catalog was being read.
pub(crate) fn index_from_row(row: &tokio_postgres::Row) -> Option<IndexRow> {
    let definition: String = row.get::<_, Option<String>>(7)?;
    let key_count = row.get::<_, i32>(8).max(0) as usize;
    let key_columns: Vec<Option<String>> = row.get(9);
    let key_exprs: Vec<Option<String>> = row.get(10);
    let key_options: Vec<i32> = row.get(11);
    let key_opclasses: Vec<Option<String>> = row.get(12);
    let key_collations: Vec<Option<String>> = row.get(13);
    let constraint_name: Option<String> = row.get(15);
    let constraint_code: Option<String> = row.get(16);
    let reloptions: Vec<String> = row.get(17);

    let mut keys = Vec::new();
    let mut columns = Vec::new();
    let mut include_columns = Vec::new();
    for (position, column) in key_columns.iter().enumerate() {
        if position >= key_count {
            // INCLUDE entries are always plain columns.
            if let Some(column) = column {
                include_columns.push(column.clone());
            }
            continue;
        }
        let (descending, nulls_first) = key_order(key_options.get(position).copied().unwrap_or(0));
        let is_expression = column.is_none();
        if let Some(column) = column {
            columns.push(column.clone());
        }
        keys.push(IndexKey {
            expression: column.clone().unwrap_or_else(|| {
                key_exprs
                    .get(position)
                    .cloned()
                    .flatten()
                    .unwrap_or_default()
            }),
            is_expression,
            descending,
            nulls_first,
            opclass: key_opclasses.get(position).cloned().flatten(),
            collation: key_collations.get(position).cloned().flatten(),
        });
    }

    let constraint = match (
        constraint_name,
        constraint_code.as_deref().and_then(constraint_kind),
    ) {
        (Some(name), Some(kind)) => Some(IndexConstraint { name, kind }),
        _ => None,
    };

    Some(IndexRow {
        schema: row.get(0),
        table: row.get(1),
        index: IndexDefinition {
            name: row.get(2),
            columns,
            is_unique: row.get(3),
            index_type: row.get::<_, String>(6).to_uppercase(),
            keys,
            include_columns,
            predicate: row.get(14),
            definition: Some(definition),
            is_primary: row.get(4),
            constraint,
            is_valid: row.get(5),
            nulls_not_distinct: row.get(21),
            storage_params: storage_params(&reloptions),
            tablespace: row.get(18),
            size_bytes: row.get(19),
            scans: row.get(20),
        },
    })
}

fn parameter_mode(code: &str) -> ParameterMode {
    match code {
        "o" => ParameterMode::Out,
        "b" => ParameterMode::InOut,
        "v" => ParameterMode::Variadic,
        "t" => ParameterMode::Table,
        _ => ParameterMode::In,
    }
}

pub(crate) fn volatility(code: &str) -> &'static str {
    match code {
        "i" => "immutable",
        "s" => "stable",
        _ => "volatile",
    }
}

pub(crate) fn parallel_mode(code: &str) -> &'static str {
    match code {
        "s" => "safe",
        "r" => "restricted",
        _ => "unsafe",
    }
}

/// Zips the per-argument catalog arrays. `proargmodes` is empty when every
/// argument is IN, and `proargnames` is empty when none are named.
pub(crate) fn parameters(
    names: &[String],
    modes: &[String],
    types: &[String],
    defaults: &[Option<String>],
) -> Vec<RoutineParameter> {
    types
        .iter()
        .enumerate()
        .map(|(position, data_type)| RoutineParameter {
            name: names.get(position).cloned().unwrap_or_default(),
            data_type: data_type.clone(),
            mode: modes
                .get(position)
                .map(|code| parameter_mode(code))
                .unwrap_or(ParameterMode::In),
            default: defaults.get(position).cloned().flatten(),
        })
        .collect()
}

/// `None` for a routine dropped while the catalog was being read: its
/// `pg_get_function_*` calls return NULL.
pub(crate) fn routine_from_row(row: &tokio_postgres::Row) -> Option<RoutineDefinition> {
    let schema: String = row.get(1);
    let name: String = row.get(2);
    let identity_arguments: String = row.get::<_, Option<String>>(4)?;
    let kind: String = row.get(3);
    let names: Vec<String> = row.get(18);
    let modes: Vec<String> = row.get(19);
    let types: Vec<String> = row.get(20);
    let defaults: Vec<Option<String>> = row.get(21);
    let comment: Option<String> = row.get(16);
    let returns_set: bool = row.get(6);
    Some(RoutineDefinition {
        id: format!("{schema}.{name}({identity_arguments})"),
        oid: row.get(0),
        schema,
        name,
        kind: if kind == "p" {
            RoutineKind::Procedure
        } else {
            RoutineKind::Function
        },
        identity_arguments,
        parameters: parameters(&names, &modes, &types, &defaults),
        return_type: row.get(5),
        returns_set,
        language: row.get(7),
        volatility: volatility(&row.get::<_, String>(8)).to_string(),
        is_strict: row.get(9),
        security_definer: row.get(10),
        parallel: Some(parallel_mode(&row.get::<_, String>(11)).to_string()),
        leakproof: Some(row.get(12)),
        cost: Some(row.get(13)),
        rows: if returns_set { Some(row.get(14)) } else { None },
        has_sql_body: row.get(15),
        comment: comment.filter(|c| !c.is_empty()),
        owner: row.get(17),
        data_access: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_order_reports_only_non_default_null_order() {
        assert_eq!(key_order(0), (false, None));
        assert_eq!(key_order(1 | 2), (true, None));
        assert_eq!(key_order(2), (false, Some(true)));
        assert_eq!(key_order(1), (true, Some(false)));
    }

    #[test]
    fn maps_constraint_codes() {
        assert_eq!(constraint_kind("p"), Some(IndexConstraintKind::Primary));
        assert_eq!(constraint_kind("u"), Some(IndexConstraintKind::Unique));
        assert_eq!(constraint_kind("x"), Some(IndexConstraintKind::Exclusion));
        assert_eq!(constraint_kind("f"), None);
    }

    #[test]
    fn splits_storage_params_on_first_equals() {
        let params = storage_params(&["fillfactor=70".into(), "odd=a=b".into(), "junk".into()]);
        assert_eq!(params.len(), 2);
        assert_eq!(params[0].name, "fillfactor");
        assert_eq!(params[0].value, "70");
        assert_eq!(params[1].value, "a=b");
    }

    #[test]
    fn zips_parameters_with_implicit_in_mode() {
        let params = parameters(
            &["a".into(), "b".into()],
            &[],
            &["integer".into(), "text".into()],
            &[None, Some("'x'::text".into())],
        );
        assert_eq!(params[0].mode, ParameterMode::In);
        assert_eq!(params[1].default.as_deref(), Some("'x'::text"));

        let params = parameters(
            &[],
            &["i".into(), "o".into(), "t".into()],
            &["int".into(), "int".into(), "text".into()],
            &[],
        );
        assert_eq!(params[0].name, "");
        assert_eq!(params[1].mode, ParameterMode::Out);
        assert_eq!(params[2].mode, ParameterMode::Table);
    }

    #[test]
    fn version_guards_new_catalog_columns() {
        assert!(index_query(160_000).contains("ix.indnullsnotdistinct"));
        assert!(!index_query(140_000).contains("indnullsnotdistinct"));
        assert!(routine_query(140_000).contains("prosqlbody"));
        assert!(!routine_query(130_000).contains("prosqlbody"));
    }

    #[test]
    fn routine_query_skips_aggregates_and_extension_members() {
        let sql = routine_query(160_000);
        assert!(sql.contains("p.prokind IN ('f', 'p')"));
        assert!(sql.contains("d.deptype = 'e'"));
    }
}
