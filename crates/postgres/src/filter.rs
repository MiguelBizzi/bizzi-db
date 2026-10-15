use db_core::{FilterOperator, TableFilter};

use crate::ident::quote_ident;

/// The `WHERE` clause (with its leading space) for a table's filters, or an
/// empty string when none of them constrains anything. Conditions are ANDed.
///
/// Values are sent as untyped literals so Postgres coerces them to the column's
/// type, which is what makes `id = 4477` mean the same here as in a query.
/// Rules that still need a value but have none are skipped, like blank rows in
/// the filter panel.
pub fn where_clause(filters: &[TableFilter]) -> String {
    let conditions: Vec<String> = filters.iter().filter_map(condition).collect();
    if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    }
}

fn condition(filter: &TableFilter) -> Option<String> {
    let column = quote_ident(&filter.column);
    let value = filter.value.as_str();
    match filter.operator {
        FilterOperator::IsNull => return Some(format!("{column} IS NULL")),
        FilterOperator::IsNotNull => return Some(format!("{column} IS NOT NULL")),
        _ => {}
    }
    if value.is_empty() {
        return None;
    }
    let compare = |op: &str| Some(format!("{column} {op} {}", literal(value)));
    match filter.operator {
        FilterOperator::Eq => compare("="),
        FilterOperator::NotEq => compare("<>"),
        FilterOperator::Gt => compare(">"),
        FilterOperator::Lt => compare("<"),
        FilterOperator::Gte => compare(">="),
        FilterOperator::Lte => compare("<="),
        FilterOperator::Like => Some(format!("{column}::text LIKE {}", like_pattern(value))),
        FilterOperator::ILike => Some(format!("{column}::text ILIKE {}", like_pattern(value))),
        FilterOperator::In => {
            let items: Vec<String> = value
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(literal)
                .collect();
            if items.is_empty() {
                None
            } else {
                Some(format!("{column} IN ({})", items.join(", ")))
            }
        }
        FilterOperator::IsNull | FilterOperator::IsNotNull => None,
    }
}

/// An escape-string literal: valid whatever `standard_conforming_strings` is,
/// and still untyped, so the column decides how it is read.
fn literal(value: &str) -> String {
    format!("E'{}'", value.replace('\\', "\\\\").replace('\'', "''"))
}

/// A value holding `%` or `_` is the pattern as typed, exactly as in a query.
/// Plain text matches anywhere in the value, as the filter panel always has.
fn like_pattern(value: &str) -> String {
    if value.contains('%') || value.contains('_') {
        literal(value)
    } else {
        literal(&format!("%{}%", value.replace('\\', "\\\\")))
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
    fn no_filters_add_no_clause() {
        assert_eq!(where_clause(&[]), "");
    }

    #[test]
    fn equals_sends_an_untyped_literal_so_numeric_columns_match() {
        let clause = where_clause(&[filter("id", FilterOperator::Eq, "4477")]);
        assert_eq!(clause, " WHERE \"id\" = E'4477'");
    }

    #[test]
    fn conditions_are_anded_in_order() {
        let clause = where_clause(&[
            filter("id", FilterOperator::Gte, "10"),
            filter("name", FilterOperator::NotEq, "Ada"),
            filter("role", FilterOperator::IsNull, ""),
        ]);
        assert_eq!(
            clause,
            " WHERE \"id\" >= E'10' AND \"name\" <> E'Ada' AND \"role\" IS NULL"
        );
    }

    #[test]
    fn null_checks_ignore_the_value() {
        let clause = where_clause(&[filter("role", FilterOperator::IsNotNull, "ignored")]);
        assert_eq!(clause, " WHERE \"role\" IS NOT NULL");
    }

    #[test]
    fn rules_without_a_value_are_skipped() {
        let clause = where_clause(&[
            filter("name", FilterOperator::Eq, ""),
            filter("name", FilterOperator::In, " , "),
            filter("id", FilterOperator::Eq, "1"),
        ]);
        assert_eq!(clause, " WHERE \"id\" = E'1'");
    }

    #[test]
    fn in_splits_and_trims_the_list() {
        let clause = where_clause(&[filter("name", FilterOperator::In, "Ada, Grace ,,Alan")]);
        assert_eq!(clause, " WHERE \"name\" IN (E'Ada', E'Grace', E'Alan')");
    }

    #[test]
    fn like_on_plain_text_matches_anywhere_and_casts_the_column() {
        let clause = where_clause(&[filter("id", FilterOperator::Like, "44")]);
        assert_eq!(clause, " WHERE \"id\"::text LIKE E'%44%'");
        let clause = where_clause(&[filter("name", FilterOperator::ILike, "GRACE")]);
        assert_eq!(clause, " WHERE \"name\"::text ILIKE E'%GRACE%'");
    }

    #[test]
    fn like_keeps_a_pattern_the_user_wrote() {
        let clause = where_clause(&[filter("name", FilterOperator::Like, "Ad%")]);
        assert_eq!(clause, " WHERE \"name\"::text LIKE E'Ad%'");
        let clause = where_clause(&[filter("code", FilterOperator::Like, "a_c")]);
        assert_eq!(clause, " WHERE \"code\"::text LIKE E'a_c'");
    }

    #[test]
    fn quotes_columns_and_escapes_values() {
        let clause = where_clause(&[
            filter("we\"ird", FilterOperator::Eq, "O'Brien"),
            filter("path", FilterOperator::Eq, "a\\b"),
        ]);
        assert_eq!(
            clause,
            " WHERE \"we\"\"ird\" = E'O''Brien' AND \"path\" = E'a\\\\b'"
        );
    }

    #[test]
    fn injection_shaped_values_stay_inside_the_literal() {
        let clause = where_clause(&[filter("name", FilterOperator::Eq, "x' OR '1'='1")]);
        assert_eq!(clause, " WHERE \"name\" = E'x'' OR ''1''=''1'");
        let clause = where_clause(&[filter("name", FilterOperator::Eq, "\\' OR 1=1 --")]);
        assert_eq!(clause, " WHERE \"name\" = E'\\\\'' OR 1=1 --'");
    }
}
