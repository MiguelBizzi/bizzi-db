# Releasing Bizzi DB

Ship from `main` with a version bump and a `v*` tag. Cursor follows [`.cursor/rules/cut-release.mdc`](.cursor/rules/cut-release.mdc) when you ask to cut a release. `main` is protected, so the bump goes through a pull request.

1. Branch `release/vX.Y.Z` from `main`. Set the same semver in `Cargo.toml` (`workspace.package.version`), `apps/desktop/src-tauri/tauri.conf.json`, `package.json`, and `apps/desktop/package.json`.
2. In [`CHANGELOG.md`](CHANGELOG.md), turn `## [Unreleased] - Title` into `## [X.Y.Z] - YYYY-MM-DD - Title` (or add that section at the top if there is no Unreleased one). Write what a user would notice, not commit messages. Then run `bun run changelog:generate` and commit the regenerated `apps/web/src/lib/changelog.data.ts`. A test fails if that file is stale or if the newest entry does not match the version in `package.json`. The landing page reads the live version from GitHub, so only the notes need writing.
3. Open a pull request, wait for the checks, and merge it.
4. Tag the merged commit and push the tag:
   ```sh
   git switch main && git pull
   git tag -a v0.1.1 -m "v0.1.1"
   git push origin v0.1.1
   ```
5. [`.github/workflows/release.yml`](.github/workflows/release.yml) first takes the `CHANGELOG.md` section for the tag as the release notes. A tag with no section, or an empty one, fails here before anything is built. Tags must be plain `vX.Y.Z`. It then builds, signs, and uploads a universal macOS DMG and `latest.json`, re-styles and re-signs the DMG (`assets/brand/dmg/brand-dmg.sh`) and verifies both the file and the published asset (`verify-dmg.py`). A failing DMG check fails the run; fix it and use **Re-run failed jobs**, do not retag.

Pushing `main` without a tag does not ship. Published `v*` tags are immutable: do not retag, move or delete one. Do not regenerate the updater signing key. Do not change the bundle id `com.bizzidb.app` after the first public install.

To try a build without offering it to installed apps, mark the GitHub Release as a **prerelease**. Installed copies only follow the latest non-prerelease.

Required GitHub Actions secrets are listed in [`SECURITY.md`](SECURITY.md).
