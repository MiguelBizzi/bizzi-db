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
                if rows.len() >= cap {
                    truncated = true;
                    continue;
                }
                rows.push(simple_row_to_object(&row, &columns));
            }
            SimpleQueryMessage::CommandComplete(count) => {
                affected_rows = affected_rows.saturating_add(count);
            }
            _ => {}
        }
    }

    if affected_rows == 0 {
        affected_rows = rows.len() as u64;
    }

    SimpleResult {
        columns,
        rows,
        affected_rows,
        truncated,
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
        return json!(n);
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
        assert_eq!(coerce_text("42"), json!(42));
        assert_eq!(coerce_text("3.14"), json!(3.14));
        assert_eq!(coerce_text("hello"), json!("hello"));
    }
}
