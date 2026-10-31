use db_core::{FilterOperator, TableFilter};
use mysql_async::Value;

use crate::sql::MySqlSql;
use db_core::SqlDialect;

pub struct FilterSql {
    pub clause: String,
    pub params: Vec<Value>,
}

/// `WHERE` for a table preview. Values are bind parameters.
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

fn condition(filter: &TableFilter, params: &mut Vec<Value>) -> Option<String> {
    let column = MySqlSql.quote_ident(&filter.column);
    let value = filter.value.as_str();
    match filter.operator {
        FilterOperator::IsNull => return Some(format!("{column} IS NULL")),
        FilterOperator::IsNotNull => return Some(format!("{column} IS NOT NULL")),
        _ => {}
    }
    if value.is_empty() {
        return None;
    }
    let compare = |op: &str, params: &mut Vec<Value>| {
        params.push(Value::Bytes(value.as_bytes().to_vec()));
        format!("{column} {op} ?")
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
            let marks = vec!["?"; items.len()].join(", ");
            for item in items {
                params.push(Value::Bytes(item.as_bytes().to_vec()));
            }
            format!("{column} IN ({marks})")
        }
        FilterOperator::IsNull | FilterOperator::IsNotNull => return None,
    })
}

fn like(column: &str, value: &str, case_insensitive: bool, params: &mut Vec<Value>) -> String {
    let pattern = if value.contains('%') || value.contains('_') {
        value.to_string()
    } else {
        format!("%{value}%")
    };
    params.push(Value::Bytes(pattern.into_bytes()));
    if case_insensitive {
        format!("LOWER(CAST({column} AS CHAR)) LIKE LOWER(?)")
    } else {
        format!("CAST({column} AS CHAR) LIKE ?")
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
    fn ilike_is_a_lowered_like_bind() {
        let sql = where_clause(&[filter("email", FilterOperator::ILike, "user")]);
        assert_eq!(
            sql.clause,
            " WHERE LOWER(CAST(`email` AS CHAR)) LIKE LOWER(?)"
        );
        assert_eq!(sql.params, vec![Value::Bytes(b"%user%".to_vec())]);
    }

    #[test]
    fn comparisons_bind_the_value() {
        let sql = where_clause(&[filter("id", FilterOperator::Eq, "4477")]);
        assert_eq!(sql.clause, " WHERE `id` = ?");
        assert_eq!(sql.params.len(), 1);
    }

    #[test]
    fn in_and_null_checks() {
        let sql = where_clause(&[
            filter("name", FilterOperator::In, "Ada, Grace"),
            filter("role", FilterOperator::IsNull, ""),
        ]);
        assert_eq!(sql.clause, " WHERE `name` IN (?, ?) AND `role` IS NULL");
        assert_eq!(sql.params.len(), 2);
    }
}
