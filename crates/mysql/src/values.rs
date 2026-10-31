use mysql_async::consts::ColumnType;
use mysql_async::{Column, Row, Value};
use serde_json::{json, Map, Value as Json};

/// One cell of a text or binary result, as JSON.
///
/// `DECIMAL` stays a string. Binary and geometry become `\x` hex, the same
/// shape Postgres uses for `bytea`. `JSON` is parsed. `TINYINT` stays a number,
/// including `TINYINT(1)`, which MySQL uses as a boolean but still returns as
/// an integer.
pub fn cell_json(value: &Value, column: Option<&Column>) -> Json {
    let kind = column.map(|c| c.column_type());
    match value {
        Value::NULL => Json::Null,
        Value::Int(n) => json!(n),
        Value::UInt(n) => {
            if *n <= i64::MAX as u64 {
                json!(*n as i64)
            } else {
                json!(n.to_string())
            }
        }
        Value::Float(n) => json!(n),
        Value::Double(n) => json!(n),
        Value::Bytes(bytes) => bytes_json(bytes, kind, column.map(is_binary).unwrap_or(false)),
        Value::Date(year, month, day, hour, minute, second, micros) => {
            if *hour == 0
                && *minute == 0
                && *second == 0
                && *micros == 0
                && kind == Some(ColumnType::MYSQL_TYPE_DATE)
            {
                json!(format!("{year:04}-{month:02}-{day:02}"))
            } else if *micros == 0 {
                json!(format!(
                    "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"
                ))
            } else {
                json!(format!(
                    "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{micros:06}"
                ))
            }
        }
        Value::Time(negative, days, hours, minutes, seconds, micros) => {
            let sign = if *negative { "-" } else { "" };
            let hours = u32::from(*hours) + days * 24;
            json!(format!(
                "{sign}{hours:02}:{minutes:02}:{seconds:02}.{micros:06}"
            ))
        }
    }
}

/// Text columns travel as blob types. Charset 63 is the binary charset, so
/// only that (plus geometry and bit) is hex. `SHOW CREATE` and `TEXT` stay text.
fn is_binary(column: &Column) -> bool {
    column.character_set() == 63
        || matches!(
            column.column_type(),
            ColumnType::MYSQL_TYPE_GEOMETRY | ColumnType::MYSQL_TYPE_BIT
        )
}

fn bytes_json(bytes: &[u8], kind: Option<ColumnType>, binary: bool) -> Json {
    match kind {
        Some(ColumnType::MYSQL_TYPE_JSON) => {
            serde_json::from_slice(bytes).unwrap_or_else(|_| json!(lossy(bytes)))
        }
        Some(
            ColumnType::MYSQL_TYPE_BLOB
            | ColumnType::MYSQL_TYPE_TINY_BLOB
            | ColumnType::MYSQL_TYPE_MEDIUM_BLOB
            | ColumnType::MYSQL_TYPE_LONG_BLOB,
        ) if binary => json!(hex_literal(bytes)),
        Some(ColumnType::MYSQL_TYPE_GEOMETRY | ColumnType::MYSQL_TYPE_BIT) => {
            json!(hex_literal(bytes))
        }
        Some(ColumnType::MYSQL_TYPE_DECIMAL | ColumnType::MYSQL_TYPE_NEWDECIMAL) => {
            json!(lossy(bytes))
        }
        Some(
            ColumnType::MYSQL_TYPE_TINY
            | ColumnType::MYSQL_TYPE_SHORT
            | ColumnType::MYSQL_TYPE_LONG
            | ColumnType::MYSQL_TYPE_LONGLONG
            | ColumnType::MYSQL_TYPE_INT24
            | ColumnType::MYSQL_TYPE_YEAR,
        ) => {
            let text = lossy(bytes);
            text.parse::<i64>()
                .map(|n| json!(n))
                .unwrap_or_else(|_| json!(text))
        }
        _ => coerce_text(&lossy(bytes)),
    }
}

fn hex_literal(bytes: &[u8]) -> String {
    let mut out = String::from("\\x");
    for byte in bytes {
        out.push_str(&format!("{byte:02X}"));
    }
    out
}

fn lossy(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn coerce_text(s: &str) -> Json {
    if let Ok(n) = s.parse::<i64>() {
        if n.to_string() == s {
            return json!(n);
        }
    }
    if let Ok(n) = s.parse::<f64>() {
        if n.is_finite() && (s.contains('.') || s.contains('e') || s.contains('E')) {
            return json!(n);
        }
    }
    json!(s)
}

pub fn row_object(row: &Row) -> Json {
    let mut map = Map::new();
    let columns = row.columns_ref();
    for (i, column) in columns.iter().enumerate() {
        let value = row.get::<Value, _>(i).unwrap_or(Value::NULL);
        map.insert(
            column.name_str().to_string(),
            cell_json(&value, Some(column)),
        );
    }
    Json::Object(map)
}

pub fn cell_string(value: &Value) -> Option<String> {
    match cell_json(value, None) {
        Json::Null => None,
        Json::String(s) => Some(s),
        other => Some(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_stays_a_string_and_tinyint_stays_a_number() {
        assert_eq!(
            bytes_json(b"10.50", Some(ColumnType::MYSQL_TYPE_NEWDECIMAL), false),
            json!("10.50")
        );
        assert_eq!(
            bytes_json(b"1", Some(ColumnType::MYSQL_TYPE_TINY), false),
            json!(1)
        );
    }

    #[test]
    fn json_is_parsed_and_binary_is_hex() {
        assert_eq!(
            bytes_json(br#"{"a":1}"#, Some(ColumnType::MYSQL_TYPE_JSON), false),
            json!({"a": 1})
        );
        assert_eq!(
            bytes_json(&[0xDE, 0xAD], Some(ColumnType::MYSQL_TYPE_BLOB), true),
            json!("\\xDEAD")
        );
        assert_eq!(
            bytes_json(b"CREATE FUNCTION", Some(ColumnType::MYSQL_TYPE_BLOB), false),
            json!("CREATE FUNCTION")
        );
    }
}
