# Index & Function Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Spec:** `docs/superpowers/specs/2026-10-18-index-function-management-design.md`


## Context
Bizzi DB manages tables (columns, create/drop/truncate) but not indexes or functions. Today indexes appear only as a read-only grid in `TableSchemaDesigner`'s Indexes sub-tab, backed by a thin `IndexDefinition {name, columns, isUnique, type}`. That type drops expression keys, predicates, DESC/NULLS ordering, INCLUDE columns, constraint ownership and the real definition. Functions aren't introspected at all: no `pg_proc` query, no fingerprint coverage, no UI. Users have to leave the tool to tune performance or maintain schema logic. The goal is full list/view/create/edit/delete for both object types. It should follow the existing patterns (direct execution with a live SQL preview, type-the-name confirmation for drops, pure `lib/*.ts` builders tested with `bun:test`) and keep the dialect-specific parts isolated so MySQL/SQLite can be added later.

Decisions already made with you:
- Functions get a sidebar section under "Tables & Views" and open in a new `function_designer` tab.
- DDL runs directly, the same way column edits do (no pending-changes staging).
- Functions are authored in a structured form plus a CodeMirror body editor, with a live `CREATE OR REPLACE` preview.
- The two DDL execution bugs are fixed as part of this work.

## Phase 0 — Spec doc + execution fixes
- Write `docs/superpowers/specs/2026-10-18-index-function-management-design.md` and `docs/superpowers/plans/2026-10-18-index-function-management.md`, following repo conventions (model: `2026-10-15-query-error-messages-design.md`).
- **Aborted transaction returned to the pool:** in `crates/postgres/src/session.rs` `run_script`, when a statement errors, issue a best-effort `ROLLBACK` on the same client before returning it. Live test: a failed `BEGIN; bad; COMMIT;` followed by `SELECT 1` on the next pooled client must succeed.
- **Later-statement errors missed:** add `firstExecutionError(results)` in `apps/desktop/src/lib/executionResult.ts` (with a test). Replace the `res.results[0]?.error` checks in `App.tsx` (~l.1036, 1405, 1430) with it.

## Phase 1 — Introspection (Rust core → postgres → shared TS)
**`crates/core/src/types.rs`** (DB-agnostic, all new fields `#[serde(default)]` for workspace/back-compat):
- Extend `IndexDefinition` and keep `columns`:
  - `keys: Vec<IndexKey { expression, is_expression, descending, nulls_first: Option<bool>, opclass: Option<String> }>`
  - `include_columns`, `predicate: Option<String>`, `definition: Option<String>`
  - `is_primary`, `constraint: Option<{name, kind: Primary|Unique|Exclusion}>`, `is_valid`
  - `nulls_not_distinct`, `storage_params: Vec<(String,String)>`, `tablespace`
  - `size_bytes: Option<i64>`, `scans: Option<i64>`
- New `RoutineDefinition { id, oid, schema, name, kind: Function|Procedure, identity_arguments, parameters: Vec<RoutineParameter{name, data_type, mode: In|Out|InOut|Variadic|Table, default}>, return_type: Option<String>, returns_set, language, volatility, is_strict, security_definer, parallel, leakproof, cost, rows, has_sql_body, comment, owner }`. Fields that only exist in Postgres (`parallel`, `leakproof`) are `Option` and documented as dialect-specific. `id` = `schema.name(identity_args)`.
- `DatabaseSchema` gains `routines: Vec<RoutineDefinition>`, `languages: Vec<String>` and `server_version_num: Option<i32>`.
- `Session` trait: add `async fn routine_source(&self, schema, oid) -> Result<RoutineSource{definition, body}, AdapterError>`, with a default impl that returns an `Unsupported` error. Future adapters opt in.

**`crates/postgres/src/session.rs`:**
- Rewrite the index query (l.587–611) around these catalog functions and views: `pg_get_indexdef(oid)`, `pg_get_indexdef(oid, k, true)` per key, `indoption` bits for DESC/NULLS FIRST, `indnkeyatts` vs `indnatts` for INCLUDE, `pg_get_expr(indpred)`, `pg_constraint.conindid`, `indisvalid`, `indnullsnotdistinct` (PG15+, version-guarded), `reloptions`, `pg_relation_size`, `pg_stat_user_indexes.idx_scan`.
- New routine query: `pg_proc` with `prokind IN ('f','p')`. Exclude system schemas and extension members (`pg_depend deptype='e'`). Pull fields via `pg_get_function_identity_arguments`, `pg_get_function_result`, `proargnames/proargmodes/proallargtypes`, `pg_get_expr(proargdefaults)`, `pg_language`, `prosqlbody IS NOT NULL` (PG14+ guarded) and `obj_description`. Aggregates and window functions are out of scope.
- `routine_source`: `pg_get_functiondef(oid)` + `prosrc`. Wire it as a new Tauri command `schema_routine_source` in `apps/desktop/src-tauri/src/lib.rs`, registered in `generate_handler!`, plus a wrapper in `packages/core/src/schema/index.ts`.
- `SCHEMA_FINGERPRINT_SQL` (l.370): add a `pg_proc` section (oid, name, namespace, arg types, return type, md5(prosrc), attributes) and `pg_index` predicate/options so routine and index edits trigger sync.
- Mirror every type in `packages/shared/src/index.ts`.
- Seed: add `docker/postgres/init/04_routines.sql` with a SQL function, a plpgsql function with OUT/default params, a set-returning function, a trigger function and a procedure. Add an expression index and an INCLUDE index to `01_schema.sql`. (A seed change requires `db:reset`.)

## Phase 2 — Dialect capabilities + pure DDL builders (TDD)
- `packages/database/src/index.ts`: add `objects` capabilities to `DialectMeta`:
  - `indexMethods` (with per-method `supportsUnique/Include/Ordering`), `supportsConcurrentIndex`, `supportsPartialIndex`, `supportsNullsNotDistinct(minVersion)`, `indexStorageParams` by method
  - `routineKinds`, `supportsCreateOrReplace`, `volatilities`, `parallelModes`
  - The UI reads these flags to show or hide options instead of hard-coding Postgres.
- `apps/desktop/src/lib/ddl/types.ts`: `IndexDraft`, `RoutineDraft`, and an `ObjectDdl` interface: `createIndex`, `planIndexChange(orig, draft)`, `dropIndex`, `createRoutine`, `planRoutineChange(orig, draft)`, `dropRoutine`.
- `lib/ddl/registry.ts`: `ddlFor(dialect)` throws for unimplemented dialects.
- `lib/ddl/postgres/indexDdl.ts` (+ test):
  - `CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] name ON tbl USING m (keys … opclass ASC/DESC NULLS …) [INCLUDE] [NULLS NOT DISTINCT] [WITH (...)] [TABLESPACE] [WHERE ...]`
  - `suggestIndexName` reuses `uniqueIndexName` from `lib/schemaChange.ts`.
  - `planIndexChange` returns `{ statements, mode: 'alter'|'recreate', transactional, warnings }`:
    - Rename → `ALTER INDEX … RENAME TO`; storage params → `ALTER INDEX … SET (...)`; tablespace → `SET TABLESPACE`.
    - Anything structural → recreate. Without CONCURRENTLY: `BEGIN; DROP INDEX; CREATE INDEX; COMMIT;`. With CONCURRENTLY: `CREATE … CONCURRENTLY tmp; DROP INDEX CONCURRENTLY old; ALTER INDEX tmp RENAME TO old;`, non-transactional, and the warning text explains the tradeoff.
  - Constraint-backed and primary-key indexes return a "managed by constraint X" refusal instead of SQL.
  - Drops use no CASCADE.
- `lib/ddl/postgres/routineDdl.ts` (+ test):
  - Dollar-quote with a tag chosen so it never appears in the body (`$function$`, then `$fn_1$`, and so on).
  - Supports RETURNS scalar/SETOF/TABLE(...)/void/trigger, procedures (`CREATE PROCEDURE`, no RETURNS), all attributes, and `COMMENT ON`.
  - `planRoutineChange` follows Postgres rules:
    - Body, language or attribute change → `CREATE OR REPLACE`.
    - Rename → `ALTER FUNCTION … RENAME TO`; schema change → `SET SCHEMA`.
    - Changed argument types, return type, OUT params, renamed input params, removed defaults, or a kind change → `BEGIN; DROP …(identity args); CREATE …; COMMIT;` with a "dependent objects will block this" warning.
    - Functions with a SQL-standard body (`has_sql_body`) can't be form-edited and get a fallback: "Open definition in SQL editor".
- `lib/indexInsights.ts` (+ test): flags unused indexes (0 scans), redundant ones (key prefix of another index with the same method and predicate), invalid ones, and large-but-unused ones. Gives the "why it matters" context.
- `lib/routineActions.ts` (+ test): descriptor list mirroring `lib/tableActions.ts`. Add a "New index…" descriptor to `tableActions.ts`.

## Phase 3 — Index UI (in `TableSchemaDesigner`)
`components/SchemaView/TableSchemaDesigner.tsx`, Indexes sub-tab:
- Header gets a "New index" button.
- Each row shows keys (with DESC/expr), method, unique/constraint/partial/INCLUDE badges, size, scans, and an insight badge (amber style).
- Expanding a row shows the definition in a read-only highlighted viewer plus insight text.
- Pencil and trash buttons are disabled with a tooltip for constraint-backed indexes. Hidden for views; materialized views are allowed.

New components in `components/SchemaView/`:
- `IndexDrawer.tsx` (create/edit, modelled on `AddColumnDrawer`):
  - Key rows with column-or-expression, order, nulls, opclass.
  - Method select; unique, INCLUDE, WHERE, NULLS NOT DISTINCT, CONCURRENTLY.
  - Storage params, tablespace.
  - Live SQL preview, a mode banner ("will be recreated"), and the inline error box.
- `DropIndexModal.tsx` (modelled on `DeleteColumnModal`, using `canConfirmDelete`).
- Both publish `scope.setContext({ modalOpen })` (the grid's pattern) so menu gating works.

Execution goes through the existing `onExecute` → `queryExecute` → `loadSchema` → `refreshHistory` path in `App.tsx`, using `firstExecutionError`.

## Phase 4 — Function UI
- **Tab kind:** add `function_designer` to `TabType` and `routineId?` to `WorkspaceTab`, in both TS (`packages/shared`) and Rust (`crates/core/src/types.rs`). Wire it into:
  - `renderTabContent` (`App.tsx` ~l.1262) and `getTabIcon` (`TabsBar.tsx` ~l.97)
  - Close-on-drop (a `closeTabsForRoutines` analogue to `closeTabsForTables`) and reopen-closed-tab
  - Open/focus via `revealTabInPane`
- **`components/RoutineView/RoutineDesigner.tsx`:**
  - With a `routineId` it opens in view mode. The header mirrors `TableSchemaDesigner`: name, kind/language/volatility badges, an Edit button and a Drop button.
  - Sub-tabs: "Overview" (parameters table, return type, attributes, comment) and "Definition" (`pg_get_functiondef` via `schema_routine_source` in the read-only viewer, with copy and "Open in SQL editor" actions).
  - Edit switches the same tab to the form: name/schema/kind, a parameter list editor (mode/name/type/default; type picker reuses `columnTypesFor`), a return-type builder, a language select (from `languages`), attributes, a CodeMirror body editor, a live preview and plan warnings, and Apply plus an error banner. Without a `routineId` the tab opens in create mode, mirroring `CreateTableDesigner`.
  - Shows a "not found — refreshed schema no longer has it" state.
- `DropRoutineModal.tsx`: type-to-confirm, then `DROP FUNCTION|PROCEDURE schema.name(identity args)`.
- **Read-only viewer:** `components/SqlEditor/SqlCodeViewer.tsx` built on CodeMirror (`sql({dialect: PostgreSQL})`, `syntaxHighlighting(sqlHighlightStyle)` from `lib/sqlSyntaxTheme.ts`, the theme block from `SqlCodeEditor`, `EditorState.readOnly`/`EditorView.editable(false)`). The body editor reuses `SqlCodeEditor` with a new `variant="plain"` prop that turns off autocomplete, the linter and the run keymap, so the editor's run shortcuts don't fire.

## Phase 5 — Navigation & commands
- `components/Sidebar.tsx`: a collapsible "Functions" section under "Tables & Views", using the same text filter and schema select, with kind icons and a context menu built from `routineActions` (Open, Edit, Copy name, Open definition in SQL editor, Drop). Add a "New index…" item to the table context menu (`tableManagementMenu.tsx`).
- `lib/commands/registry.ts`: add `file.newFunction` ("New Function…", no accelerator unless one is free in `reserved.ts`). Add it to the File menu in `menuModel.ts`, the handler in `App.tsx`, and update the expected-id list in `registry.test.ts`.
- `components/CommandPalette.tsx`: add a Functions section (open routine) and a "New function" quick action.

## Out of scope (noted in spec)
- Aggregates and window functions, extension-owned functions (hidden), triggers/sequences as objects, ownership/GRANT management, adapter selection by dialect (still hard-coded `PostgresAdapter` in `lib.rs`).

## Verification
- `bun run test`: all new `lib/*.test.ts` files (index/routine DDL exact-string tests including quoting, dollar-tag collision, recreate plans, constraint refusal; insights; actions; `firstExecutionError`) plus registry and `handlerWiring` tests.
- `bun run db:reset && bun run test:all`: new `crates/postgres/tests/session.rs` live tests:
  - Introspection of seed routines and index details (expression/partial/INCLUDE/DESC/constraint-backed)
  - Fingerprint changes on `CREATE OR REPLACE FUNCTION` and `CREATE INDEX`
  - `routine_source`
  - Pool health after a failed transaction
  - Running each builder's output against Postgres (create → plan change → drop round-trip)
- Manual check in the running app (`run` skill, `tauri dev` against the docker DB):
  - Create/edit/rename/recreate (with and without CONCURRENTLY) and drop an index on `shop.orders`.
  - Confirm PK indexes are locked.
  - Create a plpgsql function, edit the body (CREATE OR REPLACE), change a param type (DROP+CREATE warning), drop it.
  - Check the sidebar section, palette, and File → New Function.
  - Confirm menu shortcuts are gated while the drawers are open.
  - Regression pass on table data editing, column CRUD and the SQL editor.
