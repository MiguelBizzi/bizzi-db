use db_core::{QueryError, QueryErrorCategory, QueryErrorPosition};
use mongodb::error::{Error, ErrorKind, WriteFailure};

use crate::shell::ShellError;

/// What kind of driver failure carried the error, for errors without a server code.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KindClass {
    Server,
    Connection,
    Auth,
    Other,
}

pub fn category(code: Option<i32>, class: KindClass) -> QueryErrorCategory {
    use QueryErrorCategory::*;
    match (code, class) {
        (Some(11000 | 11001), _) => Constraint,
        (Some(13 | 18 | 8000), _) => Permission,
        (Some(2 | 9 | 14 | 17287 | 40324 | 15974), _) => Syntax,
        (Some(26), _) => Reference,
        (Some(50 | 262), _) => Timeout,
        (_, KindClass::Connection) => Connection,
        (_, KindClass::Auth) => Permission,
        _ => Other,
    }
}

pub fn query_error(err: &Error) -> QueryError {
    let kind = err.kind.as_ref();
    let (code, code_name, message, class) = match kind {
        ErrorKind::Command(c) => (
            Some(c.code),
            Some(c.code_name.clone()),
            c.message.clone(),
            KindClass::Server,
        ),
        ErrorKind::Write(WriteFailure::WriteError(w)) => (
            Some(w.code),
            w.code_name.clone(),
            w.message.clone(),
            KindClass::Server,
        ),
        ErrorKind::Write(WriteFailure::WriteConcernError(w)) => (
            Some(w.code),
            Some(w.code_name.clone()),
            w.message.clone(),
            KindClass::Server,
        ),
        ErrorKind::InsertMany(many) => match many.write_errors.as_ref().and_then(|e| e.first()) {
            Some(w) => (
                Some(w.code),
                w.code_name.clone(),
                w.message.clone(),
                KindClass::Server,
            ),
            None => (None, None, kind.to_string(), KindClass::Other),
        },
        ErrorKind::Io(_)
        | ErrorKind::ServerSelection { .. }
        | ErrorKind::DnsResolve { .. }
        | ErrorKind::ConnectionPoolCleared { .. } => {
            (None, None, kind.to_string(), KindClass::Connection)
        }
        ErrorKind::Authentication { .. } => (None, None, kind.to_string(), KindClass::Auth),
        _ => (None, None, kind.to_string(), KindClass::Other),
    };
    let mut error = QueryError::new(category(code, class), message);
    error.code = code_name.filter(|name| !name.is_empty());
    error.vendor_code = code;
    error
}

/// `ShellError.offset` counts UTF-16 units, so the column does too: the editor
/// places the caret in a JavaScript string.
pub fn shell_query_error(err: &ShellError, text: &str) -> QueryError {
    let (mut line, mut column, mut units) = (1u32, 1u32, 0usize);
    for c in text.chars() {
        if units >= err.offset {
            break;
        }
        units += c.len_utf16();
        if c == '\n' {
            line += 1;
            column = 1;
        } else {
            column += c.len_utf16() as u32;
        }
    }
    let mut error = QueryError::new(QueryErrorCategory::Syntax, err.message.clone());
    error.position = Some(QueryErrorPosition {
        offset: err.offset as u32 + 1,
        line,
        column: Some(column),
    });
    error
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::parse_value;
    use mongodb::bson::{doc, from_document};
    use mongodb::error::{CommandError, ErrorKind, WriteError, WriteFailure};

    fn command_error(code: i32, code_name: &str) -> Error {
        let command: CommandError = from_document(doc! {
            "code": code,
            "codeName": code_name,
            "errmsg": "E11000 duplicate key error collection: shop.users",
        })
        .unwrap();
        ErrorKind::Command(command).into()
    }

    #[test]
    fn duplicate_key_is_constraint() {
        let err = query_error(&command_error(11000, "DuplicateKey"));
        assert_eq!(err.category, QueryErrorCategory::Constraint);
        assert_eq!(err.code.as_deref(), Some("DuplicateKey"));
        assert_eq!(err.vendor_code, Some(11000));
        assert_eq!(
            err.message,
            "E11000 duplicate key error collection: shop.users"
        );

        let write: WriteError = from_document(doc! {
            "code": 11000,
            "codeName": "DuplicateKey",
            "errmsg": "dup",
        })
        .unwrap();
        let err = query_error(&ErrorKind::Write(WriteFailure::WriteError(write)).into());
        assert_eq!(err.category, QueryErrorCategory::Constraint);
        assert_eq!(err.code.as_deref(), Some("DuplicateKey"));
        assert_eq!(err.vendor_code, Some(11000));
        assert_eq!(err.message, "dup");
    }

    #[test]
    fn server_codes_map_to_categories() {
        use KindClass::Server;
        use QueryErrorCategory::*;
        for (code, expected) in [
            (11001, Constraint),
            (13, Permission),
            (18, Permission),
            (8000, Permission),
            (2, Syntax),
            (9, Syntax),
            (14, Syntax),
            (17287, Syntax),
            (40324, Syntax),
            (15974, Syntax),
            (26, Reference),
            (50, Timeout),
            (262, Timeout),
            (112, Other),
        ] {
            assert_eq!(category(Some(code), Server), expected, "code {code}");
        }
        assert_eq!(category(None, KindClass::Connection), Connection);
        assert_eq!(category(None, KindClass::Auth), Permission);
        assert_eq!(category(None, KindClass::Other), Other);
    }

    #[test]
    fn io_is_connection() {
        let io = std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "refused");
        let err = query_error(&ErrorKind::Io(std::sync::Arc::new(io)).into());
        assert_eq!(err.category, QueryErrorCategory::Connection);
        assert_eq!(err.code, None);
        assert_eq!(err.vendor_code, None);
    }

    #[test]
    fn shell_error_has_position() {
        let text = "{\n  \"😀\": ]\n}";
        let shell = parse_value(text).unwrap_err();
        let err = shell_query_error(&shell, text);
        assert_eq!(err.category, QueryErrorCategory::Syntax);
        assert_eq!(err.message, shell.message);
        let position = err.position.expect("position");
        assert_eq!(position.line, 2);
        // UTF-16 columns, like the editor: the emoji counts as two.
        assert_eq!(position.column, Some(9));
        assert_eq!(position.offset, shell.offset as u32 + 1);
    }
}
