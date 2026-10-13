# Releasing Bizzi DB

Ship from `main` with a version bump and a `v*` tag. Cursor follows [`.cursor/rules/cut-release.mdc`](.cursor/rules/cut-release.mdc) when you ask to cut a release.

1. Set the same semver in `Cargo.toml` (`workspace.package.version`), `apps/desktop/src-tauri/tauri.conf.json`, `package.json`, and `apps/desktop/package.json`.
2. Commit, then tag and push:
   ```sh
   git tag -a v0.1.1 -m "v0.1.1"
   git push origin v0.1.1
   ```
3. [`.github/workflows/release.yml`](.github/workflows/release.yml) builds, signs, and uploads a universal macOS DMG and `latest.json`, then re-styles and re-signs the DMG (`assets/brand/dmg/brand-dmg.sh`) and verifies both the file and the published asset (`verify-dmg.py`). A failing DMG check fails the run; fix it and use **Re-run failed jobs**, do not retag.

Pushing `main` without a tag does not ship. Do not retag. Do not regenerate the updater signing key. Do not change the bundle id `com.bizzidb.app` after the first public install.

To try a build without offering it to installed apps, mark the GitHub Release as a **prerelease**. Installed copies only follow the latest non-prerelease.

Required GitHub Actions secrets are listed in [`SECURITY.md`](SECURITY.md).
