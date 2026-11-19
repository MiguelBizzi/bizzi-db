//! mongosh syntax read as data. There is no JavaScript engine: only literal
//! values, a fixed set of BSON helper calls, and `db.…` command shapes parse.

use std::fmt;

use mongodb::bson::oid::ObjectId;
use mongodb::bson::spec::BinarySubtype;
use mongodb::bson::{
    doc, Binary, Bson, DateTime, Decimal128, Document, JavaScriptCodeWithScope, Regex, Timestamp,
};

use crate::json::{self, Json, JsonError, Reader};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellError {
    pub message: String,
    /// UTF-16 code units from the start of the text, like editor offsets.
    pub offset: usize,
}

impl ShellError {
    fn new(text: &str, err: JsonError) -> Self {
        let at = err.at.min(text.len());
        ShellError {
            message: err.message,
            offset: text.get(..at).map_or(0, |s| s.encode_utf16().count()),
        }
    }

    /// The message with a 1-based line and column (Unicode scalars) in `text`.
    pub fn describe(&self, text: &str) -> String {
        let mut units = 0;
        let at = text
            .char_indices()
            .find(|(_, c)| {
                let reached = units >= self.offset;
                units += c.len_utf16();
                reached
            })
            .map_or(text.len(), |(i, _)| i);
        let (line, column) = json::line_column(text, at);
        format!("{} at line {line}, column {column}", self.message)
    }
}

impl fmt::Display for ShellError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ShellError {}

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

const HELPERS: &[(&str, &str)] = &[
    ("ObjectId", "ObjectId(\"<24 hex digits>\")"),
    ("ISODate", "ISODate(\"2024-01-31T12:00:00Z\")"),
    ("new Date", "new Date(\"2024-01-31T12:00:00Z\")"),
    ("NumberLong", "NumberLong(<integer>)"),
    ("NumberInt", "NumberInt(<integer>)"),
    ("NumberDecimal", "NumberDecimal(\"<decimal>\")"),
    ("UUID", "UUID(\"<32 hex digits>\")"),
    ("Timestamp", "Timestamp(<seconds>, <increment>)"),
    ("MinKey", "MinKey()"),
    ("MaxKey", "MaxKey()"),
];

type Res<T> = Result<T, JsonError>;

fn fail<T>(message: impl Into<String>, at: usize) -> Res<T> {
    Err(JsonError {
        message: message.into(),
        at,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Find,
    FindOne,
    Aggregate,
    CountDocuments,
    EstimatedDocumentCount,
    Distinct,
    InsertOne,
    InsertMany,
    UpdateOne,
    UpdateMany,
    ReplaceOne,
    DeleteOne,
    DeleteMany,
    CreateIndex,
    DropIndex,
    GetIndexes,
    Drop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChainOp {
    Sort,
    Limit,
    Skip,
    Project,
    Projection,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ShellCommand {
    Collection {
        collection: String,
        method: Method,
        args: Vec<Bson>,
        chain: Vec<(ChainOp, Bson)>,
    },
    RunCommand {
        admin: bool,
        command: Document,
    },
    Use(String),
    ShowDatabases,
    ShowCollections,
    GetCollectionNames,
}

const METHODS: &[(Method, &str, usize, usize)] = &[
    (Method::Find, "find", 0, 3),
    (Method::FindOne, "findOne", 0, 3),
    (Method::Aggregate, "aggregate", 1, 2),
    (Method::CountDocuments, "countDocuments", 0, 2),
    (
        Method::EstimatedDocumentCount,
        "estimatedDocumentCount",
        0,
        1,
    ),
    (Method::Distinct, "distinct", 1, 3),
    (Method::InsertOne, "insertOne", 1, 2),
    (Method::InsertMany, "insertMany", 1, 2),
    (Method::UpdateOne, "updateOne", 2, 3),
    (Method::UpdateMany, "updateMany", 2, 3),
    (Method::ReplaceOne, "replaceOne", 2, 3),
    (Method::DeleteOne, "deleteOne", 1, 2),
    (Method::DeleteMany, "deleteMany", 1, 2),
    (Method::CreateIndex, "createIndex", 1, 2),
    (Method::DropIndex, "dropIndex", 1, 1),
    (Method::GetIndexes, "getIndexes", 0, 0),
    (Method::Drop, "drop", 0, 1),
];

const CHAIN_OPS: &[(ChainOp, &str)] = &[
    (ChainOp::Sort, "sort"),
    (ChainOp::Limit, "limit"),
    (ChainOp::Skip, "skip"),
    (ChainOp::Project, "project"),
    (ChainOp::Projection, "projection"),
];

impl Method {
    pub fn name(self) -> &'static str {
        METHODS.iter().find(|m| m.0 == self).map_or("", |m| m.1)
    }
}

impl ChainOp {
    pub fn name(self) -> &'static str {
        CHAIN_OPS.iter().find(|c| c.0 == self).map_or("", |c| c.1)
    }
}

pub fn parse_value(text: &str) -> Result<Bson, ShellError> {
    json::parse(text)
        .and_then(to_bson)
        .map_err(|e| ShellError::new(text, e))
}

pub fn parse_command(text: &str) -> Result<ShellCommand, ShellError> {
    let mut r = Reader::new(text);
    command(&mut r).map_err(|e| ShellError::new(text, e))
}

fn command(r: &mut Reader) -> Res<ShellCommand> {
    r.skip_ws();
    let at = r.pos;
    let cmd = match r.ident() {
        Some("use") => {
            r.skip_ws();
            let start = r.pos;
            while r
                .peek()
                .is_some_and(|b| !b.is_ascii_whitespace() && b != b';')
            {
                r.pos += 1;
            }
            if r.pos == start {
                return fail("use needs a database name", at);
            }
            ShellCommand::Use(r.src[start..r.pos].into())
        }
        Some("show") => {
            r.skip_ws();
            match r.ident() {
                Some("dbs" | "databases") => ShellCommand::ShowDatabases,
                Some("collections" | "tables") => ShellCommand::ShowCollections,
                _ => return fail("expected show dbs or show collections", at),
            }
        }
        Some("db") => db_expression(r)?,
        _ => {
            return fail(
                "expected db.<collection>.<method>(…), use <database> or show collections",
                at,
            )
        }
    };
    r.skip_ws();
    r.eat(b';');
    r.skip_ws();
    if r.pos < r.src.len() {
        return Err(r.error("unexpected text after the command; run one command at a time"));
    }
    Ok(cmd)
}

fn db_expression(r: &mut Reader) -> Res<ShellCommand> {
    r.skip_ws();
    if r.eat(b'[') {
        r.skip_ws();
        let collection = quoted(r)?;
        r.skip_ws();
        r.expect(b']')?;
        return collection_call(r, collection);
    }
    r.expect(b'.')?;
    let mut path: Vec<&str> = Vec::new();
    loop {
        r.skip_ws();
        let at = r.pos;
        let name = r
            .ident()
            .ok_or_else(|| r.error("expected a collection or method name"))?;
        r.skip_ws();
        if r.peek() == Some(b'(') {
            if path.is_empty() {
                return db_method(r, name, at);
            }
            r.pos = at;
            break;
        }
        path.push(name);
        if r.peek() != Some(b'.') {
            return Err(r.error("expected .<method>(…) after the collection"));
        }
        r.pos += 1;
    }
    collection_call_at_method(r, path.join("."))
}

fn quoted(r: &mut Reader) -> Res<String> {
    if !matches!(r.peek(), Some(b'"' | b'\'')) {
        return Err(r.error("expected a quoted collection name"));
    }
    r.string()
}

fn db_method(r: &mut Reader, name: &str, at: usize) -> Res<ShellCommand> {
    let args = r.args(0)?;
    match (name, args.as_slice()) {
        ("getCollectionNames", []) => Ok(ShellCommand::GetCollectionNames),
        ("getCollection", [Json::String(collection)]) => collection_call(r, collection.clone()),
        ("runCommand" | "adminCommand", [arg]) => {
            let command = match to_bson(arg.clone())? {
                Bson::Document(d) => d,
                Bson::String(s) => doc! { s: 1 },
                _ => return fail(format!("db.{name}() needs a document"), at),
            };
            Ok(ShellCommand::RunCommand {
                admin: name == "adminCommand",
                command,
            })
        }
        ("getCollectionNames" | "getCollection" | "runCommand" | "adminCommand", _) => {
            fail(format!("unexpected arguments to db.{name}()"), at)
        }
        _ => fail(format!("db.{name}() is not supported"), at),
    }
}

fn collection_call(r: &mut Reader, collection: String) -> Res<ShellCommand> {
    r.skip_ws();
    r.expect(b'.')?;
    r.skip_ws();
    collection_call_at_method(r, collection)
}

fn collection_call_at_method(r: &mut Reader, collection: String) -> Res<ShellCommand> {
    let at = r.pos;
    let name = r.ident().ok_or_else(|| r.error("expected a method name"))?;
    let Some(&(method, _, min, max)) = METHODS.iter().find(|m| m.1 == name) else {
        return fail(format!("{name}() is not a supported collection method"), at);
    };
    r.skip_ws();
    let args = bson_args(r)?;
    if args.len() < min || args.len() > max {
        let count = if min == max {
            min.to_string()
        } else {
            format!("{min} to {max}")
        };
        return fail(format!("{name}() takes {count} arguments"), at);
    }
    let mut chain = Vec::new();
    loop {
        r.skip_ws();
        if !r.eat(b'.') {
            break;
        }
        r.skip_ws();
        let op_at = r.pos;
        let op_name = r.ident().unwrap_or_default();
        let Some(&(op, _)) = CHAIN_OPS.iter().find(|c| c.1 == op_name) else {
            return fail(format!(".{op_name}() is not supported"), op_at);
        };
        if method != Method::Find {
            return fail(format!(".{op_name}() can only follow find()"), op_at);
        }
        r.skip_ws();
        let mut arg = bson_args(r)?;
        if arg.len() != 1 {
            return fail(format!(".{op_name}() takes one argument"), op_at);
        }
        chain.push((op, arg.remove(0)));
    }
    Ok(ShellCommand::Collection {
        collection,
        method,
        args,
        chain,
    })
}

fn bson_args(r: &mut Reader) -> Res<Vec<Bson>> {
    r.args(0)?.into_iter().map(to_bson).collect()
}

fn to_bson(value: Json) -> Res<Bson> {
    Ok(match value {
        Json::Null => Bson::Null,
        Json::Bool(v) => Bson::Boolean(v),
        Json::Number { text, at } => number(&text, at)?,
        Json::String(v) => Bson::String(v),
        Json::Array(items) => Bson::Array(items.into_iter().map(to_bson).collect::<Res<_>>()?),
        Json::Object { entries, at } => object(entries, at)?,
        Json::Call { name, args, at } => helper(&name, &args, at)?,
        Json::Regex { pattern, flags, .. } => Bson::RegularExpression(Regex {
            pattern,
            options: flags,
        }),
    })
}

fn number(text: &str, at: usize) -> Res<Bson> {
    if text.contains(['.', 'e', 'E']) {
        let Ok(v) = text.parse::<f64>() else {
            return fail(format!("{text} is not a valid number"), at);
        };
        if !v.is_finite() {
            return fail(
                format!(
                    "{text} is out of range for a double; use {{\"$numberDouble\": \"Infinity\"}}"
                ),
                at,
            );
        }
        return Ok(Bson::Double(v));
    }
    let Ok(v) = text.parse::<i64>() else {
        return fail(
            format!(
                "{text} is out of range for a 64-bit integer; use {{\"$numberDecimal\": \"{text}\"}}"
            ),
            at,
        );
    };
    Ok(match i32::try_from(v) {
        Ok(small) => Bson::Int32(small),
        Err(_) => Bson::Int64(v),
    })
}

fn object(entries: Vec<(String, Json)>, at: usize) -> Res<Bson> {
    let keys: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).collect();
    if keys == ["$code", "$scope"] {
        let mut it = entries.into_iter();
        let (_, code) = it.next().expect("two entries");
        let (_, scope) = it.next().expect("two entries");
        let Json::String(code) = code else {
            return fail("\"$code\" must be a string", at);
        };
        let Bson::Document(scope) = to_bson(scope)? else {
            return fail("\"$scope\" must be a document", at);
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
            let value = to_serde(Json::Object { entries, at }, &key)?;
            return Bson::try_from(value).or_else(|e| fail(format!("{key}: {e}"), at));
        }
    }
    let mut doc = Document::new();
    for (k, v) in entries {
        doc.insert(k, to_bson(v)?);
    }
    Ok(Bson::Document(doc))
}

fn to_serde(value: Json, wrapper: &str) -> Res<serde_json::Value> {
    use serde_json::Value;
    Ok(match value {
        Json::Null => Value::Null,
        Json::Bool(v) => Value::Bool(v),
        Json::Number { text, at } => match text.parse() {
            Ok(n) => Value::Number(n),
            Err(_) => return fail(format!("{text} is not a valid number"), at),
        },
        Json::String(v) => Value::String(v),
        Json::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|v| to_serde(v, wrapper))
                .collect::<Res<_>>()?,
        ),
        Json::Object { entries, .. } => Value::Object(
            entries
                .into_iter()
                .map(|(k, v)| Ok((k, to_serde(v, wrapper)?)))
                .collect::<Res<_>>()?,
        ),
        Json::Call { at, .. } => {
            return fail(format!("{wrapper} takes plain JSON, not a helper call"), at)
        }
        Json::Regex { at, .. } => {
            return fail(
                format!("{wrapper} takes plain JSON, not a regular expression"),
                at,
            )
        }
    })
}

fn helper(name: &str, args: &[Json], at: usize) -> Res<Bson> {
    let Some(&(_, usage)) = HELPERS.iter().find(|h| h.0 == name) else {
        let known: Vec<&str> = HELPERS.iter().map(|h| h.0).collect();
        return fail(
            format!("{name}() is not supported; use {}", known.join(", ")),
            at,
        );
    };
    let value = match (name, args) {
        ("ObjectId", [Json::String(hex)]) => ObjectId::parse_str(hex).ok().map(Bson::ObjectId),
        ("ISODate" | "new Date", [Json::String(s)]) => date(s).map(Bson::DateTime),
        ("NumberLong", [arg]) => integer_text(arg)
            .and_then(|t| t.parse::<i64>().ok())
            .map(Bson::Int64),
        ("NumberInt", [arg]) => integer_text(arg)
            .and_then(|t| t.parse::<i32>().ok())
            .map(Bson::Int32),
        ("NumberDecimal", [Json::String(t) | Json::Number { text: t, .. }]) => {
            t.parse::<Decimal128>().ok().map(Bson::Decimal128)
        }
        ("UUID", [Json::String(s)]) => uuid(s),
        ("Timestamp", [t, i]) => {
            let time = integer_text(t).and_then(|t| t.parse::<u32>().ok());
            let increment = integer_text(i).and_then(|i| i.parse::<u32>().ok());
            time.zip(increment)
                .map(|(time, increment)| Bson::Timestamp(Timestamp { time, increment }))
        }
        ("MinKey", []) => Some(Bson::MinKey),
        ("MaxKey", []) => Some(Bson::MaxKey),
        _ => None,
    };
    value.map_or_else(|| fail(format!("expected {usage}"), at), Ok)
}

fn integer_text(arg: &Json) -> Option<&str> {
    match arg {
        Json::Number { text, .. } | Json::String(text) => Some(text),
        _ => None,
    }
}

/// RFC 3339 with or without fractional seconds, or a bare `YYYY-MM-DD` at UTC midnight.
fn date(s: &str) -> Option<DateTime> {
    if s.len() == 10 {
        return DateTime::parse_rfc3339_str(format!("{s}T00:00:00Z")).ok();
    }
    DateTime::parse_rfc3339_str(s).ok()
}

/// Hyphenated (8-4-4-4-12) or plain 32 hex digits; braces and URNs are refused.
fn uuid(s: &str) -> Option<Bson> {
    let hyphenated = s.len() == 36
        && s.char_indices()
            .all(|(i, c)| (c == '-') == matches!(i, 8 | 13 | 18 | 23));
    let hex: String = if hyphenated {
        s.replace('-', "")
    } else {
        s.into()
    };
    if hex.len() != 32 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let bytes = (0..16)
        .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    Some(Bson::Binary(Binary {
        subtype: BinarySubtype::Uuid,
        bytes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::oid::ObjectId;
    use mongodb::bson::spec::BinarySubtype;
    use mongodb::bson::{doc, Binary, DateTime, Decimal128, Regex, Timestamp};

    #[test]
    fn parses_shell_document() {
        let v = parse_value(
            "{age: {$gt: 30}, name: 'a', _id: ObjectId(\"64b7f1f77bcf86cd79943901\"),}",
        )
        .unwrap();
        let oid = ObjectId::parse_str("64b7f1f77bcf86cd79943901").unwrap();
        let Bson::Document(d) = v else {
            panic!("not a document")
        };
        assert_eq!(d, doc! { "age": { "$gt": 30 }, "name": "a", "_id": oid });
        assert_eq!(d.keys().collect::<Vec<_>>(), ["age", "name", "_id"]);
    }

    #[test]
    fn parses_helpers_and_literals() {
        let v = parse_value(
            r#"[
              NumberLong(5), NumberLong("9007199254740993"), NumberInt(7),
              NumberDecimal("1.10"), ISODate("2024-01-31T12:00:00Z"),
              new Date("2024-01-31T12:00:00.250+01:00"), ISODate("2024-01-31"),
              UUID("0123456789abcdef0123456789abcdef"),
              UUID("01234567-89ab-cdef-0123-456789abcdef"),
              Timestamp(1700000000, 3), /a[/]b\/c/mi, MinKey(), MaxKey(),
              true, false, null, // comment
              /* block */ "x", 'it\'s',
            ]"#,
        )
        .unwrap();
        let uuid = Bson::Binary(Binary {
            subtype: BinarySubtype::Uuid,
            bytes: vec![
                0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab,
                0xcd, 0xef,
            ],
        });
        assert_eq!(
            v,
            Bson::Array(vec![
                Bson::Int64(5),
                Bson::Int64(9_007_199_254_740_993),
                Bson::Int32(7),
                Bson::Decimal128("1.10".parse::<Decimal128>().unwrap()),
                Bson::DateTime(DateTime::from_millis(1_706_702_400_000)),
                Bson::DateTime(DateTime::from_millis(1_706_698_800_250)),
                Bson::DateTime(DateTime::from_millis(1_706_659_200_000)),
                uuid.clone(),
                uuid,
                Bson::Timestamp(Timestamp {
                    time: 1_700_000_000,
                    increment: 3
                }),
                Bson::RegularExpression(Regex {
                    pattern: r"a[/]b\/c".into(),
                    options: "im".into()
                }),
                Bson::MinKey,
                Bson::MaxKey,
                Bson::Boolean(true),
                Bson::Boolean(false),
                Bson::Null,
                Bson::String("x".into()),
                Bson::String("it's".into()),
            ])
        );
    }

    #[test]
    fn rejects_bad_helper_arguments() {
        for bad in [
            "ObjectId(\"abc\")",
            "ObjectId()",
            "new Date()",
            "new Date(\"yesterday\")",
            "new Thing(1)",
            "NumberLong(1.5)",
            "NumberInt(2147483648)",
            "NumberDecimal(\"x\")",
            "UUID(\"{0123456789abcdef0123456789abcdef}\")",
            "Timestamp(1)",
            "MinKey(1)",
            "/a/g",
            "/a",
            "Date(\"2024-01-01\")",
            "undefined",
            "x => 1",
            "(1)",
            "{$date: ISODate(\"2024-01-01\")}",
            "/* open",
        ] {
            assert!(parse_value(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn parses_find_chain() {
        let cmd = parse_command("db.users.find({a:1}).sort({b:-1}).limit(5);").unwrap();
        assert_eq!(
            cmd,
            ShellCommand::Collection {
                collection: "users".into(),
                method: Method::Find,
                args: vec![Bson::Document(doc! { "a": 1 })],
                chain: vec![
                    (ChainOp::Sort, Bson::Document(doc! { "b": -1 })),
                    (ChainOp::Limit, Bson::Int32(5)),
                ],
            }
        );
    }

    #[test]
    fn bracket_collection_name() {
        let expected = ShellCommand::Collection {
            collection: "order items".into(),
            method: Method::CountDocuments,
            args: vec![Bson::Document(doc! {})],
            chain: vec![],
        };
        assert_eq!(
            parse_command(r#"db["order items"].countDocuments({})"#).unwrap(),
            expected
        );
        assert_eq!(
            parse_command("db.getCollection('order items').countDocuments({})").unwrap(),
            expected
        );
    }

    #[test]
    fn parses_database_commands() {
        assert_eq!(
            parse_command("use shop").unwrap(),
            ShellCommand::Use("shop".into())
        );
        assert_eq!(
            parse_command("show dbs").unwrap(),
            ShellCommand::ShowDatabases
        );
        assert_eq!(
            parse_command("show collections;").unwrap(),
            ShellCommand::ShowCollections
        );
        assert_eq!(
            parse_command("db.getCollectionNames()").unwrap(),
            ShellCommand::GetCollectionNames
        );
        assert_eq!(
            parse_command("db.runCommand({ping: 1})").unwrap(),
            ShellCommand::RunCommand {
                admin: false,
                command: doc! { "ping": 1 }
            }
        );
        assert_eq!(
            parse_command("db.adminCommand('listDatabases')").unwrap(),
            ShellCommand::RunCommand {
                admin: true,
                command: doc! { "listDatabases": 1 }
            }
        );
        let ShellCommand::Collection { collection, .. } =
            parse_command("db.system.profile.find()").unwrap()
        else {
            panic!("not a collection command")
        };
        assert_eq!(collection, "system.profile");
    }

    #[test]
    fn rejects_unsupported_commands() {
        for bad in [
            "db.users.find().toArray()",
            "db.users.insertOne({}).limit(1)",
            "db.users.mapReduce()",
            "db.users.updateOne({})",
            "db.users.find().limit(1, 2)",
            "db.dropDatabase()",
            "db.getCollection(5).find()",
            "show users",
            "use",
            "users.find()",
            "db.users",
            "db.users.find() db.x.find()",
        ] {
            assert!(parse_command(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn rejects_function_calls() {
        let err = parse_command("db.users.find({$where: function() {}})").unwrap_err();
        assert!(err.message.contains("function"), "{}", err.message);
        let err = parse_value("{a: sleep(1000)}").unwrap_err();
        assert!(err.message.contains("not supported"), "{}", err.message);
    }

    #[test]
    fn error_offset_is_utf16() {
        let text = "\"é😀\" x";
        let err = parse_value(text).unwrap_err();
        assert_eq!(err.offset, 6);
        assert_eq!(
            err.describe(text),
            "unexpected text after the value at line 1, column 6"
        );
    }

    #[test]
    fn hostile_input_never_panics() {
        for text in [
            "\\",
            "'",
            "/",
            "/[",
            "{a",
            "db[",
            "db.",
            "new",
            "é",
            "{'é': /é\\",
            "ObjectId(\"é",
        ] {
            let _ = parse_value(text);
            let _ = parse_command(text);
        }
        assert!(parse_value(&"[".repeat(1000)).is_err());
    }
}
