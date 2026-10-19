# Index & Function Management Design

## Problem

Bizzi DB manages tables (columns, create, drop, truncate) but stops there.

- **Indexes** show up only as a read-only grid in the schema designer. The `IndexDefinition` behind it records name, plain column list, uniqueness and method. Expression keys, sort order, `INCLUDE` columns, partial-index predicates, constraint ownership and the real definition are all lost. Nothing can be created, edited or dropped.
- **Functions and procedures** are never introspected. Schema sync doesn't notice when they change, and the UI has nowhere to show them.

Users leave the tool for performance work and for maintaining schema logic.

## Goal

List, view, create, edit and delete indexes and functions/procedures from Bizzi DB. Each operation follows PostgreSQL's actual rules, uses the existing UI patterns, and keeps the dialect-specific parts behind seams a second adapter can fill in.

## Success criteria

1. A table's Indexes tab shows every index with its keys (columns or expressions, ASC/DESC, NULLS order, opclass), method, uniqueness, `INCLUDE` columns, predicate, owning constraint, validity, size, scans and full definition.
2. The tab flags unused, redundant and invalid indexes, so users can see what each index costs and whether it is used.
3. Users can create an index with every option Postgres supports: method, unique, `NULLS NOT DISTINCT` (15+), `INCLUDE`, `WHERE`, storage parameters, tablespace, `CONCURRENTLY`, `IF NOT EXISTS`.
4. **Editing an index** uses `ALTER INDEX` where Postgres allows it (rename, `SET (...)`, `SET TABLESPACE`). Any other change becomes an explicit recreate: transactional, or concurrent with no downtime. The preview shows the exact SQL, with a warning.
5. Indexes that back a primary key, unique constraint or exclusion constraint are read-only, and the UI names the constraint.
6. The sidebar lists functions and procedures for the selected schema. Opening one shows parameters, return type, language, attributes, comment and a syntax-highlighted definition.
7. **Functions** are created and edited in a form with a code editor for the body.
   - Changes Postgres allows in place become `CREATE OR REPLACE`, `ALTER … RENAME TO` or `ALTER … SET SCHEMA`.
   - Signature changes become a warned, transactional `DROP` + `CREATE`.
8. Every drop asks the user to type the object's name. No statement uses `CASCADE`.
9. **No regression:** table editing, column CRUD, pending changes, the SQL editor and menus behave as before.

## Non-goals

- Aggregates and window functions (`prokind` `a`/`w`), and functions owned by extensions (hidden from the list).
- Triggers, sequences, ownership and `GRANT` management.
- Editing functions that have a SQL-standard body (`BEGIN ATOMIC`, PG14+). These are view-only, and "Open in SQL editor" is offered instead.
- Choosing the adapter by dialect. `lib.rs` still constructs `PostgresAdapter` directly.

## Design

### Data model (`crates/core`, mirrored in `packages/shared`)

- **`IndexDefinition`** keeps `name`, `columns`, `isUnique` and `type`, and gains new fields: `keys[]`, `includeColumns`, `predicate`, `definition`, `isPrimary`, `constraint {name, kind}`, `isValid`, `nullsNotDistinct`, `storageParams`, `tablespace`, `sizeBytes` and `scans`.
  - Every new field is optional or defaulted, so persisted data and older payloads still load.
- **`RoutineDefinition`** describes one function or procedure: `id = schema.name(identity args)`, `oid`, `kind`, `identityArguments`, `parameters[] {name, dataType, mode, default}`, `returnType`, `returnsSet`, `language`, `volatility`, `isStrict`, `securityDefiner`, `parallel`, `leakproof`, `cost`, `rows`, `hasSqlBody`, `comment` and `owner`.
  - `parallel` and `leakproof` are dialect-specific and optional.
- **`DatabaseSchema`** gains `routines`, `languages` and `serverVersionNum`.
- **`Session::routine_source(schema, oid)`** returns the full definition and the body text on demand, so introspection stays light. The default implementation returns "not supported", and other adapters opt in.

### PostgreSQL (`crates/postgres`)

- **Indexes** come from `pg_index` / `pg_class` / `pg_am`:
  - `pg_get_indexdef` for the full definition and for each key.
  - `indoption` for DESC and NULLS FIRST.
  - `indnkeyatts` to split key columns from `INCLUDE` columns.
  - `pg_get_expr(indpred)` for the predicate.
  - `pg_constraint.conindid` for the owning constraint.
  - `reloptions` for storage parameters.
  - Size and scan counts from `pg_relation_size` and `pg_stat_user_indexes`.
- **Routines** come from `pg_proc` with `prokind IN ('f','p')`, skipping system schemas and extension members.
  - `pg_get_function_identity_arguments` and `pg_get_function_result` supply the signature and return type.
  - The argument arrays and `pg_get_expr(proargdefaults)` supply per-parameter details.
  - `prosqlbody` is read on PG14 and later.
  - `routine_source` uses `pg_get_functiondef(oid)` together with `prosrc`.
- **The schema fingerprint** adds `pg_proc` rows and index predicates and options. It still excludes size and scan counts, so changes in usage alone don't trigger a re-sync.
- **`run_script`** issues a best-effort `ROLLBACK` after a failed statement, so a failed `BEGIN … COMMIT` no longer leaves an aborted transaction on a pooled client.

### Dialect seam (frontend)

- **`packages/database`:** `DialectMeta.objects` describes what the dialect can do: index methods and what each supports, concurrent builds, partial indexes, `NULLS NOT DISTINCT` and its minimum version, storage parameters, routine kinds, volatilities and parallel modes. The UI shows options based on these flags, not on hard-coded Postgres checks.
- **`apps/desktop/src/lib/ddl/`:**
  - `types.ts` holds the drafts and the `ObjectDdl` interface.
  - `registry.ts` provides `ddlFor(dialect)`.
  - `postgres/indexDdl.ts` and `postgres/routineDdl.ts` hold the Postgres builders.
  - All of them are pure and unit-tested.
- **Change plans:** `planIndexChange` and `planRoutineChange` return `{statements, mode, transactional, warnings}` or a refusal. The UI shows the SQL and any warnings before running anything.
- **Function bodies** are dollar-quoted with a tag that doesn't occur in the body.

### UI

- **Indexes** live in the existing Indexes sub-tab of `TableSchemaDesigner`:
  - A "New index" button opens `IndexDrawer`, which handles create and edit.
  - Rows expand to show the definition and any insights.
  - `DropIndexModal` asks for the index name before dropping.
- **Functions** get a new `function_designer` tab kind, rendered by `RoutineDesigner`:
  - View mode has Overview and Definition tabs.
  - Edit mode, and create mode when the tab has no routine, show the form, a CodeMirror body editor, a live preview and warnings.
  - `DropRoutineModal` asks for the name before dropping.
- **Read-only SQL** renders in a new `SqlCodeViewer`, which uses the same CodeMirror highlighting as the editor.
- **Navigation:**
  - The sidebar gets a "Functions" section.
  - The table context menu gets "New index…".
  - The menu gets File → New Function….
  - The palette gets a Functions section.
- **Running changes:** DDL runs directly through the existing `onExecute` path. `firstExecutionError` reports a failure in any statement, not only the first.

### Error handling

Database errors appear in the drawer or modal's inline error box, with the message Postgres returned (for example "cannot drop function … because other objects depend on it"). The UI never retries with `CASCADE`.

## Testing

- **TS unit tests:** exact-SQL tests for every builder and change plan (quoting, dollar-tag collisions, recreate modes, constraint refusals), plus tests for index insights and the action descriptors.
- **Rust:** unit tests for the fingerprint SQL. Live tests (`--include-ignored`) cover:
  - introspection of the new seed objects (`docker/postgres/init/04_routines.sql`, plus extra indexes in `01_schema.sql`)
  - fingerprint changes after function and index DDL
  - `routine_source`
  - the pool staying healthy after a failed transaction

## Risks

- **Large catalogs:** a database with thousands of functions could slow introspection. Bodies are fetched lazily and extension functions are hidden.
- **Concurrent recreate:** if the session dies midway, a leftover `_new` index can remain. The warning tells the user what to clean up.
