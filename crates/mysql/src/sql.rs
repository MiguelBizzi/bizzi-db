use db_core::{QueryKind, SqlDialect, SqlRange};

/// Statement splitting for the MySQL client, including `DELIMITER`.
pub struct MySqlSql;

impl SqlDialect for MySqlSql {
    fn split_statements(&self, sql: &str) -> Vec<String> {
        let chars: Vec<char> = sql.chars().collect();
        scan(&chars)
            .into_iter()
            .map(|(start, end)| chars[start..end].iter().collect())
            .collect()
    }

    fn split_ranges(&self, sql: &str) -> Vec<SqlRange> {
        let chars: Vec<char> = sql.chars().collect();
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

    fn classify(&self, sql: &str) -> QueryKind {
        match first_word(sql).as_str() {
            "SELECT" | "WITH" | "TABLE" | "VALUES" | "SHOW" | "DESCRIBE" | "DESC" => {
                QueryKind::Select
            }
            "INSERT" | "REPLACE" => QueryKind::Insert,
            "UPDATE" => QueryKind::Update,
            "DELETE" => QueryKind::Delete,
            "EXPLAIN" | "ANALYZE" => QueryKind::Explain,
            "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "RENAME" | "COMMENT" | "GRANT"
            | "REVOKE" => QueryKind::Ddl,
            _ => QueryKind::System,
        }
    }

    fn paged_select(&self, stmt: &str, limit: i64, offset: i64) -> Option<String> {
        let body = pageable(stmt)?;
        Some(format!(
            "SELECT * FROM ({body}) AS `_page` LIMIT {limit} OFFSET {offset}"
        ))
    }

    fn count_select(&self, stmt: &str) -> Option<String> {
        let body = pageable(stmt)?;
        Some(format!("SELECT COUNT(*) FROM ({body}) AS `_page`"))
    }

    fn quote_ident(&self, name: &str) -> String {
        format!("`{}`", name.replace('`', "``"))
    }

    fn quote_literal(&self, value: &str) -> String {
        format!("'{}'", value.replace('\\', "\\\\").replace('\'', "''"))
    }
}

fn pageable(stmt: &str) -> Option<&str> {
    let word = first_word(stmt);
    if word != "SELECT" && word != "WITH" {
        return None;
    }
    let body = stmt.trim().trim_end_matches(';').trim();
    if body.is_empty() {
        None
    } else {
        Some(body)
    }
}

fn first_word(sql: &str) -> String {
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;
    skip_leading(&chars, &mut i);
    let start = i;
    while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
        i += 1;
    }
    chars[start..i]
        .iter()
        .collect::<String>()
        .to_ascii_uppercase()
}

fn skip_leading(chars: &[char], i: &mut usize) {
    loop {
        while *i < chars.len() && chars[*i].is_whitespace() {
            *i += 1;
        }
        if *i + 1 < chars.len() && chars[*i] == '-' && chars[*i + 1] == '-' {
            let after = chars.get(*i + 2).copied();
            if after.is_none_or(char::is_whitespace) {
                while *i < chars.len() && chars[*i] != '\n' {
                    *i += 1;
                }
                continue;
            }
        }
        if *i < chars.len() && chars[*i] == '#' {
            while *i < chars.len() && chars[*i] != '\n' {
                *i += 1;
            }
            continue;
        }
        if *i + 1 < chars.len() && chars[*i] == '/' && chars[*i + 1] == '*' {
            *i += 2;
            while *i + 1 < chars.len() && !(chars[*i] == '*' && chars[*i + 1] == '/') {
                *i += 1;
            }
            *i = (*i + 2).min(chars.len());
            continue;
        }
        break;
    }
}

fn scan(chars: &[char]) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut delimiter = vec![';'];
    let mut start = 0;
    let mut i = 0;
    while i < chars.len() {
        if region_is_ws(chars, start, i) {
            if let Some(next) = delimiter_directive(chars, i) {
                delimiter = next.delimiter;
                i = next.after;
                start = i;
                continue;
            }
        }
        if starts_with(chars, i, &delimiter) {
            push_range(&mut ranges, chars, start, i);
            i += delimiter.len();
            start = i;
            continue;
        }
        let c = chars[i];
        if c == '\'' || c == '"' {
            i = skip_quoted(chars, i, c);
            continue;
        }
        if c == '`' {
            i = skip_backtick(chars, i);
            continue;
        }
        if c == '#' {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '-' && chars.get(i + 1) == Some(&'-') {
            let after = chars.get(i + 2).copied();
            if after.is_none_or(char::is_whitespace) {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
                continue;
            }
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i = (i + 2).min(chars.len());
            continue;
        }
        i += 1;
    }
    push_range(&mut ranges, chars, start, chars.len());
    ranges
}

fn region_is_ws(chars: &[char], start: usize, end: usize) -> bool {
    chars[start..end].iter().all(|c| c.is_whitespace())
}

struct Directive {
    delimiter: Vec<char>,
    after: usize,
}

fn delimiter_directive(chars: &[char], mut i: usize) -> Option<Directive> {
    while i < chars.len() && chars[i].is_whitespace() {
        i += 1;
    }
    let word: String = chars[i..]
        .iter()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    if !word.eq_ignore_ascii_case("DELIMITER") {
        return None;
    }
    i += word.len();
    if i >= chars.len() || !chars[i].is_whitespace() {
        return None;
    }
    while i < chars.len() && chars[i].is_whitespace() && chars[i] != '\n' {
        i += 1;
    }
    if i >= chars.len() || chars[i] == '\n' {
        return None;
    }
    let mut delimiter = Vec::new();
    while i < chars.len() && !chars[i].is_whitespace() {
        delimiter.push(chars[i]);
        i += 1;
    }
    while i < chars.len() && chars[i] != '\n' {
        i += 1;
    }
    if i < chars.len() && chars[i] == '\n' {
        i += 1;
    }
    if delimiter.is_empty() {
        return None;
    }
    Some(Directive {
        delimiter,
        after: i,
    })
}

fn starts_with(chars: &[char], i: usize, needle: &[char]) -> bool {
    chars[i..].starts_with(needle)
}

fn skip_quoted(chars: &[char], mut i: usize, quote: char) -> usize {
    i += 1;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            i += 2;
            continue;
        }
        if chars[i] == quote {
            if chars.get(i + 1) == Some(&quote) {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i += 1;
    }
    i
}

fn skip_backtick(chars: &[char], mut i: usize) -> usize {
    i += 1;
    while i < chars.len() {
        if chars[i] == '`' {
            if chars.get(i + 1) == Some(&'`') {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i += 1;
    }
    i
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

#[cfg(test)]
mod tests {
    use super::*;

    fn statements(sql: &str) -> Vec<String> {
        MySqlSql.split_statements(sql)
    }

    #[test]
    fn splits_on_semicolons_outside_quotes_comments_and_backticks() {
        let sql = "SELECT 1; SELECT 'a;b'; SELECT `c;d`; SELECT 1 # c;\n; SELECT \"x;y\"; SELECT 1 -- c;\n";
        assert_eq!(
            statements(sql),
            vec![
                "SELECT 1",
                "SELECT 'a;b'",
                "SELECT `c;d`",
                "SELECT 1 # c;",
                "SELECT \"x;y\"",
                "SELECT 1 -- c;",
            ]
        );
    }

    #[test]
    fn backslash_and_doubled_quotes_do_not_end_a_string() {
        assert_eq!(
            statements(r"SELECT 'it\'s; still'; SELECT 'it''s';"),
            vec![r"SELECT 'it\'s; still'", "SELECT 'it''s'"]
        );
    }

    #[test]
    fn delimiter_directive_changes_the_terminator() {
        let sql =
            "DELIMITER $$\nCREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\nEND$$\nDELIMITER ;\nSELECT 2;";
        assert_eq!(
            statements(sql),
            vec!["CREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\nEND", "SELECT 2"]
        );
    }

    #[test]
    fn classifies_mysql_statements() {
        assert_eq!(MySqlSql.classify("SHOW TABLES"), QueryKind::Select);
        assert_eq!(MySqlSql.classify("DESCRIBE users"), QueryKind::Select);
        assert_eq!(
            MySqlSql.classify("CALL touch_user(1, @n)"),
            QueryKind::System
        );
        assert_eq!(
            MySqlSql.classify("REPLACE INTO t VALUES (1)"),
            QueryKind::Insert
        );
        assert_eq!(MySqlSql.classify("RENAME TABLE a TO b"), QueryKind::Ddl);
    }

    #[test]
    fn quotes_backticks_and_literals() {
        assert_eq!(MySqlSql.quote_ident("we`ird"), "`we``ird`");
        assert_eq!(MySqlSql.quote_literal("a'b\\c"), "'a''b\\\\c'");
    }

    #[test]
    fn pages_select_and_with_only() {
        assert!(MySqlSql
            .paged_select("SELECT 1", 10, 0)
            .unwrap()
            .contains("LIMIT 10 OFFSET 0"));
        assert!(MySqlSql.paged_select("SHOW TABLES", 10, 0).is_none());
        assert!(MySqlSql
            .count_select("WITH t AS (SELECT 1 AS n) SELECT * FROM t")
            .is_some());
    }
}
