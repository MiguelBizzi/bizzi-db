#!/usr/bin/env bash
# Usage: bash .github/scripts/changed-areas.test.sh
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/changed-areas.sh"

failures=0
expect() {
  local name="$1" want="$2" got
  shift 2
  got="$(printf '%s\n' "$@" | bash "$script" 2>/dev/null | tr '\n' ' ')"
  if [ "$got" = "$want " ]; then echo "ok   $name"; else echo "FAIL $name (got '$got', want '$want ')"; failures=$((failures + 1)); fi
}

DESKTOP="desktop=true web=false deps=false"
WEB="desktop=false web=true deps=false"
NONE="desktop=false web=false deps=false"
ALL="desktop=true web=true deps=true"

expect "desktop frontend" "$DESKTOP" apps/desktop/src/App.tsx
expect "desktop Rust shell" "$DESKTOP" apps/desktop/src-tauri/src/lib.rs
expect "shared TypeScript package" "$DESKTOP" packages/shared/src/index.ts
expect "Rust crate" "$DESKTOP" crates/postgres/src/lib.rs
expect "Postgres seed" "$DESKTOP" docker/postgres/init/01.sql
expect "Cargo.lock also needs the audit" "desktop=true web=false deps=true" Cargo.lock
expect "cargo audit config" "desktop=true web=false deps=true" .cargo/audit.toml

expect "landing page" "$WEB" apps/web/src/App.tsx
expect "landing page README" "$WEB" apps/web/README.md
expect "changelog feeds the landing page" "$WEB" CHANGELOG.md

expect "root package.json" "$ALL" package.json
expect "bun.lock" "$ALL" bun.lock
expect "turbo.json reaches both apps" "desktop=true web=true deps=false" turbo.json
expect "workflow edit runs everything" "$ALL" .github/workflows/test.yml
expect "CI script edit runs everything" "$ALL" .github/scripts/changed-areas.sh
expect "git hook edit runs the lint job that tests it" "$DESKTOP" .githooks/prepare-commit-msg

expect "root README" "$NONE" README.md
expect "docs folder" "$NONE" docs/linux-verification.md
expect "brand assets" "$NONE" assets/brand/logo.svg
expect "editor rules" "$NONE" .claude/rules/comments.md
expect "issue template" "$NONE" .github/ISSUE_TEMPLATE/bug.yml
expect "ruleset docs" "$NONE" .github/rulesets/main.json
expect "docs-only change among several files" "$NONE" README.md CONTRIBUTING.md docs/a.md LICENSE

expect "desktop and landing page together" "desktop=true web=true deps=false" apps/desktop/src/App.tsx apps/web/src/App.tsx
expect "docs alongside desktop code" "$DESKTOP" README.md apps/desktop/src/App.tsx
expect "unknown path runs everything" "$ALL" apps/api/src/main.rs
expect "unknown top-level file runs everything" "$ALL" metadata.json
expect "one unknown path among docs runs everything" "$ALL" README.md apps/api/src/main.rs
expect "no changed files runs nothing" "$NONE"

all_flag="$(bash "$script" --all 2>/dev/null | tr '\n' ' ')"
if [ "$all_flag" = "$ALL " ]; then echo "ok   --all runs everything"; else echo "FAIL --all (got '$all_flag')"; failures=$((failures + 1)); fi

summary="$(printf 'apps/web/src/App.tsx\n' | bash "$script" 2>&1 >/dev/null)"
case "$summary" in
  *"apps/web/src/App.tsx"*) echo "ok   summary names the file that triggered an area" ;;
  *) echo "FAIL summary names the file that triggered an area (got '$summary')"; failures=$((failures + 1)) ;;
esac

[ "$failures" -eq 0 ]
