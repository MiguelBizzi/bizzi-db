use std::collections::{BTreeMap, BTreeSet};

use db_core::{FieldSample, FieldSummary};
use mongodb::bson::{Bson, Document};

/// Counts are per document: a path or type seen several times in one document
/// (array elements) counts once.
pub fn summarize(docs: &[Document]) -> FieldSample {
    let mut totals: BTreeMap<String, (u64, BTreeMap<&'static str, u64>)> = BTreeMap::new();
    for doc in docs {
        let mut seen: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
        for (key, value) in doc {
            visit(key.clone(), value, &mut seen);
        }
        for (path, kinds) in seen {
            let (present, types) = totals.entry(path).or_default();
            *present += 1;
            for kind in kinds {
                *types.entry(kind).or_default() += 1;
            }
        }
    }
    let mut fields: Vec<FieldSummary> = totals
        .into_iter()
        .map(|(path, (present_in, types))| {
            let mut types: Vec<(String, u64)> =
                types.into_iter().map(|(t, n)| (t.to_string(), n)).collect();
            types.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            FieldSummary {
                path,
                types,
                present_in,
            }
        })
        .collect();
    fields.sort_by(|a, b| {
        b.present_in
            .cmp(&a.present_in)
            .then_with(|| a.path.cmp(&b.path))
    });
    FieldSample {
        sampled: docs.len() as u64,
        fields,
    }
}

fn visit(path: String, value: &Bson, seen: &mut BTreeMap<String, BTreeSet<&'static str>>) {
    match value {
        Bson::Document(doc) => {
            for (key, child) in doc {
                visit(format!("{path}.{key}"), child, seen);
            }
        }
        Bson::Array(items) => {
            for item in items {
                visit(format!("{path}[]"), item, seen);
            }
        }
        _ => {}
    }
    seen.entry(path).or_default().insert(type_name(value));
}

/// The `$type` aliases MongoDB uses.
fn type_name(value: &Bson) -> &'static str {
    match value {
        Bson::Double(_) => "double",
        Bson::String(_) => "string",
        Bson::Document(_) => "object",
        Bson::Array(_) => "array",
        Bson::Binary(_) => "binData",
        Bson::Undefined => "undefined",
        Bson::ObjectId(_) => "objectId",
        Bson::Boolean(_) => "bool",
        Bson::DateTime(_) => "date",
        Bson::Null => "null",
        Bson::RegularExpression(_) => "regex",
        Bson::DbPointer(_) => "dbPointer",
        Bson::JavaScriptCode(_) => "javascript",
        Bson::Symbol(_) => "symbol",
        Bson::JavaScriptCodeWithScope(_) => "javascriptWithScope",
        Bson::Int32(_) => "int",
        Bson::Timestamp(_) => "timestamp",
        Bson::Int64(_) => "long",
        Bson::Decimal128(_) => "decimal",
        Bson::MinKey => "minKey",
        Bson::MaxKey => "maxKey",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::doc;

    fn field<'a>(sample: &'a FieldSample, path: &str) -> &'a FieldSummary {
        sample
            .fields
            .iter()
            .find(|f| f.path == path)
            .unwrap_or_else(|| panic!("{path} missing from {:?}", sample.fields))
    }

    fn types(pairs: &[(&str, u64)]) -> Vec<(String, u64)> {
        pairs.iter().map(|(t, n)| (t.to_string(), *n)).collect()
    }

    #[test]
    fn summarize_nested_and_arrays() {
        let docs = [
            doc! {
                "a": { "b": 1 },
                "tags": ["x", "y", 3_i64],
                "items": [{ "sku": "k" }, { "sku": "m", "qty": 2.5 }],
            },
            doc! { "a": { "b": "s" }, "tags": [] },
        ];
        let sample = summarize(&docs);
        assert_eq!(sample.sampled, 2);

        let a = field(&sample, "a");
        assert_eq!(
            (a.present_in, a.types.clone()),
            (2, types(&[("object", 2)]))
        );
        assert_eq!(
            field(&sample, "a.b").types,
            types(&[("int", 1), ("string", 1)])
        );
        assert_eq!(field(&sample, "tags").types, types(&[("array", 2)]));
        let tag = field(&sample, "tags[]");
        assert_eq!(tag.present_in, 1);
        // Counted once per document, however many elements had the type.
        assert_eq!(tag.types, types(&[("long", 1), ("string", 1)]));
        assert_eq!(field(&sample, "items[]").types, types(&[("object", 1)]));
        assert_eq!(field(&sample, "items[].sku").types, types(&[("string", 1)]));
        assert_eq!(field(&sample, "items[].qty").types, types(&[("double", 1)]));

        let order: Vec<&str> = sample.fields.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            order,
            [
                "a",
                "a.b",
                "tags",
                "items",
                "items[]",
                "items[].qty",
                "items[].sku",
                "tags[]"
            ]
        );
    }

    #[test]
    fn summarize_mixed_types() {
        let docs = [doc! { "age": 31 }, doc! { "age": "thirty-one" }];
        let sample = summarize(&docs);
        assert_eq!(sample.sampled, 2);
        let age = field(&sample, "age");
        assert_eq!(age.present_in, 2);
        assert_eq!(age.types, types(&[("int", 1), ("string", 1)]));
    }

    #[test]
    fn type_names_are_bson_aliases() {
        use mongodb::bson::oid::ObjectId;
        use mongodb::bson::spec::BinarySubtype;
        use mongodb::bson::{Binary, DateTime, Decimal128, Regex, Timestamp};
        let docs = [doc! {
            "oid": ObjectId::new(),
            "date": DateTime::from_millis(0),
            "bool": true,
            "null": Bson::Null,
            "bin": Binary { subtype: BinarySubtype::Generic, bytes: vec![1] },
            "ts": Timestamp { time: 1, increment: 1 },
            "re": Regex { pattern: "a".into(), options: String::new() },
            "dec": "1.5".parse::<Decimal128>().unwrap(),
        }];
        let sample = summarize(&docs);
        for (path, name) in [
            ("oid", "objectId"),
            ("date", "date"),
            ("bool", "bool"),
            ("null", "null"),
            ("bin", "binData"),
            ("ts", "timestamp"),
            ("re", "regex"),
            ("dec", "decimal"),
        ] {
            assert_eq!(field(&sample, path).types, types(&[(name, 1)]), "{path}");
        }
    }
}
