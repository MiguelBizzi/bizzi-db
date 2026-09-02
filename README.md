# Bizzi DB

A desktop Postgres client. Fast, local-only, and built with Tauri.

## Download

Installers for macOS (universal), Windows, and Linux are on the latest GitHub Release:

**[Download Bizzi DB](https://github.com/MiguelBizzi/db-manager/releases/latest)**

The in-app updater uses that same release (`latest.json`). The first install is always manual; later versions can be installed from Settings.

## Releasing

Ship from `main` with a version bump and a `v*` tag. Cursor follows [`.cursor/rules/cut-release.mdc`](.cursor/rules/cut-release.mdc) when you ask to cut a release.

1. Set the same semver in `Cargo.toml` (`workspace.package.version`), `apps/desktop/src-tauri/tauri.conf.json`, `package.json`, and `apps/desktop/package.json`.
2. Commit, then tag and push:
   ```sh
   git tag -a v0.1.1 -m "v0.1.1"
   git push origin v0.1.1
   ```
3. [`.github/workflows/release.yml`](.github/workflows/release.yml) builds, signs, and uploads DMG, NSIS, AppImage, and `latest.json`.

Pushing `main` without a tag does not ship. Do not retag. Do not regenerate the updater signing key. Do not change the bundle id `com.bizzidb.app` after the first public install.

To try a build without offering it to installed apps, mark the GitHub Release as a **prerelease**. Installed copies only follow the latest non-prerelease.

Required GitHub Actions secrets are listed in [`SECURITY.md`](SECURITY.md).
