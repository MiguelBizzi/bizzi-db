# Bizzi DB

You are working in the Bizzi DB repository: a local PostgreSQL and MySQL desktop client. Act as a senior engineer on this codebase. Match the existing architecture. Do not introduce a second state library, a second SQL path, or a second way to register menus.

`AGENTS.md` is the shared map (structure, call flow, quirks). This file is how to work in Claude. `.claude/rules/` is loaded automatically and overrides a looser reading of either doc. `.cursor/rules/*.mdc` are symlinks of those rules.

When cutting a release, follow `.cursor/rules/cut-release.mdc` and `RELEASING.md`.

## Stack

Tauri 2.2 shell, React 19 + Vite + Tailwind 4 UI, Rust engines, Bun 1.3 workspaces, Turborepo. Product version is lockstep across the root `package.json`, `Cargo.toml` `[workspace.package]`, and `apps/desktop/src-tauri/tauri.conf.json`. Bundle id `com.bizzidb.app` stays put.

The marketing site is `apps/web`. It does not talk to databases.

## Directory map

- `apps/desktop/src/App.tsx` — composition root. Session state and most command handlers live here.
- `apps/desktop/src/components/` — UI by feature: `TableView`, `SqlEditor`, `SchemaView`, `RoutineView`, `ViewDesigner`, `PendingChanges`, `Modals`.
- `apps/desktop/src/lib/` — logic extracted so it can be tested without rendering. DDL, filters, command registry, editor keymap, pending changes, schema queue.
- `apps/desktop/src-tauri/src/lib.rs` — Tauri commands, `adapter_for`, in-memory sessions and SSH tunnels.
- `apps/desktop/src-tauri/permissions/app.toml` — IPC allowlist. A command missing here fails at runtime with "not allowed".
- `packages/shared` — TypeScript DTOs. Hand-maintained mirror of `crates/core/src/types.rs` (serde camelCase). Change both.
- `packages/database` — per-engine quoting, column types, and capability flags. False hides the control.
- `packages/core` — `invoke` wrappers for connections, schema, query, workspace, settings, export.
- `packages/storage` — `invoke` wrappers for saved queries.
- `crates/core` — `Adapter`, `Session`, `SqlDialect`, validation, query errors, statement splitting.
- `crates/postgres`, `crates/mysql` — sessions. Catalog SQL, filters, value decoding, driver errors mapped to `QueryError`.
- `crates/storage` — `workspace.sqlite` and secrets (keychain or `secrets.json`).
- `docker/` — Postgres 16 on 127.0.0.1:5433 (`postgres`/`postgres`) and MySQL 8.4 on 127.0.0.1:3307 (`root`/`mysql`).
- `docs/adding-a-database.md` — the only path for a new engine.

## State

UI state is React `useState` in `App.tsx`. Do not add a store.

Persisted: connection profiles and workspace tabs in SQLite (`workspace_load` / `workspace_save`); passwords and SSH secrets only in `DualSecretStore`; sidebar width in `localStorage`.

In memory until the user applies them: pending cell edits and row inserts/deletes (`lib/pendingChanges.ts`), staged schema alters and drops (`lib/schemaQueue.ts`). New objects run immediately. Apply sends one script through `query_execute`.

The native menu reads a derived `CommandContext`, not React state. Focused grids and editors register a command-bus scope once and keep mutable handlers in refs. Dialogs must be in the modal gate or shortcuts hit the window underneath.

## API layers

```
component or App.tsx
  → @db/core or @db/storage invoke()
  → Tauri command in src-tauri/src/lib.rs
  → PostgresAdapter or MysqlAdapter
  → Session (introspect, execute, query_page, preview, routine_source)
```

`adapter_for` only returns PostgreSQL and MySQL. `sql_dialect_for` picks the splitter used for paging and for editor statement ranges (UTF-16 offsets).

SQL the user typed is sent unchanged. `query_execute` must stay unrestricted. SQL the app builds (filters, preview, DDL, DML) quotes identifiers and escapes literals for that engine. PostgreSQL uses double quotes. MySQL uses backticks, and its string literals also escape `\`. Postgres filters send untyped literals so the column type coerces them; leave that path alone. New engines should bind parameters.

Capability flags live on the dialect module. Hide unsupported controls. Do not emit PostgreSQL syntax with a MySQL name on it.

`schema_fingerprint` skips full introspection when the catalog hash matches. Force a reload on connect, manual refresh, and after DDL the app knows it ran.

Routine identity is stored in a field named `oid` for every engine so existing workspace tabs still open.

## Commands you will run

```sh
bun install
bun run db:up
bun run dev
bun run test          # frontend tests and cargo test, excluding the Tauri crate
bun run test:all      # also the ignored Postgres and MySQL live tests; needs db:up
```

Run `bun run test` before you consider a change done. Run `bun run test:all` when you touch a session, preview, introspection, or a docker seed. CI otherwise follows `.github/scripts/changed-areas.sh`. Docs-only diffs do not build.

## Non-negotiable rules

**Tests.** New behavior starts with a failing test. A bug fix starts with a test that reproduces the bug. `foo.ts` gets `foo.test.ts` beside it. Rust unit tests live in the module; live tests live in `crates/*/tests/` and are `#[ignore]`. Extract logic from components and test the function. Skip tests for type-only files, one-line invoke wrappers, icons, and generated code. No end-to-end driver in this phase.

**Security.** Passwords never go in SQLite, logs, or `Debug` output. `ConnectConfig` redacts secrets. Validate saves and pool size (1–32) in Rust. No `dangerouslySetInnerHTML`, `eval`, or `innerHTML`. Do not add Tauri shell, fs, or http plugins. Unix app-data is `0700`, `workspace.sqlite` is `0600`.

**Menus.** Every feature a user can start is a command in `lib/commands/registry.ts`, a node in `lib/commands/menuModel.ts`, a handler in `App.tsx` or a `registerScope`, and an accelerator that is unique and not reserved. Show `shortcutLabel(id)` on the other surfaces that trigger it. New IPC commands go in `app.toml`. The tests named in `AGENTS.md` enforce this list.

**Comments.** Explain a constraint the code does not show: an engine rule, a Tauri or WebKit quirk, a sentinel, a race, an intentional empty `catch`. Do not label regions, restate the next line, or leave a comment that has drifted from the code.

**Commits.** Sign off with the Developer Certificate of Origin. The hook in `.githooks/prepare-commit-msg` adds `Signed-off-by` after `bun install`. User-visible changes get an `## [Unreleased]` line in `CHANGELOG.md`, written for users of the app. Do not edit `apps/web/src/lib/changelog.data.ts` by hand; run `bun run changelog:generate`.

## Quirks

- `SslMode::Require` is TLS that accepts invalid certificates. `Enabled` verifies. `Disabled` is plain TCP. Both engines share this. `SECURITY.md` is the threat model; where it disagrees with `SslMode`, follow the code.
- CodeMirror and Lezer packages must resolve to one copy. A second copy throws when the editor mounts or drops syntax colors. Root `package.json` `overrides` pin them. Do not bump one package past the pin.
- MySQL's database field may be empty; the sidebar then lists every user database. PostgreSQL requires a database name. MySQL DDL commits implicitly.
- Linux and Windows show the menu as a popup. Do not attach a native menu bar there. Linux Quit is the `app.quit` command.
- macOS draws its own traffic lights. Closing the window keeps the process running.
- Pane transitions change opacity only. A transform breaks sticky grid headers.
- The grid and the ERD mount only what is near the viewport.
- `getCurrentWindow()` throws in the browser preview.
- Testimonials on the landing page are intentionally unwired. Leave the comments that say so.
- Two copies of the workspace routine id, or renaming `oid`, breaks saved tabs.

## While you edit

- Stay inside the seam that already owns the behavior. A grid rule belongs in `lib/` and a test, not only in `TableDataGrid.tsx`. Generated SQL belongs in `lib/ddl/<engine>/`. Catalog queries belong in `crates/<engine>/src/objects.rs`.
- After a behavior change, run the narrowest test that covers it, then `bun run test` if the change is otherwise ready to hand back.
- Do not expand a hygiene or bug-fix diff into a refactor of `App.tsx`. That file is large because it is the composition root, not because it needs a new architecture.
