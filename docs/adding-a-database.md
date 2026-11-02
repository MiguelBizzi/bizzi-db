# Adding a database engine

PostgreSQL, MySQL, and SQL Server are the pattern. A fourth engine is one crate, one dialect module with its `lib/ddl/<engine>/`, one registry entry on each side, one seed, and one live test file. It is finished when the contract tests pass and the parity spec says what you implemented and what you left out.

## 1. Register it in two places

Rust metadata lives in `crates/core/src/engines.rs` (`EngineSpec`: label, whether a database name is required, default port, `supported`). The desktop process registers the `Adapter` and `SqlDialect` trait objects in `REGISTERED_ENGINES` in `apps/desktop/src-tauri/src/lib.rs`. `db-core` cannot hold the adapters, because the engine crates depend on it. `every_supported_engine_is_registered_once` fails when the two lists disagree.

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
- A step in `.github/workflows/test.yml` that boots the service, loads the seed, and runs `cargo test -p db-<engine> -- --include-ignored`.
- A spec under `docs/superpowers/specs/` with a capability table and a parity matrix. A missing feature needs a one-line reason.
