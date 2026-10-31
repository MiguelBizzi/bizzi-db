# Multi-database support (MySQL first)

## Problem

Bizzi DB stores a `dialect` on every connection and already has `Session` and `Adapter` traits, but nothing reads that dialect. Connect and test always construct `PostgresAdapter`. SQL splitting, paging, identifier quoting, table and routine DDL, and the SQL editor all assume PostgreSQL.

MySQL 8.0+ is the second engine. The work is only done when a third engine can be added by filling in the same boundary, without another pass through the UI.

## Goal

- PostgreSQL behaviour stays as it is.
- A MySQL 8.0+ connection (server image 8.4) can do the same jobs the product does for PostgreSQL, except where MySQL has no equivalent. Those gaps are listed below and are hidden in the UI, not approximated.
- Engine-specific SQL and catalog queries live in an engine module. The UI and the Tauri commands talk to capabilities and to `Session`, not to PostgreSQL.

## Success criteria

1. Saving a connection records the engine, and connect/test use the adapter registered for that engine. An engine with no adapter is rejected with a clear error.
2. An empty database name is valid for MySQL (the sidebar lists every user database on the server) and still required for PostgreSQL.
3. `bun run test:all` runs the same session checks against the Postgres seed and the MySQL seed.
4. Adding another engine is the checklist in `docs/adding-a-database.md`.
5. The desktop UI does not import `DIALECTS.PostgreSQL`, `lib/ddl/postgres/*`, or `objectDdlFor('PostgreSQL')` outside the dialect modules and their tests.

## Non-goals

- MariaDB, MySQL 5.7, SQLite, SQL Server, ClickHouse, and DuckDB as working engines. The enum may still name them.
- A trigger editor, event scheduler, or partition manager. PostgreSQL support does not have those either. MySQL triggers are in the seed and in the catalog fingerprint so a change is detected.
- A graphical `EXPLAIN` tree for MySQL. The statement still runs; the plan is shown as text.
- Rewriting editor SQL. `query_execute` stays unrestricted.

## Capability model

Each engine module publishes flags. The UI reads the flags. It does not branch on the engine name.

| Flag | PostgreSQL | MySQL 8 |
| --- | --- | --- |
| `transactionalDdl` | yes | no (DDL commits the current transaction) |
| `materializedViews` | yes | no |
| `routineOverloading` | yes | no |
| `orReplaceRoutines` | yes | no (edit is `DROP` then `CREATE`) |
| `partialIndexes` | yes | no |
| `onlineIndexBuild` | yes (`CONCURRENTLY`) | yes (`ALGORITHM=INPLACE, LOCK=NONE`) |
| `explainPlanTree` | yes | no |
| `routines` | yes | yes |
| `emptyDatabaseAllowed` | no | yes |

`RoutineDefinition.oid` is an opaque key for `routine_source`. PostgreSQL stores the numeric oid. MySQL stores `schema.kind.name`. The JSON field stays `oid` so saved tabs keep loading.

`QueryError.code` stays the SQLSTATE. `vendorCode` is the engine number when it has one (MySQL errno).

## Parity matrix

Everything else the product does for PostgreSQL is implemented for MySQL. These are the deliberate exclusions.

| PostgreSQL capability | MySQL | Status |
| --- | --- | --- |
| Materialized views | No such object. The option is hidden. | Hidden |
| Partial indexes, `INCLUDE`, operator classes, tablespaces, `NULLS NOT DISTINCT`, exclusion constraints | Not in MySQL. The fields are hidden. | Hidden |
| `CREATE INDEX CONCURRENTLY` | Replaced by `ALGORITHM=INPLACE, LOCK=NONE` when an online build is requested. | Implemented as `ALGORITHM=INPLACE, LOCK=NONE` |
| Overloaded routines, `RETURNS TABLE` / `SETOF`, languages other than SQL, volatility, parallel safety, leakproof, cost, rows | Not in MySQL. The form shows MySQL characteristics instead: deterministic, data access, `SQL SECURITY`, comment. | MySQL characteristics shown |
| DDL inside a transaction | Impossible. Pending schema changes run outside `BEGIN`/`COMMIT`, with a warning that MySQL commits DDL immediately. Row edits stay in one transaction. | Warned; row edits stay transactional |
| Graphical `EXPLAIN` tree | MySQL `EXPLAIN ANALYZE` is shown as text. | Text only (`explainPlanTree` is false) |
| Events and partition management | Out of scope for both engines. | Out of scope |
| Triggers as an editor | Fingerprinted only. No editor for either engine. | Fingerprinted only |

Checked against the MySQL 8.4 seed (`shop`, `analytics`, `ops`): the shared conformance suite covers connect, paging, every preview filter, error categories, and fingerprint stability. Object DDL is covered by the MySQL builder tests. A live pass needs `bun run db:up`.

## Backend boundary

- `ConnectConfig` carries `dialect`.
- `adapter_for(dialect)` in the desktop crate returns the engine. `validate_save_input` rejects dialects that function returns an error for, and allows an empty database only when the dialect says so.
- `SqlDialect` (`split`, `classify`, `paged_select`, `count_select`, `quote_ident`, `quote_literal`) lives in `db-core`. `PostgresSql` is today's splitter, unchanged. `MySqlSql` understands backticks, `#` comments, `-- ` comments (the space is required), backslash escapes, and client `DELIMITER` directives.
- `sql_statement_ranges` takes the connection id and splits with that connection's dialect.
- `crates/core` conformance tests (feature `conformance`) take a connected `Session` plus a small seed description and check execute, paging, preview filters, error categories, fingerprint stability across DML, and that introspection finds the shared tables.

## Frontend boundary

`DialectModule` in `packages/database` holds quoting, literals, the default schema, column types, object capabilities, the flags above, the CodeMirror dialect, the formatter language, and connection defaults (port, user, URI schemes).

`TableDdl`, `RowDml`, and `ObjectDdl` are pure SQL builders. PostgreSQL's stay in `lib/ddl/postgres`. MySQL's live in `lib/ddl/mysql`. Shared code passes drafts in and SQL out.

`CommandContext.capabilities.routines` gates New Function. Other flags hide controls inside the designers.

## MySQL connection behaviour

- Port 3306, user `root`, optional database (the default schema). `mysql://` URIs.
- TLS matches PostgreSQL: disabled, required (accept invalid certificates), or verified.
- `caching_sha2_password` over TLS and over a plain connection (server public key).
- The existing SSH tunnel is a TCP forward and is reused.
- Scripts run on one pooled connection so an editor `BEGIN`/`COMMIT` sticks. On error the session rolls back and returns the connection.
- Paging wraps the statement in `LIMIT`/`OFFSET`. If MySQL rejects the wrapper because of duplicate column names (errno 1060), the session streams the result and slices the page.
- Preview filters use bind parameters. `ILIKE` is `LOWER(CAST(col AS CHAR)) LIKE LOWER(?)`.
- Introspection reads `information_schema` with `information_schema_stats_expiry = 0`, skips `mysql`, `sys`, `information_schema`, and `performance_schema`, and fingerprints structural columns only (no row counts or sizes).

## Testing

- Unit tests for the MySQL splitter, filter SQL, error mapping, and value conversion. No server.
- Live tests, ignored unless MySQL is up, call the conformance suite and MySQL-specific cases (auth, `DELIMITER`, errno 1060 paging).
- CI's integration job runs the MySQL 8.4 service, loads `docker/mysql/init`, and runs `cargo test -p db-mysql -- --include-ignored`.
- TypeScript tests sit beside each `lib/ddl/mysql` module. `lib/dialectBoundary.test.ts` enforces the import rule.
