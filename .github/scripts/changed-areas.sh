#!/usr/bin/env bash
# Usage: git diff --name-only <range> | changed-areas.sh
#        changed-areas.sh --all
# Reads changed paths on stdin and prints desktop=, web= and deps= (true or false) for $GITHUB_OUTPUT. A markdown
# table saying why each area runs goes to stderr for the step summary.
#
# A path no rule below recognises runs every area, so a forgotten rule costs CI minutes instead of skipping a check.
# To add a project, give it a case in classify() and an output here and in test.yml.
set -euo pipefail

desktop=false web=false deps=false
why_desktop="" why_web="" why_deps=""

mark() {
  local area="$1" path="$2"
  case "$area" in
    desktop) [ "$desktop" = true ] || why_desktop="$path"; desktop=true ;;
    web) [ "$web" = true ] || why_web="$path"; web=true ;;
    deps) [ "$deps" = true ] || why_deps="$path"; deps=true ;;
  esac
}

mark_all() {
  mark desktop "$1"
  mark web "$1"
  mark deps "$1"
}

classify() {
  local path="$1"
  case "$path" in
    # A workflow or CI script can break any area.
    .github/workflows/* | .github/scripts/*) mark_all "$path" ;;

    # package.json is also read by the landing page tests (version must match the changelog).
    package.json | bun.lock) mark_all "$path" ;;
    turbo.json | tsconfig.json) mark desktop "$path"; mark web "$path" ;;

    # The lint job tests the hooks.
    .githooks/*) mark desktop "$path" ;;

    Cargo.toml | Cargo.lock | .cargo/*) mark desktop "$path"; mark deps "$path" ;;
    apps/desktop/* | packages/* | crates/* | docker/* | docker-compose.yml | rust-toolchain.toml) mark desktop "$path" ;;

    # The landing page tests check that the generated changelog data is current with CHANGELOG.md.
    apps/web/* | CHANGELOG.md) mark web "$path" ;;

    # Nothing here is built, tested or shipped.
    *.md | docs/* | LICENSE | assets/* | .cursor/* | .claude/* | .superpowers/* | .gitignore | .gitattributes) ;;
    .github/ISSUE_TEMPLATE/* | .github/rulesets/* | .github/pull_request_template.md) ;;

    *) mark_all "$path (no rule matches this path)" ;;
  esac
}

if [ "${1:-}" = "--all" ]; then
  mark_all "the changed files could not be listed"
else
  while IFS= read -r path; do
    [ -n "$path" ] && classify "$path"
  done
fi

row() {
  local area="$1" runs="$2" why="$3"
  if [ "$runs" = true ]; then echo "| $area | runs | \`$why\` |" >&2; else echo "| $area | skipped | no changed file belongs to it |" >&2; fi
}

{
  echo "### Changed areas"
  echo
  echo "| Area | Result | Because |"
  echo "| --- | --- | --- |"
} >&2
row desktop "$desktop" "$why_desktop"
row web "$web" "$why_web"
row "dependency audit" "$deps" "$why_deps"

echo "desktop=$desktop"
echo "web=$web"
echo "deps=$deps"
