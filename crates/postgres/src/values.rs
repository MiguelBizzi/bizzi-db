use serde_json::{json, Map, Value};
use tokio_postgres::{SimpleQueryMessage, SimpleQueryRow};

pub struct SimpleResult {
    pub columns: Vec<String>,
    pub rows: Vec<Value>,
    pub affected_rows: u64,
}

/// `bool_columns[i]` marks result column `i` as a Postgres `bool`, whose text
/// form is `t`/`f` and can't be told apart from a text column by value alone.
pub fn collect_simple(messages: Vec<SimpleQueryMessage>, bool_columns: &[bool]) -> SimpleResult {
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    let mut affected_rows = 0u64;

    for message in messages {
        match message {
            SimpleQueryMessage::Row(row) => {
                if columns.is_empty() {
                    columns = column_names(&row);
                }
                rows.push(simple_row_to_object(&row, &columns, bool_columns));
            }
            SimpleQueryMessage::CommandComplete(count) => {
                affected_rows = affected_rows.saturating_add(count);
            }
            _ => {}
        }
    }

    let affected_rows = finalize_affected(affected_rows, rows.len());
    SimpleResult {
        columns,
        rows,
        affected_rows,
    }
}

/// The single number a `SELECT COUNT(*)` returned.
pub fn first_count(messages: &[SimpleQueryMessage]) -> Option<u64> {
    messages.iter().find_map(|message| match message {
        SimpleQueryMessage::Row(row) => row.get(0)?.parse().ok(),
        _ => None,
    })
}

fn finalize_affected(affected: u64, row_count: usize) -> u64 {
    if affected == 0 {
        row_count as u64
    } else {
        affected
    }
}

fn column_names(row: &SimpleQueryRow) -> Vec<String> {
    (0..row.columns().len())
        .filter_map(|i| row.columns().get(i).map(|c| c.name().to_string()))
        .collect()
}

fn simple_row_to_object(row: &SimpleQueryRow, columns: &[String], bool_columns: &[bool]) -> Value {
    let mut map = Map::new();
    for (i, name) in columns.iter().enumerate() {
        let is_bool = bool_columns.get(i).copied().unwrap_or(false);
        map.insert(name.clone(), simple_cell(row.get(i), is_bool));
    }
    Value::Object(map)
}

fn simple_cell(raw: Option<&str>, is_bool: bool) -> Value {
    match raw {
        None => Value::Null,
        Some("t") if is_bool => json!(true),
        Some("f") if is_bool => json!(false),
        Some(s) => coerce_text(s),
    }
}

fn coerce_text(s: &str) -> Value {
    if s.eq_ignore_ascii_case("true") {
        return json!(true);
    }
    if s.eq_ignore_ascii_case("false") {
        return json!(false);
    }
    if let Ok(n) = s.parse::<i64>() {
        if n.to_string() == s {
            return json!(n);
        }
    }
    if let Ok(n) = s.parse::<f64>() {
        if s.contains('.') || s.contains('e') || s.contains('E') {
            return json!(n);
        }
    }
    json!(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coerces_primitives() {
        assert_eq!(coerce_text("true"), json!(true));
        assert_eq!(coerce_text("FALSE"), json!(false));
        assert_eq!(coerce_text("42"), json!(42));
        assert_eq!(coerce_text("3.14"), json!(3.14));
        assert_eq!(coerce_text("1e3"), json!(1000.0));
        assert_eq!(coerce_text("007"), json!("007"));
        assert_eq!(coerce_text("hello"), json!("hello"));
        assert_eq!(simple_cell(None, false), json!(null));
    }

    #[test]
    fn bool_columns_map_t_and_f() {
        assert_eq!(simple_cell(Some("t"), true), json!(true));
        assert_eq!(simple_cell(Some("f"), true), json!(false));
        assert_eq!(simple_cell(Some("t"), false), json!("t"));
        assert_eq!(simple_cell(Some("f"), false), json!("f"));
    }

    #[test]
    fn finalizes_affected_rows() {
        assert_eq!(finalize_affected(0, 4), 4);
        assert_eq!(finalize_affected(9, 4), 9);
    }
}
