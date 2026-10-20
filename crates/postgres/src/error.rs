use db_core::{line_col_at, QueryError, QueryErrorCategory, QueryErrorPosition};
use tokio_postgres::error::ErrorPosition;

/// The fields of a server error that become a `QueryError`. A plain struct so
/// the mapping can be tested without a server (`DbError` can't be built here).
pub(crate) struct DbErrorParts {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub hint: Option<String>,
    pub original_position: Option<u32>,
    pub schema: Option<String>,
    pub table: Option<String>,
    pub column: Option<String>,
    pub constraint: Option<String>,
}

pub(crate) fn category_for_sqlstate(code: &str) -> QueryErrorCategory {
    use QueryErrorCategory::*;
    match code {
        "42601" | "42602" | "42611" | "42622" => Syntax,
        "42P01" | "42703" | "42883" | "42704" | "42P02" | "42702" | "42725" | "42P09" | "3F000"
        | "3D000" => Reference,
        "42501" => Permission,
        "57014" | "55P03" => Timeout,
        "57P01" | "57P02" | "57P03" | "53300" => Connection,
        _ if code.starts_with("23") => Constraint,
        _ if code.starts_with("28") => Permission,
        _ if code.starts_with("08") => Connection,
        _ => Other,
    }
}

pub(crate) fn query_error_from_parts(parts: DbErrorParts, sql: &str) -> QueryError {
    let position = parts.original_position.and_then(|offset| {
        line_col_at(sql, offset).map(|(line, column)| QueryErrorPosition {
            offset,
            line,
            column,
        })
    });
    QueryError {
        category: category_for_sqlstate(&parts.code),
        severity: Some(parts.severity),
        code: Some(parts.code),
        message: parts.message,
        detail: parts.detail,
        hint: parts.hint,
        position,
        schema: parts.schema,
        table: parts.table,
        column: parts.column,
        constraint: parts.constraint,
    }
}

/// Maps a driver error to a `QueryError`. `sql` is the statement that was sent,
/// which the server's position refers to.
pub(crate) fn query_error_from(err: &tokio_postgres::Error, sql: &str) -> QueryError {
    if let Some(db) = err.as_db_error() {
        return query_error_from_parts(
            DbErrorParts {
                severity: db.severity().to_string(),
                code: db.code().code().to_string(),
                message: db.message().to_string(),
                detail: db.detail().map(str::to_string),
                hint: db.hint().map(str::to_string),
                // An internal position refers to a query the server generated.
                original_position: match db.position() {
                    Some(ErrorPosition::Original(n)) => Some(*n),
                    _ => None,
                },
                schema: db.schema().map(str::to_string),
                table: db.table().map(str::to_string),
                column: db.column().map(str::to_string),
                constraint: db.constraint().map(str::to_string),
            },
            sql,
        );
    }
    let category = if err.is_closed() {
        QueryErrorCategory::Connection
    } else {
        match std::error::Error::source(err).and_then(|s| s.downcast_ref::<std::io::Error>()) {
            Some(io) if io.kind() == std::io::ErrorKind::TimedOut => QueryErrorCategory::Timeout,
            Some(_) => QueryErrorCategory::Connection,
            None => QueryErrorCategory::Other,
        }
    };
    QueryError::new(category, err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use db_core::{QueryErrorCategory as C, QueryErrorPosition};

    fn parts(code: &str) -> DbErrorParts {
        DbErrorParts {
            severity: "ERROR".into(),
            code: code.into(),
            message: "boom".into(),
            detail: None,
            hint: None,
            original_position: None,
            schema: None,
            table: None,
            column: None,
            constraint: None,
        }
    }

    #[test]
    fn category_for_sqlstate_maps_each_listed_code() {
        let cases = [
            ("42601", C::Syntax),
            ("42602", C::Syntax),
            ("42611", C::Syntax),
            ("42622", C::Syntax),
            ("42P01", C::Reference),
            ("42703", C::Reference),
            ("42883", C::Reference),
            ("42704", C::Reference),
            ("42P02", C::Reference),
            ("42702", C::Reference),
            ("42725", C::Reference),
            ("42P09", C::Reference),
            ("3F000", C::Reference),
            ("3D000", C::Reference),
            ("23505", C::Constraint),
            ("23503", C::Constraint),
            ("23502", C::Constraint),
            ("42501", C::Permission),
            ("28000", C::Permission),
            ("28P01", C::Permission),
            ("57014", C::Timeout),
            ("55P03", C::Timeout),
            ("08006", C::Connection),
            ("08001", C::Connection),
            ("57P01", C::Connection),
            ("57P02", C::Connection),
            ("57P03", C::Connection),
            ("53300", C::Connection),
            ("22012", C::Other),
            ("40P01", C::Other),
            ("XX000", C::Other),
        ];
        for (code, expected) in cases {
            assert_eq!(category_for_sqlstate(code), expected, "code {code}");
        }
    }

    #[test]
    fn parts_carry_all_fields() {
        let error = query_error_from_parts(
            DbErrorParts {
                severity: "ERROR".into(),
                code: "23505".into(),
                message: "duplicate key".into(),
                detail: Some("Key (id)=(1) already exists.".into()),
                hint: Some("try again".into()),
                original_position: None,
                schema: Some("public".into()),
                table: Some("t".into()),
                column: Some("id".into()),
                constraint: Some("t_pkey".into()),
            },
            "INSERT INTO t VALUES (1)",
        );
        assert_eq!(error.category, C::Constraint);
        assert_eq!(error.severity.as_deref(), Some("ERROR"));
        assert_eq!(error.code.as_deref(), Some("23505"));
        assert_eq!(error.message, "duplicate key");
        assert_eq!(
            error.detail.as_deref(),
            Some("Key (id)=(1) already exists.")
        );
        assert_eq!(error.hint.as_deref(), Some("try again"));
        assert_eq!(error.schema.as_deref(), Some("public"));
        assert_eq!(error.table.as_deref(), Some("t"));
        assert_eq!(error.column.as_deref(), Some("id"));
        assert_eq!(error.constraint.as_deref(), Some("t_pkey"));
        assert_eq!(error.position, None);
    }

    #[test]
    fn parts_position_is_converted_to_line_and_column() {
        let mut p = parts("42P01");
        p.original_position = Some(15);
        let error = query_error_from_parts(p, "SELECT 1\nFROM nope");
        assert_eq!(
            error.position,
            Some(QueryErrorPosition {
                offset: 15,
                line: 2,
                column: 6
            })
        );
    }

    #[test]
    fn parts_without_valid_position_have_none() {
        let sql = "SELECT 1";
        for position in [Some(0), Some(sql.len() as u32 + 2), None] {
            let mut p = parts("42601");
            p.original_position = position;
            assert_eq!(
                query_error_from_parts(p, sql).position,
                None,
                "{position:?}"
            );
        }
    }
}
