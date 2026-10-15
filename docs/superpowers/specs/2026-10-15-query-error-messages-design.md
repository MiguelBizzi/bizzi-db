# Query Error Messages Design

## Problem

When a query fails, Bizzi DB reduces the failure to one string. `run_statement` in `crates/postgres/src/session.rs` calls `err.to_string()` on a `tokio_postgres::Error`. The SQLSTATE code, error position, detail, hint and the table, column and constraint names are discarded. The SQL editor then prints that string under a fixed "SQL Execution Error" heading, with no category and no location.

A typo in a column name, a missing table, a unique violation and a dropped connection all look alike. The user has to guess, or copy the query into another tool.

## Goal

A failed query shows:

- the real error the database returned,
- what kind of error it is,
- where in the statement it happened, when the database says,
- the database's own hint, when it gave one.

## Success criteria

1. The SQL editor error card shows the database's message, the SQLSTATE code, and a category badge.
2. Syntax, reference, constraint, permission, connection and timeout errors are told apart. Anything else is `other`.
3. When Postgres reports a position, the card shows `line:column` and the offending line with a caret under the error.
4. The server's `HINT` and `DETAIL`, and the constraint, table and column names it reports, reach the user.
5. No hint is invented. Only what the database sent is shown.
6. Nothing sensitive is added to the message. Passwords and connection strings never appear.
7. Existing behaviour is unchanged: result display, paging, history, toasts, drawers.

## Non-goals

- Highlighting the error position inside the CodeMirror editor.
- Suggestions or auto-fixes written by us (for example "did you mean ..."). Postgres already produces `HINT` text for some cases and we show that verbatim.
- Structured errors for non-query commands (saving a connection, schema sync). They keep their string errors.
- A second database adapter. The model is database-agnostic so a later adapter fills in the same struct, but only Postgres exists today.

## Design

### Data model (`crates/core`)

A new module `query_error.rs`, re-exported from `lib.rs`:

```rust
#[serde(rename_all = "lowercase")]
pub enum QueryErrorCategory {
    Syntax, Reference, Constraint, Permission, Connection, Timeout, Other,
}

#[serde(rename_all = "camelCase")]
pub struct QueryErrorPosition {
    pub offset: u32, // 1-based character offset into the statement
    pub line: u32,   // 1-based
    pub column: u32, // 1-based, in characters
}

#[serde(rename_all = "camelCase")]
pub struct QueryError {
    pub category: QueryErrorCategory,
    pub severity: Option<String>,
    pub code: Option<String>,   // SQLSTATE for Postgres
    pub message: String,
    pub detail: Option<String>,
    pub hint: Option<String>,
    pub position: Option<QueryErrorPosition>,
    pub schema: Option<String>,
    pub table: Option<String>,
    pub column: Option<String>,
    pub constraint: Option<String>,
}
```

Optional fields are skipped when serialising, matching the rest of `types.rs`.

`QueryExecutionResult` gains `error_info: Option<QueryError>`, serialised as `errorInfo`.

`QueryExecutionResult.error` stays and is always set whenever `error_info` is. Its value becomes the database's primary message, without the `db error: ERROR:` wrapper. This keeps every existing consumer working: the toasts, the insert, column and table drawers, the foreign key picker, the grid, history (`error_message`), and the editor's page refresh.

A pure helper `line_col_at(sql: &str, offset: u32) -> Option<(u32, u32)>` in the same module converts a 1-based character offset to line and column. It returns `None` for an offset of 0 or past the end of the statement.

### Postgres mapping (`crates/postgres/src/error.rs`)

`query_error_from(err: &tokio_postgres::Error, sql: &str) -> QueryError`.

For a server error (`err.as_db_error()` is `Some`), take `severity`, `code`, `message`, `detail`, `hint`, `schema`, `table`, `column` and `constraint` straight from the `DbError`. Position comes from `ErrorPosition::Original(n)`, which is a character offset into the submitted statement. `ErrorPosition::Internal` refers to a query the server generated, not the user's, so it is ignored.

The conversion goes through a plain struct of those fields, so the mapping can be unit-tested without a server. A `DbError` cannot be built outside `tokio_postgres`.

Category from SQLSTATE:

| Category | SQLSTATE |
| --- | --- |
| `syntax` | `42601`, `42602`, `42611`, `42622` |
| `reference` | `42P01`, `42703`, `42883`, `42704`, `42P02`, `42702`, `42725`, `42P09`, `3F000`, `3D000` |
| `constraint` | any code in class `23` |
| `permission` | `42501`, any code in class `28` |
| `timeout` | `57014`, `55P03` |
| `connection` | any code in class `08`, `57P01`, `57P02`, `57P03`, `53300` |
| `other` | everything else |

For an error that is not a server error:

- `err.is_closed()` gives `connection`.
- A source `std::io::Error` of kind `TimedOut` gives `timeout`.
- Any other source `io::Error` gives `connection`.
- Anything else gives `other`.

`code` is `None` and `message` is `err.to_string()` in these cases.

Failing to acquire a pooled connection in `run_script` currently returns `Err(AdapterError)`. The frontend turns the rejection into a synthetic result. It now returns one error result with category `connection`, so these errors use the same card. The message is the pool error text, which contains no credentials.

Every place that builds an error result uses one constructor, `error_result(sql, timestamp, started, QueryError)`, which sets both `error` and `error_info`.

### Frontend

`packages/shared/src/index.ts` gets `QueryErrorCategory` and `QueryErrorInfo`, and `QueryExecutionResult.errorInfo?: QueryErrorInfo`.

`apps/desktop/src/lib/queryError.ts` (pure, tested with `bun test`):

- `categoryLabel(category)` returns the badge text: Syntax error, Reference error, Constraint violation, Permission denied, Connection error, Timeout, Error.
- `errorExcerpt(query, position)` returns `{ lineNumber, text, caretColumn }` for the offending line, or `null` without a position. Lines longer than 120 characters are windowed around the caret, with `…` at the cut edges.
- `errorFacts(info)` returns the labelled rows to show: Detail, Constraint, Table, Column, Schema, in that order, skipping empty ones.

`apps/desktop/src/components/SqlEditor/QueryErrorCard.tsx` replaces the inline error block in `QueryResultsView.tsx`. Layout, in the existing red, monospace, minimal style:

1. Header: icon, category badge, and the SQLSTATE code on the right.
2. Message.
3. When a position exists: `Line L, column C` and the excerpt, with a caret under the error column.
4. Facts rows, then the hint.
5. The existing footer, "Query failed in Nms".

Without `errorInfo` (for example the synthetic result from a rejected invoke) the card renders as it does today. The header reads "SQL Execution Error" and the message is `queryErrorText(result.error)`.

Safety: the card renders text only, never as HTML. No new data is added beyond what the database returned.

### Data flow

```
tokio_postgres::Error ──query_error_from──▶ QueryError
        │                                      │
        └──────── error_result(sql, …) ◀───────┘
                       │ sets error = message, error_info = Some(QueryError)
                       ▼
        QueryExecutionResult ──Tauri (serde, camelCase)──▶ QueryExecutionResult (TS)
                                                              │
                              QueryErrorCard ◀── queryError.ts helpers
```

The Tauri commands pass `QueryExecutionResult` through unchanged. No command signature changes.

## Error handling and edge cases

- **Position past the end of the statement.** `line_col_at` returns `None`, and the card omits the location.
- **Multi-statement scripts.** Each statement has its own result and its own `query`. The position is relative to that statement, and the excerpt is cut from the same `query`, so they always agree.
- **Paged wrapper.** If wrapping a `SELECT` for paging fails, the statement runs again as written. The error reported is the one from the statement as written, so the position refers to what the user typed.
- **Multi-byte characters.** Postgres counts characters, not bytes. `line_col_at` and `errorExcerpt` count characters.
- **Tabs and CRLF.** A `\n` starts a new line, a `\r` before it is stripped for display, and a tab counts as one column.
- **Empty or missing message.** `queryErrorText` keeps its fallback.

## Testing

Rust, unit tests:

- `line_col_at`: first line, later lines, multi-byte characters, offset 0, offset past the end.
- Category mapping for each row of the table above, including the class-based rules and the `other` fallback.
- The parts-to-`QueryError` conversion: all fields carried over, and a position produced only when the offset is valid.

Rust, integration tests in `crates/postgres/tests/session.rs`, ignored unless a local Postgres is up, like the existing ones:

- `SELEC 1` gives category `syntax`, code `42601`, and a position.
- `SELECT * FROM no_such_table` gives `reference`, code `42P01`, and the position of the table name.
- A temp table with a primary key, then a duplicate insert in the same script, gives `constraint`, code `23505`, and the constraint name.
- A successful statement leaves `error` and `errorInfo` both unset.

TypeScript, `bun test`: `queryError.test.ts` for `categoryLabel`, `errorExcerpt` (ordinary, windowed, CRLF, missing position) and `errorFacts`.

Manual check in the running app: trigger a syntax error, a missing table, a unique violation and a dropped connection, and confirm the card for each.

## Compatibility

The change is additive on the wire. The older string field is kept, so no consumer needs to change for the app to keep working. Saved history stores `error_message` from `error`, which now reads without the `db error: ERROR:` prefix. Existing history rows are unchanged.
