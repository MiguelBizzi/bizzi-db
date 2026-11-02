# Local databases

`bun run db:up` starts Postgres, MySQL, and SQL Server and waits until each healthcheck passes. `bun run db:reset` drops the volumes and seeds again.

| Engine | Host | Port | User | Password | Database |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL 16 | 127.0.0.1 | 5433 (`DB_PORT`) | postgres | postgres | postgres |
| MySQL 8.4 | 127.0.0.1 | 3307 (`MYSQL_PORT`) | root | mysql | shop |
| SQL Server 2022 | 127.0.0.1 | 1434 (`MSSQL_PORT`) | sa | `Mssql_dev_1` | shop |

These passwords are for the local seed only.

## SQL Server

The image is `mcr.microsoft.com/mssql/server:2022-latest` with `MSSQL_PID=Developer`, so filtered indexes, columnstore, and `ONLINE` index builds are available. Microsoft publishes that image for x86-64 only. On an arm64 Mac, compose sets `platform: linux/amd64` and Docker Desktop runs it through Rosetta or QEMU. Give Docker at least 2 GB of RAM; the first start is slower under emulation because the seed inserts 200,000 rows before the healthcheck passes.

The container starts `sqlservr`, runs `docker/mssql/init/*.sql` in order with `sqlcmd -b -C`, then writes `/var/opt/mssql/.seeded`. The healthcheck looks for that file, so a restart of an already seeded volume does not load the scripts again. The scripts themselves are idempotent.

`shop` holds the schemas `dbo`, `sales`, `hr`, `ops`, and `analytics`. A second database, `analytics`, exists so a connection to `shop` does not see it: one connection is one database. `dbo.users` is the conformance table (email values contain `user`). `dbo.events` has 200,000 rows for paging. The seed also covers identity, computed columns, `rowversion`, the types the driver decodes, foreign keys, filtered and columnstore indexes, views, routines, triggers, a sequence, and a synonym.
