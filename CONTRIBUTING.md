# Contributing to Bizzi DB

Thanks for helping. This guide takes you from a fresh clone to a pull request. By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). How decisions are made is described in [GOVERNANCE.md](GOVERNANCE.md).

## Prerequisites

- [Bun](https://bun.sh) 1.3 or later
- [Rust](https://rustup.rs) 1.88 or later
- [Docker](https://www.docker.com), for the local test database

## Set up

```sh
bun install
bun run db:up   # local PostgreSQL on 127.0.0.1:5433 (user postgres, password postgres)
bun run dev     # launch the desktop app
```

## Run the tests

```sh
bun run test       # frontend and Rust unit tests
bun run test:all   # also runs the Postgres integration tests; needs bun run db:up
```

Run `bun run test` before you open a pull request. Run `bun run test:all` when you touch the Postgres session, preview, introspection or the docker seed.

## Project rules

These live in [`.claude/rules/`](.claude/rules/) and apply to every change:

- [Tests first](.claude/rules/tdd-testing.md): a new feature starts with a failing test, and a bug fix starts with a test that reproduces the bug. Tests sit next to the code they cover.
- [Secure coding](.claude/rules/secure-coding.md): passwords live only in the OS keychain, constructed SQL quotes identifiers and escapes literals, and the Tauri allowlist stays tight.
- [Menu items and shortcuts](.claude/rules/menu-and-shortcuts.md): every feature a user can start is reachable from the menu bar and has a keyboard shortcut.
- [Comments](.claude/rules/comments.md): comment the why, not the what.

## Commits and sign-off

Sign off every commit with `git commit -s`. This adds a `Signed-off-by` line certifying that you wrote the change, or have the right to submit it, under the project's MIT license, as described in the [Developer Certificate of Origin](https://developercertificate.org/). There is no CLA to sign. `bun install` turns on a git hook (`.githooks/prepare-commit-msg`) that adds the line for you, so a plain `git commit` is enough. A check on each pull request fails when a commit is missing its sign-off, for example when the hook is not installed. `git rebase --signoff origin/main` fixes the commits.

Pull request titles in [Conventional Commits](https://www.conventionalcommits.org/) style (`fix(grid): keep scroll position`) are appreciated but not enforced.

## Changelog

For a change users will notice, add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), in the `New`, `Better` or `Fixed` section. Write for people who use the app, not for people who read commits.

## Open a pull request

1. For a new feature, open an issue first so we can agree on the shape before you build it. Bug fixes can go straight to a pull request.
2. Branch from `main`, make your change, and keep it focused on one thing.
3. Open a pull request against `main` and fill in the template. CI runs only what your change touches (see below) and always runs the sign-off check.

### What CI runs

The `changes` job in `.github/workflows/test.yml` compares your pull request with `main`. Its summary on the run page lists each area, whether it runs, and the first file that made it run. The rules are in `.github/scripts/changed-areas.sh`.

| You changed | Runs |
| --- | --- |
| `apps/desktop`, `packages`, `crates`, `docker`, Cargo files | Desktop tests, lint, builds, Postgres integration, `cargo audit` when Cargo files changed |
| `apps/web`, `CHANGELOG.md` | Landing page lint, tests and build |
| `package.json`, `bun.lock`, `turbo.json`, `tsconfig.json` | Both of the above |
| Only docs, `*.md`, `assets`, issue templates | Nothing but the sign-off check |
| Workflows, CI scripts, or a path no rule knows | Everything |

The `ci-required` check is green when every job that ran passed; jobs that had nothing to check are skipped. `cargo audit` also runs every Monday, because new advisories appear against dependencies you have not touched.

## Questions and bugs

Use [GitHub issues](https://github.com/MiguelBizzi/bizzi-db/issues). Report security problems privately, as described in [SECURITY.md](SECURITY.md).
