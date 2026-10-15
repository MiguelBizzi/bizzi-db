# Query Error Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single flattened query error string with a structured error (category, SQLSTATE, message, position, detail, hint) that the SQL editor card renders clearly.

**Architecture:** `crates/core` defines a database-agnostic `QueryError` and attaches it to `QueryExecutionResult` as `error_info`, keeping the existing `error` string. `crates/postgres` maps `tokio_postgres::Error` into it. `packages/shared` mirrors the type, a pure `lib/queryError.ts` prepares display data, and a new `QueryErrorCard` replaces the inline error block.

**Tech Stack:** Rust (tokio-postgres 0.7.18, serde, thiserror), TypeScript, React 19, Tailwind v4, Bun test runner, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-15-query-error-messages-design.md`

## Before starting

- Work on a branch named `feat/query-error-messages`. `main` is clean except for untracked `.claude/`, which is not part of this work. Do not commit it.
- Rust tests: `cargo test -p db-core -p db-postgres --locked`. Integration tests need `bun run db:up` and are run with `-- --include-ignored`.
- TypeScript tests from `apps/desktop/`: `bun test <path>`. Type check: `bun run lint`.

## Global Constraints

- `QueryExecutionResult.error` stays a `string` and is set whenever `error_info` is set. No existing consumer of `error` changes.
- `error_info` and every field of `QueryError` except `category` and `message` are optional and skipped when serialising, as elsewhere in `crates/core/src/types.rs`.
- Wire format is camelCase. Category values are the lowercase strings `syntax`, `reference`, `constraint`, `permission`, `connection`, `timeout`, `other`.
- Positions are 1-based and count characters, not bytes.
- Only text the database returned is shown. No hint is written by this code.
- No new dependencies. No changes to Tauri command signatures.
- The card renders text only, never HTML.

## Review Focus

- Position on a statement containing multi-byte characters (`SELECT 'é', nope`): line and column count characters.
- A statement written with CRLF line endings: the excerpt shows the right line, with no stray `\r`.
- A very long single-line statement (several thousand characters): the excerpt is windowed, not the whole line.
- A position of 0, or past the end of the statement, or an internal position: no location is shown, and the message still is.
- An error with no SQLSTATE (dropped connection): the card shows the category and message with no code.
- A script whose second statement fails: the position is relative to that statement, and the first statement's result is unchanged.

---

### Task 1: Core error model

**Files:**
- Create: `crates/core/src/query_error.rs`
- Modify: `crates/core/src/lib.rs` (add `mod query_error;` and `pub use query_error::*;`), `crates/core/src/types.rs:195-216` (new field), `crates/core/src/profiles.rs:530,550` (test fixtures)
- Modify: `crates/postgres/src/session.rs:35,304,329` (add `error_info: None` so the workspace compiles)

**Interfaces:**
- Produces, in `db_core`:
  - `enum QueryErrorCategory { Syntax, Reference, Constraint, Permission, Connection, Timeout, Other }`, derives `Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize`, `#[serde(rename_all = "lowercase")]`.
  - `struct QueryErrorPosition { offset: u32, line: u32, column: u32 }`, camelCase.
  - `struct QueryError { category, severity: Option<String>, code: Option<String>, message: String, detail: Option<String>, hint: Option<String>, position: Option<QueryErrorPosition>, schema: Option<String>, table: Option<String>, column: Option<String>, constraint: Option<String> }`, camelCase, `Option` fields `skip_serializing_if = "Option::is_none"`, derives `Debug, Clone, PartialEq, Serialize, Deserialize`.
  - `QueryError::new(category: QueryErrorCategory, message: impl Into<String>) -> QueryError` (all optionals `None`).
  - `fn line_col_at(sql: &str, offset: u32) -> Option<(u32, u32)>`.
  - `QueryExecutionResult.error_info: Option<QueryError>` with `skip_serializing_if`.

- [ ] **Step 1: Write the failing tests** in `query_error.rs` (`#[cfg(test)] mod tests`):
  - `line_col_at_first_line`: `line_col_at("SELEC 1", 1) == Some((1, 1))`, `line_col_at("SELEC 1", 7) == Some((1, 7))`.
  - `line_col_at_later_lines`: for `"SELECT 1\nFROM t\nWHERE x"`, offset 10 → `Some((2, 1))`, offset 17 → `Some((3, 1))`.
  - `line_col_at_counts_characters`: for `"SELECT 'é', nope"`, offset 13 → `Some((1, 13))` (byte index would be 14).
  - `line_col_at_rejects_out_of_range`: offset 0 → `None`; offset `len + 2` → `None`; offset `len + 1` (just past the last character) → `Some`.
  - `query_error_serialises_camel_case_and_skips_none`: `serde_json::to_value(QueryError::new(Syntax, "x"))` equals `{"category":"syntax","message":"x"}`.

- [ ] **Step 2: Run to verify failure:** `cargo test -p db-core query_error --locked`. Expected: compile error, items not defined.

- [ ] **Step 3: Implement** the types and `line_col_at` in `query_error.rs`, add the module and re-export to `lib.rs`, add the `error_info` field to `QueryExecutionResult`, and set `error_info: None` in the five existing constructors listed above. `line_col_at` walks `sql.chars()`, treating `\n` as the line break; offsets are 1-based.

- [ ] **Step 4: Run to verify pass:** `cargo test -p db-core -p db-postgres --locked`. Expected: all pass, including the existing `history_item_classifies_sql_and_errors`.

- [ ] **Step 5: Commit**

```bash
git add crates/core crates/postgres/src/session.rs
git commit -m "feat(core): add structured QueryError to query results"
```

---

### Task 2: Postgres error mapping

**Files:**
- Create: `crates/postgres/src/error.rs`
- Modify: `crates/postgres/src/lib.rs` (add `mod error;`), `crates/postgres/src/session.rs` (`run_statement` ~L262, `error_result` ~L323, `run_script` ~L215)
- Test: unit tests in `error.rs`; integration tests in `crates/postgres/tests/session.rs`

**Interfaces:**
- Consumes: `QueryError`, `QueryErrorCategory`, `QueryErrorPosition`, `line_col_at` from Task 1.
- Produces, all `pub(crate)` in `error.rs`:
  - `struct DbErrorParts { severity: String, code: String, message: String, detail: Option<String>, hint: Option<String>, original_position: Option<u32>, schema: Option<String>, table: Option<String>, column: Option<String>, constraint: Option<String> }`
  - `fn category_for_sqlstate(code: &str) -> QueryErrorCategory`
  - `fn query_error_from_parts(parts: DbErrorParts, sql: &str) -> QueryError`
  - `fn query_error_from(err: &tokio_postgres::Error, sql: &str) -> QueryError`
- `error_result` changes signature to `fn error_result(sql: &str, timestamp: String, started: Instant, error: QueryError) -> QueryExecutionResult`. It sets `error: Some(error.message.clone())` and `error_info: Some(error)`.

- [ ] **Step 1: Write the failing unit tests** in `error.rs`:
  - `category_for_sqlstate_maps_each_listed_code`: assert one table of `(code, category)` pairs covering every row of the spec's mapping table, including class rules (`23505`, `23503` → constraint; `08006`, `08001` → connection; `28P01`, `28000` → permission) and the fallback (`22012`, `40P01`, `XX000` → other).
  - `parts_carry_all_fields`: parts with detail, hint, schema, table, column, constraint produce a `QueryError` with each copied, `severity`/`code`/`message` copied, and category from the code.
  - `parts_position_is_converted_to_line_and_column`: sql `"SELECT 1\nFROM nope"`, `original_position: Some(15)` → `position == Some(QueryErrorPosition { offset: 15, line: 2, column: 6 })`.
  - `parts_without_valid_position_have_none`: `original_position: Some(0)`, and one past the end of the statement, and `None` → `position == None`.

- [ ] **Step 2: Run to verify failure:** `cargo test -p db-postgres error:: --locked`. Expected: compile error.

- [ ] **Step 3: Implement** `category_for_sqlstate` and `query_error_from_parts` per the spec's table. Implement `query_error_from`: if `err.as_db_error()` is `Some(db)`, fill `DbErrorParts` from `db.severity()`, `db.code().code()`, `db.message()`, `db.detail()`, `db.hint()`, `db.schema()`, `db.table()`, `db.column()`, `db.constraint()` and `db.position()` (only `ErrorPosition::Original(n)`), then call `query_error_from_parts`. Otherwise build `QueryError::new(..., err.to_string())` with category: `Connection` when `err.is_closed()`; else inspect `std::error::Error::source(err)` downcast to `std::io::Error` (`TimedOut` → `Timeout`, any other → `Connection`); else `Other`.

- [ ] **Step 4: Run unit tests:** `cargo test -p db-postgres error:: --locked`. Expected: PASS.

- [ ] **Step 5: Write the failing integration tests** in `crates/postgres/tests/session.rs`, each `#[ignore = "requires local Postgres (bun run db:up / TEST_PG=1)"]` like its neighbours:
  - `syntax_error_is_structured`: `execute("SELEC 1", None)` → one result; `error_info.category == Syntax`, `code == Some("42601")`, `position.is_some()`, and `error` equals `error_info.message` and does not start with `db error`.
  - `missing_table_is_a_reference_error`: `execute("SELECT * FROM no_such_table_xyz", None)` → `Reference`, code `42P01`, position line 1 column 15.
  - `unique_violation_is_a_constraint_error`: one script `CREATE TEMP TABLE qe_t (id int PRIMARY KEY); INSERT INTO qe_t VALUES (1); INSERT INTO qe_t VALUES (1);` → three results; first two have `error_info == None`; third is `Constraint`, code `23505`, `constraint == Some("qe_t_pkey")`.
  - `failing_second_statement_position_is_statement_relative`: script `SELECT 1; SELEC 2;` → first result ok, second has `position` line 1 column 1.
  - `success_has_no_error_info`: `SELECT 1` → `error` and `error_info` both `None`.

- [ ] **Step 6: Run to verify failure:** `bun run db:up && cargo test -p db-postgres --test session --locked -- --include-ignored`. Expected: the five new tests FAIL (`error_info` is `None`).

- [ ] **Step 7: Wire it in.** `run_statement`'s failure arm passes `query_error_from(&err, stmt)` to `error_result`. In `run_script`, a failed `session.client()` returns `Ok(vec![error_result(sql, timestamp, started, QueryError::new(Connection, e.to_string()))])` instead of `Err`. `query_page` and `preview` already go through `run_statement`.

- [ ] **Step 8: Run to verify pass:** `cargo test --workspace --exclude db-desktop --locked -- --include-ignored`. Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add crates/postgres
git commit -m "feat(postgres): map database errors to structured QueryError"
```

---

### Task 3: Shared types and display helpers

**Files:**
- Modify: `packages/shared/src/index.ts:163-178` (types), `apps/desktop/src/types.ts` (add `QueryErrorInfo`, `QueryErrorCategory`, `QueryErrorPosition` to the `@db/shared` re-export list)
- Create: `apps/desktop/src/lib/queryError.ts`
- Test: `apps/desktop/src/lib/queryError.test.ts`

**Interfaces:**
- Consumes: the wire shape from Task 1.
- Produces, in `@db/shared`: `type QueryErrorCategory = 'syntax' | 'reference' | 'constraint' | 'permission' | 'connection' | 'timeout' | 'other'`; `interface QueryErrorPosition { offset: number; line: number; column: number }`; `interface QueryErrorInfo` with the same fields as the Rust struct (optional where Rust is `Option`); `QueryExecutionResult.errorInfo?: QueryErrorInfo`.
- Produces, in `lib/queryError.ts`:
  - `categoryLabel(category: QueryErrorCategory): string`
  - `interface ErrorExcerpt { lineNumber: number; text: string; caretColumn: number }`
  - `errorExcerpt(query: string, position: QueryErrorPosition | undefined): ErrorExcerpt | null`
  - `errorFacts(info: QueryErrorInfo): { label: string; value: string }[]`

- [ ] **Step 1: Write the failing tests** (`bun:test`, same style as `sqlQuery.test.ts`):
  - `categoryLabel`: `syntax` → `'Syntax error'`, `reference` → `'Reference error'`, `constraint` → `'Constraint violation'`, `permission` → `'Permission denied'`, `connection` → `'Connection error'`, `timeout` → `'Timeout'`, `other` → `'Error'`.
  - `errorExcerpt` ordinary: `errorExcerpt('SELECT 1\nFROM nope', { offset: 15, line: 2, column: 6 })` → `{ lineNumber: 2, text: 'FROM nope', caretColumn: 6 }`.
  - `errorExcerpt` CRLF: `'SELECT 1\r\nFROM nope'` with the same position → `text` is `'FROM nope'`, no `\r`.
  - `errorExcerpt` without position → `null`; with a line beyond the query's line count → `null`.
  - `errorExcerpt` windowing: a 5000-character single line with `column: 2500` → `text.length <= 122`, starts and ends with `'…'`, and `text[caretColumn - 1]` is the character the position points at.
  - `errorExcerpt` near the start of a long line (`column: 3`) → no leading `'…'`, trailing `'…'`, `caretColumn === 3`.
  - `errorFacts`: given detail, constraint, table, column, schema → rows in the order Detail, Constraint, Table, Column, Schema; empty and missing values are skipped; `hint` and `message` are not included.

- [ ] **Step 2: Run to verify failure:** `cd apps/desktop && bun test src/lib/queryError.test.ts`. Expected: cannot find module `./queryError`.

- [ ] **Step 3: Implement** the shared types and `lib/queryError.ts`. Window rule: lines over 120 characters show a 120-character slice centred on the caret (start `max(0, column - 1 - 60)`), prefixed or suffixed with `'…'` where the slice does not reach that end of the line, and `caretColumn` counts the prefix.

- [ ] **Step 4: Run to verify pass:** `cd apps/desktop && bun test src/lib/queryError.test.ts && bun run lint`. Expected: tests PASS, type check clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/desktop/src/types.ts apps/desktop/src/lib/queryError.ts apps/desktop/src/lib/queryError.test.ts
git commit -m "feat(desktop): query error types and display helpers"
```

---

### Task 4: Error card

**Files:**
- Create: `apps/desktop/src/components/SqlEditor/QueryErrorCard.tsx`
- Modify: `apps/desktop/src/components/SqlEditor/QueryResultsView.tsx:271-299` (replace the inline error block; drop the now-unused `queryErrorText` import only if nothing else in the file uses it, and `AlertCircle` likewise)

**Interfaces:**
- Consumes: `categoryLabel`, `errorExcerpt`, `errorFacts` (Task 3); `QueryExecutionResult.errorInfo`; `queryErrorText` from `lib/sqlQuery`.
- Produces: `QueryErrorCard({ result }: { result: QueryExecutionResult })`, rendering the card the spec describes.

- [ ] **Step 1: Implement `QueryErrorCard`.** Keep the current wrapper classes (`rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 font-mono text-xs`). With `result.errorInfo`: header row with `AlertCircle`, `categoryLabel(category)` and, on the right, the SQLSTATE `code` when present; the message; when `errorExcerpt(result.query, info.position)` is non-null, a line `Line L, column C` and a `<pre>` with the excerpt and a second line of spaces and `^` under `caretColumn`; then `errorFacts` rows as label/value pairs; then the hint under a `Hint` label; then the footer `Query failed in {executionTimeMs}ms`. Without `errorInfo`: header `SQL Execution Error`, body `queryErrorText(result.error)`, same footer, as today. All values render as React text children.

- [ ] **Step 2: Use it** in `QueryResultsView.tsx`: inside the existing `if (result.error && !isLoading)` branch, keep the `motion.div` wrapper and render `<QueryErrorCard result={result} />` in place of the inner block.

- [ ] **Step 3: Type check and tests:** `cd apps/desktop && bun run lint && bun test`. Expected: clean, all pass.

- [ ] **Step 4: Verify in the running app.** `bun run db:up`, then start the desktop dev server (`bun run dev`), connect to the local Postgres, and run each of these in the SQL editor, checking the card:
  - `SELEC 1`: Syntax error badge, `42601`, caret under `SELEC`.
  - `SELECT * FROM no_such_table`: Reference error, `42P01`, caret under the table name.
  - `CREATE TEMP TABLE t (id int PRIMARY KEY); INSERT INTO t VALUES (1); INSERT INTO t VALUES (1);`: Constraint violation, `23505`, constraint name and Detail row, with the two earlier results unaffected.
  - A multi-line query with the error on line 3, and one with `'é'` before the error.
  - `docker stop` the Postgres container, then run `SELECT 1`: a Connection error card without a code.
  - A query that succeeds still renders its grid.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/SqlEditor
git commit -m "feat(desktop): show structured query errors in the SQL editor"
```

---

## Self-review

- **Spec coverage:** data model → Task 1; Postgres mapping, category table, connection-acquire change, single `error_result` constructor → Task 2; TS types, helpers → Task 3; card and fallback rendering → Task 4; tests listed in the spec's Testing section → Tasks 1–3 plus the manual check in Task 4. Non-goals have no tasks, as intended.
- **Type consistency:** `QueryError`, `QueryErrorPosition`, `QueryErrorCategory`, `error_info`/`errorInfo`, `error_result` signature, and the three helper names are used identically across tasks.
- **Review Focus coverage:** multi-byte → Task 1 `line_col_at_counts_characters`; CRLF, windowing → Task 3 tests; invalid or internal position → Task 1 and Task 2 position tests (internal positions are never read in `query_error_from`); no SQLSTATE → Task 4 manual check, and the `code` row is conditional in the card; second-statement failure → Task 2 `failing_second_statement_position_is_statement_relative`.
