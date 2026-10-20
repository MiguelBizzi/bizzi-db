#!/usr/bin/env bash
# Usage: bash .github/scripts/check-dco.test.sh
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/check-dco.sh"
repo="$(mktemp -d)"
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init -q -b main
git config user.name "Ada"
git config user.email "ada@example.com"
git config commit.gpgsign false

commit() {
  local file="f$RANDOM$RANDOM"
  echo x > "$file"
  git add "$file"
  git commit -q "$@"
}

failures=0
expect() {
  local name="$1" want="$2" base="$3" head="$4" got=0
  bash "$script" "$base" "$head" >/dev/null 2>&1 || got=$?
  if [ "$got" -eq "$want" ]; then echo "ok   $name"; else echo "FAIL $name (exit $got, want $want)"; failures=$((failures + 1)); fi
}

commit -m "base, unsigned and outside the range"
base="$(git rev-parse HEAD)"

git checkout -q -b signed "$base";    commit -s -m "signed"
expect "signed commit passes" 0 "$base" signed

git checkout -q -b unsigned "$base";  commit -m "unsigned"
expect "unsigned commit fails" 1 "$base" unsigned

git checkout -q -b mixed "$base";     commit -s -m "signed"; commit -m "unsigned"
expect "one unsigned commit among signed fails" 1 "$base" mixed

git checkout -q -b other "$base";     commit -m "other email" -m "Signed-off-by: Ada <other@example.com>"
expect "sign-off with another email fails" 1 "$base" other

git checkout -q -b casing "$base";    commit -m "casing" -m "Signed-off-by: Ada <ADA@Example.com>"
expect "sign-off email is compared case-insensitively" 0 "$base" casing

git checkout -q -b side "$base";      commit -s -m "side"
git checkout -q -b merged "$base";    commit -s -m "main side"
git merge -q --no-ff -m "Merge branch side" side
expect "unsigned merge commit is ignored" 0 "$base" merged

git checkout -q -b empty "$base"
expect "empty range passes" 0 "$base" empty

[ "$failures" -eq 0 ]
