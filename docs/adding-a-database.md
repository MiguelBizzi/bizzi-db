# Adding a database engine

PostgreSQL, MySQL, and SQL Server are the pattern for a relational engine; MongoDB is the pattern for a document engine. Start with the next section. A relational engine is one crate, one dialect module with its `lib/ddl/<engine>/`, one registry entry on each side, one seed, and one live test file. It is finished when the contract tests pass and the parity spec says what you implemented and what you left out.

## Choosing a paradigm

The engine boundary has a paradigm axis. Pick the side that matches how the data is shaped; do not make a document store look like tables or the reverse.

| | Relational | Document |
|---|---|---|
| Rust traits (`db-core`) | `Adapter`, `Session`, `SqlDialect` | `DocumentAdapter`, `DocumentSession` |
| TypeScript metadata (`@db/database`) | `DialectModule` (quoting, DDL, capability flags) | `DocumentEngineMeta` (nouns, connection params, index key kinds, `DocumentCapabilities`) |
| Contract test | `conformance::assert_session` | `conformance::assert_document_session` |
| Desktop process | `EngineKind::Relational`, `LiveSession::Relational` | `EngineKind::Document`, `LiveSession::Document` |

The rest of this guide describes the relational path. A document engine follows sections 1, 3 (with `assert_document_session`) and 4, implements `DocumentAdapter` and `DocumentSession` in place of the SQL contract, and fills in a `DocumentEngineMeta`. `crates/mongo` and `packages/database/src/mongo.ts` are the reference.

The document UI in `apps/desktop/src/lib/document` and `components/DocumentView` is MongoDB-flavoured: the editable text is Extended JSON, completion follows the Mongo shell (`shellComplete.ts`), and a save conflict is recognised by MongoDB's message (`isConflictError`). A second document engine supplies its own editable-text format, completion and conflict detection rather than reusing those as they are.

A new paradigm (key-value, graph) adds a trait pair in `db-core`, a `LiveSession` and `EngineKind` variant, an `EngineMeta` subtype, a tab type, and its own view. Shared UI reads `EngineMeta.paradigm` and nouns, never an engine name. Relational-only features (Create, routines, the ERD, schema designer, Pending Changes, metrics) are gated on `paradigm === 'relational'` (`isRelational` in `lib/commands/registry.ts`, `isRelational` in `Sidebar.tsx`), so a new paradigm starts without them and gates its own features on its paradigm.

## 1. Register it in two places

Rust metadata lives in `crates/core/src/engines.rs` (`EngineSpec`: label, whether a database name is required, default port, `supported`). The desktop process registers the `Adapter` and `SqlDialect` trait objects in `REGISTERED_ENGINES` in `apps/desktop/src-tauri/src/lib.rs`. `db-core` cannot hold the adapters, because the engine crates depend on it. `every_supported_engine_is_registered_once` fails when the two lists disagree.

A document engine registers as `EngineKind::Document { adapter }` in the same `REGISTERED_ENGINES` list, with a `DocumentAdapter` and no `SqlDialect`.

Unknown dialect strings are errors. There is no silent fallback to PostgreSQL.

The TypeScript side is the `DIALECTS` record in `packages/database`. `objectDdlFor`, `tableDdlFor`, and `dialectMeta` read from it. `apps/desktop/src/lib/ddl/registry.ts` registers `TableDdl` and `ObjectDdl`.

## 2. Implement the contract

- Crate `crates/<engine>` implementing `Adapter`, `Session`, and `SqlDialect`. Re-export the dialect type.
- Map driver errors onto `QueryError`. `code` is the SQLSTATE when the engine has one; `vendor_code` is the engine's number. `QueryErrorPosition.column` may be absent.
- Quote identifiers and bind values in SQL the app builds. Do not rewrite SQL the user typed.
- A `DialectModule`: quoting, transaction wrapper, page clause, case-insensitive match, default port and user, URI schemes, empty editor SQL, column types, object capabilities, and the capability flags. New flags are booleans on every engine, because `engineContract.test.ts` checks each one.
- `lib/ddl/<engine>/` for table, index, routine, view, and row SQL. `planScript` joins statements with the module's `scriptSeparator` and wraps a multi-statement plan in the module's transaction.
- Pass `dialect` into every helper that emits SQL. A default of PostgreSQL is rejected by `dialectBoundary.test.ts`.

## 3. Pass the contract tests

- `packages/database/src/engineContract.test.ts` — every supported dialect fills the shared hooks and capability flags.
- `apps/desktop/src/lib/ddl/engineContract.test.ts` — every supported dialect has table and object builders.
- `apps/desktop/src/lib/dialectBoundary.test.ts` — engine syntax and engine-name branches stay inside dialect modules.
- `crates/core` — every registered engine round-trips through `dialect_str` / `parse_dialect`.
- Unit tests for the splitter, paging, filters, values, and error mapping, with no server.
- Ignored live tests in `crates/<engine>/tests` calling `db_core::conformance::assert_session`, plus the cases only this engine has. `bun run test:all` runs them.

## 4. Seed, CI, and the parity note

- A service in `docker-compose.yml` and idempotent scripts in `docker/<engine>/init`, documented in `docker/README.md`.
- A step in `.github/workflows/test.yml` that boots the service, loads the seed (a GitHub service container does not mount `docker/<engine>/init`, so the job runs the scripts itself), and runs `cargo test -p db-<engine> -- --include-ignored`.
- A spec under `docs/superpowers/specs/` with a capability table and a parity matrix. A missing feature needs a one-line reason.
