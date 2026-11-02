use db_core::{FilterOperator, SqlDialect, TableFilter};

use crate::sql::TSqlSql;

pub struct FilterSql {
    pub clause: String,
    pub params: Vec<String>,
}

/// `WHERE` for a table preview. Values are `@P1` binds, numbered from 1.
pub fn where_clause(filters: &[TableFilter]) -> FilterSql {
    let mut params = Vec::new();
    let conditions: Vec<String> = filters
        .iter()
        .filter_map(|filter| condition(filter, &mut params))
        .collect();
    let clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };
    FilterSql { clause, params }
}

fn condition(filter: &TableFilter, params: &mut Vec<String>) -> Option<String> {
    let column = TSqlSql.quote_ident(&filter.column);
    let value = filter.value.as_str();
    match filter.operator {
        FilterOperator::IsNull => return Some(format!("{column} IS NULL")),
        FilterOperator::IsNotNull => return Some(format!("{column} IS NOT NULL")),
        _ => {}
    }
    if value.is_empty() {
        return None;
    }
    let compare = |op: &str, params: &mut Vec<String>| {
        params.push(value.to_string());
        format!("{column} {op} @P{}", params.len())
    };
    Some(match filter.operator {
        FilterOperator::Eq => compare("=", params),
        FilterOperator::NotEq => compare("<>", params),
        FilterOperator::Gt => compare(">", params),
        FilterOperator::Lt => compare("<", params),
        FilterOperator::Gte => compare(">=", params),
        FilterOperator::Lte => compare("<=", params),
        FilterOperator::Like => like(&column, value, false, params),
        FilterOperator::ILike => like(&column, value, true, params),
        FilterOperator::In => {
            let items: Vec<&str> = value
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .collect();
            if items.is_empty() {
                return None;
            }
            let mut marks = Vec::new();
            for item in items {
                params.push(item.to_string());
                marks.push(format!("@P{}", params.len()));
            }
            format!("{column} IN ({})", marks.join(", "))
        }
        FilterOperator::IsNull | FilterOperator::IsNotNull => return None,
    })
}

fn like(column: &str, value: &str, case_insensitive: bool, params: &mut Vec<String>) -> String {
    let pattern = if value.contains('%') || value.contains('_') {
        value.to_string()
    } else {
        format!("%{value}%")
    };
    params.push(pattern);
    let mark = format!("@P{}", params.len());
    if case_insensitive {
        format!("LOWER(CAST({column} AS NVARCHAR(MAX))) LIKE LOWER({mark})")
    } else {
        format!("CAST({column} AS NVARCHAR(MAX)) LIKE {mark}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filter(column: &str, operator: FilterOperator, value: &str) -> TableFilter {
        TableFilter {
            column: column.into(),
            operator,
            value: value.into(),
        }
    }

    #[test]
    fn ilike_lowers_a_national_cast() {
        let sql = where_clause(&[filter("email", FilterOperator::ILike, "user")]);
        assert_eq!(
            sql.clause,
            " WHERE LOWER(CAST([email] AS NVARCHAR(MAX))) LIKE LOWER(@P1)"
        );
        assert_eq!(sql.params, vec!["%user%".to_string()]);
    }

    #[test]
    fn comparisons_and_in_lists_are_numbered() {
        let sql = where_clause(&[
            filter("id", FilterOperator::Eq, "4477"),
            filter("name", FilterOperator::In, "Ada, Grace"),
            filter("role", FilterOperator::IsNull, ""),
        ]);
        assert_eq!(
            sql.clause,
            " WHERE [id] = @P1 AND [name] IN (@P2, @P3) AND [role] IS NULL"
        );
        assert_eq!(
            sql.params,
            vec!["4477".to_string(), "Ada".into(), "Grace".into()]
        );
    }
}
