# Open source readiness

Date: 2026-10-19 · Status: draft for review

## Goal

Make Bizzi DB look and run like a well-run small open source project, using only GitHub's free tier for public repositories. The app and the existing signed macOS release pipeline must not regress, and the current team must be able to maintain everything added here.

## Current state

The repository (`MiguelBizzi/bizzi-db`) is already public and MIT-licensed. Most of the foundation exists:

| Area | In place | Gap |
|---|---|---|
| Docs | `LICENSE`, `README.md`, `SECURITY.md` (threat model), `RELEASING.md` | No `CONTRIBUTING`, `CODE_OF_CONDUCT`, `GOVERNANCE`, `CHANGELOG.md`. `SECURITY.md` has no real reporting channel. |
| Templates | none | No issue forms, PR template, Dependabot config, labels. |
| CI (`test.yml`) | Ubuntu only: `bun audit`, `bun run test`, `cargo audit`, Postgres integration | No fmt or clippy. No Windows or macOS build check. **`main` is red**: `cargo audit` reports 3 vulnerabilities in `zip 2.4.2` (RUSTSEC-2026-0367, -0368, -0369), new since the last green run on 2026-10-15. |
| Release (`release.yml`) | Tag-triggered universal macOS DMG, Apple notarization, minisign updater signing, `latest.json` verification, DMG branding and verification | Release body is a fixed placeholder. Windows and Linux were dropped earlier. |
| Updater | Wired to `releases/latest/download/latest.json`. Public key committed, private key in Actions secrets. | Complete for macOS. |
| Changelog | Hand-written `apps/web/src/lib/changelog.ts` (landing page), with a test tying the newest entry to `package.json` | Not visible on GitHub. Not usable as release notes. |
| Protection | none (`main` unprotected, no tag rules) | Needs rulesets. |

## Decisions already made

- **Platforms:** macOS keeps shipping signed installers. Windows and Linux are CI compile checks only. No unsigned Windows or Linux installers are published, and the README keeps saying they are not available yet. Windows code signing is not free, so it stays out of scope.
- **Changelog:** `CHANGELOG.md` is the single source of truth. The landing-page data and the GitHub Release body are both derived from it.
- **Conduct contact:** `migueloliveirabizzi@gmail.com`. Security reports use GitHub private vulnerability reporting, so no email is listed there.
- **Approach:** extend the existing workflows. No release-please, no Conventional Commits automation, no CLA.

## Design

Work happens on a branch off `main` in a worktree. The uncommitted desktop UI changes in the main checkout stay out of every commit. Each phase below is its own commit or PR.

### Phase 0: green baseline

Required status checks only make sense on a passing `main`.

1. Run `cargo tree -i zip` to find which crate pulls in `zip 2.4.2`. It is most likely a Tauri or updater dependency.
2. If a patched `zip` is reachable, bump the owning crate. Dependencies are exact-pinned with `=`, so this is a manual bump, followed by `cargo test --workspace --locked`.
3. If no fix is reachable and the vulnerable `extract()` path is not used by the app, add `.cargo/audit.toml` with an ignore per advisory ID and a written reason, and tell the maintainer. An ignore is never added silently.
4. The 19 unmaintained-crate warnings stay non-fatal, which is `cargo audit`'s default.

Done when: the `audit` job passes on a PR.

### Phase 1: community files and templates

| File | Content |
|---|---|
| `CONTRIBUTING.md` | Clone to PR walkthrough: prerequisites (Bun 1.3, Rust 1.88, Docker), `bun install`, `bun run db:up`, `bun run dev`, `bun run test` and `test:all`. Summarizes the TDD, menu-and-shortcuts, comments and secure-coding rules and links to `.claude/rules/`. Asks for `git commit -s` (DCO) and recommends Conventional Commit PR titles without enforcing them. |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1, contact as above. |
| `GOVERNANCE.md` | BDFL: one maintainer decides, others advise. How decisions are made, how to propose changes, how someone becomes a maintainer, that the model is reviewed when a second maintainer joins. |
| `SECURITY.md` | Replace the "Reporting" section with the repository's private vulnerability reporting link, a supported-versions line (latest release only) and a response expectation. The threat model is unchanged. |
| `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` | Issue forms (version, OS, Postgres version, steps, logs without secrets). `config.yml` disables blank issues and links the security report page. |
| `.github/pull_request_template.md` | Checklist: what and why, tests added or updated, `bun run test` passed, commits signed off, menu and shortcut rule followed for new features, `CHANGELOG.md` updated for user-visible changes. |
| `.github/dependabot.yml` | `cargo`, `bun` and `github-actions` ecosystems, weekly, grouped to limit PR noise. |
| `README.md` | CI badge, contributing section pointing at the new files, vulnerability reporting link. Still macOS-only. |

### Phase 2: CI

`test.yml` keeps its job names, since they become required checks. Additions:

- **Lint:** `cargo fmt --check` and `cargo clippy --workspace --locked`. Clippy is run locally first. If the codebase is noisy, it starts warn-only with a follow-up issue rather than a large fix-up in this change.
- **Typecheck:** add an explicit `bun run lint` step (`turbo run lint`, which runs `tsc --noEmit`). The root `test` script does not run it.
- **Build matrix:** `macos-latest`, `windows-latest`, `ubuntu-latest`, each running `cargo check -p db-desktop --locked` and the frontend build. Ubuntu installs the WebKit, libsecret and related apt packages. This is a compile check, not `tauri build`, to keep runs short.
- **DCO:** a job that fails a PR when any commit lacks a `Signed-off-by` line matching its author.
- **Hardening:** top-level `permissions: contents: read`, `concurrency` with cancel-in-progress for PR runs, and third-party actions pinned by commit SHA (kept current by Dependabot).
- **Honest failures:** the Windows and Linux desktop crate may not compile today (`ssh2` with vendored OpenSSL, `keyring` on Linux). If a leg fails for a real code reason, it is reported to the maintainer and left out of the required checks until fixed. It is not hidden with `continue-on-error`.

### Phase 3: changelog and release notes

Format of `CHANGELOG.md` (Keep a Changelog shaped, using the landing page's existing kinds):

```
## [0.1.18] - 2026-10-18 - Title

One-paragraph summary.

### New
- ...
### Better
- ...
### Fixed
- ...
```

- An optional `<!-- from: 0.1.14, releases: 5 -->` comment on a heading preserves the landing page's multi-tag milestones, so the page renders as it does today.
- History is backfilled from `changelog.ts`.
- `apps/web/scripts/` gains a generator that produces the `changelog.ts` data from `CHANGELOG.md`. The generated file stays committed, and CI fails if it is stale (`--check`). `changelog.test.ts` keeps asserting that the newest entry matches `package.json`.
- A `scripts/release-notes` script prints the section for a given version. `release.yml` runs it before `tauri-action` and passes the output as `releaseBody`. It fails the release if the section is missing or empty.
- The macOS signing, notarization, DMG branding, updater manifest and verification steps in `release.yml` are not modified. This is checked by diffing the workflow.
- `RELEASING.md` and `.cursor/rules/cut-release.mdc` change in step 2: edit `CHANGELOG.md` instead of `changelog.ts`.

### Phase 4: GitHub settings

These change the live repository, so the exact list is shown to the maintainer and applied only after an explicit yes. They run last so the check names already exist.

1. Enable private vulnerability reporting, Dependabot alerts and Dependabot security updates.
2. Ruleset on `main`: require a pull request and the CI checks (unit, audit, integration, DCO, and the build legs that pass), block force pushes and deletion. Required approvals are 0 while there is one maintainer, because GitHub does not let an author approve their own PR. Raise to 1 when a second maintainer joins.
3. Ruleset on `v*` tags: block deletion and updates, so published releases are immutable. Creation stays allowed.
4. Labels: `good first issue`, `help wanted`, `bug`, `enhancement`, `dependencies`, `needs-triage`.
5. Candidate starter issues are proposed as a list. None are created without approval.

**Release flow impact:** the current process pushes the version-bump commit straight to `main`, which the `main` ruleset blocks. `RELEASING.md` and `cut-release.mdc` change to: open a PR for the bump and changelog, merge it, then push the annotated tag on the merged commit.

## Out of scope

Windows and Linux installers, Windows code signing, a CLA, GitHub Discussions, a documentation site, automatic version bumps, and release-please.

## Risks

- **`zip` has no reachable fix.** Mitigation: documented, reviewed `audit.toml` ignore, or a held release of the dependency bump.
- **Windows or Linux compile failures** surface real porting work. Mitigation: they are reported, kept non-required, and tracked as follow-up issues, not hidden.
- **Changelog migration** could change the landing page. Mitigation: the generator is tested against the current `CHANGELOG` data, and the generated output must equal today's `changelog.ts` content before the source switches.
- **Rulesets block the maintainer's own release flow.** Mitigation: the release docs change in the same phase, and the rulesets are applied last.
- **Exact dependency pins** make Dependabot PRs larger to review. Accepted; pins are an existing project choice.

## Verification

- A test PR from a branch shows every required check green.
- Unit tests cover the changelog parser, the generator `--check` mode and release-notes extraction (including the missing-section failure).
- `git diff` of `release.yml` confirms the signing path is unchanged.
- Rulesets and settings are read back with `gh api` after they are applied.
- No real release is cut as part of this work.
