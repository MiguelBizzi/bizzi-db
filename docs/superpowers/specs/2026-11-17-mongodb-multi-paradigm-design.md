# MongoDB and a multi-paradigm engine boundary

MongoDB is the fourth engine and the first that is not relational. The engine boundary grows a paradigm axis (`relational` | `document`) so a document engine plugs in beside the SQL engines without pretending a collection is a table. Implementation plan: `docs/superpowers/plans/2026-11-17-mongodb-multi-paradigm.md`.

## Brief

Bizzi DB supports PostgreSQL, MySQL, and SQL Server. MongoDB must reach functional parity, adapted to documents:

- **Connection:** MongoDB connection strings (`mongodb://`, `mongodb+srv://`) and authentication.
- **Introspection:** databases and collections, not schemas and tables.
- **Data viewing:** JSON documents, including nested objects and arrays, in a navigable view that replaces the grid.
- **Querying:** an editor for MongoDB's query language and execution model.
- **Data editing:** modify fields, add fields, edit nested structures.
- **Indexes:** view and manage collection indexes.
- **Export:** collection data as JSON arrays, accurately.

Architectural requirements:

- The core app (UI, state) stays engine-agnostic. MongoDB logic lives inside its own boundary.
- A document is not a row. Where MongoDB differs from SQL, the product shows the difference instead of hiding it.
- PostgreSQL, MySQL, and SQL Server keep working exactly as before.
- The next paradigm (key-value, graph) is added by filling in the same boundary, not by re-architecting.

Success: users connect to MongoDB, browse collections, inspect and edit documents; the UI feels designed for documents; the abstraction handles both models; no SQL regression.

## Capability table

`EngineSpec` (`crates/core/src/engines.rs`) carries the paradigm, default port 27017 and the allowed `params`; `DocumentEngineMeta` (`packages/database/src/mongo.ts`) carries what the UI may offer. A false flag hides the control.

| Flag | MongoDB |
|---|---|
| `paradigm` | `document` (`DocumentAdapter` / `DocumentSession`; desktop `EngineKind::Document`, `LiveSession::Document`) |
| `databaseOptional` | yes: the sidebar lists every database the user may list, and a user without `listDatabases` still gets a working sidebar |
| `portHiddenBy` | `srv` (SRV records carry the port) |
| `views` | yes, read-only |
| `textIndexes`, `geoIndexes` (2dsphere), `hashedIndexes` | yes |
| `ttlIndexes`, `hiddenIndexes`, `partialIndexes` | yes |
| Connection params | `srv`, `authSource`, `authMechanism` (`""`, `SCRAM-SHA-1`, `SCRAM-SHA-256`), `replicaSet`, `directConnection`, `readPreference`, `hosts` |
| Editor | JavaScript-flavoured shell syntax, parsed in Rust, never evaluated |

## Behaviour worth knowing

- Documents cross IPC as a typed ordered tree with numbers as strings, so `Int64`, `Decimal128` and doubles survive. Edits travel as text and are parsed in Rust.
- Profiles may omit username and password for servers without authentication.
- Saving a whole-document replace is guarded by `{ _id, $expr: { $eq: ["$$ROOT", { $literal: original }] } }` with simple collation. Field order, added fields, odd keys and case-insensitive collations are all handled, and a concurrent change stops the save and offers a reload.
- A user without `listDatabases`, `collStats` or `listIndexes` still gets a working sidebar, with unknown counts.
- The query editor parses shell syntax in Rust and never evaluates JavaScript. `runCommand` and `adminCommand` pass the command unchanged.

## Parity matrix

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

## Deliberate limits

| Limit | Reason |
|---|---|
| A stored document with a single key that is an Extended-JSON wrapper (such as `{"$oid": …}` as data) displays but cannot be edited as text | Extended JSON is ambiguous there: the text would read back as the wrapped value, not the document. |
| The save guard compares by MongoDB value equality, so a concurrent change of only a numeric type with an equal value (Int64 5 to Double 5.0) is not detected | `$eq` treats equal numbers of different types as equal. |
| A very large collection export is built in memory before the save dialog writes it | The export is returned as one text and the save dialog writes it; the app grants no Tauri fs plugin to stream to a file. |
| Authentication is SCRAM only (`authMechanism` allows `""`, `SCRAM-SHA-1`, `SCRAM-SHA-256`) | The other mechanisms need Kerberos, LDAP, certificate or cloud-identity plumbing this client does not have. |
| An SSH tunnel reaches a single host: SRV and extra hosts are rejected with SSH, and tunnelled connections force `directConnection` | The driver would otherwise discover and dial members the tunnel does not forward. |
| With SSH and verified TLS, the certificate is checked against the tunnel's local address | Same as the SQL engines; use `Require` or a certificate for that name. |
| Sharded `$collStats` counts read the first shard only | The sidebar count is approximate by design; the exact count is one query away. |

## Seed and tests

`docker/mongo` seeds `shop` and `analytics` and the users `root`/`mongo`, `reader`/`reader` (read on `shop`) and `limited`/`limited` (role `limitedReader`: `find` and `listCollections` on `shop`, no `collStats` or `listIndexes`), on `127.0.0.1:27018`. `crates/mongo/tests/session.rs` is ignored unless the server is up; it runs `assert_document_session` and adds the cases only MongoDB has. CI runs it against a `mongo:8.0` service and loads the seed with `mongosh`. See `docker/README.md`.
