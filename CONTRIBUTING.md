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

Sign off every commit with `git commit -s`. This adds a `Signed-off-by` line certifying that you wrote the change, or have the right to submit it, under the project's MIT license, as described in the [Developer Certificate of Origin](https://developercertificate.org/). There is no CLA to sign. A check on each pull request fails when a commit is missing its sign-off. If you forgot, `git rebase --signoff origin/main` fixes it.

Pull request titles in [Conventional Commits](https://www.conventionalcommits.org/) style (`fix(grid): keep scroll position`) are appreciated but not enforced.

## Changelog

For a change users will notice, add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), in the `New`, `Better` or `Fixed` section. Write for people who use the app, not for people who read commits.

## Open a pull request

1. For a new feature, open an issue first so we can agree on the shape before you build it. Bug fixes can go straight to a pull request.
2. Branch from `main`, make your change, and keep it focused on one thing.
3. Open a pull request against `main` and fill in the template. CI runs tests, lint, a build check on macOS, Windows and Linux, a dependency audit and the sign-off check.

## Questions and bugs

Use [GitHub issues](https://github.com/MiguelBizzi/bizzi-db/issues). Report security problems privately, as described in [SECURITY.md](SECURITY.md).
