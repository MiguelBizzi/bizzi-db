use serde_json::{json, Map, Value};
use tokio_postgres::{SimpleQueryMessage, SimpleQueryRow};

pub struct SimpleResult {
    pub columns: Vec<String>,
    pub rows: Vec<Value>,
    pub affected_rows: u64,
    pub truncated: bool,
}

pub fn collect_simple(messages: Vec<SimpleQueryMessage>, cap: usize) -> SimpleResult {
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    let mut affected_rows = 0u64;
    let mut truncated = false;

    for message in messages {
        match message {
            SimpleQueryMessage::Row(row) => {
                if columns.is_empty() {
                    columns = column_names(&row);
                }
                if take_capped(&mut rows, simple_row_to_object(&row, &columns), cap) {
                    truncated = true;
                }
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
        truncated,
    }
}

fn take_capped<T>(rows: &mut Vec<T>, item: T, cap: usize) -> bool {
    if rows.len() >= cap {
        return true;
    }
    rows.push(item);
    false
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

fn simple_row_to_object(row: &SimpleQueryRow, columns: &[String]) -> Value {
    let mut map = Map::new();
    for (i, name) in columns.iter().enumerate() {
        map.insert(name.clone(), simple_cell(row.get(i)));
    }
    Value::Object(map)
}

fn simple_cell(raw: Option<&str>) -> Value {
    match raw {
        None => Value::Null,
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
        assert_eq!(simple_cell(None), json!(null));
    }

    #[test]
    fn take_capped_and_affected_rows() {
        let mut rows = Vec::new();
        assert!(!take_capped(&mut rows, 1, 2));
        assert!(!take_capped(&mut rows, 2, 2));
        assert!(take_capped(&mut rows, 3, 2));
        assert_eq!(rows, vec![1, 2]);
        assert_eq!(finalize_affected(0, 4), 4);
        assert_eq!(finalize_affected(9, 4), 9);
    }
}
