use crate::types::HistoryQueryType;

pub const DEFAULT_ROW_CAP: usize = 1000;
pub const DEFAULT_PREVIEW_LIMIT: i64 = 100;

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
}
