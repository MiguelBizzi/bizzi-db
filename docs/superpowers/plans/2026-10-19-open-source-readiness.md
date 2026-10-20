# Open Source Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Bizzi DB the community files, CI, changelog-driven release notes and GitHub rulesets of a well-run small open source project, on GitHub's free tier only.

**Architecture:** Extend the existing `test.yml` and `release.yml` instead of rebuilding them. `CHANGELOG.md` becomes the single source of release notes: a small parser module feeds the landing-page data and the GitHub Release body. Repository settings are applied last, from checked-in ruleset JSON, after the check names exist.

**Tech Stack:** GitHub Actions, Bun 1.3.11 (`bun test`), Rust 1.88 / Cargo, Tauri 2.2, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-19-open-source-readiness-design.md`

## Global Constraints

- Free tier only: no paid GitHub features, runners, signing services or update servers.
- macOS is the only platform that ships installers. Windows and Linux are CI compile checks only. The README keeps saying they are "Not available yet".
- Do not modify these `release.yml` steps: `tauri-action` (including its `env` signing secrets, `args`, `includeUpdaterJson`), "Verify updater manifest", and every DMG step after it. The only permitted changes are passing `releaseBody`, adding the notes step before `tauri-action`, and rewriting `uses:` lines to commit SHAs (same versions).
- Never change `com.bizzidb.app`, regenerate updater keys, retag, or force-push a tag.
- Conduct contact: `migueloliveirabizzi@gmail.com`. Security reports use GitHub private vulnerability reporting (no email).
- `main` ruleset requires **0** approving reviews while there is one maintainer.
- Supported versions: latest release only.
- Dependencies are exact-pinned with `=`. A `cargo audit` ignore needs the advisory ID and a written reason, and is never added silently.
- Project rules in `.claude/rules/` apply: tests sit next to the unit (`foo.ts` → `foo.test.ts`), failing test first, comments only for non-obvious why, no secrets or passwords anywhere. `bun run test` passes before each phase is called done.
- Every commit uses `git commit -s` (DCO sign-off) and ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/open-source-readiness` in a worktree. Never include unrelated files in a commit; stage by path.

## Review Focus

Inputs and conditions the spec implies but does not list. Each has a pinned test in the owning task.

1. Version prefix collisions: asking for notes of `0.1.1` must not match the `0.1.10` or `0.1.18` section (Task 4).
2. Windows-edited `CHANGELOG.md` with CRLF line endings must parse identically to LF (Task 4).
3. Changelog text containing backticks, `|`, `<`, `-->`, a leading `- `, or non-ASCII characters must survive a render→parse round trip (Task 4).
4. DCO: merge commits and Dependabot PRs have no sign-off and must not fail the check; a `Signed-off-by` whose email differs from the commit author must fail (Task 7).
5. A pushed tag whose version has no, or an empty, `CHANGELOG.md` section must fail the release before any build starts (Tasks 4, 6).

## File Structure

| Path | Responsibility |
|---|---|
| `apps/web/scripts/changelogMarkdown.ts` (+ `.test.ts`) | Pure functions: parse `CHANGELOG.md`, render it back, render the landing-page data module, extract one version's notes |
| `apps/web/scripts/generate-changelog.ts` | CLI: `CHANGELOG.md` → `apps/web/src/lib/changelog.data.ts` |
| `apps/web/scripts/release-notes.ts` | CLI: print one version's notes, exit 1 when missing or empty |
| `apps/web/src/lib/changelog.data.ts` | Generated. `CHANGELOG` and `UPCOMING` only. Never hand-edited. |
| `apps/web/src/lib/changelog.ts` | Types, `FIRST_RELEASE_DATE`, `compareVersions`, and re-exports of the generated data |
| `CHANGELOG.md` | Source of truth for release notes |
| `.github/scripts/check-dco.sh` | DCO check for a commit range |
| `.github/rulesets/main.json`, `tags.json` | Reproducible ruleset definitions applied in Task 8 |

---

### Task 1: Branch and green audit baseline

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml` and/or `Cargo.lock` (bump), or Create: `.cargo/audit.toml` (ignore)

**Interfaces:**
- Produces: `cargo audit` exits 0 on this branch, so later CI jobs start from green.

- [ ] **Step 1: Create the worktree branch** `feat/open-source-readiness` from `docs/open-source-readiness-spec`, and add the DCO sign-off to the spec commit: `git commit --amend -s --no-edit`.
- [ ] **Step 2: Reproduce the failure.** Run `cargo audit` in the repo root. Expected: exit 1, vulnerabilities RUSTSEC-2026-0367, -0368, -0369 on `zip 2.4.2`.
- [ ] **Step 3: Find the owner.** Run `cargo tree -i zip@2.4.2 --locked`. Record which crate pulls it in.
- [ ] **Step 4: Fix.** Check `cargo audit` output for the patched `zip` version and whether the owning crate (likely `tauri` / `tauri-plugin-updater` / `tauri-utils`, all exact-pinned) has a release that allows it. If yes, bump only that pin and run `cargo update -p zip --precise <patched>` if the lockfile allows. If no reachable fix exists, grep the workspace for `.extract(` on a `ZipArchive`: when unused by app code, add `.cargo/audit.toml` with `[advisories] ignore = [...]` for each of the three IDs, one comment per ID saying why it is unreachable. Report the choice to the maintainer in the commit body.
- [ ] **Step 5: Verify.** `cargo audit` exits 0 (warnings allowed). `cargo test --workspace --exclude db-desktop --locked` passes. If a bump was made, also `cargo check -p db-desktop --locked`.
- [ ] **Step 6: Commit** `fix(deps): clear zip advisories` (or `chore(audit): ignore unreachable zip advisories`), staging only the files changed.

---

### Task 2: Contributor-facing documents

**Files:**
- Create: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`
- Modify: `SECURITY.md` ("Reporting" section only)

**Interfaces:**
- Produces: stable file names that Task 3's README and templates link to.

- [ ] **Step 1: `CONTRIBUTING.md`.** Sections in order: prerequisites (Bun 1.3, Rust 1.88, Docker), setup (`bun install`, `bun run db:up`, `bun run dev`), tests (`bun run test`; `bun run test:all` when touching Postgres session, preview, introspect or docker seed), the four project rules each in one line with a link into `.claude/rules/`, commits (use `git commit -s`; explain the DCO in two sentences using the Developer Certificate of Origin text link; PR titles in Conventional Commit style are recommended, not enforced), changelog (add an entry under `## [Unreleased]` for user-visible changes), opening a PR (branch from `main`, fill the template), where to ask (issues).
- [ ] **Step 2: `CODE_OF_CONDUCT.md`.** Contributor Covenant 2.1 full text with the enforcement contact set to `migueloliveirabizzi@gmail.com`.
- [ ] **Step 3: `GOVERNANCE.md`.** BDFL model: Miguel Bizzi is the maintainer and final decision-maker; how to propose a change (issue first for features, PR for fixes); how a maintainer is added (sustained contributions, invited by the maintainer); the model is revisited when a second maintainer joins.
- [ ] **Step 4: `SECURITY.md`.** Replace the existing "Reporting" section with: report privately via the repository's **Security → Report a vulnerability** page (link `https://github.com/MiguelBizzi/bizzi-db/security/advisories/new`), supported versions (latest release only), and an acknowledgement target of 7 days. Leave all other sections byte-identical (`git diff` must touch only that section).
- [ ] **Step 5: Verify.** Every relative link in the four files resolves (`rg -o '\]\(([^)#h][^)]*)\)'` then `ls` each target). No placeholder text remains (`rg -n 'TBD|TODO|XXX|\[INSERT'` returns nothing).
- [ ] **Step 6: Commit** `docs: add contributing guide, code of conduct and governance`.

---

### Task 3: Issue forms, PR template, Dependabot, README

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/pull_request_template.md`, `.github/dependabot.yml`
- Modify: `README.md`

- [ ] **Step 1: `bug.yml`** (labels `bug`, `needs-triage`) with required fields: Bizzi DB version, macOS version, PostgreSQL version, steps to reproduce, expected vs actual, and an optional logs field with a warning not to paste passwords or connection strings. **`feature.yml`** (labels `enhancement`, `needs-triage`): problem, proposed solution, alternatives.
- [ ] **Step 2: `config.yml`** with `blank_issues_enabled: false` and one `contact_links` entry to the private security advisory URL from Task 2.
- [ ] **Step 3: `pull_request_template.md`** with sections "What and why" and a checklist: tests added or updated; `bun run test` passes; commits are signed off (`git commit -s`); new user-facing features follow `.claude/rules/menu-and-shortcuts.md`; `CHANGELOG.md` updated under `[Unreleased]` for user-visible changes.
- [ ] **Step 4: `dependabot.yml`** version 2, weekly, with `groups` per ecosystem, for `cargo` (`/`), `bun` (`/`), `github-actions` (`/`), each labelled `dependencies`.
- [ ] **Step 5: README.** Add a CI badge for the `test` workflow after the existing badges. In "Security" replace "contact the maintainers privately" with a link to the private report page. In "Contributing" link `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `GOVERNANCE.md`. Do not claim Windows or Linux support.
- [ ] **Step 6: Verify.** Validate each YAML file parses: `bun -e "for (const f of process.argv.slice(1)) Bun.YAML.parse(await Bun.file(f).text())" <files>` exits 0.
- [ ] **Step 7: Commit** `chore: add issue forms, PR template and Dependabot config`.

---

### Task 4: Changelog parser, renderer and notes extractor (TDD)

**Files:**
- Create: `apps/web/scripts/changelogMarkdown.ts`, `apps/web/scripts/changelogMarkdown.test.ts`

**Interfaces:**
- Consumes: types `ChangelogEntry`, `UpcomingEntry`, `Change`, `ChangeKind` from `apps/web/src/lib/changelog.ts` (type-only import).
- Produces:
  - `parseChangelog(markdown: string): { upcoming: UpcomingEntry | null; entries: ChangelogEntry[] }`
  - `renderChangelogMarkdown(parsed: { upcoming: UpcomingEntry | null; entries: ChangelogEntry[] }): string`
  - `renderChangelogData(parsed): string` returns the full text of `changelog.data.ts`
  - `extractReleaseNotes(markdown: string, version: string): string` throws `Error` when the section is missing or has no changes

Format the parser accepts (and the renderer emits):

```
## [Unreleased] - Title                       (no date; becomes `upcoming`)
## [0.1.18] - 2026-10-18 - Title              (newest first)
<!-- from: 0.1.14, releases: 5 -->            (optional, directly after the heading)
One-paragraph summary.
### New | ### Better | ### Fixed               (kinds `new` | `better` | `fixed`)
- change text on one line
```

`releases` defaults to 1; `from` is omitted when absent. `extractReleaseNotes` returns the summary, a blank line, then each non-empty kind section as `### Heading` plus its bullets, with no top-level heading and no metadata comment, ending with a single newline.

- [ ] **Step 1: Write failing tests** in `changelogMarkdown.test.ts` (names exactly):
  - `parses a release with summary and the three kinds` (asserts `entries[0]` equals `{version:'0.1.18', date:'2026-10-18', releases:1, title, summary, changes:[{kind:'new',text}, …]}`)
  - `reads the milestone comment into from and releases` (`from: '0.1.14'`, `releases: 5`)
  - `treats [Unreleased] as upcoming and keeps it out of entries`
  - `round trips text with backticks, pipes, angle brackets, --> and unicode` (render→parse deep-equals input; includes a change whose text starts with `- `)
  - `parses CRLF input identically to LF`
  - `rejects change text containing a newline when rendering`
  - `extractReleaseNotes returns only the requested section` (exact string with expected output)
  - `extractReleaseNotes does not match a version prefix` (`'0.1.1'` against a file with only `0.1.10` throws)
  - `extractReleaseNotes throws when the section has no changes`
  - `renderChangelogData output starts with a generated-file banner and ends with a newline`
- [ ] **Step 2: Run** `cd apps/web && bun test scripts/changelogMarkdown.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the four functions in `changelogMarkdown.ts`. Normalize `\r\n` to `\n` first. Section headings are matched by an anchored regex `^## \[(Unreleased|\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}))? - (.+)$`; version equality in `extractReleaseNotes` is string equality on the captured group.
- [ ] **Step 4: Run** the same command. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(web): parse CHANGELOG.md into release notes and landing data`.

---

### Task 5: Backfill `CHANGELOG.md` and switch the landing page to generated data

**Files:**
- Create: `CHANGELOG.md`, `apps/web/scripts/generate-changelog.ts`, `apps/web/src/lib/changelog.data.ts` (generated)
- Modify: `apps/web/src/lib/changelog.ts`, `apps/web/src/lib/changelog.test.ts`, `docs/superpowers/specs/2026-10-19-open-source-readiness-design.md`, root `package.json`

**Interfaces:**
- Consumes: Task 4's `renderChangelogMarkdown`, `parseChangelog`, `renderChangelogData`.
- Produces: `bun run changelog:generate` (root script) rewrites `changelog.data.ts` from `CHANGELOG.md`. `changelog.ts` still exports `CHANGELOG`, `UPCOMING`, `FIRST_RELEASE_DATE`, `compareVersions`, and the types, so `Changelog.tsx` and `site.test.ts` need no change.

- [ ] **Step 1: Snapshot today's data.** `bun -e` import `CHANGELOG` and `UPCOMING` from `apps/web/src/lib/changelog.ts`, write JSON to `<scratchpad>/changelog-before.json`.
- [ ] **Step 2: Write failing test** in `changelog.test.ts`: `changelog.data.ts is current with CHANGELOG.md` asserts `renderChangelogData(parseChangelog(readFileSync('../../CHANGELOG.md','utf8')))` equals the file contents of `src/lib/changelog.data.ts`. Also keep the existing four tests unchanged.
- [ ] **Step 3: Backfill.** One-off `bun -e`: render the snapshot with `renderChangelogMarkdown`, prepend the heading `# Changelog` and a two-line preamble linking Keep a Changelog and Semantic Versioning, write `CHANGELOG.md`. Skim the file: any entry spanning several tags carries its `<!-- from, releases -->` comment.
- [ ] **Step 4: Implement `generate-changelog.ts`** (reads `../../CHANGELOG.md`, writes `../src/lib/changelog.data.ts`) and add root script `"changelog:generate": "bun apps/web/scripts/generate-changelog.ts"`. Run it.
- [ ] **Step 5: Edit `changelog.ts`.** Delete the in-file `CHANGELOG` and `UPCOMING` data, keep the rest, add `export { CHANGELOG, UPCOMING } from './changelog.data'`. `changelog.data.ts` imports types only (`import type`) so there is no runtime cycle.
- [ ] **Step 6: Prove equivalence.** Re-export JSON the same way to `changelog-after.json` and `diff` it against `changelog-before.json`. Expected: no differences.
- [ ] **Step 7: Run** `cd apps/web && bun test` and `bun run lint` (tsc). Expected: PASS.
- [ ] **Step 8: Amend the spec.** In the spec's Phase 3 and Verification sections, replace "CI fails if it is stale (`--check`)" with "a unit test fails if the generated file is stale", since `bun run test` already runs in CI.
- [ ] **Step 9: Commit** `feat(web): make CHANGELOG.md the source of release notes`.

---

### Task 6: Release notes in the release workflow and release docs

**Files:**
- Create: `apps/web/scripts/release-notes.ts`
- Modify: `.github/workflows/release.yml`, `RELEASING.md`, `.cursor/rules/cut-release.mdc`

**Interfaces:**
- Consumes: `extractReleaseNotes(markdown, version)` from Task 4.
- Produces: CLI `bun apps/web/scripts/release-notes.ts <version>` prints the notes to stdout; exits 1 with an `::error::` line on stderr when missing or empty.

- [ ] **Step 1: Implement `release-notes.ts`** reading `../../CHANGELOG.md`. Verify locally: `bun apps/web/scripts/release-notes.ts 0.1.18` prints the 0.1.18 notes; `bun apps/web/scripts/release-notes.ts 9.9.9` exits 1.
- [ ] **Step 2: Edit `release.yml`.** After `bun install --frozen-lockfile` and before `tauri-action`, add step id `notes`: strip the leading `v` from `github.ref_name`, run the script, and write the output to `$GITHUB_OUTPUT` as `body` with a unique multiline delimiter. Set `releaseBody: ${{ steps.notes.outputs.body }}`. Nothing else in the file changes.
- [ ] **Step 3: Verify the signing path is untouched.** `git diff main -- .github/workflows/release.yml` shows only the new step, the `releaseBody` line, and (after Task 7) `uses:` lines changed to SHAs.
- [ ] **Step 4: Update docs.** `RELEASING.md` step 2 becomes: move `[Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - date - Title` (a missing section fails the release). Replace the push-to-`main` flow with: bump and changelog on a branch, open a PR, merge, then tag the merged commit and push the tag. Apply the same two changes to `.cursor/rules/cut-release.mdc` (steps 4–5) and drop `changelog.ts` references.
- [ ] **Step 5: Commit** `feat(release): publish notes from CHANGELOG.md`.

---

### Task 7: CI: lint, cross-platform build, DCO

**Files:**
- Create: `.github/scripts/check-dco.sh`, `.github/scripts/check-dco.test.sh`
- Modify: `.github/workflows/test.yml`; possibly Rust sources if `cargo fmt` needs a formatting commit

**Interfaces:**
- Produces: required-check job names `unit`, `audit`, `integration` (unchanged), `lint`, `build (ubuntu-latest)`, `build (macos-latest)`, `build (windows-latest)`, `dco`. Task 8 references these exact names.
- `check-dco.sh <base-sha> <head-sha>`: exits 0 when every non-merge commit in `base..head` has a `Signed-off-by: Name <email>` whose email equals the commit author's email (case-insensitive); otherwise prints each offending short SHA and exits 1.

- [ ] **Step 1: Write failing shell test** `check-dco.test.sh` that builds a temp git repo and asserts: signed commit → exit 0; unsigned → exit 1; sign-off with a different email → exit 1; a merge commit without sign-off alongside signed commits → exit 0.
- [ ] **Step 2: Run** `bash .github/scripts/check-dco.test.sh`. Expected: FAIL (script missing).
- [ ] **Step 3: Implement `check-dco.sh`** using `git log --no-merges --format` over the range.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Measure lint noise locally.** `cargo fmt --check` and `cargo clippy --workspace --locked --all-targets`. If `fmt` differs, run `cargo fmt` and commit it alone (`style: cargo fmt`). If clippy reports warnings, the `lint` job runs clippy without `-D warnings` and a note in the PR body lists the count as follow-up. If clean, use `-D warnings`.
- [ ] **Step 6: Pin actions.** For every third-party action in `test.yml` and `release.yml` (`oven-sh/setup-bun`, `dtolnay/rust-toolchain`, `taiki-e/install-action`, `tauri-apps/tauri-action`), resolve the SHA of its current tag with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` and write `uses: owner/repo@<sha> # <tag>`. GitHub-owned `actions/*` stay on version tags.
- [ ] **Step 7: Edit `test.yml`.** Keep `unit`, `audit`, `integration`. Add: `permissions: contents: read` (already set), `concurrency` keyed on `github.workflow` + `github.ref` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. New job `lint` (ubuntu): `cargo fmt --check`, clippy per Step 5, `bun run lint`. New job `build` with matrix `os: [ubuntu-latest, macos-latest, windows-latest]`, `fail-fast: false`: checkout, bun, rust, `bun install --frozen-lockfile`, on Ubuntu `sudo apt-get install -y libwebkit2gtk-4.1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libsecret-1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`, then `bun run --cwd apps/desktop build` (frontend) and `cargo check -p db-desktop --locked`. New job `dco` (`if: github.event_name == 'pull_request' && github.actor != 'dependabot[bot]'`): checkout with `fetch-depth: 0`, run the script with the PR base and head SHAs.
- [ ] **Step 8: Push the branch and open a draft PR** to `main`. Bind it with the `ccd_pr` tools and read CI status through them.
- [ ] **Step 9: Triage the matrix.** Every `unit`, `audit`, `integration`, `lint`, `dco` and `build (macos-latest)` job must pass. For a failing Windows or Linux leg, capture the first compiler error and record it in the PR body. Do not add `continue-on-error`; that leg is simply left out of Task 8's required list.
- [ ] **Step 10: Commit** `ci: add lint, cross-platform build check and DCO`.

---

### Task 8: GitHub settings (needs explicit maintainer approval before applying)

**Files:**
- Create: `.github/rulesets/main.json`, `.github/rulesets/tags.json`, `.github/rulesets/apply.md` (the exact commands, for the next maintainer)

**Interfaces:**
- Consumes: the check names from Task 7 that passed in Step 9.

- [ ] **Step 1: Write the ruleset files.** `main.json`: target `branch`, include `~DEFAULT_BRANCH`, enforcement `active`, rules `pull_request` (`required_approving_review_count: 0`, `dismiss_stale_reviews_on_push: true`), `required_status_checks` (contexts from Task 7 that passed), `non_fast_forward`, `deletion`; one bypass actor, repository role Admin, `bypass_mode: pull_request`. `tags.json`: target `tag`, include `refs/tags/v*`, rules `deletion`, `update`, `non_fast_forward`; no bypass actors.
- [ ] **Step 2: Show the maintainer the exact change list** (private vulnerability reporting, Dependabot alerts and security updates, the two rulesets, six labels `good first issue`, `help wanted`, `bug`, `enhancement`, `dependencies`, `needs-triage`) and the Admin bypass, which the spec did not specify. Wait for an explicit yes. Do nothing else in this task until it arrives.
- [ ] **Step 3: Apply.** `gh api -X PUT repos/MiguelBizzi/bizzi-db/private-vulnerability-reporting`; `gh api -X PUT repos/MiguelBizzi/bizzi-db/vulnerability-alerts`; `gh api -X PUT repos/MiguelBizzi/bizzi-db/automated-security-fixes`; `gh api -X POST repos/MiguelBizzi/bizzi-db/rulesets --input .github/rulesets/<file>.json` for each file; `gh label create` for each label.
- [ ] **Step 4: Read back.** `gh api repos/MiguelBizzi/bizzi-db/rulesets --jq '.[] | {name,enforcement,target}'` lists both as `active`; `gh label list` shows the six labels; `gh api repos/MiguelBizzi/bizzi-db --jq '.security_and_analysis'` shows the enabled features.
- [ ] **Step 5: Propose starter issues** as a list in the final report (title and one-line scope each, for example the Windows or Linux compile failures from Task 7 Step 9). Create none without approval.
- [ ] **Step 6: Commit** `chore: record repository ruleset definitions`.

---

### Task 9: Final verification

- [ ] **Step 1:** `bun run test` and `cargo test --workspace --exclude db-desktop --locked` pass locally.
- [ ] **Step 2:** The PR's required checks are all green. The `release.yml` diff matches Task 6 Step 3.
- [ ] **Step 3:** Mark the PR ready for review and report: what changed, which required checks apply, the Windows and Linux findings, the `audit` decision from Task 1, and the one deliberate deviation from the spec (a test, not a `--check` flag, guards the generated file).
- [ ] **Step 4:** Do not cut a release and do not merge. Merging is the maintainer's call.
