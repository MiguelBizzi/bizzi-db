# Adding a database engine

MySQL is the pattern. PostgreSQL is the other implementation of the same seams. An engine is finished when every box below is checked and the parity row in [the multi-database spec](superpowers/specs/2026-10-30-multi-database-design.md) says what you implemented and what you left out on purpose.

## 1. Rust adapter

- New crate `crates/<engine>` depending on `db-core`.
- Implement `Adapter` (`test_connection`, `connect`) and `Session` (`introspect`, `schema_fingerprint`, `execute`, `query_page`, `preview`, `routine_source`).
- Implement `SqlDialect` for the engine's comments, quotes, and statement terminator. Re-export the type from the crate.
- Map driver errors onto `QueryError`. Put the SQLSTATE in `code` and the vendor number in `vendor_code` when the engine has one.
- Quote identifiers and bind values in anything the app builds (filters, preview). Do not rewrite SQL the user typed.
- Register the adapter and the `SqlDialect` in `adapter_for` / `sql_dialect_for` in `apps/desktop/src-tauri/src/lib.rs`.
- Teach `dialect_is_supported` in `crates/core/src/profiles.rs` about the engine, and whether an empty database name is allowed.

## 2. Frontend module

- Add a `DialectModule` in `packages/database` (quoting, default port and user, URI schemes, column types, object capabilities, capability flags, CodeMirror dialect, formatter language).
- Add `lib/ddl/<engine>/` with `TableDdl`, `RowDml`, and `ObjectDdl`. Register them in `lib/ddl/registry.ts`.
- Hide controls whose capability flag is false. Do not emit another engine's syntax under a different name.
- Gate menu commands that the engine cannot run via `CommandContext.capabilities`.

## 3. Seed and tests

- Service in `docker-compose.yml` and scripts in `docker/<engine>/init`, documented next to the MySQL seed notes.
- Live tests in `crates/<engine>/tests`, ignored by default, calling `db_core::conformance::assert_session` plus anything only this engine does.
- Unit tests for the splitter, filters, and error mapping that do not need the server.
- A job or step in `.github/workflows/test.yml` that boots the service, loads the seed, and runs the ignored tests.
- `docker/` is already a desktop path in `.github/scripts/changed-areas.sh`, so a seed-only change still runs the desktop pipeline.

## 4. Say what you did not build

Add a row to the parity matrix in the spec. A missing feature needs a one-line reason (the engine has no such object, or the product does not do it for PostgreSQL either).
