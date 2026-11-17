# MongoDB and Multi-Paradigm Engine Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MongoDB as a first-class document engine (connect, browse, view, edit, query, indexes, export) by giving the engine boundary a paradigm axis, without changing how PostgreSQL, MySQL, or SQL Server behave.

**Architecture:** Every engine declares a `Paradigm` (`relational` | `document`). Relational engines keep `Adapter`/`Session`/`SqlDialect` untouched. Document engines implement new `DocumentAdapter`/`DocumentSession` traits in `db-core`. The desktop crate stores either kind in one session map and routes each Tauri command to the kind it needs. The UI branches on `paradigm` and capability flags only, never on an engine name. BSON crosses IPC as a typed, ordered tree (`DocValue`) so no number is rounded by JavaScript and no field order is lost; edits travel back as text and are parsed in Rust.

**Tech Stack:** Rust (`mongodb` 3.x official driver, `bson` re-exported from it), Tauri 2.2, React 19, CodeMirror 6 (`@codemirror/lang-javascript` added), Bun tests, cargo tests, Docker `mongo:8.0`.

**Spec:** `docs/superpowers/specs/2026-11-17-mongodb-multi-paradigm-design.md`. Read `AGENTS.md`, `CLAUDE.md`, and `docs/adding-a-database.md` before Task 1.

## Global Constraints

- PostgreSQL, MySQL, and SQL Server behaviour, IPC shapes, and saved workspace tabs do not change. `bun run test` stays green after every task.
- No engine-name comparisons in shared UI. `dialectBoundary.test.ts` is extended to reject `'MongoDB'` comparisons too. Branch on `paradigm` or capability flags.
- Minimum server: MongoDB 5.0. Seed and CI: `mongo:8.0`. Driver: `mongodb` crate, newest 3.x pinned with `=` in `[workspace.dependencies]`, default features (rustls TLS, SRV DNS resolver). No OpenSSL dependency added for this crate.
- Passwords never appear in a URI string the app builds, in `Debug` output, in SQLite, or in logs. Credentials are set on `ClientOptions.credential`, never formatted into a connection string.
- Nothing the user types is evaluated. MongoDB shell text is parsed into commands in Rust; there is no JS engine, no `eval`, no `new Function`. `db.runCommand` passes arbitrary commands through unchanged (the document analog of the unrestricted `query_execute`).
- No new Tauri plugins. Every new IPC command is listed in `apps/desktop/src-tauri/permissions/app.toml`.
- CodeMirror/Lezer single-copy rule: `@codemirror/lang-javascript` and `@lezer/javascript` get exact pins in root `package.json` `overrides`; `codemirrorInstances.test.ts` must still pass.
- Every user-startable feature follows `.claude/rules/menu-and-shortcuts.md`. The only new accelerator is `CmdOrCtrl+Alt+E` (Edit Document…). Everything else reuses an existing command with a `dynamicLabel`.
- Product version, bundle id `com.bizzidb.app`, and Unix permission modes stay as they are.
- MongoDB names: crate `crates/mongo` (`db-mongo`), dialect enum variant `MongoDB`, label `MongoDB`, default port `27017`, default user `""`, URI schemes `mongodb`, `mongodb+srv`. Docker: `127.0.0.1:27018`, user `root`, password `mongo`, seed database `shop`; limited test user `reader` / `reader` (auth database `admin`, read on `shop` only).

## Review Focus

1. **Type drift on save.** Editing one field of a document whose other fields are `Int64` small values, integral `Double`s, `Decimal128`, or `Date` must write those fields back with the same BSON type. Pinned by the shared round-trip fixture (Task 6) and `replace keeps untouched field types` (Task 9).
2. **Field order and odd keys.** Keys like `"10"`, `"2"`, `"a.b"`, `"$x"`, and `""` keep their order and spelling through view → edit → save. Pinned in Task 6 (`docValue keeps integer-like key order`), Task 13 (`formatEditable keeps entry order`), and against a real server in Task 9 (`replace handles dotted and dollar keys`, seed `shop.odd_keys`).
3. **Concurrent change.** Saving a document someone else modified since it was loaded fails with a clear message instead of overwriting. The guard compares the whole stored document (`$expr` + `$$ROOT` + `$literal`), so an added field counts as a change and odd keys never break the filter. Pinned by `replace refuses when the document changed` and `replace refuses when a field was added` (Task 9).
4. **Partial privileges and odd collections.** A user without `listDatabases`, a view, a time-series collection, or a collection whose stats fail must not break introspection; the item shows with an unknown count. Pinned by `introspect survives a view and an unreadable count`, `lists_only_profile_database_when_set`, and, signed in as the seed's limited `reader` user, `introspect works without listDatabases` and `reader_sees_unknown_counts_not_errors` (Task 8; database listing passes `authorizedDatabases: true`).
5. **SSH with a replica set or SRV.** A tunnelled connection must force `directConnection=true` and reject SRV or multiple hosts with a message, because replica-set discovery would redirect to hosts the tunnel cannot reach. Pinned in Task 1 (`ssh rejects srv and extra hosts`) and Task 7 (`tunnel forces direct connection`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `crates/core/src/engines.rs` | `EngineSpec` gains `paradigm` and the connection-param allowlist and validators. |
| `crates/core/src/document.rs` (new) | `Paradigm`, `DocValue`, collection/index/request/result DTOs, `DocumentAdapter`, `DocumentSession`. |
| `crates/core/src/conformance.rs` | Adds `assert_document_session`. |
| `crates/core/src/types.rs`, `adapter.rs` | `DatabaseSchema.collections`, `TabType` variants, `ConnectionProfile.params`, `ConnectConfig.params`. |
| `crates/storage/src/sqlite.rs` | `connections.params` column (JSON text). |
| `crates/mongo/` (new) | `client.rs` options, `values.rs` BSON⇄`DocValue`/editable text, `shell.rs` shell parser, `split.rs` ranges, `objects.rs` introspection, `sample.rs` field summary, `export.rs` export bytes, `error.rs`, `session.rs`. |
| `apps/desktop/src-tauri/src/lib.rs` | `EngineKind`, `LiveSession`, routing, new commands. |
| `apps/desktop/src-tauri/src/documents.rs` (new) | Document Tauri commands and document history items, kept out of the 900-line `lib.rs`. |
| `packages/shared/src/index.ts` | TS mirror of every Rust DTO above. |
| `packages/database/src/engines.ts` (new) | `EngineMeta`, `DocumentEngineMeta`, `ENGINES`, `engineMeta`, `SUPPORTED_ENGINES`. |
| `packages/database/src/mongo.ts` (new) | The MongoDB `DocumentEngineMeta`. |
| `packages/core/src/documents.ts` (new) | One `invoke` wrapper per document command. |
| `apps/desktop/src/lib/document/` (new) | Pure logic: `docTree.ts`, `docEdit.ts`, `explorer.ts`, `indexDraft.ts`, `shellComplete.ts`, `documentTabs.ts`. |
| `apps/desktop/src/components/DocumentView/` (new) | `CollectionView`, `DocumentList`, `DocumentTree`, `DocumentEditorDrawer`, `FieldsPanel`, `DocumentIndexDrawer`, `DocumentQueryTab`, `CollectionList`. |
| `docker/mongo/init/*.js`, `docker-compose.yml`, `.github/workflows/test.yml` | Seed, local service, CI job. |

---

## Phase 1 — Paradigm foundation (no MongoDB behaviour yet)

### Task 1: Rust engine metadata, connection params, storage column

**Files:**
- Modify: `crates/core/src/engines.rs`, `crates/core/src/types.rs` (`DatabaseDialect`, `ConnectionProfile`, `SaveConnectionInput`), `crates/core/src/adapter.rs` (`ConnectConfig`), `crates/core/src/profiles.rs` (wherever `ConnectConfig` is built), `crates/storage/src/sqlite.rs`, `apps/desktop/src-tauri/src/lib.rs` (`validate_save_input`, `connect_config_from_profile`), every test that builds `ConnectConfig` in `crates/{postgres,mysql,mssql}`
- Test: same modules (`#[cfg(test)]`), `crates/storage/src/sqlite.rs` tests

**Interfaces:**
- Produces:
  - `DatabaseDialect::MongoDB` (serde `"MongoDB"`), `EngineSpec { …, paradigm: Paradigm, params: &'static [ParamRule] }` with MongoDB `supported: false` (flipped in Task 10), `database_required: false`, `default_port: 27017`.
  - `pub enum Paradigm { Relational, Document }` (serde lowercase) — defined in `document.rs` in Task 2; in this task define it in `engines.rs` and re-export from `document.rs` later. `pub fn paradigm_of(d: DatabaseDialect) -> Paradigm`.
  - `pub fn validate_params(dialect, params: &BTreeMap<String,String>, ssh_enabled: bool) -> Result<(), String>`.
  - `ConnectionProfile.params: BTreeMap<String,String>` and `SaveConnectionInput.params` (`#[serde(default)]`), `ConnectConfig.params: BTreeMap<String,String>` (printed by `Debug`; not secret).
  - MongoDB param keys and rules: `srv` and `directConnection` ∈ {`true`,`false`}; `authSource` free text; `authMechanism` ∈ {``,`SCRAM-SHA-1`,`SCRAM-SHA-256`}; `replicaSet` free text; `readPreference` ∈ {`primary`,`primaryPreferred`,`secondary`,`secondaryPreferred`,`nearest`}; `hosts` comma list of `host:port`. Every value ≤ 256 chars, no control characters. Relational engines allow no keys.

- [ ] **Step 1: Write failing tests** in `engines.rs`:

```rust
#[test] fn mongodb_spec_is_document_and_database_optional() {
    let s = engine_spec(DatabaseDialect::MongoDB).unwrap();
    assert_eq!(s.paradigm, Paradigm::Document);
    assert!(!s.database_required);
    assert_eq!(s.default_port, 27017);
    assert_eq!(paradigm_of(DatabaseDialect::MySQL), Paradigm::Relational);
}
#[test] fn relational_engines_reject_params() {
    let p = BTreeMap::from([("srv".into(), "true".into())]);
    assert!(validate_params(DatabaseDialect::PostgreSQL, &p, false).is_err());
}
#[test] fn mongodb_params_are_checked() {
    let ok = BTreeMap::from([("authSource".into(),"admin".into()),("readPreference".into(),"nearest".into())]);
    assert!(validate_params(DatabaseDialect::MongoDB, &ok, false).is_ok());
    let bad = BTreeMap::from([("readPreference".into(),"fastest".into())]);
    assert!(validate_params(DatabaseDialect::MongoDB, &bad, false).is_err());
    let unknown = BTreeMap::from([("tlsCAFile".into(),"/x".into())]);
    assert!(validate_params(DatabaseDialect::MongoDB, &unknown, false).is_err());
}
#[test] fn ssh_rejects_srv_and_extra_hosts() {
    let srv = BTreeMap::from([("srv".into(),"true".into())]);
    assert!(validate_params(DatabaseDialect::MongoDB, &srv, true).unwrap_err().contains("SSH"));
    let hosts = BTreeMap::from([("hosts".into(),"b:27017".into())]);
    assert!(validate_params(DatabaseDialect::MongoDB, &hosts, true).is_err());
}
```

Extend `every_dialect_variant_round_trips_through_its_label` with `MongoDB` and `assert!(!database_required(DatabaseDialect::MongoDB))`. In `sqlite.rs` add `connection_params_round_trip` (save a profile with `params = {"authSource":"admin"}`, reload, equal) and `old_rows_load_with_empty_params` (row inserted without the column after migration reads `{}`). In `adapter.rs` extend `debug_redacts_password` to assert params appear and the password does not.

- [ ] **Step 2: Run** `cargo test -p db-core -p db-storage` — Expected: FAIL (no `MongoDB` variant, no `validate_params`).
- [ ] **Step 3: Implement.** Storage: migration adds `params TEXT NOT NULL DEFAULT '{}'` in the same guarded style as the `ssh_*` columns; serialize with `serde_json`. Desktop: `validate_save_input` calls `validate_params(input.dialect, &input.params, input.ssh_enabled)`; `connect_config_from_profile` copies `params`. The SSH message: `SSH tunnels reach a single host. Turn off SRV and remove extra hosts, or turn off SSH.`
- [ ] **Step 4: Run** `bun run test` — Expected: PASS (all existing tests unchanged).
- [ ] **Step 5: Commit** `feat(core): engine paradigm and per-engine connection params`

### Task 2: Document DTOs and traits in `db-core`, TS mirror

**Files:**
- Create: `crates/core/src/document.rs`
- Modify: `crates/core/src/lib.rs`, `crates/core/src/types.rs` (`DatabaseSchema`, `TabType`), `packages/shared/src/index.ts`
- Test: `crates/core/src/document.rs` tests, `packages/shared/src/index.test.ts` (create if absent: type-level fixtures only if a runtime helper is added; otherwise skip — types-only)

**Interfaces:**
- Produces (Rust, all `#[serde(rename_all = "camelCase")]` unless noted; TS mirrors with identical names):
  - `DocValue` — `#[serde(tag = "t", rename_all = "camelCase")]` enum: `Null`, `Bool { v: bool }`, `Int32 { v: String }`, `Int64 { v: String }`, `Double { v: String }`, `Decimal128 { v: String }`, `String { v: String }`, `ObjectId { v: String }`, `Date { v: String }` (ISO-8601 UTC, millisecond precision, `Z`), `Binary { subtype: u8, base64: String }`, `Timestamp { t: u32, i: u32 }`, `Regex { pattern: String, options: String }`, `Object { entries: Vec<(String, DocValue)> }`, `Array { items: Vec<DocValue> }`, `MinKey`, `MaxKey`, `Undefined`, `Other { ejson: String }` (code, symbol, DBPointer as canonical EJSON text). Numbers are strings so JavaScript never rounds them; entries are pairs so key order survives.
  - `Namespace { database: String, collection: String }`
  - `CollectionKind` (lowercase): `Collection`, `View`, `Timeseries`.
  - `CollectionSchema { id: String /* "<db>.<coll>" */, database, name, kind: CollectionKind, view_on: Option<String>, capped: bool, document_count: Option<i64>, size_mb: Option<f64>, indexes: Vec<DocumentIndex> }`
  - `DocumentIndex { name, keys: Vec<(String, String)> /* "1" | "-1" | "text" | "2dsphere" | "hashed" */, unique: bool, sparse: bool, hidden: bool, ttl_seconds: Option<i64>, partial_filter: Option<String> }`
  - `IndexDraft { name: Option<String>, keys: Vec<(String, String)>, unique, sparse, hidden: bool, ttl_seconds: Option<i64>, partial_filter: String /* "" = none */ }`
  - `FindRequest { connection_id, ns: Namespace, filter: String, projection: String, sort: String, limit: i64, skip: i64 }` — the three strings are shell-syntax documents, `""` means `{}`.
  - `DocumentPage { documents: Vec<DocValue>, total: Option<u64> /* None = not counted in time */, execution_time_ms: u64, error: Option<String>, error_info: Option<QueryError> }`
  - `DocumentCommandResult { id, command: String, timestamp: String, execution_time_ms: u64, documents: Option<Vec<DocValue>>, value: Option<DocValue>, affected: Option<u64>, error: Option<String>, error_info: Option<QueryError> }`
  - `FieldSummary { path: String, types: Vec<(String, u64)>, present_in: u64 }`, `FieldSample { sampled: u64, fields: Vec<FieldSummary> }`
  - `DocumentExportFormat` (camelCase): `JsonArray`, `Ndjson`, `Csv`; `ExtJsonMode`: `Relaxed`, `Canonical`; `DocumentExportRequest { connection_id, ns, filter, projection, sort: String, format, mode, file_name: String }`
  - `DatabaseSchema.collections: Vec<CollectionSchema>` and `DatabaseSchema.paradigm: Paradigm`, both `#[serde(default)]` (default `Relational`).
  - `TabType::CollectionDocuments` (`"collection_documents"`), `TabType::DocumentQuery` (`"document_query"`). A collection tab stores the collection id in `tableId`.
  - Traits (async-trait, same `#[allow(clippy::double_must_use)]` as `Session`):

```rust
pub trait DocumentSession: Send + Sync {
    async fn introspect(&self) -> Result<DatabaseSchema, AdapterError>;
    async fn schema_fingerprint(&self) -> Result<String, AdapterError>;
    async fn find(&self, req: &FindRequest) -> Result<DocumentPage, AdapterError>;
    async fn sample_fields(&self, ns: &Namespace, size: u32) -> Result<FieldSample, AdapterError>;
    async fn run(&self, database: &str, text: &str, page_size: i64) -> Result<Vec<DocumentCommandResult>, AdapterError>;
    async fn insert(&self, ns: &Namespace, document: &str) -> Result<DocValue, AdapterError>; // returns _id
    async fn replace(&self, ns: &Namespace, original: &str, replacement: &str) -> Result<(), AdapterError>;
    async fn delete(&self, ns: &Namespace, ids: &[String]) -> Result<u64, AdapterError>;
    async fn create_collection(&self, ns: &Namespace) -> Result<(), AdapterError>;
    async fn drop_collection(&self, ns: &Namespace) -> Result<(), AdapterError>;
    async fn create_index(&self, ns: &Namespace, draft: &IndexDraft) -> Result<String, AdapterError>;
    async fn drop_index(&self, ns: &Namespace, name: &str) -> Result<(), AdapterError>;
    async fn export(&self, req: &DocumentExportRequest) -> Result<Vec<u8>, AdapterError>;
}
pub trait DocumentAdapter: Send + Sync {
    async fn test_connection(&self, cfg: &ConnectConfig) -> Result<(u64, String), AdapterError>;
    async fn connect(&self, cfg: &ConnectConfig) -> Result<Box<dyn DocumentSession>, AdapterError>;
    fn statement_ranges(&self, text: &str) -> Vec<SqlRange>; // UTF-16 offsets, like SqlDialect
    fn classify(&self, text: &str) -> HistoryQueryType;
}
```

  All `document`/`original`/`replacement`/`ids` strings are *editable text* (defined in Task 6).

- [ ] **Step 1: Write failing tests** in `document.rs`: `doc_value_serializes_tagged` (`DocValue::Int64{v:"5".into()}` → `{"t":"int64","v":"5"}`; `Object{entries:vec![("b",Null),("a",Null)]}` → `{"t":"object","entries":[["b",{"t":"null"}],["a",{"t":"null"}]]}`); `old_schema_json_defaults_to_relational` (a `DatabaseSchema` JSON without `paradigm`/`collections` deserializes with `Relational` and `[]`); `tab_type_document_variants_round_trip`.
- [ ] **Step 2: Run** `cargo test -p db-core document` — Expected: FAIL.
- [ ] **Step 3: Implement** the module and the TS mirror (`DocValue` as a discriminated union on `t`; tuples as `[string, DocValue]`; `TabType` union gains the two literals; `DatabaseSchema.paradigm?: Paradigm`, `collections?: CollectionSchema[]`).
- [ ] **Step 4: Run** `bun run test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): document session contract and DTOs`

### Task 3: Desktop session routing by paradigm

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `lib.rs` `#[cfg(test)]` module (existing `every_supported_engine_is_registered_once` lives there)

**Interfaces:**
- Consumes: Task 2 traits.
- Produces:
  - `enum EngineKind { Relational { adapter: &'static dyn Adapter, sql: &'static dyn SqlDialect }, Document { adapter: &'static dyn DocumentAdapter } }`; `RegisteredEngine { dialect, kind: EngineKind }`.
  - `#[derive(Clone)] enum LiveSession { Relational(Arc<dyn Session>), Document(Arc<dyn DocumentSession>) }`; `AppState.sessions: Mutex<HashMap<String, LiveSession>>`.
  - `fn relational(live: LiveSession) -> Result<Arc<dyn Session>, String>` and `fn document(live: LiveSession) -> Result<Arc<dyn DocumentSession>, String>`; `session_for` keeps its signature and calls `relational`; new `document_session_for(state, id)`.
  - `adapter_for` / `sql_dialect_for` keep their signatures and return `Err("MongoDB is a document database; SQL is not available on this connection")`-style messages (`format!("{} is a document database; SQL is not available on this connection", label)`) for document engines. New `document_adapter_for(dialect)`.
  - `connections_test`, `connections_connect`, `schema_introspect`, `schema_sync` dispatch on `EngineKind`/`LiveSession`; the overlay and fingerprint logic is shared.

- [ ] **Step 1: Write failing tests:** `relational_commands_refuse_a_document_session` (`relational(LiveSession::Document(Arc::new(StubDoc)))` is `Err` and the message contains `document database`); `document_commands_refuse_a_sql_session` (mirror with a stub `Session`); update `every_supported_engine_is_registered_once` to iterate both kinds. Stubs are `#[cfg(test)]` unit structs implementing the traits with `unimplemented!()` bodies except where called.
- [ ] **Step 2: Run** `cargo test -p db-desktop routing` — Expected: FAIL.
- [ ] **Step 3: Implement.** No MongoDB entry yet; only the three relational engines are registered, wrapped in `EngineKind::Relational`.
- [ ] **Step 4: Run** `cargo test -p db-desktop && bun run test` — Expected: PASS.
- [ ] **Step 5: Commit** `refactor(desktop): route sessions by engine paradigm`

### Task 4: TS engine registry with paradigms

**Files:**
- Create: `packages/database/src/engines.ts`, `packages/database/src/mongo.ts`, `packages/database/src/engines.test.ts`
- Modify: `packages/database/src/index.ts` (re-exports; each `DIALECTS` entry gains the `EngineMeta` fields), `packages/database/src/engineContract.test.ts`, `apps/desktop/src/lib/dialectBoundary.test.ts`, `packages/shared/src/index.ts` (`DatabaseDialect` gains `'MongoDB'`)

**Interfaces:**
- Produces:

```ts
export type Paradigm = 'relational' | 'document';
export interface ConnectionParamSpec {
  key: string; label: string; kind: 'text' | 'boolean' | 'select';
  options?: { value: string; label: string }[]; placeholder?: string;
}
export interface EngineMeta {
  id: DatabaseDialect; label: string; paradigm: Paradigm; supported: boolean;
  defaultPort: number; defaultUser: string; defaultDatabase: string; defaultSsl: boolean;
  uriSchemes: string[]; databaseOptional: boolean;
  connectionParams: ConnectionParamSpec[];
  /** Boolean param that, when 'true', hides the port field (SRV records carry the port). */
  portHiddenBy?: string;
  nouns: { namespace: string; container: string; containers: string; record: string; records: string };
}
export interface DocumentCapabilities {
  views: boolean; textIndexes: boolean; geoIndexes: boolean; hashedIndexes: boolean;
  ttlIndexes: boolean; hiddenIndexes: boolean; partialIndexes: boolean;
}
export interface DocumentEngineMeta extends EngineMeta {
  paradigm: 'document';
  editorLanguage: 'javascript';
  emptyEditorText: string;
  indexKeyKinds: { value: string; label: string }[];
  documentCapabilities: DocumentCapabilities;
}
export type EngineModule = DialectMeta | DocumentEngineMeta;   // DialectMeta now extends EngineMeta with paradigm 'relational'
export const ENGINES: Record<'PostgreSQL' | 'MySQL' | 'SQLServer' | 'MongoDB', EngineModule>;
export const SUPPORTED_ENGINES: EngineModule[];               // supported === true, picker order
export function engineMeta(id: DatabaseDialect): EngineModule | undefined;
export function documentEngine(id: DatabaseDialect): DocumentEngineMeta | undefined;
export function isDocumentEngine(m: EngineModule | undefined): m is DocumentEngineMeta;
```

- Values: relational engines `nouns = { namespace: 'Schema', container: 'Table', containers: 'Tables', record: 'Row', records: 'Rows' }`, `connectionParams: []`, `databaseOptional` equal to `capabilities.emptyDatabaseAllowed`. MongoDB: `supported: false` (flipped in Task 11), `nouns = { namespace: 'Database', container: 'Collection', containers: 'Collections', record: 'Document', records: 'Documents' }`, `defaultPort 27017`, `defaultUser ''`, `defaultDatabase ''`, `defaultSsl false`, `databaseOptional true`, `portHiddenBy 'srv'`, `emptyEditorText 'db.getCollectionNames()'`, `indexKeyKinds` `1` Ascending, `-1` Descending, `text` Text, `2dsphere` 2dsphere, `hashed` Hashed; all `documentCapabilities` true; `connectionParams` in this order: `srv` (boolean "Use DNS seed list (SRV)"), `authSource` (text "Auth database", placeholder `admin`), `authMechanism` (select: Default/SCRAM-SHA-256/SCRAM-SHA-1), `replicaSet` (text), `directConnection` (boolean "Direct connection"), `readPreference` (select of the five values), `hosts` (text "Additional hosts", placeholder `host2:27017,host3:27017`).
- `SUPPORTED_DIALECTS` and `dialectModule` stay relational-only; `dialectModule('MongoDB')` is `undefined`.

- [ ] **Step 1: Write failing tests** in `engines.test.ts`: `engineMeta('MongoDB')` is a document engine with `nouns.container === 'Collection'`; `dialectModule('MongoDB')` is undefined; every relational module has `paradigm === 'relational'` and `databaseOptional === capabilities.emptyDatabaseAllowed`; `connectionParams` keys equal the Rust allowlist list `['srv','authSource','authMechanism','replicaSet','directConnection','readPreference','hosts']`. In `engineContract.test.ts` add `every document engine fills the document hooks` (non-empty `emptyEditorText`, `indexKeyKinds`, every `DocumentCapabilities` flag boolean). In `dialectBoundary.test.ts` add `MongoDB` to `ENGINE_COMPARE`.
- [ ] **Step 2: Run** `bun test packages/database apps/desktop/src/lib/dialectBoundary.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Fix any `DatabaseDialect` exhaustiveness errors the new union member causes with `engineMeta`, not engine-name checks (`bun run typecheck` or `tsc -b` per workspace script).
- [ ] **Step 4: Run** `bun run test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(database): engine registry with relational and document paradigms`

### Task 5: Command context paradigm and gated commands

**Files:**
- Modify: `apps/desktop/src/lib/commands/context.ts`, `appContext.ts`, `registry.ts`, `menuModel.ts`, `apps/desktop/src/App.tsx` (pass `paradigm` into `deriveCommandContext`)
- Test: `registry.test.ts`, `menuModel.test.ts`, `appContext.test.ts` (create if absent)

**Interfaces:**
- Produces: `CommandContext.paradigm: Paradigm | null` (`null` when no connection); `AppContextInput.paradigm?: Paradigm`. New command `edit.editDocument` (`Edit Document…`, `CmdOrCtrl+Alt+E`, enabled when `activeTabType === 'collection_documents' && selectedRowCount === 1`), menu node under Edit after `edit.insertRow`. Changes:

| Command | Change |
|---|---|
| `file.newTable` | `dynamicLabel`: `New Collection…` when `paradigm === 'document'` |
| `file.newView`, `file.newFunction`, `view.erd` | disabled when `paradigm === 'document'` |
| `file.newIndex` | also enabled for `collection_documents` |
| `edit.insertRow` | enabled for `collection_documents`; label `Insert Document…` there |
| `edit.deleteRows` | enabled for `collection_documents` with a selection; label `Delete Documents` |
| `edit.find` | enabled for `collection_documents`; label `Filter Documents…` |
| `conn.refreshTable` | enabled for `collection_documents`; label `Refresh Collection` |
| `query.run`, `query.runAll`, `file.saveQuery`, `edit.toggleComment` | enabled for `document_query` too |
| `edit.formatSql`, `query.commit`, `query.review` | unchanged (SQL only; pending count is 0 for documents) |

- [ ] **Step 1: Write failing tests:** expected-list updates for `edit.editDocument`; `enabled` cases for each row of the table with a document context and the unchanged relational context; `dynamicLabel` cases for the four relabelled commands. `deriveCommandContext({…, paradigm: 'document'}).paradigm === 'document'`.
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/commands` — Expected: FAIL.
- [ ] **Step 3: Implement.** Add an `App.tsx` handler stub for `edit.editDocument` that the collection view's `registerScope` overrides (Task 14); `handlerWiring.test.ts` must pass.
- [ ] **Step 4: Run** `bun run test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): gate commands by engine paradigm`

## Phase 2 — The MongoDB engine crate

### Task 6: `db-mongo` values: BSON ⇄ `DocValue` ⇄ editable text

**Files:**
- Create: `crates/mongo/Cargo.toml`, `crates/mongo/src/lib.rs`, `crates/mongo/src/values.rs`, `crates/mongo/tests/fixtures/editable.json`
- Modify: root `Cargo.toml` (member, `mongodb` pin)
- Test: `values.rs` unit tests

**Interfaces:**
- Produces:
  - `pub fn to_doc_value(b: &Bson) -> DocValue`
  - `pub fn format_editable(v: &DocValue) -> String` (Rust copy used by export and tests; the TS copy is Task 13)
  - `pub fn parse_editable(text: &str) -> Result<Document, String>` and `pub fn parse_editable_value(text: &str) -> Result<Bson, String>` — both go through the shell value parser (Task 7) once it exists; in this task they accept strict JSON with Extended-JSON wrappers.
- **Editable text** is the one textual form the UI shows and sends back. Rules (exact):
  - `Int32` → bare integer (`5`). `Int64` → `{"$numberLong": "5"}` always. `Double` → bare number that always contains `.` or `e` (`5.0`, `1e+300`); `NaN`/`Infinity`/`-Infinity` → `{"$numberDouble": "NaN"}` etc. `Decimal128` → `{"$numberDecimal": "…"}`. `ObjectId` → `{"$oid": "…"}`. `Date` → `{"$date": "<ISO>"}`. `Binary` → `{"$binary": {"base64": "…", "subType": "hh"}}`. `Timestamp` → `{"$timestamp": {"t": n, "i": n}}`. `Regex` → `{"$regularExpression": {"pattern": "…", "options": "…"}}`. `MinKey`/`MaxKey`/`Undefined` → canonical wrappers. `Other` → its stored EJSON.
  - Parsing: bare integer in i32 range → `Int32`; outside i32 but in i64 → `Int64`; any literal with `.` or exponent → `Double`; wrappers → their type. Object key order is the text order. Two-space indentation, one key per line, `": "` separator.
- Fixture `editable.json`: array of `{ "name", "value": <DocValue JSON>, "text": "<editable text>" }`, at least: every scalar type, nested object/array, Int64 `5`, Double `5.0`, Int32 `-2147483648`, Int64 `9007199254740993`, keys `"10"` before `"2"`, keys `"a.b"`, `"$x"`, `""`, unicode key and value.

- [ ] **Step 1: Write failing tests:** `fixture_to_doc_value_and_text` (for every fixture entry: `format_editable(&value) == text`); `fixture_parse_round_trips` (`to_doc_value(&parse_editable_value(text)) == value`); `docValue keeps integer-like key order` (`{"10":1,"2":2}` keeps `10` first); `parse_rejects_trailing_garbage`.
- [ ] **Step 2: Run** `cargo test -p db-mongo values` — Expected: FAIL.
- [ ] **Step 3: Implement.** Hand-write the formatter and a small recursive-descent JSON reader (ordered, no `serde_json::Map`, because the workspace `serde_json` does not enable `preserve_order` and enabling it would change every crate). Delegate wrapper objects to `bson::Bson::try_from(serde_json::Value)` for that single wrapper only.
- [ ] **Step 4: Run** `cargo test -p db-mongo` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mongo): lossless BSON values for IPC and editing`

### Task 7: Shell parser, statement ranges, client options

**Files:**
- Create: `crates/mongo/src/shell.rs`, `crates/mongo/src/split.rs`, `crates/mongo/src/client.rs`
- Modify: `crates/mongo/src/values.rs` (`parse_editable*` now delegate to `shell::parse_value`)
- Test: unit tests in each module

**Interfaces:**
- Produces:
  - `pub fn parse_value(text: &str) -> Result<Bson, ShellError>` — editable text plus shell conveniences: unquoted keys, single-quoted strings, trailing commas, `//` and `/* */` comments, `ObjectId("…")`, `ISODate("…")`, `new Date("…")`, `NumberLong(n|"n")`, `NumberInt(n)`, `NumberDecimal("…")`, `UUID("…")` (binary subtype 4), `Timestamp(t, i)`, `/re/flags`, `true/false/null`, `MinKey()`/`MaxKey()`.
  - `pub struct ShellError { message: String, offset: usize /* UTF-16 */ }`
  - `pub enum ShellCommand { Collection { collection: String, method: Method, args: Vec<Bson>, chain: Vec<(ChainOp, Bson)> }, RunCommand { admin: bool, command: Document }, Use(String), ShowDatabases, ShowCollections, GetCollectionNames }` with `Method` ∈ `find, findOne, aggregate, countDocuments, estimatedDocumentCount, distinct, insertOne, insertMany, updateOne, updateMany, replaceOne, deleteOne, deleteMany, createIndex, dropIndex, getIndexes, drop` and `ChainOp` ∈ `sort, limit, skip, project, projection` (find only). Collection access forms: `db.users`, `db["odd name"]`, `db.getCollection("odd name")`.
  - `pub fn parse_command(text: &str) -> Result<ShellCommand, ShellError>`
  - `pub fn split_ranges(text: &str) -> Vec<SqlRange>` — statements end at a top-level `;` or at a newline where the bracket depth is 0 and the next non-blank line does not start with `.`; strings, regex literals, and comments are skipped; offsets are UTF-16.
  - `pub fn classify(text: &str) -> HistoryQueryType` — find/aggregate/count/distinct/getIndexes → `Select`; insert* → `Insert`; update*/replaceOne → `Update`; delete* → `Delete`; createIndex/dropIndex/drop → `Ddl`; everything else → `System`.
  - `pub fn client_options(cfg: &ConnectConfig, tunnel_port: Option<u16>) -> Result<ClientOptions, String>` (sync, built without network: `ClientOptions::builder()` for `mongodb://`; for `srv=true` use `ClientOptions::parse` on `mongodb+srv://<host>/` *without credentials*, which needs DNS, so put the SRV branch in `async fn resolve_options` and keep `client_options` for the non-SRV path).

- [ ] **Step 1: Write failing tests:**
  - shell: `parses_shell_document` (`{age: {$gt: 30}, name: 'a', _id: ObjectId("64b…")}` → expected `Document`, key order kept); `parses_find_chain` (`db.users.find({a:1}).sort({b:-1}).limit(5)` → `Collection{method:Find, chain:[(Sort,…),(Limit,5)]}`); `bracket_collection_name` (`db["order items"].countDocuments({})`); `rejects_function_calls` (`db.users.find({$where: function() {}})` → `ShellError` mentioning `function`); `error_offset_is_utf16` (error after `"é😀"` reports the UTF-16 offset).
  - split: `splits_on_newline_at_depth_zero`, `keeps_chained_call_on_next_line` (`db.a.find()\n  .limit(2)` is one range), `ignores_semicolons_in_strings_and_regex`, `utf16_offsets_with_emoji`.
  - client: `tls_modes_map` (`Disabled` → `tls` off; `Require` → enabled with `allow_invalid_certificates(true)`; `Enabled` → enabled, verified); `credential_set_only_with_user` (empty user → no credential; with user → `source` from `authSource`, else the profile database, else `admin`); `tunnel forces direct connection` (`tunnel_port = Some(40000)` → single host `127.0.0.1:40000`, `direct_connection == Some(true)`); `extra_hosts_added` (`hosts = "b:27018,c:27019"`); `options_debug_has_no_password` (`format!("{:?}", opts)` lacks the password).
- [ ] **Step 2: Run** `cargo test -p db-mongo` — Expected: FAIL.
- [ ] **Step 3: Implement.** `app_name` = `"Bizzi DB"`. `server_selection_timeout` 10 s, `connect_timeout` 10 s.
- [ ] **Step 4: Run** `cargo test -p db-mongo` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mongo): shell parser, statement ranges, client options`

### Task 8: Seed, connect, introspection, fingerprint, errors

**Files:**
- Create: `crates/mongo/src/session.rs`, `crates/mongo/src/objects.rs`, `crates/mongo/src/error.rs`, `crates/mongo/tests/session.rs`, `docker/mongo/init/01-shop.js`, `docker/mongo/init/02-analytics.js`
- Modify: `docker-compose.yml`, `docker/README.md`, `crates/core/src/conformance.rs`
- Test: unit tests in `error.rs`, `objects.rs`; ignored live tests in `crates/mongo/tests/session.rs`

**Interfaces:**
- Produces: `pub struct MongoAdapter;` implementing `DocumentAdapter`; `MongoSession { client: Client, default_db: Option<String> }`. `pub fn query_error(err: &mongodb::error::Error) -> QueryError`. `db_core::conformance::{DocumentSeed, assert_document_session}` with `DocumentSeed { database, collection, text_field, text_like, min_documents, bad_filter }` checking: connect, introspect lists the collection, `find` with `{}` and with a regex on `text_field`, paging (`limit 2, skip 1` differs from `skip 0`), `bad_filter` yields `error_info.category == Syntax`, fingerprint stable across an insert+delete.
- Introspection: databases = profile database if set, else `list_database_names` with `authorizedDatabases: true` minus `admin`, `local`, `config`. Per database `list_collections` (names, type, options) and `list_indexes`; per collection `$collStats: { count: {}, storageStats: {} }` with at most 8 concurrent calls; a failure leaves `document_count`/`size_mb` as `None`. Views and time-series map to `CollectionKind`. `server_version_num` from `buildInfo.versionArray`. `DatabaseSchema.paradigm = Document`, `tables = []`, `routines = []`.
- Fingerprint: SHA-256 hex over sorted lines `db\tcoll\tkind\t<options canonical EJSON>\t<index specs canonical EJSON>`; no counts or sizes.
- Error mapping: `code` = server `codeName`, `vendor_code` = numeric code; category: 11000/11001 → `Constraint`; 13, 18, 8000 → `Permission`; 2, 9, 14, 17287, 40324, 15974 and any `ShellError` → `Syntax`; 26 → `Reference`; 50, 262 (`MaxTimeMSExpired`, `ExceededTimeLimit`) → `Timeout`; I/O, server selection, DNS → `Connection`; else `Other`. `ShellError.offset` fills `position` (line/column computed from the text).
- Seed (`mongosh` scripts run once by the image entrypoint): `shop.users` (≥ 20 docs; nested `address`, `tags` array, one doc missing `email`, one with `age` as string to show mixed types, `Int64` `credits`, `Decimal128` `balance`, `Date` `createdAt`), `shop.orders` (`userId` ObjectId refs, `items` array of objects, `total` Decimal128), `shop.events` (capped 1 MB), `shop.odd_keys` (one document, inserted with `insertOne` so the server keeps the keys as written: `_id`, `"10"`, `"2"`, `"a.b"`, `""`, `meta: { "$x": 1, "c.d": 2 }`, `note` — MongoDB 5.0+ stores dotted and `$`-prefixed field names; `$x` is nested because a top-level `$` key in a replacement can be read as an update operator), view `shop.active_users`, time-series `analytics.metrics`; indexes: unique `users.email` (partial on `email` exists), compound `orders.userId_1_createdAt_-1`, TTL `events.at` 3600 s, text `users.bio`, hidden `orders.status_1`. A last script creates user `reader` / password `reader` in `admin` with only `{ role: "read", db: "shop" }` (no `listDatabases`, nothing on `analytics`). Compose service `mongo:8.0`, `127.0.0.1:${MONGO_PORT:-27018}:27017`, `MONGO_INITDB_ROOT_USERNAME=root`, `MONGO_INITDB_ROOT_PASSWORD=mongo`, healthcheck `mongosh --quiet --eval "db.adminCommand('ping').ok"`.

- [ ] **Step 1: Write failing tests:** `error.rs`: `duplicate_key_is_constraint` (build a `mongodb::error::Error` from a `CommandError { code: 11000, code_name: "DuplicateKey" }` or the write-error equivalent; assert category, code, vendor_code), `shell_error_has_position`. `objects.rs`: `fingerprint_ignores_counts` (pure fn `fingerprint(lines: &[CollectionFingerprint]) -> String`), `system_databases_skipped` (pure `fn user_databases(names: Vec<String>) -> Vec<String>`). Live (`#[ignore]`): `conformance` (calls `assert_document_session` with `shop.users`, `text_field "name"`), `introspect survives a view and an unreadable count` (introspection lists `active_users` as `View` with `document_count == None` and `metrics` as `Timeseries`), `lists_only_profile_database_when_set`, `wrong_password_is_permission`, `introspect works without listDatabases` (connect as `reader` with an empty database field and `authSource=admin`: introspection succeeds, lists `shop` collections, does not list `analytics`, and returns no error), `reader_sees_unknown_counts_not_errors` (as `reader`, any collection whose `$collStats` is refused has `document_count == None`).
- [ ] **Step 2: Run** `cargo test -p db-mongo` and `bun run db:up && cargo test -p db-mongo -- --include-ignored` — Expected: FAIL.
- [ ] **Step 3: Implement** `test_connection` (`ping` + `buildInfo.version`, latency ms), `connect`, `introspect`, `schema_fingerprint`; other `DocumentSession` methods return `Err(AdapterError::msg("not implemented"))` until Task 9.
- [ ] **Step 4: Run** both commands — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mongo): connect, introspect, fingerprint, and seed`

### Task 9: Find, sample, CRUD, collections, indexes, run, export

**Files:**
- Create: `crates/mongo/src/sample.rs`, `crates/mongo/src/export.rs`, `crates/mongo/src/run.rs`
- Modify: `crates/mongo/src/session.rs`, `crates/mongo/tests/session.rs`
- Test: unit tests in `sample.rs`, `export.rs`, `run.rs`; live tests

**Interfaces:**
- Produces the remaining `DocumentSession` methods with these rules:
  - `find`: parse `filter`/`projection`/`sort` with `shell::parse_value` (empty → `{}`); a parse error returns `DocumentPage { error, error_info }`, not `Err`. `total`: `estimated_document_count` when the filter is empty and the collection is not a view; otherwise `count_documents` with `max_time` 5 s, and on timeout `total = None`. `limit` is clamped to 1..=1000.
  - `sample_fields(ns, size)`: `$sample` of `size` (≤ 1000) then `sample::summarize(&[Document]) -> FieldSample`: dotted paths for nested objects, array elements summarized under `path[]`, type names are BSON type aliases (`string`, `int`, `long`, `double`, `decimal`, `objectId`, `date`, `bool`, `object`, `array`, `null`, `binData`, `timestamp`, `regex`), sorted by `present_in` desc then path.
  - `insert(ns, text)`: `parse_editable`, `insert_one`, return `to_doc_value(inserted_id)`.
  - `replace(ns, original, replacement)`: both parsed; filter = `{ _id: <original _id>, $expr: { $eq: ["$$ROOT", { $literal: <original> }] } }`, built as a `Document` (never as text), so the whole stored document must equal what was loaded — field order, a field someone else added, and keys such as `"a.b"` or `"$x"` included. Do not filter on individual top-level fields: MongoDB reads `"a.b"` there as a path and rejects `"$x"` as an unknown operator. `replace_one`; `matched_count == 0` → `Err("The document changed on the server after it was loaded. Reload it and apply your edit again.")`. `replacement` without `_id` gets the original `_id`; a changed `_id` → `Err("_id cannot be changed. Insert a copy and delete the original instead.")`.
  - `delete(ns, ids)`: each id is editable text; `delete_many({_id: {$in: ids}})`, returns deleted count.
  - `create_index(ns, draft)`: `keys` order kept; `unique`, `sparse`, `hidden`, `expireAfterSeconds`, `partialFilterExpression` (parsed with `parse_value`), `name` when set; returns the server's index name. `drop_index` refuses `_id_` with `Err("The _id index cannot be dropped.")`.
  - `run(database, text, page_size)`: `split_ranges` → `parse_command` per statement; each yields one `DocumentCommandResult` (cursor methods fill `documents` capped at `page_size`; counts, write results, and command replies fill `value`; writes fill `affected`). `Use(db)` switches the database for the rest of that script only. A failing statement stops the script and is the last result.
  - `export(req)`: streams the cursor and returns bytes via `export::write(format, mode, docs) -> Vec<u8>`: `JsonArray` = `[\n` + documents (relaxed or canonical EJSON, one per line, comma-separated) + `\n]\n`; `Ndjson` = one relaxed/canonical document per line (mongoexport-compatible); `Csv` = header from the union of top-level keys in first-seen order, scalars as text, objects/arrays as their relaxed EJSON, RFC 4180 quoting.

- [ ] **Step 1: Write failing tests:** unit `summarize_nested_and_arrays`, `summarize_mixed_types` (two docs, `age` int and string → types `[("int",1),("string",1)]`), `export_json_array_canonical_keeps_int64`, `export_csv_unions_keys_and_quotes`, `run_switches_database_with_use`(pure planner over parsed commands). Live: `find_filters_with_shell_syntax`, `find_bad_filter_reports_syntax`, `insert_then_delete_round_trip`, `replace keeps untouched field types` (load a seed user via `find`, `format_editable`, change only `name`, `replace`, reload: `credits` still `Int64`, `balance` still `Decimal128`, `createdAt` still `Date`), `replace refuses when the document changed` (load, update `name` via `run`, then `replace` with the stale original → `Err` with "changed on the server"), `replace refuses when a field was added` (load, `$set` a new field via `run`, `replace` with the stale original → `Err`), `replace handles dotted and dollar keys` (load the seed `shop.odd_keys` document, change only `note`, `replace` succeeds, reload: keys `"10"`, `"2"`, `"a.b"`, `""`, and `meta."$x"`, `meta."c.d"` present with the same spelling, values, and order), `replace with a top-level dollar key reports the server error` (add `"$y": 1` at the top level of the replacement → `Err` carrying the server's message; the stored document is unchanged), `create_and_drop_ttl_index`, `drop_id_index_is_refused`, `run_find_chain_and_insert_many`, `export_ndjson_counts_documents`.
- [ ] **Step 2: Run** `cargo test -p db-mongo -- --include-ignored` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mongo): documents, indexes, shell execution, export`

### Task 10: Tauri commands, permissions, history, IPC wrappers

**Files:**
- Create: `apps/desktop/src-tauri/src/documents.rs`, `packages/core/src/documents.ts`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (register `MongoAdapter` as `EngineKind::Document`, `invoke_handler`), `apps/desktop/src-tauri/Cargo.toml` (`db-mongo`), `apps/desktop/src-tauri/permissions/app.toml`, `packages/core/src/index.ts`, `crates/core/src/engines.rs` (MongoDB `supported: true`)
- Test: `documents.rs` unit tests, `ipcPermissions.test.ts`, `engines.rs` round-trip test (`dialect_is_supported(MongoDB)`)

**Interfaces:**
- Produces Tauri commands (snake_case) and `@db/core` wrappers (camelCase, one-line `invoke`):

| Command | Input | Output |
|---|---|---|
| `documents_find` | `FindRequest` | `DocumentPage` |
| `documents_sample_fields` | `{ connectionId, ns, size }` | `FieldSample` |
| `documents_run` | `{ connectionId, database, text, pageSize, recordHistory }` | `DocumentCommandResult[]` |
| `documents_insert` | `{ connectionId, ns, document }` | `DocValue` |
| `documents_replace` | `{ connectionId, ns, original, replacement }` | `void` |
| `documents_delete` | `{ connectionId, ns, ids }` | `number` |
| `documents_export` | `DocumentExportRequest` | `string \| null` (saved path; null = cancelled) — writes through `export::save_with_dialog` so large exports never cross IPC |
| `document_statement_ranges` | `{ connectionId, text }` | `SqlRange[]` |
| `collection_create` / `collection_drop` | `{ connectionId, ns }` | `void` |
| `collection_index_create` | `{ connectionId, ns, draft }` | `string` |
| `collection_index_drop` | `{ connectionId, ns, name }` | `void` |

- History: `documents_run` with `recordHistory` writes one `ActivityLogItem` per result via `fn history_item_from_document(id, profile, result, adapter) -> ActivityLogItem` (type from `adapter.classify`, rows = documents length or `affected`). Writes from the document view (`insert`, `replace`, `delete`, index and collection changes) record `System`/`Insert`/`Update`/`Delete`/`Ddl` items with a short description (`replaceOne shop.users {_id: …}`) — never the full document body.

- [ ] **Step 1: Write failing tests:** `history_item_from_document_uses_classifier` and `history_omits_document_body` (description for a replace does not contain a field value from the replacement); `ipcPermissions.test.ts` passes only when all 12 commands are in `app.toml`; `mongodb_is_supported_and_registered`.
- [ ] **Step 2: Run** `cargo test -p db-desktop && bun test apps/desktop/src/lib/ipcPermissions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): document IPC commands`

## Phase 3 — Document experience in the UI

### Task 11: Connection form and URI parsing

**Files:**
- Modify: `apps/desktop/src/lib/connectionForm.ts`, `apps/desktop/src/lib/connectionString.ts`, `apps/desktop/src/components/Modals/ConnectionModal.tsx`, `apps/desktop/src/components/icons/EngineLogo.tsx`, `packages/database/src/mongo.ts` (`supported: true`)
- Create: `apps/desktop/src/components/icons/MongoLogo.tsx`
- Test: `connectionForm.test.ts`, `connectionString.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_ENGINES`, `EngineMeta.connectionParams`, `portHiddenBy`.
- Produces: `ConnectionFormValues.params: Record<string, string>`; `ParsedConnection.params: Record<string, string>`; `parseConnectionString` handles `mongodb://` and `mongodb+srv://` (remove both from `UNSUPPORTED_SCHEMES`): first host → host/port, remaining hosts → `params.hosts`, `+srv` → `params.srv = 'true'` and port = default, path → database, query keys in the allowlist → params (`tls=true`/`ssl=true` → `sslMode: 'enabled'`, plus `tlsAllowInvalidCertificates=true` → `'require'`), other query keys → `ok: false` with `Unsupported option <key>. Remove it or set it after connecting.`; user/password percent-decoded. The form renders `connectionParams` generically (no engine-name checks) and hides port when `params[portHiddenBy] === 'true'`.

- [ ] **Step 1: Write failing tests:** `parses mongodb+srv with auth source` (`mongodb+srv://ann:p%40ss@cluster0.x.net/shop?authSource=admin&retryWrites=true` → error on `retryWrites`; without it → `{dialect:'MongoDB', host:'cluster0.x.net', database:'shop', password:'p@ss', params:{srv:'true', authSource:'admin'}}`); `parses replica set seed list` (`mongodb://a:1,b:2,c:3/?replicaSet=rs0` → host `a`, port 1, `params.hosts === 'b:2,c:3'`); `port hidden for srv` (pure `visibleConnectionFields(meta, values)` returns no `port`); `relational form unchanged` (Postgres defaults deep-equal the previous snapshot).
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/connection` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): MongoDB connection form and URIs`

### Task 12: Explorer for databases and collections

**Files:**
- Create: `apps/desktop/src/lib/document/explorer.ts`, `apps/desktop/src/lib/document/documentTabs.ts`, `apps/desktop/src/components/DocumentView/CollectionList.tsx`
- Modify: `apps/desktop/src/components/Sidebar.tsx`, `apps/desktop/src/App.tsx` (open/restore `collection_documents` tabs; `renderTabContent` case; tab icon), `apps/desktop/src/lib/tabIcon.ts`, `apps/desktop/src/components/tableManagementMenu.tsx` (document variant entries)
- Test: `explorer.test.ts`, `documentTabs.test.ts`, `tabIcon.test.ts`

**Interfaces:**
- Produces:
  - `filterCollections(collections: CollectionSchema[], opts: { search: string; database: string | 'ALL' }): CollectionSchema[]` (case-insensitive name match, sorted by database then name).
  - `collectionDatabases(schema: DatabaseSchema): string[]`.
  - `openCollectionTab(tabs: WorkspaceTab[], c: CollectionSchema, databaseId: string): { tabs: WorkspaceTab[]; activeId: string }` — reuses an open tab for the same `tableId`.
  - Sidebar renders `CollectionList` when `engineMeta(dialect)?.paradigm === 'document'`: database filter labelled with `nouns.namespace`, kind icon (collection, view, time-series), count badge (`—` for `None`), context menu: Open, Insert Document… (`hint: shortcutLabel('edit.insertRow')`), New Index… (`file.newIndex`), Drop Collection… (confirm modal with typed name, then `collectionDrop`, then forced schema sync).

- [ ] **Step 1: Write failing tests:** `filterCollections` by search and database; `openCollectionTab` reuses an existing tab; `tabIcon` for `collection_documents`.
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/document apps/desktop/src/lib/tabIcon.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Schema load and refresh already go through `schema_sync`; collections arrive in `DatabaseSchema.collections`.
- [ ] **Step 4: Run** `bun run test`; then `bun run dev`, connect to the seed (`127.0.0.1:27018`, `root`/`mongo`, auth database `admin`), and confirm the sidebar lists `shop` and `analytics` collections. Expected: PASS and visible list.
- [ ] **Step 5: Commit** `feat(desktop): collection explorer`

### Task 13: Document viewer

**Files:**
- Create: `apps/desktop/src/lib/document/docTree.ts`, `apps/desktop/src/components/DocumentView/{CollectionView,DocumentList,DocumentTree,FieldsPanel}.tsx`
- Modify: `apps/desktop/src/App.tsx` (`collection_documents` case renders `CollectionView`), `apps/desktop/src/lib/gridWindow.ts` only if a generic row-window helper is missing
- Test: `docTree.test.ts` (reads `crates/mongo/tests/fixtures/editable.json`)

**Interfaces:**
- Produces (`docTree.ts`):
  - `formatEditable(v: DocValue): string` — must equal the Rust formatter for every fixture entry.
  - `typeLabel(v: DocValue): string` (`String`, `Int32`, `Int64`, `Double`, `Decimal128`, `ObjectId`, `Date`, `Binary`, `Timestamp`, `Regex`, `Object`, `Array`, `Null`, …).
  - `previewText(v: DocValue, max = 80): string` (`{ 3 fields }`, `[ 5 items ]`, `ObjectId('…')`, ISO date, quoted strings truncated with `…`).
  - `type TreeRow = { path: (string | number)[]; depth: number; key: string; value: DocValue; expandable: boolean; expanded: boolean }`; `flattenTree(docs: DocValue[], expanded: ReadonlySet<string>): TreeRow[]` (expanded set keyed by `JSON.stringify([docIndex, ...path])`; top-level documents expanded by default, nested collapsed).
  - `documentId(doc: DocValue): DocValue | undefined`.
- `CollectionView` props: `{ connectionId, collection: CollectionSchema, isFocusedPane, onSchemaChanged() }`. Toolbar: Filter, Projection, Sort inputs (shell syntax, CodeMirror single-line with `lang-javascript`, Enter applies), page size (20/50/100, default 50), Prev/Next with `total` (`many` when `null`), view mode List | JSON, Refresh (`conn.refreshTable` scope), Fields toggle. List mode: virtualized `TreeRow`s (mount only near the viewport, same windowing approach as the grid) with key, `typeLabel` badge, `previewText`; click selects a document; ⌘/Ctrl-click multi-selects; nested rows expand. JSON mode: read-only CodeMirror per page showing each document's `formatEditable`. Errors render with the existing `QueryErrorCard`. FieldsPanel calls `documentsSampleFields(size 200)` on open and lists paths, type mix bars, presence %; clicking a path inserts `{ "<path>": }` into the filter.
- Pane transitions change opacity only (no `transform`).

- [ ] **Step 1: Write failing tests:** `formatEditable matches the Rust fixture` (loop over fixture), `formatEditable keeps entry order` (`10` before `2`), `previewText` cases for object/array/ObjectId/long string, `flattenTree` expands top level only and respects the expanded set, `documentId` finds `_id`.
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/document/docTree.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the lib, then the components. Add `@codemirror/lang-javascript` and `@lezer/javascript` with exact pins in root `overrides` and caret ranges in `apps/desktop/package.json`, matching the existing pattern.
- [ ] **Step 4: Run** `bun run test` (includes `codemirrorInstances.test.ts`); then in `bun run dev` open `shop.users`, filter `{age: {$gt: 30}}`, expand `address`, page forward, open Fields. Expected: PASS; filter narrows; nested values expand; Int64/Decimal128 badges shown.
- [ ] **Step 5: Commit** `feat(desktop): document viewer for collections`

### Task 14: Document editing

**Files:**
- Create: `apps/desktop/src/lib/document/docEdit.ts`, `apps/desktop/src/components/DocumentView/DocumentEditorDrawer.tsx`
- Modify: `CollectionView.tsx`, `DocumentTree.tsx`, `apps/desktop/src/App.tsx` (`modals` entry for the drawer and the delete confirm)
- Test: `docEdit.test.ts`

**Interfaces:**
- Produces (`docEdit.ts`, all pure, return a new `DocValue`, throw `DocEditError` with a user message on an invalid path):
  - `setValue(doc, path, value: DocValue)`, `removeField(doc, path)`, `renameField(doc, path, newKey)` (keeps position; refuses a duplicate sibling key and refuses renaming `_id`), `addField(doc, parentPath, key, value, afterKey?: string)`, `insertItem(doc, arrayPath, index, value)`, `removeItem(doc, arrayPath, index)`.
  - `convertScalar(text: string, type: ScalarType): DocValue` where `ScalarType` = `string | int32 | int64 | double | decimal128 | bool | null | objectId | date`; validates (`int32` range, 24-hex ObjectId, ISO date, decimal pattern) and throws `DocEditError` otherwise.
  - `newDocumentTemplate(): string` → `"{\n  \n}"`.
- Behaviour: inline edit of a scalar in the tree (double-click or Enter on a selected leaf) shows a value input plus a type select defaulting to the current type; Add Field / Remove / Rename / Duplicate item from a row context menu. Every tree edit produces a new `DocValue`; Save (in a per-document edit bar that appears once a document is dirty) calls `documentsReplace(original = formatEditable(loaded), replacement = formatEditable(edited))`. `DocumentEditorDrawer` (Edit Document…, Insert Document…, Clone) edits editable text in CodeMirror (`lang-javascript`); Save calls `documentsReplace` or `documentsInsert` and shows the server error inline without closing. Delete Documents asks for confirmation naming the count and runs `documentsDelete` with each selected `_id`'s `formatEditable`. A conflict error offers Reload. Scope registration: `CollectionView` `registerScope`s `edit.insertRow`, `edit.editDocument`, `edit.deleteRows`, `edit.find` (focuses Filter), `conn.refreshTable`, keeping handlers in refs.

- [ ] **Step 1: Write failing tests:** `setValue on nested path keeps sibling order`, `renameField keeps position`, `renameField refuses _id`, `renameField refuses duplicate`, `addField after key`, `insertItem and removeItem on array`, `convertScalar int32 range` (`'2147483648'` throws), `convertScalar objectId validates hex`, `edit preserves untouched Int64` (`formatEditable(setValue(doc, ['name'], str))` still contains `{"$numberLong": "5"}` for `credits`).
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/document/docEdit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test`; in `bun run dev` edit a nested `address.city`, add a field, insert, clone, and delete a document in `shop.users`; check ⌘⌥E opens the editor and that a menu shortcut does not fire while the drawer is open. Expected: PASS; the edits persist after Refresh.
- [ ] **Step 5: Commit** `feat(desktop): edit, insert, clone, and delete documents`

### Task 15: Document query tab

**Files:**
- Create: `apps/desktop/src/lib/document/shellComplete.ts`, `apps/desktop/src/components/DocumentView/DocumentQueryTab.tsx`, `DocumentResultsView.tsx`
- Modify: `apps/desktop/src/App.tsx` (`file.newQuery` opens `document_query` when the paradigm is document; render case; saved queries open into the right tab type), `apps/desktop/src/lib/editorKeymap.ts` only if the JS editor needs the same accelerator filtering (reuse, do not fork)
- Test: `shellComplete.test.ts`, `documentTabs.test.ts` (new-query tab type)

**Interfaces:**
- Produces:
  - `shellCompletions(text: string, caret: number, ctx: { collections: string[]; fields: string[] }): { from: number; options: { label: string; type: 'collection' | 'method' | 'operator' | 'field' | 'keyword' }[] } | null` — after `db.` → collection names plus `getCollection`, `runCommand`, `adminCommand`, `getCollectionNames`; after `db.<coll>.` → the `Method` list from Task 7; after `).` on a find call → `sort`, `limit`, `skip`, `project`; inside `{` key position → sampled field paths and, after `$`, query/update operators (`$eq $ne $gt $gte $lt $lte $in $nin $exists $type $regex $and $or $nor $not $elemMatch $size $all $set $unset $inc $push $pull $addToSet $rename`); aggregate stage keys (`$match $project $group $sort $limit $skip $unwind $lookup $addFields $count $facet`).
  - `newQueryTabType(paradigm: Paradigm): TabType`.
- `DocumentQueryTab` props mirror what `SqlEditorTab` takes for running and saving: `{ connectionId, initialText, onTextChange, databases: string[], collections: CollectionSchema[], savedQueries, isFocusedPane }`. Toolbar has a database select (defaults to the profile database or the first listed) that is the `database` argument of `documentsRun`. `Mod-Enter` runs the statement at the caret (ranges from `documentStatementRanges`), `Mod-Shift-Enter` runs all; results list one panel per `DocumentCommandResult` rendered with the Task 13 tree (documents) or a single tree (value), with time, count, and affected; errors use `QueryErrorCard` positioned from `error_info.position`. Save Query stores the text as `SavedQuery.sql`. Export on a result panel uses the client-side JSON array of `formatEditable` values (results are already bounded by page size).

- [ ] **Step 1: Write failing tests:** completions after `db.` include `users`; after `db.users.` include `find` and `aggregate`; inside `db.users.find({ a` include `address.city`; after `{ age: { $g` include `$gt`/`$gte`; `newQueryTabType('document') === 'document_query'`.
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/document` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test`; in `bun run dev` press ⌘T on the Mongo connection, run `db.orders.aggregate([{ $group: { _id: "$userId", n: { $sum: 1 } } }])` and a two-statement script with `use analytics`. Expected: PASS; results and history entries appear.
- [ ] **Step 5: Commit** `feat(desktop): MongoDB query tab`

### Task 16: Index and collection management

**Files:**
- Create: `apps/desktop/src/lib/document/indexDraft.ts`, `apps/desktop/src/components/DocumentView/DocumentIndexDrawer.tsx`, `CreateCollectionModal.tsx`
- Modify: `CollectionView.tsx` (Indexes section/tab listing `CollectionSchema.indexes`), `apps/desktop/src/App.tsx` (`file.newIndex` and `file.newTable` handlers branch on paradigm; `modals` entries)
- Test: `indexDraft.test.ts`

**Interfaces:**
- Produces: `validateIndexDraft(draft: IndexDraft, caps: DocumentCapabilities): string[]` (errors: no keys; duplicate field; `text` key combined with a second `text` that is fine but `hashed` with more than one key is an error; TTL requires exactly one key and a non-negative integer; `unique` with `hashed` is an error; empty field name); `indexDraftSummary(d: IndexDraft): string` (`{ email: 1 } unique, partial`).
- Indexes list shows name, keys, flags (unique, sparse, hidden, TTL seconds, partial filter); Drop asks to confirm and calls `collectionIndexDrop` (immediate; MongoDB index builds and drops are not transactional, matching "new objects run immediately"); `_id_` has no Drop. New Index… opens `DocumentIndexDrawer` (key rows with field + kind from `indexKeyKinds`, options hidden when their capability is false). New Collection… (`file.newTable` on a document connection) asks database (select or new name) and collection name, calls `collectionCreate`, forces schema sync, opens the tab. Each successful change forces `schema_sync`.

- [ ] **Step 1: Write failing tests** for each `validateIndexDraft` rule and `indexDraftSummary`.
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/document/indexDraft.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test`; in `bun run dev` create a unique partial index on `shop.users.email`, drop it, and create collection `shop.notes`. Expected: PASS; sidebar and Indexes update without a manual refresh.
- [ ] **Step 5: Commit** `feat(desktop): manage MongoDB indexes and collections`

### Task 17: Export from collections

**Files:**
- Modify: `apps/desktop/src/components/DataExport/DataExportMenu.tsx`, `apps/desktop/src/lib/dataExport.ts`
- Test: `dataExport.test.ts`

**Interfaces:**
- Produces: `DOCUMENT_EXPORT_FORMATS: { id: DocumentExportFormat; label: string; extension: string }[]` = JSON array (`json`), NDJSON (`ndjson`), CSV (`csv`); `documentExportFileName(c: CollectionSchema, f: DocumentExportFormat): string` (`<collection>_export.<ext>`, sanitized the same way as `exportFileName`). The menu shows document formats plus a Relaxed/Canonical toggle when the active tab is `collection_documents` (decided by paradigm, not engine name) and calls `documentsExport` with the view's current filter, projection, and sort; `file.export` is enabled for that tab.

- [ ] **Step 1: Write failing tests:** formats list, file name sanitizing (`order items` → `order_items_export.ndjson`), `file.export` enabled for `collection_documents` in `registry.test.ts`.
- [ ] **Step 2: Run** `bun test apps/desktop/src/lib/dataExport.test.ts apps/desktop/src/lib/commands` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test`; in `bun run dev` export filtered `shop.users` as canonical JSON array and confirm `credits` is `{"$numberLong": …}` in the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(desktop): export collections as JSON, NDJSON, or CSV`

### Task 18: CI, docs, parity matrix, changelog

**Files:**
- Modify: `.github/workflows/test.yml` (MongoDB 8.0 service on 27018 with root/mongo; load `docker/mongo/init/*.js` with `mongosh`; `cargo test -p db-mongo --locked -- --include-ignored`), `.github/scripts/changed-areas.sh` (`crates/mongo/**` → Rust area), `docs/adding-a-database.md` (new section "Choosing a paradigm": relational → `Adapter`/`Session`/`SqlDialect`/`DialectModule`; document → `DocumentAdapter`/`DocumentSession`/`DocumentEngineMeta`, `assert_document_session`; a new paradigm adds a trait pair in `db-core`, a `LiveSession`/`EngineKind` variant, an `EngineMeta` subtype, and a tab type — nothing else in shared UI), `docs/superpowers/specs/2026-11-17-mongodb-multi-paradigm-design.md` (capability table and parity matrix below), `AGENTS.md`, `CLAUDE.md`, `README.md` (engine lists, docker ports, directory map), `docker/README.md`, `CHANGELOG.md` `## [Unreleased]`, then `bun run changelog:generate`.
- Test: `bun run test:all`

**Parity matrix content** (one line per row, reason for each exclusion):

| Job | MongoDB |
|---|---|
| Connect, TLS modes, SCRAM auth, SRV, replica set seed list, SSH (single host, direct) | Implemented |
| Browse databases and collections, views, time-series | Implemented (views and time-series read-only) |
| View documents (tree, JSON), filter/projection/sort, paging, field sampling | Implemented |
| Edit, insert, clone, delete documents | Implemented; whole-document replace guarded by the loaded values |
| Query editor | Implemented: shell syntax parsed in Rust, not evaluated; `runCommand`/`adminCommand` unrestricted |
| Indexes: single, compound, text, 2dsphere, hashed, unique, sparse, partial, TTL, hidden | Implemented |
| Export JSON array, NDJSON, CSV (relaxed or canonical EJSON) | Implemented |
| Pending Changes review | Excluded: writes apply per document; standalone servers have no multi-document transactions |
| ERD, schema designer, view designer, routines | Excluded: no relational schema; `views` designer deferred |
| JavaScript functions (`$where`, `$function`, `mapReduce` bodies, shell loops) | Excluded: nothing typed is evaluated |
| Table (flattened) view of documents | Deferred: list and JSON views cover parity |
| Kerberos, LDAP, X.509, AWS IAM, OIDC auth | Excluded: SCRAM only in this release |

- [ ] **Step 1:** Write the docs and CI changes above.
- [ ] **Step 2: Run** `bun run test:all` — Expected: PASS for all four engines, including `db-mongo` ignored tests.
- [ ] **Step 3: Run** `bun run test` once more and `git diff --stat` to confirm no SQL-engine source changed beyond Tasks 1–5's listed files.
- [ ] **Step 4: Commit** `docs: MongoDB parity, paradigm guide, CI job`
