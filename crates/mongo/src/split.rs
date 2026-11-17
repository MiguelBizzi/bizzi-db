use db_core::{HistoryQueryType, SqlRange};

use crate::shell::{parse_command, Method, ShellCommand};

/// Statements end at a top-level `;`, or at a newline outside brackets unless
/// the next non-blank line starts with `.` (a chained call) or the statement
/// ends with `.`. Ranges exclude surrounding whitespace and comments.
pub fn split_ranges(text: &str) -> Vec<SqlRange> {
    let chars: Vec<char> = text.chars().collect();
    let mut offsets = Vec::with_capacity(chars.len() + 1);
    let mut units = 0;
    for c in &chars {
        offsets.push(units);
        units += c.len_utf16();
    }
    offsets.push(units);
    scan(&chars)
        .into_iter()
        .map(|(start, end)| SqlRange {
            start: offsets[start],
            end: offsets[end],
        })
        .collect()
}

pub fn classify(text: &str) -> HistoryQueryType {
    let Ok(ShellCommand::Collection { method, .. }) = parse_command(text) else {
        return HistoryQueryType::System;
    };
    match method {
        Method::Find
        | Method::FindOne
        | Method::Aggregate
        | Method::CountDocuments
        | Method::EstimatedDocumentCount
        | Method::Distinct
        | Method::GetIndexes => HistoryQueryType::Select,
        Method::InsertOne | Method::InsertMany => HistoryQueryType::Insert,
        Method::UpdateOne | Method::UpdateMany | Method::ReplaceOne => HistoryQueryType::Update,
        Method::DeleteOne | Method::DeleteMany => HistoryQueryType::Delete,
        Method::CreateIndex | Method::DropIndex | Method::Drop => HistoryQueryType::Ddl,
    }
}

/// `(start, end)` char ranges of each non-empty statement.
fn scan(chars: &[char]) -> Vec<(usize, usize)> {
    let n = chars.len();
    let mut ranges = Vec::new();
    let mut start: Option<usize> = None;
    let mut end = 0;
    let mut depth = 0usize;
    // Last character of the previous token; decides whether `/` opens a regex.
    let mut prev: Option<char> = None;
    let mut i = 0;
    while i < n {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '/' && next == Some('/') {
            while i < n && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && next == Some('*') {
            i += 2;
            while i < n && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                i += 1;
            }
            i = (i + 2).min(n);
            continue;
        }
        if c.is_whitespace() {
            if c == '\n'
                && depth == 0
                && start.is_some()
                && prev != Some('.')
                && !next_line_continues(&chars[i + 1..])
            {
                ranges.extend(start.take().map(|s| (s, end)));
                prev = None;
            }
            i += 1;
            continue;
        }
        if c == ';' && depth == 0 {
            ranges.extend(start.take().map(|s| (s, end)));
            prev = None;
            i += 1;
            continue;
        }
        start.get_or_insert(i);
        i = match c {
            '"' | '\'' | '`' => skip_string(chars, i),
            '/' if prev.is_none_or(|p| "(,=:[!&|?{};+-*%<>~^".contains(p)) => skip_regex(chars, i),
            '(' | '[' | '{' => {
                depth += 1;
                i + 1
            }
            ')' | ']' | '}' => {
                depth = depth.saturating_sub(1);
                i + 1
            }
            _ => i + 1,
        };
        end = i;
        prev = Some(chars[i - 1]);
    }
    ranges.extend(start.map(|s| (s, end)));
    ranges
}

fn next_line_continues(rest: &[char]) -> bool {
    rest.iter().find(|c| !c.is_whitespace()) == Some(&'.')
}

/// Index after the closing quote. A newline ends an unterminated `'`/`"`
/// string so one stray quote does not swallow the rest of the script.
fn skip_string(chars: &[char], open: usize) -> usize {
    let quote = chars[open];
    let mut i = open + 1;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            c if c == quote => return i + 1,
            '\n' if quote != '`' => return i,
            _ => i += 1,
        }
    }
    chars.len()
}

/// Index after the flags. Like strings, a regex literal cannot span lines.
fn skip_regex(chars: &[char], open: usize) -> usize {
    let mut i = open + 1;
    let mut in_class = false;
    while i < chars.len() {
        match chars[i] {
            '\n' => return i,
            '\\' => i += 1,
            '[' => in_class = true,
            ']' => in_class = false,
            '/' if !in_class => {
                i += 1;
                while i < chars.len() && chars[i].is_ascii_alphanumeric() {
                    i += 1;
                }
                return i;
            }
            _ => {}
        }
        i += 1;
    }
    chars.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(text: &str) -> Vec<String> {
        let units: Vec<u16> = text.encode_utf16().collect();
        split_ranges(text)
            .iter()
            .map(|r| String::from_utf16(&units[r.start..r.end]).unwrap())
            .collect()
    }

    #[test]
    fn splits_on_newline_at_depth_zero() {
        let text = "db.a.find()\n\n  db.b.insertOne({\n  x: 1\n})\nshow dbs";
        assert_eq!(
            texts(text),
            ["db.a.find()", "db.b.insertOne({\n  x: 1\n})", "show dbs"]
        );
        assert_eq!(
            texts("db.a.find(); db.b.find() ;\n"),
            ["db.a.find()", "db.b.find()"]
        );
        assert!(split_ranges("  ;\n ; ").is_empty());
        assert!(split_ranges("").is_empty());
    }

    #[test]
    fn keeps_chained_call_on_next_line() {
        assert_eq!(
            texts("db.a.find()\n  .limit(2)\ndb.b.find()"),
            ["db.a.find()\n  .limit(2)", "db.b.find()"]
        );
        assert_eq!(texts("db.a.find().\nlimit(2)"), ["db.a.find().\nlimit(2)"]);
    }

    #[test]
    fn ignores_semicolons_in_strings_and_regex() {
        assert_eq!(
            texts(r#"db.a.find({a: "x;y", b: 'p;q', c: /;\/;[;/]/i}); db.b.find()"#),
            [
                r#"db.a.find({a: "x;y", b: 'p;q', c: /;\/;[;/]/i})"#,
                "db.b.find()"
            ]
        );
        assert_eq!(
            texts("// lead; comment\ndb.a.find() /* ; */ // tail;\ndb.b.find()"),
            ["db.a.find()", "db.b.find()"]
        );
        assert_eq!(
            texts("db.a.find({a: \"open\ndb.b.find()"),
            ["db.a.find({a: \"open\ndb.b.find()"]
        );
    }

    #[test]
    fn utf16_offsets_with_emoji() {
        let ranges = split_ranges("db.a.find({x: \"😀\"})\ndb.b.find()");
        assert_eq!(
            ranges,
            [
                SqlRange { start: 0, end: 20 },
                SqlRange { start: 21, end: 32 }
            ]
        );
    }

    #[test]
    fn classifies_by_method() {
        for (text, kind) in [
            ("db.a.find()", HistoryQueryType::Select),
            ("db.a.aggregate([])", HistoryQueryType::Select),
            ("db.a.countDocuments({})", HistoryQueryType::Select),
            ("db.a.distinct('x')", HistoryQueryType::Select),
            ("db.a.getIndexes()", HistoryQueryType::Select),
            ("db.a.insertMany([{}])", HistoryQueryType::Insert),
            ("db.a.replaceOne({}, {})", HistoryQueryType::Update),
            (
                "db.a.updateMany({}, {$set: {a: 1}})",
                HistoryQueryType::Update,
            ),
            ("db.a.deleteOne({})", HistoryQueryType::Delete),
            ("db.a.createIndex({a: 1})", HistoryQueryType::Ddl),
            ("db.a.drop()", HistoryQueryType::Ddl),
            ("db.runCommand({ping: 1})", HistoryQueryType::System),
            ("show dbs", HistoryQueryType::System),
            ("not a command", HistoryQueryType::System),
        ] {
            assert_eq!(classify(text), kind, "{text}");
        }
    }
}
