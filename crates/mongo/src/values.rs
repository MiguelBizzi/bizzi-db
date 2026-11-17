use std::fmt::Write as _;

use db_core::DocValue;
use mongodb::bson::{Bson, Document, JavaScriptCodeWithScope};

use crate::json::{self, Json};

const WRAPPER_KEYS: &[&str] = &[
    "$oid",
    "$symbol",
    "$regularExpression",
    "$numberInt",
    "$numberLong",
    "$numberDouble",
    "$numberDecimal",
    "$binary",
    "$uuid",
    "$code",
    "$timestamp",
    "$date",
    "$minKey",
    "$maxKey",
    "$dbPointer",
    "$undefined",
];

pub fn to_doc_value(b: &Bson) -> DocValue {
    match b {
        Bson::Null => DocValue::Null,
        Bson::Boolean(v) => DocValue::Bool { v: *v },
        Bson::Int32(v) => DocValue::Int32 { v: v.to_string() },
        Bson::Int64(v) => DocValue::Int64 { v: v.to_string() },
        Bson::Double(v) => DocValue::Double { v: double_text(*v) },
        Bson::Decimal128(v) => DocValue::Decimal128 { v: v.to_string() },
        Bson::String(v) => DocValue::String { v: v.clone() },
        Bson::ObjectId(v) => DocValue::ObjectId { v: v.to_hex() },
        Bson::DateTime(v) => {
            let ms = v.timestamp_millis();
            match iso_millis(ms) {
                Some(v) => DocValue::Date { v },
                None => DocValue::Other {
                    ejson: format!(r#"{{"$date": {{"$numberLong": "{ms}"}}}}"#),
                },
            }
        }
        Bson::Binary(v) => DocValue::Binary {
            subtype: u8::from(v.subtype),
            base64: base64(&v.bytes),
        },
        Bson::Timestamp(v) => DocValue::Timestamp {
            seconds: v.time,
            increment: v.increment,
        },
        Bson::RegularExpression(v) => DocValue::Regex {
            pattern: v.pattern.clone(),
            options: v.options.clone(),
        },
        Bson::Document(d) => DocValue::Object {
            entries: d
                .iter()
                .map(|(k, v)| (k.clone(), to_doc_value(v)))
                .collect(),
        },
        Bson::Array(items) => DocValue::Array {
            items: items.iter().map(to_doc_value).collect(),
        },
        Bson::MinKey => DocValue::MinKey,
        Bson::MaxKey => DocValue::MaxKey,
        Bson::Undefined => DocValue::Undefined,
        Bson::JavaScriptCode(code) => {
            let mut ejson = String::from(r#"{"$code": "#);
            write_string(&mut ejson, code);
            ejson.push('}');
            DocValue::Other { ejson }
        }
        Bson::JavaScriptCodeWithScope(JavaScriptCodeWithScope { code, scope }) => {
            let mut ejson = String::from(r#"{"$code": "#);
            write_string(&mut ejson, code);
            ejson.push_str(r#", "$scope": "#);
            write_inline(&mut ejson, &to_doc_value(&Bson::Document(scope.clone())));
            ejson.push('}');
            DocValue::Other { ejson }
        }
        Bson::Symbol(symbol) => {
            let mut ejson = String::from(r#"{"$symbol": "#);
            write_string(&mut ejson, symbol);
            ejson.push('}');
            DocValue::Other { ejson }
        }
        // The driver keeps DbPointer's fields private; its extended JSON is the only accessor.
        Bson::DbPointer(_) => {
            let value = b.clone().into_relaxed_extjson();
            let pointer = &value["$dbPointer"];
            let mut ejson = String::from(r#"{"$dbPointer": {"$ref": "#);
            write_string(&mut ejson, pointer["$ref"].as_str().unwrap_or_default());
            ejson.push_str(r#", "$id": {"$oid": "#);
            write_string(
                &mut ejson,
                pointer["$id"]["$oid"].as_str().unwrap_or_default(),
            );
            ejson.push_str("}}}");
            DocValue::Other { ejson }
        }
    }
}

/// Two-space indentation, one key or item per line. Values with no plain JSON
/// form print as one-line Extended JSON wrappers.
pub fn format_editable(v: &DocValue) -> String {
    let mut out = String::new();
    write_pretty(&mut out, v, 0);
    out
}

pub fn parse_editable(text: &str) -> Result<Document, String> {
    match parse_editable_value(text)? {
        Bson::Document(doc) => Ok(doc),
        _ => Err("expected a document such as { \"field\": value }".into()),
    }
}

pub fn parse_editable_value(text: &str) -> Result<Bson, String> {
    to_bson(json::parse(text)?)
}

fn to_bson(value: Json) -> Result<Bson, String> {
    Ok(match value {
        Json::Null => Bson::Null,
        Json::Bool(v) => Bson::Boolean(v),
        Json::Number(text) => number(&text)?,
        Json::String(v) => Bson::String(v),
        Json::Array(items) => {
            Bson::Array(items.into_iter().map(to_bson).collect::<Result<_, _>>()?)
        }
        Json::Object(entries) => object(entries)?,
    })
}

fn number(text: &str) -> Result<Bson, String> {
    if text.contains(['.', 'e', 'E']) {
        let v: f64 = text
            .parse()
            .map_err(|_| format!("{text} is not a valid number"))?;
        if !v.is_finite() {
            return Err(format!(
                "{text} is out of range for a double; use {{\"$numberDouble\": \"Infinity\"}}"
            ));
        }
        return Ok(Bson::Double(v));
    }
    let v: i64 = text.parse().map_err(|_| {
        format!(
            "{text} is out of range for a 64-bit integer; use {{\"$numberDecimal\": \"{text}\"}}"
        )
    })?;
    Ok(match i32::try_from(v) {
        Ok(small) => Bson::Int32(small),
        Err(_) => Bson::Int64(v),
    })
}

fn object(entries: Vec<(String, Json)>) -> Result<Bson, String> {
    let keys: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).collect();
    if keys == ["$code", "$scope"] {
        let mut it = entries.into_iter();
        let (_, code) = it.next().expect("two entries");
        let (_, scope) = it.next().expect("two entries");
        let Json::String(code) = code else {
            return Err("\"$code\" must be a string".into());
        };
        let Bson::Document(scope) = to_bson(scope)? else {
            return Err("\"$scope\" must be a document".into());
        };
        return Ok(Bson::JavaScriptCodeWithScope(JavaScriptCodeWithScope {
            code,
            scope,
        }));
    }
    if let [key] = keys.as_slice() {
        if WRAPPER_KEYS.contains(key) {
            let key = key.to_string();
            // Wrapper payloads are small fixed shapes, so serde_json's sorted maps lose nothing.
            let value = to_serde(Json::Object(entries))?;
            return Bson::try_from(value).map_err(|e| format!("{key}: {e}"));
        }
    }
    let mut doc = Document::new();
    for (k, v) in entries {
        doc.insert(k, to_bson(v)?);
    }
    Ok(Bson::Document(doc))
}

fn to_serde(value: Json) -> Result<serde_json::Value, String> {
    use serde_json::Value;
    Ok(match value {
        Json::Null => Value::Null,
        Json::Bool(v) => Value::Bool(v),
        Json::Number(text) => Value::Number(
            text.parse()
                .map_err(|_| format!("{text} is not a valid number"))?,
        ),
        Json::String(v) => Value::String(v),
        Json::Array(items) => {
            Value::Array(items.into_iter().map(to_serde).collect::<Result<_, _>>()?)
        }
        Json::Object(entries) => Value::Object(
            entries
                .into_iter()
                .map(|(k, v)| Ok((k, to_serde(v)?)))
                .collect::<Result<_, String>>()?,
        ),
    })
}

fn write_pretty(out: &mut String, v: &DocValue, depth: usize) {
    match v {
        DocValue::Object { entries } if !entries.is_empty() => {
            out.push('{');
            for (i, (k, val)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline(out, depth + 1);
                write_string(out, k);
                out.push_str(": ");
                write_pretty(out, val, depth + 1);
            }
            newline(out, depth);
            out.push('}');
        }
        DocValue::Array { items } if !items.is_empty() => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline(out, depth + 1);
                write_pretty(out, item, depth + 1);
            }
            newline(out, depth);
            out.push(']');
        }
        _ => write_inline(out, v),
    }
}

fn newline(out: &mut String, depth: usize) {
    out.push('\n');
    for _ in 0..depth {
        out.push_str("  ");
    }
}

fn write_inline(out: &mut String, v: &DocValue) {
    match v {
        DocValue::Null => out.push_str("null"),
        DocValue::Bool { v } => out.push_str(if *v { "true" } else { "false" }),
        DocValue::Int32 { v } => out.push_str(v),
        // Always wrapped: a bare integer that fits in 32 bits reads back as Int32.
        DocValue::Int64 { v } => wrapper(out, "$numberLong", v),
        DocValue::Double { v } => match v.as_str() {
            "NaN" | "Infinity" | "-Infinity" => wrapper(out, "$numberDouble", v),
            _ => out.push_str(v),
        },
        DocValue::Decimal128 { v } => wrapper(out, "$numberDecimal", v),
        DocValue::String { v } => write_string(out, v),
        DocValue::ObjectId { v } => wrapper(out, "$oid", v),
        DocValue::Date { v } => wrapper(out, "$date", v),
        DocValue::Binary { subtype, base64 } => {
            out.push_str(r#"{"$binary": {"base64": "#);
            write_string(out, base64);
            let _ = write!(out, r#", "subType": "{subtype:02x}"}}}}"#);
        }
        DocValue::Timestamp { seconds, increment } => {
            let _ = write!(
                out,
                r#"{{"$timestamp": {{"t": {seconds}, "i": {increment}}}}}"#
            );
        }
        DocValue::Regex { pattern, options } => {
            out.push_str(r#"{"$regularExpression": {"pattern": "#);
            write_string(out, pattern);
            out.push_str(r#", "options": "#);
            write_string(out, options);
            out.push_str("}}");
        }
        DocValue::Object { entries } => {
            out.push('{');
            for (i, (k, val)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_string(out, k);
                out.push_str(": ");
                write_inline(out, val);
            }
            out.push('}');
        }
        DocValue::Array { items } => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_inline(out, item);
            }
            out.push(']');
        }
        DocValue::MinKey => out.push_str(r#"{"$minKey": 1}"#),
        DocValue::MaxKey => out.push_str(r#"{"$maxKey": 1}"#),
        DocValue::Undefined => out.push_str(r#"{"$undefined": true}"#),
        DocValue::Other { ejson } => out.push_str(ejson),
    }
}

fn wrapper(out: &mut String, key: &str, v: &str) {
    out.push_str("{\"");
    out.push_str(key);
    out.push_str("\": ");
    write_string(out, v);
    out.push('}');
}

/// Escapes exactly what `JSON.stringify` escapes, so the TypeScript formatter matches byte for byte.
fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if c < ' ' => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// `{:?}` is Rust's shortest round-trip form and always has a `.` or an exponent.
fn double_text(v: f64) -> String {
    if v.is_nan() {
        "NaN".into()
    } else if v.is_infinite() {
        if v > 0.0 { "Infinity" } else { "-Infinity" }.into()
    } else {
        format!("{v:?}")
    }
}

/// `None` outside years 0–9999, which ISO-8601 strings cannot express with four digits.
fn iso_millis(ms: i64) -> Option<String> {
    let (year, month, day) = civil_from_days(ms.div_euclid(86_400_000));
    if !(0..=9999).contains(&year) {
        return None;
    }
    let t = ms.rem_euclid(86_400_000);
    Some(format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        t / 3_600_000,
        t / 60_000 % 60,
        t / 1000 % 60,
        t % 1000
    ))
}

/// Days since 1970-01-01 to a proleptic Gregorian date (Howard Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, b)| n | u32::from(*b) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[(n >> (18 - 6 * i)) as usize & 63] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::oid::ObjectId;
    use mongodb::bson::{doc, DateTime, JavaScriptCodeWithScope};
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        name: String,
        value: DocValue,
        text: String,
    }

    fn fixture() -> Vec<Case> {
        serde_json::from_str(include_str!("../tests/fixtures/editable.json")).unwrap()
    }

    #[test]
    fn fixture_to_doc_value_and_text() {
        for case in fixture() {
            assert_eq!(format_editable(&case.value), case.text, "{}", case.name);
        }
    }

    #[test]
    fn fixture_parse_round_trips() {
        for case in fixture() {
            let bson =
                parse_editable_value(&case.text).unwrap_or_else(|e| panic!("{}: {e}", case.name));
            assert_eq!(to_doc_value(&bson), case.value, "{}", case.name);
        }
    }

    #[test]
    fn doc_value_keeps_integer_like_key_order() {
        let doc = parse_editable(r#"{"10": 1, "2": 2}"#).unwrap();
        assert_eq!(doc.keys().collect::<Vec<_>>(), ["10", "2"]);
        let DocValue::Object { entries } = to_doc_value(&Bson::Document(doc)) else {
            panic!("not an object");
        };
        assert_eq!(entries[0].0, "10");
        assert_eq!(entries[1].0, "2");
    }

    #[test]
    fn parse_rejects_trailing_garbage() {
        assert!(parse_editable(r#"{"a": 1} x"#).is_err());
        assert!(parse_editable(r#"{"a": 1}}"#).is_err());
        assert!(parse_editable_value("1 2").is_err());
        assert!(parse_editable("{\"a\": 1}\n  ").is_ok());
    }

    #[test]
    fn parse_editable_requires_an_object() {
        assert!(parse_editable("[1]").is_err());
        assert!(parse_editable("5").is_err());
        assert!(parse_editable(r#"{"$oid": "507f1f77bcf86cd799439011"}"#).is_err());
    }

    #[test]
    fn parse_rejects_malformed_json() {
        for bad in [
            "",
            "{",
            r#"{"a" 1}"#,
            r#"{"a": 1,}"#,
            "[1,]",
            "01",
            "1.",
            ".5",
            "+1",
            "'a'",
            r#""\x""#,
            "\"a\nb\"",
            r#""\ud800""#,
            "nul",
            "{a: 1}",
        ] {
            assert!(parse_editable_value(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn parse_rejects_duplicate_keys() {
        assert!(parse_editable(r#"{"a": 1, "a": 2}"#).is_err());
    }

    #[test]
    fn integers_pick_the_narrowest_type() {
        assert_eq!(
            parse_editable_value("2147483647").unwrap(),
            Bson::Int32(i32::MAX)
        );
        assert_eq!(
            parse_editable_value("2147483648").unwrap(),
            Bson::Int64(2147483648)
        );
        assert_eq!(
            parse_editable_value("-2147483649").unwrap(),
            Bson::Int64(-2147483649)
        );
        assert_eq!(
            parse_editable_value("9223372036854775807").unwrap(),
            Bson::Int64(i64::MAX)
        );
        assert!(parse_editable_value("9223372036854775808").is_err());
        assert_eq!(parse_editable_value("1E5").unwrap(), Bson::Double(100000.0));
        assert_eq!(parse_editable_value("2e0").unwrap(), Bson::Double(2.0));
        assert!(parse_editable_value("1e400").is_err());
    }

    #[test]
    fn unicode_escapes_decode() {
        assert_eq!(
            parse_editable_value(r#""é😀\/""#).unwrap(),
            Bson::String("é😀/".into())
        );
    }

    #[test]
    fn known_wrapper_with_other_keys_is_a_plain_object() {
        let doc = parse_editable(r#"{"x": {"$oid": "507f1f77bcf86cd799439011", "a": 1}}"#).unwrap();
        let inner = doc.get_document("x").unwrap();
        assert_eq!(inner.keys().collect::<Vec<_>>(), ["$oid", "a"]);
    }

    #[test]
    fn invalid_wrapper_payload_is_an_error() {
        assert!(parse_editable_value(r#"{"$numberLong": 5}"#).is_err());
        assert!(parse_editable_value(r#"{"$oid": "nope"}"#).is_err());
    }

    #[test]
    fn bson_values_without_their_own_variant() {
        let oid = ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap();
        let scope = doc! { "y": 1, "x": 2_i64 };
        let code = Bson::JavaScriptCodeWithScope(JavaScriptCodeWithScope {
            code: "x + y".into(),
            scope,
        });
        assert_eq!(
            to_doc_value(&code),
            DocValue::Other {
                ejson: r#"{"$code": "x + y", "$scope": {"y": 1, "x": {"$numberLong": "2"}}}"#
                    .into()
            }
        );
        assert_eq!(
            to_doc_value(&Bson::Double(f64::NAN)),
            DocValue::Double { v: "NaN".into() }
        );
        assert_eq!(
            to_doc_value(&Bson::Double(-f64::NAN)),
            DocValue::Double { v: "NaN".into() }
        );
        assert_eq!(
            to_doc_value(&Bson::DateTime(DateTime::from_millis(253_402_300_800_000))),
            DocValue::Other {
                ejson: r#"{"$date": {"$numberLong": "253402300800000"}}"#.into()
            }
        );
        assert_eq!(
            to_doc_value(&Bson::ObjectId(oid)),
            DocValue::ObjectId { v: oid.to_hex() }
        );
    }

    #[test]
    fn editable_document_round_trips_through_bson() {
        let text = fixture()
            .into_iter()
            .find(|c| c.name == "document")
            .unwrap()
            .text;
        let doc = parse_editable(&text).unwrap();
        assert_eq!(format_editable(&to_doc_value(&Bson::Document(doc))), text);
    }
}
