use crate::types::HistoryQueryType;
use serde::{Deserialize, Serialize};

pub const DEFAULT_PREVIEW_LIMIT: i64 = 100;

pub fn clamp_preview_page(limit: i64, offset: i64) -> (i64, i64) {
    (limit.max(0), offset.max(0))
}

/// Keywords that mean a statement writes, locks or creates something. Wrapping
/// such a statement in a subquery would re-run its side effects for every page
/// and for the row count, so it is never paged.
const NON_PAGEABLE_WORDS: &[&str] = &["insert", "update", "delete", "merge", "into"];

/// Wraps one read-only `SELECT`/`WITH`/`VALUES`/`TABLE` statement so a single
/// page of its rows can be fetched. `None` means the statement must run as is.
pub fn paged_select_sql(stmt: &str, limit: i64, offset: i64) -> Option<String> {
    let body = pageable_body(stmt)?;
    let (limit, offset) = (limit.max(1), offset.max(0));
    Some(format!(
        "SELECT * FROM (\n{body}\n) AS _paged LIMIT {limit} OFFSET {offset}"
    ))
}

/// Counts every row the statement returns; same eligibility as `paged_select_sql`.
pub fn count_select_sql(stmt: &str) -> Option<String> {
    let body = pageable_body(stmt)?;
    Some(format!("SELECT COUNT(*) FROM (\n{body}\n) AS _counted"))
}

fn pageable_body(stmt: &str) -> Option<String> {
    let body = stmt.trim().trim_end_matches(';').trim_end();
    let mut words = sql_words(body).into_iter();
    if !matches!(
        words.next()?.as_str(),
        "select" | "with" | "values" | "table"
    ) {
        return None;
    }
    if words.any(|word| NON_PAGEABLE_WORDS.contains(&word.as_str())) {
        return None;
    }
    Some(body.to_string())
}

/// Lowercased bare words of `sql`, skipping comments, quoted text and dollar-quoted bodies.
fn sql_words(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut words = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '-' && chars.get(i + 1) == Some(&'-') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
        } else if c == '/' && chars.get(i + 1) == Some(&'*') {
            let mut depth = 1;
            i += 2;
            while i < chars.len() && depth > 0 {
                if chars[i] == '/' && chars.get(i + 1) == Some(&'*') {
                    depth += 1;
                    i += 2;
                } else if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    i += 2;
                } else {
                    i += 1;
                }
            }
        } else if c == '\'' || c == '"' {
            i += 1;
            while i < chars.len() {
                if chars[i] == c {
                    if chars.get(i + 1) == Some(&c) {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
        } else if let Some(tag_len) = dollar_tag_len(&chars[i..]) {
            let tag: Vec<char> = chars[i..i + tag_len].to_vec();
            i += tag_len;
            while i + tag_len <= chars.len() && chars[i..i + tag_len] != tag[..] {
                i += 1;
            }
            i = (i + tag_len).min(chars.len());
        } else if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            words.push(chars[start..i].iter().collect::<String>().to_lowercase());
        } else {
            i += 1;
        }
    }
    words
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryKind {
    Select,
    Insert,
    Update,
    Delete,
    Ddl,
    Explain,
    System,
}

impl From<QueryKind> for HistoryQueryType {
    fn from(kind: QueryKind) -> Self {
        match kind {
            QueryKind::Select => HistoryQueryType::Select,
            QueryKind::Insert => HistoryQueryType::Insert,
            QueryKind::Update => HistoryQueryType::Update,
            QueryKind::Delete => HistoryQueryType::Delete,
            QueryKind::Ddl => HistoryQueryType::Ddl,
            QueryKind::Explain => HistoryQueryType::Explain,
            QueryKind::System => HistoryQueryType::System,
        }
    }
}

/// Classify SQL by its first significant keyword. Used for history typing,
/// not for rewriting or blocking statements.
pub fn classify_sql(sql: &str) -> QueryKind {
    let trimmed = strip_leading_comments(sql);
    let first = trimmed
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_end_matches(';')
        .to_ascii_uppercase();

    match first.as_str() {
        "SELECT" | "WITH" | "TABLE" | "VALUES" | "SHOW" => QueryKind::Select,
        "INSERT" => QueryKind::Insert,
        "UPDATE" => QueryKind::Update,
        "DELETE" => QueryKind::Delete,
        "EXPLAIN" | "ANALYZE" => QueryKind::Explain,
        "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "COMMENT" | "GRANT" | "REVOKE" => QueryKind::Ddl,
        _ => QueryKind::System,
    }
}

/// Half-open range of one statement in a script, counted in UTF-16 code units
/// so it lines up with string offsets in the editor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SqlRange {
    pub start: usize,
    pub end: usize,
}

/// Split a SQL script into statements on top-level semicolons.
/// Semicolons inside quotes, comments, and dollar-quoted strings are ignored.
pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    scan_statements(&chars)
        .into_iter()
        .map(|(start, end)| chars[start..end].iter().collect())
        .collect()
}

/// Where each statement of `split_sql_statements` sits in the script, with
/// surrounding whitespace excluded.
pub fn split_sql_ranges(sql: &str) -> Vec<SqlRange> {
    let chars: Vec<char> = sql.chars().collect();
    let mut offsets = Vec::with_capacity(chars.len() + 1);
    let mut units = 0;
    for c in &chars {
        offsets.push(units);
        units += c.len_utf16();
    }
    offsets.push(units);
    scan_statements(&chars)
        .into_iter()
        .map(|(start, end)| SqlRange {
            start: offsets[start],
            end: offsets[end],
        })
        .collect()
}

/// Trimmed `(start, end)` char ranges of each non-empty statement.
fn scan_statements(chars: &[char]) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut start = 0;
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        if c == '-' && chars.get(i + 1) == Some(&'-') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }

        if c == '/' && chars.get(i + 1) == Some(&'*') {
            let mut depth = 1;
            i += 2;
            while i < chars.len() && depth > 0 {
                if chars[i] == '/' && chars.get(i + 1) == Some(&'*') {
                    depth += 1;
                    i += 2;
                    continue;
                }
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    i += 2;
                    continue;
                }
                i += 1;
            }
            continue;
        }

        if c == '$' {
            if let Some(tag_len) = dollar_tag_len(&chars[i..]) {
                let tag = &chars[i..i + tag_len];
                i += tag_len;
                while i + tag_len <= chars.len() {
                    if &chars[i..i + tag_len] == tag {
                        i += tag_len;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
        }

        if c == '\'' || c == '"' {
            i += 1;
            while i < chars.len() {
                if chars[i] == c {
                    if chars.get(i + 1) == Some(&c) {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        if c == ';' {
            push_range(&mut ranges, chars, start, i);
            i += 1;
            start = i;
            continue;
        }

        i += 1;
    }

    push_range(&mut ranges, chars, start, chars.len().min(i));
    ranges
}

fn push_range(ranges: &mut Vec<(usize, usize)>, chars: &[char], start: usize, end: usize) {
    let end = end.min(chars.len());
    let mut s = start;
    let mut e = end;
    while s < e && chars[s].is_whitespace() {
        s += 1;
    }
    while e > s && chars[e - 1].is_whitespace() {
        e -= 1;
    }
    if s < e {
        ranges.push((s, e));
    }
}

fn dollar_tag_len(chars: &[char]) -> Option<usize> {
    if chars.first() != Some(&'$') {
        return None;
    }
    let mut i = 1;
    while i < chars.len() {
        let c = chars[i];
        if c == '$' {
            return Some(i + 1);
        }
        if !(c.is_ascii_alphanumeric() || c == '_') {
            return None;
        }
        i += 1;
    }
    None
}

fn strip_leading_comments(sql: &str) -> &str {
    let mut s = sql.trim_start();
    loop {
        if s.starts_with("--") {
            s = s
                .split_once('\n')
                .map(|(_, rest)| rest)
                .unwrap_or("")
                .trim_start();
            continue;
        }
        if s.starts_with("/*") {
            s = s
                .split_once("*/")
                .map(|(_, rest)| rest)
                .unwrap_or("")
                .trim_start();
            continue;
        }
        break;
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_select_and_cte() {
        assert_eq!(classify_sql("SELECT 1"), QueryKind::Select);
        assert_eq!(
            classify_sql("  -- note\nWITH x AS (SELECT 1) SELECT * FROM x"),
            QueryKind::Select
        );
    }

    #[test]
    fn clamp_preview_page_only_rejects_negative_values() {
        assert_eq!(clamp_preview_page(100, 0), (100, 0));
        assert_eq!(clamp_preview_page(-5, -10), (0, 0));
        assert_eq!(clamp_preview_page(i64::MAX, i64::MAX), (i64::MAX, i64::MAX));
    }

    #[test]
    fn paged_select_wraps_read_only_statements() {
        assert_eq!(
            paged_select_sql("SELECT * FROM users;", 50, 100).as_deref(),
            Some("SELECT * FROM (\nSELECT * FROM users\n) AS _paged LIMIT 50 OFFSET 100")
        );
        assert_eq!(
            count_select_sql("  -- all users\nWITH x AS (SELECT 1) SELECT * FROM x ").as_deref(),
            Some("SELECT COUNT(*) FROM (\n-- all users\nWITH x AS (SELECT 1) SELECT * FROM x\n) AS _counted")
        );
        assert!(paged_select_sql("VALUES (1), (2)", 10, 0).is_some());
        assert!(paged_select_sql("TABLE users", 10, 0).is_some());
        assert_eq!(
            paged_select_sql("SELECT 1 -- trailing", 0, -4).as_deref(),
            Some("SELECT * FROM (\nSELECT 1 -- trailing\n) AS _paged LIMIT 1 OFFSET 0")
        );
    }

    #[test]
    fn paged_select_skips_statements_with_side_effects() {
        for sql in [
            "INSERT INTO t VALUES (1)",
            "UPDATE t SET a = 1",
            "SHOW search_path",
            "EXPLAIN SELECT 1",
            "SELECT * INTO copy FROM t",
            "SELECT * FROM t FOR UPDATE",
            "WITH gone AS (DELETE FROM t RETURNING *) SELECT * FROM gone",
            "",
        ] {
            assert_eq!(paged_select_sql(sql, 10, 0), None, "{sql}");
            assert_eq!(count_select_sql(sql), None, "{sql}");
        }
    }

    #[test]
    fn paged_select_ignores_keywords_in_text_and_comments() {
        let sql =
            "SELECT 'delete me', \"update\" /* insert */ FROM t -- into\nWHERE x = $$ into $$";
        assert!(paged_select_sql(sql, 10, 0).is_some());
    }

    #[test]
    fn classifies_dml_and_ddl() {
        assert_eq!(classify_sql("INSERT INTO t VALUES (1)"), QueryKind::Insert);
        assert_eq!(classify_sql("UPDATE t SET a = 1"), QueryKind::Update);
        assert_eq!(classify_sql("DELETE FROM t"), QueryKind::Delete);
        assert_eq!(classify_sql("CREATE TABLE t (id int)"), QueryKind::Ddl);
        assert_eq!(classify_sql("EXPLAIN SELECT 1"), QueryKind::Explain);
    }

    #[test]
    fn classifies_block_comment_prefix() {
        assert_eq!(
            classify_sql("/* leading */\nALTER TABLE t ADD COLUMN x int"),
            QueryKind::Ddl
        );
    }

    #[test]
    fn classifies_remaining_keywords_and_edge_cases() {
        assert_eq!(classify_sql("GRANT SELECT ON t TO u"), QueryKind::Ddl);
        assert_eq!(classify_sql("REVOKE SELECT ON t FROM u"), QueryKind::Ddl);
        assert_eq!(classify_sql("TRUNCATE t"), QueryKind::Ddl);
        assert_eq!(classify_sql("TABLE users"), QueryKind::Select);
        assert_eq!(classify_sql("VALUES (1)"), QueryKind::Select);
        assert_eq!(classify_sql("SHOW TABLES"), QueryKind::Select);
        assert_eq!(classify_sql("ANALYZE t"), QueryKind::Explain);
        assert_eq!(classify_sql("select 1"), QueryKind::Select);
        assert_eq!(classify_sql(""), QueryKind::System);
        assert_eq!(classify_sql(";"), QueryKind::System);
        assert_eq!(
            classify_sql("/* a */\n/* b */\nDROP TABLE t"),
            QueryKind::Ddl
        );
        assert_eq!(
            classify_sql("/* outer /* inner */ leftover */ DROP TABLE t"),
            QueryKind::System
        );
        assert_eq!(
            HistoryQueryType::from(QueryKind::Select),
            HistoryQueryType::Select
        );
        assert_eq!(
            HistoryQueryType::from(QueryKind::Ddl),
            HistoryQueryType::Ddl
        );
    }

    #[test]
    fn splits_statements_on_semicolons() {
        assert_eq!(
            split_sql_statements("SELECT 1; SELECT 2;"),
            vec!["SELECT 1", "SELECT 2"]
        );
        assert_eq!(split_sql_statements("SELECT 1"), vec!["SELECT 1"]);
        assert_eq!(split_sql_statements("  ;  ;  "), Vec::<String>::new());
        assert_eq!(
            split_sql_statements("SELECT 1;; SELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
    }

    #[test]
    fn split_ignores_semicolons_in_quotes_comments_and_dollar_quotes() {
        assert_eq!(
            split_sql_statements("SELECT 'a;b'; SELECT 2"),
            vec!["SELECT 'a;b'", "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements(r#"SELECT "col;name" FROM t; SELECT 2"#),
            vec![r#"SELECT "col;name" FROM t"#, "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT 1; -- ignore ; here\nSELECT 2"),
            vec!["SELECT 1", "-- ignore ; here\nSELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT 1; /* ; */ SELECT 2"),
            vec!["SELECT 1", "/* ; */ SELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT $tag$ a;b $tag$; SELECT 2"),
            vec!["SELECT $tag$ a;b $tag$", "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT $$ a;b $$; SELECT 2"),
            vec!["SELECT $$ a;b $$", "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT 'it''s;ok'; SELECT 2"),
            vec!["SELECT 'it''s;ok'", "SELECT 2"]
        );
    }

    fn range(start: usize, end: usize) -> SqlRange {
        SqlRange { start, end }
    }

    #[test]
    fn ranges_cover_each_trimmed_statement() {
        let sql = "SELECT 1;  SELECT 2 ;\n\nSELECT 3";
        let ranges = split_sql_ranges(sql);
        assert_eq!(ranges, vec![range(0, 8), range(11, 19), range(23, 31)]);
        let units: Vec<u16> = sql.encode_utf16().collect();
        let texts: Vec<String> = ranges
            .iter()
            .map(|r| String::from_utf16(&units[r.start..r.end]).unwrap())
            .collect();
        assert_eq!(texts, split_sql_statements(sql));
    }

    #[test]
    fn ranges_skip_empty_statements() {
        assert_eq!(split_sql_ranges("  ;  ;  "), Vec::<SqlRange>::new());
        assert_eq!(split_sql_ranges(""), Vec::<SqlRange>::new());
        assert_eq!(
            split_sql_ranges("SELECT 1;; SELECT 2"),
            vec![range(0, 8), range(11, 19)]
        );
    }

    #[test]
    fn ranges_ignore_semicolons_in_quotes_comments_and_dollar_quotes() {
        for sql in [
            "SELECT 'a;b'; SELECT 2",
            r#"SELECT "col;name" FROM t; SELECT 2"#,
            "SELECT 1; -- ignore ; here\nSELECT 2",
            "SELECT 1; /* ; */ SELECT 2",
            "SELECT $tag$ a;b $tag$; SELECT 2",
            "SELECT 'it''s;ok'; SELECT 2",
        ] {
            let units: Vec<u16> = sql.encode_utf16().collect();
            let texts: Vec<String> = split_sql_ranges(sql)
                .iter()
                .map(|r| String::from_utf16(&units[r.start..r.end]).unwrap())
                .collect();
            assert_eq!(texts, split_sql_statements(sql), "{sql}");
        }
    }

    #[test]
    fn ranges_count_utf16_units_not_chars() {
        // The emoji is one char but two UTF-16 units, which is what the editor counts.
        let sql = "SELECT '😀'; SELECT 2";
        assert_eq!(split_sql_ranges(sql), vec![range(0, 11), range(13, 21)]);
    }
}
