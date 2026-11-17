# Local databases

`bun run db:up` starts Postgres, MySQL, SQL Server, and MongoDB and waits until each healthcheck passes. `bun run db:reset` drops the volumes and seeds again.

| Engine | Host | Port | User | Password | Database |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL 16 | 127.0.0.1 | 5433 (`DB_PORT`) | postgres | postgres | postgres |
| MySQL 8.4 | 127.0.0.1 | 3307 (`MYSQL_PORT`) | root | mysql | shop |
| SQL Server 2022 | 127.0.0.1 | 1434 (`MSSQL_PORT`) | sa | `Mssql_dev_1` | shop |
| MongoDB 8.0 | 127.0.0.1 | 27018 (`MONGO_PORT`) | root | mongo | (empty; auth source `admin`) |

These passwords are for the local seed only.

## SQL Server

The image is `mcr.microsoft.com/mssql/server:2022-latest` with `MSSQL_PID=Developer`, so filtered indexes, columnstore, and `ONLINE` index builds are available. Microsoft publishes that image for x86-64 only. On an arm64 Mac, compose sets `platform: linux/amd64` and Docker Desktop runs it through Rosetta or QEMU. Give Docker at least 2 GB of RAM; the first start is slower under emulation because the seed inserts 200,000 rows before the healthcheck passes.

The container starts `sqlservr`, runs `docker/mssql/init/*.sql` in order with `sqlcmd -C -I -b`, then writes `/var/opt/mssql/.seeded`. `-I` keeps `QUOTED_IDENTIFIER` on, which computed columns, filtered indexes, and indexed views require. The healthcheck waits for that file and for `sqlcmd` to accept a connection, so a restart of an already seeded volume does not load the scripts again and does not report healthy before the server is up. The scripts themselves are idempotent.

`shop` holds the schemas `dbo`, `sales`, `hr`, `ops`, and `analytics`. A second database, `analytics`, exists so a connection to `shop` does not see it: one connection is one database. `dbo.users` is the conformance table (email values contain `user`). `dbo.events` has 200,000 rows for paging. The seed also covers identity, computed columns, `rowversion`, the types the driver decodes, foreign keys, filtered and columnstore indexes, views, routines, triggers, a sequence, and a synonym.

## MongoDB

The image is `mongo:8.0`. To start only this engine, run `docker compose up -d --wait mongo`. On the first start of an empty volume, the image entrypoint runs `docker/mongo/init/*.js` in order with `mongosh`, against a temporary `mongod` bound to `127.0.0.1` inside the container. The healthcheck pings the container's own address, so it passes only after seeding has finished and the real server is listening. The scripts do not run again on a seeded volume; `docker compose rm -sfv mongo` and removing the `mongo-data` volume reseeds it. Each script drops what it creates first.

`shop.users` is the conformance collection: 24 documents with a nested `address`, a `tags` array, one document without `email`, one with `age` as a string, and `Int64`, `Decimal128`, and `Date` fields. `shop.orders` references users by `ObjectId`. `shop.events` is capped at 1 MB. `shop.odd_keys` holds one document with keys `"10"`, `"2"`, `"a.b"`, `""`, and a nested `"$x"`, in that order. `shop.active_users` is a view and `analytics.metrics` is a time-series collection. Indexes cover unique and partial, compound, TTL, text, and hidden.

The user `reader` / `reader` (auth source `admin`) has only the `read` role on `shop`: no `listDatabases` and nothing on `analytics`, like a least-privilege Atlas user. The user `limited` / `limited` (auth source `admin`) has the custom role `limitedReader`: `find` and `listCollections` on `shop` only, so `$collStats` and `listIndexes` are refused and introspection must still succeed.
