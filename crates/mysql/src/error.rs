use db_core::{line_col_at, QueryError, QueryErrorCategory, QueryErrorPosition};

pub struct MysqlErrorParts {
    pub code: u16,
    pub state: String,
    pub message: String,
}

pub fn category_for_errno(code: u16) -> QueryErrorCategory {
    use QueryErrorCategory::*;
    match code {
        1064 | 1065 | 1149 => Syntax,
        1049 | 1051 | 1054 | 1109 | 1146 | 1305 => Reference,
        1048 | 1062 | 1216 | 1217 | 1264 | 1265 | 1364 | 1406 | 1451 | 1452 | 1586 | 3819
        | 4025 => Constraint,
        1044 | 1045 | 1142 | 1143 | 1227 | 1370 => Permission,
        1205 | 1317 | 3024 => Timeout,
        1053 | 2002 | 2003 | 2006 | 2013 => Connection,
        _ => Other,
    }
}

pub fn query_error_from_parts(parts: MysqlErrorParts, sql: &str) -> QueryError {
    QueryError {
        category: category_for_errno(parts.code),
        severity: Some("ERROR".into()),
        code: if parts.state.is_empty() {
            None
        } else {
            Some(parts.state)
        },
        vendor_code: Some(i32::from(parts.code)),
        message: parts.message.clone(),
        detail: None,
        hint: None,
        position: position_from_message(&parts.message, sql),
        schema: None,
        table: None,
        column: None,
        constraint: None,
    }
}

/// MySQL says `near 'token' at line N`. That token is located on line N.
pub fn position_from_message(message: &str, sql: &str) -> Option<QueryErrorPosition> {
    let marker = "near '";
    let at = message.find(marker)?;
    let rest = &message[at + marker.len()..];
    let end = rest.find("' at line ")?;
    let token = &rest[..end];
    let line_text = rest[end + "' at line ".len()..].trim();
    let line_num: u32 = line_text
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    if line_num == 0 {
        return None;
    }
    let lines: Vec<&str> = sql.split('\n').collect();
    let line = lines.get((line_num as usize) - 1)?;
    let column = line.find(token).map(|i| i + 1).unwrap_or(1) as u32;
    let mut offset = column;
    for previous in lines.iter().take((line_num as usize) - 1) {
        offset += previous.chars().count() as u32 + 1;
    }
    let (line, column) = line_col_at(sql, offset)?;
    Some(QueryErrorPosition {
        offset,
        line,
        column,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errno_maps_to_a_category() {
        assert_eq!(category_for_errno(1064), QueryErrorCategory::Syntax);
        assert_eq!(category_for_errno(1062), QueryErrorCategory::Constraint);
        assert_eq!(category_for_errno(1146), QueryErrorCategory::Reference);
        assert_eq!(category_for_errno(1054), QueryErrorCategory::Reference);
        assert_eq!(category_for_errno(1045), QueryErrorCategory::Permission);
        assert_eq!(category_for_errno(1205), QueryErrorCategory::Timeout);
        assert_eq!(category_for_errno(2006), QueryErrorCategory::Connection);
    }

    #[test]
    fn near_token_becomes_a_position() {
        let sql = "SELECT 1;\nSELEC 1";
        let message = "You have an error in your SQL syntax near 'SELEC 1' at line 2";
        let error = query_error_from_parts(
            MysqlErrorParts {
                code: 1064,
                state: "42000".into(),
                message: message.into(),
            },
            sql,
        );
        assert_eq!(error.vendor_code, Some(1064));
        assert_eq!(error.code.as_deref(), Some("42000"));
        let position = error.position.expect("position");
        assert_eq!(position.line, 2);
        assert_eq!(position.column, 1);
    }
}
