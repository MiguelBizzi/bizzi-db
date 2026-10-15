use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QueryErrorCategory {
    Syntax,
    Reference,
    Constraint,
    Permission,
    Connection,
    Timeout,
    Other,
}

/// Where in the statement the database says the error is. All values are
/// 1-based and count characters, not bytes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryErrorPosition {
    pub offset: u32,
    pub line: u32,
    pub column: u32,
}

/// A query failure as the database reported it, independent of the engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryError {
    pub category: QueryErrorCategory,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    /// SQLSTATE for Postgres.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<QueryErrorPosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraint: Option<String>,
}

impl QueryError {
    pub fn new(category: QueryErrorCategory, message: impl Into<String>) -> Self {
        Self {
            category,
            severity: None,
            code: None,
            message: message.into(),
            detail: None,
            hint: None,
            position: None,
            schema: None,
            table: None,
            column: None,
            constraint: None,
        }
    }
}

/// Converts a 1-based character offset into a 1-based (line, column).
/// An offset one past the last character is valid (an error at end of input).
pub fn line_col_at(sql: &str, offset: u32) -> Option<(u32, u32)> {
    if offset == 0 {
        return None;
    }
    let (mut line, mut column) = (1, 1);
    let mut seen = 0;
    for ch in sql.chars() {
        seen += 1;
        if seen == offset {
            return Some((line, column));
        }
        if ch == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    (seen + 1 == offset).then_some((line, column))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_col_at_first_line() {
        assert_eq!(line_col_at("SELEC 1", 1), Some((1, 1)));
        assert_eq!(line_col_at("SELEC 1", 7), Some((1, 7)));
    }

    #[test]
    fn line_col_at_later_lines() {
        let sql = "SELECT 1\nFROM t\nWHERE x";
        assert_eq!(line_col_at(sql, 10), Some((2, 1)));
        assert_eq!(line_col_at(sql, 17), Some((3, 1)));
    }

    #[test]
    fn line_col_at_counts_characters() {
        // `n` is the 13th character but the 14th byte.
        assert_eq!(line_col_at("SELECT 'é', nope", 13), Some((1, 13)));
    }

    #[test]
    fn line_col_at_rejects_out_of_range() {
        let sql = "SELECT 1";
        assert_eq!(line_col_at(sql, 0), None);
        assert_eq!(line_col_at(sql, sql.len() as u32 + 2), None);
        assert_eq!(line_col_at(sql, sql.len() as u32 + 1), Some((1, 9)));
    }

    #[test]
    fn query_error_serialises_camel_case_and_skips_none() {
        let value = serde_json::to_value(QueryError::new(QueryErrorCategory::Syntax, "x")).unwrap();
        assert_eq!(value, serde_json::json!({"category": "syntax", "message": "x"}));
    }
}
