# Bizzi DB — guide for coding agents

Bizzi DB is a local desktop client for PostgreSQL and MySQL. There is no application server and no account. The React UI talks to Rust over Tauri IPC. Connections, query history, and saved SQL live in a local SQLite file. Passwords live in the OS keychain or a user-only secrets file, never in SQLite.

Read this file before changing code. The same constraints are enforced by `.claude/rules/` (Claude) and `.cursor/rules/` (Cursor; those files are symlinks of the Claude rules).

## Tech stack

- Desktop UI: React 19, TypeScript, Vite, Tailwind 4, CodeMirror 6, Motion. Package `apps/desktop` (`desktop`).
- Shell: Tauri 2.2 (`apps/desktop/src-tauri`, crate `db-desktop`). Bundle id `com.bizzidb.app` is locked; it is the app-data path, keychain service, and updater identity.
- Engines: `db-core`, `db-postgres` (tokio-postgres), `db-mysql` (mysql_async).
- Local persistence: `db-storage` (rusqlite + keyring).
- Shared TS packages: `@db/shared` (DTOs), `@db/database` (dialect modules), `@db/core` (IPC wrappers), `@db/storage` (saved-query IPC).
- Marketing site: `apps/web`. It is not the product.
- Tooling: Bun 1.3 workspaces, Turborepo, Rust 1.88, Cargo workspace. Versions in the root `package.json`, `[workspace.package]` in `Cargo.toml`, and `apps/desktop/src-tauri/tauri.conf.json` move together (currently 0.1.26).
- Tests: `bun test` for TypeScript, `cargo test` for Rust. No Cypress, Playwright, or Tauri window drivers.

## Directory map

```
apps/desktop/src/App.tsx          composition root: session state and command handlers
apps/desktop/src/components/      UI. TableView, SqlEditor, SchemaView, RoutineView, PendingChanges, Modals
apps/desktop/src/lib/             testable logic extracted from components
apps/desktop/src/lib/commands/    menu registry, menu model, keyboard, command bus
apps/desktop/src/lib/ddl/         SQL the app builds, split by engine (postgres/, mysql/)
apps/desktop/src-tauri/src/lib.rs Tauri commands, adapter selection, session map
apps/desktop/src-tauri/permissions/app.toml   IPC allowlist
packages/shared/src/index.ts      TypeScript DTOs (camelCase, mirrors Rust serde)
packages/database/src/            quoting, column types, object capabilities, EngineCapabilities
packages/core/src/                one function per Tauri command (invoke wrappers)
packages/storage/src/             saved-query invoke wrappers
crates/core/src/                  Adapter, Session, SqlDialect, profiles, QueryError, shared SQL
crates/postgres/src/              Postgres session, catalog, filters, values, errors
crates/mysql/src/                 MySQL session, catalog, filters, values, DELIMITER splitter
crates/storage/src/               workspace.sqlite and secrets
docker/                           Postgres 16 and MySQL 8.4 seeds
apps/web/                         landing page
docs/adding-a-database.md         checklist for a new engine
```

## How a call moves

1. A component or `App.tsx` calls a function in `@db/core` or `@db/storage`.
2. That function `invoke`s a Tauri command. The command name must also appear in `permissions/app.toml` or the webview gets "not allowed".
3. `apps/desktop/src-tauri/src/lib.rs` loads the profile, opens an SSH tunnel when configured, and stores `Arc<dyn Session>` in `AppState.sessions`.
4. `adapter_for` returns `PostgresAdapter` or `MysqlAdapter`. Anything else is refused. `sql_dialect_for` returns `PostgresSql` or `MySqlSql` for splitting and paging.
5. The session runs catalog SQL or the user's SQL. Constructed SQL (filters, preview, DDL) quotes identifiers and escapes literals in that engine's crate or in `lib/ddl`. SQL the user typed is sent as written.

`query_execute` is intentionally unrestricted. Do not allowlist, rewrite, or block statements there.

## State

There is no Redux, Zustand, or context store. Open-session UI state is `useState` in `App.tsx`: profiles, folders, introspected schemas, tabs, pane layout, pending row edits, staged schema changes, SQL-tab results, activity log.

Persisted workspace (tabs, active tab per connection) goes through `workspaceLoad` / `workspaceSave` into SQLite. Sidebar width and collapsed state use `localStorage` (`lib/sidebarLayout.ts`). Motion preference does too.

Pending row edits (`pendingByTable`) and staged schema changes (`schemaQueue`) stay in memory until the user applies them from the Pending Changes drawer. Creating a new object runs immediately. Altering or dropping an existing object is staged and reviewed with the row changes. Apply builds one script and sends it through `query_execute`.

The menu does not read React state directly. `useAppMenu` derives a `CommandContext`. Grids and SQL editors `registerScope` on the command bus so the focused pane receives Run, Find, and Delete. A scope registers once per id and reads changing state through refs. Overlays must set the modal gate (`modals` in `App.tsx`, or `useMenuModalGate`) or menu shortcuts fire on the window behind the dialog.

## API and dialect boundary

Rust types in `crates/core/src/types.rs` and TypeScript types in `packages/shared/src/index.ts` are maintained by hand and serialized as camelCase. A field added on one side and not the other breaks IPC. The routine identity field is named `oid` on every engine so saved workspace tabs keep loading; MySQL stores its own identity there.

`@db/database` decides what the UI may offer. `EngineCapabilities` flags hide controls (materialized views, `ILIKE`, `CONCURRENTLY`, partial indexes, empty database name, and so on). Do not emit another engine's syntax under a renamed flag.

Quoting for SQL the app builds:

- PostgreSQL identifiers use `"`, with `"` doubled. Literals use `'`, with `'` doubled.
- MySQL identifiers use backticks. String literals also escape `\`, because MySQL treats it as an escape unless `NO_BACKSLASH_ESCAPES` is on.
- Prefer bind parameters in new engine code. Postgres table filters are the exception already shipped: they send untyped literals so the column type coerces the value (`crates/postgres/src/filter.rs`). Do not "simplify" that into a cast.

`lib/ddl/registry.ts` picks `TableDdl` and `ObjectDdl` for the connection's dialect. Index, view, routine, and table SQL live in `lib/ddl/<engine>/`. Row insert SQL goes through `lib/insertRow.ts` and `lib/ddl/<engine>/rowDml.ts`.

Schema refresh uses a cheap catalog fingerprint (`schema_fingerprint`). A match skips full introspection. Connect, manual refresh, and known DDL pass force.

Statement splitting for the editor is `SqlDialect` (`crates/core/src/sql.rs` for PostgreSQL, `crates/mysql/src/sql.rs` for MySQL, including `DELIMITER`). Ranges are UTF-16 code units so they line up with the editor. Read-only `SELECT` / `WITH` / `VALUES` / `TABLE` can be wrapped for paging. A statement that writes, locks, or creates something is never wrapped, because the wrapper would re-run its side effects.

Autocomplete: `lib/sqlContext.ts` decides what token is legal at the caret. `lib/sqlComplete.ts` looks up schema objects and ranks them. CodeMirror's own fuzzy matcher is disabled for that source because it rejects quoted identifiers.

## Engines today

PostgreSQL and MySQL are the only registered adapters. `docs/adding-a-database.md` is the checklist: a `crates/<engine>` session, a `DialectModule`, `lib/ddl/<engine>/`, a docker seed, ignored live tests, and a parity row in `docs/superpowers/specs/2026-10-30-multi-database-design.md`.

MySQL treats the database field as an optional default schema and lists every user database. Other engines require a database name. Postgres DDL is transactional; MySQL DDL commits implicitly.

## Commands, menus, shortcuts

A feature the user can start needs all of the following. `handlerWiring.test.ts`, `registry.test.ts`, `menuModel.test.ts`, and `ipcPermissions.test.ts` fail when one is missing.

1. A command in `lib/commands/registry.ts` (`area.verb`, label ending in `…` when it opens a form, an accelerator, `enabled(ctx)`).
2. An accelerator that is unique, not in `lib/commands/reserved.ts`, and not `CmdOrCtrl+Alt+I` (webview devtools).
3. A menu node in `lib/commands/menuModel.ts`. Creation goes under File.
4. A handler in `App.tsx` (`useAppMenu`) or `registerScope` in the component that owns the gesture.
5. Expected-list updates in the command tests.
6. `hint: shortcutLabel(id)` on context menus and `shortcut: shortcutLabel(id)` on command-palette actions.
7. A new Tauri command listed in `permissions/app.toml`.

`lib/editorKeymap.ts` drops CodeMirror bindings that collide with menu accelerators. Editor-owned run keys are `Mod-Enter` and `Mod-Shift-Enter`; the editor handles them itself so the menu does not also fire.

Platform menu differences live in `lib/commands/platformAdapter.ts` and `menuHost.ts`. macOS attaches a native menu. Windows and Linux do not: an undecorated window cannot show a Win32 menu bar, and a hidden HMENU still captures Alt, so those platforms use a popup. Linux Quit is `app.quit` because the GTK predefined Quit cannot carry an accelerator.

## Security constraints

- Passwords and SSH secrets go through `DualSecretStore` only. Never add a password column, log a password, or `Debug`-print `ConnectConfig` without redaction (`Debug` already prints `***`).
- Validate connection fields in Rust (`validate_save_input`, pool size 1–32). The form is not the trust boundary.
- No `dangerouslySetInnerHTML`, `eval`, or `innerHTML`. CSP `img-src` is `'self' data: blob:` only.
- Do not add Tauri shell, fs, or http plugins. The updater and `allow-restart` are the existing exception.
- Unix app-data dir is `0700`, `workspace.sqlite` is `0600`.
- Do not log SQL that may contain secrets.
- `SslMode::Require` is TLS that accepts invalid certificates. `SslMode::Enabled` verifies. `Disabled` is plain TCP. This is deliberate and shared by both engines. Do not "fix" Require into verification.
- Query history stores full statement text locally. That is the product.

`SECURITY.md` is the threat model. Where it disagrees with `SslMode`, the code wins.

## Tests and local databases

```sh
bun install
bun run db:up     # Postgres 127.0.0.1:5433 postgres/postgres
                  # MySQL 8.4 127.0.0.1:3307 root/mysql, database shop
bun run dev       # desktop
bun run dev:web   # landing page
bun run test      # TS tests + cargo test --workspace --exclude db-desktop
bun run test:all  # db:up, then the same tests plus #[ignore] live tests
```

- New behavior starts with a failing test. A bug fix starts with a test that reproduces it.
- Put `foo.test.ts` next to `foo.ts`. Rust unit tests sit in the module; live session tests sit in `crates/*/tests/` and are `#[ignore]`.
- Extract logic out of React and test the function. Do not mount the tree unless the bug is interaction-only.
- Skip tests for type-only modules, one-line `invoke` wrappers, icons, and generated code (`apps/web/src/lib/changelog.data.ts`).
- `bun run test` is enough for UI and unit changes. Run `bun run test:all` when you touch a session, preview, introspection, or a docker seed.
- CI path filters live in `.github/scripts/changed-areas.sh`. Docs-only changes skip the build.

Every commit needs a `Signed-off-by` line (Developer Certificate of Origin). `bun install` points Git at `.githooks/prepare-commit-msg`, which adds it. User-visible changes get a line under `## [Unreleased]` in `CHANGELOG.md`, written for people who use the app.

## Comments

Comment the constraint a reader cannot see in the next line: an engine rule, a Tauri or WebKit quirk, a sentinel (`undefined` means create mode), a race, an empty `catch` that is intentional. Delete comments that restate the code, label a JSX region, or describe behavior the code no longer has.

## Quirks that cause bad patches

- Two copies of a CodeMirror or Lezer package break the editor by object identity, or strip syntax colors. Versions are pinned in the root `package.json` `overrides`. `lib/codemirrorInstances.test.ts` guards this.
- `getCurrentWindow()` throws outside Tauri (browser preview). `lib/windowChrome.ts` accounts for that.
- macOS traffic lights are drawn by `WindowControls`. `macos.rs` only hides the AppKit buttons. Closing the window does not quit.
- WebKitGTK's user agent is not a reliable Linux signal. Rust injects the platform. The proprietary NVIDIA driver needs a WebKitGTK workaround in `platform.rs`.
- An `APPIMAGE` variable inherited from another app must not steer the updater (`update_channel.rs`).
- Grid windowing mounts only rows and columns near the viewport. A CSS `transform` on a pane breaks `position: sticky` headers; pane transitions change opacity only.
- Large ERDs mount only the visible cards.
- The landing page's testimonials section is intentionally unwired. The comments in `apps/web/src/App.tsx`, `Header.tsx`, and `Testimonials.tsx` say so. Leave them.
- `apps/web/src/lib/changelog.data.ts` is generated. Edit `CHANGELOG.md`, then `bun run changelog:generate`.

## Where to change what

| Task | Start here |
|---|---|
| New menu action | `lib/commands/registry.ts`, `menuModel.ts`, handler, `app.toml` if it needs IPC |
| Grid editing, filters, paging | `components/TableView/` for UI, `lib/tableFilters.ts`, `lib/filterExpression.ts`, `crates/*/src/filter.rs` |
| SQL the app generates | `lib/ddl/<engine>/` and `packages/database` quoting |
| User-typed SQL, run target, errors | `lib/runTarget.ts`, `lib/sqlQuery.ts`, `crates/core/src/sql.rs`, `crates/*/src/error.rs` |
| Autocomplete | `lib/sqlContext.ts`, `lib/sqlComplete.ts` |
| Connection form, URI, SSL, SSH | `lib/connectionForm.ts`, `lib/connectionString.ts`, `src-tauri/src/ssh_tunnel.rs` |
| Introspection | `crates/<engine>/src/objects.rs`, `schema_fingerprint` on the session |
| Saved queries | `packages/storage`, `saved_queries_*` commands |
| A new engine | `docs/adding-a-database.md` |
| Release | `.cursor/rules/cut-release.mdc` and `RELEASING.md` |
