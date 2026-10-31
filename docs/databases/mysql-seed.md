# MySQL seed

`bun run db:up` starts PostgreSQL and MySQL 8.4. The MySQL service listens on `127.0.0.1:3307` (override with `MYSQL_PORT`).

| Field | Value |
| --- | --- |
| User | `root` |
| Password | `mysql` |
| Default database | `shop` (optional; the app lists every user database) |
| SSL | off |

## Databases

The three databases match the Postgres schemas so shared tests can use the same names and row counts.

| Database | What it holds |
| --- | --- |
| `shop` | Catalog and orders. `users` has 1,200 rows (`user.N@shop.test`). Also a type-sample table, awkward identifiers (`` `order` ``, `` `key` ``, a backtick inside a name), views, routines, triggers, and the index shapes the insights UI looks for. |
| `analytics` | `sessions` (15,000), `page_views` (45,000), `events` (60,000). `events.user_id` is a foreign key into `shop.users`. |
| `ops` | Feature flags, background jobs (4,000), an audit log (12,000 plus one row per seeded order), API keys, and a maintenance window. |

`shop.type_samples` covers signed and unsigned integers, `DECIMAL`, `FLOAT`/`DOUBLE`, `BIT`, `BOOLEAN`, `YEAR`, date and time types, the `TEXT` and `BLOB` families, `BINARY`/`VARBINARY`, `JSON`, `ENUM`, `SET`, and `POINT`/`GEOMETRY`. One row stores an emoji and a long text value. Several `users` rows leave `last_login_at` null.

Views: `active_users`, `active_customers` (`WITH CHECK OPTION`), and `labeled_users` (calls `user_label`). Routines: `role_rank` (`DETERMINISTIC`), `touch_user` (`IN`/`OUT`, `SQL SECURITY INVOKER`), `copy_name` (`INOUT`). Triggers: `users_before_update` and `orders_audit`.

Indexes include a composite, a prefix, a descending key, a functional key, `FULLTEXT`, `SPATIAL`, an invisible index, a multi-valued JSON index, and a deliberate duplicate of `users_org` (`users_org_dup`) for the redundant-index insight.

## Reset

Init scripts run only on an empty data volume.

```bash
bun run db:reset
```

That recreates both services. To reset MySQL alone, remove the `mysql-data` volume and start again.

## Connect from the app

Host `127.0.0.1`, port `3307`, user `root`, password `mysql`. Leave the database blank to land with no default schema, or set `shop`. SSL off.
