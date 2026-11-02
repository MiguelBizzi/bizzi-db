use db_core::{QueryKind, SqlDialect, SqlRange};

/// Statement splitting for the SQL Server client.
///
/// `GO` is a client batch separator (sqlcmd), not a T-SQL keyword, so it never
/// reaches the server. A procedure, view, function, or trigger body runs to the
/// next `GO` because `CREATE`/`ALTER` of those objects must be the first
/// statement of its batch. `BEGIN TRAN` is a transaction; a bare `BEGIN` opens
/// a block.
pub struct TSqlSql;

impl SqlDialect for TSqlSql {
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
        let body = sql.trim();
        let verb = if first_word(body) == "WITH" {
            first_word(&split_cte(body).1)
        } else {
            first_word(body)
        };
        match verb.as_str() {
            "SELECT" | "VALUES" => QueryKind::Select,
            "INSERT" => QueryKind::Insert,
            "UPDATE" | "MERGE" => QueryKind::Update,
            "DELETE" => QueryKind::Delete,
            "CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "RENAME" => QueryKind::Ddl,
            _ => QueryKind::System,
        }
    }

    fn paged_select(&self, stmt: &str, limit: i64, offset: i64) -> Option<String> {
        let body = selectable(stmt)?;
        if refuses_wrap(&body) {
            return None;
        }
        let (limit, offset) = (limit.max(0), offset.max(0));
        let fetch = format!("OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY");
        // `ORDER BY NULL` is a syntax error; a subquery is the documented constant.
        if let Some(order_at) = trailing_order(&body) {
            if let Some(option_at) = trailing_option(&body) {
                if option_at > order_at {
                    let head = cut_at(&body, option_at);
                    let option: String = body.chars().skip(option_at).collect();
                    return Some(format!("{head} {fetch} {}", option.trim()));
                }
            }
            return Some(format!("{body} {fetch}"));
        }
        if trailing_option(&body).is_some() {
            return None;
        }
        if first_word(&body) == "WITH" {
            return Some(format!("{body} ORDER BY (SELECT NULL) {fetch}"));
        }
        Some(format!(
            "SELECT * FROM ({body}) AS [_page] ORDER BY (SELECT NULL) {fetch}"
        ))
    }

    fn count_select(&self, stmt: &str) -> Option<String> {
        let body = selectable(stmt)?;
        if refuses_wrap(&body) {
            return None;
        }
        let stripped = match trailing_order(&body) {
            Some(index) => cut_at(&body, index),
            None => body,
        };
        let (prefix, main) = split_cte(&stripped);
        let main = main.trim();
        if main.is_empty() {
            return None;
        }
        let counted = format!("SELECT COUNT(*) FROM ({main}) AS [_page]");
        if prefix.trim().is_empty() {
            Some(counted)
        } else {
            Some(format!("{} {counted}", prefix.trim_end()))
        }
    }

    fn quote_ident(&self, name: &str) -> String {
        format!("[{}]", name.replace(']', "]]"))
    }

    fn quote_literal(&self, value: &str) -> String {
        format!("N'{}'", value.replace('\'', "''"))
    }
}

fn selectable(stmt: &str) -> Option<String> {
    let body = stmt.trim().trim_end_matches(';').trim().to_string();
    if body.is_empty() {
        return None;
    }
    let verb = if first_word(&body) == "WITH" {
        first_word(&split_cte(&body).1)
    } else {
        first_word(&body)
    };
    if verb == "SELECT" {
        Some(body)
    } else {
        None
    }
}

/// `TOP`, `INTO`, `FOR XML`/`FOR JSON`, or an existing `OFFSET` cannot be wrapped.
fn refuses_wrap(sql: &str) -> bool {
    let words = depth0_words(sql);
    if words
        .iter()
        .any(|(word, _)| word == "TOP" || word == "INTO" || word == "OFFSET")
    {
        return true;
    }
    words
        .windows(2)
        .any(|pair| pair[0].0 == "FOR" && (pair[1].0 == "XML" || pair[1].0 == "JSON"))
}

fn trailing_order(sql: &str) -> Option<usize> {
    let words = depth0_words(sql);
    let mut order_at = None;
    for (index, (word, at)) in words.iter().enumerate() {
        if word == "ORDER" && words.get(index + 1).is_some_and(|(next, _)| next == "BY") {
            order_at = Some(*at);
        }
        if matches!(word.as_str(), "UNION" | "EXCEPT" | "INTERSECT" | "FOR") {
            order_at = None;
        }
    }
    order_at
}

/// A depth-0 `OPTION` clause. It cannot be wrapped in a derived table, and a
/// fetch clause has to be inserted before it.
fn trailing_option(sql: &str) -> Option<usize> {
    let words = depth0_words(sql);
    let mut option_at = None;
    for (word, at) in &words {
        if matches!(word.as_str(), "UNION" | "EXCEPT" | "INTERSECT" | "FOR") {
            option_at = None;
        }
        if word == "OPTION" {
            option_at = Some(*at);
        }
    }
    option_at
}

fn cut_at(sql: &str, char_index: usize) -> String {
    sql.chars()
        .take(char_index)
        .collect::<String>()
        .trim_end()
        .to_string()
}

fn first_word(sql: &str) -> String {
    let chars: Vec<char> = sql.chars().collect();
    next_word(&chars, 0)
        .map(|(word, _)| word)
        .unwrap_or_default()
}

/// `WITH name AS (...), name AS (...)` then the main statement.
/// A shape that isn't a CTE is returned whole, as the main text.
fn split_cte(sql: &str) -> (String, String) {
    let chars: Vec<char> = sql.chars().collect();
    let Some((word, mut i)) = next_word(&chars, 0) else {
        return (String::new(), sql.to_string());
    };
    if word != "WITH" {
        return (String::new(), sql.to_string());
    }
    loop {
        i = skip_gap(&chars, i);
        let name_end = skip_name(&chars, i);
        if name_end == i {
            return (String::new(), sql.to_string());
        }
        i = skip_gap(&chars, name_end);
        if chars.get(i) == Some(&'(') {
            i = skip_parens(&chars, i);
            i = skip_gap(&chars, i);
        }
        let Some((as_word, after_as)) = next_word(&chars, i) else {
            return (String::new(), sql.to_string());
        };
        if as_word != "AS" {
            return (String::new(), sql.to_string());
        }
        i = skip_gap(&chars, after_as);
        if chars.get(i) != Some(&'(') {
            return (String::new(), sql.to_string());
        }
        i = skip_parens(&chars, i);
        i = skip_gap(&chars, i);
        if chars.get(i) == Some(&',') {
            i += 1;
            continue;
        }
        break;
    }
    let prefix: String = chars[..i].iter().collect();
    let main: String = chars[i..].iter().collect();
    let verb = first_word(&main);
    if matches!(
        verb.as_str(),
        "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "MERGE"
    ) {
        (prefix, main)
    } else {
        (String::new(), sql.to_string())
    }
}

fn scan(chars: &[char]) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut start = 0;
    let mut i = 0;
    let mut block = 0i32;
    let mut paren = 0i32;
    let mut module = false;
    while i < chars.len() {
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }
        if let Some(next) = skip_comment(chars, i) {
            i = next;
            continue;
        }
        if let Some(next) = skip_string(chars, i) {
            i = next;
            continue;
        }
        if let Some(next) = skip_bracket(chars, i) {
            i = next;
            continue;
        }
        if let Some(next) = skip_quoted_ident(chars, i) {
            i = next;
            continue;
        }
        if chars[i] == '(' {
            paren += 1;
            i += 1;
            continue;
        }
        if chars[i] == ')' {
            paren = (paren - 1).max(0);
            i += 1;
            continue;
        }
        if let Some((word, after)) = read_word(chars, i) {
            if word == "GO" && at_line_start(chars, i) {
                if let Some(after_line) = go_line(chars, after) {
                    push(&mut ranges, chars, start, i);
                    i = after_line;
                    start = i;
                    module = false;
                    block = 0;
                    paren = 0;
                    continue;
                }
            }
            if !module
                && block == 0
                && paren == 0
                && matches!(word.as_str(), "CREATE" | "ALTER")
                && looks_like_module(chars, after)
            {
                module = true;
            } else if !module
                && paren == 0
                && (word == "CASE" || (word == "BEGIN" && !begins_transaction(chars, after)))
            {
                block += 1;
            } else if !module && paren == 0 && word == "END" {
                block = (block - 1).max(0);
            }
            i = after;
            continue;
        }
        if chars[i] == ';' && block == 0 && paren == 0 && !module {
            push(&mut ranges, chars, start, i);
            i += 1;
            start = i;
            continue;
        }
        i += 1;
    }
    push(&mut ranges, chars, start, chars.len());
    ranges
}

fn push(ranges: &mut Vec<(usize, usize)>, chars: &[char], start: usize, end: usize) {
    let mut from = start.min(end);
    let mut to = end.min(chars.len());
    while from < to && chars[from].is_whitespace() {
        from += 1;
    }
    while to > from && chars[to - 1].is_whitespace() {
        to -= 1;
    }
    if from < to {
        ranges.push((from, to));
    }
}

fn at_line_start(chars: &[char], index: usize) -> bool {
    chars[..index]
        .iter()
        .rev()
        .take_while(|c| **c != '\n')
        .all(|c| c.is_whitespace())
}

/// The rest of a `GO` line: optional repeat count and a `--` comment.
fn go_line(chars: &[char], mut i: usize) -> Option<usize> {
    while i < chars.len() && (chars[i] == ' ' || chars[i] == '\t') {
        i += 1;
    }
    if i < chars.len() && chars[i].is_ascii_digit() {
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
        while i < chars.len() && (chars[i] == ' ' || chars[i] == '\t') {
            i += 1;
        }
    }
    if i + 1 < chars.len() && chars[i] == '-' && chars[i + 1] == '-' {
        while i < chars.len() && chars[i] != '\n' {
            i += 1;
        }
    }
    while i < chars.len() && chars[i] != '\n' {
        if !chars[i].is_whitespace() {
            return None;
        }
        i += 1;
    }
    if i < chars.len() && chars[i] == '\n' {
        i += 1;
    }
    Some(i)
}

fn looks_like_module(chars: &[char], mut i: usize) -> bool {
    let mut words = Vec::new();
    for _ in 0..4 {
        let Some((word, after)) = next_word(chars, i) else {
            break;
        };
        words.push(word);
        i = after;
    }
    let mut rest = words.as_slice();
    if rest.first().is_some_and(|word| word == "OR") {
        rest = &rest[1..];
    }
    if rest.first().is_some_and(|word| word == "ALTER") {
        rest = &rest[1..];
    }
    matches!(
        rest.first().map(String::as_str),
        Some("PROCEDURE" | "PROC" | "FUNCTION" | "VIEW" | "TRIGGER")
    )
}

fn begins_transaction(chars: &[char], after: usize) -> bool {
    next_word(chars, after).is_some_and(|(word, _)| {
        matches!(
            word.as_str(),
            "TRAN" | "TRANSACTION" | "WORK" | "DISTRIBUTED"
        )
    })
}

fn depth0_words(sql: &str) -> Vec<(String, usize)> {
    let chars: Vec<char> = sql.chars().collect();
    let mut words = Vec::new();
    let mut i = 0;
    let mut paren = 0i32;
    while i < chars.len() {
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }
        if let Some(next) = skip_comment(&chars, i) {
            i = next;
            continue;
        }
        if let Some(next) = skip_string(&chars, i) {
            i = next;
            continue;
        }
        if let Some(next) = skip_bracket(&chars, i) {
            i = next;
            continue;
        }
        if let Some(next) = skip_quoted_ident(&chars, i) {
            i = next;
            continue;
        }
        if chars[i] == '(' {
            paren += 1;
            i += 1;
            continue;
        }
        if chars[i] == ')' {
            paren = (paren - 1).max(0);
            i += 1;
            continue;
        }
        if let Some((word, after)) = read_word(&chars, i) {
            if paren == 0 {
                words.push((word, i));
            }
            i = after;
            continue;
        }
        i += 1;
    }
    words
}

fn next_word(chars: &[char], mut i: usize) -> Option<(String, usize)> {
    loop {
        if i >= chars.len() {
            return None;
        }
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }
        if let Some(next) = skip_comment(chars, i) {
            i = next;
            continue;
        }
        return read_word(chars, i);
    }
}

fn read_word(chars: &[char], i: usize) -> Option<(String, usize)> {
    if i >= chars.len() || !is_ident_start(chars[i]) {
        return None;
    }
    let mut j = i + 1;
    while j < chars.len() && is_ident_cont(chars[j]) {
        j += 1;
    }
    let word: String = chars[i..j].iter().collect();
    Some((word.to_ascii_uppercase(), j))
}

fn skip_gap(chars: &[char], mut i: usize) -> usize {
    loop {
        if i >= chars.len() {
            return i;
        }
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }
        if let Some(next) = skip_comment(chars, i) {
            i = next;
            continue;
        }
        return i;
    }
}

fn skip_name(chars: &[char], i: usize) -> usize {
    if let Some(next) = skip_bracket(chars, i) {
        return next;
    }
    if let Some(next) = skip_quoted_ident(chars, i) {
        return next;
    }
    read_word(chars, i).map(|(_, next)| next).unwrap_or(i)
}

fn skip_parens(chars: &[char], i: usize) -> usize {
    if chars.get(i) != Some(&'(') {
        return i;
    }
    let mut depth = 0i32;
    let mut j = i;
    while j < chars.len() {
        if let Some(next) = skip_comment(chars, j) {
            j = next;
            continue;
        }
        if let Some(next) = skip_string(chars, j) {
            j = next;
            continue;
        }
        if let Some(next) = skip_bracket(chars, j) {
            j = next;
            continue;
        }
        if let Some(next) = skip_quoted_ident(chars, j) {
            j = next;
            continue;
        }
        if chars[j] == '(' {
            depth += 1;
            j += 1;
            continue;
        }
        if chars[j] == ')' {
            depth -= 1;
            j += 1;
            if depth == 0 {
                return j;
            }
            continue;
        }
        j += 1;
    }
    chars.len()
}

fn skip_comment(chars: &[char], i: usize) -> Option<usize> {
    if i + 1 < chars.len() && chars[i] == '-' && chars[i + 1] == '-' {
        let mut j = i + 2;
        while j < chars.len() && chars[j] != '\n' {
            j += 1;
        }
        return Some(j);
    }
    if i + 1 >= chars.len() || chars[i] != '/' || chars[i + 1] != '*' {
        return None;
    }
    let mut depth = 1i32;
    let mut j = i + 2;
    while j < chars.len() && depth > 0 {
        if j + 1 < chars.len() && chars[j] == '/' && chars[j + 1] == '*' {
            depth += 1;
            j += 2;
            continue;
        }
        if j + 1 < chars.len() && chars[j] == '*' && chars[j + 1] == '/' {
            depth -= 1;
            j += 2;
            continue;
        }
        j += 1;
    }
    Some(j)
}

fn skip_string(chars: &[char], i: usize) -> Option<usize> {
    let quote_at = if chars.get(i) == Some(&'\'') {
        i
    } else if matches!(chars.get(i), Some('N' | 'n'))
        && chars.get(i + 1) == Some(&'\'')
        && (i == 0 || !is_ident_cont(chars[i - 1]))
    {
        i + 1
    } else {
        return None;
    };
    let mut j = quote_at + 1;
    while j < chars.len() {
        if chars[j] == '\'' {
            if chars.get(j + 1) == Some(&'\'') {
                j += 2;
                continue;
            }
            return Some(j + 1);
        }
        j += 1;
    }
    Some(chars.len())
}

fn skip_bracket(chars: &[char], i: usize) -> Option<usize> {
    if chars.get(i) != Some(&'[') {
        return None;
    }
    let mut j = i + 1;
    while j < chars.len() {
        if chars[j] == ']' {
            if chars.get(j + 1) == Some(&']') {
                j += 2;
                continue;
            }
            return Some(j + 1);
        }
        j += 1;
    }
    Some(chars.len())
}

fn skip_quoted_ident(chars: &[char], i: usize) -> Option<usize> {
    if chars.get(i) != Some(&'"') {
        return None;
    }
    let mut j = i + 1;
    while j < chars.len() {
        if chars[j] == '"' {
            if chars.get(j + 1) == Some(&'"') {
                j += 2;
                continue;
            }
            return Some(j + 1);
        }
        j += 1;
    }
    Some(chars.len())
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_' || c == '#' || c == '@'
}

fn is_ident_cont(c: char) -> bool {
    is_ident_start(c) || c.is_ascii_digit() || c == '$'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn statements(sql: &str) -> Vec<String> {
        TSqlSql.split_statements(sql)
    }

    #[test]
    fn semicolons_split_and_quotes_brackets_and_nested_comments_do_not() {
        assert_eq!(
            statements("SELECT 1; SELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT 'a;b'; SELECT 2"),
            vec!["SELECT 'a;b'", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT N'a;b'; SELECT 2"),
            vec!["SELECT N'a;b'", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT [a;b]; SELECT 2"),
            vec!["SELECT [a;b]", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT [a]]b]; SELECT 2"),
            vec!["SELECT [a]]b]", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT 1 /* outer /* inner */ still */; SELECT 2"),
            vec!["SELECT 1 /* outer /* inner */ still */", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT 'it''s;fine'; SELECT 2"),
            vec!["SELECT 'it''s;fine'", "SELECT 2"]
        );
    }

    #[test]
    fn go_is_a_batch_separator_and_not_a_statement() {
        assert_eq!(
            statements("SELECT 1\nGO\nSELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
        assert_eq!(
            statements("SELECT 1\nGO 2 -- again\nSELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
        assert_eq!(statements("GO\nSELECT 1\nGO"), vec!["SELECT 1"]);
        assert_eq!(
            statements("SELECT 'GO\n'; SELECT 2"),
            vec!["SELECT 'GO\n'", "SELECT 2"]
        );
        assert_eq!(statements("SELECT 1 AS GO"), vec!["SELECT 1 AS GO"]);
    }

    #[test]
    fn begin_blocks_and_transactions_split_differently() {
        assert_eq!(
            statements("BEGIN\n  SELECT 1;\n  SELECT 2;\nEND"),
            vec!["BEGIN\n  SELECT 1;\n  SELECT 2;\nEND"]
        );
        assert_eq!(
            statements("BEGIN TRAN;\nSELECT 1;\nCOMMIT;"),
            vec!["BEGIN TRAN", "SELECT 1", "COMMIT"]
        );
        assert_eq!(
            statements("BEGIN TRANSACTION;\nSELECT 1;"),
            vec!["BEGIN TRANSACTION", "SELECT 1"]
        );
        assert_eq!(
            statements("SELECT CASE WHEN 1 = 1 THEN 1; ELSE 2 END"),
            vec!["SELECT CASE WHEN 1 = 1 THEN 1; ELSE 2 END"]
        );
    }

    #[test]
    fn module_bodies_run_to_the_next_go() {
        let script = "CREATE PROCEDURE p AS\nBEGIN\n  SELECT 1;\nEND\nGO\nSELECT 2";
        assert_eq!(
            statements(script),
            vec!["CREATE PROCEDURE p AS\nBEGIN\n  SELECT 1;\nEND", "SELECT 2"]
        );
        assert_eq!(
            statements("CREATE OR ALTER VIEW v AS\nSELECT 1;\nSELECT 2"),
            vec!["CREATE OR ALTER VIEW v AS\nSELECT 1;\nSELECT 2"]
        );
        assert_eq!(
            statements("CREATE TABLE t (a int);\nSELECT 1"),
            vec!["CREATE TABLE t (a int)", "SELECT 1"]
        );
        assert_eq!(
            statements("ALTER PROC p AS SELECT 1;\nGO\nSELECT 2"),
            vec!["ALTER PROC p AS SELECT 1;", "SELECT 2"]
        );
    }

    #[test]
    fn ranges_are_utf16_offsets() {
        let sql = "SELECT N'😀';SELECT 2";
        let ranges = TSqlSql.split_ranges(sql);
        let units: Vec<u16> = sql.encode_utf16().collect();
        let text =
            |range: SqlRange| String::from_utf16(&units[range.start..range.end]).expect("utf16");
        assert_eq!(ranges.len(), 2);
        assert_eq!(text(ranges[0]), "SELECT N'😀'");
        assert_eq!(text(ranges[1]), "SELECT 2");
    }

    #[test]
    fn classify_reads_the_main_verb() {
        assert_eq!(TSqlSql.classify("SELECT 1"), QueryKind::Select);
        assert_eq!(
            TSqlSql.classify("WITH c AS (SELECT 1 AS n) SELECT n FROM c"),
            QueryKind::Select
        );
        assert_eq!(
            TSqlSql.classify("WITH c AS (SELECT 1 AS id) UPDATE t SET a = 1"),
            QueryKind::Update
        );
        assert_eq!(
            TSqlSql.classify("MERGE t USING s ON 1 = 1 WHEN MATCHED THEN DELETE;"),
            QueryKind::Update
        );
        assert_eq!(
            TSqlSql.classify("INSERT INTO t VALUES (1)"),
            QueryKind::Insert
        );
        assert_eq!(TSqlSql.classify("DELETE FROM t"), QueryKind::Delete);
        assert_eq!(TSqlSql.classify("CREATE TABLE t (a int)"), QueryKind::Ddl);
        assert_eq!(TSqlSql.classify("EXEC sp_who"), QueryKind::System);
    }

    #[test]
    fn paging_appends_fetch_wraps_or_refuses() {
        assert_eq!(
            TSqlSql
                .paged_select("SELECT a FROM t ORDER BY a", 10, 5)
                .as_deref(),
            Some("SELECT a FROM t ORDER BY a OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY")
        );
        assert_eq!(
            TSqlSql.paged_select("SELECT a FROM t", 10, 0).as_deref(),
            Some("SELECT * FROM (SELECT a FROM t) AS [_page] ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY")
        );
        assert_eq!(
            TSqlSql.paged_select("WITH c AS (SELECT 1 AS n) SELECT n FROM c", 10, 5).as_deref(),
            Some("WITH c AS (SELECT 1 AS n) SELECT n FROM c ORDER BY (SELECT NULL) OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY")
        );
        assert_eq!(
            TSqlSql.paged_select("WITH c AS (SELECT 1 AS n) SELECT n FROM c ORDER BY n", 2, 0).as_deref(),
            Some("WITH c AS (SELECT 1 AS n) SELECT n FROM c ORDER BY n OFFSET 0 ROWS FETCH NEXT 2 ROWS ONLY")
        );
        assert!(TSqlSql
            .paged_select("SELECT TOP 10 a FROM t ORDER BY a", 10, 0)
            .is_none());
        assert!(TSqlSql
            .paged_select("SELECT a FROM t FOR XML PATH('row')", 10, 0)
            .is_none());
        assert!(TSqlSql
            .paged_select("SELECT a INTO #t FROM t", 10, 0)
            .is_none());
        assert!(TSqlSql
            .paged_select("INSERT INTO t VALUES (1)", 10, 0)
            .is_none());
        assert_eq!(
            TSqlSql
                .paged_select("SELECT a FROM t ORDER BY a OPTION (FAST 1)", 10, 5)
                .as_deref(),
            Some(
                "SELECT a FROM t ORDER BY a OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY OPTION (FAST 1)"
            )
        );
        assert!(TSqlSql
            .paged_select("SELECT a FROM t OPTION (FAST 1)", 10, 0)
            .is_none());
    }

    #[test]
    fn count_strips_the_trailing_order_and_keeps_ctes() {
        assert_eq!(
            TSqlSql
                .count_select("SELECT a FROM t ORDER BY a")
                .as_deref(),
            Some("SELECT COUNT(*) FROM (SELECT a FROM t) AS [_page]")
        );
        assert_eq!(
            TSqlSql
                .count_select("WITH c AS (SELECT 1 AS n) SELECT n FROM c ORDER BY n")
                .as_deref(),
            Some("WITH c AS (SELECT 1 AS n) SELECT COUNT(*) FROM (SELECT n FROM c) AS [_page]")
        );
        assert!(TSqlSql.count_select("SELECT TOP 1 a FROM t").is_none());
        assert_eq!(
            TSqlSql
                .count_select("SELECT a FROM t ORDER BY a OPTION (FAST 1)")
                .as_deref(),
            Some("SELECT COUNT(*) FROM (SELECT a FROM t) AS [_page]")
        );
    }

    #[test]
    fn quoting_uses_brackets_and_national_strings() {
        assert_eq!(TSqlSql.quote_ident("a]b"), "[a]]b]");
        assert_eq!(TSqlSql.quote_ident("order"), "[order]");
        assert_eq!(TSqlSql.quote_literal("it's"), "N'it''s'");
    }
}
