# Security

This document is the threat model and security posture for **DB Pro Studio**, a local-only Tauri desktop Postgres client. There is no application backend or cloud API.

## Data flow

1. The React webview collects connection fields (including the password) and invokes Tauri commands.
2. Profile metadata (host, port, database, user, SSL, pool size, environment) is stored in `workspace.sqlite` under the OS app-data directory (`com.dbpro.studio`).
3. Passwords are stored only in the OS keychain, keyed by connection id. They are never written to SQLite.
4. Live sessions keep a Postgres pool in process memory until disconnect.
5. User SQL and constructed DML run on the connected database with the privileges of that role.
6. Query history and saved SQL are persisted as plaintext in SQLite (full statement text).

## Trust boundary

The webview is privileged. Compromise of the UI (for example XSS) is equivalent to the connected database role, plus the ability to save keychain secrets on connection save. Controls: Content Security Policy, no HTML sinks, no shell/fs/http plugins, and an explicit IPC command allowlist.

## Local files

On Unix, `Storage::open` sets the app-data directory to `0700` and `workspace.sqlite` to `0600`. The database itself is not encrypted at rest (SQLCipher is a future option). Other local OS users must not be able to read the file; a process running as the same user still can.

## Transit

TLS is optional. New connections default SSL **on** for non-loopback hosts and **off** for `127.0.0.1` / `localhost` / `::1`. When SSL is enabled, the native TLS stack verifies system CAs; there is no skip-verify path. Disabling SSL for a remote (especially production) host shows a warning in the connection form.

## Accepted risks

- **Arbitrary SQL.** `query_execute` sends the statement as-is via `simple_query`, including multiple statements. That is the product.
- **Query history.** Full SQL text, including literals, is stored locally so history can be replayed. Do not put secrets in SQL if the workstation is shared.
- **Password in memory.** The pool config retains the password for the session lifetime so reconnects work. Zeroizing it while the pool is live has little value.

## Reporting

Please open a private report (or a GitHub security advisory if the repository is public) rather than a public issue for credential or data-exposure bugs.

## Distribution checklist (when shipping)

- Signed and notarized macOS builds; Authenticode on Windows
- Tauri updater with signed artifacts; public key in app config
- Release CI matrix; never expose `TAURI_SIGNING_*` to the Vite frontend (`envPrefix` is `VITE_` only)
- Raise MSRV to 1.88+ and align the Rust `tauri` crate with `@tauri-apps/api` (~2.11). The crate bump needs edition 2024 transitives and cannot land on rustc 1.80.
- Optional later: SQLCipher for `workspace.sqlite`, custom CA / mTLS, hostname verification beyond `SslMode::Require`
