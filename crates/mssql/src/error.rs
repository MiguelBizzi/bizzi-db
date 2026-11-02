use db_core::{QueryError, QueryErrorCategory, QueryErrorPosition};

/// SQL Server has no SQLSTATE on TDS. The error number is the vendor code.
pub fn category_for_number(code: i32) -> QueryErrorCategory {
    match code {
        102 | 105 | 156 | 170 => QueryErrorCategory::Syntax,
        207 | 208 | 2812 => QueryErrorCategory::Reference,
        515 | 547 | 2601 | 2627 => QueryErrorCategory::Constraint,
        229 | 262 | 297 => QueryErrorCategory::Permission,
        18456 => QueryErrorCategory::Connection,
        -2 => QueryErrorCategory::Timeout,
        _ => QueryErrorCategory::Other,
    }
}

pub struct ServerError {
    pub number: i32,
    pub class: u8,
    pub message: String,
    pub procedure: String,
    pub line: u32,
}

pub fn query_error_from_server(error: ServerError, sql: &str) -> QueryError {
    QueryError {
        category: category_for_number(error.number),
        severity: Some(error.class.to_string()),
        code: None,
        vendor_code: Some(error.number),
        message: error.message,
        detail: (!error.procedure.is_empty()).then_some(error.procedure),
        hint: None,
        position: position_at_line(error.line, sql),
        schema: None,
        table: None,
        column: None,
        constraint: None,
    }
}

/// TDS reports a line and not a column. `column` stays empty; `offset` is the
/// start of that line so the editor can still highlight it.
fn position_at_line(line: u32, sql: &str) -> Option<QueryErrorPosition> {
    if line == 0 {
        return None;
    }
    let mut offset = 0u32;
    for (index, content) in sql.split('\n').enumerate() {
        if index as u32 + 1 == line {
            return Some(QueryErrorPosition {
                offset,
                line,
                column: None,
            });
        }
        offset = offset.saturating_add(content.chars().count() as u32 + 1);
    }
    Some(QueryErrorPosition {
        offset: 0,
        line,
        column: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_map_to_categories() {
        assert_eq!(category_for_number(102), QueryErrorCategory::Syntax);
        assert_eq!(category_for_number(156), QueryErrorCategory::Syntax);
        assert_eq!(category_for_number(208), QueryErrorCategory::Reference);
        assert_eq!(category_for_number(2812), QueryErrorCategory::Reference);
        assert_eq!(category_for_number(547), QueryErrorCategory::Constraint);
        assert_eq!(category_for_number(2627), QueryErrorCategory::Constraint);
        assert_eq!(category_for_number(229), QueryErrorCategory::Permission);
        assert_eq!(category_for_number(18456), QueryErrorCategory::Connection);
        assert_eq!(category_for_number(-2), QueryErrorCategory::Timeout);
        assert_eq!(category_for_number(1205), QueryErrorCategory::Other);
    }

    #[test]
    fn line_is_kept_and_column_is_absent() {
        let error = query_error_from_server(
            ServerError {
                number: 208,
                class: 16,
                message: "Invalid object name 'nope'.".into(),
                procedure: "dbo.touch".into(),
                line: 2,
            },
            "SELECT 1\nFROM nope",
        );
        assert_eq!(error.code, None);
        assert_eq!(error.vendor_code, Some(208));
        assert_eq!(error.severity.as_deref(), Some("16"));
        assert_eq!(error.detail.as_deref(), Some("dbo.touch"));
        let position = error.position.expect("position");
        assert_eq!(position.line, 2);
        assert_eq!(position.column, None);
        assert_eq!(position.offset, 9);
    }
}
