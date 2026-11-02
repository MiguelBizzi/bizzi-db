# SQL Server support

SQL Server is the third engine. A connection is one database, the same way a PostgreSQL connection is one database. The sidebar lists schemas in that database. Login is a SQL user and password. The driver is `tiberius` (TDS, pure Rust, `native-tls`). The minimum server is SQL Server 2017. The seed and CI run 2022 Developer.

## Capability flags

| Flag | PostgreSQL | MySQL | SQL Server |
| --- | --- | --- | --- |
| `transactionalDdl` | yes | no | yes (`SET XACT_ABORT ON` and an explicit transaction; batches split on `GO`) |
| `materializedViews` | yes | no | no |
| `routineOverloading` | yes | no | no |
| `orReplaceRoutines` | yes | no | yes (`CREATE OR ALTER`) |
| `partialIndexes` | yes | no | yes (filtered indexes) |
| `onlineIndexBuild` | yes | yes | yes (`WITH (ONLINE = ON)`, edition-gated, outside a transaction) |
| `explainPlanTree` | yes | no | no |
| `routines` | yes | yes | yes |
| `emptyDatabaseAllowed` | no | yes | no |
| `ilike` | yes | no | no (`LOWER(CAST(col AS NVARCHAR(MAX))) LIKE`) |
| `bracketIdents` | no | no | yes |
| `batchSeparator` | no | no | yes (`GO`) |
| `identityColumns` | no | no | yes (cannot be added or removed with `ALTER COLUMN`) |

`RoutineDefinition.oid` stays the field name. SQL Server stores `object_id` there. `QueryError.code` stays empty: TDS has no SQLSTATE. The error number is `vendor_code`, the class is the severity, and the line is the position. The position has no column.

## Parity matrix

| Job | SQL Server |
| --- | --- |
| Connect, TLS, SQL login, one database | Implemented. Port 1433. URI schemes `sqlserver` and `mssql`. |
| Schemas, tables, views, indexes, routines | Implemented from `sys` catalog views. |
| Query run, paging, filters, preview | Implemented. Page clause is `OFFSET … FETCH`. A statement that already ends in `ORDER BY` gets the clause appended. Otherwise it is wrapped, and a duplicate-column wrap (error 8156) streams and slices. |
| Row insert, update, delete, pending changes | Implemented. Explicit identity values are wrapped in `SET IDENTITY_INSERT`. Pending changes run in one transaction. |
| Export | Implemented. Identifiers are `[quoted]`, strings are `N'…'`, binary is `0x…`, and `INSERT … VALUES` is split every 1000 rows. |
| Identity, computed, `rowversion` | Read-only in the grid. Computed and `rowversion` are omitted from the insert form. Identity can be left to the server or set explicitly. |
| Indexes | Clustered, nonclustered, and columnstore. Include columns, a filter, unique, fillfactor, pad index, compression, ignore dup key, and online. |
| Routines | Procedures, scalar functions, inline and multi-statement table-valued functions. `OUTPUT` parameters and `EXECUTE AS`. |
| Views | `CREATE OR ALTER VIEW`. |

## Deliberate exclusions

| Exclusion | Reason |
| --- | --- |
| Indexed views as an editable object | The seed creates one so introspection can see it. The designer does not edit it. `materializedViews` is false. |
| Windows, Kerberos, and Microsoft Entra ID authentication | SQL login only. Integrated security needs SSPI or an identity platform this client does not speak. |
| Named instances (`HOST\INSTANCE`) | Resolving them uses the SQL Browser UDP service, which cannot ride the SSH tunnel. |
| Query Store and a SHOWPLAN XML tree | `explainPlanTree` is false. A plan can still be requested as text with `SHOWPLAN_TEXT`. |
| Service Broker, CLR, full-text indexes | Not part of the table, view, and routine surface the other engines expose. |
| Partitioning, temporal tables, graph tables | No designer for those objects. PostgreSQL support does not have them either. |
| Trigger editor | Triggers are fingerprinted so a change is detected. There is no trigger form, matching PostgreSQL. |

## Seed and tests

`docker/mssql` builds `mcr.microsoft.com/mssql/server:2022-latest` (`MSSQL_PID=Developer`) and loads `init/*.sql` before the healthcheck passes. The image is x86-64 only; on arm64, compose sets `platform: linux/amd64`. See `docker/README.md`.

`crates/mssql/tests/session.rs` is ignored unless the server is up. It runs the shared conformance suite against `dbo.users` and adds `GO`, `XACT_ABORT` rollback, identity insert, paging, and introspection of the seed. `unit-windows` compiles this crate with the `native-tls` feature. On Windows that links schannel, so the OpenSSL setup in that job stays for `ssh2`.
