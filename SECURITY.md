# Security

This document is the threat model and security posture for **Bizzi DB**, a local-only Tauri desktop Postgres client. There is no application backend or cloud API.

## Data flow

1. The React webview collects connection fields (including the password) and invokes Tauri commands.
2. Profile metadata (host, port, database, user, SSL, pool size, environment) is stored in `workspace.sqlite` under the OS app-data directory (`com.bizzidb.app`).
3. Passwords are stored only in the OS keychain, keyed by connection id. They are never written to SQLite.
4. Live sessions keep a Postgres pool in process memory until disconnect.
5. User SQL and constructed DML run on the connected database with the privileges of that role.
6. Query history and saved SQL are persisted as plaintext in SQLite (full statement text).

## Trust boundary

The webview is privileged. Compromise of the UI (for example XSS) is equivalent to the connected database role, plus the ability to save keychain secrets on connection save. Controls: Content Security Policy, no HTML sinks, no shell/fs/http plugins, and an explicit IPC command allowlist.

The updater plugin is an approved exception to “no extra network plugins.” It uses its own Rust HTTPS client to fetch `latest.json` and installers from GitHub Releases. The webview CSP is unchanged (no `github.com` in `connect-src`). Artifacts are minisign-verified with the public key embedded in `tauri.conf.json` before install. `tauri-plugin-process` is allowed only for `allow-restart` after a verified install.

## Local files

On Unix, `Storage::open` sets the app-data directory to `0700` and `workspace.sqlite` to `0600`. On Windows the app-data folder relies on the user-profile ACL instead, which already limits it to the user, SYSTEM and administrators. The database itself is not encrypted at rest (SQLCipher is a future option). Other local OS users must not be able to read the file; a process running as the same user still can.

## Transit

TLS is optional. New connections default SSL **on** for non-loopback hosts and **off** for `127.0.0.1` / `localhost` / `::1`. When SSL is enabled, the native TLS stack verifies system CAs; there is no skip-verify path. Disabling SSL for a remote (especially production) host shows a warning in the connection form.

## Accepted risks

- **Arbitrary SQL.** `query_execute` sends the statement as-is via `simple_query`, including multiple statements. That is the product.
- **Query history.** Full SQL text, including literals, is stored locally so history can be replayed. Do not put secrets in SQL if the workstation is shared.
- **Password in memory.** The pool config retains the password for the session lifetime so reconnects work. Zeroizing it while the pool is live has little value.

## Distribution

Installers and `latest.json` are published to public GitHub Releases by `.github/workflows/release.yml` on `v*` tags. The app checks `https://github.com/MiguelBizzi/bizzi-db/releases/latest/download/latest.json` over HTTPS, verifies the minisign signature, then installs only after the user confirms in Settings. A failed verify or install leaves the running version in place.

Passive (startup) update checks that fail (403, 404, network, geo-blocks) stay silent. A manual check in Settings shows the error.

The updater public key is committed in `apps/desktop/src-tauri/tauri.conf.json`. The matching private key must live only in GitHub Actions (`TAURI_SIGNING_PRIVATE_KEY`, optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Vite `envPrefix` is `VITE_` only, so `TAURI_SIGNING_*` never reaches the frontend. Losing the private key bricks in-app updates for every installed build; do not regenerate it.

GitHub Actions secrets for a signed release:

- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Apple notarization: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

Windows signing (Azure Trusted Signing), optional, used by the `publish-windows` job:

- Secrets: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- Repository variables: `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, and `WINDOWS_RELEASE_ENABLED` (`true` turns the job on; anything else skips it)

With none of the `AZURE_SIGNING_*` variables set, the Windows installer is published unsigned. Updates stay protected either way: the updater only installs packages signed with the minisign key above. With the variables set, the endpoint must match `https://<region>.codesigning.azure.net`, so a wrong variable cannot send the credentials to another host; a signing failure aborts the build, and the job fails unless the published installer's Authenticode status is `Valid`. Setting only some of the variables or secrets fails the job instead of shipping unsigned. On any failure a cleanup step deletes the `*-setup.exe` assets and removes `windows-x86_64` from `latest.json`.

Linux packages, used by the `publish-linux` job (repository variable `LINUX_RELEASE_ENABLED`; `true` turns the job on):

- Secrets, optional: `LINUX_GPG_PRIVATE_KEY` (armored private key of the release GPG key) and `LINUX_GPG_PASSPHRASE`
- Release key fingerprint: `<fingerprint — added by the maintainer>`; the public key is `docs/release-signing-key.asc`

Each release carries `SHA256SUMS` for the `.deb` and the AppImage. With the GPG secrets set, `SHA256SUMS.asc` is a detached signature with the release key; without them the checksums ship unsigned and the run shows a warning. The key is imported into a throwaway keyring on the runner and never printed. To verify a download, import the public key, check that its fingerprint matches the one above, then run `gpg --verify SHA256SUMS.asc SHA256SUMS && sha256sum -c --ignore-missing SHA256SUMS` in the download folder. The `.deb` itself is not signed: `dpkg` does not verify package signatures. In-app updates on Linux use the same minisign key as macOS and Windows, so an update is never installed without a valid signature, whatever the GPG setup. Before the packages stay published, the job checks their control file and desktop entries and launches both under Xvfb; on any failure a cleanup step deletes the `.deb`, AppImage, their `.sig` files and `SHA256SUMS*`, and removes the `linux-*` keys from `latest.json`.

Bundle id `com.bizzidb.app` is locked after the first public install (app-data path, keychain service, updater identity).

### Future monetization

There is still no application backend. If licensing or subscriptions are added later, validation belongs in the Rust IPC layer (same trust model as `validate_save_input`), with Settings as the UI. That would be the first extra network trust boundary besides the updater. No license crate or vendor is wired today.

## Reporting

Please report vulnerabilities privately, never in a public issue. This applies especially to credential or data-exposure bugs.

Use [Report a vulnerability](https://github.com/MiguelBizzi/bizzi-db/security/advisories/new) on the repository's Security tab. Only the maintainer can see the report.

- **Supported versions:** only the latest release receives security fixes.
- **Response:** expect an acknowledgement within 7 days.
- **Disclosure:** please give us a reasonable chance to ship a fix before you disclose the issue publicly. Reporters are credited in the advisory unless they prefer otherwise.

## Distribution checklist (when shipping)

- Signed and notarized macOS builds
- Tauri updater with signed artifacts; public key in app config
- Release CI (macOS universal); never expose `TAURI_SIGNING_*` to the Vite frontend (`envPrefix` is `VITE_` only)
- MSRV is 1.88. Aligning the Rust `tauri` crate with `@tauri-apps/api` (~2.11) is still optional.
- Optional later: SQLCipher for `workspace.sqlite`, custom CA / mTLS, hostname verification beyond `SslMode::Require`
