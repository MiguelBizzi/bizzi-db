/// Quote a PostgreSQL identifier, escaping embedded double quotes.
pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub fn qualify_table(schema: &str, table: &str) -> String {
    format!("{}.{}", quote_ident(schema), quote_ident(table))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_plain_ident() {
        assert_eq!(quote_ident("users"), "\"users\"");
    }

    #[test]
    fn escapes_embedded_quotes() {
        assert_eq!(quote_ident("we\"ird"), "\"we\"\"ird\"");
    }

    #[test]
    fn qualifies_schema_table() {
        assert_eq!(qualify_table("public", "orders"), "\"public\".\"orders\"");
    }

    #[test]
    fn quotes_empty_unicode_and_injection_shaped_names() {
        assert_eq!(quote_ident(""), "\"\"");
        assert_eq!(quote_ident("usuários"), "\"usuários\"");
        assert_eq!(
            quote_ident("users\"; DROP TABLE t; --"),
            "\"users\"\"; DROP TABLE t; --\""
        );
    }
}
